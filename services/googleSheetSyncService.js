const axios = require("axios");
const GoogleSheetLead = require("../models/GoogleSheetLead");
const Admin = require("../models/Admin");
const { getManagersForLocation } = require("../controllers/googleSheetController");
const { sendWhatsAppTemplateDoubleTick } = require("../utils/sendWhatsAppDoubleTick");

let syncInterval = null;

/**
 * Parse CSV data into array of objects (Shared Helper Logic)
 */
const parseCSV = (csvData) => {
    if (!csvData) return [];
    const lines = csvData.trim().split(/\r?\n/);
    const leads = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = line.split(/\t|,/);
        const location = values[0]?.trim() || "";
        const customerPhone = values[1]?.trim() || "";
        const customerName = values[2]?.trim() || "";

        if (location && customerPhone) {
            leads.push({
                location,
                customerPhone: normalizePhoneNumber(customerPhone),
                customerName
            });
        }
    }
    return leads;
};

const normalizePhoneNumber = (phone) => {
    if (!phone) return "";
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) cleaned = "91" + cleaned;
    return cleaned;
};

/**
 * Sync leads for a specific admin
 */
const syncAdminLeads = async (adminId, csvUrl) => {
    try {
        if (!csvUrl) return { success: false, message: "URL missing" };

        // Auto-upgrade legacy /pub URLs to /export URLs if they are Google Sheets
        if (csvUrl.includes('docs.google.com/spreadsheets') && csvUrl.includes('/pub?output=csv')) {
            const matches = csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (matches && matches[1]) {
                const newUrl = `https://docs.google.com/spreadsheets/d/${matches[1]}/export?format=csv`;
                console.log(`[Sync] Upgrading URL for Admin ${adminId}: ${csvUrl} -> ${newUrl}`);
                csvUrl = newUrl;

                // Optional: Update the admin record in the background so we don't keep upgrading
                Admin.findByIdAndUpdate(adminId, { googleSheetUrl: newUrl }).catch(err => {
                    console.error(`[Sync] Failed to persistent upgrade URL for Admin ${adminId}:`, err.message);
                });
            }
        }

        console.log(`[Sync] Admin ${adminId} | Syncing URL: ${csvUrl}`);
        const response = await axios.get(csvUrl, { timeout: 10000, headers: { 'User-Agent': 'CRM-Dashboard/1.0' } });
        const rawLeads = parseCSV(response.data);

        if (rawLeads.length === 0) return { success: true, newCount: 0, updatedCount: 0 };

        // DE-DUPLICATE LEADS FROM CSV (Prevent internal duplicates in same sync)
        const leadsMap = new Map();
        rawLeads.forEach(l => {
            const key = `${l.location}|${l.customerPhone}`;
            if (!leadsMap.has(key)) leadsMap.set(key, l);
        });
        const leads = Array.from(leadsMap.values());

        // DELTA SYNC STRATEGY (Atomic Upsert)
        const bulkOps = [];
        const leadsToNotify = [];
        let newCount = 0;
        let updatedCount = 0;

        // Fetch existing leads to check for notifications and stats
        const existingLeads = await GoogleSheetLead.find({ adminId }).select('location customerPhone customerName').lean();
        const existingMap = new Map();
        existingLeads.forEach(lead => existingMap.set(`${lead.location}|${lead.customerPhone}`, lead));

        for (const lead of leads) {
            const key = `${lead.location}|${lead.customerPhone}`;
            const existing = existingMap.get(key);

            if (!existing) {
                newCount++;
                leadsToNotify.push(lead);
                // Atomic Upsert for New Lead
                bulkOps.push({
                    updateOne: {
                        filter: { adminId, location: lead.location, customerPhone: lead.customerPhone },
                        update: {
                            $setOnInsert: { createdAt: new Date() },
                            $set: {
                                customerName: lead.customerName,
                                syncedAt: new Date(),
                                lastModified: new Date()
                            }
                        },
                        upsert: true
                    }
                });
            } else if (existing.customerName !== lead.customerName) {
                updatedCount++;
                // Update Existing Lead
                bulkOps.push({
                    updateOne: {
                        filter: { _id: existing._id },
                        update: {
                            $set: {
                                customerName: lead.customerName,
                                syncedAt: new Date(),
                                lastModified: new Date()
                            }
                        }
                    }
                });
            }
        }

        if (bulkOps.length > 0) {
            await GoogleSheetLead.bulkWrite(bulkOps, { ordered: false });
        }

        // Update Admin sync status
        await Admin.findByIdAndUpdate(adminId, {
            'syncConfig.lastSyncedAt': new Date(),
            'syncConfig.isActive': true
        });

        // WHATSAPP NOTIFICATIONS
        if (leadsToNotify.length > 0) {
            const uniqueLocations = [...new Set(leadsToNotify.map(l => l.location))];

            const managerMap = {};
            await Promise.all(uniqueLocations.map(async (loc) => {
                managerMap[loc] = await getManagersForLocation(loc, adminId);
            }));

            const notificationPromises = [];
            for (const lead of leadsToNotify) {
                const managers = managerMap[lead.location] || [];
                for (const manager of managers) {
                    if (manager.phone) {
                        notificationPromises.push(sendWhatsAppTemplateDoubleTick({
                            to: manager.phone,
                            templateName: 'new_lead',
                            placeholders: [
                                String(lead.customerName || 'Customer'),
                                String(lead.customerPhone || 'N/A'),
                                String(lead.location || 'Location')
                            ]
                        }));
                    }
                }
            }

            Promise.allSettled(notificationPromises);
        }

        return { success: true, newCount, updatedCount };
    } catch (error) {
        // Only log errors that aren't 401 (unpublished/private sheets) 
        // Manual syncs will still receive the error response in the controller
        if (!error.message || !error.message.includes('401')) {
            console.error(`[Sync Error] Admin ${adminId}:`, error.message);
        }
        return { success: false, error: error.message };
    }
};

/**
 * Main Sync Loop
 */
const performSync = async () => {
    try {
        // 1. Get all admins with a Google Sheet URL
        const admins = await Admin.find({ googleSheetUrl: { $exists: true, $ne: "" } }).select('_id googleSheetUrl name');

        if (admins.length === 0) {
            // Check global env as fallback/legacy support? 
            // Better to keep it strict. If env exists, we might want to apply it to a "Super Admin" or similar.
            // For now, let's respect the per-admin requirement.
            return;
        }

        console.log(`[GoogleSheet Auto-Sync] Syncing ${admins.length} admins at ${new Date().toLocaleString()}`);

        for (const admin of admins) {
            try {
                await syncAdminLeads(admin._id, admin.googleSheetUrl);
            } catch (error) {
                // Only log errors that aren't 401 (unpublished/private sheets)
                if (!error.message || !error.message.includes('401')) {
                    console.error(`[Sync Error] Admin ${admin._id}:`, error.message);
                }
            }
        }

    } catch (error) {
        console.error("[GoogleSheet Sync Loop] ✗ Error:", error.message);
    }
};

const startGoogleSheetSync = () => {
    if (syncInterval) return;
    performSync(); // Initial run
    syncInterval = setInterval(performSync, 60000); // Increased to 60s for multi-admin scalability
    console.log("[GoogleSheet Auto-Sync] ✓ Multi-Admin Service started (60s interval)");
};

const stopGoogleSheetSync = () => {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
};

module.exports = { startGoogleSheetSync, stopGoogleSheetSync, syncAdminLeads };

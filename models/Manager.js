const mongoose = require("mongoose");

const managerSchema = new mongoose.Schema(
    {
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true
        },
        username: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        pin: {
            type: String,
            required: true
        },
        email: {
            type: String
        },
        phone: {
            type: String
        },
        isActive: {
            type: Boolean,
            default: true
        },
        lastLogin: {
            type: Date
        },

        // === PHASE 1 ENHANCEMENT: Access Scope ===
        accessScope: {
            type: String,
            enum: ["all_branches", "specific_branches", "own_branch"],
            default: "all_branches"
        },
        assignedBranches: [{
            type: String
        }],  // Branch names they can access

        // === PHASE 1 ENHANCEMENT: Time-based Restrictions ===
        accessPeriod: {
            startDate: { type: Date },
            endDate: { type: Date }
        },

        // Manager permissions (Original - PRESERVED)
        permissions: {
            canManageStaff: {
                type: Boolean,
                default: true
            },
            canViewReports: {
                type: Boolean,
                default: true
            },
            canManageDailyBusiness: {
                type: Boolean,
                default: true
            },
            canManageTransactions: {
                type: Boolean,
                default: true
            },

            // === PHASE 1 ENHANCEMENT: Granular Permissions (PBAC) ===
            staff: {
                view: {
                    type: Boolean,
                    default: true
                },
                create: {
                    type: Boolean,
                    default: false
                },
                edit: {
                    type: Boolean,
                    default: false
                },
                delete: {
                    type: Boolean,
                    default: false
                },
                viewSalary: {
                    type: Boolean,
                    default: false
                }
            },
            customers: {
                view: {
                    type: Boolean,
                    default: true
                },
                create: {
                    type: Boolean,
                    default: true
                },
                edit: {
                    type: Boolean,
                    default: true
                },
                delete: {
                    type: Boolean,
                    default: false
                },
                exportData: {
                    type: Boolean,
                    default: false
                }
            },
            financial: {
                viewRevenue: {
                    type: Boolean,
                    default: true
                },
                viewExpenses: {
                    type: Boolean,
                    default: false
                },
                approveExpenses: {
                    type: Boolean,
                    default: false
                },
                viewProfitMargin: {
                    type: Boolean,
                    default: false
                }
            },
            appointments: {
                view: {
                    type: Boolean,
                    default: true
                },
                create: {
                    type: Boolean,
                    default: true
                },
                cancel: {
                    type: Boolean,
                    default: true
                },
                refund: {
                    type: Boolean,
                    default: false
                }
            },
            inventory: {
                view: {
                    type: Boolean,
                    default: true
                },
                adjustStock: {
                    type: Boolean,
                    default: false
                },
                viewCost: {
                    type: Boolean,
                    default: false
                }
            },
            reports: {
                dailyReports: {
                    type: Boolean,
                    default: true
                },
                monthlyReports: {
                    type: Boolean,
                    default: false
                },
                yearlyReports: {
                    type: Boolean,
                    default: false
                },
                exportReports: {
                    type: Boolean,
                    default: false
                }
            }
        },

        staff: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Staff"
        }],

        // Sidebar management settings
        sidebarSettings: {
            dashboard: { type: Boolean, default: true },
            businesses: { type: Boolean, default: true },
            managers: { type: Boolean, default: true },
            customers: { type: Boolean, default: true },
            staff: { type: Boolean, default: true },
            services: { type: Boolean, default: true },
            appointments: { type: Boolean, default: true },
            transactions: { type: Boolean, default: true },
            dailyBusiness: { type: Boolean, default: true },
            inventoryManagement: { type: Boolean, default: true },
            notifications: { type: Boolean, default: true },
            campaigns: { type: Boolean, default: false },
            inquiries: { type: Boolean, default: true },
            whatsappLeads: { type: Boolean, default: false },
            leadAnalytics: { type: Boolean, default: true },
            reports: { type: Boolean, default: true },
            settings: { type: Boolean, default: true },
        }
    },
    { timestamps: true }
);

// Index for business-specific manager lookup (Original - PRESERVED)
managerSchema.index({ business: 1, username: 1 });
managerSchema.index({ business: 1, isActive: 1 });

// === PHASE 1 ENHANCEMENT: Additional Indexes ===
managerSchema.index({ business: 1, accessScope: 1 });

module.exports = mongoose.model("Manager", managerSchema);


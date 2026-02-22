// campaignScheduler.js - Automated campaign execution scheduler
const AutomatedCampaign = require("../models/AutomatedCampaign");
const DripCampaign = require("../models/DripCampaign");
const Campaign = require("../models/Campaign");
const Customer = require("../models/Customer");

// ================== AUTOMATED CAMPAIGN SCHEDULER ==================

/**
 * Execute all active automated campaigns
 * This should be run periodically (e.g., every hour via cron)
 */
async function executeAutomatedCampaigns() {
    console.log('[Campaign Scheduler] Starting automated campaign execution...');
    
    try {
        // Get all active automated campaigns
        const automatedCampaigns = await AutomatedCampaign.find({
            isActive: true
        }).populate('business').populate('template');

        console.log(`[Campaign Scheduler] Found ${automatedCampaigns.length} active automated campaigns`);

        let totalExecuted = 0;
        let totalSent = 0;

        for (const automatedCampaign of automatedCampaigns) {
            try {
                // Check if it's time to execute based on execution time
                const now = new Date();
                const executionTime = automatedCampaign.triggerConfig?.executionTime || "10:00";
                const [hour, minute] = executionTime.split(':').map(Number);
                
                // Only execute if current time matches execution time (within 1 hour window)
                if (now.getHours() !== hour) {
                    continue;
                }

                console.log(`[Campaign Scheduler] Executing: ${automatedCampaign.name}`);

                // Build query based on trigger type
                let customerQuery = {
                    business: automatedCampaign.business._id,
                    isActive: true
                };

                const triggerType = automatedCampaign.triggerType;
                const triggerConfig = automatedCampaign.triggerConfig;

                switch (triggerType) {
                    case 'customer_birthday':
                        customerQuery.dateOfBirth = { $exists: true };
                        break;

                    case 'customer_anniversary':
                        customerQuery.anniversary = { $exists: true };
                        break;

                    case 'days_since_last_visit':
                        const lastVisitDate = new Date(now.getTime() - (triggerConfig.days * 24 * 60 * 60 * 1000));
                        customerQuery.lastVisit = {
                            $gte: new Date(lastVisitDate.getTime() - 24 * 60 * 60 * 1000),
                            $lte: new Date(lastVisitDate.getTime() + 24 * 60 * 60 * 1000)
                        };
                        break;

                    case 'days_of_inactivity':
                        const inactiveDate = new Date(now.getTime() - (triggerConfig.days * 24 * 60 * 60 * 1000));
                        customerQuery.lastVisit = { $lt: inactiveDate };
                        customerQuery.totalVisits = { $gt: 0 };
                        break;

                    case 'new_customer_signup':
                        const signupDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                        customerQuery.createdAt = { $gte: signupDate };
                        break;

                    default:
                        console.log(`[Campaign Scheduler] Unknown trigger type: ${triggerType}`);
                        continue;
                }

                // Apply additional filters
                if (triggerConfig.customerType && triggerConfig.customerType.length > 0) {
                    customerQuery.customerType = { $in: triggerConfig.customerType };
                }
                if (triggerConfig.membershipTier && triggerConfig.membershipTier.length > 0) {
                    customerQuery.membershipTier = { $in: triggerConfig.membershipTier };
                }
                if (triggerConfig.minTotalSpent) {
                    customerQuery.totalSpent = { $gte: triggerConfig.minTotalSpent };
                }

                // Get eligible customers
                let customers = await Customer.find(customerQuery);

                // Special handling for date-based triggers
                if (triggerType === 'customer_birthday') {
                    customers = customers.filter(c => {
                        if (!c.dateOfBirth) return false;
                        const dob = new Date(c.dateOfBirth);
                        return dob.getMonth() === now.getMonth() && dob.getDate() === now.getDate();
                    });
                } else if (triggerType === 'customer_anniversary') {
                    customers = customers.filter(c => {
                        if (!c.anniversary) return false;
                        const anniversary = new Date(c.anniversary);
                        return anniversary.getMonth() === now.getMonth() && anniversary.getDate() === now.getDate();
                    });
                }

                // Filter out customers who already received this campaign (frequency control)
                const eligibleCustomers = customers.filter(c => 
                    !automatedCampaign.hasReceivedCampaign(c._id)
                );

                console.log(`[Campaign Scheduler] Found ${eligibleCustomers.length} eligible customers`);

                let sent = 0;

                // Create and send campaigns for each customer
                for (const customer of eligibleCustomers) {
                    try {
                        // Get message content
                        let messageContent;
                        if (automatedCampaign.useTemplate && automatedCampaign.template) {
                            const variables = {
                                customerName: `${customer.firstName} ${customer.lastName}`,
                                businessName: automatedCampaign.business.name,
                                offerValue: automatedCampaign.offer?.offerValue || 0,
                                promoCode: automatedCampaign.offer?.promoCode || ''
                            };
                            messageContent = automatedCampaign.template.render(variables);
                        } else {
                            messageContent = {
                                subject: automatedCampaign.message?.subject || '',
                                body: automatedCampaign.message?.body || ''
                            };
                        }

                        // Check marketing consent
                        const channels = automatedCampaign.channels.filter(channel => {
                            if (channel === 'email') return customer.email && customer.marketingConsent?.email;
                            if (channel === 'sms') return customer.phone && customer.marketingConsent?.sms;
                            if (channel === 'whatsapp') return customer.phone && customer.marketingConsent?.whatsapp;
                            return false;
                        });

                        if (channels.length === 0) continue;

                        // Create campaign instance
                        const campaign = await Campaign.create({
                            business: automatedCampaign.business._id,
                            name: `${automatedCampaign.name} - ${customer.firstName}`,
                            type: 'automated',
                            channels: channels,
                            message: {
                                subject: messageContent.subject,
                                body: messageContent.body
                            },
                            targetAudience: 'specific',
                            targetCustomers: [customer._id],
                            offer: automatedCampaign.offer,
                            status: 'completed',
                            stats: {
                                totalRecipients: 1,
                                sent: 1
                            }
                        });

                        // Mark as sent in automated campaign
                        await automatedCampaign.markAsSent(customer._id, campaign._id);
                        sent++;
                        totalSent++;
                    } catch (err) {
                        console.error(`[Campaign Scheduler] Error sending to customer ${customer._id}:`, err.message);
                    }
                }

                // Log execution
                await automatedCampaign.logExecution(
                    eligibleCustomers.length,
                    sent,
                    sent > 0 ? 'success' : 'failed',
                    sent === 0 ? 'No eligible customers found' : null
                );

                totalExecuted++;

                console.log(`[Campaign Scheduler] Completed: ${automatedCampaign.name} - Sent to ${sent} customers`);
            } catch (err) {
                console.error(`[Campaign Scheduler] Error executing automated campaign ${automatedCampaign._id}:`, err.message);
            }
        }

        console.log(`[Campaign Scheduler] Automated campaign execution completed. Executed: ${totalExecuted}, Sent: ${totalSent}`);
        
        return {
            success: true,
            executed: totalExecuted,
            sent: totalSent
        };
    } catch (err) {
        console.error('[Campaign Scheduler] Fatal error:', err);
        return {
            success: false,
            error: err.message
        };
    }
}

// ================== DRIP CAMPAIGN SCHEDULER ==================

/**
 * Process pending drip campaign steps
 * This should be run frequently (e.g., every 15 minutes via cron)
 */
async function processDripCampaigns() {
    console.log('[Drip Scheduler] Processing drip campaigns...');
    
    try {
        const pendingSteps = await DripCampaign.getPendingSteps();

        console.log(`[Drip Scheduler] Found ${pendingSteps.length} pending steps`);

        let totalSent = 0;

        for (const { campaign, enrollment, step, customer } of pendingSteps) {
            try {
                // Check conditions if enabled
                if (step.conditions?.enabled) {
                    const previousStep = enrollment.stepHistory[enrollment.currentStep - 1];
                    
                    if (step.conditions.previousStepOpened && !previousStep?.opened) {
                        // Use alternative step if available
                        if (step.alternativeStep?.enabled) {
                            // Send alternative
                            console.log(`[Drip Scheduler] Sending alternative step for ${customer.firstName}`);
                        } else {
                            console.log(`[Drip Scheduler] Skipping step for ${customer.firstName} - conditions not met`);
                            await campaign.moveToNextStep(customer._id);
                            continue;
                        }
                    }
                }

                // Get message content
                let messageContent;
                if (step.useTemplate && step.template) {
                    const template = await CampaignTemplate.findById(step.template);
                    if (template) {
                        const variables = {
                            customerName: `${customer.firstName} ${customer.lastName}`,
                            businessName: campaign.business.name
                        };
                        messageContent = template.render(variables);
                    }
                } else {
                    messageContent = {
                        subject: step.message?.subject || '',
                        body: step.message?.body || ''
                    };
                }

                // Check marketing consent
                const channels = step.channels.filter(channel => {
                    if (channel === 'email') return customer.email && customer.marketingConsent?.email;
                    if (channel === 'sms') return customer.phone && customer.marketingConsent?.sms;
                    if (channel === 'whatsapp') return customer.phone && customer.marketingConsent?.whatsapp;
                    return false;
                });

                if (channels.length === 0) {
                    await campaign.moveToNextStep(customer._id);
                    continue;
                }

                // Create campaign instance for this step
                const stepCampaign = await Campaign.create({
                    business: campaign.business,
                    name: `${campaign.name} - Step ${step.stepNumber} - ${customer.firstName}`,
                    type: 'drip',
                    channels: channels,
                    message: {
                        subject: messageContent.subject,
                        body: messageContent.body
                    },
                    targetAudience: 'specific',
                    targetCustomers: [customer._id],
                    offer: step.offer,
                    status: 'completed',
                    stats: {
                        totalRecipients: 1,
                        sent: 1
                    }
                });

                // Record step action
                await campaign.recordStepAction(customer._id, step.stepNumber, 'sent', stepCampaign._id);

                // Update step stats
                step.stats.sent += 1;

                // Move to next step
                await campaign.moveToNextStep(customer._id);

                totalSent++;

                console.log(`[Drip Scheduler] Sent step ${step.stepNumber} to ${customer.firstName}`);
            } catch (err) {
                console.error(`[Drip Scheduler] Error processing step:`, err.message);
            }
        }

        console.log(`[Drip Scheduler] Drip campaign processing completed. Sent: ${totalSent}`);
        
        return {
            success: true,
            sent: totalSent
        };
    } catch (err) {
        console.error('[Drip Scheduler] Fatal error:', err);
        return {
            success: false,
            error: err.message
        };
    }
}

// ================== SCHEDULER SETUP ==================

/**
 * Start the campaign scheduler
 * This sets up periodic execution of automated and drip campaigns
 */
function startCampaignScheduler() {
    console.log('[Campaign Scheduler] Starting scheduler...');
    
    // Execute automated campaigns every hour
    setInterval(async () => {
        await executeAutomatedCampaigns();
    }, 60 * 60 * 1000); // 1 hour

    // Process drip campaigns every 15 minutes
    setInterval(async () => {
        await processDripCampaigns();
    }, 15 * 60 * 1000); // 15 minutes

    // Also run once on startup (after 30 seconds to allow DB connection)
    setTimeout(async () => {
        await executeAutomatedCampaigns();
        await processDripCampaigns();
    }, 30000);

    console.log('[Campaign Scheduler] Scheduler started successfully');
}

module.exports = {
    executeAutomatedCampaigns,
    processDripCampaigns,
    startCampaignScheduler
};


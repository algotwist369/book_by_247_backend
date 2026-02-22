// loyaltyRoutes.js - Loyalty rewards and membership routes
const express = require("express");
const router = express.Router();
const loyaltyController = require("../controllers/loyaltyController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// All routes require authentication (Admin or Manager)
router.use(authMiddleware, roleMiddleware(["admin", "manager"]));

// ================== Rewards Management ==================

// Create reward
router.post("/rewards", loyaltyController.createReward);

// Get rewards
router.get("/rewards", loyaltyController.getRewards);

// Update reward
router.put("/rewards/:id", loyaltyController.updateReward);

// Delete reward
router.delete("/rewards/:id", loyaltyController.deleteReward);

// Redeem reward
router.post("/rewards/:id/redeem", loyaltyController.redeemReward);

// ================== Membership Plans ==================

// Create membership plan
router.post("/membership-plans", loyaltyController.createMembershipPlan);

// Get membership plans
router.get("/membership-plans", loyaltyController.getMembershipPlans);

// Update membership plan
router.put("/membership-plans/:id", loyaltyController.updateMembershipPlan);

// Delete membership plan
router.delete("/membership-plans/:id", loyaltyController.deleteMembershipPlan);

// ================== Customer Loyalty ==================

// Get customer loyalty history
router.get("/customers/:customerId/history", loyaltyController.getCustomerLoyaltyHistory);

// Get available rewards for customer
router.get("/customers/:customerId/available-rewards", loyaltyController.getAvailableRewardsForCustomer);

// ================== Customer Subscriptions ==================

// Subscribe to membership plan
router.post("/subscriptions", loyaltyController.subscribeMembership);

// Get all subscriptions (filtered by business)
router.get("/subscriptions", loyaltyController.getSubscriptions);

// Get subscription statistics
router.get("/subscriptions/stats", loyaltyController.getSubscriptionStats);

// Get expiring subscriptions (for reminders)
router.get("/subscriptions/expiring", loyaltyController.getExpiringSoonSubscriptions);

// Get customer active subscription
router.get("/subscriptions/customer/:customerId", loyaltyController.getCustomerSubscription);

// Get subscription benefits
router.get("/subscriptions/:id/benefits", loyaltyController.getSubscriptionBenefits);

// Renew subscription
router.put("/subscriptions/:id/renew", loyaltyController.renewSubscription);

// Cancel subscription
router.put("/subscriptions/:id/cancel", loyaltyController.cancelSubscription);

module.exports = router;


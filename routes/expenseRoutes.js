const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// ================== Expense Routes ==================

 
router.post(
    '/',
    authMiddleware,
    roleMiddleware(['manager', 'admin']),
    expenseController.createExpense
);

 
router.get(
    '/',
    authMiddleware,
    roleMiddleware(['manager', 'admin']),
    expenseController.getExpenses
);

 
router.get(
    '/reports/by-category',
    authMiddleware,
    roleMiddleware(['manager', 'admin']),
    expenseController.getExpensesByCategory
);

 
router.get(
    '/pending-approvals',
    authMiddleware,
    roleMiddleware(['admin']),
    expenseController.getPendingApprovals
);

 
router.post(
    '/process-recurring',
    authMiddleware,
    roleMiddleware(['admin']),
    expenseController.processRecurringExpenses
);

 
router.get(
    '/:id',
    authMiddleware,
    roleMiddleware(['manager', 'admin']),
    expenseController.getExpenseById
);

 
router.put(
    '/:id',
    authMiddleware,
    roleMiddleware(['manager', 'admin']),
    expenseController.updateExpense
);

 
router.post(
    '/:id/approve',
    authMiddleware,
    roleMiddleware(['admin']),
    expenseController.approveExpense
);
 
router.post(
    '/:id/reject',
    authMiddleware,
    roleMiddleware(['admin']),
    expenseController.rejectExpense
);
 
router.post(
    '/:id/mark-paid',
    authMiddleware,
    roleMiddleware(['admin']),
    expenseController.markExpensePaid
);

 
router.delete(
    '/:id',
    authMiddleware,
    roleMiddleware(['admin']),
    expenseController.deleteExpense
);

module.exports = router;

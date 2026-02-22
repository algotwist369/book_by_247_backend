const express = require('express');
const router = express.Router();
const inventoryManagementController = require('../controllers/inventoryManagementController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.post(
    '/requests',
    authMiddleware,
    roleMiddleware(['manager', 'admin', 'staff']),
    inventoryManagementController.createRequest
);

 
router.get(
    '/requests',
    authMiddleware,
    roleMiddleware(['manager', 'admin', 'staff']),
    inventoryManagementController.getRequests
);
 
router.get(
    '/requests/:id',
    authMiddleware,
    roleMiddleware(['manager', 'admin', 'staff']),
    inventoryManagementController.getRequestById
);

router.put(
    '/requests/:id',
    authMiddleware,
    roleMiddleware(['manager', 'admin']),
    inventoryManagementController.updateRequestStatus
);
 
router.delete(
    '/requests/:id',
    authMiddleware,
    roleMiddleware(['manager', 'admin']),
    inventoryManagementController.deleteRequest
);

module.exports = router;

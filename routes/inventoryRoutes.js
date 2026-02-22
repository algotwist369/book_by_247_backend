const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// ================== Product Routes ==================

 
router.post(
    '/products',
    authMiddleware,
    roleMiddleware(['manager', 'admin']),
    inventoryController.createProduct
);
 
router.get(
    '/products',
    authMiddleware,
    roleMiddleware(['manager', 'admin', 'staff']),
    inventoryController.getProducts
);
 
router.get(
    '/low-stock',
    authMiddleware,
    roleMiddleware(['manager', 'admin']),
    inventoryController.getLowStockProducts
);

 
router.get(
    '/expiring-soon',
    authMiddleware,
    roleMiddleware(['manager', 'admin']),
    inventoryController.getExpiringSoon
);

 
router.get(
    '/valuation',
    authMiddleware,
    roleMiddleware(['admin']),
    inventoryController.getStockValuation
);

 
router.get(
    '/products/:id',
    authMiddleware,
    roleMiddleware(['manager', 'admin', 'staff']),
    inventoryController.getProductById
);

 
router.put(
    '/products/:id',
    authMiddleware,
    roleMiddleware(['manager', 'admin']),
    inventoryController.updateProduct
);

 
router.post(
    '/products/:id/adjust-stock',
    authMiddleware,
    roleMiddleware(['manager', 'admin']),
    inventoryController.adjustStock
);
 
router.delete(
    '/products/:id',
    authMiddleware,
    roleMiddleware(['admin']),
    inventoryController.deleteProduct
);

module.exports = router;

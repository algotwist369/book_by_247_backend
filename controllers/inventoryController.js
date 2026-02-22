const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const { setCache, getCache, deleteCache } = require("../utils/cache");

/**
 * @route   POST /api/inventory/products
 * @desc    Create new product
 * @access  Manager, Admin
 */
const createProduct = async (req, res, next) => {
    try {
        const {
            businessId,
            name,
            description,
            category,
            subcategory,
            sku,
            barcode,
            currentStock,
            unit,
            reorderLevel,
            reorderQuantity,
            maxStockLevel,
            costPrice,
            sellingPrice,
            supplier,
            alternativeSuppliers,
            expiryDate,
            images,
            thumbnail,
            tags,
            notes
        } = req.body;

        const userId = req.user.id;
        const userRole = req.user.role;

        // Verify access
        let hasAccess = false;
        if (userRole === 'admin') {
            const business = await Business.findOne({ _id: businessId, admin: userId });
            hasAccess = !!business;
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            hasAccess = manager && manager.business.toString() === businessId;
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        // Create product
        const product = await Product.create({
            business: businessId,
            name,
            description,
            category,
            subcategory,
            sku,
            barcode,
            currentStock: currentStock || 0,
            unit,
            reorderLevel,
            reorderQuantity,
            maxStockLevel,
            costPrice,
            sellingPrice,
            supplier,
            alternativeSuppliers,
            expiryDate,
            images,
            thumbnail,
            tags,
            notes,
            createdBy: userId,
            createdByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        });

        // If initial stock > 0, create purchase transaction
        if (currentStock && currentStock > 0) {
            await InventoryTransaction.create({
                business: businessId,
                product: product._id,
                type: 'purchase',
                quantity: currentStock,
                costPerUnit: costPrice,
                stockBefore: 0,
                stockAfter: currentStock,
                notes: 'Initial stock',
                performedBy: userId,
                performedByModel: userRole === 'admin' ? 'Admin' : 'Manager'
            });
        }

        // Invalidate cache
        await deleteCache(`business:${businessId}:products:*`);

        return res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: product
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /api/inventory/products
 * @desc    Get all products
 * @access  Manager, Admin, Staff
 */
const getProducts = async (req, res, next) => {
    try {
        const {
            businessId,
            category,
            isLowStock,
            isActive,
            search,
            page = 1,
            limit = 50
        } = req.query;

        const userId = req.user.id;
        const userRole = req.user.role;

        // Build query
        let query = {};

        if (userRole === 'admin') {
            if (businessId) {
                query.business = businessId;
            } else {
                const businesses = await Business.find({ admin: userId }).select('_id');
                query.business = { $in: businesses.map(b => b._id) };
            }
        } else if (userRole === 'manager' || userRole === 'staff') {
            let manager;
            if (userRole === 'manager') {
                manager = await Manager.findById(userId);
            } else {
                const Staff = require('../models/Staff');
                const staff = await Staff.findById(userId).populate('manager');
                manager = staff?.manager;
            }

            if (!manager) {
                return res.status(404).json({ success: false, message: "Manager not found" });
            }
            query.business = manager.business;
        }

        if (category) {
            query.category = category;
        }

        if (isLowStock !== undefined) {
            query.isLowStock = isLowStock === 'true';
        }

        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        if (search) {
            query.$text = { $search: search };
        }

        // Check cache
        const cacheKey = `products:${JSON.stringify(query)}:${page}:${limit}`;
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: 'cache', ...cachedData });
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const products = await Product.find(query)
            .sort({ isLowStock: -1, name: 1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        const total = await Product.countDocuments(query);

        const response = {
            success: true,
            data: products.map(p => ({
                ...p,
                stockStatus: p.currentStock === 0 ? 'out_of_stock' :
                    p.currentStock <= (p.reorderLevel || 10) ? 'low_stock' :
                        p.maxStockLevel && p.currentStock >= p.maxStockLevel ? 'overstock' :
                            'in_stock'
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: limitNum,
                pages: Math.ceil(total / limitNum)
            }
        };

        // Cache for 2 minutes
        await setCache(cacheKey, response, 120);

        return res.json(response);
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /api/inventory/products/:id
 * @desc    Get product by ID
 * @access  Manager, Admin, Staff
 */
const getProductById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Get recent transactions
        const recentTransactions = await InventoryTransaction.find({
            product: id
        })
            .populate('performedBy', 'name username')
            .sort({ createdAt: -1 })
            .limit(10);

        return res.json({
            success: true,
            data: {
                ...product.toObject(),
                recentTransactions
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   PUT /api/inventory/products/:id
 * @desc    Update product
 * @access  Manager, Admin
 */
const updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Update allowed fields (exclude currentStock - use adjust stock endpoint)
        const allowedUpdates = [
            'name', 'description', 'category', 'subcategory', 'sku', 'barcode',
            'unit', 'reorderLevel', 'reorderQuantity', 'maxStockLevel',
            'costPrice', 'sellingPrice', 'supplier', 'alternativeSuppliers',
            'expiryDate', 'images', 'thumbnail', 'tags', 'notes', 'isActive'
        ];

        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                product[field] = updates[field];
            }
        });

        await product.save();

        // Invalidate cache
        await deleteCache(`business:${product.business}:products:*`);

        return res.json({
            success: true,
            message: "Product updated successfully",
            data: product
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   POST /api/inventory/products/:id/adjust-stock
 * @desc    Adjust product stock
 * @access  Manager, Admin
 */
const adjustStock = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { quantity, type, reason, notes, costPerUnit } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        if (!quantity || !type) {
            return res.status(400).json({
                success: false,
                message: "quantity and type are required"
            });
        }

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        const stockBefore = product.currentStock;
        let stockAfter;

        // Handle different transaction types
        switch (type) {
            case 'purchase':
            case 'return':
                await product.addStock(quantity, costPerUnit);
                stockAfter = product.currentStock;
                break;

            case 'usage':
            case 'sale':
            case 'wastage':
                await product.reduceStock(quantity);
                stockAfter = product.currentStock;
                break;

            case 'adjustment':
                const result = await product.adjustStock(quantity, reason);
                stockAfter = result.newStock;
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: "Invalid transaction type"
                });
        }

        // Create transaction record
        const transaction = await InventoryTransaction.create({
            business: product.business,
            product: id,
            type,
            quantity: type === 'adjustment' ? quantity : Math.abs(quantity),
            costPerUnit,
            stockBefore,
            stockAfter,
            notes: notes || reason,
            wastageReason: type === 'wastage' ? reason : undefined,
            returnReason: type === 'return' ? reason : undefined,
            performedBy: userId,
            performedByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        });

        // Invalidate cache
        await deleteCache(`business:${product.business}:products:*`);

        return res.json({
            success: true,
            message: `Stock ${type} recorded successfully`,
            data: {
                product,
                transaction
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   DELETE /api/inventory/products/:id
 * @desc    Delete product (soft delete)
 * @access  Admin only
 */
const deleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Soft delete
        product.isActive = false;
        await product.save();

        // Invalidate cache
        await deleteCache(`business:${product.business}:products:*`);

        return res.json({
            success: true,
            message: "Product deactivated successfully"
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /api/inventory/low-stock
 * @desc    Get low stock products
 * @access  Manager, Admin
 */
const getLowStockProducts = async (req, res, next) => {
    try {
        const { businessId } = req.query;
        const userId = req.user.id;
        const userRole = req.user.role;

        if (!businessId) {
            return res.status(400).json({
                success: false,
                message: "businessId is required"
            });
        }

        // Verify access
        let hasAccess = false;
        if (userRole === 'admin') {
            const business = await Business.findOne({ _id: businessId, admin: userId });
            hasAccess = !!business;
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            hasAccess = manager && manager.business.toString() === businessId;
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        const products = await Product.getLowStockProducts(businessId);

        return res.json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /api/inventory/expiring-soon
 * @desc    Get products expiring soon
 * @access  Manager, Admin
 */
const getExpiringSoon = async (req, res, next) => {
    try {
        const { businessId, days = 30 } = req.query;
        const userId = req.user.id;
        const userRole = req.user.role;

        if (!businessId) {
            return res.status(400).json({
                success: false,
                message: "businessId is required"
            });
        }

        // Verify access
        let hasAccess = false;
        if (userRole === 'admin') {
            const business = await Business.findOne({ _id: businessId, admin: userId });
            hasAccess = !!business;
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            hasAccess = manager && manager.business.toString() === businessId;
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        const products = await Product.getExpiringSoon(businessId, parseInt(days));

        return res.json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /api/inventory/valuation
 * @desc    Get stock valuation by category
 * @access  Admin only
 */
const getStockValuation = async (req, res, next) => {
    try {
        const { businessId } = req.query;
        const userId = req.user.id;

        if (!businessId) {
            return res.status(400).json({
                success: false,
                message: "businessId is required"
            });
        }

        // Verify admin access
        const business = await Business.findOne({ _id: businessId, admin: userId });
        if (!business) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        const valuation = await Product.getStockValuation(businessId);

        const totalValue = valuation.reduce((sum, cat) => sum + cat.totalValue, 0);

        return res.json({
            success: true,
            data: {
                byCategory: valuation,
                totalValue,
                currency: 'INR'
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createProduct,
    getProducts,
    getProductById,
    updateProduct,
    adjustStock,
    deleteProduct,
    getLowStockProducts,
    getExpiringSoon,
    getStockValuation
};

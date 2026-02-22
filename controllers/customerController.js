// customerController.js - Customer management operations
const Customer = require("../models/Customer");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const Appointment = require("../models/Appointment");
const Transaction = require("../models/Transaction");
const { setCache, getCache, deleteCache } = require("../utils/cache");

// ================== Create Customer ==================
const createCustomer = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const {
            businessId,
            firstName,
            lastName,
            email,
            phone,
            alternatePhone,
            dateOfBirth,
            gender,
            anniversary,
            address,
            profilePicture,
            preferredLanguage,
            source,
            referredBy,
            preferences,
            tags,
            category,
            notes,
            internalNotes,
            marketingConsent,
            socialMedia,
            emergencyContact,
            customFields
        } = req.body;

        // Determine business ID based on user role
        let business;
        if (userRole === 'admin') {
            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: "Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        // Check if customer exists by phone
        let customer = await Customer.findOne({ business: business._id, phone });

        if (customer) {
            // Update existing customer
            // Check for email conflict if email is being updated
            if (email && email !== customer.email) {
                const emailExists = await Customer.findOne({
                    business: business._id,
                    email,
                    _id: { $ne: customer._id }
                });
                if (emailExists) {
                    return res.status(400).json({
                        success: false,
                        message: "Email already in use by another customer"
                    });
                }
            }

            // Update fields
            customer.firstName = firstName;
            customer.lastName = lastName;
            customer.email = email;
            customer.alternatePhone = alternatePhone;
            customer.dateOfBirth = dateOfBirth;
            customer.gender = gender;
            customer.anniversary = anniversary;
            customer.address = address;
            customer.profilePicture = profilePicture;
            customer.preferredLanguage = preferredLanguage;
            customer.source = source;
            customer.referredBy = referredBy;
            customer.preferences = preferences;
            customer.tags = tags;
            customer.category = category;
            customer.notes = notes;
            customer.internalNotes = internalNotes;
            customer.marketingConsent = marketingConsent;
            customer.socialMedia = socialMedia;
            customer.emergencyContact = emergencyContact;
            customer.customFields = customFields;

            customer.updatedBy = userId;
            customer.updatedByModel = userRole === 'admin' ? 'Admin' : 'Manager';

            await customer.save();

            // Invalidate cache
            await deleteCache(`business:${business._id}:customers`);

            return res.status(200).json({
                success: true,
                message: "Customer updated successfully",
                data: {
                    id: customer._id,
                    fullName: customer.fullName,
                    phone: customer.phone,
                    email: customer.email,
                    customerType: customer.customerType
                }
            });
        }

        // Check for email duplicate (for new customer)
        if (email) {
            const emailExists = await Customer.findOne({ business: business._id, email });
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    message: "Email already in use by another customer"
                });
            }
        }

        // Create customer
        customer = await Customer.create({
            business: business._id,
            firstName,
            lastName,
            email,
            phone,
            alternatePhone,
            dateOfBirth,
            gender,
            anniversary,
            address,
            profilePicture,
            preferredLanguage,
            source,
            referredBy,
            preferences,
            tags,
            category,
            notes,
            internalNotes,
            marketingConsent,
            socialMedia,
            emergencyContact,
            customFields,
            createdBy: userId,
            createdByModel: userRole === 'admin' ? 'Admin' : 'Manager',
            firstVisit: new Date()
        });

        // Invalidate cache
        await deleteCache(`business:${business._id}:customers`);

        return res.status(201).json({
            success: true,
            message: "Customer created successfully",
            data: {
                id: customer._id,
                fullName: customer.fullName,
                phone: customer.phone,
                email: customer.email,
                customerType: customer.customerType
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Customers ==================
const getCustomers = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const {
            businessId,
            page = 1,
            limit = 20,
            search,
            customerType,
            tags,
            sortBy = 'lastVisit',
            sortOrder = 'desc',
            includeWalkIns = 'true' // Include walk-ins by default
        } = req.query;

        // Determine business ID
        let businessIds = [];
        let business;

        if (userRole === 'admin') {
            if (businessId) {
                business = await Business.findOne({ _id: businessId, admin: userId });
                if (business) businessIds = [business._id];
            } else {
                const businesses = await Business.find({ admin: userId }).select('_id name');
                businessIds = businesses.map(b => b._id);
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager) {
                business = await Business.findById(manager.business);
                if (business) businessIds = [business._id];
            }
        }

        if (businessIds.length === 0) {
            if (userRole === 'admin' && !businessId) {
                return res.json({
                    success: true,
                    data: [],
                    pagination: {
                        total: 0,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        pages: 0
                    }
                });
            }
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        const cacheKeyPrefix = businessId ? `business:${businessId}` : `admin:${userId}`;
        const cacheKey = `${cacheKeyPrefix}:customers:${page}:${limit}:${search}:${customerType}:${tags}:${sortBy}:${sortOrder}`;

        // Build query for registered customers
        let query = { isActive: true };
        if (businessIds.length === 1) {
            query.business = businessIds[0];
        } else {
            query.business = { $in: businessIds };
        }

        // Filter by customer type (skip for walk-in filter)
        if (customerType && customerType !== 'walkin') {
            query.customerType = customerType;
        }

        // Filter by tags
        if (tags) {
            query.tags = { $in: tags.split(',') };
        }

        // Search
        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Get registered customers
        let registeredCustomers = [];
        let registeredTotal = 0;

        if (customerType !== 'walkin') {
            registeredCustomers = await Customer.find(query)
                .populate('business', 'name type branch')
                .populate('preferences.preferredStaff', 'name role')
                .populate('referredBy', 'firstName lastName phone')
                .select('-internalNotes')
                .lean();

            registeredTotal = registeredCustomers.length;
        }

        // Calculate real-time stats for registered customers
        const customerIds = registeredCustomers.map(c => c._id);
        const appointmentStats = await Appointment.aggregate([
            {
                $match: {
                    customer: { $in: customerIds },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: "$customer",
                    totalVisits: { $sum: 1 },
                    totalSpent: { $sum: "$totalAmount" },
                    lastVisit: { $max: "$appointmentDate" }
                }
            }
        ]);

        const statsMap = {};
        appointmentStats.forEach(stat => {
            statsMap[stat._id.toString()] = stat;
        });

        // Format registered customers
        let formattedCustomers = registeredCustomers.map(customer => {
            const stats = statsMap[customer._id.toString()] || {};
            const totalVisits = stats.totalVisits || customer.totalVisits || 0;
            const totalSpent = stats.totalSpent || customer.totalSpent || 0;
            const averageSpent = totalVisits > 0 ? Math.round(totalSpent / totalVisits) : 0;

            return {
                id: customer._id,
                fullName: `${customer.firstName} ${customer.lastName || ''}`.trim(),
                email: customer.email,
                phone: customer.phone,
                business: customer.business,
                customerType: customer.customerType,
                source: 'registered',
                totalVisits: totalVisits,
                totalSpent: totalSpent,
                averageSpent: averageSpent,
                lastVisit: stats.lastVisit || customer.lastVisit,
                loyaltyPoints: customer.loyaltyPoints,
                membershipTier: customer.membershipTier,
                tags: customer.tags,
                isActive: customer.isActive,
                createdAt: customer.createdAt
            };
        });

        // Get walk-in customers from transactions (without linked customer profiles)
        let walkInCustomers = [];
        if (includeWalkIns === 'true' && (!customerType || customerType === 'walkin')) {
            // Build search query for walk-ins
            let walkInMatch = {
                business: businessIds.length === 1 ? businessIds[0] : { $in: businessIds },
                customer: null // Only transactions without linked customer profile
            };

            if (search) {
                walkInMatch.$or = [
                    { customerName: { $regex: search, $options: 'i' } },
                    { customerPhone: { $regex: search, $options: 'i' } },
                    { customerEmail: { $regex: search, $options: 'i' } }
                ];
            }

            // Aggregate unique walk-in customers from transactions
            const walkInAggregation = await Transaction.aggregate([
                { $match: walkInMatch },
                {
                    $group: {
                        _id: "$customerPhone",
                        customerName: { $first: "$customerName" },
                        customerEmail: { $first: "$customerEmail" },
                        customerPhone: { $first: "$customerPhone" },
                        business: { $first: "$business" },
                        totalVisits: { $sum: 1 },
                        totalSpent: { $sum: "$finalPrice" },
                        lastVisit: { $max: "$transactionDate" },
                        firstVisit: { $min: "$transactionDate" }
                    }
                },
                { $sort: { lastVisit: -1 } }
            ]);

            // Get business info for walk-ins
            const businessMap = {};
            if (walkInAggregation.length > 0) {
                const businessIdsForLookup = [...new Set(walkInAggregation.map(w => w.business?.toString()).filter(Boolean))];
                const businessesData = await Business.find({ _id: { $in: businessIdsForLookup } }).select('name type branch').lean();
                businessesData.forEach(b => businessMap[b._id.toString()] = b);
            }

            // Format walk-in customers
            walkInCustomers = walkInAggregation.map((walkin, index) => ({
                id: `walkin_${walkin._id || index}`,
                fullName: walkin.customerName || 'Unknown',
                email: walkin.customerEmail || null,
                phone: walkin.customerPhone || walkin._id,
                business: businessMap[walkin.business?.toString()] || null,
                customerType: 'walkin',
                source: 'transaction',
                totalVisits: walkin.totalVisits,
                totalSpent: walkin.totalSpent,
                averageSpent: walkin.totalVisits > 0 ? Math.round(walkin.totalSpent / walkin.totalVisits) : 0,
                lastVisit: walkin.lastVisit,
                loyaltyPoints: 0,
                membershipTier: 'none',
                tags: [],
                isActive: true,
                createdAt: walkin.firstVisit
            }));
        }

        // Merge and deduplicate by phone
        const phoneSet = new Set(formattedCustomers.map(c => c.phone));
        const uniqueWalkIns = walkInCustomers.filter(w => !phoneSet.has(w.phone));

        // Combine all customers
        let allCustomers = [...formattedCustomers, ...uniqueWalkIns];

        // Sort combined results
        if (sortBy === 'lastVisit') {
            allCustomers.sort((a, b) => {
                const dateA = new Date(a.lastVisit || 0);
                const dateB = new Date(b.lastVisit || 0);
                return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
            });
        } else if (sortBy === 'totalSpent') {
            allCustomers.sort((a, b) => sortOrder === 'desc' ? b.totalSpent - a.totalSpent : a.totalSpent - b.totalSpent);
        } else if (sortBy === 'createdAt') {
            allCustomers.sort((a, b) => {
                const dateA = new Date(a.createdAt || 0);
                const dateB = new Date(b.createdAt || 0);
                return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
            });
        }

        // Apply pagination
        const total = allCustomers.length;
        const startIndex = (parseInt(page) - 1) * parseInt(limit);
        const paginatedCustomers = allCustomers.slice(startIndex, startIndex + parseInt(limit));

        const response = {
            success: true,
            data: paginatedCustomers,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        };

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Customer by ID ==================
const getCustomerById = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;

        // Check for Virtual Walk-in ID
        if (id.startsWith('walkin_')) {
            const phone = id.split('_')[1];

            // Get Business ID context
            let businessId;
            if (userRole === 'manager') {
                const manager = await Manager.findById(userId);
                businessId = manager.business;
            } else if (userRole === 'admin') {
                // For admin, we might need business context from query if available, 

            }

            const txnQuery = { customerPhone: phone };
            if (businessId) txnQuery.business = businessId;

            const transactions = await Transaction.find(txnQuery).sort({ transactionDate: -1 });

            if (!transactions.length) {
                return res.status(404).json({ success: false, message: "Walk-in customer not found" });
            }

            const firstTxn = transactions[0];
            const totalSpent = transactions.reduce((sum, t) => sum + (t.finalPrice || 0), 0);

            // Construct Virtual Customer
            const virtualCustomer = {
                _id: id,
                firstName: firstTxn.customerName || 'Walk-in',
                lastName: 'Customer',
                phone: phone,
                email: firstTxn.customerEmail,
                customerType: 'walkin',
                business: firstTxn.business, // Primary business from latest txn
                totalSpent: totalSpent,
                totalVisits: transactions.length,
                lastVisit: firstTxn.transactionDate,
                createdAt: transactions[transactions.length - 1].transactionDate, // First visit
                preferences: { preferredStaff: [], preferredServices: [] },
                tags: ['walk-in'],
                isVirtual: true
            };

            return res.json({ success: true, data: virtualCustomer });
        }

        const customer = await Customer.findById(id)
            .populate('business', 'name type branch')
            .populate('preferences.preferredStaff', 'name role phone')
            .populate('preferences.preferredServices', 'name price duration')
            .populate('referredBy', 'firstName lastName phone email')
            .populate('createdBy', 'name email role')
            .populate('updatedBy', 'name email role')
            .lean();

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        // Verify access
        if (userRole === 'admin') {
            const business = await Business.findOne({
                _id: customer.business._id,
                admin: userId
            });
            if (!business) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager.business.toString() !== customer.business._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        // Calculate real-time stats
        const stats = await Appointment.aggregate([
            {
                $match: {
                    customer: customer._id,
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: "$customer",
                    totalVisits: { $sum: 1 },
                    totalSpent: { $sum: "$totalAmount" },
                    lastVisit: { $max: "$appointmentDate" }
                }
            }
        ]);

        if (stats.length > 0) {
            const stat = stats[0];
            customer.totalVisits = stat.totalVisits;
            customer.totalSpent = stat.totalSpent;
            customer.lastVisit = stat.lastVisit;
            customer.averageSpent = stat.totalVisits > 0 ? Math.round(stat.totalSpent / stat.totalVisits) : 0;
        }

        return res.json({
            success: true,
            data: customer
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Customer ==================
const updateCustomer = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const updates = req.body;

        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        // Verify access
        if (userRole === 'admin') {
            const business = await Business.findOne({
                _id: customer.business,
                admin: userId
            });
            if (!business) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager.business.toString() !== customer.business.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        // Update customer
        Object.assign(customer, updates);
        customer.updatedBy = userId;
        customer.updatedByModel = userRole === 'admin' ? 'Admin' : 'Manager';

        await customer.save();

        // Invalidate cache
        await deleteCache(`business:${customer.business}:customers`);

        return res.json({
            success: true,
            message: "Customer updated successfully",
            data: customer
        });
    } catch (err) {
        next(err);
    }
};

// ================== Delete Customer (Soft Delete) ==================
const deleteCustomer = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;

        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        // Verify access
        if (userRole === 'admin') {
            const business = await Business.findOne({
                _id: customer.business,
                admin: userId
            });
            if (!business) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager.business.toString() !== customer.business.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        // Soft delete
        customer.isActive = false;
        customer.updatedBy = userId;
        customer.updatedByModel = userRole === 'admin' ? 'Admin' : 'Manager';
        await customer.save();

        // Invalidate cache
        await deleteCache(`business:${customer.business}:customers`);

        return res.json({
            success: true,
            message: "Customer deleted successfully"
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Customer Statistics ==================
const getCustomerStats = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId } = req.query;

        // Determine business ID
        let businessIds = [];
        let business;

        if (userRole === 'admin') {
            if (businessId) {
                business = await Business.findOne({ _id: businessId, admin: userId });
                if (business) businessIds = [business._id];
            } else {
                const businesses = await Business.find({ admin: userId }).select('_id');
                businessIds = businesses.map(b => b._id);
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager) {
                business = await Business.findById(manager.business);
                if (business) businessIds = [business._id];
            }
        }

        if (businessIds.length === 0) {
            if (userRole === 'admin' && !businessId) {
                return res.json({
                    success: true,
                    data: {
                        totalCustomers: 0,
                        newCustomers: 0,
                        regularCustomers: 0,
                        vipCustomers: 0,
                        inactiveCustomers: 0,
                        totalSpent: 0,
                        totalVisits: 0,
                        averageSpent: 0,
                        totalLoyaltyPoints: 0
                    }
                });
            }
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        const cacheKeyPrefix = businessId ? `business:${businessId}` : `admin:${userId}`;
        // const cacheKey = `${cacheKeyPrefix}:customer:stats`;

        // Create query
        let query = { isActive: true };
        if (businessIds.length === 1) {
            query.business = businessIds[0];
        } else {
            query.business = { $in: businessIds };
        }

        // Aggregate statistics
        const stats = await Customer.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalCustomers: { $sum: 1 },
                    newCustomers: {
                        $sum: { $cond: [{ $eq: ['$customerType', 'new'] }, 1, 0] }
                    },
                    regularCustomers: {
                        $sum: { $cond: [{ $eq: ['$customerType', 'regular'] }, 1, 0] }
                    },
                    vipCustomers: {
                        $sum: { $cond: [{ $eq: ['$customerType', 'vip'] }, 1, 0] }
                    },
                    inactiveCustomers: {
                        $sum: { $cond: [{ $eq: ['$customerType', 'inactive'] }, 1, 0] }
                    },
                    totalSpent: { $sum: '$totalSpent' },
                    totalVisits: { $sum: '$totalVisits' },
                    averageSpent: { $avg: '$averageSpent' },
                    totalLoyaltyPoints: { $sum: '$loyaltyPoints' }
                }
            }
        ]);

        const result = stats[0] || {
            totalCustomers: 0,
            newCustomers: 0,
            regularCustomers: 0,
            vipCustomers: 0,
            inactiveCustomers: 0,
            totalSpent: 0,
            totalVisits: 0,
            averageSpent: 0,
            totalLoyaltyPoints: 0
        };

        return res.json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

// ================== Add Loyalty Points ==================
const addLoyaltyPoints = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { points } = req.body;

        if (!points || points <= 0) {
            return res.status(400).json({
                success: false,
                message: "Valid points amount is required"
            });
        }

        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        await customer.addLoyaltyPoints(points);

        return res.json({
            success: true,
            message: `${points} loyalty points added successfully`,
            data: {
                currentPoints: customer.loyaltyPoints,
                membershipTier: customer.membershipTier
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Redeem Loyalty Points ==================
const redeemLoyaltyPoints = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { points } = req.body;

        if (!points || points <= 0) {
            return res.status(400).json({
                success: false,
                message: "Valid points amount is required"
            });
        }

        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        const redeemed = await customer.redeemPoints(points);

        if (!redeemed) {
            return res.status(400).json({
                success: false,
                message: "Insufficient loyalty points"
            });
        }

        return res.json({
            success: true,
            message: `${points} loyalty points redeemed successfully`,
            data: {
                remainingPoints: customer.loyaltyPoints,
                membershipTier: customer.membershipTier
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Lookup Customer ==================
const lookupCustomer = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { phone, businessId } = req.query;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required"
            });
        }

        // Determine business ID
        let businessIds = [];
        let business;

        if (userRole === 'admin') {
            if (businessId) {
                business = await Business.findOne({ _id: businessId, admin: userId });
                if (business) businessIds = [business._id];
            } else {
                const businesses = await Business.find({ admin: userId }).select('_id');
                businessIds = businesses.map(b => b._id);
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager) {
                business = await Business.findById(manager.business);
                if (business) businessIds = [business._id];
            }
        }

        if (businessIds.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        // Build query
        let query = { phone: phone, isActive: true };
        if (businessIds.length === 1) {
            query.business = businessIds[0];
        } else {
            query.business = { $in: businessIds };
        }

        const customer = await Customer.findOne(query)
            .populate('business', 'name type branch')
            .populate('preferences.preferredStaff', 'name role')
            .lean();

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }


        return res.json({
            success: true,
            data: customer
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Customer Timeline ==================
const getCustomerTimeline = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;

        // Check for Virtual Walk-in ID (Timeline)
        if (id.startsWith('walkin_')) {
            const phone = id.split('_')[1];

            // Get Business context (optional for strictness, but phone should be enough for timeline)
            let businessId;
            if (userRole === 'manager') {
                const manager = await Manager.findById(userId);
                businessId = manager.business;
            }

            const txnQuery = { customerPhone: phone };
            if (businessId) txnQuery.business = businessId;

            const transactions = await Transaction.find(txnQuery)
                .populate('staff', 'name')
                .sort({ transactionDate: -1 })
                .limit(50)
                .lean();

            const timeline = transactions.map(t => ({
                type: 'transaction',
                title: 'Walk-in Visit',
                description: `${t.serviceName || 'Service'} ${t.staff?.name ? `with ${t.staff.name}` : ''}`,
                date: t.transactionDate,
                status: t.paymentStatus || 'completed',
                amount: t.finalPrice || 0
            }));

            return res.json({
                success: true,
                data: {
                    timeline,
                    total: timeline.length
                }
            });
        }

        const customer = await Customer.findById(id).lean();

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        // Verify access
        if (userRole === 'admin') {
            const business = await Business.findOne({
                _id: customer.business,
                admin: userId
            });
            if (!business) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager.business.toString() !== customer.business.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        // Get appointments for timeline
        const appointments = await Appointment.find({
            customer: customer._id
        })
            .populate('staff', 'name')
            .populate('service', 'name')
            .sort({ appointmentDate: -1 })
            .limit(50)
            .lean();

        // Build timeline from appointments
        const timeline = appointments.map(apt => {
            const serviceName = apt.service?.name || 'Service';
            return {
                type: 'appointment',
                title: apt.status === 'completed' ? 'Completed Visit' : `${apt.status?.charAt(0).toUpperCase() + apt.status?.slice(1)} Appointment`,
                description: `${serviceName}${apt.staff?.name ? ` with ${apt.staff.name}` : ''}${apt.totalAmount ? ` - ₹${apt.totalAmount}` : ''}`,
                date: apt.appointmentDate,
                status: apt.status,
                amount: apt.totalAmount || 0
            };
        });

        return res.json({
            success: true,
            data: {
                timeline,
                total: timeline.length
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Add Customer Note ==================
const addCustomerNote = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const { note, type = 'general' } = req.body;

        if (!note || !note.trim()) {
            return res.status(400).json({
                success: false,
                message: "Note content is required"
            });
        }

        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        // Verify access
        if (userRole === 'admin') {
            const business = await Business.findOne({
                _id: customer.business,
                admin: userId
            });
            if (!business) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager.business.toString() !== customer.business.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        // Add note with timestamp
        const timestamp = new Date().toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const formattedNote = `[${timestamp}] ${note.trim()}`;

        // Initialize notes if not exists/empty
        if (!customer.notes) {
            customer.notes = '';
        }

        // Append to existing notes
        if (customer.notes) {
            customer.notes = `${customer.notes}\n${formattedNote}`;
        } else {
            customer.notes = formattedNote;
        }

        customer.updatedBy = userId;
        customer.updatedByModel = userRole === 'admin' ? 'Admin' : 'Manager';

        await customer.save();

        return res.json({
            success: true,
            message: "Note added successfully",
            data: {
                notes: customer.notes
            }
        });
    } catch (err) {
        next(err);
    }
};


// ================== Get Customer Analytics ==================
const getCustomerAnalyticsOverview = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { startDate, endDate, groupBy = 'daily' } = req.query;

        // Determine businessId
        let businessId;
        if (userRole === 'admin') {
            const business = await Business.findOne({ admin: userId });
            if (business) businessId = business._id;
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager) businessId = manager.business;
        }

        if (!businessId) {
            return res.status(403).json({ success: false, message: "Business context required" });
        }

        // Date Range
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();
        end.setHours(23, 59, 59, 999);

        // 1. Overview Counts
        const totalCustomers = await Customer.countDocuments({ business: businessId, isActive: true });
        const newCustomers = await Customer.countDocuments({
            business: businessId,
            createdAt: { $gte: start, $lte: end }
        });

        // 2. Segments (New 0-1, Returning 2-4, Loyal 5+)
        // We use Appointment aggregation for accurate visit counts
        const visitCounts = await Appointment.aggregate([
            { $match: { business: businessId, status: 'completed' } },
            { $group: { _id: "$customer", count: { $sum: 1 } } }
        ]);

        const segments = {
            new: 0,
            returning: 0,
            loyal: 0
        };

        // Also count customers with 0 visits as 'new'
        const customersWithVisits = visitCounts.length;
        segments.new += (totalCustomers - customersWithVisits); // Assumes non-visiting are new/prospects

        visitCounts.forEach(c => {
            if (c.count <= 1) segments.new++;
            else if (c.count <= 4) segments.returning++;
            else segments.loyal++;
        });

        // 3. Value Metrics (All Time for Business)
        const valueStats = await Appointment.aggregate([
            {
                $match: {
                    business: businessId,
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalAmount" },
                    avgRating: { $avg: "$rating" },
                    count: { $sum: 1 }
                }
            }
        ]);

        const stats = valueStats[0] || { totalRevenue: 0, avgRating: 0, count: 0 };

        const value = {
            avgFirstVisit: 0, // Placeholder
            avgTotalSpent: totalCustomers > 0 ? (stats.totalRevenue / totalCustomers) : 0,
            totalRevenue: stats.totalRevenue,
            avgRating: stats.avgRating || 0,
            avgLoyaltyPoints: 0
        };

        // Avg Loyalty Points
        const loyaltyStats = await Customer.aggregate([
            { $match: { business: businessId, isActive: true } },
            { $group: { _id: null, avgPoints: { $avg: "$loyaltyPoints" } } }
        ]);
        value.avgLoyaltyPoints = loyaltyStats[0]?.avgPoints || 0;

        // 4. Growth Trends
        let dateFormat = "%Y-%m-%d";
        if (groupBy === 'monthly') dateFormat = "%Y-%m";
        if (groupBy === 'weekly') dateFormat = "%Y-%U";
        if (groupBy === 'yearly') dateFormat = "%Y";

        const growthData = await Customer.aggregate([
            {
                $match: {
                    business: businessId,
                    createdAt: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: dateFormat, date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Calculate running total for growth chart if needed, 
        // but frontend table shows "Total" per period. 
        // Let's compute cumulative total.
        let runningTotal = await Customer.countDocuments({
            business: businessId,
            createdAt: { $lt: start }
        });

        const growth = growthData.map(item => {
            runningTotal += item.count;
            return {
                period: item._id,
                count: item.count,
                total: runningTotal
            };
        });

        return res.json({
            success: true,
            data: {
                overview: {
                    totalCustomers,
                    newCustomers
                },
                segments,
                value,
                growth
            }
        });

    } catch (err) {
        next(err);
    }
};

// ================== Get Customer Insights ==================
const getCustomerInsights = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        // Determine businessId
        let businessId;
        if (userRole === 'admin') {
            const business = await Business.findOne({ admin: userId });
            if (business) businessId = business._id;
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager) businessId = manager.business;
        }

        if (!businessId) {
            return res.status(403).json({ success: false, message: "Business context required" });
        }

        // Run aggregations in parallel for performance
        const [
            customerStats,
            retentionStats,
            growthStats
        ] = await Promise.all([
            // 1. General Stats (Segments, Value)
            Customer.aggregate([
                { $match: { business: businessId, isActive: true } },
                {
                    $group: {
                        _id: null,
                        totalCustomers: { $sum: 1 },
                        new: { $sum: { $cond: [{ $eq: ["$customerType", "new"] }, 1, 0] } },
                        regular: { $sum: { $cond: [{ $eq: ["$customerType", "regular"] }, 1, 0] } },
                        vip: { $sum: { $cond: [{ $eq: ["$customerType", "vip"] }, 1, 0] } },
                        inactive: { $sum: { $cond: [{ $eq: ["$customerType", "inactive"] }, 1, 0] } },
                        totalRevenue: { $sum: "$totalSpent" },
                        avgSpent: { $avg: "$averageSpent" }
                    }
                }
            ]),

            // 2. Retention (Last Visit buckets)
            Customer.aggregate([
                { $match: { business: businessId, isActive: true } },
                {
                    $group: {
                        _id: null,
                        last30Days: {
                            $sum: {
                                $cond: [
                                    { $gte: ["$lastVisit", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
                                    1, 0
                                ]
                            }
                        },
                        last60Days: {
                            $sum: {
                                $cond: [
                                    { $gte: ["$lastVisit", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)] },
                                    1, 0
                                ]
                            }
                        },
                        last90Days: {
                            $sum: {
                                $cond: [
                                    { $gte: ["$lastVisit", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)] },
                                    1, 0
                                ]
                            }
                        }
                    }
                }
            ]),

            // 3. Growth (Monthly for last 6 months)
            Customer.aggregate([
                {
                    $match: {
                        business: businessId,
                        createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
                    }
                },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ])
        ]);

        const stats = customerStats[0] || {
            totalCustomers: 0, new: 0, regular: 0, vip: 0, inactive: 0, totalRevenue: 0, avgSpent: 0
        };
        const retention = retentionStats[0] || { last30Days: 0, last60Days: 0, last90Days: 0 };

        // Construct response object
        const analytics = {
            segments: {
                new: stats.new,
                returning: stats.regular, // Mapping regular -> returning
                loyal: stats.vip,         // Mapping vip -> loyal
                inactive: stats.inactive
            },
            value: {
                averageValue: stats.avgSpent || 0,
                totalRevenue: stats.totalRevenue || 0
            },
            retention: {
                last30Days: retention.last30Days,
                last60Days: retention.last60Days,
                last90Days: retention.last90Days
            },
            growth: growthStats.map(g => ({
                period: g._id,
                count: g.count
            }))
        };

        // Generate Insights & Recommendations
        const insights = [];
        const recommendations = [];

        // 1. Inactivity Insight
        const inactivePercentage = stats.totalCustomers > 0 ? (stats.inactive / stats.totalCustomers) * 100 : 0;
        if (inactivePercentage > 20) {
            insights.push(`High inactivity rate detected: ${inactivePercentage.toFixed(1)}% of customers are inactive.`);
            recommendations.push("Launch a 'Win-Back' campaign to re-engage inactive customers.");
        }

        // 2. Loyalty Insight
        const loyalPercentage = stats.totalCustomers > 0 ? (stats.vip / stats.totalCustomers) * 100 : 0;
        if (loyalPercentage < 10) {
            insights.push(`Loyal customer base is small (${loyalPercentage.toFixed(1)}%). Focus on retention.`);
            recommendations.push("Create a loyalty program or VIP tiers to incentivize repeat visits.");
        } else if (loyalPercentage > 30) {
            insights.push(`Strong loyal customer base (${loyalPercentage.toFixed(1)}%).`);
            recommendations.push("Reward your VIPs with exclusive offers to maintain their loyalty.");
        }

        // 3. New Customer Growth
        // Check last month growth
        const currentMonth = new Date().toISOString().slice(0, 7);
        const lastMonthGrowth = growthStats.find(g => g._id === currentMonth)?.count || 0;
        if (lastMonthGrowth === 0 && stats.totalCustomers > 0) {
            insights.push("No new customers acquired this month.");
            recommendations.push("Increase marketing efforts or run a referral campaign.");
        } else if (lastMonthGrowth > stats.totalCustomers * 0.1) {
            insights.push("Significant growth in new customers this month!");
            recommendations.push("Ensure onboarding process is smooth for new customers.");
        }

        // 4. Retention Insight
        if (retention.last30Days < stats.totalCustomers * 0.3 && stats.totalCustomers > 0) {
            insights.push("Low 30-day retention rate.");
            recommendations.push("Send follow-up messages 2 weeks after service.");
        }

        // Default if empty
        if (insights.length === 0) {
            insights.push("Customer base is stable.");
            recommendations.push("Continue monitoring customer satisfaction.");
        }

        return res.json({
            success: true,
            data: {
                insights,
                recommendations,
                analytics
            }
        });

    } catch (err) {
        next(err);
    }
};

// ================== Update Customer Tier ==================
const updateCustomerTier = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const { tier } = req.body;

        const validTiers = ['none', 'bronze', 'silver', 'gold', 'platinum'];
        if (!validTiers.includes(tier)) {
            return res.status(400).json({
                success: false,
                message: `Invalid tier. Must be one of: ${validTiers.join(', ')}`
            });
        }

        // Check for Walk-in ID
        if (id.startsWith('walkin_in')) {
            return res.status(400).json({
                success: false,
                message: "Cannot update tier for walk-in customer. Please register the customer first."
            });
        }

        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }

        // Verify access - Manager can only update their own business customers
        if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || manager.business.toString() !== customer.business.toString()) {
                return res.status(403).json({ success: false, message: "Access denied" });
            }
        } else if (userRole === 'admin') {
            // Admin Check (Optional strictness: ensure admin owns the business)
            const business = await Business.findOne({ _id: customer.business, admin: userId });
            if (!business) {
                return res.status(403).json({ success: false, message: "Access denied" });
            }
        }

        customer.membershipTier = tier;
        await customer.save();

        return res.json({
            success: true,
            message: `Customer tier updated to ${tier}`,
            data: {
                id: customer._id,
                name: `${customer.firstName} ${customer.lastName}`,
                membershipTier: customer.membershipTier
            }
        });

    } catch (err) {
        next(err);
    }
};

module.exports = {
    createCustomer,
    getCustomers,
    getCustomerById,
    updateCustomer,
    deleteCustomer,
    getCustomerStats,
    addLoyaltyPoints,
    redeemLoyaltyPoints,
    lookupCustomer,
    getCustomerTimeline,
    addCustomerNote,
    getCustomerAnalyticsOverview,
    getCustomerInsights,
    updateCustomerTier // Export new function
};

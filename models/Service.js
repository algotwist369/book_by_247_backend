// Service.js - Service/Product catalog model
const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
    {
        // Business Reference
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true
        },
        
        // Basic Information
        name: { 
            type: String, 
            required: true, 
            trim: true,
            index: true 
        },
        description: { type: String },
        shortDescription: { type: String, maxlength: 200 },
        
        // Category & Classification
        category: { 
            type: String, 
            required: true,
            index: true 
        },
        subCategory: { type: String },
        tags: [{ type: String }],
        
        // Pricing
        price: { 
            type: Number, 
            required: false, // Optional - use pricingOptions as primary
            min: 0 
        },
        originalPrice: { type: Number, min: 0 }, // For showing discounts
        currency: { type: String, default: "INR" },
        
        // Pricing Options - Primary pricing mechanism (duration-price pairs)
        pricingType: {
            type: String,
            enum: ["fixed", "variable", "package", "membership"],
            default: "variable"
        },
        pricingOptions: [{
            name: { type: String, trim: true }, // Optional label (e.g., "Standard", "Premium")
            price: { 
                type: Number, 
                required: true,
                min: 0 
            },
            duration: { 
                type: Number, // in minutes
                required: true,
                min: 1
            },
            originalPrice: { type: Number, min: 0 }, // For showing discounts on specific option
            isActive: { type: Boolean, default: true }
        }],
        
        // Service Type
        serviceType: {
            type: String,
            enum: ["service", "product", "package", "membership"],
            default: "service"
        },
        
        // Duration (for services) - Optional, kept for backward compatibility
        duration: { 
            type: Number, // in minutes
            required: false,
            default: 30 
        },
        bufferTime: { type: Number, default: 0 }, // Minutes buffer after service
        
        // Availability
        isActive: { type: Boolean, default: true, index: true },
        isAvailableOnline: { type: Boolean, default: true },
        availableDays: [{
            type: String,
            enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        }],
        availableTimeSlots: [{
            start: { type: String },
            end: { type: String }
        }],
        
        // Staff Requirements
        requiresStaff: { type: Boolean, default: true },
        minStaffRequired: { type: Number, default: 1 },
        assignedStaff: [{ 
            type: mongoose.Schema.Types.ObjectId, 
            ref: "Staff" 
        }],
        
        // Commission
        staffCommission: {
            type: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
            value: { type: Number, default: 0 }
        },
        
        // Images & Media
        images: [{ type: String }],
        thumbnail: { type: String },
        videoUrl: { type: String },
        
        // Inventory (for products)
        inventory: {
            trackInventory: { type: Boolean, default: false },
            currentStock: { type: Number, default: 0 },
            lowStockThreshold: { type: Number, default: 5 },
            maxStock: { type: Number },
            unit: { type: String } // e.g., "pieces", "kg", "liters"
        },
        
        // Package Details (if serviceType is package)
        packageDetails: {
            includedServices: [{
                service: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
                quantity: { type: Number, default: 1 }
            }],
            validity: { type: Number }, // Days
            totalSessions: { type: Number }
        },
        
        // Membership Details (if serviceType is membership)
        membershipDetails: {
            validityDays: { type: Number },
            benefits: [{ type: String }],
            includedServices: [{
                service: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
                sessionsPerMonth: { type: Number }
            }],
            discountPercentage: { type: Number, default: 0 }
        },
        
        // Requirements & Restrictions
        ageRestriction: {
            minAge: { type: Number },
            maxAge: { type: Number }
        },
        genderRestriction: {
            type: String,
            enum: ["any", "male", "female"]
        },
        prerequisites: [{ type: String }], // e.g., "Must have membership"
        
        // Booking Settings
        allowOnlineBooking: { type: Boolean, default: true },
        advanceBookingDays: { type: Number, default: 30 },
        minBookingNotice: { type: Number, default: 0 }, // Hours
        maxBookingsPerDay: { type: Number },
        
        // Cancellation Policy
        cancellationPolicy: {
            allowed: { type: Boolean, default: true },
            hoursBeforeService: { type: Number, default: 24 },
            cancellationFee: { type: Number, default: 0 }
        },
        
        // Special Features
        features: [{ type: String }],
        benefits: [{ type: String }],
        instructions: { type: String }, // Pre/Post service instructions
        
        // SEO & Marketing
        seo: {
            metaTitle: { type: String },
            metaDescription: { type: String },
            keywords: [{ type: String }]
        },
        
        // Promotion
        isPromoted: { type: Boolean, default: false },
        promotionText: { type: String },
        
        // Ratings & Reviews
        ratings: {
            average: { type: Number, default: 0, min: 0, max: 5 },
            count: { type: Number, default: 0 }
        },
        
        // Statistics
        stats: {
            totalBookings: { type: Number, default: 0 },
            totalRevenue: { type: Number, default: 0 },
            popularity: { type: Number, default: 0 } // Can be calculated
        },
        
        // Display Order
        displayOrder: { type: Number, default: 0 },
        isFeatured: { type: Boolean, default: false },
        
        // Custom Fields
        customFields: {
            type: Map,
            of: mongoose.Schema.Types.Mixed
        },
        
        // Metadata
        createdBy: { 
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'createdByModel'
        },
        createdByModel: {
            type: String,
            enum: ['Admin', 'Manager']
        },
        updatedBy: { 
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'updatedByModel'
        },
        updatedByModel: {
            type: String,
            enum: ['Admin', 'Manager']
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes for better performance
serviceSchema.index({ business: 1, isActive: 1 });
serviceSchema.index({ business: 1, category: 1 });
serviceSchema.index({ business: 1, serviceType: 1 });
serviceSchema.index({ business: 1, price: 1 });
serviceSchema.index({ business: 1, 'ratings.average': -1 });
serviceSchema.index({ business: 1, displayOrder: 1 });
serviceSchema.index({ tags: 1 });
serviceSchema.index({ 'pricingOptions.price': 1 });
serviceSchema.index({ 'pricingOptions.duration': 1 });

// Pre-save validation: Ensure at least one pricing option for variable pricing
serviceSchema.pre('save', function(next) {
    // If pricingType is variable and pricingOptions is empty, require at least one option
    if (this.pricingType === 'variable' && (!this.pricingOptions || this.pricingOptions.length === 0)) {
        // If no pricingOptions, require at least price and duration
        if (!this.price || !this.duration) {
            return next(new Error('Variable pricing requires at least one pricing option with price and duration'));
        }
    }
    next();
});

// Virtual for discount percentage
serviceSchema.virtual('discountPercentage').get(function() {
    if (this.originalPrice && this.originalPrice > this.price) {
        return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
    }
    return 0;
});

// Virtual for formatted price
serviceSchema.virtual('formattedPrice').get(function() {
    if (this.pricingOptions && this.pricingOptions.length > 0) {
        const activeOptions = this.pricingOptions.filter(opt => opt.isActive !== false);
        if (activeOptions.length > 0) {
            const prices = activeOptions.map(opt => `${this.currency} ${opt.price.toFixed(2)}`);
            return prices.join(', ');
        }
    }
    if (this.price) {
        return `${this.currency} ${this.price.toFixed(2)}`;
    }
    return 'Price not set';
});

// Virtual for service name with duration-price pairs (e.g., "ServiceName > 30min - ₹500, 60min - ₹900")
serviceSchema.virtual('nameWithPricing').get(function() {
    if (this.pricingOptions && this.pricingOptions.length > 0) {
        const activeOptions = this.pricingOptions.filter(opt => opt.isActive !== false);
        if (activeOptions.length > 0) {
            const pricingPairs = activeOptions.map(opt => {
                const duration = opt.duration >= 60 
                    ? `${(opt.duration / 60).toFixed(1)}hr` 
                    : `${opt.duration}min`;
                return `${duration} - ${this.currency} ${opt.price.toFixed(2)}`;
            });
            return `${this.name} > ${pricingPairs.join(', ')}`;
        }
    }
    // Fallback to single price/duration if pricingOptions not set
    if (this.price && this.duration) {
        const duration = this.duration >= 60 
            ? `${(this.duration / 60).toFixed(1)}hr` 
            : `${this.duration}min`;
        return `${this.name} > ${duration} - ${this.currency} ${this.price.toFixed(2)}`;
    }
    return this.name;
});

// Virtual for minimum price from pricing options
serviceSchema.virtual('minPrice').get(function() {
    if (this.pricingOptions && this.pricingOptions.length > 0) {
        const activeOptions = this.pricingOptions.filter(opt => opt.isActive !== false);
        if (activeOptions.length > 0) {
            return Math.min(...activeOptions.map(opt => opt.price));
        }
    }
    return this.price || 0;
});

// Virtual for maximum price from pricing options
serviceSchema.virtual('maxPrice').get(function() {
    if (this.pricingOptions && this.pricingOptions.length > 0) {
        const activeOptions = this.pricingOptions.filter(opt => opt.isActive !== false);
        if (activeOptions.length > 0) {
            return Math.max(...activeOptions.map(opt => opt.price));
        }
    }
    return this.price || 0;
});

// Virtual for low stock status
serviceSchema.virtual('isLowStock').get(function() {
    if (this.inventory.trackInventory) {
        return this.inventory.currentStock <= this.inventory.lowStockThreshold;
    }
    return false;
});

// Method to update service stats
serviceSchema.methods.updateStats = async function(bookingAmount) {
    this.stats.totalBookings += 1;
    this.stats.totalRevenue += bookingAmount;
    this.stats.popularity = this.stats.totalBookings; // Simple popularity metric
    await this.save();
};

// Method to update rating
serviceSchema.methods.updateRating = async function(newRating) {
    const totalRating = (this.ratings.average * this.ratings.count) + newRating;
    this.ratings.count += 1;
    this.ratings.average = totalRating / this.ratings.count;
    await this.save();
};

// Method to check if service is available on a given date/time
serviceSchema.methods.isAvailableAt = function(date, time) {
    // Check if service is active
    if (!this.isActive) return false;
    
    // Check if day is available
    const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
    if (this.availableDays.length > 0 && !this.availableDays.includes(dayName)) {
        return false;
    }
    
    // Check if time slot is available
    if (this.availableTimeSlots.length > 0) {
        return this.availableTimeSlots.some(slot => {
            return time >= slot.start && time <= slot.end;
        });
    }
    
    return true;
};

// Method to reduce inventory
serviceSchema.methods.reduceInventory = async function(quantity = 1) {
    if (this.inventory.trackInventory) {
        if (this.inventory.currentStock >= quantity) {
            this.inventory.currentStock -= quantity;
            await this.save();
            return true;
        }
        return false; // Insufficient stock
    }
    return true; // Inventory not tracked
};

// Method to add inventory
serviceSchema.methods.addInventory = async function(quantity = 1) {
    if (this.inventory.trackInventory) {
        this.inventory.currentStock += quantity;
        if (this.inventory.maxStock && this.inventory.currentStock > this.inventory.maxStock) {
            this.inventory.currentStock = this.inventory.maxStock;
        }
        await this.save();
    }
};

// Method to get active pricing options
serviceSchema.methods.getActivePricingOptions = function() {
    if (!this.pricingOptions || this.pricingOptions.length === 0) {
        // Fallback to single price/duration
        if (this.price && this.duration) {
            return [{
                name: null,
                price: this.price,
                duration: this.duration,
                originalPrice: this.originalPrice,
                isActive: true
            }];
        }
        return [];
    }
    return this.pricingOptions.filter(opt => opt.isActive !== false);
};

// Method to get pricing option by duration
serviceSchema.methods.getPricingOptionByDuration = function(duration) {
    const activeOptions = this.getActivePricingOptions();
    return activeOptions.find(opt => opt.duration === duration) || null;
};

// Method to add a pricing option
serviceSchema.methods.addPricingOption = function(name, price, duration, originalPrice = null) {
    if (!this.pricingOptions) {
        this.pricingOptions = [];
    }
    this.pricingOptions.push({
        name: name || null,
        price: price,
        duration: duration,
        originalPrice: originalPrice,
        isActive: true
    });
    return this;
};

// Method to remove a pricing option by duration
serviceSchema.methods.removePricingOption = function(duration) {
    if (this.pricingOptions) {
        this.pricingOptions = this.pricingOptions.filter(opt => opt.duration !== duration);
    }
    return this;
};

// Static method to get popular services
serviceSchema.statics.getPopularServices = async function(businessId, limit = 10) {
    return await this.find({ 
        business: businessId, 
        isActive: true 
    })
    .sort({ 'stats.popularity': -1 })
    .limit(limit);
};

// Static method to get featured services
serviceSchema.statics.getFeaturedServices = async function(businessId) {
    return await this.find({ 
        business: businessId, 
        isActive: true,
        isFeatured: true 
    })
    .sort({ displayOrder: 1 });
};

module.exports = mongoose.model("Service", serviceSchema);


const mongoose = require("mongoose");

// Helper to slugify text
const slugify = (text) => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')     // Replace spaces with -
        .replace(/[^\w-]+/g, '')  // Remove all non-word chars
        .replace(/--+/g, '-');    // Replace multiple - with single -
};

const businessSchema = new mongoose.Schema(
    {
        admin: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
            index: true
        },
        slug: {
            type: String,
            unique: true,
            index: true
        },
        type: {
            type: String,
            enum: ["salon", "spa", "beauty"],
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true,
            index: true
        },
        branch: {
            type: String,
            required: true,
            index: true
        },
        address: {
            type: String,
            required: true
        },
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        country: {
            type: String,
            required: true,
            default: "India"
        },
        zipCode: {
            type: String
        },
        phone: {
            type: String
        },
        alternatePhone: {
            type: String
        },
        email: {
            type: String
        },
        website: {
            type: String
        },
        description: {
            type: String
        },
        businessLink: {
            type: String,
            unique: true,
            index: true
        },
        isActive: { type: Boolean, default: true, index: true },
        isActiveFromSuperAdmin: { type: Boolean, default: true, index: true },
        superAdminRemark: { type: String, default: "" },

        // Super Admin Plan Management
        plan: {
            type: String,
            enum: ["free", "paid", "expired"],
            default: "free"
        },
        planDuration: {
            type: String,
            enum: ["monthly", "3 month", "6 month", "yearly", "none"],
            default: "none"
        },
        expireAt: { type: Date },
        planHistory: [{
            planType: String,
            duration: String,
            expireAt: Date,
            changedAt: { type: Date, default: Date.now },
            remark: String
        }],

        // Business Images
        images: {
            logo: {
                type: String
            },
            banner: {
                type: String
            },
            gallery: [{
                type: String
            }],
            thumbnail: {
                type: String
            }
        },

        // google 360 image ulr
        google360ImageUrl: [{
            type: String
        }],

        // Social Media Links
        socialMedia: {
            facebook: {
                type: String
            },
            instagram: {
                type: String
            },
            twitter: {
                type: String
            },
            linkedin: {
                type: String
            },
            youtube: {
                type: String
            },
            whatsapp: {
                type: String
            },
            telegram: { type: String }
        },

        // Business Videos
        videos: [{
            type: String
        }],

        // Business Registration & Legal
        registration: {
            gstNumber: {
                type: String
            },
            panNumber: {
                type: String
            },
            registrationNumber: {
                type: String
            },
            licenseNumber: {
                type: String
            },
            taxId: {
                type: String
            },
            registrationDate: {
                type: Date
            },
            expiryDate: { type: Date }
        },

        // Business Category & Tags
        category: {
            type: String
        },
        subCategory: {
            type: String
        },
        tags: [{ type: String }],
        specialties: [{ type: String }],

        // Payment Methods
        paymentMethods: {
            cash: { type: Boolean, default: true },
            card: { type: Boolean, default: true },
            upi: { type: Boolean, default: true },
            netBanking: { type: Boolean, default: true },
            wallet: { type: Boolean, default: false }
        },

        // Bank Details for Payments
        bankDetails: {
            accountName: {
                type: String
            },
            accountNumber: {
                type: String
            },
            bankName: {
                type: String
            },
            ifscCode: {
                type: String
            },
            branch: {
                type: String
            },
            upiId: {
                type: String
            },
            qrCode: { type: String }
        },

        // Business Capacity & Size
        capacity: {
            seatingCapacity: {
                type: Number
            },
            parkingSpaces: {
                type: Number
            },
            numberOfRooms: {
                type: Number
            },
            numberOfFloors: {
                type: Number
            },
            totalArea: {
                type: String
            } // e.g., "1000 sq ft"
        },

        // Ratings & Reviews
        ratings: {
            average: {
                type: Number,
                default: 0,
                min: 0,
                max: 5
            },
            totalReviews: {
                type: Number,
                default: 0
            },
            fiveStars: {
                type: Number,
                default: 0
            },
            fourStars: {
                type: Number,
                default: 0
            },
            threeStars: {
                type: Number,
                default: 0
            },
            twoStars: {
                type: Number,
                default: 0
            },
            oneStar: { type: Number, default: 0 }
        },

        // Business Features & Amenities
        features: [{ type: String }], // e.g., ["WiFi", "AC", "Parking", "Pet Friendly"]
        amenities: [{ type: String }],

        // Languages Supported
        languages: [{ type: String }], // e.g., ["English", "Hindi", "Marathi"]

        // SEO & Marketing
        seo: {
            metaTitle: {
                type: String
            },
            metaDescription: {
                type: String
            },
            keywords: [{ type: String }],
            ogImage: {
                type: String
            }
        },


        // Business Statistics
        stats: {
            totalCustomers: {
                type: Number,
                default: 0
            },
            totalAppointments: {
                type: Number,
                default: 0
            },
            totalRevenue: {
                type: Number,
                default: 0
            },
            totalOrders: {
                type: Number,
                default: 0
            },
            averageRating: {
                type: Number,
                default: 0
            }
        },

        // Notification Preferences
        notifications: {
            emailNotifications: {
                type: Boolean,
                default: true
            },
            smsNotifications: {
                type: Boolean,
                default: false
            },
            whatsappNotifications: {
                type: Boolean,
                default: false
            },
            pushNotifications: {
                type: Boolean,
                default: true
            }
        },

        // Custom Fields (for flexibility)
        customFields: [{
            key: {
                type: String
            },
            value: {
                type: mongoose.Schema.Types.Mixed
            },
            type: {
                type: String,
                enum: ["text", "number", "date", "boolean", "array"]
            }
        }],

        // Business Hours & Days Off
        businessHours: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        daysOff: [{ type: Date }], // Specific dates when business is closed
        holidays: [{
            name: { type: String },
            date: { type: Date },
            reason: { type: String }
        }],

        // Location Coordinates (for maps)
        location: {
            type: { type: String, enum: ["Point"], default: "Point" },
            coordinates: { type: [Number], default: [0, 0] } // [longitude, latitude]
        },
        googleMapsUrl: { type: String }, // Full Google Maps URL - lat/lng auto-extracted

        // Business-specific settings
        settings: {
            workingHours: {
                open: { type: String, default: "08:00" },
                close: { type: String, default: "22:00" },
                days: [{ type: String, enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] }]
            },
            currency: { type: String, default: "INR" },
            timezone: { type: String, default: "Asia/Kolkata" },

            // Appointment settings
            appointmentSettings: {
                advanceBookingDays: { type: Number, default: 10 }, // How many days in advance can book
                minAdvanceBookingHours: { type: Number, default: 1 }, // Minimum hours before appointment
                maxAdvanceBookingHours: { type: Number, default: 48 * 20 }, // Maximum hours in advance
                slotDuration: { type: Number, default: 30 }, // Default slot duration in minutes
                bufferTime: { type: Number, default: 15 }, // Buffer time between appointments
                allowOnlineBooking: { type: Boolean, default: true },
                requireAdvancePayment: { type: Boolean, default: false },
                advancePaymentPercentage: { type: Number, default: 0 },
                cancellationPolicy: {
                    allowCancellation: { type: Boolean, default: true },
                    minCancellationHours: { type: Number, default: 10 },
                    refundPercentage: { type: Number, default: 100 }
                },
                reminderSettings: {
                    sendSMSReminder: { type: Boolean, default: false },
                    sendEmailReminder: { type: Boolean, default: false },
                    sendWhatsappReminder: { type: Boolean, default: true },
                    reminderHours: { type: Number, default: 24 } // Hours before appointment
                }
            }
        },

        managers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Manager" }],
        staff: [{ type: mongoose.Schema.Types.ObjectId, ref: "Staff" }],

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

// Geospatial index for location-based queries
businessSchema.index({ location: "2dsphere" });

// Compound indexes for better query performance
businessSchema.index({ type: 1, branch: 1 });
businessSchema.index({ plan: 1 });
businessSchema.index({ expireAt: 1 });
businessSchema.index({ admin: 1, type: 1 });
businessSchema.index({ admin: 1, isActive: 1 }); // Critical for dashboard queries
businessSchema.index({ city: 1, type: 1 });
businessSchema.index({ state: 1, type: 1 });
businessSchema.index({ "ratings.average": -1 }); // For sorting by rating
businessSchema.index({ isActive: 1, isActiveFromSuperAdmin: 1, "settings.appointmentSettings.allowOnlineBooking": 1 });
businessSchema.index({ createdAt: -1 }); // For recent businesses
businessSchema.index({ tags: 1 }); // For tag-based search
businessSchema.index({ category: 1, subCategory: 1 }); // For category filtering
businessSchema.index({
    name: "text",
    category: "text",
    subCategory: "text",
    tags: "text",
    description: "text"
}, {
    weights: {
        name: 10,
        category: 5,
        subCategory: 5,
        tags: 3,
        description: 1
    },
    name: "TextIndex"
});

function extractLatLngFromGoogleMapsUrl(url) {
    if (!url) return null;

    try {
        // Method 1: Check for ?q=lat,lng or &q=lat,lng
        const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (qMatch) {
            const lat = parseFloat(qMatch[1]);
            const lng = parseFloat(qMatch[2]);
            if (isValidLatLng(lat, lng)) {
                return { lat, lng };
            }
        }

        // Method 2: Check for /@lat,lng format
        const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (atMatch) {
            const lat = parseFloat(atMatch[1]);
            const lng = parseFloat(atMatch[2]);
            if (isValidLatLng(lat, lng)) {
                return { lat, lng };
            }
        }

        // Method 3: Check for /place/name/lat,lng format
        const placeMatch = url.match(/\/place\/[^/]+\/[^/]*@?(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (placeMatch) {
            const lat = parseFloat(placeMatch[1]);
            const lng = parseFloat(placeMatch[2]);
            if (isValidLatLng(lat, lng)) {
                return { lat, lng };
            }
        }

        // Method 4: Check for ll=lat,lng (alternative parameter)
        const llMatch = url.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (llMatch) {
            const lat = parseFloat(llMatch[1]);
            const lng = parseFloat(llMatch[2]);
            if (isValidLatLng(lat, lng)) {
                return { lat, lng };
            }
        }

        return null;
    } catch (error) {
        console.error('Error extracting coordinates from Google Maps URL:', error);
        return null;
    }
}

// Validate latitude and longitude values
function isValidLatLng(lat, lng) {
    return (
        !isNaN(lat) &&
        !isNaN(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
    );
}

// Pre-save middleware to handle business link, slug, and location extraction
businessSchema.pre('save', async function (next) {
    try {
        // Generate business link if not exists
        if (!this.businessLink && this.name) {
            const cleanBusinessName = this.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const shortId = this._id.toString().slice(-3);
            this.businessLink = `${cleanBusinessName}_${shortId}`;
        }

        // Generate slug: city-branch-name
        if (this.isModified('name') || this.isModified('branch') || this.isModified('city') || !this.slug) {
            const citySlug = slugify(this.city || 'default-city');
            const branchSlug = slugify(this.branch || 'default-branch');
            const nameSlug = slugify(this.name || 'business');
            this.slug = `${citySlug}-${branchSlug}-${nameSlug}`;
        }

        // Extract lat/lng from Google Maps URL if provided
        if (this.googleMapsUrl && this.isModified('googleMapsUrl')) {
            const coordinates = extractLatLngFromGoogleMapsUrl(this.googleMapsUrl);

            if (coordinates) {
                // MongoDB uses [longitude, latitude] order for GeoJSON
                this.location = {
                    type: 'Point',
                    coordinates: [coordinates.lng, coordinates.lat]
                };
                console.log(`✅ Extracted coordinates from Google Maps URL: Lat ${coordinates.lat}, Lng ${coordinates.lng}`);
            } else {
                console.warn('⚠️ Could not extract coordinates from Google Maps URL. Please check the URL format.');
            }
        }

        next();
    } catch (error) {
        console.error('Error in pre-save middleware:', error);
        next(error);
    }
});

module.exports = mongoose.model("Business", businessSchema);

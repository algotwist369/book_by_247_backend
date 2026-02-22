// Joi-based validators for common payloads
// npm install joi

const Joi = require('joi');

// Admin register
const adminRegisterSchema = Joi.object({
    companyName: Joi.string().min(2).max(100).required(),
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^\+?\d{7,15}$/).required(),
    password: Joi.string().min(6).max(128).required(),
});

// Manager creation
const createManagerSchema = Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    pin: Joi.string().pattern(/^\d{3,6}$/).required(), // numeric pin 3-6 digits
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().optional(),
    phone: Joi.string().pattern(/^\+?\d{7,15}$/).optional(),
    businessId: Joi.string().required(),
});

// Business (salon/spa/hotel)
const createBusinessSchema = Joi.object({
    name: Joi.string().min(2).max(200).required(),
    type: Joi.string().valid('salon', 'spa', 'hotel').required(),
    address: Joi.string().optional(),
    branch: Joi.string().optional(),
    companyId: Joi.string().required(),
});

// Staff
const createStaffSchema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    role: Joi.string().min(2).max(50).required(),
    phone: Joi.string().pattern(/^\+?\d{7,15}$/).optional(),
    email: Joi.string().email().optional(),
    businessId: Joi.string().required(),
});

// Daily Report
const dailyReportSchema = Joi.object({
    date: Joi.date().required(),
    managerId: Joi.string().required(),
    businessId: Joi.string().required(),
    totalCustomers: Joi.number().integer().min(0).required(),
    transactions: Joi.array().items(
        Joi.object({
            customerName: Joi.string().optional(),
            service: Joi.string().optional(),
            price: Joi.number().precision(2).min(0).required(),
            timestamp: Joi.date().optional(),
        })
    ).required(),
});

module.exports = {
    adminRegisterSchema,
    createManagerSchema,
    createBusinessSchema,
    createStaffSchema,
    dailyReportSchema,
};

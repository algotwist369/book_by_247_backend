// appointmentUtils.js - Appointment booking utility functions

/**
 * Generate available time slots for a given date
 * @param {Object} business - Business object with settings
 * @param {Date} date - Date to generate slots for
 * @param {Array} existingAppointments - Existing appointments for the date
 * @param {string} staffId - Optional staff ID to filter slots
 * @returns {Array} - Array of available time slots
 */
const generateAvailableSlots = (business, date, existingAppointments = [], staffId = null) => {
    const settings = (business.settings && business.settings.appointmentSettings) || {};
    const workingHours = (business.settings && business.settings.workingHours) || {};

    // Check if business is open on this day
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    // Default to 9 AM - 9 PM if not specified
    let startTime = "09:00";
    let endTime = "21:00";

    if (workingHours.days && workingHours.days.includes(dayName)) {
        startTime = workingHours.open || "09:00";
        endTime = workingHours.close || "21:00";
    } else if (workingHours.days && !workingHours.days.includes(dayName)) {
        // Explicitly closed
        return [];
    }

    const slots = [];

    // Default slot duration 30 mins
    const slotDuration = settings.slotDuration || 30;
    const bufferTime = settings.bufferTime || 0;

    // Convert time strings to minutes with robust validation
    const timeToMinutes = (timeStr) => {
        // Validate input
        if (!timeStr || typeof timeStr !== 'string') {
            console.warn(`[timeToMinutes] Invalid time string: ${timeStr}`);
            return 0;
        }

        const parts = timeStr.trim().split(':');
        if (parts.length !== 2) {
            console.warn(`[timeToMinutes] Invalid time format (expected HH:MM): ${timeStr}`);
            return 0;
        }

        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);

        // Validate parsed values
        if (isNaN(hours) || isNaN(minutes)) {
            console.warn(`[timeToMinutes] Non-numeric values in time string: ${timeStr}`);
            return 0;
        }

        // Validate ranges (24-hour format)
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            console.warn(`[timeToMinutes] Time values out of range: ${timeStr}`);
            return 0;
        }

        return hours * 60 + minutes;
    };

    const minutesToTime = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    // Validate slotDuration to prevent infinite loops (OOM error)
    // If invalid or too small, default to 30 mins or return empty
    const safeSlotDuration = (!slotDuration || slotDuration < 5) ? 30 : slotDuration;

    // Validate working hours
    if (startMinutes >= endMinutes) {
        return [];
    }

    // Default to 1 hour (60 mins) minimum advance booking if not specified
    const minAdvanceBookingMinutes = settings.minAdvanceBookingHours ? settings.minAdvanceBookingHours * 60 : 60;

    // Calculate current time in minutes (if date is today)
    const now = new Date();
    let currentDayMinutes = -1;

    // Check if the requested date is today
    const isToday = date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

    if (isToday) {
        currentDayMinutes = now.getHours() * 60 + now.getMinutes();
    }

    // Generate slots
    for (let currentMinutes = startMinutes; currentMinutes < endMinutes; currentMinutes += safeSlotDuration) {

        // Skip past slots if today
        if (isToday && currentMinutes < currentDayMinutes + minAdvanceBookingMinutes) {
            continue;
        }

        const slotStartTime = minutesToTime(currentMinutes);
        const slotEndTime = minutesToTime(currentMinutes + safeSlotDuration);

        // Check if slot is available
        const isAvailable = !existingAppointments.some(appointment => {
            if (staffId && appointment.staff && appointment.staff.toString() !== staffId) {
                return false; // Different staff, slot is available
            }

            const appointmentStart = timeToMinutes(appointment.startTime);
            const appointmentEnd = timeToMinutes(appointment.endTime);

            // Check for overlap (including buffer time)
            return (currentMinutes < appointmentEnd + bufferTime) &&
                (currentMinutes + safeSlotDuration > appointmentStart - bufferTime);
        });

        if (isAvailable) {
            slots.push({
                startTime: slotStartTime,
                endTime: slotEndTime,
                duration: slotDuration,
                available: true
            });
        }
    }

    return slots;
};


const validateAppointmentBooking = (appointmentData, business, existingAppointments = []) => {
    const errors = [];
    const settings = business.settings.appointmentSettings;
    const workingHours = business.settings.workingHours;

    // Check if online booking is allowed
    if (!settings.allowOnlineBooking) {
        errors.push("Online booking is not available for this business");
    }

    // Check advance booking limits
    const appointmentDate = new Date(appointmentData.appointmentDate);
    const now = new Date();

    // Helper function to parse time string to 24-hour format
    const parseTimeTo24Hour = (timeStr) => {
        if (!timeStr) return { hours: 0, minutes: 0 };

        let time = timeStr.trim();
        let isPM = false;

        // Check for AM/PM
        if (time.includes('PM') || time.includes('pm')) {
            isPM = true;
            time = time.replace(/PM|pm/gi, '').trim();
        } else if (time.includes('AM') || time.includes('am')) {
            time = time.replace(/AM|am/gi, '').trim();
        }

        // Extract hours and minutes
        const parts = time.split(':');
        if (parts.length < 2) return { hours: 0, minutes: 0 };

        let hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;

        // Convert to 24-hour format
        if (isPM && hours !== 12) {
            hours += 12;
        } else if (!isPM && hours === 12) {
            hours = 0;
        }

        return { hours, minutes };
    };

    // Parse the start time
    const timeParts = parseTimeTo24Hour(appointmentData.startTime);

    // Create appointment datetime by combining date with start time
    // Ensure date is in YYYY-MM-DD format
    const dateStr = appointmentDate.toISOString().split('T')[0];
    const appointmentDateTime = new Date(
        appointmentDate.getFullYear(),
        appointmentDate.getMonth(),
        appointmentDate.getDate(),
        timeParts.hours,
        timeParts.minutes,
        0,
        0
    );

    const hoursUntilAppointment = (appointmentDateTime - now) / (1000 * 60 * 60);

    if (hoursUntilAppointment < settings.minAdvanceBookingHours) {
        errors.push(`Appointment must be booked at least ${settings.minAdvanceBookingHours} hours in advance`);
    }

    if (hoursUntilAppointment > settings.maxAdvanceBookingHours) {
        errors.push(`Appointment cannot be booked more than ${settings.maxAdvanceBookingHours / 24} days in advance`);
    }

    // Check if business is open on the selected day
    const dayName = appointmentDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    if (!workingHours.days.includes(dayName)) {
        errors.push("Business is closed on the selected day");
    }

    // Check if appointment time is within working hours
    const appointmentStartTime = appointmentData.startTime;
    const appointmentEndTime = appointmentData.endTime;

    // Helper function to convert time string to minutes for comparison
    const timeToMinutes = (timeStr) => {
        if (!timeStr) return 0;
        // Handle formats like "09:00", "9:00", "09:00 AM", "9:00 PM"
        let time = timeStr.trim();
        let isPM = false;

        // Check for AM/PM
        if (time.includes('PM') || time.includes('pm')) {
            isPM = true;
            time = time.replace(/PM|pm/gi, '').trim();
        } else if (time.includes('AM') || time.includes('am')) {
            time = time.replace(/AM|am/gi, '').trim();
        }

        // Extract hours and minutes
        const parts = time.split(':');
        if (parts.length < 2) return 0;

        let hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;

        // Convert to 24-hour format
        if (isPM && hours !== 12) {
            hours += 12;
        } else if (!isPM && hours === 12) {
            hours = 0;
        }

        return hours * 60 + minutes;
    };

    const startMinutes = timeToMinutes(appointmentStartTime);
    const endMinutes = timeToMinutes(appointmentEndTime);
    const openMinutes = timeToMinutes(workingHours.open);
    const closeMinutes = timeToMinutes(workingHours.close);

    if (startMinutes < openMinutes || endMinutes > closeMinutes) {
        errors.push("Appointment time must be within business working hours");
    }

    // Check for conflicts with existing appointments
    const hasConflict = existingAppointments.some(appointment => {
        if (appointmentData.staff && appointment.staff &&
            appointment.staff.toString() !== appointmentData.staff) {
            return false; // Different staff, no conflict
        }

        // Use timeToMinutes for proper time comparison
        const appointmentStart = timeToMinutes(appointmentData.startTime);
        const appointmentEnd = timeToMinutes(appointmentData.endTime);
        const existingStart = timeToMinutes(appointment.startTime);
        const existingEnd = timeToMinutes(appointment.endTime);

        // Check for overlap (including buffer time)
        const bufferMinutes = settings.bufferTime || 0;
        return (appointmentStart < existingEnd + bufferMinutes) &&
            (appointmentEnd > existingStart - bufferMinutes);
    });

    if (hasConflict) {
        errors.push("Selected time slot is not available");
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
};


const getServicePriceAndDuration = (service, selectedDuration = null) => {
    // If pricingOptions exist and have active options
    if (service.pricingOptions && service.pricingOptions.length > 0) {
        const activeOptions = service.pricingOptions.filter(opt => opt.isActive !== false);

        if (activeOptions.length > 0) {
            // If specific duration requested, find matching option
            if (selectedDuration) {
                const matchingOption = activeOptions.find(opt => opt.duration === selectedDuration);
                if (matchingOption) {
                    return { price: matchingOption.price, duration: matchingOption.duration };
                }
            }
            // Otherwise, use the first active option (or could use min/max based on business logic)
            const firstOption = activeOptions[0];
            return { price: firstOption.price, duration: firstOption.duration };
        }
    }

    // Fallback to old format (single price/duration)
    return {
        price: service.price || 0,
        duration: service.duration || 60
    };
};

const calculateAppointmentPricing = (services, customer = null, business = null) => {
    let totalPrice = 0;
    let totalDuration = 0;

    services.forEach(service => {
        const { price, duration } = getServicePriceAndDuration(service);
        totalPrice += price;
        totalDuration += duration;
    });

    // Apply customer discounts (loyalty, etc.)
    let discount = 0;
    if (customer && customer.stats.loyaltyPoints > 100) {
        discount = Math.min(totalPrice * 0.1, 500); // 10% discount, max 500 rupees
    }

    // Calculate tax (assuming 18% GST)
    const tax = (totalPrice - discount) * 0.18;

    const finalPrice = totalPrice - discount + tax;

    return {
        totalPrice,
        discount,
        tax,
        finalPrice,
        totalDuration,
        breakdown: {
            services: services.map(service => {
                const { price, duration } = getServicePriceAndDuration(service);
                return {
                    name: service.serviceName || service.name,
                    price: price,
                    duration: duration
                };
            }),
            subtotal: totalPrice,
            discount: discount,
            tax: tax,
            total: finalPrice
        }
    };
};

/**
 * Generate appointment confirmation message
 * @param {Object} appointment - Appointment object
 * @param {Object} business - Business object
 * @param {Object} customer - Customer object
 * @returns {string} - Confirmation message
 */
const generateConfirmationMessage = (appointment, business, customer) => {
    const appointmentDate = new Date(appointment.appointmentDate).toLocaleDateString('en-IN');
    const startTime = appointment.startTime;
    const endTime = appointment.endTime;

    return `Dear ${customer.name},

Your appointment has been confirmed!

📅 Date: ${appointmentDate}
⏰ Time: ${startTime} - ${endTime}
🏢 Business: ${business.name} - ${business.branch}
📍 Address: ${business.address}
📞 Phone: ${business.phone}

Confirmation Code: ${appointment.confirmationCode}

Please arrive 10 minutes before your appointment time.

Thank you for choosing ${business.name}!`;
};

/**
 * Check if appointment can be cancelled
 * @param {Object} appointment - Appointment object
 * @param {Object} business - Business object
 * @returns {Object} - Cancellation eligibility
 */
const canCancelAppointment = (appointment, business) => {
    const settings = business.settings.appointmentSettings;
    const cancellationPolicy = settings.cancellationPolicy;

    if (!cancellationPolicy.allowCancellation) {
        return {
            canCancel: false,
            reason: "Cancellation is not allowed for this business"
        };
    }

    const appointmentDate = new Date(appointment.appointmentDate);
    const appointmentTime = new Date(`${appointmentDate.toISOString().split('T')[0]}T${appointment.startTime}:00`);
    const now = new Date();
    const hoursUntilAppointment = (appointmentTime - now) / (1000 * 60 * 60);

    if (hoursUntilAppointment < cancellationPolicy.minCancellationHours) {
        return {
            canCancel: false,
            reason: `Cancellation must be done at least ${cancellationPolicy.minCancellationHours} hours before appointment`
        };
    }

    if (appointment.status === 'completed' || appointment.status === 'cancelled') {
        return {
            canCancel: false,
            reason: "Appointment is already completed or cancelled"
        };
    }

    return {
        canCancel: true,
        refundAmount: appointment.finalPrice * (cancellationPolicy.refundPercentage / 100)
    };
};

/**
 * Format time for display
 * @param {string} time - Time in HH:MM format
 * @returns {string} - Formatted time
 */
const formatTime = (time) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
};

/**
 * Get business services by type
 * @param {string} businessType - Type of business (salon, spa, hotel)
 * @returns {Array} - Available services
 */
const getBusinessServices = (businessType) => {
    const services = {
        salon: [
            { name: "Hair Cut", type: "hair", category: "Hair Services", price: 500, duration: 30 },
            { name: "Hair Wash", type: "hair", category: "Hair Services", price: 200, duration: 20 },
            { name: "Hair Color", type: "hair", category: "Hair Services", price: 1500, duration: 120 },
            { name: "Hair Styling", type: "hair", category: "Hair Services", price: 800, duration: 45 },
            { name: "Facial", type: "facial", category: "Skin Care", price: 1000, duration: 60 },
            { name: "Manicure", type: "nail", category: "Nail Care", price: 400, duration: 30 },
            { name: "Pedicure", type: "nail", category: "Nail Care", price: 600, duration: 45 }
        ],
        spa: [
            { name: "Full Body Massage", type: "massage", category: "Massage", price: 2000, duration: 90 },
            { name: "Head & Shoulder Massage", type: "massage", category: "Massage", price: 800, duration: 30 },
            { name: "Foot Massage", type: "massage", category: "Massage", price: 600, duration: 30 },
            { name: "Aromatherapy", type: "spa", category: "Spa Treatments", price: 1500, duration: 60 },
            { name: "Hot Stone Therapy", type: "spa", category: "Spa Treatments", price: 2500, duration: 90 },
            { name: "Facial Treatment", type: "facial", category: "Skin Care", price: 1200, duration: 75 }
        ],
        hotel: [
            { name: "Standard Room", type: "room", category: "Accommodation", price: 3000, duration: 1440 }, // 24 hours
            { name: "Deluxe Room", type: "room", category: "Accommodation", price: 5000, duration: 1440 },
            { name: "Suite", type: "room", category: "Accommodation", price: 8000, duration: 1440 },
            { name: "Room Service", type: "food", category: "Food & Beverage", price: 500, duration: 30 },
            { name: "Spa Package", type: "spa", category: "Wellness", price: 3000, duration: 120 },
            { name: "Airport Transfer", type: "other", category: "Transportation", price: 1000, duration: 60 }
        ]
    };

    return services[businessType] || [];
};

module.exports = {
    generateAvailableSlots,
    validateAppointmentBooking,
    calculateAppointmentPricing,
    generateConfirmationMessage,
    canCancelAppointment,
    formatTime,
    getBusinessServices,
    getServicePriceAndDuration
};

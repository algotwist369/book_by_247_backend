
export const General_Inquiry_Template = (data) => {
    return `👋 *Hello ${data.customerName || 'Customer'}*,

Thank you for reaching out to *${data.businessName || 'Us'}* via *SpaAdvisor*! 🙏

We have received your inquiry regarding *${data.inquiryType || 'General Inquiry'}*. 
Our team is reviewing your request and will get back to you shortly.

📞 If you need immediate assistance, feel free to call us.

Best Regards,
*${data.businessName || 'Team'}*
_Powered by SpaAdvisor_`;
}

export const Pricing_Services_Inquiry_Template = (data) => {
    return `💎 *Hello ${data.customerName || 'Customer'}*,

Thanks for your interest in *${data.businessName || 'our'}* services on *SpaAdvisor*! 💆‍♀️

We offer a variety of premium services tailored for you. 
One of our experts will contact you soon to discuss our *Pricing & Services* in detail.

✨ *We look forward to serving you!*
${data.bookingUrl ? `
🔗 *Book Now:* ${data.bookingUrl}` : ''}

Best Regards,
*${data.businessName || 'Team'}*
_Partner @ SpaAdvisor_`;
}

export const Special_Offer_Inquiry_Template = (data) => {
    return `🎉 *Great News, ${data.customerName || 'Customer'}!*

We're excited that you're interested in our *Special Offers* at *${data.businessName || 'Us'}* (via *SpaAdvisor*)! 🎁

Our latest deals are designed just for you. 
Stay tuned! We will share the details of our exclusive offers with you very soon.

⏳ *Limited time offers available!*
${data.bookingUrl ? `
🔗 *Check & Book:* ${data.bookingUrl}` : ''}

Best Regards,
*${data.businessName || 'Team'}*
_Discover more on SpaAdvisor_`;
}

export const Membership_Inquiry_Template = (data) => {
    return `👑 *Welcome ${data.customerName || 'Customer'}*,

Thank you for inquiring about our *Membership Packages* at *${data.businessName || 'Us'}* on *SpaAdvisor*! 🌟

Becoming a member unlocks exclusive benefits, priority booking, and special discounts. 
We will get in touch shortly to help you choose the perfect plan.

🤝 *Join the elite club!*

Best Regards,
*${data.businessName || 'Team'}*
_Trusted Partner of SpaAdvisor_`;
}
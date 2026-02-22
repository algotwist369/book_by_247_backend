module.exports = {
    subject: 'Special Offer - {{businessName}}',
    html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9f9f9; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden;">
                <!-- Header -->
                <div style="background-color: #e74c3c; color: #ffffff; padding: 25px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 300; letter-spacing: 1px;">{{businessName}}</h1>
                </div>
                
                <!-- Body -->
                <div style="padding: 40px 30px; color: #444444; line-height: 1.6; text-align: center;">
                    <h2 style="color: #c0392b; margin-top: 0; font-size: 24px;">Special Offer For You!</h2>
                    <p>Dear {{customerName}},</p>
                    
                    <div style="background-color: #fff5f5; border: 2px dashed #e74c3c; border-radius: 8px; padding: 30px; margin: 30px 0;">
                        <h3 style="margin: 0 0 10px 0; color: #e74c3c; font-size: 22px;">{{offerTitle}}</h3>
                        <p style="font-size: 16px; margin-bottom: 20px;">{{offerDescription}}</p>
                        <div style="font-size: 28px; font-weight: bold; color: #c0392b;">{{discountText}}</div>
                    </div>
                    
                    <a href="{{actionUrl}}" style="background-color: #e74c3c; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 50px; font-weight: bold; display: inline-block;">Clone Claim This Offer</a>
                    
                    <p style="font-size: 12px; color: #7f8c8d; margin-top: 20px;">Valid until: {{expiryDate}}</p>
                </div>
                
                 <!-- Footer -->
                <div style="background-color: #f1f2f6; padding: 20px; text-align: center; color: #95a5a6; font-size: 12px;">
                    <p style="margin: 0;">&copy; {{year}} SpaAdvisor.</p>
                </div>
            </div>
        </div>
    `
};

module.exports = {
    subject: 'Thank You for Visiting - {{businessName}}',
    html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9f9f9; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden;">
                <!-- Header -->
                <div style="background-color: #27ae60; color: #ffffff; padding: 25px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 300; letter-spacing: 1px;">{{businessName}}</h1>
                </div>
                
                <!-- Body -->
                <div style="padding: 40px 30px; color: #444444; line-height: 1.6; text-align: center;">
                    <img src="https://example.com/check-circle.png" alt="Success" style="width: 64px; height: 64px; margin-bottom: 20px; display: none;"> <!-- Optional Icon -->
                    
                    <h2 style="color: #2c3e50; margin-top: 0; font-size: 24px;">Thank You!</h2>
                    <p style="margin-bottom: 25px;">We hope you enjoyed your service with us.</p>
                    
                    <div style="margin: 30px 0;">
                        <p style="font-size: 18px; color: #2c3e50; font-weight: 600;">How was your experience?</p>
                        <p style="color: #7f8c8d; margin-bottom: 30px;">We would love to hear your feedback to serve you better.</p>
                        
                        <a href="{{businessLink}}" style="background-color: #f1c40f; color: #2c3e50; text-decoration: none; padding: 15px 30px; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(241, 196, 15, 0.3);">Leave a Review</a>
                    </div>
                    
                    <p style="font-size: 14px; color: #7f8c8d; margin-top: 40px;">If the button doesn't work, you can visit our page here: {{businessLink}}</p>
                </div>
                
                 <!-- Footer -->
                <div style="background-color: #f1f2f6; padding: 20px; text-align: center; color: #95a5a6; font-size: 12px;">
                    <p style="margin: 0;">&copy; {{year}} SpaAdvisor. All rights reserved.</p>
                </div>
            </div>
        </div>
    `
};

module.exports = {
    subject: 'Happy Anniversary from {{businessName}}!',
    html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9f9f9; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden;">
                <!-- Header -->
                <div style="background-color: #e91e63; color: #ffffff; padding: 25px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 300; letter-spacing: 1px;">{{businessName}}</h1>
                </div>
                
                <!-- Body -->
                <div style="padding: 40px 30px; color: #444444; line-height: 1.6; text-align: center;">
                    <h2 style="color: #e91e63; margin-top: 0; font-size: 24px;">Happy Anniversary!</h2>
                    <p>Dear {{customerName}},</p>
                    
                    <p>It's been a wonderful journey with you! Celebrating another year together.</p>
                    
                    <div style="margin: 30px 0;">
                        <img src="https://example.com/celebration.png" alt="Celebration" style="width: 100%; max-width: 200px; display: none;">
                    </div>
                    
                    <a href="{{actionUrl}}" style="background-color: #e91e63; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 50px; font-weight: bold; display: inline-block;">Celebrate With Us</a>
                </div>
                
                 <!-- Footer -->
                <div style="background-color: #f1f2f6; padding: 20px; text-align: center; color: #95a5a6; font-size: 12px;">
                    <p style="margin: 0;">&copy; {{year}} SpaAdvisor.</p>
                </div>
            </div>
        </div>
    `
};

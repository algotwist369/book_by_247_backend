module.exports = {
    subject: 'Happy Birthday from {{businessName}}! 🎂',
    html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9f9f9; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden; border: 2px solid #f1c40f;">
                <!-- Header -->
                <div style="background-color: #f1c40f; color: #2c3e50; padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 28px; font-weight: bold;">Happy Birthday!</h1>
                </div>
                
                <!-- Body -->
                <div style="padding: 40px 30px; color: #444444; line-height: 1.6; text-align: center;">
                    <p style="font-size: 18px;">Dear {{customerName}},</p>
                    
                    <p style="margin: 20px 0;">Wishing you a fantastic birthday filled with joy and happiness!</p>
                    
                    <div style="background-color: #fff9db; padding: 25px; border-radius: 8px; margin: 30px 0; border: 1px dashed #f1c40f;">
                        <h3 style="color: #d35400; margin-top: 0;">A Gift For You 🎁</h3>
                        <p>Enjoy <strong>{{discountAmount}} OFF</strong> your next visit!</p>
                        <p style="font-size: 12px; color: #7f8c8d;">Valid until {{expiryDate}}</p>
                    </div>
                    
                    <a href="{{actionUrl}}" style="background-color: #2c3e50; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 50px; font-weight: bold; display: inline-block;">Book Your Treat</a>
                </div>
                
                 <!-- Footer -->
                <div style="background-color: #f1f2f6; padding: 20px; text-align: center; color: #95a5a6; font-size: 12px;">
                    <p style="margin: 0;">&copy; {{year}} SpaAdvisor.</p>
                </div>
            </div>
        </div>
    `
};

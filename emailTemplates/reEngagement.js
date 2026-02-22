module.exports = {
    subject: 'We Miss You at {{businessName}}!',
    html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9f9f9; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden;">
                <!-- Header -->
                <div style="background-color: #34495e; color: #ffffff; padding: 25px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 300; letter-spacing: 1px;">{{businessName}}</h1>
                </div>
                
                <!-- Body -->
                <div style="padding: 40px 30px; color: #444444; line-height: 1.6; text-align: center;">
                    <h2 style="color: #34495e; margin-top: 0; font-size: 22px;">It's been a while...</h2>
                    <p>Dear {{customerName}},</p>
                    
                    <p>We haven't seen you lately and we'd love to welcome you back!</p>
                    
                    <div style="background-color: #ecf0f1; padding: 20px; border-radius: 6px; margin: 30px 0;">
                        <p style="margin: 0; font-weight: bold; color: #2c3e50;">Come visit us and relax!</p>
                    </div>
                    
                    <a href="{{actionUrl}}" style="background-color: #3498db; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 50px; font-weight: bold; display: inline-block;">Book Your Next Appointment</a>
                </div>
                
                 <!-- Footer -->
                <div style="background-color: #f1f2f6; padding: 20px; text-align: center; color: #95a5a6; font-size: 12px;">
                    <p style="margin: 0;">&copy; {{year}} SpaAdvisor.</p>
                </div>
            </div>
        </div>
    `
};

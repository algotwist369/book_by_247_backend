module.exports = {
    subject: 'Appointment Reminder - {{businessName}}',
    html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9f9f9; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden;">
                <!-- Header -->
                <div style="background-color: #333; color: #ffffff; padding: 25px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 300; letter-spacing: 1px;">{{businessName}}</h1>
                </div>
                
                <!-- Body -->
                <div style="padding: 40px 30px; color: #444444; line-height: 1.6;">
                    <h2 style="color: #333; margin-top: 0; font-size: 20px;">Upcoming Appointment</h2>
                    <p style="margin-bottom: 25px;">Dear {{customerName}},</p>
                    <p>This is a reminder for your upcoming appointment.</p>
                    
                    <div style="background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
                         <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #7f8c8d; font-size: 14px; width: 120px;">Date</td>
                                <td style="padding: 8px 0; font-weight: 600; color: #2c3e50;">{{appointmentDate}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #7f8c8d; font-size: 14px;">Time</td>
                                <td style="padding: 8px 0; font-weight: 600; color: #2c3e50;">{{startTime}} - {{endTime}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #7f8c8d; font-size: 14px;">Services</td>
                                <td style="padding: 8px 0; font-weight: 600; color: #2c3e50;">{{services}}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <p>We look forward to seeing you!</p>
                </div>
                
                 <!-- Footer -->
                <div style="background-color: #f1f2f6; padding: 20px; text-align: center; color: #95a5a6; font-size: 12px;">
                    <p style="margin: 0;">&copy; {{year}} SpaAdvisor. All rights reserved.</p>
                </div>
            </div>
        </div>
    `
};

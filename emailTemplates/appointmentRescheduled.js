module.exports = {
    subject: 'Appointment Rescheduled - {{businessName}}',
    html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9f9f9; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden;">
                <!-- Header -->
                <div style="background-color: #e67e22; color: #ffffff; padding: 25px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 300; letter-spacing: 1px;">{{businessName}}</h1>
                </div>
                
                <!-- Body -->
                <div style="padding: 40px 30px; color: #444444; line-height: 1.6;">
                    <h2 style="color: #2c3e50; margin-top: 0; font-size: 20px;">Appointment Rescheduled</h2>
                    <p style="margin-bottom: 25px;">Dear {{customerName}},</p>
                    
                    <p style="margin-bottom: 25px;">Your appointment has been rescheduled to the following time.</p>
                    
                    <div style="background-color: #fffaf0; border: 1px solid #fce8b2; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
                         <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #7f8c8d; font-size: 14px; width: 120px;">New Date</td>
                                <td style="padding: 8px 0; font-weight: 600; color: #2c3e50;">{{appointmentDate}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #7f8c8d; font-size: 14px;">New Time</td>
                                <td style="padding: 8px 0; font-weight: 600; color: #2c3e50;">{{startTime}} - {{endTime}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #7f8c8d; font-size: 14px;">Service</td>
                                <td style="padding: 8px 0; font-weight: 600; color: #2c3e50;">{{services}}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="{{actionUrl}}" style="background-color: #e67e22; color: #ffffff; text-decoration: none; padding: 12px 25px; border-radius: 4px; font-weight: bold; display: inline-block;">View Updated Appointment</a>
                    </div>
                </div>
                
                 <!-- Footer -->
                <div style="background-color: #f1f2f6; padding: 20px; text-align: center; color: #95a5a6; font-size: 12px;">
                    <p style="margin: 0;">&copy; {{year}} SpaAdvisor. All rights reserved.</p>
                </div>
            </div>
        </div>
    `
};

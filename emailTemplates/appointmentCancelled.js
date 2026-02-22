module.exports = {
    subject: 'Appointment Cancelled - {{businessName}}',
    html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9f9f9; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden;">
                <!-- Header -->
                <div style="background-color: #c0392b; color: #ffffff; padding: 25px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 300; letter-spacing: 1px;">{{businessName}}</h1>
                </div>
                
                <!-- Body -->
                <div style="padding: 40px 30px; color: #444444; line-height: 1.6;">
                    <h2 style="color: #c0392b; margin-top: 0; font-size: 20px;">Appointment Cancelled</h2>
                    <p style="margin-bottom: 25px;">Dear {{customerName}},</p>
                    
                    <p style="margin-bottom: 25px;">The following appointment has been cancelled.</p>
                    
                    <div style="background-color: #fff5f5; border: 1px solid #feb2b2; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
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
                                <td style="padding: 8px 0; color: #7f8c8d; font-size: 14px;">Service</td>
                                <td style="padding: 8px 0; font-weight: 600; color: #2c3e50;">{{services}}</td>
                            </tr>
                             <tr>
                                <td style="padding: 8px 0; color: #7f8c8d; font-size: 14px;">Reason</td>
                                <td style="padding: 8px 0; font-weight: 600; color: #c0392b;">{{reason}}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <p style="font-size: 14px; color: #7f8c8d;">If you did not cancel this appointment or believe this is an error, please contact us immediately.</p>
                    
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="{{actionUrl}}" style="background-color: #7f8c8d; color: #ffffff; text-decoration: none; padding: 12px 25px; border-radius: 4px; font-weight: bold; display: inline-block;">Rebook Now</a>
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

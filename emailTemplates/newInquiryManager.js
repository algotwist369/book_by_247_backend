module.exports = {
    subject: 'New Customer Inquiry - {{branchName}}',
    html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9f9f9; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden;">
                <!-- Header -->
                <div style="background-color: #2c3e50; color: #ffffff; padding: 25px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 300; letter-spacing: 1px;">{{businessName}}</h1>
                </div>
                
                <!-- Body -->
                <div style="padding: 40px 30px; color: #444444; line-height: 1.6;">
                    <div style="display: flex; align-items: center; margin-bottom: 20px;">
                        <span style="background-color: #27ae60; color: white; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase;">New Lead</span>
                    </div>
                    
                    <h2 style="color: #2c3e50; margin-top: 0; font-size: 20px;">Hello, you have a new customer inquiry!</h2>
                    <p style="margin-bottom: 25px;">A potential customer has submitted an inquiry for your branch <strong>({{branchName}})</strong>.</p>
                    
                    <div style="background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
                        <h3 style="margin-top: 0; font-size: 16px; color: #2c3e50; border-bottom: 1px solid #e9ecef; padding-bottom: 10px; margin-bottom: 15px;">Inquiry Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 10px 0; color: #7f8c8d; font-size: 14px; width: 120px; border-bottom: 1px solid #eeeeee;">Name</td>
                                <td style="padding: 10px 0; font-weight: 600; color: #2c3e50; border-bottom: 1px solid #eeeeee;">{{customerName}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 0; color: #7f8c8d; font-size: 14px; border-bottom: 1px solid #eeeeee;">Phone</td>
                                <td style="padding: 10px 0; font-weight: 600; color: #2c3e50; border-bottom: 1px solid #eeeeee;">{{customerPhone}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 0; color: #7f8c8d; font-size: 14px; border-bottom: 1px solid #eeeeee;">Type</td>
                                <td style="padding: 10px 0; font-weight: 600; color: #2c3e50; border-bottom: 1px solid #eeeeee;">{{inquiryType}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 0; color: #7f8c8d; font-size: 14px;">Date</td>
                                <td style="padding: 10px 0; font-weight: 600; color: #2c3e50;">{{date}}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="{{actionUrl}}" style="background-color: #2c3e50; color: #ffffff; text-decoration: none; padding: 12px 25px; border-radius: 4px; font-weight: bold; display: inline-block;">View Inquiry</a>
                    </div>
                </div>
                
                <!-- Footer -->
                <div style="background-color: #f1f2f6; padding: 20px; text-align: center; color: #95a5a6; font-size: 12px;">
                    <p style="margin: 0;">&copy; {{year}} {{businessName}} CRM.</p>
                </div>
            </div>
        </div>
    `
};

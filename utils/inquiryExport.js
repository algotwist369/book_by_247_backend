const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');

// Export Inquiries to CSV
const exportInquiriesToCSV = async (data) => {
    if (!Array.isArray(data) || data.length === 0) {
        return 'No data available';
    }

    const fields = [
        { label: 'Name', value: 'user_name' },
        { label: 'Phone', value: 'phone' },
        { label: 'Business', value: 'business_id.name' },
        { label: 'Branch', value: 'business_id.branch' },
        { label: 'Type', value: 'inquiry_type' },
        { label: 'Status', value: (row) => row.is_recieved ? 'Received' : 'Pending' },
        { label: 'Created At', value: (row) => new Date(row.createdAt).toLocaleString('en-IN') }
    ];

    try {
        const opts = { fields };
        const parser = new Parser(opts);
        const csv = parser.parse(data);
        return csv;
    } catch (err) {
        console.error('Inquiry CSV export error:', err);
        return 'Error generating CSV';
    }
};

// Export Inquiries to PDF
const exportInquiriesToPDF = async (data) => {
    if (!Array.isArray(data) || data.length === 0) {
        return Buffer.from('No data available');
    }

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
            const chunks = [];

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Header
            doc.fontSize(20).text('Customer Inquiries Report', { align: 'center' });
            doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
            doc.moveDown(2);

            // Table setup
            const tableTop = 100;
            const headers = ['Name', 'Phone', 'Business', 'Branch', 'Type', 'Status', 'Date'];
            const colWidths = [100, 100, 150, 100, 70, 70, 120];
            const startX = 30;

            // Draw headers
            doc.fontSize(11).font('Helvetica-Bold');
            headers.forEach((header, i) => {
                const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
                doc.text(header, x, tableTop);
            });

            doc.moveTo(startX, tableTop + 15).lineTo(810, tableTop + 15).stroke();
            doc.font('Helvetica').fontSize(10);

            let y = tableTop + 25;

            // Draw rows
            data.forEach((inquiry) => {
                const values = [
                    inquiry.user_name || 'N/A',
                    inquiry.phone || 'N/A',
                    inquiry.business_id?.name || 'N/A',
                    inquiry.business_id?.branch || '',
                    inquiry.inquiry_type || 'General',
                    inquiry.is_recieved ? 'Received' : 'Pending',
                    new Date(inquiry.createdAt).toLocaleDateString('en-IN')
                ];

                // Page break check
                if (y > 530) {
                    doc.addPage({ layout: 'landscape' });
                    y = 50;
                    // Re-draw headers on new page
                    doc.fontSize(11).font('Helvetica-Bold');
                    headers.forEach((header, i) => {
                        const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
                        doc.text(header, x, y);
                    });
                    doc.moveTo(startX, y + 15).lineTo(810, y + 15).stroke();
                    doc.font('Helvetica').fontSize(10);
                    y += 25;
                }

                values.forEach((val, i) => {
                    const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
                    doc.text(String(val), x, y, { width: colWidths[i] - 5 });
                });

                y += 25;
            });

            doc.end();
        } catch (err) {
            console.error('Inquiry PDF export error:', err);
            reject(err);
        }
    });
};

module.exports = {
    exportInquiriesToCSV,
    exportInquiriesToPDF
};

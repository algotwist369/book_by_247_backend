// Export JSON data to CSV and PDF. Uses json2csv and pdfkit.
// Note: for large exports consider streaming to avoid memory issues.

const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');

// Export JSON array to CSV string
const exportToCSV = async (data) => {
    if (!Array.isArray(data) || data.length === 0) {
        return 'No data available';
    }

    // Define fields based on DailyBusiness schema
    const fields = [
        'date',
        'business.name',
        'business.type',
        'business.branch',
        'manager.name',
        'manager.username',
        'totalCustomers',
        'totalIncome',
        'totalExpenses',
        'netProfit',
        'isCompleted'
    ];

    try {
        const opts = { fields };
        const parser = new Parser(opts);
        const csv = parser.parse(data);
        return csv;
    } catch (err) {
        console.error('CSV export error:', err);
        return 'Error generating CSV';
    }
}

// Export JSON array to PDF buffer
const exportToPDF = async (data) => {
    if (!Array.isArray(data) || data.length === 0) {
        return Buffer.from('No data available');
    }

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            const chunks = [];
            
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Title
            doc.fontSize(18).text('Business Reports', { align: 'center' });
            doc.moveDown();

            // Table headers
            doc.fontSize(10);
            const headers = ['Date', 'Manager', 'Customers', 'Income', 'Expenses', 'Profit'];
            const colWidth = (doc.page.width - 80) / headers.length;
            let yPos = doc.y;

            headers.forEach((header, i) => {
                doc.text(header, 40 + i * colWidth, yPos, { width: colWidth - 5 });
            });
            yPos += 20;
            doc.moveTo(40, yPos).lineTo(doc.page.width - 40, yPos).stroke();
            yPos += 10;

            // Table rows
            data.forEach((row) => {
                const values = [
                    new Date(row.date || row.createdAt).toLocaleDateString(),
                    row.manager?.username || row.manager?.name || '-',
                    row.totalCustomers || '0',
                    `₹${(row.totalIncome || 0).toLocaleString('en-IN')}`,
                    `₹${(row.totalExpenses || 0).toLocaleString('en-IN')}`,
                    `₹${(row.netProfit || 0).toLocaleString('en-IN')}`
                ];

                values.forEach((val, i) => {
                    doc.text(val, 40 + i * colWidth, yPos, { width: colWidth - 5 });
                });
                yPos += 20;

                // Check if need new page
                if (yPos > doc.page.height - 60) {
                    doc.addPage();
                    yPos = 50;
                }
            });

            doc.end();
        } catch (err) {
            console.error('PDF export error:', err);
            reject(err);
        }
    });
}

module.exports = {
    exportToCSV,
    exportToPDF,
};

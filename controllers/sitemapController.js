const Business = require('../models/Business');

// Major Indian cities for sitemap (top 50 cities for Pan-India coverage)
const MAJOR_CITIES = [
    'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad',
    'Surat', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal',
    'Visakhapatnam', 'Pimpri-Chinchwad', 'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana',
    'Agra', 'Nashik', 'Faridabad', 'Meerut', 'Rajkot', 'Kalyan-Dombivali', 'Vasai-Virar',
    'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar', 'Navi Mumbai', 'Allahabad',
    'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur', 'Gwalior', 'Vijayawada', 'Jodhpur',
    'Madurai', 'Raipur', 'Kota', 'Chandigarh', 'Guwahati', 'Solapur', 'Hubli-Dharwad'
];

const CATEGORIES = ['Spa', 'Salon', 'Gym', 'Massage', 'Wellness'];

// Generate main sitemap index
const getSitemapIndex = async (req, res, next) => {
    try {
        const baseUrl = process.env.CLIENT_URL || 'https://spadvisor.com';
        const currentDate = new Date().toISOString();

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

        // Add location-based sitemap
        xml += `  <sitemap>\n`;
        xml += `    <loc>${baseUrl}/sitemap-locations.xml</loc>\n`;
        xml += `    <lastmod>${currentDate}</lastmod>\n`;
        xml += `  </sitemap>\n`;

        // Add businesses sitemap
        xml += `  <sitemap>\n`;
        xml += `    <loc>${baseUrl}/sitemap-businesses.xml</loc>\n`;
        xml += `    <lastmod>${currentDate}</lastmod>\n`;
        xml += `  </sitemap>\n`;

        // Add static pages sitemap
        xml += `  <sitemap>\n`;
        xml += `    <loc>${baseUrl}/sitemap-static.xml</loc>\n`;
        xml += `    <lastmod>${currentDate}</lastmod>\n`;
        xml += `  </sitemap>\n`;

        xml += '</sitemapindex>';

        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error) {
        next(error);
    }
};

// Generate location-based sitemap
const getLocationSitemap = async (req, res, next) => {
    try {
        const baseUrl = process.env.CLIENT_URL || 'https://spadvisor.com';

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

        // Add main search page
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/spa</loc>\n`;
        xml += `    <changefreq>daily</changefreq>\n`;
        xml += `    <priority>1.0</priority>\n`;
        xml += `  </url>\n`;

        // Add location-specific pages for each major city
        MAJOR_CITIES.forEach(city => {
            xml += `  <url>\n`;
            xml += `    <loc>${baseUrl}/spa/${encodeURIComponent(city)}</loc>\n`;
            xml += `    <changefreq>weekly</changefreq>\n`;
            xml += `    <priority>0.9</priority>\n`;
            xml += `  </url>\n`;

            // Add category-specific pages for each city
            CATEGORIES.forEach(category => {
                xml += `  <url>\n`;
                xml += `    <loc>${baseUrl}/spa/${encodeURIComponent(city)}/${encodeURIComponent(category)}</loc>\n`;
                xml += `    <changefreq>weekly</changefreq>\n`;
                xml += `    <priority>0.8</priority>\n`;
                xml += `  </url>\n`;
            });
        });

        xml += '</urlset>';

        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error) {
        next(error);
    }
};

// Generate businesses sitemap
const getBusinessesSitemap = async (req, res, next) => {
    try {
        const baseUrl = process.env.CLIENT_URL || 'https://spadvisor.com';

        // Fetch all active businesses with businessLink
        const businesses = await Business.find({
            isActive: true,
            businessLink: { $exists: true, $ne: '' }
        })
            .select('businessLink updatedAt')
            .lean()
            .limit(5000); // Limit to 5000 for performance

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

        businesses.forEach(business => {
            const lastmod = business.updatedAt ? new Date(business.updatedAt).toISOString() : new Date().toISOString();

            xml += `  <url>\n`;
            xml += `    <loc>${baseUrl}/${business.businessLink}</loc>\n`;
            xml += `    <lastmod>${lastmod}</lastmod>\n`;
            xml += `    <changefreq>monthly</changefreq>\n`;
            xml += `    <priority>0.7</priority>\n`;
            xml += `  </url>\n`;
        });

        xml += '</urlset>';

        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error) {
        next(error);
    }
};

// Generate static pages sitemap
const getStaticSitemap = async (req, res, next) => {
    try {
        const baseUrl = process.env.CLIENT_URL || 'https://spadvisor.com';

        const staticPages = [
            { url: '/', priority: '1.0', changefreq: 'daily' },
            { url: '/about', priority: '0.5', changefreq: 'monthly' },
            { url: '/contact', priority: '0.5', changefreq: 'monthly' },
            { url: '/terms', priority: '0.3', changefreq: 'yearly' },
            { url: '/privacy', priority: '0.3', changefreq: 'yearly' }
        ];

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

        staticPages.forEach(page => {
            xml += `  <url>\n`;
            xml += `    <loc>${baseUrl}${page.url}</loc>\n`;
            xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
            xml += `    <priority>${page.priority}</priority>\n`;
            xml += `  </url>\n`;
        });

        xml += '</urlset>';

        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSitemapIndex,
    getLocationSitemap,
    getBusinessesSitemap,
    getStaticSitemap
};

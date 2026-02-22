const express = require('express');
const router = express.Router();
const Business = require('../models/Business');

// ================== Generate robots.txt ==================
router.get('/robots.txt', (req, res) => {
    try {
        const baseUrl = process.env.BASE_URL || 'https://spaadvisor.in';

        const robotsTxt = `# robots.txt for SpaAdvisor CRM
# Generated: ${new Date().toISOString()}
# Purpose: Guide search engine crawlers and prevent indexing of legacy URLs

User-agent: *

# Allow all current pages
Allow: /
Allow: /search$
Allow: /business/
Allow: /login$
Allow: /register$
Allow: /business-register$

# Disallow old URL patterns (these are now redirected via 301)
Disallow: /search/result
Disallow: /search/search/
Disallow: /spa/
Disallow: /job-details
Disallow: /apply
Disallow: /facebook
Disallow: /instagram
Disallow: /twitter
Disallow: /free-listing

# Disallow API endpoints and admin areas
Disallow: /api/
Disallow: /admin/
Disallow: /dashboard/

# Disallow search with legacy parameters
Disallow: /*?area=detectedCity
Disallow: /*?legacyId=

# Disallow duplicate content
Disallow: /*?*&*  # URLs with multiple query parameters (except search)
Allow: /search?q=

# Crawl delay to be respectful to server resources
Crawl-delay: 1

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml

# Google-specific settings (optional)
User-agent: Googlebot
Allow: /

# Bing-specific settings (optional)
User-agent: Bingbot
Crawl-delay: 2
`;

        res.type('text/plain');
        res.send(robotsTxt);
    } catch (error) {
        console.error('[ROBOTS.TXT ERROR]:', error);
        res.status(500).send('Error generating robots.txt');
    }
});

// ================== Generate Sitemap ==================
router.get('/sitemap.xml', async (req, res) => {
    try {
        const baseUrl = process.env.BASE_URL || 'https://spaadvisor.in';
        const currentDate = new Date().toISOString().split('T')[0];

        // 1. Fetch all public active businesses
        const businesses = await Business.find({
            isActive: true,
            'settings.appointmentSettings.allowOnlineBooking': true
        })
            .select('businessLink updatedAt')
            .lean();

        // 2. Define static routes with priorities
        const staticRoutes = [
            { path: '', priority: '1.0', changefreq: 'daily' },
            { path: '/search', priority: '0.9', changefreq: 'daily' },
            { path: '/login', priority: '0.5', changefreq: 'monthly' },
            { path: '/register', priority: '0.6', changefreq: 'monthly' },
            { path: '/business-register', priority: '0.7', changefreq: 'monthly' },
        ];

        // 3. Popular search queries for better SEO coverage
        const popularSearches = [
            'Best spa in Mumbai',
            'Best spa in Delhi',
            'Best spa in Bangalore',
            'Best spa in Pune',
            'Best spa in Navi Mumbai',
            'Best spa in Goa',
            'Best spa in Hyderabad',
            'Best spa in Chennai',
            'Best spa in Kolkata',
            'Best spa in Ahmedabad',
            'Spa near me',
            'Couple spa',
            'Thai massage spa',
            'Deep tissue massage',
            'Swedish massage spa',
        ];

        // 4. Build XML content
        let xml = '<?xml version="1.0" encoding="UTF-8"?>';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
        xml += `\n<!-- Generated: ${new Date().toISOString()} -->`;
        xml += `\n<!-- Total URLs: ${staticRoutes.length + businesses.length + popularSearches.length} -->`;

        // Add static routes
        xml += '\n\n<!-- Static Pages -->';
        staticRoutes.forEach(route => {
            xml += `
            <url>
                <loc>${baseUrl}${route.path}</loc>
                <lastmod>${currentDate}</lastmod>
                <changefreq>${route.changefreq}</changefreq>
                <priority>${route.priority}</priority>
            </url>`;
        });

        // Add dynamic business routes
        if (businesses.length > 0) {
            xml += '\n\n<!-- Business Listings -->';
            businesses.forEach(business => {
                const lastMod = business.updatedAt
                    ? new Date(business.updatedAt).toISOString().split('T')[0]
                    : currentDate;

                xml += `
            <url>
                <loc>${baseUrl}/business/${business.businessLink}</loc>
                <lastmod>${lastMod}</lastmod>
                <changefreq>weekly</changefreq>
                <priority>0.9</priority>
            </url>`;
            });
        }

        // Add popular search pages for better SEO
        xml += '\n\n<!-- Popular Search Queries -->';
        popularSearches.forEach(query => {
            const encodedQuery = encodeURIComponent(query);
            xml += `
            <url>
                <loc>${baseUrl}/search?q=${encodedQuery}</loc>
                <lastmod>${currentDate}</lastmod>
                <changefreq>weekly</changefreq>
                <priority>0.8</priority>
            </url>`;
        });

        xml += '\n</urlset>';

        // 5. Send response with proper headers
        res.header('Content-Type', 'application/xml');
        res.header('X-Robots-Tag', 'noindex'); // Prevent indexing of sitemap itself
        res.send(xml);

        // Log sitemap generation for monitoring
        console.log(`[SITEMAP GENERATED] ${businesses.length} businesses, ${popularSearches.length} search queries`);

    } catch (error) {
        console.error('[SITEMAP ERROR]:', error);
        res.status(500).send('Error generating sitemap');
    }
});

module.exports = router;


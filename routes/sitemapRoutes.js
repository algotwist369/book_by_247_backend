const express = require('express');
const router = express.Router();
const {
    getSitemapIndex,
    getLocationSitemap,
    getBusinessesSitemap,
    getStaticSitemap
} = require('../controllers/sitemapController');

// Main sitemap index
router.get('/sitemap.xml', getSitemapIndex);

// Individual sitemaps
router.get('/sitemap-locations.xml', getLocationSitemap);
router.get('/sitemap-businesses.xml', getBusinessesSitemap);
router.get('/sitemap-static.xml', getStaticSitemap);

module.exports = router;

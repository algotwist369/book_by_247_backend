const axios = require('axios');

/**
 * Google Places API Service
 * Provides autocomplete, place details, and geocoding functionality
 * with built-in error handling and fallback mechanisms
 */
class GooglePlacesService {
    constructor() {
        this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
        this.enabled = process.env.GOOGLE_PLACES_ENABLED === 'true';
        this.baseURL = 'https://maps.googleapis.com/maps/api/place';
        this.geocodingURL = 'https://maps.googleapis.com/maps/api/geocode';

        // Cache for reducing API calls
        this.cache = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
    }

    /**
     * Check if Google Places API is enabled and configured
     */
    isEnabled() {
        if (!this.enabled) {
            console.log('[Google Places] Service is disabled');
            return false;
        }
        if (!this.apiKey || this.apiKey === 'your_google_places_api_key_here') {
            console.log('[Google Places] API key not configured');
            return false;
        }
        return true;
    }

    /**
     * Get cached result if available and not expired
     */
    getCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            console.log(`[Google Places] Cache hit for: ${key}`);
            return cached.data;
        }
        this.cache.delete(key);
        return null;
    }

    /**
     * Set cache with timestamp
     */
    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Autocomplete suggestions for location/place search
     * @param {string} input - User input text
     * @param {object} options - Additional options (location bias, types, etc.)
     * @returns {Promise<Array>} Array of suggestions with place_id and description
     */
    async autocomplete(input, options = {}) {
        try {
            if (!this.isEnabled()) {
                return { success: false, error: 'Service not enabled', suggestions: [] };
            }

            if (!input || input.trim().length < 2) {
                return { success: true, suggestions: [] };
            }

            // Check cache
            const cacheKey = `autocomplete:${input}:${JSON.stringify(options)}`;
            const cached = this.getCache(cacheKey);
            if (cached) {
                return { success: true, suggestions: cached };
            }

            const params = {
                input: input.trim(),
                key: this.apiKey,
                ...options
            };

            // Default to India if no location bias
            if (!params.location && !params.components) {
                params.components = 'country:in';
            }

            const response = await axios.get(`${this.baseURL}/autocomplete/json`, {
                params,
                timeout: 5000 // 5 second timeout
            });

            if (response.data.status === 'OK') {
                const suggestions = response.data.predictions.map(prediction => ({
                    place_id: prediction.place_id,
                    description: prediction.description,
                    main_text: prediction.structured_formatting?.main_text || prediction.description,
                    secondary_text: prediction.structured_formatting?.secondary_text || '',
                    types: prediction.types || []
                }));

                // Cache results
                this.setCache(cacheKey, suggestions);

                return { success: true, suggestions };
            } else if (response.data.status === 'ZERO_RESULTS') {
                return { success: true, suggestions: [] };
            } else {
                console.error('[Google Places] Autocomplete error:', response.data.status);
                return { success: false, error: response.data.status, suggestions: [] };
            }
        } catch (error) {
            console.error('[Google Places] Autocomplete exception:', error.message);
            return { success: false, error: error.message, suggestions: [] };
        }
    }

    /**
     * Get detailed information about a place by place_id
     * @param {string} placeId - Google Place ID
     * @returns {Promise<Object>} Place details including coordinates, address, etc.
     */
    async getPlaceDetails(placeId) {
        try {
            if (!this.isEnabled()) {
                return { success: false, error: 'Service not enabled' };
            }

            // Check cache
            const cacheKey = `place:${placeId}`;
            const cached = this.getCache(cacheKey);
            if (cached) {
                return { success: true, place: cached };
            }

            const params = {
                place_id: placeId,
                key: this.apiKey,
                fields: 'name,formatted_address,geometry,address_components,types,place_id'
            };

            const response = await axios.get(`${this.baseURL}/details/json`, {
                params,
                timeout: 5000
            });

            if (response.data.status === 'OK') {
                const place = response.data.result;

                // Extract useful information
                const placeInfo = {
                    place_id: place.place_id,
                    name: place.name,
                    formatted_address: place.formatted_address,
                    lat: place.geometry?.location?.lat,
                    lng: place.geometry?.location?.lng,
                    types: place.types || [],
                    // Extract city, state, country from address_components
                    address_components: this.parseAddressComponents(place.address_components || [])
                };

                // Cache results
                this.setCache(cacheKey, placeInfo);

                return { success: true, place: placeInfo };
            } else {
                console.error('[Google Places] Place details error:', response.data.status);
                return { success: false, error: response.data.status };
            }
        } catch (error) {
            console.error('[Google Places] Place details exception:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Parse address components to extract city, state, country
     */
    parseAddressComponents(components) {
        const result = {
            city: '',
            state: '',
            country: '',
            postal_code: ''
        };

        components.forEach(component => {
            if (component.types.includes('locality')) {
                result.city = component.long_name;
            } else if (component.types.includes('administrative_area_level_1')) {
                result.state = component.long_name;
            } else if (component.types.includes('country')) {
                result.country = component.long_name;
            } else if (component.types.includes('postal_code')) {
                result.postal_code = component.long_name;
            }
        });

        return result;
    }

    /**
     * Geocode an address to get coordinates
     * @param {string} address - Address string
     * @returns {Promise<Object>} Coordinates and formatted address
     */
    async geocode(address) {
        try {
            if (!this.isEnabled()) {
                return { success: false, error: 'Service not enabled' };
            }

            // Check cache
            const cacheKey = `geocode:${address}`;
            const cached = this.getCache(cacheKey);
            if (cached) {
                return { success: true, result: cached };
            }

            const params = {
                address: address.trim(),
                key: this.apiKey,
                components: 'country:IN' // Bias to India
            };

            const response = await axios.get(`${this.geocodingURL}/json`, {
                params,
                timeout: 5000
            });

            if (response.data.status === 'OK' && response.data.results.length > 0) {
                const result = response.data.results[0];
                const geocodeResult = {
                    formatted_address: result.formatted_address,
                    lat: result.geometry.location.lat,
                    lng: result.geometry.location.lng,
                    address_components: this.parseAddressComponents(result.address_components || [])
                };

                // Cache results
                this.setCache(cacheKey, geocodeResult);

                return { success: true, result: geocodeResult };
            } else if (response.data.status === 'ZERO_RESULTS') {
                return { success: true, result: null };
            } else {
                console.error('[Google Places] Geocode error:', response.data.status);
                return { success: false, error: response.data.status };
            }
        } catch (error) {
            console.error('[Google Places] Geocode exception:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Nearby search for businesses
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {string} keyword - Search keyword (e.g., "spa", "massage")
     * @param {number} radius - Search radius in meters
     * @returns {Promise<Array>} Array of nearby places
     */
    async nearbySearch(lat, lng, keyword, radius = 5000) {
        try {
            if (!this.isEnabled()) {
                return { success: false, error: 'Service not enabled', places: [] };
            }

            // Check cache
            const cacheKey = `nearby:${lat}:${lng}:${keyword}:${radius}`;
            const cached = this.getCache(cacheKey);
            if (cached) {
                return { success: true, places: cached };
            }

            const params = {
                location: `${lat},${lng}`,
                radius,
                keyword,
                key: this.apiKey
            };

            const response = await axios.get(`${this.baseURL}/nearbysearch/json`, {
                params,
                timeout: 10000 // 10 seconds for nearby search
            });

            if (response.data.status === 'OK') {
                const places = response.data.results.map(place => ({
                    place_id: place.place_id,
                    name: place.name,
                    vicinity: place.vicinity,
                    lat: place.geometry?.location?.lat,
                    lng: place.geometry?.location?.lng,
                    rating: place.rating,
                    user_ratings_total: place.user_ratings_total,
                    types: place.types || [],
                    business_status: place.business_status
                }));

                // Cache results
                this.setCache(cacheKey, places);

                return { success: true, places };
            } else if (response.data.status === 'ZERO_RESULTS') {
                return { success: true, places: [] };
            } else {
                console.error('[Google Places] Nearby search error:', response.data.status);
                return { success: false, error: response.data.status, places: [] };
            }
        } catch (error) {
            console.error('[Google Places] Nearby search exception:', error.message);
            return { success: false, error: error.message, places: [] };
        }
    }

    /**
     * Clear cache (useful for testing or periodic cleanup)
     */
    clearCache() {
        this.cache.clear();
        console.log('[Google Places] Cache cleared');
    }
}

module.exports = new GooglePlacesService();

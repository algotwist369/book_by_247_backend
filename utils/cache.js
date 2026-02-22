const NodeCache = require("node-cache");
const { cacheManager } = require("../config/redis");

// Create in-memory cache instance as fallback
const memoryCache = new NodeCache({
    stdTTL: 300, // 5 minutes default TTL
    checkperiod: 60, // Check for expired keys every 60 seconds
    useClones: false, // Don't clone objects for better performance
    maxKeys: 1000, // Maximum number of keys
    deleteOnExpire: true, // Automatically delete expired keys
});

// Cache utility functions with Redis fallback
const setCache = async (key, value, ttl = 300) => {
    try {
        // Try Redis first
        const redisResult = await cacheManager.set(key, value, ttl);
        if (redisResult) {
            return true;
        }

        // Fallback to memory cache
        return memoryCache.set(key, value, ttl);
    } catch (error) {
        // Don't log Redis connection errors as they're expected when Redis is not available
        if (!error.message.includes('Stream isn\'t writeable') &&
            !error.message.includes('ECONNREFUSED') &&
            !error.message.includes('enableOfflineQueue')) {
            console.error("Cache set error:", error);
        }
        // Fallback to memory cache
        return memoryCache.set(key, value, ttl);
    }
};

const getCache = async (key) => {
    try {
        // Try Redis first
        const redisValue = await cacheManager.get(key);
        if (redisValue !== null) {
            return redisValue;
        }

        // Fallback to memory cache
        return memoryCache.get(key);
    } catch (error) {
        // Don't log Redis connection errors as they're expected when Redis is not available
        if (!error.message.includes('Stream isn\'t writeable') &&
            !error.message.includes('ECONNREFUSED') &&
            !error.message.includes('enableOfflineQueue')) {
            console.error("Cache get error:", error);
        }
        // Fallback to memory cache
        return memoryCache.get(key);
    }
};

const deleteCache = async (key) => {
    try {
        // Check if key contains wildcard
        const hasWildcard = key.includes('*');

        if (hasWildcard) {
            // Use delPattern for wildcard keys
            const redisResult = await cacheManager.delPattern(key);

            // For memory cache, we need to manually find and delete matching keys
            if (memoryCache.keys) {
                const pattern = new RegExp('^' + key.replace(/\*/g, '.*') + '$');
                const keys = memoryCache.keys();
                keys.forEach(k => {
                    if (pattern.test(k)) {
                        memoryCache.del(k);
                    }
                });
            }

            return redisResult;
        } else {
            // Try Redis first
            const redisResult = await cacheManager.del(key);

            // Also delete from memory cache
            memoryCache.del(key);

            return redisResult;
        }
    } catch (error) {
        // Don't log Redis connection errors as they're expected when Redis is not available
        if (!error.message.includes('Stream isn\'t writeable') &&
            !error.message.includes('ECONNREFUSED') &&
            !error.message.includes('enableOfflineQueue')) {
            console.error("Cache delete error:", error);
        }
        // Fallback to memory cache
        return memoryCache.del(key);
    }
};

const clearCache = async () => {
    try {
        // Clear Redis cache
        await cacheManager.delPattern('*');

        // Clear memory cache
        memoryCache.flushAll();

        return true;
    } catch (error) {
        console.error("Cache clear error:", error);
        // Fallback to memory cache
        memoryCache.flushAll();
        return false;
    }
};

const getCacheStats = async () => {
    try {
        const redisStats = await cacheManager.getStats();
        const memoryStats = memoryCache.getStats();

        return {
            redis: redisStats,
            memory: memoryStats,
            active: redisStats.connected ? 'redis' : 'memory'
        };
    } catch (error) {
        console.error("Cache stats error:", error);
        return {
            redis: { connected: false },
            memory: memoryCache.getStats(),
            active: 'memory'
        };
    }
};

// Advanced caching patterns
const getOrSet = async (key, fetchFunction, ttl = 300) => {
    try {
        // Try Redis first
        const value = await cacheManager.getOrSet(key, fetchFunction, ttl);
        if (value !== null) {
            return value;
        }

        // Fallback to memory cache
        let cachedValue = memoryCache.get(key);
        if (cachedValue === undefined) {
            cachedValue = await fetchFunction();
            if (cachedValue !== null && cachedValue !== undefined) {
                memoryCache.set(key, cachedValue, ttl);
            }
        }

        return cachedValue;
    } catch (error) {
        console.error("Cache getOrSet error:", error);
        // Direct fetch as last resort
        return await fetchFunction();
    }
};

// Batch operations
const mget = async (keys) => {
    try {
        // Try Redis first
        const redisValues = await cacheManager.mget(keys);
        if (redisValues.some(v => v !== null)) {
            return redisValues;
        }

        // Fallback to memory cache
        return keys.map(key => memoryCache.get(key));
    } catch (error) {
        console.error("Cache mget error:", error);
        // Fallback to memory cache
        return keys.map(key => memoryCache.get(key));
    }
};

const mset = async (keyValuePairs, ttl = 300) => {
    try {
        // Try Redis first
        const redisResult = await cacheManager.mset(keyValuePairs, ttl);
        if (redisResult) {
            return true;
        }

        // Fallback to memory cache
        keyValuePairs.forEach(([key, value]) => {
            memoryCache.set(key, value, ttl);
        });

        return true;
    } catch (error) {
        console.error("Cache mset error:", error);
        // Fallback to memory cache
        keyValuePairs.forEach(([key, value]) => {
            memoryCache.set(key, value, ttl);
        });
        return false;
    }
};

// Cache warming utility
const warmCache = async (key, fetchFunction, ttl = 300) => {
    try {
        const value = await fetchFunction();
        if (value !== null && value !== undefined) {
            await setCache(key, value, ttl);
        }
        return value;
    } catch (error) {
        console.error("Cache warming error:", error);
        return null;
    }
};

module.exports = {
    setCache,
    getCache,
    deleteCache,
    clearCache,
    getCacheStats,
    getOrSet,
    mget,
    mset,
    warmCache,
};
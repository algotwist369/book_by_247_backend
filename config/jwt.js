

module.exports = {
    jwt: {
        secret: process.env.JWT_SECRET || "supersecretkey",
        expiresIn: process.env.JWT_EXPIRES_IN || "1h", // Access token expiry
    },
    refresh: {
        secret: process.env.REFRESH_SECRET || "refreshsecretkey",
        expiresIn: process.env.REFRESH_EXPIRES_IN || "7d", // Refresh token expiry
    },
};

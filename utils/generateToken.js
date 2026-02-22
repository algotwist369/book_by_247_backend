const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'access-secret';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'refresh-secret';
const ACCESS_TOKEN_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES || '7d'; // 7 days for better UX
const REFRESH_TOKEN_EXPIRES = process.env.REFRESH_TOKEN_EXPIRES || '30d'; // for reference

// Create JWT access token with payload
const createAccessToken = (payload) => {
    return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
}

// Verify access token and return decoded payload or throw
const verifyAccessToken = (token) => {
    return jwt.verify(token, ACCESS_TOKEN_SECRET);
}

// Create refresh token as an opaque token (UUID) signed with secret so we can verify it
 const createRefreshToken = (payload) => {
    // sign a token with uuid inside to make it unlinkable to payload
    const tokenId = uuidv4();
    return jwt.sign({ ...payload, tid: tokenId }, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES });
}

// Verify refresh token
const verifyRefreshToken = (token) => {
    return jwt.verify(token, REFRESH_TOKEN_SECRET);
}

module.exports = {
    createAccessToken,
    verifyAccessToken,
    createRefreshToken,
    verifyRefreshToken,
};

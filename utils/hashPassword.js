const bcrypt = require('bcrypt');
require('dotenv').config();

// Reduced from 10 to 8 for better performance (still secure)
// Each increment doubles the time - 8 is ~150ms, 10 is ~600ms, 12 is ~2.4s
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 8;


const hashPassword = async (password) => {
    if (!password) throw new Error('Missing password for hashing');
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    return bcrypt.hash(password, salt);
}

const comparePassword = async (password, hash) => {
    if (!password || !hash) return false;
    return bcrypt.compare(password, hash);
}

module.exports = {
    hashPassword,
    comparePassword,
};

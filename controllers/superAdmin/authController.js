const SuperAdmin = require("../../models/SuperAdmin");
const { hashPassword, comparePassword } = require("../../utils/hashPassword");
const { createAccessToken, createRefreshToken, verifyRefreshToken } = require("../../utils/generateToken");

// Super Admin Login
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required" });
        }

        const superAdmin = await SuperAdmin.findOne({ email });
        if (!superAdmin) {
            return res.status(404).json({ success: false, message: "Super Admin not found" });
        }

        const isMatch = await comparePassword(password, superAdmin.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        const payload = {
            id: superAdmin._id,
            role: "super-admin",
            name: superAdmin.user_name
        };

        const accessToken = createAccessToken(payload);
        const refreshToken = createRefreshToken(payload);

        return res.json({
            success: true,
            accessToken,
            refreshToken,
            user: {
                id: superAdmin._id,
                user_name: superAdmin.user_name,
                email: superAdmin.email,
                profile_pic: superAdmin.profile_pic
            }
        });
    } catch (err) {
        next(err);
    }
};

// Super Admin Register (First time setup)
const register = async (req, res, next) => {
    try {
        const { user_name, email, password, phone_number, profile_pic } = req.body;

        const existing = await SuperAdmin.findOne({ $or: [{ email }, { phone_number }] });
        if (existing) {
            return res.status(400).json({ success: false, message: "Email or phone number already exists" });
        }

        const hashedPassword = await hashPassword(password);

        const superAdmin = await SuperAdmin.create({
            user_name,
            email,
            password: hashedPassword,
            phone_number,
            profile_pic: profile_pic || ""
        });

        return res.status(201).json({
            success: true,
            message: "Super Admin registered successfully",
            data: {
                id: superAdmin._id,
                user_name: superAdmin.user_name,
                email: superAdmin.email
            }
        });
    } catch (err) {
        next(err);
    }
};

// Super Admin Logout
const logout = async (req, res, next) => {
    return res.json({ success: true, message: "Logged out successfully" });
};


// Get Super Admin Profile
const getProfile = async (req, res, next) => {
    try {
        const superAdmin = await SuperAdmin.findById(req.user.id).select("-password");
        if (!superAdmin) {
            return res.status(404).json({ success: false, message: "Super Admin not found" });
        }

        return res.json({
            success: true,
            data: superAdmin
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    login,
    register,
    logout,
    getProfile
};

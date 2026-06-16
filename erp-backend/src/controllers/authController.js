const User = require("../models/userModel");
const Role = require("../models/roleModel");
const { hashPassword, comparePassword } = require("../utils/hash");
const { generateToken } = require("../utils/jwt");

exports.register = async (req, res) => {
  try {
    const { username, fullName, email, password, roleName } = req.body;

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return res.status(400).json({ msg: "User with this email or username already exists" });
    }

    const role = await Role.findOne({ name: roleName || "sales" });
    if (!role) return res.status(400).json({ msg: "Invalid role" });

    const hashed = await hashPassword(password);

    const user = await User.create({
      username,
      fullName,
      email,
      password: hashed,
      role: role._id
    });

    const populatedUser = await User.findById(user._id)
      .populate({ path: "role", populate: { path: "permissions" } });

    res.status(201).json({
      _id: populatedUser._id,
      username: populatedUser.username,
      fullName: populatedUser.fullName,
      email: populatedUser.email,
      role: populatedUser.role.name,
      permissions: populatedUser.role.permissions.map(p => p.name),
      status: populatedUser.status
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({
      $or: [{ username }, { email: username }]
    }).populate({ path: "role", populate: { path: "permissions" } });

    if (!user) return res.status(404).json({ msg: "User not found" });
    if (user.status === "inactive") return res.status(403).json({ msg: "Account is inactive" });

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) return res.status(401).json({ msg: "Invalid credentials" });

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user);

    res.json({
      token,
      user: {
        _id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role.name,
        permissions: user.role.permissions.map(p => p.name),
        status: user.status
      }
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({ path: "role", populate: { path: "permissions" } });

    if (!user) return res.status(404).json({ msg: "User not found" });

    res.json({
      _id: user._id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role.name,
      permissions: user.role.permissions.map(p => p.name),
      status: user.status
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
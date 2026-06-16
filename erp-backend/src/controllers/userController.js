const User = require("../models/userModel");
const Role = require("../models/roleModel");
const { hashPassword } = require("../utils/hash");

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .populate({ path: "role", populate: { path: "permissions" } })
      .select("-password");

    const formatted = users.map(u => ({
      _id: u._id,
      username: u.username,
      fullName: u.fullName,
      email: u.email,
      role: u.role?.name || "unknown",
      permissions: u.role?.permissions?.map(p => p.name) || [],
      status: u.status,
      lastLogin: u.lastLogin,
      createdAt: u.createdAt
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate({ path: "role", populate: { path: "permissions" } })
      .select("-password");

    if (!user) return res.status(404).json({ msg: "User not found" });

    res.json({
      _id: user._id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role?.name || "unknown",
      permissions: user.role?.permissions?.map(p => p.name) || [],
      status: user.status,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, fullName, email, password, roleName } = req.body;

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return res.status(400).json({ msg: "User already exists" });
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

    const populated = await User.findById(user._id)
      .populate({ path: "role", populate: { path: "permissions" } })
      .select("-password");

    res.status(201).json({
      _id: populated._id,
      username: populated.username,
      fullName: populated.fullName,
      email: populated.email,
      role: populated.role.name,
      status: populated.status
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { fullName, email, roleName, status } = req.body;
    const update = {};
    if (fullName) update.fullName = fullName;
    if (email) update.email = email;
    if (status) update.status = status;

    if (roleName) {
      const role = await Role.findOne({ name: roleName });
      if (role) update.role = role._id;
    }

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate({ path: "role", populate: { path: "permissions" } })
      .select("-password");

    if (!user) return res.status(404).json({ msg: "User not found" });

    res.json({
      _id: user._id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role.name,
      status: user.status
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json({ msg: "User deleted" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

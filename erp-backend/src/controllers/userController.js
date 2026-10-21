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
      companies: u.companies || [],
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
      companies: user.companies || [],
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
    const { username, fullName, email, password, roleName, companies } = req.body;

    if (companies !== undefined && req.user?.roleName !== "admin") {
      return res.status(403).json({ msg: "Only an admin can assign companies to users" });
    }

    // Only an admin may create another admin (prevents privilege escalation)
    if ((roleName || "sales") === "admin" && req.user?.roleName !== "admin") {
      return res.status(403).json({ msg: "Only an admin can create admin users" });
    }

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
      role: role._id,
      companies: Array.isArray(companies) ? companies : []
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
    const { fullName, email, roleName, status, companies, password } = req.body;

    if (companies !== undefined && req.user?.roleName !== "admin") {
      return res.status(403).json({ msg: "Only an admin can assign companies to users" });
    }
    // Non-admin managers may not modify admin accounts
    if (req.user?.roleName !== "admin") {
      const target = await User.findById(req.params.id).populate("role", "name").lean();
      if (target?.role?.name === "admin") return res.status(403).json({ msg: "Only an admin can modify an admin user" });
    }

    if (roleName === "admin" && req.user?.roleName !== "admin") {
      return res.status(403).json({ msg: "Only an admin can assign the admin role" });
    }
    const update = {};
    if (fullName) update.fullName = fullName;
    if (email) update.email = email;
    if (status) update.status = status;
    if (Array.isArray(companies)) update.companies = companies;
    if (password) {
      if (req.user?.roleName !== "admin") return res.status(403).json({ msg: "Only an admin can reset passwords" });
      if (String(password).length < 8) return res.status(400).json({ msg: "Password must be at least 8 characters" });
      update.password = await hashPassword(password);
    }

    if (roleName) {
      const role = await Role.findOne({ name: roleName });
      if (role) update.role = role._id;
    }

    const user = await User.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' })
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
    if (req.user?.roleName !== "admin") {
      const target = await User.findById(req.params.id).populate("role", "name").lean();
      if (target?.role?.name === "admin") return res.status(403).json({ msg: "Only an admin can delete an admin user" });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json({ msg: "User deleted" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

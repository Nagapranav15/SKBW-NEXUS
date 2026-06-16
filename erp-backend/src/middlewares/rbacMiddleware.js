const Role = require("../models/roleModel");

// IMPORTANT: register Permission model
require("../models/permissionModel");

module.exports = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const role = await Role.findById(req.user.role).populate("permissions");

      if (!role) return res.status(403).json({ msg: "Role not found" });

      // Store role name on request for controllers to use
      req.user.roleName = role.name;

      // Admin always has access
      if (role.name === "admin") return next();

      // Check permission
      if (requiredPermission) {
        const perms = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
        const hasPermission = role.permissions.some(p => perms.includes(p.name));

        if (!hasPermission) {
          return res.status(403).json({ msg: "Access denied" });
        }
      }

      next();
    } catch (err) {
      res.status(500).json({ msg: "RBAC check failed" });
    }
  };
};
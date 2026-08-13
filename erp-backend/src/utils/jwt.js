const jwt = require("jsonwebtoken");

exports.generateToken = (user) => {
  const secret = process.env.JWT_SECRET;
  const roleId = user.role ? (typeof user.role === 'object' ? user.role._id : user.role) : null;
  return jwt.sign(
    {
      id: user._id,
      role: roleId,
      username: user.username
    },
    secret,
    { expiresIn: "7d" }
  );
};
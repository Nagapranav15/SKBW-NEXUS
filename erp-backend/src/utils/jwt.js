const jwt = require("jsonwebtoken");

exports.generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role._id || user.role,
      username: user.username
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};
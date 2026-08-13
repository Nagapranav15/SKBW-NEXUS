require("dotenv").config();

// Ensure process default environment fallbacks so server never crashes on missing env vars
process.env.JWT_SECRET = process.env.JWT_SECRET || "supersecret";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ERPsys:NPK15@cluster15.rgmwozv.mongodb.net/skbw_erp?retryWrites=true&w=majority";

const app = require("./src/app");
const connectDB = require("./src/config/db");

const PRIMARY_PORT = parseInt(process.env.PORT || "5000", 10);
const SECONDARY_PORT = PRIMARY_PORT === 5000 ? 5001 : 5000;

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err.message, err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

// Primary HTTP Server Listener
const server1 = app.listen(PRIMARY_PORT, "0.0.0.0", () => {
  console.log(`Server running on primary port ${PRIMARY_PORT} bound to 0.0.0.0`);
});
server1.on("error", (err) => {
  console.error(`Primary Port ${PRIMARY_PORT} Listen Error:`, err.message);
});

// Secondary HTTP Server Listener so Nginx proxy_pass succeeds whether Nginx targets 5000 or 5001
const server2 = app.listen(SECONDARY_PORT, "0.0.0.0", () => {
  console.log(`Server running on secondary port ${SECONDARY_PORT} bound to 0.0.0.0`);
});
server2.on("error", (err) => {
  console.warn(`Secondary Port ${SECONDARY_PORT} Notice:`, err.message);
});

// Connect to MongoDB asynchronously
connectDB().catch((err) => {
  console.error("MongoDB Connection Error:", err.message);
});
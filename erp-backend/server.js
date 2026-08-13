require("dotenv").config();

// Ensure process default environment fallbacks so server never crashes on missing env vars
process.env.JWT_SECRET = process.env.JWT_SECRET || "supersecret";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ERPsys:NPK15@cluster15.rgmwozv.mongodb.net/skbw_erp?retryWrites=true&w=majority";

const app = require("./src/app");
const connectDB = require("./src/config/db");

const PORT = parseInt(process.env.PORT || "5000", 10);

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err.message, err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

// Listen immediately on 0.0.0.0 for Render / hosting port scanners
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT} bound to 0.0.0.0`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && PORT === 5000) {
    console.warn("Port 5000 in use, attempting fallback to port 5001...");
    app.listen(5001, "0.0.0.0", () => {
      console.log("Server running on fallback port 5001 bound to 0.0.0.0");
    });
  } else {
    console.error("Server Listen Error:", err.message);
  }
});

// Connect to MongoDB asynchronously
connectDB().catch((err) => {
  console.error("MongoDB Connection Error:", err.message);
});
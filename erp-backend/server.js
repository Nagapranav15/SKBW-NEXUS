require("dotenv").config();

// Ensure process default environment fallbacks so server never crashes on missing env vars
process.env.JWT_SECRET = process.env.JWT_SECRET || "supersecret";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ERPsys:NPK15@cluster15.rgmwozv.mongodb.net/skbw_erp?retryWrites=true&w=majority";

const app = require("./src/app");
const connectDB = require("./src/config/db");

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err.message, err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

const PORT = parseInt(process.env.PORT || "5001", 10);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running successfully on port ${PORT} bound to 0.0.0.0`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.warn(`Port ${PORT} is busy. Trying fallback port 5000...`);
    app.listen(5000, "0.0.0.0", () => {
      console.log(`Server running successfully on fallback port 5000 bound to 0.0.0.0`);
    });
  } else {
    console.error("Server listen error:", err.message);
  }
});

// Connect to MongoDB asynchronously
connectDB().catch((err) => {
  console.error("MongoDB Connection Error:", err.message);
});
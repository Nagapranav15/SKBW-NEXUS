require("dotenv").config();
const dns = require("dns");

// Enforce IPv4-first resolution for Node.js process to prevent ENOTFOUND on MongoDB Atlas shards
try {
  dns.setDefaultResultOrder("ipv4first");
} catch (_) {}

try {
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch (_) {}

// Required configuration: fail fast instead of falling back to a built-in secret or database
const requireEnv = () => {
  const problems = [];
  if (!process.env.MONGO_URI) problems.push("MONGO_URI is not set");
  const jwtSecret = process.env.JWT_SECRET || "";
  if (jwtSecret.length < 32 || jwtSecret === "supersecret") problems.push("JWT_SECRET must be set to a random value of at least 32 characters");
  if (problems.length > 0) {
    console.error("Cannot start. Fix the environment configuration (see .env.example):\n - " + problems.join("\n - "));
    process.exit(1);
  }
};
requireEnv();

// Company isolation plugin must be registered before any model is compiled
require("./src/core/companyScope").registerPlugin();

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
    console.warn(`Port ${PORT} is busy. Retrying in 1s...`);
    setTimeout(() => {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running successfully on port ${PORT} bound to 0.0.0.0`);
      });
    }, 1000);
  } else {
    console.error("Server listen error:", err.message);
  }
});

// Graceful shutdown for watch mode and container environments
const shutdown = () => {
  try {
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => {
      process.exit(0);
    }, 500).unref();
  } catch (_) {
    process.exit(0);
  }
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Connect to MongoDB asynchronously and repair any inflated sequence counters
connectDB().then(() => {
  const { repairAllSequences } = require("./src/utils/sequenceManager");
  repairAllSequences().catch(e => console.error("Sequence repair error:", e));
}).catch((err) => {
  console.error("MongoDB Connection Error:", err.message);
});
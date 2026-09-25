const mongoose = require("mongoose");
const dns = require("dns");

// Enforce IPv4-first resolution (critical on macOS / Node 17+ to prevent ENOTFOUND on Atlas shard subdomains)
try {
  dns.setDefaultResultOrder("ipv4first");
} catch (_) {}

// Use reliable Google & Cloudflare DNS servers for Atlas SRV/shard name resolution
try {
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch (_) {}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      family: 4,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error("MongoDB Connection Error:", err.message);
  }
};

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected. Driver will attempt to reconnect automatically.");
});

mongoose.connection.on("reconnected", () => {
  console.log("MongoDB connection re-established");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection event error:", err.message);
});

module.exports = connectDB;


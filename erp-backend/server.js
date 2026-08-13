require("dotenv").config();

// Fail loudly on missing config. Without this, a wiped .env boots a process that
// looks healthy to pm2 but binds the wrong port and has no database, which
// reaches the browser as a "missing Access-Control-Allow-Origin" CORS error.
const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`FATAL: missing required env vars: ${missing.join(", ")}. Check erp-backend/.env`);
  process.exit(1);
}
if (!process.env.PORT) {
  console.warn("WARNING: PORT is not set, defaulting to 5000. This must match nginx proxy_pass.");
}

const app = require("./src/app");
const connectDB = require("./src/config/db");

// When PORT is set (production/pm2), bind it strictly — silently drifting to
// another port leaves nginx proxying a dead port.
const PORT = process.env.PORT || 5000;
const STRICT_PORT = Boolean(process.env.PORT);

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err.message, err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

function startServer(portToUse) {
  const server = app.listen(portToUse, "0.0.0.0", () => {
    console.log(`Server running on port ${portToUse} bound to 0.0.0.0`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && portToUse === 5000 && !STRICT_PORT) {
      console.warn("Port 5000 in use, attempting fallback to port 5001...");
      startServer(5001);
    } else {
      console.error("Server Listen Error:", err.message);
      // Exit non-zero so pm2 restarts instead of leaving a half-dead process.
      process.exit(1);
    }
  });
}

startServer(PORT);

// Connect to MongoDB asynchronously
connectDB()
  .then(() => {
    console.log("MongoDB Connected successfully");
  })
  .catch((err) => {
    console.error("MongoDB Connection Error:", err.message);
  });
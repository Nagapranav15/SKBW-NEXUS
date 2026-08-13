require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/config/db");

const PORT = process.env.PORT || 5000;

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
    if (err.code === "EADDRINUSE" && portToUse === 5000) {
      console.warn("Port 5000 in use, attempting fallback to port 5001...");
      startServer(5001);
    } else {
      console.error("Server Listen Error:", err.message);
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
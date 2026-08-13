require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/config/db");

const PORT = process.env.PORT || 5000;

// Listen immediately on 0.0.0.0 for Render / hosting port scanners
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT} bound to 0.0.0.0`);
});

// Connect to MongoDB asynchronously
connectDB()
  .then(() => {
    console.log("MongoDB Connected successfully");
  })
  .catch((err) => {
    console.error("MongoDB Connection Error:", err.message);
  });
const mongoose = require("mongoose");

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  logo: {
    type: String,
    default: ""
  },
  address: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  gst: {
    type: String,
    required: true
  }
}, { timestamps: true });

// Company queries are restricted by _id (see core/companyScope.js)
companySchema.set("scopeById", true);

module.exports = mongoose.model("Company", companySchema);

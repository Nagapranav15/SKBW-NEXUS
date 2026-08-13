const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true
  },
  entityType: {
    type: String,
    required: true
  },
  entityName: {
    type: String,
    required: true
  },
  details: {
    type: String,
    default: ""
  },
  performedBy: {
    type: String,
    default: "System"
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company"
  }
}, { timestamps: true });

module.exports = mongoose.model("ActivityLog", activityLogSchema);


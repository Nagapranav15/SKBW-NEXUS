const mongoose = require("mongoose");

const metadataSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  units: { type: [String], default: ["kg", "pcs", "Sheets", "Reels", "mtr"] },
  categories: { type: [String], default: ["Raw Material", "Semi Finished", "Finished Goods"] },
  ruleTypes: { type: [String], default: ["Plain", "Single Line", "Double Line", "Square Ruled", "Four Line", "Unruled"] }
}, { timestamps: true });

module.exports = mongoose.model("Metadata", metadataSchema);

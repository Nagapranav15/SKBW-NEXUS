const mongoose = require("mongoose");

const metadataSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  units: { type: [String], default: ["kg", "pcs", "Sheets", "Reels", "mtr"] },
  categories: { type: [String], default: ["Raw Material", "Semi Finished", "Finished Goods"] },
  ruleTypes: { type: [String], default: ["Plain", "Single Line", "Double Line", "Square Ruled", "Four Line", "Unruled"] },
  groups: { type: [String], default: ["132P Happy days (UR)", "220P Happy days (SR)"] },
  brands: { type: [String], default: ["Happy Days", "Classmate", "Navneet"] },
  categoryFields: {
    type: Map,
    of: [String],
    default: {
      "Raw Material": ["gsm", "brand", "title", "dimensions", "paperType"],
      "Semi Finished": ["gsm", "brand", "dimensions", "ruleType", "altUnit", "group"],
      "Finished Goods": ["gsm", "brand", "dimensions", "ruleType", "pages", "booksGbl", "altUnit", "group"]
    }
  }
}, { timestamps: true });

module.exports = mongoose.model("Metadata", metadataSchema);

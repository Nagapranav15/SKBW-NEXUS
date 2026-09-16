const mongoose = require("mongoose");

const metadataSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  units: { type: [String], default: [] },
  categories: { type: [String], default: ["products", "materials", "semi"] },
  ruleTypes: { type: [String], default: [] },
  groups: { type: [String], default: [] },
  brands: { type: [String], default: [] },
  categoryCards: { type: Array, default: [] },
  standardizedSheets: { type: Array, default: [] },
  categoryFields: {
    type: Map,
    of: [String],
    default: {
      "Raw Material": ["gsm", "brand", "title", "dimensions", "paperType"],
      "Semi Finished": ["gsm", "brand", "dimensions", "ruleType", "altUnit", "group"],
      "Finished Goods": ["gsm", "brand", "dimensions", "ruleType", "pages", "altUnit"]
    }
  }
}, { timestamps: true });

module.exports = mongoose.model("Metadata", metadataSchema);

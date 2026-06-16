const mongoose = require("mongoose");

const zoneSchema = new mongoose.Schema({
  zone_code: { type: String, required: true },
  name: { type: String, default: "" },
  description: { type: String, default: "" },
  floor_id: { type: mongoose.Schema.Types.ObjectId, ref: "Floor", required: true },
  factory_id: { type: mongoose.Schema.Types.ObjectId, ref: "Factory", required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true }
}, { timestamps: true });

zoneSchema.index({ zone_code: 1, company: 1 }, { unique: true });
zoneSchema.index({ floor_id: 1 });
zoneSchema.index({ factory_id: 1 });

module.exports = mongoose.model("Zone", zoneSchema);

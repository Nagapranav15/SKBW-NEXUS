const mongoose = require("mongoose");

const floorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  factory_id: { type: mongoose.Schema.Types.ObjectId, ref: "Factory", required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true }
}, { timestamps: true });

floorSchema.index({ factory_id: 1, name: 1, company: 1 }, { unique: true });

module.exports = mongoose.model("Floor", floorSchema);

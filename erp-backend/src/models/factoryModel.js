const mongoose = require("mongoose");

const factorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  address: { type: String, default: "" },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true }
}, { timestamps: true });

factorySchema.index({ company: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Factory", factorySchema);

const mongoose = require("mongoose");

const sequenceSchema = new mongoose.Schema({
  prefix: { type: String, required: true, unique: true },
  sequence: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("Sequence", sequenceSchema);

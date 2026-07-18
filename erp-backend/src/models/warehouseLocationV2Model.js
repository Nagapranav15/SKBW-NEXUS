const mongoose = require("mongoose");

const warehouseLocationV2Schema = new mongoose.Schema({
  name: { type: String, required: true },
  level: { 
    type: String, 
    required: true, 
    enum: ["Factory", "Floor", "Zone", "Storage Location"] 
  },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocationV2', default: null, index: true },
  capacity: { type: Number, required: false },
  unit: { type: String, default: "kg" },
  occupiedPercent: { type: Number, default: 0 },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  status: { type: String, enum: ["Active", "Maintenance", "Full"], default: "Active" }
}, { timestamps: true });

warehouseLocationV2Schema.index({ name: 1, parentId: 1, company: 1 }, { unique: true });
warehouseLocationV2Schema.index({ company: 1, level: 1 });

module.exports = mongoose.model("WarehouseLocationV2", warehouseLocationV2Schema);

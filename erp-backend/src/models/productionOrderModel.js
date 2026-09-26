const mongoose = require("mongoose");

const productionOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, index: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: "SkuV2", required: false },
  itemName: { type: String, required: true, index: true },
  itemCode: { type: String, required: false },
  itemType: { 
    type: String, 
    enum: ["Finished Good", "Semi Finished", "Raw Material"], 
    default: "Finished Good" 
  },
  plannedQty: { type: Number, required: true, min: 0 },
  plannedUom: { type: String, required: true },
  plannedPcs: { type: Number, required: true, min: 0 },
  conversionFactor: { type: Number, default: 1 },
  producedQty: { type: Number, default: 0 },
  producedPcs: { type: Number, default: 0 },
  balanceQty: { type: Number, default: 0 },
  balancePcs: { type: Number, default: 0 },
  materialStatus: { 
    type: String, 
    enum: ["Ready", "Shortage"], 
    default: "Ready" 
  },
  status: { 
    type: String, 
    enum: ["Planned", "In Production", "Completed", "Not Started", "Cancelled"], 
    default: "Planned",
    index: true
  },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  department: { type: String, default: "Notebook Manufacturing", index: true },
  factory: { type: String, default: "Main Factory" },
  factoryId: { type: mongoose.Schema.Types.ObjectId, ref: "WarehouseLocationV2", required: false },
  plannedStartDate: { type: String, required: false },
  requiredCompletionDate: { type: String, required: false },
  actualCompletionDate: { type: String, required: false },
  completedBy: { type: String, required: false },
  priority: { 
    type: String, 
    enum: ["Normal", "High", "Urgent", "Low"], 
    default: "Normal" 
  },
  reference: { type: String, default: "Not Selected" },
  referenceSalesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOrder", required: false },
  remarks: { type: String, default: "" },
  bomType: { 
    type: String, 
    enum: ["Default BOM", "Custom BOM (Production Order Only)"], 
    default: "Default BOM" 
  },
  bomItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
  productionEntries: { type: [mongoose.Schema.Types.Mixed], default: [] },
  finishedGoodsBatch: { type: mongoose.Schema.Types.Mixed, required: false },
  stockUpdates: { type: [mongoose.Schema.Types.Mixed], default: [] },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false }
}, { timestamps: true });

productionOrderSchema.index({ company: 1, orderNumber: 1 }, { unique: true });
productionOrderSchema.index({ company: 1, status: 1 });
productionOrderSchema.index({ company: 1, department: 1 });

module.exports = mongoose.model("ProductionOrder", productionOrderSchema);

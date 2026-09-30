const mongoose = require("mongoose");

const productionOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, index: true },
  itemId: { type: mongoose.Schema.Types.Mixed, required: false },
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
  factoryId: { type: mongoose.Schema.Types.Mixed, required: false },
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
  referenceSalesOrderId: { type: mongoose.Schema.Types.Mixed, required: false },
  remarks: { type: String, default: "" },
  referenceNo: { type: String, default: "" },
  orderDate: { type: String, default: "" },
  outputLocation: { type: String, default: "" },
  outputLocationId: { type: mongoose.Schema.Types.Mixed, required: false },
  locationId: { type: mongoose.Schema.Types.Mixed, required: false },
  warehouseId: { type: mongoose.Schema.Types.Mixed, required: false },
  floorId: { type: mongoose.Schema.Types.Mixed, required: false },
  zoneId: { type: mongoose.Schema.Types.Mixed, required: false },
  byProducts: { type: [mongoose.Schema.Types.Mixed], default: [] },
  additionalCosts: { type: [mongoose.Schema.Types.Mixed], default: [] },
  profitPricing: { type: mongoose.Schema.Types.Mixed, default: {} },
  costSummary: { type: mongoose.Schema.Types.Mixed, default: {} },
  bomType: { 
    type: String, 
    enum: ["Default BOM", "Custom BOM (Production Order Only)"], 
    default: "Default BOM" 
  },
  bomItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
  productionEntries: { type: [mongoose.Schema.Types.Mixed], default: [] },
  finishedGoodsBatch: { type: mongoose.Schema.Types.Mixed, required: false },
  stockUpdates: { type: [mongoose.Schema.Types.Mixed], default: [] },
  company: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.Mixed, required: false }
}, { timestamps: true });

productionOrderSchema.index({ company: 1, orderNumber: 1 }, { unique: true });
productionOrderSchema.index({ company: 1, status: 1 });
productionOrderSchema.index({ company: 1, department: 1 });

module.exports = mongoose.model("ProductionOrder", productionOrderSchema);

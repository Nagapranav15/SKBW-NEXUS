const mongoose = require("mongoose");

const cuttingSlipSchema = new mongoose.Schema({
  slipNumber: { type: String, required: true, index: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  date: { type: Date, default: Date.now },
  
  // Source Consumption (Raw Material Reels)
  sourceSku: { type: mongoose.Schema.Types.ObjectId, ref: 'SkuV2', required: true },
  purchaseBatch: { type: String, default: "" },
  sourceLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocationV2' },
  selectedReels: [{
    reelNumber: { type: String, required: true },
    weight: { type: Number, required: true },
    width: { type: Number },
    gsm: { type: Number },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocationV2' }
  }],
  totalInputWeight: { type: Number, required: true, min: 0.1 },
  inputRatePerKg: { type: Number, default: 0 },
  totalInputCost: { type: Number, default: 0 },

  // Target Generation (Semi-Finished Sheets)
  targetSku: { type: mongoose.Schema.Types.ObjectId, ref: 'SkuV2', required: true },
  sheetWidth: { type: Number, required: true },  // in cm (e.g. 57)
  sheetLength: { type: Number, required: true }, // in cm (e.g. 70)
  sheetGsm: { type: Number, required: true },    // e.g. 52
  sheetsPerReam: { type: Number, default: 500 },

  // Yield & Reconciliation
  theoreticalSheets: { type: Number, required: true },
  theoreticalReams: { type: Number, default: 0 },
  actualSheets: { type: Number, required: true, min: 0 },
  actualReams: { type: Number, default: 0 },
  varianceSheets: { type: Number, default: 0 },
  wastePercentage: { type: Number, default: 0 },

  // By-Products & Scrap
  scrapWeightKg: { type: Number, default: 0 },
  scrapRatePerKg: { type: Number, default: 0 },
  coreCount: { type: Number, default: 0 },
  coreRatePerPc: { type: Number, default: 0 },
  totalScrapCredit: { type: Number, default: 0 },

  // Landed Cost Allocation (Zero Discrepancy Costing)
  netProductionCost: { type: Number, default: 0 },
  effectiveCostPerSheet: { type: Number, default: 0 },
  effectiveCostPerReam: { type: Number, default: 0 },

  // Destination Godown
  destinationLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocationV2', required: true },
  machineName: { type: String, default: "Sheeter 01" },
  operatorName: { type: String, default: "" },
  notes: { type: String, default: "" },
  status: { type: String, enum: ["Posted", "Cancelled"], default: "Posted" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

cuttingSlipSchema.index({ company: 1, slipNumber: 1 }, { unique: true });
cuttingSlipSchema.index({ company: 1, date: -1 });

module.exports = mongoose.model("CuttingSlip", cuttingSlipSchema);

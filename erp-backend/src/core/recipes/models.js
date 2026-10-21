/** Notebook recipes: product specification + bill of materials + process charges. All factory rules live here as data. */
const mongoose = require("mongoose");
const { Schema } = mongoose;
const { MATERIAL_BASES, PROCESS_BASES, PROCESS_KINDS } = require("./recipeEngine");

const materialSchema = new Schema({
  key: { type: String, required: true, trim: true },
  role: { type: String, enum: ["PAPER", "INDEX", "COVER", "BINDING_MATERIAL", "PACKING", "OTHER"], required: true },
  itemId: { type: Schema.Types.ObjectId, ref: "SkuV2", required: true },
  basis: { type: String, enum: MATERIAL_BASES, required: true },
  qty: { type: Number, min: 0 },
  wastagePct: { type: Number, default: 0, min: 0, max: 100 },
}, { _id: false });

const processSchema = new Schema({
  key: { type: String, required: true, trim: true },
  kind: { type: String, enum: PROCESS_KINDS, required: true },
  basis: { type: String, enum: PROCESS_BASES, required: true },
  rate: { type: Number, required: true, min: 0 },
  wastagePct: { type: Number, default: 0, min: 0, max: 100 },
  vendorId: { type: Schema.Types.ObjectId, ref: "Party", default: null },
}, { _id: false });

const specSchema = new Schema({
  sizeLabel: { type: String, default: "" },
  pages: { type: Number, required: true, min: 1 },
  pagesPerLeaf: { type: Number, required: true, min: 1 }, // deliberately required: the factory must state it
  ups: { type: Number, required: true, min: 1 },
  gsm: { type: Number, min: 1 },
  ruling: { type: String, default: "" },
  hasIndex: { type: Boolean, default: false },
  coverType: { type: String, default: "" },
  binding: { type: String, default: "" },
  piecesPerBundle: { type: Number, required: true, min: 1 },
}, { _id: false });

const recipeSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  name: { type: String, required: true, trim: true },
  productItemId: { type: Schema.Types.ObjectId, ref: "SkuV2", default: null },
  spec: { type: specSchema, required: true },
  materials: { type: [materialSchema], validate: (v) => v.length > 0 },
  processes: [processSchema],
  active: { type: Boolean, default: true },
  version: { type: Number, default: 1 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true, strict: true });
recipeSchema.index({ companyId: 1, name: 1 }, { unique: true });
recipeSchema.index({ companyId: 1, productItemId: 1 });

const Recipe = mongoose.models.Recipe || mongoose.model("Recipe", recipeSchema);
module.exports = { Recipe };

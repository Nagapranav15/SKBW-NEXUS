/** Recipe CRUD and calculation against live stock cost and availability. */
const mongoose = require("mongoose");
const { Recipe } = require("./models");
const { computeRecipe } = require("./recipeEngine");
const { ItemCost } = require("../stock/models");
const stock = require("../stock/stockService");
const { roundQty } = require("../stock/costing");

const { StockError } = stock;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isDuplicateKey = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ""));

async function validateItems(companyId, data) {
  const ids = new Set([...(data.materials || []).map((m) => String(m.itemId)), ...(data.productItemId ? [String(data.productItemId)] : [])]);
  for (const itemId of ids) await stock.loadItem(companyId, itemId);
  const keys = (data.materials || []).map((m) => m.key);
  if (new Set(keys).size !== keys.length) throw new StockError("Material keys must be unique within a recipe", 400, "DUPLICATE_KEY");
  const pkeys = (data.processes || []).map((p) => p.key);
  if (new Set(pkeys).size !== pkeys.length) throw new StockError("Process keys must be unique within a recipe", 400, "DUPLICATE_KEY");
}

async function createRecipe(p) {
  await validateItems(p.companyId, p);
  try {
    const doc = await Recipe.create({ ...p, companyId: oid(p.companyId), createdBy: p.userId ? oid(p.userId) : undefined });
    return doc.toObject();
  } catch (e) {
    if (isDuplicateKey(e)) throw new StockError("A recipe with this name already exists", 409, "DUPLICATE_NAME");
    throw e;
  }
}

async function updateRecipe(companyId, id, patch) {
  const current = await Recipe.findOne({ _id: oid(id), companyId: oid(companyId) });
  if (!current) throw new StockError("Recipe not found", 404, "NOT_FOUND");
  await validateItems(companyId, { materials: patch.materials || current.materials, processes: patch.processes || current.processes, productItemId: patch.productItemId || current.productItemId });
  const { userId, userName, companyId: _c, ...fields } = patch;
  Object.assign(current, fields);
  current.version += 1; // every change is a new version so a costing can always be traced to a recipe state
  try {
    await current.save();
  } catch (e) {
    if (isDuplicateKey(e)) throw new StockError("A recipe with this name already exists", 409, "DUPLICATE_NAME");
    throw e;
  }
  return current.toObject();
}

async function getRecipe(companyId, id) {
  const r = await Recipe.findOne({ _id: oid(id), companyId: oid(companyId) }).lean();
  if (!r) throw new StockError("Recipe not found", 404, "NOT_FOUND");
  return r;
}

async function listRecipes(companyId, { activeOnly } = {}) {
  return Recipe.find({ companyId: oid(companyId), ...(activeOnly ? { active: true } : {}) }).sort({ name: 1 }).lean();
}

/** Requirement, cost and stock availability for a number of books (or bundles). */
async function calculate(companyId, id, { books, bundles }) {
  const recipe = await getRecipe(companyId, id);
  const n = books !== undefined ? books : bundles * recipe.spec.piecesPerBundle;
  const costs = await ItemCost.find({ companyId: oid(companyId), itemId: { $in: recipe.materials.map((m) => m.itemId) } }).lean();
  const costOf = new Map(costs.map((c) => [String(c.itemId), c]));

  let result;
  try {
    result = computeRecipe({
      spec: recipe.spec,
      materials: recipe.materials.map((m) => ({ key: m.key, role: m.role, basis: m.basis, qty: m.qty, wastagePct: m.wastagePct, unitCost: (costOf.get(String(m.itemId)) || {}).avgCost || 0 })),
      processes: recipe.processes.map((p) => ({ key: p.key, kind: p.kind, basis: p.basis, rate: p.rate, wastagePct: p.wastagePct })),
      books: n,
    });
  } catch (e) {
    if (e instanceof RangeError) throw new StockError(e.message, 400, "INVALID_RECIPE");
    throw e;
  }

  // Availability, aggregated per item (the same item can appear on several lines)
  const need = new Map();
  result.materials.forEach((line, i) => {
    const itemId = String(recipe.materials[i].itemId);
    need.set(itemId, roundQty((need.get(itemId) || 0) + line.requiredQty));
  });
  const availability = [...need.entries()].map(([itemId, required]) => {
    const onHand = (costOf.get(itemId) || {}).qty || 0;
    return { itemId, required, onHand, shortfall: roundQty(Math.max(0, required - onHand)) };
  });
  result.materials.forEach((line, i) => { line.itemId = recipe.materials[i].itemId; });

  return { recipeId: recipe._id, recipeName: recipe.name, recipeVersion: recipe.version, ...result, availability, canProduce: availability.every((a) => a.shortfall === 0) };
}

module.exports = { createRecipe, updateRecipe, getRecipe, listRecipes, calculate };

/**
 * Notebook recipe engine. Pure maths; every factory rule is DATA on the recipe, nothing is hard-coded.
 *
 *   leavesPerBook      = pages / pagesPerLeaf                    (pagesPerLeaf is a recipe field, must be confirmed)
 *   parentSheetsPerBook= leavesPerBook / ups                     (one parent sheet is cut into `ups` pieces)
 *
 * Material line bases:
 *   PER_PARENT_SHEET  quantity per book = parentSheetsPerBook    (the paper)
 *   PER_BOOK          quantity per book = qty                    (cover, index sheet, wire, label ...)
 *   PER_BUNDLE        quantity per book = qty / piecesPerBundle  (packing material)
 * Process bases (ruling, printing, binding charges):
 *   PER_PARENT_SHEET  rate x parentSheetsPerBook      PER_BOOK  rate      PER_BUNDLE  rate / piecesPerBundle
 *
 * Wastage is a percentage added on top of the quantity needed (and of a process's charge basis).
 */
const { roundQty, roundMoney, roundRate } = require("../stock/costing");

const MATERIAL_BASES = ["PER_PARENT_SHEET", "PER_BOOK", "PER_BUNDLE"];
const PROCESS_BASES = ["PER_PARENT_SHEET", "PER_BOOK", "PER_BUNDLE"];
const PROCESS_KINDS = ["RULING", "INDEX_PRINTING", "COVER_PRINTING", "BINDING", "OTHER"];

const positive = (v, what) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) throw new RangeError(`${what} must be a positive number`);
};
const pct = (v, what) => {
  if (v === undefined || v === null) return 0;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) throw new RangeError(`${what} must be between 0 and 100`);
  return v;
};

function perBookFactors(spec) {
  positive(spec.pages, "Pages");
  positive(spec.pagesPerLeaf, "Pages per leaf");
  positive(spec.ups, "Ups");
  positive(spec.piecesPerBundle, "Pieces per bundle");
  const leavesPerBook = spec.pages / spec.pagesPerLeaf;
  return { leavesPerBook, parentSheetsPerBook: leavesPerBook / spec.ups };
}

/**
 * @param {object} i
 * @param {{pages,pagesPerLeaf,ups,piecesPerBundle}} i.spec
 * @param {Array<{key,role,basis,qty?,wastagePct?,unitCost}>} i.materials   unitCost = current moving-average cost
 * @param {Array<{key,kind,basis,rate,wastagePct?}>} i.processes
 * @param {number} i.books   how many books to plan for
 */
function computeRecipe({ spec, materials = [], processes = [], books }) {
  positive(books, "Number of books");
  const { leavesPerBook, parentSheetsPerBook } = perBookFactors(spec);

  const materialLines = materials.map((m) => {
    if (!MATERIAL_BASES.includes(m.basis)) throw new RangeError(`Unknown material basis: ${m.basis}`);
    if (typeof m.unitCost !== "number" || !(m.unitCost >= 0)) throw new RangeError(`Material ${m.key}: unit cost must be zero or more`);
    let qtyPerBook;
    if (m.basis === "PER_PARENT_SHEET") qtyPerBook = parentSheetsPerBook * (m.qty > 0 ? m.qty : 1);
    else if (m.basis === "PER_BOOK") { positive(m.qty, `Material ${m.key} quantity`); qtyPerBook = m.qty; }
    else { positive(m.qty, `Material ${m.key} quantity`); qtyPerBook = m.qty / spec.piecesPerBundle; }
    const wastagePct = pct(m.wastagePct, `Material ${m.key} wastage`);
    const grossPerBook = qtyPerBook * (1 + wastagePct / 100);
    return {
      key: m.key, role: m.role, basis: m.basis, wastagePct,
      qtyPerBook: roundRate(qtyPerBook), grossQtyPerBook: roundRate(grossPerBook),
      requiredQty: roundQty(grossPerBook * books),
      unitCost: m.unitCost, costPerBook: roundRate(grossPerBook * m.unitCost), cost: roundMoney(grossPerBook * m.unitCost * books),
    };
  });

  const processLines = processes.map((p) => {
    if (!PROCESS_BASES.includes(p.basis)) throw new RangeError(`Unknown process basis: ${p.basis}`);
    if (typeof p.rate !== "number" || !(p.rate >= 0)) throw new RangeError(`Process ${p.key}: rate must be zero or more`);
    const wastagePct = pct(p.wastagePct, `Process ${p.key} wastage`);
    const unitsPerBook = p.basis === "PER_PARENT_SHEET" ? parentSheetsPerBook : p.basis === "PER_BOOK" ? 1 : 1 / spec.piecesPerBundle;
    const grossUnits = unitsPerBook * (1 + wastagePct / 100);
    return { key: p.key, kind: p.kind, basis: p.basis, wastagePct, rate: p.rate, costPerBook: roundRate(grossUnits * p.rate), cost: roundMoney(grossUnits * p.rate * books) };
  });

  const materialCostPerBook = materialLines.reduce((s, l) => s + l.costPerBook, 0);
  const processCostPerBook = processLines.reduce((s, l) => s + l.costPerBook, 0);
  const costPerBook = roundRate(materialCostPerBook + processCostPerBook);
  return {
    books,
    bundles: roundQty(books / spec.piecesPerBundle),
    leavesPerBook: roundRate(leavesPerBook),
    parentSheetsPerBook: roundRate(parentSheetsPerBook),
    materials: materialLines,
    processes: processLines,
    materialCostPerBook: roundRate(materialCostPerBook),
    processCostPerBook: roundRate(processCostPerBook),
    costPerBook,
    costPerBundle: roundMoney(costPerBook * spec.piecesPerBundle),
    totalCost: roundMoney(materialLines.reduce((s, l) => s + l.cost, 0) + processLines.reduce((s, l) => s + l.cost, 0)),
  };
}

module.exports = { computeRecipe, perBookFactors, MATERIAL_BASES, PROCESS_BASES, PROCESS_KINDS };

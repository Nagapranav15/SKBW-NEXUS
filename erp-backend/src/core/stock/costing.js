/**
 * Moving-average inventory costing. Pure functions: no database, no clock.
 *
 * State of an item (company-wide):  { qty, value }   avgCost = value / qty
 *
 *   Receipt:  newQty   = qty + receiptQty
 *             newValue = value + receiptValue
 *             avgCost  = newValue / newQty          (the moving average)
 *   Issue:    issueValue = issueQty * avgCost       (stock leaves at the current average)
 *             newQty   = qty - issueQty
 *             newValue = value - issueValue         (the final unit takes the remaining value exactly,
 *                                                    so no rounding residue is ever left behind)
 *
 * If stock is zero or negative when a receipt arrives, the old value is ignored and the average restarts
 * at the receipt's unit cost. Quantities are rounded to 3 decimals, money to 2, average cost to 4.
 */
const round = (n, dp) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};
const roundQty = (n) => round(n, 3);
const roundMoney = (n) => round(n, 2);
const roundRate = (n) => round(n, 4);

const avgCostOf = ({ qty, value }) => (qty > 0 ? roundRate(value / qty) : 0);

const assertPositive = (n, what) => {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) throw new RangeError(`${what} must be a positive number`);
};

/** @returns {{ qty:number, value:number, avgCost:number, receiptValue:number }} */
function applyReceipt(state, { qty, unitCost, totalValue }) {
  assertPositive(qty, "Receipt quantity");
  if (totalValue === undefined || totalValue === null) {
    if (typeof unitCost !== "number" || !Number.isFinite(unitCost) || unitCost < 0) throw new RangeError("Receipt unit cost must be zero or more");
  } else if (typeof totalValue !== "number" || !Number.isFinite(totalValue) || totalValue < 0) {
    throw new RangeError("Receipt value must be zero or more");
  }
  const receiptValue = roundMoney(totalValue !== undefined && totalValue !== null ? totalValue : qty * unitCost);

  // Negative stock: the receipt first covers the shortfall, only what remains is on hand at the receipt's cost
  if (state.qty < 0) {
    const onHand = roundQty(qty + state.qty);
    if (onHand <= 0) return { qty: onHand, value: 0, avgCost: 0, receiptValue };
    return { qty: onHand, value: roundMoney(receiptValue * (onHand / qty)), avgCost: roundRate(receiptValue / qty), receiptValue };
  }

  const next = { qty: roundQty(state.qty + qty), value: roundMoney((state.qty > 0 ? state.value : 0) + receiptValue) };
  return { ...next, avgCost: avgCostOf(next), receiptValue };
}

/**
 * @param {{qty:number,value:number}} state
 * @param {{qty:number}} issue
 * @returns {{ qty:number, value:number, avgCost:number, issueValue:number, issueUnitCost:number }}
 */
function applyIssue(state, { qty }) {
  assertPositive(qty, "Issue quantity");
  const avg = state.qty > 0 ? state.value / state.qty : 0;
  const issuesEverything = state.qty > 0 && roundQty(qty) === roundQty(state.qty);
  const issueValue = issuesEverything ? state.value : roundMoney(qty * avg);
  const nextQty = roundQty(state.qty - qty);
  const nextValue = nextQty === 0 ? 0 : roundMoney(state.value - issueValue);
  const next = { qty: nextQty, value: nextValue };
  return { ...next, avgCost: avgCostOf(next), issueValue, issueUnitCost: roundRate(avg) };
}

module.exports = { applyReceipt, applyIssue, avgCostOf, roundQty, roundMoney, roundRate };

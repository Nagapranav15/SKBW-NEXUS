/** Moving-average costing: pure maths, hand-calculated expectations. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyReceipt, applyIssue } = require("../src/core/stock/costing");

test("first receipt sets the average to its unit cost", () => {
  const r = applyReceipt({ qty: 0, value: 0 }, { qty: 100, unitCost: 10 });
  assert.deepEqual([r.qty, r.value, r.avgCost], [100, 1000, 10]);
});

test("second receipt at a different price moves the average", () => {
  // 100 @ 10 = 1000, then 100 @ 20 = 2000  ->  200 units worth 3000, average 15
  let s = applyReceipt({ qty: 0, value: 0 }, { qty: 100, unitCost: 10 });
  s = applyReceipt(s, { qty: 100, unitCost: 20 });
  assert.deepEqual([s.qty, s.value, s.avgCost], [200, 3000, 15]);
});

test("uneven quantities weight the average correctly", () => {
  // 300 kg @ 80 = 24000, 100 kg @ 100 = 10000  ->  400 kg worth 34000, average 85
  let s = applyReceipt({ qty: 0, value: 0 }, { qty: 300, unitCost: 80 });
  s = applyReceipt(s, { qty: 100, unitCost: 100 });
  assert.deepEqual([s.qty, s.value, s.avgCost], [400, 34000, 85]);
});

test("receipt can be given as a total value (a bill total) instead of a unit cost", () => {
  const r = applyReceipt({ qty: 0, value: 0 }, { qty: 3, totalValue: 100 });
  assert.equal(r.value, 100);
  assert.equal(r.avgCost, 33.3333);
});

test("issue is valued at the current average and does not change the average", () => {
  let s = applyReceipt({ qty: 0, value: 0 }, { qty: 100, unitCost: 10 });
  s = applyReceipt(s, { qty: 100, unitCost: 20 });
  const i = applyIssue(s, { qty: 50 });
  assert.equal(i.issueValue, 750);
  assert.equal(i.issueUnitCost, 15);
  assert.deepEqual([i.qty, i.value, i.avgCost], [150, 2250, 15]);
});

test("issuing everything drains value to exactly zero (no rounding residue)", () => {
  let s = applyReceipt({ qty: 0, value: 0 }, { qty: 3, totalValue: 100 }); // avg 33.3333...
  const a = applyIssue(s, { qty: 1 });
  const b = applyIssue(a, { qty: 1 });
  const c = applyIssue(b, { qty: 1 });
  assert.equal(c.qty, 0);
  assert.equal(c.value, 0);
  assert.equal(a.issueValue + b.issueValue + c.issueValue, 100); // the three issues account for the full 100
});

test("after stock hits zero a new receipt restarts the average", () => {
  let s = applyReceipt({ qty: 0, value: 0 }, { qty: 10, unitCost: 5 });
  s = applyIssue(s, { qty: 10 });
  s = applyReceipt(s, { qty: 10, unitCost: 9 });
  assert.deepEqual([s.qty, s.value, s.avgCost], [10, 90, 9]);
});

test("receipt into negative stock first covers the shortfall", () => {
  // -4 on hand, receive 10 @ 5 -> 6 on hand worth 30, average 5
  const r = applyReceipt({ qty: -4, value: 0 }, { qty: 10, unitCost: 5 });
  assert.deepEqual([r.qty, r.value, r.avgCost], [6, 30, 5]);
});

test("invalid quantities and costs are rejected", () => {
  assert.throws(() => applyReceipt({ qty: 0, value: 0 }, { qty: 0, unitCost: 1 }), RangeError);
  assert.throws(() => applyReceipt({ qty: 0, value: 0 }, { qty: -5, unitCost: 1 }), RangeError);
  assert.throws(() => applyReceipt({ qty: 0, value: 0 }, { qty: 5, unitCost: -1 }), RangeError);
  assert.throws(() => applyReceipt({ qty: 0, value: 0 }, { qty: 5 }), RangeError);
  assert.throws(() => applyIssue({ qty: 5, value: 50 }, { qty: 0 }), RangeError);
  assert.throws(() => applyIssue({ qty: 5, value: 50 }, { qty: NaN }), RangeError);
});

test("value is always qty x average within rounding after a long sequence of movements", () => {
  let s = { qty: 0, value: 0 };
  for (let i = 1; i <= 50; i++) s = applyReceipt(s, { qty: i, unitCost: 7 + (i % 5) * 1.37 });
  for (let i = 1; i <= 30; i++) s = applyIssue(s, { qty: 3.5 });
  assert.ok(Math.abs(s.value - s.qty * s.avgCost) < 1, `value ${s.value} vs qty*avg ${s.qty * s.avgCost}`);
});

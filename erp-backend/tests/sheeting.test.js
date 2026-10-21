/** Sheeting maths (ported from the cutting slip). Expected numbers are hand-calculated. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { computeSheeting, theoreticalSheets } = require("../src/core/conversions/sheeting");

const base = { weightKg: 500, widthCm: 57, lengthCm: 70, gsm: 52, reelsOnStand: 2, slitsCount: 3 };

test("theoretical sheets = weight x 10,000,000 / (width x length x gsm)", () => {
  // 500 * 10,000,000 / (57 * 70 * 52) = 5,000,000,000 / 207,480 = 24,098.9 -> 24,099
  assert.equal(theoreticalSheets({ weightKg: 500, widthCm: 57, lengthCm: 70, gsm: 52 }), 24099);
  assert.equal(theoreticalSheets({ weightKg: 0, widthCm: 57, lengthCm: 70, gsm: 52 }), 0);
});

test("sheets per cut and cuts", () => {
  const r = computeSheeting({ ...base, actualSheets: 24000, inputValue: 0 });
  assert.equal(r.sheetsPerCut, 6); // 2 reels on stand x 3 slits
  assert.equal(r.theoreticalCuts, 4017); // ceil(24099 / 6)
  assert.equal(computeSheeting({ ...base, cuts: 4000, inputValue: 0 }).machineSheets, 24000);
  assert.equal(computeSheeting({ ...base, cuts: 4000, inputValue: 0 }).actualSheets, 24000); // defaults to the machine count
});

test("costs per sheet, per ream and per 4-up", () => {
  // reel value 40,000 + additional 3,000 = 43,000 over 24,000 sheets
  const r = computeSheeting({ ...base, actualSheets: 24000, inputValue: 40000, additionalCosts: [{ amount: 3000 }] });
  assert.equal(r.netCost, 43000);
  assert.equal(r.costPerSheet, 1.7917);
  assert.equal(r.costPer4Up, 0.4479); // 1.7917 / 4
  assert.equal(r.actualReams, 48); // 24,000 / 500
  assert.equal(r.costPerReam, 895.8333); // 43,000 / 48
  assert.equal(r.varianceSheets, -99);
  assert.equal(r.wastePercentage, 0.4); // 99 / 24,099
});

test("scrap and core credit reduce the cost", () => {
  // 10 kg scrap @ 20 + 5 cores @ 2 = 210 credit
  const r = computeSheeting({ ...base, actualSheets: 24000, inputValue: 40000, additionalCosts: [{ amount: 3000 }], scrapWeightKg: 10, scrapRatePerKg: 20, coreCount: 5, coreRatePerPc: 2 });
  assert.equal(r.scrapCredit, 210);
  assert.equal(r.netCost, 42790);
});

test("actual output above the theoretical maximum is rejected beyond a 0.5% tolerance", () => {
  // ceil(24,099 * 1.005) = 24,220
  assert.doesNotThrow(() => computeSheeting({ ...base, actualSheets: 24220, inputValue: 0 }));
  assert.throws(() => computeSheeting({ ...base, actualSheets: 24221, inputValue: 0 }), /cannot exceed the theoretical maximum/);
});

test("custom sheets per ream and invalid inputs", () => {
  assert.equal(computeSheeting({ ...base, actualSheets: 24000, inputValue: 0, sheetsPerReam: 480 }).actualReams, 50);
  assert.equal(computeSheeting({ ...base, actualSheets: 24000, inputValue: 0, sheetsPerReam: 5000 }).sheetsPerReam, 500); // out of range -> default
  assert.throws(() => computeSheeting({ ...base, weightKg: 0 }), RangeError);
  assert.throws(() => computeSheeting({ ...base, gsm: 0 }), RangeError);
  assert.throws(() => computeSheeting({ ...base, actualSheets: 100, inputValue: 100, scrapWeightKg: 100, scrapRatePerKg: 50 }), /Scrap credit cannot exceed/);
});

/**
 * Reel -> sheet conversion maths (ported from the existing cutting slip, now pure and tested).
 *
 *   Theoretical sheets = round( weightKg * 10,000,000 / (widthCm * lengthCm * gsm) )
 *   Sheets per cut     = max(1, reelsOnStand) * max(1, slits)
 *   Machine sheets     = round( cuts * sheetsPerCut )
 *   Actual sheets may exceed the theoretical maximum by at most 0.5% (edge rounding); more is impossible.
 *   Reams              = sheets / sheetsPerReam (default 500), 2 decimals
 *   Scrap credit       = scrapKg * scrapRatePerKg + cores * coreRatePerPc
 *   Net cost           = reel value + additional costs - scrap credit
 *   Cost per sheet     = net cost / actual sheets      Cost per 4-up piece = cost per sheet / 4
 *
 * NOTE: the legacy cutting slip stored the scrap credit but posted it as zero; here it is deducted. Confirm.
 */
const { roundMoney, roundRate } = require("../stock/costing");

const TOLERANCE = 1.005;
const num = (v) => (v === undefined || v === null || v === "" ? 0 : Number(v));
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const theoreticalSheets = ({ weightKg, widthCm, lengthCm, gsm }) => {
  if (!(weightKg > 0 && widthCm > 0 && lengthCm > 0 && gsm > 0)) return 0;
  return Math.round((weightKg * 10000000) / (widthCm * lengthCm * gsm));
};

const sheetsPerCut = ({ reelsOnStand, slitsCount }) => Math.max(1, num(reelsOnStand) || 1) * Math.max(1, num(slitsCount) || 1);

/**
 * @param {object} i
 * @returns {object} full result; throws RangeError for impossible input
 */
function computeSheeting(i) {
  const weightKg = num(i.weightKg);
  const widthCm = num(i.widthCm);
  const lengthCm = num(i.lengthCm);
  const gsm = num(i.gsm);
  if (!(weightKg > 0)) throw new RangeError("Input weight must be greater than zero");
  if (!(widthCm > 0 && lengthCm > 0 && gsm > 0)) throw new RangeError("Sheet width, length and GSM are required");

  const spr = num(i.sheetsPerReam) > 0 && num(i.sheetsPerReam) <= 1000 ? num(i.sheetsPerReam) : 500;
  const perCut = sheetsPerCut(i);
  const theoretical = theoreticalSheets({ weightKg, widthCm, lengthCm, gsm });
  const theoreticalCuts = theoretical > 0 ? Math.ceil(theoretical / perCut) : 0;
  const machineSheets = num(i.cuts) > 0 ? Math.round(num(i.cuts) * perCut) : 0;

  const actual = i.actualSheets !== undefined && i.actualSheets !== null ? num(i.actualSheets) : machineSheets;
  if (!(actual >= 0)) throw new RangeError("Actual sheets cannot be negative");
  const maxAllowed = Math.ceil(theoretical * TOLERANCE);
  if (theoretical > 0 && actual > maxAllowed) {
    throw new RangeError(`Actual sheets (${actual}) cannot exceed the theoretical maximum (${theoretical}) for ${weightKg} kg of ${gsm} GSM at ${widthCm}x${lengthCm} cm`);
  }

  const scrapCredit = roundMoney(num(i.scrapWeightKg) * num(i.scrapRatePerKg) + num(i.coreCount) * num(i.coreRatePerPc));
  const additional = roundMoney((i.additionalCosts || []).reduce((s, c) => s + num(c.amount), 0));
  const inputValue = roundMoney(num(i.inputValue));
  const netCost = roundMoney(inputValue + additional - scrapCredit);
  if (netCost < 0) throw new RangeError("Scrap credit cannot exceed the total cost");

  const actualReams = round2(actual / spr);
  const costPerSheet = actual > 0 ? roundRate(netCost / actual) : 0;
  return {
    sheetsPerReam: spr,
    sheetsPerCut: perCut,
    theoreticalSheets: theoretical,
    theoreticalReams: round2(theoretical / spr),
    theoreticalCuts,
    machineSheets,
    maxAllowedSheets: maxAllowed,
    actualSheets: actual,
    actualReams,
    varianceSheets: actual - theoretical,
    wastePercentage: theoretical > 0 && actual <= theoretical ? Math.round(((theoretical - actual) / theoretical) * 1000) / 10 : 0,
    inputValue,
    additionalCost: additional,
    scrapCredit,
    netCost,
    costPerSheet,
    costPerReam: actualReams > 0 ? roundRate(netCost / actualReams) : 0,
    costPer4Up: actual > 0 ? roundRate(costPerSheet / 4) : 0,
  };
}

module.exports = { computeSheeting, theoreticalSheets, sheetsPerCut, TOLERANCE };

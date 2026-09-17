/**
 * Centralized Unit of Measurement (UOM) Conversion Utility
 * 
 * Provides direction-independent, mathematically robust UOM conversions,
 * unit hierarchy resolution, formatting, and validation across the ERP.
 */

export type UomDirection = 'PRIMARY_TO_ALT' | 'ALT_TO_PRIMARY';

export interface SkuUomLike {
  unit?: string;
  altUnit?: string;
  altUnitConversion?: number | string;
  altUnitDirection?: UomDirection;
}

/**
 * Standard unit scales to determine natural aggregate vs discrete hierarchy.
 * Higher number = larger/aggregate unit.
 */
const UNIT_HIERARCHY: Record<string, number> = {
  // Bulk / Packaging level 3
  pallet: 30,
  crate: 30,
  container: 30,

  // Outer / Aggregate package level 2
  gbl: 20,
  'gross bundle': 20,
  bundle: 20,
  box: 20,
  carton: 20,
  case: 20,
  ream: 20,
  roll: 20,
  bag: 20,
  dozen: 20,
  doz: 20,
  pack: 20,
  pkt: 20,
  pkg: 20,
  set: 20,
  gross: 20,
  tonne: 20,
  ton: 20,
  quintal: 20,
  kg: 20,
  kilogram: 20,

  // Discrete / Base units level 1
  pcs: 10,
  pc: 10,
  piece: 10,
  pieces: 10,
  nos: 10,
  no: 10,
  number: 10,
  numbers: 10,
  sheets: 10,
  sheet: 10,
  sht: 10,
  unit: 10,
  units: 10,
  gm: 10,
  gram: 10,
  grams: 10,
  meter: 10,
  metre: 10,
  mtr: 10,
  cm: 5,
  mm: 1,
};

function normalizeUnit(unitName?: string): string {
  if (!unitName) return '';
  return unitName.trim().toLowerCase();
}

/**
 * Gets the hierarchy rank of a unit. Defaults to 10 (base discrete level) if unknown.
 */
export function getUnitRank(unitName?: string): number {
  const norm = normalizeUnit(unitName);
  if (!norm) return 10;
  if (UNIT_HIERARCHY[norm] !== undefined) return UNIT_HIERARCHY[norm];

  // Pattern matching
  if (norm.includes('bundle') || norm.includes('gbl') || norm.includes('box') || norm.includes('carton') || norm.includes('ream') || norm.includes('roll')) {
    return 20;
  }
  if (norm.includes('pc') || norm.includes('sheet') || norm.includes('no') || norm.includes('unit')) {
    return 10;
  }
  return 10;
}

/**
 * Rounds a number to avoid JavaScript floating point precision issues (e.g. 0.005000000000000001 -> 0.005).
 */
export function roundUomQty(val: number, maxDecimals: number = 6): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  const factor = Math.pow(10, maxDecimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Determines whether the conversion factor represents:
 * - 'PRIMARY_TO_ALT': 1 Primary = Factor * Alt (e.g. 1 GBL = 200 PCS when Primary is GBL)
 * - 'ALT_TO_PRIMARY': 1 Alt = Factor * Primary (e.g. 1 GBL = 200 PCS when Primary is PCS and Alt is GBL)
 */
export function getUomDirection(
  primaryUnit?: string,
  altUnit?: string,
  explicitDirection?: UomDirection
): UomDirection {
  if (explicitDirection) {
    return explicitDirection;
  }

  const primaryRank = getUnitRank(primaryUnit);
  const altRank = getUnitRank(altUnit);

  if (primaryRank > altRank) {
    // Primary is larger (e.g. Primary = GBL, Alt = PCS) -> 1 Primary = Factor * Alt
    return 'PRIMARY_TO_ALT';
  } else if (altRank > primaryRank) {
    // Alt is larger (e.g. Primary = PCS, Alt = GBL) -> 1 Alt = Factor * Primary
    return 'ALT_TO_PRIMARY';
  }

  // If ranks are equal (or unknown), default to 1 Primary = Factor * Alt
  return 'PRIMARY_TO_ALT';
}

/**
 * Validates UOM conversion inputs.
 */
export function validateUomConversion(
  primaryUnit?: string,
  altUnit?: string,
  conversionFactor?: number | string
): { valid: boolean; error?: string } {
  if (!primaryUnit || !primaryUnit.trim()) {
    return { valid: false, error: 'Primary Unit is required' };
  }

  if (!altUnit || !altUnit.trim()) {
    return { valid: true }; // Alt unit is optional
  }

  const normPrimary = normalizeUnit(primaryUnit);
  const normAlt = normalizeUnit(altUnit);

  if (normPrimary === normAlt) {
    return { valid: false, error: 'Alternative Unit cannot be the same as Primary Unit' };
  }

  if (conversionFactor !== undefined && conversionFactor !== '') {
    const factorNum = Number(conversionFactor);
    if (isNaN(factorNum) || factorNum <= 0) {
      return { valid: false, error: 'Conversion factor must be a positive number greater than 0' };
    }
  }

  return { valid: true };
}

/**
 * Safely parses the conversion factor as a positive number.
 */
export function parseConversionFactor(rawFactor?: number | string): number {
  if (rawFactor === undefined || rawFactor === null || rawFactor === '') return 1;
  const num = Number(rawFactor);
  return isNaN(num) || num <= 0 ? 1 : num;
}

/**
 * Converts quantity from Primary Unit to Alternative Unit.
 * 
 * Case 1 (Primary = GBL, Alt = PCS, Factor = 200):
 *   1 GBL = 200 PCS -> 1 GBL * 200 = 200 PCS; 2 GBL * 200 = 400 PCS
 * 
 * Case 2 (Primary = PCS, Alt = GBL, Factor = 200):
 *   1 GBL = 200 PCS -> 200 PCS / 200 = 1 GBL; 100 PCS / 200 = 0.5 GBL
 */
export function convertPrimaryToAlt(primaryQty: number, sku?: SkuUomLike | null): number {
  if (!sku || !sku.altUnit || !sku.altUnitConversion) return primaryQty;
  const factor = parseConversionFactor(sku.altUnitConversion);
  const direction = getUomDirection(sku.unit, sku.altUnit, sku.altUnitDirection);

  let result: number;
  if (direction === 'PRIMARY_TO_ALT') {
    // 1 Primary = Factor * Alt
    result = primaryQty * factor;
  } else {
    // 1 Alt = Factor * Primary -> Primary / Factor = Alt
    result = primaryQty / factor;
  }
  return roundUomQty(result);
}

/**
 * Converts quantity from Alternative Unit to Primary (Stock/Ledger) Unit.
 * 
 * Case 1 (Primary = GBL, Alt = PCS, Factor = 200):
 *   1 GBL = 200 PCS -> 200 PCS / 200 = 1 GBL; 100 PCS / 200 = 0.5 GBL
 * 
 * Case 2 (Primary = PCS, Alt = GBL, Factor = 200):
 *   1 GBL = 200 PCS -> 1 GBL * 200 = 200 PCS; 2 GBL * 200 = 400 PCS
 */
export function convertAltToPrimary(altQty: number, sku?: SkuUomLike | null): number {
  if (!sku || !sku.altUnit || !sku.altUnitConversion) return altQty;
  const factor = parseConversionFactor(sku.altUnitConversion);
  const direction = getUomDirection(sku.unit, sku.altUnit, sku.altUnitDirection);

  let result: number;
  if (direction === 'PRIMARY_TO_ALT') {
    // 1 Primary = Factor * Alt -> Alt / Factor = Primary
    result = altQty / factor;
  } else {
    // 1 Alt = Factor * Primary -> Alt * Factor = Primary
    result = altQty * factor;
  }
  return roundUomQty(result);
}

/**
 * Universal bidirectional converter between any two units for a given SKU.
 */
export function convertUom(
  qty: number,
  fromUnit: string,
  toUnit: string,
  sku?: SkuUomLike | null
): number {
  if (!sku || !sku.altUnit || !sku.altUnitConversion) return qty;
  const normFrom = normalizeUnit(fromUnit);
  const normTo = normalizeUnit(toUnit);
  const normPrimary = normalizeUnit(sku.unit);
  const normAlt = normalizeUnit(sku.altUnit);

  // If units are identical, no conversion needed (prevents double conversion)
  if (normFrom === normTo || !normFrom || !normTo) {
    return qty;
  }

  // From Primary to Alt
  if (normFrom === normPrimary && normTo === normAlt) {
    return convertPrimaryToAlt(qty, sku);
  }

  // From Alt to Primary
  if (normFrom === normAlt && normTo === normPrimary) {
    return convertAltToPrimary(qty, sku);
  }

  // Fallback if units don't match
  return qty;
}

/**
 * Formats the business relationship formula for display in UI tables, cards, and drawers.
 * 
 * Examples:
 * - Primary = GBL, Alt = PCS, Factor = 200 -> "1 GBL = 200 PCS"
 * - Primary = PCS, Alt = GBL, Factor = 200 -> "1 GBL = 200 PCS"
 */
export function formatUomFormula(sku?: SkuUomLike | null): string {
  if (!sku || !sku.altUnit || !sku.altUnitConversion) {
    return '-';
  }

  const factor = parseConversionFactor(sku.altUnitConversion);
  const direction = getUomDirection(sku.unit, sku.altUnit, sku.altUnitDirection);

  const primary = sku.unit || 'Unit';
  const alt = sku.altUnit;

  if (direction === 'PRIMARY_TO_ALT') {
    return `1 ${primary} = ${factor} ${alt}`;
  } else {
    return `1 ${alt} = ${factor} ${primary}`;
  }
}

/**
 * Returns a detailed summary including the forward formula and inverse value.
 * Example: "1 GBL = 200 PCS (1 PCS = 0.005 GBL)"
 */
export function formatUomConversionSummary(sku?: SkuUomLike | null): string {
  if (!sku || !sku.altUnit || !sku.altUnitConversion) {
    return '';
  }

  const factor = parseConversionFactor(sku.altUnitConversion);
  const formula = formatUomFormula(sku);
  const inverse = roundUomQty(1 / factor);

  const direction = getUomDirection(sku.unit, sku.altUnit, sku.altUnitDirection);
  const primary = sku.unit || 'Unit';
  const alt = sku.altUnit;

  if (direction === 'PRIMARY_TO_ALT') {
    return `${formula} (1 ${alt} = ${inverse} ${primary})`;
  } else {
    return `${formula} (1 ${primary} = ${inverse} ${alt})`;
  }
}

/**
 * Normalizes and deduplicates an array of unit strings (case-insensitive deduplication).
 */
export function normalizeAndDeduplicateUnits(units: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const u of units) {
    if (!u || !u.trim()) continue;
    const clean = u.trim();
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  }
  return result;
}


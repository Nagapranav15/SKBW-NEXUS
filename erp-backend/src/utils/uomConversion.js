/**
 * Centralized Unit of Measurement (UOM) Conversion Utility (Backend)
 * 
 * Provides direction-independent, mathematically robust UOM conversions,
 * unit hierarchy resolution, formatting, and validation across the ERP.
 */

const UNIT_HIERARCHY = {
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

function normalizeUnit(unitName) {
  if (!unitName) return '';
  return String(unitName).trim().toLowerCase();
}

function getUnitRank(unitName) {
  const norm = normalizeUnit(unitName);
  if (!norm) return 10;
  if (UNIT_HIERARCHY[norm] !== undefined) return UNIT_HIERARCHY[norm];

  if (norm.includes('bundle') || norm.includes('gbl') || norm.includes('box') || norm.includes('carton') || norm.includes('ream') || norm.includes('roll')) {
    return 20;
  }
  if (norm.includes('pc') || norm.includes('sheet') || norm.includes('no') || norm.includes('unit')) {
    return 10;
  }
  return 10;
}

function roundUomQty(val, maxDecimals = 6) {
  if (isNaN(val) || !isFinite(val)) return 0;
  const factor = Math.pow(10, maxDecimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

function getUomDirection(primaryUnit, altUnit, explicitDirection) {
  if (explicitDirection === 'PRIMARY_TO_ALT' || explicitDirection === 'ALT_TO_PRIMARY') {
    return explicitDirection;
  }

  const primaryRank = getUnitRank(primaryUnit);
  const altRank = getUnitRank(altUnit);

  if (primaryRank > altRank) {
    return 'PRIMARY_TO_ALT';
  } else if (altRank > primaryRank) {
    return 'ALT_TO_PRIMARY';
  }

  return 'PRIMARY_TO_ALT';
}

function validateUomConversion(primaryUnit, altUnit, conversionFactor) {
  if (!primaryUnit || !String(primaryUnit).trim()) {
    return { valid: false, error: 'Primary Unit is required' };
  }

  if (!altUnit || !String(altUnit).trim()) {
    return { valid: true };
  }

  const normPrimary = normalizeUnit(primaryUnit);
  const normAlt = normalizeUnit(altUnit);

  if (normPrimary === normAlt) {
    return { valid: true, isRedundant: true };
  }

  if (conversionFactor !== undefined && conversionFactor !== null && conversionFactor !== '') {
    const factorNum = Number(conversionFactor);
    if (isNaN(factorNum) || factorNum <= 0) {
      return { valid: false, error: 'Conversion factor must be a positive number greater than 0' };
    }
  }

  return { valid: true };
}

function parseConversionFactor(rawFactor) {
  if (rawFactor === undefined || rawFactor === null || rawFactor === '') return 1;
  const num = Number(rawFactor);
  return isNaN(num) || num <= 0 ? 1 : num;
}

function convertPrimaryToAlt(primaryQty, sku) {
  if (!sku || !sku.altUnit || !sku.altUnitConversion) return primaryQty;
  const factor = parseConversionFactor(sku.altUnitConversion);
  const direction = getUomDirection(sku.unit, sku.altUnit, sku.altUnitDirection);

  let result;
  if (direction === 'PRIMARY_TO_ALT') {
    result = primaryQty * factor;
  } else {
    result = primaryQty / factor;
  }
  return roundUomQty(result);
}

function convertAltToPrimary(altQty, sku) {
  if (!sku || !sku.altUnit || !sku.altUnitConversion) return altQty;
  const factor = parseConversionFactor(sku.altUnitConversion);
  const direction = getUomDirection(sku.unit, sku.altUnit, sku.altUnitDirection);

  let result;
  if (direction === 'PRIMARY_TO_ALT') {
    result = altQty / factor;
  } else {
    result = altQty * factor;
  }
  return roundUomQty(result);
}

function convertUom(qty, fromUnit, toUnit, sku) {
  if (!sku || !sku.altUnit || !sku.altUnitConversion) return qty;
  const normFrom = normalizeUnit(fromUnit);
  const normTo = normalizeUnit(toUnit);
  const normPrimary = normalizeUnit(sku.unit);
  const normAlt = normalizeUnit(sku.altUnit);

  if (normFrom === normTo || !normFrom || !normTo) {
    return qty;
  }

  if (normFrom === normPrimary && normTo === normAlt) {
    return convertPrimaryToAlt(qty, sku);
  }

  if (normFrom === normAlt && normTo === normPrimary) {
    return convertAltToPrimary(qty, sku);
  }

  return qty;
}

function formatUomFormula(sku) {
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

function formatUomConversionSummary(sku) {
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

module.exports = {
  getUnitRank,
  roundUomQty,
  getUomDirection,
  validateUomConversion,
  parseConversionFactor,
  convertPrimaryToAlt,
  convertAltToPrimary,
  convertUom,
  formatUomFormula,
  formatUomConversionSummary,
};

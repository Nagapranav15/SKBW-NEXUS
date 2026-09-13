const assert = require('assert');
const {
  convertPrimaryToAlt,
  convertAltToPrimary,
  convertUom,
  formatUomFormula,
  formatUomConversionSummary,
  validateUomConversion,
  getUomDirection
} = require('./src/utils/uomConversion');

console.log('--- RUNNING UOM CONVERSION TEST SUITE ---');

// ==========================================
// Case 1: Primary = GBL, Alt = PCS, Factor = 200
// ==========================================
console.log('\nTesting Case 1: Primary = GBL, Alt = PCS, Factor = 200');
const skuCase1 = {
  unit: 'GBL',
  altUnit: 'PCS',
  altUnitConversion: 200
};

// Relationship verification:
const formulaCase1 = formatUomFormula(skuCase1);
console.log('Formula Case 1:', formulaCase1);
assert.strictEqual(formulaCase1, '1 GBL = 200 PCS');

// 1 GBL = 200 PCS
assert.strictEqual(convertPrimaryToAlt(1, skuCase1), 200, '1 GBL should be 200 PCS');
// 2 GBL = 400 PCS
assert.strictEqual(convertPrimaryToAlt(2, skuCase1), 400, '2 GBL should be 400 PCS');
// 200 PCS = 1 GBL
assert.strictEqual(convertAltToPrimary(200, skuCase1), 1, '200 PCS should be 1 GBL');
// 100 PCS = 0.5 GBL
assert.strictEqual(convertAltToPrimary(100, skuCase1), 0.5, '100 PCS should be 0.5 GBL');

// Bidirectional convertUom
assert.strictEqual(convertUom(1, 'GBL', 'PCS', skuCase1), 200);
assert.strictEqual(convertUom(2, 'GBL', 'PCS', skuCase1), 400);
assert.strictEqual(convertUom(200, 'PCS', 'GBL', skuCase1), 1);
assert.strictEqual(convertUom(100, 'PCS', 'GBL', skuCase1), 0.5);

console.log('✅ Case 1 passed all assertions!');

// ==========================================
// Case 2: Primary = PCS, Alt = GBL, Factor = 200 (Legacy)
// ==========================================
console.log('\nTesting Case 2: Primary = PCS, Alt = GBL, Factor = 200');
const skuCase2 = {
  unit: 'PCS',
  altUnit: 'GBL',
  altUnitConversion: 200
};

// Relationship verification:
const formulaCase2 = formatUomFormula(skuCase2);
console.log('Formula Case 2:', formulaCase2);
assert.strictEqual(formulaCase2, '1 GBL = 200 PCS');

// 1 GBL = 200 PCS
assert.strictEqual(convertAltToPrimary(1, skuCase2), 200, '1 GBL should be 200 PCS');
// 2 GBL = 400 PCS
assert.strictEqual(convertAltToPrimary(2, skuCase2), 400, '2 GBL should be 400 PCS');
// 200 PCS = 1 GBL
assert.strictEqual(convertPrimaryToAlt(200, skuCase2), 1, '200 PCS should be 1 GBL');
// 100 PCS = 0.5 GBL
assert.strictEqual(convertPrimaryToAlt(100, skuCase2), 0.5, '100 PCS should be 0.5 GBL');

// Bidirectional convertUom
assert.strictEqual(convertUom(1, 'GBL', 'PCS', skuCase2), 200);
assert.strictEqual(convertUom(2, 'GBL', 'PCS', skuCase2), 400);
assert.strictEqual(convertUom(200, 'PCS', 'GBL', skuCase2), 1);
assert.strictEqual(convertUom(100, 'PCS', 'GBL', skuCase2), 0.5);

console.log('✅ Case 2 passed all assertions!');

// ==========================================
// Case 3: Reams & Sheets (Existing DB record: pcs / ream / 500)
// ==========================================
console.log('\nTesting Case 3: Primary = pcs, Alt = ream, Factor = 500');
const skuCase3 = {
  unit: 'pcs',
  altUnit: 'ream',
  altUnitConversion: 500
};
assert.strictEqual(formatUomFormula(skuCase3), '1 ream = 500 pcs');
assert.strictEqual(convertAltToPrimary(1, skuCase3), 500); // 1 ream = 500 pcs
assert.strictEqual(convertPrimaryToAlt(500, skuCase3), 1); // 500 pcs = 1 ream
assert.strictEqual(convertPrimaryToAlt(250, skuCase3), 0.5); // 250 pcs = 0.5 reams
console.log('✅ Case 3 passed all assertions!');

// ==========================================
// Validation & Guardrail Tests
// ==========================================
console.log('\nTesting Validations...');
// Factor <= 0
assert.strictEqual(validateUomConversion('GBL', 'PCS', 0).valid, false);
assert.strictEqual(validateUomConversion('GBL', 'PCS', -10).valid, false);
// Identical units
assert.strictEqual(validateUomConversion('PCS', 'PCS', 100).valid, false);
assert.strictEqual(validateUomConversion('pcs', 'PCS', 100).valid, false);
// Valid inputs
assert.strictEqual(validateUomConversion('GBL', 'PCS', 200).valid, true);
assert.strictEqual(validateUomConversion('PCS', '', undefined).valid, true);

// Double conversion guard (same from and to unit)
assert.strictEqual(convertUom(50, 'PCS', 'PCS', skuCase1), 50);
assert.strictEqual(convertUom(5, 'GBL', 'GBL', skuCase1), 5);

console.log('✅ All validation tests passed!');
console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');

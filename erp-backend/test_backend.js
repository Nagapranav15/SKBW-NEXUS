const assert = require('assert');
const mongoose = require('mongoose');
require('dotenv').config();

// 1. Test UOM Conversions
const {
  convertPrimaryToAlt,
  convertAltToPrimary,
  convertUom,
  formatUomFormula,
  validateUomConversion
} = require('./src/utils/uomConversion');

console.log('=== [1/5] RUNNING UOM CONVERSION TESTS ===');
const skuCase1 = { unit: 'GBL', altUnit: 'PCS', altUnitConversion: 200 };
assert.strictEqual(formatUomFormula(skuCase1), '1 GBL = 200 PCS');
assert.strictEqual(convertPrimaryToAlt(1, skuCase1), 200);
assert.strictEqual(convertAltToPrimary(200, skuCase1), 1);
assert.strictEqual(convertUom(2, 'GBL', 'PCS', skuCase1), 400);
assert.strictEqual(convertUom(400, 'PCS', 'GBL', skuCase1), 2);

const skuCase2 = { unit: 'PCS', altUnit: 'GBL', altUnitConversion: 200 };
assert.strictEqual(formatUomFormula(skuCase2), '1 GBL = 200 PCS');
assert.strictEqual(convertAltToPrimary(1, skuCase2), 200);
assert.strictEqual(convertPrimaryToAlt(200, skuCase2), 1);

assert.strictEqual(validateUomConversion('GBL', 'PCS', 0).valid, false);
assert.strictEqual(validateUomConversion('PCS', 'PCS', 100).valid, false);
assert.strictEqual(validateUomConversion('GBL', 'PCS', 200).valid, true);
console.log('✅ UOM tests passed successfully!');

// 2. Test Party Normalization & Import Logic
console.log('\n=== [2/5] RUNNING PARTY IMPORT & NORMALIZATION TESTS ===');
const partyCtrl = require('./src/controllers/partyController');
const Company = require('./src/models/companyModel');
const Party = require('./src/models/partyModel');
const Route = require('./src/models/routeModel');

async function testPartyFeatures() {
  await mongoose.connect(process.env.MONGO_URI);
  const company = await Company.findOne();
  assert(company, 'Must have at least one company in database to test import');
  const compIdStr = company._id.toString();

  const testPartyName = 'Automated Test Party ' + Date.now();
  const testRouteName = 'Test Automated Route ' + Date.now();
  const testCityName = 'Test City ' + Date.now();

  const req = {
    body: {
      parties: [
        {
          company: compIdStr,
          type: 'customer',
          firmName: testPartyName,
          phone: '9998887776',
          city: testCityName,
          route: testRouteName,
          agentAssigned: 'Test Agent A',
          preferredTransport: 'Test Transport T',
          status: 'Active',
          openingBalance: 1500,
          creditDays: 30,
          creditLimit: 75000
        }
      ]
    },
    user: { fullName: 'Test Runner' }
  };

  let statusCode = 200;
  let jsonRes = null;
  const res = {
    status(c) { statusCode = c; return this; },
    json(d) { jsonRes = d; return this; }
  };

  await partyCtrl.importParties(req, res);
  assert.strictEqual(statusCode, 201, 'importParties should return 201 Created');
  assert(jsonRes && jsonRes.count >= 1, 'Should have imported at least 1 record');

  // Verify created party
  const createdParty = await Party.findOne({ firmName: testPartyName, company: company._id });
  assert(createdParty, 'Created party should exist in database');
  assert.strictEqual(createdParty.status, 'active');
  assert.strictEqual(createdParty.openingBalance, 1500);

  // Clean up
  await Party.deleteMany({ firmName: testPartyName });
  await Route.deleteMany({ name: testRouteName });
  await Party.deleteMany({ firmName: testCityName });
  await Party.deleteMany({ firmName: 'Test Agent A' });
  await Party.deleteMany({ firmName: 'Test Transport T' });
  console.log('✅ Party normalization & Excel import tests passed successfully!');
}

// 3. Test SKU Bulk Import Logic
console.log('\n=== [3/5] RUNNING SKU BULK IMPORT TESTS ===');
const mfgCtrl = require('./src/controllers/mfgInventoryV2Controller');
const SkuV2 = require('./src/models/skuV2Model');

async function testSkuImportFeatures() {
  const company = await Company.findOne();
  const testSkuCode = 'TEST-SKU-' + Date.now();

  const req = {
    body: {
      company: company._id.toString(),
      skus: [
        {
          skuCode: testSkuCode,
          name: 'Test Bulk Import SKU',
          category: 'Finished Goods',
          unit: 'Pcs',
          status: 'Active',
          openingStock: 50
        }
      ]
    },
    user: { id: company._id.toString() }
  };

  let statusCode = 200;
  let jsonRes = null;
  const res = {
    status(c) { statusCode = c; return this; },
    json(d) { jsonRes = d; return this; }
  };

  await mfgCtrl.bulkImportSkus(req, res);
  assert.strictEqual(statusCode, 200, 'bulkImportSkus should return 200 OK');
  assert(jsonRes && jsonRes.importedCount >= 1, 'Imported count should be >= 1');

  // Clean up
  await SkuV2.deleteOne({ skuCode: testSkuCode, company: company._id });
  console.log('✅ SKU bulk import tests passed successfully!');
}

// 4. Test Transaction Import & Preview Logic
console.log('\n=== [4/5] RUNNING TRANSACTION IMPORT & PREVIEW TESTS ===');
const txnCtrl = require('./src/controllers/transactionController');
const Transaction = require('./src/models/transactionModel');

async function testTransactionFeatures() {
  const company = await Company.findOne();
  const testTxnId = 'TXN-TEST-' + Date.now();

  // Test preview
  const previewReq = {
    body: {
      companyId: company._id.toString(),
      transactions: [
        {
          transactionId: testTxnId,
          date: '2026-09-28',
          amount: 500,
          type: 'income',
          category: 'Sales'
        }
      ]
    }
  };
  let previewData = null;
  const previewRes = {
    json(d) { previewData = d; return this; },
    status() { return this; }
  };
  await txnCtrl.previewImport(previewReq, previewRes);
  assert(previewData && previewData.total === 1, 'Preview total should be 1');
  assert.strictEqual(previewData.valid, 1, 'Valid preview items should be 1');

  // Test import
  const importReq = {
    body: {
      companyId: company._id.toString(),
      transactions: [
        {
          transactionId: testTxnId,
          date: '2026-09-28',
          amount: 500,
          type: 'income',
          category: 'Sales'
        }
      ],
      mode: 'merge'
    },
    user: { id: company._id.toString() }
  };
  let importResData = null;
  const importRes = {
    json(d) { importResData = d; return this; },
    status() { return this; }
  };
  await txnCtrl.importTransactions(importReq, importRes);
  assert(importResData && importResData.imported === 1, 'Imported count should be 1');

  // Clean up
  await Transaction.deleteOne({ transactionId: testTxnId, company: company._id });
  console.log('✅ Transaction preview & import tests passed successfully!');
}

// 5. Test Express App Initialization & Routes Health
console.log('\n=== [5/5] TESTING BACKEND APP INITIALIZATION ===');
async function testAppHealth() {
  const app = require('./src/app');
  assert(app, 'Express app should be properly instantiated');
  assert(typeof app.listen === 'function', 'App should have listen method');
  console.log('✅ Express app and all route handlers loaded without errors!');
}

async function runAll() {
  try {
    await testPartyFeatures();
    await testSkuImportFeatures();
    await testTransactionFeatures();
    await testAppHealth();
    console.log('\n🎉🎉🎉 ALL BACKEND IMPORT & EXPORT TESTS PASSED SUCCESSFULLY! 🎉🎉🎉\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST RUNNER FAILED:', err);
    process.exit(1);
  }
}

runAll();

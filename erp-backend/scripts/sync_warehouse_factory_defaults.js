const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const SkuV2 = require('../src/models/skuV2Model');
const WarehouseLocationV2 = require('../src/models/warehouseLocationV2Model');
const InventoryLedger = require('../src/models/inventoryLedgerModelV2');
const InventoryLedgerV2 = require('../src/models/inventoryLedgerV2Model');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/skbw_erp';

async function syncWarehouseDefaults() {
  try {
    console.log('Connecting to MongoDB...', MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    // 1. Find all distinct companies
    const skuCompanies = await SkuV2.distinct('company');
    const locCompanies = await WarehouseLocationV2.distinct('company');
    const allCompanyIds = Array.from(new Set([...skuCompanies, ...locCompanies].filter(Boolean).map(c => String(c))));

    console.log(`Found ${allCompanyIds.length} company contexts.`);

    for (const compId of allCompanyIds) {
      console.log(`\nProcessing company: ${compId}`);
      const companyObjId = new mongoose.Types.ObjectId(compId);

      // Check / Create Default Warehouse Hierarchy
      let locations = await WarehouseLocationV2.find({ company: companyObjId });
      let factory = locations.find(l => l.level === "Factory");
      let floor = locations.find(l => l.level === "Floor");
      let zone = locations.find(l => l.level === "Zone");
      let storageLoc = locations.find(l => l.level === "Storage Location");

      if (!factory) {
        factory = await WarehouseLocationV2.create({
          name: "SKBW Factory",
          level: "Factory",
          parentId: null,
          capacity: 1000000,
          unit: "kg",
          status: "Active",
          company: companyObjId
        });
        console.log(` Created Factory: SKBW Factory (${factory._id})`);
      }

      if (!floor) {
        floor = await WarehouseLocationV2.create({
          name: "Ground Floor",
          level: "Floor",
          parentId: factory._id,
          capacity: 500000,
          unit: "kg",
          status: "Active",
          company: companyObjId
        });
        console.log(` Created Floor: Ground Floor (${floor._id})`);
      }

      if (!zone) {
        zone = await WarehouseLocationV2.create({
          name: "Main Storage Zone",
          level: "Zone",
          parentId: floor._id,
          capacity: 250000,
          unit: "kg",
          status: "Active",
          company: companyObjId
        });
        console.log(` Created Zone: Main Storage Zone (${zone._id})`);
      }

      if (!storageLoc) {
        storageLoc = await WarehouseLocationV2.create({
          name: "Bay A1",
          level: "Storage Location",
          parentId: zone._id,
          capacity: 100000,
          unit: "kg",
          status: "Active",
          company: companyObjId
        });
        console.log(` Created Storage Location: Bay A1 (${storageLoc._id})`);
      }

      // Update SKUs in bulk
      const updateResult = await SkuV2.updateMany(
        {
          company: companyObjId,
          $or: [
            { initialLocation: { $exists: false } },
            { initialLocation: "" },
            { initialLocation: "Main Warehouse - Bay A1" },
            { initialLocation: "None" },
            { defaultLocation: { $exists: false } },
            { defaultLocation: "" },
            { defaultLocation: "Main Warehouse - Bay A1" },
            { defaultLocation: "None" }
          ]
        },
        {
          $set: {
            initialLocation: "SKBW Factory",
            defaultLocation: "SKBW Factory",
            initialLocationId: String(storageLoc._id)
          }
        }
      );
      console.log(` Updated ${updateResult.modifiedCount} SKUs to default location 'SKBW Factory'.`);

      // Find SKUs with opening stock that do not yet have ledger records
      const skusWithStock = await SkuV2.find({
        company: companyObjId,
        isDeleted: { $ne: true },
        $or: [
          { openingStock: { $gt: 0 } },
          { presentStock: { $gt: 0 } }
        ]
      }).select('_id skuCode name unit openingStock presentStock').lean();

      console.log(` Found ${skusWithStock.length} SKUs with stock > 0.`);

      const existingLedgerSkuIds = await InventoryLedger.distinct('skuId', {
        company: companyObjId,
        referenceType: 'OpeningStock'
      });
      const existingLedgerSet = new Set(existingLedgerSkuIds.map(id => String(id)));

      const ledgersToInsert = [];
      const v2LedgersToInsert = [];

      for (const s of skusWithStock) {
        if (!existingLedgerSet.has(String(s._id))) {
          const qty = Number(s.openingStock || s.presentStock || 0);
          if (qty > 0) {
            ledgersToInsert.push({
              transactionNumber: `IL-OPEN-${Date.now()}-${String(s._id).slice(-4)}-${Math.floor(Math.random() * 1000)}`,
              transactionType: "Opening Stock",
              skuId: s._id,
              quantity: qty,
              unit: s.unit || "kg",
              direction: "IN",
              referenceType: "OpeningStock",
              referenceId: `OPEN-${s.skuCode}`,
              batchNumber: `OPEN-${s.skuCode}`,
              warehouseId: factory._id,
              floorId: floor._id,
              zoneId: zone._id,
              locationId: storageLoc._id,
              remarks: "Synchronized opening stock into SKBW Factory",
              company: companyObjId,
              status: "Posted"
            });

            v2LedgersToInsert.push({
              timestamp: new Date(),
              transactionType: "OPENING_BALANCE",
              referenceId: `OPEN-${s.skuCode}`,
              skuId: s._id,
              locationId: storageLoc._id,
              qtyIn: qty,
              qtyOut: 0,
              balanceAfter: qty,
              remarks: "Synchronized opening stock into SKBW Factory",
              company: companyObjId
            });
          }
        }
      }

      if (ledgersToInsert.length > 0) {
        await InventoryLedger.insertMany(ledgersToInsert);
        await InventoryLedgerV2.insertMany(v2LedgersToInsert);
        console.log(` Inserted ${ledgersToInsert.length} opening stock ledger entries.`);
      } else {
        console.log(` All SKUs with stock already have opening stock ledger entries.`);
      }
    }

    console.log('\nWarehouse defaults synchronization completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error during synchronization:', err);
    process.exit(1);
  }
}

syncWarehouseDefaults();

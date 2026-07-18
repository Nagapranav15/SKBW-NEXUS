require("dotenv").config();
const mongoose = require("mongoose");
const SkuV2 = require("./src/models/skuV2Model");
const WarehouseLocationV2 = require("./src/models/warehouseLocationV2Model");
const InventoryLedgerV2 = require("./src/models/inventoryLedgerV2Model");
const InventoryLedger = require("./src/models/inventoryLedgerModelV2");
const PurchaseInvoiceV2 = require("./src/models/purchaseInvoiceV2Model");

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  const companyId = new mongoose.Types.ObjectId("6a37734a8b19911c02c4b5ea");

  console.log("SKUs:", await SkuV2.countDocuments({ company: companyId }));
  console.log("Locations:", await WarehouseLocationV2.countDocuments({ company: companyId }));
  console.log("Invoices:", await PurchaseInvoiceV2.countDocuments({ company: companyId }));
  console.log("InventoryLedger (V1 Ledger):", await InventoryLedger.countDocuments({ company: companyId }));
  console.log("InventoryLedgerV2 (V2 Log):", await InventoryLedgerV2.countDocuments({ company: companyId }));

  console.log("\nInventoryLedger documents:");
  const ledgers = await InventoryLedger.find({ company: companyId }).populate('skuId').populate('locationId');
  console.log(JSON.stringify(ledgers, null, 2));

  await mongoose.disconnect();
}

inspect().catch(console.error);

const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/../.env' });

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/skbw_erp';

async function resetOpeningStocks() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const InventoryLedger = require('../src/models/inventoryLedgerModelV2');
    const InventoryLedgerV2 = require('../src/models/inventoryLedgerV2Model');
    const SkuV2 = require('../src/models/skuV2Model');

    const del1 = await InventoryLedger.deleteMany({
      $or: [
        { referenceType: 'OpeningStock' },
        { transactionType: { $in: ['Opening Stock', 'Opening Balance', 'OPENING_BALANCE'] } },
        { remarks: /Synchronized opening stock/i }
      ]
    });
    console.log('Deleted InventoryLedger opening stock entries:', del1.deletedCount);

    const del2 = await InventoryLedgerV2.deleteMany({
      $or: [
        { transactionType: { $in: ['Opening Stock', 'Opening Balance', 'OPENING_BALANCE'] } },
        { remarks: /Synchronized opening stock/i }
      ]
    });
    console.log('Deleted InventoryLedgerV2 opening stock entries:', del2.deletedCount);

    const resSku = await SkuV2.updateMany({}, {
      $set: { openingStock: 0 },
      $unset: { presentStock: '', currentStock: '', stock: '' }
    });
    console.log('Reset SkuV2 opening stock:', resSku.modifiedCount);

    console.log('All opening stocks cleared successfully! Stock & value will now be derived purely from purchase batches.');
    process.exit(0);
  } catch (err) {
    console.error('Error resetting stocks:', err);
    process.exit(1);
  }
}

resetOpeningStocks();

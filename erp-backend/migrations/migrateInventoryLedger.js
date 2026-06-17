/**
 * Migration: Inventory Ledger System
 * Adds new fields to existing Inventory documents,
 * creates MinimumStockLevel records from Item.minStock,
 * and validates data integrity.
 * 
 * Usage: node migrations/migrateInventoryLedger.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");

const Item = require("../src/models/itemModel");
const Inventory = require("../src/models/inventoryModel");
const MinimumStockLevel = require("../src/models/minimumStockLevelModel");

const migrate = async () => {
  await connectDB();
  console.log("=== Inventory Ledger Migration ===\n");

  // Step 1: Add new fields to existing Inventory documents
  console.log("Step 1: Updating existing Inventory documents...");
  const result = await Inventory.updateMany(
    { reserved_quantity: { $exists: false } },
    { $set: { reserved_quantity: 0, last_updated: new Date(), last_movement_id: null } }
  );
  console.log(`  Updated ${result.modifiedCount} documents\n`);

  // Step 2: Create MinimumStockLevel records from Item.minStock
  console.log("Step 2: Creating MinimumStockLevel records...");
  const items = await Item.find({ minStock: { $gt: 0 } });
  let created = 0;
  for (const item of items) {
    try {
      await MinimumStockLevel.findOneAndUpdate(
        { item: item._id, company: item.company },
        { minimum_quantity: item.minStock, reorder_quantity: item.minStock * 2, is_active: true },
        { upsert: true, returnDocument: 'after' }
      );
      created++;
    } catch (err) {
      console.error(`  Error for item ${item.name}: ${err.message}`);
    }
  }
  console.log(`  Created/updated ${created} min stock level records\n`);

  // Step 3: Validate Inventory vs Item.stock totals
  console.log("Step 3: Validating data integrity...");
  const allItems = await Item.find({});
  let mismatches = 0;
  for (const item of allItems) {
    const invEntries = await Inventory.find({ item: item._id });
    const invTotal = invEntries.reduce((sum, inv) => sum + (inv.quantity || 0), 0);
    if (invTotal !== item.stock && invEntries.length > 0) {
      console.log(`  MISMATCH: ${item.name} — Item.stock=${item.stock}, Inventory total=${invTotal}`);
      mismatches++;
    }
  }
  if (mismatches === 0) console.log("  All totals match!\n");
  else console.log(`  ${mismatches} mismatches found (review above)\n`);

  console.log("=== Migration Complete ===");
  process.exit(0);
};

migrate().catch(err => { console.error("Migration failed:", err); process.exit(1); });

/**
 * Rollback: Inventory Ledger System
 * Removes new fields added by migration.
 * Does NOT delete new collections (audit logs, min stock levels) — 
 * those are safe to keep.
 * 
 * Usage: node migrations/rollbackInventoryLedger.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");

const rollback = async () => {
  await connectDB();
  console.log("=== Inventory Ledger Rollback ===\n");

  const db = mongoose.connection.db;

  // Step 1: Remove new fields from Inventory documents
  console.log("Step 1: Removing new fields from Inventory documents...");
  const result = await db.collection("inventories").updateMany(
    {},
    { $unset: { reserved_quantity: "", last_movement_id: "", last_updated: "" } }
  );
  console.log(`  Updated ${result.modifiedCount} documents\n`);

  // Step 2: Remove new fields from StockMovement documents
  console.log("Step 2: Removing new fields from StockMovement documents...");
  const mvResult = await db.collection("stockmovements").updateMany(
    {},
    { $unset: {
      warehouse: "", sectionId: "", from_warehouse: "", from_sectionId: "",
      to_warehouse: "", to_sectionId: "", quantity_before: "", quantity_after: "",
      idempotency_key: "", reason: ""
    }}
  );
  console.log(`  Updated ${mvResult.modifiedCount} documents\n`);

  console.log("Note: InventoryAuditLog, MinimumStockLevel, and OpeningStockEntry collections were NOT dropped.");
  console.log("Drop them manually if needed:\n");
  console.log("  db.inventoryauditlogs.drop()");
  console.log("  db.minimumstocklevels.drop()");
  console.log("  db.openingstockentries.drop()");

  console.log("\n=== Rollback Complete ===");
  process.exit(0);
};

rollback().catch(err => { console.error("Rollback failed:", err); process.exit(1); });

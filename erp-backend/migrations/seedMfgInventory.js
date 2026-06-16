/**
 * Seed script for Manufacturing Inventory System
 * Seeds: Factories, Floors, Zones, SKUs, BOMs, and sample Movements
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Factory = require("../src/models/factoryModel");
const Floor = require("../src/models/floorModel");
const Zone = require("../src/models/zoneModel");
const Sku = require("../src/models/skuModel");
const Bom = require("../src/models/bomModel");
const MfgMovement = require("../src/models/mfgMovementModel");
const User = require("../src/models/userModel");

const COMPANY_ID = "69f484e7eee8dc85d80afa0e"; // Notebook Manufacturing Co.

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to DB\n");

  // Get any user for createdBy
  const admin = await User.findOne({});
  const userId = admin?._id || null;
  console.log(`Using user: ${admin?.fullName || "none"}\n`);

  // ── Clean existing mfg data for this company ──
  console.log("Cleaning existing manufacturing data...");
  await MfgMovement.deleteMany({ company: COMPANY_ID });
  await Bom.deleteMany({ company: COMPANY_ID });
  await Zone.deleteMany({ company: COMPANY_ID });
  await Floor.deleteMany({ company: COMPANY_ID });
  await Factory.deleteMany({ company: COMPANY_ID });
  await Sku.deleteMany({ company: COMPANY_ID });
  console.log("Done\n");

  // ── FACTORIES ──
  console.log("Creating factories...");
  const [f1, f2] = await Factory.insertMany([
    { name: "Main Factory", code: "MF-01", company: COMPANY_ID },
    { name: "Warehouse Unit", code: "WH-01", company: COMPANY_ID }
  ]);
  console.log(`  Created ${f1.name}, ${f2.name}\n`);

  // ── FLOORS ──
  console.log("Creating floors...");
  const [fl1, fl2, fl3, fl4] = await Floor.insertMany([
    { name: "Ground Floor", factory_id: f1._id, company: COMPANY_ID },
    { name: "First Floor", factory_id: f1._id, company: COMPANY_ID },
    { name: "Second Floor", factory_id: f1._id, company: COMPANY_ID },
    { name: "Storage Floor", factory_id: f2._id, company: COMPANY_ID }
  ]);
  console.log(`  Created ${4} floors\n`);

  // ── ZONES ──
  console.log("Creating zones...");
  const zoneData = [
    { zone_code: "GF-A", name: "Raw Material Store", floor_id: fl1._id, factory_id: f1._id, company: COMPANY_ID },
    { zone_code: "GF-B", name: "Paper Cutting", floor_id: fl1._id, factory_id: f1._id, company: COMPANY_ID },
    { zone_code: "GF-C", name: "Binding Section", floor_id: fl1._id, factory_id: f1._id, company: COMPANY_ID },
    { zone_code: "1F-A", name: "Printing Press", floor_id: fl2._id, factory_id: f1._id, company: COMPANY_ID },
    { zone_code: "1F-B", name: "Finishing Line", floor_id: fl2._id, factory_id: f1._id, company: COMPANY_ID },
    { zone_code: "2F-A", name: "Quality Check", floor_id: fl3._id, factory_id: f1._id, company: COMPANY_ID },
    { zone_code: "2F-B", name: "Packaging", floor_id: fl3._id, factory_id: f1._id, company: COMPANY_ID },
    { zone_code: "WH-A", name: "Finished Goods Store", floor_id: fl4._id, factory_id: f2._id, company: COMPANY_ID },
    { zone_code: "WH-B", name: "Dispatch Bay", floor_id: fl4._id, factory_id: f2._id, company: COMPANY_ID }
  ];
  const zones = await Zone.insertMany(zoneData);
  const zoneMap = {};
  zones.forEach(z => { zoneMap[z.zone_code] = z._id; });
  console.log(`  Created ${zones.length} zones\n`);

  // ── SKUs ──
  console.log("Creating SKUs...");
  const skuData = [
    // Raw Materials
    { sku_code: "RM-PPR-70", name: "Paper 70 GSM", category: "Raw", brand: "JK Paper", unit_type: "kg", cost_per_unit: 55, company: COMPANY_ID },
    { sku_code: "RM-PPR-80", name: "Paper 80 GSM", category: "Raw", brand: "JK Paper", unit_type: "kg", cost_per_unit: 62, company: COMPANY_ID },
    { sku_code: "RM-CVR", name: "Cover Board 300 GSM", category: "Raw", brand: "ITC", unit_type: "kg", cost_per_unit: 85, company: COMPANY_ID },
    { sku_code: "RM-INK-BLK", name: "Black Printing Ink", category: "Raw", unit_type: "kg", cost_per_unit: 320, company: COMPANY_ID },
    { sku_code: "RM-INK-CLR", name: "Color Printing Ink", category: "Raw", unit_type: "kg", cost_per_unit: 450, company: COMPANY_ID },
    { sku_code: "RM-GLU", name: "Binding Glue", category: "Raw", unit_type: "kg", cost_per_unit: 120, company: COMPANY_ID },
    { sku_code: "RM-THR", name: "Stitching Thread", category: "Raw", unit_type: "pcs", cost_per_unit: 15, company: COMPANY_ID },
    { sku_code: "RM-SHRINK", name: "Shrink Wrap Film", category: "Raw", unit_type: "kg", cost_per_unit: 180, company: COMPANY_ID },
    // Semi-Finished
    { sku_code: "SF-BLK-200", name: "Paper Block 200pg", category: "Semi", pages: 200, unit_type: "pcs", cost_per_unit: 28, company: COMPANY_ID },
    { sku_code: "SF-BLK-100", name: "Paper Block 100pg", category: "Semi", pages: 100, unit_type: "pcs", cost_per_unit: 16, company: COMPANY_ID },
    { sku_code: "SF-CVR-A4", name: "Printed Cover A4", category: "Semi", unit_type: "pcs", cost_per_unit: 8, company: COMPANY_ID },
    // Finished Goods
    { sku_code: "FG-NB-200L", name: "Notebook 200pg Long", category: "Finished", pages: 200, default_books_per_gbl: 20, unit_type: "gbl", cost_per_unit: 750, company: COMPANY_ID },
    { sku_code: "FG-NB-100L", name: "Notebook 100pg Long", category: "Finished", pages: 100, default_books_per_gbl: 25, unit_type: "gbl", cost_per_unit: 480, company: COMPANY_ID },
    { sku_code: "FG-NB-200R", name: "Notebook 200pg Regular", category: "Finished", pages: 200, default_books_per_gbl: 20, unit_type: "gbl", cost_per_unit: 700, company: COMPANY_ID },
    { sku_code: "FG-NB-100R", name: "Notebook 100pg Regular", category: "Finished", pages: 100, default_books_per_gbl: 25, unit_type: "gbl", cost_per_unit: 430, company: COMPANY_ID },
    { sku_code: "FG-REG-60", name: "Register 60pg", category: "Finished", pages: 60, default_books_per_gbl: 30, unit_type: "gbl", cost_per_unit: 350, company: COMPANY_ID },
  ];
  const skus = await Sku.insertMany(skuData);
  const skuMap = {};
  skus.forEach(s => { skuMap[s.sku_code] = s._id; });
  console.log(`  Created ${skus.length} SKUs\n`);

  // ── BOMs ──
  console.log("Creating BOMs...");
  await Bom.insertMany([
    {
      name: "Notebook 200pg Long", output_sku: skuMap["FG-NB-200L"], output_quantity: 1,
      components: [
        { sku: skuMap["SF-BLK-200"], quantity: 20, unit: "pcs" },
        { sku: skuMap["SF-CVR-A4"], quantity: 20, unit: "pcs" },
        { sku: skuMap["RM-GLU"], quantity: 0.5, unit: "kg" },
        { sku: skuMap["RM-THR"], quantity: 40, unit: "pcs" }
      ],
      company: COMPANY_ID
    },
    {
      name: "Notebook 100pg Long", output_sku: skuMap["FG-NB-100L"], output_quantity: 1,
      components: [
        { sku: skuMap["SF-BLK-100"], quantity: 25, unit: "pcs" },
        { sku: skuMap["SF-CVR-A4"], quantity: 25, unit: "pcs" },
        { sku: skuMap["RM-GLU"], quantity: 0.3, unit: "kg" },
        { sku: skuMap["RM-THR"], quantity: 50, unit: "pcs" }
      ],
      company: COMPANY_ID
    },
    {
      name: "Paper Block 200pg", output_sku: skuMap["SF-BLK-200"], output_quantity: 50,
      components: [
        { sku: skuMap["RM-PPR-70"], quantity: 25, unit: "kg" }
      ],
      notes: "Cuts 25kg paper into 50 blocks of 200 pages",
      company: COMPANY_ID
    }
  ]);
  console.log("  Created 3 BOMs\n");

  // ── SAMPLE MOVEMENTS ──
  console.log("Creating sample movements...");
  const today = new Date();
  const daysAgo = (d) => { const dt = new Date(today); dt.setDate(dt.getDate() - d); return dt; };

  const movementData = [
    // Raw material purchases (IN to GF-A)
    { type: "IN", to_zone: zoneMap["GF-A"], sku: skuMap["RM-PPR-70"], quantity: 500, unit: "kg", cost_per_unit: 55, source: "purchase", remarks: "Purchase from JK Paper", createdAt: daysAgo(15) },
    { type: "IN", to_zone: zoneMap["GF-A"], sku: skuMap["RM-PPR-80"], quantity: 300, unit: "kg", cost_per_unit: 62, source: "purchase", remarks: "Purchase from JK Paper", createdAt: daysAgo(14) },
    { type: "IN", to_zone: zoneMap["GF-A"], sku: skuMap["RM-CVR"], quantity: 100, unit: "kg", cost_per_unit: 85, source: "purchase", remarks: "Cover board stock", createdAt: daysAgo(13) },
    { type: "IN", to_zone: zoneMap["GF-A"], sku: skuMap["RM-INK-BLK"], quantity: 25, unit: "kg", cost_per_unit: 320, source: "purchase", remarks: "Black ink refill", createdAt: daysAgo(12) },
    { type: "IN", to_zone: zoneMap["GF-A"], sku: skuMap["RM-GLU"], quantity: 50, unit: "kg", cost_per_unit: 120, source: "purchase", remarks: "Binding glue stock", createdAt: daysAgo(12) },
    { type: "IN", to_zone: zoneMap["GF-A"], sku: skuMap["RM-THR"], quantity: 2000, unit: "pcs", cost_per_unit: 15, source: "purchase", remarks: "Thread rolls", createdAt: daysAgo(11) },
    { type: "IN", to_zone: zoneMap["GF-A"], sku: skuMap["RM-SHRINK"], quantity: 30, unit: "kg", cost_per_unit: 180, source: "purchase", createdAt: daysAgo(10) },

    // Transfer raw to cutting (GF-A → GF-B)
    { type: "TRANSFER", from_zone: zoneMap["GF-A"], to_zone: zoneMap["GF-B"], sku: skuMap["RM-PPR-70"], quantity: 200, unit: "kg", remarks: "Paper to cutting", createdAt: daysAgo(10) },
    { type: "TRANSFER", from_zone: zoneMap["GF-A"], to_zone: zoneMap["GF-B"], sku: skuMap["RM-PPR-80"], quantity: 100, unit: "kg", remarks: "Paper to cutting", createdAt: daysAgo(9) },

    // Paper cutting produces blocks (OUT paper, IN blocks to GF-B)
    { type: "OUT", from_zone: zoneMap["GF-B"], sku: skuMap["RM-PPR-70"], quantity: 100, unit: "kg", source: "usage", remarks: "Cut into 200pg blocks", createdAt: daysAgo(8) },
    { type: "IN", to_zone: zoneMap["GF-B"], sku: skuMap["SF-BLK-200"], quantity: 200, unit: "pcs", source: "production", remarks: "200pg blocks produced", createdAt: daysAgo(8) },
    { type: "OUT", from_zone: zoneMap["GF-B"], sku: skuMap["RM-PPR-70"], quantity: 50, unit: "kg", source: "usage", remarks: "Cut into 100pg blocks", createdAt: daysAgo(7) },
    { type: "IN", to_zone: zoneMap["GF-B"], sku: skuMap["SF-BLK-100"], quantity: 200, unit: "pcs", source: "production", remarks: "100pg blocks produced", createdAt: daysAgo(7) },

    // Transfer blocks to printing (GF-B → 1F-A)
    { type: "TRANSFER", from_zone: zoneMap["GF-B"], to_zone: zoneMap["1F-A"], sku: skuMap["SF-BLK-200"], quantity: 150, unit: "pcs", remarks: "To printing", createdAt: daysAgo(6) },

    // Covers produced at printing
    { type: "IN", to_zone: zoneMap["1F-A"], sku: skuMap["SF-CVR-A4"], quantity: 500, unit: "pcs", source: "production", remarks: "Covers printed", createdAt: daysAgo(6) },

    // Transfer to finishing (1F-A → 1F-B)
    { type: "TRANSFER", from_zone: zoneMap["1F-A"], to_zone: zoneMap["1F-B"], sku: skuMap["SF-BLK-200"], quantity: 100, unit: "pcs", remarks: "To finishing", createdAt: daysAgo(5) },
    { type: "TRANSFER", from_zone: zoneMap["1F-A"], to_zone: zoneMap["1F-B"], sku: skuMap["SF-CVR-A4"], quantity: 100, unit: "pcs", remarks: "Covers to finishing", createdAt: daysAgo(5) },

    // Finished notebooks produced (IN to 2F-B packaging)
    { type: "IN", to_zone: zoneMap["2F-B"], sku: skuMap["FG-NB-200L"], quantity: 5, unit: "gbl", cost_per_unit: 750, source: "production", remarks: "5 GBL of 200pg Long notebooks", books_per_gbl: 20, createdAt: daysAgo(4) },
    { type: "IN", to_zone: zoneMap["2F-B"], sku: skuMap["FG-NB-100L"], quantity: 4, unit: "gbl", cost_per_unit: 480, source: "production", remarks: "4 GBL of 100pg Long notebooks", books_per_gbl: 25, createdAt: daysAgo(3) },

    // Transfer finished to warehouse (2F-B → WH-A)
    { type: "TRANSFER", from_zone: zoneMap["2F-B"], to_zone: zoneMap["WH-A"], sku: skuMap["FG-NB-200L"], quantity: 3, unit: "gbl", remarks: "To warehouse", createdAt: daysAgo(2) },
    { type: "TRANSFER", from_zone: zoneMap["2F-B"], to_zone: zoneMap["WH-A"], sku: skuMap["FG-NB-100L"], quantity: 3, unit: "gbl", remarks: "To warehouse", createdAt: daysAgo(2) },

    // Dispatch (OUT from WH-A)
    { type: "OUT", from_zone: zoneMap["WH-A"], sku: skuMap["FG-NB-200L"], quantity: 1, unit: "gbl", cost_per_unit: 750, source: "dispatch", remarks: "Dispatch to Delhi distributor", createdAt: daysAgo(1) },

    // Recent purchases
    { type: "IN", to_zone: zoneMap["GF-A"], sku: skuMap["RM-PPR-70"], quantity: 300, unit: "kg", cost_per_unit: 55, source: "purchase", remarks: "Restock paper", createdAt: daysAgo(0) },
    { type: "IN", to_zone: zoneMap["GF-A"], sku: skuMap["RM-INK-CLR"], quantity: 10, unit: "kg", cost_per_unit: 450, source: "purchase", remarks: "Color ink purchase", createdAt: daysAgo(0) },
  ];

  // Add company and createdBy to all
  for (const m of movementData) {
    m.company = COMPANY_ID;
    if (userId) m.createdBy = userId;
  }
  await MfgMovement.insertMany(movementData);
  console.log(`  Created ${movementData.length} movements\n`);

  console.log("=== Seed Complete ===");
  console.log(`  Factories: 2`);
  console.log(`  Floors: 4`);
  console.log(`  Zones: 9`);
  console.log(`  SKUs: ${skus.length}`);
  console.log(`  BOMs: 3`);
  console.log(`  Movements: ${movementData.length}`);
  process.exit(0);
};

seed().catch(e => { console.error("Seed failed:", e); process.exit(1); });

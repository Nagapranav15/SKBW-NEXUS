/**
 * Migrate validated legacy data into the new stock and receivables ledgers.
 *
 *   node scripts/migrate_to_core.js --company "<name or id>"                       DRY RUN (default, read-only)
 *   node scripts/migrate_to_core.js --company "<name or id>" --apply --yes          write to the database
 *
 * Options
 *   --cutover YYYY-MM-DD       date of the opening balances (default: today)
 *   --party-field <auto|outstandingBalance|outstanding>   which legacy balance field to trust (default auto)
 *   --only <stock|parties>     migrate just one part
 *   --allow-cost-conflicts     migrate items whose legacy cost fields disagree (first field in priority order wins)
 *   --reconcile                only compare new ledgers with the legacy figures
 *
 * Legacy data is never modified. A JSON report is written to erp-backend/migration-reports/ (git-ignored).
 * Re-running --apply is safe: already-migrated items and customers are skipped.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
if (!process.env.MONGO_URI) { console.error("MONGO_URI is not set (see .env.example)"); process.exit(1); }

const mongoose = require("mongoose");
// All models must be registered before the services use them
require("../src/models/skuV2Model");
require("../src/models/partyModel");
require("../src/models/inventoryLedgerModelV2");
require("../src/models/salesInvoiceModel");
require("../src/models/companyModel");
require("../src/core/stock/models");
require("../src/core/sales/models");
const Company = require("../src/models/companyModel");
const migration = require("../src/core/migration/migrationService");

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const fmt = (n) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

(async () => {
  const wanted = opt("company");
  if (!wanted) throw new Error("--company is required (name or id). Run without --apply for a dry run.");
  const apply = flag("apply");
  if (apply && !flag("yes")) throw new Error("Refusing to write without --yes. Run the dry run first and check the report.");

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000, family: 4 });
  const companies = await Company.find().lean();
  const company = companies.find((c) => String(c._id) === wanted || c.name.toLowerCase() === wanted.toLowerCase());
  if (!company) throw new Error(`Company not found: ${wanted}. Known: ${companies.map((c) => c.name).join(", ")}`);
  const host = new URL(process.env.MONGO_URI.replace("mongodb+srv://", "https://").replace("mongodb://", "https://")).hostname;
  console.log(`\nCompany: ${company.name} (${company._id})\nDatabase host: ${host}\nMode: ${flag("reconcile") ? "RECONCILE" : apply ? "APPLY (writes)" : "DRY RUN (read-only)"}\n`);

  const common = { partyField: opt("party-field") || "auto", only: opt("only"), allowCostConflicts: flag("allow-cost-conflicts") };
  let report;
  if (flag("reconcile")) {
    report = await migration.reconcile(company._id, common);
  } else if (apply) {
    report = await migration.applyCompany(company._id, { ...common, cutoverDate: opt("cutover") });
  } else {
    report = await migration.inspectCompany(company._id, { partyField: common.partyField });
    const s = report.stock, p = report.parties;
    console.log(`STOCK   items with stock: ${s.itemsWithStock} | ready to migrate: ${s.migratable} | blocked: ${s.blocked} | negative: ${s.negative}`);
    console.log(`        quantity to migrate: ${fmt(s.quantityToMigrate)} | value: ₹${fmt(s.valueToMigrate)}`);
    const byIssue = {};
    s.items.forEach((i) => i.issues.forEach((x) => { (byIssue[x] = byIssue[x] || []).push(i.skuCode); }));
    Object.entries(byIssue).forEach(([k, v]) => console.log(`        ${k}: ${v.length} item(s), e.g. ${v.slice(0, 5).join(", ")}`));
    console.log(`PARTIES customers owing: ${p.customersOwing} | total outstanding: ₹${fmt(p.totalOutstanding)} | with issues: ${p.withIssues}`);
    console.log(`ALREADY MIGRATED stock entries: ${report.alreadyMigrated.stockEntries} | opening balances: ${report.alreadyMigrated.openingBalances}`);
  }

  if (apply) {
    console.log(`Stock posted: ${report.stock.posted.length}, skipped: ${report.stock.skipped.length}, failed: ${report.stock.failed.length}`);
    console.log(`Parties posted: ${report.parties.posted.length}, skipped: ${report.parties.skipped.length}, failed: ${report.parties.failed.length}`);
  }
  const rec = report.reconciliation || (flag("reconcile") ? report : null);
  if (rec) {
    console.log(`\nRECONCILIATION: ${rec.ok ? "OK, new ledgers match the legacy figures" : `${rec.mismatches.length} MISMATCH(ES)`}`);
    if (rec.stock) console.log(`  stock   legacy ${fmt(rec.stock.legacyQty)} / ₹${fmt(rec.stock.legacyValue)}  ->  migrated ${fmt(rec.stock.migratedQty)} / ₹${fmt(rec.stock.migratedValue)}`);
    if (rec.parties) console.log(`  parties legacy ₹${fmt(rec.parties.legacyOutstanding)}  ->  migrated ₹${fmt(rec.parties.migratedBalance)}`);
    rec.mismatches.slice(0, 20).forEach((m) => console.log("  -", JSON.stringify(m)));
  }

  const dir = path.join(__dirname, "..", "migration-reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${company.name.replace(/[^a-z0-9]+/gi, "_")}-${flag("reconcile") ? "reconcile" : apply ? "apply" : "dryrun"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\nFull report: ${file}`);
  if (!apply && !flag("reconcile")) console.log("\nNothing was changed. To migrate, review the report, then add --apply --yes.");
})().catch((e) => { console.error("\nERROR:", e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());

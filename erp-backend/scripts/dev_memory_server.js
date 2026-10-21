/**
 * Throwaway backend on an in-memory MongoDB, seeded with demo data, for trying the UI without touching a real database.
 *   node scripts/dev_memory_server.js          (listens on 5001; login admin / admin123)
 * Everything disappears when the process stops.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "dev-memory-secret-".padEnd(48, "x");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
require("../src/core/companyScope").registerPlugin();
const app = require("../src/app");
const Role = require("../src/models/roleModel");
const User = require("../src/models/userModel");
const Company = require("../src/models/companyModel");
const SkuV2 = require("../src/models/skuV2Model");
const Party = require("../src/models/partyModel");
const Warehouse = require("../src/models/warehouseLocationV2Model");
const { hashPassword } = require("../src/utils/hash");

(async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  const company = await Company.create({ name: "Demo Binding Works", address: "Vijayawada", phone: "9999999999", email: "demo@example.com", gst: "DEMO" });
  const role = await Role.create({ name: "admin", permissions: [] });
  await User.create({ username: "admin", fullName: "Demo Admin", email: "admin@demo.test", password: await hashPassword("admin123"), role: role._id, companies: [] });
  const mk = (skuCode, name, unit, extra = {}) => SkuV2.create({ skuCode, name, category: "Paper", unit, company: company._id, ...extra });
  await mk("RM-001", "52 GSM Writing Paper (Reel)", "KG", { gsm: 52 });
  await mk("RM-002", "60 GSM Cream Wove (Reel)", "KG", { gsm: 60 });
  await mk("SM-001", "57 x 70 cm Plain Sheets 52 GSM", "PCS");
  const factory = await Warehouse.create({ name: "Main Factory", level: "Factory", parentId: null, company: company._id });
  const floor = await Warehouse.create({ name: "Ground Floor", level: "Floor", parentId: factory._id, company: company._id });
  const zone = await Warehouse.create({ name: "Paper Store", level: "Zone", parentId: floor._id, company: company._id });
  await Warehouse.create({ name: "Rack A1", level: "Storage Location", parentId: zone._id, company: company._id });
  await Warehouse.create({ name: "Sheeter Floor", level: "Storage Location", parentId: floor._id, company: company._id });
  await Party.create({ type: "vendor", firmName: "Demo Paper Mills", company: company._id });
  // Demo sales data so the Management page has something to show
  const SalesInvoice = require("../src/models/salesInvoiceModel");
  const stockSvc = require("../src/core/stock/stockService");
  const salesSvc = require("../src/core/sales/salesService");
  const scope = require("../src/core/companyScope");
  await scope.runWithScope({ superAdmin: true }, async () => {
    const paper = await SkuV2.findOne({ skuCode: "RM-001" });
    const b = await stockSvc.receiveReels({ companyId: company._id, itemId: paper._id, ratePerKg: 80, reels: [{ reelNumber: "D-1", weightKg: 500 }] });
    const sheets = await SkuV2.findOne({ skuCode: "SM-001" });
    await require("../src/core/conversions/conversionService").postSheeting({
      companyId: company._id, reelItemId: paper._id, targetItemId: sheets._id, reels: [{ reelId: b.reels[0]._id, weightKg: 500 }],
      sheet: { widthCm: 57, lengthCm: 70, gsm: 52 }, actualSheets: 24000, additionalCosts: [{ kind: "PROCESSING", amount: 3000 }],
    });
    const mkCust = (name, extra = {}) => Party.create({ type: "customer", firmName: name, company: company._id, creditDays: 30, ...extra });
    const alpha = await mkCust("Alpha Books", { creditLimit: 100000 });
    const beta = await mkCust("Beta Stationers", { creditLimit: 50000 });
    const gamma = await mkCust("Gamma Traders");
    const inv = async (party, total, date, orderNumber) => {
      const i = await SalesInvoice.create({ invoiceNumber: `INV-${Math.floor(Math.random() * 90000 + 10000)}`, invoiceDate: date, customerId: party._id, customerName: party.firmName, grandTotal: total, company: company._id, status: "created", orderNumber });
      await salesSvc.postInvoice({ companyId: company._id, invoiceId: String(i._id) });
    };
    const d = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    await salesSvc.setOpeningBalance({ companyId: company._id, partyId: gamma._id, amount: 25000, date: d(120) });
    await inv(alpha, 84000, d(70)); await inv(alpha, 52000, d(35)); await inv(alpha, 31000, d(5));
    await inv(beta, 18000, d(50)); await inv(beta, 9500, d(8));
    await salesSvc.recordPayment({ companyId: company._id, partyId: alpha._id, amount: 100000, mode: "BANK", date: d(3) });
    await salesSvc.recordPayment({ companyId: company._id, partyId: beta._id, amount: 9500, mode: "UPI", date: d(2) });
  });
  const PORT = parseInt(process.env.PORT || "5001", 10);
  app.listen(PORT, "127.0.0.1", () => console.log(`Memory backend on http://127.0.0.1:${PORT} (admin / admin123), company ${company._id}`));
})().catch((e) => { console.error(e); process.exit(1); });

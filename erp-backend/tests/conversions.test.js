/**
 * Conversions posted through the stock engine on a real (in-memory) replica set: costs, reel consumption,
 * atomic rollback, multi-output allocation, slitting, immutability and company isolation.
 */
process.env.JWT_SECRET = "test-secret-".padEnd(48, "x");
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const scope = require("../src/core/companyScope");
scope.registerPlugin();
const app = require("../src/app");
const Role = require("../src/models/roleModel");
const Permission = require("../src/models/permissionModel");
const User = require("../src/models/userModel");
const Company = require("../src/models/companyModel");
const SkuV2 = require("../src/models/skuV2Model");
const stock = require("../src/core/stock/stockService");
const conv = require("../src/core/conversions/conversionService");
const { StockLedger, Reel } = require("../src/core/stock/models");
const { Conversion } = require("../src/core/conversions/models");
const { generateToken } = require("../src/utils/jwt");

const asAdmin = (fn) => scope.runWithScope({ superAdmin: true }, fn);
const run = asAdmin;
let repl, A, B, paper, sheets, ruled, itemB, loc, tokens;

const mkItem = (company, skuCode, unit) => SkuV2.create({ skuCode, name: skuCode, category: "Paper", unit, company: company._id });
const cost = (companyId, itemId) => asAdmin(() => stock.getItemCost(companyId, itemId));
const recon = (companyId, itemId) => asAdmin(() => stock.reconcile(companyId, itemId));
const reelByNo = (no) => asAdmin(() => Reel.findOne({ companyId: A._id, reelNumber: no }).lean());

const buyReels = (reels, ratePerKg = 80, itemId = paper._id) =>
  run(() => stock.receiveReels({ companyId: A._id, itemId, locationId: loc, ratePerKg, purchaseRef: "PB-T", reels }));

test.before(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  await asAdmin(async () => {
    A = await Company.create({ name: "A", address: "a", phone: "1", email: "a@a.com", gst: "A" });
    B = await Company.create({ name: "B", address: "b", phone: "2", email: "b@b.com", gst: "B" });
    paper = await mkItem(A, "RM-PAPER", "KG");
    sheets = await mkItem(A, "SM-SHEETS", "PCS");
    ruled = await mkItem(A, "SM-RULED", "PCS");
    itemB = await mkItem(B, "RM-PAPER-B", "KG");
    loc = new mongoose.Types.ObjectId();
    const perms = await Permission.insertMany(["MANAGE_INVENTORY", "VIEW_INVENTORY"].map((name) => ({ name })));
    const manager = await Role.create({ name: "manager", permissions: perms.map((p) => p._id) });
    const mk = (username, companies) => User.create({ username, fullName: username, email: `${username}@t.com`, password: "x", role: manager._id, companies });
    tokens = { alice: generateToken(await mk("alice", [A._id])), bob: generateToken(await mk("bob", [B._id])) };
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await repl.stop();
});

test("sheeting: reels become sheets, cost flows through, reels are consumed and traced", async () => {
  const bought = await buyReels([{ reelNumber: "R1", weightKg: 300, gsm: 52, widthCm: 57 }, { reelNumber: "R2", weightKg: 200, gsm: 52, widthCm: 57 }]);
  const [r1, r2] = bought.reels;
  const res = await run(() => conv.postSheeting({
    companyId: A._id, reelItemId: paper._id, targetItemId: sheets._id, sourceLocationId: loc, destinationLocationId: loc,
    reels: [{ reelId: r1._id, weightKg: 300 }, { reelId: r2._id, weightKg: 200 }],
    sheet: { widthCm: 57, lengthCm: 70, gsm: 52 }, machine: { reelsOnStand: 2, slitsCount: 3 },
    actualSheets: 24000, additionalCosts: [{ kind: "PROCESSING", description: "Sheeter charges", amount: 3000 }], machineName: "Sheeter 01",
  }));
  const c = res.conversion;
  assert.equal(c.number, "CS-0001");
  assert.equal(c.totalInputValue, 40000); // 500 kg at the 80/kg average
  assert.equal(c.netCost, 43000);
  assert.equal(c.outputs[0].qty, 24000);
  assert.equal(c.outputs[0].value, 43000);
  assert.equal(c.outputs[0].unitCost, 1.7917);
  assert.equal(c.sheeting.theoreticalSheets, 24099);
  assert.equal(c.sheeting.costPer4Up, 0.4479);
  assert.equal(c.sheeting.actualReams, 48);
  // Stock moved: paper gone, sheets in at 43,000
  assert.deepEqual(await cost(A._id, paper._id).then((x) => [x.qty, x.value]), [0, 0]);
  assert.deepEqual(await cost(A._id, sheets._id).then((x) => [x.qty, x.value]), [24000, 43000]);
  // Reels consumed and traceable to the conversion's ledger entry
  assert.equal((await reelByNo("R1")).status, "Consumed");
  assert.equal((await reelByNo("R2")).remainingWeightKg, 0);
  assert.equal(c.inputs[0].reels.length, 2);
  assert.ok(c.inputs[0].ledgerId && c.outputs[0].ledgerId);
  assert.equal((await recon(A._id, paper._id)).ok && (await recon(A._id, sheets._id)).ok, true);
});

test("sheeting: an impossible yield is rejected and nothing is posted", async () => {
  const b = await buyReels([{ reelNumber: "R3", weightKg: 500 }]);
  const before = await asAdmin(() => StockLedger.countDocuments({ companyId: A._id }));
  await assert.rejects(run(() => conv.postSheeting({
    companyId: A._id, reelItemId: paper._id, targetItemId: sheets._id, destinationLocationId: loc, sourceLocationId: loc,
    reels: [{ reelId: b.reels[0]._id, weightKg: 500 }], sheet: { widthCm: 57, lengthCm: 70, gsm: 52 }, actualSheets: 30000,
  })), (e) => e.code === "INVALID_SHEETING");
  assert.equal(await asAdmin(() => StockLedger.countDocuments({ companyId: A._id })), before);
  assert.equal((await reelByNo("R3")).remainingWeightKg, 500);
});

test("sheeting: a partly used reel stays available with its remaining weight", async () => {
  const r3 = await reelByNo("R3");
  await run(() => conv.postSheeting({
    companyId: A._id, reelItemId: paper._id, targetItemId: sheets._id, sourceLocationId: loc, destinationLocationId: loc,
    reels: [{ reelId: r3._id, weightKg: 150 }], sheet: { widthCm: 57, lengthCm: 70, gsm: 52 }, actualSheets: 7000,
  }));
  const after = await reelByNo("R3");
  assert.equal(after.remainingWeightKg, 350);
  assert.equal(after.status, "Available");
});

test("a consumed reel cannot be used again, and the attempt leaves no trace", async () => {
  const r1 = await reelByNo("R1");
  const before = await asAdmin(() => StockLedger.countDocuments({ companyId: A._id }));
  await assert.rejects(run(() => conv.postSheeting({
    companyId: A._id, reelItemId: paper._id, targetItemId: sheets._id, sourceLocationId: loc, destinationLocationId: loc,
    reels: [{ reelId: r1._id, weightKg: 10 }], sheet: { widthCm: 57, lengthCm: 70, gsm: 52 }, actualSheets: 400,
  })), (e) => e.code === "REEL_UNAVAILABLE");
  assert.equal(await asAdmin(() => StockLedger.countDocuments({ companyId: A._id })), before);
});

test("failure while posting the output rolls back inputs, reels and the conversion number", async (t) => {
  const r3 = await reelByNo("R3");
  const paperBefore = await cost(A._id, paper._id);
  const convBefore = await asAdmin(() => Conversion.countDocuments({ companyId: A._id }));
  const original = StockLedger.create.bind(StockLedger);
  let calls = 0;
  // The first ledger write (the input) succeeds; the second (the output) crashes
  t.mock.method(StockLedger, "create", async (...args) => { if (++calls === 2) throw new Error("simulated crash"); return original(...args); });
  await assert.rejects(run(() => conv.postSheeting({
    companyId: A._id, reelItemId: paper._id, targetItemId: sheets._id, sourceLocationId: loc, destinationLocationId: loc,
    reels: [{ reelId: r3._id, weightKg: 100 }], sheet: { widthCm: 57, lengthCm: 70, gsm: 52 }, actualSheets: 4000,
  })), /simulated crash/);
  t.mock.restoreAll();
  assert.equal((await reelByNo("R3")).remainingWeightKg, 350);
  const paperAfter = await cost(A._id, paper._id);
  assert.deepEqual([paperAfter.qty, paperAfter.value], [paperBefore.qty, paperBefore.value]);
  assert.equal(await asAdmin(() => Conversion.countDocuments({ companyId: A._id })), convBefore);
  const next = await run(() => conv.postSheeting({
    companyId: A._id, reelItemId: paper._id, targetItemId: sheets._id, sourceLocationId: loc, destinationLocationId: loc,
    reels: [{ reelId: r3._id, weightKg: 100 }], sheet: { widthCm: 57, lengthCm: 70, gsm: 52 }, actualSheets: 4000,
  }));
  assert.equal(next.conversion.number, "CS-0003"); // CS-0001 and CS-0002 were posted; the failed attempt consumed no number
});

test("ruling: job-work charge is added and wastage is absorbed by the good output", async () => {
  // sheets on hand: 24,000 (43,000) + 7,000 + 4,000 from the other tests; use the live average
  const avg = await cost(A._id, sheets._id);
  const res = await run(() => conv.postConversion({
    companyId: A._id, type: "RULING", reference: "JOB-77",
    inputs: [{ itemId: sheets._id, locationId: loc, qty: 1000 }],
    outputs: [{ itemId: ruled._id, locationId: loc, qty: 980 }],
    charges: [{ kind: "JOB_WORK", description: "Ruling job work", amount: 500 }],
    wastageQty: 20, wastageNote: "Spoilt in ruling",
  }));
  const c = res.conversion;
  const expectedInput = Math.round((1000 * (avg.value / avg.qty) + Number.EPSILON) * 100) / 100;
  assert.equal(c.totalInputValue, expectedInput);
  assert.equal(c.netCost, Math.round((expectedInput + 500) * 100) / 100);
  assert.equal(c.outputs[0].value, c.netCost);
  assert.equal(c.outputs[0].qty, 980); // 20 wasted
  assert.ok(c.outputs[0].unitCost > c.inputs[0].unitCost); // wastage + job work make the output dearer
  assert.equal((await recon(A._id, ruled._id)).ok, true);
});

test("several outputs share the cost by costShare and the shares add up exactly", async () => {
  const x = await asAdmin(() => mkItem(A, "SM-X", "PCS"));
  const a = await asAdmin(() => mkItem(A, "SM-A", "PCS"));
  const b = await asAdmin(() => mkItem(A, "SM-B", "PCS"));
  await run(() => stock.receive({ companyId: A._id, itemId: x._id, locationId: loc, qty: 10, unitCost: 40 })); // 400
  const res = await run(() => conv.postConversion({
    companyId: A._id, type: "BINDING",
    inputs: [{ itemId: x._id, locationId: loc, qty: 10 }],
    outputs: [{ itemId: a._id, locationId: loc, qty: 100, costShare: 3 }, { itemId: b._id, locationId: loc, qty: 100, costShare: 1 }],
  }));
  assert.deepEqual(res.conversion.outputs.map((o) => o.value), [300, 100]);
  const odd = await run(() => stock.receive({ companyId: A._id, itemId: x._id, locationId: loc, qty: 1, totalValue: 100 }));
  const res3 = await run(() => conv.postConversion({
    companyId: A._id, type: "BINDING", inputs: [{ itemId: x._id, locationId: loc, qty: 1 }],
    outputs: [{ itemId: a._id, locationId: loc, qty: 1 }, { itemId: b._id, locationId: loc, qty: 1 }, { itemId: ruled._id, locationId: loc, qty: 1 }],
  }));
  const sum = Math.round(res3.conversion.outputs.reduce((s, o) => s + o.value, 0) * 100) / 100;
  assert.equal(sum, res3.conversion.netCost); // 100 / 3 does not divide evenly, but nothing is lost
  assert.ok(odd.entry);
});

test("slitting: one reel becomes smaller reels with their own cost and traceability", async () => {
  const big = await asAdmin(() => mkItem(A, "RM-BIG", "KG"));
  const small = await asAdmin(() => mkItem(A, "RM-SMALL", "KG"));
  const bought = await buyReels([{ reelNumber: "BIG-1", weightKg: 300, gsm: 60, widthCm: 114 }], 90, big._id);
  const res = await run(() => conv.postConversion({
    companyId: A._id, type: "SLITTING",
    inputs: [{ itemId: big._id, locationId: loc, qty: 300, reels: [{ reelId: bought.reels[0]._id, weightKg: 300 }] }],
    outputs: [{ itemId: small._id, locationId: loc, qty: 290, reels: [{ reelNumber: "SM-1", weightKg: 145, gsm: 60, widthCm: 57 }, { reelNumber: "SM-2", weightKg: 145, gsm: 60, widthCm: 57 }] }],
    wastageQty: 10, charges: [{ kind: "PROCESSING", amount: 580 }],
  }));
  const out = res.conversion.outputs[0];
  assert.equal(out.reelIds.length, 2);
  assert.equal(out.value, 27580); // 300 kg x 90 = 27,000 + 580
  const sm1 = await reelByNo("SM-1");
  assert.equal(sm1.unitCostPerKg, 95.1034); // 27,580 / 290 kg
  assert.equal(String(sm1.receiptLedgerId), String(out.ledgerId));
  assert.equal((await reelByNo("BIG-1")).status, "Consumed");
  await assert.rejects(run(() => conv.postConversion({
    companyId: A._id, type: "SLITTING", inputs: [{ itemId: small._id, locationId: loc, qty: 10 }],
    outputs: [{ itemId: big._id, locationId: loc, qty: 10, reels: [{ reelNumber: "X", weightKg: 5 }] }],
  })), (e) => e.code === "REEL_WEIGHT_MISMATCH");
});

test("reel weights must add up to the input quantity", async () => {
  const b = await buyReels([{ reelNumber: "R-MM", weightKg: 100 }]);
  await assert.rejects(run(() => conv.postConversion({
    companyId: A._id, type: "SLITTING", inputs: [{ itemId: paper._id, locationId: loc, qty: 90, reels: [{ reelId: b.reels[0]._id, weightKg: 100 }] }],
    outputs: [{ itemId: sheets._id, locationId: loc, qty: 1 }],
  })), (e) => e.code === "REEL_WEIGHT_MISMATCH");
  assert.equal((await reelByNo("R-MM")).remainingWeightKg, 100);
});

test("the same idempotency key posts one conversion", async () => {
  const x = await asAdmin(() => mkItem(A, "SM-IDEM-IN", "PCS"));
  const y = await asAdmin(() => mkItem(A, "SM-IDEM-OUT", "PCS"));
  await run(() => stock.receive({ companyId: A._id, itemId: x._id, locationId: loc, qty: 10, unitCost: 5 }));
  const p = { companyId: A._id, type: "BINDING", idempotencyKey: "conv-key-0001", inputs: [{ itemId: x._id, locationId: loc, qty: 4 }], outputs: [{ itemId: y._id, locationId: loc, qty: 4 }] };
  const first = await run(() => conv.postConversion(p));
  const again = await run(() => conv.postConversion(p));
  assert.equal(first.duplicate, false);
  assert.equal(again.duplicate, true);
  assert.equal(String(again.conversion._id), String(first.conversion._id));
  assert.equal((await cost(A._id, x._id)).qty, 6); // consumed once
});

test("posted conversions cannot be edited or deleted", async () => {
  const c = await asAdmin(() => Conversion.findOne({ companyId: A._id }));
  await assert.rejects(Conversion.updateOne({ _id: c._id }, { $set: { netCost: 1 } }), /cannot be edited or deleted/);
  await assert.rejects(Conversion.deleteOne({ _id: c._id }), /cannot be edited or deleted/);
});

test("an item from another company cannot be used in a conversion", async () => {
  await assert.rejects(run(() => conv.postConversion({
    companyId: A._id, type: "BINDING", inputs: [{ itemId: itemB._id, locationId: loc, qty: 1 }], outputs: [{ itemId: sheets._id, locationId: loc, qty: 1 }],
  })), (e) => e.code === "ITEM_NOT_FOUND");
});

// ── HTTP + company isolation ────────────────────────────────────────────────

const post = (url, who, body) => request(app).post(url).set("Authorization", `Bearer ${tokens[who]}`).send(body);
const get = (url, who) => request(app).get(url).set("Authorization", `Bearer ${tokens[who]}`);

test("API: a company user posts a sheeting for their own company", async () => {
  const b = await run(() => stock.receiveReels({ companyId: A._id, itemId: paper._id, locationId: loc, ratePerKg: 80, reels: [{ reelNumber: "API-1", weightKg: 100 }] }));
  const res = await post("/api/v3/conversions/sheeting", "alice", {
    reelItemId: String(paper._id), targetItemId: String(sheets._id), sourceLocationId: String(loc), destinationLocationId: String(loc),
    reels: [{ reelId: String(b.reels[0]._id), weightKg: 100 }], sheet: { widthCm: 57, lengthCm: 70, gsm: 52 }, actualSheets: 4800,
  });
  assert.equal(res.status, 201);
  assert.equal(String(res.body.conversion.companyId), String(A._id));
  assert.equal(res.body.conversion.totalInputValue, 8000);
});

test("API: a user of A cannot use B's company ID or B's items and sees only A's conversions", async () => {
  assert.equal((await post("/api/v3/conversions", "alice", { companyId: String(B._id), type: "BINDING", inputs: [{ itemId: String(itemB._id), qty: 1 }], outputs: [{ itemId: String(itemB._id), qty: 1 }] })).status, 403);
  assert.equal((await post("/api/v3/conversions", "alice", { type: "BINDING", inputs: [{ itemId: String(itemB._id), qty: 1 }], outputs: [{ itemId: String(sheets._id), qty: 1 }] })).status, 404);
  assert.equal((await get(`/api/v3/conversions?companyId=${B._id}`, "alice")).status, 403);
  const list = await get("/api/v3/conversions", "alice");
  assert.equal(list.status, 200);
  assert.ok(list.body.rows.length > 0 && list.body.rows.every((r) => String(r.companyId) === String(A._id)));
  const bobList = await get("/api/v3/conversions", "bob");
  assert.equal(bobList.body.rows.length, 0);
  const one = list.body.rows[0];
  assert.equal((await get(`/api/v3/conversions/${one._id}`, "bob")).status, 404); // by-ID read from another company
});

test("API: invalid sheeting input is rejected with a clear error", async () => {
  const res = await post("/api/v3/conversions/sheeting", "alice", { reelItemId: String(paper._id), targetItemId: String(sheets._id), reels: [], sheet: { widthCm: 57, lengthCm: 70, gsm: 52 } });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "VALIDATION");
});

test("API: sheeting preview shows the result and posts nothing", async () => {
  const b = await run(() => stock.receiveReels({ companyId: A._id, itemId: paper._id, locationId: loc, ratePerKg: 80, reels: [{ reelNumber: "PRE-1", weightKg: 500 }] }));
  const before = await asAdmin(() => StockLedger.countDocuments({ companyId: A._id }));
  const res = await post("/api/v3/conversions/sheeting/preview", "alice", {
    reelItemId: String(paper._id), targetItemId: String(sheets._id), reels: [{ reelId: String(b.reels[0]._id), weightKg: 500 }],
    sheet: { widthCm: 57, lengthCm: 70, gsm: 52 }, machine: { reelsOnStand: 2, slitsCount: 3 }, actualSheets: 24000, additionalCosts: [{ kind: "PROCESSING", amount: 3000 }],
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.theoreticalSheets, 24099);
  assert.equal(res.body.isEstimate, true);
  assert.equal(res.body.netCost, 43000); // 500 kg x 80 + 3,000
  assert.equal(res.body.costPer4Up, 0.4479);
  assert.equal(await asAdmin(() => StockLedger.countDocuments({ companyId: A._id })), before);
  assert.equal((await reelByNo("PRE-1")).remainingWeightKg, 500);
  const impossible = await post("/api/v3/conversions/sheeting/preview", "alice", {
    reelItemId: String(paper._id), targetItemId: String(sheets._id), reels: [{ reelId: String(b.reels[0]._id), weightKg: 500 }],
    sheet: { widthCm: 57, lengthCm: 70, gsm: 52 }, actualSheets: 30000,
  });
  assert.equal(impossible.status, 400);
});

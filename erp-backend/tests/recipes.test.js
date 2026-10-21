/**
 * Recipe engine. NOTE: the numbers below are ILLUSTRATIVE test inputs, not SKBW factory rules.
 * Real notebook sizes, ups, pages-per-leaf, wastage and rates must be supplied by the factory.
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
const { computeRecipe } = require("../src/core/recipes/recipeEngine");
const Role = require("../src/models/roleModel");
const Permission = require("../src/models/permissionModel");
const User = require("../src/models/userModel");
const Company = require("../src/models/companyModel");
const SkuV2 = require("../src/models/skuV2Model");
const stock = require("../src/core/stock/stockService");
const { generateToken } = require("../src/utils/jwt");

const spec = { pages: 100, pagesPerLeaf: 2, ups: 4, piecesPerBundle: 10 };
const paper = { key: "paper", role: "PAPER", basis: "PER_PARENT_SHEET", wastagePct: 2, unitCost: 1.7917 };

test("pages, leaves and parent sheets per book come from the recipe data", () => {
  const r = computeRecipe({ spec, materials: [paper], books: 1000 });
  assert.equal(r.leavesPerBook, 50); // 100 pages / 2 pages per leaf
  assert.equal(r.parentSheetsPerBook, 12.5); // 50 leaves / 4 ups
  const eight = computeRecipe({ spec: { ...spec, ups: 8 }, materials: [paper], books: 1000 });
  assert.equal(eight.parentSheetsPerBook, 6.25);
  const single = computeRecipe({ spec: { ...spec, pagesPerLeaf: 1 }, materials: [paper], books: 1000 });
  assert.equal(single.leavesPerBook, 100); // the factory's definition of a "page" changes the answer: it must be data
});

test("paper requirement includes wastage; cost = gross quantity x unit cost", () => {
  const r = computeRecipe({ spec, materials: [paper], books: 1000 });
  const line = r.materials[0];
  assert.equal(line.qtyPerBook, 12.5);
  assert.equal(line.grossQtyPerBook, 12.75); // +2%
  assert.equal(line.requiredQty, 12750);
  assert.equal(line.costPerBook, 22.8442); // 12.75 x 1.7917
  assert.equal(line.cost, 22844.18);
});

test("per-book, per-bundle and per-sheet bases", () => {
  const r = computeRecipe({
    spec,
    materials: [paper, { key: "cover", role: "COVER", basis: "PER_BOOK", qty: 1, unitCost: 3 }, { key: "carton", role: "PACKING", basis: "PER_BUNDLE", qty: 1, unitCost: 5 }],
    processes: [{ key: "ruling", kind: "RULING", basis: "PER_PARENT_SHEET", rate: 0.2 }, { key: "binding", kind: "BINDING", basis: "PER_BOOK", rate: 1.5 }, { key: "tape", kind: "OTHER", basis: "PER_BUNDLE", rate: 2 }],
    books: 1000,
  });
  const by = (k) => r.materials.find((m) => m.key === k) || r.processes.find((p) => p.key === k);
  assert.equal(by("cover").requiredQty, 1000);
  assert.equal(by("carton").qtyPerBook, 0.1); // 1 carton per bundle of 10
  assert.equal(by("carton").requiredQty, 100); // 100 bundles
  assert.equal(by("ruling").costPerBook, 2.5); // 12.5 parent sheets x 0.2
  assert.equal(by("binding").costPerBook, 1.5);
  assert.equal(by("tape").costPerBook, 0.2); // 2 per bundle / 10 books
  // material 22.8442 + 3 + 0.5 = 26.3442; process 2.5 + 1.5 + 0.2 = 4.2
  assert.equal(r.materialCostPerBook, 26.3442);
  assert.equal(r.processCostPerBook, 4.2);
  assert.equal(r.costPerBook, 30.5442);
  assert.equal(r.costPerBundle, 305.44);
  assert.equal(r.bundles, 100);
});

test("process wastage inflates the charge basis", () => {
  const r = computeRecipe({ spec, materials: [paper], processes: [{ key: "ruling", kind: "RULING", basis: "PER_PARENT_SHEET", rate: 0.2, wastagePct: 10 }], books: 100 });
  assert.equal(r.processes[0].costPerBook, 2.75); // 12.5 x 1.10 x 0.2
});

test("invalid recipes are rejected, nothing is assumed", () => {
  assert.throws(() => computeRecipe({ spec: { ...spec, pagesPerLeaf: undefined }, materials: [paper], books: 10 }), /Pages per leaf/);
  assert.throws(() => computeRecipe({ spec: { ...spec, ups: 0 }, materials: [paper], books: 10 }), /Ups/);
  assert.throws(() => computeRecipe({ spec: { ...spec, piecesPerBundle: 0 }, materials: [paper], books: 10 }), /Pieces per bundle/);
  assert.throws(() => computeRecipe({ spec, materials: [paper], books: 0 }), /Number of books/);
  assert.throws(() => computeRecipe({ spec, materials: [{ ...paper, wastagePct: 150 }], books: 10 }), /wastage/);
  assert.throws(() => computeRecipe({ spec, materials: [{ key: "x", role: "COVER", basis: "PER_BOOK", unitCost: 1 }], books: 10 }), /quantity/);
  assert.throws(() => computeRecipe({ spec, materials: [{ ...paper, basis: "PER_MAGIC" }], books: 10 }), /Unknown material basis/);
});

// ── service + API ───────────────────────────────────────────────────────────

const asAdmin = (fn) => scope.runWithScope({ superAdmin: true }, fn);
let repl, A, B, parent, cover, itemB, loc, tokens;
const mkItem = (c, code, unit) => SkuV2.create({ skuCode: code, name: code, category: "X", unit, company: c._id });
const post = (url, who, body) => request(app).post(url).set("Authorization", `Bearer ${tokens[who]}`).send(body);
const put = (url, who, body) => request(app).put(url).set("Authorization", `Bearer ${tokens[who]}`).send(body);
const get = (url, who) => request(app).get(url).set("Authorization", `Bearer ${tokens[who]}`);
let recipeId;

test.before(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  await asAdmin(async () => {
    A = await Company.create({ name: "A", address: "a", phone: "1", email: "a@a.com", gst: "A" });
    B = await Company.create({ name: "B", address: "b", phone: "2", email: "b@b.com", gst: "B" });
    parent = await mkItem(A, "SM-PARENT", "PCS");
    cover = await mkItem(A, "RM-COVER", "PCS");
    itemB = await mkItem(B, "SM-B", "PCS");
    loc = new mongoose.Types.ObjectId();
    const perms = await Permission.insertMany(["MANAGE_INVENTORY", "VIEW_INVENTORY"].map((name) => ({ name })));
    const manager = await Role.create({ name: "manager", permissions: perms.map((p) => p._id) });
    const mk = (username, companies) => User.create({ username, fullName: username, email: `${username}@t.com`, password: "x", role: manager._id, companies });
    tokens = { alice: generateToken(await mk("alice", [A._id])), bob: generateToken(await mk("bob", [B._id])) };
    await stock.receive({ companyId: A._id, itemId: parent._id, locationId: loc, qty: 20000, unitCost: 1.7917 });
    await stock.receive({ companyId: A._id, itemId: cover._id, locationId: loc, qty: 500, unitCost: 3 });
  });
});
test.after(async () => { await mongoose.disconnect(); await repl.stop(); });

const body = () => ({
  name: "Test notebook", spec,
  materials: [
    { key: "paper", role: "PAPER", itemId: String(parent._id), basis: "PER_PARENT_SHEET", wastagePct: 2 },
    { key: "cover", role: "COVER", itemId: String(cover._id), basis: "PER_BOOK", qty: 1 },
  ],
  processes: [{ key: "ruling", kind: "RULING", basis: "PER_PARENT_SHEET", rate: 0.2 }],
});

test("API: create a recipe, calculate with live moving-average costs and availability", async () => {
  const c = await post("/api/v3/recipes", "alice", body());
  assert.equal(c.status, 201);
  recipeId = c.body._id;
  const calc = await post(`/api/v3/recipes/${recipeId}/calculate`, "alice", { books: 1000 });
  assert.equal(calc.status, 200);
  assert.equal(calc.body.costPerBook, 28.3442); // paper 22.8442 + cover 3 + ruling 2.5
  const paperAv = calc.body.availability.find((a) => a.itemId === String(parent._id));
  assert.deepEqual([paperAv.required, paperAv.onHand, paperAv.shortfall], [12750, 20000, 0]);
  const coverAv = calc.body.availability.find((a) => a.itemId === String(cover._id));
  assert.deepEqual([coverAv.required, coverAv.onHand, coverAv.shortfall], [1000, 500, 500]); // only 500 covers in stock
  assert.equal(calc.body.canProduce, false);
});

test("API: planning by bundles gives the same as books", async () => {
  const byBundles = await post(`/api/v3/recipes/${recipeId}/calculate`, "alice", { bundles: 100 });
  assert.equal(byBundles.body.books, 1000);
  assert.equal((await post(`/api/v3/recipes/${recipeId}/calculate`, "alice", { books: 1, bundles: 1 })).status, 400);
});

test("API: costs follow the moving average when stock is received at a new price", async () => {
  await asAdmin(() => stock.receive({ companyId: A._id, itemId: cover._id, locationId: loc, qty: 500, unitCost: 5 })); // 500@3 + 500@5 -> avg 4
  const calc = await post(`/api/v3/recipes/${recipeId}/calculate`, "alice", { books: 1000 });
  assert.equal(calc.body.materials.find((m) => m.key === "cover").unitCost, 4);
  assert.equal(calc.body.canProduce, true);
});

test("API: every update is a new version", async () => {
  const upd = await put(`/api/v3/recipes/${recipeId}`, "alice", { spec: { ...spec, ups: 8 } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.version, 2);
  const calc = await post(`/api/v3/recipes/${recipeId}/calculate`, "alice", { books: 1000 });
  assert.equal(calc.body.parentSheetsPerBook, 6.25);
  assert.equal(calc.body.recipeVersion, 2);
});

test("API: duplicate names and items of another company are rejected", async () => {
  assert.equal((await post("/api/v3/recipes", "alice", body())).status, 409);
  const other = body();
  other.name = "Uses B's item";
  other.materials[0].itemId = String(itemB._id);
  assert.equal((await post("/api/v3/recipes", "alice", other)).status, 404);
});

test("API: recipes are isolated per company", async () => {
  assert.equal((await get(`/api/v3/recipes/${recipeId}`, "bob")).status, 404);
  assert.equal((await post(`/api/v3/recipes/${recipeId}/calculate`, "bob", { books: 1 })).status, 404);
  assert.equal((await put(`/api/v3/recipes/${recipeId}`, "bob", { name: "Hijacked" })).status, 404);
  assert.equal((await get(`/api/v3/recipes?companyId=${A._id}`, "bob")).status, 403);
  assert.equal((await get("/api/v3/recipes", "bob")).body.length, 0);
  assert.equal((await get("/api/v3/recipes", "alice")).body.length, 1);
});

test("API: invalid recipe input is rejected", async () => {
  const bad = body();
  bad.name = "Bad";
  bad.spec.pagesPerLeaf = undefined;
  assert.equal((await post("/api/v3/recipes", "alice", bad)).status, 400);
  const dupKeys = body();
  dupKeys.name = "Dup keys";
  dupKeys.materials.push({ ...dupKeys.materials[0] });
  assert.equal((await post("/api/v3/recipes", "alice", dupKeys)).status, 400);
});

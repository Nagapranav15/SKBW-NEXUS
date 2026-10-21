/**
 * Company isolation: a user of Company A must never reach Company B data, by query parameter,
 * by ID, by body, or via direct model access. The super admin (role "admin") can reach every company.
 * Runs against an in-memory MongoDB; never touches a real database.
 */
process.env.JWT_SECRET = "test-secret-".padEnd(48, "x");
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const scope = require("../src/core/companyScope");
scope.registerPlugin(); // before any model is compiled
const app = require("../src/app");
const Role = require("../src/models/roleModel");
const Permission = require("../src/models/permissionModel");
const User = require("../src/models/userModel");
const Company = require("../src/models/companyModel");
const Party = require("../src/models/partyModel");
const { generateToken } = require("../src/utils/jwt");

const asSuperAdmin = (fn) => scope.runWithScope({ superAdmin: true }, fn);
let mongod, A, B, partyA, partyB, tokens;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  await asSuperAdmin(async () => {
    A = await Company.create({ name: "Company A", address: "a", phone: "1", email: "a@a.com", gst: "A" });
    B = await Company.create({ name: "Company B", address: "b", phone: "2", email: "b@b.com", gst: "B" });
    const perms = await Permission.insertMany(["MANAGE_PARTIES", "VIEW_COMPANIES"].map((name) => ({ name })));
    const adminRole = await Role.create({ name: "admin", permissions: [] });
    const managerRole = await Role.create({ name: "manager", permissions: perms.map((p) => p._id) });

    const mk = (username, role, companies) =>
      User.create({ username, fullName: username, email: `${username}@t.com`, password: "x", role: role._id, companies });
    const users = {
      root: await mk("root", adminRole, []),
      alice: await mk("alice", managerRole, [A._id]),
      bob: await mk("bob", managerRole, [B._id]),
      carol: await mk("carol", managerRole, []),
    };
    tokens = Object.fromEntries(Object.entries(users).map(([k, u]) => [k, generateToken(u)]));

    partyA = await Party.create({ type: "customer", firmName: "Party of A", company: A._id });
    partyB = await Party.create({ type: "customer", firmName: "Party of B", company: B._id });
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const get = (url, who) => request(app).get(url).set("Authorization", `Bearer ${tokens[who]}`);
const names = (res) => (res.body.parties || res.body.data || res.body || []).map((p) => p.firmName);

test("user of A can list A's data", async () => {
  const res = await get(`/api/parties?company=${A._id}`, "alice");
  assert.equal(res.status, 200);
  assert.deepEqual(names(res), ["Party of A"]);
});

test("user of A is denied when asking for company B by query", async () => {
  const res = await get(`/api/parties?company=${B._id}`, "alice");
  assert.equal(res.status, 403);
});

test("user of A cannot read B's record by ID (even without a company parameter)", async () => {
  const res = await get(`/api/parties/${partyB._id}`, "alice");
  assert.equal(res.status, 404);
  assert.ok(!JSON.stringify(res.body).includes("Party of B"));
});

test("user of A cannot modify B's record by ID", async () => {
  const res = await request(app)
    .put(`/api/parties/${partyB._id}`)
    .set("Authorization", `Bearer ${tokens.alice}`)
    .send({ firmName: "HACKED" });
  assert.notEqual(res.status, 200);
  const stored = await asSuperAdmin(() => Party.findById(partyB._id).lean());
  assert.equal(stored.firmName, "Party of B");
});

test("user of A cannot create data in company B via the body", async () => {
  const res = await request(app)
    .post("/api/parties")
    .set("Authorization", `Bearer ${tokens.alice}`)
    .send({ type: "customer", firmName: "Injected", company: String(B._id) });
  assert.equal(res.status, 403);
  const injected = await asSuperAdmin(() => Party.countDocuments({ firmName: "Injected" }));
  assert.equal(injected, 0);
});

test("company list only shows the user's own company", async () => {
  const res = await get("/api/companies", "alice");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((c) => c.name), ["Company A"]);
});

test("user of B sees only B", async () => {
  const res = await get(`/api/parties?company=${B._id}`, "bob");
  assert.deepEqual(names(res), ["Party of B"]);
  assert.equal((await get(`/api/parties?company=${A._id}`, "bob")).status, 403);
});

test("user with no company assigned is blocked", async () => {
  const res = await get(`/api/parties?company=${A._id}`, "carol");
  assert.equal(res.status, 403);
});

test("super admin can access every company", async () => {
  assert.deepEqual(names(await get(`/api/parties?company=${A._id}`, "root")), ["Party of A"]);
  assert.deepEqual(names(await get(`/api/parties?company=${B._id}`, "root")), ["Party of B"]);
  const companies = await get("/api/companies", "root");
  assert.equal(companies.body.length, 2);
});

test("direct model access is restricted inside a company scope (find, count, aggregate, save)", async () => {
  const inA = { superAdmin: false, allowedCompanyIds: [String(A._id)], companyIds: [String(A._id)] };
  await scope.runWithScope(inA, async () => {
    assert.deepEqual((await Party.find().lean()).map((p) => p.firmName), ["Party of A"]);
    assert.equal(await Party.countDocuments(), 1);
    assert.equal(await Party.findById(partyB._id), null);
    const agg = await Party.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]);
    assert.equal(agg[0].n, 1);
    await assert.rejects(Party.create({ type: "customer", firmName: "x", company: B._id }), /another company/);
    const stamped = await Party.create({ type: "customer", firmName: "Auto-stamped" });
    assert.equal(String(stamped.company), String(A._id));
    await assert.rejects(Party.updateOne({ _id: partyA._id }, { $set: { company: B._id } }), /another company/);
  });
});

test("a deleted or inactive user's token no longer works", async () => {
  const ghost = await asSuperAdmin(() => User.findOne({ username: "bob" }));
  await asSuperAdmin(() => User.updateOne({ _id: ghost._id }, { status: "inactive" }));
  assert.equal((await get(`/api/parties?company=${B._id}`, "bob")).status, 401);
  await asSuperAdmin(() => User.updateOne({ _id: ghost._id }, { status: "active" }));
});

test("scoped upserts: allowed for the user's own company, refused for another", async () => {
  const inA = { superAdmin: false, allowedCompanyIds: [String(A._id)], companyIds: [String(A._id)] };
  await scope.runWithScope(inA, async () => {
    await Party.updateOne({ firmName: "Upserted in A", company: A._id }, { $setOnInsert: { type: "customer" } }, { upsert: true });
    assert.equal(await Party.countDocuments({ firmName: "Upserted in A" }), 1);
    await assert.rejects(Party.updateOne({ firmName: "Upserted in B", company: B._id }, { $setOnInsert: { type: "customer" } }, { upsert: true }), /another company/);
    await Party.updateOne({ firmName: "Upserted no company" }, { $setOnInsert: { type: "customer" } }, { upsert: true });
    const made = await Party.findOne({ firmName: "Upserted no company" }).lean();
    assert.equal(String(made.company), String(A._id)); // the user's company was stamped
  });
});

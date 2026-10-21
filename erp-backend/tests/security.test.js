/** HTTP hardening: security headers, CORS allowlist, login rate limiting, authenticated realtime stream. */
process.env.JWT_SECRET = "test-secret-".padEnd(48, "x");
process.env.RATE_LIMIT_LOGIN_MAX = "3";
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const scope = require("../src/core/companyScope");
scope.registerPlugin();
const app = require("../src/app");
const Role = require("../src/models/roleModel");
const User = require("../src/models/userModel");
const Company = require("../src/models/companyModel");
const { generateToken } = require("../src/utils/jwt");

let mongod, A, B, token;
const asSuperAdmin = (fn) => scope.runWithScope({ superAdmin: true }, fn);

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await asSuperAdmin(async () => {
    A = await Company.create({ name: "A", address: "a", phone: "1", email: "a@a.com", gst: "A" });
    B = await Company.create({ name: "B", address: "b", phone: "2", email: "b@b.com", gst: "B" });
    const role = await Role.create({ name: "manager", permissions: [] });
    const u = await User.create({ username: "alice", fullName: "alice", email: "a@t.com", password: "x", role: role._id, companies: [A._id] });
    token = generateToken(u);
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test("security headers are set and the framework is not advertised", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.headers["x-powered-by"], undefined);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.ok(res.headers["strict-transport-security"]);
  assert.match(res.headers["content-security-policy"], /default-src 'none'/);
  assert.equal(res.headers["cache-control"], "no-store");
});

test("CORS allows the real frontend and blocks other origins", async () => {
  const ok = await request(app).get("/api/health").set("Origin", "https://www.skbw.in");
  assert.equal(ok.headers["access-control-allow-origin"], "https://www.skbw.in");
  const bad = await request(app).get("/api/health").set("Origin", "https://evil.example");
  assert.equal(bad.headers["access-control-allow-origin"], undefined);
});

test("CORS preflight from an unknown origin gets no permission headers", async () => {
  const res = await request(app)
    .options("/api/companies")
    .set("Origin", "https://evil.example")
    .set("Access-Control-Request-Method", "GET");
  assert.equal(res.headers["access-control-allow-origin"], undefined);
});

test("realtime stream requires a valid token", async () => {
  assert.equal((await request(app).get(`/api/realtime/stream?companyId=${A._id}`)).status, 401);
  assert.equal((await request(app).get(`/api/realtime/stream?companyId=${A._id}&token=garbage`)).status, 401);
});

test("realtime stream refuses a company the user does not belong to", async () => {
  const res = await request(app).get(`/api/realtime/stream?companyId=${B._id}&token=${token}`);
  assert.equal(res.status, 403);
});

test("repeated failed logins are rate limited", async () => {
  const attempt = () => request(app).post("/api/auth/login").send({ username: "nobody", password: "wrong" });
  for (let i = 0; i < 3; i++) assert.equal((await attempt()).status, 404);
  const blocked = await attempt();
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.msg, /Too many failed login attempts/);
});

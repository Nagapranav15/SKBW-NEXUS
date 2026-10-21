/**
 * Company isolation.
 *
 * Rule: the company a request may touch comes from the authenticated user, never from the request.
 *  - Super admin (role "admin"): unrestricted, may act on any company.
 *  - Everyone else: limited to the companies assigned on their user record.
 *
 * Enforcement is central so it also covers by-ID reads/updates/deletes that controllers never scoped:
 *  1. `attachCompanyScope` (Express) resolves the user from the JWT and runs the rest of the request
 *     inside an AsyncLocalStorage context holding the allowed company IDs.
 *  2. `companyScopePlugin` (global Mongoose plugin, must be registered BEFORE models are compiled)
 *     adds the company filter to every query/aggregate on company-owned collections, stamps the company
 *     on new documents, and blocks writes that point at another company.
 */
const { AsyncLocalStorage } = require("node:async_hooks");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const als = new AsyncLocalStorage();

const FIELD_CANDIDATES = ["company", "companyId"];
const QUERY_OPS = [
  "find", "findOne", "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace",
  "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany", "countDocuments", "distinct",
];
const UPDATE_OPS = ["findOneAndUpdate", "updateOne", "updateMany", "replaceOne", "findOneAndReplace"];

const forbidden = (msg) => Object.assign(new Error(msg), { status: 403 });
const isObjectIdLike = (v) => typeof v === "string" && /^[a-f\d]{24}$/i.test(v);
const toId = (v) => String(v && v._id ? v._id : v);

const getScope = () => als.getStore();
/** Scope that restricts the current request, or null when none applies (super admin / background job). */
const activeRestriction = () => {
  const s = als.getStore();
  return s && !s.superAdmin ? s : null;
};

const companyField = (schema) => FIELD_CANDIDATES.find((f) => schema.path(f));

/** Condition matching any of the given company ids; Mixed paths hold either ObjectIds or strings. */
const companyCondition = (ids, isMixed) => {
  const values = [];
  ids.forEach((id) => {
    values.push(new mongoose.Types.ObjectId(id));
    if (isMixed) values.push(id);
  });
  return { $in: values };
};

const assertAllowedCompanyValue = (value, ids) => {
  if (value === undefined || value === null || value === "") return;
  if (!ids.includes(toId(value))) throw forbidden("Access to another company's data is not allowed");
};

function companyScopePlugin(schema) {
  // The Company collection itself is restricted by _id rather than by a company field
  if (schema.get("scopeById")) {
    schema.pre(QUERY_OPS, function () {
      const s = activeRestriction();
      if (!s) return;
      this.and([{ _id: { $in: s.allowedCompanyIds.map((id) => new mongoose.Types.ObjectId(id)) } }]);
    });
    return;
  }

  const field = companyField(schema);
  if (!field) return;
  const isMixed = schema.path(field).instance === "Mixed";

  schema.pre(QUERY_OPS, function () {
    const s = activeRestriction();
    if (!s) return;
    // A query that already names exactly one company (also needed by upserts, which infer the new document from
    // the filter) is checked against the user's companies instead of getting a second condition on the same field
    const given = this.getFilter()[field];
    const isScalar = given !== undefined && given !== null && (typeof given !== "object" || given instanceof mongoose.Types.ObjectId);
    if (isScalar) {
      if (!s.companyIds.includes(String(given))) throw forbidden("Access to another company's data is not allowed");
      return;
    }
    if (this.getOptions().upsert) {
      if (s.companyIds.length !== 1) throw forbidden("Specify a company for this operation");
      this.where({ [field]: isMixed ? s.companyIds[0] : new mongoose.Types.ObjectId(s.companyIds[0]) });
      return;
    }
    this.and([{ [field]: companyCondition(s.companyIds, isMixed) }]);
  });

  schema.pre(UPDATE_OPS, function () {
    const s = activeRestriction();
    if (!s) return;
    const update = this.getUpdate() || {};
    [update, update.$set, update.$setOnInsert].forEach((part) => {
      if (part && Object.prototype.hasOwnProperty.call(part, field)) assertAllowedCompanyValue(part[field], s.allowedCompanyIds);
    });
  });

  schema.pre("save", function () {
    const s = activeRestriction();
    if (!s) return;
    const current = this.get(field);
    if (current === undefined || current === null || current === "") {
      if (this.isNew && s.companyIds.length === 1) this.set(field, s.companyIds[0]);
      return;
    }
    if (this.isNew || this.isModified(field)) assertAllowedCompanyValue(current, s.allowedCompanyIds);
    // Existing documents are already limited by the query filter that loaded them
  });

  schema.pre("insertMany", function (...args) {
    const s = activeRestriction();
    if (!s) return;
    const docs = args.find(Array.isArray) || [];
    docs.forEach((d) => {
      if (d[field] === undefined || d[field] === null || d[field] === "") {
        if (s.companyIds.length === 1) d[field] = s.companyIds[0];
      } else {
        assertAllowedCompanyValue(d[field], s.allowedCompanyIds);
      }
    });
  });

  schema.pre("aggregate", function () {
    const s = activeRestriction();
    if (!s) return;
    this.pipeline().unshift({ $match: { [field]: companyCondition(s.companyIds, isMixed) } });
  });
}

let registered = false;
/** Must run before any model is compiled (server.js requires this first). */
function registerPlugin() {
  if (registered) return;
  mongoose.plugin(companyScopePlugin);
  registered = true;
}

const collectRequestedCompanyIds = (req) => {
  const out = new Set();
  const add = (v) => {
    const id = v && typeof v === "object" && v._id ? String(v._id) : v;
    if (isObjectIdLike(id)) out.add(String(id));
  };
  ["companyId", "company"].forEach((k) => {
    add(req.query?.[k]);
    if (req.body && typeof req.body === "object") add(req.body[k]);
  });
  return [...out];
};

/**
 * Express middleware. Requests without a token pass through untouched (public routes such as login);
 * every protected route still runs its own authentication afterwards.
 */
async function attachCompanyScope(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next();

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_) {
    return next(); // the route's own auth middleware answers 401
  }

  try {
    const User = mongoose.model("User");
    const user = await User.findById(decoded.id).select("role companies status").populate("role", "name").lean();
    if (!user || user.status !== "active") return res.status(401).json({ msg: "Account not found or inactive" });

    const roleName = user.role && user.role.name;
    if (roleName === "admin") {
      req.companyScope = { superAdmin: true };
      return als.run({ superAdmin: true }, next);
    }

    // Login / profile endpoints don't touch company data
    if (req.originalUrl.startsWith("/api/auth")) return next();

    const allowedCompanyIds = (user.companies || []).map(String);
    if (allowedCompanyIds.length === 0) {
      return res.status(403).json({ msg: "No company is assigned to this user. Ask an administrator to assign one." });
    }

    const requested = collectRequestedCompanyIds(req);
    const denied = requested.find((id) => !allowedCompanyIds.includes(id));
    if (denied) return res.status(403).json({ msg: "You do not have access to this company" });

    const companyIds = requested.length > 0 ? requested : allowedCompanyIds;
    const scope = { superAdmin: false, allowedCompanyIds, companyIds };
    req.companyScope = scope;
    return als.run(scope, next);
  } catch (err) {
    return next(err);
  }
}

module.exports = { registerPlugin, attachCompanyScope, companyScopePlugin, getScope, runWithScope: (scope, fn) => als.run(scope, fn) };

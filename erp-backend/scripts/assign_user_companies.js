/**
 * Assign companies to users (non-admin users can only access their assigned companies).
 *
 *   node scripts/assign_user_companies.js                      list users and companies
 *   node scripts/assign_user_companies.js <username> <company name or id>[,<company name or id>...]
 *   node scripts/assign_user_companies.js <username> none      remove all assignments
 *
 * The super admin (role "admin") always has access to every company; assignments are ignored for them.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
if (!process.env.MONGO_URI) { console.error("MONGO_URI is not set (see .env.example)"); process.exit(1); }
const mongoose = require("mongoose");
require("../src/models/roleModel");
require("../src/models/permissionModel");
const User = require("../src/models/userModel");
const Company = require("../src/models/companyModel");

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000, family: 4 });
  const [username, companyArg] = process.argv.slice(2);
  const companies = await Company.find().lean();
  const users = await User.find().populate("role", "name").lean();

  if (!username) {
    console.log("\nCompanies:");
    companies.forEach(c => console.log(`  ${c._id}  ${c.name}`));
    console.log("\nUsers:");
    users.forEach(u => {
      const names = (u.companies || []).map(id => (companies.find(c => String(c._id) === String(id)) || {}).name || String(id));
      console.log(`  ${u.username.padEnd(20)} ${(u.role && u.role.name || "?").padEnd(12)} ${u.role && u.role.name === "admin" ? "(super admin: all companies)" : names.join(", ") || "NO COMPANY ASSIGNED (will be blocked)"}`);
    });
    return;
  }

  const user = users.find(u => u.username === username);
  if (!user) throw new Error(`User not found: ${username}`);
  let ids = [];
  if (companyArg && companyArg !== "none") {
    ids = companyArg.split(",").map(x => x.trim()).filter(Boolean).map(x => {
      const c = companies.find(c => String(c._id) === x || c.name.toLowerCase() === x.toLowerCase());
      if (!c) throw new Error(`Company not found: ${x}`);
      return c._id;
    });
  }
  await User.updateOne({ _id: user._id }, { $set: { companies: ids } });
  console.log(`Updated ${username}: ${ids.length} company/companies assigned`);
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());

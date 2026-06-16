/**
 * Patch script: Adds new permissions and updates roles WITHOUT clearing data.
 * Safe to run on an existing database.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Permission = require("./src/models/permissionModel");
const Role = require("./src/models/roleModel");

const NEW_PERMISSIONS = ["MANAGE_INVENTORY", "VIEW_INVENTORY", "VIEW_TRANSACTIONS"];

const ROLE_PERMISSION_ADDITIONS = {
  admin: ["MANAGE_INVENTORY", "VIEW_INVENTORY", "VIEW_TRANSACTIONS"],
  manager: ["MANAGE_INVENTORY", "VIEW_INVENTORY", "VIEW_TRANSACTIONS"],
  sales: ["VIEW_INVENTORY"]
};

async function patch() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  // 1. Check existing permissions
  const existing = await Permission.find();
  const existingNames = existing.map(p => p.name);
  console.log("Existing permissions:", existingNames.length);

  // 2. Add missing permissions
  const toAdd = NEW_PERMISSIONS.filter(n => !existingNames.includes(n));
  if (toAdd.length > 0) {
    const created = await Permission.insertMany(toAdd.map(name => ({ name })));
    console.log("Added permissions:", created.map(p => p.name).join(", "));
  } else {
    console.log("All new permissions already exist");
  }

  // 3. Get all permissions for lookup
  const allPerms = await Permission.find();
  const permMap = {};
  allPerms.forEach(p => { permMap[p.name] = p._id; });

  // 4. Update each role
  const roles = await Role.find();
  for (const role of roles) {
    const additions = ROLE_PERMISSION_ADDITIONS[role.name];
    if (!additions) continue;

    const currentPermIds = role.permissions.map(p => p.toString());
    let added = 0;

    for (const permName of additions) {
      const permId = permMap[permName];
      if (permId && !currentPermIds.includes(permId.toString())) {
        role.permissions.push(permId);
        added++;
      }
    }

    if (added > 0) {
      await role.save();
      console.log(`Updated role '${role.name}': added ${added} permissions`);
    } else {
      console.log(`Role '${role.name}': already up to date`);
    }
  }

  // 5. Verify
  const updatedRoles = await Role.find().populate("permissions");
  for (const r of updatedRoles) {
    console.log(`\n  ${r.name.toUpperCase()}: ${r.permissions.map(p => p.name).join(", ")}`);
  }

  console.log("\n✅ Permission patch complete!");
  await mongoose.disconnect();
}

patch().catch(err => {
  console.error("Patch failed:", err);
  process.exit(1);
});

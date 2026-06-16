require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

const Role = require("./src/models/roleModel");
const Permission = require("./src/models/permissionModel");
const User = require("./src/models/userModel");
const Company = require("./src/models/companyModel");
const Party = require("./src/models/partyModel");
const Item = require("./src/models/itemModel");
const Quote = require("./src/models/quoteModel");
const SalesOrder = require("./src/models/salesOrderModel");
const DeliveryChallan = require("./src/models/deliveryChallanModel");
const DispatchCard = require("./src/models/dispatchCardModel");
const StockMovement = require("./src/models/stockMovementModel");
const Transaction = require("./src/models/transactionModel");
const { hashPassword } = require("./src/utils/hash");

const loadJSON = (filename) => {
  const filePath = path.join(__dirname, "..", "database", filename);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
};

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB Connected for seeding");
};

const seed = async () => {
  try {
    await connectDB();

    // Clear all collections
    console.log("Clearing existing data...");
    await Promise.all([
      Role.deleteMany(),
      Permission.deleteMany(),
      User.deleteMany(),
      Company.deleteMany(),
      Party.deleteMany(),
      Item.deleteMany(),
      Quote.deleteMany(),
      SalesOrder.deleteMany(),
      DeliveryChallan.deleteMany(),
      DispatchCard.deleteMany(),
      StockMovement.deleteMany(),
      Transaction.deleteMany()
    ]);

    // ============ PERMISSIONS ============
    console.log("Seeding permissions...");
    const permissionNames = [
      "VIEW_DASHBOARD",
      "MANAGE_COMPANIES",
      "VIEW_COMPANIES",
      "MANAGE_PARTIES",
      "VIEW_PARTIES",
      "CREATE_PARTIES",
      "MANAGE_ITEMS",
      "VIEW_ITEMS",
      "MANAGE_QUOTES",
      "VIEW_QUOTES",
      "CREATE_QUOTES",
      "MANAGE_ORDERS",
      "VIEW_ORDERS",
      "CREATE_ORDERS",
      "MANAGE_DELIVERY",
      "VIEW_DELIVERY",
      "MANAGE_DISPATCH",
      "MANAGE_REPORTS",
      "VIEW_REPORTS",
      "MANAGE_USERS",
      "MANAGE_DATA",
      "MANAGE_INVENTORY",
      "VIEW_INVENTORY",
      "VIEW_TRANSACTIONS"
    ];

    const permissions = await Permission.insertMany(
      permissionNames.map(name => ({ name }))
    );

    const getPermIds = (names) =>
      permissions.filter(p => names.includes(p.name)).map(p => p._id);

    // ============ ROLES ============
    console.log("Seeding roles...");

    const adminRole = await Role.create({
      name: "admin",
      permissions: permissions.map(p => p._id) // All permissions
    });

    const managerRole = await Role.create({
      name: "manager",
      permissions: getPermIds([
        "VIEW_DASHBOARD",
        "VIEW_COMPANIES",
        "MANAGE_PARTIES",
        "VIEW_PARTIES",
        "CREATE_PARTIES",
        "MANAGE_ITEMS",
        "VIEW_ITEMS",
        "MANAGE_QUOTES",
        "VIEW_QUOTES",
        "CREATE_QUOTES",
        "MANAGE_ORDERS",
        "VIEW_ORDERS",
        "CREATE_ORDERS",
        "MANAGE_DELIVERY",
        "VIEW_DELIVERY",
        "MANAGE_DISPATCH",
        "MANAGE_REPORTS",
        "VIEW_REPORTS",
        "MANAGE_INVENTORY",
        "VIEW_INVENTORY",
        "VIEW_TRANSACTIONS"
      ])
    });

    const salesRole = await Role.create({
      name: "sales",
      permissions: getPermIds([
        "VIEW_DASHBOARD",
        "VIEW_COMPANIES",
        "VIEW_PARTIES",
        "CREATE_PARTIES",
        "VIEW_ITEMS",
        "VIEW_QUOTES",
        "CREATE_QUOTES",
        "VIEW_ORDERS",
        "CREATE_ORDERS",
        "VIEW_DELIVERY",
        "VIEW_REPORTS",
        "VIEW_INVENTORY"
      ])
    });

    // ============ USERS ============
    console.log("Seeding users...");
    const usersData = loadJSON("users.json");

    const roleMap = {
      Admin: adminRole._id,
      Manager: managerRole._id,
      Sales: salesRole._id
    };

    for (const u of usersData) {
      await User.create({
        username: u.username,
        fullName: u.fullName,
        email: u.email,
        password: await hashPassword(u.password),
        role: roleMap[u.role],
        status: u.status || "active"
      });
    }

    // ============ COMPANIES ============
    console.log("Seeding companies...");
    const companiesData = loadJSON("companies.json");
    const companyMap = {};

    for (const c of companiesData) {
      const company = await Company.create({
        name: c.name,
        logo: c.logo || "",
        address: c.address,
        phone: c.phone,
        email: c.email,
        gst: c.gst
      });
      companyMap[c.id] = company._id;
    }

    // Use first company as default for all data
    const defaultCompanyId = Object.values(companyMap)[0];

    // ============ PARTIES ============
    console.log("Seeding parties...");
    const partiesData = loadJSON("parties.json");
    const partyMap = {};

    for (const p of partiesData) {
      const party = await Party.create({
        type: p.type,
        firmName: p.firmName || "",
        ownerName: p.ownerName || "",
        contactName: p.contactName,
        phone: p.phone,
        altPhone: p.altPhone || "",
        email: p.email || "",
        doorNo: p.doorNo || "",
        streetName: p.streetName || "",
        address1: p.address1 || "",
        area: p.area || "",
        landmark: p.landmark || "",
        city: p.city || "",
        district: p.district || "",
        state: p.state || "",
        pincode: p.pincode || "",
        agentAssigned: p.agentAssigned || "",
        group: p.group || "",
        designation: p.designation || "",
        department: p.department || "",
        openingBalance: p.openingBalance || 0,
        status: p.status || "active",
        company: defaultCompanyId
      });
      partyMap[p.id] = party._id;
    }

    // ============ ITEMS ============
    console.log("Seeding items...");
    const itemsData = loadJSON("items.json");
    const itemMap = {};

    for (const i of itemsData) {
      const item = await Item.create({
        itemId: i.itemId,
        name: i.name,
        category: i.category,
        description: i.description || "",
        primaryUnit: i.primaryUnit,
        altUnit: i.altUnit || "",
        conversionFactor: i.conversionFactor || 1,
        price: i.price || 0,
        cost: i.cost || 0,
        stock: i.stock || 0,
        minStock: i.minStock || 0,
        bomItems: i.bomItems || [],
        bomTotalCost: i.bomTotalCost || 0,
        status: i.status || "active",
        company: defaultCompanyId
      });
      itemMap[i.id] = item._id;
    }

    // Get first admin user for createdBy
    const adminUser = await User.findOne({ username: "admin" });

    // ============ QUOTES ============
    console.log("Seeding quotes...");
    const quotesData = loadJSON("quotes.json");

    for (const q of quotesData) {
      await Quote.create({
        quoteNumber: q.quoteNumber,
        customerId: partyMap[q.customerId] || null,
        customerName: q.customerName,
        date: q.date,
        validUntil: q.validUntil,
        items: q.items,
        subtotal: q.subtotal,
        tax: q.tax,
        total: q.total,
        status: q.status,
        notes: q.notes || "",
        createdBy: adminUser._id,
        company: defaultCompanyId
      });
    }

    // ============ SALES ORDERS ============
    console.log("Seeding sales orders...");
    const ordersData = loadJSON("salesOrders.json");
    const orderMap = {};

    for (const o of ordersData) {
      const order = await SalesOrder.create({
        orderNumber: o.orderNumber,
        customerId: partyMap[o.customerId] || null,
        customerName: o.customerName,
        date: o.date,
        deliveryDate: o.deliveryDate || "",
        items: o.items,
        subtotal: o.subtotal,
        tax: o.tax,
        total: o.total,
        status: o.status,
        notes: o.notes || "",
        createdBy: adminUser._id,
        company: defaultCompanyId
      });
      orderMap[o.id] = order._id;
    }

    // ============ DELIVERY CHALLANS ============
    console.log("Seeding delivery challans...");
    const challansData = loadJSON("deliveryChallans.json");
    const dcMap = {};

    for (const dc of challansData) {
      const challan = await DeliveryChallan.create({
        dcNumber: dc.dcNumber,
        orderId: orderMap[dc.orderId] || null,
        orderNumber: dc.orderNumber || "",
        customerId: partyMap[dc.customerId] || null,
        customerName: dc.customerName,
        date: dc.date,
        transporterName: dc.transporterName || "",
        vehicleNumber: dc.vehicleNumber || "",
        items: dc.items,
        subtotal: dc.subtotal,
        tax: dc.tax,
        total: dc.total,
        status: dc.status,
        notes: dc.notes || "",
        company: defaultCompanyId
      });
      dcMap[dc.id] = challan._id;
    }

    // ============ DISPATCH CARDS ============
    console.log("Seeding dispatch cards...");
    const dispatchData = loadJSON("dispatchCards.json");

    for (const d of dispatchData) {
      await DispatchCard.create({
        dcId: dcMap[d.dcId] || null,
        dcNumber: d.dcNumber,
        customerId: partyMap[d.customerId] || null,
        customerName: d.customerName || "",
        transporterName: d.transporterName || "",
        vehicleNumber: d.vehicleNumber || "",
        items: d.items,
        status: d.status || "ready",
        assignedTo: d.assignedTo || "",
        notes: d.notes || "",
        company: defaultCompanyId
      });
    }

    console.log("\n✅ Seeding complete!");
    console.log("=".repeat(50));
    console.log("Users created:");
    console.log("  admin / admin123 (Admin - full access)");
    console.log("  manager / manager123 (Manager - operational access)");
    console.log("  sales / sales123 (Sales - limited access)");
    console.log("=".repeat(50));

    process.exit(0);
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
};

seed();
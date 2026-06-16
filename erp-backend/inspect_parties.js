require('dotenv').config();
const mongoose = require('mongoose');
const Party = require('./src/models/partyModel');

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to DB.");

  const customers = await Party.find({ type: 'customer' }).limit(5);
  console.log("CUSTOMERS:", JSON.stringify(customers.map(c => ({
    _id: c._id,
    firmName: c.firmName,
    city: c.city,
    route: c.route,
    gstNumber: c.gstNumber,
    aadharNumber: c.aadharNumber,
    status: c.status
  })), null, 2));

  process.exit(0);
}

inspect().catch(console.error);

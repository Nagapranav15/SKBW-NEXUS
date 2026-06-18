require('dotenv').config();
const mongoose = require('mongoose');
const Party = require('./src/models/partyModel');

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to DB.");

  const parties = await Party.find({});
  console.log("All Parties in Database:", JSON.stringify(parties.map(p => ({
    _id: p._id,
    type: p.type,
    firmName: p.firmName,
    ownerName: p.ownerName,
    contactName: p.contactName,
    city: p.city,
    route: p.route,
    status: p.status
  })), null, 2));

  process.exit(0);
}

inspect().catch(console.error);

const mongoose = require('mongoose');
require('dotenv').config();

const Party = require('./src/models/partyModel');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const assignedMarkets = await Party.find({
    type: 'market',
    agentAssigned: /Sales Agent 1/i
  });
  console.log('Assigned Markets to Sales Agent 1:', assignedMarkets.map(m => ({
    name: m.firmName,
    route: m.route,
    agentAssigned: m.agentAssigned
  })));

  const assignedCustomers = await Party.find({
    type: 'customer',
    agentAssigned: /Sales Agent 1/i
  });
  console.log('Assigned Customers to Sales Agent 1:', assignedCustomers.map(c => ({
    name: c.firmName,
    route: c.route,
    agentAssigned: c.agentAssigned
  })));

  await mongoose.disconnect();
}

run();

const mongoose = require('mongoose');
require('dotenv').config();

const Party = require('./src/models/partyModel');
const Route = require('./src/models/routeModel');
const { getParties } = require('./src/controllers/partyController');
const { getRoutes } = require('./src/controllers/routeController');

async function testAgentFiltering() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    // 1. Let's find some routes, cities, and customers in the database to see the data distribution
    const totalRoutes = await Route.countDocuments({ isDeleted: { $ne: true } });
    const totalCities = await Party.countDocuments({ type: 'market', isDeleted: { $ne: true } });
    const totalCustomers = await Party.countDocuments({ type: 'customer', isDeleted: { $ne: true } });
    const totalAgents = await Party.countDocuments({ type: 'agent', isDeleted: { $ne: true } });

    console.log(`DB Stats:
    - Routes: ${totalRoutes}
    - Cities (Markets): ${totalCities}
    - Customers: ${totalCustomers}
    - Agents: ${totalAgents}
    `);

    // Let's find an agent to test with, e.g. Nagapranav or Sales Agent 1
    const agents = await Party.find({ type: 'agent', isDeleted: { $ne: true } });
    if (agents.length === 0) {
      console.log('No agents found in database to test.');
      process.exit(0);
    }

    const agent = agents[0];
    const agentName = agent.firmName || agent.contactName;
    console.log(`Testing with Agent: "${agentName}"`);

    // Mock request and response objects for express controller testing
    const reqParties = {
      user: {
        roleName: 'sales',
        fullName: agentName,
        company: agent.company.toString()
      },
      query: {
        type: 'market',
        company: agent.company.toString()
      }
    };

    let responseDataMarkets = null;
    const resPartiesMarkets = {
      json: (data) => {
        responseDataMarkets = data;
      },
      status: (code) => ({
        json: (err) => {
          console.error('Error status:', code, err);
        }
      })
    };

    await getParties(reqParties, resPartiesMarkets);
    console.log(`Filtered Markets count for Agent "${agentName}":`, responseDataMarkets ? responseDataMarkets.parties.length : 'N/A');

    // Request for routes filtering
    const reqRoutes = {
      user: {
        roleName: 'sales',
        fullName: agentName,
        company: agent.company.toString()
      },
      query: {
        company: agent.company.toString()
      }
    };

    let responseDataRoutes = null;
    const resRoutes = {
      json: (data) => {
        responseDataRoutes = data;
      },
      status: (code) => ({
        json: (err) => {
          console.error('Error status:', code, err);
        }
      })
    };

    await getRoutes(reqRoutes, resRoutes);
    console.log(`Filtered Routes count for Agent "${agentName}":`, responseDataRoutes ? responseDataRoutes.length : 'N/A');
    if (responseDataRoutes) {
      console.log('Filtered Routes names:', responseDataRoutes.map(r => r.name));
      console.log('Filtered Routes stats (citiesCount / customersCount / outstanding):');
      responseDataRoutes.forEach(r => {
        console.log(`  - ${r.name}: Cities: ${r.citiesCount}, Customers: ${r.customersCount}, Outstanding: ${r.outstanding}`);
      });
    }

    // Inspect the Agent's profile statistics from the API response
    const reqAgents = {
      user: {
        roleName: 'admin', // Admin can see all agents
        company: agent.company.toString()
      },
      query: {
        type: 'agent',
        company: agent.company.toString()
      }
    };

    let responseDataAgents = null;
    const resAgents = {
      json: (data) => {
        responseDataAgents = data;
      },
      status: (code) => ({
        json: (err) => {
          console.error('Error status:', code, err);
        }
      })
    };

    await getParties(reqAgents, resAgents);
    if (responseDataAgents) {
      const matchedAgent = responseDataAgents.parties.find(a => a._id.toString() === agent._id.toString());
      if (matchedAgent) {
        console.log(`\nAgent Profile Stats for "${agentName}":`);
        console.log(`  - assignedRegionsCount: ${matchedAgent.assignedRegionsCount}`);
        console.log(`  - assignedCitiesCount: ${matchedAgent.assignedCitiesCount}`);
        console.log(`  - assignedCustomersCount: ${matchedAgent.assignedCustomersCount}`);
      }
    }

  } catch (err) {
    console.error('Test execution failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

testAgentFiltering();

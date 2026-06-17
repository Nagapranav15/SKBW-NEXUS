require('dotenv').config();
const mongoose = require('mongoose');
const Party = require('./src/models/partyModel');
const Route = require('./src/models/routeModel');
const Sequence = require('./src/models/sequenceModel');

const stateMap = {
  "andhra pradesh": "AP",
  "telangana": "TG",
  "tamil nadu": "TN",
  "karnataka": "KA",
  "kerala": "KL",
  "maharashtra": "MH",
  "goa": "GA",
  "gujarat": "GJ",
  "rajasthan": "RJ",
  "delhi": "DL",
  "pondicherry": "PY",
  "puducherry": "PY"
};

const getRouteCode = (routeName) => {
  if (!routeName) return "GEN";
  const cleaned = routeName.trim().toUpperCase();
  const routeMatch = cleaned.match(/^ROUTE\s*(\w+)/i);
  if (routeMatch) {
    return "RT" + routeMatch[1];
  }
  const alphanumeric = cleaned.replace(/[^A-Z0-9]/g, "");
  return alphanumeric.substring(0, 3) || "GEN";
};

const getCityCode = (cityName) => {
  if (!cityName) return "GEN";
  const cleaned = cityName.trim().toUpperCase();
  const cityDict = {
    "TIRUPATI": "TPT",
    "SECUNDERABAD": "SEC",
    "VIJAYAWADA": "VJW",
    "WARANGAL": "WGL",
    "RENIGUNTA": "RGT",
    "SRIKALAHASTI": "SKH",
    "CHITTOOR": "CTR",
    "NAGARI": "NGR",
    "PAKALA": "PKL",
    "GUDIPUR": "GDP",
    "NAIDUPETA": "NDP",
    "HYDERABAD": "HYD",
    "BANGALORE": "BLR",
    "BENGALURU": "BLR",
    "CHENNAI": "CHN",
    "NELLORE": "NLR",
    "GUNTUR": "GNT",
    "VISAKHAPATNAM": "VSP"
  };
  if (cityDict[cleaned]) return cityDict[cleaned];
  const noVowels = cleaned.replace(/[AEIOU]/g, "");
  const alphaOnly = noVowels.replace(/[^A-Z0-9]/g, "");
  if (alphaOnly.length >= 3) return alphaOnly.substring(0, 3);
  const rawAlpha = cleaned.replace(/[^A-Z0-9]/g, "");
  return (rawAlpha.substring(0, 3) || "GEN").padEnd(3, "X");
};

const generateCustomerCode = async (partyData) => {
  const state = (partyData.state || "Andhra Pradesh").trim();
  const stateCode = stateMap[state.toLowerCase()] || state.substring(0, 2).toUpperCase();
  
  let routeCode = "GEN";
  if (partyData.route) {
    const routeDoc = await Route.findOne({ name: partyData.route });
    if (routeDoc && routeDoc.code) {
      routeCode = routeDoc.code.trim().toUpperCase();
    } else {
      routeCode = getRouteCode(partyData.route);
    }
  }
  
  const cityCode = getCityCode(partyData.city);
  const prefix = `${stateCode}-${routeCode}-${cityCode}-`;
  
  let seqDoc = await Sequence.findOne({ prefix });
  if (!seqDoc) {
    const customers = await Party.find({
      type: 'customer',
      code: { $regex: '^' + prefix }
    }, { code: 1 });
    
    let maxNum = 0;
    customers.forEach(c => {
      if (c.code) {
        const parts = c.code.split('-');
        const lastPart = parts[parts.length - 1];
        const num = parseInt(lastPart, 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });
    
    seqDoc = await Sequence.findOneAndUpdate(
      { prefix },
      { $setOnInsert: { sequence: maxNum } },
      { returnDocument: 'after', upsert: true }
    );
  }
  
  seqDoc = await Sequence.findOneAndUpdate(
    { prefix },
    { $inc: { sequence: 1 } },
    { returnDocument: 'after' }
  );
  
  const runningNum = String(seqDoc.sequence).padStart(4, '0');
  return prefix + runningNum;
};

async function runSync() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not specified in env.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  // 1. Fetch all cities (type: 'market')
  const cities = await Party.find({ type: 'market' });
  console.log(`Fetched ${cities.length} cities (markets) from DB.`);

  const citiesMap = new Map();
  cities.forEach(c => {
    if (c.firmName) {
      citiesMap.set(c.firmName.trim().toLowerCase(), c);
    }
  });

  // 2. Fetch all customers (type: 'customer')
  const customers = await Party.find({ type: 'customer' });
  console.log(`Fetched ${customers.length} customers from DB.`);

  let updatedCount = 0;
  let createdCitiesCount = 0;

  for (let customer of customers) {
    let customerCityName = (customer.city || "").trim();
    if (!customerCityName) {
      console.log(`Customer ${customer.firmName} (${customer._id}) has no city. Skipping.`);
      continue;
    }

    let cityDoc = citiesMap.get(customerCityName.toLowerCase());

    if (!cityDoc) {
      // Create a new city document to balance things out!
      console.log(`City "${customerCityName}" not found in markets. Creating it for customer ${customer.firmName}...`);
      
      const newCity = new Party({
        type: 'market',
        firmName: customerCityName,
        district: customer.district || 'GEN',
        state: customer.state || 'Andhra Pradesh',
        pincode: customer.pincode || '',
        route: customer.route || '',
        agentAssigned: customer.agentAssigned || '',
        company: customer.company,
        companies: customer.companies && customer.companies.length > 0 ? customer.companies : (customer.company ? [customer.company] : []),
        status: 'active'
      });

      cityDoc = await newCity.save();
      citiesMap.set(customerCityName.toLowerCase(), cityDoc);
      createdCitiesCount++;
      console.log(`Created city: ${customerCityName}`);
    }

    // Now, synchronize fields:
    let isModified = false;

    // Check district
    if (customer.district !== cityDoc.district) {
      console.log(`Syncing district for ${customer.firmName}: "${customer.district}" -> "${cityDoc.district}"`);
      customer.district = cityDoc.district;
      isModified = true;
    }

    // Check state
    if (customer.state !== cityDoc.state) {
      console.log(`Syncing state for ${customer.firmName}: "${customer.state}" -> "${cityDoc.state}"`);
      customer.state = cityDoc.state;
      isModified = true;
    }

    // Check pincode
    if (customer.pincode !== cityDoc.pincode) {
      console.log(`Syncing pincode for ${customer.firmName}: "${customer.pincode}" -> "${cityDoc.pincode}"`);
      customer.pincode = cityDoc.pincode;
      isModified = true;
    }

    // Check route (region)
    if (customer.route !== cityDoc.route) {
      console.log(`Syncing route (region) for ${customer.firmName}: "${customer.route}" -> "${cityDoc.route}"`);
      customer.route = cityDoc.route;
      isModified = true;
    }

    // Check agentAssigned
    if (customer.agentAssigned !== cityDoc.agentAssigned) {
      console.log(`Syncing agentAssigned for ${customer.firmName}: "${customer.agentAssigned}" -> "${cityDoc.agentAssigned}"`);
      customer.agentAssigned = cityDoc.agentAssigned;
      isModified = true;
    }

    if (isModified) {
      // Regenerate customer code since route/city/state might have changed
      const newCode = await generateCustomerCode(customer);
      console.log(`Regenerated code for ${customer.firmName}: "${customer.code}" -> "${newCode}"`);
      customer.code = newCode;
      
      await customer.save();
      updatedCount++;
    }
  }

  console.log("\n=================================");
  console.log(`Sync Completed!`);
  console.log(`Customers updated: ${updatedCount}`);
  console.log(`Cities (markets) created: ${createdCitiesCount}`);
  console.log("=================================\n");

  process.exit(0);
}

runSync().catch(err => {
  console.error(err);
  process.exit(1);
});

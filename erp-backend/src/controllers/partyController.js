const Party = require('../models/partyModel');
const Route = require('../models/routeModel');
const ActivityLog = require('../models/activityLogModel');
const Sequence = require('../models/sequenceModel');

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

// Canonical state names — normalizes variations to proper casing
const canonicalStates = {
  "andhra pradesh": "Andhra Pradesh",
  "ap": "Andhra Pradesh",
  "telangana": "Telangana",
  "tg": "Telangana",
  "tamil nadu": "Tamil Nadu",
  "tn": "Tamil Nadu",
  "tamilnadu": "Tamil Nadu",
  "karnataka": "Karnataka",
  "ka": "Karnataka",
  "kerala": "Kerala",
  "kl": "Kerala",
  "maharashtra": "Maharashtra",
  "mh": "Maharashtra",
  "goa": "Goa",
  "ga": "Goa",
  "gujarat": "Gujarat",
  "gj": "Gujarat",
  "rajasthan": "Rajasthan",
  "rj": "Rajasthan",
  "delhi": "Delhi",
  "dl": "Delhi",
  "new delhi": "Delhi",
  "pondicherry": "Puducherry",
  "puducherry": "Puducherry",
  "py": "Puducherry",
  "odisha": "Odisha",
  "orissa": "Odisha",
  "west bengal": "West Bengal",
  "wb": "West Bengal",
  "uttar pradesh": "Uttar Pradesh",
  "up": "Uttar Pradesh",
  "madhya pradesh": "Madhya Pradesh",
  "mp": "Madhya Pradesh",
  "bihar": "Bihar",
  "jharkhand": "Jharkhand",
  "chhattisgarh": "Chhattisgarh",
  "uttarakhand": "Uttarakhand",
  "himachal pradesh": "Himachal Pradesh",
  "punjab": "Punjab",
  "haryana": "Haryana",
  "jammu and kashmir": "Jammu and Kashmir",
  "assam": "Assam",
  "meghalaya": "Meghalaya",
  "tripura": "Tripura",
  "manipur": "Manipur",
  "mizoram": "Mizoram",
  "nagaland": "Nagaland",
  "arunachal pradesh": "Arunachal Pradesh",
  "sikkim": "Sikkim"
};

// Canonical district names — normalizes variations to proper casing
const canonicalDistricts = {
  "hyderabad": "Hyderabad",
  "tirupati": "Tirupati",
  "tirupathi": "Tirupati",
  "nalgonda": "Nalgonda",
  "suryapet": "Suryapet",
  "khammam": "Khammam",
  "bhadradri": "Bhadradri",
  "bhadradri kothagudem": "Bhadradri",
  "jangaon": "Jangaon",
  "warangal": "Warangal",
  "krishna": "Krishna",
  "west godavari": "West Godavari",
  "east godavari": "East Godavari",
  "guntur": "Guntur",
  "vizianagaram": "Vizianagaram",
  "srikakulam": "Srikakulam",
  "visakhapatnam": "Visakhapatnam",
  "anakapalli": "Anakapalli",
  "ganjam": "Ganjam",
  "gajapati": "Gajapati",
  "kansar": "Kansar",
  "nellore": "Nellore",
  "chittoor": "Chittoor",
  "kurnool": "Kurnool",
  "anantapur": "Anantapur",
  "prakasam": "Prakasam",
  "kadapa": "Kadapa",
  "rangareddy": "Rangareddy",
  "ranga reddy": "Rangareddy",
  "medchal": "Medchal",
  "medchal malkajgiri": "Medchal",
  "sangareddy": "Sangareddy",
  "nizamabad": "Nizamabad",
  "karimnagar": "Karimnagar",
  "adilabad": "Adilabad",
  "mahabubnagar": "Mahabubnagar",
  "nanded": "Nanded",
  "medak": "Medak"
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

const canonicalCities = {
  "secunderabad": "Secunderabad",
  "tirupati": "Tirupati",
  "tirupathi": "Tirupati",
  "aswaraopeta": "Aswaraopeta",
  "aswaraopet": "Aswaraopeta",
  "berhampur": "Berhampur",
  "berampur": "Berhampur",
  "bhadrachalam": "Bhadrachalam",
  "bobbili": "Bobbili",
  "chintalapudi": "Chintalapudi",
  "eluru": "Eluru",
  "haliya": "Haliya",
  "huzurnagar": "Huzurnagar",
  "jaggayyapet": "Jaggayyapet",
  "jaggayyapeta": "Jaggayyapet",
  "jangaon": "Jangaon",
  "kakinada": "Kakinada",
  "kalluru": "Kalluru",
  "kanchikacherla": "Kanchikacherla",
  "kasibugga": "Kasibugga",
  "khammam": "Khammam",
  "kodad": "Kodad",
  "kondamallepalli": "Kondamallepalli",
  "kondamalipalli": "Kondamallepalli",
  "kothagudem": "Kothagudem",
  "kothapeta": "Kothapeta",
  "machilipatnam": "Machilipatnam",
  "manuguru": "Manuguru",
  "mattampally": "Mattampally",
  "matampalli": "Mattampally",
  "miryalaguda": "Miryalaguda",
  "nakrekal": "Nakrekal",
  "nakerekal": "Nakrekal",
  "nalgonda": "Nalgonda",
  "nereducherla": "Nereducherla",
  "nereducharla": "Nereducherla",
  "paralakhemundi": "Paralakhemundi",
  "parvathipuram": "Parvathipuram",
  "pathapatnam": "Pathapatnam",
  "peddapuram": "Peddapuram",
  "pithapuram": "Pithapuram",
  "ramavaram": "Ramavaram",
  "ravulapalem": "Ravulapalem",
  "ravulapalam": "Ravulapalem",
  "sathupally": "Sathupally",
  "sathupalli": "Sathupally",
  "sompeta": "Sompeta",
  "srikakulam": "Srikakulam",
  "suryapet": "Suryapet",
  "tadepalli": "Tadepalli",
  "tadeapalli": "Tadepalli",
  "tadepalligudem": "Tadepalligudem",
  "tadepalli gudem": "Tadepalligudem",
  "tanuku": "Tanuku",
  "tiruvuru": "Tiruvuru",
  "tuni": "Tuni",
  "valigonda": "Valigonda",
  "vissannapeta": "Vissannapeta",
  "visannapeta": "Vissannapeta",
  "visakhapatnam": "Visakhapatnam (Vizag)",
  "vizag": "Visakhapatnam (Vizag)",
  "visakhapatnam (vizag)": "Visakhapatnam (Vizag)",
  "vizianagaram": "Vizianagaram",
  "yellamanchili": "Yellamanchili",
  "yellandu": "Yellandu",
  "pentapadu": "Pentapadu",
  "west godavari dist": "Pentapadu",
  "kansar": "Kansar"
};

const canonicalRoutes = {
  "andhra line": "Andhra Line",
  "hyderabad line": "Hyderabad Line",
  "nelore line": "Nelore Line",
  "telangana line": "Telangana Line",
  "rayalaseema line": "Rayalaseema Line",
  "odisha line": "Odisha Line",
  "paid": "Paid",
  "palnadu": "Palnadu"
};

const toTitleCase = (str) => {
  if (!str) return "";
  return str.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
};

const getNormalizedRouteName = (routeName) => {
  if (!routeName) return "";
  const cleaned = routeName.trim();
  const lower = cleaned.toLowerCase();
  if (canonicalRoutes[lower]) return canonicalRoutes[lower];
  return toTitleCase(cleaned);
};

const getNormalizedCityName = (cityName) => {
  if (!cityName) return "";
  const cleaned = cityName.trim();
  const lower = cleaned.toLowerCase();
  if (canonicalCities[lower]) return canonicalCities[lower];
  return toTitleCase(cleaned);
};

const getNormalizedStateName = (stateName) => {
  if (!stateName) return "";
  const cleaned = stateName.trim();
  const lower = cleaned.toLowerCase();
  if (canonicalStates[lower]) return canonicalStates[lower];
  return toTitleCase(cleaned);
};

const getNormalizedDistrictName = (districtName) => {
  if (!districtName) return "";
  const cleaned = districtName.trim();
  const lower = cleaned.toLowerCase();
  if (canonicalDistricts[lower]) return canonicalDistricts[lower];
  return toTitleCase(cleaned);
};

// Universal normalization — applies to ALL party types
const normalizeAllPartyFields = (data) => {
  // Normalize city, state, district for every party type
  if (data.city) data.city = getNormalizedCityName(data.city);
  if (data.state) data.state = getNormalizedStateName(data.state);
  if (data.district) data.district = getNormalizedDistrictName(data.district);
  if (data.route) data.route = getNormalizedRouteName(data.route);

  // Title-case name fields
  if (data.firmName) data.firmName = toTitleCase(data.firmName);
  if (data.ownerName) data.ownerName = toTitleCase(data.ownerName);
  if (data.contactName) data.contactName = toTitleCase(data.contactName);

  // Title-case address fields
  if (data.area) data.area = toTitleCase(data.area);
  if (data.landmark) data.landmark = toTitleCase(data.landmark);
  if (data.streetName) data.streetName = toTitleCase(data.streetName);

  // Normalize agent/transporter names
  if (data.agentAssigned) data.agentAssigned = toTitleCase(data.agentAssigned);
  if (data.preferredTransport) data.preferredTransport = toTitleCase(data.preferredTransport);
  if (data.assignedMarket) data.assignedMarket = getNormalizedCityName(data.assignedMarket);

  // Normalize group, designation, department
  if (data.group) data.group = toTitleCase(data.group);
  if (data.designation) data.designation = toTitleCase(data.designation);
  if (data.department) data.department = toTitleCase(data.department);

  // Trim and lowercase email
  if (data.email) data.email = data.email.trim().toLowerCase();

  // Normalize status
  if (data.status) data.status = data.status.trim().toLowerCase();

  // Trim phone fields
  if (data.phone) data.phone = String(data.phone).trim();
  if (data.altPhone) data.altPhone = String(data.altPhone).trim();
  if (data.whatsapp) data.whatsapp = String(data.whatsapp).trim();

  // Trim GST / Aadhar
  if (data.gstNumber) data.gstNumber = String(data.gstNumber).trim().toUpperCase();
  if (data.aadharNumber) data.aadharNumber = String(data.aadharNumber).trim();

  // For market type, firmName IS the city name — canonicalize it
  if (data.type === 'market' && data.firmName) {
    data.firmName = getNormalizedCityName(data.firmName);
  }

  // If outstandingBalance is provided, ensure outstanding is in sync
  if (data.outstandingBalance !== undefined && data.outstandingBalance !== null && data.outstandingBalance !== '') {
    data.outstanding = parseFloat(data.outstandingBalance) || 0;
    data.outstandingBalance = parseFloat(data.outstandingBalance) || 0;
  } else if (data.outstanding !== undefined && data.outstanding !== null && data.outstanding !== '') {
    data.outstandingBalance = parseFloat(data.outstanding) || 0;
    data.outstanding = parseFloat(data.outstanding) || 0;
  }

  // If openingBalance is provided, initialize outstanding fields if they are missing or not provided
  if (data.openingBalance !== undefined && data.openingBalance !== null && data.openingBalance !== '') {
    const opBal = parseFloat(data.openingBalance) || 0;
    if (data.outstandingBalance === undefined || data.outstandingBalance === null || data.outstandingBalance === '') {
      data.outstandingBalance = opBal;
      data.outstanding = opBal;
    }
  } else {
    // If outstandingBalance is provided but openingBalance is missing, set openingBalance to outstandingBalance
    if (data.outstandingBalance !== undefined && data.outstandingBalance !== null && data.outstandingBalance !== '') {
      data.openingBalance = parseFloat(data.outstandingBalance) || 0;
    }
  }

  return data;
};

const ensureRouteAndMarket = async (partyData, companyId, userFullName) => {
  // 1. Always run universal normalization on partyData
  normalizeAllPartyFields(partyData);

  if (partyData.type === 'customer') {
    const routeName = partyData.route;
    const cityName = partyData.city;
    const agentName = partyData.agentAssigned;
    const transporterName = partyData.preferredTransport;

    // 2. Ensure Route exists
    let routeDoc = null;
    if (routeName) {
      routeDoc = await Route.findOne({
        company: companyId,
        name: new RegExp('^' + routeName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i')
      });

      if (!routeDoc) {
        // Create new Route
        const baseCode = getRouteCode(routeName);
        let routeCode = baseCode;
        let suffix = 1;
        // Resolve code collision
        while (await Route.findOne({ company: companyId, code: routeCode.toUpperCase() })) {
          routeCode = `${baseCode}${suffix}`;
          suffix++;
        }
        routeDoc = await Route.create({
          name: routeName,
          code: routeCode.toUpperCase(),
          company: companyId,
          status: 'active'
        });
        console.log(`Auto-created route "${routeName}" (Code: ${routeDoc.code})`);
        
        // Log Route creation
        await ActivityLog.create({
          action: 'CREATE',
          entityType: 'route',
          entityName: routeName,
          details: `Auto-created route ${routeName} during customer setup`,
          performedBy: userFullName || 'System',
          company: companyId
        }).catch(err => console.error("Activity log failed:", err));
      } else {
        // Standardize casing to matched Route name
        partyData.route = routeDoc.name;
      }
    }

    // 3. Ensure Market (City) exists
    if (cityName) {
      let marketDoc = await Party.findOne({
        type: 'market',
        company: companyId,
        firmName: new RegExp('^' + cityName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i')
      });

      if (!marketDoc) {
        // Create new Market
        marketDoc = await Party.create({
          type: 'market',
          firmName: cityName,
          district: partyData.district || 'GEN',
          state: partyData.state || 'Andhra Pradesh',
          pincode: partyData.pincode || '',
          route: routeName || '',
          agentAssigned: agentName || (routeDoc ? (routeDoc.assignedAgent || '') : ''),
          company: companyId,
          companies: [companyId],
          status: 'active'
        });
        console.log(`Auto-created market "${cityName}" linked to route "${routeName || ''}"`);

        // Log Market creation
        await ActivityLog.create({
          action: 'CREATE',
          entityType: 'market',
          entityName: cityName,
          details: `Auto-created market ${cityName} during customer setup`,
          performedBy: userFullName || 'System',
          company: companyId
        }).catch(err => console.error("Activity log failed:", err));
      } else {
        // Standardize casing to matched Market name
        partyData.city = marketDoc.firmName;
        // Auto-fill route and agent assigned from Market if customer record is missing or mismatching
        if (marketDoc.route && !partyData.route) {
          partyData.route = marketDoc.route;
        }
        if (marketDoc.agentAssigned && !partyData.agentAssigned) {
          partyData.agentAssigned = marketDoc.agentAssigned;
        }
        // Fill address fields
        if (marketDoc.district && !partyData.district) partyData.district = marketDoc.district;
        if (marketDoc.state && !partyData.state) partyData.state = marketDoc.state;
        if (marketDoc.pincode && !partyData.pincode) partyData.pincode = marketDoc.pincode;
      }
    }

    // 4. Ensure Agent exists
    if (agentName) {
      const agentDoc = await Party.findOne({
        type: 'agent',
        company: companyId,
        firmName: new RegExp('^' + agentName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i')
      });

      if (!agentDoc) {
        await Party.create({
          type: 'agent',
          firmName: agentName,
          company: companyId,
          companies: [companyId],
          status: 'active'
        });
        console.log(`Auto-created agent "${agentName}" during customer setup`);
        
        await ActivityLog.create({
          action: 'CREATE',
          entityType: 'agent',
          entityName: agentName,
          details: `Auto-created agent ${agentName} during customer setup`,
          performedBy: userFullName || 'System',
          company: companyId
        }).catch(err => console.error("Activity log failed:", err));
      } else {
        partyData.agentAssigned = agentDoc.firmName;
      }
    }

    // 5. Ensure Transporter exists
    if (transporterName) {
      const transporterDoc = await Party.findOne({
        type: 'transporter',
        company: companyId,
        firmName: new RegExp('^' + transporterName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i')
      });

      if (!transporterDoc) {
        await Party.create({
          type: 'transporter',
          firmName: transporterName,
          company: companyId,
          companies: [companyId],
          status: 'active'
        });
        console.log(`Auto-created transporter "${transporterName}" during customer setup`);
        
        await ActivityLog.create({
          action: 'CREATE',
          entityType: 'transporter',
          entityName: transporterName,
          details: `Auto-created transporter ${transporterName} during customer setup`,
          performedBy: userFullName || 'System',
          company: companyId
        }).catch(err => console.error("Activity log failed:", err));
      } else {
        partyData.preferredTransport = transporterDoc.firmName;
      }
    }
  }

  if (partyData.type === 'market') {
    const routeName = partyData.route;
    if (routeName) {
      let routeDoc = await Route.findOne({
        company: companyId,
        name: new RegExp('^' + routeName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i')
      });

      if (!routeDoc) {
        const baseCode = getRouteCode(routeName);
        let routeCode = baseCode;
        let suffix = 1;
        while (await Route.findOne({ company: companyId, code: routeCode.toUpperCase() })) {
          routeCode = `${baseCode}${suffix}`;
          suffix++;
        }
        routeDoc = await Route.create({
          name: routeName,
          code: routeCode.toUpperCase(),
          company: companyId,
          status: 'active'
        });
        console.log(`Auto-created route "${routeName}" (Code: ${routeDoc.code}) from market setup`);

        await ActivityLog.create({
          action: 'CREATE',
          entityType: 'route',
          entityName: routeName,
          details: `Auto-created route ${routeName} during market setup`,
          performedBy: userFullName || 'System',
          company: companyId
        }).catch(err => console.error("Activity log failed:", err));
      } else {
        partyData.route = routeDoc.name;
      }
    }
  }
};

const generateCustomerCode = async (partyData) => {
  const state = (partyData.state || "Andhra Pradesh").trim();
  const stateCode = stateMap[state.toLowerCase()] || state.substring(0, 2).toUpperCase();
  
  // Look up route code from database Route collection
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
  
  // Find or initialize Sequence document for the prefix
  let seqDoc = await Sequence.findOne({ prefix });
  if (!seqDoc) {
    // Find the max number currently in the database for existing records
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
    
    // Create sequence starting at maxNum
    seqDoc = await Sequence.findOneAndUpdate(
      { prefix },
      { $setOnInsert: { sequence: maxNum } },
      { returnDocument: 'after', upsert: true }
    );
  }
  
  // Increment and get next sequence number
  seqDoc = await Sequence.findOneAndUpdate(
    { prefix },
    { $inc: { sequence: 1 } },
    { returnDocument: 'after' }
  );
  
  const runningNum = String(seqDoc.sequence).padStart(4, '0');
  return prefix + runningNum;
};

const enrichPartyObj = async (party) => {
  if (!party) return null;
  const partyObj = party.toObject ? party.toObject() : party;
  
  if (partyObj.type === 'market') {
    const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const cityRegex = new RegExp('^' + escapeRegex(partyObj.firmName) + '$', 'i');
    const [customerCount, activeCustomersCount, inactiveCustomersCount, outstandingResult] = await Promise.all([
      Party.countDocuments({
        type: 'customer',
        city: cityRegex,
        company: partyObj.company,
        isDeleted: { $ne: true }
      }),
      Party.countDocuments({
        type: 'customer',
        city: cityRegex,
        company: partyObj.company,
        isDeleted: { $ne: true },
        status: 'active'
      }),
      Party.countDocuments({
        type: 'customer',
        city: cityRegex,
        company: partyObj.company,
        isDeleted: { $ne: true },
        status: { $ne: 'active' }
      }),
      Party.aggregate([
        {
          $match: {
            type: 'customer',
            city: cityRegex,
            company: partyObj.company,
            isDeleted: { $ne: true }
          }
        },
        {
          $group: {
            _id: null,
            totalOutstanding: { $sum: '$outstanding' }
          }
        }
      ])
    ]);
    partyObj.customerCount = customerCount;
    partyObj.activeCustomersCount = activeCustomersCount;
    partyObj.inactiveCustomersCount = inactiveCustomersCount;
    partyObj.outstanding = outstandingResult.length > 0 ? outstandingResult[0].totalOutstanding : 0;
    partyObj.outstandingBalance = partyObj.outstanding;
  } else if (partyObj.type === 'agent') {
    const agentName = partyObj.firmName || partyObj.contactName;
    const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const agentRegex = new RegExp('^' + escapeRegex(agentName) + '$', 'i');

    const agentRoutes = await Route.find({
      company: partyObj.company,
      assignedAgent: agentRegex
    });
    const routeNames = agentRoutes.map(r => r.name);
    const routeRegexes = routeNames.map(name => new RegExp('^' + escapeRegex(name) + '$', 'i'));

    partyObj.assignedRegionsCount = agentRoutes.length;

    const cityConditions = [];
    if (routeRegexes.length > 0) {
      cityConditions.push({ route: { $in: routeRegexes } });
    }
    cityConditions.push({ agentAssigned: agentRegex });

    const cityFilter = {
      type: 'market',
      company: partyObj.company,
      isDeleted: { $ne: true },
      $or: cityConditions
    };
    const assignedCitiesCount = await Party.countDocuments(cityFilter);
    partyObj.assignedCitiesCount = assignedCitiesCount;

    // Find all markets assigned to the agent to cover customer city assignments
    const assignedMarkets = await Party.find({
      type: 'market',
      company: partyObj.company,
      isDeleted: { $ne: true },
      $or: cityConditions
    });
    const assignedMarketNames = assignedMarkets.map(m => m.firmName);
    const marketRegexes = assignedMarketNames.map(name => new RegExp('^' + escapeRegex(name) + '$', 'i'));

    const customerConditions = [];
    if (routeRegexes.length > 0) {
      customerConditions.push({ route: { $in: routeRegexes } });
    }
    if (marketRegexes.length > 0) {
      customerConditions.push({ city: { $in: marketRegexes } });
    }
    customerConditions.push({ agentAssigned: agentRegex });

    const customerFilter = {
      type: 'customer',
      company: partyObj.company,
      isDeleted: { $ne: true },
      $or: customerConditions
    };
    const assignedCustomersCount = await Party.countDocuments(customerFilter);
    partyObj.assignedCustomersCount = assignedCustomersCount;
  } else if (partyObj.type === 'transporter') {
    const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const transporterRegex = new RegExp('^' + escapeRegex(partyObj.firmName) + '$', 'i');
    const customerCount = await Party.countDocuments({
      type: 'customer',
      preferredTransport: transporterRegex,
      company: partyObj.company,
      isDeleted: { $ne: true }
    });
    partyObj.customerCount = customerCount;
  }
  
  return partyObj;
};

exports.getParties = async (req, res) => {
  try {
    const filter = { isDeleted: { $ne: true } };
    if (req.query.type) filter.type = req.query.type;

    let companyFilter = null;
    if (req.query.company) {
      companyFilter = {
        $or: [
          { company: req.query.company },
          { companies: req.query.company }
        ]
      };
    }

    if (req.query.status) {
      const vals = req.query.status.split(',').map(v => v.trim());
      filter.status = { $in: vals.map(v => new RegExp('^' + v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i')) };
    }
    if (req.query.city) {
      const vals = req.query.city.split(',').map(v => v.trim());
      filter.city = { $in: vals.map(v => new RegExp('^' + v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i')) };
    }
    if (req.query.route) {
      const vals = req.query.route.split(',').map(v => v.trim());
      filter.route = { $in: vals.map(v => new RegExp('^' + v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i')) };
    }
    if (req.query.agentAssigned) {
      const vals = req.query.agentAssigned.split(',').map(v => v.trim());
      filter.agentAssigned = { $in: vals.map(v => new RegExp('^' + v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i')) };
    }

    // Text search across multiple fields
    let searchFilter = null;
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      searchFilter = {
        $or: [
          { firmName: searchRegex },
          { contactName: searchRegex },
          { ownerName: searchRegex },
          { phone: searchRegex },
          { city: searchRegex },
          { email: searchRegex },
          { route: searchRegex },
          { code: searchRegex },
          { gstin: searchRegex },
          { gstNumber: searchRegex },
          { aadharNumber: searchRegex },
          { district: searchRegex },
          { state: searchRegex },
          { pincode: searchRegex },
          { agentAssigned: searchRegex },
          { tags: searchRegex }
        ]
      };
    }

    const conditions = [];
    if (companyFilter) conditions.push(companyFilter);
    if (searchFilter) conditions.push(searchFilter);
    if (conditions.length > 0) {
      filter.$and = conditions;
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Secure sorting & filtering with whitelist validation
    const allowedSortFields = ['firmName', 'contactName', 'ownerName', 'phone', 'city', 'district', 'state', 'pincode', 'route', 'agentAssigned', 'creditLimit', 'outstandingBalance', 'status', 'createdAt'];

    // Parse dynamic Multi-Filter rules
    if (req.query.filterRules) {
      try {
        const rules = JSON.parse(req.query.filterRules);
        if (Array.isArray(rules) && rules.length > 0) {
          const ruleQueries = [];
          rules.forEach(rule => {
            const { field, condition, value } = rule;
            if (value === undefined || value === null || value === '') return;
            
            let queryVal;
            if (condition === 'equal to') {
              queryVal = new RegExp('^' + value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i');
            } else if (condition === 'contains') {
              queryVal = new RegExp(value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
            } else if (condition === 'greater than') {
              const numVal = Number(value);
              queryVal = !isNaN(numVal) ? { $gt: numVal } : { $gt: value };
            } else if (condition === 'less than') {
              const numVal = Number(value);
              queryVal = !isNaN(numVal) ? { $lt: numVal } : { $lt: value };
            } else if (condition === 'starts with') {
              queryVal = new RegExp('^' + value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
            } else if (condition === 'ends with') {
              queryVal = new RegExp(value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i');
            }
            
            if (queryVal !== undefined && allowedSortFields.includes(field)) {
              ruleQueries.push({ [field]: queryVal });
            }
          });
          
          if (ruleQueries.length > 0) {
            filter.$and = filter.$and ? [...filter.$and, ...ruleQueries] : ruleQueries;
          }
        }
      } catch (err) {
        console.error('Error parsing filterRules:', err);
      }
    }

    // Secure sorting with whitelist validation (multi-column supported)
    const sortObj = {};
    if (req.query.sortBy && req.query.sortBy.includes(',')) {
      const fields = req.query.sortBy.split(',');
      const orders = (req.query.sortOrder || '').split(',');
      fields.forEach((f, idx) => {
        const field = f.trim();
        if (allowedSortFields.includes(field)) {
          const order = orders[idx] === 'desc' ? -1 : 1;
          sortObj[field] = order;
        }
      });
    } else if (req.query.sortBy) {
      let sortBy = req.query.sortBy;
      if (!allowedSortFields.includes(sortBy)) {
        sortBy = 'createdAt';
      }
      const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
      sortObj[sortBy] = sortOrder;
    } else {
      // Default to no sorting or date sorting
      sortObj['createdAt'] = -1;
    }

    const [rawParties, total] = await Promise.all([
      Party.find(filter).sort(sortObj).skip(skip).limit(limit),
      Party.countDocuments(filter)
    ]);

    const parties = await Promise.all(rawParties.map(async (party) => {
      // Self-healing Customer Code if missing
      if (party.type === 'customer' && !party.code) {
        const generatedCode = await generateCustomerCode(party);
        party.code = generatedCode;
        await Party.findByIdAndUpdate(party._id, { code: generatedCode });
      }
      return enrichPartyObj(party);
    }));

    res.json({ parties, total, page, limit });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getPartyStats = async (req, res) => {
  try {
    const filter = { isDeleted: { $ne: true } };
    if (req.query.type) filter.type = req.query.type;
    if (req.query.company) {
      filter.$or = [
        { company: req.query.company },
        { companies: req.query.company }
      ];
    }

    const [total, active, inactive, onHold] = await Promise.all([
      Party.countDocuments(filter),
      Party.countDocuments({ ...filter, status: 'active' }),
      Party.countDocuments({ ...filter, status: 'inactive' }),
      Party.countDocuments({ ...filter, status: 'on-hold' })
    ]);

    res.json({ total, active, inactive, onHold });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getPartyById = async (req, res) => {
  try {
    const party = await Party.findById(req.params.id);
    if (!party) return res.status(404).json({ msg: 'Party not found' });
    const enriched = await enrichPartyObj(party);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createParty = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.company && (!data.companies || data.companies.length === 0)) {
      data.companies = [data.company];
    }
    await ensureRouteAndMarket(data, data.company, req.user ? req.user.fullName : 'System');
    if (data.type === 'customer' && !data.code) {
      data.code = await generateCustomerCode(data);
    }
    const party = await Party.create(data);

    // Log activity
    await ActivityLog.create({
      action: 'CREATE',
      entityType: party.type,
      entityName: party.firmName || party.contactName || party.ownerName || 'Unknown',
      details: `Created new ${party.type}: ${party.firmName || party.contactName || party.ownerName}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: party.company
    }).catch(err => console.error("Activity log failed:", err));

    const enriched = await enrichPartyObj(party);
    res.status(201).json(enriched);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateParty = async (req, res) => {
  try {
    const data = { ...req.body };
    delete data._id;
    delete data.__v;
    delete data.createdAt;
    delete data.updatedAt;
    
    const existingParty = await Party.findById(req.params.id);
    if (existingParty) {
      // If openingBalance changed, adjust outstanding fields by the difference
      if (data.openingBalance !== undefined && data.openingBalance !== null && data.openingBalance !== '') {
        const oldOpBal = existingParty.openingBalance || 0;
        const newOpBal = parseFloat(data.openingBalance) || 0;
        const diff = newOpBal - oldOpBal;
        if (diff !== 0) {
          const currentOutstandingBal = data.outstandingBalance !== undefined && data.outstandingBalance !== '' ? parseFloat(data.outstandingBalance) : (existingParty.outstandingBalance !== undefined ? existingParty.outstandingBalance : (existingParty.outstanding || 0));
          const currentOutstanding = data.outstanding !== undefined && data.outstanding !== '' ? parseFloat(data.outstanding) : (existingParty.outstanding !== undefined ? existingParty.outstanding : (existingParty.outstandingBalance || 0));
          data.outstandingBalance = currentOutstandingBal + diff;
          data.outstanding = currentOutstanding + diff;
        }
      }
      await ensureRouteAndMarket(data, data.company || existingParty.company, req.user ? req.user.fullName : 'System');
      if (existingParty.type === 'customer') {
        const routeChanged = (data.route !== undefined && data.route !== existingParty.route);
        const cityChanged = (data.city !== undefined && data.city !== existingParty.city);
        const stateChanged = (data.state !== undefined && data.state !== existingParty.state);
        
        if (routeChanged || cityChanged || stateChanged) {
          const mergedData = {
            state: data.state !== undefined ? data.state : existingParty.state,
            route: data.route !== undefined ? data.route : existingParty.route,
            city: data.city !== undefined ? data.city : existingParty.city
          };
          data.code = await generateCustomerCode(mergedData);
        }
      }
    }

    // Synchronize linked customers if this is a market (city) and its details changed
    if (existingParty && existingParty.type === 'market') {
      const nameChanged = data.firmName !== undefined && data.firmName !== existingParty.firmName;
      const routeChanged = data.route !== undefined && data.route !== existingParty.route;
      const agentChanged = data.agentAssigned !== undefined && data.agentAssigned !== existingParty.agentAssigned;

      if (nameChanged || routeChanged || agentChanged) {
        const customerFilter = { type: 'customer', city: existingParty.firmName };
        const customerUpdate = {};

        if (nameChanged) {
          customerUpdate.city = data.firmName;
        }
        if (routeChanged) {
          customerUpdate.route = data.route;
        }
        if (agentChanged) {
          customerUpdate.agentAssigned = data.agentAssigned || '';
        }

        // Update all customers under this city
        await Party.updateMany(customerFilter, { $set: customerUpdate });

        // Regenerate customer codes if city or region changed
        if (nameChanged || routeChanged) {
          const newCityName = nameChanged ? data.firmName : existingParty.firmName;
          const newRouteName = routeChanged ? data.route : existingParty.route;
          const customersToUpdate = await Party.find({ type: 'customer', city: newCityName });
          for (const customer of customersToUpdate) {
            const newCode = await generateCustomerCode({
              state: customer.state,
              route: newRouteName,
              city: newCityName
            });
            await Party.findByIdAndUpdate(customer._id, { code: newCode });
          }
        }
      }
    }
    
    const party = await Party.findByIdAndUpdate(req.params.id, data, { returnDocument: 'after' });
    if (!party) return res.status(404).json({ msg: 'Party not found' });

    // Log activity
    await ActivityLog.create({
      action: 'UPDATE',
      entityType: party.type,
      entityName: party.firmName || party.contactName || party.ownerName || 'Unknown',
      details: `Updated ${party.type}: ${party.firmName || party.contactName || party.ownerName}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: party.company
    }).catch(err => console.error("Activity log failed:", err));

    const enriched = await enrichPartyObj(party);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteParty = async (req, res) => {
  try {
    const party = await Party.findById(req.params.id);
    if (!party) return res.status(404).json({ msg: 'Party not found' });

    if (party.type === 'market') {
      const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const cityRegex = new RegExp('^' + escapeRegex(party.firmName) + '$', 'i');
      const customerCount = await Party.countDocuments({
        type: 'customer',
        city: cityRegex,
        company: party.company,
        isDeleted: { $ne: true }
      });
      if (customerCount > 0) {
        return res.status(400).json({ msg: 'Cannot delete city. Move customers first.' });
      }
    }

    party.isDeleted = true;
    await party.save();

    // If it was a market (city), reset city, route, and agent for all linked customers
    if (party.type === 'market') {
      await Party.updateMany(
        { type: 'customer', city: party.firmName },
        { $set: { city: '', route: '', agentAssigned: '' } }
      );
    }

    // Log activity
    await ActivityLog.create({
      action: 'DELETE',
      entityType: party.type,
      entityName: party.firmName || party.contactName || party.ownerName || 'Unknown',
      details: `Moved ${party.type} to recycle bin: ${party.firmName || party.contactName || party.ownerName}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: party.company
    }).catch(err => console.error("Activity log failed:", err));

    res.json({ msg: 'Party moved to recycle bin' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkDeleteParties = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ msg: 'No ids provided' });
    }

    const partiesToDelete = await Party.find({ _id: { $in: ids } });
    if (partiesToDelete.length === 0) {
      return res.status(404).json({ msg: 'No matching records found to delete' });
    }

    // Check delete protection for markets
    for (const p of partiesToDelete) {
      if (p.type === 'market') {
        const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const cityRegex = new RegExp('^' + escapeRegex(p.firmName) + '$', 'i');
        const customerCount = await Party.countDocuments({
          type: 'customer',
          city: cityRegex,
          company: p.company,
          isDeleted: { $ne: true }
        });
        if (customerCount > 0) {
          return res.status(400).json({ msg: `Cannot delete city "${p.firmName}". Move customers first.` });
        }
      }
    }

    const marketNames = partiesToDelete
      .filter(p => p.type === 'market')
      .map(p => p.firmName);

    await Party.updateMany({ _id: { $in: ids } }, { $set: { isDeleted: true } });

    if (marketNames.length > 0) {
      await Party.updateMany(
        { type: 'customer', city: { $in: marketNames } },
        { $set: { city: '', route: '', agentAssigned: '' } }
      );
    }

    // Bulk create activity logs
    const logs = partiesToDelete.map(p => ({
      action: 'DELETE',
      entityType: p.type,
      entityName: p.firmName || p.contactName || p.ownerName || 'Unknown',
      details: `Moved ${p.type} to recycle bin during bulk delete: ${p.firmName || p.contactName || p.ownerName}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: p.company
    }));
    await ActivityLog.insertMany(logs).catch(err => console.error("Bulk delete activity logs failed:", err));

    res.json({ msg: `Successfully moved ${partiesToDelete.length} records to recycle bin`, count: partiesToDelete.length });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getDeletedParties = async (req, res) => {
  try {
    const filter = { isDeleted: true };
    if (req.query.type) filter.type = req.query.type;
    if (req.query.company) {
      filter.$or = [
        { company: req.query.company },
        { companies: req.query.company }
      ];
    }

    const parties = await Party.find(filter).sort({ updatedAt: -1 });
    res.json(parties);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.restoreParty = async (req, res) => {
  try {
    const party = await Party.findById(req.params.id);
    if (!party) return res.status(404).json({ msg: 'Record not found' });

    party.isDeleted = false;
    await party.save();

    // Log activity
    await ActivityLog.create({
      action: 'UPDATE',
      entityType: party.type,
      entityName: party.firmName || party.contactName || party.ownerName || 'Unknown',
      details: `Restored ${party.type}: ${party.firmName || party.contactName || party.ownerName}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: party.company
    }).catch(err => console.error("Activity log failed:", err));

    res.json({ msg: 'Record restored successfully', party });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.permanentlyDeleteParty = async (req, res) => {
  try {
    const party = await Party.findById(req.params.id);
    if (!party) return res.status(404).json({ msg: 'Record not found' });

    await Party.findByIdAndDelete(req.params.id);

    // If it was a market (city), reset city, route, and agent for all linked customers
    if (party.type === 'market') {
      await Party.updateMany(
        { type: 'customer', city: party.firmName },
        { $set: { city: '', route: '', agentAssigned: '' } }
      );
    }

    // Log activity
    await ActivityLog.create({
      action: 'DELETE',
      entityType: party.type,
      entityName: party.firmName || party.contactName || party.ownerName || 'Unknown',
      details: `Permanently deleted ${party.type}: ${party.firmName || party.contactName || party.ownerName}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: party.company
    }).catch(err => console.error("Activity log failed:", err));

    res.json({ msg: 'Record permanently deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.importParties = async (req, res) => {
  try {
    const { parties } = req.body;
    if (!parties || !Array.isArray(parties) || parties.length === 0) {
      return res.status(400).json({ msg: 'No parties data provided' });
    }

    const companyIds = [...new Set(parties.map(p => p.company).filter(Boolean))];
    if (companyIds.length === 0) {
      return res.status(400).json({ msg: 'No valid company IDs in import data' });
    }

    // 1. Pre-fetch existing Routes, Markets, Agents, Transporters for all companies
    const [routes, existingParties] = await Promise.all([
      Route.find({ company: { $in: companyIds } }),
      Party.find({ type: { $in: ['market', 'agent', 'transporter'] }, company: { $in: companyIds } })
    ]);

    const routesMap = new Map();
    const routeCodesSet = new Set();
    routes.forEach(r => {
      routesMap.set(`${r.company}:${r.name.toLowerCase()}`, r);
      routeCodesSet.add(`${r.company}:${r.code.toUpperCase()}`);
    });

    const marketsMap = new Map();
    const agentsMap = new Map();
    const transportersMap = new Map();

    existingParties.forEach(p => {
      if (p.type === 'market') {
        marketsMap.set(`${p.company}:${p.firmName.toLowerCase()}`, p);
      } else if (p.type === 'agent') {
        agentsMap.set(`${p.company}:${p.firmName.toLowerCase()}`, p);
      } else if (p.type === 'transporter') {
        transportersMap.set(`${p.company}:${p.firmName.toLowerCase()}`, p);
      }
    });

    // 2. Identify missing Routes, Markets, Agents, Transporters, planning their creation
    const newRoutesToCreateMap = new Map();
    const newMarketsToCreateMap = new Map();
    const newAgentsToCreateMap = new Map();
    const newTransportersToCreateMap = new Map();

    for (const p of parties) {
      if (!p.company) continue;
      const companyId = p.company;

      // Always normalize fields for EVERY imported party
      normalizeAllPartyFields(p);

      if (p.type === 'customer') {
        const routeName = p.route;
        const cityName = p.city;
        const agentName = p.agentAssigned;
        const transporterName = p.preferredTransport;

        // Auto-create Route if missing
        if (routeName) {
          const routeKey = `${companyId}:${routeName.toLowerCase()}`;
          if (!routesMap.has(routeKey) && !newRoutesToCreateMap.has(routeKey)) {
            const baseCode = getRouteCode(routeName);
            let routeCode = baseCode;
            let suffix = 1;
            while (routeCodesSet.has(`${companyId}:${routeCode.toUpperCase()}`)) {
              routeCode = `${baseCode}${suffix}`;
              suffix++;
            }
            routeCodesSet.add(`${companyId}:${routeCode.toUpperCase()}`);

            newRoutesToCreateMap.set(routeKey, {
              name: routeName,
              code: routeCode,
              company: companyId,
              status: 'active'
            });
          }
        }

        // Auto-create Market if missing
        if (cityName) {
          const marketKey = `${companyId}:${cityName.toLowerCase()}`;
          if (!marketsMap.has(marketKey) && !newMarketsToCreateMap.has(marketKey)) {
            let resolvedRouteName = '';
            if (routeName) {
              const routeKey = `${companyId}:${routeName.toLowerCase()}`;
              const matchedRouteDoc = routesMap.get(routeKey) || newRoutesToCreateMap.get(routeKey);
              resolvedRouteName = matchedRouteDoc ? matchedRouteDoc.name : routeName;
            }
            newMarketsToCreateMap.set(marketKey, {
              type: 'market',
              firmName: cityName,
              district: p.district || 'GEN',
              state: p.state || 'Andhra Pradesh',
              pincode: p.pincode || '',
              route: resolvedRouteName,
              agentAssigned: agentName || '',
              company: companyId,
              companies: [companyId],
              status: 'active'
            });
          }
        }

        // Auto-create Agent if missing
        if (agentName) {
          const agentKey = `${companyId}:${agentName.toLowerCase()}`;
          if (!agentsMap.has(agentKey) && !newAgentsToCreateMap.has(agentKey)) {
            newAgentsToCreateMap.set(agentKey, {
              type: 'agent',
              firmName: agentName,
              company: companyId,
              companies: [companyId],
              status: 'active'
            });
          }
        }

        // Auto-create Transporter if missing
        if (transporterName) {
          const transporterKey = `${companyId}:${transporterName.toLowerCase()}`;
          if (!transportersMap.has(transporterKey) && !newTransportersToCreateMap.has(transporterKey)) {
            newTransportersToCreateMap.set(transporterKey, {
              type: 'transporter',
              firmName: transporterName,
              company: companyId,
              companies: [companyId],
              status: 'active'
            });
          }
        }
      }

      if (p.type === 'market') {
        const routeName = p.route;

        // Auto-create Route if missing
        if (routeName) {
          const routeKey = `${companyId}:${routeName.toLowerCase()}`;
          if (!routesMap.has(routeKey) && !newRoutesToCreateMap.has(routeKey)) {
            const baseCode = getRouteCode(routeName);
            let routeCode = baseCode;
            let suffix = 1;
            while (routeCodesSet.has(`${companyId}:${routeCode.toUpperCase()}`)) {
              routeCode = `${baseCode}${suffix}`;
              suffix++;
            }
            routeCodesSet.add(`${companyId}:${routeCode.toUpperCase()}`);

            newRoutesToCreateMap.set(routeKey, {
              name: routeName,
              code: routeCode,
              company: companyId,
              status: 'active'
            });
          }
        }
      }
    }

    // Bulk insert new routes, markets, agents, transporters
    if (newRoutesToCreateMap.size > 0) {
      const inserted = await Route.insertMany([...newRoutesToCreateMap.values()]);
      inserted.forEach(r => {
        routesMap.set(`${r.company}:${r.name.toLowerCase()}`, r);
      });
    }

    if (newMarketsToCreateMap.size > 0) {
      const inserted = await Party.insertMany([...newMarketsToCreateMap.values()]);
      inserted.forEach(m => {
        marketsMap.set(`${m.company}:${m.firmName.toLowerCase()}`, m);
      });
    }

    if (newAgentsToCreateMap.size > 0) {
      const inserted = await Party.insertMany([...newAgentsToCreateMap.values()]);
      inserted.forEach(a => {
        agentsMap.set(`${a.company}:${a.firmName.toLowerCase()}`, a);
      });
    }

    if (newTransportersToCreateMap.size > 0) {
      const inserted = await Party.insertMany([...newTransportersToCreateMap.values()]);
      inserted.forEach(t => {
        transportersMap.set(`${t.company}:${t.firmName.toLowerCase()}`, t);
      });
    }

    // Activity logging for auto-created entities in bulk
    const activityLogs = [];
    newRoutesToCreateMap.forEach(r => {
      activityLogs.push({
        action: 'CREATE',
        entityType: 'route',
        entityName: r.name,
        details: `Auto-created route ${r.name} during import`,
        performedBy: req.user ? req.user.fullName : "System",
        company: r.company
      });
    });
    newMarketsToCreateMap.forEach(m => {
      activityLogs.push({
        action: 'CREATE',
        entityType: 'market',
        entityName: m.firmName,
        details: `Auto-created market ${m.firmName} during import`,
        performedBy: req.user ? req.user.fullName : "System",
        company: m.company
      });
    });
    newAgentsToCreateMap.forEach(a => {
      activityLogs.push({
        action: 'CREATE',
        entityType: 'agent',
        entityName: a.firmName,
        details: `Auto-created agent ${a.firmName} during import`,
        performedBy: req.user ? req.user.fullName : "System",
        company: a.company
      });
    });
    newTransportersToCreateMap.forEach(t => {
      activityLogs.push({
        action: 'CREATE',
        entityType: 'transporter',
        entityName: t.firmName,
        details: `Auto-created transporter ${t.firmName} during import`,
        performedBy: req.user ? req.user.fullName : "System",
        company: t.company
      });
    });
    if (activityLogs.length > 0) {
      const ActivityLog = require('../models/activityLogModel');
      await ActivityLog.insertMany(activityLogs).catch(err => console.error("Activity logs failed:", err));
    }

    // 3. Resolve Customer prefixes and fetch existing sequence counters
    const partiesWithPrefixes = parties.map(p => {
      const data = { ...p };
      if (data.type === 'customer' && !data.code && data.company) {
        const state = (data.state || "Andhra Pradesh").trim();
        const stateCode = stateMap[state.toLowerCase()] || state.substring(0, 2).toUpperCase();
        
        let routeCode = "GEN";
        if (data.route) {
          const routeKey = `${data.company}:${data.route.toLowerCase()}`;
          const routeDoc = routesMap.get(routeKey);
          if (routeDoc && routeDoc.code) {
            routeCode = routeDoc.code.trim().toUpperCase();
          } else {
            routeCode = getRouteCode(data.route);
          }
        }
        const cityCode = getCityCode(data.city);
        const prefix = `${stateCode}-${routeCode}-${cityCode}-`;
        return { data, prefix };
      }
      return { data, prefix: null };
    });

    const uniquePrefixes = [...new Set(partiesWithPrefixes.map(x => x.prefix).filter(Boolean))];
    const Sequence = require('../models/sequenceModel');
    const existingSeqs = await Sequence.find({ prefix: { $in: uniquePrefixes } });
    const seqsMap = new Map();
    existingSeqs.forEach(s => seqsMap.set(s.prefix, s.sequence));

    // Find max counter for prefixes that don't have sequence documents in MongoDB yet
    for (const prefix of uniquePrefixes) {
      if (!seqsMap.has(prefix)) {
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
        seqsMap.set(prefix, maxNum);
      }
    }

    // 4. Generate customer codes and build processedParties list
    const processedParties = [];
    for (const item of partiesWithPrefixes) {
      const data = item.data;
      if (data.company && (!data.companies || data.companies.length === 0)) {
        data.companies = [data.company];
      }

      if (data.company) {
        const companyId = data.company;

        // Apply normalized case names from caches
        if (data.route) {
          const routeKey = `${companyId}:${data.route.toLowerCase()}`;
          const routeDoc = routesMap.get(routeKey);
          if (routeDoc) data.route = routeDoc.name;
        }

        if (data.city) {
          const marketKey = `${companyId}:${data.city.toLowerCase()}`;
          const marketDoc = marketsMap.get(marketKey);
          if (marketDoc) {
            data.city = marketDoc.firmName;
            if (!data.district && marketDoc.district) data.district = marketDoc.district;
            if (!data.state && marketDoc.state) data.state = marketDoc.state;
            if (!data.pincode && marketDoc.pincode) data.pincode = marketDoc.pincode;
            if (!data.route && marketDoc.route) data.route = marketDoc.route;
          }
        }

        if (data.type === 'customer') {
          // Apply normalized agent name from cache
          if (data.agentAssigned) {
            const agentKey = `${companyId}:${data.agentAssigned.toLowerCase()}`;
            const agentDoc = agentsMap.get(agentKey);
            if (agentDoc) data.agentAssigned = agentDoc.firmName;
          }

          // Apply normalized transporter name from cache
          if (data.preferredTransport) {
            const transporterKey = `${companyId}:${data.preferredTransport.toLowerCase()}`;
            const transporterDoc = transportersMap.get(transporterKey);
            if (transporterDoc) data.preferredTransport = transporterDoc.firmName;
          }

          if (!data.code && item.prefix) {
            const currentCounter = seqsMap.get(item.prefix) || 0;
            const nextCounter = currentCounter + 1;
            seqsMap.set(item.prefix, nextCounter);

            const runningNum = String(nextCounter).padStart(4, '0');
            data.code = item.prefix + runningNum;
          }
        }
      }
      processedParties.push(data);
    }

    // 5. Bulk write sequence updates back to database
    if (uniquePrefixes.length > 0) {
      const bulkOps = uniquePrefixes.map(prefix => ({
        updateOne: {
          filter: { prefix },
          update: { $set: { sequence: seqsMap.get(prefix) } },
          upsert: true
        }
      }));
      await Sequence.bulkWrite(bulkOps);
    }

    // 6. Insert all processed parties in one bulk query
    const created = await Party.insertMany(processedParties, { ordered: false });

    // Activity log for final bulk import success
    if (created.length > 0) {
      await ActivityLog.create({
        action: 'IMPORT',
        entityType: created[0].type,
        entityName: `${created.length} ${created[0].type}s`,
        details: `Imported ${created.length} ${created[0].type}s from Excel file`,
        performedBy: req.user ? req.user.fullName : "System",
        company: created[0].company
      }).catch(err => console.error("Activity log failed:", err));
    }

    res.status(201).json({ msg: `Successfully imported ${created.length} parties`, count: created.length });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Link party to another company (universal master data)
exports.linkPartyToCompany = async (req, res) => {
  try {
    const { companyId } = req.body;
    const party = await Party.findById(req.params.id);
    if (!party) return res.status(404).json({ msg: 'Party not found' });

    if (!party.companies.includes(companyId)) {
      party.companies.push(companyId);
      await party.save();
    }
    res.json(party);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Unlink party from a company
exports.unlinkPartyFromCompany = async (req, res) => {
  try {
    const { companyId } = req.body;
    const party = await Party.findById(req.params.id);
    if (!party) return res.status(404).json({ msg: 'Party not found' });

    party.companies = party.companies.filter(c => c.toString() !== companyId);
    if (party.companies.length > 0) {
      party.company = party.companies[0];
    }
    await party.save();
    res.json(party);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.mergeParties = async (req, res) => {
  try {
    const { primaryId, duplicateId } = req.body;
    if (!primaryId || !duplicateId) {
      return res.status(400).json({ msg: 'Primary ID and Duplicate ID are required.' });
    }

    if (primaryId === duplicateId) {
      return res.status(400).json({ msg: 'Cannot merge a record into itself.' });
    }

    const [primary, duplicate] = await Promise.all([
      Party.findById(primaryId),
      Party.findById(duplicateId)
    ]);

    if (!primary || !duplicate) {
      return res.status(404).json({ msg: 'One or both of the records was not found.' });
    }

    if (primary.type !== duplicate.type) {
      return res.status(400).json({ msg: 'Cannot merge records of different types.' });
    }

    // Merge fields from duplicate into primary if primary has them empty
    const fieldsToMerge = [
      'ownerName', 'contactName', 'phone', 'altPhone', 'email', 
      'doorNo', 'streetName', 'address1', 'area', 'landmark', 'city', 'district', 'state', 'pincode',
      'agentAssigned', 'assignedMarket', 'group', 'designation', 'department', 'whatsapp', 'vendorType',
      'remarks', 'gstNumber', 'aadharNumber', 'preferredTransport', 'gpsLocation', 'customerPhoto', 'shopPhoto'
    ];

    fieldsToMerge.forEach(field => {
      if (!primary[field] && duplicate[field]) {
        primary[field] = duplicate[field];
      }
    });

    // Merge tags (union)
    if (duplicate.tags && duplicate.tags.length > 0) {
      const mergedTags = new Set([...(primary.tags || []), ...duplicate.tags]);
      primary.tags = Array.from(mergedTags);
    }

    // Sum outstanding / balance
    const primaryBalance = primary.outstandingBalance || primary.outstanding || 0;
    const duplicateBalance = duplicate.outstandingBalance || duplicate.outstanding || 0;
    primary.outstanding = primaryBalance + duplicateBalance;
    primary.outstandingBalance = primaryBalance + duplicateBalance;

    // Save primary record
    await primary.save();

    // Now update references in other models
    const primaryName = primary.firmName || primary.contactName || primary.ownerName || '';
    
    const Transaction = require('../models/transactionModel');
    const SalesOrder = require('../models/salesOrderModel');
    const Quote = require('../models/quoteModel');
    const DispatchCard = require('../models/dispatchCardModel');
    const DeliveryChallan = require('../models/deliveryChallanModel');

    await Promise.all([
      Transaction.updateMany({ partyId: duplicateId }, { $set: { partyId: primaryId, partyName: primaryName } }),
      SalesOrder.updateMany({ customerId: duplicateId }, { $set: { customerId: primaryId, customerName: primaryName } }),
      Quote.updateMany({ customerId: duplicateId }, { $set: { customerId: primaryId, customerName: primaryName } }),
      DispatchCard.updateMany({ customerId: duplicateId }, { $set: { customerId: primaryId, customerName: primaryName } }),
      DeliveryChallan.updateMany({ customerId: duplicateId }, { $set: { customerId: primaryId, customerName: primaryName } })
    ]);

    // Delete the duplicate record
    await Party.findByIdAndDelete(duplicateId);

    // Log Activity
    await ActivityLog.create({
      action: 'UPDATE',
      entityType: primary.type,
      entityName: primaryName,
      details: `Merged duplicate record "${duplicate.firmName || duplicate.contactName}" into "${primaryName}"`,
      performedBy: req.user ? req.user.fullName : "System",
      company: primary.company
    }).catch(err => console.error("Activity log failed:", err));

    res.json({ msg: 'Merge successful', primary });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.generateCustomerCode = generateCustomerCode;

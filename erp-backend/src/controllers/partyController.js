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

exports.getParties = async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.company) {
      filter.$or = [
        { company: req.query.company },
        { companies: req.query.company }
      ];
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
    if (req.query.customerGrade) {
      const vals = req.query.customerGrade.split(',').map(v => v.trim());
      filter.customerGrade = { $in: vals.map(v => new RegExp('^' + v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i')) };
    }

    // Text search across multiple fields
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      const searchFilter = [
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
        { customerGrade: searchRegex }
      ];
      filter.$or = searchFilter;
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Secure sorting & filtering with whitelist validation
    const allowedSortFields = ['firmName', 'contactName', 'ownerName', 'phone', 'city', 'district', 'state', 'pincode', 'route', 'agentAssigned', 'customerGrade', 'creditLimit', 'outstanding', 'status', 'createdAt'];

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
      const partyObj = party.toObject();
      if (party.type === 'market') {
        partyObj.customerCount = await Party.countDocuments({
          type: 'customer',
          city: party.firmName
        });
      }
      return partyObj;
    }));

    res.json({ parties, total, page, limit });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getPartyStats = async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;

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
    res.json(party);
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

    res.status(201).json(party);
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
    
    // Check if city, route, or state changed for a customer to regenerate code
    const existingParty = await Party.findById(req.params.id);
    if (existingParty && existingParty.type === 'customer') {
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

    res.json(party);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteParty = async (req, res) => {
  try {
    const party = await Party.findById(req.params.id);
    if (!party) return res.status(404).json({ msg: 'Party not found' });

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
      details: `Deleted ${party.type}: ${party.firmName || party.contactName || party.ownerName}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: party.company
    }).catch(err => console.error("Activity log failed:", err));

    res.json({ msg: 'Party deleted' });
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

    const processedParties = [];
    for (const p of parties) {
      const data = { ...p };
      if (data.company && (!data.companies || data.companies.length === 0)) {
        data.companies = [data.company];
      }
      if (data.type === 'customer' && !data.code) {
        data.code = await generateCustomerCode(data);
      }
      processedParties.push(data);
    }

    const created = await Party.insertMany(processedParties, { ordered: false });

    // Log activity
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

exports.generateCustomerCode = generateCustomerCode;

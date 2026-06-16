const Route = require('../models/routeModel');
const Party = require('../models/partyModel');
const ActivityLog = require('../models/activityLogModel');

exports.getRoutes = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.company) filter.company = req.query.company;

    // Secure sorting with whitelist validation
    const allowedSortFields = ['name', 'status', 'assignedAgent', 'createdAt'];
    let sortBy = req.query.sortBy || 'name';
    if (!allowedSortFields.includes(sortBy)) {
      sortBy = 'name';
    }
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
    const sortObj = {};
    sortObj[sortBy] = sortOrder;

    const routes = await Route.find(filter).sort(sortObj);

    const routesWithCounts = await Promise.all(routes.map(async (route) => {
      const citiesCount = await Party.countDocuments({
        type: 'market',
        route: route.name
      });
      const customersCount = await Party.countDocuments({
        type: 'customer',
        route: route.name
      });

      return {
        ...route.toObject(),
        citiesCount,
        customersCount
      };
    }));

    res.json(routesWithCounts);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getRouteById = async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ msg: 'Route not found' });
    res.json(route);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createRoute = async (req, res) => {
  try {
    const route = await Route.create(req.body);

    // Log activity
    await ActivityLog.create({
      action: 'CREATE',
      entityType: 'route',
      entityName: route.name,
      details: `Created new route: ${route.name}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: route.company
    }).catch(err => console.error("Activity log failed:", err));

    res.status(201).json(route);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateRoute = async (req, res) => {
  try {
    const data = { ...req.body };
    delete data._id;
    delete data.__v;
    delete data.createdAt;
    delete data.updatedAt;
    const route = await Route.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!route) return res.status(404).json({ msg: 'Route not found' });

    // Log activity
    await ActivityLog.create({
      action: 'UPDATE',
      entityType: 'route',
      entityName: route.name,
      details: `Updated route: ${route.name}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: route.company
    }).catch(err => console.error("Activity log failed:", err));

    res.json(route);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteRoute = async (req, res) => {
  try {
    const route = await Route.findByIdAndDelete(req.params.id);
    if (!route) return res.status(404).json({ msg: 'Route not found' });

    // Log activity
    await ActivityLog.create({
      action: 'DELETE',
      entityType: 'route',
      entityName: route.name,
      details: `Deleted route: ${route.name}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: route.company
    }).catch(err => console.error("Activity log failed:", err));

    res.json({ msg: 'Route deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

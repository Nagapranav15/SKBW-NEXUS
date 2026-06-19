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
        route: route.name,
        company: route.company
      });
      const customersCount = await Party.countDocuments({
        type: 'customer',
        route: route.name,
        company: route.company
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

    const existingRoute = await Route.findById(req.params.id);
    if (!existingRoute) return res.status(404).json({ msg: 'Route not found' });

    const route = await Route.findByIdAndUpdate(req.params.id, data, { returnDocument: 'after' });

    // Sync cities (markets) and customers if route name or agent changed
    const nameChanged = data.name !== undefined && data.name !== existingRoute.name;
    const agentChanged = data.assignedAgent !== undefined && data.assignedAgent !== existingRoute.assignedAgent;

    if (nameChanged || agentChanged) {
      const partyFilter = { route: existingRoute.name };
      const partyUpdate = {};

      if (nameChanged) {
        partyUpdate.route = data.name;
      }
      if (agentChanged) {
        partyUpdate.agentAssigned = data.assignedAgent || '';
      }

      await Party.updateMany(
        { ...partyFilter, type: { $in: ['market', 'customer'] }, company: existingRoute.company },
        { $set: partyUpdate }
      );

      // Regenerate customer codes if route name changed
      if (nameChanged) {
        const { generateCustomerCode } = require('./partyController');
        const customersToUpdate = await Party.find({ type: 'customer', route: data.name, company: existingRoute.company });
        for (const customer of customersToUpdate) {
          const newCode = await generateCustomerCode({
            state: customer.state,
            route: data.name,
            city: customer.city
          });
          await Party.findByIdAndUpdate(customer._id, { code: newCode });
        }
      }
    }

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
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ msg: 'Route not found' });

    await Route.findByIdAndDelete(req.params.id);

    // Reset region and agent fields for all linked cities and customers
    await Party.updateMany(
      { route: route.name, type: { $in: ['market', 'customer'] }, company: route.company },
      { $set: { route: '', agentAssigned: '' } }
    );

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

exports.bulkDeleteRoutes = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ msg: 'No ids provided' });
    }

    const routesToDelete = await Route.find({ _id: { $in: ids } });
    if (routesToDelete.length === 0) {
      return res.status(404).json({ msg: 'No matching routes found to delete' });
    }

    const routeNames = routesToDelete.map(r => r.name);
    const companies = routesToDelete.map(r => r.company);

    const result = await Route.deleteMany({ _id: { $in: ids } });

    await Party.updateMany(
      { route: { $in: routeNames }, type: { $in: ['market', 'customer'] }, company: { $in: companies } },
      { $set: { route: '', agentAssigned: '' } }
    );

    // Bulk create activity logs
    const logs = routesToDelete.map(r => ({
      action: 'DELETE',
      entityType: 'route',
      entityName: r.name,
      details: `Deleted route during bulk delete: ${r.name}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: r.company
    }));
    await ActivityLog.insertMany(logs).catch(err => console.error("Bulk delete routes activity logs failed:", err));

    res.json({ msg: `Successfully deleted ${result.deletedCount} routes`, count: result.deletedCount });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

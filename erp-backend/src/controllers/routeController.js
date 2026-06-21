const Route = require('../models/routeModel');
const Party = require('../models/partyModel');
const ActivityLog = require('../models/activityLogModel');

exports.getRoutes = async (req, res) => {
  try {
    const filter = { isDeleted: { $ne: true } };
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
      const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const routeRegex = new RegExp('^' + escapeRegex(route.name) + '$', 'i');
      
      const citiesCount = await Party.countDocuments({
        type: 'market',
        route: routeRegex,
        company: route.company,
        isDeleted: { $ne: true }
      });
      const customersCount = await Party.countDocuments({
        type: 'customer',
        route: routeRegex,
        company: route.company,
        isDeleted: { $ne: true }
      });

      const outstandingResult = await Party.aggregate([
        {
          $match: {
            type: 'customer',
            route: routeRegex,
            company: route.company,
            isDeleted: { $ne: true }
          }
        },
        {
          $group: {
            _id: null,
            totalOutstanding: { $sum: '$outstanding' }
          }
        }
      ]);
      const outstanding = outstandingResult.length > 0 ? outstandingResult[0].totalOutstanding : 0;

      return {
        ...route.toObject(),
        citiesCount,
        customersCount,
        outstandingBalance: outstanding,
        outstanding: outstanding
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

    const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const routeRegex = new RegExp('^' + escapeRegex(route.name) + '$', 'i');
    
    const [citiesCount, customersCount, outstandingResult] = await Promise.all([
      Party.countDocuments({
        type: 'market',
        route: routeRegex,
        company: route.company,
        isDeleted: { $ne: true }
      }),
      Party.countDocuments({
        type: 'customer',
        route: routeRegex,
        company: route.company,
        isDeleted: { $ne: true }
      }),
      Party.aggregate([
        {
          $match: {
            type: 'customer',
            route: routeRegex,
            company: route.company,
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
    
    const outstanding = outstandingResult.length > 0 ? outstandingResult[0].totalOutstanding : 0;

    res.json({
      ...route.toObject(),
      citiesCount,
      customersCount,
      outstandingBalance: outstanding,
      outstanding: outstanding
    });
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

    // Check delete protection: block if route has mapped cities or customers
    const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const routeRegex = new RegExp('^' + escapeRegex(route.name) + '$', 'i');

    const [citiesCount, customersCount] = await Promise.all([
      Party.countDocuments({
        type: 'market',
        route: routeRegex,
        company: route.company,
        isDeleted: { $ne: true }
      }),
      Party.countDocuments({
        type: 'customer',
        route: routeRegex,
        company: route.company,
        isDeleted: { $ne: true }
      })
    ]);

    if (citiesCount > 0 || customersCount > 0) {
      return res.status(400).json({ msg: 'Cannot delete region. Move customers first.' });
    }

    route.isDeleted = true;
    await route.save();

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
      details: `Moved route to recycle bin: ${route.name}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: route.company
    }).catch(err => console.error("Activity log failed:", err));

    res.json({ msg: 'Route moved to recycle bin' });
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

    // Check delete protection for each route
    const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    for (const route of routesToDelete) {
      const routeRegex = new RegExp('^' + escapeRegex(route.name) + '$', 'i');
      const [citiesCount, customersCount] = await Promise.all([
        Party.countDocuments({
          type: 'market',
          route: routeRegex,
          company: route.company,
          isDeleted: { $ne: true }
        }),
        Party.countDocuments({
          type: 'customer',
          route: routeRegex,
          company: route.company,
          isDeleted: { $ne: true }
        })
      ]);

      if (citiesCount > 0 || customersCount > 0) {
        return res.status(400).json({ msg: `Cannot delete region "${route.name}". Move customers first.` });
      }
    }

    const routeNames = routesToDelete.map(r => r.name);
    const companies = routesToDelete.map(r => r.company);

    await Route.updateMany({ _id: { $in: ids } }, { $set: { isDeleted: true } });

    await Party.updateMany(
      { route: { $in: routeNames }, type: { $in: ['market', 'customer'] }, company: { $in: companies } },
      { $set: { route: '', agentAssigned: '' } }
    );

    // Bulk create activity logs
    const logs = routesToDelete.map(r => ({
      action: 'DELETE',
      entityType: 'route',
      entityName: r.name,
      details: `Moved route to recycle bin during bulk delete: ${r.name}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: r.company
    }));
    await ActivityLog.insertMany(logs).catch(err => console.error("Bulk delete routes activity logs failed:", err));

    res.json({ msg: `Successfully moved ${routesToDelete.length} routes to recycle bin`, count: routesToDelete.length });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getDeletedRoutes = async (req, res) => {
  try {
    const filter = { isDeleted: true };
    if (req.query.company) filter.company = req.query.company;
    const routes = await Route.find(filter).sort({ updatedAt: -1 });
    res.json(routes);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.restoreRoute = async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ msg: 'Route not found' });

    route.isDeleted = false;
    await route.save();

    // Log activity
    await ActivityLog.create({
      action: 'UPDATE',
      entityType: 'route',
      entityName: route.name,
      details: `Restored route: ${route.name}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: route.company
    }).catch(err => console.error("Activity log failed:", err));

    res.json({ msg: 'Route restored successfully', route });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.permanentlyDeleteRoute = async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ msg: 'Route not found' });

    // Check delete protection: block if route has mapped cities or customers
    const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const routeRegex = new RegExp('^' + escapeRegex(route.name) + '$', 'i');

    const [citiesCount, customersCount] = await Promise.all([
      Party.countDocuments({
        type: 'market',
        route: routeRegex,
        company: route.company,
        isDeleted: { $ne: true }
      }),
      Party.countDocuments({
        type: 'customer',
        route: routeRegex,
        company: route.company,
        isDeleted: { $ne: true }
      })
    ]);

    if (citiesCount > 0 || customersCount > 0) {
      return res.status(400).json({ msg: 'Cannot delete region. Move customers first.' });
    }

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
      details: `Permanently deleted route: ${route.name}`,
      performedBy: req.user ? req.user.fullName : "System",
      company: route.company
    }).catch(err => console.error("Activity log failed:", err));

    res.json({ msg: 'Route permanently deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

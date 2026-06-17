const Warehouse = require("../models/warehouseModel");

exports.getWarehouses = async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = {};
    if (companyId) filter.company = companyId;
    const warehouses = await Warehouse.find(filter).sort({ createdAt: -1 });
    res.json(warehouses);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getWarehouseById = async (req, res) => {
  try {
    const wh = await Warehouse.findById(req.params.id);
    if (!wh) return res.status(404).json({ msg: "Warehouse not found" });
    res.json(wh);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createWarehouse = async (req, res) => {
  try {
    const wh = await Warehouse.create(req.body);
    res.status(201).json(wh);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateWarehouse = async (req, res) => {
  try {
    const wh = await Warehouse.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!wh) return res.status(404).json({ msg: "Warehouse not found" });
    res.json(wh);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteWarehouse = async (req, res) => {
  try {
    const wh = await Warehouse.findByIdAndDelete(req.params.id);
    if (!wh) return res.status(404).json({ msg: "Warehouse not found" });
    res.json({ msg: "Warehouse deleted" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

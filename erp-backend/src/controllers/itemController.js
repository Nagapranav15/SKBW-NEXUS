const Item = require("../models/itemModel");

exports.getItems = async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "Company ID is required" });
    }
    const filter = { company: companyId };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status) filter.status = req.query.status;

    const items = await Item.find(filter).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getItemById = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ msg: "Item not found" });
    res.json(item);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createItem = async (req, res) => {
  try {
    const item = await Item.create(req.body);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const item = await Item.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!item) return res.status(404).json({ msg: "Item not found" });
    res.json(item);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ msg: "Item not found" });
    res.json({ msg: "Item deleted" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

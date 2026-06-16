const DeliveryChallan = require("../models/deliveryChallanModel");

exports.getDeliveryChallans = async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = {};
    if (companyId) filter.company = companyId;
    if (req.query.status) filter.status = req.query.status;

    const challans = await DeliveryChallan.find(filter).sort({ createdAt: -1 });
    res.json(challans);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getDeliveryChallanById = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findById(req.params.id);
    if (!challan) return res.status(404).json({ msg: "Delivery Challan not found" });
    res.json(challan);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createDeliveryChallan = async (req, res) => {
  try {
    const challan = await DeliveryChallan.create(req.body);
    res.status(201).json(challan);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateDeliveryChallan = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!challan) return res.status(404).json({ msg: "Delivery Challan not found" });
    res.json(challan);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteDeliveryChallan = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findByIdAndDelete(req.params.id);
    if (!challan) return res.status(404).json({ msg: "Delivery Challan not found" });
    res.json({ msg: "Delivery Challan deleted" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

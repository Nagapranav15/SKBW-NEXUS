const DispatchCard = require("../models/dispatchCardModel");

exports.getDispatchCards = async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "Company ID is required" });
    }
    const filter = { company: companyId };
    if (req.query.status) filter.status = req.query.status;

    const cards = await DispatchCard.find(filter).sort({ createdAt: -1 });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getDispatchCardById = async (req, res) => {
  try {
    const card = await DispatchCard.findById(req.params.id);
    if (!card) return res.status(404).json({ msg: "Dispatch Card not found" });
    res.json(card);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createDispatchCard = async (req, res) => {
  try {
    const card = await DispatchCard.create(req.body);
    res.status(201).json(card);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateDispatchCard = async (req, res) => {
  try {
    const card = await DispatchCard.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!card) return res.status(404).json({ msg: "Dispatch Card not found" });
    res.json(card);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteDispatchCard = async (req, res) => {
  try {
    const card = await DispatchCard.findByIdAndDelete(req.params.id);
    if (!card) return res.status(404).json({ msg: "Dispatch Card not found" });
    res.json({ msg: "Dispatch Card deleted" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

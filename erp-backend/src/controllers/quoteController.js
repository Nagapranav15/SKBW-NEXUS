const Quote = require("../models/quoteModel");

exports.getQuotes = async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = {};
    if (companyId) filter.company = companyId;
    if (req.query.status) filter.status = req.query.status;

    // Sales role: only see own quotes
    if (req.user.roleName === "sales") {
      filter.createdBy = req.user.id;
    }

    const quotes = await Quote.find(filter).sort({ createdAt: -1 });
    res.json(quotes);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getQuoteById = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ msg: "Quote not found" });
    res.json(quote);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createQuote = async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user.id };
    const quote = await Quote.create(data);
    res.status(201).json(quote);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateQuote = async (req, res) => {
  try {
    const quote = await Quote.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!quote) return res.status(404).json({ msg: "Quote not found" });
    res.json(quote);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteQuote = async (req, res) => {
  try {
    const quote = await Quote.findByIdAndDelete(req.params.id);
    if (!quote) return res.status(404).json({ msg: "Quote not found" });
    res.json({ msg: "Quote deleted" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateQuoteStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const quote = await Quote.findByIdAndUpdate(
      req.params.id,
      { status },
      { returnDocument: 'after' }
    );
    if (!quote) return res.status(404).json({ msg: "Quote not found" });
    res.json(quote);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

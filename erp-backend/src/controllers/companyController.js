const Company = require("../models/companyModel");

exports.getCompanies = async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 });
    res.json(companies);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getCompanyById = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ msg: "Company not found" });
    res.json(company);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createCompany = async (req, res) => {
  try {
    const company = await Company.create(req.body);
    res.status(201).json(company);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateCompany = async (req, res) => {
  try {
    const company = await Company.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!company) return res.status(404).json({ msg: "Company not found" });
    res.json(company);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteCompany = async (req, res) => {
  try {
    const company = await Company.findByIdAndDelete(req.params.id);
    if (!company) return res.status(404).json({ msg: "Company not found" });
    res.json({ msg: "Company deleted" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

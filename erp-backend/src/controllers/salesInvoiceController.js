const mongoose = require("mongoose");
const SalesInvoice = require("../models/salesInvoiceModel");
const DeliveryChallan = require("../models/deliveryChallanModel");
const { broadcast } = require("../utils/realtimeService");

const toObjectId = (id) => {
  if (!id) return null;
  try {
    return new mongoose.Types.ObjectId(id);
  } catch (e) {
    return null;
  }
};

// Generate next invoice sequence number: INV-26XXXX format (matching INV-260899)
async function generateNextInvoiceNumber(companyId) {
  try {
    const yearPrefix = "26"; // Current fiscal / year identifier as seen in INV-260899
    const regex = new RegExp(`^INV-${yearPrefix}(\\d{4})$`, "i");
    const docs = await SalesInvoice.find({ invoiceNumber: regex })
      .select("invoiceNumber")
      .lean();

    let maxNum = 890; // Default base starting around 890 so first is 260891/260899
    docs.forEach((d) => {
      if (d.invoiceNumber) {
        const m = d.invoiceNumber.match(regex);
        if (m && m[1]) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    });

    const nextSeq = maxNum + 1;
    return `INV-${yearPrefix}${String(nextSeq).padStart(4, "0")}`;
  } catch (err) {
    console.error("generateNextInvoiceNumber error:", err);
    return `INV-260${Math.floor(100 + Math.random() * 900)}`;
  }
}

// GET /api/invoices
exports.getInvoices = async (req, res) => {
  try {
    const companyId = req.query.companyId || req.query.company || req.user?.company;
    const filter = {};
    if (companyId) {
      const objId = toObjectId(companyId);
      if (objId) filter.company = objId;
    }

    if (req.query.status && req.query.status !== "all" && req.query.status !== "ALL") {
      filter.status = req.query.status.toLowerCase();
    }

    if (req.query.search) {
      const s = req.query.search.trim();
      filter.$or = [
        { invoiceNumber: { $regex: s, $options: "i" } },
        { customerName: { $regex: s, $options: "i" } },
        { dispatchNumber: { $regex: s, $options: "i" } },
        { orderNumber: { $regex: s, $options: "i" } },
        { transporterName: { $regex: s, $options: "i" } }
      ];
    }

    const invoices = await SalesInvoice.find(filter)
      .sort({ createdAt: -1, invoiceNumber: -1 })
      .lean();

    res.json(invoices);
  } catch (err) {
    console.error("getInvoices error:", err);
    res.status(500).json({ error: "Failed to fetch invoices", details: err.message });
  }
};

// GET /api/invoices/next-number
exports.getNextNumber = async (req, res) => {
  try {
    const companyId = req.query.companyId || req.query.company || req.user?.company;
    const nextNumber = await generateNextInvoiceNumber(companyId);
    res.json({ invoiceNumber: nextNumber });
  } catch (err) {
    console.error("getNextNumber error:", err);
    res.status(500).json({ error: "Failed to generate invoice number" });
  }
};

// GET /api/invoices/:id
exports.getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    let invoice = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      invoice = await SalesInvoice.findById(id).lean();
    }
    if (!invoice) {
      invoice = await SalesInvoice.findOne({ invoiceNumber: id }).lean();
    }
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    res.json(invoice);
  } catch (err) {
    console.error("getInvoiceById error:", err);
    res.status(500).json({ error: "Failed to fetch invoice", details: err.message });
  }
};

// POST /api/invoices
exports.createInvoice = async (req, res) => {
  try {
    const companyId = req.body.company || req.query.companyId || req.user?.company;
    if (!companyId) {
      return res.status(400).json({ error: "Company is required" });
    }

    let invoiceNumber = req.body.invoiceNumber;
    if (!invoiceNumber || invoiceNumber.trim() === "") {
      invoiceNumber = await generateNextInvoiceNumber(companyId);
    }

    const payload = {
      ...req.body,
      invoiceNumber: invoiceNumber.trim(),
      company: toObjectId(companyId) || companyId,
      status: req.body.status || "created",
      createdBy: req.user?.username || req.user?.fullName || "User"
    };

    const invoice = await SalesInvoice.create(payload);

    // If linked to a delivery challan, update challan
    if (payload.dispatchNumber || payload.dispatchId) {
      try {
        const challanQuery = payload.dispatchId && mongoose.Types.ObjectId.isValid(payload.dispatchId)
          ? { _id: toObjectId(payload.dispatchId) }
          : { dcNumber: payload.dispatchNumber };

        await DeliveryChallan.updateOne(challanQuery, {
          $set: {
            invoiceNumber: invoice.invoiceNumber,
            invoiceId: invoice._id,
            invoiceStatus: "Invoiced"
          }
        });
      } catch (dcErr) {
        console.warn("Challan invoice link update error:", dcErr);
      }
    }

    try {
      broadcast("sales_invoice", { action: "create", invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber });
    } catch (_) {}

    res.status(201).json(invoice);
  } catch (err) {
    console.error("createInvoice error:", err);
    res.status(500).json({ error: "Failed to create invoice", details: err.message });
  }
};

// PUT /api/invoices/:id
exports.updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    let invoice = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      invoice = await SalesInvoice.findByIdAndUpdate(id, { $set: req.body }, { new: true });
    }
    if (!invoice) {
      invoice = await SalesInvoice.findOneAndUpdate({ invoiceNumber: id }, { $set: req.body }, { new: true });
    }
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    try {
      broadcast("sales_invoice", { action: "update", invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber });
    } catch (_) {}

    res.json(invoice);
  } catch (err) {
    console.error("updateInvoice error:", err);
    res.status(500).json({ error: "Failed to update invoice", details: err.message });
  }
};

// DELETE /api/invoices/:id
exports.deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    let invoice = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      invoice = await SalesInvoice.findByIdAndDelete(id);
    }
    if (!invoice) {
      invoice = await SalesInvoice.findOneAndDelete({ invoiceNumber: id });
    }
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Unlink delivery challan if any
    if (invoice.dispatchNumber || invoice.dispatchId) {
      try {
        const challanQuery = invoice.dispatchId && mongoose.Types.ObjectId.isValid(invoice.dispatchId)
          ? { _id: toObjectId(invoice.dispatchId) }
          : { dcNumber: invoice.dispatchNumber };

        await DeliveryChallan.updateOne(challanQuery, {
          $unset: { invoiceNumber: 1, invoiceId: 1 },
          $set: { invoiceStatus: "Not Invoiced" }
        });
      } catch (_) {}
    }

    try {
      broadcast("sales_invoice", { action: "delete", invoiceId: id });
    } catch (_) {}

    res.json({ message: "Invoice deleted successfully", invoiceNumber: invoice.invoiceNumber });
  } catch (err) {
    console.error("deleteInvoice error:", err);
    res.status(500).json({ error: "Failed to delete invoice", details: err.message });
  }
};

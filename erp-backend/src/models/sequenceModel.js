const mongoose = require("mongoose");

const sequenceSchema = new mongoose.Schema({
  prefix: { type: String, required: true, unique: true },
  sequence: { type: Number, default: 0 }
}, { timestamps: true });

sequenceSchema.statics.getNextSequence = async function(prefix, session) {
  const InventoryLedger = mongoose.model("InventoryLedger");
  const PurchaseInvoiceV2 = mongoose.model("PurchaseInvoiceV2");

  const opts = { new: true, upsert: true };
  if (session) opts.session = session;

  let seqDoc = await this.findOneAndUpdate(
    { prefix },
    { $inc: { sequence: 1 } },
    opts
  );

  let attempts = 0;
  while (attempts < 10) {
    let code = "";
    let exists = false;

    if (prefix === "IL") {
      code = `IL-${String(seqDoc.sequence).padStart(8, '0')}`;
      exists = await InventoryLedger.exists({ transactionNumber: code });
    } else if (prefix === "PB") {
      const monthShort = new Date().toLocaleString('en-US', { month: 'short' }).toUpperCase();
      code = `PB-${monthShort}-${String(seqDoc.sequence).padStart(3, '0')}`;
      exists = await PurchaseInvoiceV2.exists({ invoiceNumber: code });
    } else {
      return seqDoc.sequence;
    }

    if (!exists) {
      return code;
    }

    // Sequence is out of sync! Find max sequence from collection
    let maxVal = seqDoc.sequence;
    if (prefix === "IL") {
      const maxDoc = await InventoryLedger.findOne({
        transactionNumber: /^IL-\d{8}$/
      }).sort({ transactionNumber: -1 }).lean();
      if (maxDoc) {
        const num = parseInt(maxDoc.transactionNumber.split("-")[1], 10);
        if (!isNaN(num)) maxVal = Math.max(maxVal, num);
      }
    } else if (prefix === "PB") {
      const monthShort = new Date().toLocaleString('en-US', { month: 'short' }).toUpperCase();
      const regex = new RegExp(`^PB-${monthShort}-(\\d+)$`, 'i');
      const docs = await PurchaseInvoiceV2.find({ invoiceNumber: regex }).select('invoiceNumber').lean();
      docs.forEach(doc => {
        const m = doc.invoiceNumber.match(regex);
        if (m && m[1]) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num)) maxVal = Math.max(maxVal, num);
        }
      });
    }

    seqDoc = await this.findOneAndUpdate(
      { prefix },
      { $set: { sequence: maxVal + 1 } },
      opts
    );
    attempts++;
  }

  const monthShort = new Date().toLocaleString('en-US', { month: 'short' }).toUpperCase();
  return prefix === "IL" 
    ? `IL-${String(seqDoc.sequence).padStart(8, '0')}` 
    : `PB-${monthShort}-${String(seqDoc.sequence).padStart(3, '0')}`;
};

module.exports = mongoose.model("Sequence", sequenceSchema);

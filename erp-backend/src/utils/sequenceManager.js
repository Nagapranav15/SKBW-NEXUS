const mongoose = require("mongoose");
const Sequence = require("../models/sequenceModel");
const { enqueue } = require("./transactionQueue");

const toObjectId = (id) => {
  if (!id) return null;
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch (e) {
    return null;
  }
};

/**
 * Finds the highest numerical suffix in a collection for a given company and regex.
 */
async function findMaxExistingNumber(modelName, queryField, regex, companyId) {
  try {
    const Model = mongoose.model(modelName);
    const filter = {};
    if (companyId) {
      filter.company = toObjectId(companyId) || companyId;
    }
    filter[queryField] = regex;

    const docs = await Model.find(filter).select(queryField).lean();
    let max = 0;
    for (const doc of docs) {
      const val = doc[queryField];
      if (typeof val === 'string') {
        const match = val.match(regex);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > max) {
            max = num;
          }
        }
      }
    }
    return max;
  } catch (err) {
    console.error(`Error finding max sequence in ${modelName}:`, err.message);
    return 0;
  }
}

/**
 * Checks if a generated sequence string exists in the collection.
 */
async function checkIfCodeExists(modelName, queryField, code, companyId) {
  try {
    const Model = mongoose.model(modelName);
    const filter = { [queryField]: code };
    if (companyId) {
      filter.company = toObjectId(companyId) || companyId;
    }
    return await Model.exists(filter);
  } catch (err) {
    return false;
  }
}

/**
 * Globally assigns the next sequential number atomically with FIFO ordering.
 * Guarantees zero duplicate numbers and strict sequential ordering:
 * User A submits first -> #1001
 * User B submits second -> #1002
 *
 * @param {'PO'|'SO'|'CS'|'PB'|'TRX'|'DC'|'QT'} entityType
 * @param {string|ObjectId} companyId
 * @param {object} [options]
 * @returns {Promise<string>} e.g. "PO-001", "SO-0001", "CS-0001"
 */
async function getNextSequenceNumber(entityType, companyId, options = {}) {
  const compIdStr = companyId ? String(companyId) : "GLOBAL";
  const queueKey = `${entityType}_${compIdStr}`;

  return enqueue(queueKey, async () => {
    const prefixKey = `${entityType}_${compIdStr}`;

    // Lookup existing counter
    let seqDoc = await Sequence.findOne({ prefix: prefixKey });

    // Configurations per entity
    let modelName = "";
    let queryField = "";
    let matchRegex = null;
    let padLength = 3;
    let formatCode = (seq) => `${entityType}-${String(seq).padStart(padLength, '0')}`;

    switch (entityType) {
      case "PO":
      case "ProductionOrder":
        modelName = "ProductionOrder";
        queryField = "orderNumber";
        matchRegex = /^(?:PO|PR)-(?:[0-9]{4}-)?([0-9]+)$/;
        padLength = 3;
        formatCode = (seq) => `PO-${String(seq).padStart(Math.max(3, String(seq).length), "0")}`;
        break;

      case "SO":
      case "SalesOrder":
        modelName = "SalesOrderV2";
        queryField = "orderNumber";
        matchRegex = /^SO-?([0-9]+)$/i;
        padLength = 4;
        formatCode = (seq) => `SO-${String(seq).padStart(Math.max(4, String(seq).length), "0")}`;
        break;

      case "CS":
      case "CuttingSlip":
        modelName = "CuttingSlip";
        queryField = "slipNumber";
        matchRegex = /^CS-(?:(?:[0-9]{4})-)?([0-9]+)$/i;
        padLength = 4;
        formatCode = (seq) => `CS-${String(seq).padStart(Math.max(4, String(seq).length), "0")}`;
        break;

      case "PB":
      case "PurchaseInvoice":
        modelName = "PurchaseInvoiceV2";
        queryField = "invoiceNumber";
        matchRegex = /^PB-(?:[A-Z]{3}-)?([0-9]+)$/i;
        padLength = 3;
        formatCode = (seq) => `PB-${String(seq).padStart(Math.max(3, String(seq).length), "0")}`;
        break;

      case "TRX":
      case "InventoryLedger": {
        modelName = "InventoryLedger";
        queryField = "transactionNumber";
        const monthShort = new Date().toLocaleString("en-US", { month: "short" }).toUpperCase();
        matchRegex = new RegExp(`^TRX-${monthShort}-([0-9]+)$`, "i");
        padLength = 3;
        formatCode = (seq) => `TRX-${monthShort}-${String(seq).padStart(Math.max(3, String(seq).length), "0")}`;
        break;
      }

      case "DC":
      case "DeliveryChallan":
        modelName = "DeliveryChallan";
        queryField = "dcNumber";
        matchRegex = /^DC-(?:(?:[0-9]{4})-)?([0-9]+)$/i;
        padLength = 4;
        formatCode = (seq) => `DC-${String(seq).padStart(Math.max(4, String(seq).length), "0")}`;
        break;

      case "QT":
      case "Quote":
        modelName = "Quote";
        queryField = "quoteNumber";
        matchRegex = /^QT-?([0-9]+)$/i;
        padLength = 4;
        formatCode = (seq) => `QT-${String(seq).padStart(Math.max(4, String(seq).length), "0")}`;
        break;

      default:
        formatCode = (seq) => `${entityType}-${String(seq).padStart(4, "0")}`;
        break;
    }

    // If counter is missing or out of sync, determine true current max
    if (!seqDoc) {
      let maxVal = 0;
      if (modelName && matchRegex) {
        maxVal = await findMaxExistingNumber(modelName, queryField, matchRegex, companyId);
        // Also check legacy sales order table if entity is SalesOrder
        if (entityType === "SO" || entityType === "SalesOrder") {
          const legacyMax = await findMaxExistingNumber("SalesOrder", "orderNumber", matchRegex, companyId);
          if (legacyMax > maxVal) maxVal = legacyMax;
        }
      }

      seqDoc = await Sequence.findOneAndUpdate(
        { prefix: prefixKey },
        { $setOnInsert: { sequence: maxVal } },
        { returnDocument: "after", upsert: true }
      );
    }

    // Atomically increment sequence
    seqDoc = await Sequence.findOneAndUpdate(
      { prefix: prefixKey },
      { $inc: { sequence: 1 } },
      { returnDocument: "after", upsert: true }
    );

    let candidateCode = formatCode(seqDoc.sequence);
    let attempts = 0;

    // Check collision and fast-forward if an existing document already took this number
    if (modelName) {
      let exists = await checkIfCodeExists(modelName, queryField, candidateCode, companyId);
      if (!exists && (entityType === "SO" || entityType === "SalesOrder")) {
        exists = await checkIfCodeExists("SalesOrder", "orderNumber", candidateCode, companyId);
      }

      while (exists && attempts < 50) {
        attempts++;
        const maxVal = Math.max(
          seqDoc.sequence,
          await findMaxExistingNumber(modelName, queryField, matchRegex, companyId)
        );

        seqDoc = await Sequence.findOneAndUpdate(
          { prefix: prefixKey },
          { $set: { sequence: maxVal + 1 } },
          { returnDocument: "after" }
        );

        candidateCode = formatCode(seqDoc.sequence);
        exists = await checkIfCodeExists(modelName, queryField, candidateCode, companyId);
        if (!exists && (entityType === "SO" || entityType === "SalesOrder")) {
          exists = await checkIfCodeExists("SalesOrder", "orderNumber", candidateCode, companyId);
        }
      }
    }

    return candidateCode;
  });
}

module.exports = {
  getNextSequenceNumber
};

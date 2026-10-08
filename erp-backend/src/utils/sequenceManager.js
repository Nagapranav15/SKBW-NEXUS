const mongoose = require("mongoose");
const Sequence = require("../models/sequenceModel");
const { enqueue } = require("./transactionQueue");

// Ensure all target models are registered in Mongoose
try { require("../models/productionOrderModel"); } catch (e) {}
try { require("../models/salesOrderV2Model"); } catch (e) {}
try { require("../models/salesOrderModel"); } catch (e) {}
try { require("../models/purchaseInvoiceV2Model"); } catch (e) {}
try { require("../models/cuttingSlipModel"); } catch (e) {}
try { require("../models/inventoryLedgerV2Model"); } catch (e) {}
try { require("../models/deliveryChallanModel"); } catch (e) {}
try { require("../models/quoteModel"); } catch (e) {}

const toObjectId = (id) => {
  if (!id) return null;
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch (e) {
    return null;
  }
};

/**
 * Entity configurations for sequence generation and formatting.
 */
function getEntityConfig(entityType) {
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
    case "IL":
    case "InventoryLedger": {
      modelName = "InventoryLedger";
      queryField = "transactionNumber";
      const monthShort = new Date().toLocaleString("en-US", { month: "short" }).toUpperCase();
      matchRegex = new RegExp(`^(?:TRX|IL)-${monthShort}-([0-9]+)$`, "i");
      padLength = 3;
      formatCode = (seq) => `TRX-${monthShort}-${String(seq).padStart(Math.max(3, String(seq).length), "0")}`;
      break;
    }

    case "DC":
    case "DO":
    case "DeliveryChallan":
    case "DispatchOrder":
      modelName = "DeliveryChallan";
      queryField = "dcNumber";
      matchRegex = /^(?:DO|DC)-(?:(?:[0-9]{4})-)?([0-9]+)$/i;
      padLength = 3;
      formatCode = (seq) => `DO-${String(seq).padStart(Math.max(3, String(seq).length), "0")}`;
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

  return { modelName, queryField, matchRegex, padLength, formatCode };
}

/**
 * Finds the highest numerical suffix in a collection for a given company and regex.
 */
async function findMaxExistingNumber(modelName, queryField, regex, companyId) {
  try {
    const Model = mongoose.model(modelName);
    const filter = {};
    if (companyId) {
      const objId = toObjectId(companyId);
      filter.company = objId ? { $in: [objId, String(companyId)] } : companyId;
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
      const objId = toObjectId(companyId);
      filter.company = objId ? { $in: [objId, String(companyId)] } : companyId;
    }
    return await Model.exists(filter);
  } catch (err) {
    return false;
  }
}

/**
 * READ-ONLY PREVIEW: Peeks what the next sequence number will be WITHOUT modifying
 * or incrementing any database counter. Safe and idempotent for GET endpoints.
 *
 * @param {'PO'|'SO'|'CS'|'PB'|'TRX'|'DC'|'QT'} entityType
 * @param {string|ObjectId} companyId
 * @returns {Promise<string>} e.g. "PO-005", "PB-003", "SO-0006"
 */
async function peekNextSequenceNumber(entityType, companyId) {
  const { modelName, queryField, matchRegex, formatCode } = getEntityConfig(entityType);

  let maxVal = 0;
  if (modelName && matchRegex) {
    maxVal = await findMaxExistingNumber(modelName, queryField, matchRegex, companyId);
    if (entityType === "SO" || entityType === "SalesOrder") {
      const legacyMax = await findMaxExistingNumber("SalesOrder", "orderNumber", matchRegex, companyId);
      if (legacyMax > maxVal) maxVal = legacyMax;
    }
  }

  return formatCode(maxVal + 1);
}

/**
 * Synchronizes the sequence counter when an order or batch is saved with a claimed code.
 * Ensures the Sequence doc is at least at this number so subsequent generations don't collide.
 */
async function syncSequenceNumber(entityType, companyId, claimedCode) {
  if (!claimedCode) return;
  const compIdStr = companyId ? String(companyId) : "GLOBAL";
  const prefixKey = `${entityType}_${compIdStr}`;
  const { matchRegex } = getEntityConfig(entityType);

  if (matchRegex && typeof claimedCode === 'string') {
    const match = claimedCode.match(matchRegex);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) {
        await Sequence.findOneAndUpdate(
          { prefix: prefixKey },
          { $max: { sequence: num } },
          { upsert: true }
        );
      }
    }
  }
}

/**
 * Globally assigns the next sequential number atomically with FIFO ordering.
 * Used ONLY when an order/batch is actually saved/persisted.
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
    const { modelName, queryField, matchRegex, formatCode } = getEntityConfig(entityType);

    // Current true maximum in database
    let maxVal = 0;
    if (modelName && matchRegex) {
      maxVal = await findMaxExistingNumber(modelName, queryField, matchRegex, companyId);
      if (entityType === "SO" || entityType === "SalesOrder") {
        const legacyMax = await findMaxExistingNumber("SalesOrder", "orderNumber", matchRegex, companyId);
        if (legacyMax > maxVal) maxVal = legacyMax;
      }
    }

    let seqDoc = await Sequence.findOne({ prefix: prefixKey });
    let nextSeq = maxVal + 1;

    if (seqDoc) {
      // If sequence in doc was higher AND that number is actually taken, advance from there.
      // But if seqDoc was inflated by abandoned modals (where seqDoc > maxVal), reset to maxVal + 1
      if (seqDoc.sequence > maxVal) {
        const testCode = formatCode(seqDoc.sequence);
        const exists = await checkIfCodeExists(modelName, queryField, testCode, companyId);
        if (exists) {
          nextSeq = seqDoc.sequence + 1;
        } else {
          nextSeq = maxVal + 1;
        }
      } else {
        nextSeq = Math.max(seqDoc.sequence, maxVal) + 1;
      }
    }

    seqDoc = await Sequence.findOneAndUpdate(
      { prefix: prefixKey },
      { $set: { sequence: nextSeq } },
      { returnDocument: "after", upsert: true }
    );

    let candidateCode = formatCode(seqDoc.sequence);
    let attempts = 0;

    // Safety: ensure no collisions with legacy/custom numbers
    if (modelName) {
      let exists = await checkIfCodeExists(modelName, queryField, candidateCode, companyId);
      if (!exists && (entityType === "SO" || entityType === "SalesOrder")) {
        exists = await checkIfCodeExists("SalesOrder", "orderNumber", candidateCode, companyId);
      }

      while (exists && attempts < 50) {
        attempts++;
        const currentMax = Math.max(
          seqDoc.sequence,
          await findMaxExistingNumber(modelName, queryField, matchRegex, companyId)
        );

        seqDoc = await Sequence.findOneAndUpdate(
          { prefix: prefixKey },
          { $set: { sequence: currentMax + 1 } },
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

/**
 * Repairs inflated sequence numbers in the Sequence collection caused by prior
 * preview incrementing. Syncs counters down to true collection max.
 */
async function repairAllSequences() {
  try {
    const sequences = await Sequence.find({}).lean();
    for (const seq of sequences) {
      const parts = seq.prefix.split("_");
      const entityType = parts[0];
      const companyId = parts.length > 1 ? parts[1] : null;

      const config = getEntityConfig(entityType);
      if (config.modelName && config.matchRegex) {
        let maxVal = await findMaxExistingNumber(config.modelName, config.queryField, config.matchRegex, companyId);
        if (entityType === "SO" || entityType === "SalesOrder") {
          const legacyMax = await findMaxExistingNumber("SalesOrder", "orderNumber", config.matchRegex, companyId);
          if (legacyMax > maxVal) maxVal = legacyMax;
        }

        if (seq.sequence > maxVal) {
          await Sequence.updateOne(
            { _id: seq._id },
            { $set: { sequence: maxVal } }
          );
        }
      }
    }
  } catch (err) {
    console.error("Error repairing sequences:", err.message);
  }
}

module.exports = {
  peekNextSequenceNumber,
  getNextSequenceNumber,
  syncSequenceNumber,
  repairAllSequences,
  findMaxExistingNumber
};

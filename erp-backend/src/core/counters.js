/** Per-company sequential numbers (CS-0001, PR-0001 ...), allocated atomically inside the caller's transaction. */
const mongoose = require("mongoose");
const { CoreCounter } = require("./conversions/models");

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isDuplicateKey = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ""));

/** Create the counter row outside the transaction so concurrent first uses cannot collide. */
async function ensureCounter(companyId, prefix) {
  await CoreCounter.updateOne({ companyId: oid(companyId), key: prefix }, { $setOnInsert: { seq: 0 } }, { upsert: true })
    .catch((e) => { if (!isDuplicateKey(e)) throw e; });
}

async function nextNumber(companyId, prefix, session) {
  const c = await CoreCounter.findOneAndUpdate({ companyId: oid(companyId), key: prefix }, { $inc: { seq: 1 } }, { returnDocument: "after", session });
  return `${prefix}-${String(c.seq).padStart(4, "0")}`;
}

module.exports = { ensureCounter, nextNumber };

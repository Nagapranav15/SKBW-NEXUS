/**
 * Receivables for the new core.
 *
 *  PartyLedger   append-only record of everything that changes what a customer owes (single source of truth)
 *  PartyBalance  what the customer owes now (+ = they owe us, - = advance / credit), kept in the same
 *                transaction as each ledger entry
 *  Receivable    one open item per invoice with how much of it has been paid
 *  Payment       money received, with its allocation to invoices
 */
const mongoose = require("mongoose");
const { Schema } = mongoose;

const LEDGER_TYPES = ["OPENING", "INVOICE", "PAYMENT", "CREDIT_NOTE", "DEBIT_NOTE", "ADJUSTMENT", "REVERSAL"];

const partyLedgerSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  partyId: { type: Schema.Types.ObjectId, ref: "Party", required: true },
  date: { type: Date, required: true },
  txnType: { type: String, enum: LEDGER_TYPES, required: true },
  direction: { type: String, enum: ["DR", "CR"], required: true }, // DR = customer owes more, CR = owes less
  amount: { type: Number, required: true, min: 0.01 },
  referenceType: { type: String, default: "" },
  referenceId: { type: String, default: "" },
  referenceNumber: { type: String, default: "" },
  runningBalance: { type: Number, required: true },
  remarks: { type: String, default: "" },
  idempotencyKey: { type: String, default: undefined },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: true });
partyLedgerSchema.index({ companyId: 1, partyId: 1, date: 1, createdAt: 1 });
partyLedgerSchema.index({ companyId: 1, referenceType: 1, referenceId: 1 });
partyLedgerSchema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });

const IMMUTABLE = ["updateOne", "updateMany", "findOneAndUpdate", "findOneAndReplace", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"];
partyLedgerSchema.pre(IMMUTABLE, function () { throw new Error("The party ledger is append-only: post a correcting entry instead"); });
partyLedgerSchema.pre("save", function () { if (!this.isNew) throw new Error("The party ledger is append-only: post a correcting entry instead"); });

const partyBalanceSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  partyId: { type: Schema.Types.ObjectId, ref: "Party", required: true },
  balance: { type: Number, default: 0 },
}, { timestamps: true, strict: true });
partyBalanceSchema.index({ companyId: 1, partyId: 1 }, { unique: true });

const receivableSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  partyId: { type: Schema.Types.ObjectId, ref: "Party", required: true },
  invoiceId: { type: String, required: true },
  invoiceNumber: { type: String, required: true },
  invoiceDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  total: { type: Number, required: true, min: 0 },
  paid: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ["Open", "Partial", "Paid", "Cancelled"], default: "Open" },
}, { timestamps: true, strict: true });
receivableSchema.index({ companyId: 1, invoiceId: 1 }, { unique: true });
receivableSchema.index({ companyId: 1, partyId: 1, status: 1, dueDate: 1 });

const paymentSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  number: { type: String, required: true },
  partyId: { type: Schema.Types.ObjectId, ref: "Party", required: true },
  date: { type: Date, required: true },
  amount: { type: Number, required: true, min: 0.01 },
  mode: { type: String, enum: ["CASH", "UPI", "BANK", "CHEQUE", "CARD"], required: true },
  reference: { type: String, default: "" },
  allocations: [{ receivableId: { type: Schema.Types.ObjectId, ref: "Receivable" }, invoiceNumber: String, amount: Number, _id: false }],
  unallocated: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ["Posted", "Reversed"], default: "Posted" },
  reversedReason: { type: String, default: "" },
  notes: { type: String, default: "" },
  idempotencyKey: { type: String, default: undefined },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true, strict: true });
paymentSchema.index({ companyId: 1, number: 1 }, { unique: true });
paymentSchema.index({ companyId: 1, partyId: 1, date: -1 });
paymentSchema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });

const PartyLedger = mongoose.models.PartyLedger || mongoose.model("PartyLedger", partyLedgerSchema);
const PartyBalance = mongoose.models.PartyBalance || mongoose.model("PartyBalance", partyBalanceSchema);
const Receivable = mongoose.models.Receivable || mongoose.model("Receivable", receivableSchema);
const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);

module.exports = { PartyLedger, PartyBalance, Receivable, Payment, LEDGER_TYPES };

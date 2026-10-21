/**
 * Receivables engine. The party ledger is the single source of truth for what a customer owes.
 *
 * Every posting runs in ONE transaction that writes the ledger entry, the party balance and the open items
 * together. Rules:
 *   - an invoice creates a DR entry and one open item (Receivable); cancelling it posts the opposite CR entry
 *   - a payment creates a CR entry for the full amount and is allocated to open items (oldest due date first,
 *     or as the user specifies); whatever is not allocated stays on the customer as an advance and is applied
 *     automatically to the next invoice
 *   - an opening balance is an open item too, so payments settle it like any invoice
 *   - nothing is edited or deleted: reversing a payment or cancelling an invoice posts a correcting entry
 *
 * Invariant checked by `reconcile`: balance = sum(open item remaining) - sum(unallocated payment amounts).
 */
const mongoose = require("mongoose");
const { PartyLedger, PartyBalance, Receivable, Payment } = require("./models");
const stock = require("../stock/stockService");
const { roundMoney } = require("../stock/costing");
const { ensureCounter, nextNumber } = require("../counters");

const { StockError, withTransaction } = stock;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isDuplicateKey = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ""));
const DAY = 24 * 60 * 60 * 1000;

/** Legacy invoices store dates as strings: ISO ("2026-10-08") or "dd/mm/yyyy". */
function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  const d = dmy ? new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadParty(companyId, partyId, session) {
  const Party = mongoose.model("Party");
  const party = await Party.findOne({ _id: oid(partyId), company: oid(companyId) }).select("firmName ownerName type creditLimit creditDays isDeleted").session(session || null).lean();
  if (!party || party.isDeleted) throw new StockError("Customer not found for this company", 404, "PARTY_NOT_FOUND");
  return party;
}

async function ensureBalanceRow(companyId, partyId) {
  await PartyBalance.updateOne({ companyId: oid(companyId), partyId: oid(partyId) }, { $setOnInsert: { balance: 0 } }, { upsert: true })
    .catch((e) => { if (!isDuplicateKey(e)) throw e; });
}

/** Post one ledger entry and move the party balance, inside the caller's transaction. */
async function postLedger(e, session) {
  const companyId = oid(e.companyId);
  const partyId = oid(e.partyId);
  const amount = roundMoney(e.amount);
  if (!(amount > 0)) throw new StockError("Amount must be greater than zero", 400, "INVALID_AMOUNT");

  if (e.idempotencyKey) {
    const existing = await PartyLedger.findOne({ companyId, idempotencyKey: e.idempotencyKey }).session(session).lean();
    if (existing) return { entry: existing, duplicate: true };
  }
  const bal = await PartyBalance.findOne({ companyId, partyId }).session(session);
  if (!bal) throw new StockError("Party balance row was not initialised", 500, "NOT_INITIALISED");
  const next = roundMoney(bal.balance + (e.direction === "DR" ? amount : -amount));
  await PartyBalance.updateOne({ _id: bal._id }, { $set: { balance: next } }, { session });
  const [entry] = await PartyLedger.create([{
    companyId, partyId, date: e.date || new Date(), txnType: e.txnType, direction: e.direction, amount,
    referenceType: e.referenceType || "", referenceId: e.referenceId ? String(e.referenceId) : "", referenceNumber: e.referenceNumber || "",
    runningBalance: next, remarks: e.remarks || "", idempotencyKey: e.idempotencyKey || undefined,
    createdBy: e.userId ? oid(e.userId) : undefined,
  }], { session });
  return { entry: entry.toObject(), duplicate: false };
}

const remainingOf = (r) => roundMoney(r.total - r.paid);
const statusOf = (r) => (r.paid <= 0 ? "Open" : remainingOf(r) <= 0 ? "Paid" : "Partial");

/** Apply `amount` to open items, oldest due date first (or exactly as `explicit` says). Returns allocations. */
async function allocate(companyId, partyId, amount, explicit, session) {
  const allocations = [];
  let left = roundMoney(amount);
  const apply = async (r, take) => {
    r.paid = roundMoney(r.paid + take);
    await Receivable.updateOne({ _id: r._id }, { $set: { paid: r.paid, status: statusOf(r) } }, { session });
    allocations.push({ receivableId: r._id, invoiceNumber: r.invoiceNumber, amount: take });
    left = roundMoney(left - take);
  };

  if (Array.isArray(explicit) && explicit.length > 0) {
    const sum = roundMoney(explicit.reduce((s, a) => s + a.amount, 0));
    if (sum > left) throw new StockError("Allocations are more than the payment amount", 400, "OVER_ALLOCATED");
    for (const a of explicit) {
      const r = await Receivable.findOne({ _id: oid(a.receivableId), companyId: oid(companyId), partyId: oid(partyId) }).session(session);
      if (!r || r.status === "Cancelled") throw new StockError("Invoice not found for this customer", 404, "RECEIVABLE_NOT_FOUND");
      if (roundMoney(a.amount) > remainingOf(r)) throw new StockError(`${r.invoiceNumber}: only ${remainingOf(r)} is outstanding`, 409, "OVER_ALLOCATED");
      await apply(r, roundMoney(a.amount));
    }
    return { allocations, unallocated: left };
  }

  const open = await Receivable.find({ companyId: oid(companyId), partyId: oid(partyId), status: { $in: ["Open", "Partial"] } }).sort({ dueDate: 1, invoiceDate: 1, _id: 1 }).session(session);
  for (const r of open) {
    if (left <= 0) break;
    const take = Math.min(left, remainingOf(r));
    if (take > 0) await apply(r, roundMoney(take));
  }
  return { allocations, unallocated: left };
}

/** Put any advance (unallocated payment money) against open items; used after a new invoice appears. */
async function applyAdvances(companyId, partyId, session) {
  const payments = await Payment.find({ companyId: oid(companyId), partyId: oid(partyId), status: "Posted", unallocated: { $gt: 0 } }).sort({ date: 1, _id: 1 }).session(session);
  for (const p of payments) {
    const { allocations, unallocated } = await allocate(companyId, partyId, p.unallocated, null, session);
    if (allocations.length > 0) {
      await Payment.updateOne({ _id: p._id }, { $set: { unallocated }, $push: { allocations: { $each: allocations } } }, { session });
    }
  }
}

// ── Invoices ─────────────────────────────────────────────────────────────────

async function loadInvoice(companyId, invoiceRef) {
  const SalesInvoice = mongoose.model("SalesInvoice");
  const byId = mongoose.isValidObjectId(invoiceRef) ? { _id: oid(invoiceRef) } : null;
  const filter = { company: oid(companyId), ...(byId || { invoiceNumber: String(invoiceRef) }) };
  const inv = await SalesInvoice.findOne(filter).lean();
  if (!inv) throw new StockError("Invoice not found", 404, "INVOICE_NOT_FOUND");
  return inv;
}

/** Turn an issued invoice into a receivable and a DR ledger entry. Safe to call twice. */
async function postInvoice({ companyId, invoiceId, userId }) {
  const inv = await loadInvoice(companyId, invoiceId);
  if (inv.status === "cancelled" || inv.status === "draft") throw new StockError(`A ${inv.status} invoice cannot be posted`, 409, "INVOICE_NOT_POSTABLE");
  const partyRef = inv.customerId && inv.customerId._id ? inv.customerId._id : inv.customerId;
  if (!partyRef || !mongoose.isValidObjectId(String(partyRef))) throw new StockError("This invoice has no linked customer", 400, "INVOICE_HAS_NO_CUSTOMER");
  const party = await loadParty(companyId, partyRef);
  const total = roundMoney(inv.grandTotal);
  if (!(total > 0)) throw new StockError("Invoice total must be greater than zero", 400, "INVALID_AMOUNT");

  const invoiceDate = parseDate(inv.invoiceDate) || inv.createdAt || new Date();
  const dueDate = parseDate(inv.dueDate) || new Date(invoiceDate.getTime() + (Number(party.creditDays) || 0) * DAY);
  const key = String(inv._id);

  await ensureBalanceRow(companyId, party._id);
  return withTransaction(async (session) => {
    const existing = await Receivable.findOne({ companyId: oid(companyId), invoiceId: key }).session(session).lean();
    if (existing) return { receivable: existing, duplicate: true };
    const [rec] = await Receivable.create([{ companyId: oid(companyId), partyId: party._id, invoiceId: key, invoiceNumber: inv.invoiceNumber, invoiceDate, dueDate, total }], { session });
    await postLedger({
      companyId, partyId: party._id, date: invoiceDate, txnType: "INVOICE", direction: "DR", amount: total,
      referenceType: "INVOICE", referenceId: key, referenceNumber: inv.invoiceNumber, idempotencyKey: `INVOICE:${key}`, userId,
    }, session);
    await applyAdvances(companyId, party._id, session);
    return { receivable: (await Receivable.findById(rec._id).session(session).lean()), duplicate: false };
  });
}

/** Cancel an invoice: only possible while nothing has been paid against it. */
async function cancelInvoice({ companyId, invoiceId, reason, userId }) {
  // An ObjectId is enough: the legacy invoice may already be deleted when this is called
  const key = mongoose.isValidObjectId(String(invoiceId)) ? String(invoiceId) : String((await loadInvoice(companyId, invoiceId))._id);
  return withTransaction(async (session) => {
    const rec = await Receivable.findOne({ companyId: oid(companyId), invoiceId: key }).session(session);
    if (!rec) return { cancelled: false, reason: "NOT_POSTED" }; // never reached the ledger, nothing to undo
    if (rec.status === "Cancelled") return { cancelled: true, duplicate: true, receivable: rec.toObject() };
    if (rec.paid > 0) throw new StockError("Payments are allocated to this invoice. Reverse them first.", 409, "INVOICE_HAS_PAYMENTS");
    await Receivable.updateOne({ _id: rec._id }, { $set: { status: "Cancelled" } }, { session });
    await postLedger({
      companyId, partyId: rec.partyId, date: new Date(), txnType: "REVERSAL", direction: "CR", amount: rec.total,
      referenceType: "INVOICE", referenceId: key, referenceNumber: rec.invoiceNumber, remarks: `Invoice cancelled${reason ? `: ${reason}` : ""}`,
      idempotencyKey: `INVOICE_CANCEL:${key}`, userId,
    }, session);
    return { cancelled: true, receivable: { ...rec.toObject(), status: "Cancelled" } };
  });
}

/** The legacy invoice total changed after posting: carry the difference into the ledger as an adjustment. */
async function adjustInvoiceTotal({ companyId, invoiceId, userId }) {
  const inv = await loadInvoice(companyId, invoiceId);
  const key = String(inv._id);
  const newTotal = roundMoney(inv.grandTotal);
  return withTransaction(async (session) => {
    const rec = await Receivable.findOne({ companyId: oid(companyId), invoiceId: key }).session(session);
    if (!rec || rec.status === "Cancelled") return { adjusted: false, reason: "NOT_POSTED" };
    const diff = roundMoney(newTotal - rec.total);
    if (diff === 0) return { adjusted: false, reason: "UNCHANGED" };
    if (!(newTotal > 0)) throw new StockError("Invoice total must be greater than zero", 400, "INVALID_AMOUNT");
    if (newTotal < rec.paid) throw new StockError("The new total is less than what has already been paid on this invoice", 409, "INVOICE_HAS_PAYMENTS");
    rec.total = newTotal;
    await Receivable.updateOne({ _id: rec._id }, { $set: { total: newTotal, status: statusOf(rec) } }, { session });
    await postLedger({
      companyId, partyId: rec.partyId, date: new Date(), txnType: "ADJUSTMENT", direction: diff > 0 ? "DR" : "CR", amount: Math.abs(diff),
      referenceType: "INVOICE", referenceId: key, referenceNumber: rec.invoiceNumber, remarks: `Invoice total changed to ${newTotal}`, userId,
    }, session);
    if (diff < 0) await applyAdvances(companyId, rec.partyId, session);
    return { adjusted: true, difference: diff };
  });
}

// ── Opening balance ──────────────────────────────────────────────────────────

/** What the customer already owed when this ledger started. One per customer; treated as the oldest open item. */
async function setOpeningBalance({ companyId, partyId, amount, date, userId }) {
  const party = await loadParty(companyId, partyId);
  const total = roundMoney(amount);
  if (!(total > 0)) throw new StockError("Opening balance must be greater than zero (customers with nothing owed need no entry)", 400, "INVALID_AMOUNT");
  const on = parseDate(date) || new Date();
  await ensureBalanceRow(companyId, party._id);
  try {
    return await withTransaction(async (session) => {
      const key = `OPENING:${party._id}`;
      const existing = await Receivable.findOne({ companyId: oid(companyId), invoiceId: key }).session(session).lean();
      if (existing) throw new StockError("An opening balance already exists for this customer", 409, "OPENING_EXISTS");
      const [rec] = await Receivable.create([{ companyId: oid(companyId), partyId: party._id, invoiceId: key, invoiceNumber: "Opening Balance", invoiceDate: on, dueDate: on, total }], { session });
      const posted = await postLedger({ companyId, partyId: party._id, date: on, txnType: "OPENING", direction: "DR", amount: total, referenceType: "OPENING", referenceId: key, referenceNumber: "Opening Balance", idempotencyKey: key, userId }, session);
      await applyAdvances(companyId, party._id, session);
      return { receivable: rec.toObject(), entry: posted.entry };
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new StockError("An opening balance already exists for this customer", 409, "OPENING_EXISTS");
    throw e;
  }
}

// ── Payments ─────────────────────────────────────────────────────────────────

async function recordPayment(p) {
  const amount = roundMoney(p.amount);
  if (!(amount > 0)) throw new StockError("Payment amount must be greater than zero", 400, "INVALID_AMOUNT");
  const party = await loadParty(p.companyId, p.partyId);

  if (p.idempotencyKey) {
    const existing = await Payment.findOne({ companyId: oid(p.companyId), idempotencyKey: p.idempotencyKey }).lean();
    if (existing) return { payment: existing, duplicate: true };
  }
  await ensureBalanceRow(p.companyId, party._id);
  await ensureCounter(p.companyId, "PR");

  try {
    return await postPayment(p, party, amount);
  } catch (e) {
    // Two identical submissions racing: the loser returns the winner's payment instead of failing
    if (isDuplicateKey(e) && p.idempotencyKey) {
      const existing = await Payment.findOne({ companyId: oid(p.companyId), idempotencyKey: p.idempotencyKey }).lean();
      if (existing) return { payment: existing, duplicate: true };
    }
    throw e;
  }
}

function postPayment(p, party, amount) {
  return withTransaction(async (session) => {
    const number = await nextNumber(p.companyId, "PR", session);
    const date = parseDate(p.date) || new Date();
    await postLedger({
      companyId: p.companyId, partyId: party._id, date, txnType: "PAYMENT", direction: "CR", amount,
      referenceType: "PAYMENT", referenceId: number, referenceNumber: number, remarks: `${p.mode}${p.reference ? ` ${p.reference}` : ""}`,
      userId: p.userId,
    }, session);
    const { allocations, unallocated } = await allocate(p.companyId, party._id, amount, p.allocations, session);
    const [payment] = await Payment.create([{
      companyId: oid(p.companyId), number, partyId: party._id, date, amount, mode: p.mode, reference: p.reference || "",
      allocations, unallocated, notes: p.notes || "", idempotencyKey: p.idempotencyKey || undefined, createdBy: p.userId ? oid(p.userId) : undefined,
    }], { session });
    return { payment: payment.toObject(), duplicate: false };
  });
}

/** Undo a payment with a correcting entry: the invoices it settled become outstanding again. */
async function reversePayment({ companyId, paymentId, reason, userId }) {
  if (!reason || !String(reason).trim()) throw new StockError("A reason is required to reverse a payment", 400, "REASON_REQUIRED");
  return withTransaction(async (session) => {
    const pay = await Payment.findOne({ _id: oid(paymentId), companyId: oid(companyId) }).session(session);
    if (!pay) throw new StockError("Payment not found", 404, "NOT_FOUND");
    if (pay.status === "Reversed") return { payment: pay.toObject(), duplicate: true };
    for (const a of pay.allocations) {
      const r = await Receivable.findById(a.receivableId).session(session);
      if (!r) continue;
      r.paid = roundMoney(Math.max(0, r.paid - a.amount));
      await Receivable.updateOne({ _id: r._id }, { $set: { paid: r.paid, status: r.status === "Cancelled" ? "Cancelled" : statusOf(r) } }, { session });
    }
    await postLedger({
      companyId, partyId: pay.partyId, date: new Date(), txnType: "REVERSAL", direction: "DR", amount: pay.amount,
      referenceType: "PAYMENT", referenceId: pay.number, referenceNumber: pay.number, remarks: `Payment reversed: ${reason}`,
      idempotencyKey: `PAYMENT_REVERSE:${pay._id}`, userId,
    }, session);
    pay.status = "Reversed";
    pay.reversedReason = reason;
    pay.unallocated = 0;
    await pay.save({ session });
    return { payment: pay.toObject(), duplicate: false };
  });
}

// ── Reads ────────────────────────────────────────────────────────────────────

async function getBalance(companyId, partyId) {
  const b = await PartyBalance.findOne({ companyId: oid(companyId), partyId: oid(partyId) }).lean();
  return { partyId, balance: b ? b.balance : 0 };
}

async function getStatement(companyId, partyId, { from, to } = {}) {
  await loadParty(companyId, partyId);
  const f = parseDate(from);
  const t = parseDate(to);
  const base = { companyId: oid(companyId), partyId: oid(partyId) };
  let opening = 0;
  if (f) {
    const prior = await PartyLedger.findOne({ ...base, date: { $lt: f } }).sort({ date: -1, createdAt: -1, _id: -1 }).lean();
    opening = prior ? prior.runningBalance : 0;
  }
  const range = { ...base, ...(f || t ? { date: { ...(f ? { $gte: f } : {}), ...(t ? { $lte: t } : {}) } } : {}) };
  const rows = await PartyLedger.find(range).sort({ date: 1, createdAt: 1, _id: 1 }).lean();
  const debit = roundMoney(rows.filter((r) => r.direction === "DR").reduce((s, r) => s + r.amount, 0));
  const credit = roundMoney(rows.filter((r) => r.direction === "CR").reduce((s, r) => s + r.amount, 0));
  return { openingBalance: opening, rows, totalDebit: debit, totalCredit: credit, closingBalance: roundMoney(opening + debit - credit) };
}

/** Can this customer take `amount` more on credit? limit 0 = cash only; no limit set = unrestricted but flagged. */
async function getCreditStatus(companyId, partyId, amount = 0) {
  const party = await loadParty(companyId, partyId);
  const { balance } = await getBalance(companyId, partyId);
  const open = await Receivable.find({ companyId: oid(companyId), partyId: oid(partyId), status: { $in: ["Open", "Partial"] } }).lean();
  const now = Date.now();
  const overdueAmount = roundMoney(open.filter((r) => r.dueDate.getTime() < now).reduce((s, r) => s + remainingOf(r), 0));
  const limitSet = party.creditLimit !== undefined && party.creditLimit !== null;
  const limit = limitSet ? party.creditLimit : null;
  const requested = roundMoney(amount);
  let allowed = true;
  let reason = "OK";
  if (limitSet && limit === 0) {
    allowed = requested <= Math.max(0, -balance); // cash customer: only an advance on account can cover it
    reason = allowed ? "COVERED_BY_ADVANCE" : "CASH_CUSTOMER";
  } else if (limitSet && balance + requested > limit) {
    allowed = false;
    reason = "CREDIT_LIMIT_EXCEEDED";
  } else if (!limitSet) {
    reason = "NO_LIMIT_SET";
  }
  return {
    partyId, balance, creditLimit: limit, limitSet, creditDays: Number(party.creditDays) || 0,
    available: limitSet ? roundMoney(limit - balance) : null, overdueAmount, hasOverdue: overdueAmount > 0,
    requested, allowed, reason,
  };
}

async function listReceivables(companyId, { partyId, status } = {}) {
  const filter = { companyId: oid(companyId), ...(partyId ? { partyId: oid(partyId) } : {}), ...(status ? { status } : { status: { $ne: "Cancelled" } }) };
  const rows = await Receivable.find(filter).sort({ dueDate: 1, invoiceDate: 1 }).limit(2000).lean();
  return rows.map((r) => ({ ...r, remaining: remainingOf(r) }));
}

const BUCKETS = [["current", null], ["d1_30", 30], ["d31_60", 60], ["d61_90", 90], ["d90_plus", Infinity]];

/** Outstanding by customer, aged by days past the due date. Advances are shown separately. */
async function getAgeing(companyId, { asOf } = {}) {
  const at = parseDate(asOf) || new Date();
  const open = await Receivable.find({ companyId: oid(companyId), status: { $in: ["Open", "Partial"] } }).lean();
  const advances = await Payment.aggregate([
    { $match: { companyId: oid(companyId), status: "Posted", unallocated: { $gt: 0 } } },
    { $group: { _id: "$partyId", advance: { $sum: "$unallocated" } } },
  ]);
  const byParty = new Map();
  const row = (id) => {
    const k = String(id);
    if (!byParty.has(k)) byParty.set(k, { partyId: id, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0, advance: 0 });
    return byParty.get(k);
  };
  open.forEach((r) => {
    const rem = remainingOf(r);
    const late = Math.floor((at.getTime() - r.dueDate.getTime()) / DAY);
    const bucket = late <= 0 ? "current" : late <= 30 ? "d1_30" : late <= 60 ? "d31_60" : late <= 90 ? "d61_90" : "d90_plus";
    const x = row(r.partyId);
    x[bucket] = roundMoney(x[bucket] + rem);
    x.total = roundMoney(x.total + rem);
  });
  advances.forEach((a) => { row(a._id).advance = roundMoney(a.advance); });

  const Party = mongoose.model("Party");
  const parties = await Party.find({ _id: { $in: [...byParty.values()].map((r) => r.partyId) }, company: oid(companyId) }).select("firmName ownerName").lean();
  const nameOf = new Map(parties.map((p) => [String(p._id), p.firmName || p.ownerName || "Customer"]));
  const rows = [...byParty.values()].map((r) => ({ ...r, name: nameOf.get(String(r.partyId)) || "Customer", net: roundMoney(r.total - r.advance) })).sort((a, b) => b.total - a.total);
  const totals = BUCKETS.reduce((t, [k]) => ({ ...t, [k]: roundMoney(rows.reduce((s, r) => s + r[k], 0)) }), { total: roundMoney(rows.reduce((s, r) => s + r.total, 0)), advance: roundMoney(rows.reduce((s, r) => s + r.advance, 0)) });
  return { asOf: at, rows, totals };
}

/** The identity that must always hold: balance = open items - advances, and the ledger sums to the balance. */
async function reconcile(companyId, partyId) {
  const base = { companyId: oid(companyId), partyId: oid(partyId) };
  const [agg] = await PartyLedger.aggregate([{ $match: base }, { $group: { _id: null, dr: { $sum: { $cond: [{ $eq: ["$direction", "DR"] }, "$amount", 0] } }, cr: { $sum: { $cond: [{ $eq: ["$direction", "CR"] }, "$amount", 0] } } } }]);
  const ledgerBalance = roundMoney((agg ? agg.dr : 0) - (agg ? agg.cr : 0));
  const { balance } = await getBalance(companyId, partyId);
  const open = await Receivable.find({ ...base, status: { $in: ["Open", "Partial"] } }).lean();
  const openTotal = roundMoney(open.reduce((s, r) => s + remainingOf(r), 0));
  const [adv] = await Payment.aggregate([{ $match: { ...base, status: "Posted" } }, { $group: { _id: null, a: { $sum: "$unallocated" } } }]);
  const advance = roundMoney(adv ? adv.a : 0);
  return { ok: ledgerBalance === balance && roundMoney(openTotal - advance) === balance, ledgerBalance, storedBalance: balance, openItems: openTotal, advance };
}

async function listPayments(companyId, { partyId, limit = 100 } = {}) {
  const filter = { companyId: oid(companyId), ...(partyId ? { partyId: oid(partyId) } : {}) };
  return Payment.find(filter).sort({ date: -1, _id: -1 }).limit(Math.min(parseInt(limit, 10) || 100, 500)).lean();
}

async function getPayment(companyId, id) {
  const p = await Payment.findOne({ _id: oid(id), companyId: oid(companyId) }).lean();
  if (!p) throw new StockError("Payment not found", 404, "NOT_FOUND");
  return p;
}

module.exports = {
  parseDate, postInvoice, cancelInvoice, adjustInvoiceTotal, setOpeningBalance, recordPayment, reversePayment,
  getBalance, getStatement, getCreditStatus, listReceivables, getAgeing, reconcile, listPayments, getPayment,
};

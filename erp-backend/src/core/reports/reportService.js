/**
 * Management reports. Every figure is read from the authoritative ledgers (stock ledger, party ledger,
 * conversions, receivables); nothing is recomputed from screens or cached client-side.
 *
 * Scope note: these reports see what has been recorded in the new ledgers. Until the migration has been
 * applied and the old payment screens retired, legacy-only data (e.g. old payments) is not included.
 * Profit/margin is deliberately NOT reported yet: legacy invoice lines are not linked to stock items or units.
 */
const mongoose = require("mongoose");
const { StockLedger, ItemCost } = require("../stock/models");
const { Conversion } = require("../conversions/models");
const { Receivable, Payment, PartyBalance } = require("../sales/models");
const sales = require("../sales/salesService");
const stock = require("../stock/stockService");
const { roundMoney, roundQty } = require("../stock/costing");

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const range = (from, to) => {
  const f = sales.parseDate(from);
  const t = sales.parseDate(to);
  return { f, t, match: f || t ? { ...(f ? { $gte: f } : {}), ...(t ? { $lte: new Date(t.getTime() + 24 * 3600 * 1000 - 1) } : {}) } : null };
};
const sum = (arr, k) => roundMoney(arr.reduce((s, x) => s + (x[k] || 0), 0));

/** Headline numbers for the owner. */
async function overview(companyId, { from, to } = {}) {
  const c = oid(companyId);
  const { match } = range(from, to);
  const dateFilter = (field) => (match ? { [field]: match } : {});

  const [ageing, invoiced, collections, valuation, conv] = await Promise.all([
    sales.getAgeing(companyId),
    Receivable.aggregate([
      { $match: { companyId: c, status: { $ne: "Cancelled" }, invoiceId: { $not: /^OPENING:/ }, ...dateFilter("invoiceDate") } },
      { $group: { _id: null, amount: { $sum: "$total" }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: { companyId: c, status: "Posted", ...dateFilter("date") } },
      { $group: { _id: "$mode", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    stock.getValuation(companyId),
    Conversion.aggregate([
      { $match: { companyId: c, ...dateFilter("date") } },
      { $group: { _id: null, count: { $sum: 1 }, netCost: { $sum: "$netCost" } } },
    ]),
  ]);

  const overdue = sum(ageing.rows.map((r) => ({ v: r.d1_30 + r.d31_60 + r.d61_90 + r.d90_plus })), "v");
  const topDebtors = ageing.rows.slice(0, 5).map((r) => ({ partyId: r.partyId, name: r.name, outstanding: r.total, overdue: roundMoney(r.d1_30 + r.d31_60 + r.d61_90 + r.d90_plus) }));
  return {
    period: { from: from || null, to: to || null },
    receivables: { outstanding: ageing.totals.total, advances: ageing.totals.advance, overdue, customersOwing: ageing.rows.filter((r) => r.total > 0).length, topDebtors },
    invoiced: { amount: roundMoney(invoiced[0] ? invoiced[0].amount : 0), count: invoiced[0] ? invoiced[0].count : 0 },
    collections: { amount: roundMoney(collections.reduce((s, x) => s + x.amount, 0)), count: collections.reduce((s, x) => s + x.count, 0), byMode: collections.map((x) => ({ mode: x._id, amount: roundMoney(x.amount), count: x.count })) },
    stock: { totalValue: valuation.totalValue, itemsInStock: valuation.lines.length },
    production: { conversions: conv[0] ? conv[0].count : 0, netCost: roundMoney(conv[0] ? conv[0].netCost : 0) },
  };
}

/** Invoices by month or by customer: invoiced, collected, still outstanding. */
async function salesReport(companyId, { from, to, groupBy = "month" } = {}) {
  const c = oid(companyId);
  const { match } = range(from, to);
  const base = { companyId: c, status: { $ne: "Cancelled" }, invoiceId: { $not: /^OPENING:/ }, ...(match ? { invoiceDate: match } : {}) };
  const key = groupBy === "customer" ? "$partyId" : { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } };
  const rows = await Receivable.aggregate([
    { $match: base },
    { $group: { _id: key, invoiced: { $sum: "$total" }, collected: { $sum: "$paid" }, invoices: { $sum: 1 } } },
    { $sort: groupBy === "customer" ? { invoiced: -1 } : { _id: 1 } },
  ]);
  let names = new Map();
  if (groupBy === "customer") {
    const parties = await mongoose.model("Party").find({ _id: { $in: rows.map((r) => r._id) }, company: c }).select("firmName ownerName").lean();
    names = new Map(parties.map((p) => [String(p._id), p.firmName || p.ownerName || "Customer"]));
  }
  const out = rows.map((r) => ({
    key: groupBy === "customer" ? String(r._id) : r._id, name: groupBy === "customer" ? names.get(String(r._id)) || "Customer" : r._id,
    invoices: r.invoices, invoiced: roundMoney(r.invoiced), collected: roundMoney(r.collected), outstanding: roundMoney(r.invoiced - r.collected),
  }));
  return { groupBy, rows: out, totals: { invoices: out.reduce((s, r) => s + r.invoices, 0), invoiced: sum(out, "invoiced"), collected: sum(out, "collected"), outstanding: sum(out, "outstanding") } };
}

/** Stock movement by transaction type for a period. */
async function stockMovements(companyId, { from, to } = {}) {
  const { match } = range(from, to);
  const rows = await StockLedger.aggregate([
    { $match: { companyId: oid(companyId), ...(match ? { createdAt: match } : {}) } },
    { $group: { _id: "$txnType", entries: { $sum: 1 }, qtyIn: { $sum: "$qtyIn" }, qtyOut: { $sum: "$qtyOut" }, value: { $sum: "$totalValue" } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ txnType: r._id, entries: r.entries, qtyIn: roundQty(r.qtyIn), qtyOut: roundQty(r.qtyOut), value: roundMoney(r.value) }));
}

/** Conversions by type: what went in, what was charged, what it cost, and yield for sheeting. */
async function productionReport(companyId, { from, to } = {}) {
  const { match } = range(from, to);
  const rows = await Conversion.aggregate([
    { $match: { companyId: oid(companyId), ...(match ? { date: match } : {}) } },
    {
      $group: {
        _id: "$type", count: { $sum: 1 }, inputValue: { $sum: "$totalInputValue" }, charges: { $sum: "$totalChargeValue" },
        scrapCredit: { $sum: "$scrapCredit" }, netCost: { $sum: "$netCost" }, wastageQty: { $sum: "$wastageQty" },
        theoretical: { $sum: "$sheeting.theoreticalSheets" }, actual: { $sum: "$sheeting.actualSheets" },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({
    type: r._id, conversions: r.count, inputValue: roundMoney(r.inputValue), charges: roundMoney(r.charges), scrapCredit: roundMoney(r.scrapCredit),
    netCost: roundMoney(r.netCost), wastageQty: roundQty(r.wastageQty),
    ...(r._id === "SHEETING" && r.theoretical > 0 ? { sheetsActual: r.actual, sheetsTheoretical: r.theoretical, yieldPercent: Math.round((r.actual / r.theoretical) * 1000) / 10 } : {}),
  }));
}

const STAGES = ["PENDING", "IN_PRODUCTION", "PARTLY_DISPATCHED", "DISPATCHED", "INVOICED", "PAID"];

/**
 * Order-to-cash pipeline: sales order -> production -> dispatch (challan) -> invoice -> payment.
 * The stage is derived from the live order, challan, invoice and receivable records.
 */
async function pipeline(companyId, { limit = 300 } = {}) {
  const c = oid(companyId);
  const SalesOrderV2 = mongoose.model("SalesOrderV2");
  const DeliveryChallan = mongoose.model("DeliveryChallan");
  const SalesInvoice = mongoose.model("SalesInvoice");

  const orders = await SalesOrderV2.find({ company: c, isDeleted: { $ne: true }, status: { $nin: ["Draft", "Cancelled"] } })
    .sort({ orderDate: -1 }).limit(Math.min(parseInt(limit, 10) || 300, 1000)).lean();
  const numbers = orders.map((o) => o.orderNumber);
  const challans = await DeliveryChallan.find({ company: c, orderNumber: { $in: numbers } }).select("orderNumber dcNumber status invoiceNumber invoiceStatus").lean();
  const invoices = await SalesInvoice.find({ company: c, orderNumber: { $in: numbers }, status: { $ne: "cancelled" } }).select("_id orderNumber invoiceNumber grandTotal").lean();
  const recs = await Receivable.find({ companyId: c, invoiceId: { $in: invoices.map((i) => String(i._id)) } }).select("invoiceId status").lean();
  const recStatus = new Map(recs.map((r) => [r.invoiceId, r.status]));

  const rows = orders.map((o) => {
    const ordered = (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const dispatched = (o.items || []).reduce((s, i) => s + (Number(i.dispatchedQty) || 0), 0);
    const myChallans = challans.filter((x) => x.orderNumber === o.orderNumber);
    const myInvoices = invoices.filter((x) => x.orderNumber === o.orderNumber);
    const allInvoiced = myChallans.length > 0 && myChallans.every((x) => x.invoiceStatus === "Invoiced" || x.invoiceNumber);
    const allPaid = myInvoices.length > 0 && myInvoices.every((i) => recStatus.get(String(i._id)) === "Paid");

    let stage;
    if (dispatched <= 0) stage = o.status === "In Production" ? "IN_PRODUCTION" : "PENDING";
    else if (dispatched < ordered) stage = "PARTLY_DISPATCHED";
    else if (!allInvoiced && myInvoices.length === 0) stage = "DISPATCHED";
    else stage = allPaid ? "PAID" : "INVOICED";
    return { orderNumber: o.orderNumber, customerName: o.customerName, orderDate: o.orderDate, grandTotal: o.grandTotal || 0, orderedQty: ordered, dispatchedQty: dispatched, challans: myChallans.length, invoices: myInvoices.length, stage };
  });

  const counts = Object.fromEntries(STAGES.map((s) => [s, { orders: 0, value: 0 }]));
  rows.forEach((r) => { counts[r.stage].orders += 1; counts[r.stage].value = roundMoney(counts[r.stage].value + r.grandTotal); });
  return { stages: STAGES, counts, rows };
}

module.exports = { overview, salesReport, stockMovements, productionReport, pipeline, STAGES };

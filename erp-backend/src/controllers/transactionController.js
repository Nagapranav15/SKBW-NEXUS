const Transaction = require("../models/transactionModel");
const Party = require("../models/partyModel");
const Item = require("../models/itemModel");
const ExcelJS = require("exceljs");

// Helper: generate transaction ID
const generateTransactionId = (date) => {
  const d = new Date(date);
  const ymd = d.toISOString().split("T")[0].replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TXN-${ymd}-${rand}`;
};

// GET /api/transactions — paginated, filtered
exports.getTransactions = async (req, res) => {
  try {
    const { companyId, page = 1, limit = 50, type, category, paymentMethod, search, startDate, endDate, dataYear, source, source_type } = req.query;
    const filter = {};
    if (companyId) filter.company = companyId;
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (dataYear) filter.dataYear = Number(dataYear);
    if (source) filter.source = source;
    if (source_type) filter.source_type = source_type;
    if (search) {
      filter.$or = [
        { transactionId: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { partyName: { $regex: search, $options: "i" } },
        { ledgerAccount: { $regex: search, $options: "i" } },
        { source_type: { $regex: search, $options: "i" } }
      ];
    }
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate + "T23:59:59.999Z");
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(Number(limit)),
      Transaction.countDocuments(filter)
    ]);

    res.json({
      transactions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// GET /api/transactions/:id
exports.getTransactionById = async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.id);
    if (!txn) return res.status(404).json({ msg: "Transaction not found" });
    res.json(txn);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// POST /api/transactions
exports.createTransaction = async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user.id };
    if (!data.transactionId) {
      data.transactionId = generateTransactionId(data.date || new Date());
    }
    if (!data.dataYear) {
      data.dataYear = new Date(data.date || Date.now()).getFullYear();
    }
    data.source = data.source || "manual";
    // Manual entries from the transaction page
    if (!data.source_type) data.source_type = "MANUAL";
    const txn = await Transaction.create(data);
    res.status(201).json(txn);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ msg: "Duplicate transaction ID" });
    }
    res.status(500).json({ msg: err.message });
  }
};

// PUT /api/transactions/:id
exports.updateTransaction = async (req, res) => {
  try {
    const txn = await Transaction.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!txn) return res.status(404).json({ msg: "Transaction not found" });
    res.json(txn);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// DELETE /api/transactions/:id
exports.deleteTransaction = async (req, res) => {
  try {
    const txn = await Transaction.findByIdAndDelete(req.params.id);
    if (!txn) return res.status(404).json({ msg: "Transaction not found" });
    res.json({ msg: "Transaction deleted" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// GET /api/transactions/export/daily?date=YYYY-MM-DD&format=csv|xlsx|json&companyId=xxx
exports.exportDailyTransactions = async (req, res) => {
  try {
    const { date, format = "xlsx", companyId } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const filter = { date: { $gte: startOfDay, $lte: endOfDay } };
    if (companyId) filter.company = companyId;

    const transactions = await Transaction.find(filter).sort({ date: 1 });
    const dateStr = targetDate.toISOString().split("T")[0];
    const fileName = `transactions_${dateStr}`;

    const rows = transactions.map(t => ({
      "Date": new Date(t.date).toLocaleDateString(),
      "Transaction ID": t.transactionId,
      "Type": t.type,
      "Category": t.category,
      "Amount": t.amount,
      "Payment Method": t.paymentMethod === "custom" ? t.customPaymentMethod : t.paymentMethod,
      "Ledger/Account": t.ledgerAccount,
      "Party": t.partyName,
      "Description": t.description
    }));

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}.json"`);
      return res.json({ date: dateStr, transactions: rows });
    }

    if (format === "csv") {
      if (rows.length === 0) {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}.csv"`);
        return res.send("No transactions found for this date");
      }
      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(","),
        ...rows.map(r => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","))
      ].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}.csv"`);
      return res.send(csv);
    }

    // Default: xlsx
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Transactions");
    if (rows.length > 0) {
      sheet.columns = Object.keys(rows[0]).map(key => ({ header: key, key, width: 18 }));
      rows.forEach(r => sheet.addRow(r));
      // Style header
      sheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      });
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// GET /api/transactions/export/ledger?companyId=xxx
exports.exportLedger = async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = {};
    if (companyId) filter.company = companyId;

    const [transactions, parties, items] = await Promise.all([
      Transaction.find(filter).sort({ date: -1 }),
      Party.find(companyId ? { $or: [{ company: companyId }, { companies: companyId }] } : {}),
      Item.find(filter)
    ]);

    const workbook = new ExcelJS.Workbook();
    const styleHeader = (sheet) => {
      sheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      });
    };

    // Transactions sheet
    const txnSheet = workbook.addWorksheet("Transactions");
    txnSheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Transaction ID", key: "transactionId", width: 20 },
      { header: "Type", key: "type", width: 10 },
      { header: "Category", key: "category", width: 15 },
      { header: "Amount", key: "amount", width: 14 },
      { header: "Payment Method", key: "paymentMethod", width: 16 },
      { header: "Ledger/Account", key: "ledgerAccount", width: 18 },
      { header: "Party", key: "partyName", width: 20 },
      { header: "Description", key: "description", width: 30 }
    ];
    transactions.forEach(t => txnSheet.addRow({
      date: new Date(t.date).toLocaleDateString(),
      transactionId: t.transactionId,
      type: t.type,
      category: t.category,
      amount: t.amount,
      paymentMethod: t.paymentMethod === "custom" ? t.customPaymentMethod : t.paymentMethod,
      ledgerAccount: t.ledgerAccount,
      partyName: t.partyName,
      description: t.description
    }));
    styleHeader(txnSheet);

    // Customers sheet
    const customers = parties.filter(p => p.type === "customer");
    const custSheet = workbook.addWorksheet("Customers");
    custSheet.columns = [
      { header: "Contact Name", key: "contactName", width: 20 },
      { header: "Firm Name", key: "firmName", width: 20 },
      { header: "Phone", key: "phone", width: 15 },
      { header: "Email", key: "email", width: 22 },
      { header: "City", key: "city", width: 15 },
      { header: "Opening Balance", key: "openingBalance", width: 16 },
      { header: "Status", key: "status", width: 10 }
    ];
    customers.forEach(c => custSheet.addRow(c.toObject()));
    styleHeader(custSheet);

    // Vendors sheet
    const vendors = parties.filter(p => p.type === "vendor");
    const vendorSheet = workbook.addWorksheet("Vendors");
    vendorSheet.columns = custSheet.columns.map(c => ({ ...c }));
    vendors.forEach(v => vendorSheet.addRow(v.toObject()));
    styleHeader(vendorSheet);

    // Employees sheet
    const employees = parties.filter(p => p.type === "employee" || p.type === "staff");
    const empSheet = workbook.addWorksheet("Employees");
    empSheet.columns = [
      { header: "Contact Name", key: "contactName", width: 20 },
      { header: "Phone", key: "phone", width: 15 },
      { header: "Email", key: "email", width: 22 },
      { header: "Designation", key: "designation", width: 18 },
      { header: "Department", key: "department", width: 18 },
      { header: "Status", key: "status", width: 10 }
    ];
    employees.forEach(e => empSheet.addRow(e.toObject()));
    styleHeader(empSheet);

    // Payment Methods summary
    const pmSheet = workbook.addWorksheet("Payment Methods");
    pmSheet.columns = [
      { header: "Payment Method", key: "method", width: 20 },
      { header: "Count", key: "count", width: 12 },
      { header: "Total Amount", key: "total", width: 16 }
    ];
    const pmGroup = {};
    transactions.forEach(t => {
      const m = t.paymentMethod === "custom" ? t.customPaymentMethod : t.paymentMethod;
      if (!pmGroup[m]) pmGroup[m] = { count: 0, total: 0 };
      pmGroup[m].count++;
      pmGroup[m].total += t.amount;
    });
    Object.entries(pmGroup).forEach(([method, data]) => {
      pmSheet.addRow({ method, count: data.count, total: data.total });
    });
    styleHeader(pmSheet);

    const dateStr = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="ledger_${dateStr}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// POST /api/transactions/import/preview — validate and preview
exports.previewImport = async (req, res) => {
  try {
    const { transactions, companyId } = req.body;
    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ msg: "Invalid data: expected transactions array" });
    }

    const existingIds = await Transaction.find({
      company: companyId,
      transactionId: { $in: transactions.map(t => t.transactionId).filter(Boolean) }
    }).select("transactionId");

    const existingSet = new Set(existingIds.map(t => t.transactionId));

    const preview = transactions.map(t => ({
      ...t,
      isDuplicate: existingSet.has(t.transactionId),
      isValid: !!(t.date && t.amount && t.type)
    }));

    res.json({
      total: preview.length,
      valid: preview.filter(p => p.isValid).length,
      duplicates: preview.filter(p => p.isDuplicate).length,
      preview
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// POST /api/transactions/import — actual import
exports.importTransactions = async (req, res) => {
  try {
    const { transactions, companyId, mode = "merge" } = req.body;
    if (!transactions || !Array.isArray(transactions) || !companyId) {
      return res.status(400).json({ msg: "Invalid data" });
    }

    let imported = 0;
    let skipped = 0;
    let overwritten = 0;

    for (const t of transactions) {
      if (!t.date || !t.amount || !t.type) {
        skipped++;
        continue;
      }

      const txnData = {
        transactionId: t.transactionId || generateTransactionId(t.date),
        date: new Date(t.date),
        type: t.type,
        category: t.category || "",
        subcategory: t.subcategory || "",
        amount: Number(t.amount),
        paymentMethod: t.paymentMethod || "cash",
        customPaymentMethod: t.customPaymentMethod || "",
        ledgerAccount: t.ledgerAccount || t["Ledger/Account"] || "",
        description: t.description || "",
        partyName: t.partyName || t["Party"] || "",
        dataYear: t.dataYear || new Date(t.date).getFullYear(),
        source: "import",
        company: companyId,
        createdBy: req.user.id
      };

      const existing = await Transaction.findOne({
        transactionId: txnData.transactionId,
        company: companyId
      });

      if (existing) {
        if (mode === "overwrite") {
          await Transaction.findByIdAndUpdate(existing._id, txnData);
          overwritten++;
        } else {
          skipped++;
        }
      } else {
        await Transaction.create(txnData);
        imported++;
      }
    }

    res.json({ msg: "Import complete", imported, skipped, overwritten });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// GET /api/transactions/analytics?companyId=xxx&startDate=&endDate=&compareYear=
exports.getAnalytics = async (req, res) => {
  try {
    const { companyId, startDate, endDate, compareYear } = req.query;
    const filter = {};
    if (companyId) filter.company = companyId;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate + "T23:59:59.999Z");
    }

    const transactions = await Transaction.find(filter).sort({ date: 1 });

    // Totals
    let totalIncome = 0, totalExpense = 0;
    const categoryBreakdown = {};
    const paymentBreakdown = {};
    const monthlyData = {};

    transactions.forEach(t => {
      if (t.type === "income") totalIncome += t.amount;
      if (t.type === "expense") totalExpense += t.amount;

      // Category
      const cat = t.category || "Uncategorized";
      if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { income: 0, expense: 0 };
      categoryBreakdown[cat][t.type === "income" ? "income" : "expense"] += t.amount;

      // Payment method
      const pm = t.paymentMethod === "custom" ? (t.customPaymentMethod || "Custom") : t.paymentMethod;
      if (!paymentBreakdown[pm]) paymentBreakdown[pm] = { count: 0, total: 0 };
      paymentBreakdown[pm].count++;
      paymentBreakdown[pm].total += t.amount;

      // Monthly
      const monthKey = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyData[monthKey]) monthlyData[monthKey] = { income: 0, expense: 0 };
      if (t.type === "income") monthlyData[monthKey].income += t.amount;
      if (t.type === "expense") monthlyData[monthKey].expense += t.amount;
    });

    // Previous year comparison
    let comparison = null;
    if (compareYear) {
      const prevFilter = { ...filter, dataYear: Number(compareYear) };
      delete prevFilter.date;
      const prevTransactions = await Transaction.find(prevFilter);
      let prevIncome = 0, prevExpense = 0;
      const prevMonthly = {};

      prevTransactions.forEach(t => {
        if (t.type === "income") prevIncome += t.amount;
        if (t.type === "expense") prevExpense += t.amount;
        const monthKey = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
        if (!prevMonthly[monthKey]) prevMonthly[monthKey] = { income: 0, expense: 0 };
        if (t.type === "income") prevMonthly[monthKey].income += t.amount;
        if (t.type === "expense") prevMonthly[monthKey].expense += t.amount;
      });

      comparison = {
        year: Number(compareYear),
        totalIncome: prevIncome,
        totalExpense: prevExpense,
        netProfit: prevIncome - prevExpense,
        transactionCount: prevTransactions.length,
        monthly: prevMonthly
      };
    }

    // Available years
    const years = await Transaction.distinct("dataYear", companyId ? { company: companyId } : {});

    res.json({
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      transactionCount: transactions.length,
      categoryBreakdown,
      paymentBreakdown,
      monthly: monthlyData,
      comparison,
      availableYears: years.sort()
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

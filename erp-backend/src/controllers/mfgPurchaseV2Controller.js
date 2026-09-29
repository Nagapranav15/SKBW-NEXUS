const mongoose = require("mongoose");
const PurchaseInvoiceV2 = require("../models/purchaseInvoiceV2Model");
const Party = require("../models/partyModel");
const SkuV2 = require("../models/skuV2Model");
const WarehouseLocationV2 = require("../models/warehouseLocationV2Model");
const InventoryLedger = require("../models/inventoryLedgerModelV2");
const Sequence = require("../models/sequenceModel");
const Transaction = require("../models/transactionModel");
const ActivityLog = require("../models/activityLogModel");

const toObjectId = (id) => {
  if (!id) return null;
  try {
    return new mongoose.Types.ObjectId(id);
  } catch (e) {
    return null;
  }
};

const generateTransactionId = (date) => {
  const d = new Date(date);
  const ymd = d.toISOString().split("T")[0].replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TXN-${ymd}-${rand}`;
};

exports.createPurchaseInvoice = async (req, res, next) => {
  try {
    const { invoiceNumber, vendorId, items, taxAmount = 0, freight = 0, craneCharges = 0, otherCharges = 0, dueDate, remarks, company } = req.body;

    if (!company) {
      return res.status(400).json({ msg: "company is required" });
    }
    if (!vendorId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ msg: "Vendor and items are required" });
    }

    const companyObjId = toObjectId(company);

    // 1. Validate Vendor (with flexible company matching)
    let vendor = await Party.findOne({ 
      _id: toObjectId(vendorId), 
      $or: [{ company: companyObjId }, { company: null }, { company: { $exists: false } }] 
    });
    if (!vendor) {
      vendor = await Party.findById(toObjectId(vendorId));
    }
    if (!vendor) {
      return res.status(400).json({ msg: "Vendor not found in database" });
    }

    // Resolve default fallback location for this company
    let defaultLocation = await WarehouseLocationV2.findOne({ company: companyObjId, level: "Storage Location" })
      || await WarehouseLocationV2.findOne({ company: companyObjId, level: "Zone" })
      || await WarehouseLocationV2.findOne({ company: companyObjId })
      || await WarehouseLocationV2.findOne();

    if (!defaultLocation) {
      defaultLocation = await WarehouseLocationV2.create({
        name: "Main Storage",
        code: "MAIN-01",
        level: "Storage Location",
        company: companyObjId,
        createdBy: toObjectId(req.user?.id)
      });
    }

    const isDraftBatch = req.body.status === "Draft";

    // 2. Validate Items, SKUs, and Location Hierarchies
    const validatedItems = [];
    let subTotal = 0;

    for (const item of items) {
      const { skuId, quantity, purchasePrice, lotNumber, locationId, reels, splits } = item;
      
      if (!isDraftBatch) {
        if (!skuId || quantity === undefined || quantity === null || purchasePrice === undefined || purchasePrice === null || !lotNumber) {
          return res.status(400).json({ msg: "Missing fields in purchase items (SKU, Quantity, Price, or Lot Number)" });
        }
      } else {
        if (!skuId) {
          return res.status(400).json({ msg: "SKU is required for each lot" });
        }
      }

      const qty = Number(quantity) || 0;
      const price = Number(purchasePrice) || 0;
      if (!isDraftBatch && (qty <= 0 || price <= 0)) {
        return res.status(400).json({ msg: "Quantity and price must be greater than zero for received batches" });
      }

      // Check SKU
      let sku = await SkuV2.findOne({ _id: toObjectId(skuId), company: companyObjId });
      if (!sku) {
        sku = await SkuV2.findById(toObjectId(skuId));
      }
      if (!sku || sku.isDeleted) {
        return res.status(400).json({ msg: `SKU '${skuId}' not found or has been deleted` });
      }
      if (sku.status === 'Inactive') {
        return res.status(400).json({ msg: `Item '${sku.skuCode} - ${sku.name}' is marked Inactive and cannot be billed or purchased` });
      }

      const primaryLocId = locationId || (splits && splits[0]?.locationId) || (reels && reels[0]?.locationId);
      let location = primaryLocId ? await WarehouseLocationV2.findOne({ _id: toObjectId(primaryLocId), company: companyObjId }) : null;
      if (!location && primaryLocId) {
        location = await WarehouseLocationV2.findById(toObjectId(primaryLocId));
      }
      if (!location) {
        location = defaultLocation;
      }

      const itemTotal = qty * price;
      subTotal += itemTotal;

      const cleanSplits = (Array.isArray(splits) ? splits : [])
        .filter(s => s && Number(s.quantity) > 0)
        .map(s => ({
          locationId: toObjectId(s.locationId) || location._id,
          quantity: Number(s.quantity)
        }));

      const cleanReels = (Array.isArray(reels) ? reels : [])
        .filter(r => r && (Number(r.weight) > 0 || r.reelNumber || r.reelNo))
        .map((r, rIdx) => ({
          reelNumber: r.reelNumber || r.reelNo || `${lotNumber}-R${String(rIdx + 1).padStart(2, '0')}`,
          gsm: Number(r.gsm) || Number(sku.gsm) || 0,
          width: Number(r.width) || Number(sku.width) || 0,
          weight: Number(r.weight) || 0,
          locationId: toObjectId(r.locationId) || location._id
        }));

      validatedItems.push({
        skuId: sku._id,
        quantity: qty,
        unit: sku.unit || "kg",
        purchasePrice: price,
        totalPrice: itemTotal,
        lotNumber,
        locationId: location._id,
        splits: cleanSplits,
        reels: cleanReels,
        reamWeight: item.reamWeight ? Number(item.reamWeight) : undefined,
        ratePerKg: item.ratePerKg ? Number(item.ratePerKg) : undefined
      });
    }

    const grandTotal = subTotal + Number(taxAmount) + Number(freight) + Number(craneCharges) + Number(otherCharges);

    // 3. Generate sequential invoice number if not manually specified or resolve duplicate
    let finalInvoiceNo = invoiceNumber;
    const generateNextPB = async () => {
      const regex = /^PB-(?:[A-Z]{3}-)?(\d+)$/i;
      const existingInvoices = await PurchaseInvoiceV2.find({ company: companyObjId, invoiceNumber: regex }).select('invoiceNumber').lean();
      let maxNum = 0;
      existingInvoices.forEach(inv => {
        const match = inv.invoiceNumber ? inv.invoiceNumber.match(regex) : null;
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      const nextSeq = maxNum + 1;
      const padLen = Math.max(3, String(nextSeq).length);
      return `PB-${String(nextSeq).padStart(padLen, '0')}`;
    };

    if (!finalInvoiceNo) {
      finalInvoiceNo = await generateNextPB();
    } else {
      const exists = await PurchaseInvoiceV2.findOne({ invoiceNumber: finalInvoiceNo, company: companyObjId });
      if (exists) {
        finalInvoiceNo = await generateNextPB();
      }
    }

    // 4. Save Purchase Invoice
    const invoice = new PurchaseInvoiceV2({
      invoiceNumber: finalInvoiceNo,
      vendorId: vendor._id,
      items: validatedItems,
      subTotal,
      taxAmount: Number(taxAmount),
      freight: Number(freight),
      craneCharges: Number(craneCharges),
      otherCharges: Number(otherCharges),
      grandTotal,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      remarks: remarks || "",
      createdBy: toObjectId(req.user?.id) || companyObjId,
      company: companyObjId,
      status: isDraftBatch ? "Draft" : "Posted"
    });

    try {
      await invoice.save();
    } catch (saveErr) {
      if (saveErr && (saveErr.code === 11000 || saveErr.name === "MongoServerError") && String(saveErr.message).includes("invoiceNumber_1")) {
        try {
          await PurchaseInvoiceV2.collection.dropIndex("invoiceNumber_1");
          await invoice.save();
        } catch (retryErr) {
          throw retryErr;
        }
      } else {
        throw saveErr;
      }
    }

    if (isDraftBatch) {
      ActivityLog.create({
        action: "CREATE_DRAFT",
        entityType: "purchase_invoice",
        entityName: finalInvoiceNo,
        details: `Draft Purchase Batch '${finalInvoiceNo}' saved for vendor '${vendor.firmName || vendor.ownerName}' (Amount: ₹${subTotal}).`,
        performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
        company: companyObjId
      }).catch(e => console.error("ActivityLog error:", e));

      return res.status(201).json(invoice);
    }

    // 5. Inward stock using fast batch operations & hierarchy caching
    const hierarchyCache = new Map();
    const getHierarchy = async (locId) => {
      const key = String(locId);
      if (hierarchyCache.has(key)) return hierarchyCache.get(key);

      let loc = await WarehouseLocationV2.findOne({ _id: toObjectId(locId), company: companyObjId });
      if (!loc) loc = await WarehouseLocationV2.findById(toObjectId(locId));
      if (!loc) {
        const fallback = { warehouseId: locId, floorId: locId, zoneId: locId, locationId: locId };
        hierarchyCache.set(key, fallback);
        return fallback;
      }

      const chain = [loc];
      let curr = loc;
      while (curr && curr.parentId) {
        let parent = await WarehouseLocationV2.findOne({ _id: curr.parentId, company: companyObjId });
        if (!parent) parent = await WarehouseLocationV2.findById(curr.parentId);
        if (!parent) break;
        chain.unshift(parent);
        curr = parent;
      }

      const factoryNode = chain.find(n => n.level === "Factory");
      const floorNode = chain.find(n => n.level === "Floor");
      const zoneNode = chain.find(n => n.level === "Zone");
      const storageNode = chain.find(n => n.level === "Storage Location");

      const warehouseId = factoryNode ? factoryNode._id : (chain[0]?._id || loc._id);
      const floorId = floorNode ? floorNode._id : (chain[1]?._id || warehouseId);
      const zoneId = zoneNode ? zoneNode._id : (chain[2]?._id || floorId);
      const locationId = storageNode ? storageNode._id : loc._id;

      const resH = { warehouseId, floorId, zoneId, locationId };
      hierarchyCache.set(key, resH);
      return resH;
    };

    const ledgerDocs = [];
    const skuUpdates = [];

    for (const valItem of validatedItems) {
      if (valItem.reels && valItem.reels.length > 0) {
        const reelsByLoc = {};
        valItem.reels.forEach(r => {
          const lId = String(r.locationId || valItem.locationId);
          if (!reelsByLoc[lId]) reelsByLoc[lId] = [];
          reelsByLoc[lId].push(r);
        });

        const locIds = Object.keys(reelsByLoc);
        const totalReelWeight = valItem.reels.reduce((s, r) => s + (Number(r.weight) || 0), 0);

        for (const locIdStr of locIds) {
          const reelsGroup = reelsByLoc[locIdStr];
          let groupWeight = reelsGroup.reduce((s, r) => s + (Number(r.weight) || 0), 0);

          // If reels are all in one location and their weight sum doesn't match the declared
          // lot quantity, use the declared quantity to avoid silent stock loss.
          if (locIds.length === 1) {
            // Single-location reel batch: trust the declared lot quantity over reel weights.
            if (groupWeight <= 0 || Math.abs(groupWeight - valItem.quantity) > 0.001) {
              groupWeight = valItem.quantity;
            }
          } else {
            // Multi-location: each group contributes proportionally; fall back to lot qty if zero
            if (groupWeight <= 0) {
              const ratio = totalReelWeight > 0 ? (reelsGroup.length / valItem.reels.length) : (1 / locIds.length);
              groupWeight = valItem.quantity * ratio;
            }
          }

          const h = await getHierarchy(locIdStr);
          const transactionNumber = await Sequence.getNextSequence("IL");

          ledgerDocs.push({
            transactionNumber,
            transactionType: "Purchase",
            skuId: valItem.skuId,
            quantity: groupWeight,
            unit: valItem.unit,
            direction: "IN",
            referenceType: "PurchaseInvoice",
            referenceId: finalInvoiceNo,
            batchNumber: finalInvoiceNo,
            warehouseId: h.warehouseId,
            floorId: h.floorId,
            zoneId: h.zoneId,
            locationId: h.locationId,
            remarks: `Lot: ${valItem.lotNumber}. Inwarded via invoice ${finalInvoiceNo}`,
            reels: reelsGroup,
            createdBy: toObjectId(req.user?.id) || companyObjId,
            company: companyObjId,
            status: "Posted"
          });
        }
      } else if (valItem.splits && valItem.splits.length > 0) {
        for (const split of valItem.splits) {
          const splitQty = Number(split.quantity) || 0;
          if (splitQty <= 0) continue;
          const h = await getHierarchy(split.locationId);
          const transactionNumber = await Sequence.getNextSequence("IL");

          ledgerDocs.push({
            transactionNumber,
            transactionType: "Purchase",
            skuId: valItem.skuId,
            quantity: splitQty,
            unit: valItem.unit,
            direction: "IN",
            referenceType: "PurchaseInvoice",
            referenceId: finalInvoiceNo,
            batchNumber: finalInvoiceNo,
            warehouseId: h.warehouseId,
            floorId: h.floorId,
            zoneId: h.zoneId,
            locationId: h.locationId,
            remarks: `Lot: ${valItem.lotNumber}. Inwarded via invoice ${finalInvoiceNo}`,
            reels: [],
            createdBy: toObjectId(req.user?.id) || companyObjId,
            company: companyObjId,
            status: "Posted"
          });
        }
      } else {
        const h = await getHierarchy(valItem.locationId);
        const transactionNumber = await Sequence.getNextSequence("IL");

        ledgerDocs.push({
          transactionNumber,
          transactionType: "Purchase",
          skuId: valItem.skuId,
          quantity: valItem.quantity,
          unit: valItem.unit,
          direction: "IN",
          referenceType: "PurchaseInvoice",
          referenceId: finalInvoiceNo,
          batchNumber: finalInvoiceNo,
          warehouseId: h.warehouseId,
          floorId: h.floorId,
          zoneId: h.zoneId,
          locationId: h.locationId,
          remarks: `Lot: ${valItem.lotNumber}. Inwarded via invoice ${finalInvoiceNo}`,
          reels: [],
          createdBy: toObjectId(req.user?.id) || companyObjId,
          company: companyObjId,
          status: "Posted"
        });
      }

      const updateFields = {};
      if (valItem.purchasePrice > 0) {
        updateFields.purchasePrice = valItem.purchasePrice;
        updateFields.rate = valItem.purchasePrice;
      }
      if (valItem.ratePerKg > 0) {
        updateFields.ratePerKg = valItem.ratePerKg;
      }
      if (Object.keys(updateFields).length > 0) {
        skuUpdates.push(SkuV2.findByIdAndUpdate(valItem.skuId, updateFields));
      }
    }

    if (ledgerDocs.length > 0) {
      await InventoryLedger.insertMany(ledgerDocs, { ordered: false });
    }
    if (skuUpdates.length > 0) {
      await Promise.all(skuUpdates);
    }

    // 6. Automatically increase Vendor's outstanding liability (Material Cost Subtotal)
    const supplierPayable = subTotal;
    const prevOutstanding = vendor.outstanding || 0;
    const prevOutstandingBal = vendor.outstandingBalance || 0;
    vendor.outstanding = prevOutstanding + supplierPayable;
    vendor.outstandingBalance = prevOutstandingBal + supplierPayable;
    await vendor.save();

    // 7. Write to financial Transaction list (liability record)
    const financialTx = new Transaction({
      transactionId: generateTransactionId(new Date()),
      date: new Date(),
      type: "credit",
      category: "Purchase Invoice V2",
      subcategory: "Material Inward",
      amount: supplierPayable,
      partyId: vendor._id,
      partyName: vendor.firmName || vendor.ownerName,
      description: `Inwarded materials under invoice ${finalInvoiceNo}`,
      company: companyObjId,
      createdBy: toObjectId(req.user.id),
      source: "system",
      source_type: "PURCHASE"
    });
    await financialTx.save();

    ActivityLog.create({
      action: "CREATE",
      entityType: "purchase_invoice",
      entityName: finalInvoiceNo,
      details: `Purchase Batch '${finalInvoiceNo}' created for vendor '${vendor.firmName || vendor.ownerName}' (Amount: ₹${subTotal}).`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: companyObjId
    }).catch(e => console.error("ActivityLog error:", e));

    const populatedInvoice = await PurchaseInvoiceV2.findById(invoice._id)
      .populate("vendorId", "firmName ownerName phone contactName email outstanding")
      .populate("items.skuId", "skuCode name category unit paperType pages reamWeight gsm width length brand ruleType purchasePrice ratePerKg")
      .populate("items.locationId", "name level code")
      .populate("items.splits.locationId", "name level code")
      .populate("items.reels.locationId", "name level code")
      .populate("createdBy", "fullName");

    res.status(201).json(populatedInvoice || invoice);
  } catch (err) {
    next(err);
  }
};

const migratePurchaseBatchNumbers = async (companyObjId) => {
  try {
    const query = companyObjId ? { company: companyObjId } : {};
    const unmigrated = await PurchaseInvoiceV2.find({
      ...query,
      invoiceNumber: { $not: /^PB-\d{3,}$/ }
    });
    if (!unmigrated || unmigrated.length === 0) return;

    // Fetch all invoices for company ordered by createdAt
    const allInvoices = await PurchaseInvoiceV2.find(query).sort({ createdAt: 1, _id: 1 });
    
    // Existing valid PB- numbers
    const usedNumbers = new Set();
    allInvoices.forEach(inv => {
      if (/^PB-\d{3,}$/.test(inv.invoiceNumber)) {
        usedNumbers.add(inv.invoiceNumber);
      }
    });

    let currentSeq = 1;
    for (const inv of allInvoices) {
      const oldNo = inv.invoiceNumber;
      if (!/^PB-\d{3,}$/.test(oldNo)) {
        while (usedNumbers.has(`PB-${String(currentSeq).padStart(3, '0')}`)) {
          currentSeq++;
        }
        const padLen = Math.max(3, String(currentSeq).length);
        const newNo = `PB-${String(currentSeq).padStart(padLen, '0')}`;
        usedNumbers.add(newNo);

        inv.invoiceNumber = newNo;
        if (Array.isArray(inv.items)) {
          inv.items.forEach(item => {
            if (!item.lotNumber || !/^PB-\d{3,}$/.test(item.lotNumber) || item.lotNumber === oldNo) {
              item.lotNumber = newNo;
            }
          });
        }

        try {
          await inv.save();

          await InventoryLedger.updateMany(
            { company: inv.company, referenceId: oldNo },
            { $set: { referenceId: newNo, batchNumber: newNo } }
          );
          await InventoryLedger.updateMany(
            { company: inv.company, batchNumber: oldNo },
            { $set: { batchNumber: newNo } }
          );
          await Transaction.updateMany(
            { company: inv.company, source_type: "PURCHASE", reference_id: inv._id },
            { $set: { description: `Inwarded materials under invoice ${newNo}` } }
          );
        } catch (saveErr) {
          console.error(`Skipping invoice migration for ID ${inv._id}:`, saveErr.message);
        }
      }
    }
  } catch (err) {
    console.error("Error migrating batch numbers:", err);
  }
};

const migratedCompanies = new Set();

exports.getPurchaseInvoices = async (req, res, next) => {
  try {
    const { companyId, vendorId, paymentStatus, status, search, page = 1, limit = 20, light } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const companyObjId = toObjectId(companyId);
    if (!migratedCompanies.has(String(companyObjId))) {
      await migratePurchaseBatchNumbers(companyObjId);
      migratedCompanies.add(String(companyObjId));
    }

    const query = { company: companyObjId };
    if (vendorId) query.vendorId = toObjectId(vendorId);
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (status) query.status = status;

    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { remarks: { $regex: search, $options: "i" } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Fast light query for inventory costing and overview without heavy nested populates
    if (light === "true" || light === true) {
      const invoices = await PurchaseInvoiceV2.find(query)
        .select("invoiceNumber invoiceDate partyName status items.skuId items.quantity items.purchasePrice items.price items.ratePerKg items.locationId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();
      return res.json({ invoices, total: invoices.length, page: Number(page), limit: Number(limit) });
    }

    const [invoices, total] = await Promise.all([
      PurchaseInvoiceV2.find(query)
        .populate("vendorId", "firmName ownerName phone contactName email outstanding")
        .populate("items.skuId", "skuCode name category unit paperType pages reamWeight gsm width length brand ruleType purchasePrice ratePerKg")
        .populate("items.locationId", "name level code")
        .populate("items.splits.locationId", "name level code")
        .populate("items.reels.locationId", "name level code")
        .populate("createdBy", "fullName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      PurchaseInvoiceV2.countDocuments(query)
    ]);

    res.json({
      invoices,
      total,
      page: Number(page),
      limit: Number(limit)
    });
  } catch (err) {
    next(err);
  }
};

exports.recordPurchasePayment = async (req, res, next) => {
  try {
    const { vendorId, amount, paymentMethod, referenceId, invoiceId, remarks, company } = req.body;

    if (!company) {
      return res.status(400).json({ msg: "company is required" });
    }
    if (!vendorId || !amount) {
      return res.status(400).json({ msg: "Vendor and amount are required" });
    }

    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ msg: "Amount must be a positive number" });
    }

    const companyObjId = toObjectId(company);

    // 1. Find Vendor
    const vendor = await Party.findOne({ _id: toObjectId(vendorId), type: "vendor", company: companyObjId });
    if (!vendor) {
      return res.status(400).json({ msg: "Vendor not found or mismatch" });
    }

    // 2. Resolve Payment allocation
    let updatedInvoice = null;
    if (invoiceId) {
      const invoice = await PurchaseInvoiceV2.findOne({ _id: toObjectId(invoiceId), company: companyObjId });
      if (!invoice) {
        return res.status(400).json({ msg: "Invoice not found or mismatch" });
      }

      invoice.paidAmount = (invoice.paidAmount || 0) + payAmount;
      if (invoice.paidAmount >= invoice.grandTotal) {
        invoice.paymentStatus = "Paid";
      } else if (invoice.paidAmount > 0) {
        invoice.paymentStatus = "Partially Paid";
      } else {
        invoice.paymentStatus = "Unpaid";
      }

      await invoice.save();
      updatedInvoice = invoice;
    }

    // 3. Automatically decrease Vendor's outstanding liability
    const prevOutstanding = vendor.outstanding || 0;
    const prevOutstandingBal = vendor.outstandingBalance || 0;
    vendor.outstanding = Math.max(prevOutstanding - payAmount, 0);
    vendor.outstandingBalance = Math.max(prevOutstandingBal - payAmount, 0);
    await vendor.save();

    // 4. Record financial Transaction log (debit payment out)
    const financialTx = new Transaction({
      transactionId: generateTransactionId(new Date()),
      date: new Date(),
      type: "debit", // Cash outflow reducing vendor liability
      category: "Purchase Payment V2",
      subcategory: paymentMethod || "bank_transfer",
      amount: payAmount,
      partyId: vendor._id,
      partyName: vendor.firmName || vendor.ownerName,
      description: remarks || `Paid vendor JK Paper. Ref: ${referenceId || 'N/A'}. Allocated to: ${invoiceId ? 'Specific invoice' : 'On account'}`,
      paymentMethod: paymentMethod || "bank_transfer",
      referenceId: referenceId || "",
      company: companyObjId,
      createdBy: toObjectId(req.user.id),
      source: "system",
      source_type: "PURCHASE"
    });
    await financialTx.save();

    res.json({
      msg: "Purchase payment logged successfully",
      vendorOutstanding: vendor.outstanding,
      invoice: updatedInvoice
    });
  } catch (err) {
    next(err);
  }
};

exports.editPurchaseInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { items, taxAmount = 0, freight = 0, craneCharges = 0, otherCharges = 0, dueDate, remarks, company } = req.body;

    const invoice = await PurchaseInvoiceV2.findById(id);
    if (!invoice) {
      return res.status(404).json({ msg: "Purchase Invoice not found" });
    }

    const companyObjId = invoice.company;

    let vendor = await Party.findById(invoice.vendorId);
    if (!vendor) {
      vendor = await Party.findOne({ _id: toObjectId(invoice.vendorId) });
    }
    if (!vendor) {
      return res.status(400).json({ msg: "Vendor associated with invoice not found" });
    }

    // Resolve default fallback location for this company
    let defaultLocation = await WarehouseLocationV2.findOne({ company: companyObjId, level: "Storage Location" })
      || await WarehouseLocationV2.findOne({ company: companyObjId, level: "Zone" })
      || await WarehouseLocationV2.findOne({ company: companyObjId })
      || await WarehouseLocationV2.findOne();

    if (!defaultLocation) {
      defaultLocation = await WarehouseLocationV2.create({
        name: "Main Storage",
        code: "MAIN-01",
        level: "Storage Location",
        company: companyObjId,
        createdBy: toObjectId(req.user?.id)
      });
    }

    const isDraftBatch = req.body.status === "Draft";

    // Validate SKU/Locations
    const validatedItems = [];
    let subTotal = 0;

    for (const item of items) {
      const { skuId, quantity, purchasePrice, lotNumber, locationId, reels, splits } = item;
      
      if (!isDraftBatch) {
        if (!skuId || quantity === undefined || quantity === null || purchasePrice === undefined || purchasePrice === null || !lotNumber) {
          return res.status(400).json({ msg: "Missing fields in purchase items (SKU, Quantity, Price, or Lot Number)" });
        }
      } else {
        if (!skuId) {
          return res.status(400).json({ msg: "SKU is required for each lot" });
        }
      }

      const qty = Number(quantity) || 0;
      const price = Number(purchasePrice) || 0;
      if (!isDraftBatch && (qty <= 0 || price <= 0)) {
        return res.status(400).json({ msg: "Quantity and price must be greater than zero for received batches" });
      }

      let sku = await SkuV2.findById(skuId);
      if (!sku) {
        sku = await SkuV2.findOne({ _id: toObjectId(skuId) });
      }
      if (!sku) {
        return res.status(400).json({ msg: `SKU '${skuId}' not found` });
      }

      const primaryLocId = locationId || (splits && splits[0]?.locationId) || (reels && reels[0]?.locationId);
      let location = primaryLocId ? await WarehouseLocationV2.findById(primaryLocId) : null;
      if (!location && primaryLocId) {
        location = await WarehouseLocationV2.findOne({ _id: toObjectId(primaryLocId) });
      }
      if (!location) {
        location = defaultLocation;
      }

      const itemTotal = qty * price;
      subTotal += itemTotal;

      const cleanSplits = (Array.isArray(splits) ? splits : [])
        .filter(s => s && Number(s.quantity) > 0)
        .map(s => ({
          locationId: toObjectId(s.locationId) || location._id,
          quantity: Number(s.quantity)
        }));

      const cleanReels = (Array.isArray(reels) ? reels : [])
        .filter(r => r && (Number(r.weight) > 0 || r.reelNumber || r.reelNo))
        .map((r, rIdx) => ({
          reelNumber: r.reelNumber || r.reelNo || `${lotNumber}-R${String(rIdx + 1).padStart(2, '0')}`,
          gsm: Number(r.gsm) || Number(sku.gsm) || 0,
          width: Number(r.width) || Number(sku.width) || 0,
          weight: Number(r.weight) || 0,
          locationId: toObjectId(r.locationId) || location._id
        }));

      validatedItems.push({
        skuId: sku._id,
        quantity: qty,
        unit: sku.unit || "kg",
        purchasePrice: price,
        totalPrice: itemTotal,
        lotNumber,
        locationId: location._id,
        splits: cleanSplits,
        reels: cleanReels,
        reamWeight: item.reamWeight ? Number(item.reamWeight) : undefined,
        ratePerKg: item.ratePerKg ? Number(item.ratePerKg) : undefined
      });
    }

    const wasDraft = invoice.status === "Draft";

    const newGrandTotal = subTotal + Number(taxAmount) + Number(freight) + Number(craneCharges) + Number(otherCharges);
    
    // Check if new grand total is less than already paid amount
    if (newGrandTotal < (invoice.paidAmount || 0)) {
      return res.status(400).json({ msg: `Cannot edit invoice to amount ₹${newGrandTotal} which is less than the already paid amount of ₹${invoice.paidAmount}` });
    }

    // Update invoice properties
    invoice.items = validatedItems;
    invoice.subTotal = subTotal;
    invoice.taxAmount = Number(taxAmount);
    invoice.freight = Number(freight);
    invoice.craneCharges = Number(craneCharges);
    invoice.otherCharges = Number(otherCharges);
    invoice.grandTotal = newGrandTotal;
    if (dueDate) invoice.dueDate = new Date(dueDate);
    if (remarks !== undefined) invoice.remarks = remarks;
    invoice.status = isDraftBatch ? "Draft" : "Posted";

    await invoice.save();

    if (isDraftBatch) {
      await InventoryLedger.deleteMany({ referenceType: "PurchaseInvoice", referenceId: invoice.invoiceNumber });
      await InventoryLedger.deleteMany({ batchNumber: invoice.invoiceNumber });
      return res.json(invoice);
    }

    const newSupplierPayable = subTotal;
    const oldSupplierPayable = wasDraft ? 0 : (invoice.subTotal || 0);
    const diff = newSupplierPayable - oldSupplierPayable;

    // Update Vendor Outstanding
    if (diff !== 0) {
      vendor.outstanding = Math.max((vendor.outstanding || 0) + diff, 0);
      vendor.outstandingBalance = Math.max((vendor.outstandingBalance || 0) + diff, 0);
      await vendor.save();
    }

    // Update financial Transaction
    await Transaction.findOneAndUpdate(
      { 
        company: companyObjId, 
        partyId: vendor._id,
        source_type: "PURCHASE", 
        description: { $regex: invoice.invoiceNumber } 
      },
      { $set: { amount: newSupplierPayable } }
    );

    // Delete old stock ledger entries and inward new ones
    await InventoryLedger.deleteMany({ referenceType: "PurchaseInvoice", referenceId: invoice.invoiceNumber });
    await InventoryLedger.deleteMany({ batchNumber: invoice.invoiceNumber });

    // Helper function to resolve hierarchy for any locationId with caching
    const hierarchyCache = new Map();
    const getHierarchy = async (locId) => {
      const key = String(locId);
      if (hierarchyCache.has(key)) return hierarchyCache.get(key);

      const loc = await WarehouseLocationV2.findById(locId);
      if (!loc) {
        const fallback = { warehouseId: locId, floorId: locId, zoneId: locId, locationId: locId };
        hierarchyCache.set(key, fallback);
        return fallback;
      }
      let zoneId = loc._id, floorId = loc._id, warehouseId = loc._id;
      const p1 = loc.parentId ? await WarehouseLocationV2.findById(loc.parentId) : null;
      if (p1) {
        zoneId = p1._id;
        const p2 = p1.parentId ? await WarehouseLocationV2.findById(p1.parentId) : null;
        if (p2) {
          floorId = p2._id;
          const p3 = p2.parentId ? await WarehouseLocationV2.findById(p2.parentId) : null;
          warehouseId = p3 ? p3._id : p2._id;
        } else {
          floorId = p1._id; warehouseId = p1._id;
        }
      }
      const resH = { warehouseId, floorId, zoneId, locationId: loc._id };
      hierarchyCache.set(key, resH);
      return resH;
    };

    const ledgerDocs = [];
    const skuUpdates = [];

    for (const valItem of validatedItems) {
      if (valItem.reels && valItem.reels.length > 0) {
        const reelsByLoc = {};
        valItem.reels.forEach(r => {
          const lId = String(r.locationId || valItem.locationId);
          if (!reelsByLoc[lId]) reelsByLoc[lId] = [];
          reelsByLoc[lId].push(r);
        });

        const locIds = Object.keys(reelsByLoc);
        const totalReelWeight = valItem.reels.reduce((s, r) => s + (Number(r.weight) || 0), 0);

        for (const locIdStr of locIds) {
          const reelsGroup = reelsByLoc[locIdStr];
          let groupWeight = reelsGroup.reduce((s, r) => s + (Number(r.weight) || 0), 0);

          // Single-location: trust the declared lot quantity over reel weights
          if (locIds.length === 1) {
            if (groupWeight <= 0 || Math.abs(groupWeight - valItem.quantity) > 0.001) {
              groupWeight = valItem.quantity;
            }
          } else {
            // Multi-location: each group contributes proportionally; fall back to lot qty if zero
            if (groupWeight <= 0) {
              const ratio = totalReelWeight > 0 ? (reelsGroup.length / valItem.reels.length) : (1 / locIds.length);
              groupWeight = valItem.quantity * ratio;
            }
          }

          const h = await getHierarchy(locIdStr);
          const transactionNumber = await Sequence.getNextSequence("IL");

          ledgerDocs.push({
            transactionNumber,
            transactionType: "Purchase",
            skuId: valItem.skuId,
            quantity: groupWeight,
            unit: valItem.unit,
            direction: "IN",
            referenceType: "PurchaseInvoice",
            referenceId: invoice.invoiceNumber,
            batchNumber: invoice.invoiceNumber,
            warehouseId: h.warehouseId,
            floorId: h.floorId,
            zoneId: h.zoneId,
            locationId: h.locationId,
            remarks: `Lot: ${valItem.lotNumber}. Inwarded via invoice ${invoice.invoiceNumber}`,
            reels: reelsGroup,
            createdBy: toObjectId(req.user?.id) || companyObjId,
            company: companyObjId,
            status: "Posted"
          });
        }
      } else if (valItem.splits && valItem.splits.length > 0) {
        for (const split of valItem.splits) {
          const splitQty = Number(split.quantity) || 0;
          if (splitQty <= 0) continue;
          const h = await getHierarchy(split.locationId);
          const transactionNumber = await Sequence.getNextSequence("IL");

          ledgerDocs.push({
            transactionNumber,
            transactionType: "Purchase",
            skuId: valItem.skuId,
            quantity: splitQty,
            unit: valItem.unit,
            direction: "IN",
            referenceType: "PurchaseInvoice",
            referenceId: invoice.invoiceNumber,
            batchNumber: invoice.invoiceNumber,
            warehouseId: h.warehouseId,
            floorId: h.floorId,
            zoneId: h.zoneId,
            locationId: h.locationId,
            remarks: `Lot: ${valItem.lotNumber}. Inwarded via invoice ${invoice.invoiceNumber}`,
            reels: [],
            createdBy: toObjectId(req.user?.id) || companyObjId,
            company: companyObjId,
            status: "Posted"
          });
        }
      } else {
        const h = await getHierarchy(valItem.locationId);
        const transactionNumber = await Sequence.getNextSequence("IL");

        ledgerDocs.push({
          transactionNumber,
          transactionType: "Purchase",
          skuId: valItem.skuId,
          quantity: valItem.quantity,
          unit: valItem.unit,
          direction: "IN",
          referenceType: "PurchaseInvoice",
          referenceId: invoice.invoiceNumber,
          batchNumber: invoice.invoiceNumber,
          warehouseId: h.warehouseId,
          floorId: h.floorId,
          zoneId: h.zoneId,
          locationId: h.locationId,
          remarks: `Lot: ${valItem.lotNumber}. Inwarded via invoice ${invoice.invoiceNumber}`,
          reels: [],
          createdBy: toObjectId(req.user?.id) || companyObjId,
          company: companyObjId,
          status: "Posted"
        });
      }

      const updateFields = {};
      if (valItem.purchasePrice > 0) {
        updateFields.purchasePrice = valItem.purchasePrice;
        updateFields.rate = valItem.purchasePrice;
      }
      if (valItem.ratePerKg > 0) {
        updateFields.ratePerKg = valItem.ratePerKg;
      }
      if (Object.keys(updateFields).length > 0) {
        skuUpdates.push(SkuV2.findByIdAndUpdate(valItem.skuId, updateFields));
      }
    }

    if (ledgerDocs.length > 0) {
      await InventoryLedger.insertMany(ledgerDocs, { ordered: false });
    }
    if (skuUpdates.length > 0) {
      await Promise.all(skuUpdates);
    }

    // Update Invoice details
    invoice.items = validatedItems;
    invoice.subTotal = subTotal;
    invoice.taxAmount = Number(taxAmount);
    invoice.freight = Number(freight);
    invoice.craneCharges = Number(craneCharges);
    invoice.grandTotal = newGrandTotal;
    if (dueDate) invoice.dueDate = new Date(dueDate);
    if (remarks !== undefined) invoice.remarks = remarks;

    if (invoice.paidAmount >= newGrandTotal) {
      invoice.paymentStatus = "Paid";
    } else if (invoice.paidAmount > 0) {
      invoice.paymentStatus = "Partially Paid";
    } else {
      invoice.paymentStatus = "Unpaid";
    }

    await invoice.save();

    ActivityLog.create({
      action: "UPDATE",
      entityType: "PurchaseInvoiceV2",
      entityName: invoice.invoiceNumber,
      details: `Updated Purchase Batch '${invoice.invoiceNumber}' (${validatedItems.length} material lot(s), Total: ₹${newGrandTotal.toLocaleString('en-IN')}).`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: companyObjId
    }).catch(e => console.error("ActivityLog error:", e));

    const populatedInvoice = await PurchaseInvoiceV2.findById(invoice._id)
      .populate("vendorId", "firmName ownerName phone contactName email outstanding")
      .populate("items.skuId", "skuCode name category unit paperType pages reamWeight gsm width length brand ruleType purchasePrice ratePerKg")
      .populate("items.locationId", "name level code")
      .populate("items.splits.locationId", "name level code")
      .populate("items.reels.locationId", "name level code")
      .populate("createdBy", "fullName");

    res.json(populatedInvoice || invoice);
  } catch (err) {
    next(err);
  }
};

exports.deletePurchaseInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { company } = req.query;

    if (!company) {
      return res.status(400).json({ msg: "company query parameter is required" });
    }
    const companyObjId = toObjectId(company);

    let query = mongoose.Types.ObjectId.isValid(id) ? { _id: toObjectId(id) } : { invoiceNumber: id };
    if (companyObjId) query.company = companyObjId;

    let invoice = await PurchaseInvoiceV2.findOne(query);
    if (!invoice && !mongoose.Types.ObjectId.isValid(id)) {
      invoice = await PurchaseInvoiceV2.findOne({ invoiceNumber: id });
    }

    if (!invoice) {
      return res.status(404).json({ msg: "Purchase Invoice not found" });
    }

    // Do not allow deleting paid invoices
    if (invoice.paidAmount > 0) {
      return res.status(400).json({ msg: "Cannot delete an invoice that has payments recorded. Please void the payments first." });
    }

    const vendor = await Party.findOne({ _id: invoice.vendorId, company: invoice.company });
    if (vendor) {
      const supplierPayable = invoice.subTotal || 0;
      vendor.outstanding = Math.max((vendor.outstanding || 0) - supplierPayable, 0);
      vendor.outstandingBalance = Math.max((vendor.outstandingBalance || 0) - supplierPayable, 0);
      await vendor.save();
    }

    const safeNum = (invoice.invoiceNumber || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Delete financial Transaction
    if (safeNum) {
      await Transaction.deleteOne({
        source_type: "PURCHASE",
        description: { $regex: safeNum, $options: 'i' }
      });
    }

    // Delete stock ledger entries
    await InventoryLedger.deleteMany({ referenceType: "PurchaseInvoice", referenceId: invoice.invoiceNumber });
    await InventoryLedger.deleteMany({ batchNumber: invoice.invoiceNumber });

    // Delete invoice document
    await PurchaseInvoiceV2.deleteOne({ _id: invoice._id });

    ActivityLog.create({
      action: "DELETE",
      entityType: "PurchaseInvoiceV2",
      entityName: invoice.invoiceNumber,
      details: `Deleted Purchase Batch '${invoice.invoiceNumber}'.`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: invoice.company
    }).catch(e => console.error("ActivityLog error:", e));

    res.json({ msg: "Purchase invoice deleted successfully" });
  } catch (err) {
    next(err);
  }
};

exports.cancelPurchaseInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;

    let invoice = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      invoice = await PurchaseInvoiceV2.findById(id);
    }
    if (!invoice) {
      invoice = await PurchaseInvoiceV2.findOne({ invoiceNumber: id });
    }

    if (!invoice) {
      return res.status(404).json({ msg: "Purchase batch not found" });
    }

    if (invoice.status === 'Cancelled') {
      return res.status(400).json({ msg: "Purchase batch is already cancelled" });
    }

    const companyObjId = invoice.company;

    // Revert vendor liability balance
    if (invoice.vendorId) {
      const vendor = await Party.findById(invoice.vendorId);
      if (vendor) {
        const supplierPayable = invoice.subTotal || 0;
        vendor.outstanding = Math.max((vendor.outstanding || 0) - supplierPayable, 0);
        vendor.outstandingBalance = Math.max((vendor.outstandingBalance || 0) - supplierPayable, 0);
        await vendor.save();
      }
    }

    const safeNum = (invoice.invoiceNumber || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Delete financial Transaction
    if (safeNum) {
      await Transaction.deleteOne({
        source_type: "PURCHASE",
        description: { $regex: safeNum, $options: 'i' }
      });
    }

    // Delete stock ledger entries (removes stock balance from Stock and Stock Ledger modules)
    await InventoryLedger.deleteMany({ referenceType: "PurchaseInvoice", referenceId: invoice.invoiceNumber });
    await InventoryLedger.deleteMany({ batchNumber: invoice.invoiceNumber });

    // Mark status as Cancelled
    invoice.status = "Cancelled";
    await invoice.save();

    ActivityLog.create({
      action: "CANCEL",
      entityType: "PurchaseInvoiceV2",
      entityName: invoice.invoiceNumber,
      details: `Cancelled Purchase Batch '${invoice.invoiceNumber}' and removed stock entries.`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: companyObjId
    }).catch(e => console.error("ActivityLog error:", e));

    res.json({ msg: "Purchase batch cancelled successfully", invoice });
  } catch (err) {
    next(err);
  }
};

exports.getNextInvoiceNumber = async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId is required" });
    }
    const companyObjId = toObjectId(companyId);

    const regex = /^PB-(?:[A-Z]{3}-)?(\d+)$/i;

    const existingInvoices = await PurchaseInvoiceV2.find({ company: companyObjId, invoiceNumber: regex }).select('invoiceNumber').lean();

    let maxNum = 0;
    existingInvoices.forEach(inv => {
      const match = inv.invoiceNumber ? inv.invoiceNumber.match(regex) : null;
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    const nextSeq = maxNum + 1;
    const padLen = Math.max(3, String(nextSeq).length);
    const code = `PB-${String(nextSeq).padStart(padLen, '0')}`;

    res.json({ nextInvoiceNumber: code });
  } catch (err) {
    next(err);
  }
};

exports.allocateInvoiceLocations = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { itemIndex, allocations, companyId } = req.body;

    const companyObjId = toObjectId(companyId || req.body.company);
    if (!companyObjId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ msg: "Company ID is required" });
    }

    let query = mongoose.Types.ObjectId.isValid(id) ? { _id: toObjectId(id) } : { invoiceNumber: id };
    query.company = companyObjId;

    const invoice = await PurchaseInvoiceV2.findOne(query).session(session);

    if (!invoice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ msg: "Purchase batch not found" });
    }

    if (invoice.status === "Cancelled") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ msg: "Cannot allocate locations for a cancelled batch" });
    }

    const idx = Number(itemIndex) || 0;
    if (!invoice.items || !invoice.items[idx]) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ msg: `Invalid item index ${idx}` });
    }

    const item = invoice.items[idx];
    const skuId = item.skuId;
    const skuDoc = await SkuV2.findById(skuId).session(session);

    const validAllocations = (Array.isArray(allocations) ? allocations : [])
      .filter(a => a && a.toLocationId && Number(a.quantity) > 0);

    if (validAllocations.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ msg: "Please select at least one destination Godown and enter a valid quantity" });
    }

    const fromLocationId = item.locationId;

    // Helper to resolve hierarchy
    const getHierarchy = async (locId) => {
      let loc = await WarehouseLocationV2.findOne({ _id: toObjectId(locId), company: companyObjId }).session(session);
      if (!loc) loc = await WarehouseLocationV2.findById(toObjectId(locId)).session(session);
      if (!loc) {
        return { warehouseId: locId, floorId: locId, zoneId: locId, locationId: locId };
      }
      const chain = [loc];
      let curr = loc;
      while (curr && curr.parentId) {
        let parent = await WarehouseLocationV2.findOne({ _id: curr.parentId, company: companyObjId }).session(session);
        if (!parent) parent = await WarehouseLocationV2.findById(curr.parentId).session(session);
        if (!parent) break;
        chain.unshift(parent);
        curr = parent;
      }
      const factoryNode = chain.find(n => n.level === "Factory");
      const floorNode = chain.find(n => n.level === "Floor");
      const zoneNode = chain.find(n => n.level === "Zone");
      const storageNode = chain.find(n => n.level === "Storage Location");
      const warehouseId = factoryNode ? factoryNode._id : (chain[0]?._id || loc._id);
      const floorId = floorNode ? floorNode._id : (chain[1]?._id || warehouseId);
      const zoneId = zoneNode ? zoneNode._id : (chain[2]?._id || floorId);
      const locationId = storageNode ? storageNode._id : loc._id;
      return { warehouseId, floorId, zoneId, locationId };
    };

    const fromH = await getHierarchy(fromLocationId);

    // Record stock transfers in InventoryLedger
    for (const alloc of validAllocations) {
      const transferQty = Number(alloc.quantity);
      const toLocObjId = toObjectId(alloc.toLocationId);
      const toH = await getHierarchy(toLocObjId);

      const toLocDoc = await WarehouseLocationV2.findById(toLocObjId).session(session);
      const destName = toLocDoc ? toLocDoc.name : "Target Godown";

      const referenceId = `TXF-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const transactionNumberOut = await Sequence.getNextSequence("IL", session);
      const transactionNumberIn = await Sequence.getNextSequence("IL", session);

      // OUT from source
      const primOut = new InventoryLedger({
        transactionNumber: transactionNumberOut,
        transactionType: "Transfer",
        skuId: toObjectId(skuId),
        quantity: transferQty,
        unit: item.unit || skuDoc?.unit || "kg",
        direction: "OUT",
        referenceType: "PurchaseInvoiceAllocation",
        referenceId,
        batchNumber: invoice.invoiceNumber,
        warehouseId: fromH.warehouseId,
        floorId: fromH.floorId,
        zoneId: fromH.zoneId,
        locationId: fromH.locationId,
        reels: alloc.reels || [],
        remarks: `Location Allocation to ${destName} for ${invoice.invoiceNumber}`,
        createdBy: toObjectId(req.user?.id) || companyObjId,
        company: companyObjId,
        status: "Posted"
      });
      await primOut.save({ session });

      // IN to destination
      const primIn = new InventoryLedger({
        transactionNumber: transactionNumberIn,
        transactionType: "Transfer",
        skuId: toObjectId(skuId),
        quantity: transferQty,
        unit: item.unit || skuDoc?.unit || "kg",
        direction: "IN",
        referenceType: "PurchaseInvoiceAllocation",
        referenceId,
        batchNumber: invoice.invoiceNumber,
        warehouseId: toH.warehouseId,
        floorId: toH.floorId,
        zoneId: toH.zoneId,
        locationId: toH.locationId,
        reels: alloc.reels || [],
        remarks: `Location Allocation from Receiving Bay for ${invoice.invoiceNumber}`,
        createdBy: toObjectId(req.user?.id) || companyObjId,
        company: companyObjId,
        status: "Posted"
      });
      await primIn.save({ session });
    }

    // Now update invoice.items[idx].splits and reels to keep purchase invoice data consistent
    const newAllocMap = new Map();
    validAllocations.forEach(a => {
      const locStr = String(a.toLocationId);
      newAllocMap.set(locStr, (newAllocMap.get(locStr) || 0) + Number(a.quantity));
    });

    const existingSplits = (item.splits && item.splits.length > 0)
      ? item.splits
      : [{ locationId: fromLocationId, quantity: item.quantity }];

    const totalNewlyAllocated = validAllocations.reduce((s, a) => s + Number(a.quantity), 0);
    const updatedSplits = [];
    let sourceSplitHandled = false;

    for (const sp of existingSplits) {
      const spLocStr = String(typeof sp.locationId === 'object' && sp.locationId !== null ? sp.locationId._id : sp.locationId);
      if (spLocStr === String(fromLocationId) && !sourceSplitHandled) {
        sourceSplitHandled = true;
        const currentSourceQty = Number(sp.quantity) || 0;
        const remainingSourceQty = Math.max(0, currentSourceQty - totalNewlyAllocated);
        if (remainingSourceQty > 0) {
          updatedSplits.push({
            locationId: toObjectId(fromLocationId),
            quantity: remainingSourceQty
          });
        }
      } else {
        const addedQty = newAllocMap.get(spLocStr) || 0;
        newAllocMap.delete(spLocStr);
        updatedSplits.push({
          locationId: toObjectId(sp.locationId),
          quantity: (Number(sp.quantity) || 0) + addedQty
        });
      }
    }

    for (const [locStr, qty] of newAllocMap.entries()) {
      if (qty > 0) {
        updatedSplits.push({
          locationId: toObjectId(locStr),
          quantity: qty
        });
      }
    }

    item.splits = updatedSplits;
    if (updatedSplits.length > 0) {
      item.locationId = updatedSplits[0].locationId;
    }

    if (Array.isArray(item.reels) && item.reels.length > 0) {
      const reelLocMap = new Map();
      validAllocations.forEach(a => {
        (a.reels || []).forEach(r => {
          const rNum = r.reelNumber || r.reelNo;
          if (rNum) {
            reelLocMap.set(rNum, toObjectId(a.toLocationId));
          }
        });
      });
      item.reels.forEach(r => {
        const rNum = r.reelNumber || r.reelNo;
        if (reelLocMap.has(rNum)) {
          r.locationId = reelLocMap.get(rNum);
        }
      });
    }

    // Rate stability: purchasePrice, ratePerKg, totalPrice, subTotal, grandTotal remain untouched!
    await invoice.save({ session });

    await session.commitTransaction();
    session.endSession();

    const populatedInvoice = await PurchaseInvoiceV2.findById(invoice._id)
      .populate("vendorId", "firmName ownerName phone contactName email outstanding")
      .populate("items.skuId", "skuCode name category unit paperType pages reamWeight gsm width length brand ruleType purchasePrice ratePerKg")
      .populate("items.locationId", "name level code")
      .populate("items.splits.locationId", "name level code")
      .populate("items.reels.locationId", "name level code")
      .populate("createdBy", "fullName");

    res.json({ msg: "Stock allocated successfully", invoice: populatedInvoice || invoice });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

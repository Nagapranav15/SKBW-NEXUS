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

    // 1. Validate Vendor
    const vendor = await Party.findOne({ _id: toObjectId(vendorId), type: "vendor", company: companyObjId });
    if (!vendor) {
      return res.status(400).json({ msg: "Vendor not found or mismatch for this company" });
    }

    // 2. Validate Items, SKUs, and Location Hierarchies
    const validatedItems = [];
    let subTotal = 0;

    for (const item of items) {
      const { skuId, quantity, purchasePrice, lotNumber, locationId, reels, splits } = item;
      
      if (!skuId || !quantity || !purchasePrice || !lotNumber) {
        return res.status(400).json({ msg: "Missing fields in purchase items" });
      }

      const qty = Number(quantity);
      const price = Number(purchasePrice);
      if (qty <= 0 || price <= 0) {
        return res.status(400).json({ msg: "Quantity and price must be greater than zero" });
      }

      // Check SKU
      const sku = await SkuV2.findOne({ _id: toObjectId(skuId), company: companyObjId });
      if (!sku) {
        return res.status(400).json({ msg: `SKU '${skuId}' not found` });
      }

      const primaryLocId = locationId || (splits && splits[0]?.locationId) || (reels && reels[0]?.locationId);
      if (!primaryLocId) {
        return res.status(400).json({ msg: `Storage location is required for SKU '${sku.skuCode}'` });
      }

      const location = await WarehouseLocationV2.findOne({ _id: toObjectId(primaryLocId), company: companyObjId });
      if (!location) {
        return res.status(400).json({ msg: `Storage Location '${primaryLocId}' not found` });
      }

      const itemTotal = qty * price;
      const cleanReels = (Array.isArray(reels) ? reels : []).map((r, rIdx) => ({
        reelNumber: r.reelNumber || r.reelNo || `${lotNumber}-R${String(rIdx + 1).padStart(2, '0')}`,
        gsm: Number(r.gsm) || Number(sku.gsm) || 0,
        width: Number(r.width) || Number(sku.width) || 0,
        weight: Number(r.weight) || 0,
        locationId: r.locationId || location._id
      }));

      validatedItems.push({
        skuId: sku._id,
        quantity: qty,
        unit: sku.unit,
        purchasePrice: price,
        totalPrice: itemTotal,
        lotNumber,
        locationId: location._id,
        splits: Array.isArray(splits) ? splits : [],
        reels: cleanReels,
        reamWeight: item.reamWeight ? Number(item.reamWeight) : undefined,
        ratePerKg: item.ratePerKg ? Number(item.ratePerKg) : undefined
      });
    }

    const grandTotal = subTotal + Number(taxAmount) + Number(freight) + Number(craneCharges) + Number(otherCharges);

    // 3. Generate sequential invoice number if not manually specified
    let finalInvoiceNo = invoiceNumber;
    if (!finalInvoiceNo) {
      finalInvoiceNo = await Sequence.getNextSequence("PB");
    } else {
      const exists = await PurchaseInvoiceV2.findOne({ invoiceNumber: finalInvoiceNo, company: companyObjId });
      if (exists) {
        return res.status(400).json({ msg: `Purchase Invoice '${finalInvoiceNo}' already exists` });
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
      createdBy: toObjectId(req.user.id),
      company: companyObjId,
      status: "Posted"
    });
    await invoice.save();

    // 5. Inward stock using V2 Ledger Engine for each item
    for (const valItem of validatedItems) {
      // Helper function to resolve hierarchy for any locationId
      const getHierarchy = async (locId) => {
        const loc = await WarehouseLocationV2.findOne({ _id: toObjectId(locId), company: companyObjId });
        if (!loc) return { warehouseId: locId, floorId: locId, zoneId: locId, locationId: locId };
        let zoneId = loc._id, floorId = loc._id, warehouseId = loc._id;
        const p1 = loc.parentId ? await WarehouseLocationV2.findOne({ _id: loc.parentId, company: companyObjId }) : null;
        if (p1) {
          zoneId = p1._id;
          const p2 = p1.parentId ? await WarehouseLocationV2.findOne({ _id: p1.parentId, company: companyObjId }) : null;
          if (p2) {
            floorId = p2._id;
            const p3 = p2.parentId ? await WarehouseLocationV2.findOne({ _id: p2.parentId, company: companyObjId }) : null;
            warehouseId = p3 ? p3._id : p2._id;
          } else {
            floorId = p1._id; warehouseId = p1._id;
          }
        }
        return { warehouseId, floorId, zoneId, locationId: loc._id };
      };

      if (valItem.reels && valItem.reels.length > 0) {
        // Group reels by locationId if present
        const reelsByLoc = {};
        valItem.reels.forEach(r => {
          const lId = String(r.locationId || valItem.locationId);
          if (!reelsByLoc[lId]) reelsByLoc[lId] = [];
          reelsByLoc[lId].push(r);
        });

        for (const locIdStr of Object.keys(reelsByLoc)) {
          const reelsGroup = reelsByLoc[locIdStr];
          const groupWeight = reelsGroup.reduce((s, r) => s + (Number(r.weight) || 0), 0);
          const h = await getHierarchy(locIdStr);
          const transactionNumber = await Sequence.getNextSequence("IL");

          await new InventoryLedger({
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
            createdBy: toObjectId(req.user.id),
            company: companyObjId,
            status: "Posted"
          }).save();
        }
      } else if (valItem.splits && valItem.splits.length > 0) {
        for (const split of valItem.splits) {
          const splitQty = Number(split.quantity) || 0;
          if (splitQty <= 0) continue;
          const h = await getHierarchy(split.locationId);
          const transactionNumber = await Sequence.getNextSequence("IL");

          await new InventoryLedger({
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
            createdBy: toObjectId(req.user.id),
            company: companyObjId,
            status: "Posted"
          }).save();
        }
      } else {
        const h = await getHierarchy(valItem.locationId);
        const transactionNumber = await Sequence.getNextSequence("IL");

        await new InventoryLedger({
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
          createdBy: toObjectId(req.user.id),
          company: companyObjId,
          status: "Posted"
        }).save();
      }
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

    res.status(201).json(invoice);
  } catch (err) {
    next(err);
  }
};

const migratePurchaseBatchNumbers = async (companyObjId) => {
  try {
    const query = companyObjId ? { company: companyObjId } : {};
    const allInvoices = await PurchaseInvoiceV2.find(query).sort({ createdAt: 1 });
    if (!allInvoices || allInvoices.length === 0) return;

    let index = 1;
    for (const inv of allInvoices) {
      const oldNo = inv.invoiceNumber;
      if (!/^PB-[A-Z]{3}-\d{3}$/i.test(oldNo)) {
        const monthShort = inv.createdAt ? new Date(inv.createdAt).toLocaleString('en-US', { month: 'short' }).toUpperCase() : 'AUG';
        const newNo = `PB-${monthShort}-${String(index).padStart(3, '0')}`;
        index++;

        inv.invoiceNumber = newNo;
        if (Array.isArray(inv.items)) {
          inv.items.forEach(item => {
            if (!item.lotNumber || !/^PB-[A-Z]{3}-\d{3}$/i.test(item.lotNumber) || item.lotNumber === oldNo) {
              item.lotNumber = newNo;
            }
          });
        }
        await inv.save();

        await InventoryLedger.updateMany(
          { referenceId: oldNo },
          { $set: { referenceId: newNo, batchNumber: newNo } }
        );
        await InventoryLedger.updateMany(
          { batchNumber: oldNo },
          { $set: { batchNumber: newNo } }
        );
        await Transaction.updateMany(
          { source_type: "PURCHASE", description: { $regex: oldNo } },
          { $set: { description: `Inwarded materials under invoice ${newNo}` } }
        );
      }
    }
  } catch (err) {
    console.error("Error migrating batch numbers:", err);
  }
};

exports.getPurchaseInvoices = async (req, res, next) => {
  try {
    const { companyId, vendorId, paymentStatus, status, search, page = 1, limit = 20 } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const companyObjId = toObjectId(companyId);
    await migratePurchaseBatchNumbers(companyObjId);

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

    const [invoices, total] = await Promise.all([
      PurchaseInvoiceV2.find(query)
        .populate("vendorId", "firmName ownerName phone contactName email outstanding")
        .populate("items.skuId", "skuCode name category unit paperType pages reamWeight gsm ruleType")
        .populate("items.locationId", "name level")
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

    const vendor = await Party.findById(invoice.vendorId);
    if (!vendor) {
      return res.status(400).json({ msg: "Vendor associated with invoice not found" });
    }

    // Validate SKU/Locations
    const validatedItems = [];
    let subTotal = 0;

    for (const item of items) {
      const { skuId, quantity, purchasePrice, lotNumber, locationId, reels, splits } = item;
      
      if (!skuId || !quantity || !purchasePrice || !lotNumber) {
        return res.status(400).json({ msg: "Missing fields in purchase items" });
      }

      const qty = Number(quantity);
      const price = Number(purchasePrice);
      if (qty <= 0 || price <= 0) {
        return res.status(400).json({ msg: "Quantity and price must be greater than zero" });
      }

      const sku = await SkuV2.findById(skuId);
      if (!sku) {
        return res.status(400).json({ msg: `SKU '${skuId}' not found` });
      }

      const primaryLocId = locationId || (splits && splits[0]?.locationId) || (reels && reels[0]?.locationId);
      if (!primaryLocId) {
        return res.status(400).json({ msg: `Storage location is required for SKU '${sku.skuCode}'` });
      }

      const location = await WarehouseLocationV2.findById(primaryLocId);
      if (!location) {
        return res.status(400).json({ msg: `Location '${primaryLocId}' not found` });
      }

      const cleanReels = (Array.isArray(reels) ? reels : []).map((r, rIdx) => ({
        reelNumber: r.reelNumber || r.reelNo || `${lotNumber}-R${String(rIdx + 1).padStart(2, '0')}`,
        gsm: Number(r.gsm) || Number(sku.gsm) || 0,
        width: Number(r.width) || Number(sku.width) || 0,
        weight: Number(r.weight) || 0,
        locationId: r.locationId || location._id
      }));

      validatedItems.push({
        skuId: sku._id,
        quantity: qty,
        unit: sku.unit,
        purchasePrice: price,
        totalPrice: itemTotal,
        lotNumber,
        locationId: location._id,
        splits: Array.isArray(splits) ? splits : [],
        reels: cleanReels,
        reamWeight: item.reamWeight ? Number(item.reamWeight) : undefined,
        ratePerKg: item.ratePerKg ? Number(item.ratePerKg) : undefined
      });
    }

    const newGrandTotal = subTotal + Number(taxAmount) + Number(freight) + Number(craneCharges) + Number(otherCharges);
    
    // Check if new grand total is less than already paid amount
    if (newGrandTotal < (invoice.paidAmount || 0)) {
      return res.status(400).json({ msg: `Cannot edit invoice to amount ₹${newGrandTotal} which is less than the already paid amount of ₹${invoice.paidAmount}` });
    }

    const newSupplierPayable = subTotal;
    const oldSupplierPayable = invoice.subTotal || 0;
    const diff = newSupplierPayable - oldSupplierPayable;

    // Update Vendor Outstanding (Material cost difference)
    vendor.outstanding = Math.max((vendor.outstanding || 0) + diff, 0);
    vendor.outstandingBalance = Math.max((vendor.outstandingBalance || 0) + diff, 0);
    await vendor.save();

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

    // Helper function to resolve hierarchy for any locationId
    const getHierarchy = async (locId) => {
      const loc = await WarehouseLocationV2.findById(locId);
      if (!loc) return { warehouseId: locId, floorId: locId, zoneId: locId, locationId: locId };
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
      return { warehouseId, floorId, zoneId, locationId: loc._id };
    };

    for (const valItem of validatedItems) {
      if (valItem.reels && valItem.reels.length > 0) {
        const reelsByLoc = {};
        valItem.reels.forEach(r => {
          const lId = String(r.locationId || valItem.locationId);
          if (!reelsByLoc[lId]) reelsByLoc[lId] = [];
          reelsByLoc[lId].push(r);
        });

        for (const locIdStr of Object.keys(reelsByLoc)) {
          const reelsGroup = reelsByLoc[locIdStr];
          const groupWeight = reelsGroup.reduce((s, r) => s + (Number(r.weight) || 0), 0);
          const h = await getHierarchy(locIdStr);
          const transactionNumber = await Sequence.getNextSequence("IL");

          await new InventoryLedger({
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
            createdBy: toObjectId(req.user.id),
            company: companyObjId,
            status: "Posted"
          }).save();
        }
      } else if (valItem.splits && valItem.splits.length > 0) {
        for (const split of valItem.splits) {
          const splitQty = Number(split.quantity) || 0;
          if (splitQty <= 0) continue;
          const h = await getHierarchy(split.locationId);
          const transactionNumber = await Sequence.getNextSequence("IL");

          await new InventoryLedger({
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
            createdBy: toObjectId(req.user.id),
            company: companyObjId,
            status: "Posted"
          }).save();
        }
      } else {
        const h = await getHierarchy(valItem.locationId);
        const transactionNumber = await Sequence.getNextSequence("IL");

        await new InventoryLedger({
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
          createdBy: toObjectId(req.user.id),
          company: companyObjId,
          status: "Posted"
        }).save();
      }
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

    res.json(invoice);
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

    const invoice = await PurchaseInvoiceV2.findOne({ _id: toObjectId(id), company: companyObjId });
    if (!invoice) {
      return res.status(404).json({ msg: "Purchase Invoice not found" });
    }

    // Do not allow deleting paid invoices
    if (invoice.paidAmount > 0) {
      return res.status(400).json({ msg: "Cannot delete an invoice that has payments recorded. Please void the payments first." });
    }

    const vendor = await Party.findOne({ _id: invoice.vendorId, company: companyObjId });
    if (vendor) {
      const supplierPayable = invoice.subTotal || 0;
      vendor.outstanding = Math.max((vendor.outstanding || 0) - supplierPayable, 0);
      vendor.outstandingBalance = Math.max((vendor.outstandingBalance || 0) - supplierPayable, 0);
      await vendor.save();
    }

    // Delete financial Transaction
    await Transaction.deleteOne({
      company: companyObjId,
      partyId: invoice.vendorId,
      source_type: "PURCHASE",
      description: { $regex: invoice.invoiceNumber }
    });

    // Delete stock ledger entries
    await InventoryLedger.deleteMany({ referenceType: "PurchaseInvoice", referenceId: invoice.invoiceNumber, company: companyObjId });

    // Delete invoice document
    await PurchaseInvoiceV2.deleteOne({ _id: invoice._id });

    ActivityLog.create({
      action: "DELETE",
      entityType: "PurchaseInvoiceV2",
      entityName: invoice.invoiceNumber,
      details: `Deleted Purchase Batch '${invoice.invoiceNumber}'.`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: companyObjId
    }).catch(e => console.error("ActivityLog error:", e));

    res.json({ msg: "Purchase invoice deleted successfully" });
  } catch (err) {
    next(err);
  }
};

exports.cancelPurchaseInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;

    const invoice = await PurchaseInvoiceV2.findById(id);
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

    // Delete financial Transaction
    await Transaction.deleteOne({
      source_type: "PURCHASE",
      description: { $regex: invoice.invoiceNumber }
    });

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

    const monthShort = new Date().toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const prefix = `PB-${monthShort}-`;
    const regex = new RegExp(`^PB-${monthShort}-(\\d+)$`, 'i');

    const existingInvoices = await PurchaseInvoiceV2.find({ company: companyObjId, invoiceNumber: regex }).select('invoiceNumber').lean();

    let maxNum = 0;
    existingInvoices.forEach(inv => {
      const match = inv.invoiceNumber.match(regex);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    const nextSeq = maxNum + 1;
    const code = `${prefix}${String(nextSeq).padStart(3, '0')}`;

    res.json({ nextInvoiceNumber: code });
  } catch (err) {
    next(err);
  }
};

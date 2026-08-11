const mongoose = require("mongoose");
const PurchaseInvoiceV2 = require("../models/purchaseInvoiceV2Model");
const Party = require("../models/partyModel");
const SkuV2 = require("../models/skuV2Model");
const WarehouseLocationV2 = require("../models/warehouseLocationV2Model");
const InventoryLedger = require("../models/inventoryLedgerModelV2");
const Sequence = require("../models/sequenceModel");
const Transaction = require("../models/transactionModel");

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
      const { skuId, quantity, purchasePrice, lotNumber, locationId, reels } = item;
      
      if (!skuId || !quantity || !purchasePrice || !lotNumber || !locationId) {
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
      if (sku.category !== "Raw Material" && sku.category !== "Consumables" && sku.category !== "Semi Finished") {
        return res.status(400).json({ msg: `Only Raw Materials, Consumables, or Semi Finished goods can be purchased (SKU: ${sku.skuCode})` });
      }

      // Resolve Location Hierarchy dynamically
      const location = await WarehouseLocationV2.findOne({ _id: toObjectId(locationId), company: companyObjId });
      if (!location) {
        return res.status(400).json({ msg: `Storage Location '${locationId}' not found` });
      }

      let zoneId = location._id;
      let floorId = location._id;
      let warehouseId = location._id;

      const parent1 = location.parentId ? await WarehouseLocationV2.findOne({ _id: location.parentId, company: companyObjId }) : null;
      if (parent1) {
        zoneId = parent1._id;
        const parent2 = parent1.parentId ? await WarehouseLocationV2.findOne({ _id: parent1.parentId, company: companyObjId }) : null;
        if (parent2) {
          floorId = parent2._id;
          const parent3 = parent2.parentId ? await WarehouseLocationV2.findOne({ _id: parent2.parentId, company: companyObjId }) : null;
          if (parent3) {
            warehouseId = parent3._id;
          } else {
            warehouseId = parent2._id;
          }
        } else {
          floorId = parent1._id;
          warehouseId = parent1._id;
        }
      }

      const itemTotal = qty * price;
      subTotal += itemTotal;

      validatedItems.push({
        skuId: sku._id,
        quantity: qty,
        unit: sku.unit,
        purchasePrice: price,
        totalPrice: itemTotal,
        lotNumber,
        locationId: location._id,
        reels: reels || [],
        reamWeight: item.reamWeight ? Number(item.reamWeight) : undefined,
        ratePerKg: item.ratePerKg ? Number(item.ratePerKg) : undefined,
        // Cached hierarchies for ledger creation
        warehouseId,
        floorId,
        zoneId
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
      const transactionNumber = await Sequence.getNextSequence("IL");

      const newLedgerEntry = new InventoryLedger({
        transactionNumber,
        transactionType: "Purchase",
        skuId: valItem.skuId,
        quantity: valItem.quantity,
        unit: valItem.unit,
        direction: "IN",
        referenceType: "PurchaseInvoice",
        referenceId: finalInvoiceNo,
        batchNumber: finalInvoiceNo,
        warehouseId: valItem.warehouseId,
        floorId: valItem.floorId,
        zoneId: valItem.zoneId,
        locationId: valItem.locationId,
        remarks: `Lot: ${valItem.lotNumber}. Inwarded via invoice ${finalInvoiceNo}`,
        reels: valItem.reels || [],
        createdBy: toObjectId(req.user.id),
        company: companyObjId,
        status: "Posted"
      });
      await newLedgerEntry.save();
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

    res.status(201).json(invoice);
  } catch (err) {
    next(err);
  }
};

exports.getPurchaseInvoices = async (req, res, next) => {
  try {
    const { companyId, vendorId, paymentStatus, status, search, page = 1, limit = 20 } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const query = { company: toObjectId(companyId) };
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

    if (!company) {
      return res.status(400).json({ msg: "company is required" });
    }
    const companyObjId = toObjectId(company);

    const invoice = await PurchaseInvoiceV2.findOne({ _id: toObjectId(id), company: companyObjId });
    if (!invoice) {
      return res.status(404).json({ msg: "Purchase Invoice not found" });
    }

    const vendor = await Party.findOne({ _id: invoice.vendorId, company: companyObjId });
    if (!vendor) {
      return res.status(400).json({ msg: "Vendor associated with invoice not found" });
    }

    // Validate SKU/Locations
    const validatedItems = [];
    let subTotal = 0;

    for (const item of items) {
      const { skuId, quantity, purchasePrice, lotNumber, locationId, reels } = item;
      
      if (!skuId || !quantity || !purchasePrice || !lotNumber || !locationId) {
        return res.status(400).json({ msg: "Missing fields in purchase items" });
      }

      const qty = Number(quantity);
      const price = Number(purchasePrice);
      if (qty <= 0 || price <= 0) {
        return res.status(400).json({ msg: "Quantity and price must be greater than zero" });
      }

      const sku = await SkuV2.findOne({ _id: toObjectId(skuId), company: companyObjId });
      if (!sku) {
        return res.status(400).json({ msg: `SKU '${skuId}' not found` });
      }

      const location = await WarehouseLocationV2.findOne({ _id: toObjectId(locationId), company: companyObjId });
      if (!location) {
        return res.status(400).json({ msg: `Location '${locationId}' not found` });
      }

      let zoneId = location._id;
      let floorId = location._id;
      let warehouseId = location._id;

      const parent1 = location.parentId ? await WarehouseLocationV2.findOne({ _id: location.parentId, company: companyObjId }) : null;
      if (parent1) {
        zoneId = parent1._id;
        const parent2 = parent1.parentId ? await WarehouseLocationV2.findOne({ _id: parent1.parentId, company: companyObjId }) : null;
        if (parent2) {
          floorId = parent2._id;
          const parent3 = parent2.parentId ? await WarehouseLocationV2.findOne({ _id: parent2.parentId, company: companyObjId }) : null;
          if (parent3) {
            warehouseId = parent3._id;
          } else {
            warehouseId = parent2._id;
          }
        } else {
          floorId = parent1._id;
          warehouseId = parent1._id;
        }
      }

      const itemTotal = qty * price;
      subTotal += itemTotal;

      validatedItems.push({
        skuId: sku._id,
        quantity: qty,
        unit: sku.unit,
        purchasePrice: price,
        totalPrice: itemTotal,
        lotNumber,
        locationId: location._id,
        reels: reels || [],
        warehouseId,
        floorId,
        zoneId
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
    await InventoryLedger.deleteMany({ referenceType: "PurchaseInvoice", referenceId: invoice.invoiceNumber, company: companyObjId });

    for (const valItem of validatedItems) {
      const transactionNumber = await Sequence.getNextSequence("IL");

      const newLedgerEntry = new InventoryLedger({
        transactionNumber,
        transactionType: "Purchase",
        skuId: valItem.skuId,
        quantity: valItem.quantity,
        unit: valItem.unit,
        direction: "IN",
        referenceType: "PurchaseInvoice",
        referenceId: invoice.invoiceNumber,
        batchNumber: invoice.invoiceNumber,
        warehouseId: valItem.warehouseId,
        floorId: valItem.floorId,
        zoneId: valItem.zoneId,
        locationId: valItem.locationId,
        remarks: `Lot: ${valItem.lotNumber}. Inwarded via invoice ${invoice.invoiceNumber}`,
        reels: valItem.reels || [],
        createdBy: toObjectId(req.user.id),
        company: companyObjId,
        status: "Posted"
      });
      await newLedgerEntry.save();
    }

    // Update Invoice document
    invoice.items = validatedItems;
    invoice.subTotal = subTotal;
    invoice.taxAmount = Number(taxAmount);
    invoice.freight = Number(freight);
    invoice.craneCharges = Number(craneCharges);
    invoice.otherCharges = Number(otherCharges);
    invoice.grandTotal = newGrandTotal;
    invoice.dueDate = dueDate ? new Date(dueDate) : undefined;
    invoice.remarks = remarks || "";
    
    if (invoice.paidAmount >= newGrandTotal) {
      invoice.paymentStatus = "Paid";
    } else if (invoice.paidAmount > 0) {
      invoice.paymentStatus = "Partially Paid";
    } else {
      invoice.paymentStatus = "Unpaid";
    }

    await invoice.save();

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

    res.json({ msg: "Purchase invoice deleted successfully" });
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

    const seqDoc = await Sequence.findOne({ prefix: "PB" });
    const currentSeq = seqDoc ? seqDoc.sequence : 0;

    let nextSeq = currentSeq + 1;
    let code = `PB-${String(nextSeq).padStart(6, '0')}`;
    let exists = await PurchaseInvoiceV2.exists({ invoiceNumber: code, company: companyObjId });

    while (exists) {
      nextSeq++;
      code = `PB-${String(nextSeq).padStart(6, '0')}`;
      exists = await PurchaseInvoiceV2.exists({ invoiceNumber: code, company: companyObjId });
    }

    res.json({ nextInvoiceNumber: code });
  } catch (err) {
    next(err);
  }
};

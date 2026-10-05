const mongoose = require("mongoose");
const DeliveryChallan = require("../models/deliveryChallanModel");
const InventoryLedger = require("../models/inventoryLedgerModelV2");
const InventoryLedgerV2 = require("../models/inventoryLedgerV2Model");
const SkuV2 = require("../models/skuV2Model");
const WarehouseLocationV2 = require("../models/warehouseLocationV2Model");
const SalesOrderV2 = require("../models/salesOrderV2Model");
const { getNextSequenceNumber } = require("../utils/sequenceManager");
const { broadcast } = require("../utils/realtimeService");

const toObjectId = (id) => {
  if (!id) return null;
  try {
    return new mongoose.Types.ObjectId(id);
  } catch (e) {
    return null;
  }
};

async function getDefaultLocationHierarchy(companyId, preferredLocationId) {
  const companyObjId = toObjectId(companyId);
  let locDoc = null;
  if (preferredLocationId && mongoose.Types.ObjectId.isValid(String(preferredLocationId))) {
    locDoc = await WarehouseLocationV2.findOne({ _id: toObjectId(preferredLocationId), company: companyObjId }).lean();
    if (!locDoc) {
      locDoc = await WarehouseLocationV2.findById(toObjectId(preferredLocationId)).lean();
    }
  }
  if (!locDoc && preferredLocationId && companyObjId) {
    locDoc = await WarehouseLocationV2.findOne({
      company: companyObjId,
      name: { $regex: new RegExp(`^${String(preferredLocationId).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
    }).lean();
  }
  if (!locDoc && companyObjId) {
    locDoc = await WarehouseLocationV2.findOne({ company: companyObjId, level: "Storage Location" }).lean()
      || await WarehouseLocationV2.findOne({ company: companyObjId }).lean();
  }
  if (!locDoc) {
    locDoc = await WarehouseLocationV2.findOne({ level: "Storage Location" }).lean()
      || await WarehouseLocationV2.findOne().lean();
  }

  if (!locDoc && companyObjId) {
    try {
      const created = await WarehouseLocationV2.create({
        name: "Main Storage",
        level: "Storage Location",
        company: companyObjId,
        status: "Active"
      });
      locDoc = created.toObject ? created.toObject() : created;
    } catch (e) {
      console.warn("Fallback location creation failed:", e);
    }
  }

  if (!locDoc) {
    const fallbackId = new mongoose.Types.ObjectId();
    return { warehouseId: fallbackId, floorId: fallbackId, zoneId: fallbackId, locationId: fallbackId };
  }

  const chain = [locDoc];
  let curr = locDoc;
  while (curr && curr.parentId) {
    let parent = await WarehouseLocationV2.findById(curr.parentId).lean();
    if (!parent) break;
    chain.unshift(parent);
    curr = parent;
  }

  const factoryNode = chain.find(n => n.level === "Factory");
  const floorNode = chain.find(n => n.level === "Floor");
  const zoneNode = chain.find(n => n.level === "Zone");
  const storageNode = chain.find(n => n.level === "Storage Location");

  const warehouseId = factoryNode ? factoryNode._id : (chain[0]?._id || locDoc._id);
  const floorId = floorNode ? floorNode._id : (chain[1]?._id || warehouseId);
  const zoneId = zoneNode ? zoneNode._id : (chain[2]?._id || floorId);
  const resolvedLocId = storageNode ? storageNode._id : locDoc._id;

  return { warehouseId, floorId, zoneId, locationId: resolvedLocId };
}

async function postDispatchInventory(challan, userId) {
  if (!challan || !challan.items || challan.items.length === 0) return;
  const companyObjId = toObjectId(challan.company);
  if (!companyObjId) return;

  for (const item of challan.items) {
    const qtyGbl = Number(item.deliveredQty || 0);
    const qtyPcs = Number(item.deliveredPcs || 0);
    const fallbackQty = Number(item.quantity || item.orderedQty || 0);
    if (qtyGbl <= 0 && qtyPcs <= 0 && fallbackQty <= 0) continue;

    // Find matching SKU
    let sku = null;
    if (item.skuId && mongoose.Types.ObjectId.isValid(String(item.skuId))) {
      sku = await SkuV2.findById(item.skuId);
    }
    if (!sku && item.itemId && mongoose.Types.ObjectId.isValid(String(item.itemId))) {
      sku = await SkuV2.findById(item.itemId);
    }
    if (!sku && item.skuCode) {
      sku = await SkuV2.findOne({ company: companyObjId, skuCode: item.skuCode });
      if (!sku) sku = await SkuV2.findOne({ skuCode: item.skuCode });
    }
    if (!sku && item.itemName) {
      const cleanName = item.itemName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      sku = await SkuV2.findOne({
        company: companyObjId,
        $or: [
          { name: item.itemName },
          { name: new RegExp(`^${cleanName}$`, "i") },
          { skuCode: item.itemName }
        ]
      });
      if (!sku) {
        sku = await SkuV2.findOne({
          $or: [
            { name: item.itemName },
            { name: new RegExp(`^${cleanName}$`, "i") },
            { skuCode: item.itemName }
          ]
        });
      }
    }

    if (!sku) continue;

    // Calculate quantity in SKU's primary accounting unit
    const pcsPerGbl = Number(sku.altUnitConversion || sku.booksGbl || 100) || 100;
    const isSkuGbl = (sku.unit || "").toUpperCase() === "GBL";
    let finalQty = 0;
    if (isSkuGbl) {
      finalQty = qtyGbl > 0 ? qtyGbl : (qtyPcs > 0 ? Math.ceil(qtyPcs / pcsPerGbl) : fallbackQty);
    } else {
      finalQty = qtyPcs > 0 ? qtyPcs : (qtyGbl > 0 ? qtyGbl * pcsPerGbl : fallbackQty);
    }
    if (finalQty <= 0) continue;

    // Check if movement already exists for this item and challan to avoid double-posting
    const existingMovement = await InventoryLedger.findOne({
      referenceType: "DeliveryChallan",
      referenceId: challan.dcNumber,
      skuId: sku._id,
      status: { $ne: "Cancelled" }
    });

    if (!existingMovement) {
      // Find locations with positive stock for this SKU to deduct from actual stock locations
      const stockLocs = await InventoryLedger.aggregate([
        {
          $match: {
            company: companyObjId,
            skuId: sku._id,
            status: { $ne: "Cancelled" }
          }
        },
        {
          $group: {
            _id: {
              locationId: "$locationId",
              warehouseId: "$warehouseId",
              floorId: "$floorId",
              zoneId: "$zoneId"
            },
            onHand: {
              $sum: {
                $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", { $multiply: ["$quantity", -1] }]
              }
            }
          }
        },
        { $match: { onHand: { $gt: 0 } } },
        { $sort: { onHand: -1 } }
      ]);

      let remainingToDeduct = finalQty;
      const deductionBatches = [];

      if (stockLocs && stockLocs.length > 0) {
        for (const loc of stockLocs) {
          if (remainingToDeduct <= 0) break;
          const deductFromThisLoc = Math.min(loc.onHand, remainingToDeduct);
          deductionBatches.push({
            warehouseId: loc._id.warehouseId,
            floorId: loc._id.floorId,
            zoneId: loc._id.zoneId,
            locationId: loc._id.locationId,
            quantity: deductFromThisLoc
          });
          remainingToDeduct -= deductFromThisLoc;
        }
      }

      // If stock across existing locations was less than finalQty or no existing locations, deduct remainder from default hierarchy
      if (remainingToDeduct > 0 || deductionBatches.length === 0) {
        const preferredLoc = sku.initialLocationId || sku.defaultLocation;
        const h = await getDefaultLocationHierarchy(companyObjId, preferredLoc);
        deductionBatches.push({
          warehouseId: h.warehouseId,
          floorId: h.floorId,
          zoneId: h.zoneId,
          locationId: h.locationId,
          quantity: remainingToDeduct > 0 ? remainingToDeduct : finalQty
        });
      }

      for (const batch of deductionBatches) {
        if (!batch.locationId || batch.quantity <= 0) continue;

        let txNum;
        try {
          txNum = await getNextSequenceNumber("IL", companyObjId);
        } catch (e) {
          txNum = `DISP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        }

        // 1. Post to primary InventoryLedger (direction: "OUT" dynamically deducts stock from balance)
        await InventoryLedger.create({
          transactionNumber: txNum,
          transactionType: "Sales Dispatch",
          skuId: sku._id,
          quantity: batch.quantity,
          unit: sku.unit || (isSkuGbl ? "GBL" : "Pcs"),
          direction: "OUT",
          referenceType: "DeliveryChallan",
          referenceId: challan.dcNumber,
          warehouseId: batch.warehouseId || batch.locationId,
          floorId: batch.floorId || batch.warehouseId || batch.locationId,
          zoneId: batch.zoneId || batch.floorId || batch.locationId,
          locationId: batch.locationId,
          remarks: `Sales Dispatch to ${challan.customerName || 'Customer'} via DC #${challan.dcNumber}`,
          createdBy: toObjectId(userId),
          status: "Posted",
          company: companyObjId
        });

        // 2. Post to InventoryLedgerV2 for secondary ledger audit
        await InventoryLedgerV2.create({
          timestamp: new Date(),
          transactionType: "Sales Dispatch",
          referenceId: challan.dcNumber,
          skuId: sku._id,
          locationId: batch.locationId,
          qtyIn: 0,
          qtyOut: batch.quantity,
          balanceAfter: 0,
          company: companyObjId,
          remarks: `Dispatched DC #${challan.dcNumber}`,
          userId: toObjectId(userId)
        }).catch(e => console.error("Error creating InventoryLedgerV2 on DC dispatch:", e));
      }

      // Update SkuV2 presentStock if present
      if (sku.presentStock !== undefined) {
        sku.presentStock = Math.max(0, (Number(sku.presentStock) || 0) - finalQty);
        await sku.save().catch(e => console.warn("Failed to update sku presentStock:", e));
      }
    }

    // 3. Update Sales Order dispatchedQty to release reservation
    if (challan.orderId || challan.orderNumber) {
      const orderQuery = { company: companyObjId };
      if (challan.orderId && mongoose.Types.ObjectId.isValid(String(challan.orderId))) {
        orderQuery._id = toObjectId(challan.orderId);
      } else if (challan.orderNumber) {
        orderQuery.orderNumber = challan.orderNumber;
      }

      const salesOrder = await SalesOrderV2.findOne(orderQuery);
      if (salesOrder && salesOrder.items) {
        let updated = false;
        salesOrder.items.forEach(soItem => {
          const isMatch = (soItem.skuId && String(soItem.skuId) === String(sku._id)) ||
                          (soItem.skuCode && soItem.skuCode === sku.skuCode) ||
                          (soItem.itemName && soItem.itemName === item.itemName) ||
                          (soItem.description && soItem.description === item.itemName);
          if (isMatch) {
            soItem.dispatchedQty = (Number(soItem.dispatchedQty) || 0) + (isSkuGbl ? finalQty : (qtyGbl || Math.ceil(finalQty / pcsPerGbl)));
            updated = true;
          }
        });

        if (updated) {
          const totalOrdered = salesOrder.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
          const totalDispatched = salesOrder.items.reduce((s, i) => s + (Number(i.dispatchedQty) || 0), 0);
          if (totalDispatched >= totalOrdered) {
            salesOrder.fulfillmentStatus = "Fulfilled";
            salesOrder.status = "Delivered";
          } else if (totalDispatched > 0) {
            salesOrder.fulfillmentStatus = "Partially Dispatched";
            salesOrder.status = "Partially Delivered";
          }
          await salesOrder.save();
        }
      }
    }
  }
}

async function reverseDispatchInventory(challan) {
  if (!challan || !challan.dcNumber) return;
  const companyObjId = toObjectId(challan.company);

  // Mark existing ledger movements as Cancelled rather than hard deleting, maintaining permanent audit trail
  await InventoryLedger.updateMany(
    { referenceType: "DeliveryChallan", referenceId: challan.dcNumber, company: companyObjId },
    { $set: { status: "Cancelled" } }
  );

  await InventoryLedgerV2.deleteMany({
    referenceId: challan.dcNumber,
    transactionType: "Sales Dispatch"
  }).catch(() => {});

  // Restore Sku presentStock
  if (challan.items && Array.isArray(challan.items)) {
    for (const item of challan.items) {
      const qtyGbl = Number(item.deliveredQty || 0);
      const qtyPcs = Number(item.deliveredPcs || 0);
      const fallbackQty = Number(item.quantity || item.orderedQty || 0);
      const qty = qtyGbl > 0 ? qtyGbl : (qtyPcs > 0 ? qtyPcs : fallbackQty);
      if (qty <= 0) continue;

      let sku = null;
      if (item.skuId && mongoose.Types.ObjectId.isValid(String(item.skuId))) {
        sku = await SkuV2.findById(item.skuId);
      }
      if (!sku && item.itemId && mongoose.Types.ObjectId.isValid(String(item.itemId))) {
        sku = await SkuV2.findById(item.itemId);
      }
      if (!sku && item.skuCode) {
        sku = await SkuV2.findOne({ company: companyObjId, skuCode: item.skuCode });
      }
      if (sku && sku.presentStock !== undefined) {
        sku.presentStock = (Number(sku.presentStock) || 0) + qty;
        await sku.save().catch(() => {});
      }
    }
  }

  // Revert Sales Order dispatched quantities
  if (challan.orderId || challan.orderNumber) {
    const orderQuery = { company: companyObjId };
    if (challan.orderId && mongoose.Types.ObjectId.isValid(String(challan.orderId))) {
      orderQuery._id = toObjectId(challan.orderId);
    } else if (challan.orderNumber) {
      orderQuery.orderNumber = challan.orderNumber;
    }

    const salesOrder = await SalesOrderV2.findOne(orderQuery);
    if (salesOrder && salesOrder.items && challan.items) {
      challan.items.forEach(item => {
        const qty = Number(item.deliveredQty || item.orderedQty || 0);
        salesOrder.items.forEach(soItem => {
          const isMatch = (item.skuId && String(soItem.skuId) === String(item.skuId)) ||
                          (soItem.skuCode && soItem.skuCode === item.skuCode) ||
                          (String(soItem.skuId) === String(item.itemId)) ||
                          (soItem.description === item.itemName) ||
                          (soItem.itemName === item.itemName);
          if (isMatch) {
            soItem.dispatchedQty = Math.max(0, (Number(soItem.dispatchedQty) || 0) - qty);
          }
        });
      });

      const totalOrdered = salesOrder.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      const totalDispatched = salesOrder.items.reduce((s, i) => s + (Number(i.dispatchedQty) || 0), 0);
      if (totalDispatched >= totalOrdered) {
        salesOrder.fulfillmentStatus = "Fulfilled";
        salesOrder.status = "Delivered";
      } else if (totalDispatched > 0) {
        salesOrder.fulfillmentStatus = "Partially Dispatched";
        salesOrder.status = "Partially Delivered";
      } else {
        salesOrder.fulfillmentStatus = "Pending";
        salesOrder.status = "Confirmed";
      }
      await salesOrder.save();
    }
  }
}

exports.getDeliveryChallans = async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = {};
    if (companyId) filter.company = companyId;
    if (req.query.status) filter.status = req.query.status;

    const challans = await DeliveryChallan.find(filter).sort({ createdAt: -1 });
    res.json(challans);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getDeliveryChallanById = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findById(req.params.id);
    if (!challan) return res.status(404).json({ msg: "Delivery Challan not found" });
    res.json(challan);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createDeliveryChallan = async (req, res) => {
  try {
    let dcNumber = req.body.dcNumber;
    if (!dcNumber || !dcNumber.trim()) {
      dcNumber = await getNextSequenceNumber("DC", req.body.company);
    } else {
      const exists = await DeliveryChallan.findOne({ dcNumber, company: req.body.company });
      if (exists) {
        dcNumber = await getNextSequenceNumber("DC", req.body.company);
      }
    }

    const payload = { ...req.body, dcNumber };
    if (payload.orderId && !mongoose.Types.ObjectId.isValid(String(payload.orderId))) {
      payload.orderNumber = payload.orderNumber || String(payload.orderId);
      payload.orderId = null;
    }
    if (payload.customerId && !mongoose.Types.ObjectId.isValid(String(payload.customerId))) {
      payload.customerName = payload.customerName || String(payload.customerId);
      payload.customerId = null;
    }

    const challan = await DeliveryChallan.create(payload);

    // If status is dispatched or delivered, automatically post stock-out and release reservation
    if (challan.status === "dispatched" || challan.status === "delivered") {
      await postDispatchInventory(challan, req.user?._id || req.body.createdBy);
    }

    broadcast(challan.company, {
      entity: "delivery_challan",
      action: "create",
      id: challan._id,
      data: challan
    });

    broadcast(challan.company, {
      entity: "inventory",
      action: "stock_update",
      referenceId: challan.dcNumber
    });

    res.status(201).json(challan);
  } catch (err) {
    console.error("createDeliveryChallan error:", err);
    res.status(500).json({ msg: err.message });
  }
};

exports.updateDeliveryChallan = async (req, res) => {
  try {
    const oldChallan = await DeliveryChallan.findById(req.params.id);
    if (!oldChallan) return res.status(404).json({ msg: "Delivery Challan not found" });

    const challan = await DeliveryChallan.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });

    // If transitioned to dispatched or delivered
    if (
      (challan.status === "dispatched" || challan.status === "delivered") &&
      oldChallan.status !== "dispatched" && oldChallan.status !== "delivered"
    ) {
      await postDispatchInventory(challan, req.user?._id || req.body.createdBy);
    } else if (
      (oldChallan.status === "dispatched" || oldChallan.status === "delivered") &&
      challan.status !== "dispatched" && challan.status !== "delivered"
    ) {
      await reverseDispatchInventory(challan);
    }

    broadcast(challan.company, {
      entity: "delivery_challan",
      action: "update",
      id: challan._id,
      data: challan
    });

    broadcast(challan.company, {
      entity: "inventory",
      action: "stock_update",
      referenceId: challan.dcNumber
    });

    res.json(challan);
  } catch (err) {
    console.error("updateDeliveryChallan error:", err);
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteDeliveryChallan = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findById(req.params.id);
    if (!challan) return res.status(404).json({ msg: "Delivery Challan not found" });

    // Reverse any stock movements before deletion
    await reverseDispatchInventory(challan);

    await DeliveryChallan.findByIdAndDelete(req.params.id);

    broadcast(challan.company, {
      entity: "delivery_challan",
      action: "delete",
      id: challan._id
    });

    broadcast(challan.company, {
      entity: "inventory",
      action: "stock_update",
      referenceId: challan.dcNumber
    });

    res.json({ msg: "Delivery Challan deleted and inventory movements reversed successfully" });
  } catch (err) {
    console.error("deleteDeliveryChallan error:", err);
    res.status(500).json({ msg: err.message });
  }
};

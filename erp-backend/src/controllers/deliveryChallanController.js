const mongoose = require("mongoose");
const DeliveryChallan = require("../models/deliveryChallanModel");
const InventoryLedger = require("../models/inventoryLedgerModelV2");
const InventoryLedgerV2 = require("../models/inventoryLedgerV2Model");
const SkuV2 = require("../models/skuV2Model");
const WarehouseLocationV2 = require("../models/warehouseLocationV2Model");
const SalesOrderV2 = require("../models/salesOrderV2Model");

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
  if (preferredLocationId) {
    locDoc = await WarehouseLocationV2.findOne({ _id: toObjectId(preferredLocationId), company: companyObjId });
  }
  if (!locDoc) {
    locDoc = await WarehouseLocationV2.findOne({ company: companyObjId, level: "Storage Location" }) 
      || await WarehouseLocationV2.findOne({ company: companyObjId });
  }

  let warehouse = null, floor = null, zone = null, storageLoc = locDoc;
  if (locDoc) {
    if (locDoc.parentId) {
      zone = await WarehouseLocationV2.findById(locDoc.parentId);
      if (zone && zone.parentId) {
        floor = await WarehouseLocationV2.findById(zone.parentId);
        if (floor && floor.parentId) {
          warehouse = await WarehouseLocationV2.findById(floor.parentId);
        }
      }
    }
  }

  // Fallback defaults
  warehouse = warehouse || locDoc;
  floor = floor || locDoc;
  zone = zone || locDoc;
  storageLoc = storageLoc || locDoc;

  return { warehouse, floor, zone, storageLoc };
}

async function postDispatchInventory(challan, userId) {
  if (!challan || !challan.items || challan.items.length === 0) return;
  const companyObjId = toObjectId(challan.company);

  for (const item of challan.items) {
    const qty = Number(item.deliveredQty || item.orderedQty || 0);
    if (qty <= 0) continue;

    // Find matching SKU
    let sku = null;
    if (item.itemId && mongoose.Types.ObjectId.isValid(String(item.itemId))) {
      sku = await SkuV2.findById(item.itemId);
    }
    if (!sku && item.itemName) {
      sku = await SkuV2.findOne({
        company: companyObjId,
        $or: [{ name: item.itemName }, { skuCode: item.itemName }]
      });
    }

    if (!sku) continue;

    // Determine location hierarchy
    const preferredLoc = sku.initialLocationId || sku.defaultLocation;
    const { warehouse, floor, zone, storageLoc } = await getDefaultLocationHierarchy(companyObjId, preferredLoc);

    if (!storageLoc) continue;

    // Check if movement already exists for this item and challan to avoid double-posting
    const existingMovement = await InventoryLedger.findOne({
      referenceType: "DeliveryChallan",
      referenceId: challan.dcNumber,
      skuId: sku._id
    });

    if (!existingMovement) {
      const txNum = `DISP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Post to primary InventoryLedger
      await InventoryLedger.create({
        transactionNumber: txNum,
        transactionType: "Sales Dispatch",
        skuId: sku._id,
        quantity: qty,
        unit: sku.unit || "Pcs",
        direction: "OUT",
        referenceType: "DeliveryChallan",
        referenceId: challan.dcNumber,
        warehouseId: warehouse._id,
        floorId: floor._id,
        zoneId: zone._id,
        locationId: storageLoc._id,
        remarks: `Sales Dispatch to ${challan.customerName} via DC #${challan.dcNumber}`,
        createdBy: toObjectId(userId),
        status: "Posted",
        company: companyObjId
      });

      // 2. Post to InventoryLedgerV2
      await InventoryLedgerV2.create({
        timestamp: new Date(),
        transactionType: "Sales Dispatch",
        referenceId: challan.dcNumber,
        skuId: sku._id,
        locationId: storageLoc._id,
        qtyIn: 0,
        qtyOut: qty,
        balanceAfter: 0,
        company: companyObjId,
        remarks: `Dispatched DC #${challan.dcNumber}`,
        userId: toObjectId(userId)
      }).catch(e => console.error("Error creating InventoryLedgerV2 on DC dispatch:", e));
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
          if (String(soItem.skuId) === String(sku._id) || soItem.skuCode === sku.skuCode || soItem.description === item.itemName) {
            soItem.dispatchedQty = (Number(soItem.dispatchedQty) || 0) + qty;
            updated = true;
          }
        });

        if (updated) {
          const totalOrdered = salesOrder.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
          const totalDispatched = salesOrder.items.reduce((s, i) => s + (Number(i.dispatchedQty) || 0), 0);
          if (totalDispatched >= totalOrdered) {
            salesOrder.status = "Dispatched";
          } else if (totalDispatched > 0) {
            salesOrder.status = "Partially Dispatched";
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
          if (String(soItem.skuId) === String(item.itemId) || soItem.description === item.itemName) {
            soItem.dispatchedQty = Math.max(0, (Number(soItem.dispatchedQty) || 0) - qty);
          }
        });
      });
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
    const challan = await DeliveryChallan.create(req.body);

    // If status is dispatched or delivered, automatically post stock-out and release reservation
    if (challan.status === "dispatched" || challan.status === "delivered") {
      await postDispatchInventory(challan, req.user?._id || req.body.createdBy);
    }

    res.status(201).json(challan);
  } catch (err) {
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
    }

    res.json(challan);
  } catch (err) {
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
    res.json({ msg: "Delivery Challan deleted and inventory movements reversed successfully" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

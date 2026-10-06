const ProductionOrder = require("../models/productionOrderModel");
const SkuV2 = require("../models/skuV2Model");
const InventoryLedger = require("../models/inventoryLedgerModelV2");
const WarehouseLocationV2 = require("../models/warehouseLocationV2Model");
const PurchaseInvoiceV2 = require("../models/purchaseInvoiceV2Model");
const CuttingSlip = require("../models/cuttingSlipModel");
const Sequence = require("../models/sequenceModel");
const mongoose = require("mongoose");
const { getNextSequenceNumber, peekNextSequenceNumber, syncSequenceNumber } = require("../utils/sequenceManager");
const { broadcast } = require("../utils/realtimeService");

// Helper to resolve warehouse location hierarchy (Factory -> Floor -> Zone -> Location)
const getHierarchy = async (locationId, companyId) => {
  if (!locationId && !companyId) return {};
  const companyObjId = mongoose.Types.ObjectId.isValid(companyId) ? new mongoose.Types.ObjectId(companyId) : null;

  let loc = null;
  if (locationId && mongoose.Types.ObjectId.isValid(locationId)) {
    loc = await WarehouseLocationV2.findById(locationId).lean();
  }
  if (!loc && locationId && companyObjId) {
    loc = await WarehouseLocationV2.findOne({
      company: companyObjId,
      name: { $regex: new RegExp(`^${String(locationId).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
    }).lean();
  }
  if (!loc && companyObjId) {
    loc = await WarehouseLocationV2.findOne({ company: companyObjId, level: "Storage Location" }).lean()
      || await WarehouseLocationV2.findOne({ company: companyObjId }).lean();
  }
  if (!loc) return {};

  const chain = [loc];
  let curr = loc;
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

  const warehouseId = factoryNode ? factoryNode._id : (chain[0]?._id || loc._id);
  const floorId = floorNode ? floorNode._id : (chain[1]?._id || warehouseId);
  const zoneId = zoneNode ? zoneNode._id : (chain[2]?._id || floorId);
  const resolvedLocId = storageNode ? storageNode._id : loc._id;

  return { warehouseId, floorId, zoneId, locationId: resolvedLocId };
};

const cleanedCompanies = new Set();

// Cleanup ghost ledger entries for uncompleted production orders where 0 was produced
const cleanupGhostProductionLedgers = async (companyId) => {
  try {
    if (cleanedCompanies.has(String(companyId))) return;
    const filter = {
      status: { $nin: ["Completed"] },
      $or: [{ producedQty: 0 }, { producedQty: { $exists: false } }]
    };
    if (companyId) filter.company = companyId;

    const unproducedOrders = await ProductionOrder.find(filter).select("orderNumber company").lean();
    if (unproducedOrders.length > 0) {
      const orderNumbers = unproducedOrders.map(o => o.orderNumber);
      const exists = await InventoryLedger.exists({
        referenceType: "ProductionOrder",
        referenceId: { $in: orderNumbers }
      });
      if (exists) {
        await InventoryLedger.deleteMany({
          referenceType: "ProductionOrder",
          referenceId: { $in: orderNumbers }
        });
      }
    }
    cleanedCompanies.add(String(companyId));
  } catch (e) {
    console.error("Error cleaning ghost production ledgers:", e);
  }
};

const toObjectId = (id) => {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  return id;
};

// Helper to calculate active purchase batches and their true remaining quantities via FIFO
const getActiveBatchesForSku = async (sku, companyObjId) => {
  const skuId = sku._id;
  const skuIdStr = String(sku._id);

  // 1. Inward batches from InventoryLedger
  const inwardBatches = await InventoryLedger.aggregate([
    {
      $match: {
        skuId: toObjectId(skuId),
        company: companyObjId,
        direction: "IN",
        status: { $ne: "Cancelled" },
        referenceType: { $ne: "PurchaseInvoiceAllocation" },
        batchNumber: { $exists: true, $ne: "" }
      }
    },
    {
      $group: {
        _id: "$batchNumber",
        firstInDate: { $min: "$createdAt" },
        qtyIn: { $sum: "$quantity" }
      }
    },
    { $sort: { firstInDate: 1 } }
  ]);

  // 2. Fetch purchase invoices for this SKU to map batch prices and dates
  const invoices = await PurchaseInvoiceV2.find({
    company: companyObjId,
    "items.skuId": toObjectId(skuId),
    status: { $ne: "Cancelled" }
  }).select("invoiceNumber invoiceDate partyName items createdAt").sort({ invoiceDate: 1, createdAt: 1 }).lean();

  const batchPriceMap = new Map();
  const invoiceDatesMap = new Map();
  const allPurchasedItems = [];

  invoices.forEach(inv => {
    (inv.items || []).forEach(it => {
      if (String(it.skuId) === skuIdStr) {
        const price = Number(it.purchasePrice) || Number(it.ratePerKg) || 0;
        const date = inv.invoiceDate || inv.createdAt;
        if (it.lotNumber) { batchPriceMap.set(it.lotNumber, price); invoiceDatesMap.set(it.lotNumber, date); }
        if (it.batchNumber) { batchPriceMap.set(it.batchNumber, price); invoiceDatesMap.set(it.batchNumber, date); }
        if (inv.invoiceNumber) { batchPriceMap.set(inv.invoiceNumber, price); invoiceDatesMap.set(inv.invoiceNumber, date); }
        allPurchasedItems.push({
          price,
          quantity: Number(it.quantity) || 0,
          date,
          invoiceNumber: inv.invoiceNumber,
          vendor: inv.partyName
        });
      }
    });
  });

  const fallbackPrice = Number(sku.avgCost || sku.costPrice || sku.standardCost || sku.purchasePrice || sku.rate || 0);

  // 3. Construct initial batch objects
  const batches = inwardBatches.map(b => ({
    batchNumber: b._id,
    date: invoiceDatesMap.get(b._id) || b.firstInDate,
    qtyIn: Number(b.qtyIn) || 0,
    qtyOut: 0,
    remainingQty: Number(b.qtyIn) || 0,
    rate: batchPriceMap.get(b._id) || (allPurchasedItems.find(it => it.invoiceNumber === b._id)?.price) || fallbackPrice
  }));

  // Also include any purchase invoices not in ledger
  invoices.forEach(inv => {
    (inv.items || []).forEach(it => {
      if (String(it.skuId) === skuIdStr) {
        const bNum = it.lotNumber || it.batchNumber || inv.invoiceNumber;
        if (bNum && !batches.some(b => b.batchNumber === bNum)) {
          const price = Number(it.purchasePrice) || Number(it.ratePerKg) || fallbackPrice;
          batches.push({
            batchNumber: bNum,
            date: inv.invoiceDate || inv.createdAt,
            qtyIn: Number(it.quantity) || 0,
            qtyOut: 0,
            remainingQty: Number(it.quantity) || 0,
            rate: price
          });
        }
      }
    });
  });

  // Sort batches chronologically (FIFO order)
  batches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // 4. Collect all OUT transactions for this SKU
  const outRecords = await InventoryLedger.find({
    skuId: toObjectId(skuId),
    company: companyObjId,
    direction: "OUT",
    referenceType: { $ne: "PurchaseInvoiceAllocation" },
    status: { $ne: "Cancelled" }
  }).sort({ createdAt: 1 }).lean();

  // Deduct explicit matching batches first
  const unassignedOut = [];
  outRecords.forEach(out => {
    const qty = Number(out.quantity) || 0;
    if (qty <= 0) return;
    const targetBatch = out.batchNumber ? batches.find(b => b.batchNumber === out.batchNumber) : null;
    if (targetBatch) {
      targetBatch.qtyOut += qty;
      targetBatch.remainingQty = Math.max(0, targetBatch.remainingQty - qty);
    } else {
      unassignedOut.push(qty);
    }
  });

  // Deduct unassigned OUT records (e.g. legacy production orders with PO number) via FIFO
  unassignedOut.forEach(qty => {
    let toDeduct = qty;
    for (const b of batches) {
      if (b.remainingQty > 0.0001) {
        const take = Math.min(toDeduct, b.remainingQty);
        b.qtyOut += take;
        b.remainingQty = Math.max(0, b.remainingQty - take);
        toDeduct -= take;
        if (toDeduct <= 0.0001) break;
      }
    }
  });

  return {
    batches: batches.filter(b => b.remainingQty > 0.0001),
    allBatches: batches,
    allPurchasedItems,
    batchPriceMap
  };
};

// Helper to allocate batches under FIFO and compute majority batch rate
const allocateFifoBatches = (activeBatches, reqQty, standardRate) => {
  if (!activeBatches || activeBatches.length === 0) {
    return {
      fifoRate: standardRate || 0,
      majorityBatch: null,
      majorityRate: standardRate || 0,
      majorityQty: 0,
      weightedRate: standardRate || 0,
      allocatedBatches: [],
      fifoBatchInfo: null
    };
  }

  // If reqQty <= 0, default to earliest batch
  if (!reqQty || reqQty <= 0) {
    const earliest = activeBatches[0];
    const eRate = earliest.rate > 0 ? earliest.rate : (standardRate || 0);
    return {
      fifoRate: eRate,
      majorityBatch: earliest.batchNumber,
      majorityRate: eRate,
      majorityQty: earliest.remainingQty,
      weightedRate: eRate,
      allocatedBatches: [{
        batchNumber: earliest.batchNumber,
        qty: earliest.remainingQty,
        rate: eRate,
        date: earliest.date ? new Date(earliest.date).toLocaleDateString("en-GB") : undefined,
        batchTotalRemaining: earliest.remainingQty
      }],
      fifoBatchInfo: {
        batchNumber: earliest.batchNumber,
        rate: eRate,
        majorityBatch: earliest.batchNumber,
        majorityRate: eRate,
        majorityQty: earliest.remainingQty,
        weightedRate: eRate,
        summary: `Earliest batch ${earliest.batchNumber} (${earliest.remainingQty} available @ ₹${eRate})`,
        date: earliest.date ? new Date(earliest.date).toLocaleDateString("en-GB") : undefined,
        remainingQty: earliest.remainingQty
      }
    };
  }

  let remainingNeeded = reqQty;
  const allocated = [];

  for (const b of activeBatches) {
    if (remainingNeeded <= 0.0001) break;
    const bRate = b.rate > 0 ? b.rate : (standardRate || 0);
    const take = Math.min(remainingNeeded, b.remainingQty);
    if (take > 0) {
      allocated.push({
        batchNumber: b.batchNumber,
        qty: Math.round(take * 1000) / 1000,
        rate: bRate,
        date: b.date ? new Date(b.date).toLocaleDateString("en-GB") : undefined,
        batchTotalRemaining: b.remainingQty
      });
      remainingNeeded -= take;
    }
  }

  if (remainingNeeded > 0.0001) {
    const fallbackRate = allocated.length > 0 ? allocated[allocated.length - 1].rate : (standardRate || 0);
    allocated.push({
      batchNumber: "Unassigned Stock",
      qty: Math.round(remainingNeeded * 1000) / 1000,
      rate: fallbackRate,
      date: undefined,
      batchTotalRemaining: 0
    });
  }

  // Find the MAJORITY batch (highest qty used). If tie, earliest batch wins!
  let majorityItem = allocated[0];
  for (let i = 1; i < allocated.length; i++) {
    if (allocated[i].qty > majorityItem.qty) {
      majorityItem = allocated[i];
    }
  }

  const majorityRate = majorityItem.rate || standardRate || 0;

  const totalAllocated = allocated.reduce((sum, a) => sum + a.qty, 0);
  const totalVal = allocated.reduce((sum, a) => sum + (a.qty * a.rate), 0);
  const weightedRate = totalAllocated > 0 ? Math.round((totalVal / totalAllocated) * 100) / 100 : majorityRate;

  const partsSummary = allocated.map(a => `${a.qty} from ${a.batchNumber} (@ ₹${a.rate})`).join(" + ");
  const summaryStr = `${partsSummary} • Majority: ${majorityItem.batchNumber} (@ ₹${majorityRate})`;

  return {
    fifoRate: majorityRate, // Majority of batch of material used
    majorityBatch: majorityItem.batchNumber,
    majorityRate: majorityRate,
    majorityQty: majorityItem.qty,
    weightedRate: weightedRate,
    allocatedBatches: allocated,
    fifoBatchInfo: {
      batchNumber: majorityItem.batchNumber,
      rate: majorityRate,
      majorityBatch: majorityItem.batchNumber,
      majorityRate: majorityRate,
      majorityQty: majorityItem.qty,
      weightedRate: weightedRate,
      allocatedBatches: allocated,
      summary: summaryStr,
      date: majorityItem.date,
      remainingQty: majorityItem.batchTotalRemaining
    }
  };
};

// Dynamically synchronize prepared production order stock in Item Stock & Inventory (InventoryLedger).
// Only actual PREPARED (produced) stock is recorded into on-hand inventory!
// While planned or in-production with 0 produced, it only reserves the place (does not record directly).
const syncProductionOrderLedger = async (order) => {
  try {
    if (!order || !order.company) return;
    const companyObjId = order.company;

    // Clean up previous ledger entries for this production order to avoid stale or duplicate postings
    await InventoryLedger.deleteMany({
      referenceType: "ProductionOrder",
      referenceId: order.orderNumber,
      company: companyObjId
    });

    const isCompleted = order.status === "Completed";
    const producedQty = Number(order.producedQty) || 0;
    // Dynamic prepared stock: only actual produced quantity, or full planned quantity if order is Completed
    const qtyIn = isCompleted ? (producedQty > 0 ? producedQty : Number(order.plannedQty)) : producedQty;

    // If 0 stock has been prepared, DO NOT record on-hand stock directly into the ledger!
    // It remains in "In Production" / reserved place.
    if (qtyIn <= 0) {
      return;
    }

    const ledgerDocs = [];

    // 1. Finished Product Receipt (IN) - ONLY for actual prepared stock
    if (order.itemId || order.itemCode || order.itemName) {
      let sku = null;
      if (order.itemId && mongoose.Types.ObjectId.isValid(order.itemId)) {
        sku = await SkuV2.findById(order.itemId).lean();
      }
      if (!sku) {
        sku = await SkuV2.findOne({
          company: companyObjId,
          $or: [
            { skuCode: order.itemCode },
            { name: order.itemName }
          ]
        }).lean();
      }

      if (sku) {
        const outputLocId = order.outputLocationId || order.locationId || order.outputLocation || order.factory || order.factoryId || sku.initialLocationId || sku.defaultLocation;
        const h = await getHierarchy(outputLocId, companyObjId);
        const transactionNumber = await Sequence.getNextSequence("IL");

        if (h.locationId) {
          ledgerDocs.push({
            transactionNumber,
            transactionType: "Production Receipt",
            skuId: sku._id,
            quantity: qtyIn,
            unit: order.plannedUom || sku.unit || "Pcs",
            direction: "IN",
            referenceType: "ProductionOrder",
            referenceId: order.orderNumber,
            batchNumber: order.finishedGoodsBatch?.batchNo || order.orderNumber,
            warehouseId: h.warehouseId,
            floorId: h.floorId,
            zoneId: h.zoneId,
            locationId: h.locationId,
            remarks: `Prepared under Production Order ${order.orderNumber} (${order.itemName}) [${isCompleted ? 'Completed' : 'Partial'}]`,
            createdBy: order.createdBy,
            company: companyObjId,
            status: "Posted"
          });
        }
      }
    }

    // 2. BOM Materials Consumption (OUT) - Proportional to actual prepared stock
    if (order.bomItems && Array.isArray(order.bomItems) && order.bomItems.length > 0) {
      const progressRatio = isCompleted ? 1 : Math.min(1, qtyIn / (Number(order.plannedQty) || 1));

      for (const m of order.bomItems) {
        const fullReq = Number(m.totalRequired) || Number(m.qtyPerBatch) || 0;
        const consumedQty = Math.round(fullReq * progressRatio * 1000) / 1000;
        if (consumedQty <= 0) continue;

        let matSku = null;
        if (m.skuId && mongoose.Types.ObjectId.isValid(m.skuId)) {
          matSku = await SkuV2.findById(m.skuId).lean();
        }
        if (!matSku) {
          matSku = await SkuV2.findOne({
            company: companyObjId,
            $or: [
              { skuCode: m.code },
              { name: m.component }
            ]
          }).lean();
        }

        if (matSku) {
          const matLocId = m.locationId || m.sourceLocation || matSku.initialLocationId || matSku.defaultLocation || order.outputLocationId || order.locationId;
          const h = await getHierarchy(matLocId, companyObjId);
          const transactionNumber = await Sequence.getNextSequence("IL");

          // Convert consumedQty from m.uom to matSku.unit for ledger consistency:
          // e.g. if m.uom is PCS and matSku.unit is GBL, 23 PCS = 23 / 400 = 0.0575 GBL.
          let ledgerQty = consumedQty;
          const mUomNorm = (m.uom || '').trim().toLowerCase();
          const skuUnitNorm = (matSku.unit || '').trim().toLowerCase();
          const skuAltUnitNorm = (matSku.altUnit || '').trim().toLowerCase();
          const convFactor = Number(matSku.altUnitConversion || matSku.conv || matSku.booksGbl || matSku.pcsPerGbl || 1);

          if (mUomNorm && skuUnitNorm && mUomNorm !== skuUnitNorm && convFactor > 0) {
            if (mUomNorm === skuAltUnitNorm || mUomNorm === 'pcs' || mUomNorm === 'pieces' || mUomNorm === 'pc') {
              ledgerQty = Math.round((consumedQty / convFactor) * 1000000) / 1000000;
            } else if (skuUnitNorm === 'pcs' || skuUnitNorm === 'pieces' || skuUnitNorm === 'pc') {
              ledgerQty = Math.round((consumedQty * convFactor) * 1000000) / 1000000;
            }
          }

          if (h.locationId) {
            const convertToLedgerQty = (q) => {
              if (mUomNorm && skuUnitNorm && mUomNorm !== skuUnitNorm && convFactor > 0) {
                if (mUomNorm === skuAltUnitNorm || mUomNorm === 'pcs' || mUomNorm === 'pieces' || mUomNorm === 'pc') {
                  return Math.round((q / convFactor) * 1000000) / 1000000;
                } else if (skuUnitNorm === 'pcs' || skuUnitNorm === 'pieces' || skuUnitNorm === 'pc') {
                  return Math.round((q * convFactor) * 1000000) / 1000000;
                }
              }
              return q;
            };

            const targetLedgerQty = convertToLedgerQty(consumedQty);
            let remainingToDeduct = targetLedgerQty;

            // Priority 1: User explicitly assigned a specific batchNumber for this material
            if (m.batchNumber && m.batchNumber !== order.orderNumber) {
              const transactionNumber = await Sequence.getNextSequence("IL");
              ledgerDocs.push({
                transactionNumber,
                transactionType: "Production Consumption",
                skuId: matSku._id,
                quantity: targetLedgerQty,
                unit: matSku.unit || m.uom || "Pcs",
                direction: "OUT",
                referenceType: "ProductionOrder",
                referenceId: order.orderNumber,
                batchNumber: m.batchNumber,
                warehouseId: h.warehouseId,
                floorId: h.floorId,
                zoneId: h.zoneId,
                locationId: h.locationId,
                remarks: `Consumed from Batch ${m.batchNumber} for Production Order ${order.orderNumber} (${order.itemName}) [${consumedQty} ${m.uom || 'Pcs'}]`,
                createdBy: order.createdBy,
                company: companyObjId,
                status: "Posted"
              });
              remainingToDeduct = 0;
            }

            // Priority 2: User explicitly provided multi-batch allocation that matches consumedQty (not a 1-unit preview)
            if (remainingToDeduct > 0.0001 && m.batchesAllocated && Array.isArray(m.batchesAllocated) && m.batchesAllocated.length > 0) {
              const sumAlloc = m.batchesAllocated.reduce((s, a) => s + (Number(a.qty) || 0), 0);
              // Only apply if the allocated total genuinely covers the requirement (e.g. within 5%)
              if (sumAlloc >= consumedQty * 0.95) {
                for (const alloc of m.batchesAllocated) {
                  if (remainingToDeduct <= 0.0001) break;
                  const batchAllocReq = Number(alloc.qty) || 0;
                  const batchConsumed = Math.round(batchAllocReq * progressRatio * 1000) / 1000;
                  if (batchConsumed <= 0) continue;
                  const takeQty = Math.min(remainingToDeduct, convertToLedgerQty(batchConsumed));
                  const transactionNumber = await Sequence.getNextSequence("IL");

                  ledgerDocs.push({
                    transactionNumber,
                    transactionType: "Production Consumption",
                    skuId: matSku._id,
                    quantity: takeQty,
                    unit: matSku.unit || m.uom || "Pcs",
                    direction: "OUT",
                    referenceType: "ProductionOrder",
                    referenceId: order.orderNumber,
                    batchNumber: alloc.batchNumber || order.orderNumber,
                    warehouseId: h.warehouseId,
                    floorId: h.floorId,
                    zoneId: h.zoneId,
                    locationId: h.locationId,
                    remarks: `Consumed from Batch ${alloc.batchNumber} for Production Order ${order.orderNumber} (${order.itemName}) [${batchConsumed} ${m.uom || 'Pcs'}]`,
                    createdBy: order.createdBy,
                    company: companyObjId,
                    status: "Posted"
                  });
                  remainingToDeduct -= takeQty;
                }
              }
            }

            // Priority 3: Dynamic FIFO deduction against live active purchase batches for all remaining quantity
            if (remainingToDeduct > 0.0001) {
              const activeInfo = await getActiveBatchesForSku(matSku, companyObjId);
              const activeBatches = activeInfo.batches || [];

              for (const ab of activeBatches) {
                if (remainingToDeduct <= 0.0001) break;
                const take = Math.min(remainingToDeduct, ab.remainingQty);
                if (take > 0) {
                  const transactionNumber = await Sequence.getNextSequence("IL");
                  ledgerDocs.push({
                    transactionNumber,
                    transactionType: "Production Consumption",
                    skuId: matSku._id,
                    quantity: Math.round(take * 1000000) / 1000000,
                    unit: matSku.unit || m.uom || "Pcs",
                    direction: "OUT",
                    referenceType: "ProductionOrder",
                    referenceId: order.orderNumber,
                    batchNumber: ab.batchNumber,
                    warehouseId: h.warehouseId,
                    floorId: h.floorId,
                    zoneId: h.zoneId,
                    locationId: h.locationId,
                    remarks: `FIFO Consumed from Batch ${ab.batchNumber} for Production Order ${order.orderNumber} (${order.itemName})`,
                    createdBy: order.createdBy,
                    company: companyObjId,
                    status: "Posted"
                  });
                  remainingToDeduct -= take;
                }
              }
            }

            // Priority 4: Any shortage beyond active batches is recorded with order.orderNumber so total stock reduction is 100% exact
            if (remainingToDeduct > 0.0001) {
              const transactionNumber = await Sequence.getNextSequence("IL");
              ledgerDocs.push({
                transactionNumber,
                transactionType: "Production Consumption",
                skuId: matSku._id,
                quantity: Math.round(remainingToDeduct * 1000000) / 1000000,
                unit: matSku.unit || m.uom || "Pcs",
                direction: "OUT",
                referenceType: "ProductionOrder",
                referenceId: order.orderNumber,
                batchNumber: order.orderNumber,
                warehouseId: h.warehouseId,
                floorId: h.floorId,
                zoneId: h.zoneId,
                locationId: h.locationId,
                remarks: `Consumed (unassigned shortage) for Production Order ${order.orderNumber} (${order.itemName})`,
                createdBy: order.createdBy,
                company: companyObjId,
                status: "Posted"
              });
            }
          }
        }
      }
    }

    if (ledgerDocs.length > 0) {
      await InventoryLedger.insertMany(ledgerDocs, { ordered: false });
    }

    // Update produced SKU's Weighted Average Cost using standard formula:
    // New Avg Cost = (Existing Stock Value + New Production Value) / (Existing Qty + New Qty)
    if (order.itemId || order.itemCode || order.itemName) {
      const targetSku = await SkuV2.findOne({
        company: companyObjId,
        $or: [
          ...(order.itemId && mongoose.Types.ObjectId.isValid(order.itemId) ? [{ _id: order.itemId }] : []),
          ...(order.itemCode ? [{ skuCode: order.itemCode }] : []),
          ...(order.itemName ? [{ name: order.itemName }] : [])
        ]
      });

      if (targetSku && qtyIn > 0) {
        const isGbl = (targetSku.unit || '').toUpperCase() === 'GBL' || (order.plannedUom || '').toUpperCase() === 'GBL';
        let unitCost = 0;
        const cs = order.costSummary || {};
        if (isGbl && cs.costPerGbl && Number(cs.costPerGbl) > 0) {
          unitCost = Number(cs.costPerGbl);
        } else if (!isGbl && cs.costPerPiece && Number(cs.costPerPiece) > 0) {
          unitCost = Number(cs.costPerPiece);
        } else if (cs.totalProductionCost && Number(cs.totalProductionCost) > 0) {
          const divisor = isGbl ? (order.plannedQty || 1) : (order.plannedPcs || order.plannedQty || 1);
          unitCost = Number(cs.totalProductionCost) / divisor;
        }

        const effectiveTotalCost = (Number(cs.totalProductionCost) > 0 && isCompleted)
          ? Number(cs.totalProductionCost)
          : (qtyIn * unitCost);

        if (unitCost > 0) {
          try {
            const onHandAgg = await InventoryLedger.aggregate([
              {
                $match: {
                  company: companyObjId,
                  skuId: targetSku._id,
                  status: "Posted"
                }
              },
              {
                $group: {
                  _id: "$skuId",
                  totalIn: { $sum: { $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", 0] } },
                  totalOut: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$quantity", 0] } }
                }
              }
            ]);

            const rawOnHand = onHandAgg.length > 0 ? (onHandAgg[0].totalIn - onHandAgg[0].totalOut) : 0;
            const existingQty = Math.max(0, rawOnHand - qtyIn);
            const existingRate = Number(targetSku.avgCost || targetSku.costPrice || targetSku.standardCost || 0);
            const existingStockValue = existingQty * existingRate;

            const totalQty = existingQty + qtyIn;
            // Weighted average cost formula:
            const newAvgCost = totalQty > 0
              ? ((existingStockValue + effectiveTotalCost) / totalQty)
              : unitCost;

            const roundedCost = Math.round(newAvgCost * 10000) / 10000;
            targetSku.avgCost = roundedCost;
            targetSku.costPrice = roundedCost;
            targetSku.standardCost = roundedCost;
            await targetSku.save();
          } catch (costErr) {
            console.error("Non-critical: Failed to update SKU weighted average cost:", costErr);
          }
        }
      }
    }
  } catch (err) {
    console.error("Error syncing production order stock updates to InventoryLedger:", err);
  }
};

// Helper to generate next Order Number: PO-001, PO-002... up to 100,000+
// Globally synchronized and thread-safe via atomic Sequence Manager
const generateNextOrderNumber = async (companyId) => {
  return await getNextSequenceNumber("PO", companyId);
};

const peekNextOrderNumber = async (companyId) => {
  return await peekNextSequenceNumber("PO", companyId);
};

// GET /api/production-orders
exports.getProductionOrders = async (req, res) => {
  try {
    const companyId = req.query.companyId || req.user?.company;
    if (!companyId) {
      return res.status(400).json({ msg: "Company ID is required" });
    }

    // Auto-heal ghost ledger entries for uncompleted orders with 0 produced
    await cleanupGhostProductionLedgers(companyId);

    const filter = { company: companyId };

    if (req.query.status && req.query.status !== "All") {
      filter.status = req.query.status;
    }

    if (req.query.itemType && req.query.itemType !== "All") {
      filter.itemType = req.query.itemType;
    }

    if (req.query.department && req.query.department !== "All") {
      filter.department = req.query.department;
    }

    if (req.query.search) {
      const q = req.query.search.trim();
      filter.$or = [
        { orderNumber: { $regex: q, $options: "i" } },
        { itemName: { $regex: q, $options: "i" } },
        { itemCode: { $regex: q, $options: "i" } },
        { department: { $regex: q, $options: "i" } }
      ];
    }

    let queryExec = ProductionOrder.find(filter).sort({ createdAt: -1, orderNumber: -1 });
    if (req.query.light === "true" || req.query.light === true) {
      queryExec = queryExec.select("orderNumber itemId itemName itemCode plannedQty plannedUom plannedPcs producedQty producedPcs status progress costSummary bomItems outputLocation factory");
    }

    const orders = await queryExec.lean();

    // Ensure all order numbers display standard PO- format
    const normalized = orders.map(o => {
      if (o.orderNumber && o.orderNumber.startsWith("PR-")) {
        const match = o.orderNumber.match(/^PR-(\d+)$/);
        const newNo = match 
          ? `PO-${String(parseInt(match[1], 10)).padStart(Math.max(3, String(parseInt(match[1], 10)).length), "0")}`
          : o.orderNumber.replace(/^PR-/, "PO-");
        return { ...o, orderNumber: newNo };
      }
      return o;
    });

    res.json(normalized);
  } catch (err) {
    console.error("Error fetching production orders:", err);
    res.status(500).json({ msg: "Failed to fetch production orders", error: err.message });
  }
};

// GET /api/production-orders/next-number (READ-ONLY: DOES NOT ADVANCE SEQUENCE COUNTER)
exports.getNextOrderNumber = async (req, res) => {
  try {
    const companyId = req.query.companyId || req.user?.company;
    if (!companyId) {
      return res.status(400).json({ msg: "Company ID is required" });
    }

    const nextNumber = await peekNextOrderNumber(companyId);
    res.json({ nextNumber });
  } catch (err) {
    console.error("Error generating next production order number:", err);
    res.status(500).json({ msg: "Failed to generate order number", error: err.message });
  }
};

// GET /api/production-orders/:id
exports.getProductionOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    let query;
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { _id: id };
    } else {
      const altId = id.startsWith("PO-") ? id.replace(/^PO-0*/, "PR-0") : id.replace(/^PR-0*/, "PO-0");
      query = { $or: [{ orderNumber: id }, { orderNumber: altId }] };
    }

    const order = await ProductionOrder.findOne(query).lean();
    if (!order) {
      return res.status(404).json({ msg: "Production order not found" });
    }

    if (order.orderNumber && order.orderNumber.startsWith("PR-")) {
      const match = order.orderNumber.match(/^PR-(\d+)$/);
      order.orderNumber = match
        ? `PO-${String(parseInt(match[1], 10)).padStart(Math.max(3, String(parseInt(match[1], 10)).length), "0")}`
        : order.orderNumber.replace(/^PR-/, "PO-");
    }

    res.json(order);
  } catch (err) {
    console.error("Error getting production order:", err);
    res.status(500).json({ msg: "Failed to get production order", error: err.message });
  }
};

// POST /api/production-orders
exports.createProductionOrder = async (req, res) => {
  try {
    const companyId = req.body.company || req.body.companyId || req.query?.companyId || req.user?.company;
    if (!companyId) {
      return res.status(400).json({ msg: "Company ID is required" });
    }

    let orderNumber = req.body.orderNumber;
    if (!orderNumber || !orderNumber.trim()) {
      orderNumber = await generateNextOrderNumber(companyId);
    } else {
      // Check duplicate orderNumber within company
      const existing = await ProductionOrder.findOne({ company: companyId, orderNumber }).lean();
      if (existing) {
        orderNumber = await generateNextOrderNumber(companyId);
      } else {
        await syncSequenceNumber("PO", companyId, orderNumber);
      }
    }

    const plannedQty = Number(req.body.plannedQty) || 0;
    const conversionFactor = Number(req.body.conversionFactor) || 1;
    const plannedPcs = Number(req.body.plannedPcs) || (plannedQty * conversionFactor);
    const balanceQty = plannedQty;
    const balancePcs = plannedPcs;

    // Calculate dynamic costSummary if not fully provided
    let costSummary = req.body.costSummary || {};
    const bomItems = req.body.bomItems || [];
    const matCost = bomItems.reduce((acc, it) => acc + (Number(it.amount) || ((Number(it.totalRequired || it.qtyPerBatch || 0)) * (Number(it.rate) || 0))), 0);
    const addCosts = req.body.additionalCosts || [];
    const addCost = addCosts.reduce((acc, it) => {
      const amt = Number(it.amount) || 0;
      if (Number(it.totalAmount) > 0) {
        return acc + Number(it.totalAmount);
      }
      const basis = (it.calcBasis || it.basis || '').toLowerCase().trim();
      const applied = (it.appliedAs || '').toLowerCase().trim();

      if (basis === 'per bom' || applied === 'per bom' || (basis === 'per batch' && applied === 'per batch')) {
        const bomYield = Number(req.body.recipeYieldQty || req.body.batchYieldQty) || 1;
        const runs = plannedPcs > 0 && bomYield > 0 ? (plannedPcs / bomYield) : 1;
        return acc + (amt * runs);
      }

      const isBatch = basis.includes('batch') || basis.includes('total') || basis === 'fixed' || basis === 'lump sum' || applied.includes('total') || applied.includes('batch') || applied === 'fixed';
      if (isBatch) {
        return acc + amt;
      }
      if (basis === 'per gbl' || applied.includes('(gbl)')) {
        return acc + (amt * (plannedQty || 1));
      }
      if (basis === 'per piece' || applied.includes('(pcs)')) {
        return acc + (amt * (plannedPcs || 1));
      }
      return acc + amt;
    }, 0);
    const totalCost = Number(costSummary.totalProductionCost) > 0 ? Number(costSummary.totalProductionCost) : (matCost + addCost);
    const costPerGbl = plannedQty > 0 ? (totalCost / plannedQty) : 0;
    const costPerPiece = plannedPcs > 0 ? (totalCost / plannedPcs) : 0;

    costSummary = {
      materialCost: Number(costSummary.materialCost) || matCost,
      additionalCost: Number(costSummary.additionalCost) || addCost,
      totalProductionCost: totalCost,
      costPerGbl: Number(costSummary.costPerGbl) || Math.round(costPerGbl * 100) / 100,
      costPerPiece: Number(costSummary.costPerPiece) || Math.round(costPerPiece * 100) / 100,
      ...costSummary
    };

    const newOrder = new ProductionOrder({
      ...req.body,
      costSummary,
      orderNumber,
      plannedQty,
      conversionFactor,
      plannedPcs,
      producedQty: Number(req.body.producedQty) || 0,
      producedPcs: Number(req.body.producedPcs) || 0,
      balanceQty,
      balancePcs,
      progress: req.body.progress || 0,
      status: req.body.status || "Planned",
      company: companyId,
      createdBy: req.user?._id || req.user?.id
    });

    if (!newOrder.stockUpdates || newOrder.stockUpdates.length === 0) {
      newOrder.stockUpdates = [
        {
          item: newOrder.itemName,
          quantityIn: newOrder.plannedQty,
          uom: newOrder.plannedUom,
          location: newOrder.outputLocation || `${newOrder.factory || 'Main Factory'}`
        }
      ];
    }

    await newOrder.save();

    // Dynamically sync prepared stock in Item Stock & Inventory (only records if actually prepared/completed)
    await syncProductionOrderLedger(newOrder);

    // Broadcast live event to all connected users
    broadcast(companyId, {
      entity: "production_order",
      action: "create",
      id: newOrder._id,
      data: newOrder
    });

    res.status(201).json(newOrder);
  } catch (err) {
    console.error("Error creating production order:", err);
    res.status(500).json({ msg: "Failed to create production order", error: err.message });
  }
};

// PUT /api/production-orders/:id
exports.updateProductionOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await ProductionOrder.findById(id);
    if (!existing) {
      return res.status(404).json({ msg: "Production order not found" });
    }

    const updateData = { ...req.body };
    const plannedQty = updateData.plannedQty !== undefined ? Number(updateData.plannedQty) : existing.plannedQty;
    const plannedPcs = updateData.plannedPcs !== undefined ? Number(updateData.plannedPcs) : existing.plannedPcs;
    const producedQty = existing.producedQty || 0;
    const producedPcs = existing.producedPcs || 0;

    updateData.balanceQty = Math.max(0, plannedQty - producedQty);
    updateData.balancePcs = Math.max(0, plannedPcs - producedPcs);
    updateData.progress = Math.min(100, Math.round((producedPcs / (plannedPcs || 1)) * 100));

    const updated = await ProductionOrder.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    // Dynamically sync prepared stock in Item Stock & Inventory
    await syncProductionOrderLedger(updated);

    broadcast(updated.company, {
      entity: "production_order",
      action: "update",
      id: updated._id,
      data: updated
    });

    res.json(updated);
  } catch (err) {
    console.error("Error updating production order:", err);
    res.status(500).json({ msg: "Failed to update production order", error: err.message });
  }
};

// POST /api/production-orders/:id/entries
exports.recordProductionEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await ProductionOrder.findById(id);
    if (!order) {
      return res.status(404).json({ msg: "Production order not found" });
    }

    const enteredQty = Number(req.body.producedQty) || 0;
    const enteredUom = (req.body.producedUom || order.plannedUom || 'PCS').trim().toUpperCase();
    const orderUom = (order.plannedUom || 'PCS').trim().toUpperCase();
    const conversion = order.conversionFactor || 1;

    // Normalize to the order's planned UOM for producedQty, and always store PCS in producedPcs.
    // producedQty must be in the same unit as plannedQty for progress/balance calculations.
    let producedQty;   // in order's plannedUom (e.g. GBL)
    let producedPcs;   // always in PCS

    if (enteredUom === 'GBL' && orderUom === 'GBL') {
      // User entered GBL, order is GBL — direct
      producedQty = enteredQty;
      producedPcs = Math.round(enteredQty * conversion);
    } else if (enteredUom === 'PCS' && orderUom === 'GBL') {
      // User entered PCS but order is planned in GBL → convert PCS→GBL for producedQty
      producedQty = Math.round((enteredQty / conversion) * 10000) / 10000;
      producedPcs = enteredQty;
    } else if (enteredUom === 'GBL' && orderUom === 'PCS') {
      // User entered GBL but order is planned in PCS → convert GBL→PCS for producedQty
      producedQty = Math.round(enteredQty * conversion);
      producedPcs = Math.round(enteredQty * conversion);
    } else {
      // PCS→PCS (or any same-unit case)
      producedQty = enteredQty;
      producedPcs = enteredQty;
    }

    const remainingQty = Math.max(0, (order.plannedQty || 0) - (order.producedQty || 0));
    const remainingPcs = Math.max(0, (order.plannedPcs || 0) - (order.producedPcs || 0));

    // Prevent entries that exceed remaining required amount
    if (producedQty > remainingQty + 0.001 || producedPcs > remainingPcs) {
      return res.status(400).json({
        msg: `Produced quantity exceeds remaining required amount (${remainingQty} ${orderUom})`
      });
    }

    const newCumulativeQty = (order.producedQty || 0) + producedQty;
    const newCumulativePcs = (order.producedPcs || 0) + producedPcs;
    const newBalanceQty = Math.max(0, order.plannedQty - newCumulativeQty);
    const newBalancePcs = Math.max(0, order.plannedPcs - newCumulativePcs);

    const progress = Math.min(100, Math.round((newCumulativePcs / (order.plannedPcs || 1)) * 100));
    const newStatus = progress >= 100 ? "Completed" : "In Production";

    const dateStr = req.body.date || new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const operatorName = req.body.createdBy || req.user?.fullName || "Operator";

    const newEntry = {
      id: `entry-${Date.now()}`,
      date: dateStr,
      shift: req.body.shift || "Day Shift",
      producedQty,           // normalized to order's plannedUom
      producedUom: orderUom, // always stored in order's plannedUom for consistency
      producedPcs,           // always in PCS
      enteredQty,            // raw entered value (for display/audit)
      enteredUom,            // raw entered UOM (for display/audit)
      cumulativeQty: newCumulativeQty,
      cumulativePcs: newCumulativePcs,
      remarks: req.body.remarks || "-",
      createdBy: operatorName,
      createdAt: new Date().toISOString()
    };

    order.producedQty = newCumulativeQty;
    order.producedPcs = newCumulativePcs;
    order.balanceQty = newBalanceQty;
    order.balancePcs = newBalancePcs;
    order.progress = progress;
    order.status = newStatus;
    order.productionEntries.push(newEntry);

    if (progress >= 100) {
      const nowTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      order.actualCompletionDate = `${dateStr}, ${nowTime}`;
      order.completedBy = operatorName;

      if (!order.finishedGoodsBatch) {
        order.finishedGoodsBatch = {
          batchNo: `BATCH-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
          manufacturingDate: dateStr,
          expiryDate: "-",
          producedQuantity: `${newCumulativeQty} ${order.plannedUom} (${newCumulativePcs.toLocaleString()} PCS)`,
          receivedToLocation: `${order.factory} → Finished Goods - A1`,
          status: "In Stock",
          batchRemarks: "Produced as per plan."
        };
      }

      if (!order.stockUpdates || order.stockUpdates.length === 0) {
        order.stockUpdates = [
          {
            item: order.itemName,
            quantityIn: newCumulativeQty,
            uom: order.plannedUom,
            location: `${order.factory} Finished Goods - A1`
          }
        ];
      }
    }

    await order.save();

    // Dynamically sync prepared stock in Item Stock & Inventory according to production
    await syncProductionOrderLedger(order);

    broadcast(order.company, {
      entity: "production_order",
      action: "update",
      id: order._id,
      data: order
    });

    res.json(order);
  } catch (err) {
    console.error("Error recording production entry:", err);
    res.status(500).json({ msg: "Failed to record production entry", error: err.message });
  }
};

// PATCH /api/production-orders/:id/complete
exports.completeProductionOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await ProductionOrder.findById(id);
    if (!order) {
      return res.status(404).json({ msg: "Production order not found" });
    }

    const todayStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const nowTimeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const completedBy = req.body.completedBy || req.user?.fullName || "Operator";

    order.producedQty = order.plannedQty;
    order.producedPcs = order.plannedPcs;
    order.balanceQty = 0;
    order.balancePcs = 0;
    order.progress = 100;
    order.status = "Completed";
    order.actualCompletionDate = `${todayStr}, ${nowTimeStr}`;
    order.completedBy = completedBy;

    if (!order.finishedGoodsBatch) {
      order.finishedGoodsBatch = {
        batchNo: `BATCH-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        manufacturingDate: todayStr,
        expiryDate: "-",
        producedQuantity: `${order.plannedQty} ${order.plannedUom} (${order.plannedPcs.toLocaleString()} PCS)`,
        receivedToLocation: `${order.factory} → Finished Goods - A1`,
        status: "In Stock",
        batchRemarks: "Produced as per plan."
      };
    }

    if (!order.stockUpdates || order.stockUpdates.length === 0) {
      order.stockUpdates = [
        {
          item: order.itemName,
          quantityIn: order.plannedQty,
          uom: order.plannedUom,
          location: order.outputLocation || `${order.factory} Finished Goods - A1`
        }
      ];
    }

    await order.save();

    // Directly reflect completed production order in Item Stock & Inventory
    await syncProductionOrderLedger(order);

    broadcast(order.company, {
      entity: "production_order",
      action: "update",
      id: order._id,
      data: order
    });

    res.json(order);
  } catch (err) {
    console.error("Error completing production order:", err);
    res.status(500).json({ msg: "Failed to complete production order", error: err.message });
  }
};

// DELETE /api/production-orders/:id
exports.deleteProductionOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ProductionOrder.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ msg: "Production order not found" });
    }

    // Clean up corresponding inventory ledger entries
    await InventoryLedger.deleteMany({
      referenceType: "ProductionOrder",
      referenceId: deleted.orderNumber
    });

    broadcast(deleted.company, {
      entity: "production_order",
      action: "delete",
      id: deleted._id
    });

    res.json({ msg: "Production order deleted successfully", id });
  } catch (err) {
    console.error("Error deleting production order:", err);
    res.status(500).json({ msg: "Failed to delete production order", error: err.message });
  }
};

// POST /api/production-orders/material-rates
// Calculates 3 costing modes: 1. Avg of purchase batch orders, 2. FIFO (majority batch of material used), 3. Custom/Standard
exports.getMaterialRates = async (req, res) => {
  try {
    const { companyId, skuIds, items } = req.body;
    if (!companyId || (!Array.isArray(skuIds) && !Array.isArray(items))) {
      return res.json({ rates: {} });
    }

    const companyObjId = new mongoose.Types.ObjectId(companyId);

    // Resolve unique list of valid SKU ObjectIds
    const idSet = new Set();
    if (Array.isArray(skuIds)) {
      skuIds.forEach(id => {
        if (id && mongoose.Types.ObjectId.isValid(id)) idSet.add(String(id));
      });
    }
    if (Array.isArray(items)) {
      items.forEach(it => {
        if (it && it.skuId && mongoose.Types.ObjectId.isValid(it.skuId)) idSet.add(String(it.skuId));
      });
    }

    const validSkuIds = Array.from(idSet).map(id => new mongoose.Types.ObjectId(id));
    if (validSkuIds.length === 0) {
      return res.json({ rates: {} });
    }

    const skus = await SkuV2.find({
      _id: { $in: validSkuIds },
      company: companyObjId
    }).lean();

    const rates = {};

    for (const sku of skus) {
      const skuIdStr = String(sku._id);

      // Check if requirement item was provided for this SKU
      const itemInput = Array.isArray(items) ? items.find(it => String(it.skuId) === skuIdStr) : null;
      let reqQty = itemInput ? (Number(itemInput.requiredQty) || 0) : 0;

      // A SKU is manufactured if it is semi-finished or finished good (SM- or FG-)
      const isManufactured = (sku.itemType === 'semi' || sku.itemType === 'products') ||
                            (sku.skuCode && (sku.skuCode.toUpperCase().startsWith('SM-') || sku.skuCode.toUpperCase().startsWith('FG-')));

      const isRawMat = !isManufactured && (
        (sku.itemType === 'materials') || 
        (sku.skuCode && sku.skuCode.toUpperCase().startsWith('RM-')) || 
        (sku.category && /sheet|paper|reel/i.test(sku.category)) ||
        (sku.name && /sheet/i.test(sku.name))
      );

      if (reqQty > 0 && itemInput && itemInput.uom && sku.unit) {
        const inUom = itemInput.uom.trim().toLowerCase();
        const skuUnit = sku.unit.trim().toLowerCase();
        const altUnit = (sku.altUnit || '').trim().toLowerCase();
        const convFactor = Number(sku.altUnitConversion || sku.conv || sku.booksGbl || sku.pcsPerGbl || 1);

        // Never divide or convert raw materials using GBL conversion
        if (!isRawMat && inUom !== skuUnit && convFactor > 0) {
          if (inUom === altUnit || inUom === 'pcs' || inUom === 'pieces' || inUom === 'pc') {
            reqQty = reqQty / convFactor;
          } else if (skuUnit === 'pcs' || skuUnit === 'pieces' || skuUnit === 'pc') {
            reqQty = reqQty * convFactor;
          }
        }
      }

      // 1. Fetch active batches with true remaining onHand via FIFO
      const { batches: activeBatches, allBatches, allPurchasedItems, batchPriceMap } = await getActiveBatchesForSku(sku, companyObjId);

      // Check if this SKU was produced by any Production Order (for Semi-Finished or Finished Goods)
      let productionRate = 0;
      try {
        const prodOrders = await ProductionOrder.find({
          company: companyObjId,
          $or: [
            { itemId: sku._id },
            { itemCode: sku.skuCode },
            { itemName: sku.name }
          ],
          status: { $ne: "Cancelled" }
        }).sort({ createdAt: -1 }).lean();

        for (const po of prodOrders) {
          const cs = po.costSummary || {};
          const isGbl = (sku.unit || '').toUpperCase() === 'GBL' || (po.plannedUom || '').toUpperCase() === 'GBL';
          let unitRate = 0;
          if (isGbl && cs.costPerGbl && Number(cs.costPerGbl) > 0) {
            unitRate = Number(cs.costPerGbl);
          } else if (!isGbl && cs.costPerPiece && Number(cs.costPerPiece) > 0) {
            unitRate = Number(cs.costPerPiece);
          } else if (cs.totalProductionCost && Number(cs.totalProductionCost) > 0) {
            const divisor = isGbl ? (po.plannedQty || 1) : (po.plannedPcs || po.plannedQty || 1);
            unitRate = Number(cs.totalProductionCost) / divisor;
          }
          if (unitRate > 0) {
            productionRate = Math.round(unitRate * 100) / 100;
            break;
          }
        }
      } catch (e) {
        // Non-critical
      }

      // Also check if any active batches in batchBalances were generated from production orders
      for (const b of activeBatches) {
        if (b.batchNumber && !b.rate) {
          const po = await ProductionOrder.findOne({
            company: companyObjId,
            $or: [
              { orderNumber: b.batchNumber },
              { "finishedGoodsBatch.batchNo": b.batchNumber }
            ]
          }).lean();
          if (po) {
            const cs = po.costSummary || {};
            const isGbl = (sku.unit || '').toUpperCase() === 'GBL' || (po.plannedUom || '').toUpperCase() === 'GBL';
            let prodRate = 0;
            if (isGbl && cs.costPerGbl && Number(cs.costPerGbl) > 0) {
              prodRate = Number(cs.costPerGbl);
            } else if (!isGbl && cs.costPerPiece && Number(cs.costPerPiece) > 0) {
              prodRate = Number(cs.costPerPiece);
            } else if (cs.totalProductionCost && Number(cs.totalProductionCost) > 0) {
              const divisor = isGbl ? (po.plannedQty || 1) : (po.plannedPcs || po.plannedQty || 1);
              prodRate = Number(cs.totalProductionCost) / divisor;
            }
            if (prodRate > 0) {
              b.rate = Math.round(prodRate * 100) / 100;
            }
          } else {
            // Also check if batch is from a Cutting Slip (Paper Reel to Sheet conversion)
            const csSlip = await CuttingSlip.findOne({
              company: companyObjId,
              slipNumber: b.batchNumber,
              status: "Posted"
            }).lean();
            if (csSlip) {
              const skuUnitNorm = (sku.unit || '').trim().toLowerCase();
              const isReam = skuUnitNorm.includes('ream');
              const isPcs = skuUnitNorm === 'pcs' || skuUnitNorm === 'piece' || skuUnitNorm === 'pieces';
              const isGbl = skuUnitNorm === 'gbl';
              const convFactor = Number(sku.altUnitConversion || sku.conv || sku.booksGbl || sku.pcsPerGbl || 2500);

              const post4UpCost = Number(csSlip.costPer4UpPiece || (csSlip.effectiveCostPerSheet > 0 ? csSlip.effectiveCostPerSheet / 4 : 0));
              let csRate = post4UpCost;
              if (isReam) {
                csRate = csSlip.effectiveCostPerReam || (csSlip.effectiveCostPerSheet * (csSlip.sheetsPerReam || 500));
              } else if (isPcs) {
                // 4-UP PCS cost: Parent sheet cost / 4
                csRate = post4UpCost;
              } else if (isGbl) {
                // Rate in GBL: (Parent sheet cost / 4) * convFactor
                csRate = post4UpCost * (convFactor > 0 ? convFactor : 2500);
              }
              if (csRate > 0) {
                b.rate = Math.round(csRate * 10000) / 10000;
              }
            }
          }
        }
      }

      // Also check if this SKU was produced by any Cutting Slip (Reel-to-Sheet conversion)
      let cuttingSlipRate = 0;
      try {
        const lastSlip = await CuttingSlip.findOne({
          company: companyObjId,
          targetSku: sku._id,
          status: "Posted"
        }).sort({ createdAt: -1 }).lean();
        if (lastSlip && (lastSlip.effectiveCostPerSheet > 0 || lastSlip.costPer4UpPiece > 0)) {
          const skuUnitNorm = (sku.unit || '').trim().toLowerCase();
          const isReam = skuUnitNorm.includes('ream');
          const isPcs = skuUnitNorm === 'pcs' || skuUnitNorm === 'piece' || skuUnitNorm === 'pieces';
          const isGbl = skuUnitNorm === 'gbl';
          const convFactor = Number(sku.altUnitConversion || sku.conv || sku.booksGbl || sku.pcsPerGbl || 2500);
          const post4UpPieceCost = Number(lastSlip.costPer4UpPiece || (lastSlip.effectiveCostPerSheet > 0 ? lastSlip.effectiveCostPerSheet / 4 : 0));

          if (isReam) {
            cuttingSlipRate = lastSlip.effectiveCostPerReam || (lastSlip.effectiveCostPerSheet * (lastSlip.sheetsPerReam || 500));
          } else if (isPcs) {
            // 4-UP PCS cost: Parent sheet cost / 4
            cuttingSlipRate = Math.round(post4UpPieceCost * 10000) / 10000;
          } else if (isGbl) {
            // Rate in GBL: (Parent sheet cost / 4) * convFactor
            cuttingSlipRate = Math.round((post4UpPieceCost * (convFactor > 0 ? convFactor : 2500)) * 10000) / 10000;
          } else {
            cuttingSlipRate = post4UpPieceCost;
          }
        }
      } catch (e) {
        // Non-critical
      }

      const standardRate = Number(
        cuttingSlipRate ||
        sku.avgCost || 
        sku.costPrice || 
        sku.standardCost || 
        productionRate || 
        sku.purchasePrice || 
        sku.rate || 
        0
      );

      // FIFO: Allocate required quantity across active batches and pick rate of majority batch used
      const fifoResult = allocateFifoBatches(activeBatches, reqQty, standardRate);
      let fifoRate = fifoResult.fifoRate;
      let fifoBatchInfo = fifoResult.fifoBatchInfo;

      if (!fifoBatchInfo && allPurchasedItems.length > 0) {
        const latestPurchase = allPurchasedItems[allPurchasedItems.length - 1];
        fifoRate = latestPurchase.price || standardRate;
        fifoBatchInfo = {
          batchNumber: latestPurchase.invoiceNumber || 'PB-LAST',
          rate: fifoRate,
          majorityBatch: latestPurchase.invoiceNumber || 'PB-LAST',
          majorityRate: fifoRate,
          majorityQty: 0,
          weightedRate: fifoRate,
          summary: `Latest batch ${latestPurchase.invoiceNumber || 'PB-LAST'} (@ ₹${fifoRate})`,
          date: latestPurchase.date ? new Date(latestPurchase.date).toLocaleDateString('en-GB') : undefined,
          remainingQty: 0
        };
      }

      // Average of Purchase Batch Orders (Weighted Average of active batches)
      let avgRate = 0;
      let totalBatchQty = 0;
      let totalBatchValue = 0;

      if (activeBatches.length > 0) {
        activeBatches.forEach(b => {
          const bRate = b.rate > 0 ? b.rate : (standardRate || productionRate);
          if (bRate > 0) {
            totalBatchQty += b.remainingQty;
            totalBatchValue += (b.remainingQty * bRate);
          }
        });
        avgRate = totalBatchQty > 0 ? Math.round((totalBatchValue / totalBatchQty) * 10000) / 10000 : (standardRate || productionRate);
      } else if (allPurchasedItems.length > 0) {
        const sumQty = allPurchasedItems.reduce((s, it) => s + it.quantity, 0);
        const sumVal = allPurchasedItems.reduce((s, it) => s + (it.quantity * it.price), 0);
        avgRate = sumQty > 0 ? Math.round((sumVal / sumQty) * 10000) / 10000 : (standardRate || productionRate);
      } else {
        avgRate = standardRate || productionRate;
      }

      // 3. Fetch last-used rate from most recent production order that used this SKU as a material
      let lastProductionRate = 0;
      try {
        const lastPO = await ProductionOrder.findOne({
          company: companyObjId,
          "bomItems.skuId": sku._id.toString(),
          status: { $ne: "Cancelled" }
        }).sort({ createdAt: -1 }).select("bomItems orderNumber createdAt").lean();

        if (lastPO && Array.isArray(lastPO.bomItems)) {
          const matchedBomItem = lastPO.bomItems.find(b =>
            b.skuId && String(b.skuId) === skuIdStr
          );
          if (matchedBomItem) {
            lastProductionRate = Number(matchedBomItem.rate) || 0;
          }
        }
      } catch (e) {
        // Non-critical: silently ignore, fallback to 0
      }

      const effectiveRate = avgRate > 0 ? avgRate : (productionRate > 0 ? productionRate : (lastProductionRate > 0 ? lastProductionRate : standardRate));

      const skuStockingUnit = (isRawMat && ((sku.unit || '').toUpperCase() === 'GBL' || !sku.unit)) 
        ? 'PCS' 
        : (sku.unit || 'PCS');
      const skuAltUnit = isRawMat ? '' : (sku.altUnit || '');
      const skuConv = isRawMat ? 1 : Number(sku.altUnitConversion || sku.conv || sku.booksGbl || sku.pcsPerGbl || 1);

      // Target UOM present in the BOM (e.g. PCS, GBL, KG, Ream)
      const targetUom = (itemInput && itemInput.uom) ? itemInput.uom.trim().toUpperCase() : skuStockingUnit.toUpperCase();

      // Convert rate between stocking unit and BOM target UOM
      const convertRate = (rateVal, fromUom, toUom) => {
        if (!rateVal || rateVal <= 0 || !fromUom || !toUom) return rateVal || 0;
        const f = fromUom.trim().toUpperCase();
        const t = toUom.trim().toUpperCase();
        if (f === t) return rateVal;

        if (f === 'GBL' && (t === 'PCS' || (skuAltUnit && t === skuAltUnit.toUpperCase()))) {
          return skuConv > 0 ? Math.round((rateVal / skuConv) * 10000) / 10000 : rateVal;
        }
        if ((f === 'PCS' || (skuAltUnit && f === skuAltUnit.toUpperCase())) && t === 'GBL') {
          return skuConv > 0 ? Math.round((rateVal * skuConv) * 10000) / 10000 : rateVal;
        }
        return rateVal;
      };

      const finalStdRate = convertRate(standardRate || productionRate, skuStockingUnit, targetUom);
      const finalProdRate = convertRate(productionRate > 0 ? productionRate : 0, skuStockingUnit, targetUom);
      const finalAvgRate = convertRate(effectiveRate, skuStockingUnit, targetUom);
      const finalFifoRate = convertRate(fifoRate > 0 ? fifoRate : effectiveRate, skuStockingUnit, targetUom);
      const finalMajRate = convertRate(fifoResult.majorityRate, skuStockingUnit, targetUom);
      const finalWeightRate = convertRate(fifoResult.weightedRate, skuStockingUnit, targetUom);
      const finalLastProdRate = convertRate(lastProductionRate > 0 ? lastProductionRate : 0, skuStockingUnit, targetUom);

      rates[skuIdStr] = {
        skuId: skuIdStr,
        skuCode: sku.skuCode,
        skuName: sku.name,
        unit: targetUom,
        stockingUnit: skuStockingUnit,
        altUnit: skuAltUnit,
        altUnitConversion: skuConv,
        altUnitDirection: sku.altUnitDirection || 'PRIMARY_TO_ALT',
        standardRate: finalStdRate,
        productionRate: finalProdRate,
        avgRate: finalAvgRate,
        fifoRate: finalFifoRate,
        majorityBatch: fifoResult.majorityBatch,
        majorityRate: finalMajRate,
        majorityQty: fifoResult.majorityQty,
        weightedRate: finalWeightRate,
        fifoBatchInfo: fifoBatchInfo ? {
          ...fifoBatchInfo,
          rate: convertRate(fifoBatchInfo.rate, skuStockingUnit, targetUom),
          majorityRate: convertRate(fifoBatchInfo.majorityRate, skuStockingUnit, targetUom),
          weightedRate: convertRate(fifoBatchInfo.weightedRate, skuStockingUnit, targetUom),
          summary: `${fifoBatchInfo.majorityBatch || fifoBatchInfo.batchNumber} (@ ₹${convertRate(fifoBatchInfo.rate, skuStockingUnit, targetUom)}/${targetUom})`
        } : null,
        batchBalances: activeBatches.map(b => ({
          batchNumber: b.batchNumber,
          date: b.date ? new Date(b.date).toLocaleDateString('en-GB') : undefined,
          qtyIn: b.qtyIn,
          qtyOut: b.qtyOut,
          remainingQty: Math.round(b.remainingQty * 100) / 100,
          rate: convertRate(b.rate, skuStockingUnit, targetUom)
        })),
        batchCount: activeBatches.length || allPurchasedItems.length,
        lastProductionRate: finalLastProdRate
      };
    }

    res.json({ rates });
  } catch (err) {
    console.error("Error computing material rates:", err);
    res.status(500).json({ msg: "Failed to compute material rates", error: err.message });
  }
};

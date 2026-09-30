import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, Printer, Layers, Package, Plus, CheckCircle2, 
  Clock, IndianRupee, Box, Check, ExternalLink, AlertCircle, FileText, 
  RefreshCw, X, ShoppingCart, Eye, Trash2, Edit3, Calendar, Info,
  CheckCircle, Database, ChevronRight, Calculator
} from 'lucide-react';
import { ProductionOrder, ProductionBomItem, ProductionEntry } from '../../types/production';
import { formatOrderNo } from './productionUtils';
import { fetchStockCostings, resolveComponentCosting, StockCostingData } from '../../utils/inventoryCosting';
import { getSalesOrdersV2, SalesOrderV2 } from '../../api/salesOrderApiV2';
import { showToast } from '../ui/Toast';
import Modal from '../ui/Modal';
import { convertRateToUom, convertUom } from '../../utils/uomConversion';

interface ProductionOrderDetailViewProps {
  order: ProductionOrder;
  initialTab?: 'overview' | 'materials' | 'entries' | 'orders' | 'costing';
  onBack: () => void;
  onNewOrder: () => void;
  onRecordEntries: (order: ProductionOrder) => void;
  onPrint: (order: ProductionOrder) => void;
  onCompleteOrder?: (order: ProductionOrder) => void;
  onEdit?: (order: ProductionOrder) => void;
}

interface AdditionalCostItem {
  id: string;
  costType: string;
  basis: string;
  amount: number;
}

export const ProductionOrderDetailView: React.FC<ProductionOrderDetailViewProps> = ({
  order,
  initialTab = 'overview',
  onBack,
  onNewOrder,
  onRecordEntries,
  onPrint,
  onCompleteOrder,
  onEdit
}) => {
  // 5 Active Tabs (History tab removed as requested)
  const [activeTab, setActiveTab] = useState<'overview' | 'materials' | 'entries' | 'orders' | 'costing'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  
  // Dynamic Live Rates and Stock Costings
  const [stockCostings, setStockCostings] = useState<StockCostingData | null>(null);
  const [isRefreshingStock, setIsRefreshingStock] = useState(false);

  // User-edited custom rates for BOM items that don't have stock/purchase rates yet
  const [customRates, setCustomRates] = useState<Record<string, number>>({});

  // Dynamic Linked Sales Orders
  const [allSalesOrders, setAllSalesOrders] = useState<SalesOrderV2[]>([]);
  const [isLoadingSalesOrders, setIsLoadingSalesOrders] = useState(false);
  const [selectedPreviewSo, setSelectedPreviewSo] = useState<SalesOrderV2 | null>(null);

  // Modals
  const [isBomModalOpen, setIsBomModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [selectedStockComponent, setSelectedStockComponent] = useState<any | null>(null);
  const [isAddCostModalOpen, setIsAddCostModalOpen] = useState(false);

  // New Cost Form state
  const [newCostType, setNewCostType] = useState('');
  const [newCostBasis, setNewCostBasis] = useState(`Per ${order.plannedUom || 'Unit'} (${order.plannedQty || 0} ${order.plannedUom || 'Unit'})`);
  const [newCostAmount, setNewCostAmount] = useState<number | ''>('');

  // Fetch dynamic live rates and stocks from Inventory modules
  const loadStockCostings = async () => {
    const cId = order.company || (order as any).companyId;
    if (cId) {
      setIsRefreshingStock(true);
      try {
        const res = await fetchStockCostings(String(cId));
        setStockCostings(res);
      } catch (err) {
        console.error('Failed to load stock costings:', err);
      } finally {
        setIsRefreshingStock(false);
      }
    }
  };

  useEffect(() => {
    loadStockCostings();
  }, [order.company]);

  // Fetch sales orders for company to dynamically link
  useEffect(() => {
    const cId = order.company || (order as any).companyId;
    if (cId) {
      setIsLoadingSalesOrders(true);
      getSalesOrdersV2(String(cId))
        .then(res => setAllSalesOrders(res || []))
        .catch(err => {
          console.error('Failed to fetch sales orders for linking:', err);
          setAllSalesOrders([]);
        })
        .finally(() => setIsLoadingSalesOrders(false));
    }
  }, [order.company]);

  // Dynamic conversion factor and pieces
  const conversionFactor = order.conversionFactor || 1;
  const isGbl = (order.plannedUom || '').toUpperCase() === 'GBL';
  const plannedPcs = order.plannedPcs || (isGbl ? Math.round((order.plannedQty || 0) * conversionFactor) : (order.plannedQty || 0));
  const producedPcs = order.producedPcs || (isGbl ? Math.round((order.producedQty || 0) * conversionFactor) : (order.producedQty || 0));
  const balanceQty = order.balanceQty !== undefined 
    ? order.balanceQty 
    : Math.max(0, (order.plannedQty || 0) - (order.producedQty || 0));
  const balancePcs = order.balancePcs !== undefined 
    ? order.balancePcs 
    : Math.max(0, plannedPcs - producedPcs);

  const progressPercent = order.plannedQty > 0 
    ? Math.min(100, Math.round(((order.producedQty || 0) / order.plannedQty) * 100))
    : (order.progress || 0);

  // Compute dynamic BOM item costings and live stock from Stock & Inventory
  // Sanitize units to ensure raw materials/components don't display irregular units like GBL
  const resolvedBomItems = useMemo(() => {
    return (order.bomItems || []).map((item, idx) => {
      const costing = resolveComponentCosting({
        skuId: (item as any).skuId,
        skuCode: (item as any).skuCode || item.code,
        code: item.code,
        name: (item as any).name || item.component,
        component: item.component,
        rate: item.rate,
        availableStock: item.availableStock
      }, stockCostings);

      // Determine true unit:
      // Respect order's item.uom. If item.uom was erroneously saved as GBL when AUOM is PCS, resolve as PCS.
      const skuUnit = costing.sku?.unit || (costing.sku as any)?.uom || 'PCS';
      const skuAltUnit = costing.sku?.altUnit || (item as any).auom || (item as any).altUnit || '';

      let effectiveUom = item.uom || skuUnit || 'PCS';
      if (effectiveUom === 'GBL' && (skuAltUnit === 'PCS' || (item as any).auom === 'PCS' || (item as any).altUnit === 'PCS')) {
        effectiveUom = 'PCS';
      }

      // Check if user has entered an inline rate edit
      const itemId = item.id || `bom-item-${idx}`;
      const userEditedRate = customRates[itemId];

      // Resolve live rate:
      // 1. User edited rate
      // 2. Dynamic FIFO / average purchase invoice rate from inventoryCosting
      // 3. SKU master base price / valuation rate
      // 4. Saved order item rate
      let dynamicRate = 0;
      if (userEditedRate !== undefined && userEditedRate >= 0) {
        dynamicRate = userEditedRate;
      } else if (costing.rate > 0) {
        dynamicRate = costing.rate;
      } else {
        const skuMasterRate = Number(
          costing.sku?.valuationRate ||
          (costing.sku as any)?.purchasePrice ||
          (costing.sku as any)?.avgRate ||
          (costing.sku as any)?.costPrice ||
          (costing.sku as any)?.rate ||
          item.rate ||
          0
        );
        dynamicRate = skuMasterRate > 0 ? skuMasterRate : 0;
      }

      // Convert dynamic rate from SKU's stocking unit to effectiveUom if different:
      // e.g. if costing.rate is ₹166.40/GBL and effectiveUom is PCS (400 PCS/GBL), dynamicRate becomes ₹0.416/PCS
      if (userEditedRate === undefined && dynamicRate > 0 && effectiveUom && skuUnit) {
        dynamicRate = convertRateToUom(dynamicRate, skuUnit, effectiveUom, costing.sku);
      }

      // Calculate dynamic amount: totalRequired * dynamicRate
      const totalReq = Number(item.totalRequired) || 0;
      const dynamicAmount = Math.round(totalReq * dynamicRate * 100) / 100;

      // Convert available stock to effectiveUom for accurate shortage/ready evaluation
      const rawStock = costing.availableStock;
      const dynamicStock = (effectiveUom && skuUnit && effectiveUom.toLowerCase() !== skuUnit.toLowerCase())
        ? convertUom(rawStock, skuUnit, effectiveUom, costing.sku)
        : rawStock;

      const reservedQty = Math.min(dynamicStock, totalReq);
      const shortageQty = Math.max(0, totalReq - dynamicStock);

      let status: 'Ready' | 'Partial' | 'Shortage' = 'Ready';
      if (shortageQty > 0) {
        status = dynamicStock > 0 ? 'Partial' : 'Shortage';
      }

      return {
        ...item,
        id: itemId,
        uom: effectiveUom,
        dynamicRate,
        dynamicAmount,
        dynamicStock,
        reservedQty,
        shortageQty,
        status,
        costingSource: costing.source
      };
    });
  }, [order.bomItems, stockCostings, customRates]);

  // Readiness counts
  const readyCount = useMemo(() => resolvedBomItems.filter(i => i.status === 'Ready').length, [resolvedBomItems]);
  const partialCount = useMemo(() => resolvedBomItems.filter(i => i.status === 'Partial').length, [resolvedBomItems]);
  const shortageCount = useMemo(() => resolvedBomItems.filter(i => i.status === 'Shortage').length, [resolvedBomItems]);

  const overallReadinessStatus: 'Ready' | 'Partial' | 'Shortage' = useMemo(() => {
    if (resolvedBomItems.length === 0) return 'Ready';
    if (shortageCount === 0 && partialCount === 0) return 'Ready';
    if (readyCount > 0 || partialCount > 0) return 'Partial';
    return 'Shortage';
  }, [resolvedBomItems.length, readyCount, partialCount, shortageCount]);

  // Compute dynamic total material cost (A)
  const totalMaterialCost = useMemo(() => {
    return resolvedBomItems.reduce((acc, curr) => acc + (curr.dynamicAmount || 0), 0);
  }, [resolvedBomItems]);

  // Additional Costs (B) - STRICTLY DYNAMIC FROM ORDER, NO FAKE DEFAULT ROWS
  const [additionalCostsList, setAdditionalCostsList] = useState<AdditionalCostItem[]>(() => {
    if (order.additionalCosts && Array.isArray(order.additionalCosts) && order.additionalCosts.length > 0) {
      return order.additionalCosts.map((c, i) => ({
        id: c.id || `cost-${i + 1}`,
        costType: c.costType,
        basis: c.basis,
        amount: c.amount || c.totalAmount || 0
      }));
    }
    // Return empty list if order has no additional costs recorded
    return [];
  });

  const totalAdditionalCost = useMemo(() => {
    return additionalCostsList.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [additionalCostsList]);

  // Total Production Cost (A + B)
  const totalProductionCost = totalMaterialCost + totalAdditionalCost;
  const costPerUom = order.plannedQty > 0 ? (totalProductionCost / order.plannedQty) : 0;
  const costPerPcs = plannedPcs > 0 ? (totalProductionCost / plannedPcs) : 0;

  // Dynamic Linked Sales Orders Filter
  const linkedSalesOrders = useMemo(() => {
    if (!allSalesOrders || allSalesOrders.length === 0) return [];
    const orderNo = (order.orderNumber || '').toLowerCase().trim();
    const ref = (order.reference || '').toLowerCase().trim();
    const refId = String(order.referenceSalesOrderId || '');
    const poSku = (order.itemCode || '').toLowerCase().trim();
    const poName = (order.itemName || '').toLowerCase().trim();

    return allSalesOrders.filter(so => {
      const soId = String(so._id || (so as any).id || '');
      const soNum = (so.orderNumber || '').toLowerCase().trim();

      // Direct ID or Reference match
      if (refId && (refId === soId || refId === soNum)) return true;
      if (ref && (ref.includes(soNum) || soNum.includes(ref))) return true;

      // SKU / Item match in sales order line items
      const hasMatchingItem = (so.items || []).some(item => {
        const itemSku = (item.skuCode || '').toLowerCase().trim();
        const itemName = (item.itemName || '').toLowerCase().trim();
        return (poSku && itemSku === poSku) || (poName && itemName === poName);
      });

      return hasMatchingItem;
    }).map(so => {
      // Find matching item details for this PO
      const matchItem = (so.items || []).find(item => {
        const itemSku = (item.skuCode || '').toLowerCase().trim();
        const itemName = (item.itemName || '').toLowerCase().trim();
        return (poSku && itemSku === poSku) || (poName && itemName === poName);
      }) || so.items?.[0];

      const orderedQty = matchItem?.quantity || 0;
      const pcsFactor = matchItem?.pcsPerGbl || matchItem?.altUnitConversion || conversionFactor;
      const orderedPcs = matchItem?.gbl ? Math.round(orderedQty * pcsFactor) : orderedQty;
      const dispatchedQty = matchItem?.dispatchedQty || 0;
      const dispatchedPcs = Math.round(dispatchedQty * pcsFactor);
      const pendingQty = Math.max(0, orderedQty - dispatchedQty);
      const pendingPcs = Math.max(0, orderedPcs - dispatchedPcs);
      const allocationQty = pendingQty;
      const allocationPcs = pendingPcs;

      let fulfilmentStatus = 'Awaiting Production';
      if (dispatchedQty >= orderedQty && orderedQty > 0) {
        fulfilmentStatus = 'Fully Dispatched';
      } else if (dispatchedQty > 0) {
        fulfilmentStatus = 'Partially Dispatched';
      }

      return {
        ...so,
        matchItem,
        orderedQty,
        orderedPcs,
        dispatchedQty,
        dispatchedPcs,
        pendingQty,
        pendingPcs,
        allocationQty,
        allocationPcs,
        fulfilmentStatus
      };
    });
  }, [allSalesOrders, order.orderNumber, order.reference, order.referenceSalesOrderId, order.itemCode, order.itemName, conversionFactor]);

  // Dynamic Selling & Profit Reference
  // Derives from:
  // 1. Linked sales order unitPrice if available
  // 2. order.costSummary?.sellingRate
  // 3. Or 0 if not set, allowing user to dynamically input
  const defaultSellingRate = useMemo(() => {
    const linkedSoPrice = linkedSalesOrders[0]?.matchItem?.unitPrice;
    if (linkedSoPrice && linkedSoPrice > 0) {
      return linkedSoPrice;
    }
    if (order.costSummary?.costPerGbl && order.costSummary.costPerGbl > 0) {
      return Math.round(order.costSummary.costPerGbl * 1.2);
    }
    if (costPerUom > 0) {
      return Math.round(costPerUom * 1.2);
    }
    return 0;
  }, [linkedSalesOrders, order.costSummary?.costPerGbl, costPerUom]);

  const [sellingRate, setSellingRate] = useState<number | ''>(defaultSellingRate || '');

  useEffect(() => {
    if (defaultSellingRate > 0 && (!sellingRate || sellingRate === 0)) {
      setSellingRate(defaultSellingRate);
    }
  }, [defaultSellingRate]);

  const numericSellingRate = Number(sellingRate) || 0;
  const totalSellingValue = (order.plannedQty || 0) * numericSellingRate;
  const profitPerUom = numericSellingRate > 0 ? (numericSellingRate - costPerUom) : 0;
  const profitMargin = (totalSellingValue > 0 && totalProductionCost > 0)
    ? ((totalSellingValue - totalProductionCost) / totalSellingValue) * 100 
    : 0;

  // Add Additional Cost Handler
  const handleAddAdditionalCost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCostType.trim() || Number(newCostAmount) <= 0) {
      showToast('Please enter a valid cost type and amount', 'error');
      return;
    }
    const newEntry: AdditionalCostItem = {
      id: `cost-${Date.now()}`,
      costType: newCostType.trim(),
      basis: newCostBasis.trim() || 'Lump Sum',
      amount: Number(newCostAmount)
    };
    setAdditionalCostsList(prev => [...prev, newEntry]);
    setNewCostType('');
    setNewCostAmount('');
    setIsAddCostModalOpen(false);
    showToast('Additional cost added successfully', 'success');
  };

  const handleDeleteAdditionalCost = (id: string) => {
    setAdditionalCostsList(prev => prev.filter(c => c.id !== id));
  };

  // Linked Orders Aggregates
  const totalLinkedDemand = useMemo(() => {
    return linkedSalesOrders.reduce((acc, so) => acc + (so.orderedQty || 0), 0);
  }, [linkedSalesOrders]);

  const totalLinkedDemandPcs = useMemo(() => {
    return linkedSalesOrders.reduce((acc, so) => acc + (so.orderedPcs || 0), 0);
  }, [linkedSalesOrders]);

  const totalAlreadyDispatched = useMemo(() => {
    return linkedSalesOrders.reduce((acc, so) => acc + (so.dispatchedQty || 0), 0);
  }, [linkedSalesOrders]);

  const totalPendingDemand = useMemo(() => {
    return linkedSalesOrders.reduce((acc, so) => acc + (so.pendingQty || 0), 0);
  }, [linkedSalesOrders]);

  const totalAllocated = useMemo(() => {
    return linkedSalesOrders.reduce((acc, so) => acc + (so.allocationQty || 0), 0);
  }, [linkedSalesOrders]);

  // Production Entries dynamic processing (cumulative and balance)
  const processedProductionEntries = useMemo(() => {
    let runningCumQty = 0;
    let runningCumPcs = 0;
    const entries = order.productionEntries || [];

    return entries.map((entry, idx) => {
      const q = entry.producedQty || 0;
      const p = entry.producedPcs || (isGbl ? Math.round(q * conversionFactor) : q);
      runningCumQty += q;
      runningCumPcs += p;
      const balQty = Math.max(0, (order.plannedQty || 0) - runningCumQty);
      const balPcs = Math.max(0, plannedPcs - runningCumPcs);

      return {
        ...entry,
        entryIndex: idx + 1,
        entryNo: (entry as any).entryNo || (entry.id?.startsWith('PE-') ? entry.id : `PE-${String(idx + 1).padStart(4, '0')}`),
        calcCumulativeQty: runningCumQty,
        calcCumulativePcs: runningCumPcs,
        calcBalanceQty: balQty,
        calcBalancePcs: balPcs,
        outputLocation: (entry as any).outputLocation || order.outputLocation || `${order.factory || 'Factory 1'} Finished Goods`,
        loggedBy: entry.createdBy || (entry as any).operator || 'Operator'
      };
    });
  }, [order.productionEntries, order.plannedQty, plannedPcs, isGbl, conversionFactor, order.outputLocation, order.factory]);

  const totalProducedFromEntries = useMemo(() => {
    return processedProductionEntries.reduce((acc, e) => acc + (e.producedQty || 0), 0);
  }, [processedProductionEntries]);

  const totalProducedPcsFromEntries = useMemo(() => {
    return processedProductionEntries.reduce((acc, e) => acc + (e.producedPcs || 0), 0);
  }, [processedProductionEntries]);

  const remainingQtyFromEntries = Math.max(0, (order.plannedQty || 0) - totalProducedFromEntries);
  const remainingPcsFromEntries = Math.max(0, plannedPcs - totalProducedPcsFromEntries);
  const lastProductionDate = processedProductionEntries.length > 0
    ? processedProductionEntries[processedProductionEntries.length - 1].date
    : 'None';

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      } else if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        onRecordEntries(order);
      } else if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        onPrint(order);
      } else if (e.altKey && (e.key === '1')) {
        e.preventDefault();
        setActiveTab('overview');
      } else if (e.altKey && (e.key === '2')) {
        e.preventDefault();
        setActiveTab('materials');
      } else if (e.altKey && (e.key === '3')) {
        e.preventDefault();
        setActiveTab('entries');
      } else if (e.altKey && (e.key === '4')) {
        e.preventDefault();
        setActiveTab('orders');
      } else if (e.altKey && (e.key === '5')) {
        e.preventDefault();
        setActiveTab('costing');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [order, onBack, onRecordEntries, onPrint]);

  // Clean date and time formatters
  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr?: string): string => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      let hours = d.getHours();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
    } catch {
      return dateStr;
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'In Production':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">In Production</span>;
      case 'Completed':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Completed</span>;
      case 'Cancelled':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">Cancelled</span>;
      case 'Planned':
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">Planned</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/60 overflow-hidden font-sans">
      {/* ── HEADER BAR ── */}
      <div className="bg-white border-b border-gray-200/90 px-5 py-3 shrink-0 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left Title & Order Meta */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-2xs shrink-0">
              <FileText className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-gray-900 tracking-tight font-mono">
                  {formatOrderNo(order.orderNumber)}
                </h1>
                {getStatusBadge(order.status)}
              </div>
              <h2 className="text-xs font-bold text-gray-900 mt-0.5">
                {order.itemName}
              </h2>
              <p className="text-[11px] text-gray-500 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>SKU: <strong className="text-gray-700 font-mono">{order.itemCode || 'FG-002'}</strong></span>
                <span className="text-gray-300">|</span>
                <span>Type: <strong className="text-gray-700">{order.itemType}</strong></span>
                <span className="text-gray-300">|</span>
                <span>Department: <strong className="text-gray-700">{order.department || 'Notebook Manufacturing'}</strong></span>
              </p>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => onEdit ? onEdit(order) : showToast('Order details are active', 'info')}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs"
            >
              <Edit3 className="w-3.5 h-3.5 text-gray-500" />
              <span>Edit</span>
            </button>

            <button
              onClick={() => onPrint(order)}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-gray-500" />
              <span>Print</span>
            </button>

            <button
              onClick={() => onRecordEntries(order)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm hover:shadow transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Add Production Entry</span>
            </button>

            <button
              onClick={onBack}
              title="Close (Esc)"
              className="w-7 h-7 rounded-lg border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors cursor-pointer ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── 5 TABS NAVIGATION (History Tab Removed) ── */}
      <div className="bg-white border-b border-gray-200 px-5 shrink-0 flex items-center space-x-5 overflow-x-auto custom-scrollbar text-xs font-semibold">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'materials', label: 'Materials' },
          { id: 'entries', label: 'Production Entries' },
          { id: 'orders', label: 'Linked Sales Orders' },
          { id: 'costing', label: 'Costing' }
        ].map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                active 
                  ? 'border-blue-600 text-blue-600 font-bold'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── MAIN CONTENT CONTAINER (SCROLLABLE) ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 max-w-6xl mx-auto w-full space-y-5">

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB 1: OVERVIEW (3x2 Clean Cards Grid)                       */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Card 1: Production Summary */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs mb-3">
                  <Package className="w-4 h-4 text-blue-600 stroke-[2.2]" />
                  <span>Production Summary</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Planned Quantity</span>
                    <span className="font-bold text-gray-900 font-mono">
                      {order.plannedQty} {order.plannedUom} {isGbl && plannedPcs > 0 && <span className="text-gray-500 font-normal">({plannedPcs.toLocaleString()} PCS)</span>}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Produced Quantity</span>
                    <span className="font-bold text-gray-900 font-mono">
                      {order.producedQty || 0} {order.plannedUom} {isGbl && producedPcs > 0 && <span className="text-gray-500 font-normal">({producedPcs.toLocaleString()} PCS)</span>}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Balance Quantity</span>
                    <span className="font-bold text-gray-900 font-mono">
                      {balanceQty} {order.plannedUom} {isGbl && balancePcs > 0 && <span className="text-gray-500 font-normal">({balancePcs.toLocaleString()} PCS)</span>}
                    </span>
                  </div>

                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 font-medium">Progress</span>
                      <span className="font-bold text-gray-800 font-mono">{progressPercent}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-gray-500 font-medium">Status</span>
                    {getStatusBadge(order.status)}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Required By</span>
                    <span className="font-semibold text-gray-900 font-mono">
                      {formatDate(order.requiredCompletionDate)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Demand Source */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs mb-3">
                  <ShoppingCart className="w-4 h-4 text-blue-600 stroke-[2.2]" />
                  <span>Demand Source</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="font-bold text-gray-900">
                    {linkedSalesOrders.length > 0 
                      ? `Sales Demand • ${linkedSalesOrders.length} Orders`
                      : (order.reference && order.reference !== 'Not Selected'
                          ? `Sales Order Demand • 1 Order`
                          : 'Buffer / Warehouse Stock Demand')}
                  </div>
                  <p className="text-gray-500 text-[11px] leading-relaxed">
                    {linkedSalesOrders.length > 0
                      ? 'This production order is created from multiple pending sales orders for this item.'
                      : (order.reference && order.reference !== 'Not Selected'
                          ? `This production order is created to fulfil customer sales order ${order.reference}.`
                          : 'This production order is created to replenish finished goods warehouse stock buffer.')}
                  </p>

                  <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-2.5 flex items-center justify-between mt-2">
                    <span className="text-xs font-semibold text-gray-700">Total Demand</span>
                    <span className="text-xs font-bold text-blue-700 font-mono">
                      {linkedSalesOrders.length > 0 ? totalLinkedDemand : order.plannedQty} {order.plannedUom}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 mt-3">
                <button
                  onClick={() => setActiveTab('orders')}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center justify-between w-full group cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                    <span>View Linked Orders</span>
                  </span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* Card 3: Material Readiness */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs">
                    <Box className="w-4 h-4 text-blue-600 stroke-[2.2]" />
                    <span>Material Readiness</span>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    overallReadinessStatus === 'Ready'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : overallReadinessStatus === 'Partial'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {overallReadinessStatus}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Total Components</span>
                    <span className="font-bold text-gray-900 font-mono">{resolvedBomItems.length}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Ready</span>
                    <span className="font-bold text-emerald-600 font-mono">{readyCount}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Partial</span>
                    <span className="font-bold text-amber-600 font-mono">{partialCount}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Shortage</span>
                    <span className="font-bold text-rose-600 font-mono">{shortageCount}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 mt-3">
                <button
                  onClick={() => setActiveTab('materials')}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center justify-between w-full group cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Box className="w-3.5 h-3.5 text-blue-500" />
                    <span>View Materials</span>
                  </span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* Card 4: Production Schedule */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs mb-3">
                  <Calendar className="w-4 h-4 text-blue-600 stroke-[2.2]" />
                  <span>Production Schedule</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Planned Start Date</span>
                    <span className="font-semibold text-gray-900 font-mono">
                      {formatDate(order.plannedStartDate)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Required By Date</span>
                    <span className="font-semibold text-gray-900 font-mono">
                      {formatDate(order.requiredCompletionDate)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Department</span>
                    <span className="font-semibold text-gray-900">{order.department || 'Notebook Manufacturing'}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Priority</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      order.priority === 'Urgent'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : order.priority === 'High'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {order.priority || 'Normal'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 5: Cost Snapshot (Estimated) */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs mb-3">
                  <Calculator className="w-4 h-4 text-blue-600 stroke-[2.2]" />
                  <span>Cost Snapshot <span className="text-gray-400 font-normal text-[11px]">(Estimated)</span></span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Estimated Cost / {order.plannedUom || 'Unit'}</span>
                    <span className="font-bold text-gray-900 font-mono">
                      ₹{costPerUom.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {isGbl && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 font-medium">Estimated Cost / PCS</span>
                      <span className="font-bold text-gray-900 font-mono">
                        ₹{costPerPcs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 bg-blue-50/70 border border-blue-100 rounded-xl p-2.5 flex items-start gap-2 text-[11px] text-blue-800">
                <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  Cost is calculated from BOM & active purchase inventory rates.
                </p>
              </div>
            </div>

            {/* Card 6: Activity */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs mb-3">
                  <Clock className="w-4 h-4 text-blue-600 stroke-[2.2]" />
                  <span>Activity</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Created On</span>
                    <span className="font-semibold text-gray-900 font-mono">
                      {formatDateTime(order.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Created By</span>
                    <span className="font-semibold text-gray-900">
                      {order.createdBy || (order as any).operator || 'Admin'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Last Updated On</span>
                    <span className="font-semibold text-gray-900 font-mono">
                      {formatDateTime(order.updatedAt || order.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Last Updated By</span>
                    <span className="font-semibold text-gray-900">
                      {order.updatedBy || order.createdBy || 'Admin'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB 2: MATERIALS (From BOM, Live Stock, Summary Banner)        */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'materials' && (
          <div className="space-y-5">
            {/* Header with Title and 3 Action Buttons */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  Material Requirements — From BOM
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Materials required for {order.plannedQty} {order.plannedUom} of {order.itemName}.
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={loadStockCostings}
                  disabled={isRefreshingStock}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshingStock ? 'animate-spin' : ''}`} />
                  <span>Recalculate</span>
                </button>

                <button
                  onClick={() => setIsStockModalOpen(true)}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs"
                >
                  <Database className="w-3 h-3" />
                  <span>Check Stock</span>
                </button>

                <button
                  onClick={() => setIsBomModalOpen(true)}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>View BOM</span>
                </button>
              </div>
            </div>

            {/* Materials Table */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50/70 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-8 text-center">#</th>
                      <th className="py-2.5 px-3">Material / Component</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Required Qty</th>
                      <th className="py-2.5 px-3">UOM</th>
                      <th className="py-2.5 px-3">Available Qty</th>
                      <th className="py-2.5 px-3">Reserved Qty</th>
                      <th className="py-2.5 px-3">Shortage Qty</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {resolvedBomItems.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-gray-400">
                          <Box className="w-6 h-6 text-gray-300 mx-auto mb-1.5" />
                          <p className="font-semibold text-gray-700">No BOM items defined for this production order.</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">Edit this order or assign a recipe in SKU Master.</p>
                        </td>
                      </tr>
                    ) : (
                      resolvedBomItems.map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-2.5 px-3 text-center font-semibold text-gray-500">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-semibold text-gray-900">
                            <div>{item.component}</div>
                            {item.code && <div className="text-[10px] text-gray-400 font-mono">{item.code}</div>}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              item.type === 'Semi'
                                ? 'bg-sky-50 text-sky-700 border border-sky-200/60'
                                : item.type === 'Finished'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            }`}>
                              {item.type === 'Semi' ? 'Semi-Finished' : item.type === 'Finished' ? 'Finished Good' : 'Raw Material'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-gray-900 font-mono">
                            {item.totalRequired.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-gray-600 font-medium">{item.uom}</td>
                          <td className="py-2.5 px-3 font-semibold text-gray-800 font-mono">
                            {item.dynamicStock.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-gray-800 font-mono">
                            {item.reservedQty.toLocaleString()}
                          </td>
                          <td className={`py-2.5 px-3 font-mono font-bold ${item.shortageQty > 0 ? 'text-rose-600 font-black' : 'text-gray-500'}`}>
                            {item.shortageQty.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.status === 'Ready'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.status === 'Partial'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center space-x-1.5">
                              <button
                                onClick={() => {
                                  setSelectedStockComponent(item);
                                  setIsStockModalOpen(true);
                                }}
                                title="Inspect component stock & batches"
                                className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <a
                                href={`/inventory-v2/skus?search=${encodeURIComponent(item.code || item.component)}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Open in Inventory SKU Master"
                                className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Material Requirement Summary Banner */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-2xs shrink-0">
                  <Box className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Material Requirement Summary
                  </h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    For {order.plannedQty} {order.plannedUom} production order.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-6 shrink-0">
                <div>
                  <span className="text-[11px] text-gray-500 font-medium block">Total Components</span>
                  <span className="text-base font-black text-gray-900 font-mono mt-0.5 block">{resolvedBomItems.length}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-500 font-medium block">Fully Available</span>
                  <span className="text-base font-black text-emerald-600 font-mono mt-0.5 block">{readyCount}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-500 font-medium block">Partial</span>
                  <span className="text-base font-black text-amber-600 font-mono mt-0.5 block">{partialCount}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-500 font-medium block">Shortage</span>
                  <span className="text-base font-black text-rose-600 font-mono mt-0.5 block">{shortageCount}</span>
                </div>
              </div>

              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-2.5 flex items-start gap-2 text-[11px] text-blue-800 lg:max-w-xs">
                <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  Stock availability dynamically verified against active warehouse inventory.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB 3: PRODUCTION ENTRIES (Entries Table, Summary Banner)     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'entries' && (
          <div className="space-y-5">
            {/* Header with Title and Add Button */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-blue-600 stroke-[2.2]" />
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Production Entries</h3>
              </div>

              <button
                onClick={() => onRecordEntries(order)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors cursor-pointer self-start md:self-auto"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add Production Entry</span>
              </button>
            </div>

            {/* Entries Table */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50/70 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-8 text-center">#</th>
                      <th className="py-2.5 px-3">Entry No.</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Shift</th>
                      <th className="py-2.5 px-3">Produced Qty ({order.plannedUom})</th>
                      {isGbl && <th className="py-2.5 px-3">Produced PCS</th>}
                      <th className="py-2.5 px-3">Cumulative ({order.plannedUom})</th>
                      <th className="py-2.5 px-3">Balance ({order.plannedUom})</th>
                      <th className="py-2.5 px-3">Output Location</th>
                      <th className="py-2.5 px-3">Logged By</th>
                      <th className="py-2.5 px-3">Remarks</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {processedProductionEntries.length === 0 ? (
                      <tr>
                        <td colSpan={isGbl ? 12 : 11} className="py-10 text-center text-gray-400">
                          <Package className="w-7 h-7 text-gray-300 mx-auto mb-1.5" />
                          <p className="font-semibold text-gray-700">No production entries recorded yet.</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">Click "+ Add Production Entry" above to log output.</p>
                        </td>
                      </tr>
                    ) : (
                      processedProductionEntries.map((entry, idx) => (
                        <tr key={entry.id || idx} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-2.5 px-3 text-center font-semibold text-gray-500">{entry.entryIndex}</td>
                          <td className="py-2.5 px-3 font-bold text-blue-600 font-mono whitespace-nowrap">
                            {entry.entryNo}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-gray-800 whitespace-nowrap">
                            {formatDate(entry.date)}
                          </td>
                          <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">
                            {entry.shift || 'Day Shift'}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-gray-900 font-mono whitespace-nowrap">
                            {entry.producedQty} {order.plannedUom}
                          </td>
                          {isGbl && (
                            <td className="py-2.5 px-3 font-semibold text-gray-700 font-mono whitespace-nowrap">
                              {(entry.producedPcs || Math.round(entry.producedQty * conversionFactor)).toLocaleString()} PCS
                            </td>
                          )}
                          <td className="py-2.5 px-3 font-bold text-gray-900 font-mono whitespace-nowrap">
                            {entry.calcCumulativeQty} {order.plannedUom}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-gray-900 font-mono whitespace-nowrap">
                            {entry.calcBalanceQty} {order.plannedUom}
                          </td>
                          <td className="py-2.5 px-3 text-gray-700 font-medium whitespace-nowrap">
                            {entry.outputLocation}
                          </td>
                          <td className="py-2.5 px-3 text-gray-700 font-semibold whitespace-nowrap">
                            {entry.loggedBy}
                          </td>
                          <td className="py-2.5 px-3 text-gray-600 font-medium">
                            {entry.remarks || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => showToast(`Entry ${entry.entryNo}: ${entry.producedQty} ${order.plannedUom} logged by ${entry.loggedBy}`, 'info')}
                              title="View Entry"
                              className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Production Entry Summary Banner */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-2xs shrink-0">
                  <Package className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Production Entry Summary
                  </h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Aggregated progress of recorded shifts.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-6 shrink-0 flex-wrap gap-y-2">
                <div>
                  <span className="text-[11px] text-gray-500 font-medium block">Total Entries</span>
                  <span className="text-base font-black text-gray-900 font-mono mt-0.5 block">{processedProductionEntries.length}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-500 font-medium block">Total Produced</span>
                  <span className="text-base font-black text-gray-900 font-mono mt-0.5 block">
                    {totalProducedFromEntries} {order.plannedUom}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-500 font-medium block">Remaining</span>
                  <span className="text-base font-black text-amber-600 font-mono mt-0.5 block">
                    {remainingQtyFromEntries} {order.plannedUom}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-500 font-medium block">Last Production</span>
                  <span className="text-base font-black text-gray-900 font-mono mt-0.5 block">
                    {formatDate(lastProductionDate)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB 4: LINKED SALES ORDERS (4 Cards, Orders Table, Callout)   */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'orders' && (
          <div className="space-y-5">
            {/* Header */}
            <div>
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-600 stroke-[2.2]" />
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  Sales Orders Linked to This Production Order
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {linkedSalesOrders.length > 0 
                  ? `This production order (${formatOrderNo(order.orderNumber)}) combines the pending demand for ${order.itemName} from multiple sales orders.`
                  : `This production order (${formatOrderNo(order.orderNumber)}) was created directly for inventory buffer / internal manufacturing demand.`}
              </p>
            </div>

            {/* 4 Stat Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">Linked Orders</span>
                  <span className="text-xl font-black text-gray-900 font-mono mt-0.5 block">
                    {linkedSalesOrders.length}
                  </span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600">
                  <FileText className="w-4 h-4 stroke-[2.2]" />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">Total Linked Demand</span>
                  <span className="text-sm font-black text-gray-900 font-mono mt-0.5 block">
                    {linkedSalesOrders.length > 0 ? totalLinkedDemand : order.plannedQty} {order.plannedUom}
                  </span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600">
                  <Package className="w-4 h-4 stroke-[2.2]" />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">Produced Against PO</span>
                  <span className="text-sm font-black text-emerald-600 font-mono mt-0.5 block">
                    {order.producedQty || 0} {order.plannedUom}
                  </span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-4 h-4 stroke-[2.2]" />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">Remaining Production</span>
                  <span className="text-sm font-black text-amber-600 font-mono mt-0.5 block">
                    {balanceQty} {order.plannedUom}
                  </span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600">
                  <Clock className="w-4 h-4 stroke-[2.2]" />
                </div>
              </div>
            </div>

            {/* Sales Orders Table */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50/70 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-8 text-center">#</th>
                      <th className="py-2.5 px-3">Sales Order No.</th>
                      <th className="py-2.5 px-3">Order Date</th>
                      <th className="py-2.5 px-3">Customer / Party Name</th>
                      <th className="py-2.5 px-3">City</th>
                      <th className="py-2.5 px-3">Ordered Qty</th>
                      <th className="py-2.5 px-3">Already Dispatched</th>
                      <th className="py-2.5 px-3">Pending Qty</th>
                      <th className="py-2.5 px-3">Allocation from PO</th>
                      <th className="py-2.5 px-3 text-center">Fulfilment Status</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {isLoadingSalesOrders ? (
                      <tr>
                        <td colSpan={11} className="py-10 text-center text-gray-400 text-xs">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                          <span>Scanning linked customer orders...</span>
                        </td>
                      </tr>
                    ) : linkedSalesOrders.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-10 text-center text-gray-400">
                          <ShoppingCart className="w-7 h-7 text-gray-300 mx-auto mb-1.5" />
                          <p className="font-semibold text-gray-700">No external sales orders linked directly.</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            This production order was created for buffer stock or make-to-stock replenishment.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      linkedSalesOrders.map((so, idx) => (
                        <tr key={so._id || idx} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-2.5 px-3 text-center font-semibold text-gray-500">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-blue-600 font-mono whitespace-nowrap">
                            <button
                              onClick={() => setSelectedPreviewSo(so)}
                              className="hover:underline cursor-pointer"
                            >
                              {so.orderNumber}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-gray-800 whitespace-nowrap">
                            {formatDate(so.orderDate)}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-gray-900">
                            {so.customerName || (so.customer as any)?.name || 'Customer'}
                          </td>
                          <td className="py-2.5 px-3 text-gray-600">
                            {so.city || (so.customer as any)?.city || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-gray-900 font-mono">
                            {so.orderedQty} {order.plannedUom}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-gray-700 font-mono">
                            {so.dispatchedQty} {order.plannedUom}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-gray-900 font-mono">
                            {so.pendingQty} {order.plannedUom}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-blue-700 font-mono">
                            {so.allocationQty} {order.plannedUom}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              so.fulfilmentStatus === 'Fully Dispatched'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : so.fulfilmentStatus === 'Partially Dispatched'
                                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {so.fulfilmentStatus}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => setSelectedPreviewSo(so)}
                              title="View Sales Order"
                              className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {linkedSalesOrders.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-50/80 border-t border-gray-200 font-bold text-xs">
                        <td colSpan={5} className="py-2.5 px-3 text-gray-900 font-bold uppercase tracking-wider">
                          Total
                        </td>
                        <td className="py-2.5 px-3 font-bold text-gray-900 font-mono">
                          {totalLinkedDemand} {order.plannedUom}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-gray-700 font-mono">
                          {totalAlreadyDispatched} {order.plannedUom}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-gray-900 font-mono">
                          {totalPendingDemand} {order.plannedUom}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-blue-700 font-mono">
                          {totalAllocated} {order.plannedUom}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Bottom Info Callout */}
            <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-2.5 flex items-center space-x-2 text-[11px] text-blue-800">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>
                Finished production goes to finished goods stock. Dispatch is then allocated against these individual sales orders. One production order can fulfil multiple sales orders.
              </span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB 5: COSTING (Left 2/3, Right 1/3 layout)                   */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'costing' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left 2 Columns: Production Costing & Additional Costs */}
            <div className="lg:col-span-2 space-y-5">
              {/* Card 1: Production Costing (From BOM) */}
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-blue-600 stroke-[2.2]" />
                      <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Production Costing</h3>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Estimated from BOM; enter or adjust rates to reflect actual batch costing.
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">Click rate to edit</span>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50/70 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        <th className="py-2 px-2.5 w-8 text-center">#</th>
                        <th className="py-2 px-2.5">Material / Component</th>
                        <th className="py-2 px-2.5">Required Qty</th>
                        <th className="py-2 px-2.5">UOM</th>
                        <th className="py-2 px-2.5 w-24">Rate (₹)</th>
                        <th className="py-2 px-2.5 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {resolvedBomItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-gray-400">
                            No BOM components assigned to this order.
                          </td>
                        </tr>
                      ) : (
                        resolvedBomItems.map((item, idx) => (
                          <tr key={item.id || idx} className="hover:bg-gray-50/60 transition-colors">
                            <td className="py-2 px-2.5 text-center font-semibold text-gray-500">{idx + 1}</td>
                            <td className="py-2 px-2.5 font-semibold text-gray-900">
                              <div>{item.component}</div>
                              {item.code && <div className="text-[10px] text-gray-400 font-mono">{item.code}</div>}
                            </td>
                            <td className="py-2 px-2.5 font-bold text-gray-900 font-mono">
                              {item.totalRequired.toLocaleString()}
                            </td>
                            <td className="py-2 px-2.5 text-gray-600 font-medium">{item.uom}</td>
                            <td className="py-2 px-2.5">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                placeholder="0.00"
                                value={customRates[item.id] !== undefined ? customRates[item.id] : (item.dynamicRate > 0 ? item.dynamicRate : '')}
                                onChange={e => {
                                  const val = e.target.value === '' ? 0 : Number(e.target.value);
                                  setCustomRates(prev => ({ ...prev, [item.id]: val }));
                                }}
                                className="w-20 px-2 py-1 text-right font-mono font-semibold text-xs border border-gray-200 rounded focus:outline-blue-500 bg-white"
                              />
                            </td>
                            <td className="py-2 px-2.5 font-mono font-bold text-gray-900 text-right">
                              {item.dynamicAmount > 0 
                                ? item.dynamicAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : '0.00'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200">
                        <td colSpan={5} className="py-2.5 px-2.5 text-right font-bold text-gray-800 uppercase tracking-wider text-xs">
                          Material Cost (A)
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-black text-gray-900 font-mono text-sm">
                          ₹{totalMaterialCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Card 2: Additional Costs */}
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <Calculator className="w-4 h-4 text-blue-600 stroke-[2.2]" />
                      <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Additional Costs</h3>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Other manufacturing overheads (labour, machine, electricity).
                    </p>
                  </div>

                  <button
                    onClick={() => setIsAddCostModalOpen(true)}
                    className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Cost</span>
                  </button>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50/70 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        <th className="py-2 px-2.5 w-8 text-center">#</th>
                        <th className="py-2 px-2.5">Cost Type</th>
                        <th className="py-2 px-2.5">Basis</th>
                        <th className="py-2 px-2.5 text-right">Amount (₹)</th>
                        <th className="py-2 px-2.5 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {additionalCostsList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-gray-400">
                            <Calculator className="w-5 h-5 text-gray-300 mx-auto mb-1" />
                            <p className="font-semibold text-gray-600 text-xs">No additional manufacturing costs recorded.</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">Click "+ Add Cost" above to record labor or machine overheads.</p>
                          </td>
                        </tr>
                      ) : (
                        additionalCostsList.map((cost, idx) => (
                          <tr key={cost.id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="py-2 px-2.5 text-center font-semibold text-gray-500">{idx + 1}</td>
                            <td className="py-2 px-2.5 font-semibold text-gray-900">{cost.costType}</td>
                            <td className="py-2 px-2.5 text-gray-600">{cost.basis}</td>
                            <td className="py-2 px-2.5 font-mono font-bold text-gray-900 text-right">
                              {cost.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2 px-2.5 text-center">
                              <button
                                onClick={() => handleDeleteAdditionalCost(cost.id)}
                                title="Remove cost"
                                className="text-gray-400 hover:text-rose-600 transition-colors p-1 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200">
                        <td colSpan={3} className="py-2.5 px-2.5 text-right font-bold text-gray-800 uppercase tracking-wider text-xs">
                          Total Additional Cost (B)
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-black text-gray-900 font-mono text-sm">
                          ₹{totalAdditionalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Cost Summary & Selling / Profit Reference */}
            <div className="space-y-5">
              {/* Cost Summary Card */}
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 space-y-3">
                <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs uppercase tracking-wider border-b border-gray-100 pb-2.5">
                  <Calculator className="w-4 h-4 text-blue-600 stroke-[2.2]" />
                  <span>Cost Summary</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 font-medium">Material Cost (A)</span>
                    <span className="font-bold text-gray-900 font-mono">
                      ₹{totalMaterialCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 font-medium">Additional Cost (B)</span>
                    <span className="font-bold text-gray-900 font-mono">
                      ₹{totalAdditionalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Highlight Row */}
                  <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-2.5 flex items-center justify-between text-blue-900">
                    <span className="font-bold text-xs">Total Production Cost (A + B)</span>
                    <span className="font-black text-sm font-mono text-blue-700">
                      ₹{totalProductionCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-gray-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 font-medium">Cost per {order.plannedUom || 'Unit'}</span>
                      <span className="font-bold text-gray-900 font-mono">
                        ₹{costPerUom.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    {isGbl && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 font-medium">Cost per PCS</span>
                        <span className="font-bold text-gray-900 font-mono">
                          ₹{costPerPcs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Selling & Profit Reference Card */}
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 space-y-3">
                <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs uppercase tracking-wider border-b border-gray-100 pb-2.5">
                  <FileText className="w-4 h-4 text-blue-600 stroke-[2.2]" />
                  <span>Selling & Profit Reference</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-gray-600 font-medium whitespace-nowrap">
                      Selling Rate per {order.plannedUom || 'Unit'} (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={sellingRate}
                      onChange={e => setSellingRate(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-28 text-right font-mono font-bold text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500 shadow-2xs"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 font-medium">Total Selling Value ({order.plannedQty} {order.plannedUom})</span>
                    <span className="font-bold text-gray-900 font-mono">
                      ₹{totalSellingValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 font-medium">Profit per {order.plannedUom || 'Unit'}</span>
                    <span className={`font-bold font-mono ${profitPerUom >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      ₹{profitPerUom.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 font-medium">Profit Margin</span>
                    <span className={`font-black font-mono text-sm ${profitMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {numericSellingRate > 0 ? `${profitMargin.toFixed(1)}%` : '—'}
                    </span>
                  </div>

                  <div className="mt-2 bg-blue-50/70 border border-blue-100 rounded-xl p-2.5 flex items-start gap-2 text-[11px] text-blue-800">
                    <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                    <p>
                      Profit is calculated from Selling Rate - Production Cost and does not change stock valuation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL 1: VIEW BOM SPECIFICATION ── */}
      <Modal
        isOpen={isBomModalOpen}
        onClose={() => setIsBomModalOpen(false)}
        maxWidth="max-w-2xl"
        title={
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-sm text-gray-900">
              Bill of Materials — {order.itemName}
            </span>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="bg-slate-50 border border-gray-200 rounded-xl p-3 flex justify-between items-center text-xs">
            <div>
              <span className="text-gray-500 font-medium">Output Item:</span>{' '}
              <strong className="text-gray-900">{order.itemName}</strong> ({order.itemCode || 'FG-002'})
            </div>
            <div>
              <span className="text-gray-500 font-medium">Batch Size:</span>{' '}
              <strong className="text-gray-900 font-mono">{order.plannedQty} {order.plannedUom}</strong>
            </div>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase">
                <th className="py-2 px-2.5 w-8">#</th>
                <th className="py-2 px-2.5">Component</th>
                <th className="py-2 px-2.5">Type</th>
                <th className="py-2 px-2.5">Total Required</th>
                <th className="py-2 px-2.5">UOM</th>
                <th className="py-2 px-2.5 text-right">Rate (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resolvedBomItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50">
                  <td className="py-2 px-2.5 text-gray-500 font-semibold">{idx + 1}</td>
                  <td className="py-2 px-2.5 font-semibold text-gray-900">{item.component}</td>
                  <td className="py-2 px-2.5 text-gray-600">{item.type}</td>
                  <td className="py-2 px-2.5 font-mono font-bold text-gray-900">{item.totalRequired.toLocaleString()}</td>
                  <td className="py-2 px-2.5 text-gray-600">{item.uom}</td>
                  <td className="py-2 px-2.5 font-mono font-semibold text-gray-800 text-right">₹{item.dynamicRate.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* ── MODAL 2: CHECK LIVE STOCK DETAILS ── */}
      <Modal
        isOpen={isStockModalOpen}
        onClose={() => {
          setIsStockModalOpen(false);
          setSelectedStockComponent(null);
        }}
        maxWidth="max-w-xl"
        title={
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-sm text-gray-900">
              Live Stock Availability Check
            </span>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <p className="text-gray-500 text-xs">
            Current real-time stock levels across warehouse bins and active purchase batches.
          </p>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase">
                <th className="py-2 px-2.5 w-8">#</th>
                <th className="py-2 px-2.5">Component</th>
                <th className="py-2 px-2.5">Live Stock</th>
                <th className="py-2 px-2.5">Required</th>
                <th className="py-2 px-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resolvedBomItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50">
                  <td className="py-2 px-2.5 text-gray-500 font-semibold">{idx + 1}</td>
                  <td className="py-2 px-2.5 font-semibold text-gray-900">{item.component}</td>
                  <td className="py-2 px-2.5 font-mono font-bold text-gray-900">{item.dynamicStock.toLocaleString()} {item.uom}</td>
                  <td className="py-2 px-2.5 font-mono font-medium text-gray-600">{item.totalRequired.toLocaleString()} {item.uom}</td>
                  <td className="py-2 px-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      item.status === 'Ready'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : item.status === 'Partial'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* ── MODAL 3: ADD ADDITIONAL COST ── */}
      <Modal
        isOpen={isAddCostModalOpen}
        onClose={() => setIsAddCostModalOpen(false)}
        maxWidth="max-w-sm"
        title={
          <div className="flex items-center space-x-2">
            <Plus className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-sm text-gray-900">Add Manufacturing Cost</span>
          </div>
        }
      >
        <form onSubmit={handleAddAdditionalCost} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Cost Type <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Labour / Wages, Electricity"
              value={newCostType}
              onChange={e => setNewCostType(e.target.value)}
              className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Basis
            </label>
            <input
              type="text"
              placeholder={`e.g. Per ${order.plannedUom || 'Unit'} or Lump Sum`}
              value={newCostBasis}
              onChange={e => setNewCostBasis(e.target.value)}
              className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Amount (₹) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="any"
              required
              min={1}
              placeholder="0.00"
              value={newCostAmount}
              onChange={e => setNewCostAmount(Number(e.target.value) || '')}
              className="w-full text-xs font-mono font-bold text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddCostModalOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              Add Cost
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL 4: PREVIEW SALES ORDER DETAILS ── */}
      <Modal
        isOpen={Boolean(selectedPreviewSo)}
        onClose={() => setSelectedPreviewSo(null)}
        maxWidth="max-w-lg"
        title={
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-sm text-gray-900 font-mono">
              {selectedPreviewSo?.orderNumber}
            </span>
          </div>
        }
      >
        {selectedPreviewSo && (
          <div className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-2.5 bg-slate-50 p-3 rounded-xl border border-gray-200">
              <div>
                <span className="text-[11px] text-gray-400 font-medium block">Customer</span>
                <span className="font-bold text-gray-900 mt-0.5 block">{selectedPreviewSo.customerName}</span>
              </div>
              <div>
                <span className="text-[11px] text-gray-400 font-medium block">Order Date</span>
                <span className="font-semibold text-gray-900 mt-0.5 block">{formatDate(selectedPreviewSo.orderDate)}</span>
              </div>
              <div>
                <span className="text-[11px] text-gray-400 font-medium block">City / Destination</span>
                <span className="font-semibold text-gray-900 mt-0.5 block">{selectedPreviewSo.city || '—'}</span>
              </div>
              <div>
                <span className="text-[11px] text-gray-400 font-medium block">Grand Total</span>
                <span className="font-bold text-gray-900 font-mono mt-0.5 block">₹{selectedPreviewSo.grandTotal?.toLocaleString('en-IN') || '—'}</span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-gray-900 mb-2">Order Line Items</h4>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase">
                    <tr>
                      <th className="py-2 px-2.5">Item</th>
                      <th className="py-2 px-2.5">Quantity</th>
                      <th className="py-2 px-2.5 text-right">Unit Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(selectedPreviewSo.items || []).map((it, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="py-2 px-2.5 font-semibold text-gray-900">{it.itemName}</td>
                        <td className="py-2 px-2.5 font-mono">{it.quantity} {it.uom}</td>
                        <td className="py-2 px-2.5 text-right font-mono font-semibold">₹{it.unitPrice?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

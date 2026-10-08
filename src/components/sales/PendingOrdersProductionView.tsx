import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Factory, Package, AlertTriangle, CheckCircle2, Clock,
  ChevronDown, ChevronRight, Search, Download, Printer,
  Eye, Play, Layers, Calendar, Filter, ArrowUpDown,
  Building, Phone, ArrowRight, ShieldCheck, Box, Sparkles,
  TrendingUp, Check, MessageSquare, Tag, Zap, X, FileText, Truck
} from 'lucide-react';
import { SalesOrderV2 } from '../../api/salesOrderApiV2';
import { getBalancesV2, getSkusV2 } from '../../api/mfgApiV2';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../ui/Toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { NewProductionOrderWizard } from '../production/NewProductionOrderWizard';

interface PendingOrdersProductionViewProps {
  orders: SalesOrderV2[];
  onViewOrder: (order: SalesOrderV2) => void;
  onEditOrder?: (order: SalesOrderV2) => void;
  onRefresh?: () => void;
}

interface SkuProductionRequirement {
  skuCode: string;
  skuName: string;
  category?: string;
  skuId?: string;
  pcsPerGbl: number;
  totalOrderedPcs: number;
  totalOrderedGbl: number;
  totalDispatchedPcs: number;
  totalDispatchedGbl: number;
  balancePendingPcs: number;
  balancePendingGbl: number;
  stockInHandPcs: number;
  stockInHandGbl: number;
  shortfallPcs: number;
  shortfallGbl: number;
  earliestDueDate: string;
  orderCount: number;
  orders: Array<{
    orderId: string;
    orderNumber: string;
    orderDate: string;
    promisedDate: string;
    customerName: string;
    customerPhone?: string;
    city?: string;
    orderedPcs: number;
    orderedGbl: number;
    dispatchedPcs: number;
    dispatchedGbl: number;
    pendingPcs: number;
    pendingGbl: number;
    status: string;
    rawOrder: SalesOrderV2;
  }>;
  productionStatus: 'Ready' | 'In Production' | 'Shortfall';
}

export type ViewTabMode = 'material_view' | 'production_view' | 'customer_view';

export interface MaterialRequirementItem {
  id: string;
  materialCode: string;
  materialName: string;
  category: string;
  uom: string;
  stockInHand: number;
  totalRequiredQty: number;
  shortfallRequiredQty: number;
  deficit: number;
  status: 'In Stock' | 'Partial' | 'Shortfall';
  skuId?: string;
  contributingFgCount: number;
  contributingOrderCount: number;
  contributions: Array<{
    fgSkuCode: string;
    fgSkuName: string;
    orderId: string;
    orderNumber: string;
    orderDate: string;
    promisedDate: string;
    customerName: string;
    customerPhone?: string;
    city?: string;
    orderedPcs: number;
    pendingPcs: number;
    pendingGbl: number;
    shortfallPcs: number;
    perBookBasis: number;
    requiredQty: number;
    rawOrder: SalesOrderV2;
  }>;
}

export const PendingOrdersProductionView: React.FC<PendingOrdersProductionViewProps> = ({
  orders,
  onViewOrder,
  onEditOrder,
  onRefresh,
}) => {
  const { selectedCompany } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Persist viewMode in localStorage and searchParams so it survives page reloads
  // Tab order: Material View (default) -> Production View -> Customer view
  const [viewMode, setViewModeState] = useState<ViewTabMode>(() => {
    const fromUrl = searchParams.get('pview');
    if (fromUrl === 'customer' || fromUrl === 'order_wise' || fromUrl === 'customer_view') return 'customer_view';
    if (fromUrl === 'production' || fromUrl === 'item_wise' || fromUrl === 'production_view') return 'production_view';
    if (fromUrl === 'material' || fromUrl === 'material_view') return 'material_view';
    const saved = localStorage.getItem('pending_orders_view_mode') as ViewTabMode | null;
    if (saved === 'material_view') return 'material_view';
    if (saved === 'production_view' || (saved as any) === 'item_wise') return 'production_view';
    if (saved === 'customer_view' || (saved as any) === 'order_wise') return 'customer_view';
    return 'material_view';
  });

  const setViewMode = (mode: ViewTabMode) => {
    setViewModeState(mode);
    localStorage.setItem('pending_orders_view_mode', mode);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (mode === 'material_view') next.delete('pview');
      else if (mode === 'production_view') next.set('pview', 'production');
      else if (mode === 'customer_view') next.set('pview', 'customer');
      return next;
    }, { replace: true });
  };

  // Persist filterMode in localStorage
  const [filterMode, setFilterModeState] = useState<'all' | 'shortfall' | 'in_stock'>(() => {
    const saved = localStorage.getItem('pending_orders_filter_mode');
    return (saved === 'shortfall' || saved === 'in_stock' || saved === 'all') ? saved : 'all';
  });

  const setFilterMode = (mode: 'all' | 'shortfall' | 'in_stock') => {
    setFilterModeState(mode);
    localStorage.setItem('pending_orders_filter_mode', mode);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());
  const [expandedMaterials, setExpandedMaterials] = useState<Set<string>>(new Set());
  const [stockMap, setStockMap] = useState<Map<string, { pcs: number; gbl: number }>>(new Map());
  const [categoryMap, setCategoryMap] = useState<Map<string, string>>(new Map());
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockRefreshKey, setStockRefreshKey] = useState(0);

  useEffect(() => {
    const handleStockChange = () => setStockRefreshKey(k => k + 1);
    window.addEventListener('stock_balance_changed', handleStockChange);
    return () => window.removeEventListener('stock_balance_changed', handleStockChange);
  }, []);

  const [inProductionSkus, setInProductionSkus] = useState<Set<string>>(new Set());
  const [loadedSkus, setLoadedSkus] = useState<any[]>([]);

  // Production Order Wizard in-modal state (stays inside sales order module)
  const [productionWizardConfig, setProductionWizardConfig] = useState<{
    isOpen: boolean;
    skuCode: string;
    skuName: string;
    shortfallGbl: number;
    orderRef?: string;
    orderId?: string;
  } | null>(null);

  // Filter only pending sales orders (Not fully dispatched / completed)
  const pendingOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status === 'Draft' || o.status === 'Cancelled') return false;
      const fs = o.fulfillmentStatus || 'Pending';
      return fs === 'Pending' || fs === 'Not Started' || fs === 'Partially Dispatched' || fs === 'In Production' || o.status === 'Confirmed';
    });
  }, [orders]);

  // Load real stock balances from warehouse inventory API
  useEffect(() => {
    const compId = selectedCompany?._id;
    if (!compId) return;
    setLoadingStock(true);

    Promise.all([
      getBalancesV2(compId).catch(() => []),
      getSkusV2(compId).catch(() => [])
    ]).then(([bals, skus]) => {
      const smap = new Map<string, { pcs: number; gbl: number }>();
      const catMap = new Map<string, string>();
      const bList = Array.isArray(bals) ? bals : [];
      const sList = Array.isArray(skus) ? skus : [];
      setLoadedSkus(sList);

      const skuPcsMap = new Map<string, number>();
      bList.forEach((b: any) => {
        const rawId = b.skuId || b.sku?._id;
        const sId = rawId ? String((rawId as any)._id || rawId) : '';
        const qty = Number(b.onHand) || Number(b.quantity) || 0;
        if (sId) skuPcsMap.set(sId, (skuPcsMap.get(sId) || 0) + qty);
      });

      sList.forEach((s: any) => {
        const sId = String(s._id || s.id || '');
        const code = (s.skuCode || '').toLowerCase().trim();
        const name = (s.name || '').toLowerCase().trim();
        const pcsPerGbl = Number(s.altUnitConversion || s.booksGbl || 100) || 100;
        const rawOnHand = skuPcsMap.get(sId) ?? (Number(s.presentStock || s.openingStock || 0));
        const unit = (s.unit || '').toUpperCase().trim();
        const altUnit = (s.altUnit || '').toUpperCase().trim();

        let gbl: number;
        let pcs: number;
        if (unit === 'GBL' || (altUnit && altUnit !== 'GBL' && unit.includes('GBL'))) {
          gbl = rawOnHand;
          pcs = rawOnHand * pcsPerGbl;
        } else {
          pcs = rawOnHand;
          gbl = pcsPerGbl > 0 ? Math.floor(rawOnHand / pcsPerGbl) : rawOnHand;
        }

        const val = { pcs, gbl };
        if (sId) smap.set(sId, val);
        if (code) smap.set(code, val);
        if (name) smap.set(name, val);

        const cat = s.category || s.stockCategory || '';
        if (cat) {
          if (sId) catMap.set(sId, cat);
          if (code) catMap.set(code, cat);
          if (name) catMap.set(name, cat);
        }
      });

      setStockMap(smap);
      setCategoryMap(catMap);
    }).catch(err => {
      console.warn('Failed to load stock balances:', err);
    }).finally(() => {
      setLoadingStock(false);
    });
  }, [selectedCompany?._id, stockRefreshKey]);

  // Compute Item-wise Production Requirements (Sales Orders Outstanding)
  const itemWiseRequirements = useMemo<SkuProductionRequirement[]>(() => {
    const map = new Map<string, SkuProductionRequirement>();

    pendingOrders.forEach(o => {
      (o.items || []).forEach((item, idx) => {
        const code = (item.skuCode || `SKU-${idx}`).toUpperCase().trim();
        const name = item.itemName || code;
        const key = code || name;
        const comps = (item as any).components || [];
        const packPcs = ((item as any).isMixedBundle && comps.length > 0)
          ? comps.reduce((sum: number, c: any) => sum + (Number(c.quantity) || 0), 0)
          : 0;
        const pcsPerGbl = (packPcs > 0 && (!item.pcsPerGbl || item.pcsPerGbl === 1 || item.pcsPerGbl === 100))
          ? packPcs
          : (item.pcsPerGbl || packPcs || 100);
        const rawCat = (item as any).category || (item as any).stockCategory || categoryMap.get(code.toLowerCase()) || categoryMap.get(name.toLowerCase()) || '';
        const category = rawCat || (code.includes('112P') || name.toUpperCase().includes('112P') ? 'FINISHED GOODS' : '');

        const orderedPcs = Number(item.quantity) || 0;
        const orderedGbl = (item.gbl && packPcs > 0 && item.gbl === packPcs && (item.pcsPerGbl === 1 || !item.pcsPerGbl))
          ? 1
          : (item.gbl || Math.ceil(orderedPcs / pcsPerGbl));
        const dispatchedPcs = Number(item.dispatchedQty) || 0;
        const dispatchedGbl = Math.floor(dispatchedPcs / pcsPerGbl);
        const pendingPcs = Math.max(0, orderedPcs - dispatchedPcs);
        const pendingGbl = Math.ceil(pendingPcs / pcsPerGbl);

        // Fetch live warehouse stock dynamically from inventory
        let stockInHandPcs = 0;
        let stockInHandGbl = 0;
        const rawSkuId = typeof item.skuId === 'object' ? (item.skuId as any)?._id : item.skuId;
        const sIdLookup = rawSkuId ? String(rawSkuId) : '';
        const lookupKey = code.toLowerCase();
        const nameLookup = name.toLowerCase();

        if (sIdLookup && stockMap.has(sIdLookup)) {
          const s = stockMap.get(sIdLookup)!;
          stockInHandPcs = s.pcs;
          stockInHandGbl = s.gbl;
        } else if (stockMap.has(lookupKey)) {
          const s = stockMap.get(lookupKey)!;
          stockInHandPcs = s.pcs;
          stockInHandGbl = s.gbl;
        } else if (stockMap.has(nameLookup)) {
          const s = stockMap.get(nameLookup)!;
          stockInHandPcs = s.pcs;
          stockInHandGbl = s.gbl;
        } else {
          stockInHandGbl = 0;
          stockInHandPcs = 0;
        }

        if (!map.has(key)) {
          map.set(key, {
            skuCode: code,
            skuName: name,
            category,
            skuId: item.skuId ? String(item.skuId) : undefined,
            pcsPerGbl,
            totalOrderedPcs: 0,
            totalOrderedGbl: 0,
            totalDispatchedPcs: 0,
            totalDispatchedGbl: 0,
            balancePendingPcs: 0,
            balancePendingGbl: 0,
            stockInHandPcs,
            stockInHandGbl,
            shortfallPcs: 0,
            shortfallGbl: 0,
            earliestDueDate: o.promisedDate || o.orderDate || '',
            orderCount: 0,
            orders: [],
            productionStatus: 'Shortfall'
          });
        }

        const req = map.get(key)!;
        req.totalOrderedPcs += orderedPcs;
        req.totalOrderedGbl += orderedGbl;
        req.totalDispatchedPcs += dispatchedPcs;
        req.totalDispatchedGbl += dispatchedGbl;
        req.balancePendingPcs += pendingPcs;
        req.balancePendingGbl += pendingGbl;
        req.orderCount += 1;

        if (o.promisedDate && (!req.earliestDueDate || o.promisedDate < req.earliestDueDate)) {
          req.earliestDueDate = o.promisedDate;
        }

        req.orders.push({
          orderId: o._id || o.orderNumber,
          orderNumber: o.orderNumber,
          orderDate: o.orderDate,
          promisedDate: o.promisedDate || '—',
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          city: o.city,
          orderedPcs,
          orderedGbl,
          dispatchedPcs,
          dispatchedGbl,
          pendingPcs,
          pendingGbl,
          status: o.status,
          rawOrder: o
        });
      });
    });

    // Calculate Shortfalls and Final Status
    const list: SkuProductionRequirement[] = [];
    map.forEach(req => {
      const shortfallPcs = Math.max(0, req.balancePendingPcs - req.stockInHandPcs);
      const shortfallGbl = Math.max(0, req.balancePendingGbl - req.stockInHandGbl);
      req.shortfallPcs = shortfallPcs;
      req.shortfallGbl = shortfallGbl;

      if (inProductionSkus.has(req.skuCode)) {
        req.productionStatus = 'In Production';
      } else if (shortfallGbl === 0 && shortfallPcs === 0) {
        req.productionStatus = 'Ready';
      } else {
        req.productionStatus = 'Shortfall';
      }

      list.push(req);
    });

    return list.sort((a, b) => b.shortfallGbl - a.shortfallGbl);
  }, [pendingOrders, stockMap, inProductionSkus]);

  // Filtered Requirements based on Search and Shortfall Mode
  const filteredRequirements = useMemo(() => {
    return itemWiseRequirements.filter(req => {
      if (filterMode === 'shortfall' && req.shortfallGbl <= 0) return false;
      if (filterMode === 'in_stock' && req.shortfallGbl > 0) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const mCode = req.skuCode.toLowerCase().includes(q);
        const mName = req.skuName.toLowerCase().includes(q);
        const mOrders = req.orders.some(o => 
          o.orderNumber.toLowerCase().includes(q) || 
          o.customerName.toLowerCase().includes(q) || 
          (o.city && o.city.toLowerCase().includes(q))
        );
        if (!mCode && !mName && !mOrders) return false;
      }
      return true;
    });
  }, [itemWiseRequirements, filterMode, searchTerm]);

  // Filtered Customer Orders based on Search and Filter Mode
  const filteredCustomerOrders = useMemo(() => {
    return pendingOrders.filter(order => {
      const items = order.items || [];
      if (filterMode === 'shortfall') {
        const hasShortfall = items.some(item => {
          const code = (item.skuCode || '').toLowerCase().trim();
          const req = itemWiseRequirements.find(r => r.skuCode.toLowerCase() === code);
          return req ? req.shortfallGbl > 0 : true;
        });
        if (!hasShortfall) return false;
      } else if (filterMode === 'in_stock') {
        const allInStock = items.length > 0 && items.every(item => {
          const code = (item.skuCode || '').toLowerCase().trim();
          const req = itemWiseRequirements.find(r => r.skuCode.toLowerCase() === code);
          return req ? req.shortfallGbl === 0 : false;
        });
        if (!allInStock) return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const mNum = (order.orderNumber || '').toLowerCase().includes(q);
        const mCust = (order.customerName || '').toLowerCase().includes(q);
        const mCity = (order.city || order.region || '').toLowerCase().includes(q);
        const mItems = items.some(i => 
          (i.itemName || '').toLowerCase().includes(q) || 
          (i.skuCode || '').toLowerCase().includes(q)
        );
        if (!mNum && !mCust && !mCity && !mItems) return false;
      }
      return true;
    });
  }, [pendingOrders, filterMode, searchTerm, itemWiseRequirements]);

  // Aggregate KPI Metrics
  const kpis = useMemo(() => {
    let totalPendingGbl = 0;
    let totalPendingPcs = 0;
    let totalStockGbl = 0;
    let totalShortfallGbl = 0;
    let totalShortfallPcs = 0;
    let readyOrdersCount = 0;

    itemWiseRequirements.forEach(req => {
      totalPendingGbl += req.balancePendingGbl;
      totalPendingPcs += req.balancePendingPcs;
      totalStockGbl += req.stockInHandGbl;
      totalShortfallGbl += req.shortfallGbl;
      totalShortfallPcs += req.shortfallPcs;
    });

    // Count orders where all items have sufficient warehouse stock
    pendingOrders.forEach(o => {
      const allReady = (o.items || []).every(item => {
        const code = (item.skuCode || '').toLowerCase().trim();
        const req = itemWiseRequirements.find(r => r.skuCode.toLowerCase() === code);
        return req ? req.shortfallGbl === 0 : false;
      });
      if (allReady) readyOrdersCount++;
    });

    return {
      totalOrders: pendingOrders.length,
      totalPendingGbl,
      totalPendingPcs,
      totalStockGbl,
      totalShortfallGbl,
      totalShortfallPcs,
      readyOrdersCount
    };
  }, [itemWiseRequirements, pendingOrders]);


  const toggleSingleSku = (code: string) => {
    setExpandedSkus(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleSingleMaterial = (code: string) => {
    setExpandedMaterials(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // Compute Material Requirements (Raw Material / Component Explosion for Pending Orders)
  const materialRequirements = useMemo<MaterialRequirementItem[]>(() => {
    const map = new Map<string, MaterialRequirementItem>();

    itemWiseRequirements.forEach(req => {
      if (req.balancePendingPcs <= 0) return;

      // 1. Match finished good SKU in loadedSkus
      const fgSku = loadedSkus.find(s => 
        (req.skuId && String(s._id) === String(req.skuId)) ||
        (s.skuCode && s.skuCode.toLowerCase().trim() === req.skuCode.toLowerCase().trim()) ||
        (s.name && s.name.toLowerCase().trim() === req.skuName.toLowerCase().trim())
      );

      const convFactor = req.pcsPerGbl > 0 ? req.pcsPerGbl : 100;
      const rawBom = fgSku?.bomItems || (fgSku as any)?.bom || [];

      let components: Array<{
        name: string;
        code: string;
        category: string;
        uom: string;
        perBookBasis: number;
        skuId?: string;
      }> = [];

      if (Array.isArray(rawBom) && rawBom.length > 0) {
        const yieldUnit = ((fgSku as any)?.recipeYieldUnit || (fgSku as any)?.batchYieldUnit || fgSku?.unit || 'PCS').toUpperCase().trim();
        const rawYield = Number((fgSku as any)?.recipeYieldQty || (fgSku as any)?.batchYieldQty || 1) || 1;
        const recipeBasePcs = yieldUnit === 'GBL' ? rawYield * convFactor : (rawYield > 0 ? rawYield : 1);

        components = rawBom.map((b: any, bIdx: number) => {
          const rawQty = Number(b.qty ?? b.qtyPerBatch) || 1;
          const perBookBasis = recipeBasePcs > 0 ? rawQty / recipeBasePcs : rawQty;
          const matchedMatSku = loadedSkus.find(s => 
            (b.skuId && String(s._id) === String(b.skuId)) ||
            (b.skuCode && s.skuCode?.toLowerCase().trim() === b.skuCode.toLowerCase().trim()) ||
            (b.code && s.skuCode?.toLowerCase().trim() === b.code.toLowerCase().trim()) ||
            (b.name && s.name?.toLowerCase().trim() === b.name.toLowerCase().trim())
          );

          let resolvedUom = b.uom || b.unit || matchedMatSku?.unit || 'PCS';
          if (resolvedUom.toUpperCase() === 'GBL') resolvedUom = 'PCS';

          return {
            name: b.name || b.itemName || b.component || `Material ${bIdx + 1}`,
            code: b.skuCode || b.code || matchedMatSku?.skuCode || `RM-${String(bIdx + 1).padStart(3, '0')}`,
            category: matchedMatSku?.category || b.category || 'Raw Materials',
            uom: resolvedUom,
            perBookBasis,
            skuId: matchedMatSku?._id || b.skuId
          };
        });
      } else {
        // Intelligently derive from standard notebook specifications
        const pageMatch = req.skuName.match(/(\d+)\s*P/i) || req.skuCode.match(/(\d+)\s*P/i);
        const pages = Number(fgSku?.pages) || (pageMatch ? parseInt(pageMatch[1], 10) : 72);
        const isUnruled = req.skuCode.includes('UR') || req.skuName.toUpperCase().includes('UR');
        const rulingLabel = isUnruled ? 'UR' : 'SR';

        // 1. Inner Paper Sheets (4-up layout: pages / 8 sheets per finished book)
        const innerSheets = Math.max(1, Math.round(pages / 8));
        const matchedPaperSku = loadedSkus.find(s => 
          (s.category && /paper|sheet|reel/i.test(s.category)) &&
          ((s.ruleType && s.ruleType.toLowerCase() === (isUnruled ? 'unruled' : 'single ruled')) ||
           (s.name && s.name.toUpperCase().includes(rulingLabel)))
        ) || loadedSkus.find(s => s.paperType === 'Sheets' || (s.category && /raw material|sheets/i.test(s.category)));

        components.push({
          name: matchedPaperSku?.name || `Inner Paper Sheet ${rulingLabel} (${pages}P)`,
          code: matchedPaperSku?.skuCode || `RM-PAP-${pages}P-${rulingLabel}`,
          category: matchedPaperSku?.category || 'Paper Sheets',
          uom: matchedPaperSku?.unit || 'Sheets',
          perBookBasis: innerSheets,
          skuId: matchedPaperSku?._id
        });

        // 2. Cover Board (Duplex Cover Board)
        const matchedBoardSku = loadedSkus.find(s => 
          (s.paperType === 'Board') ||
          (s.category && /board|cover/i.test(s.category)) ||
          (s.name && /board|duplex/i.test(s.name))
        );
        components.push({
          name: matchedBoardSku?.name || `Duplex Cover Board (${pages}P)`,
          code: matchedBoardSku?.skuCode || `RM-BRD-${pages}P`,
          category: matchedBoardSku?.category || 'Cover Board',
          uom: matchedBoardSku?.unit || 'Pcs',
          perBookBasis: 1,
          skuId: matchedBoardSku?._id
        });

        // 3. Stitching Wire (Only include if explicitly created in SKU Master)
        const matchedWireSku = loadedSkus.find(s => 
          (s.category && /wire|stitching/i.test(s.category)) ||
          (s.name && /wire/i.test(s.name))
        );
        if (matchedWireSku) {
          components.push({
            name: matchedWireSku.name,
            code: matchedWireSku.skuCode || 'RM-WIRE-24',
            category: matchedWireSku.category || 'Consumables',
            uom: matchedWireSku.unit || 'KG',
            perBookBasis: 0.0005,
            skuId: matchedWireSku._id
          });
        }
      }

      // Distribute requirements across components and pending customer orders
      components.forEach(comp => {
        const matKey = (comp.code || comp.name).trim().toUpperCase();

        if (!map.has(matKey)) {
          let liveStock = 0;
          const lookupKey = comp.code.toLowerCase();
          const nameLookup = comp.name.toLowerCase();
          const sIdLookup = comp.skuId ? String(comp.skuId) : '';

          if (sIdLookup && stockMap.has(sIdLookup)) {
            liveStock = stockMap.get(sIdLookup)!.pcs;
          } else if (stockMap.has(lookupKey)) {
            liveStock = stockMap.get(lookupKey)!.pcs;
          } else if (stockMap.has(nameLookup)) {
            liveStock = stockMap.get(nameLookup)!.pcs;
          } else {
            const s = loadedSkus.find(sku => 
              (comp.skuId && String(sku._id) === comp.skuId) ||
              (sku.skuCode && sku.skuCode.toUpperCase() === comp.code.toUpperCase()) ||
              (sku.name && sku.name.toUpperCase() === comp.name.toUpperCase())
            );
            if (s) {
              liveStock = Number(s.presentStock ?? s.openingStock ?? 0);
            }
          }

          map.set(matKey, {
            id: `mat-${matKey}`,
            materialCode: comp.code,
            materialName: comp.name,
            category: comp.category,
            uom: comp.uom,
            stockInHand: liveStock,
            totalRequiredQty: 0,
            shortfallRequiredQty: 0,
            deficit: 0,
            status: 'In Stock',
            skuId: comp.skuId,
            contributingFgCount: 0,
            contributingOrderCount: 0,
            contributions: []
          });
        }

        const matReq = map.get(matKey)!;

        req.orders.forEach(o => {
          if (o.pendingPcs <= 0) return;
          const requiredForOrder = Math.round(o.pendingPcs * comp.perBookBasis * 100) / 100;
          matReq.totalRequiredQty = Math.round((matReq.totalRequiredQty + requiredForOrder) * 100) / 100;

          if (req.shortfallPcs > 0) {
            const shortfallForThisItem = Math.min(o.pendingPcs, req.shortfallPcs);
            const shortfallMat = Math.round(shortfallForThisItem * comp.perBookBasis * 100) / 100;
            matReq.shortfallRequiredQty = Math.round((matReq.shortfallRequiredQty + shortfallMat) * 100) / 100;
          }

          matReq.contributions.push({
            fgSkuCode: req.skuCode,
            fgSkuName: req.skuName,
            orderId: o.orderId,
            orderNumber: o.orderNumber,
            orderDate: o.orderDate,
            promisedDate: o.promisedDate,
            customerName: o.customerName,
            customerPhone: o.customerPhone,
            city: o.city,
            orderedPcs: o.orderedPcs,
            pendingPcs: o.pendingPcs,
            pendingGbl: o.pendingGbl,
            shortfallPcs: req.shortfallPcs,
            perBookBasis: comp.perBookBasis,
            requiredQty: requiredForOrder,
            rawOrder: o.rawOrder
          });
        });
      });
    });

    const result: MaterialRequirementItem[] = [];
    map.forEach(item => {
      item.totalRequiredQty = Math.round(item.totalRequiredQty * 100) / 100;
      item.shortfallRequiredQty = Math.round(item.shortfallRequiredQty * 100) / 100;
      const deficit = Math.max(0, Math.round((item.totalRequiredQty - item.stockInHand) * 100) / 100);
      item.deficit = deficit;

      if (deficit === 0) {
        item.status = 'In Stock';
      } else if (item.stockInHand > 0) {
        item.status = 'Partial';
      } else {
        item.status = 'Shortfall';
      }

      const uniqueFg = new Set(item.contributions.map(c => c.fgSkuCode));
      const uniqueOrders = new Set(item.contributions.map(c => c.orderNumber));
      item.contributingFgCount = uniqueFg.size;
      item.contributingOrderCount = uniqueOrders.size;

      result.push(item);
    });

    return result.sort((a, b) => {
      if (b.deficit !== a.deficit) return b.deficit - a.deficit;
      return b.totalRequiredQty - a.totalRequiredQty;
    });
  }, [itemWiseRequirements, loadedSkus, stockMap]);

  // Filtered Materials based on Search and Filter Mode
  const filteredMaterials = useMemo(() => {
    return materialRequirements.filter(mat => {
      if (filterMode === 'shortfall' && mat.deficit <= 0) return false;
      if (filterMode === 'in_stock' && mat.deficit > 0) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const mCode = mat.materialCode.toLowerCase().includes(q);
        const mName = mat.materialName.toLowerCase().includes(q);
        const mCat = mat.category.toLowerCase().includes(q);
        const mContr = mat.contributions.some(c => 
          c.fgSkuName.toLowerCase().includes(q) ||
          c.fgSkuCode.toLowerCase().includes(q) ||
          c.orderNumber.toLowerCase().includes(q) ||
          c.customerName.toLowerCase().includes(q)
        );
        if (!mCode && !mName && !mCat && !mContr) return false;
      }
      return true;
    });
  }, [materialRequirements, filterMode, searchTerm]);

  // Handle Start Production: opens wizard modal directly in Sales Orders
  const handleStartProduction = (skuCode: string, skuName: string, shortfallGbl: number, orderRef?: string, orderId?: string) => {
    setProductionWizardConfig({
      isOpen: true,
      skuCode,
      skuName,
      shortfallGbl: Math.max(1, shortfallGbl),
      orderRef,
      orderId
    });
  };

  // Helper for report dates (DD-MM-YYYY)
  const formatReportDate = (d?: string) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return `${dt.getDate()}-${dt.getMonth() + 1}-${dt.getFullYear()}`;
  };

  // Helper for report date range (e.g. 1-Jan-26 to 25-Sep-26)
  const getReportDateRangeText = () => {
    const dates = filteredCustomerOrders
      .map(o => o.orderDate)
      .filter(Boolean)
      .map(d => new Date(d).getTime())
      .filter(t => !isNaN(t));

    const today = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fmt = (d: Date) => `${d.getDate()}-${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;

    if (dates.length === 0) {
      return `1-Jan-${String(today.getFullYear()).slice(-2)} to ${fmt(today)}`;
    }
    const minD = new Date(Math.min(...dates));
    const maxD = new Date(Math.max(...dates, today.getTime()));
    return `${fmt(minD)} to ${fmt(maxD)}`;
  };

  // Export to Excel:
  // Material View: Raw Material | Code | Category | Unit | Stock | Required | Deficit | Status
  // Production View: Stock Item | SKU Code | Stock | Pending | Produce | Produce | Status
  // Customer View: Date | Ledger Name | Order No | Item Name | Pending Qty
  const handleExportExcel = () => {
    if (viewMode === 'material_view') {
      const headers = ['Raw Material', 'Material Code', 'Category', 'Unit', 'Stock In Hand', 'Required Qty', 'Shortfall (Deficit)', 'Status', 'FG Demand Count', 'Pending Orders Count'];
      const rows = filteredMaterials.map(m => [
        m.materialName,
        m.materialCode,
        m.category,
        m.uom,
        m.stockInHand,
        m.totalRequiredQty,
        m.deficit,
        m.status,
        m.contributingFgCount,
        m.contributingOrderCount
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [
        { wch: 35 },
        { wch: 18 },
        { wch: 18 },
        { wch: 10 },
        { wch: 14 },
        { wch: 14 },
        { wch: 18 },
        { wch: 14 },
        { wch: 18 },
        { wch: 20 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Material Requirements');
      XLSX.writeFile(wb, `Material_Requirements_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast('Exported Material Requirements to Excel', 'success');
      return;
    }

    if (viewMode === 'customer_view') {
      const headers = ['Date', 'Ledger Name', 'Order No', 'Item Name', 'Pending Qty (GBL)', 'Pending Qty (Pcs)', 'Overdue Days'];
      const today = new Date();
      const rows: any[] = [];
      filteredCustomerOrders.forEach(order => {
        const orderDateObj = order.orderDate ? new Date(order.orderDate) : today;
        const diffDays = Math.max(0, Math.floor((today.getTime() - orderDateObj.getTime()) / (1000 * 60 * 60 * 24)));
        const overdueDaysStr = `( ${diffDays} days)`;
        const items = order.items || [];
        const totalPendingGbl = items.reduce((sum, item) => {
          const pcsPerGbl = item.pcsPerGbl || 100;
          const pendingPcs = Math.max(0, (item.quantity || 0) - (item.dispatchedQty || 0));
          return sum + Math.ceil(pendingPcs / pcsPerGbl);
        }, 0);

        // Header row for customer order
        rows.push([
          formatReportDate(order.orderDate),
          order.customerName,
          order.orderNumber,
          '',
          totalPendingGbl,
          '',
          overdueDaysStr
        ]);

        // Detail rows for each item
        items.forEach(item => {
          const pcsPerGbl = item.pcsPerGbl || 100;
          const pendingPcs = Math.max(0, (item.quantity || 0) - (item.dispatchedQty || 0));
          const pendingGbl = item.gbl || Math.ceil(pendingPcs / pcsPerGbl);
          rows.push([
            '',
            `   ${item.itemName || item.skuCode}`,
            '',
            item.itemName || item.skuCode,
            pendingGbl,
            pendingPcs,
            ''
          ]);
        });
      });

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [
        { wch: 14 },
        { wch: 42 },
        { wch: 14 },
        { wch: 35 },
        { wch: 18 },
        { wch: 18 },
        { wch: 16 }
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pending Orders');
      XLSX.writeFile(wb, `Pending_Sales_Orders_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast('Exported Pending Orders to Excel', 'success');
      return;
    }

    // View 2 (Production View): exactly matches the screenshot headers:
    // Stock Item | SKU Code | Stock | Pending | Produce | Produce | Status
    const headers = ['Stock Item', 'SKU Code', 'Stock', 'Pending', 'Produce', 'Produce', 'Status'];
    const rows = filteredRequirements.map(req => [
      req.skuName,
      req.skuCode,
      req.stockInHandGbl,
      req.balancePendingGbl,
      req.shortfallGbl,
      req.shortfallPcs,
      req.productionStatus
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [
      { wch: 42 }, // Stock Item
      { wch: 20 }, // SKU Code
      { wch: 10 }, // Stock
      { wch: 10 }, // Pending
      { wch: 10 }, // Produce (GBL)
      { wch: 12 }, // Produce (Pcs)
      { wch: 18 }  // Status
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Production Plan');
    XLSX.writeFile(wb, `Sales_Orders_Production_Plan_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Exported Production Schedule to Excel', 'success');
  };

  // Export PDF Report dynamically
  const handleExportPdf = () => {
    try {
      const companyName = (selectedCompany?.name || 'SRI KRISHNA BINDING WORKS').toUpperCase();
      const companyAddress = (selectedCompany?.address || '4TH CROSS ROAD , R R NAGAR , VIJAYAWADA').toUpperCase();
      const companyEmail = (selectedCompany?.email || 'SKBW.VIJAYAWADA@GMAIL.COM').toUpperCase();
      const dateRange = getReportDateRangeText();
      const today = new Date();

      if (viewMode === 'material_view') {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        let curY = 15;
        let curPage = 1;

        const renderMatTableHeader = () => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(13);
          doc.text(companyName, 105, curY, { align: 'center' });
          curY += 5.5;
          doc.setFontSize(11);
          doc.text('Material Requirement Analysis', 105, curY, { align: 'center' });
          const titleW = doc.getTextWidth('Material Requirement Analysis');
          doc.setLineWidth(0.3);
          doc.line(105 - titleW / 2, curY + 0.8, 105 + titleW / 2, curY + 0.8);
          curY += 6;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(`As on: ${formatDateDDMMYYYY(today.toISOString())} | Page ${curPage}`, 195, curY, { align: 'right' });
          curY += 3;

          doc.line(15, curY, 195, curY);
          curY += 3.5;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text('RAW MATERIAL / COMPONENT', 16, curY);
          doc.text('CATEGORY', 80, curY);
          doc.text('UOM', 114, curY, { align: 'center' });
          doc.text('IN HAND', 138, curY, { align: 'right' });
          doc.text('REQUIRED', 166, curY, { align: 'right' });
          doc.text('DEFICIT', 194, curY, { align: 'right' });
          curY += 2;
          doc.line(15, curY, 195, curY);
          curY += 4;
        };

        renderMatTableHeader();

        filteredMaterials.forEach(m => {
          if (curY > 275) {
            doc.addPage();
            curPage++;
            curY = 15;
            renderMatTableHeader();
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text(m.materialName.slice(0, 34), 16, curY);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.text(m.category.slice(0, 18), 80, curY);
          doc.text(m.uom, 114, curY, { align: 'center' });
          doc.text(m.stockInHand.toLocaleString(), 138, curY, { align: 'right' });
          doc.text(m.totalRequiredQty.toLocaleString(), 166, curY, { align: 'right' });

          if (m.deficit > 0) {
            doc.setFont('helvetica', 'bold');
            doc.text(`${m.deficit.toLocaleString()}`, 194, curY, { align: 'right' });
          } else {
            doc.text('In Stock', 194, curY, { align: 'right' });
          }

          curY += 4.5;
        });

        doc.line(15, curY, 195, curY);
        doc.save(`Material_Requirements_${new Date().toISOString().slice(0, 10)}.pdf`);
        showToast('Exported Material Requirements PDF successfully', 'success');
        return;
      }

      if (viewMode === 'customer_view') {
        handlePrint();
        return;
      } else {
        // ══════════════════════════════════════════════════════════════
        // PDF REPORT 2: STOCK CATEGORY OUTSTANDINGS (PRODUCTION VIEW)
        // ══════════════════════════════════════════════════════════════
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        let curY = 14;
        let curPage = 1;

        // Centered Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text(companyName, 105, curY, { align: 'center' });
        curY += 4.8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(companyAddress, 105, curY, { align: 'center' });
        curY += 4.2;

        doc.text(`E-Mail : ${companyEmail}`, 105, curY, { align: 'center' });
        curY += 5.2;

        doc.text('All Stock Categories', 105, curY, { align: 'center' });
        curY += 4.8;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.text('Stock Category Outstandings', 105, curY, { align: 'center' });
        curY += 4.5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(dateRange, 105, curY, { align: 'center' });
        curY += 4;

        // Table Header with right-aligned Page 1 and Sales Orders Outstanding
        const renderTableHeader = (pageNo: number) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(`Page ${pageNo}`, 195, curY, { align: 'right' });
          curY += 3.6;
          doc.text('Sales Orders Outstanding', 195, curY, { align: 'right' });
          const titleWidth = doc.getTextWidth('Sales Orders Outstanding');
          doc.setLineWidth(0.2);
          doc.line(195 - titleWidth, curY + 0.8, 195, curY + 0.8);
          curY += 2.5;

          // Top divider line across page
          doc.line(15, curY, 195, curY);
          curY += 3.5;

          // Header texts
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.text('P a r t i c u l a r s', 16, curY + 2);
          doc.text('Pending Orders', 193, curY, { align: 'right' });
          curY += 3.8;
          doc.setFont('helvetica', 'normal');
          doc.text('Quantity', 158, curY, { align: 'right' });
          doc.text('(Alt. Units)', 193, curY, { align: 'right' });
          curY += 2;

          // Bottom divider line across page
          doc.line(15, curY, 195, curY);
          curY += 4;
        };

        renderTableHeader(curPage);

        // Group items:
        // Categorized items (e.g. 'FINISHED GOODS') and uncategorized items
        const categorizedMap = new Map<string, typeof filteredRequirements>();
        const uncategorizedItems: typeof filteredRequirements = [];

        filteredRequirements.forEach(req => {
          const cat = req.category || (req.skuCode?.toUpperCase().includes('112P') ? 'FINISHED GOODS' : '');
          if (cat) {
            if (!categorizedMap.has(cat)) categorizedMap.set(cat, []);
            categorizedMap.get(cat)!.push(req);
          } else {
            uncategorizedItems.push(req);
          }
        });

        const checkPageBreak = (neededHeight: number) => {
          if (curY + neededHeight > 275) {
            doc.addPage();
            curPage++;
            curY = 15;
            renderTableHeader(curPage);
          }
        };

        // Render categorized groups
        categorizedMap.forEach((items, catName) => {
          const catGbl = items.reduce((s, i) => s + i.balancePendingGbl, 0);
          const catPcs = items.reduce((s, i) => s + i.balancePendingPcs, 0);

          checkPageBreak(5);
          // Category header
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.text(catName.toUpperCase(), 16, curY);
          doc.text(`${catGbl} GBL`, 158, curY, { align: 'right' });
          doc.text(`(${catPcs.toLocaleString()} PCS)`, 193, curY, { align: 'right' });
          curY += 4.2;

          // Indented items
          items.forEach(req => {
            checkPageBreak(4);
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.text(req.skuName.toUpperCase(), 22, curY);
            doc.setFont('helvetica', 'normal');
            doc.text(`${req.balancePendingGbl} GBL`, 158, curY, { align: 'right' });
            doc.text(`(${req.balancePendingPcs.toLocaleString()} PCS)`, 193, curY, { align: 'right' });
            curY += 4;
          });
        });

        // Render uncategorized items
        uncategorizedItems.forEach(req => {
          checkPageBreak(4);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(req.skuName.toUpperCase(), 16, curY);
          doc.text(`${req.balancePendingGbl} GBL`, 158, curY, { align: 'right' });
          doc.text(`(${req.balancePendingPcs.toLocaleString()} PCS)`, 193, curY, { align: 'right' });
          curY += 4;
        });

        // Grand Total row
        checkPageBreak(8);
        doc.line(15, curY, 195, curY);
        curY += 4.2;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('G r a n d   T o t a l', 16, curY);
        doc.text(`${kpis.totalPendingGbl} GBL`, 158, curY, { align: 'right' });
        doc.text(`(${kpis.totalPendingPcs.toLocaleString()} PCS)`, 193, curY, { align: 'right' });

        curY += 1.8;
        doc.line(15, curY, 195, curY);
        doc.line(15, curY + 0.6, 195, curY + 0.6);

        doc.save(`Stock_Category_Outstandings_${new Date().toISOString().slice(0, 10)}.pdf`);
        showToast('Exported Stock Category Outstandings PDF successfully', 'success');
      }
    } catch (err: any) {
      console.error('PDF Export Error:', err);
      showToast('Failed to export PDF: ' + (err.message || 'Unknown error'), 'error');
    }
  };

  // Print Report Handler
  const handlePrint = () => {
    const printWin = window.open('', '', 'width=950,height=1150');
    if (!printWin) {
      showToast('Pop-up blocked. Please allow pop-ups to print.', 'error');
      return;
    }

    const companyName = (selectedCompany?.name || 'SRI KRISHNA BINDING WORKS').toUpperCase();
    const companyAddress = (selectedCompany?.address || '4TH CROSS ROAD , R R NAGAR , VIJAYAWADA').toUpperCase();
    const companyEmail = (selectedCompany?.email || 'SKBW.VIJAYAWADA@GMAIL.COM').toUpperCase();
    const dateRange = getReportDateRangeText();
    const today = new Date();

    let html = '';

    if (viewMode === 'material_view') {
      const matRowsHtml = filteredMaterials.map(m => `
        <tr>
          <td style="padding: 4px 6px; font-weight: 600;">${m.materialName} <div style="font-size: 8pt; color: #555;">${m.materialCode}</div></td>
          <td style="padding: 4px 6px; text-align: center;">${m.category}</td>
          <td style="padding: 4px 6px; text-align: center;">${m.uom}</td>
          <td style="padding: 4px 6px; text-align: right; font-weight: bold;">${m.stockInHand.toLocaleString()}</td>
          <td style="padding: 4px 6px; text-align: right;">${m.totalRequiredQty.toLocaleString()}</td>
          <td style="padding: 4px 6px; text-align: right; font-weight: bold; color: ${m.deficit > 0 ? '#b91c1c' : '#15803d'};">
            ${m.deficit > 0 ? `${m.deficit.toLocaleString()} Deficit` : 'In Stock'}
          </td>
          <td style="padding: 4px 6px; text-align: center;">${m.status}</td>
        </tr>
      `).join('');

      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Material Requirement Analysis</title>
          <style>
            @media print {
              @page { size: A4 portrait; margin: 10mm 12mm; }
              body { margin: 0; }
            }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; font-size: 9pt; }
            .header { text-align: center; margin-bottom: 8px; }
            .company { font-size: 14pt; font-weight: bold; }
            .title { font-size: 12pt; font-weight: bold; margin-top: 3px; text-decoration: underline; }
            .date { text-align: right; font-size: 8.5pt; margin: 6px 0; }
            table { width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 8.5pt; }
            th { border: 1px solid #000; padding: 4px 6px; background: #f9f9f9; text-align: center; font-weight: bold; }
            td { border: 1px solid #ddd; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company">${companyName}</div>
            <div style="font-size: 8pt; color: #444;">${companyAddress}</div>
            <div class="title">Material Requirement Analysis</div>
          </div>
          <div class="date">Date: ${formatDateDDMMYYYY(today.toISOString())}</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Raw Material / Component</th>
                <th>Category</th>
                <th>UOM</th>
                <th>Stock In Hand</th>
                <th>Required Qty</th>
                <th>Shortfall (Deficit)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${matRowsHtml}
            </tbody>
          </table>
        </body>
        </html>
      `;
    } else if (viewMode === 'customer_view') {
      // ══════════════════════════════════════════════════════════════
      // REPORT 1: PENDING SALES ORDER (CUSTOMER ORDER WISE VIEW)
      // ══════════════════════════════════════════════════════════════
      const companyPhone = selectedCompany?.phone || '9988776655';
      const companyGstin = selectedCompany?.gstin || '37ABCDE1234F1Z5';
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const printDateStr = `${String(today.getDate()).padStart(2, '0')}-${months[today.getMonth()]}-${today.getFullYear()}`;
      const printTimeStr = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const getCityStateStr = (order: any) => {
        if (order.city && order.region) return `${order.city}, ${order.region}`;
        if (order.city) return order.city;
        if (order.region) return order.region;

        const custName = order.customerName || '';
        const match = custName.match(/\(([^)]+)\)/);
        if (match && match[1]) {
          const extractedCity = match[1].trim();
          const formattedCity = extractedCity.charAt(0).toUpperCase() + extractedCity.slice(1).toLowerCase();
          return `${formattedCity}, Telangana`;
        }
        return 'Andhra Pradesh';
      };

      let grandTotalPendingGbl = 0;

      const orderRowsHtml = filteredCustomerOrders.map(order => {
        const refDateStr = (order as any).dueDate || order.promisedDate || order.orderDate;
        const refDateObj = refDateStr ? new Date(refDateStr) : today;
        const diffDays = Math.max(0, Math.floor((today.getTime() - refDateObj.getTime()) / (1000 * 60 * 60 * 24)));
        const items = order.items || [];
        const totalPendingGbl = items.reduce((sum, item) => {
          const pcsPerGbl = item.pcsPerGbl || 100;
          const pendingPcs = Math.max(0, (item.quantity || 0) - (item.dispatchedQty || 0));
          return sum + Math.ceil(pendingPcs / pcsPerGbl);
        }, 0);
        grandTotalPendingGbl += totalPendingGbl;

        const formattedDate = formatReportDate(order.orderDate);
        const cityState = getCityStateStr(order);

        const mainRow = `
          <tr class="order-main-row">
            <td class="col-date">${formattedDate}</td>
            <td class="col-customer">
              <div class="customer-name">${order.customerName || '—'}</div>
              <div class="city-state">${cityState}</div>
            </td>
            <td class="col-orderno">${order.orderNumber || '—'}</td>
            <td class="col-pending">${totalPendingGbl} GBL</td>
            <td class="col-overdue">${diffDays} days</td>
          </tr>
        `;

        const itemRows = items.map((item, idx) => {
          const pcsPerGbl = item.pcsPerGbl || 100;
          const pendingPcs = Math.max(0, (item.quantity || 0) - (item.dispatchedQty || 0));
          const pendingGbl = item.gbl || Math.ceil(pendingPcs / pcsPerGbl);
          return `
            <tr class="item-sub-row">
              <td class="col-date"></td>
              <td class="col-customer">
                <div class="item-name-text">${idx + 1}. ${(item.itemName || item.skuCode || '').toUpperCase()}</div>
              </td>
              <td class="col-orderno"></td>
              <td class="col-pending">
                <div class="item-qty-text">${pendingGbl} GBL</div>
              </td>
              <td class="col-overdue"></td>
            </tr>
          `;
        }).join('');

        return mainRow + itemRows;
      }).join('');

      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Pending Sales Order</title>
          <style>
            @media print {
              @page { size: A4 portrait; margin: 8mm 10mm 10mm 10mm; }
              body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              color: #0f172a;
              margin: 12px;
              background: #fff;
            }

            .top-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 8px;
            }
            .company-title {
              font-size: 15pt;
              font-weight: 800;
              color: #0f172a;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }
            .company-subtext {
              font-size: 8.5pt;
              color: #334155;
              margin-top: 2px;
              line-height: 1.35;
            }

            .meta-info-table {
              font-size: 8.5pt;
              color: #334155;
              border-collapse: collapse;
            }
            .meta-info-table td {
              padding: 1px 4px;
            }
            .meta-label {
              font-weight: normal;
              color: #475569;
            }
            .meta-val {
              font-weight: 600;
              color: #0f172a;
            }

            .banner-box {
              background-color: #eff6ff;
              border: 1px solid #bfdbfe;
              border-radius: 6px;
              text-align: center;
              padding: 6px 12px;
              margin-top: 6px;
              margin-bottom: 10px;
            }
            .banner-title {
              font-size: 14pt;
              font-weight: 800;
              color: #1e3a8a;
              margin: 0;
              letter-spacing: 0.2px;
            }
            .banner-subtitle {
              font-size: 8.8pt;
              font-weight: 600;
              color: #1e40af;
              margin-top: 2px;
            }

            table.report-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 8.5pt;
              border: 1px solid #94a3b8;
            }
            table.report-table th {
              background-color: #f1f5f9;
              color: #0f172a;
              font-weight: 700;
              border: 1px solid #94a3b8;
              padding: 6px 8px;
              text-align: center;
              line-height: 1.2;
            }
            table.report-table td {
              border: 1px solid #cbd5e1;
              padding: 4px 8px;
              vertical-align: top;
            }

            .col-date { width: 13%; text-align: center; font-size: 8.5pt; font-weight: 500; }
            .col-customer { width: 47%; text-align: left; }
            .col-orderno { width: 12%; text-align: center; font-weight: 700; font-size: 8.8pt; }
            .col-pending { width: 14%; text-align: center; font-weight: 800; font-size: 8.8pt; }
            .col-overdue { width: 14%; text-align: center; font-weight: 800; color: #dc2626; font-size: 8.8pt; }

            .order-main-row {
              background-color: #ffffff;
            }
            .customer-name {
              font-weight: 800;
              color: #0f172a;
              font-size: 8.8pt;
              text-transform: uppercase;
            }
            .city-state {
              font-size: 8pt;
              color: #475569;
              margin-top: 1px;
            }

            .item-sub-row {
              background-color: #ffffff;
            }
            .item-name-text {
              padding-left: 14px;
              font-size: 8.2pt;
              color: #334155;
              text-transform: uppercase;
              margin-top: 1px;
            }
            .item-qty-text {
              text-align: center;
              font-size: 8.2pt;
              color: #334155;
            }

            .total-row td {
              background-color: #eff6ff;
              border-top: 2px solid #94a3b8;
              border-bottom: 2px solid #94a3b8;
              font-weight: 800;
              padding: 6px 8px;
            }
            .total-label {
              text-align: right;
              font-weight: 800;
              color: #1e3a8a;
              letter-spacing: 1px;
              font-size: 9.5pt;
            }
            .total-value {
              text-align: center;
              font-weight: 800;
              color: #1e3a8a;
              font-size: 9.5pt;
            }

            .continued-text {
              text-align: right;
              font-size: 8pt;
              font-style: italic;
              color: #64748b;
              margin-top: 6px;
            }
          </style>
        </head>
        <body>
          <div class="top-header">
            <div>
              <div class="company-title">${companyName}</div>
              <div class="company-subtext">${companyAddress}</div>
              <div class="company-subtext">Phone: ${companyPhone} &nbsp;|&nbsp; GSTIN: ${companyGstin}</div>
            </div>
            <div>
              <table class="meta-info-table">
                <tr>
                  <td class="meta-label">Date</td>
                  <td>:</td>
                  <td class="meta-val">${printDateStr}</td>
                </tr>
                <tr>
                  <td class="meta-label">Page</td>
                  <td>:</td>
                  <td class="meta-val">1 of 2</td>
                </tr>
                <tr>
                  <td class="meta-label">Time</td>
                  <td>:</td>
                  <td class="meta-val">${printTimeStr}</td>
                </tr>
              </table>
            </div>
          </div>

          <div class="banner-box">
            <div class="banner-title">Pending Sales Order</div>
            <div class="banner-subtitle">${dateRange}</div>
          </div>

          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 13%;">Date</th>
                <th style="width: 47%;">
                  Customer (Ledger Name)<br/>
                  <span style="font-weight: 400; font-size: 7.8pt; color: #475569;">City, State</span>
                </th>
                <th style="width: 12%;">Order No</th>
                <th style="width: 14%;">Pending Qty<br/>(GBL)</th>
                <th style="width: 14%;">OverDue<br/>Days</th>
              </tr>
            </thead>
            <tbody>
              ${orderRowsHtml}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="3" class="total-label">TOTAL</td>
                <td class="total-value">${grandTotalPendingGbl} GBL</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <div class="continued-text">continued ...</div>
        </body>
        </html>
      `;
    } else {
      // ══════════════════════════════════════════════════════════════
      // REPORT 2: STOCK CATEGORY OUTSTANDINGS (PRODUCTION VIEW)
      // ══════════════════════════════════════════════════════════════
      const totalPendingGbl = kpis.totalPendingGbl;
      const totalPendingPcs = kpis.totalPendingPcs;

      const categorizedMap = new Map<string, typeof filteredRequirements>();
      const uncategorizedItems: typeof filteredRequirements = [];

      filteredRequirements.forEach(req => {
        const cat = req.category || (req.skuCode?.toUpperCase().includes('112P') ? 'FINISHED GOODS' : '');
        if (cat) {
          if (!categorizedMap.has(cat)) categorizedMap.set(cat, []);
          categorizedMap.get(cat)!.push(req);
        } else {
          uncategorizedItems.push(req);
        }
      });

      let groupedRowsHtml = '';

      categorizedMap.forEach((items, catName) => {
        const catGbl = items.reduce((s, i) => s + i.balancePendingGbl, 0);
        const catPcs = items.reduce((s, i) => s + i.balancePendingPcs, 0);

        groupedRowsHtml += `
          <tr class="cat-row">
            <td class="col-item-cat">${catName.toUpperCase()}</td>
            <td class="col-qty-cat">${catGbl} GBL</td>
            <td class="col-alt-cat">(${catPcs.toLocaleString()} PCS)</td>
          </tr>
        `;

        items.forEach(req => {
          groupedRowsHtml += `
            <tr class="cat-item-row">
              <td class="col-item-indented">${req.skuName.toUpperCase()}</td>
              <td class="col-qty-indented">${req.balancePendingGbl} GBL</td>
              <td class="col-alt-indented">(${req.balancePendingPcs.toLocaleString()} PCS)</td>
            </tr>
          `;
        });
      });

      uncategorizedItems.forEach(req => {
        groupedRowsHtml += `
          <tr class="item-row">
            <td class="col-item-direct">${req.skuName.toUpperCase()}</td>
            <td class="col-qty-direct">${req.balancePendingGbl} GBL</td>
            <td class="col-alt-direct">(${req.balancePendingPcs.toLocaleString()} PCS)</td>
          </tr>
        `;
      });

      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Stock Category Outstandings</title>
          <style>
            @media print {
              @page { size: A4 portrait; margin: 12mm 14mm 12mm 14mm; }
              body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              color: #000;
              margin: 15px;
              background: #fff;
            }
            .header-wrap { text-align: center; line-height: 1.35; }
            .company-name { font-size: 13.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
            .company-address { font-size: 8.5pt; font-weight: normal; margin-top: 2px; }
            .company-email { font-size: 8.5pt; font-weight: normal; margin-top: 1px; }
            .category-subtitle { font-size: 9pt; margin-top: 5px; }
            .report-title { font-size: 12pt; font-weight: bold; margin-top: 2px; }
            .date-range { font-size: 8.5pt; font-weight: bold; margin-top: 2px; }
            
            .sub-info-bar {
              display: flex;
              justify-content: flex-end;
              text-align: right;
              font-size: 8pt;
              margin-top: 8px;
              margin-bottom: 2px;
            }
            .sub-info-right {
              text-align: right;
            }
            .page-no {
              font-size: 8.5pt;
            }
            .outstanding-title {
              font-size: 8.5pt;
              text-decoration: underline;
              margin-top: 1px;
            }

            table.tally-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 8.5pt;
              margin-top: 2px;
            }
            table.tally-table thead {
              border-top: 1px solid #000;
              border-bottom: 1px solid #000;
            }
            table.tally-table th {
              padding: 2.5px 6px;
              background: #fff;
              font-weight: bold;
              border: none;
            }
            .th-particulars {
              width: 64%;
              text-align: left;
              letter-spacing: 2px;
              vertical-align: middle;
            }
            .th-pending-title {
              text-align: right;
              padding-bottom: 0px;
            }
            .th-qty {
              text-align: right;
              width: 16%;
              font-weight: normal;
              padding-top: 0px;
            }
            .th-alt {
              text-align: right;
              width: 20%;
              font-weight: normal;
              padding-top: 0px;
            }

            table.tally-table td {
              padding: 1.5px 6px;
              border: none;
            }
            .cat-row td {
              font-weight: bold;
              padding-top: 4px;
            }
            .col-item-cat {
              text-transform: uppercase;
            }
            .col-qty-cat, .col-alt-cat {
              text-align: right;
              font-weight: bold;
            }
            .cat-item-row td {
              font-style: italic;
            }
            .col-item-indented {
              padding-left: 20px !important;
              text-transform: uppercase;
            }
            .col-qty-indented, .col-alt-indented {
              text-align: right;
            }
            .col-item-direct {
              text-transform: uppercase;
            }
            .col-qty-direct, .col-alt-direct {
              text-align: right;
            }

            .grand-total-row td {
              border-top: 1px solid #000;
              border-bottom: 3px double #000;
              font-weight: bold;
              padding: 3.5px 6px;
            }
            .col-total-title {
              letter-spacing: 3px;
              font-weight: bold;
            }
            .col-total-qty, .col-total-alt {
              text-align: right;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="header-wrap">
            <div class="company-name">${companyName}</div>
            <div class="company-address">${companyAddress}</div>
            <div class="company-email">E-Mail : ${companyEmail}</div>
            <div class="category-subtitle">All Stock Categories</div>
            <div class="report-title">Stock Category Outstandings</div>
            <div class="date-range">${dateRange}</div>
          </div>
          <div class="sub-info-bar">
            <div></div>
            <div class="sub-info-right">
              <div class="page-no">Page 1</div>
              <div class="outstanding-title">Sales Orders Outstanding</div>
            </div>
          </div>
          <table class="tally-table">
            <thead>
              <tr>
                <th class="th-particulars" rowspan="2">P a r t i c u l a r s</th>
                <th class="th-pending-title" colspan="2">Pending Orders</th>
              </tr>
              <tr>
                <th class="th-qty">Quantity</th>
                <th class="th-alt">(Alt. Units)</th>
              </tr>
            </thead>
            <tbody>
              ${groupedRowsHtml}
            </tbody>
            <tfoot>
              <tr class="grand-total-row">
                <td class="col-total-title">G r a n d &nbsp; T o t a l</td>
                <td class="col-total-qty">${totalPendingGbl} GBL</td>
                <td class="col-total-alt">(${totalPendingPcs.toLocaleString()} PCS)</td>
              </tr>
            </tfoot>
          </table>
        </body>
        </html>
      `;
    }

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
      printWin.close();
    }, 350);
  };

  // Keyboard shortcuts (Alt+E for Excel, Alt+P for Print)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        handleExportExcel();
      } else if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExportExcel, handlePrint]);

  // WhatsApp quick notification
  const openWhatsAppChat = (customerName: string, phone?: string, orderNumber?: string, balanceGbl?: number, dueDate?: string) => {
    if (!phone) {
      showToast('No phone number available for this customer', 'warning');
      return;
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = `Dear ${customerName}, update regarding Sales Order #${orderNumber || ''}: Balance pending is ${balanceGbl || 0} GBL scheduled for delivery by ${dueDate || 'earliest'}.`;
    window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="space-y-3.5 animate-in fade-in-50 duration-200">
      {/* ── TOP KPI BAR (MINIMAL CLEAN SUMMARY) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* KPI 1: Pending Orders */}
        <div className="bg-white border border-gray-200/90 rounded-xl p-3 shadow-2xs">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Pending Orders
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-gray-900 font-mono tracking-tight">{kpis.totalOrders}</span>
            <span className="text-xs text-gray-500 font-medium">orders</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Active in queue
          </p>
        </div>

        {/* KPI 2: Pending Demand */}
        <div className="bg-white border border-gray-200/90 rounded-xl p-3 shadow-2xs">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Pending Demand
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-gray-900 font-mono tracking-tight">{kpis.totalPendingGbl.toLocaleString()}</span>
            <span className="text-xs font-semibold text-gray-500">GBL</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5 font-mono">
            {kpis.totalPendingPcs.toLocaleString()} pcs demanded
          </p>
        </div>

        {/* KPI 3: Stock in Hand */}
        <div className="bg-white border border-gray-200/90 rounded-xl p-3 shadow-2xs">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Stock In Hand
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-emerald-600 font-mono tracking-tight">{kpis.totalStockGbl.toLocaleString()}</span>
            <span className="text-xs font-semibold text-gray-500">GBL</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Warehouse inventory
          </p>
        </div>

        {/* KPI 4: Shortfall */}
        <div className="bg-white border border-gray-200/90 rounded-xl p-3 shadow-2xs">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            To Produce (Shortfall)
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-2xl font-bold font-mono tracking-tight ${kpis.totalShortfallGbl > 0 ? 'text-rose-600' : 'text-gray-900'}`}>
              {kpis.totalShortfallGbl.toLocaleString()}
            </span>
            <span className="text-xs font-semibold text-gray-500">GBL</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5 font-mono">
            {kpis.totalShortfallPcs.toLocaleString()} pcs needed
          </p>
        </div>

        {/* KPI 5: Ready to Dispatch */}
        <div className="bg-white border border-gray-200/90 rounded-xl p-3 shadow-2xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Ready To Dispatch
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-gray-900 font-mono tracking-tight">{kpis.readyOrdersCount}</span>
            <span className="text-xs text-gray-500 font-medium">/ {pendingOrders.length} orders</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            100% stock available
          </p>
        </div>
      </div>

      {/* ── MINIMAL CONTROL TOOLBAR ── */}
      <div className="bg-white rounded-xl border border-gray-200/90 p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: View Mode Toggle (Order: Material View -> Production View -> Customer view) */}
        <div className="flex items-center gap-2">
          <div className="bg-gray-100 p-0.5 rounded-lg flex items-center">
            {/* Tab 1: Material View */}
            <button
              onClick={() => setViewMode('material_view')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'material_view'
                  ? 'bg-white text-gray-900 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Box className="w-3.5 h-3.5 text-gray-500" />
              <span>Material View</span>
              <span className="text-[10px] text-gray-400 font-mono">({filteredMaterials.length})</span>
            </button>

            {/* Tab 2: Production View */}
            <button
              onClick={() => setViewMode('production_view')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'production_view'
                  ? 'bg-white text-gray-900 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Factory className="w-3.5 h-3.5 text-gray-500" />
              <span>Production View</span>
              <span className="text-[10px] text-gray-400 font-mono">({filteredRequirements.length})</span>
            </button>

            {/* Tab 3: Customer view */}
            <button
              onClick={() => setViewMode('customer_view')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'customer_view'
                  ? 'bg-white text-gray-900 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Building className="w-3.5 h-3.5 text-gray-500" />
              <span>Customer view</span>
              <span className="text-[10px] text-gray-400 font-mono">({pendingOrders.length})</span>
            </button>
          </div>
        </div>

        {/* Center: Quick Shortfall Filters */}
        <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg text-xs">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
              filterMode === 'all'
                ? 'bg-white text-gray-900 shadow-2xs font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All ({viewMode === 'material_view' ? materialRequirements.length : viewMode === 'production_view' ? itemWiseRequirements.length : pendingOrders.length})
          </button>
          <button
            onClick={() => setFilterMode('shortfall')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
              filterMode === 'shortfall'
                ? 'bg-white text-rose-700 shadow-2xs font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Shortfall Only ({viewMode === 'material_view'
              ? materialRequirements.filter(m => m.deficit > 0).length
              : viewMode === 'production_view'
                ? itemWiseRequirements.filter(r => r.shortfallGbl > 0).length 
                : pendingOrders.filter(o => (o.items || []).some(item => {
                    const code = (item.skuCode || '').toLowerCase().trim();
                    const req = itemWiseRequirements.find(r => r.skuCode.toLowerCase() === code);
                    return req ? req.shortfallGbl > 0 : true;
                  })).length})
          </button>
          <button
            onClick={() => setFilterMode('in_stock')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
              filterMode === 'in_stock'
                ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            In Stock ({viewMode === 'material_view'
              ? materialRequirements.filter(m => m.deficit === 0).length
              : viewMode === 'production_view'
                ? itemWiseRequirements.filter(r => r.shortfallGbl === 0).length 
                : pendingOrders.filter(o => {
                    const items = o.items || [];
                    return items.length > 0 && items.every(item => {
                      const code = (item.skuCode || '').toLowerCase().trim();
                      const req = itemWiseRequirements.find(r => r.skuCode.toLowerCase() === code);
                      return req ? req.shortfallGbl === 0 : false;
                    });
                  }).length})
          </button>
        </div>

        {/* Right: Search & Export */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:border-gray-400 w-36 sm:w-48 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Export to Excel (Alt+E) */}
          <button
            onClick={handleExportExcel}
            className="px-2.5 py-1.5 bg-white hover:bg-emerald-50/70 border border-gray-200 hover:border-emerald-200 rounded-lg text-emerald-700 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 shadow-2xs"
            title="Export to Excel (Alt+E)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Excel</span>
          </button>

          {/* Export PDF */}
          <button
            onClick={handleExportPdf}
            className="px-2.5 py-1.5 bg-white hover:bg-rose-50/70 border border-gray-200 hover:border-rose-200 rounded-lg text-rose-700 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 shadow-2xs"
            title="Export / Download PDF Report"
          >
            <FileText className="w-3.5 h-3.5 text-rose-600" />
            <span className="hidden sm:inline">Export PDF</span>
          </button>

          {/* Print (Alt+P) */}
          <button
            onClick={handlePrint}
            className="px-2.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 shadow-2xs"
            title="Print Report (Alt+P)"
          >
            <Printer className="w-3.5 h-3.5 text-gray-600" />
            <span className="hidden sm:inline">Print</span>
          </button>

        </div>
      </div>

      {/* ── MAIN CONTENT AREA ── */}
      {viewMode === 'material_view' ? (
        /* ═══════════════════════════════════════════════════════════════
           VIEW 1: MATERIAL VIEW (RAW MATERIAL / BOM REQUIREMENT ANALYSIS)
        ═══════════════════════════════════════════════════════════════ */
        <div className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto min-h-[350px]">
            <table className="w-full text-left divide-y divide-gray-200">
              <thead className="bg-gray-50/90 text-[11px] font-bold text-gray-600 uppercase tracking-wider select-none">
                <tr>
                  <th className="py-3 px-3 w-8 text-center">#</th>
                  <th className="py-3 px-4">Raw Material / Component Description</th>
                  <th className="py-3 px-3 text-center">Category</th>
                  <th className="py-3 px-3 text-center">Stock In Hand</th>
                  <th className="py-3 px-3 text-center">Total Required Qty</th>
                  <th className="py-3 px-4 text-center bg-rose-50/50 text-rose-900 border-x border-rose-100">
                    Shortfall (Deficit)
                  </th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-center">Contributing Demands</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150 text-xs font-medium">
                {filteredMaterials.map((mat, idx) => {
                  const isExpanded = expandedMaterials.has(mat.materialCode);
                  const hasDeficit = mat.deficit > 0;

                  return (
                    <React.Fragment key={mat.materialCode}>
                      <tr
                        onClick={() => toggleSingleMaterial(mat.materialCode)}
                        className="hover:bg-gray-50/80 transition-colors cursor-pointer border-b border-gray-100"
                      >
                        {/* Expand Button & Index */}
                        <td className="py-2.5 px-3 text-center text-gray-400 font-mono">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSingleMaterial(mat.materialCode);
                            }}
                            className="p-1 hover:bg-gray-200 rounded cursor-pointer transition-colors"
                          >
                            <ChevronRight className={`w-3.5 h-3.5 text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </button>
                        </td>

                        {/* Raw Material Name & Code */}
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-gray-900">
                            {mat.materialName}
                          </div>
                          <div className="text-[10.5px] text-gray-400 font-mono mt-0.5">
                            {mat.materialCode} • {mat.uom}
                          </div>
                        </td>

                        {/* Category */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-semibold inline-block">
                            {mat.category || 'Raw Material'}
                          </span>
                        </td>

                        {/* Stock In Hand */}
                        <td className="py-2.5 px-3 text-center">
                          <div className={`font-bold font-mono text-xs ${mat.stockInHand > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {mat.stockInHand.toLocaleString()} <span className="text-[10px] text-gray-500 font-normal">{mat.uom}</span>
                          </div>
                        </td>

                        {/* Total Required Qty */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="font-semibold font-mono text-gray-900 text-xs">
                            {mat.totalRequiredQty.toLocaleString()} <span className="text-[10px] text-gray-400 font-normal">{mat.uom}</span>
                          </div>
                          {mat.shortfallRequiredQty > 0 && mat.shortfallRequiredQty !== mat.totalRequiredQty && (
                            <div className="text-[10px] text-gray-400 font-mono">
                              ({mat.shortfallRequiredQty.toLocaleString()} {mat.uom} for deficit)
                            </div>
                          )}
                        </td>

                        {/* Shortfall (Deficit) */}
                        <td className="py-2.5 px-4 text-center">
                          {hasDeficit ? (
                            <div>
                              <span className="font-mono text-xs font-bold text-rose-600">
                                {mat.deficit.toLocaleString()} {mat.uom} Deficit
                              </span>
                              <div className="text-[10px] text-rose-500 font-mono">
                                Required for pending orders
                              </div>
                            </div>
                          ) : (
                            <span className="font-mono text-xs text-emerald-600 font-medium">
                              In Stock
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {mat.status === 'In Stock' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-mono">
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>Sufficient</span>
                            </span>
                          )}
                          {mat.status === 'Partial' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60 font-mono">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Partial</span>
                            </span>
                          )}
                          {mat.status === 'Shortfall' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60 font-mono">
                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                              <span>Shortfall</span>
                            </span>
                          )}
                        </td>

                        {/* Contributing Demands */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className="text-[11px] text-gray-700 font-mono font-medium bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-md">
                            {mat.contributingFgCount} FG • {mat.contributingOrderCount} order{mat.contributingOrderCount > 1 ? 's' : ''}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {hasDeficit ? (
                              <button
                                onClick={() => navigate('/purchases/batches')}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1"
                                title="Create Purchase Batch for this raw material"
                              >
                                <span>Procure</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => navigate('/stock')}
                                className="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded text-xs font-semibold cursor-pointer transition-colors"
                                title="View inventory stock"
                              >
                                <span>View Stock</span>
                              </button>
                            )}

                            <button
                              onClick={() => toggleSingleMaterial(mat.materialCode)}
                              className="px-2 py-1 text-gray-500 hover:text-gray-800 text-xs font-medium cursor-pointer"
                            >
                              {isExpanded ? 'Hide' : 'Orders'}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Sub-Table: Contributing FG and Sales Orders */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-gray-200">
                          <td colSpan={10} className="p-3 pl-8">
                            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-700">
                                  Orders & Products Demanding {mat.materialName} ({mat.contributions.length} allocations)
                                </span>
                                <span className="text-[11px] text-gray-500 font-mono">
                                  Gross Required: {mat.totalRequiredQty.toLocaleString()} {mat.uom}
                                </span>
                              </div>

                              <table className="w-full text-left text-xs divide-y divide-gray-150">
                                <thead className="bg-gray-50/70 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider">
                                  <tr>
                                    <th className="py-2 px-3">SO No.</th>
                                    <th className="py-2 px-3">Customer / Party Name</th>
                                    <th className="py-2 px-3">Finished Good (FG)</th>
                                    <th className="py-2 px-3 text-center">Due On</th>
                                    <th className="py-2 px-3 text-center">FG Pending Qty</th>
                                    <th className="py-2 px-3 text-center">BOM Ratio</th>
                                    <th className="py-2 px-3 text-center font-semibold text-rose-700">Material Required</th>
                                    <th className="py-2 px-3 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 font-medium">
                                  {mat.contributions.map((c, cIdx) => (
                                    <tr 
                                      key={`${c.orderId}-${c.fgSkuCode}-${cIdx}`}
                                      onClick={() => onViewOrder(c.rawOrder)}
                                      className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                                    >
                                      <td className="py-2 px-3 font-mono font-bold text-blue-700 hover:text-blue-900">
                                        {c.orderNumber}
                                      </td>
                                      <td className="py-2 px-3 font-semibold text-gray-900">
                                        {c.customerName}
                                      </td>
                                      <td className="py-2 px-3">
                                        <div className="font-semibold text-gray-800">{c.fgSkuName}</div>
                                        <div className="text-[10px] text-gray-400 font-mono">{c.fgSkuCode}</div>
                                      </td>
                                      <td className="py-2 px-3 text-center font-mono text-gray-600">
                                        {formatDateDDMMYYYY(c.promisedDate)}
                                      </td>
                                      <td className="py-2 px-3 text-center font-mono text-gray-700">
                                        {c.pendingGbl} GBL <span className="text-[10px] text-gray-400">({c.pendingPcs.toLocaleString()} pcs)</span>
                                      </td>
                                      <td className="py-2 px-3 text-center font-mono text-gray-500">
                                        {c.perBookBasis} {mat.uom}/pc
                                      </td>
                                      <td className="py-2 px-3 text-center font-mono font-bold text-rose-600">
                                        {c.requiredQty.toLocaleString()} {mat.uom}
                                      </td>
                                      <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                        <button
                                          onClick={() => onViewOrder(c.rawOrder)}
                                          className="px-2 py-0.5 text-blue-600 hover:text-blue-800 text-xs font-semibold cursor-pointer hover:underline"
                                        >
                                          View SO
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {filteredMaterials.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-gray-500">
                      <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
                      <p className="font-bold text-sm text-gray-800">No material requirements found!</p>
                      <p className="text-xs text-gray-400">All materials are either in stock or there are no pending customer sales orders.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'production_view' ? (
        /* ═══════════════════════════════════════════════════════════════
           VIEW 2: STOCK ITEM PRODUCTION VIEW (ITEM-WISE MRP)
        ═══════════════════════════════════════════════════════════════ */
        <div className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto min-h-[350px]">
            <table className="w-full text-left divide-y divide-gray-200">
              <thead className="bg-gray-50/90 text-[11px] font-bold text-gray-600 uppercase tracking-wider select-none">
                <tr>
                  <th className="py-3 px-3 w-8 text-center">#</th>
                  <th className="py-3 px-4">Stock Item / SKU Description</th>
                  <th className="py-3 px-3 text-center">Conversion</th>
                  <th className="py-3 px-3 text-center">Stock In Hand</th>
                  <th className="py-3 px-3 text-center">Total Ordered</th>
                  <th className="py-3 px-3 text-center">Dispatched</th>
                  <th className="py-3 px-3 text-center">Balance Due</th>
                  <th className="py-3 px-4 text-center bg-rose-50/50 text-rose-900 border-x border-rose-100">
                    Production Shortfall
                  </th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150 text-xs font-medium">
                {filteredRequirements.map((req, idx) => {
                  const isExpanded = expandedSkus.has(req.skuCode);
                  const hasShortfall = req.shortfallGbl > 0;

                  return (
                    <React.Fragment key={req.skuCode}>
                      <tr 
                        key={req.skuCode}
                        onClick={() => toggleSingleSku(req.skuCode)}
                        className="hover:bg-gray-50/80 transition-colors cursor-pointer border-b border-gray-100"
                      >
                        {/* Expand Button & Index */}
                        <td className="py-2.5 px-3 text-center text-gray-400 font-mono">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSingleSku(req.skuCode);
                            }}
                            className="p-1 hover:bg-gray-200 rounded cursor-pointer transition-colors"
                          >
                            <ChevronRight className={`w-3.5 h-3.5 text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </button>
                        </td>

                        {/* Stock Item Name & Code */}
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-gray-900">
                            {req.skuName}
                          </div>
                          <div className="text-[10.5px] text-gray-400 font-mono mt-0.5">
                            {req.skuCode} • {req.orderCount} pending order{req.orderCount > 1 ? 's' : ''}
                          </div>
                        </td>

                        {/* Conversion */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-semibold inline-block">
                            {req.pcsPerGbl} pcs/GBL
                          </span>
                        </td>

                        {/* Stock In Hand */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="font-bold font-mono text-emerald-600 text-xs">
                            {req.stockInHandGbl} <span className="text-[10px] text-gray-500">GBL</span>
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono">
                            {req.stockInHandPcs.toLocaleString()} pcs
                          </div>
                        </td>

                        {/* Total Ordered */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="font-semibold font-mono text-gray-900 text-xs">
                            {req.totalOrderedGbl} <span className="text-[10px] text-gray-400">GBL</span>
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono">
                            {req.totalOrderedPcs.toLocaleString()} pcs
                          </div>
                        </td>

                        {/* Dispatched */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="font-mono text-gray-500 text-xs">
                            {req.totalDispatchedGbl} <span className="text-[10px] text-gray-400">GBL</span>
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono">
                            {req.totalDispatchedPcs.toLocaleString()} pcs
                          </div>
                        </td>

                        {/* Balance Due */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="font-semibold font-mono text-amber-700 text-xs">
                            {req.balancePendingGbl} <span className="text-[10px] text-amber-600">GBL</span>
                          </div>
                          <div className="text-[10px] text-amber-600/80 font-mono">
                            {req.balancePendingPcs.toLocaleString()} pcs
                          </div>
                        </td>

                        {/* Production Shortfall (MRP Calculation) */}
                        <td className="py-2.5 px-4 text-center">
                          {hasShortfall ? (
                            <div>
                              <span className="font-mono text-xs font-bold text-rose-600">
                                {req.shortfallGbl} GBL Deficit
                              </span>
                              <div className="text-[10px] text-rose-500 font-mono">
                                {req.shortfallPcs.toLocaleString()} pcs to mfg
                              </div>
                            </div>
                          ) : (
                            <span className="font-mono text-xs text-emerald-600 font-medium">
                              In Stock
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-3 text-center">
                          {req.productionStatus === 'In Production' ? (
                            <span className="text-[11px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                              In Production
                            </span>
                          ) : req.productionStatus === 'Ready' ? (
                            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              Ready
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                              Needs Mfg
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {hasShortfall && req.productionStatus !== 'In Production' ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartProduction(
                                    req.skuCode,
                                    req.skuName,
                                    req.shortfallGbl,
                                    req.orders[0]?.orderNumber,
                                    req.orders[0]?.orderId
                                  );
                                }}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
                                title="Start production batch for this shortfall"
                              >
                                Produce
                              </button>
                            ) : !hasShortfall ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate('/dispatch');
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                                title="Stock is available — proceed to Dispatch"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>Dispatch</span>
                              </button>
                            ) : null}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSingleSku(req.skuCode);
                              }}
                              className="px-2 py-1 text-gray-600 hover:text-gray-900 text-xs font-medium cursor-pointer"
                              title="Toggle customer orders"
                            >
                              {isExpanded ? 'Hide' : 'Orders'}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* ── EXPANDED DETAILED ORDERS SUB-TABLE ── */}
                      {isExpanded && (
                        <tr className="bg-slate-50/50 border-b border-gray-200">
                          <td colSpan={10} className="p-3 pl-8 pr-4">
                            <div className="bg-white rounded-lg border border-gray-200 shadow-2xs overflow-hidden">
                              <div className="px-3.5 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-xs font-semibold text-gray-700">
                                <span className="flex items-center gap-1.5">
                                  <Building className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Customer Orders Awaiting <strong className="text-gray-900">{req.skuName}</strong> ({req.orders.length})</span>
                                </span>
                                <span className="text-[11px] text-gray-500 font-mono">
                                  Pending: {req.balancePendingGbl} GBL ({req.balancePendingPcs.toLocaleString()} Pcs)
                                </span>
                              </div>

                              <table className="w-full text-left text-xs divide-y divide-gray-150">
                                <thead className="bg-gray-50/70 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider">
                                  <tr>
                                    <th className="py-2 px-3">SO No.</th>
                                    <th className="py-2 px-3">Order Date</th>
                                    <th className="py-2 px-3">Customer / Party Name</th>
                                    <th className="py-2 px-3">City / Phone</th>
                                    <th className="py-2 px-3 text-center">Due On</th>
                                    <th className="py-2 px-3 text-center">Ordered</th>
                                    <th className="py-2 px-3 text-center">Dispatched</th>
                                    <th className="py-2 px-3 text-center font-semibold text-amber-800">Pending</th>
                                    <th className="py-2 px-3 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 font-medium">
                                  {req.orders.map(o => (
                                    <tr 
                                      key={o.orderId} 
                                      onClick={() => onViewOrder(o.rawOrder)}
                                      className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                                    >
                                      <td className="py-2 px-3">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onViewOrder(o.rawOrder);
                                          }}
                                          className="font-bold text-blue-700 hover:text-blue-900 font-mono cursor-pointer hover:underline"
                                        >
                                          {o.orderNumber}
                                        </button>
                                      </td>
                                      <td className="py-2 px-3 font-mono text-gray-600">{formatDateDDMMYYYY(o.orderDate)}</td>
                                      <td className="py-2 px-3 font-semibold text-gray-900">{o.customerName}</td>
                                      <td className="py-2 px-3 text-gray-500">
                                        <div className="flex items-center gap-1.5">
                                          <span>{o.city || '—'}</span>
                                          {o.customerPhone && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openWhatsAppChat(o.customerName, o.customerPhone, o.orderNumber, o.pendingGbl, o.promisedDate);
                                              }}
                                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-mono cursor-pointer transition-colors"
                                              title="Send WhatsApp update to customer"
                                            >
                                              <MessageSquare className="w-2.5 h-2.5 text-emerald-600" />
                                              <span>{o.customerPhone}</span>
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-2 px-3 text-center font-mono text-gray-700">
                                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-medium">
                                          {formatDateDDMMYYYY(o.promisedDate)}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3 text-center font-mono text-gray-700">
                                        {o.orderedGbl} GBL <span className="text-[10px] text-gray-400">({o.orderedPcs} pcs)</span>
                                      </td>
                                      <td className="py-2 px-3 text-center font-mono text-gray-500">
                                        {o.dispatchedGbl} GBL
                                      </td>
                                      <td className="py-2 px-3 text-center font-mono font-semibold text-amber-700">
                                        {o.pendingGbl} GBL <span className="text-[10px] text-amber-600">({o.pendingPcs} pcs)</span>
                                      </td>
                                      <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-2">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onViewOrder(o.rawOrder);
                                            }}
                                            className="px-2 py-0.5 text-blue-600 hover:text-blue-800 text-xs font-semibold cursor-pointer hover:underline"
                                          >
                                            View SO
                                          </button>
                                          {hasShortfall && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleStartProduction(req.skuCode, req.skuName, o.pendingGbl, o.orderNumber, o.orderId);
                                              }}
                                              className="px-2 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-xs font-semibold cursor-pointer transition-colors flex items-center gap-0.5"
                                              title={`Produce ${o.pendingGbl} GBL for ${o.orderNumber}`}
                                            >
                                              <Factory className="w-3 h-3" />
                                              <span>Produce</span>
                                            </button>
                                          )}
                                          {!hasShortfall && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/dispatch?orderId=${encodeURIComponent(o.orderId)}`);
                                              }}
                                              className="px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-xs font-semibold cursor-pointer transition-colors flex items-center gap-0.5"
                                              title="Dispatch this sales order"
                                            >
                                              <Truck className="w-3 h-3" />
                                              <span>Dispatch</span>
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {filteredRequirements.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-gray-500">
                      <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
                      <p className="font-bold text-sm text-gray-800">No pending production shortfalls!</p>
                      <p className="text-xs text-gray-400">All pending orders are either fulfilled or have sufficient finished stock in warehouse.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════
           VIEW 3: CUSTOMER VIEW (ORDER-WISE DRILLDOWN)
        ═══════════════════════════════════════════════════════════════ */
        <div className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto min-h-[350px]">
            <table className="w-full text-left divide-y divide-gray-200">
              <thead className="bg-gray-50/90 text-[11px] font-bold text-gray-600 uppercase tracking-wider select-none">
                <tr>
                  <th className="py-3.5 px-4 w-28 whitespace-nowrap">SO No.</th>
                  <th className="py-3.5 px-3 w-28 text-center whitespace-nowrap">Order Date</th>
                  <th className="py-3.5 px-4 min-w-[190px]">Party / Customer Name</th>
                  <th className="py-3.5 px-3 w-28 whitespace-nowrap">City / Region</th>
                  <th className="py-3.5 px-3 w-28 text-center whitespace-nowrap">Due On</th>
                  <th className="py-3.5 px-4 min-w-[360px]">Items Required & Balance</th>
                  <th className="py-3.5 px-3 w-32 text-right whitespace-nowrap">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150 text-xs font-medium">
                {filteredCustomerOrders.map(order => {
                  const items = order.items || [];
                  const totalPendingGbl = items.reduce((sum, item) => {
                    const pcsPerGbl = item.pcsPerGbl || 100;
                    const pendingPcs = Math.max(0, (item.quantity || 0) - (item.dispatchedQty || 0));
                    return sum + Math.ceil(pendingPcs / pcsPerGbl);
                  }, 0);

                  return (
                    <tr 
                      key={order._id || order.orderNumber} 
                      onClick={() => onViewOrder(order)}
                      className="hover:bg-gray-50/70 transition-colors cursor-pointer border-b border-gray-100"
                    >
                      {/* SO Number */}
                      <td className="align-middle py-3 px-4 w-28 whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewOrder(order);
                          }}
                          className="font-bold text-blue-700 hover:text-blue-900 font-mono text-xs cursor-pointer hover:underline"
                        >
                          {order.orderNumber}
                        </button>
                      </td>

                      {/* Date */}
                      <td className="align-middle py-3 px-3 w-28 text-center whitespace-nowrap font-mono text-xs text-gray-600">
                        {formatDateDDMMYYYY(order.orderDate)}
                      </td>

                      {/* Customer */}
                      <td className="align-middle py-3 px-4 min-w-[190px]">
                        <div className="font-semibold text-gray-900">{order.customerName}</div>
                        {order.customerPhone && (
                          <div className="mt-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openWhatsAppChat(order.customerName, order.customerPhone, order.orderNumber, totalPendingGbl, order.promisedDate);
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-mono cursor-pointer transition-colors"
                              title="Send WhatsApp update to customer"
                            >
                              <MessageSquare className="w-2.5 h-2.5 text-emerald-600" />
                              <span>{order.customerPhone}</span>
                            </button>
                          </div>
                        )}
                      </td>

                      {/* City */}
                      <td className="align-middle py-3 px-3 w-28 whitespace-nowrap text-gray-600">
                        {order.city || order.region || '—'}
                      </td>

                      {/* Due On */}
                      <td className="align-middle py-3 px-3 w-28 text-center whitespace-nowrap font-mono text-xs text-gray-600">
                        {formatDateDDMMYYYY(order.promisedDate)}
                      </td>

                      {/* Items Required & Balance */}
                      <td className="align-middle py-2.5 px-4 min-w-[360px]">
                        <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
                          {items.map((item, iIdx) => {
                            const pcsPerGbl = item.pcsPerGbl || 100;
                            const orderedPcs = Number(item.quantity) || 0;
                            const dispatchedPcs = Number(item.dispatchedQty) || 0;
                            const pendingPcs = Math.max(0, orderedPcs - dispatchedPcs);
                            const pendingGbl = item.gbl || Math.ceil(pendingPcs / pcsPerGbl);

                            const code = (item.skuCode || '').toLowerCase().trim();
                            const req = itemWiseRequirements.find(r => r.skuCode.toLowerCase() === code);
                            const isInStock = req ? req.shortfallGbl === 0 : false;

                            return (
                              <div
                                key={item._id || item.skuCode || iIdx}
                                style={{ animationDelay: `${iIdx * 35}ms` }}
                                title={`${item.itemName || item.skuCode} | Code: ${item.skuCode} | Conversion: ${pcsPerGbl} pcs/GBL | Pending: ${pendingGbl} GBL (${pendingPcs.toLocaleString()} pcs) | Stock: ${isInStock ? 'In Stock' : 'Needs Production'}`}
                                className="group/item flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50/90 hover:bg-blue-50/60 border border-slate-200/70 hover:border-blue-300/80 shadow-3xs hover:shadow-2xs transition-all duration-150 animate-in fade-in"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {/* Cute live pulse status dot */}
                                  <span className="relative flex h-2 w-2 shrink-0">
                                    <span
                                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${
                                        isInStock ? 'bg-emerald-400' : 'bg-rose-400'
                                      }`}
                                    />
                                    <span
                                      className={`relative inline-flex rounded-full h-2 w-2 ${
                                        isInStock ? 'bg-emerald-500' : 'bg-rose-500'
                                      }`}
                                    />
                                  </span>

                                  <span
                                    className="font-semibold text-slate-800 group-hover/item:text-blue-900 text-[11.5px] leading-tight whitespace-normal break-words"
                                    title={item.itemName || item.skuCode}
                                  >
                                    {item.itemName || item.skuCode}
                                  </span>
                                </div>

                                {/* Cute compact right quantity */}
                                <div className="flex items-center gap-1.5 shrink-0 font-mono text-right pl-1">
                                  {!isInStock && pendingGbl > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleStartProduction(
                                          item.skuCode || '',
                                          item.itemName || item.skuCode || '',
                                          pendingGbl,
                                          order.orderNumber,
                                          order._id
                                        );
                                      }}
                                      className="px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[10.5px] font-semibold cursor-pointer transition-colors flex items-center gap-0.5 shadow-3xs"
                                      title={`Produce ${pendingGbl} GBL for ${order.orderNumber}`}
                                    >
                                      <Factory className="w-3 h-3 text-blue-600" />
                                      <span>Produce</span>
                                    </button>
                                  )}
                                  <span className="font-bold text-blue-700 bg-white group-hover/item:bg-blue-50 px-1.5 py-0.5 rounded border border-slate-200/90 text-xs shadow-3xs transition-colors">
                                    {pendingGbl} <span className="text-[9.5px] font-semibold text-slate-500">GBL</span>
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    ({pendingPcs.toLocaleString()} pcs)
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {items.length === 0 && (
                            <span className="text-gray-400 italic text-xs">No items listed</span>
                          )}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="align-middle py-3 px-3 w-32 text-right whitespace-nowrap font-semibold font-mono text-gray-900">
                        ₹{(order.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}

                {filteredCustomerOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500">
                      <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
                      <p className="font-bold text-sm text-gray-800">No pending sales orders!</p>
                      <p className="text-xs text-gray-400">No orders match the current filter or search criteria.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PRODUCTION ORDER WIZARD MODAL (In-place inside Sales Order module) ── */}
      {productionWizardConfig?.isOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9000] flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-200"
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            width: '100vw',
            height: '100vh',
            maxWidth: '100vw',
            maxHeight: '100vh',
          }}
          onClick={() => setProductionWizardConfig(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full flex flex-col my-auto border border-gray-150 animate-in zoom-in-95 duration-200 overflow-hidden relative"
            style={{ maxWidth: 1260, height: '94vh', maxHeight: '94vh' }}
            onClick={e => e.stopPropagation()}
          >
            <NewProductionOrderWizard
              onCancel={() => setProductionWizardConfig(null)}
              onCreated={(order) => {
                if (productionWizardConfig.skuCode) {
                  setInProductionSkus(prev => new Set(prev).add(productionWizardConfig.skuCode));
                }
                setProductionWizardConfig(null);
                showToast(`Production Order ${order.orderNumber} created successfully!`, 'success');
                if (onRefresh) onRefresh();
              }}
              companyId={selectedCompany?._id}
              initialSkus={loadedSkus}
              initialSkuCode={productionWizardConfig.skuCode}
              initialSkuName={productionWizardConfig.skuName}
              initialPlannedQty={Math.max(1, productionWizardConfig.shortfallGbl)}
              initialPlannedUom="GBL"
              salesOrderRef={productionWizardConfig.orderRef}
              salesOrderId={productionWizardConfig.orderId}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

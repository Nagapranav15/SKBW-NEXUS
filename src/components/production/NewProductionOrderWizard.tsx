import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { 
  Calendar, ChevronDown, Plus, Trash2, RotateCcw, 
  Layers, Package, Receipt, Calculator, FileText, 
  Check, X, Search, Loader2, Settings, Building2, 
  MapPin, Copy, Sparkles, Zap, Eye, Save, Box,
  BarChart3, Clock, Pencil, Tag, TrendingUp, Scissors
} from 'lucide-react';
import { ProductionOrder } from '../../types/production';
import { getNextProductionOrderNumber, createProductionOrder, updateProductionOrder, getProductionOrders } from '../../api/productionApi';
import { getSkusV2, getWarehouseHierarchyV2, SkuV2, WarehouseLocationV2, getProductionMaterialRates, MaterialRateInfo, getMetadataV2, updateMetadataV2, getBalancesV2 } from '../../api/mfgApiV2';
import { LocationSelectPopup } from '../stock_v2/LocationSelectPopup';
import { BomCopyPasteControls } from '../inventory_v2/BomCopyPasteControls';
import { copyBom, useCopiedBom } from '../../utils/bomClipboard';
import { ProfitPricingState } from '../../utils/costingUtils';
import { CuttingSlipModal } from './CuttingSlipModal';
import Modal from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { convertRateToUom, convertUom } from '../../utils/uomConversion';
import { getItemClassification } from '../../utils/skuClassification';
export interface NewProductionOrderWizardProps {
  onCancel: () => void;
  onCreated: (order: ProductionOrder) => void;
  companyId?: string;
  initialSkus?: SkuV2[];
  editOrder?: ProductionOrder | null;
  existingOrders?: ProductionOrder[];
  initialSkuCode?: string;
  initialSkuName?: string;
  initialPlannedQty?: number;
  initialPlannedUom?: string;
  salesOrderRef?: string;
  salesOrderId?: string;
}

export interface DepartmentPreset {
  id: string;
  name: string;
  locationName: string;
  warehouseId?: string;
  floorId?: string;
  zoneId?: string;
  locationId?: string;
}

export interface PredefinedCost {
  id: string;
  name: string;
  basis: 'Per BOM' | 'Total / Batch' | 'Per Batch' | 'Per GBL' | 'Per Piece' | string;
  defaultRate: number;
  appliedAs: 'Per BOM' | 'Total Cost for this production/batch' | 'Total Cost for this production' | 'Per Unit (GBL)' | 'Per Unit (PCS)' | 'Per Batch' | string;
}

export type BomRateMode = 'avg_purchase' | 'fifo' | 'custom';

interface MaterialRow {
  id: string;
  skuId?: string;
  component: string;
  code: string;
  uom: string;
  requiredQty: number;
  sourceLocation: string;
  locationId?: string;
  warehouseId?: string;
  floorId?: string;
  zoneId?: string;
  rateMode: BomRateMode;
  rate: number;
  computedAvgRate?: number;
  computedFifoRate?: number;
  /** Rate used in the most recently created production order for this material */
  lastProductionRate?: number;
  /** Production cost calculated from finished/semi-finished goods production orders */
  productionRate?: number;
  fifoBatchInfo?: {
    batchNumber: string;
    date?: string;
    remainingQty?: number;
    rate: number;
    majorityBatch?: string;
    majorityRate?: number;
    majorityQty?: number;
    weightedRate?: number;
    summary?: string;
    allocatedBatches?: Array<{
      batchNumber: string;
      qty: number;
      rate: number;
      date?: string;
      batchTotalRemaining?: number;
    }>;
  };
  batchesAllocated?: Array<{
    batchNumber: string;
    qty: number;
    rate: number;
  }>;
  batchCount?: number;
  amount: number;
  basePerPiece?: number;
  recipeQty?: number;
}

interface ScrapRow {
  id: string;
  item: string;
  uom: string;
  qty: number;
  rate: number;
  amount: number;
}

interface AdditionalCostRow {
  id: string;
  costType: string;
  basis: 'Per BOM' | 'Total / Batch' | 'Per Batch' | 'Per GBL' | 'Per Piece' | string;
  amount: number;
  appliedAs: 'Per BOM' | 'Total Cost for this production/batch' | 'Total Cost for this production' | 'Per Unit (GBL)' | 'Per Unit (PCS)' | 'Per Batch' | string;
}

export const buildCleanDepartmentPresets = (locs: WarehouseLocationV2[]): DepartmentPreset[] => {
  if (!Array.isArray(locs) || locs.length === 0) {
    return [
      { id: 'dept-notebook', name: 'Notebook Manufacturing', locationName: 'Main Factory' },
      { id: 'dept-ruling', name: 'Ruling & Cutting Line', locationName: 'Main Factory' },
      { id: 'dept-printing', name: 'Printing Department', locationName: 'Main Factory' },
      { id: 'dept-binding', name: 'Binding Department', locationName: 'Main Factory' },
      { id: 'dept-packing', name: 'Packing Department', locationName: 'Main Factory' },
      { id: 'dept-cover', name: 'Index & Cover Prep', locationName: 'Main Factory' },
      { id: 'dept-dispatch', name: 'Dispatch Department', locationName: 'Main Factory' }
    ];
  }

  function findLoc(names: string[]) {
    for (const name of names) {
      const found = locs.find(l => (l.name || '').toLowerCase() === name.toLowerCase());
      if (found) return found;
    }
    return locs[0] || null;
  }

  function getHierarchy(leaf: WarehouseLocationV2 | null) {
    if (!leaf) return { locationName: 'Main Factory', warehouseId: '', floorId: '', zoneId: '', locationId: '' };
    const chain = [leaf];
    let curr: WarehouseLocationV2 | null = leaf;
    while (curr && curr.parentId) {
      const p = locs.find(l => String(l._id) === String(curr!.parentId));
      if (p) { chain.unshift(p); curr = p; } else break;
    }
    const wh = chain[0] || leaf;
    const fl = chain.length > 1 ? chain[1] : null;
    const zn = chain.length > 2 ? chain[2] : null;
    const loc = chain.length > 3 ? chain[3] : (zn || fl || wh);
    const locPath = chain.map(c => c.name).join(' > ');
    return {
      locationName: locPath,
      warehouseId: String(wh._id),
      floorId: fl ? String(fl._id) : '',
      zoneId: zn ? String(zn._id) : '',
      locationId: String(loc._id)
    };
  }

  const deptConfigs = [
    { id: 'dept-notebook', name: 'Notebook Manufacturing', targets: ['A', 'GND', 'SKBW'] },
    { id: 'dept-ruling', name: 'Ruling & Cutting Line', targets: ['B', 'GND', 'SKBW'] },
    { id: 'dept-printing', name: 'Printing Department', targets: ['C', 'GND', 'SKBW'] },
    { id: 'dept-binding', name: 'Binding Department', targets: ['A1', '1ST', 'SKBW'] },
    { id: 'dept-packing', name: 'Packing Department', targets: ['B1', '1ST', 'SKBW'] },
    { id: 'dept-cover', name: 'Index & Cover Prep', targets: ['OPEN', 'GND', 'LOM'] },
    { id: 'dept-dispatch', name: 'Dispatch Department', targets: ['MARUTI', 'OPEN', 'LOM'] }
  ];

  return deptConfigs.map(cfg => {
    const locDoc = findLoc(cfg.targets);
    const h = getHierarchy(locDoc);
    return {
      id: cfg.id,
      name: cfg.name,
      ...h
    };
  });
};

const DEFAULT_DEPARTMENT_PRESETS: DepartmentPreset[] = buildCleanDepartmentPresets([]);

export const DEFAULT_PREDEFINED_COSTS: PredefinedCost[] = [
  { id: 'cost-printing', name: 'Cover Printing & Lamination (Job Work)', basis: 'Per Piece', defaultRate: 3, appliedAs: 'Per Unit (PCS)' },
  { id: 'cost-elec', name: 'Electricity / Power Charges', basis: 'Per GBL', defaultRate: 25, appliedAs: 'Per Unit (GBL)' },
  { id: 'cost-labour', name: 'Direct Labour / Helper Wages', basis: 'Per GBL', defaultRate: 35, appliedAs: 'Per Unit (GBL)' },
  { id: 'cost-wire', name: 'Stitching Wire & Adhesive', basis: 'Per GBL', defaultRate: 15, appliedAs: 'Per Unit (GBL)' },
  { id: 'cost-machine', name: 'Machine Running & Tooling', basis: 'Total / Batch', defaultRate: 350, appliedAs: 'Total Cost for this production' },
  { id: 'cost-pack', name: 'Packaging & Shrink Wrap', basis: 'Per GBL', defaultRate: 20, appliedAs: 'Per Unit (GBL)' },
  { id: 'cost-handling', name: 'Internal Handling & Shifting', basis: 'Total / Batch', defaultRate: 200, appliedAs: 'Total Cost for this production' }
];

export interface ScrapPreset {
  id: string;
  item: string;
  uom: string;
  defaultRate: number;
}

const DEFAULT_SCRAP_PRESETS: ScrapPreset[] = [
  { id: 'scrap-trimmings', item: 'Paper Trimmings & Offcuts', uom: 'KG', defaultRate: 22 },
  { id: 'scrap-printed', item: 'Printed Waste Paper / Misprints', uom: 'KG', defaultRate: 18 },
  { id: 'scrap-board', item: 'Duplex & Grey Board Scrap', uom: 'KG', defaultRate: 14 },
  { id: 'scrap-cores', item: 'Reel Cores & End Caps', uom: 'PCS', defaultRate: 15 },
  { id: 'scrap-kraft', item: 'Kraft Paper Waste', uom: 'KG', defaultRate: 16 },
  { id: 'scrap-wire', item: 'Binding Wire & Metal Shavings', uom: 'KG', defaultRate: 35 }
];

export const NewProductionOrderWizard: React.FC<NewProductionOrderWizardProps> = ({
  onCancel,
  onCreated,
  companyId,
  initialSkus = [],
  editOrder = null,
  existingOrders = [],
  initialSkuCode,
  initialSkuName,
  initialPlannedQty,
  initialPlannedUom,
  salesOrderRef,
  salesOrderId,
}) => {
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Existing orders list for duplicate detection & auto-accumulation
  const [existingOrdersList, setExistingOrdersList] = useState<ProductionOrder[]>(existingOrders);
  useEffect(() => {
    if (existingOrders && existingOrders.length > 0) {
      setExistingOrdersList(existingOrders);
    }
  }, [existingOrders]);

  // Master Data
  const [backendSkus, setBackendSkus] = useState<SkuV2[]>(initialSkus);
  const [warehouseLocations, setWarehouseLocations] = useState<WarehouseLocationV2[]>([]);

  // Category & Type Shifting in Product to Manufacture
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('ALL');
  const [productTypeFilter, setProductTypeFilter] = useState<'ALL' | 'products' | 'semi'>('ALL');

  // Department Presets (synchronized across all systems via company metadata)
  const [departmentPresets, setDepartmentPresets] = useState<DepartmentPreset[]>(() => {
    try {
      const stored = localStorage.getItem('skbw_department_presets_v2');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_DEPARTMENT_PRESETS;
  });

  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState<boolean>(false);
  const [highlightedDeptIdx, setHighlightedDeptIdx] = useState<number>(0);
  const [showManageDeptModal, setShowManageDeptModal] = useState<boolean>(false);
  const [newDeptName, setNewDeptName] = useState<string>('');
  const [newDeptLocation, setNewDeptLocation] = useState<string>('SKBW - Ground Floor');
  const [newDeptWhId, setNewDeptWhId] = useState<string>('fact-skbw');
  const [newDeptFlId, setNewDeptFlId] = useState<string>('floor-ground');
  const [newDeptZnId, setNewDeptZnId] = useState<string>('zone-a');
  const [newDeptLocId, setNewDeptLocId] = useState<string>('loc-top');
  const departmentRef = useRef<HTMLDivElement>(null);
  const deptListRef = useRef<HTMLDivElement>(null);

  // Predefined Overhead Costs Presets (matching Sales Order predefined charges)
  const [predefinedCosts, setPredefinedCosts] = useState<PredefinedCost[]>(() => {
    try {
      const stored = localStorage.getItem('skbw_predefined_costs_v2');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_PREDEFINED_COSTS;
  });
  const [showQuickCostPresetMenu, setShowQuickCostPresetMenu] = useState<boolean>(false);
  const [highlightedCostPresetIdx, setHighlightedCostPresetIdx] = useState<number>(0);
  const [quickCostOpenUpwards, setQuickCostOpenUpwards] = useState<boolean>(false);
  const [showManageCostModal, setShowManageCostModal] = useState<boolean>(false);
  const [newCostName, setNewCostName] = useState<string>('');
  const [newCostBasis, setNewCostBasis] = useState<'Per BOM' | 'Total / Batch' | 'Per Batch' | 'Per GBL' | 'Per Piece' | string>('Per BOM');
  const [newCostRate, setNewCostRate] = useState<string>('');
  const costPresetMenuRef = useRef<HTMLDivElement>(null);
  const costPresetListRef = useRef<HTMLDivElement>(null);

  // Predefined By-Product / Scrap Presets (persisted in localStorage)
  const [scrapPresets, setScrapPresets] = useState<ScrapPreset[]>(() => {
    try {
      const stored = localStorage.getItem('skbw_scrap_presets_v2');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_SCRAP_PRESETS;
  });
  const [showQuickScrapPresetMenu, setShowQuickScrapPresetMenu] = useState<boolean>(false);
  const [highlightedScrapPresetIdx, setHighlightedScrapPresetIdx] = useState<number>(0);
  const [quickScrapOpenUpwards, setQuickScrapOpenUpwards] = useState<boolean>(false);
  const [showManageScrapModal, setShowManageScrapModal] = useState<boolean>(false);
  const [newScrapItem, setNewScrapItem] = useState<string>('');
  const [newScrapUom, setNewScrapUom] = useState<string>('KG');
  const [newScrapRate, setNewScrapRate] = useState<string>('');
  const scrapPresetMenuRef = useRef<HTMLDivElement>(null);
  const scrapPresetListRef = useRef<HTMLDivElement>(null);

  // Output Location Coordinates
  const [selectedWhId, setSelectedWhId] = useState<string>('fact-skbw');
  const [selectedFlId, setSelectedFlId] = useState<string>('floor-ground');
  const [selectedZnId, setSelectedZnId] = useState<string>('zone-a');
  const [selectedLocId, setSelectedLocId] = useState<string>('loc-top');

  // Order Details
  const [orderNumber, setOrderNumber] = useState<string>(() => editOrder?.orderNumber || '');
  const [orderDate, setOrderDate] = useState<string>(() => {
    if (editOrder?.orderDate) return editOrder.orderDate.slice(0, 10);
    if (editOrder?.plannedStartDate) return editOrder.plannedStartDate.slice(0, 10);
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [department, setDepartment] = useState<string>(() => editOrder?.department || '');
  const [orderStatus, setOrderStatus] = useState<'Planned' | 'Draft'>(() => (editOrder?.status === 'Draft' ? 'Draft' : 'Planned'));

  // Product Selection fields
  const [selectedSkuId, setSelectedSkuId] = useState<string>(() => editOrder?.itemId || '');
  const [productName, setProductName] = useState<string>(() => editOrder?.itemName || '');
  const [productCode, setProductCode] = useState<string>(() => editOrder?.itemCode || '');
  const [showProductDropdown, setShowProductDropdown] = useState<boolean>(false);
  const [productSearch, setProductSearch] = useState<string>('');
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  // Output Location & Planned Qty
  const [outputLocation, setOutputLocation] = useState<string>(() => editOrder?.factory || editOrder?.outputLocation || 'SKBW - Ground Floor');
  const [plannedQty, setPlannedQty] = useState<number | string>(() => (editOrder?.plannedQty !== undefined ? editOrder.plannedQty : ''));
  const [uom, setUom] = useState<string>(() => editOrder?.plannedUom || 'PCS');
  const [conversionFactor, setConversionFactor] = useState<number>(() => editOrder?.conversionFactor || 0);

  // Remarks
  const [remarks, setRemarks] = useState<string>(() => editOrder?.remarks || '');

  // Materials Table
  const [materials, setMaterials] = useState<MaterialRow[]>(() => {
    if (editOrder?.bomItems && Array.isArray(editOrder.bomItems) && editOrder.bomItems.length > 0) {
      return editOrder.bomItems.map((m: any, idx: number) => ({
        id: m.id || `mat-edit-${idx}`,
        skuId: m.skuId,
        component: m.component,
        code: m.code || '',
        uom: m.uom || 'PCS',
        requiredQty: Number(m.totalRequired) || Number(m.qtyPerBatch) || 0,
        sourceLocation: m.sourceLocation || 'Main Factory',
        locationId: m.locationId,
        warehouseId: m.warehouseId,
        floorId: m.floorId,
        zoneId: m.zoneId,
        rateMode: m.rateMode || 'avg_purchase',
        rate: Number(m.rate) || 0,
        amount: Number(m.amount) || 0,
        batchesAllocated: m.batchesAllocated,
        fifoBatchInfo: m.fifoBatchInfo
      }));
    }
    return [];
  });
  const [activeMaterialDropdownId, setActiveMaterialDropdownId] = useState<string | null>(null);
  const [materialDropdownPosition, setMaterialDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [componentSearchMap, setComponentSearchMap] = useState<Record<string, string>>({});

  const handleOpenMaterialDropdown = (rowId: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const popoverWidth = Math.max(540, rect.width);
    const left = Math.min(Math.max(10, rect.left), window.innerWidth - popoverWidth - 20);
    setMaterialDropdownPosition({
      top: rect.bottom + 4,
      left,
      width: popoverWidth
    });
    setActiveMaterialDropdownId(rowId);
  };

  // 3-Mode Material Costing: 1. Avg of purchases, 2. FIFO (earliest active batch), 3. Custom Value
  const [globalRateMode, setGlobalRateMode] = useState<BomRateMode>('avg_purchase');
  const [materialRatesCache, setMaterialRatesCache] = useState<Record<string, MaterialRateInfo>>({});
  const [loadingMaterialRates, setLoadingMaterialRates] = useState<boolean>(false);

  // Scrap / By-Products Table
  const [scrapItems, setScrapItems] = useState<ScrapRow[]>(() => {
    if (editOrder?.byProducts && Array.isArray(editOrder.byProducts)) {
      return editOrder.byProducts.map((s: any, idx: number) => ({
        id: s.id || `scrap-${idx}`,
        item: s.item,
        uom: s.uom,
        qty: Number(s.qty) || 0,
        rate: Number(s.rate) || 0,
        amount: Number(s.amount) || 0
      }));
    }
    return [];
  });

  // Additional Costs Table
  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCostRow[]>(() => {
    if (editOrder?.additionalCosts && Array.isArray(editOrder.additionalCosts)) {
      return editOrder.additionalCosts.map((c: any, idx: number) => ({
        id: c.id || `cost-${idx}`,
        costType: c.costType,
        basis: (c.basis as any) || 'Per GBL',
        amount: Number(c.amount) || 0,
        appliedAs: (c as any).appliedAs || 'Per Unit (GBL)'
      }));
    }
    return [];
  });

  // Profit & Pricing (Optional)
  const [profitPricing, setProfitPricing] = useState<ProfitPricingState>(() => {
    if ((editOrder as any)?.profitPricing) {
      return {
        pricingMethod: (editOrder as any).profitPricing.pricingMethod || 'Margin %',
        markupPercentage: (editOrder as any).profitPricing.markupPercentage || ''
      };
    }
    return {
      pricingMethod: 'Margin %',
      markupPercentage: ''
    };
  });

  // Paper Cutting Slip Voucher (Reel -> Sheet Conversion)
  const [showCuttingSlipModal, setShowCuttingSlipModal] = useState(false);

  // Live Material Stock from Inventory Balances
  const [liveStockMap, setLiveStockMap] = useState<Map<string, number>>(new Map());
  const [isStockLoading, setIsStockLoading] = useState<boolean>(false);

  // Load backend sequence number & SKUs
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        if (companyId) {
          setIsStockLoading(true);
          const [nextNum, skusRes, whRes, metaRes, balancesRes, poRes] = await Promise.allSettled([
            getNextProductionOrderNumber(companyId),
            getSkusV2(companyId),
            getWarehouseHierarchyV2(companyId),
            getMetadataV2(companyId),
            getBalancesV2(companyId),
            getProductionOrders({ companyId })
          ]);

          if (!isMounted) return;

          if (poRes.status === 'fulfilled' && Array.isArray(poRes.value)) {
            setExistingOrdersList(poRes.value);
          }

          let loadedWhLocs: WarehouseLocationV2[] = [];
          if (whRes.status === 'fulfilled' && Array.isArray(whRes.value)) {
            loadedWhLocs = whRes.value;
            setWarehouseLocations(whRes.value);
          }
          if (!editOrder && nextNum.status === 'fulfilled' && nextNum.value) {
            setOrderNumber(nextNum.value);
          }
          if (skusRes.status === 'fulfilled' && Array.isArray(skusRes.value)) {
            setBackendSkus(skusRes.value);
          }

          // Build live stock map from ledger balances and SKU on-hand values
          const bMap = new Map<string, number>();
          if (balancesRes.status === 'fulfilled' && Array.isArray(balancesRes.value)) {
            balancesRes.value.forEach((b: any) => {
              const rawId = b.skuId || b.sku?._id;
              const sId = rawId ? String((rawId as any)._id || rawId) : '';
              const sCode = (b.sku?.skuCode || b.skuCode || '').toLowerCase().trim();
              const sName = (b.sku?.name || b.name || '').toLowerCase().trim();
              const qty = Number(b.onHand) || Number(b.quantity) || 0;
              if (sId) bMap.set(sId, (bMap.get(sId) || 0) + qty);
              if (sCode) bMap.set(sCode, (bMap.get(sCode) || 0) + qty);
              if (sName) bMap.set(sName, (bMap.get(sName) || 0) + qty);
            });
          }

          const skusList = skusRes.status === 'fulfilled' && Array.isArray(skusRes.value) ? skusRes.value : [];
          skusList.forEach(s => {
            const sId = s._id ? String(s._id) : '';
            const sCode = (s.skuCode || '').toLowerCase().trim();
            const sName = (s.name || '').toLowerCase().trim();
            const fallback = Number(s.presentStock !== undefined ? s.presentStock : (s.openingStock || 0));
            if (sId && !bMap.has(sId)) bMap.set(sId, fallback);
            if (sCode && !bMap.has(sCode)) bMap.set(sCode, fallback);
            if (sName && !bMap.has(sName)) bMap.set(sName, fallback);
          });
          setLiveStockMap(bMap);
          setIsStockLoading(false);

          // Sync Department Presets from database so all systems have identical presets
          if (metaRes.status === 'fulfilled' && metaRes.value) {
            const serverPresets = metaRes.value.departmentPresets;
            if (Array.isArray(serverPresets) && serverPresets.length > 0) {
              setDepartmentPresets(serverPresets);
              try {
                localStorage.setItem('skbw_department_presets_v2', JSON.stringify(serverPresets));
              } catch (e) {}
            } else {
              const freshDefaults = buildCleanDepartmentPresets(loadedWhLocs);
              setDepartmentPresets(freshDefaults);
              updateMetadataV2({ companyId, departmentPresets: freshDefaults }).catch(() => {});
            }

            // Sync Additional Cost / Overheads Presets from database so all systems have identical presets
            const serverCosts = metaRes.value.additionalCostPresets;
            let mergedCosts: PredefinedCost[] = DEFAULT_PREDEFINED_COSTS;
            if (Array.isArray(serverCosts) && serverCosts.length > 0) {
              const existingIds = new Set(serverCosts.map((c: any) => c.id || c.name));
              const missingDefaults = DEFAULT_PREDEFINED_COSTS.filter(d => !existingIds.has(d.id) && !existingIds.has(d.name));
              mergedCosts = [...serverCosts, ...missingDefaults];
            }
            setPredefinedCosts(mergedCosts);
            try {
              localStorage.setItem('skbw_predefined_costs_v2', JSON.stringify(mergedCosts));
            } catch (e) {}
            if (!Array.isArray(serverCosts) || serverCosts.length === 0 || serverCosts.length !== mergedCosts.length) {
              updateMetadataV2({ companyId, additionalCostPresets: mergedCosts }).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.error('Error loading production order initial data:', err);
      } finally {
        if (isMounted) setIsStockLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [companyId]);

  // Sync backendSkus if initialSkus prop updates
  useEffect(() => {
    if (initialSkus && initialSkus.length > 0) {
      setBackendSkus(initialSkus);
      setLiveStockMap(prev => {
        if (prev.size > 0) return prev;
        const bMap = new Map<string, number>();
        initialSkus.forEach(s => {
          const sId = s._id ? String(s._id) : '';
          const sCode = (s.skuCode || '').toLowerCase().trim();
          const sName = (s.name || '').toLowerCase().trim();
          const fallback = Number(s.presentStock !== undefined ? s.presentStock : (s.openingStock || 0));
          if (sId) bMap.set(sId, fallback);
          if (sCode) bMap.set(sCode, fallback);
          if (sName) bMap.set(sName, fallback);
        });
        return bMap;
      });
    }
  }, [initialSkus]);

  // Dynamically update backendSkus and current order recipe when BOM changes anywhere in the app
  useEffect(() => {
    const handleBomUpdated = (e: any) => {
      const updatedSku = e.detail;
      if (!updatedSku || !updatedSku._id) return;
      setBackendSkus(prev => prev.map(s => s._id === updatedSku._id ? { ...s, ...updatedSku } : s));
      if (selectedSkuId === updatedSku._id || (productCode && productCode.toLowerCase() === (updatedSku.skuCode || '').toLowerCase())) {
        handleSelectSku(updatedSku);
      }
    };
    window.addEventListener('skbw_bom_updated', handleBomUpdated);
    return () => window.removeEventListener('skbw_bom_updated', handleBomUpdated);
  }, [selectedSkuId, productCode]);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (productDropdownRef.current && !productDropdownRef.current.contains(target)) {
        setShowProductDropdown(false);
      }
      if (departmentRef.current && !departmentRef.current.contains(target)) {
        setShowDepartmentDropdown(false);
      }
      if (costPresetMenuRef.current && !costPresetMenuRef.current.contains(target)) {
        setShowQuickCostPresetMenu(false);
      }
      if (scrapPresetMenuRef.current && !scrapPresetMenuRef.current.contains(target)) {
        setShowQuickScrapPresetMenu(false);
      }
      if (activeMaterialDropdownId && !target.closest('.material-dropdown-container')) {
        setActiveMaterialDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMaterialDropdownId]);

  useEffect(() => {
    if (!activeMaterialDropdownId) return;
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && target.closest && target.closest('.material-dropdown-container')) return;
      setActiveMaterialDropdownId(null);
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [activeMaterialDropdownId]);

  // Global Keyboard Shortcuts (Alt+D for Department Presets, Alt+P/C for Cost Presets)
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showManageDeptModal) {
          setShowManageDeptModal(false);
          return;
        }
        if (showManageCostModal) {
          setShowManageCostModal(false);
          return;
        }
        if (showManageScrapModal) {
          setShowManageScrapModal(false);
          return;
        }
        if (showQuickScrapPresetMenu) {
          setShowQuickScrapPresetMenu(false);
          return;
        }
        if (showDepartmentDropdown) {
          setShowDepartmentDropdown(false);
          return;
        }
        if (showQuickCostPresetMenu) {
          setShowQuickCostPresetMenu(false);
          return;
        }
        if (showProductDropdown) {
          setShowProductDropdown(false);
          return;
        }
        if (activeMaterialDropdownId) {
          setActiveMaterialDropdownId(null);
          return;
        }
      } else if (e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setShowDepartmentDropdown(prev => !prev);
        setHighlightedDeptIdx(0);
      } else if (e.altKey && (e.key === 'p' || e.key === 'P' || e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        setShowQuickCostPresetMenu(prev => !prev);
        setHighlightedCostPresetIdx(0);
      } else if (e.key === 'ArrowDown') {
        if (showDepartmentDropdown && departmentPresets.length > 0) {
          e.preventDefault();
          setHighlightedDeptIdx(prev => Math.min(prev + 1, departmentPresets.length - 1));
          return;
        }
        if (showQuickCostPresetMenu && predefinedCosts.length > 0) {
          e.preventDefault();
          setHighlightedCostPresetIdx(prev => Math.min(prev + 1, predefinedCosts.length - 1));
          return;
        }
      } else if (e.key === 'ArrowUp') {
        if (showDepartmentDropdown && departmentPresets.length > 0) {
          e.preventDefault();
          setHighlightedDeptIdx(prev => Math.max(prev - 1, 0));
          return;
        }
        if (showQuickCostPresetMenu && predefinedCosts.length > 0) {
          e.preventDefault();
          setHighlightedCostPresetIdx(prev => Math.max(prev - 1, 0));
          return;
        }
      } else if (e.key === 'Enter') {
        if (showDepartmentDropdown && departmentPresets.length > 0) {
          e.preventDefault();
          const selected = departmentPresets[highlightedDeptIdx] || departmentPresets[0];
          if (selected) {
            handleSelectDepartmentPreset(selected);
          }
          setShowDepartmentDropdown(false);
          return;
        }
        if (showQuickCostPresetMenu && predefinedCosts.length > 0) {
          e.preventDefault();
          const selected = predefinedCosts[highlightedCostPresetIdx] || predefinedCosts[0];
          if (selected) {
            handleAddPredefinedCost(selected);
          }
          setShowQuickCostPresetMenu(false);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [
    showDepartmentDropdown, 
    showQuickCostPresetMenu, 
    showManageDeptModal, 
    showManageCostModal, 
    showProductDropdown, 
    activeMaterialDropdownId, 
    departmentPresets, 
    predefinedCosts, 
    highlightedDeptIdx, 
    highlightedCostPresetIdx
  ]);

  // Scroll into view on Arrow keys
  useEffect(() => {
    if (showDepartmentDropdown && deptListRef.current) {
      const el = deptListRef.current.children[highlightedDeptIdx] as HTMLElement;
      el?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [highlightedDeptIdx, showDepartmentDropdown]);

  useEffect(() => {
    if (showQuickCostPresetMenu && costPresetListRef.current) {
      const el = costPresetListRef.current.children[highlightedCostPresetIdx] as HTMLElement;
      el?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [highlightedCostPresetIdx, showQuickCostPresetMenu]);

  useEffect(() => {
    if (showQuickScrapPresetMenu && scrapPresetListRef.current) {
      const el = scrapPresetListRef.current.children[highlightedScrapPresetIdx] as HTMLElement;
      el?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [highlightedScrapPresetIdx, showQuickScrapPresetMenu]);

  // Finished Goods and Semi-Finished Goods that can be manufactured
  const manufacturableSkus = useMemo(() => {
    return backendSkus.filter(s => {
      const type = getItemClassification(s);
      return type === 'products' || type === 'semi';
    });
  }, [backendSkus]);

  // Raw Materials and Semi Goods for BOM/components consumption
  const rawAndSemiSkus = useMemo(() => {
    return backendSkus.filter(s => {
      const type = getItemClassification(s);
      return type === 'materials' || type === 'semi';
    });
  }, [backendSkus]);

  // Returns PCS per GBL directly from Item Master fields.
  // Prioritizes altUnitConversion as it represents the official Conversion Formula
  // defined in Item Master (Units & Conversion Logic: 1 GBL = N PCS).
  const getSkuPcsPerGbl = (sku?: SkuV2 | null): number => {
    if (!sku) return 0;
    return (
      Number(sku.altUnitConversion) ||
      Number((sku as any).booksGbl) ||
      Number((sku as any).pcsPerGbl) ||
      0
    );
  };

  // Converts BOM "recipe makes" quantity into base PCS:
  // e.g. If recipe makes 4 PCS (batch size = 4), recipeBasePcs = 4.
  // If recipe makes 5 GBL, and 1 GBL = 400 PCS, then recipeBasePcs = 5 * 400 = 2,000 PCS.
  const getSkuRecipeBasePcs = (sku: SkuV2, convFactor: number): number => {
    const yieldUnit = (
      (sku as any).recipeYieldUnit || 
      (sku as any).batchYieldUnit || 
      sku.unit || 
      'PCS'
    ).toUpperCase().trim();

    const rawYieldQty = Number(sku.recipeYieldQty) || Number(sku.batchYieldQty) || 1;

    if (yieldUnit === 'GBL') {
      const factor = convFactor > 0 ? convFactor : 1;
      return rawYieldQty * factor;
    }

    return rawYieldQty > 0 ? rawYieldQty : 1;
  };




  // Dynamic Item Master specification badge:
  const getSkuSpecOrConversion = (sku?: SkuV2 | null): string => {
    if (!sku) return '';

    // 1. Sheets / Ream items (Paper, Index, Ruling, Board, Sheets, Semi Goods)
    const isSheetItem = 
      sku.paperType === 'Sheets' || 
      (sku as any).sheetsPerReam !== undefined || 
      (sku.category || '').toLowerCase().includes('index') ||
      (sku.category || '').toLowerCase().includes('ruling') ||
      (sku.category || '').toLowerCase().includes('board') ||
      (sku.category || '').toLowerCase().includes('sheet') ||
      (sku.name || '').toLowerCase().includes('sheet');

    const sheetsVal = (sku as any).sheetsPerReam ?? (sku as any).standardSheets ?? (isSheetItem ? sku.pages : null);
    if (sheetsVal && Number(sheetsVal) > 0) {
      return `${sheetsVal} Sheets/Ream`;
    }

    // 2. Reels
    if (sku.paperType === 'Reels' || (sku.name || '').toLowerCase().includes('reel')) {
      if (sku.gsm) return `${sku.gsm} GSM Reel`;
      return 'Reel';
    }

    // 3. Finished Goods with books per GBL
    const cat = (sku.category || '').toLowerCase();
    const isFinished = cat.includes('finish') || cat.includes('notebook') || cat.includes('book') || cat.includes('register') || cat.includes('diar');
    if (isFinished && Number((sku as any).booksGbl) > 0) {
      return `${(sku as any).booksGbl} Pcs/GBL`;
    }

    // 4. Alt Unit Conversion explicitly defined
    if (sku.altUnit && sku.altUnitConversion && Number(sku.altUnitConversion) > 0 && !isSheetItem) {
      return `${sku.altUnitConversion} ${sku.unit || 'Pcs'}/${sku.altUnit}`;
    }

    // 5. GSM
    if (sku.gsm && Number(sku.gsm) > 0) {
      return `${sku.gsm} GSM`;
    }

    return '';
  };

  // Current Selected Product
  const currentSku = useMemo(() => {
    return backendSkus.find(s => 
      s._id === selectedSkuId || 
      (productCode && s.skuCode?.toLowerCase().trim() === productCode.toLowerCase().trim()) ||
      (productName && s.name?.toLowerCase().trim() === productName.toLowerCase().trim())
    );
  }, [backendSkus, selectedSkuId, productCode, productName]);

  // Keep conversionFactor in sync with current SKU from Item Master
  useEffect(() => {
    if (currentSku) {
      const factor = getSkuPcsPerGbl(currentSku);
      if (factor > 0 && factor !== conversionFactor) {
        setConversionFactor(factor);
      }
    }
  }, [currentSku]);

  // STRICTLY ASSIGNED UNITS ONLY
  const availableUnits = useMemo(() => {
    if (!currentSku) return ['PCS', 'GBL'];
    const set = new Set<string>();
    if (currentSku.unit) set.add(currentSku.unit.toUpperCase().trim());
    if (currentSku.altUnit) set.add(currentSku.altUnit.toUpperCase().trim());
    const conv = getSkuPcsPerGbl(currentSku);
    if (conv > 0) {
      set.add('PCS');
      set.add('GBL');
    }
    if (set.size === 0) set.add('PCS');
    return Array.from(set);
  }, [currentSku]);

  const numPlannedQty = Number(plannedQty) || 0;
  
  const plannedPcs = useMemo(() => {
    if (uom === 'GBL') {
      const factor = conversionFactor > 0 ? conversionFactor : 1;
      return numPlannedQty * factor;
    }
    return numPlannedQty;
  }, [numPlannedQty, uom, conversionFactor]);

  const plannedGbl = useMemo(() => {
    if (uom === 'GBL') {
      return numPlannedQty;
    }
    const factor = conversionFactor > 0 ? conversionFactor : 1;
    return numPlannedQty / factor;
  }, [numPlannedQty, uom, conversionFactor]);

  // Base PCS produced per 1 standard BOM recipe run:
  const recipeBasePcs = useMemo(() => {
    if (!currentSku) return 1;
    return getSkuRecipeBasePcs(currentSku, conversionFactor);
  }, [currentSku, conversionFactor]);

  // Dynamic BOM Multiplier (how many parent BOM batches / sheets are consumed for this order)
  const bomMultiplier = useMemo(() => {
    // 1. If materials table has items loaded with recipeQty > 0 and requiredQty > 0:
    const firstBomMat = materials.find(m => m.recipeQty && Number(m.recipeQty) > 0 && m.requiredQty !== undefined);
    if (firstBomMat && Number(firstBomMat.recipeQty) > 0) {
      const ratio = Number(firstBomMat.requiredQty) / Number(firstBomMat.recipeQty);
      if (ratio > 0 && isFinite(ratio)) {
        return Math.round(ratio * 1000) / 1000;
      }
    }
    // 2. Otherwise calculate from plannedPcs / recipeBasePcs:
    if (plannedPcs > 0 && recipeBasePcs > 0) {
      return Math.round((plannedPcs / recipeBasePcs) * 1000) / 1000;
    }
    return 1;
  }, [materials, plannedPcs, recipeBasePcs]);

  // Recalculate material requirements when target quantity changes
  useEffect(() => {
    if (materials.length > 0) {
      setMaterials(prev => prev.map(m => {
        if (m.basePerPiece && m.basePerPiece > 0) {
          const req = plannedPcs > 0 
            ? Math.round(m.basePerPiece * plannedPcs * 1000) / 1000 
            : (m.recipeQty ?? m.requiredQty);
          return {
            ...m,
            requiredQty: req,
            amount: Math.round(req * m.rate * 100) / 100
          };
        }
        return m;
      }));
    }
  }, [plannedPcs]);

  // Handle department preset selection
  const handleSelectDepartmentPreset = (preset: DepartmentPreset) => {
    setDepartment(preset.name);
    if (preset.locationName) {
      setOutputLocation(preset.locationName);
      if (preset.warehouseId) setSelectedWhId(preset.warehouseId);
      if (preset.floorId) setSelectedFlId(preset.floorId);
      if (preset.zoneId) setSelectedZnId(preset.zoneId);
      if (preset.locationId) setSelectedLocId(preset.locationId);
      showToast(`Selected "${preset.name}" (${preset.locationName})`, 'success');
    }
  };

  const handleAddNewDepartmentPreset = async () => {
    if (!newDeptName.trim()) {
      showToast('Please enter a department name', 'error');
      return;
    }
    const newPreset: DepartmentPreset = {
      id: `dept-${Date.now()}`,
      name: newDeptName.trim(),
      locationName: newDeptLocation || 'Main Factory',
      warehouseId: newDeptWhId || undefined,
      floorId: newDeptFlId || undefined,
      zoneId: newDeptZnId || undefined,
      locationId: newDeptLocId || undefined
    };
    const updated = [newPreset, ...departmentPresets];
    setDepartmentPresets(updated);
    try {
      localStorage.setItem('skbw_department_presets_v2', JSON.stringify(updated));
    } catch (e) {}
    if (companyId) {
      await updateMetadataV2({ companyId, departmentPresets: updated }).catch(e => console.error(e));
    }
    setNewDeptName('');
    showToast(`Added "${newPreset.name}" to department presets (synced across all systems)`, 'success');
  };

  const handleDeleteDepartmentPreset = async (id: string) => {
    const updated = departmentPresets.filter(p => p.id !== id);
    setDepartmentPresets(updated);
    try {
      localStorage.setItem('skbw_department_presets_v2', JSON.stringify(updated));
    } catch (e) {}
    if (companyId) {
      await updateMetadataV2({ companyId, departmentPresets: updated }).catch(e => console.error(e));
    }
    showToast('Department preset deleted (synced across all systems)', 'info');
  };

  const handleResetDepartmentPresets = async () => {
    const defaults = buildCleanDepartmentPresets(warehouseLocations);
    setDepartmentPresets(defaults);
    try {
      localStorage.setItem('skbw_department_presets_v2', JSON.stringify(defaults));
    } catch (e) {}
    if (companyId) {
      await updateMetadataV2({ companyId, departmentPresets: defaults }).catch(e => console.error(e));
    }
    showToast('Reset department presets to system defaults', 'info');
  };

  // Predefined Overheads Presets Handlers
  const handleAddPredefinedCost = (preset: PredefinedCost) => {
    const newId = `cost-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setAdditionalCosts(prev => [
      ...prev,
      {
        id: newId,
        costType: preset.name,
        basis: preset.basis,
        amount: preset.defaultRate,
        appliedAs: preset.appliedAs
      }
    ]);
    showToast(`Added "${preset.name}" overhead`, 'success');
  };

  const handleAddNewCostPreset = () => {
    if (!newCostName.trim()) {
      showToast('Please enter an overhead cost name', 'error');
      return;
    }
    const rateNum = Number(newCostRate) || 0;
    const newPreset: PredefinedCost = {
      id: `cost-p-${Date.now()}`,
      name: newCostName.trim(),
      basis: newCostBasis,
      defaultRate: rateNum,
      appliedAs: newCostBasis === 'Per BOM' ? 'Per BOM' : newCostBasis === 'Per GBL' ? 'Per Unit (GBL)' : newCostBasis === 'Per Piece' ? 'Per Unit (PCS)' : 'Total Cost for this production/batch'
    };
    const updated = [...predefinedCosts, newPreset];
    setPredefinedCosts(updated);
    try {
      localStorage.setItem('skbw_predefined_costs_v2', JSON.stringify(updated));
    } catch (e) {}
    if (companyId) {
      updateMetadataV2({ companyId, additionalCostPresets: updated }).catch(e => console.error(e));
    }
    setNewCostName('');
    setNewCostRate('');
    showToast(`Added "${newPreset.name}" to predefined overheads`, 'success');
  };

  const handleDeleteCostPreset = (id: string) => {
    const updated = predefinedCosts.filter(c => c.id !== id);
    setPredefinedCosts(updated);
    try {
      localStorage.setItem('skbw_predefined_costs_v2', JSON.stringify(updated));
    } catch (e) {}
    if (companyId) {
      updateMetadataV2({ companyId, additionalCostPresets: updated }).catch(e => console.error(e));
    }
    showToast('Predefined overhead deleted', 'info');
  };

  // Output location change handler
  const handleOutputLocationChange = (whId: string, flId: string, znId: string, locId: string) => {
    setSelectedWhId(whId);
    setSelectedFlId(flId);
    setSelectedZnId(znId);
    setSelectedLocId(locId);

    const locObj = warehouseLocations.find(l => String(l._id) === String(locId));
    const whObj = warehouseLocations.find(l => String(l._id) === String(whId));
    const floorObj = warehouseLocations.find(l => String(l._id) === String(flId));
    const zoneObj = warehouseLocations.find(l => String(l._id) === String(znId));
    const pathStr = (locId && locId === znId)
      ? [whObj?.name, floorObj?.name, zoneObj?.name || locObj?.name].filter(Boolean).join(' - ')
      : [whObj?.name, floorObj?.name, zoneObj?.name, locObj?.name].filter(Boolean).join(' - ') || locObj?.name || 'Selected Location';
    setOutputLocation(pathStr);
  };

  // Material source location change handler
  const handleMaterialLocationChange = (rowId: string, whId: string, flId: string, znId: string, locId: string) => {
    const locObj = warehouseLocations.find(l => String(l._id) === String(locId));
    const whObj = warehouseLocations.find(l => String(l._id) === String(whId));
    const floorObj = warehouseLocations.find(l => String(l._id) === String(flId));
    const zoneObj = warehouseLocations.find(l => String(l._id) === String(znId));
    const pathStr = (locId && locId === znId)
      ? [whObj?.name, floorObj?.name, zoneObj?.name || locObj?.name].filter(Boolean).join(' - ')
      : [whObj?.name, floorObj?.name, zoneObj?.name, locObj?.name].filter(Boolean).join(' - ') || locObj?.name || 'Selected Location';

    setMaterials(prev => prev.map(m => {
      if (m.id !== rowId) return m;
      return {
        ...m,
        sourceLocation: pathStr,
        locationId: locId,
        warehouseId: whId,
        floorId: flId,
        zoneId: znId
      };
    }));
  };

  // Handle product selection & auto BOM load
  const handleSelectProduct = (sku: SkuV2, overrideQty?: number, overrideUom?: string) => {
    setSelectedSkuId(sku._id);
    setProductName(sku.name);
    setProductCode(sku.skuCode);
    setShowProductDropdown(false);
    setProductSearch('');

    const bomYieldQty = Number(sku.recipeYieldQty) || Number(sku.batchYieldQty) || 0;
    const bomYieldUnit = (
      (sku as any).recipeYieldUnit || 
      (sku as any).batchYieldUnit || 
      sku.unit || 
      'PCS'
    ).toUpperCase().trim();

    // Dynamically load the planned quantity field according to the assigned BOM batch size
    const initialQty = overrideQty !== undefined
      ? overrideQty
      : (bomYieldQty > 0 ? bomYieldQty : 1);

    const assignedUnit = (overrideUom || (bomYieldQty > 0 && bomYieldUnit ? bomYieldUnit : (sku.unit || 'PCS'))).toUpperCase().trim();

    setPlannedQty(initialQty);
    setUom(assignedUnit);

    // Compute factor synchronously (not from stale state) so BOM scales correctly
    const newFactor = getSkuPcsPerGbl(sku);
    setConversionFactor(newFactor);

    // Compute actual planned PCS inline using the freshly computed factor
    const curPlannedQty = initialQty;
    const actualPlannedPcs = assignedUnit === 'GBL' 
      ? curPlannedQty * (newFactor > 0 ? newFactor : 1) 
      : curPlannedQty;

    const rawBom = sku.bomItems || (sku as any).bom || [];
    if (Array.isArray(rawBom) && rawBom.length > 0) {
      // 1. Convert BOM "recipe makes" quantity into base UOM (PCS)
      // e.g. 5 GBL * 400 PCS = 2,000 PCS
      const recipeBasePcs = getSkuRecipeBasePcs(sku, newFactor);

      const loadedMaterials: MaterialRow[] = rawBom.map((raw: any, idx: number) => {
        const rawQty = Number(raw.qty) || Number(raw.qtyPerBatch) || 1;
        // Requirement per 1 base piece (PCS)
        const perPieceBasis = rawQty / recipeBasePcs;
        
        // Scale factor = plannedBaseQty / recipeBaseQty
        // If curPlannedQty is 0 (not entered yet), display the recipe's standard BOM qty
        const scaleFactor = curPlannedQty > 0 ? actualPlannedPcs / recipeBasePcs : 1;
        const requiredQty = curPlannedQty > 0 
          ? Math.round(rawQty * scaleFactor * 1000) / 1000 
          : rawQty;
        const rawRate = Number(raw.rate) || 0;

        // Resolve matching SKU to get skuId and stocking unit info
        const matchedSku = backendSkus.find(s => 
          (raw.skuId && s._id === raw.skuId) ||
          (raw.skuCode && s.skuCode?.toLowerCase().trim() === raw.skuCode.toLowerCase().trim()) ||
          (raw.code && s.skuCode?.toLowerCase().trim() === raw.code.toLowerCase().trim()) ||
          (raw.name && s.name?.toLowerCase().trim() === raw.name.toLowerCase().trim())
        );

        // Determine UOM: raw materials (especially sheets/boards) must ALWAYS use their actual UOM (PCS).
        // Never inherit GBL from an output item or an accidental GBL tag.
        const isSemiOrProduct = (matchedSku && (getItemClassification(matchedSku) === 'semi' || getItemClassification(matchedSku) === 'products')) ||
                                (raw.skuCode && (raw.skuCode.toUpperCase().startsWith('SM-') || raw.skuCode.toUpperCase().startsWith('FG-'))) ||
                                (raw.code && (raw.code.toUpperCase().startsWith('SM-') || raw.code.toUpperCase().startsWith('FG-')));

        const isRawItem = !isSemiOrProduct && (
                          (matchedSku && getItemClassification(matchedSku) === 'materials') ||
                          (raw.skuCode && raw.skuCode.toUpperCase().startsWith('RM-')) ||
                          (raw.code && raw.code.toUpperCase().startsWith('RM-')) ||
                          (matchedSku?.category && /sheet|paper|reel/i.test(matchedSku.category)) ||
                          (raw.name && /reel/i.test(raw.name)));

        let resolvedUom = raw.uom || matchedSku?.unit || raw.unit || 'PCS';
        if (isRawItem && (resolvedUom.toUpperCase() === 'GBL' || !resolvedUom)) {
          resolvedUom = (matchedSku?.unit && matchedSku.unit.toUpperCase() !== 'GBL') ? matchedSku.unit : 'PCS';
        }

        let initialRate = rawRate;
        if (initialRate <= 0 && matchedSku) {
          const skuBasePrice = Number((matchedSku as any).avgRate || (matchedSku as any).avgCost || matchedSku.costPrice || matchedSku.purchasePrice || matchedSku.standardCost || 0);
          initialRate = convertRateToUom(skuBasePrice, matchedSku.unit || 'PCS', resolvedUom, matchedSku);
        }

        return {
          id: `mat-${idx + 1}-${Date.now()}`,
          skuId: matchedSku?._id || raw.skuId,
          component: raw.name || raw.itemName || `Component ${idx + 1}`,
          code: raw.skuCode || raw.code || `RM-${String(idx + 1).padStart(3, '0')}`,
          uom: resolvedUom,
          requiredQty,
          recipeQty: rawQty,
          sourceLocation: 'SKBW - Ground Floor',
          rateMode: globalRateMode,
          rate: initialRate,
          amount: Math.round(requiredQty * initialRate * 100) / 100,
          basePerPiece: perPieceBasis
        };
      });
      setMaterials(loadedMaterials);
      fetchAndApplyMaterialRates(loadedMaterials, globalRateMode);
    } else {
      setMaterials([]);
    }

    // Dynamic Overheads / Additional Costs from SKU BOM (blank by default)
    if (Array.isArray((sku as any).additionalCosts) && (sku as any).additionalCosts.length > 0) {
      setAdditionalCosts((sku as any).additionalCosts.map((c: any, i: number) => {
        let basis = c.calcBasis || c.basis || 'Per Piece';
        let applied = c.appliedAs || '';

        const isBatch = basis.toLowerCase().includes('batch') || applied.toLowerCase().includes('batch') || basis.toLowerCase().includes('bom') || applied.toLowerCase().includes('bom') || basis.toLowerCase().includes('total') || applied.toLowerCase().includes('total') || basis === 'Fixed' || applied === 'Fixed';
        if (isBatch) {
          if (!basis.toLowerCase().includes('batch') && !basis.toLowerCase().includes('bom') && !basis.toLowerCase().includes('total') && basis !== 'Fixed') {
            basis = applied.toLowerCase().includes('bom') ? 'Per BOM' : 'Per Batch';
          }
          if (!applied) {
            applied = basis === 'Per BOM' ? 'Per BOM' : (basis === 'Total / Batch' ? 'Total Cost for this production/batch' : 'Per Batch');
          } else if (basis === 'Per Batch' && applied !== 'Per Batch') {
            applied = 'Per Batch';
          }
        } else if (basis === 'Per Piece') {
          applied = 'Per Unit (PCS)';
        } else if (basis === 'Per GBL') {
          applied = 'Per Unit (GBL)';
        }

        return {
          id: c.id || `cost-${Date.now()}-${i}`,
          costType: c.costType || '',
          basis: basis as any,
          amount: Number(c.amount) || 0,
          appliedAs: (applied || (isBatch ? 'Per Batch' : 'Per Unit (PCS)')) as any,
          totalAmount: 0
        };
      }));
    } else {
      setAdditionalCosts([]);
    }

    // Dynamic Profit & Pricing from SKU BOM (blank by default)
    if ((sku as any).profitPricing && typeof (sku as any).profitPricing === 'object') {
      setProfitPricing({
        pricingMethod: 'Margin %',
        markupPercentage: (sku as any).profitPricing.markupPercentage ?? '',
        suggestedPricePcs: (sku as any).profitPricing.suggestedPricePcs,
        suggestedPriceGbl: (sku as any).profitPricing.suggestedPriceGbl
      });
    } else {
      setProfitPricing({
        pricingMethod: 'Margin %',
        markupPercentage: ''
      });
    }
  };

  // Auto-fill from props or URL params (e.g. from Sales Pending Orders Shortfall "Produce" button)
  const [searchParams] = useSearchParams();
  const hasInitializedFromUrl = useRef(false);

  useEffect(() => {
    if (editOrder || hasInitializedFromUrl.current || backendSkus.length === 0) return;

    const targetSkuCode = initialSkuCode || searchParams.get('skuCode') || searchParams.get('itemCode') || '';
    const targetSkuName = initialSkuName || searchParams.get('skuName') || searchParams.get('itemName') || '';
    const targetQty = initialPlannedQty !== undefined ? String(initialPlannedQty) : (searchParams.get('plannedQty') || searchParams.get('qty') || '');
    const targetUom = initialPlannedUom || searchParams.get('plannedUom') || searchParams.get('uom') || undefined;
    const targetSoRef = salesOrderRef || searchParams.get('salesOrderRef') || '';

    if (targetSkuCode || targetSkuName) {
      const matched = backendSkus.find(s => 
        (targetSkuCode && (
          s.skuCode?.toLowerCase().trim() === targetSkuCode.toLowerCase().trim() ||
          s._id === targetSkuCode
        )) ||
        (targetSkuName && s.name?.toLowerCase().trim() === targetSkuName.toLowerCase().trim())
      );

      if (matched) {
        hasInitializedFromUrl.current = true;
        const parsedQty = targetQty ? Number(targetQty) : undefined;
        handleSelectProduct(matched, parsedQty, targetUom);

        // Ensure department preset is selected if empty
        if (!department && departmentPresets.length > 0) {
          setDepartment(departmentPresets[0].name);
        }
        // Auto set remarks if empty
        if (!remarks) {
          const displayQty = parsedQty || matched.recipeYieldQty || matched.batchYieldQty || 1;
          const displayUom = targetUom || matched.recipeYieldUnit || matched.batchYieldUnit || matched.unit || 'PCS';
          setRemarks(targetSoRef ? `Production for Sales Order ${targetSoRef} (${matched.name} - ${displayQty} ${displayUom})` : `Shortfall production for ${matched.name} (${displayQty} ${displayUom})`);
        }
      }
    }
  }, [backendSkus, searchParams, editOrder, department, remarks, departmentPresets, initialSkuCode, initialSkuName, initialPlannedQty, initialPlannedUom, salesOrderRef]);

  // Helper to fetch live rate options (Avg purchases vs FIFO) and apply to materials
  const fetchAndApplyMaterialRates = async (mats: MaterialRow[], modeToApply?: BomRateMode) => {
    if (!companyId || mats.length === 0) return;

    const skuIdsToFetch: string[] = [];
    mats.forEach(m => {
      const sId = m.skuId || backendSkus.find(s => 
        (m.code && s.skuCode?.toLowerCase().trim() === m.code.toLowerCase().trim()) ||
        (m.component && s.name?.toLowerCase().trim() === m.component.toLowerCase().trim())
      )?._id;
      if (sId && !skuIdsToFetch.includes(sId)) {
        skuIdsToFetch.push(sId);
      }
    });

    if (skuIdsToFetch.length === 0) return;

    try {
      setLoadingMaterialRates(true);
      const itemsToFetch = mats.map(m => {
        const sId = m.skuId || backendSkus.find(s => 
          (m.code && s.skuCode?.toLowerCase().trim() === m.code.toLowerCase().trim()) ||
          (m.component && s.name?.toLowerCase().trim() === m.component.toLowerCase().trim())
        )?._id;
        return {
          skuId: sId || '',
          requiredQty: Number(m.requiredQty) || 0,
          uom: m.uom || 'PCS'
        };
      }).filter(i => !!i.skuId);

      const res = await getProductionMaterialRates(companyId, skuIdsToFetch, itemsToFetch);
      const ratesMap = res.rates || {};

      setMaterialRatesCache(prev => ({ ...prev, ...ratesMap }));

      // Augment liveStockMap with purchase batch remaining quantities
      if (res.rates) {
        setLiveStockMap(prev => {
          const next = new Map(prev);
          Object.entries(res.rates).forEach(([skuId, rInfo]: [string, any]) => {
            if (rInfo?.batchBalances && Array.isArray(rInfo.batchBalances)) {
              const totalRemaining = rInfo.batchBalances.reduce((s: number, b: any) => s + (Number(b.remainingQty) || 0), 0);
              if (totalRemaining > 0 && !next.has(skuId)) {
                next.set(skuId, totalRemaining);
              }
            }
          });
          return next;
        });
      }

      setMaterials(prev => prev.map(m => {
        const sId = m.skuId || backendSkus.find(s => 
          (m.code && s.skuCode?.toLowerCase().trim() === m.code.toLowerCase().trim()) ||
          (m.component && s.name?.toLowerCase().trim() === m.component.toLowerCase().trim())
        )?._id;

        const rateInfo = sId ? ratesMap[sId] : null;
        if (!rateInfo) return m;

        const matchedSku = backendSkus.find(s => 
          (sId && String(s._id) === String(sId)) ||
          (m.code && s.skuCode?.toLowerCase().trim() === m.code.toLowerCase().trim()) ||
          (m.component && s.name?.toLowerCase().trim() === m.component.toLowerCase().trim())
        );

        // Rate from backend is expressed in rateInfo.unit (which corresponds to targetUom)
        const rateUnit = (rateInfo.unit || matchedSku?.unit || 'PCS').trim().toUpperCase();
        const currentUom = (m.uom || matchedSku?.unit || 'PCS').trim().toUpperCase();

        const rateConvSku = {
          unit: rateInfo.stockingUnit || rateInfo.unit || matchedSku?.unit,
          altUnit: rateInfo.altUnit || matchedSku?.altUnit,
          altUnitConversion: rateInfo.altUnitConversion ?? matchedSku?.altUnitConversion,
          altUnitDirection: rateInfo.altUnitDirection || matchedSku?.altUnitDirection
        };

        const rawProdRate = Number(rateInfo.productionRate) || 0;
        const rawLastProdRate = Number(rateInfo.lastProductionRate) || 0;
        const rawAvgRate = Number(rateInfo.avgRate) || 0;
        const rawFifoRate = Number(rateInfo.fifoRate) || 0;
        const rawStandardRate = Number(rateInfo.standardRate) || 0;

        // Fallback directly from stock inventory data on matchedSku if backend rate is 0
        const fallbackSkuPrice = Number((matchedSku as any)?.avgRate || (matchedSku as any)?.avgCost || matchedSku?.costPrice || matchedSku?.purchasePrice || matchedSku?.standardCost || 0);
        const convertedFallbackRate = fallbackSkuPrice > 0 ? convertRateToUom(fallbackSkuPrice, matchedSku?.unit || 'PCS', currentUom, rateConvSku) : 0;

        const convertedAvgRate = rawAvgRate > 0
          ? (rateUnit === currentUom ? rawAvgRate : convertRateToUom(rawAvgRate, rateUnit, currentUom, rateConvSku))
          : convertedFallbackRate;
        const convertedFifoRate = rawFifoRate > 0
          ? (rateUnit === currentUom ? rawFifoRate : convertRateToUom(rawFifoRate, rateUnit, currentUom, rateConvSku))
          : convertedFallbackRate;
        const convertedProdRate = rawProdRate > 0
          ? (rateUnit === currentUom ? rawProdRate : convertRateToUom(rawProdRate, rateUnit, currentUom, rateConvSku))
          : 0;
        const convertedLastProdRate = rawLastProdRate > 0
          ? (rateUnit === currentUom ? rawLastProdRate : convertRateToUom(rawLastProdRate, rateUnit, currentUom, rateConvSku))
          : 0;
        const convertedStandardRate = rawStandardRate > 0
          ? (rateUnit === currentUom ? rawStandardRate : convertRateToUom(rawStandardRate, rateUnit, currentUom, rateConvSku))
          : convertedFallbackRate;

        const mode = modeToApply || m.rateMode || globalRateMode;
        let finalRate = m.rate;
        if (mode === 'avg_purchase') {
          finalRate = convertedAvgRate > 0
            ? convertedAvgRate
            : (convertedProdRate > 0 ? convertedProdRate : (convertedLastProdRate > 0 ? convertedLastProdRate : (m.rate > 0 ? m.rate : convertedStandardRate)));
        } else if (mode === 'fifo') {
          finalRate = convertedFifoRate > 0
            ? convertedFifoRate
            : (convertedProdRate > 0 ? convertedProdRate : (convertedLastProdRate > 0 ? convertedLastProdRate : (m.rate > 0 ? m.rate : convertedStandardRate)));
        } else if (mode === 'custom') {
          finalRate = m.rate > 0
            ? m.rate
            : (convertedProdRate > 0 ? convertedProdRate : (convertedLastProdRate > 0 ? convertedLastProdRate : (convertedAvgRate || convertedStandardRate || 0)));
        }

        return {
          ...m,
          skuId: sId || m.skuId,
          rateMode: mode,
          rate: finalRate,
          computedAvgRate: convertedAvgRate,
          computedFifoRate: convertedFifoRate,
          lastProductionRate: convertedLastProdRate,
          productionRate: convertedProdRate,
          fifoBatchInfo: rateInfo.fifoBatchInfo,
          batchesAllocated: rateInfo.fifoBatchInfo?.allocatedBatches?.map(a => ({
            batchNumber: a.batchNumber,
            qty: a.qty,
            rate: a.rate
          })),
          batchCount: rateInfo.batchCount,
          amount: Math.round(m.requiredQty * finalRate * 100) / 100
        };
      }));
    } catch (err) {
      console.error('Failed to fetch material rates:', err);
    } finally {
      setLoadingMaterialRates(false);
    }
  };

  // Handle toggling/changing UOM for a material line (e.g. PCS <-> GBL)
  const handleMaterialUomChange = (rowId: string, newUom: string) => {
    setMaterials(prev => prev.map(m => {
      if (m.id !== rowId) return m;
      const oldUom = m.uom || 'PCS';
      if (oldUom.toLowerCase() === newUom.toLowerCase()) return m;

      const matched = backendSkus.find(s => 
        (m.skuId && s._id === m.skuId) ||
        (m.code && s.skuCode?.toLowerCase().trim() === m.code.toLowerCase().trim()) ||
        (m.component && s.name?.toLowerCase().trim() === m.component.toLowerCase().trim())
      );

      const newRequiredQty = convertUom(m.requiredQty, oldUom, newUom, matched);
      const newRate = convertRateToUom(m.rate, oldUom, newUom, matched);
      const newAmount = Math.round(newRequiredQty * newRate * 100) / 100;
      const newAvgRate = m.computedAvgRate ? convertRateToUom(m.computedAvgRate, oldUom, newUom, matched) : undefined;
      const newFifoRate = m.computedFifoRate ? convertRateToUom(m.computedFifoRate, oldUom, newUom, matched) : undefined;
      const newProdRate = m.productionRate ? convertRateToUom(m.productionRate, oldUom, newUom, matched) : undefined;
      const newLastProdRate = m.lastProductionRate ? convertRateToUom(m.lastProductionRate, oldUom, newUom, matched) : undefined;

      return {
        ...m,
        uom: newUom,
        requiredQty: newRequiredQty,
        rate: newRate,
        amount: newAmount,
        computedAvgRate: newAvgRate,
        computedFifoRate: newFifoRate,
        productionRate: newProdRate,
        lastProductionRate: newLastProdRate
      };
    }));
  };

  // Switch all materials to a specific Rate Mode
  const applyGlobalRateMode = (mode: BomRateMode) => {
    setGlobalRateMode(mode);
    setMaterials(prev => prev.map(m => {
      let newRate = m.rate;
      if (mode === 'avg_purchase') {
        newRate = (m.computedAvgRate !== undefined && m.computedAvgRate > 0) ? m.computedAvgRate : m.rate;
      } else if (mode === 'fifo') {
        newRate = (m.computedFifoRate !== undefined && m.computedFifoRate > 0) ? m.computedFifoRate : m.rate;
      }
      return {
        ...m,
        rateMode: mode,
        rate: newRate,
        amount: Math.round(m.requiredQty * newRate * 100) / 100
      };
    }));
    showToast(
      mode === 'avg_purchase' ? 'Applied Average of Purchase Batch Rates to BOM' :
      mode === 'fifo' ? 'Applied FIFO Rates (Earliest Active Lots) to BOM' :
      'Switched BOM to Custom / Manual Rates',
      'info'
    );
  };

  // Switch a single row's Rate Mode
  const handleSetRowRateMode = (rowId: string, mode: BomRateMode, customRateValue?: number) => {
    setMaterials(prev => prev.map(m => {
      if (m.id !== rowId) return m;
      let newRate = m.rate;
      if (mode === 'avg_purchase') {
        newRate = (m.computedAvgRate !== undefined && m.computedAvgRate > 0) ? m.computedAvgRate : m.rate;
      } else if (mode === 'fifo') {
        newRate = (m.computedFifoRate !== undefined && m.computedFifoRate > 0) ? m.computedFifoRate : m.rate;
      } else if (mode === 'custom') {
        newRate = customRateValue !== undefined ? customRateValue : m.rate;
      }
      return {
        ...m,
        rateMode: mode,
        rate: newRate,
        amount: Math.round(m.requiredQty * newRate * 100) / 100
      };
    }));
  };

  // Material Table Row Handlers
  const handleAddMaterial = () => {
    const newId = `mat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setMaterials(prev => [
      ...prev,
      {
        id: newId,
        component: '',
        code: '',
        uom: 'PCS',
        requiredQty: 1,
        sourceLocation: 'SKBW - Ground Floor',
        rateMode: globalRateMode,
        rate: 0,
        amount: 0
      }
    ]);
    setActiveMaterialDropdownId(newId);
  };

  const handleDuplicateMaterial = (idx: number) => {
    const rowToCopy = { 
      ...materials[idx], 
      id: `mat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}` 
    };
    setMaterials(prev => [...prev.slice(0, idx + 1), rowToCopy, ...prev.slice(idx + 1)]);
  };

  const handleDeleteMaterial = (id: string) => {
    setMaterials(prev => prev.filter(m => m.id !== id));
  };

  const handleUpdateMaterial = (id: string, field: keyof MaterialRow, value: any) => {
    setMaterials(prev => {
      let fifoRecalcNeeded = false;
      const updatedList = prev.map(m => {
        if (m.id !== id) return m;
        const updated = { ...m, [field]: value };
        if (field === 'requiredQty' || field === 'rate') {
          const qty = field === 'requiredQty' ? Number(value) || 0 : m.requiredQty;
          const rate = field === 'rate' ? Number(value) || 0 : m.rate;
          updated.amount = Math.round(qty * rate * 100) / 100;
          if (field === 'rate') {
            updated.rateMode = 'custom';
          }
          if (field === 'requiredQty' && plannedPcs > 0) {
            updated.basePerPiece = qty / plannedPcs;
          }
          if (field === 'requiredQty' && (m.rateMode === 'fifo' || globalRateMode === 'fifo')) {
            fifoRecalcNeeded = true;
          }
        }
        return updated;
      });

      if (fifoRecalcNeeded) {
        setTimeout(() => {
          fetchAndApplyMaterialRates(updatedList, 'fifo');
        }, 300);
      }

      return updatedList;
    });
  };

  const handleSelectMaterialSku = (rowId: string, sku: SkuV2) => {
    const defaultRate = Number(sku.purchasePrice || (sku as any).standardCost || (sku as any).costPrice || 0);
    const uomVal = (sku.unit || 'PCS').toUpperCase().trim();

    setMaterials(prev => {
      const updated = prev.map(row => {
        if (row.id !== rowId) return row;
        const qty = row.requiredQty > 0 ? row.requiredQty : 1;
        const cached = materialRatesCache[String(sku._id)];

        let chosenRate = defaultRate > 0 ? defaultRate : row.rate;
        let mode: BomRateMode = row.rateMode || globalRateMode;
        if (cached) {
          if (mode === 'avg_purchase' && cached.avgRate > 0) chosenRate = cached.avgRate;
          else if (mode === 'fifo' && cached.fifoRate > 0) chosenRate = cached.fifoRate;
        }

        return {
          ...row,
          skuId: sku._id,
          component: sku.name,
          code: sku.skuCode || row.code,
          uom: uomVal,
          rateMode: mode,
          rate: chosenRate,
          computedAvgRate: cached?.avgRate,
          computedFifoRate: cached?.fifoRate,
          fifoBatchInfo: cached?.fifoBatchInfo,
          batchCount: cached?.batchCount,
          amount: Math.round(qty * chosenRate * 100) / 100
        };
      });
      fetchAndApplyMaterialRates(updated);
      return updated;
    });
    setActiveMaterialDropdownId(null);
  };

  // Scrap Handlers
  const handleAddScrap = () => {
    const newId = `scrap-${Date.now()}`;
    setScrapItems(prev => [
      ...prev,
      {
        id: newId,
        item: 'Paper Trimmings & Shavings',
        uom: 'KG',
        qty: 1,
        rate: 15,
        amount: 15
      }
    ]);
  };

  const handleDeleteScrap = (id: string) => {
    setScrapItems(prev => prev.filter(s => s.id !== id));
  };

  const handleUpdateScrap = (id: string, field: keyof ScrapRow, value: any) => {
    setScrapItems(prev => prev.map(s => {
      if (s.id !== id) return s;
      const updated = { ...s, [field]: value };
      if (field === 'qty' || field === 'rate') {
        const qty = field === 'qty' ? Number(value) || 0 : s.qty;
        const rate = field === 'rate' ? Number(value) || 0 : s.rate;
        updated.amount = Math.round(qty * rate * 100) / 100;
      }
      return updated;
    }));
  };

  // By-Product / Scrap Preset Handlers
  const handleAddPresetScrap = (preset: ScrapPreset) => {
    const newId = `scrap-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newRow: ScrapRow = {
      id: newId,
      item: preset.item,
      uom: preset.uom || 'KG',
      qty: 1,
      rate: preset.defaultRate || 0,
      amount: Math.round(1 * (preset.defaultRate || 0) * 100) / 100
    };
    setScrapItems(prev => [...prev, newRow]);
    showToast(`Added scrap: "${preset.item}"`, 'success');
  };

  const handleAddNewScrapPreset = () => {
    if (!newScrapItem.trim()) {
      showToast('Please enter scrap item name', 'error');
      return;
    }
    const newPreset: ScrapPreset = {
      id: `scrap-p-${Date.now()}`,
      item: newScrapItem.trim(),
      uom: newScrapUom.trim() || 'KG',
      defaultRate: Number(newScrapRate) || 0
    };
    const updated = [newPreset, ...scrapPresets];
    setScrapPresets(updated);
    try {
      localStorage.setItem('skbw_scrap_presets_v2', JSON.stringify(updated));
    } catch (e) {}
    setNewScrapItem('');
    setNewScrapRate('');
    showToast(`Added scrap preset "${newPreset.item}"`, 'success');
  };

  const handleDeleteScrapPreset = (id: string) => {
    const updated = scrapPresets.filter(p => p.id !== id);
    setScrapPresets(updated);
    try {
      localStorage.setItem('skbw_scrap_presets_v2', JSON.stringify(updated));
    } catch (e) {}
    showToast('Removed scrap preset', 'info');
  };

  // Additional Costs Handlers
  const handleAddCost = () => {
    const newId = `cost-${Date.now()}`;
    setAdditionalCosts(prev => [
      ...prev,
      {
        id: newId,
        costType: '',
        basis: 'Total / Batch',
        amount: 0,
        appliedAs: 'Total Cost for this production'
      }
    ]);
  };

  const handleDeleteCost = (id: string) => {
    setAdditionalCosts(prev => prev.filter(c => c.id !== id));
  };

  const handleUpdateCost = (id: string, field: keyof AdditionalCostRow, value: any) => {
    setAdditionalCosts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  // Financial Cost Totals
  const totalMaterialCost = useMemo(() => {
    return materials.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [materials]);

  const totalScrapCost = useMemo(() => {
    return scrapItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [scrapItems]);

  const totalAdditionalCost = useMemo(() => {
    return additionalCosts.reduce((sum, row) => {
      const amt = Number(row.amount) || 0;
      const b = (row.basis || '').toLowerCase().trim();
      const a = (row.appliedAs || '').toLowerCase().trim();

      // 1. Per BOM / Per Batch (multiplied with BOM automatically!)
      if (b === 'per bom' || a === 'per bom' || (b === 'per batch' && a === 'per batch') || (b.includes('batch') && !b.includes('total') && a.includes('batch'))) {
        return sum + (amt * bomMultiplier);
      }

      // 2. Fixed Total / Batch (flat lump sum for the whole production order)
      if (b.includes('total') || b === 'fixed' || b === 'lump sum' || a.includes('total') || a === 'fixed') {
        return sum + amt;
      }

      // 3. Per GBL
      if (b === 'per gbl' || a.includes('(gbl)')) {
        return sum + (amt * (plannedGbl || 1));
      }

      // 4. Per Piece
      if (b === 'per piece' || a.includes('(pcs)')) {
        return sum + (amt * (plannedPcs || 1));
      }

      // Default for any batch basis if not matched above
      if (b.includes('batch') || a.includes('batch')) {
        return sum + (amt * bomMultiplier);
      }

      return sum + amt;
    }, 0);
  }, [additionalCosts, plannedGbl, plannedPcs, bomMultiplier]);

  // Production Cost Ledger: Material Cost + Overheads
  const totalProductionCost = useMemo(() => {
    return totalMaterialCost + totalAdditionalCost;
  }, [totalMaterialCost, totalAdditionalCost]);

  const costPerGbl = useMemo(() => {
    if (plannedGbl <= 0) return 0;
    return Math.round((totalProductionCost / plannedGbl) * 100) / 100;
  }, [totalProductionCost, plannedGbl]);

  const costPerPiece = useMemo(() => {
    if (plannedPcs <= 0) return 0;
    return Math.round((totalProductionCost / plannedPcs) * 100) / 100;
  }, [totalProductionCost, plannedPcs]);

  // Dynamic Profit & Selling Price calculations
  const profitCostingSummary = useMemo(() => {
    const markupPct = Number(profitPricing.markupPercentage) || 0;
    let suggestedPricePcs = 0;
    if (markupPct > 0) {
      if (profitPricing.pricingMethod === 'Margin %') {
        suggestedPricePcs = markupPct < 100 ? costPerPiece / (1 - markupPct / 100) : costPerPiece;
      } else {
        // Markup %
        suggestedPricePcs = costPerPiece * (1 + markupPct / 100);
      }
    } else {
      suggestedPricePcs = costPerPiece;
    }
    const factor = conversionFactor > 0 ? conversionFactor : 400;
    const suggestedPriceGbl = suggestedPricePcs * factor;
    const totalRevenue = suggestedPricePcs * plannedPcs;
    const projectedProfit = totalRevenue - totalProductionCost;

    return {
      suggestedPricePcs: Math.round(suggestedPricePcs * 100) / 100,
      suggestedPriceGbl: Math.round(suggestedPriceGbl * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      projectedProfit: Math.round(projectedProfit * 100) / 100
    };
  }, [profitPricing, costPerPiece, conversionFactor, plannedPcs, totalProductionCost]);

  const formatCurrency = (val: number) => {
    return (val || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatStockQty = (val: number) => {
    const num = Number(val) || 0;
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3
    });
  };

  // Helper to resolve live available stock for any material component
  const getLiveStockForMaterial = (m: MaterialRow) => {
    const matchedSku = backendSkus.find(s => 
      (m.skuId && String(s._id) === String(m.skuId)) ||
      (m.code && s.skuCode?.toLowerCase().trim() === m.code.toLowerCase().trim()) ||
      (m.component && s.name?.toLowerCase().trim() === m.component.toLowerCase().trim())
    );

    const sId = matchedSku?._id ? String(matchedSku._id) : (m.skuId ? String(m.skuId) : '');
    const sCode = (matchedSku?.skuCode || m.code || '').toLowerCase().trim();
    const sName = (matchedSku?.name || m.component || '').toLowerCase().trim();

    let stockQty = 0;
    let hasEntry = false;

    if (sId && liveStockMap.has(sId)) {
      stockQty = liveStockMap.get(sId)!;
      hasEntry = true;
    } else if (sCode && liveStockMap.has(sCode)) {
      stockQty = liveStockMap.get(sCode)!;
      hasEntry = true;
    } else if (sName && liveStockMap.has(sName)) {
      stockQty = liveStockMap.get(sName)!;
      hasEntry = true;
    }

    if (!hasEntry && matchedSku) {
      if (matchedSku.presentStock !== undefined && matchedSku.presentStock !== null) {
        stockQty = Number(matchedSku.presentStock) || 0;
        hasEntry = true;
      } else if (matchedSku.openingStock !== undefined && matchedSku.openingStock !== null) {
        stockQty = Number(matchedSku.openingStock) || 0;
        hasEntry = true;
      }
    }

    if (stockQty === 0 && m.fifoBatchInfo?.allocatedBatches && m.fifoBatchInfo.allocatedBatches.length > 0) {
      const batchTotal = m.fifoBatchInfo.allocatedBatches.reduce((acc, b: any) => acc + (Number(b.batchTotalRemaining) || Number(b.qty) || 0), 0);
      if (batchTotal > 0) stockQty = batchTotal;
    }

    // Stock is stored in the SKU's primary stocking unit (e.g. GBL for RM-027, KG for reels, PCS for books)
    const uom = (matchedSku?.unit || m.uom || 'PCS').trim();
    const reqQty = Number(m.requiredQty) || 0;
    const reqUom = (m.uom || uom).trim();

    // Convert stock quantity to the row's required UOM to accurately check availability
    const stockInReqUom = convertUom(stockQty, uom, reqUom, matchedSku);
    const isAvailable = stockInReqUom >= reqQty;
    const shortage = Math.max(0, reqQty - stockInReqUom);

    return {
      stockQty,
      uom,
      stockInReqUom,
      reqQty,
      isAvailable,
      shortage,
      matchedSku
    };
  };

  // Explicit refresh of live balances
  const handleRefreshStock = async () => {
    if (!companyId) return;
    setIsStockLoading(true);
    try {
      const balances = await getBalancesV2(companyId).catch(() => []);
      const bMap = new Map<string, number>();
      if (Array.isArray(balances)) {
        balances.forEach((b: any) => {
          const rawId = b.skuId || b.sku?._id;
          const sId = rawId ? String((rawId as any)._id || rawId) : '';
          const sCode = (b.sku?.skuCode || b.skuCode || '').toLowerCase().trim();
          const sName = (b.sku?.name || b.name || '').toLowerCase().trim();
          const qty = Number(b.onHand) || Number(b.quantity) || 0;
          if (sId) bMap.set(sId, (bMap.get(sId) || 0) + qty);
          if (sCode) bMap.set(sCode, (bMap.get(sCode) || 0) + qty);
          if (sName) bMap.set(sName, (bMap.get(sName) || 0) + qty);
        });
      }
      backendSkus.forEach(s => {
        const sId = s._id ? String(s._id) : '';
        const sCode = (s.skuCode || '').toLowerCase().trim();
        const sName = (s.name || '').toLowerCase().trim();
        const fallback = Number(s.presentStock !== undefined ? s.presentStock : (s.openingStock || 0));
        if (sId && !bMap.has(sId)) bMap.set(sId, fallback);
        if (sCode && !bMap.has(sCode)) bMap.set(sCode, fallback);
        if (sName && !bMap.has(sName)) bMap.set(sName, fallback);
      });
      setLiveStockMap(bMap);
    } catch (err) {
      console.error('Failed to refresh stock balances:', err);
    } finally {
      setIsStockLoading(false);
    }
  };

  // Submit Order (Planned or Draft)
  const handleCreateOrder = async (statusOverride?: 'Planned' | 'Draft') => {
    if (!productName.trim()) {
      showToast('Please select a product to manufacture', 'error');
      return;
    }
    if (numPlannedQty <= 0) {
      showToast('Please enter a planned quantity greater than 0', 'error');
      return;
    }

    const finalStatus = statusOverride || orderStatus;

    try {
      setSubmitting(true);

      const payload: any = {
        orderNumber: orderNumber.trim() || 'PO-0001',
        itemId: currentSku?._id || undefined,
        itemName: productName.trim(),
        itemCode: productCode.trim() || 'FG-001',
        itemType: (currentSku && getItemClassification(currentSku) === 'semi') ? 'Semi Finished' : 'Finished Good',
        plannedQty: numPlannedQty,
        plannedUom: uom,
        plannedPcs: plannedPcs,
        conversionFactor: conversionFactor,
        recipeYieldQty: Number(currentSku?.recipeYieldQty || currentSku?.batchYieldQty) || 1,
        recipeYieldUnit: (currentSku as any)?.recipeYieldUnit || (currentSku as any)?.batchYieldUnit || uom,
        producedQty: editOrder?.producedQty || 0,
        producedPcs: editOrder?.producedPcs || 0,
        balanceQty: Math.max(0, numPlannedQty - (editOrder?.producedQty || 0)),
        balancePcs: Math.max(0, plannedPcs - (editOrder?.producedPcs || 0)),
        materialStatus: editOrder?.materialStatus || 'Ready',
        status: finalStatus,
        progress: editOrder?.progress || 0,
        department: department.trim(),
        factory: outputLocation.trim(),
        outputLocation: outputLocation.trim(),
        outputLocationId: selectedLocId || undefined,
        locationId: selectedLocId || undefined,
        warehouseId: selectedWhId || undefined,
        floorId: selectedFlId || undefined,
        zoneId: selectedZnId || undefined,
        orderDate: orderDate,
        plannedStartDate: orderDate,
        requiredCompletionDate: orderDate,
        priority: editOrder?.priority || 'Normal',
        remarks: remarks.trim(),
        reference: salesOrderRef || editOrder?.reference || undefined,
        referenceSalesOrderId: salesOrderId || editOrder?.referenceSalesOrderId || undefined,
        source: salesOrderRef ? 'Sales Order' : (editOrder?.source || undefined),
        bomType: 'Custom BOM (Production Order Only)',
        bomItems: materials.map(m => {
          const sId = m.skuId ? String(m.skuId) : '';
          const sCode = (m.code || '').toLowerCase().trim();
          const sName = (m.component || '').toLowerCase().trim();
          const matchedSku = backendSkus.find(s => 
            (sId && s._id === sId) || 
            (sCode && (s.skuCode || '').toLowerCase() === sCode) || 
            (sName && (s.name || '').toLowerCase() === sName)
          );
          let realStock = 0;
          if (sId && liveStockMap.has(sId)) realStock = liveStockMap.get(sId)!;
          else if (sCode && liveStockMap.has(sCode)) realStock = liveStockMap.get(sCode)!;
          else if (sName && liveStockMap.has(sName)) realStock = liveStockMap.get(sName)!;
          else {
            realStock = Number(matchedSku?.presentStock ?? matchedSku?.openingStock ?? 0);
          }

          const skuStockUnit = (matchedSku?.unit || m.uom || 'PCS').trim();
          const rowUom = (m.uom || skuStockUnit).trim();
          const stockInRowUom = convertUom(realStock, skuStockUnit, rowUom, matchedSku);
          const isStockAvail = stockInRowUom >= (Number(m.requiredQty) || 0);

          return {
            id: m.id,
            skuId: m.skuId,
            component: m.component,
            code: m.code,
            type: 'Raw',
            qtyPerBatch: m.requiredQty,
            totalRequired: m.requiredQty,
            uom: m.uom,
            availableStock: realStock,
            stockStatus: isStockAvail ? 'Available' : 'Shortage',
            rateMode: m.rateMode || 'avg_purchase',
            rate: m.rate,
            amount: m.amount,
            sourceLocation: m.sourceLocation,
            batchesAllocated: (m.batchesAllocated && m.batchesAllocated.reduce((acc: number, b: any) => acc + (Number(b.qty) || 0), 0) >= (Number(m.requiredQty) || 0) * 0.95)
              ? m.batchesAllocated
              : undefined,
            fifoBatchInfo: m.fifoBatchInfo
          };
        }),
        byProducts: scrapItems,
        additionalCosts: additionalCosts.map(c => {
          const amt = Number(c.amount) || 0;
          const b = (c.basis || '').toLowerCase().trim();
          const a = (c.appliedAs || '').toLowerCase().trim();
          let lineTotal = amt;
          if (b === 'per bom' || a === 'per bom' || (b === 'per batch' && a === 'per batch') || (b.includes('batch') && !b.includes('total') && a.includes('batch'))) {
            lineTotal = Math.round(amt * bomMultiplier * 100) / 100;
          } else if (b === 'per gbl' || a.includes('(gbl)')) {
            lineTotal = Math.round(amt * (plannedGbl || 1) * 100) / 100;
          } else if (b === 'per piece' || a.includes('(pcs)')) {
            lineTotal = Math.round(amt * (plannedPcs || 1) * 100) / 100;
          }
          return {
            ...c,
            totalAmount: lineTotal
          };
        }),
        profitPricing: {
          pricingMethod: profitPricing.pricingMethod,
          markupPercentage: profitPricing.markupPercentage,
          suggestedPricePcs: profitCostingSummary.suggestedPricePcs,
          suggestedPriceGbl: profitCostingSummary.suggestedPriceGbl,
          totalRevenue: profitCostingSummary.totalRevenue,
          projectedProfit: profitCostingSummary.projectedProfit
        },
        costSummary: {
          materialCost: totalMaterialCost,
          additionalCost: totalAdditionalCost,
          totalProductionCost: totalProductionCost,
          outputQuantity: `${plannedPcs} PCS (${plannedGbl.toFixed(2)} GBL)`,
          costPerGbl: costPerGbl,
          costPerPiece: costPerPiece,
          suggestedPricePcs: profitCostingSummary.suggestedPricePcs,
          suggestedPriceGbl: profitCostingSummary.suggestedPriceGbl
        },
        productionEntries: editOrder?.productionEntries || [],
        company: companyId
      };

      if (editOrder) {
        const updated = await updateProductionOrder(editOrder._id, payload);
        showToast(`Production Order ${updated.orderNumber} updated successfully!`, 'success');
        onCreated(updated);
      } else {
        const created = await createProductionOrder(payload);
        showToast(`Production Order ${created.orderNumber} created successfully!`, 'success');
        onCreated(created);
      }
    } catch (err: any) {
      console.error('Failed to save production order:', err);
      showToast(err.response?.data?.msg || err.message || 'Failed to save production order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter finished goods and semi-finished matching search, category, and type
  const categoryBreakdown = useMemo(() => {
    const catMap = new Map<string, number>();
    let finishedCount = 0;
    let semiCount = 0;

    manufacturableSkus.forEach(s => {
      const type = getItemClassification(s);
      if (type === 'products') finishedCount++;
      if (type === 'semi') semiCount++;

      const cat = (s.category || '').trim();
      if (cat) {
        catMap.set(cat, (catMap.get(cat) || 0) + 1);
      }
    });

    const sortedCategories = Array.from(catMap.entries())
      .sort((a, b) => b[1] - a[1]);

    return {
      total: manufacturableSkus.length,
      finishedCount,
      semiCount,
      categories: sortedCategories
    };
  }, [manufacturableSkus]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    return manufacturableSkus.filter(s => {
      // 1. Classification type filter
      if (productTypeFilter !== 'ALL') {
        const type = getItemClassification(s);
        if (type !== productTypeFilter) return false;
      }

      // 2. Category filter
      if (productCategoryFilter !== 'ALL') {
        const cat = (s.category || '').trim().toLowerCase();
        if (cat !== productCategoryFilter.toLowerCase()) return false;
      }

      // 3. Search query
      if (q) {
        const matchName = (s.name || '').toLowerCase().includes(q);
        const matchCode = (s.skuCode || '').toLowerCase().includes(q);
        const matchBrand = (s.brand || '').toLowerCase().includes(q);
        const matchCat = (s.category || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchBrand && !matchCat) return false;
      }

      return true;
    });
  }, [manufacturableSkus, productSearch, productTypeFilter, productCategoryFilter]);

  return (
    <div className="flex flex-col h-full bg-slate-50/70 text-gray-800 font-sans select-none overflow-hidden text-xs">
      
      {/* ── MODAL HEADER (1:1 with Sales Order Drawer) ── */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-xs">
            <Layers className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-gray-900 tracking-tight">
                {editOrder ? `Edit Production Order (${editOrder.orderNumber})` : 'Create Production Order'}
              </h2>
              {editOrder && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Editing Mode
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              {editOrder ? 'Update planned quantities, schedule, components & costing' : 'Manufacturing execution with bill of materials & cost ledger'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-3xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleCreateOrder('Draft')}
            disabled={submitting}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 active:scale-98 text-slate-800 font-bold rounded-xl text-xs shadow-3xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Save order as Draft"
          >
            <FileText className="w-3.5 h-3.5 text-slate-600" />
            <span>{editOrder ? 'Save as Draft' : 'Draft Order'}</span>
          </button>
          <button
            type="button"
            onClick={() => handleCreateOrder('Planned')}
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold rounded-xl text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin stroke-[2.5]" />
                <span>{editOrder ? 'Saving...' : 'Creating...'}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 stroke-[2.5]" />
                <span>{editOrder ? 'Save Changes' : 'Create Production Order'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── SCROLLABLE MASTER BODY ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">

        {/* ── TOP SECTION: 3 WHITE CARDS (1:1 with Sales Order Drawer) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* CARD 1: Order Information (Fixed Height) */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200/80 p-4 shadow-3xs h-[305px] min-h-[305px] max-h-[305px] flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-900 pb-1 border-b border-gray-100">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Order Information</span>
            </div>

            {/* Production Order No & Order Date */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10.5px] font-bold text-gray-600 mb-1">
                  Order No. <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)}
                    placeholder="PO-001"
                    className="w-full pl-2.5 pr-12 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs"
                  />
                  <span className="absolute right-1.5 top-1 px-1.5 py-0.5 text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-200/60 rounded">
                    Auto
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-[10.5px] font-bold text-gray-600 mb-1">
                  Order Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={orderDate}
                  onChange={e => setOrderDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs"
                />
              </div>
            </div>

            {/* Department (Custom Preset Selector matching Sales Order 1:1) */}
            <div className="relative" ref={departmentRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10.5px] font-bold text-gray-600">
                  Department / Line
                </label>
                <button
                  type="button"
                  onClick={() => setShowManageDeptModal(true)}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                  title="Manage Department Presets"
                >
                  <Settings className="w-3 h-3" />
                  <span>Presets</span>
                </button>
              </div>

              {/* Trigger Button that looks like an input box with Chevron */}
              <div
                onClick={() => {
                  setShowDepartmentDropdown(!showDepartmentDropdown);
                  setHighlightedDeptIdx(0);
                }}
                className={`w-full px-3 py-1.5 bg-white border rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer transition-all shadow-3xs ${
                  showDepartmentDropdown ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className={department ? 'text-gray-900 font-bold truncate' : 'text-gray-400 font-medium'}>
                    {department || 'Select Department...'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  {department && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDepartment('');
                      }}
                      className="p-0.5 text-gray-400 hover:text-gray-600 rounded cursor-pointer"
                      title="Clear Department"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showDepartmentDropdown ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Department Presets Dropdown Popover (Exact 1:1 with Screenshot 2) */}
              {showDepartmentDropdown && (
                <div 
                  className="absolute left-0 right-0 top-full mt-1 w-full min-w-[280px] bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] py-1 text-xs divide-y divide-gray-100 animate-in fade-in zoom-in-95 duration-100"
                  role="menu"
                >
                  {/* Popover Header */}
                  <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between bg-gray-50/50">
                    <span className="flex items-center gap-1.5">
                      <span>Predefined Departments</span>
                      <kbd className="font-mono text-[9px] bg-gray-100 text-gray-600 px-1 py-0.5 rounded border border-gray-200">Alt+D</kbd>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDepartmentDropdown(false);
                        setShowManageDeptModal(true);
                      }}
                      className="text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer font-bold"
                    >
                      <Settings className="w-3 h-3" />
                      <span>Manage</span>
                    </button>
                  </div>

                  {/* Options List */}
                  <div className="max-h-56 overflow-y-auto py-1 scroll-smooth" ref={deptListRef}>
                    {departmentPresets.map((preset, pIdx) => {
                      const isHighlighted = pIdx === highlightedDeptIdx;
                      const isCurrent = department === preset.name;
                      return (
                        <div
                          key={preset.id}
                          onClick={() => {
                            handleSelectDepartmentPreset(preset);
                            setShowDepartmentDropdown(false);
                          }}
                          onMouseEnter={() => setHighlightedDeptIdx(pIdx)}
                          className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors cursor-pointer ${
                            isHighlighted
                              ? 'bg-blue-100/90 text-blue-900 font-bold ring-1 ring-inset ring-blue-400'
                              : isCurrent
                              ? 'bg-blue-50/70 text-blue-900 font-bold'
                              : 'hover:bg-blue-50/70 text-gray-800'
                          }`}
                          role="menuitem"
                        >
                          <span className="font-semibold truncate">{preset.name}</span>
                          {preset.locationName && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ml-2 bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {preset.locationName}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Popover Footer */}
                  <div className="px-3 py-1 bg-gray-50 text-[10px] text-gray-500 flex items-center justify-between">
                    <span>Use <kbd className="font-mono bg-white border border-gray-200 px-1 py-0.2 rounded font-bold">↑</kbd><kbd className="font-mono bg-white border border-gray-200 px-1 py-0.2 rounded font-bold ml-0.5">↓</kbd></span>
                    <span><kbd className="font-mono bg-white border border-gray-200 px-1 py-0.2 rounded font-bold">Enter</kbd> to select</span>
                  </div>
                </div>
              )}
            </div>

            {/* Order Status */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
              <label className="text-[11px] font-bold text-gray-600 shrink-0">
                Order Status
              </label>
              <select
                value={orderStatus}
                onChange={e => setOrderStatus(e.target.value as 'Planned' | 'Draft')}
                className="flex-1 px-3 py-1 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="Planned">Planned (Active Demand)</option>
                <option value="Draft">Draft</option>
              </select>
            </div>
          </div>

          {/* CARD 2: Product to Manufacture (Expanded Width with Category Shifting) */}
          <div className="lg:col-span-6 bg-white rounded-2xl border border-gray-200/80 p-3.5 shadow-3xs h-[305px] min-h-[305px] max-h-[305px] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                  <Package className="w-4 h-4 text-blue-600" />
                  <span>Product to Manufacture</span>
                </div>
                {productName ? (
                  <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                    <Check className="w-3 h-3 stroke-[3]" />
                    <span>Selected</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-400 font-mono">
                    {filteredProducts.length} of {categoryBreakdown.total} available
                  </span>
                )}
              </div>

              {/* Category & Type Shift Bar */}
              <div className="mb-2 bg-slate-50 border border-slate-200/70 rounded-xl p-1 flex items-center justify-between gap-1.5 flex-wrap">
                {/* Type Filter Pills: All / Finished / Semi */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setProductTypeFilter('ALL')}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      productTypeFilter === 'ALL'
                        ? 'bg-white text-blue-700 shadow-3xs border border-blue-200'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                    }`}
                  >
                    All ({categoryBreakdown.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductTypeFilter('products')}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      productTypeFilter === 'products'
                        ? 'bg-white text-blue-700 shadow-3xs border border-blue-200'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                    }`}
                  >
                    Finished ({categoryBreakdown.finishedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductTypeFilter('semi')}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      productTypeFilter === 'semi'
                        ? 'bg-white text-purple-700 shadow-3xs border border-purple-200'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                    }`}
                  >
                    Semi Goods ({categoryBreakdown.semiCount})
                  </button>
                </div>

                {/* Active Category Badge (if selected in popover) */}
                {productCategoryFilter !== 'ALL' && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-500 font-medium">Category:</span>
                    <button
                      type="button"
                      onClick={() => setProductCategoryFilter('ALL')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold hover:bg-blue-100 cursor-pointer transition-colors"
                      title="Clear category filter"
                    >
                      <span>{productCategoryFilter}</span>
                      <X className="w-3 h-3 text-blue-600" />
                    </button>
                  </div>
                )}
              </div>

              {/* Searchable Product Input */}
              <div className="relative" ref={productDropdownRef}>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    ref={productInputRef}
                    type="text"
                    value={productSearch || productName}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowProductDropdown(true);
                    }}
                    onClick={() => setShowProductDropdown(true)}
                    onFocus={() => setShowProductDropdown(true)}
                    placeholder={
                      productCategoryFilter !== 'ALL'
                        ? `Search in ${productCategoryFilter} (${filteredProducts.length} items)...`
                        : productTypeFilter === 'semi'
                        ? `Search semi-finished goods (${filteredProducts.length} items)...`
                        : productTypeFilter === 'products'
                        ? `Search finished products (${filteredProducts.length} items)...`
                        : "Search finished product or semi good to manufacture..."
                    }
                    title={productSearch || productName}
                    className="w-full pl-8 pr-10 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs"
                  />
                  <div className="absolute right-2 top-2 flex items-center gap-1 text-gray-400">
                    {productName ? (
                      <button
                        type="button"
                        onClick={() => {
                          setProductName('');
                          setProductCode('');
                          setSelectedSkuId('');
                          setProductSearch('');
                          setMaterials([]);
                        }}
                        className="p-1 hover:text-gray-600 rounded-md cursor-pointer"
                        title="Clear product"
                      >
                        <X className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                    ) : (
                      <ChevronDown 
                        className="w-4 h-4 cursor-pointer hover:text-gray-600" 
                        onClick={() => setShowProductDropdown(!showProductDropdown)} 
                      />
                    )}
                  </div>
                </div>

                {/* Product Dropdown Popover with Category Shift Filter Header */}
                {showProductDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-full min-w-[360px] sm:min-w-[500px] bg-white border border-gray-200 rounded-xl shadow-2xl z-[999] max-h-80 overflow-y-auto divide-y divide-gray-100 p-1">
                    {/* Popover Category Chips Header */}
                    <div className="sticky top-0 bg-white/95 backdrop-blur-xs p-2 border-b border-gray-100 z-10 space-y-1.5 shadow-3xs">
                      <div className="flex items-center justify-between text-[10px] font-bold text-gray-500">
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-blue-600" />
                          <span>Shift Category:</span>
                        </span>
                        <span>Showing {filteredProducts.length} of {categoryBreakdown.total}</span>
                      </div>
                      <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-thin">
                        <button
                          type="button"
                          onClick={() => setProductCategoryFilter('ALL')}
                          className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold shrink-0 transition-all cursor-pointer ${
                            productCategoryFilter === 'ALL'
                              ? 'bg-blue-600 text-white shadow-3xs'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          All ({categoryBreakdown.total})
                        </button>
                        {categoryBreakdown.categories.slice(0, 10).map(([cat, count]) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setProductCategoryFilter(cat)}
                            className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold shrink-0 transition-all cursor-pointer ${
                              productCategoryFilter === cat
                                ? 'bg-blue-600 text-white shadow-3xs'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {cat} ({count})
                          </button>
                        ))}
                      </div>
                    </div>

                    {filteredProducts.map((p) => {
                      const isSelected = p._id === selectedSkuId || p.name === productName;
                      const specBadge = getSkuSpecOrConversion(p);
                      return (
                        <div
                          key={p._id}
                          onClick={() => {
                            handleSelectProduct(p);
                            setShowProductDropdown(false);
                          }}
                          className={`p-2.5 cursor-pointer rounded-lg transition-colors flex items-center justify-between text-xs ${
                            isSelected ? 'bg-blue-100/90 font-bold border border-blue-200' : 'hover:bg-blue-50/80'
                          }`}
                        >
                          <div className="flex-1 min-w-0 pr-3">
                            <div className="font-bold text-gray-900 break-words leading-snug text-xs sm:text-[13px]">{p.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-gray-400 font-mono">{p.skuCode}</span>
                              <span className="text-[10px] text-gray-300">•</span>
                              <span className="text-[10px] font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.2 rounded border border-gray-200/60">
                                {p.category || 'General'}
                              </span>
                              {specBadge && (
                                <>
                                  <span className="text-[10px] text-gray-300">•</span>
                                  <span className="text-[10px] font-semibold text-indigo-600">{specBadge}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-full border ${
                              getItemClassification(p) === 'semi'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                              {getItemClassification(p) === 'semi' ? 'Semi Finished' : 'Finished Good'}
                            </span>
                            <span className="px-2 py-0.5 text-[9.5px] font-extrabold uppercase rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                              {p.status || 'Active'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {filteredProducts.length === 0 && (
                      <div className="p-4 text-center text-gray-400 italic">
                        No products found matching &ldquo;{productSearch}&rdquo; in {productCategoryFilter !== 'ALL' ? productCategoryFilter : 'this selection'}.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Product Detail Info Box (Fixed h-[142px]) */}
            {productName ? (
              <div className="h-[142px] p-3 bg-blue-50/30 rounded-xl border border-blue-100/80 flex flex-col justify-between text-[11px] text-gray-600">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-gray-900 text-xs leading-snug break-words line-clamp-2" title={productName}>{productName}</span>
                    <span className={`px-2 py-0.5 text-[9.5px] font-extrabold uppercase rounded-full border shrink-0 ${
                      getItemClassification(currentSku) === 'semi'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {getItemClassification(currentSku) === 'semi' ? 'Semi Finished' : 'Finished Good'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-0.5 text-[10.5px]">
                    <span className="font-mono text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-200/60 font-medium">
                      {productCode || 'FG-001'}
                    </span>
                    {currentSku?.brand && (
                      <span className="text-gray-600 font-medium">Brand: <strong className="text-gray-900">{currentSku.brand}</strong></span>
                    )}
                    {currentSku?.pages && (() => {
                      const cat = (currentSku.category || '').toLowerCase();
                      const isSheetBased = currentSku.paperType === 'Sheets' || cat.includes('ruling') || cat.includes('index') || cat.includes('board') || cat.includes('semi');
                      return (
                        <span className="text-gray-600 font-medium">
                          {currentSku.pages} {isSheetBased ? 'Sheets/Ream' : 'Pages'}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="pt-2 border-t border-blue-100/70 grid grid-cols-2 gap-2 text-center">
                  <div className="bg-white/90 p-1.5 rounded-lg border border-gray-100 shadow-3xs">
                    <div className="text-[9px] text-gray-500 font-bold uppercase">BOM Status</div>
                    <div className="font-bold text-emerald-700 text-[11px] mt-0.5">
                      {materials.length > 0 ? `Defined (${materials.length} Items)` : 'No BOM'}
                    </div>
                  </div>
                  <div className="bg-white/90 p-1.5 rounded-lg border border-gray-100 shadow-3xs">
                    <div className="text-[9px] text-gray-500 font-bold uppercase">Packing / Unit</div>
                    <div className="font-bold text-blue-900 text-[11px] mt-0.5">
                      {conversionFactor > 0 ? `${conversionFactor} Pcs/GBL` : (currentSku?.unit || 'PCS')}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[142px] p-4 bg-gray-50/80 rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center text-center text-gray-400">
                <Package className="w-7 h-7 text-gray-300 mb-1 stroke-[1.5]" />
                <p className="text-xs font-semibold text-gray-500">No Product Selected</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Search or shift categories above to load BOM and begin batch planning.
                </p>
              </div>
            )}
          </div>

          {/* CARD 3: Output Location & Targets (Decreased Size: lg:col-span-3) */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200/80 p-4 shadow-3xs h-[305px] min-h-[305px] max-h-[305px] flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-900 pb-1 border-b border-gray-100">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span>Output Location & Targets</span>
            </div>

            {/* Output Location with Mini Factory Warehouse Modal */}
            <div>
              <label className="block text-[10.5px] font-bold text-gray-600 mb-1">
                Output Location (Finished Goods) <span className="text-red-500">*</span>
              </label>
              <LocationSelectPopup
                locations={warehouseLocations}
                warehouseId={selectedWhId}
                floorId={selectedFlId}
                zoneId={selectedZnId}
                locationId={selectedLocId}
                displayValue={outputLocation}
                onChange={handleOutputLocationChange}
                variant="compact"
                hideLabel
                className="w-full"
                skuId={currentSku?._id || selectedSkuId || ''}
                unit={uom || currentSku?.unit || 'PCS'}
              />
            </div>

            {/* Planned Qty & UOM */}
            <div>
              <label className="block text-[10.5px] font-bold text-gray-600 mb-1">
                Planned Quantity to Produce <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={plannedQty}
                  onChange={e => setPlannedQty(e.target.value)}
                  placeholder="e.g. 5000"
                  className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs"
                />
                <select
                  value={uom}
                  onChange={e => setUom(e.target.value)}
                  className="w-24 px-2 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer shadow-3xs"
                >
                  {availableUnits.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Batch Target Stats (Fixed h-[64px]) */}
            <div className="p-2 bg-blue-50/40 rounded-xl border border-blue-100/70 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-gray-500 font-bold uppercase block">Target Output</span>
                <span className="font-extrabold text-blue-900 text-xs font-mono">
                  {numPlannedQty > 0 ? (
                    uom === 'GBL' 
                      ? `${plannedPcs.toLocaleString('en-IN')} PCS (${plannedQty} GBL)`
                      : `${plannedPcs.toLocaleString('en-IN')} PCS (${plannedGbl.toFixed(2)} GBL)`
                  ) : '0 PCS (0 GBL)'}
                </span>
              </div>
              {conversionFactor > 0 && (
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded-md text-[9.5px] font-bold bg-blue-100 text-blue-800 font-mono">
                    1 GBL = {conversionFactor} PCS
                  </span>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* ── MIDDLE SECTION: MATERIALS TO BE CONSUMED TABLE (1:1 with Sales Order Drawer) ── */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-3xs space-y-3 relative z-30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Materials to be Consumed (From BOM)</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* 3-Mode Global Rate Selector Pill Switcher */}
              <div className="flex items-center gap-1 bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/80 text-[11px]">
                <span className="text-gray-500 pl-2 pr-1 font-bold text-[10px] uppercase tracking-wider select-none">
                  Rate Mode:
                </span>
                <button
                  type="button"
                  onClick={() => applyGlobalRateMode('avg_purchase')}
                  className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
                    globalRateMode === 'avg_purchase'
                      ? 'bg-white text-indigo-700 shadow-2xs border border-indigo-200/60'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                  }`}
                  title="Apply weighted average purchase rate across active batches"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Avg Purchases</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyGlobalRateMode('fifo')}
                  className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
                    globalRateMode === 'fifo'
                      ? 'bg-white text-emerald-700 shadow-2xs border border-emerald-200/60'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                  }`}
                  title="First In, First Out: Unit price of earliest active inward batch"
                >
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>FIFO (Earliest Lot)</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyGlobalRateMode('custom')}
                  className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
                    globalRateMode === 'custom'
                      ? 'bg-white text-amber-700 shadow-2xs border border-amber-200/60'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                  }`}
                  title="Custom manual rates freely entered per row"
                >
                  <Pencil className="w-3.5 h-3.5 text-amber-600" />
                  <span>Custom Value</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (currentSku) handleSelectProduct(currentSku);
                  else showToast('Please select a product first', 'info');
                }}
                className="px-3 py-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-3xs"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Load from BOM</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCuttingSlipModal(true)}
                className="px-3 py-1.5 border border-teal-200 text-teal-700 bg-teal-50/70 hover:bg-teal-100 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-3xs"
                title="Convert raw reels into sheets via Cutting Slip voucher"
              >
                <Scissors className="w-3.5 h-3.5 text-teal-600" />
                <span>Cut Reels to Sheets</span>
              </button>

              <BomCopyPasteControls
                getCopyPayload={() => {
                  const hasItems = materials && materials.length > 0;
                  const hasCosts = additionalCosts && additionalCosts.length > 0;
                  if (!hasItems && !hasCosts) return null;
                  return {
                    sourceSkuId: currentSku?._id,
                    sourceSkuCode: currentSku?.skuCode || productCode,
                    sourceName: currentSku?.name || productName || 'Production Order',
                    basis: numPlannedQty,
                    basisUnit: uom,
                    lines: materials.map(m => ({
                      id: m.id,
                      skuId: m.skuId,
                      name: m.component,
                      qty: m.requiredQty,
                      uom: m.uom,
                      inStock: m.availableStock ?? 0,
                      rate: m.rate,
                      amount: m.amount,
                      notes: m.code || ''
                    })),
                    additionalCosts: additionalCosts.map(c => ({
                      id: c.id,
                      costType: c.costType,
                      calcBasis: c.basis,
                      amount: c.amount,
                      appliedAs: c.appliedAs
                    })),
                    profitPricing: profitPricing
                  };
                }}
                onPaste={(copied, mode) => {
                  if (mode === 'replace') {
                    setMaterials(copied.lines.map((l, i) => ({
                      id: `mat-paste-${Date.now()}-${i}`,
                      skuId: l.skuId,
                      component: l.name,
                      code: l.notes || '',
                      type: 'Raw',
                      uom: l.uom || 'Kg',
                      requiredQty: Number(l.qty) || 1,
                      availableStock: Number(l.inStock) || 0,
                      stockStatus: (Number(l.inStock) || 0) >= (Number(l.qty) || 1) ? 'Available' : 'Shortage',
                      rateMode: 'custom',
                      rate: Number(l.rate) || 0,
                      amount: Math.round((Number(l.qty) || 1) * (Number(l.rate) || 0) * 100) / 100,
                      sourceLocation: 'Raw Material Store'
                    })));
                    if (Array.isArray(copied.additionalCosts)) {
                      setAdditionalCosts(copied.additionalCosts.map((c, i) => ({
                        id: `cost-paste-${Date.now()}-${i}`,
                        costType: c.costType || '',
                        basis: (c.calcBasis || 'Per Piece') as any,
                        amount: Number(c.amount) || 0,
                        appliedAs: (c.appliedAs || 'Per Unit (PCS)') as any,
                        totalAmount: 0
                      })));
                    }
                    if (copied.profitPricing) {
                      setProfitPricing({
                        pricingMethod: 'Margin %',
                        markupPercentage: copied.profitPricing.markupPercentage ?? ''
                      });
                    }
                  } else {
                    const existingNames = new Set(materials.map(m => (m.component || '').toLowerCase().trim()));
                    const toAdd = copied.lines
                      .filter(l => !existingNames.has((l.name || '').toLowerCase().trim()))
                      .map((l, i) => ({
                        id: `mat-merge-${Date.now()}-${i}`,
                        skuId: l.skuId,
                        component: l.name,
                        code: l.notes || '',
                        type: 'Raw' as const,
                        uom: l.uom || 'Kg',
                        requiredQty: Number(l.qty) || 1,
                        availableStock: Number(l.inStock) || 0,
                        stockStatus: (Number(l.inStock) || 0) >= (Number(l.qty) || 1) ? 'Available' as const : 'Shortage' as const,
                        rateMode: 'custom' as const,
                        rate: Number(l.rate) || 0,
                        amount: Math.round((Number(l.qty) || 1) * (Number(l.rate) || 0) * 100) / 100,
                        sourceLocation: 'Raw Material Store'
                      }));
                    setMaterials(prev => [...prev, ...toAdd]);
                    if (Array.isArray(copied.additionalCosts) && copied.additionalCosts.length > 0) {
                      const existingTypes = new Set(additionalCosts.map(c => (c.costType || '').toLowerCase().trim()));
                      const costsToAdd = copied.additionalCosts
                        .filter(c => !existingTypes.has((c.costType || '').toLowerCase().trim()))
                        .map((c, i) => ({
                          id: `cost-merge-${Date.now()}-${i}`,
                          costType: c.costType,
                          basis: (c.calcBasis || 'Per Piece') as any,
                          amount: Number(c.amount) || 0,
                          appliedAs: (c.appliedAs || 'Per Unit (PCS)') as any,
                          totalAmount: 0
                        }));
                      setAdditionalCosts(prev => [...prev, ...costsToAdd]);
                    }
                    if (copied.profitPricing && (!profitPricing.markupPercentage || profitPricing.markupPercentage === '')) {
                      setProfitPricing({
                        pricingMethod: 'Margin %',
                        markupPercentage: copied.profitPricing.markupPercentage ?? ''
                      });
                    }
                  }
                }}
                existingCount={materials.length}
                onToast={(msg, type) => showToast(msg, type)}
              />

              <button
                type="button"
                onClick={handleAddMaterial}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-3xs"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>Add Material</span>
              </button>
            </div>
          </div>

          {/* Table matching Order Items in Sales Drawer with horizontal scrolling and no overflow */}
          <div className="overflow-x-auto border border-gray-200 rounded-xl custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs min-w-[920px]">
              <thead className="bg-gray-50/80 text-[10.5px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 select-none">
                <tr>
                  <th className="py-2 px-2 text-center w-8 whitespace-nowrap text-[10px]">#</th>
                  <th className="py-2 px-3 min-w-[290px] whitespace-nowrap text-[10px]">MATERIAL / COMPONENT <span className="text-red-500">*</span></th>
                  <th className="py-2 px-2 text-center w-20 whitespace-nowrap text-[10px]">ITEM CODE</th>
                  <th className="py-2 px-2 text-center w-14 whitespace-nowrap text-[10px]">UOM</th>
                  <th className="py-2 px-2.5 text-right w-24 whitespace-nowrap text-[10px]">REQUIRED QTY <span className="text-red-500">*</span></th>
                  <th className="py-2 px-2.5 min-w-[160px] whitespace-nowrap text-[10px]">SOURCE LOCATION</th>
                  <th className="py-2 px-2.5 text-right w-32 whitespace-nowrap text-[10px]">RATE (₹)</th>
                  <th className="py-2 px-2.5 text-right w-28 whitespace-nowrap text-[10px]">MATERIAL COST (₹)</th>
                  <th className="py-2 px-2 text-center w-20 whitespace-nowrap text-[10px]">ACTIONS</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white text-xs">
                {materials.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-xs text-gray-400 italic">
                      No materials added yet. Select a product above or click <strong className="text-blue-600 font-semibold cursor-pointer" onClick={handleAddMaterial}>"+ Add Material"</strong> to add components.
                    </td>
                  </tr>
                ) : (
                  materials.map((row, idx) => {
                    const isDropdownActive = activeMaterialDropdownId === row.id;

                    return (
                      <tr 
                        key={row.id} 
                        className="hover:bg-blue-50/30 transition-colors"
                      >
                        {/* # */}
                        <td className="py-1.5 px-2 text-center font-bold text-gray-400 text-[10.5px]">
                          {idx + 1}
                        </td>

                        {/* Material / Component Dropdown (Expanded, compact height, all title in one line) */}
                        <td className="py-1.5 px-3 relative material-dropdown-container min-w-[290px]">
                          <div className="relative w-full">
                            <input
                              type="text"
                              value={componentSearchMap[row.id] !== undefined ? componentSearchMap[row.id] : row.component}
                              onChange={(e) => {
                                setComponentSearchMap(prev => ({ ...prev, [row.id]: e.target.value }));
                                handleUpdateMaterial(row.id, 'component', e.target.value);
                                handleOpenMaterialDropdown(row.id, e.currentTarget);
                              }}
                              onClick={(e) => handleOpenMaterialDropdown(row.id, e.currentTarget)}
                              onFocus={(e) => handleOpenMaterialDropdown(row.id, e.currentTarget)}
                              placeholder="Select material / semi good..."
                              title={row.component || 'Select material / semi good...'}
                              className="w-full pl-2.5 pr-6 py-1 bg-white border border-gray-200 rounded-md text-[11px] font-semibold text-gray-800 focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer h-7"
                            />
                            <div className="absolute right-2 top-2 flex items-center">
                              {(row.component || componentSearchMap[row.id]) ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleUpdateMaterial(row.id, 'component', '');
                                    handleUpdateMaterial(row.id, 'code', '');
                                    setComponentSearchMap(prev => ({ ...prev, [row.id]: '' }));
                                    setActiveMaterialDropdownId(null);
                                  }}
                                  className="text-gray-400 hover:text-gray-600 cursor-pointer"
                                  title="Clear"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              ) : (
                                <ChevronDown 
                                  className="w-3 h-3 text-gray-400 cursor-pointer" 
                                  onClick={(e) => {
                                    if (isDropdownActive) {
                                      setActiveMaterialDropdownId(null);
                                    } else {
                                      const inputEl = (e.currentTarget.closest('.material-dropdown-container') as HTMLElement)?.querySelector('input');
                                      if (inputEl) handleOpenMaterialDropdown(row.id, inputEl);
                                    }
                                  }}
                                />
                              )}
                            </div>
                            {/* In-line Live Stock Indicator */}
                            {(row.component || row.code) && (() => {
                              const { stockQty, uom, isAvailable, matchedSku } = getLiveStockForMaterial(row);
                              const isZero = stockQty <= 0;
                              const conv = Number(matchedSku?.altUnitConversion || (matchedSku as any)?.booksGbl || (matchedSku as any)?.pcsPerGbl || 0);
                              const normUom = (uom || '').toUpperCase();
                              const altUom = (matchedSku?.altUnit || '').toUpperCase();
                              let altStockStr = '';
                              if (normUom === 'GBL' && conv > 0) {
                                const altVal = stockQty * conv;
                                altStockStr = `≈ ${altVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })} ${altUom || 'PCS'}`;
                              } else if ((normUom === 'PCS' || normUom === 'SHEETS') && conv > 0) {
                                const altVal = stockQty / conv;
                                altStockStr = `≈ ${altVal < 1 ? altVal.toFixed(3) : altVal.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${altUom || 'GBL'}`;
                              }

                              return (
                                <div className="flex items-center gap-1 mt-0.5 px-0.5 text-[9.5px]">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    isAvailable && !isZero ? 'bg-emerald-500' : !isZero ? 'bg-amber-500' : 'bg-rose-500'
                                  }`} />
                                  <span className="text-gray-400">Stock:</span>
                                  <span className={`font-mono font-bold ${
                                    isAvailable && !isZero ? 'text-emerald-700' : !isZero ? 'text-amber-700' : 'text-rose-700'
                                  }`}>
                                    {formatStockQty(stockQty)} {uom}
                                  </span>
                                  {altStockStr && (
                                    <span className="text-gray-400 font-mono text-[9px] font-medium">
                                      ({altStockStr})
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </td>

                        {/* Item Code */}
                        <td className="py-1.5 px-2 text-center">
                          <span className="font-mono text-[10px] font-medium text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200/60 inline-block w-full text-center">
                            {row.code || '—'}
                          </span>
                        </td>

                        {/* UOM */}
                        <td className="py-1.5 px-2 text-center min-w-[75px]">
                          {(() => {
                            const matched = backendSkus.find(s => 
                              (row.skuId && s._id === row.skuId) ||
                              (row.code && s.skuCode?.toLowerCase().trim() === row.code.toLowerCase().trim()) ||
                              (row.component && s.name?.toLowerCase().trim() === row.component.toLowerCase().trim())
                            );
                            const primaryUom = matched?.unit || row.uom || 'PCS';
                            const altUom = matched?.altUnit || '';
                            const hasAlt = !!(altUom && altUom.trim() && altUom.trim().toLowerCase() !== primaryUom.trim().toLowerCase());

                            if (hasAlt) {
                              const opts = [
                                { val: primaryUom, label: `${primaryUom}` },
                                { val: altUom.trim(), label: `${altUom.trim()}` }
                              ];
                              const currentVal = opts.some(o => o.val.toLowerCase() === (row.uom || '').toLowerCase())
                                ? opts.find(o => o.val.toLowerCase() === (row.uom || '').toLowerCase())!.val
                                : (row.uom || primaryUom);

                              return (
                                <select
                                  value={currentVal}
                                  onChange={(e) => handleMaterialUomChange(row.id, e.target.value)}
                                  className="w-full h-7 border border-gray-200 rounded-md text-[10.5px] font-bold text-gray-800 bg-white text-center cursor-pointer focus:ring-1 focus:ring-blue-500 focus:outline-none"
                                  title="Unit of Measurement (UOM / AUOM)"
                                >
                                  {opts.map(o => (
                                    <option key={o.val} value={o.val}>{o.label}</option>
                                  ))}
                                </select>
                              );
                            }

                            return (
                              <span className="font-bold text-[10px] text-gray-700 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200/60 inline-block w-full text-center">
                                {row.uom || 'PCS'}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Required Qty */}
                        <td className="py-1.5 px-2.5 text-right w-24">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row.requiredQty}
                            onChange={e => handleUpdateMaterial(row.id, 'requiredQty', e.target.value)}
                            className="w-full text-right font-bold text-gray-900 bg-white border border-gray-200 rounded-md px-2 py-0.5 text-[11px] h-7 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                          {(() => {
                            const matched = backendSkus.find(s => 
                              (row.skuId && s._id === row.skuId) ||
                              (row.code && s.skuCode?.toLowerCase().trim() === row.code.toLowerCase().trim()) ||
                              (row.component && s.name?.toLowerCase().trim() === row.component.toLowerCase().trim())
                            );
                            const conv = Number(matched?.altUnitConversion || (matched as any)?.booksGbl || (matched as any)?.pcsPerGbl || 0);
                            const numReq = Number(row.requiredQty) || 0;
                            if (numReq <= 0 || conv <= 0) return null;
                            const curUom = (row.uom || matched?.unit || 'PCS').toUpperCase();
                            if (curUom === 'GBL') {
                              const pcsVal = numReq * conv;
                              return (
                                <span className="text-[9px] text-indigo-700 font-mono font-semibold block text-right mt-0.5" title={`${numReq} GBL = ${pcsVal} PCS`}>
                                  ≈ {pcsVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })} PCS
                                </span>
                              );
                            } else if (curUom === 'PCS' || curUom === 'SHEETS') {
                              const gblVal = numReq / conv;
                              return (
                                <span className="text-[9px] text-gray-500 font-mono font-medium block text-right mt-0.5" title={`${numReq} PCS = ${gblVal.toFixed(4)} GBL`}>
                                  ≈ {gblVal < 1 ? gblVal.toFixed(4) : gblVal.toLocaleString('en-IN', { maximumFractionDigits: 3 })} GBL
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </td>

                        {/* Source Location (Mini Factory Location Modal) */}
                        <td className="py-1.5 px-2.5 min-w-[160px]">
                          <LocationSelectPopup
                            locations={warehouseLocations}
                            locationId={row.locationId || ''}
                            displayValue={row.sourceLocation || 'SKBW - Ground Floor'}
                            onChange={(wh, fl, zn, loc) => handleMaterialLocationChange(row.id, wh, fl, zn, loc)}
                            variant="compact"
                            hideLabel
                            className="w-full min-w-[160px]"
                            skuId={row.skuId}
                            unit={row.uom || ''}
                          />
                        </td>

                        {/* Rate with 3-Mode Selector (Avg Purchases / FIFO / Custom) */}
                        <td className="py-1.5 px-2.5 text-right w-32">
                          <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Mode Selector Pill Select */}
                              <select
                                value={row.rateMode || 'avg_purchase'}
                                onChange={(e) => handleSetRowRateMode(row.id, e.target.value as BomRateMode)}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border cursor-pointer focus:outline-none transition-all h-7 ${
                                  row.rateMode === 'fifo'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                    : row.rateMode === 'custom'
                                    ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100'
                                }`}
                                title="Select valuation method for this material"
                              >
                                <option value="avg_purchase">AVG</option>
                                <option value="fifo">FIFO</option>
                                <option value="custom">CUSTOM</option>
                              </select>

                              {/* Rate Input Field */}
                              <input
                                type="number"
                                step="any"
                                min="0"
                                disabled={row.rateMode !== 'custom'}
                                value={row.rate}
                                onChange={e => handleUpdateMaterial(row.id, 'rate', e.target.value)}
                                className={`w-20 text-right font-bold bg-white border rounded-md px-2 py-0.5 text-[11px] h-7 focus:ring-1 focus:ring-blue-500 focus:outline-none ${
                                  row.rateMode === 'fifo'
                                    ? 'border-emerald-300 text-emerald-900 bg-emerald-50/20'
                                    : row.rateMode === 'custom'
                                    ? 'border-amber-300 text-amber-900 bg-amber-50/20'
                                    : 'border-gray-200 text-gray-800'
                                }`}
                                title={
                                  row.rateMode === 'fifo'
                                    ? (row.fifoBatchInfo?.summary || `FIFO Rate from earliest batch (${row.fifoBatchInfo?.batchNumber || 'Batch'})`)
                                    : row.rateMode === 'avg_purchase'
                                    ? 'Weighted average rate of purchase batches'
                                    : 'Custom manual rate'
                                }
                              />
                            </div>
                            {/* AUOM dual rate display */}
                            {(() => {
                              const matSku = backendSkus.find(s => s._id === row.skuId || s.skuCode === row.code || s.name === row.component);
                              if (!matSku || !row.rate || row.rate <= 0) return null;
                              const curUom = (row.uom || matSku.unit || 'PCS').toUpperCase().trim();
                              const altUom = (matSku.altUnit || '').toUpperCase().trim();
                              const primUom = (matSku.unit || '').toUpperCase().trim();
                              const targetAuom = (altUom && altUom !== curUom) ? altUom : (primUom && primUom !== curUom ? primUom : null);
                              if (!targetAuom) return null;
                              const converted = convertRateToUom(row.rate, row.uom || primUom, targetAuom, matSku);
                              if (!converted || converted <= 0) return null;
                              return (
                                <span className="text-[9.5px] text-indigo-700 font-bold font-mono text-right block mt-0.5" title={`Rate in ${targetAuom}: ₹${converted.toFixed(4)}`}>
                                  ≈ ₹{converted < 1 ? converted.toFixed(4) : converted.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/{targetAuom}
                                </span>
                              );
                            })()}
                            {/* FIFO Allocation & Majority Batch Badge */}
                            {row.rateMode === 'fifo' && row.fifoBatchInfo && (
                              <span
                                className="text-[9px] text-emerald-700 font-semibold leading-tight text-right cursor-help max-w-[140px] truncate block"
                                title={row.fifoBatchInfo.summary || `FIFO: ${row.fifoBatchInfo.batchNumber} (₹${row.rate}/${row.uom || 'Unit'})`}
                              >
                                {row.fifoBatchInfo.majorityBatch ? `Majority: ${row.fifoBatchInfo.majorityBatch}` : `Lot: ${row.fifoBatchInfo.batchNumber}`}
                              </span>
                            )}
                            {/* Cost origin badges: shown to clarify where the rate came from */}
                            {row.productionRate != null && row.productionRate > 0 && (
                              <span
                                className="text-[9px] text-blue-600 font-semibold leading-none"
                                title={`Dynamic production costing from Stock & Inventory: ₹${row.productionRate.toFixed(2)}/${row.uom || 'Unit'}`}
                              >
                                🏭 prod. cost
                              </span>
                            )}
                            {row.lastProductionRate != null && row.lastProductionRate > 0 &&
                              (!row.productionRate || row.productionRate === 0) &&
                              row.rateMode !== 'custom' &&
                              row.computedAvgRate === 0 && row.computedFifoRate === 0 && (
                              <span
                                className="text-[9px] text-purple-600 font-semibold leading-none"
                                title={`Rate carried forward from last production order (₹${row.lastProductionRate.toFixed(2)}).`}
                              >
                                ↩ last prod.
                              </span>
                            )}
                          </div>
                        </td>


                        {/* Material Cost Amount */}
                        <td className="py-1.5 px-2.5 text-right font-bold font-mono text-gray-900 text-[11px] w-28">
                          ₹{formatCurrency(row.amount)}
                        </td>

                        {/* Actions */}
                        <td className="py-1.5 px-2 text-center w-20">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDuplicateMaterial(idx)}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer transition-colors"
                              title="Duplicate row"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMaterial(row.id)}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer transition-colors"
                              title="Delete row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Material Dropdown Popover (Portaled to document.body so it floats cleanly above table and scroll boundaries) */}
          {activeMaterialDropdownId && materialDropdownPosition && typeof document !== 'undefined' && (() => {
            const activeRow = materials.find(m => m.id === activeMaterialDropdownId);
            const activeSearchTerm = (componentSearchMap[activeMaterialDropdownId] ?? '').toLowerCase().trim();
            const filteredComponents = rawAndSemiSkus.filter(s =>
              !activeSearchTerm ||
              (s.name || '').toLowerCase().includes(activeSearchTerm) ||
              (s.skuCode || '').toLowerCase().includes(activeSearchTerm) ||
              (s.category || '').toLowerCase().includes(activeSearchTerm)
            );

            return createPortal(
              <div 
                style={{
                  position: 'fixed',
                  top: `${materialDropdownPosition.top}px`,
                  left: `${materialDropdownPosition.left}px`,
                  width: `${materialDropdownPosition.width}px`,
                  maxHeight: '280px',
                  zIndex: 999999
                }}
                className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-y-auto divide-y divide-gray-100 p-1 material-dropdown-container animate-in fade-in zoom-in-95 duration-100"
              >
                {filteredComponents.map((s) => {
                  const itemType = getItemClassification(s);
                  const specBadge = getSkuSpecOrConversion(s);
                  const isSelected = activeRow?.component && activeRow.component.toLowerCase() === s.name.toLowerCase();

                  return (
                    <div
                      key={s._id}
                      onClick={() => {
                        handleSelectMaterialSku(activeMaterialDropdownId, s);
                        setComponentSearchMap(prev => ({ ...prev, [activeMaterialDropdownId]: s.name }));
                        setActiveMaterialDropdownId(null);
                      }}
                      className={`p-2 cursor-pointer rounded-lg text-xs flex justify-between items-center transition-colors ${
                        isSelected ? 'bg-blue-100/90 font-bold border border-blue-200' : 'hover:bg-blue-50/80'
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="font-bold text-gray-900 break-words leading-snug text-xs sm:text-[12.5px]">{s.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[9.5px] text-gray-400 font-mono">{s.skuCode}</span>
                          {s.category && (
                            <>
                              <span className="text-[9.5px] text-gray-300">•</span>
                              <span className="text-[9.5px] font-semibold text-gray-600 uppercase">{s.category}</span>
                            </>
                          )}
                          {s.unit && (
                            <>
                              <span className="text-[9.5px] text-gray-300">•</span>
                              <span className="text-[9.5px] font-bold text-blue-600">{s.unit}</span>
                            </>
                          )}
                          {specBadge && (
                            <>
                              <span className="text-[9.5px] text-gray-300">•</span>
                              <span className="text-[9.5px] font-semibold text-indigo-600">{specBadge}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-full border bg-purple-50 text-purple-700 border-purple-200">
                          {itemType === 'semi' ? 'Semi Goods' : (s.category || 'Raw Material')}
                        </span>
                        <span className={`px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-full border ${
                          (s.status || '').toLowerCase() === 'inactive'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {s.status || 'Active'}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {filteredComponents.length === 0 && (
                  <div className="p-3 text-center text-gray-400 italic text-xs">No materials or semi goods found</div>
                )}
              </div>,
              document.body
            );
          })()}

          {/* ── BOM FOOTER: CUTE COMPACT STOCK PILLS (LEFT) & CLEAN MATERIALS TOTAL (RIGHT) ── */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
            {/* Left: Cute, Compact Live Stock Pills */}
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 mr-0.5 select-none">
                <Package className="w-3 h-3 text-indigo-500" />
                <span>Stock:</span>
              </span>

              {materials.length === 0 ? (
                <span className="text-[10.5px] text-gray-400 italic">No materials</span>
              ) : (
                materials.map((m, idx) => {
                  const { stockQty, uom, isAvailable, matchedSku } = getLiveStockForMaterial(m);
                  const isZero = stockQty <= 0;
                  const displayName = m.component || m.code || `Item ${idx + 1}`;
                  const conv = Number(matchedSku?.altUnitConversion || (matchedSku as any)?.booksGbl || (matchedSku as any)?.pcsPerGbl || 0);
                  const normUom = (uom || '').toUpperCase();
                  const altUom = (matchedSku?.altUnit || '').toUpperCase();
                  let altStockStr = '';
                  if (normUom === 'GBL' && conv > 0) {
                    const altVal = stockQty * conv;
                    altStockStr = `≈ ${altVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })} ${altUom || 'PCS'}`;
                  } else if ((normUom === 'PCS' || normUom === 'SHEETS') && conv > 0) {
                    const altVal = stockQty / conv;
                    altStockStr = `≈ ${altVal < 1 ? altVal.toFixed(3) : altVal.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${altUom || 'GBL'}`;
                  }

                  return (
                    <div
                      key={m.id || idx}
                      title={`${displayName} (${m.code || '—'}) • Live Stock: ${formatStockQty(stockQty)} ${uom}${altStockStr ? ` (${altStockStr})` : ''}`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] border transition-all select-none ${
                        isAvailable && !isZero
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100/60'
                          : !isZero
                          ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100/60'
                          : 'bg-rose-50 text-rose-900 border-rose-200 hover:bg-rose-100/60'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isAvailable && !isZero ? 'bg-emerald-500' : !isZero ? 'bg-amber-500' : 'bg-rose-500'
                      }`} />
                      <span className="font-semibold truncate max-w-[130px] sm:max-w-[170px] text-gray-800">
                        {displayName}
                      </span>
                      <span className={`font-mono font-bold shrink-0 ${
                        isAvailable && !isZero ? 'text-emerald-700' : !isZero ? 'text-amber-700' : 'text-rose-700'
                      }`}>
                        {formatStockQty(stockQty)} {uom}
                      </span>
                      {altStockStr && (
                        <span className="font-mono text-gray-400 text-[9px] font-medium shrink-0">
                          ({altStockStr})
                        </span>
                      )}
                    </div>
                  );
                })
              )}

              {companyId && (
                <button
                  type="button"
                  onClick={handleRefreshStock}
                  disabled={isStockLoading}
                  className="p-1 text-gray-400 hover:text-indigo-600 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                  title="Refresh live stock"
                >
                  <RotateCcw className={`w-3 h-3 ${isStockLoading ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
              )}
            </div>

            {/* Right: Clean Materials Total */}
            <div className="text-right shrink-0">
              <span className="text-xs text-gray-500 font-semibold mr-2">Materials Total:</span>
              <span className="text-sm font-black font-mono text-gray-900">
                ₹{formatCurrency(totalMaterialCost)}
              </span>
            </div>
          </div>
        </div>

        {/* ── BOTTOM SECTION: BY-PRODUCTS / OVERHEADS & SUMMARY (1:1 with Sales Order Drawer) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* LEFT 8 COLUMNS: Scrap, Overheads & Notes */}
          <div className="lg:col-span-8 space-y-4">

            {/* CARD 1: Additional Costs / Overheads (Optional) with Presets matching Sales Order 1:1 */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-3xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <Receipt className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                      Additional Costs / Overheads (Optional)
                    </span>
                    <p className="text-[10px] text-gray-500 font-medium">
                      Direct labour, electricity, packaging, or machine charges
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Preset Overhead Dropdown Button (1:1 with Add Preset Charge in Sales Order) */}
                  <div className="relative" ref={costPresetMenuRef}>
                    <button
                      type="button"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const spaceBelow = window.innerHeight - rect.bottom;
                        setQuickCostOpenUpwards(spaceBelow < 280 && rect.top > 280);
                        setShowQuickCostPresetMenu(!showQuickCostPresetMenu);
                        setHighlightedCostPresetIdx(0);
                      }}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100/80 text-blue-700 font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-all border border-blue-200 shadow-3xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      <span>Add Preset Overhead</span>
                      <ChevronDown className="w-3 h-3 text-blue-500" />
                    </button>

                    {showQuickCostPresetMenu && (
                      <div 
                        className={`absolute right-0 ${quickCostOpenUpwards ? 'bottom-full mb-1' : 'top-full mt-1'} w-80 max-h-[80vh] bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 text-xs divide-y divide-gray-100 animate-in fade-in zoom-in-95 duration-100`}
                        role="menu"
                      >
                        <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <span>Predefined Overheads</span>
                            <kbd className="font-mono text-[9px] bg-gray-100 text-gray-600 px-1 py-0.5 rounded border border-gray-200">Alt+P</kbd>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setShowQuickCostPresetMenu(false);
                              setShowManageCostModal(true);
                            }}
                            className="text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer font-bold"
                          >
                            <Settings className="w-3 h-3" />
                            <span>Manage</span>
                          </button>
                        </div>
                        <div className="max-h-56 overflow-y-auto py-1 scroll-smooth" ref={costPresetListRef}>
                          {predefinedCosts.map((p, pIdx) => {
                            const isSelected = pIdx === highlightedCostPresetIdx;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  handleAddPredefinedCost(p);
                                  setShowQuickCostPresetMenu(false);
                                }}
                                onMouseEnter={() => setHighlightedCostPresetIdx(pIdx)}
                                className={`w-full px-3 py-1.5 text-left flex items-center justify-between group transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-blue-100/90 text-blue-900 font-bold ring-1 ring-inset ring-blue-400'
                                    : 'hover:bg-blue-50/70 text-gray-800'
                                }`}
                                role="menuitem"
                              >
                                <span className="font-semibold truncate">{p.name}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ml-2 ${
                                  p.basis === 'Per GBL' || p.basis === 'Per Piece' 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {p.basis === 'Per GBL' ? `₹${p.defaultRate}/GBL` : p.basis === 'Per Piece' ? `₹${p.defaultRate}/PCS` : `₹${p.defaultRate} Flat`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="px-3 py-1 bg-gray-50 text-[10px] text-gray-500 flex items-center justify-between">
                          <span>Use <kbd className="font-mono bg-white border border-gray-200 px-1 py-0.2 rounded font-bold">↑</kbd><kbd className="font-mono bg-white border border-gray-200 px-1 py-0.2 rounded font-bold ml-0.5">↓</kbd></span>
                          <span><kbd className="font-mono bg-white border border-gray-200 px-1 py-0.2 rounded font-bold">Enter</kbd> to add</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddCost}
                    className="px-2.5 py-1 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-all border border-gray-200 shadow-3xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Custom</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-xl custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs min-w-[640px]">
                  <thead className="bg-gray-50/80 text-[10.5px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 select-none">
                    <tr>
                      <th className="py-2 px-3 w-8 text-center">#</th>
                      <th className="py-2 px-3">COST TYPE</th>
                      <th className="py-2 px-3 text-center w-32">CALC BASIS</th>
                      <th className="py-2 px-3 text-right w-24">AMOUNT (₹)</th>
                      <th className="py-2 px-3 w-48">APPLIED AS</th>
                      <th className="py-2 px-3 text-center w-20">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {additionalCosts.map((cost, cIdx) => (
                      <tr key={cost.id} className="hover:bg-gray-50/60">
                        <td className="py-2 px-3 text-center font-bold text-gray-400">{cIdx + 1}</td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={cost.costType}
                            onChange={e => handleUpdateCost(cost.id, 'costType', e.target.value)}
                            placeholder="e.g. Labour, Electricity"
                            className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <select
                            value={cost.basis}
                            onChange={e => handleUpdateCost(cost.id, 'basis', e.target.value as any)}
                            className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 cursor-pointer"
                          >
                            <option value="Per BOM">Per BOM</option>
                            <option value="Total / Batch">Total / Batch</option>
                            <option value="Per Batch">Per Batch</option>
                            <option value="Per Piece">Per Piece</option>
                            <option value="Per GBL">Per GBL</option>
                          </select>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={cost.amount}
                            onChange={e => handleUpdateCost(cost.id, 'amount', e.target.value)}
                            className="w-20 px-1.5 py-1 text-right bg-white border border-gray-200 rounded-lg font-mono text-gray-800 text-xs font-bold"
                          />
                          {((cost.basis === 'Per BOM' || (cost.basis === 'Per Batch' && cost.appliedAs === 'Per Batch')) && bomMultiplier > 0) && (
                            <div className="text-[10px] text-blue-600 font-mono font-bold text-right mt-0.5 whitespace-nowrap">
                              = ₹{((Number(cost.amount) || 0) * bomMultiplier).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              <span className="text-[9px] text-gray-400 font-sans font-normal ml-0.5">({bomMultiplier} BOM{bomMultiplier === 1 ? '' : 's'})</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={cost.appliedAs}
                            onChange={e => handleUpdateCost(cost.id, 'appliedAs', e.target.value as any)}
                            className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 cursor-pointer"
                          >
                            <option value="Per BOM">Per BOM</option>
                            <option value="Per Batch">Per Batch</option>
                            <option value="Total Cost for this production/batch">Total Cost for this production/batch</option>
                            <option value="Total Cost for this production">Total Cost for this production</option>
                            <option value="Per Unit (PCS)">Per Unit (PCS)</option>
                            <option value="Per Unit (GBL)">Per Unit (GBL)</option>
                          </select>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteCost(cost.id)}
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {additionalCosts.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-xs text-gray-400 italic bg-gray-50/30">
                          No additional costs added. Click <strong className="text-blue-600 font-semibold cursor-pointer" onClick={() => setShowQuickCostPresetMenu(true)}>"Add Preset Overhead"</strong> above to select or add overheads.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CARD 2: Profit & Costing (Dynamic) */}
            <div className="bg-white rounded-2xl border border-emerald-200/80 p-4 shadow-3xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                      Profit & Costing (Dynamic)
                    </span>
                    <p className="text-[10px] text-gray-500 font-medium">
                      Calculate dynamic suggested selling prices and projected profit based on live manufacturing cost
                    </p>
                  </div>
                </div>

                {numPlannedQty > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[11px] font-mono font-bold">
                      Batch Cost: ₹{formatCurrency(totalProductionCost)}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-emerald-50/20 border border-emerald-100 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                    Pricing Method
                  </label>
                  <div className="w-full px-2.5 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-bold text-emerald-800 flex items-center justify-between shadow-3xs">
                    <span>Margin %</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-semibold border border-emerald-200">Profit Margin</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                    Margin Percentage
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      value={profitPricing.markupPercentage}
                      onChange={e => setProfitPricing(prev => ({ ...prev, pricingMethod: 'Margin %', markupPercentage: e.target.value }))}
                      placeholder="0"
                      className="w-full pl-3 pr-7 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold font-mono text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="absolute right-2.5 top-1.5 text-xs font-bold text-gray-400 select-none">%</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block mb-1">
                    Suggested Price / PCS
                  </label>
                  <div className="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-900 rounded-lg font-mono font-black text-sm text-center shadow-3xs">
                    ₹{formatCurrency(profitCostingSummary.suggestedPricePcs)}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block mb-1">
                    Suggested Price / GBL
                  </label>
                  <div className="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-900 rounded-lg font-mono font-black text-sm text-center shadow-3xs">
                    ₹{formatCurrency(profitCostingSummary.suggestedPriceGbl)}
                  </div>
                </div>
              </div>

              {/* Dynamic Live Profit & Revenue Insights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div className="p-2 bg-gray-50 rounded-lg border border-gray-100 flex flex-col justify-center">
                  <span className="text-[10px] font-medium text-gray-400">Mfg Cost / Piece</span>
                  <span className="font-mono font-bold text-gray-800 text-xs">
                    ₹{formatCurrency(costPerPiece)}
                  </span>
                </div>

                <div className="p-2 bg-gray-50 rounded-lg border border-gray-100 flex flex-col justify-center">
                  <span className="text-[10px] font-medium text-gray-400">Margin / Piece</span>
                  <span className="font-mono font-bold text-emerald-700 text-xs">
                    + ₹{formatCurrency(Math.max(0, profitCostingSummary.suggestedPricePcs - costPerPiece))}
                  </span>
                </div>

                <div className="p-2 bg-gray-50 rounded-lg border border-gray-100 flex flex-col justify-center">
                  <span className="text-[10px] font-medium text-gray-400">Est. Total Revenue</span>
                  <span className="font-mono font-bold text-gray-900 text-xs">
                    ₹{formatCurrency(profitCostingSummary.totalRevenue)}
                  </span>
                </div>

                <div className="p-2 bg-emerald-50/60 rounded-lg border border-emerald-200 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-emerald-800">Est. Batch Profit</span>
                  <span className="font-mono font-black text-emerald-800 text-xs">
                    {profitCostingSummary.projectedProfit >= 0 ? '+' : ''}₹{formatCurrency(profitCostingSummary.projectedProfit)}
                  </span>
                </div>
              </div>
            </div>

            {/* CARD 3: Notes / Instructions (Optional) */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-3xs space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Notes / Production Instructions (Optional)</span>
              </div>
              <div className="relative">
                <textarea
                  rows={2}
                  value={remarks}
                  maxLength={500}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Enter any specific batch execution, recipe, or quality remarks..."
                  className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <div className="text-[10px] text-gray-400 text-right mt-0.5">
                  {remarks.length}/500
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT 4 COLUMNS: Order Summary Card (1:1 with Sales Order Drawer) */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-200/80 p-5 shadow-3xs flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900 pb-1">
                <Receipt className="w-4 h-4 text-blue-600" />
                <span>Production Cost Summary</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-gray-600 font-medium">
                  <span>Material Cost (A)</span>
                  <span className="font-mono font-bold text-gray-900">
                    ₹{formatCurrency(totalMaterialCost)}
                  </span>
                </div>

                <div className="flex justify-between text-gray-600 font-medium">
                  <span>Additional Overheads (B)</span>
                  <span className="font-mono font-bold text-gray-900">
                    ₹{formatCurrency(totalAdditionalCost)}
                  </span>
                </div>

                <div className="pt-2 border-t border-gray-200">
                  <div className="flex justify-between items-center text-sm font-black text-gray-900">
                    <span>Total Production Cost (A + B)</span>
                    <span className="font-mono text-base text-blue-700">
                      ₹{formatCurrency(totalProductionCost)}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 space-y-2">
                  <div className="flex justify-between text-gray-600 font-medium">
                    <span>Planned Output Qty</span>
                    <span className="font-bold text-gray-900">
                      {numPlannedQty > 0 ? (
                        uom === 'GBL' 
                          ? `${plannedQty} GBL (${plannedPcs} PCS)` 
                          : `${plannedPcs} PCS (${plannedGbl.toFixed(2)} GBL)`
                      ) : '—'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-blue-50/60 p-2 rounded-xl border border-blue-100">
                    <span className="font-bold text-blue-900 text-xs">Cost / Piece</span>
                    <span className="font-mono font-black text-blue-900 text-sm">
                      ₹{formatCurrency(costPerPiece)}
                    </span>
                  </div>

                  {plannedGbl > 0 && (
                    <div className="flex justify-between text-gray-600 font-medium px-1">
                      <span>Cost / GBL</span>
                      <span className="font-mono font-bold text-gray-900">
                        ₹{formatCurrency(costPerGbl)}
                      </span>
                    </div>
                  )}

                  {Number(profitPricing.markupPercentage) > 0 && (
                    <div className="pt-2.5 border-t border-dashed border-gray-200 space-y-2">
                      <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center justify-between">
                        <span>Suggested Selling Price</span>
                        <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          {profitPricing.pricingMethod} {profitPricing.markupPercentage}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-emerald-50/80 p-2 rounded-xl border border-emerald-200">
                        <span className="font-bold text-emerald-950 text-xs">Suggested / Piece</span>
                        <span className="font-mono font-black text-emerald-900 text-sm">
                          ₹{formatCurrency(profitCostingSummary.suggestedPricePcs)}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-600 font-medium px-1 text-xs">
                        <span>Suggested / GBL</span>
                        <span className="font-mono font-bold text-gray-900">
                          ₹{formatCurrency(profitCostingSummary.suggestedPriceGbl)}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-600 font-medium px-1 text-xs">
                        <span>Est. Batch Profit</span>
                        <span className="font-mono font-black text-emerald-700">
                          + ₹{formatCurrency(profitCostingSummary.projectedProfit)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Status Pill */}
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-center">
              <span className="text-[10px] text-gray-400 font-medium block">
                Manufacturing Execution Engine
              </span>
              <span className="text-[11px] font-bold text-gray-700 mt-0.5 inline-block">
                Ready to dispatch to factory floor
              </span>
            </div>
          </div>

        </div>

      </div>

      {/* ── MANAGE DEPARTMENT PRESETS MODAL ── */}
      {showManageDeptModal && (
        <Modal
          isOpen={showManageDeptModal}
          onClose={() => setShowManageDeptModal(false)}
          title="Manage Department Presets"
          maxWidth="max-w-lg"
        >
          <div className="space-y-4 p-2 text-xs">
            <p className="text-gray-500 text-xs">
              Predefined departments appear in the department selector dropdown. Selecting a department automatically assigns its standard factory location to the batch.
            </p>

            {/* List */}
            <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-100 pr-1">
              {departmentPresets.map(preset => (
                <div 
                  key={preset.id}
                  className="p-2.5 flex items-center justify-between text-xs hover:bg-gray-50/80"
                >
                  <div className="truncate pr-2">
                    <span className="font-bold text-gray-900 block truncate">{preset.name}</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold mt-1 bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate">{preset.locationName || 'Main Factory'}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteDepartmentPreset(preset.id)}
                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors shrink-0"
                    title="Delete preset"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add new preset form */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleAddNewDepartmentPreset();
              }}
              className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2.5"
            >
              <span className="text-[11px] font-bold text-blue-900 block uppercase tracking-wide">
                + Add New Department Preset (Press Enter to Add)
              </span>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-xs items-center">
                <div className="md:col-span-5">
                  <input
                    type="text"
                    placeholder="Department Name (e.g. Ruling Line 2)"
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all placeholder:text-gray-400 shadow-3xs"
                  />
                </div>
                <div className="md:col-span-5">
                  <LocationSelectPopup
                    locations={warehouseLocations}
                    warehouseId={newDeptWhId}
                    floorId={newDeptFlId}
                    zoneId={newDeptZnId}
                    locationId={newDeptLocId}
                    displayValue={newDeptLocation}
                    onChange={(wh, fl, zn, loc) => {
                      setNewDeptWhId(wh);
                      setNewDeptFlId(fl);
                      setNewDeptZnId(zn);
                      setNewDeptLocId(loc);
                      const locObj = warehouseLocations.find(l => String(l._id) === String(loc));
                      const whObj = warehouseLocations.find(l => String(l._id) === String(wh));
                      const floorObj = warehouseLocations.find(l => String(l._id) === String(fl));
                      const zoneObj = warehouseLocations.find(l => String(l._id) === String(zn));
                      const pathStr = (loc && loc === zn)
                        ? [whObj?.name, floorObj?.name, zoneObj?.name || locObj?.name].filter(Boolean).join(' - ')
                        : [whObj?.name, floorObj?.name, zoneObj?.name, locObj?.name].filter(Boolean).join(' - ') || locObj?.name || 'Selected Location';
                      setNewDeptLocation(pathStr);
                    }}
                    variant="compact"
                    hideLabel
                    className="w-full"
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-lg text-xs cursor-pointer shadow-3xs transition-all"
                  >
                    Add
                  </button>
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-100 text-xs">
              <button
                type="button"
                onClick={handleResetDepartmentPresets}
                className="text-[11px] font-bold text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                Reset to Defaults
              </button>
              <button
                type="button"
                onClick={() => setShowManageDeptModal(false)}
                className="px-4 py-1.5 bg-gray-900 text-white font-bold rounded-xl text-xs cursor-pointer hover:bg-gray-800 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MANAGE PREDEFINED OVERHEADS MODAL (1:1 with Sales Order Predefined Charges) ── */}
      {showManageCostModal && (
        <Modal
          isOpen={showManageCostModal}
          onClose={() => setShowManageCostModal(false)}
          title="Manage Predefined Production Overheads"
          maxWidth="max-w-lg"
        >
          <div className="space-y-4 p-2 text-xs">
            <p className="text-xs text-gray-500">
              Predefined overheads appear in the quick cost selector dropdown. Any overhead set to <strong>Per GBL</strong> or <strong>Per Piece</strong> automatically calculates based on batch size.
            </p>

            {/* List */}
            <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-100">
              {predefinedCosts.map(p => (
                <div key={p.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-gray-50/80">
                  <div>
                    <span className="font-bold text-gray-800 block">{p.name}</span>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold mt-0.5 ${
                      p.basis === 'Per GBL' || p.basis === 'Per Piece' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {p.basis === 'Per GBL' ? `Per GBL (₹${p.defaultRate}/GBL)` : p.basis === 'Per Piece' ? `Per Piece (₹${p.defaultRate}/PCS)` : `Fixed (₹${p.defaultRate})`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteCostPreset(p.id)}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add new preset form */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleAddNewCostPreset();
              }}
              className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2"
            >
              <span className="text-[11px] font-bold text-blue-900 block uppercase tracking-wide">
                + Add New Overhead Master (Press Enter to Add)
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Cost Name (e.g. Electricity)"
                  value={newCostName}
                  onChange={(e) => setNewCostName(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500"
                />
                <select
                  value={newCostBasis}
                  onChange={(e) => setNewCostBasis(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="Per BOM">📦 Per BOM</option>
                  <option value="Per Batch">Per Batch</option>
                  <option value="Total / Batch">Total / Batch</option>
                  <option value="Per GBL">⚡ Per GBL</option>
                  <option value="Per Piece">⚡ Per Piece</option>
                </select>
                <div className="flex gap-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Rate (₹)"
                    value={newCostRate}
                    onChange={(e) => setNewCostRate(e.target.value)}
                    className="w-20 px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs cursor-pointer flex-1"
                  >
                    Add
                  </button>
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-100 text-xs">
              <button
                type="button"
                onClick={() => {
                  setPredefinedCosts(DEFAULT_PREDEFINED_COSTS);
                  try {
                    localStorage.setItem('skbw_predefined_costs_v2', JSON.stringify(DEFAULT_PREDEFINED_COSTS));
                  } catch (e) {}
                  if (companyId) {
                    updateMetadataV2({ companyId, additionalCostPresets: DEFAULT_PREDEFINED_COSTS }).catch(e => console.error(e));
                  }
                  showToast('Reset to default predefined overheads', 'info');
                }}
                className="text-[11px] font-bold text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                Reset to Defaults
              </button>
              <button
                type="button"
                onClick={() => setShowManageCostModal(false)}
                className="px-4 py-1.5 bg-gray-900 text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MANAGE PREDEFINED SCRAP / BY-PRODUCTS MODAL ── */}
      {showManageScrapModal && (
        <Modal
          isOpen={showManageScrapModal}
          onClose={() => setShowManageScrapModal(false)}
          title="Manage Predefined Scrap & By-Products"
          maxWidth="max-w-lg"
        >
          <div className="space-y-4 p-2 text-xs">
            <p className="text-xs text-gray-500">
              Predefined scrap items appear in the quick scrap selector. Selecting an item automatically loads its name, unit of measurement, and recovery rate.
            </p>

            {/* List */}
            <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-100">
              {scrapPresets.map(p => (
                <div key={p.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-gray-50/80">
                  <div>
                    <span className="font-bold text-gray-800 block">{p.item}</span>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold mt-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                      ₹{p.defaultRate} / {p.uom}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteScrapPreset(p.id)}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                    title="Delete preset"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {scrapPresets.length === 0 && (
                <div className="p-4 text-center text-gray-400 italic">No scrap presets saved</div>
              )}
            </div>

            {/* Add new scrap preset form */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleAddNewScrapPreset();
              }}
              className="p-3 bg-purple-50/50 rounded-xl border border-purple-100 space-y-2"
            >
              <span className="text-[11px] font-bold text-purple-900 block uppercase tracking-wide">
                + Add New Scrap Preset (Press Enter to Add)
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Scrap Name (e.g. Paper Waste)"
                  value={newScrapItem}
                  onChange={(e) => setNewScrapItem(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-purple-500"
                />
                <select
                  value={newScrapUom}
                  onChange={(e) => setNewScrapUom(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="KG">KG</option>
                  <option value="PCS">PCS</option>
                  <option value="BDL">BDL (Bundle)</option>
                  <option value="GBL">GBL</option>
                  <option value="SHEET">SHEET</option>
                </select>
                <div className="flex gap-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Rate (₹)"
                    value={newScrapRate}
                    onChange={(e) => setNewScrapRate(e.target.value)}
                    className="w-20 px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-purple-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs cursor-pointer flex-1"
                  >
                    Add
                  </button>
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-100 text-xs">
              <button
                type="button"
                onClick={() => {
                  setScrapPresets(DEFAULT_SCRAP_PRESETS);
                  try {
                    localStorage.setItem('skbw_scrap_presets_v2', JSON.stringify(DEFAULT_SCRAP_PRESETS));
                  } catch (e) {}
                  showToast('Reset to default scrap presets', 'info');
                }}
                className="text-[11px] font-bold text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                Reset to Defaults
              </button>
              <button
                type="button"
                onClick={() => setShowManageScrapModal(false)}
                className="px-4 py-1.5 bg-gray-900 text-white font-bold rounded-xl text-xs cursor-pointer hover:bg-gray-800 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cutting Slip Voucher (Reel -> Sheet conversion) */}
      {showCuttingSlipModal && (
        <CuttingSlipModal
          isOpen={showCuttingSlipModal}
          onClose={() => setShowCuttingSlipModal(false)}
          companyId={companyId || ''}
          skus={backendSkus}
          locations={warehouseLocations}
          onSaved={() => {
            showToast('Reels converted to sheets successfully! New sheets added to stock.', 'success');
          }}
        />
      )}

    </div>
  );
};

export default NewProductionOrderWizard;

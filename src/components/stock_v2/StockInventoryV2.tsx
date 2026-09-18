import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { 
  Boxes, 
  Package, 
  Box,
  Search, 
  Plus, 
  X, 
  Edit, 
  Trash2, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  Layers, 
  CheckCircle2, 
  Warehouse, 
  BarChart3, 
  FileText, 
  AlertTriangle, 
  Upload, 
  Download, 
  History, 
  Filter,
  ArrowRightLeft,
  SlidersHorizontal,
  DollarSign,
  TrendingUp,
  MapPin,
  Tag,
  Hash,
  ChevronDown,
  Eye,
  Sliders,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  Printer
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import Modal from '../ui/Modal';
import { showToast } from '../ui/Toast';
import AddSkuDrawerV2 from '../inventory_v2/AddSkuDrawerV2';
import { 
  getSkusV2, 
  getLedgerV2, 
  getBalancesV2, 
  getWarehouseHierarchyV2,
  getLocationDetailsV2,
  createWarehouseLocationV2,
  updateWarehouseLocationV2,
  deleteWarehouseLocationV2,
  SkuV2, 
  LedgerEntryV2, 
  WarehouseLocationV2 
} from '../../api/mfgApiV2';
import { getParties } from '../../api/partyApi';
import { createPurchaseInvoiceV2, updatePurchaseInvoiceV2, getPurchaseInvoicesV2, cancelPurchaseInvoiceV2 } from '../inventory_v2/purchases/purchaseService';
import WarehouseStructureV2 from '../inventory_v2/WarehouseStructureV2';
import ItemStockDetailsDrawer from './ItemStockDetailsDrawer';
import StockTransferModal from './StockTransferModal';
import StockAdjustmentModal from './StockAdjustmentModal';

export type StockTabType = 'overview' | 'products' | 'materials' | 'semi' | 'batches' | 'transfers' | 'adjustments' | 'warehouse';

interface MaterialLotItem {
  id: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  brand: string;
  gsm: string;
  paperType?: 'Reel' | 'Sheet' | 'Board' | 'General';
  reelsCount?: number;
  reamsCount?: number;
  reamWeight?: string;
  totalSheets?: number;
  width?: string;
  length?: string;
  totalKg: number;
  ratePerKg: number;
  locationId: string;
  locationName: string;
  reels?: { weight: number; width?: string; locationId?: string }[];
}

const getSkuCategoryGroup = (item: SkuV2): 'products' | 'materials' | 'semi' => {
  const cat = (item.category || '').trim().toLowerCase();
  const name = (item.name || '').trim().toLowerCase();
  const code = (item.skuCode || '').trim().toUpperCase();

  if (
    cat.includes('semi') || 
    cat.includes('wip') || 
    cat === 'semi finished' || 
    cat.includes('sub') || 
    code.startsWith('SM') || 
    code.startsWith('SFG') || 
    code.startsWith('SEM') || 
    code.startsWith('SF') ||
    name.includes('ruled cut') ||
    name.includes('inner signature') ||
    name.includes('book block')
  ) {
    return 'semi';
  }

  if (
    cat.includes('finish') || 
    cat.includes('product') ||
    code.startsWith('FG')
  ) {
    return 'products';
  }

  if (
    cat.includes('raw') || 
    cat.includes('material') || 
    cat.includes('reel') || 
    cat.includes('paper') ||
    cat.includes('board') ||
    cat.includes('ink') ||
    cat.includes('wire') ||
    code.startsWith('RM')
  ) {
    return 'materials';
  }

  return 'products';
};

export const StockInventoryV2: React.FC = () => {
  const { selectedCompany } = useAuth();

  const [activeTab, setActiveTab] = useState<StockTabType>('overview');
  const [animationKey, setAnimationKey] = useState<number>(Date.now());

  // Fast On-Demand Data State
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);

  // Filter States
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Dropdowns & Auxiliary Data
  const [allSuppliers, setAllSuppliers] = useState<any[]>([]);
  const [allSkus, setAllSkus] = useState<SkuV2[]>([]);
  const [allLocations, setAllLocations] = useState<WarehouseLocationV2[]>([]);
  const [auxLoaded, setAuxLoaded] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntryV2[]>([]);
  const [balancesList, setBalancesList] = useState<any[]>([]);

  // Modals & Drawers States
  const [selectedDrawerSku, setSelectedDrawerSku] = useState<SkuV2 | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferInitialSku, setTransferInitialSku] = useState<SkuV2 | null>(null);
  const [transferInitialLocId, setTransferInitialLocId] = useState<string | undefined>(undefined);

  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjustmentInitialSku, setAdjustmentInitialSku] = useState<SkuV2 | null>(null);
  const [adjustmentInitialLocId, setAdjustmentInitialLocId] = useState<string | undefined>(undefined);

  const [isAddSkuOpen, setIsAddSkuOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<SkuV2 | null>(null);

  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Purchase Batch Modal & Form State
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [batchForm, setBatchForm] = useState({
    batchNumber: 'PB-SEP-001',
    purchaseDate: new Date().toISOString().split('T')[0],
    supplierId: '',
    supplierName: '',
    purchaseType: 'Materials',
    freightCharges: 0,
    craneCharges: 0,
    loadingCharges: 0,
    otherCharges: 0,
    remarks: ''
  });

  const [lots, setLots] = useState<MaterialLotItem[]>([
    {
      id: `lot-1`,
      skuId: '',
      skuCode: '',
      skuName: '',
      brand: '',
      gsm: '',
      totalKg: 0,
      ratePerKg: 0,
      locationId: '',
      locationName: ''
    }
  ]);

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'cancel_batch' | 'delete_location' | null;
    item: any;
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    type: null,
    item: null,
    title: '',
    message: '',
    confirmText: '',
    onConfirm: async () => {}
  });

  // Close Add Menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Load auxiliary lists from backend
  const loadAuxiliaryData = useCallback(async (force = false) => {
    if (!selectedCompany?._id || (auxLoaded && !force)) return;
    try {
      const [supRes, skusRes, locsRes, balancesRes, ledgerRes] = await Promise.all([
        getParties({ company: selectedCompany._id, type: 'vendor', limit: 1000, light: true }),
        getSkusV2(selectedCompany._id),
        getWarehouseHierarchyV2(selectedCompany._id),
        getBalancesV2(selectedCompany._id).catch(() => []),
        getLedgerV2({ companyId: selectedCompany._id }).catch(() => [])
      ]);

      const vendors = supRes.data?.parties || supRes.data || [];
      setAllSuppliers(vendors);
      setAllLocations(locsRes || []);
      setBalancesList(balancesRes || []);
      setLedgerEntries(ledgerRes || []);

      const balanceMap = new Map<string, number>();
      if (Array.isArray(balancesRes)) {
        balancesRes.forEach((b: any) => {
          const rawId = b.skuId || b.sku?._id;
          const sId = rawId ? String(rawId._id || rawId) : '';
          const qty = Number(b.onHand) || Number(b.quantity) || 0;
          if (sId) {
            balanceMap.set(sId, (balanceMap.get(sId) || 0) + qty);
          }
        });
      }

      const formattedSkus: SkuV2[] = (skusRes || []).map((s: SkuV2) => {
        const sId = String(s._id);
        const hasBalance = balanceMap.has(sId);
        const ledgerStock = balanceMap.get(sId) || 0;
        const initialStock = Number(s.openingStock) || 0;
        const liveStock = hasBalance ? (ledgerStock + initialStock) : initialStock;
        return {
          ...s,
          presentStock: liveStock
        };
      });

      setAllSkus(formattedSkus);
      setAuxLoaded(true);
    } catch (err) {
      console.error('Failed to load backend inventory lists:', err);
    }
  }, [selectedCompany?._id, auxLoaded]);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadAuxiliaryData(true);
    }
  }, [selectedCompany?._id, loadAuxiliaryData]);

  // Helper unit cost
  const getCategoryCost = (category?: string) => {
    if (!category) return 45;
    if (category === 'Raw Material' || category === 'Paper Reels') return 45;
    if (category === 'Semi Finished' || category === 'Cover Board') return 25;
    return 60;
  };

  // Main KPI Aggregations across all SKUs
  const kpiStats = useMemo(() => {
    let totalItemsCount = allSkus.length;
    let totalStockVal = 0;
    let fgValue = 0;
    let fgQty = 0;
    let rmValue = 0;
    let rmKg = 0;
    let semiValue = 0;
    let semiPcs = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    allSkus.forEach(sku => {
      const group = getSkuCategoryGroup(sku);
      const stock = Number(sku.presentStock ?? sku.openingStock) || 0;
      const rate = Number((sku as any)?.avgRate || (sku as any)?.rate || (sku as any)?.costPrice || getCategoryCost(sku.category));
      const val = stock * rate;
      totalStockVal += val;

      if (group === 'products') {
        fgValue += val;
        fgQty += stock;
      } else if (group === 'materials') {
        rmValue += val;
        rmKg += stock;
      } else if (group === 'semi') {
        semiValue += val;
        semiPcs += stock;
      }

      const reorder = Number(sku.reorderLevel) || 10;
      if (stock === 0) {
        outOfStockCount++;
      } else if (stock <= reorder) {
        lowStockCount++;
      }
    });

    return {
      totalItemsCount,
      totalStockVal,
      fgValue,
      fgQty,
      rmValue,
      rmKg,
      semiValue,
      semiPcs,
      lowStockCount,
      outOfStockCount,
      totalAlerts: lowStockCount + outOfStockCount
    };
  }, [allSkus]);

  // Unique Dropdown Options
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    allSkus.forEach(s => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set).sort();
  }, [allSkus]);

  const availableBrands = useMemo(() => {
    const set = new Set<string>();
    allSkus.forEach(s => {
      if (s.brand) set.add(s.brand);
    });
    return Array.from(set).sort();
  }, [allSkus]);

  // Primary Filtered List for active tab & dropdown filters
  const filteredSkus = useMemo(() => {
    return allSkus.filter(sku => {
      const group = getSkuCategoryGroup(sku);

      // Main Tab Filter
      if (activeTab === 'products' && group !== 'products') return false;
      if (activeTab === 'materials' && group !== 'materials') return false;
      if (activeTab === 'semi' && group !== 'semi') return false;

      // Category Dropdown Filter
      if (categoryFilter !== 'ALL' && sku.category !== categoryFilter) return false;

      // Brand Dropdown Filter
      if (brandFilter !== 'ALL' && sku.brand !== brandFilter) return false;

      // Stock Status Filter
      const stock = Number(sku.presentStock ?? sku.openingStock) || 0;
      const reorder = Number(sku.reorderLevel) || 10;
      if (statusFilter === 'IN_STOCK' && stock <= 0) return false;
      if (statusFilter === 'LOW_STOCK' && (stock <= 0 || stock > reorder)) return false;
      if (statusFilter === 'OUT_OF_STOCK' && stock > 0) return false;
      if (statusFilter === 'ALERTS' && stock > reorder) return false;

      // Search Query
      if (debouncedSearch.trim()) {
        const query = debouncedSearch.toLowerCase().trim();
        const matchesCode = (sku.skuCode || '').toLowerCase().includes(query);
        const matchesName = (sku.name || '').toLowerCase().includes(query);
        const matchesCat = (sku.category || '').toLowerCase().includes(query);
        const matchesBrand = (sku.brand || '').toLowerCase().includes(query);
        if (!matchesCode && !matchesName && !matchesCat && !matchesBrand) return false;
      }

      return true;
    });
  }, [allSkus, activeTab, categoryFilter, brandFilter, statusFilter, debouncedSearch]);

  // Filtered Stock Transfers
  const transferEntries = useMemo(() => {
    return ledgerEntries.filter(e => e.transactionType === 'Location Transfer' || e.transactionType === 'Transfer');
  }, [ledgerEntries]);

  // Filtered Stock Adjustments
  const adjustmentEntries = useMemo(() => {
    return ledgerEntries.filter(e => e.transactionType === 'Stock Adjustment' || e.transactionType === 'Adjustment');
  }, [ledgerEntries]);

  // Format Currency
  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  // Reset Filters Handler
  const handleResetFilters = () => {
    setSearch('');
    setCategoryFilter('ALL');
    setBrandFilter('ALL');
    setWarehouseFilter('ALL');
    setStatusFilter('ALL');
    setSelectedIds([]);
  };

  // Export to Excel / CSV
  const handleExportExcel = () => {
    const exportData = filteredSkus.map(s => ({
      'SKU Code': s.skuCode,
      'Item Name': s.name,
      'Category': s.category || 'General',
      'Brand': s.brand || '-',
      'Pages': s.pages || '-',
      'Ruling': s.ruleType || '-',
      'GSM': s.gsm ? `${s.gsm} GSM` : '-',
      'Available Stock': Number(s.presentStock ?? s.openingStock) || 0,
      'Unit': s.unit || 'Pcs',
      'AUOM': s.altUnit ? `${s.altUnit} (1:${s.altUnitConversion})` : '-',
      'Estimated Value': formatCurrency((Number(s.presentStock ?? s.openingStock) || 0) * (Number((s as any).avgRate) || getCategoryCost(s.category)))
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Inventory');
    XLSX.writeFile(wb, `Stock_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Exported inventory to Excel successfully!', 'success');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#F4F6F8] overflow-hidden">
      {/* ── TOP HEADER BAR ── */}
      <header className="bg-white border-b border-gray-200/80 px-6 py-3 shrink-0 flex items-center justify-between shadow-2xs z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl shadow-xs">
            <Boxes className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">Stock & Inventory</h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                {kpiStats.totalItemsCount} Total Items
              </span>
            </div>
            <p className="text-[11px] text-gray-500 font-medium">
              Live multi-warehouse tracking, batch costing, movements audit, and stock reconciliation.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => loadAuxiliaryData(true)}
            className="p-2 border border-gray-200 text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer shadow-2xs"
            title="Refresh inventory balances"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-gray-500" /> Export Excel
          </button>

          {/* + Add New Dropdown */}
          <div className="relative" ref={addMenuRef}>
            <button
              type="button"
              onClick={() => setShowAddMenu(prev => !prev)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add New</span>
              <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
            </button>

            {showAddMenu && (
              <div className="absolute right-0 mt-1.5 w-56 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 py-1.5 divide-y divide-gray-100 animate-in fade-in zoom-in-95 duration-100">
                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddMenu(false);
                      setTransferInitialSku(null);
                      setShowTransferModal(true);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-bold text-gray-800 hover:bg-blue-50 hover:text-blue-900 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                    <span>New Stock Transfer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddMenu(false);
                      setAdjustmentInitialSku(null);
                      setShowAdjustmentModal(true);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-bold text-gray-800 hover:bg-amber-50 hover:text-amber-900 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <SlidersHorizontal className="w-4 h-4 text-amber-600" />
                    <span>Stock Adjustment</span>
                  </button>
                </div>

                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddMenu(false);
                      setShowBatchModal(true);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-bold text-gray-800 hover:bg-blue-50 hover:text-blue-900 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>Add Purchase Batch</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddMenu(false);
                      setEditingSku(null);
                      setIsAddSkuOpen(true);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-bold text-gray-800 hover:bg-purple-50 hover:text-purple-900 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Package className="w-4 h-4 text-purple-600" />
                    <span>Add New Item (SKU)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── SCROLLABLE BODY ── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        
        {/* ── TOP KPI DRILLDOWN CARDS ── */}
        <div className="grid grid-cols-6 gap-3">
          {/* Card 1: Total Items */}
          <div 
            onClick={() => setActiveTab('overview')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
              activeTab === 'overview'
                ? 'bg-white border-blue-600 ring-2 ring-blue-500/20 shadow-md'
                : 'bg-white/90 border-gray-200/90 hover:border-blue-400 hover:shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between text-gray-500 text-[11px] font-bold uppercase tracking-wider">
              <span>Total Items</span>
              <Package className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2">
              <div className="text-xl font-black text-slate-900">{kpiStats.totalItemsCount.toLocaleString('en-IN')}</div>
              <div className="text-[10.5px] font-medium text-blue-600 mt-0.5 flex items-center gap-1">
                <span>View All Inventory</span>
              </div>
            </div>
          </div>

          {/* Card 2: Total Stock Value */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-900 text-white border border-blue-800/60 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-blue-200 text-[11px] font-bold uppercase tracking-wider">
              <span>Total Stock Value</span>
              <DollarSign className="w-4 h-4 text-blue-300" />
            </div>
            <div className="mt-2">
              <div className="text-lg font-black text-white">{formatCurrency(kpiStats.totalStockVal)}</div>
              <div className="text-[10px] text-blue-300/80 font-mono mt-0.5">
                Weighted average cost
              </div>
            </div>
          </div>

          {/* Card 3: Finished Goods */}
          <div 
            onClick={() => setActiveTab('products')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
              activeTab === 'products'
                ? 'bg-white border-blue-600 ring-2 ring-blue-500/20 shadow-md'
                : 'bg-white/90 border-gray-200/90 hover:border-blue-400 hover:shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between text-gray-500 text-[11px] font-bold uppercase tracking-wider">
              <span>Finished Goods</span>
              <div className="w-2 h-2 rounded-full bg-blue-600"></div>
            </div>
            <div className="mt-2">
              <div className="text-base font-black text-slate-900">{formatCurrency(kpiStats.fgValue)}</div>
              <div className="text-[10.5px] font-mono font-bold text-blue-600 mt-0.5">
                {kpiStats.fgQty.toLocaleString('en-IN')} Pcs
              </div>
            </div>
          </div>

          {/* Card 4: Raw Materials */}
          <div 
            onClick={() => setActiveTab('materials')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
              activeTab === 'materials'
                ? 'bg-white border-amber-600 ring-2 ring-amber-500/20 shadow-md'
                : 'bg-white/90 border-gray-200/90 hover:border-amber-400 hover:shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between text-gray-500 text-[11px] font-bold uppercase tracking-wider">
              <span>Raw Materials</span>
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            </div>
            <div className="mt-2">
              <div className="text-base font-black text-slate-900">{formatCurrency(kpiStats.rmValue)}</div>
              <div className="text-[10.5px] font-mono font-bold text-amber-600 mt-0.5">
                {kpiStats.rmKg.toLocaleString('en-IN')} KG
              </div>
            </div>
          </div>

          {/* Card 5: Semi Finished */}
          <div 
            onClick={() => setActiveTab('semi')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
              activeTab === 'semi'
                ? 'bg-white border-purple-600 ring-2 ring-purple-500/20 shadow-md'
                : 'bg-white/90 border-gray-200/90 hover:border-purple-400 hover:shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between text-gray-500 text-[11px] font-bold uppercase tracking-wider">
              <span>Semi Finished</span>
              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
            </div>
            <div className="mt-2">
              <div className="text-base font-black text-slate-900">{formatCurrency(kpiStats.semiValue)}</div>
              <div className="text-[10.5px] font-mono font-bold text-purple-600 mt-0.5">
                {kpiStats.semiPcs.toLocaleString('en-IN')} Pcs
              </div>
            </div>
          </div>

          {/* Card 6: Low / Out of Stock */}
          <div 
            onClick={() => setStatusFilter(prev => prev === 'ALERTS' ? 'ALL' : 'ALERTS')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
              statusFilter === 'ALERTS'
                ? 'bg-rose-50 border-rose-600 ring-2 ring-rose-500/20 shadow-md'
                : 'bg-white/90 border-gray-200/90 hover:border-rose-400 hover:shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between text-gray-500 text-[11px] font-bold uppercase tracking-wider">
              <span>Stock Alerts</span>
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-2">
              <div className="text-lg font-black text-rose-700">
                {kpiStats.lowStockCount} <span className="text-xs font-normal text-gray-400">/ {kpiStats.outOfStockCount} out</span>
              </div>
              <div className="text-[10.5px] font-bold text-rose-600 mt-0.5">
                {statusFilter === 'ALERTS' ? '✓ Showing Alerts' : 'Click to filter alerts'}
              </div>
            </div>
          </div>
        </div>

        {/* ── MAIN TABS & ACTION BAR ── */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-3 shadow-2xs space-y-3">
          
          {/* Main Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'overview', label: 'Stock Overview', icon: Boxes },
                { id: 'products', label: 'Finished Goods', icon: Package },
                { id: 'materials', label: 'Raw Materials', icon: Layers },
                { id: 'semi', label: 'Semi Finished', icon: Box },
                { id: 'transfers', label: 'Stock Transfers', count: transferEntries.length, icon: ArrowRightLeft },
                { id: 'adjustments', label: 'Adjustments', count: adjustmentEntries.length, icon: SlidersHorizontal },
                { id: 'warehouse', label: 'Warehouse Setup', icon: Warehouse }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id as StockTabType);
                      setPage(1);
                    }}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                    {tab.count !== undefined && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        isActive ? 'bg-blue-900/40 text-blue-100' : 'bg-gray-200 text-gray-700'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="text-xs text-gray-400 font-semibold shrink-0">
              Showing <strong>{filteredSkus.length}</strong> items
            </div>
          </div>

          {/* Filter Toolbar */}
          {activeTab !== 'warehouse' && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                {/* Search Bar */}
                <div className="relative min-w-[240px] max-w-xs flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search SKU code, name, brand..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50/80 border border-gray-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-500 transition-all"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Category Dropdown */}
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="ALL">All Categories</option>
                  {availableCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                {/* Brand Dropdown */}
                <select
                  value={brandFilter}
                  onChange={e => setBrandFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="ALL">All Brands</option>
                  {availableBrands.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>

                {/* Status Dropdown */}
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="ALL">All Stock Statuses</option>
                  <option value="IN_STOCK">In Stock (&gt; 0)</option>
                  <option value="LOW_STOCK">Low Stock (≤ Reorder)</option>
                  <option value="OUT_OF_STOCK">Out of Stock (0)</option>
                  <option value="ALERTS">All Alerts</option>
                </select>

                {/* Reset Filters */}
                {(search || categoryFilter !== 'ALL' || brandFilter !== 'ALL' || statusFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" /> Reset
                  </button>
                )}
              </div>

              {/* Quick Summary Counts */}
              <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> In Stock: {filteredSkus.filter(s => (Number(s.presentStock ?? s.openingStock) || 0) > 0).length}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span> Alerts: {filteredSkus.filter(s => (Number(s.presentStock ?? s.openingStock) || 0) <= (Number(s.reorderLevel) || 10)).length}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── TAB CONTENT RENDERING ── */}
        
        {/* 1. Warehouse Hierarchy Tab */}
        {activeTab === 'warehouse' && (
          <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-2xs">
            <WarehouseStructureV2 />
          </div>
        )}

        {/* 2. Stock Transfers Tab */}
        {activeTab === 'transfers' && (
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Stock Transfers Log</h3>
                <p className="text-xs text-gray-500">Chronological history of all inter-location movements.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTransferInitialSku(null);
                  setShowTransferModal(true);
                }}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> New Transfer
              </button>
            </div>

            {transferEntries.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-xs space-y-2">
                <ArrowRightLeft className="w-8 h-8 mx-auto text-gray-300" />
                <p className="font-semibold text-gray-600">No stock transfers recorded yet</p>
                <p className="text-[11px]">Click "New Transfer" to move items between warehouse bins.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-700">
                  <thead className="bg-gray-50/80 text-[10.5px] uppercase font-bold text-gray-500 border-b border-gray-200/80">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Reference #</th>
                      <th className="px-4 py-3">Item / SKU</th>
                      <th className="px-4 py-3">From Location</th>
                      <th className="px-4 py-3">To Location</th>
                      <th className="px-4 py-3 text-right">Quantity</th>
                      <th className="px-4 py-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transferEntries.map((entry, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                          {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('en-IN') : 'Recent'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-gray-900">
                          {entry.referenceNumber || `TRF-${idx + 100}`}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {entry.skuName || entry.skuCode || 'SKU Item'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {entry.fromLocationName || 'Source'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {entry.toLocationName || entry.locationName || 'Destination'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-blue-700">
                          {Number(entry.quantity || 0).toLocaleString('en-IN')} {entry.unit || 'Units'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-[11px] italic">
                          {entry.remarks || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 3. Adjustments Tab */}
        {activeTab === 'adjustments' && (
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Stock Adjustments Log</h3>
                <p className="text-xs text-gray-500">Audit trail of quantity reconciliations and damage write-offs.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAdjustmentInitialSku(null);
                  setShowAdjustmentModal(true);
                }}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> New Adjustment
              </button>
            </div>

            {adjustmentEntries.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-xs space-y-2">
                <SlidersHorizontal className="w-8 h-8 mx-auto text-gray-300" />
                <p className="font-semibold text-gray-600">No stock adjustments recorded yet</p>
                <p className="text-[11px]">Click "New Adjustment" to record physical audit counts or wastage.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-700">
                  <thead className="bg-gray-50/80 text-[10.5px] uppercase font-bold text-gray-500 border-b border-gray-200/80">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Reference #</th>
                      <th className="px-4 py-3">Item / SKU</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Direction</th>
                      <th className="px-4 py-3 text-right">Adjustment Qty</th>
                      <th className="px-4 py-3">Reason / Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {adjustmentEntries.map((entry, idx) => {
                      const isInc = entry.direction === 'IN' || (entry.quantity || 0) > 0;
                      return (
                        <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                            {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('en-IN') : 'Recent'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-gray-900">
                            {entry.referenceNumber || `ADJ-${idx + 100}`}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            {entry.skuName || entry.skuCode || 'SKU Item'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {entry.locationName || 'Warehouse Storage'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isInc ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {isInc ? 'Increase (+)' : 'Deduct (-)'}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-right font-mono font-bold ${
                            isInc ? 'text-emerald-700' : 'text-rose-600'
                          }`}>
                            {isInc ? '+' : '-'}{Math.abs(Number(entry.quantity || 0)).toLocaleString('en-IN')} {entry.unit || 'Units'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-[11px] italic">
                            {entry.remarks || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 4. Stock Overview & Category Tabs (Products, Materials, Semi) */}
        {(activeTab === 'overview' || activeTab === 'products' || activeTab === 'materials' || activeTab === 'semi') && (
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden">
            {filteredSkus.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-xs space-y-2">
                <Package className="w-8 h-8 mx-auto text-gray-300" />
                <p className="font-semibold text-gray-600">No matching items found</p>
                <p className="text-[11px]">Try adjusting your search query or reset dropdown filters.</p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-700">
                  <thead className="bg-gray-50/80 text-[10.5px] uppercase font-bold text-gray-500 border-b border-gray-200/80">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.length === filteredSkus.length && filteredSkus.length > 0}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedIds(filteredSkus.map(s => s._id));
                            } else {
                              setSelectedIds([]);
                            }
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                      </th>
                      <th className="px-4 py-3">SKU Code</th>
                      <th className="px-4 py-3">Item Description</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Attributes</th>
                      <th className="px-4 py-3 text-right">Available Stock</th>
                      <th className="px-4 py-3">Primary / AUOM</th>
                      <th className="px-4 py-3 text-right">Stock Value</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredSkus.map(sku => {
                      const stock = Number(sku.presentStock ?? sku.openingStock) || 0;
                      const reorder = Number(sku.reorderLevel) || 10;
                      const rate = Number((sku as any)?.avgRate || (sku as any)?.rate || (sku as any)?.costPrice || getCategoryCost(sku.category));
                      const totalVal = stock * rate;
                      const isSelected = selectedIds.includes(sku._id);

                      // AUOM Calculation
                      const auomDisplay = (sku.altUnit && sku.altUnitConversion && Number(sku.altUnitConversion) > 0)
                        ? `${(stock / Number(sku.altUnitConversion)).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${sku.altUnit}`
                        : null;

                      // Status Badge
                      const isOutOfStock = stock === 0;
                      const isLowStock = stock > 0 && stock <= reorder;

                      return (
                        <tr 
                          key={sku._id} 
                          onClick={() => setSelectedDrawerSku(sku)}
                          className={`hover:bg-blue-50/30 transition-colors cursor-pointer group ${
                            isSelected ? 'bg-blue-50/50' : ''
                          }`}
                        >
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedIds(prev => [...prev, sku._id]);
                                } else {
                                  setSelectedIds(prev => prev.filter(id => id !== sku._id));
                                }
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                            />
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-gray-900 whitespace-nowrap">
                            {sku.skuCode}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                              {sku.name}
                            </div>
                            {sku.brand && (
                              <div className="text-[10.5px] text-gray-400 font-medium">
                                Brand: {sku.brand}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-gray-100 text-gray-700">
                              {sku.category || 'General'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[11px] text-gray-500 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {sku.pages && <span className="bg-slate-100 px-1.5 py-0.2 rounded font-semibold">{sku.pages}P</span>}
                              {sku.ruleType && <span className="bg-slate-100 px-1.5 py-0.2 rounded font-semibold">{sku.ruleType}</span>}
                              {sku.gsm && <span className="bg-slate-100 px-1.5 py-0.2 rounded font-semibold">{sku.gsm} GSM</span>}
                              {!sku.pages && !sku.ruleType && !sku.gsm && <span>—</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-extrabold text-gray-900 whitespace-nowrap">
                            {stock.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-bold text-gray-800">{sku.unit || 'Pcs'}</div>
                            {auomDisplay && (
                              <div className="text-[10px] text-gray-400 font-mono">
                                ≈ {auomDisplay}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-blue-700 whitespace-nowrap">
                            {formatCurrency(totalVal)}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {isOutOfStock ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                Out of Stock
                              </span>
                            ) : isLowStock ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                Low Stock
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                In Stock
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setSelectedDrawerSku(sku)}
                                className="p-1.5 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Inspect Stock Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setTransferInitialSku(sku);
                                  setShowTransferModal(true);
                                }}
                                className="p-1.5 text-gray-500 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Transfer Item"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAdjustmentInitialSku(sku);
                                  setShowAdjustmentModal(true);
                                }}
                                className="p-1.5 text-gray-500 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                title="Adjust Stock"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODALS & DRAWERS ── */}

      {/* 1. Item Stock Details Drawer (5 Tabs) */}
      <ItemStockDetailsDrawer
        isOpen={!!selectedDrawerSku}
        onClose={() => setSelectedDrawerSku(null)}
        sku={selectedDrawerSku}
        companyId={selectedCompany?._id || ''}
        allLocations={allLocations}
        onOpenTransfer={(s, locId) => {
          setSelectedDrawerSku(null);
          setTransferInitialSku(s);
          setTransferInitialLocId(locId);
          setShowTransferModal(true);
        }}
        onOpenAdjustment={(s, locId) => {
          setSelectedDrawerSku(null);
          setAdjustmentInitialSku(s);
          setAdjustmentInitialLocId(locId);
          setShowAdjustmentModal(true);
        }}
      />

      {/* 2. Stock Transfer Modal */}
      {showTransferModal && (
        <StockTransferModal
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          companyId={selectedCompany?._id || ''}
          skus={allSkus}
          locations={allLocations}
          initialSku={transferInitialSku}
          initialFromLocId={transferInitialLocId}
          onTransferSuccess={() => loadAuxiliaryData(true)}
        />
      )}

      {/* 3. Stock Adjustment Modal */}
      {showAdjustmentModal && (
        <StockAdjustmentModal
          isOpen={showAdjustmentModal}
          onClose={() => setShowAdjustmentModal(false)}
          companyId={selectedCompany?._id || ''}
          skus={allSkus}
          locations={allLocations}
          initialSku={adjustmentInitialSku}
          initialLocId={adjustmentInitialLocId}
          onAdjustmentSuccess={() => loadAuxiliaryData(true)}
        />
      )}

      {/* 4. Add / Edit SKU Drawer */}
      {isAddSkuOpen && (
        <AddSkuDrawerV2
          isOpen={isAddSkuOpen}
          companyId={selectedCompany?._id || ''}
          editSku={editingSku}
          onClose={() => setIsAddSkuOpen(false)}
          onSaveSuccess={() => {
            setIsAddSkuOpen(false);
            loadAuxiliaryData(true);
          }}
        />
      )}

      {/* 5. Add Purchase Batch Modal */}
      {showBatchModal && (
        <Modal
          isOpen={showBatchModal}
          onClose={() => setShowBatchModal(false)}
          title="Add Raw Material Purchase Batch"
          size="max-w-2xl"
        >
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selectedCompany?._id) return;
              setIsSavingBatch(true);
              try {
                // Submit purchase batch invoice
                const payload = {
                  company: selectedCompany._id,
                  invoiceNumber: batchForm.batchNumber,
                  supplierId: batchForm.supplierId,
                  supplierName: batchForm.supplierName || 'Primary Paper Mill',
                  date: batchForm.purchaseDate,
                  type: 'MATERIALS',
                  items: lots.map(l => ({
                    skuId: l.skuId,
                    skuCode: l.skuCode,
                    skuName: l.skuName,
                    quantity: Number(l.totalKg) || 1,
                    unit: 'Kg',
                    rate: Number(l.ratePerKg) || 45,
                    locationId: l.locationId,
                    locationName: l.locationName
                  })),
                  remarks: batchForm.remarks
                };
                await createPurchaseInvoiceV2(payload);
                showToast(`Purchase Batch ${batchForm.batchNumber} recorded successfully!`, 'success');
                setShowBatchModal(false);
                loadAuxiliaryData(true);
              } catch (err: any) {
                console.error(err);
                showToast(err?.response?.data?.msg || 'Failed to save purchase batch', 'error');
              } finally {
                setIsSavingBatch(false);
              }
            }}
            className="space-y-4 text-xs text-gray-800"
          >
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-gray-700 mb-1">BATCH / INVOICE #</label>
                <input
                  type="text"
                  value={batchForm.batchNumber}
                  onChange={e => setBatchForm(prev => ({ ...prev, batchNumber: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-xl font-mono font-bold bg-white"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">PURCHASE DATE</label>
                <input
                  type="date"
                  value={batchForm.purchaseDate}
                  onChange={e => setBatchForm(prev => ({ ...prev, purchaseDate: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-xl bg-white"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">SUPPLIER</label>
                <select
                  value={batchForm.supplierId}
                  onChange={e => {
                    const sup = allSuppliers.find(s => s._id === e.target.value);
                    setBatchForm(prev => ({
                      ...prev,
                      supplierId: e.target.value,
                      supplierName: sup?.name || ''
                    }));
                  }}
                  className="w-full px-3 py-2 border rounded-xl bg-white"
                >
                  <option value="">Select Supplier</option>
                  {allSuppliers.map(s => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Lots Grid */}
            <div className="space-y-2">
              <label className="block font-bold text-gray-700">MATERIAL LOTS INTAKE</label>
              {lots.map((lot, idx) => (
                <div key={lot.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold text-gray-500 block mb-0.5">PAPER REEL / MATERIAL SKU</label>
                      <select
                        value={lot.skuId}
                        onChange={e => {
                          const sku = allSkus.find(s => s._id === e.target.value);
                          setLots(prev => prev.map(l => l.id === lot.id ? {
                            ...l,
                            skuId: e.target.value,
                            skuCode: sku?.skuCode || '',
                            skuName: sku?.name || ''
                          } : l));
                        }}
                        className="w-full px-2 py-1.5 border rounded-lg bg-white"
                        required
                      >
                        <option value="">Select Raw Material SKU</option>
                        {allSkus.filter(s => getSkuCategoryGroup(s) === 'materials').map(s => (
                          <option key={s._id} value={s._id}>{s.skuCode} — {s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 block mb-0.5">WEIGHT (KG)</label>
                      <input
                        type="number"
                        min="1"
                        value={lot.totalKg || ''}
                        onChange={e => setLots(prev => prev.map(l => l.id === lot.id ? { ...l, totalKg: Number(e.target.value) } : l))}
                        className="w-full px-2 py-1.5 border rounded-lg bg-white font-mono font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 block mb-0.5">RATE / KG (₹)</label>
                      <input
                        type="number"
                        min="1"
                        value={lot.ratePerKg || ''}
                        onChange={e => setLots(prev => prev.map(l => l.id === lot.id ? { ...l, ratePerKg: Number(e.target.value) } : l))}
                        className="w-full px-2 py-1.5 border rounded-lg bg-white font-mono font-bold"
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingBatch}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs"
              >
                {isSavingBatch ? 'Saving...' : 'Save Purchase Batch'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default StockInventoryV2;

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
  RotateCcw,
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
    batchNumber: 'PB-2026-001',
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
      unit: 'Kg',
      totalKg: 0,
      ratePerKg: 0,
      locationId: '',
      locationName: ''
    }
  ]);

  const handleOpenBatchModal = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultLoc = allLocations[0]?._id || '';
    const defaultLocName = allLocations[0]?.name || '';
    const defaultSup = allSuppliers[0]?._id || '';
    const defaultSupName = allSuppliers[0]?.firmName || allSuppliers[0]?.name || allSuppliers[0]?.partyName || '';

    setBatchForm({
      batchNumber: `PB-${Date.now().toString().slice(-5)}`,
      purchaseDate: todayStr,
      supplierId: defaultSup,
      supplierName: defaultSupName,
      purchaseType: 'Materials',
      freightCharges: 0,
      craneCharges: 0,
      loadingCharges: 0,
      otherCharges: 0,
      remarks: ''
    });
    setLots([
      {
        id: `lot-${Date.now()}-1`,
        skuId: '',
        skuCode: '',
        skuName: '',
        brand: '',
        gsm: '',
        unit: 'Kg',
        totalKg: 0,
        ratePerKg: 0,
        locationId: defaultLoc,
        locationName: defaultLocName
      }
    ]);
    setShowBatchModal(true);
  };

  const handleAddLotRow = () => {
    const defaultLoc = allLocations[0]?._id || '';
    const defaultLocName = allLocations[0]?.name || '';
    setLots(prev => [
      ...prev,
      {
        id: `lot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        skuId: '',
        skuCode: '',
        skuName: '',
        brand: '',
        gsm: '',
        unit: 'Kg',
        totalKg: 0,
        ratePerKg: 0,
        locationId: defaultLoc,
        locationName: defaultLocName
      }
    ]);
  };

  const handleRemoveLotRow = (id: string) => {
    if (lots.length <= 1) {
      showToast('A purchase batch must contain at least one item.', 'warning');
      return;
    }
    setLots(prev => prev.filter(l => l.id !== id));
  };

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
    setLoading(true);
    try {
      const [supRes, skusRes, locsRes, balancesRes, ledgerRes, purchasesRes] = await Promise.all([
        getParties({ company: selectedCompany._id, type: 'vendor', limit: 1000, light: true }),
        getSkusV2(selectedCompany._id),
        getWarehouseHierarchyV2(selectedCompany._id),
        getBalancesV2(selectedCompany._id).catch(() => []),
        getLedgerV2({ companyId: selectedCompany._id }).catch(() => []),
        getPurchaseInvoicesV2({ companyId: selectedCompany._id, limit: 1000 }).catch(() => ({ invoices: [] }))
      ]);

      const vendors = supRes.data?.parties || supRes.data || [];
      setAllSuppliers(vendors);
      setAllLocations(locsRes || []);
      setBalancesList(balancesRes || []);
      setLedgerEntries(ledgerRes || []);

      // 1. Calculate live ledger on-hand stock
      const balanceMap = new Map<string, number>();
      const locationMap = new Map<string, string>();
      if (Array.isArray(balancesRes)) {
        balancesRes.forEach((b: any) => {
          const rawId = b.skuId || b.sku?._id;
          const sId = rawId ? String(rawId._id || rawId) : '';
          const qty = Number(b.onHand) || Number(b.quantity) || 0;
          if (sId) {
            balanceMap.set(sId, (balanceMap.get(sId) || 0) + qty);
            if (!locationMap.has(sId)) {
              const locObj = b.locationId || b.location;
              const locName = typeof locObj === 'object' ? (locObj.name || '') : String(locObj || '');
              if (locName) locationMap.set(sId, locName);
            }
          }
        });
      }

      // 2. Calculate dynamic weighted average price from purchase batches
      const avgPriceMap = new Map<string, { totalSpend: number; totalQty: number; avgPrice: number }>();
      const invoices = (purchasesRes as any)?.invoices || (Array.isArray(purchasesRes) ? purchasesRes : []);
      invoices.forEach((inv: any) => {
        if (inv.status === 'Cancelled') return;
        (inv.items || []).forEach((item: any) => {
          const rawId = item.skuId?._id || item.skuId;
          const sId = rawId ? String(rawId) : '';
          const qty = Number(item.quantity) || 0;
          const price = Number(item.purchasePrice || item.price || item.ratePerKg) || 0;
          if (sId && qty > 0 && price > 0) {
            const current = avgPriceMap.get(sId) || { totalSpend: 0, totalQty: 0, avgPrice: 0 };
            const newSpend = current.totalSpend + (qty * price);
            const newQty = current.totalQty + qty;
            avgPriceMap.set(sId, {
              totalSpend: newSpend,
              totalQty: newQty,
              avgPrice: newQty > 0 ? (newSpend / newQty) : 0
            });
          }
        });
      });

      const formattedSkus: SkuV2[] = (skusRes || []).map((s: SkuV2) => {
        const sId = String(s._id);
        const ledgerStock = balanceMap.get(sId) || 0;
        const avgStats = avgPriceMap.get(sId);
        const calculatedAvg = avgStats && avgStats.avgPrice > 0 
          ? avgStats.avgPrice 
          : Number((s as any).purchasePrice || (s as any).ratePerKg || (s as any).rate || (s as any).avgRate || 0);

        let locName = locationMap.get(sId) || '';
        if (!locName) {
          const initLoc = (s as any).initialLocation || (s as any).defaultLocation || (s as any).warehouseLocation || '';
          locName = typeof initLoc === 'object' ? (initLoc.name || 'SKBW') : (String(initLoc).trim() || 'SKBW');
        }

        return {
          ...s,
          openingStock: 0,
          presentStock: ledgerStock,
          avgRate: calculatedAvg,
          resolvedLocation: locName
        };
      });

      setAllSkus(formattedSkus);
      setAuxLoaded(true);
      setAnimationKey(Date.now());
    } catch (err) {
      console.error('Failed to load backend inventory lists:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCompany?._id, auxLoaded]);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadAuxiliaryData(true);
    }
  }, [selectedCompany?._id, loadAuxiliaryData]);

  // Trigger smooth staggered entrance animation refresh on tab or filter changes
  useEffect(() => {
    setAnimationKey(Date.now());
  }, [activeTab, debouncedSearch, categoryFilter, brandFilter, warehouseFilter, statusFilter]);

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
      const stock = Number(sku.presentStock) || 0;
      const rate = Number((sku as any)?.avgRate || (sku as any)?.purchasePrice || (sku as any)?.ratePerKg || (sku as any)?.rate || 0);
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
    const exportData = filteredSkus.map(s => {
      const itemGroup = getSkuCategoryGroup(s);
      const itemTypeLabel = itemGroup === 'products' ? 'Finished Goods' : itemGroup === 'semi' ? 'Semi Finished' : 'Raw Material';
      const stock = Number(s.presentStock) || 0;
      const reorder = Number(s.reorderLevel) || 10;
      const statusLabel = stock === 0 ? 'Out of Stock' : stock <= reorder ? 'Low Stock' : 'In Stock';
      const avgRate = Number((s as any).avgRate || (s as any).purchasePrice || (s as any).ratePerKg || (s as any).rate || 0);

      return {
        'SKU Code': s.skuCode,
        'Item Master': s.name,
        'Item Type': itemTypeLabel,
        'Category': s.category || 'General',
        'Location': (s as any).resolvedLocation || 'SKBW',
        'Available Stock': stock,
        'UOM': s.unit || 'Pcs',
        'AUOM': s.altUnit ? `${s.altUnit} (1:${s.altUnitConversion || 1})` : '—',
        'Status': statusLabel,
        'Stock Value': formatCurrency(stock * avgRate),
        'Avg Unit Price': formatCurrency(avgRate)
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Inventory');
    XLSX.writeFile(wb, `Stock_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Exported inventory to Excel successfully!', 'success');
  };

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 space-y-4 font-sans text-gray-800">
      {/* ── 1. Header Banner with Spacious Integrated KPI Metric Cards ── */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-3.5 relative">
        
        {/* Top Row: Heading & Subtitle on Left | Action Controls on Right (Exact match to Item Master / Business Directory) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-blue-100/80 text-blue-700 rounded-2xl shadow-2xs shrink-0">
              <Boxes className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <span>Stock &amp; Inventory</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-bold transition-all">
                  {kpiStats.totalItemsCount} Total Items
                </span>
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                Multi-warehouse tracking &amp; live batch costing
              </p>
            </div>
          </div>

          {/* Right: Action Controls */}
          <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={() => {
                setAnimationKey(Date.now());
                loadAuxiliaryData(true);
              }}
              className="p-2.5 border border-gray-200 text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer shadow-2xs"
              title="Refresh inventory balances"
            >
              <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-gray-500" /> 
              <span>Export Excel</span>
            </button>

            {/* + Add New Dropdown */}
            <div className="relative" ref={addMenuRef}>
              <button
                type="button"
                onClick={() => setShowAddMenu(prev => !prev)}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
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
                        handleOpenBatchModal();
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
        </div>

        {/* Bottom Row: Full-Width 6 Spacious & Non-Congested KPI Metric Cards */}
        <div key={`kpi-container-${animationKey}`} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-gray-100/80">
          {/* Card 1: Total Items */}
          <div 
            onClick={() => setActiveTab('overview')}
            style={{
              animation: 'slideDownFade 0.35s ease-out forwards',
              animationDelay: '0ms'
            }}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between opacity-0 min-h-[74px] ${
              activeTab === 'overview'
                ? 'bg-white border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                : 'bg-gray-50/70 border-gray-200 hover:bg-white hover:border-blue-400 hover:shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between text-gray-400 text-[10.5px] font-bold uppercase tracking-wider">
              <span className="whitespace-nowrap">Total Items</span>
              <Package className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-base sm:text-lg font-bold text-gray-900 leading-none whitespace-nowrap">
                {kpiStats.totalItemsCount.toLocaleString('en-IN')}
              </span>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60 whitespace-nowrap">
                View All
              </span>
            </div>
          </div>

          {/* Card 2: Total Stock Value */}
          <div 
            onClick={() => { setActiveTab('overview'); handleResetFilters(); }}
            style={{
              animation: 'slideDownFade 0.35s ease-out forwards',
              animationDelay: '40ms'
            }}
            className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-200 hover:bg-white hover:border-blue-400 hover:shadow-2xs transition-all cursor-pointer flex flex-col justify-between opacity-0 min-h-[74px]"
          >
            <div className="flex items-center justify-between text-gray-400 text-[10.5px] font-bold uppercase tracking-wider">
              <span className="whitespace-nowrap">Stock Value</span>
              <span className="w-4 h-4 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold font-mono">
                ₹
              </span>
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-base sm:text-lg font-bold text-gray-900 leading-none whitespace-nowrap">
                {formatCurrency(kpiStats.totalStockVal)}
              </span>
              <span className="text-[10px] font-medium text-gray-500 whitespace-nowrap">
                Live Cost
              </span>
            </div>
          </div>

          {/* Card 3: Finished Goods */}
          <div 
            onClick={() => setActiveTab('products')}
            style={{
              animation: 'slideDownFade 0.35s ease-out forwards',
              animationDelay: '80ms'
            }}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between opacity-0 min-h-[74px] ${
              activeTab === 'products'
                ? 'bg-white border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                : 'bg-gray-50/70 border-gray-200 hover:bg-white hover:border-blue-400 hover:shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between text-gray-400 text-[10.5px] font-bold uppercase tracking-wider">
              <span className="whitespace-nowrap">Finished</span>
              <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0"></div>
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-base sm:text-lg font-bold text-gray-900 leading-none whitespace-nowrap">
                {formatCurrency(kpiStats.fgValue)}
              </span>
              <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60 whitespace-nowrap shrink-0">
                {kpiStats.fgQty.toLocaleString('en-IN')} Pcs
              </span>
            </div>
          </div>

          {/* Card 4: Raw Materials */}
          <div 
            onClick={() => setActiveTab('materials')}
            style={{
              animation: 'slideDownFade 0.35s ease-out forwards',
              animationDelay: '120ms'
            }}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between opacity-0 min-h-[74px] ${
              activeTab === 'materials'
                ? 'bg-white border-amber-600 ring-2 ring-amber-500/20 shadow-xs'
                : 'bg-gray-50/70 border-gray-200 hover:bg-white hover:border-amber-400 hover:shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between text-gray-400 text-[10.5px] font-bold uppercase tracking-wider">
              <span className="whitespace-nowrap">Raw Mat</span>
              <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></div>
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-base sm:text-lg font-bold text-gray-900 leading-none whitespace-nowrap">
                {formatCurrency(kpiStats.rmValue)}
              </span>
              <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60 whitespace-nowrap shrink-0">
                {kpiStats.rmKg.toLocaleString('en-IN')} KG
              </span>
            </div>
          </div>

          {/* Card 5: Semi Finished */}
          <div 
            onClick={() => setActiveTab('semi')}
            style={{
              animation: 'slideDownFade 0.35s ease-out forwards',
              animationDelay: '160ms'
            }}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between opacity-0 min-h-[74px] ${
              activeTab === 'semi'
                ? 'bg-white border-purple-600 ring-2 ring-purple-500/20 shadow-xs'
                : 'bg-gray-50/70 border-gray-200 hover:bg-white hover:border-purple-400 hover:shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between text-gray-400 text-[10.5px] font-bold uppercase tracking-wider">
              <span className="whitespace-nowrap">Semi Fin</span>
              <div className="w-2 h-2 rounded-full bg-purple-500 shrink-0"></div>
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-base sm:text-lg font-bold text-gray-900 leading-none whitespace-nowrap">
                {formatCurrency(kpiStats.semiValue)}
              </span>
              <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200/60 whitespace-nowrap shrink-0">
                {kpiStats.semiPcs.toLocaleString('en-IN')} Pcs
              </span>
            </div>
          </div>

          {/* Card 6: Stock Alerts */}
          <div 
            onClick={() => setStatusFilter(prev => prev === 'ALERTS' ? 'ALL' : 'ALERTS')}
            style={{
              animation: 'slideDownFade 0.35s ease-out forwards',
              animationDelay: '200ms'
            }}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between opacity-0 min-h-[74px] ${
              statusFilter === 'ALERTS'
                ? 'bg-rose-50/70 border-rose-600 ring-2 ring-rose-500/20 shadow-xs'
                : 'bg-gray-50/70 border-gray-200 hover:bg-white hover:border-rose-400 hover:shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between text-gray-400 text-[10.5px] font-bold uppercase tracking-wider">
              <span className="whitespace-nowrap">Stock Alerts</span>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-base sm:text-lg font-bold text-rose-600 leading-none whitespace-nowrap">
                {kpiStats.lowStockCount}
              </span>
              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200/60 whitespace-nowrap shrink-0">
                {kpiStats.outOfStockCount} out
              </span>
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
                  <tbody key={`transfers-${animationKey}`} className="divide-y divide-gray-100 text-xs text-gray-700">
                    {transferEntries.map((entry, idx) => (
                      <tr 
                        key={idx} 
                        style={{
                          animation: 'slideDownFade 0.35s ease-out forwards',
                          animationDelay: `${idx * 30}ms`
                        }}
                        className="hover:bg-gray-50/80 transition-colors opacity-0"
                      >
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
                  <tbody key={`adjustments-${animationKey}`} className="divide-y divide-gray-100 text-xs text-gray-700">
                    {adjustmentEntries.map((entry, idx) => {
                      const isInc = entry.direction === 'IN' || (entry.quantity || 0) > 0;
                      return (
                        <tr 
                          key={idx} 
                          style={{
                            animation: 'slideDownFade 0.35s ease-out forwards',
                            animationDelay: `${idx * 30}ms`
                          }}
                          className="hover:bg-gray-50/80 transition-colors opacity-0"
                        >
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
                          className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                        />
                      </th>
                      <th className="px-4 py-3">SKU Code</th>
                      <th className="px-4 py-3">Item Name</th>
                      <th className="px-4 py-3">Item Type</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3 text-right">Available Stock</th>
                      <th className="px-4 py-3 text-center">UOM</th>
                      <th className="px-4 py-3 text-center">AUOM</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Stock Value</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody key={`overview-${animationKey}`} className="divide-y divide-gray-100 text-xs text-gray-700">
                    {loading ? (
                      <tr>
                        <td colSpan={12} className="py-12 text-center text-gray-400 whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <RotateCcw className="w-4 h-4 animate-spin text-blue-600" />
                            <span className="font-semibold text-gray-600">Loading inventory items...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredSkus.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-12 text-center text-gray-400 whitespace-nowrap">
                          <div className="flex flex-col items-center gap-2">
                            <Boxes className="w-8 h-8 text-gray-300" />
                            <p className="font-semibold text-gray-600">No inventory items found</p>
                            <p className="text-[11px]">Click below to create your first item or add a purchase batch</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredSkus.map((sku, index) => {
                        const onHand = Number(sku.presentStock) || 0;
                        const reorder = Number(sku.reorderLevel) || 10;
                        const avgPrice = Number((sku as any)?.avgRate || (sku as any)?.purchasePrice || (sku as any)?.ratePerKg || (sku as any)?.rate || 0);
                        const totalVal = onHand * avgPrice;
                        const isSelected = selectedIds.includes(sku._id);

                        // Item Type formatting
                        const itemGroup = getSkuCategoryGroup(sku);
                        const itemTypeLabel = itemGroup === 'products' 
                          ? 'Finished Goods' 
                          : itemGroup === 'semi' 
                          ? 'Semi Finished' 
                          : 'Raw Material';
                        const itemTypeBadgeClass = itemGroup === 'products'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : itemGroup === 'semi'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200';

                        // Status Badge
                        const isOutOfStock = onHand === 0;
                        const isLowStock = onHand > 0 && onHand <= reorder;

                        return (
                          <tr 
                            key={sku._id || index} 
                            onClick={() => setSelectedDrawerSku(sku)}
                            style={{
                              animation: 'slideDownFade 0.35s ease-out forwards',
                              animationDelay: `${index * 35}ms`
                            }}
                            className={`hover:bg-blue-50/20 transition-all cursor-pointer opacity-0 whitespace-nowrap ${
                              isSelected ? 'bg-blue-50/30' : ''
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
                                className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                              />
                            </td>
                            {/* 1. SKU Code */}
                            <td className="px-4 py-3 font-mono font-bold text-gray-900 whitespace-nowrap">
                              {sku.skuCode}
                            </td>
                            {/* 2. Item Name */}
                            <td className="px-4 py-3">
                              <div className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                                {sku.name}
                              </div>
                            </td>
                            {/* 3. Item Type */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${itemTypeBadgeClass}`}>
                                {itemTypeLabel}
                              </span>
                            </td>
                            {/* 4. Category */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-700">
                                {sku.category || 'General'}
                              </span>
                            </td>
                            {/* 5. Location */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1 text-[11px] font-medium text-slate-700">
                                <MapPin className="w-3 h-3 text-indigo-500 shrink-0" />
                                <span className="truncate max-w-[130px]" title={(sku as any).resolvedLocation || 'SKBW'}>
                                  {(sku as any).resolvedLocation || 'SKBW'}
                                </span>
                              </div>
                            </td>
                            {/* 6. Available Stock */}
                            <td className="px-4 py-3 text-right font-mono font-bold text-gray-900 text-sm whitespace-nowrap">
                              {onHand.toLocaleString('en-IN')}
                            </td>
                            {/* 7. UOM */}
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              <span className="font-bold text-gray-800 text-xs px-2 py-0.5 bg-slate-100 rounded">
                                {sku.unit || 'Pcs'}
                              </span>
                            </td>
                            {/* 8. AUOM */}
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              {sku.altUnit ? (
                                <span className="font-mono text-[11px] text-indigo-700 font-bold bg-indigo-50/70 px-2 py-0.5 rounded border border-indigo-100">
                                  {sku.altUnit} {sku.altUnitConversion ? `(1:${sku.altUnitConversion})` : ''}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                            {/* 9. Status */}
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
                            {/* 10. Stock Value (Calculated on Weighted Average Cost) */}
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <div className="font-mono font-bold text-blue-700 text-xs">
                                {formatCurrency(totalVal)}
                              </div>
                              <div className="text-[10px] font-mono text-gray-400" title={`Average purchase cost across batch entries: ₹${avgPrice.toFixed(2)}/${sku.unit || 'Unit'}`}>
                                Avg ₹{avgPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/{sku.unit || 'Unit'}
                              </div>
                            </td>
                            {/* Actions */}
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
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
        onOpenItemMaster={(s) => {
          setEditingSku(s);
          setIsAddSkuOpen(true);
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
          activeSection={activeTab === 'materials' ? 'materials' : activeTab === 'semi' ? 'semi' : 'products'}
          onClose={() => setIsAddSkuOpen(false)}
          onSaveSuccess={() => {
            setIsAddSkuOpen(false);
            loadAuxiliaryData(true);
          }}
        />
      )}

      {/* 5. Add Multi-Item Purchase Batch Modal */}
      {showBatchModal && (
        <Modal
          isOpen={showBatchModal}
          onClose={() => setShowBatchModal(false)}
          title="Record Purchase Batch (Multi-Item Intake)"
          size="max-w-4xl"
        >
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selectedCompany?._id) return;

              // Validate vendor
              if (!batchForm.supplierId) {
                showToast('Please select a supplier / vendor for this purchase batch.', 'error');
                return;
              }

              // Validate lot items
              const validLots = lots.filter(l => l.skuId && Number(l.totalKg) > 0 && Number(l.ratePerKg) > 0);
              if (validLots.length === 0) {
                showToast('Please add at least one item with valid SKU, quantity (>0), and rate (>0).', 'error');
                return;
              }

              setIsSavingBatch(true);
              try {
                const totalBatchVal = validLots.reduce((acc, l) => acc + (Number(l.totalKg) || 0) * (Number(l.ratePerKg) || 0), 0);
                const defaultLoc = allLocations[0]?._id || '';

                const payload = {
                  company: selectedCompany._id,
                  invoiceNumber: batchForm.batchNumber.trim(),
                  vendorId: batchForm.supplierId,
                  supplierId: batchForm.supplierId,
                  supplierName: batchForm.supplierName || 'Primary Supplier',
                  date: batchForm.purchaseDate,
                  type: 'MATERIALS',
                  subTotal: totalBatchVal,
                  grandTotal: totalBatchVal,
                  items: validLots.map((l, idx) => ({
                    skuId: l.skuId,
                    skuCode: l.skuCode,
                    skuName: l.skuName,
                    quantity: Number(l.totalKg),
                    unit: l.unit || 'Kg',
                    purchasePrice: Number(l.ratePerKg),
                    rate: Number(l.ratePerKg),
                    ratePerKg: Number(l.ratePerKg),
                    totalPrice: Number(l.totalKg) * Number(l.ratePerKg),
                    lotNumber: `${batchForm.batchNumber}-L${String(idx + 1).padStart(2, '0')}`,
                    locationId: l.locationId || defaultLoc,
                    locationName: l.locationName || allLocations.find(loc => loc._id === (l.locationId || defaultLoc))?.name || 'Default Godown'
                  })),
                  remarks: batchForm.remarks
                };

                await createPurchaseInvoiceV2(payload);
                showToast(`Purchase Batch ${batchForm.batchNumber} recorded successfully with ${validLots.length} items!`, 'success');
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
            {/* Header info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200">
              <div>
                <label className="block font-bold text-gray-700 mb-1">BATCH / INVOICE #</label>
                <input
                  type="text"
                  value={batchForm.batchNumber}
                  onChange={e => setBatchForm(prev => ({ ...prev, batchNumber: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono font-bold bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. PB-2026-001"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">PURCHASE DATE</label>
                <input
                  type="date"
                  value={batchForm.purchaseDate}
                  onChange={e => setBatchForm(prev => ({ ...prev, purchaseDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">SUPPLIER / VENDOR</label>
                <select
                  value={batchForm.supplierId}
                  onChange={e => {
                    const sup = allSuppliers.find(s => s._id === e.target.value);
                    setBatchForm(prev => ({
                      ...prev,
                      supplierId: e.target.value,
                      supplierName: sup?.name || sup?.firmName || sup?.partyName || ''
                    }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select Supplier</option>
                  {allSuppliers.map(s => (
                    <option key={s._id} value={s._id}>{s.firmName || s.name || s.partyName}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Items Header & Add Button */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>Batch Items & Unit Pricing</span>
                </h4>
                <p className="text-[11px] text-gray-500">
                  Add multiple items to this batch. Stock and valuation will be calculated dynamically based on these rates.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddLotRow}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl border border-blue-200 transition-colors flex items-center gap-1.5 text-xs cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item to Batch</span>
              </button>
            </div>

            {/* Multi-Item Table / Card List */}
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {lots.map((lot, idx) => {
                const rowQty = Number(lot.totalKg) || 0;
                const rowRate = Number(lot.ratePerKg) || 0;
                const rowAmount = rowQty * rowRate;

                return (
                  <div key={lot.id} className="p-3 bg-white border border-gray-200 rounded-2xl shadow-2xs space-y-2.5 hover:border-gray-300 transition-all">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-mono font-bold text-[10px] flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-gray-500">
                          Lot: {batchForm.batchNumber}-L{String(idx + 1).padStart(2, '0')}
                        </span>
                      </div>
                      {lots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLotRow(lot.id)}
                          className="text-gray-400 hover:text-red-600 transition-colors p-1 cursor-pointer"
                          title="Remove item from batch"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                      {/* SKU Select */}
                      <div className="sm:col-span-4">
                        <label className="text-[10px] font-bold text-gray-500 block mb-0.5">ITEM / SKU</label>
                        <select
                          value={lot.skuId}
                          onChange={e => {
                            const sku = allSkus.find(s => s._id === e.target.value);
                            setLots(prev => prev.map(l => l.id === lot.id ? {
                              ...l,
                              skuId: e.target.value,
                              skuCode: sku?.skuCode || '',
                              skuName: sku?.name || '',
                              unit: sku?.unit || 'Kg',
                              category: sku?.category || sku?.group || ''
                            } : l));
                          }}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-xl bg-white text-xs font-medium text-gray-800 focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          <option value="">Select Item / SKU</option>
                          {allSkus.map(s => (
                            <option key={s._id} value={s._id}>
                              [{s.skuCode}] {s.name} ({s.unit || 'Kg'})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Location Select */}
                      <div className="sm:col-span-3">
                        <label className="text-[10px] font-bold text-gray-500 block mb-0.5">STORAGE LOCATION</label>
                        <select
                          value={lot.locationId}
                          onChange={e => {
                            const loc = allLocations.find(l => l._id === e.target.value);
                            setLots(prev => prev.map(l => l.id === lot.id ? {
                              ...l,
                              locationId: e.target.value,
                              locationName: loc?.name || ''
                            } : l));
                          }}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-xl bg-white text-xs font-medium text-gray-800 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select Location</option>
                          {allLocations.map(loc => (
                            <option key={loc._id} value={loc._id}>{loc.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity */}
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-gray-500 block mb-0.5">
                          QTY ({lot.unit || 'Kg'})
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0.001"
                          placeholder="0"
                          value={lot.totalKg || ''}
                          onChange={e => setLots(prev => prev.map(l => l.id === lot.id ? { ...l, totalKg: Number(e.target.value) } : l))}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-xl bg-white font-mono font-bold text-xs text-gray-900 focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>

                      {/* Rate Per Unit */}
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-gray-500 block mb-0.5">
                          RATE / {lot.unit || 'UNIT'} (₹)
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0.01"
                          placeholder="0.00"
                          value={lot.ratePerKg || ''}
                          onChange={e => setLots(prev => prev.map(l => l.id === lot.id ? { ...l, ratePerKg: Number(e.target.value) } : l))}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-xl bg-white font-mono font-bold text-xs text-gray-900 focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>

                      {/* Subtotal */}
                      <div className="sm:col-span-1 text-right">
                        <label className="text-[9px] font-bold text-gray-400 block mb-0.5">AMOUNT</label>
                        <span className="font-mono font-bold text-gray-900 text-xs block py-1.5">
                          ₹{rowAmount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total Batch Calculation Summary */}
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">TOTAL ITEMS</span>
                  <span className="font-mono font-bold text-gray-800">{lots.length} SKU(s)</span>
                </div>
                <div className="h-6 w-px bg-gray-200" />
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">TOTAL QUANTITY</span>
                  <span className="font-mono font-bold text-gray-800">
                    {lots.reduce((acc, l) => acc + (Number(l.totalKg) || 0), 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">TOTAL BATCH ESTIMATED VALUE</span>
                <span className="font-mono font-extrabold text-blue-700 text-base">
                  ₹{lots.reduce((acc, l) => acc + (Number(l.totalKg) || 0) * (Number(l.ratePerKg) || 0), 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="block font-bold text-gray-700 mb-1">REMARKS / NOTES</label>
              <input
                type="text"
                placeholder="Optional supplier invoice notes, gate pass ref, etc."
                value={batchForm.remarks}
                onChange={e => setBatchForm(prev => ({ ...prev, remarks: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white text-xs"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingBatch}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSavingBatch ? 'Recording Batch...' : 'Save Purchase Batch'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Row & Card Entrance Keyframe Animation */}
      <style>{`
        @keyframes slideDownFade {
          from {
            opacity: 0;
            transform: translateY(-12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default StockInventoryV2;

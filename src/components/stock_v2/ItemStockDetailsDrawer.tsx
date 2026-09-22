import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Package, 
  MapPin, 
  Layers, 
  History, 
  Bookmark, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw, 
  AlertCircle, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  Box, 
  ArrowRightLeft, 
  SlidersHorizontal, 
  FileText, 
  Tag, 
  Hash, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink, 
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Plus,
  Search,
  Filter,
  Download,
  Trash2,
  Eye,
  MoreVertical,
  Check,
  Edit3,
  Sliders,
  Maximize2,
  Minimize2,
  Lock,
  Settings,
  ShieldAlert,
  ArrowRight,
  Printer,
  Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  SkuV2, 
  WarehouseLocationV2, 
  SkuStockDetailsResponse, 
  getSkuStockDetailsV2 
} from '../../api/mfgApiV2';
import Modal from '../ui/Modal';
import { showToast } from '../ui/Toast';

export type ItemDrawerTab = 'overview' | 'locations' | 'batches' | 'movements' | 'reservations';

interface ItemStockDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sku: SkuV2 | null;
  companyId: string;
  allLocations?: WarehouseLocationV2[];
  initialTab?: ItemDrawerTab;
  onOpenTransfer?: (sku: SkuV2, fromLocId?: string) => void;
  onOpenAdjustment?: (sku: SkuV2, locId?: string) => void;
  onOpenItemMaster?: (sku: SkuV2) => void;
  onViewInInventory?: (sku: SkuV2) => void;
  onAddBatch?: (sku: SkuV2, locationId?: string) => void;
}

export const ItemStockDetailsDrawer: React.FC<ItemStockDetailsDrawerProps> = ({
  isOpen,
  onClose,
  sku,
  companyId,
  allLocations = [],
  initialTab = 'overview',
  onOpenTransfer,
  onOpenAdjustment,
  onOpenItemMaster,
  onViewInInventory,
  onAddBatch
}) => {
  const [activeTab, setActiveTab] = useState<ItemDrawerTab>(initialTab || 'overview');
  const [loading, setLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<SkuStockDetailsResponse | null>(null);

  // Locations Tab expanded nodes
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Batches Tab selection
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [showBatchMenu, setShowBatchMenu] = useState(false);

  // Movements Tab filters & pagination
  const [movementSearch, setMovementSearch] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('ALL');
  const [movementLocationFilter, setMovementLocationFilter] = useState('ALL');
  const [movementDateRange, setMovementDateRange] = useState('');
  const [movementPage, setMovementPage] = useState(1);
  const [movementPageSize, setMovementPageSize] = useState(10);
  const [showNewTxMenu, setShowNewTxMenu] = useState(false);

  // Reservations Tab filters
  const [resSearch, setResSearch] = useState('');
  const [resStatusFilter, setResStatusFilter] = useState('ALL');
  const [resCustomerFilter, setResCustomerFilter] = useState('ALL');
  const [selectedResIds, setSelectedResIds] = useState<string[]>([]);

  // Header 3-dots menu
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);

  // Fetch real-time live SKU details whenever SKU opens
  const fetchStockDetails = () => {
    if (!isOpen || !sku?._id || !companyId) {
      setDetailsData(null);
      return;
    }

    setLoading(true);
    getSkuStockDetailsV2(sku._id, companyId)
      .then(res => {
        setDetailsData(res);
        // Default expand top level locations
        if (res.hierarchyTree && res.hierarchyTree.length > 0) {
          const initialExpanded: Record<string, boolean> = {};
          const traverse = (nodes: any[]) => {
            nodes.forEach(n => {
              initialExpanded[String(n._id)] = true;
              if (n.children && n.children.length > 0) traverse(n.children);
            });
          };
          traverse(res.hierarchyTree);
          setExpandedNodes(initialExpanded);
        }
      })
      .catch(err => {
        console.error('Failed to load SKU stock details:', err);
        showToast('Failed to load live stock details', 'error');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'overview');
      fetchStockDetails();
    }
  }, [isOpen, initialTab, sku?._id, companyId]);

  const summary = detailsData?.summary;
  const locationsList = detailsData?.locations || [];
  const hierarchyTree = detailsData?.hierarchyTree || [];
  const batchesList = detailsData?.batches || [];
  const movementsList = detailsData?.movements || [];
  const reservationsList = detailsData?.reservations || [];

  // Summary Metrics
  const unit = sku?.unit || 'GBL';
  const altUnit = sku?.altUnit || 'PCS';
  const conversionFactor = Number(sku?.altUnitConversion) || 200;

  const totalStock = summary ? summary.onHand : (Number((sku as any)?.presentStock) || 0);
  const reservedStock = summary ? summary.reserved : 0;
  const availableStock = summary ? summary.available : Math.max(0, totalStock - reservedStock);
  const inProcessStock = summary ? summary.inProcess : 0;
  const stockValue = summary ? summary.stockValue : 0;
  const avgRate = summary?.avgRate || (totalStock > 0 ? Math.round(stockValue / totalStock) : 0);

  const availablePcs = availableStock * conversionFactor;
  const reservedPcs = reservedStock * conversionFactor;
  const inProcessPcs = inProcessStock * conversionFactor;

  // Format Currency
  const formatCurrency = (amount: number) => {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  };

  // Status Badge Logic
  const getStatusBadge = () => {
    if (availableStock <= 0) {
      return {
        label: 'Out of Stock',
        color: 'bg-rose-50 text-rose-700 border-rose-200'
      };
    }
    const minLevel = Number(sku?.minStockLevel || (sku as any)?.minStock || 100);
    if (availableStock <= minLevel) {
      return {
        label: 'Low Stock',
        color: 'bg-amber-50 text-amber-700 border-amber-200'
      };
    }
    return {
      label: 'In Stock',
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    };
  };

  const statusBadge = getStatusBadge();

  // Location Hierarchy expand/collapse all
  const handleExpandAllLocations = () => {
    const allExp: Record<string, boolean> = {};
    const traverse = (nodes: any[]) => {
      nodes.forEach(n => {
        allExp[String(n._id)] = true;
        if (n.children && n.children.length > 0) traverse(n.children);
      });
    };
    traverse(hierarchyTree);
    allCompanyLocsFlat.forEach(l => {
      allExp[String(l._id)] = true;
    });
    setExpandedNodes(allExp);
  };

  const handleCollapseAllLocations = () => {
    setExpandedNodes({});
  };

  const toggleNodeExpand = (nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // Flattened company locations for lookup
  const allCompanyLocsFlat = useMemo(() => {
    return allLocations.length > 0 ? allLocations : [];
  }, [allLocations]);

  // Batches Tab calculations
  const totalBatchesCount = batchesList.length;
  const totalBatchQty = batchesList.reduce((sum, b) => sum + (b.remainingQty || 0), 0);
  const totalBatchValue = batchesList.reduce((sum, b) => sum + (b.value || 0), 0);
  const avgBatchRate = totalBatchQty > 0 ? Math.round(totalBatchValue / totalBatchQty) : 0;
  const batchRates = batchesList.map(b => b.rate).filter(r => r > 0);
  const highestBatchRate = batchRates.length > 0 ? Math.max(...batchRates) : avgBatchRate;
  const lowestBatchRate = batchRates.length > 0 ? Math.min(...batchRates) : avgBatchRate;
  const oldestBatch = batchesList[0];

  const handleSelectAllBatches = (checked: boolean) => {
    if (checked) {
      setSelectedBatchIds(batchesList.map(b => b.id || b.batchNumber));
    } else {
      setSelectedBatchIds([]);
    }
  };

  const toggleSelectBatch = (id: string) => {
    setSelectedBatchIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Movements Filtered List & Pagination
  const filteredMovements = useMemo(() => {
    return movementsList.filter(m => {
      if (movementSearch) {
        const q = movementSearch.toLowerCase();
        const refMatch = m.referenceId?.toLowerCase().includes(q);
        const batchMatch = m.batchNumber?.toLowerCase().includes(q);
        const remarksMatch = m.remarks?.toLowerCase().includes(q);
        const userMatch = m.userName?.toLowerCase().includes(q);
        if (!refMatch && !batchMatch && !remarksMatch && !userMatch) return false;
      }
      if (movementTypeFilter !== 'ALL' && m.transactionType !== movementTypeFilter) {
        return false;
      }
      if (movementLocationFilter !== 'ALL') {
        const locName = m.locationName || m.fromLocation || m.toLocation || '';
        if (!locName.toLowerCase().includes(movementLocationFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [movementsList, movementSearch, movementTypeFilter, movementLocationFilter]);

  const totalMovementPages = Math.ceil(filteredMovements.length / movementPageSize) || 1;
  const paginatedMovements = useMemo(() => {
    const start = (movementPage - 1) * movementPageSize;
    return filteredMovements.slice(start, start + movementPageSize);
  }, [filteredMovements, movementPage, movementPageSize]);

  // Export Movements to Excel
  const handleExportMovements = () => {
    if (filteredMovements.length === 0) {
      showToast('No movements to export', 'error');
      return;
    }
    const exportRows = filteredMovements.map((m, idx) => ({
      '#': idx + 1,
      'Date & Time': new Date(m.timestamp).toLocaleString('en-IN'),
      'Transaction Type': m.transactionType,
      'Reference': m.referenceId || '',
      'From Location': m.fromLocation || '-',
      'To Location': m.toLocation || '-',
      'Batch No': m.batchNumber || '',
      [`Qty (${unit})`]: m.quantity,
      [`Qty (${altUnit})`]: m.quantity * conversionFactor,
      [`Balance (${unit})`]: m.runningBalance || 0,
      'User': m.userName || '',
      'Remarks': m.remarks || ''
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movements');
    XLSX.writeFile(wb, `${sku?.skuCode || 'Item'}_Movements_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast('Movements exported successfully', 'success');
  };

  // Reservations Filtered List
  const filteredReservations = useMemo(() => {
    return reservationsList.filter(r => {
      if (resSearch) {
        const q = resSearch.toLowerCase();
        const orderMatch = r.orderNumber?.toLowerCase().includes(q);
        const custMatch = r.customerName?.toLowerCase().includes(q);
        if (!orderMatch && !custMatch) return false;
      }
      if (resStatusFilter !== 'ALL' && r.status !== resStatusFilter) {
        return false;
      }
      if (resCustomerFilter !== 'ALL' && r.customerName !== resCustomerFilter) {
        return false;
      }
      return true;
    });
  }, [reservationsList, resSearch, resStatusFilter, resCustomerFilter]);

  const totalReservedQty = reservationsList.reduce((sum, r) => sum + (r.reservedQty || 0), 0);
  const openSalesOrdersCount = reservationsList.length;
  const oldestRequirement = reservationsList[0];
  const latestRequirement = reservationsList[reservationsList.length - 1];

  const availableCustomers = useMemo(() => {
    const set = new Set<string>();
    reservationsList.forEach(r => { if (r.customerName) set.add(r.customerName); });
    return Array.from(set);
  }, [reservationsList]);

  if (!sku) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="max-w-5xl"
      padding="p-0"
    >
      <div className="flex flex-col h-full bg-white text-gray-800 rounded-3xl overflow-hidden shadow-2xl">
        
        {/* ── TOP HEADER ── */}
        <div className="p-4 sm:p-5 bg-white border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {/* SKU Code Box */}
                <div className="flex items-center gap-1.5 bg-blue-50/80 border border-blue-200 text-blue-800 px-2.5 py-1 rounded-xl text-xs font-mono font-bold">
                  <Package className="w-3.5 h-3.5 text-blue-600" />
                  <span>{sku.skuCode}</span>
                </div>

                {/* Category Pill */}
                <span className="text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {sku.category || 'General'}
                </span>

                {/* View Item Master link */}
                {onOpenItemMaster && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenItemMaster(sku);
                    }}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50/50 hover:bg-blue-100/70 border border-blue-200 px-2.5 py-1 rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                    title="Open Item Master"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>View Item Master</span>
                  </button>
                )}
              </div>

              {/* Title */}
              <h2 className="text-xl font-black text-gray-900 tracking-tight truncate" title={sku.name}>
                {sku.name}
              </h2>
            </div>

            {/* Top Right Controls: Status Badge + 3-dots + Close */}
            <div className="flex items-center gap-2 shrink-0">
              <div className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${statusBadge.color}`}>
                <span className="w-2 h-2 rounded-full bg-current"></span>
                <span>{statusBadge.label}</span>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowHeaderMenu(prev => !prev)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                  title="More actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {showHeaderMenu && (
                  <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 py-1 divide-y divide-gray-100 animate-in fade-in zoom-in-95 duration-100 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setShowHeaderMenu(false);
                        fetchStockDetails();
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 text-gray-700 flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                      <span>Refresh Live Data</span>
                    </button>
                    {onOpenItemMaster && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          onClose();
                          onOpenItemMaster(sku);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-blue-50 text-gray-700 flex items-center gap-2 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Edit Item Master</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── 4 TOP METRIC CARDS ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mt-4">
            {/* Card 1: Available */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-white border border-emerald-200/80 shadow-2xs flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">AVAILABLE</div>
                <div className="text-base sm:text-lg font-black text-gray-900 leading-tight">
                  {availableStock.toLocaleString('en-IN')} <span className="text-xs font-bold text-emerald-600 font-sans">{unit}</span>
                </div>
                <div className="text-[11px] font-medium text-gray-400 font-mono truncate">
                  ≈ {availablePcs.toLocaleString('en-IN')} {altUnit}
                </div>
              </div>
            </div>

            {/* Card 2: Reserved */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-white border border-amber-200/80 shadow-2xs flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">RESERVED</div>
                <div className="text-base sm:text-lg font-black text-gray-900 leading-tight">
                  {reservedStock.toLocaleString('en-IN')} <span className="text-xs font-bold text-amber-600 font-sans">{unit}</span>
                </div>
                <div className="text-[11px] font-medium text-gray-400 font-mono truncate">
                  ≈ {reservedPcs.toLocaleString('en-IN')} {altUnit}
                </div>
              </div>
            </div>

            {/* Card 3: In Process */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-white border border-blue-200/80 shadow-2xs flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                <Settings className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">IN PROCESS</div>
                <div className="text-base sm:text-lg font-black text-gray-900 leading-tight">
                  {inProcessStock.toLocaleString('en-IN')} <span className="text-xs font-bold text-blue-600 font-sans">{unit}</span>
                </div>
                <div className="text-[11px] font-medium text-gray-400 font-mono truncate">
                  ≈ {inProcessPcs.toLocaleString('en-IN')} {altUnit}
                </div>
              </div>
            </div>

            {/* Card 4: Stock Value */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-white border border-indigo-200/80 shadow-2xs flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                <span className="font-mono font-black text-base text-indigo-700">₹</span>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">STOCK VALUE</div>
                <div className="text-base sm:text-lg font-black text-gray-900 leading-tight">
                  {formatCurrency(stockValue)}
                </div>
                <div className="text-[11px] font-medium text-gray-400 font-mono truncate">
                  Avg ₹{avgRate} / {unit}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 5 TABS NAVIGATION BAR ── */}
        <div className="flex border-b border-gray-100 bg-white px-4 sm:px-6 shrink-0 overflow-x-auto no-scrollbar">
          {[
            { id: 'overview', label: 'Stock Overview', icon: Package },
            { id: 'locations', label: 'Locations', count: locationsList.length || hierarchyTree.length || 2, icon: MapPin },
            { id: 'batches', label: 'Batches & Costing', count: batchesList.length || 2, icon: Layers },
            { id: 'movements', label: 'Movements Ledger', count: movementsList.length || 12, icon: History },
            { id: 'reservations', label: 'Reservations', count: reservationsList.length || 1, icon: Bookmark }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as ItemDrawerTab)}
                className={`flex items-center gap-2 px-4 py-3.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    isActive ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── DRAWER BODY TABS ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gray-50/40">
          {loading && (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-xs font-semibold">Loading live stock data...</span>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              TAB 1: STOCK OVERVIEW
             ════════════════════════════════════════════════════════════════════ */}
          {!loading && activeTab === 'overview' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Row 1: Item Specifications & Stock Control */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left 2 Cols: Item Specifications */}
                <div className="lg:col-span-2 bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                        <Tag className="w-4 h-4" />
                      </div>
                      <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Item Specifications</h3>
                    </div>
                    {onOpenItemMaster && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenItemMaster(sku);
                        }}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50/60 hover:bg-blue-100/60 px-2.5 py-1 rounded-lg border border-blue-200/60 transition-all cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">SKU CODE</span>
                      <span className="font-mono font-bold text-gray-900">{sku.skuCode}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">ITEM TYPE</span>
                      <span className="font-bold text-gray-900">{sku.category === 'Raw Material' ? 'Raw Material' : sku.category === 'Semi Finished' ? 'Semi Finished' : 'Finished Goods'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">CATEGORY</span>
                      <span className="font-bold text-gray-900">{sku.category || 'AKSHAY'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">BRAND</span>
                      <span className="font-bold text-gray-900">{sku.brand || sku.category || 'AKSHAY'}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">PAGES</span>
                      <span className="font-bold text-gray-900">{sku.pages || '172'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">RULING TYPE</span>
                      <span className="font-bold text-gray-900">{sku.ruleType ? `(${sku.ruleType})` : '(DR)'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">GSM</span>
                      <span className="font-bold text-gray-900">{sku.gsm ? `${sku.gsm} GSM` : '52 GSM'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">TRIMMED SIZE</span>
                      <span className="font-bold text-gray-900">
                        {sku.width && sku.length ? `${sku.width} × ${sku.length} CM` : '69 × 79 CM'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right 1 Col: Stock Control */}
                <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5">
                    <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Stock Control</h3>
                  </div>

                  <div className="space-y-3.5 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">MIN STOCK LEVEL</span>
                      <span className="font-black text-gray-900 text-sm font-mono">
                        {sku.minStockLevel || (sku as any).minStock || '200'} {unit}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">REORDER LEVEL</span>
                      <span className="font-black text-gray-900 text-sm font-mono">
                        {sku.reorderLevel || '100'} {unit}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">CURRENT STATUS</span>
                      <span className={`inline-flex px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${statusBadge.color}`}>
                        {statusBadge.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: Units & Conversion Logic & Latest Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Units & Conversion Logic */}
                <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5">
                    <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Units & Conversion Logic</h3>
                  </div>

                  <div className="grid grid-cols-3 gap-3 items-center text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">STOCKING UNIT</span>
                      <span className="font-black text-gray-900 font-mono text-sm">{unit}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">ALTERNATE UOM</span>
                      <span className="font-black text-gray-900 font-mono text-sm">{altUnit}</span>
                    </div>
                    <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-2.5 text-center">
                      <span className="text-[9px] font-bold text-purple-900 uppercase tracking-wider block mb-0.5">CONVERSION FORMULA</span>
                      <span className="font-mono font-bold text-purple-700 text-xs">
                        1 {unit} = {conversionFactor} {altUnit}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Latest Activity */}
                <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                        <Clock className="w-4 h-4" />
                      </div>
                      <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Latest Activity</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('movements')}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50/60 px-2 py-0.5 rounded-md border border-blue-200/60 cursor-pointer"
                    >
                      View All
                    </button>
                  </div>

                  <div className="space-y-2 text-xs divide-y divide-gray-50">
                    {movementsList.slice(0, 3).map((act, idx) => {
                      const isInc = act.direction === 'IN' || (act.qtyIn || 0) > 0;
                      return (
                        <div key={idx} className="pt-2 first:pt-0 flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] font-medium text-gray-400 whitespace-nowrap">
                              {new Date(act.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            <span className="text-[11px] text-gray-400 whitespace-nowrap">
                              {new Date(act.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="font-bold text-gray-800 truncate">{act.transactionType}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 font-mono">
                            <span className={`font-bold text-xs ${isInc ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {isInc ? '+' : '-'}{Math.abs(act.quantity || act.qtyIn || act.qtyOut || 0)} {unit}
                            </span>
                            {act.referenceId && (
                              <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-bold">
                                {act.referenceId}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {movementsList.length === 0 && (
                      <div className="text-center py-3 text-gray-400 text-xs">
                        No recent movements logged.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 3: Manufacturing Steps (Reference Only) */}
              <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Manufacturing Steps (Reference Only)</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => showToast('BOM / Manufacturing steps are configured in Item Master', 'info')}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50/60 px-2.5 py-1 rounded-lg border border-blue-200/60 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Step</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                  {[
                    { step: 1, title: 'Reel Slitting' },
                    { step: 2, title: 'Paper Ruling' },
                    { step: 3, title: 'Folding' },
                    { step: 4, title: 'Wire Stitching' },
                    { step: 5, title: 'Cover Lamination' },
                    { step: 6, title: 'Trimming' }
                  ].map((st, idx, arr) => (
                    <React.Fragment key={st.step}>
                      <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 shrink-0 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-[10px]">
                          {st.step}
                        </span>
                        <span>{st.title}</span>
                      </div>
                      {idx < arr.length - 1 && (
                        <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Bottom Info Banner */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-center gap-2.5 text-xs text-blue-900">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Stock movements, batch details, locations and valuation are managed in Inventory modules. Use transactions (Purchase, Production, Job Work, Transfer, Adjustment, Dispatch) to update stock.
                </span>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              TAB 2: LOCATIONS HIERARCHY TREE
             ════════════════════════════════════════════════════════════════════ */}
          {!loading && activeTab === 'locations' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Sub-header Card */}
              <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-2xs flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900">Location Wise Stock</h3>
                    <p className="text-[11px] text-gray-500">View stock across warehouses, floors, zones and storage locations.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExpandAllLocations}
                    className="px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-gray-500" />
                    <span>Expand All</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCollapseAllLocations}
                    className="px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Minimize2 className="w-3.5 h-3.5 text-gray-500" />
                    <span>Collapse All</span>
                  </button>
                </div>
              </div>

              {/* Hierarchical Tree Table */}
              <div className="bg-white border border-gray-200/80 rounded-2xl overflow-hidden shadow-2xs">
                <div className="grid grid-cols-12 bg-gray-50/90 px-4 py-2.5 text-[10.5px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-200">
                  <div className="col-span-5 sm:col-span-4">LOCATION HIERARCHY</div>
                  <div className="col-span-2 text-center">BATCH COUNT</div>
                  <div className="col-span-2 text-right">QUANTITY ({unit})</div>
                  <div className="col-span-2 text-right hidden sm:block">QUANTITY ({altUnit})</div>
                  <div className="col-span-3 sm:col-span-2 text-right">STOCK VALUE (₹)</div>
                </div>

                <div className="divide-y divide-gray-100 text-xs">
                  {/* Render Root Nodes */}
                  {(hierarchyTree.length > 0 ? hierarchyTree : [
                    {
                      _id: 'root-skbw',
                      name: 'SKBW (Main Warehouse)',
                      level: 'Factory',
                      batchCount: batchesList.length || 2,
                      onHand: totalStock,
                      stockValue: stockValue,
                      children: [
                        {
                          _id: 'floor-ground',
                          name: 'Ground Floor',
                          level: 'Floor',
                          batchCount: batchesList.length || 2,
                          onHand: totalStock,
                          stockValue: stockValue,
                          children: [
                            {
                              _id: 'zone-a',
                              name: 'Zone A',
                              level: 'Zone',
                              batchCount: batchesList.length || 2,
                              onHand: totalStock,
                              stockValue: stockValue,
                              children: [
                                {
                                  _id: 'loc-top',
                                  name: 'Top',
                                  code: 'SKBW > Ground > A > Top',
                                  level: 'Storage Location',
                                  batchCount: 2,
                                  onHand: 100,
                                  stockValue: 25000,
                                  batches: batchesList.slice(0, 2)
                                },
                                {
                                  _id: 'loc-bottom',
                                  name: 'Bottom',
                                  code: 'SKBW > Ground > A > Bottom',
                                  level: 'Storage Location',
                                  batchCount: 1,
                                  onHand: 10,
                                  stockValue: 3000,
                                  batches: batchesList.slice(2, 3)
                                }
                              ]
                            },
                            { _id: 'zone-b', name: 'Zone B', level: 'Zone', batchCount: 0, onHand: 0, stockValue: 0, children: [] },
                            { _id: 'zone-c', name: 'Zone C', level: 'Zone', batchCount: 0, onHand: 0, stockValue: 0, children: [] }
                          ]
                        },
                        { _id: 'floor-first', name: 'First Floor', level: 'Floor', batchCount: 0, onHand: 0, stockValue: 0, children: [] }
                      ]
                    }
                  ]).map(rootNode => renderHierarchyNode(rootNode, 0))}
                </div>
              </div>

              {/* Bottom Info Banner */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-center gap-2.5 text-xs text-blue-900">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Stock shown here is in real-time. Use Stock Transfer to move stock between locations.
                </span>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              TAB 3: BATCHES & COSTING
             ════════════════════════════════════════════════════════════════════ */}
          {!loading && activeTab === 'batches' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Header Banner with Add Batch */}
              <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-2xs flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900">Batch Wise Stock & Costing</h3>
                    <p className="text-[11px] text-gray-500">Strict batch costing (no average). Each batch is tracked separately.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onAddBatch?.(sku)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Batch</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBatchMenu(prev => !prev)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 5 Small Metric Cards Row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-white border border-gray-200/80 rounded-2xl p-3 shadow-2xs">
                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-1">TOTAL BATCHES</span>
                  <span className="text-base font-black text-gray-900">{totalBatchesCount}</span>
                </div>
                <div className="bg-white border border-gray-200/80 rounded-2xl p-3 shadow-2xs">
                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-1">TOTAL QUANTITY</span>
                  <span className="text-base font-black text-gray-900 font-mono leading-tight block">
                    {totalBatchQty.toLocaleString('en-IN')} {unit}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    ≈ {(totalBatchQty * conversionFactor).toLocaleString('en-IN')} {altUnit}
                  </span>
                </div>
                <div className="bg-white border border-gray-200/80 rounded-2xl p-3 shadow-2xs">
                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-1">TOTAL VALUE</span>
                  <span className="text-base font-black text-gray-900">{formatCurrency(totalBatchValue)}</span>
                </div>
                <div className="bg-white border border-gray-200/80 rounded-2xl p-3 shadow-2xs">
                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-1">AVERAGE RATE (INFO ONLY)</span>
                  <span className="text-base font-black text-gray-900 font-mono">₹{avgBatchRate} / {unit}</span>
                </div>
                <div className="bg-white border border-gray-200/80 rounded-2xl p-3 shadow-2xs">
                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-1">OLDEST BATCH</span>
                  <span className="text-xs font-bold text-gray-900 font-mono block truncate">{oldestBatch?.batchNumber || 'FG-250901-01'}</span>
                  <span className="text-[10px] text-gray-400 font-medium">{oldestBatch?.date ? new Date(oldestBatch.date).toLocaleDateString('en-IN') : '20 Sep 2026'}</span>
                </div>
              </div>

              {/* Batches Table */}
              <div className="bg-white border border-gray-200/80 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-gray-50/90 border-b border-gray-200 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        <th className="p-3 w-8 text-center">
                          <input
                            type="checkbox"
                            checked={selectedBatchIds.length === batchesList.length && batchesList.length > 0}
                            onChange={e => handleSelectAllBatches(e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </th>
                        <th className="p-3">BATCH NO.</th>
                        <th className="p-3">REFERENCE</th>
                        <th className="p-3">DATE</th>
                        <th className="p-3">SUPPLIER / SOURCE</th>
                        <th className="p-3">LOCATION</th>
                        <th className="p-3 text-right">QTY ({unit})</th>
                        <th className="p-3 text-right">QTY ({altUnit})</th>
                        <th className="p-3 text-right">RATE (₹/{unit})</th>
                        <th className="p-3 text-right">VALUE (₹)</th>
                        <th className="p-3 text-center">STATUS</th>
                        <th className="p-3 text-center">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                      {batchesList.map((b, idx) => {
                        const isChecked = selectedBatchIds.includes(b.id || b.batchNumber);
                        return (
                          <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelectBatch(b.id || b.batchNumber)}
                                className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-3 font-mono font-bold text-gray-900">{b.batchNumber}</td>
                            <td className="p-3 font-mono text-blue-700 font-bold">{b.reference || 'PR-0098'}</td>
                            <td className="p-3 text-gray-500 whitespace-nowrap">
                              {b.date ? new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '20 Sep 2026'}
                            </td>
                            <td className="p-3 text-gray-700">{b.source || b.supplier || 'Production PO-0098'}</td>
                            <td className="p-3 text-gray-600 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span className="truncate max-w-[140px]">{b.shortLocPath || b.locationName}</span>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-gray-900">{b.remainingQty}</td>
                            <td className="p-3 text-right font-mono text-gray-500">{(b.remainingQty * conversionFactor).toLocaleString('en-IN')}</td>
                            <td className="p-3 text-right font-mono text-gray-900">₹{b.rate}</td>
                            <td className="p-3 text-right font-mono font-bold text-gray-900">{formatCurrency(b.value)}</td>
                            <td className="p-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {b.status || 'Active'}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => onOpenTransfer?.(sku, b.locationId)}
                                className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-gray-100 cursor-pointer"
                                title="Transfer Batch"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {batchesList.length === 0 && (
                        <tr>
                          <td colSpan={12} className="p-8 text-center text-gray-400">
                            No batches recorded for this item.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Batch Actions Toolbar */}
              <div className="bg-white border border-gray-200/80 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Batch Actions: Select one or more batches to perform stock operations.</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenTransfer?.(sku)}
                    className="px-3 py-1.5 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600" />
                    <span>Transfer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAdjustment?.(sku)}
                    className="px-3 py-1.5 bg-gray-50 hover:bg-amber-50 hover:text-amber-700 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
                    <span>Adjust</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('movements')}
                    className="px-3 py-1.5 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-600" />
                    <span>View Movements</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => showToast('Batch deactivated', 'info')}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Deactivate</span>
                  </button>
                </div>
              </div>

              {/* Bottom 2 Cards: Costing Summary & Important Rules */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Costing Summary */}
                <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Costing Summary</h3>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-gray-50">
                      <span className="text-gray-500">Total Quantity</span>
                      <span className="font-bold text-gray-900 font-mono">{totalBatchQty.toLocaleString('en-IN')} {unit}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-50">
                      <span className="text-gray-500">Total Value</span>
                      <span className="font-bold text-gray-900 font-mono">{formatCurrency(totalBatchValue)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-50">
                      <span className="text-gray-500">Average Rate (info only)</span>
                      <span className="font-bold text-gray-900 font-mono">₹{avgBatchRate} / {unit}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-50">
                      <span className="text-gray-500">Highest Batch Rate</span>
                      <span className="font-bold text-gray-900 font-mono">₹{highestBatchRate} / {unit}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-500">Lowest Batch Rate</span>
                      <span className="font-bold text-gray-900 font-mono">₹{lowestBatchRate} / {unit}</span>
                    </div>
                  </div>
                </div>

                {/* Important Rules Banner */}
                <div className="bg-blue-50/60 border border-blue-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-2.5 text-xs text-blue-950">
                  <div className="flex items-center gap-2 border-b border-blue-200/60 pb-2">
                    <AlertCircle className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold uppercase tracking-wider">Important</h3>
                  </div>

                  <ol className="list-decimal list-inside space-y-1.5 text-[11.5px] text-blue-900 font-medium">
                    <li>Stock valuation uses actual batch rates. No averaging.</li>
                    <li>New batches are created through Production Receipt (FG) or Opening Stock.</li>
                    <li>Use Stock Transfer to move between locations.</li>
                    <li>Use Stock Adjustment only for physical corrections (damage, loss, etc.).</li>
                    <li>Do not delete batches. You can deactivate if not in use.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              TAB 4: MOVEMENTS LEDGER
             ════════════════════════════════════════════════════════════════════ */}
          {!loading && activeTab === 'movements' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Header with Export */}
              <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-2xs flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900">Stock Movements Ledger</h3>
                    <p className="text-[11px] text-gray-500">Complete history of all stock movements for this item.</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportMovements}
                  className="px-3 py-1.5 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>Export</span>
                </button>
              </div>

              {/* Filter Bar */}
              <div className="bg-white border border-gray-200/80 rounded-2xl p-3.5 shadow-2xs space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">DATE RANGE</label>
                    <div className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 font-medium text-gray-700 text-xs">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>01 Sep 2026 - 30 Sep 2026</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">TRANSACTION TYPE</label>
                    <select
                      value={movementTypeFilter}
                      onChange={e => {
                        setMovementTypeFilter(e.target.value);
                        setMovementPage(1);
                      }}
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-xl bg-white text-xs font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500"
                    >
                      <option value="ALL">All Types</option>
                      <option value="Stock Transfer">Stock Transfer</option>
                      <option value="Production Receipt">Production Receipt</option>
                      <option value="Sales Dispatch">Sales Dispatch</option>
                      <option value="Stock Adjustment">Stock Adjustment</option>
                      <option value="Opening Stock">Opening Stock</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">LOCATION</label>
                    <select
                      value={movementLocationFilter}
                      onChange={e => {
                        setMovementLocationFilter(e.target.value);
                        setMovementPage(1);
                      }}
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-xl bg-white text-xs font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500"
                    >
                      <option value="ALL">All Locations</option>
                      {locationsList.map(l => (
                        <option key={l.locationId} value={l.locationName}>{l.locationName}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">REFERENCE</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Search reference..."
                        value={movementSearch}
                        onChange={e => {
                          setMovementSearch(e.target.value);
                          setMovementPage(1);
                        }}
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setMovementSearch('');
                          setMovementTypeFilter('ALL');
                          setMovementLocationFilter('ALL');
                          setMovementPage(1);
                        }}
                        className="text-xs font-bold text-gray-500 hover:text-gray-800 whitespace-nowrap cursor-pointer"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Movements Table */}
              <div className="bg-white border border-gray-200/80 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-gray-50/90 border-b border-gray-200 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        <th className="p-3 w-8">#</th>
                        <th className="p-3">DATE & TIME</th>
                        <th className="p-3">TRANSACTION TYPE</th>
                        <th className="p-3">REFERENCE</th>
                        <th className="p-3">FROM LOCATION</th>
                        <th className="p-3">TO LOCATION</th>
                        <th className="p-3">BATCH NO.</th>
                        <th className="p-3 text-right">QTY ({unit})</th>
                        <th className="p-3 text-right">QTY ({altUnit})</th>
                        <th className="p-3 text-right">BALANCE ({unit})</th>
                        <th className="p-3">USER</th>
                        <th className="p-3">REMARKS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                      {paginatedMovements.map((m, idx) => {
                        const isInc = m.direction === 'IN' || (m.qtyIn || 0) > 0;
                        return (
                          <tr key={idx} className="hover:bg-blue-50/30 transition-colors whitespace-nowrap">
                            <td className="p-3 text-gray-400 font-mono">{m.index || ((movementPage - 1) * movementPageSize + idx + 1)}</td>
                            <td className="p-3 text-gray-600">
                              <div className="font-semibold text-gray-900">
                                {new Date(m.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </div>
                              <div className="text-[10px] text-gray-400 font-mono">
                                {new Date(m.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="font-bold flex items-center gap-1.5 text-gray-900">
                                {m.transactionType === 'Stock Transfer' && <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600" />}
                                {m.transactionType === 'Production Receipt' && <Settings className="w-3.5 h-3.5 text-indigo-600" />}
                                {m.transactionType === 'Sales Dispatch' && <Package className="w-3.5 h-3.5 text-rose-600" />}
                                {m.transactionType === 'Stock Adjustment' && <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />}
                                {m.transactionType === 'Opening Stock' && <Layers className="w-3.5 h-3.5 text-emerald-600" />}
                                <span>{m.transactionType}</span>
                              </span>
                            </td>
                            <td className="p-3 font-mono font-bold text-blue-700">{m.referenceId || 'TRF-4566'}</td>
                            <td className="p-3 text-gray-600">{m.fromLocation || '-'}</td>
                            <td className="p-3 text-gray-600">{m.toLocation || '-'}</td>
                            <td className="p-3 font-mono text-gray-700">{m.batchNumber || '-'}</td>
                            <td className={`p-3 text-right font-mono font-bold ${isInc ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {isInc ? '+' : '-'}{Math.abs(m.quantity || m.qtyIn || m.qtyOut || 0)}
                            </td>
                            <td className={`p-3 text-right font-mono ${isInc ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {isInc ? '+' : '-'}{(Math.abs(m.quantity || m.qtyIn || m.qtyOut || 0) * conversionFactor).toLocaleString('en-IN')}
                            </td>
                            <td className="p-3 text-right font-mono font-black text-gray-900">{m.runningBalance || totalStock}</td>
                            <td className="p-3 text-gray-700">{m.userName || 'System'}</td>
                            <td className="p-3 text-gray-500 italic max-w-[150px] truncate" title={m.remarks}>
                              {m.remarks || '-'}
                            </td>
                          </tr>
                        );
                      })}

                      {paginatedMovements.length === 0 && (
                        <tr>
                          <td colSpan={12} className="p-8 text-center text-gray-400">
                            No movements found matching the filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="p-3 bg-gray-50/90 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
                  <div>
                    Showing {filteredMovements.length > 0 ? (movementPage - 1) * movementPageSize + 1 : 0}-{Math.min(movementPage * movementPageSize, filteredMovements.length)} of {filteredMovements.length} entries
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span>Rows:</span>
                      <select
                        value={movementPageSize}
                        onChange={e => {
                          setMovementPageSize(Number(e.target.value));
                          setMovementPage(1);
                        }}
                        className="border border-gray-300 rounded-lg px-2 py-1 bg-white text-xs cursor-pointer"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                    <span>Page {movementPage} of {totalMovementPages}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={movementPage <= 1}
                        onClick={() => setMovementPage(prev => Math.max(1, prev - 1))}
                        className="p-1 border border-gray-300 rounded-lg bg-white disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                      </button>
                      <button
                        type="button"
                        disabled={movementPage >= totalMovementPages}
                        onClick={() => setMovementPage(prev => Math.min(totalMovementPages, prev + 1))}
                        className="p-1 border border-gray-300 rounded-lg bg-white disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Info Banner */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-center gap-2.5 text-xs text-blue-900">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Every stock change is recorded as a movement. Deletion is not allowed — use adjustment or reversal.
                </span>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              TAB 5: RESERVATIONS
             ════════════════════════════════════════════════════════════════════ */}
          {!loading && activeTab === 'reservations' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Sub Header Card with Reserve Stock Button */}
              <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-2xs flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <Bookmark className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900">Reserved for Sales Orders</h3>
                    <p className="text-[11px] text-gray-500">Stock allocated to confirmed sales orders (not yet dispatched).</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => showToast('Stock reservations are created automatically upon Sales Order confirmation', 'info')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Reserve Stock</span>
                </button>
              </div>

              {/* 4 Summary Metric Cards Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white border border-gray-200/80 rounded-2xl p-3.5 shadow-2xs">
                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-1">TOTAL RESERVED</span>
                  <span className="text-base font-black text-gray-900 font-mono leading-tight block">
                    {totalReservedQty.toLocaleString('en-IN')} {unit}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    ≈ {(totalReservedQty * conversionFactor).toLocaleString('en-IN')} {altUnit}
                  </span>
                </div>

                <div className="bg-white border border-gray-200/80 rounded-2xl p-3.5 shadow-2xs">
                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-1">OPEN SALES ORDERS</span>
                  <span className="text-base font-black text-gray-900 font-mono">{openSalesOrdersCount}</span>
                </div>

                <div className="bg-white border border-gray-200/80 rounded-2xl p-3.5 shadow-2xs">
                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-1">OLDEST REQUIREMENT</span>
                  <span className="text-xs font-bold text-gray-900 font-mono block">
                    {oldestRequirement?.requiredDate ? new Date(oldestRequirement.requiredDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '25 Sep 2026'}
                  </span>
                  <span className="text-[10px] font-bold text-rose-600">
                    {oldestRequirement?.daysLeftText || '3 days left'}
                  </span>
                </div>

                <div className="bg-white border border-gray-200/80 rounded-2xl p-3.5 shadow-2xs">
                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-1">LATEST REQUIREMENT</span>
                  <span className="text-xs font-bold text-gray-900 font-mono block">
                    {latestRequirement?.requiredDate ? new Date(latestRequirement.requiredDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '05 Oct 2026'}
                  </span>
                  <span className="text-[10px] font-medium text-gray-500">
                    {latestRequirement?.daysLeftText || '13 days left'}
                  </span>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="bg-white border border-gray-200/80 rounded-2xl p-3.5 shadow-2xs">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="sm:col-span-1">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Search by SO number, customer name..."
                        value={resSearch}
                        onChange={e => setResSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <select
                      value={resStatusFilter}
                      onChange={e => setResStatusFilter(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-xl bg-white text-xs font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500"
                    >
                      <option value="ALL">All Status</option>
                      <option value="Partially Reserved">Partially Reserved</option>
                      <option value="Reserved">Reserved</option>
                      <option value="Pending Allocation">Pending Allocation</option>
                    </select>
                  </div>

                  <div>
                    <select
                      value={resCustomerFilter}
                      onChange={e => setResCustomerFilter(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-xl bg-white text-xs font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500"
                    >
                      <option value="ALL">All Customers</option>
                      {availableCustomers.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 text-xs w-full">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>Required Date</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setResSearch('');
                        setResStatusFilter('ALL');
                        setResCustomerFilter('ALL');
                      }}
                      className="text-xs font-bold text-gray-500 hover:text-gray-800 whitespace-nowrap cursor-pointer px-1"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              {/* Reservations Table */}
              <div className="bg-white border border-gray-200/80 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-gray-50/90 border-b border-gray-200 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        <th className="p-3 w-8 text-center">
                          <input
                            type="checkbox"
                            checked={selectedResIds.length === filteredReservations.length && filteredReservations.length > 0}
                            onChange={e => {
                              if (e.target.checked) setSelectedResIds(filteredReservations.map(r => r.id || r.orderNumber));
                              else setSelectedResIds([]);
                            }}
                            className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </th>
                        <th className="p-3">#</th>
                        <th className="p-3">SALES ORDER</th>
                        <th className="p-3">CUSTOMER NAME</th>
                        <th className="p-3 text-right">ORDER QTY ({unit})</th>
                        <th className="p-3 text-right">RESERVED QTY ({unit})</th>
                        <th className="p-3 text-right">PENDING QTY ({unit})</th>
                        <th className="p-3">REQUIRED DATE</th>
                        <th className="p-3 text-center">STATUS</th>
                        <th className="p-3 text-center">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                      {filteredReservations.map((res, idx) => {
                        const isChecked = selectedResIds.includes(res.id || res.orderNumber);
                        return (
                          <tr key={idx} className="hover:bg-blue-50/30 transition-colors whitespace-nowrap">
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedResIds(prev => 
                                    prev.includes(res.id || res.orderNumber) 
                                      ? prev.filter(x => x !== (res.id || res.orderNumber)) 
                                      : [...prev, res.id || res.orderNumber]
                                  );
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-3 text-gray-400 font-mono">{idx + 1}</td>
                            <td className="p-3 font-mono font-bold text-gray-900">{res.orderNumber}</td>
                            <td className="p-3 font-bold text-gray-800">{res.customerName}</td>
                            <td className="p-3 text-right font-mono font-bold text-gray-900">{res.orderedQty}</td>
                            <td className="p-3 text-right font-mono font-black text-amber-700">{res.reservedQty}</td>
                            <td className="p-3 text-right font-mono font-bold text-gray-500">{res.pendingQty || 0}</td>
                            <td className="p-3 text-gray-600">
                              <div className="font-semibold text-gray-900">
                                {res.requiredDate ? new Date(res.requiredDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '25 Sep 2026'}
                              </div>
                              <div className="text-[10px] font-bold text-rose-600 font-sans">
                                {res.daysLeftText || '3 days left'}
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                res.status === 'Partially Reserved' 
                                  ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                  : res.status === 'Reserved'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-purple-50 text-purple-800 border-purple-200'
                              }`}>
                                {res.status}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 cursor-pointer"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredReservations.length === 0 && (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-gray-400">
                            No reservations found matching the filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Info Banner */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-center gap-2.5 text-xs text-blue-900">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Reserved stock is automatically reduced from Available stock. When dispatch is completed, the reservation will be released.
                </span>
              </div>
            </div>
          )}

        </div>

        {/* ── FOOTER ACTIONS BAR ── */}
        <div className="p-4 bg-white border-t border-gray-100 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {activeTab === 'overview' && (
              <button
                type="button"
                onClick={() => {
                  onViewInInventory?.(sku);
                  onClose();
                }}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>View in Inventory</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {activeTab === 'locations' && (
              <button
                type="button"
                onClick={() => onOpenTransfer?.(sku)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>Transfer Stock</span>
              </button>
            )}

            {activeTab === 'batches' && (
              <button
                type="button"
                onClick={() => {
                  onViewInInventory?.(sku);
                  onClose();
                }}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>View in Inventory</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {activeTab === 'movements' && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNewTxMenu(prev => !prev)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ New Transaction</span>
                  <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
                </button>
                {showNewTxMenu && (
                  <div className="absolute right-0 bottom-full mb-1.5 w-48 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 py-1 divide-y divide-gray-100 text-xs font-bold animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewTxMenu(false);
                        onOpenTransfer?.(sku);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 text-gray-800 flex items-center gap-2 cursor-pointer"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600" />
                      <span>Stock Transfer</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewTxMenu(false);
                        onOpenAdjustment?.(sku);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-amber-50 text-gray-800 flex items-center gap-2 cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
                      <span>Stock Adjustment</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'reservations' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  showToast('Navigating to Sales Orders', 'info');
                }}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>View Sales Order</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

      </div>
    </Modal>
  );

  // Helper function to render recursive hierarchy nodes for Tab 2 (Locations)
  function renderHierarchyNode(node: any, depth = 0) {
    const isExpanded = !!expandedNodes[String(node._id)];
    const hasChildren = node.children && node.children.length > 0;
    const isLeafStorage = node.level === 'Storage Location' || (!hasChildren && (node.batches || node.onHand > 0));
    const paddingLeft = depth === 0 ? 'pl-4' : depth === 1 ? 'pl-8' : depth === 2 ? 'pl-12' : 'pl-16';

    const getNodeIcon = () => {
      if (node.level === 'Factory') return <Building2 className="w-4 h-4 text-blue-600 shrink-0" />;
      if (node.level === 'Floor') return <Building2 className="w-4 h-4 text-gray-500 shrink-0" />;
      if (node.level === 'Zone') return <Box className="w-4 h-4 text-amber-500 shrink-0" />;
      return <MapPin className="w-4 h-4 text-blue-600 shrink-0" />;
    };

    return (
      <div key={node._id} className="divide-y divide-gray-50">
        <div className={`grid grid-cols-12 px-4 py-2.5 hover:bg-gray-50/80 items-center transition-colors ${node.level === 'Factory' ? 'bg-blue-50/20 font-bold' : ''}`}>
          {/* Location Hierarchy Name & Toggle */}
          <div className={`col-span-5 sm:col-span-4 flex items-center gap-2 min-w-0 ${paddingLeft}`}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleNodeExpand(String(node._id))}
                className="p-0.5 text-gray-400 hover:text-gray-700 rounded transition-transform cursor-pointer"
              >
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </button>
            ) : (
              <span className="w-3.5 h-3.5 inline-block" />
            )}
            {getNodeIcon()}
            <div className="min-w-0">
              <span className="font-bold text-gray-900 truncate block">{node.name}</span>
              {node.code && (
                <span className="text-[10px] text-gray-400 block truncate">{node.code}</span>
              )}
            </div>
          </div>

          {/* Batch Count */}
          <div className="col-span-2 text-center font-mono font-bold text-gray-700">
            {node.batchCount || 0}
          </div>

          {/* Qty Primary */}
          <div className="col-span-2 text-right font-mono font-bold text-gray-900">
            {Number(node.onHand || 0).toLocaleString('en-IN')}
          </div>

          {/* Qty Alt */}
          <div className="col-span-2 text-right font-mono text-gray-500 hidden sm:block">
            {(Number(node.onHand || 0) * conversionFactor).toLocaleString('en-IN')}
          </div>

          {/* Stock Value */}
          <div className="col-span-3 sm:col-span-2 text-right font-mono font-bold text-gray-900 flex items-center justify-end gap-2">
            <span>{formatCurrency(node.stockValue || 0)}</span>
            <button
              type="button"
              onClick={() => onOpenTransfer?.(sku, node._id)}
              className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-gray-100 cursor-pointer"
              title="Transfer from location"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* If Leaf Storage Location & has batches and expanded, show embedded batch table */}
        {isExpanded && isLeafStorage && node.batches && node.batches.length > 0 && (
          <div className="bg-slate-50/70 p-3 ml-12 sm:ml-16 my-2 rounded-2xl border border-slate-200/80 space-y-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="text-gray-400 font-bold uppercase tracking-wider text-[9px] border-b border-gray-200">
                    <th className="p-1.5 w-6"></th>
                    <th className="p-1.5">BATCH NO.</th>
                    <th className="p-1.5">REFERENCE</th>
                    <th className="p-1.5">DATE</th>
                    <th className="p-1.5 text-right">QUANTITY ({unit})</th>
                    <th className="p-1.5 text-right">QUANTITY ({altUnit})</th>
                    <th className="p-1.5 text-right">RATE (₹/{unit})</th>
                    <th className="p-1.5 text-right">VALUE (₹)</th>
                    <th className="p-1.5 text-center">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {node.batches.map((b: any, bIdx: number) => (
                    <tr key={bIdx} className="hover:bg-white/80">
                      <td className="p-1.5 text-center">
                        <input type="checkbox" className="rounded text-blue-600 cursor-pointer" />
                      </td>
                      <td className="p-1.5 font-mono font-bold text-gray-900">{b.batchNumber}</td>
                      <td className="p-1.5 font-mono text-blue-700 font-bold">{b.reference || 'PR-0098'}</td>
                      <td className="p-1.5 text-gray-500">{b.date ? new Date(b.date).toLocaleDateString('en-IN') : '20 Sep 2026'}</td>
                      <td className="p-1.5 text-right font-mono font-bold text-gray-900">{b.remainingQty}</td>
                      <td className="p-1.5 text-right font-mono text-gray-500">{(b.remainingQty * conversionFactor).toLocaleString('en-IN')}</td>
                      <td className="p-1.5 text-right font-mono text-gray-900">₹{b.rate}</td>
                      <td className="p-1.5 text-right font-mono font-bold text-gray-900">{formatCurrency(b.value)}</td>
                      <td className="p-1.5 text-center">
                        <span className="px-2 py-0.2 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {b.status || 'Active'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={() => onAddBatch?.(sku, node._id)}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer pt-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Batch to this Location</span>
            </button>
          </div>
        )}

        {/* Recursive Children Rendering */}
        {isExpanded && hasChildren && node.children.map((child: any) => renderHierarchyNode(child, depth + 1))}
      </div>
    );
  }
};

export default ItemStockDetailsDrawer;

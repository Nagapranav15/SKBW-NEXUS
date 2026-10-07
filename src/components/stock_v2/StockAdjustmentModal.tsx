import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  SlidersHorizontal, 
  MapPin, 
  Package, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  X, 
  Layers, 
  Search, 
  Check, 
  Building2, 
  Box, 
  Calendar, 
  FileText, 
  Sparkles,
  ArrowRight,
  TrendingUp,
  Scale,
  ChevronDown,
  Tag,
  PlusCircle,
  MinusCircle,
  Info,
  ShieldCheck,
  Hash
} from 'lucide-react';
import Modal from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { 
  SkuV2, 
  WarehouseLocationV2, 
  recordStockAdjustmentV2, 
  getBalancesV2, 
  getSkuStockDetailsV2,
  SkuStockDetailsResponse
} from '../../api/mfgApiV2';
import { convertPrimaryToAlt } from '../../utils/uomConversion';
import { getItemClassification } from '../../utils/skuClassification';

type ItemClassificationFilter = 'ALL' | 'FINISHED' | 'SEMI' | 'RAW';

interface GodownStockInfo {
  locationId: string;
  locationName: string;
  hierarchyPath: string;
  onHand: number;
  stockValue: number;
  batches: Array<{
    batchNumber: string;
    qty: number;
    rate: number;
    date?: string;
  }>;
}

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  skus: SkuV2[];
  locations: WarehouseLocationV2[];
  initialSku?: SkuV2 | null;
  initialLocId?: string;
  onAdjustmentSuccess?: () => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  companyId,
  skus = [],
  locations = [],
  initialSku,
  initialLocId,
  onAdjustmentSuccess
}) => {
  // ── 1. VOUCHER & ITEM SELECTION STATE ──
  const [selectedSkuId, setSelectedSkuId] = useState<string>('');
  const [skuSearchQuery, setSkuSearchQuery] = useState<string>('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemClassificationFilter>('ALL');
  const [isSkuDropdownOpen, setIsSkuDropdownOpen] = useState<boolean>(false);
  const skuDropdownRef = useRef<HTMLDivElement>(null);

  const [voucherNumber, setVoucherNumber] = useState<string>(`ADJ-${Date.now().toString().slice(-6)}`);
  const [voucherDate, setVoucherDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState<string>('');

  // ── 2. ADJUSTMENT DIRECTION & PARAMETERS ──
  const [adjustmentType, setAdjustmentType] = useState<'INCREASE' | 'DECREASE'>('INCREASE');
  const [reason, setReason] = useState<string>('Physical Count Excess');
  const [quantity, setQuantity] = useState<string>('');
  const [rate, setRate] = useState<string>('');
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');

  // ── 3. LIVE STOCK & BATCHES STATE ──
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(false);
  const [stockDetails, setStockDetails] = useState<SkuStockDetailsResponse | null>(null);
  const [balancesList, setBalancesList] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // In-memory cache for fast switching
  const stockCacheRef = useRef<Map<string, { details: SkuStockDetailsResponse; balances: any[] }>>(new Map());

  // Close SKU dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (skuDropdownRef.current && !skuDropdownRef.current.contains(e.target as Node)) {
        setIsSkuDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── INITIALIZE MODAL (BLANK BY DEFAULT UNLESS EXPLICIT INITIAL SKU PASSED) ──
  useEffect(() => {
    if (isOpen) {
      setSelectedSkuId(initialSku?._id || '');
      setVoucherNumber(`ADJ-${Math.floor(10000 + Math.random() * 90000)}`);
      setVoucherDate(new Date().toISOString().split('T')[0]);
      setRemarks('');
      setQuantity('');
      setRate('');
      setBatchNumber('');
      setSelectedLocationId(initialLocId || '');
      setAdjustmentType('INCREASE');
      setReason('Physical Count Excess');
      setItemTypeFilter('ALL');
      setSkuSearchQuery('');
      setIsSkuDropdownOpen(false);
      if (!initialSku) {
        setStockDetails(null);
        setBalancesList([]);
      }
    }
  }, [isOpen, initialSku, initialLocId]);

  // Selected SKU Object
  const selectedSku = useMemo(() => {
    return skus.find(s => String(s._id) === String(selectedSkuId)) || null;
  }, [skus, selectedSkuId]);

  const unit = selectedSku?.unit || 'KG';
  const altUnit = selectedSku?.altUnit || '';

  // Dynamic specification / conversion badge (e.g. 300 Pcs/GBL, 500 Sheets/Ream, GSM Reel)
  const getSkuSpecOrConversion = (sku?: SkuV2 | null): string => {
    if (!sku) return '';

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

    if (sku.unit === 'REEL' || (sku.category || '').toLowerCase().includes('reel')) {
      return `${sku.gsm || ''} GSM Reel`.trim();
    }

    const conversionFactor = Number(sku.altUnitConversion) || 0;
    if (conversionFactor > 0 && sku.altUnit) {
      return `${conversionFactor} ${sku.altUnit}/${sku.unit}`;
    }

    return sku.unit || '';
  };

  // Hierarchy path resolver
  const getHierarchyPath = (locId: string) => {
    if (!locId) return '';
    const loc = locations.find(l => String(l._id) === String(locId));
    if (!loc) return '';
    const parts = [loc.name];
    let curr = loc;
    while (curr && curr.parentId) {
      const parent = locations.find(l => String(l._id) === String(curr.parentId));
      if (!parent) break;
      parts.unshift(parent.name);
      curr = parent;
    }
    return parts.join(' › ');
  };

  // ── LOAD REAL STOCK BALANCES & BATCHES ──
  useEffect(() => {
    if (!selectedSkuId || !companyId) {
      setStockDetails(null);
      setBalancesList([]);
      return;
    }

    const cached = stockCacheRef.current.get(selectedSkuId);
    if (cached) {
      setStockDetails(cached.details);
      setBalancesList(cached.balances);
    } else {
      setIsLoadingStock(true);
    }

    Promise.all([
      getSkuStockDetailsV2(selectedSkuId, companyId).catch(() => null),
      getBalancesV2(companyId, undefined, false, selectedSkuId).catch(() => [])
    ])
      .then(([details, balances]) => {
        if (details) {
          setStockDetails(details);
        }
        if (Array.isArray(balances)) {
          setBalancesList(balances);
        }
        if (details) {
          stockCacheRef.current.set(selectedSkuId, {
            details: details,
            balances: Array.isArray(balances) ? balances : []
          });
        }
      })
      .finally(() => {
        setIsLoadingStock(false);
      });
  }, [selectedSkuId, companyId]);

  // Set default rate based on SKU valuation when item changes
  useEffect(() => {
    if (selectedSku) {
      const defaultRate = Number(selectedSku.price) || Number(selectedSku.purchaseRate) || Number(selectedSku.costPrice) || 0;
      if (defaultRate > 0) {
        setRate(String(defaultRate));
      }
    }
  }, [selectedSku]);

  // ── AGGREGATE GODOWNS STOCK FOR SELECTED ITEM ──
  const godownsStockList: GodownStockInfo[] = useMemo(() => {
    if (!selectedSku) return [];

    const map = new Map<string, GodownStockInfo>();

    // 1. From live ledger balances
    balancesList.forEach(b => {
      const locId = String(b.locationId || b.location?._id || b.location);
      if (!locId) return;
      const onHand = Number(b.quantity || b.onHand || 0);
      const stockVal = Number(b.value || b.stockValue || 0);
      const locDoc = locations.find(l => String(l._id) === locId);
      const locName = locDoc ? locDoc.name : (b.locationName || b.location?.name || 'Godown');

      if (!map.has(locId)) {
        map.set(locId, {
          locationId: locId,
          locationName: locName,
          hierarchyPath: getHierarchyPath(locId) || locName,
          onHand: onHand,
          stockValue: stockVal,
          batches: []
        });
      } else {
        const item = map.get(locId)!;
        item.onHand += onHand;
        item.stockValue += stockVal;
      }
    });

    // 2. From detailed batch response
    if (stockDetails && Array.isArray(stockDetails.batches)) {
      stockDetails.batches.forEach(b => {
        const locId = String(b.locationId || b.location?._id || b.location);
        if (!locId) return;
        const bQty = Number(b.quantity || b.onHand || b.qty || 0);
        const bRate = Number(b.rate || b.unitCost || 0);
        const locDoc = locations.find(l => String(l._id) === locId);
        const locName = locDoc ? locDoc.name : 'Godown';

        if (!map.has(locId)) {
          map.set(locId, {
            locationId: locId,
            locationName: locName,
            hierarchyPath: getHierarchyPath(locId) || locName,
            onHand: bQty,
            stockValue: bQty * bRate,
            batches: [{
              batchNumber: b.batchNumber || 'UNKNOWN',
              qty: bQty,
              rate: bRate,
              date: b.date || b.createdAt
            }]
          });
        } else {
          const item = map.get(locId)!;
          const existingBatch = item.batches.find(x => x.batchNumber === b.batchNumber);
          if (!existingBatch) {
            item.batches.push({
              batchNumber: b.batchNumber || 'UNKNOWN',
              qty: bQty,
              rate: bRate,
              date: b.date || b.createdAt
            });
          }
        }
      });
    }

    // For INCREASE mode, include storage locations so user can add stock to any valid godown
    if (adjustmentType === 'INCREASE') {
      const leafLocations = locations.filter(l => 
        l.level === 'Storage Location' || 
        l.level === 'Zone' || 
        !locations.some(c => String(c.parentId) === String(l._id))
      );
      leafLocations.forEach(loc => {
        const id = String(loc._id);
        if (!map.has(id)) {
          map.set(id, {
            locationId: id,
            locationName: loc.name,
            hierarchyPath: getHierarchyPath(id) || loc.name,
            onHand: 0,
            stockValue: 0,
            batches: []
          });
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => b.onHand - a.onHand);
  }, [selectedSku, balancesList, stockDetails, locations, adjustmentType]);

  // Active selected godown info
  const activeGodown = useMemo(() => {
    return godownsStockList.find(g => g.locationId === selectedLocationId) || null;
  }, [godownsStockList, selectedLocationId]);

  const currentAvailableQty = activeGodown ? activeGodown.onHand : 0;

  // Available batches at selected godown
  const availableBatches = useMemo(() => {
    if (!activeGodown) return [];
    return activeGodown.batches;
  }, [activeGodown]);

  // ── FILTERED SKUS FOR FAST DROPDOWN ──
  const { filteredSkus, counts } = useMemo(() => {
    let allCount = 0;
    let finishedCount = 0;
    let semiCount = 0;
    let rawCount = 0;

    skus.forEach(s => {
      allCount++;
      const cls = getItemClassification(s);
      if (cls === 'products') finishedCount++;
      else if (cls === 'semi') semiCount++;
      else rawCount++;
    });

    const q = skuSearchQuery.trim().toLowerCase();
    const result = skus.filter(s => {
      const cls = getItemClassification(s);
      if (itemTypeFilter === 'FINISHED' && cls !== 'products') return false;
      if (itemTypeFilter === 'SEMI' && cls !== 'semi') return false;
      if (itemTypeFilter === 'RAW' && cls !== 'materials') return false;

      if (!q) return true;
      const codeMatch = (s.skuCode || '').toLowerCase().includes(q);
      const nameMatch = (s.name || '').toLowerCase().includes(q);
      const brandMatch = (s.brand || '').toLowerCase().includes(q);
      return codeMatch || nameMatch || brandMatch;
    });

    return {
      filteredSkus: result,
      counts: {
        ALL: allCount,
        FINISHED: finishedCount,
        SEMI: semiCount,
        RAW: rawCount
      }
    };
  }, [skus, skuSearchQuery, itemTypeFilter]);

  // Windowed list to prevent any dropdown freezing
  const displayedSkus = useMemo(() => {
    return filteredSkus.slice(0, 80);
  }, [filteredSkus]);

  // Quantities & Calculations
  const adjQtyNumber = parseFloat(quantity) || 0;
  const adjRateNumber = parseFloat(rate) || 0;
  const totalAdjustmentValue = adjQtyNumber * adjRateNumber;

  const newBalance = adjustmentType === 'INCREASE'
    ? currentAvailableQty + adjQtyNumber
    : Math.max(0, currentAvailableQty - adjQtyNumber);

  // Conversion display helpers
  const conversionFactor = Number(selectedSku?.altUnitConversion) || 0;
  const formatAltQty = (qty: number) => {
    if (!altUnit || conversionFactor <= 0) return null;
    return `${(qty * conversionFactor).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${altUnit}`;
  };

  const isInvalidDecrease = adjustmentType === 'DECREASE' && adjQtyNumber > currentAvailableQty;
  const canSubmit = selectedSku && selectedLocationId && adjQtyNumber > 0 && !isInvalidDecrease && !isSubmitting;

  // Handle batch selection
  const handleSelectBatch = (b: { batchNumber: string; qty: number; rate: number }) => {
    setBatchNumber(b.batchNumber);
    if (b.rate > 0) {
      setRate(String(b.rate));
    }
    if (adjustmentType === 'DECREASE') {
      setQuantity(String(Math.min(adjQtyNumber || b.qty, b.qty)));
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSku || !selectedLocationId || adjQtyNumber <= 0) {
      showToast('Please specify an item, godown, and valid adjustment quantity', 'error');
      return;
    }
    if (isInvalidDecrease) {
      showToast(`Cannot deduct ${adjQtyNumber} ${unit}. Available balance is ${currentAvailableQty} ${unit}.`, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const deltaQty = adjustmentType === 'INCREASE' ? adjQtyNumber : -adjQtyNumber;

      await recordStockAdjustmentV2({
        company: companyId,
        skuId: selectedSku._id,
        locationId: selectedLocationId,
        adjustmentType: adjustmentType === 'INCREASE' ? 'Inward / Addition' : 'Outward / Deduction',
        adjustmentQty: deltaQty,
        reason: reason,
        remarks: remarks || `Physical count adjustment ref #${voucherNumber}`,
        referenceNumber: voucherNumber,
        batchNumber: batchNumber.trim() || undefined,
        rate: adjRateNumber
      });

      showToast(`Stock adjusted successfully! New balance: ${newBalance.toLocaleString('en-IN')} ${unit}`, 'success');
      onAdjustmentSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Adjustment post error:', err);
      showToast(err?.response?.data?.msg || err?.message || 'Failed to record stock adjustment', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="max-w-6xl"
      padding="p-0"
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-[90vh] bg-slate-50 text-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        
        {/* ── 1. VOUCHER HEADER ── */}
        <div className="px-5 py-3.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm ${
              adjustmentType === 'INCREASE' ? 'bg-emerald-600 shadow-emerald-200' : 'bg-rose-600 shadow-rose-200'
            }`}>
              <SlidersHorizontal className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                  Stock Adjustment
                </h2>
                <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                  {voucherNumber}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  adjustmentType === 'INCREASE' 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                  {adjustmentType === 'INCREASE' ? '+ INWARD ADDITION' : '- OUTWARD DEDUCTION'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Physical count reconciliation, discrepancy correction, and inventory revaluation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Voucher Date */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={voucherDate}
                onChange={e => setVoucherDate(e.target.value)}
                className="bg-transparent text-slate-700 font-mono text-xs focus:outline-none cursor-pointer"
              />
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── 2. ITEM SELECTOR & CLASSIFICATION BAR ── */}
        <div className="px-5 py-3 bg-white border-b border-slate-200 shrink-0">
          <div className="relative" ref={skuDropdownRef}>
            
            {/* Display / Search Input */}
            <div className="flex items-center gap-2">
              <div 
                onClick={() => setIsSkuDropdownOpen(!isSkuDropdownOpen)}
                className={`flex-1 p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  isSkuDropdownOpen 
                    ? 'border-blue-500 ring-2 ring-blue-100 bg-white' 
                    : selectedSku 
                      ? 'border-blue-300 bg-blue-50/40 hover:border-blue-400' 
                      : 'border-slate-300 bg-slate-50/70 hover:border-slate-400'
                }`}
              >
                {selectedSku ? (
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-2xs">
                      <Box className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs truncate">{selectedSku.name}</span>
                        <span className="font-mono text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded shrink-0">
                          {selectedSku.skuCode}
                        </span>
                        {selectedSku.brand && (
                          <span className="text-[10px] font-semibold text-slate-500 shrink-0">
                            • {selectedSku.brand}
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-slate-500 font-medium flex items-center gap-2">
                        <span>{getSkuSpecOrConversion(selectedSku)}</span>
                        <span>•</span>
                        <span className="font-bold text-slate-700">Primary Unit: {unit}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-slate-400 text-xs">
                    <Search className="w-4 h-4 text-slate-400" />
                    <span className="font-medium">Search & Select Item / Material to Adjust...</span>
                  </div>
                )}

                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {selectedSku && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSkuId('');
                        setSelectedLocationId('');
                        setQuantity('');
                        setBatchNumber('');
                      }}
                      className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                      title="Clear Selection"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isSkuDropdownOpen ? 'rotate-180 text-blue-600' : ''}`} />
                </div>
              </div>

              {/* Adjustment Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setAdjustmentType('INCREASE');
                    setReason('Physical Count Excess');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    adjustmentType === 'INCREASE'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Inward (+)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdjustmentType('DECREASE');
                    setReason('Physical Count Shortage');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    adjustmentType === 'DECREASE'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <MinusCircle className="w-3.5 h-3.5" />
                  <span>Outward (-)</span>
                </button>
              </div>
            </div>

            {/* ── DROPDOWN POPUP WITH CATEGORY TABS ── */}
            {isSkuDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[420px]">
                
                {/* Search & Category Filter Header */}
                <div className="p-2.5 border-b border-slate-100 bg-slate-50 space-y-2">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Type SKU name, code, or brand..."
                      value={skuSearchQuery}
                      onChange={e => setSkuSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* 3 Classification Tabs: All, Finishes, Semi, Raw */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setItemTypeFilter('ALL')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                        itemTypeFilter === 'ALL'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                      }`}
                    >
                      <span>All</span>
                      <span className={`text-[9px] px-1 rounded ${itemTypeFilter === 'ALL' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {counts.ALL}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setItemTypeFilter('FINISHED')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                        itemTypeFilter === 'FINISHED'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                      }`}
                    >
                      <span>Finishes</span>
                      <span className={`text-[9px] px-1 rounded ${itemTypeFilter === 'FINISHED' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {counts.FINISHED}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setItemTypeFilter('SEMI')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                        itemTypeFilter === 'SEMI'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                      }`}
                    >
                      <span>Semi</span>
                      <span className={`text-[9px] px-1 rounded ${itemTypeFilter === 'SEMI' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {counts.SEMI}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setItemTypeFilter('RAW')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                        itemTypeFilter === 'RAW'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                      }`}
                    >
                      <span>Raw</span>
                      <span className={`text-[9px] px-1 rounded ${itemTypeFilter === 'RAW' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {counts.RAW}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Items List */}
                <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
                  {displayedSkus.map(s => {
                    const isSelected = String(s._id) === String(selectedSkuId);
                    const specStr = getSkuSpecOrConversion(s);
                    return (
                      <div
                        key={s._id}
                        onClick={() => {
                          setSelectedSkuId(s._id);
                          setIsSkuDropdownOpen(false);
                          setSelectedLocationId('');
                          setQuantity('');
                          setBatchNumber('');
                        }}
                        className={`p-2.5 cursor-pointer transition-colors flex items-center justify-between text-xs ${
                          isSelected ? 'bg-blue-50/80 font-bold' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 truncate">{s.name}</span>
                            <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                              ACTIVE
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5 truncate mt-0.5">
                            <span className="font-mono text-slate-700">{s.skuCode}</span>
                            {s.brand && <span>• {s.brand}</span>}
                            {specStr && <span>• {specStr}</span>}
                            <span>• {s.unit}</span>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 stroke-[2.5]" />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {displayedSkus.length === 0 && (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      No matching items found.
                    </div>
                  )}
                </div>

                {/* Dropdown Footer Status */}
                <div className="p-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 text-right font-medium">
                  Showing {displayedSkus.length} of {filteredSkus.length} items
                </div>

              </div>
            )}

          </div>
        </div>

        {/* ── 3. DUAL-PANE BODY ── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 overflow-hidden min-h-0">
          
          {/* ══════════════════════════════════════════════════════════
              LEFT PANE: GODOWN STOCK LAYERS & BATCHES
             ══════════════════════════════════════════════════════════ */}
          <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-3xs min-h-0">
            {/* Header */}
            <div className="px-3.5 py-2.5 bg-gradient-to-r from-blue-50 to-slate-50 border-b border-blue-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center text-[10px] font-black">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-blue-950 uppercase tracking-wider">
                    Godown & Stock Layers
                  </h3>
                  <p className="text-[10px] text-slate-500">Select godown location to adjust balances</p>
                </div>
              </div>

              {activeGodown && (
                <div className="flex items-center gap-1.5 bg-blue-100/70 border border-blue-200 px-2.5 py-0.5 rounded-md text-xs font-bold text-blue-900 font-mono">
                  <span>Current:</span>
                  <span>{currentAvailableQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}</span>
                </div>
              )}
            </div>

            {/* Blank State if No Item Selected */}
            {!selectedSku ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-100 shadow-3xs">
                  <Box className="w-6 h-6 stroke-[1.8]" />
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-700">Select an Item to Adjust</p>
                <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                  Choose an item from the top selector to inspect godown balances, batches, and record physical reconciliation.
                </p>
              </div>
            ) : (
              <>
                {/* Godowns List */}
                <div className="p-3 border-b border-slate-100 bg-slate-50/60 shrink-0 space-y-2">
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    Select Godown:
                  </label>

                  {godownsStockList.length > 0 ? (
                    <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {godownsStockList.map(g => {
                        const isSelected = g.locationId === selectedLocationId;
                        return (
                          <div
                            key={g.locationId}
                            onClick={() => setSelectedLocationId(g.locationId)}
                            className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-between text-xs ${
                              isSelected 
                                ? 'bg-blue-50 border-blue-400 text-blue-950 ring-1 ring-blue-400 font-bold' 
                                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <Building2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                              <div className="truncate">
                                <div className="truncate">{g.locationName}</div>
                                <div className="text-[10px] text-slate-500 truncate font-normal">{g.hierarchyPath}</div>
                              </div>
                            </div>

                            <div className="text-right shrink-0 ml-2 font-mono">
                              <div className="font-bold text-blue-900">{g.onHand.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}</div>
                              <div className="text-[10px] text-slate-500 font-normal">₹{g.stockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>No godowns found for this item.</span>
                    </div>
                  )}
                </div>

                {/* Available Batches at this Godown */}
                <div className="flex-1 flex flex-col p-3 overflow-hidden min-h-0">
                  <div className="flex items-center justify-between mb-1.5 shrink-0">
                    <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-blue-600" />
                      <span>Existing Batches & Lots at Godown</span>
                    </span>
                  </div>

                  {isLoadingStock ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-xs gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                      <span>Loading batch breakdown...</span>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg bg-white min-h-0">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 font-mono text-[10px] uppercase tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="py-1.5 px-2">Batch / Lot #</th>
                            <th className="py-1.5 px-2 text-right">Balance</th>
                            <th className="py-1.5 px-2 text-right">Rate</th>
                            <th className="py-1.5 px-2 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {availableBatches.map((b, idx) => (
                            <tr key={b.batchNumber + idx} className="hover:bg-slate-50">
                              <td className="py-1.5 px-2 font-mono font-bold text-slate-900">
                                {b.batchNumber}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                                {b.qty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono text-slate-600">
                                ₹{b.rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-1.5 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleSelectBatch(b)}
                                  className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition-colors cursor-pointer"
                                >
                                  Select
                                </button>
                              </td>
                            </tr>
                          ))}
                          {availableBatches.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-xs text-slate-400">
                                {selectedLocationId 
                                  ? 'No lot-specific batches recorded at this godown.' 
                                  : 'Select a godown to view batches.'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════
              RIGHT PANE: ADJUSTMENT REASON, QUANTITY & IMPACT PREVIEW
             ══════════════════════════════════════════════════════════ */}
          <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-3xs min-h-0">
            {/* Header */}
            <div className={`px-3.5 py-2.5 border-b flex items-center justify-between shrink-0 ${
              adjustmentType === 'INCREASE' 
                ? 'bg-gradient-to-r from-emerald-50 to-slate-50 border-emerald-200' 
                : 'bg-gradient-to-r from-rose-50 to-slate-50 border-rose-200'
            }`}>
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded text-white flex items-center justify-center text-[10px] font-black ${
                  adjustmentType === 'INCREASE' ? 'bg-emerald-600' : 'bg-rose-600'
                }`}>
                  {adjustmentType === 'INCREASE' ? '+' : '-'}
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    {adjustmentType === 'INCREASE' ? 'Inward Addition Details' : 'Outward Deduction Details'}
                  </h3>
                  <p className="text-[10px] text-slate-500">Specify reason, batch, and adjusted quantities</p>
                </div>
              </div>

              {activeGodown && (
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Godown</span>
                  <span className="text-xs font-bold text-slate-800">{activeGodown.locationName}</span>
                </div>
              )}
            </div>

            {/* Form Fields & Live Impact Preview */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
              
              {/* Reason Selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Adjustment Reason *
                </label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                  required
                >
                  {adjustmentType === 'INCREASE' ? (
                    <>
                      <option value="Physical Count Excess">Physical Count Excess (Surplus found)</option>
                      <option value="Found/Excess">Found / Unrecorded Inventory</option>
                      <option value="Opening Stock Correction">Opening Stock Correction</option>
                      <option value="Return to Inventory">Return to Inventory</option>
                      <option value="Conversion Variance">Conversion Variance (+)</option>
                    </>
                  ) : (
                    <>
                      <option value="Physical Count Shortage">Physical Count Shortage (Deficit verified)</option>
                      <option value="Damage">Damage / Quality Rejection</option>
                      <option value="Lost/Missing">Lost / Missing / Pilferage</option>
                      <option value="Sampling">Sampling / QC Lab Testing</option>
                      <option value="Scrap/Expiry">Scrap / Expiry Write-Off</option>
                      <option value="Data Correction">Data Entry Correction</option>
                    </>
                  )}
                </select>
              </div>

              {/* Batch Number & Rate Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Batch / Lot Number
                  </label>
                  <input
                    type="text"
                    value={batchNumber}
                    onChange={e => setBatchNumber(e.target.value)}
                    placeholder={adjustmentType === 'INCREASE' ? 'e.g. ADJ-LOT-01' : 'Pick from left or enter lot'}
                    className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Valuation Rate (₹/{unit})
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={rate}
                      onChange={e => setRate(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-6 pr-3 py-2 text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Adjustment Quantity Input with Unit */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    Adjustment Quantity ({unit}) *
                  </label>
                  {adjustmentType === 'DECREASE' && currentAvailableQty > 0 && (
                    <button
                      type="button"
                      onClick={() => setQuantity(String(currentAvailableQty))}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                    >
                      Deduct Entire Balance (MAX)
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    placeholder="Enter quantity to adjust..."
                    className={`flex-1 px-3 py-2.5 text-sm font-mono font-black rounded-lg border focus:outline-none focus:ring-1 ${
                      isInvalidDecrease
                        ? 'border-rose-400 bg-rose-50/50 text-rose-900 focus:ring-rose-500'
                        : 'border-slate-300 bg-white text-slate-900 focus:ring-blue-500 focus:border-blue-500'
                    }`}
                    required
                  />
                  <span className="px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700 shrink-0">
                    {unit}
                  </span>
                </div>

                {/* Alt Unit Real-Time Display */}
                {formatAltQty(adjQtyNumber) && (
                  <p className="text-[11px] font-mono font-semibold text-slate-500 mt-1">
                    ≈ {formatAltQty(adjQtyNumber)}
                  </p>
                )}

                {isInvalidDecrease && (
                  <p className="text-[11px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Cannot deduct more than available balance ({currentAvailableQty} {unit}).
                  </p>
                )}
              </div>

              {/* ── BEFORE & AFTER IMPACT CARD ── */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                  Ledger Impact Summary
                </span>

                <div className="grid grid-cols-3 gap-2 text-center">
                  {/* Previous Balance */}
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-[9.5px] font-bold text-slate-400 uppercase block">Current</span>
                    <span className="font-mono text-xs font-bold text-slate-700">
                      {currentAvailableQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}
                    </span>
                  </div>

                  {/* Delta Adjustment */}
                  <div className={`p-2 rounded-lg border ${
                    adjustmentType === 'INCREASE' 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    <span className="text-[9.5px] font-bold uppercase block">Adjustment</span>
                    <span className="font-mono text-xs font-bold">
                      {adjustmentType === 'INCREASE' ? '+' : '-'}{adjQtyNumber.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}
                    </span>
                  </div>

                  {/* New Balance */}
                  <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
                    <span className="text-[9.5px] font-bold uppercase block">New Stock</span>
                    <span className="font-mono text-xs font-black">
                      {newBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}
                    </span>
                  </div>
                </div>

                {/* Secondary Unit Sub-Note */}
                {formatAltQty(newBalance) && (
                  <div className="text-[10.5px] text-center text-slate-500 font-mono">
                    New Secondary Unit Balance: <strong className="text-slate-800">{formatAltQty(newBalance)}</strong>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* ── 4. BOTTOM VOUCHER SUMMARY & ACTIONS BAR ── */}
        <div className="p-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg">
          {/* Remarks Input */}
          <div className="flex-1 min-w-[280px] max-w-xl flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider shrink-0">
              Remarks:
            </span>
            <input
              type="text"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Enter adjustment justification, physical verification note, or audit reference..."
              className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Metrics & Submit Buttons */}
          <div className="flex items-center gap-3">
            {/* Summary metrics pill */}
            <div className="bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-slate-500 font-medium">Adjustment:</span>
                <span className={`font-mono font-bold ${
                  adjustmentType === 'INCREASE' ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {adjustmentType === 'INCREASE' ? '+' : '-'}{adjQtyNumber.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}
                </span>
                {formatAltQty(adjQtyNumber) && (
                  <span className="text-[11px] font-semibold text-slate-600">({formatAltQty(adjQtyNumber)})</span>
                )}
              </div>

              <div className="w-px h-4 bg-slate-300" />

              <div className="flex items-center gap-1">
                <span className="text-slate-500 font-medium">Value:</span>
                <span className="font-mono font-bold text-slate-900">
                  ₹{totalAdjustmentValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Cancel Button */}
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-all cursor-pointer"
            >
              Cancel
            </button>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!canSubmit}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer ${
                canSubmit
                  ? adjustmentType === 'INCREASE'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 active:scale-95'
                    : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200 active:scale-95'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Posting Adjustment...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Post Stock Adjustment</span>
                </>
              )}
            </button>
          </div>
        </div>

      </form>
    </Modal>
  );
};

export default StockAdjustmentModal;

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowRightLeft, 
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
  Tag
} from 'lucide-react';
import Modal from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { 
  SkuV2, 
  WarehouseLocationV2, 
  recordTransferV2, 
  getBalancesV2, 
  getSkuStockDetailsV2,
  SkuStockDetailsResponse
} from '../../api/mfgApiV2';
import { LocationSelectPopup } from './LocationSelectPopup';
import { convertPrimaryToAlt } from '../../utils/uomConversion';
import { getItemClassification } from '../../utils/skuClassification';

type ItemClassificationFilter = 'ALL' | 'FINISHED' | 'SEMI' | 'RAW';

interface TransferBatchRow {
  batchNumber: string;
  reference: string;
  date: string;
  availableQty: number;
  transferQty: number;
  rate: number;
  selected: boolean;
}

interface StockTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  skus: SkuV2[];
  locations: WarehouseLocationV2[];
  initialSku?: SkuV2 | null;
  initialFromLocId?: string;
  onTransferSuccess?: () => void;
}

export const StockTransferModal: React.FC<StockTransferModalProps> = ({
  isOpen,
  onClose,
  companyId,
  skus = [],
  locations = [],
  initialSku,
  initialFromLocId,
  onTransferSuccess
}) => {
  // ── 1. VOUCHER & ITEM STATE ──
  const [selectedSkuId, setSelectedSkuId] = useState<string>('');
  const [skuSearchQuery, setSkuSearchQuery] = useState<string>('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemClassificationFilter>('ALL');
  const [isSkuDropdownOpen, setIsSkuDropdownOpen] = useState<boolean>(false);
  const skuDropdownRef = useRef<HTMLDivElement>(null);

  const [voucherNumber, setVoucherNumber] = useState<string>(`TRF-${Date.now().toString().slice(-6)}`);
  const [voucherDate, setVoucherDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState<string>('');

  // ── 2. LIVE STOCK & LOCATION STATE ──
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(false);
  const [stockDetails, setStockDetails] = useState<SkuStockDetailsResponse | null>(null);
  const [balancesList, setBalancesList] = useState<any[]>([]);

  const [sourceLocationId, setSourceLocationId] = useState<string>('');
  const [destWarehouseId, setDestWarehouseId] = useState<string>('');
  const [destFloorId, setDestFloorId] = useState<string>('');
  const [destZoneId, setDestZoneId] = useState<string>('');
  const [destLocationId, setDestLocationId] = useState<string>('');

  // ── 3. BATCH & REEL ALLOCATION STATE ──
  const [batchRows, setBatchRows] = useState<TransferBatchRow[]>([]);
  const [selectedReelIds, setSelectedReelIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

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
      setVoucherNumber(`TRF-${Math.floor(10000 + Math.random() * 90000)}`);
      setVoucherDate(new Date().toISOString().split('T')[0]);
      setRemarks('');
      setSourceLocationId(initialFromLocId || '');
      setDestLocationId('');
      setDestWarehouseId('');
      setDestFloorId('');
      setDestZoneId('');
      setSelectedReelIds(new Set());
      setItemTypeFilter('ALL');
      setSkuSearchQuery('');
      setIsSkuDropdownOpen(false);
      if (!initialSku) {
        setStockDetails(null);
        setBalancesList([]);
        setBatchRows([]);
      }
    }
  }, [isOpen, initialSku, initialFromLocId]);

  // Selected SKU Object
  const selectedSku = useMemo(() => {
    return skus.find(s => String(s._id) === String(selectedSkuId)) || null;
  }, [skus, selectedSkuId]);

  const unit = selectedSku?.unit || 'KG';
  const altUnit = selectedSku?.altUnit || '';

  // Dynamic specification / conversion badge (e.g. 300 Pcs/GBL, 500 Sheets/Ream, GSM Reel)
  const getSkuSpecOrConversion = (sku?: SkuV2 | null): string => {
    if (!sku) return '';

    // 1. Sheets / Ream items
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

    // 3. Books per GBL / Pcs per GBL
    const booksPerGbl = (sku as any).booksGbl ?? (sku as any).pcsPerGbl;
    if (Number(booksPerGbl) > 0) {
      return `${booksPerGbl} Pcs/GBL`;
    }

    // 4. Alt Unit Conversion explicitly defined
    if (sku.altUnit && sku.altUnitConversion && Number(sku.altUnitConversion) > 0 && !isSheetItem) {
      const pUnit = sku.unit || 'Pcs';
      const aUnit = sku.altUnit || 'GBL';
      return `${sku.altUnitConversion} ${pUnit}/${aUnit}`;
    }

    // 5. GSM
    if (sku.gsm && Number(sku.gsm) > 0) {
      return `${sku.gsm} GSM`;
    }

    if (sku.unit) {
      return sku.unit;
    }

    return '';
  };

  // High performance in-memory stock cache for instant switching
  const stockCacheRef = useRef<Map<string, { details: SkuStockDetailsResponse; balances: any[] }>>(new Map());

  // ── FETCH LIVE STOCK DETAILS FROM SERVER ──
  const fetchLiveStock = async (skuId: string, forceRefresh = false) => {
    if (!companyId || !skuId) return;

    // Instant load from cache if available and not explicitly forcing refresh
    if (!forceRefresh && stockCacheRef.current.has(skuId)) {
      const cached = stockCacheRef.current.get(skuId)!;
      setStockDetails(cached.details);
      setBalancesList(cached.balances);
      return;
    }

    setIsLoadingStock(true);
    try {
      const [details, bals] = await Promise.all([
        getSkuStockDetailsV2(skuId, companyId).catch(() => null),
        getBalancesV2(companyId, undefined, true, skuId).catch(() => [])
      ]);
      if (details) {
        stockCacheRef.current.set(skuId, { details, balances: Array.isArray(bals) ? bals : [] });
      }
      setStockDetails(details);
      setBalancesList(Array.isArray(bals) ? bals : []);
    } catch (err) {
      console.error('Failed to load live stock data:', err);
      setStockDetails(null);
      setBalancesList([]);
    } finally {
      setIsLoadingStock(false);
    }
  };

  useEffect(() => {
    if (isOpen && selectedSkuId) {
      fetchLiveStock(selectedSkuId);
    }
  }, [isOpen, selectedSkuId, companyId]);

  // Map of location ID -> location object from metadata
  const locationMetaMap = useMemo(() => {
    const map = new Map<string, WarehouseLocationV2>();
    locations.forEach(loc => {
      if (loc && loc._id) map.set(String(loc._id), loc);
    });
    return map;
  }, [locations]);

  // Helper to build hierarchy breadcrumb for any location
  const getHierarchyBreadcrumb = (locId: string): string => {
    if (!locId) return 'Not selected';
    const chain: string[] = [];
    let curr = locationMetaMap.get(String(locId));
    let depth = 0;
    while (curr && depth < 6) {
      chain.unshift(curr.name);
      if (curr.parentId) {
        curr = locationMetaMap.get(String(curr.parentId));
      } else {
        break;
      }
      depth++;
    }
    return chain.length > 0 ? chain.join(' → ') : 'General Storage';
  };

  // ── LIVE LOCATIONS WITH ACTUAL STOCK FOR THIS SKU ──
  const godownsWithStock = useMemo(() => {
    if (!stockDetails?.locations) return [];
    return stockDetails.locations
      .filter(l => (Number(l.onHand) || Number(l.available) || 0) > 0.0001)
      .map(l => {
        const meta = locationMetaMap.get(String(l.locationId));
        return {
          locationId: String(l.locationId),
          locationName: l.locationName || meta?.name || 'Main Godown',
          hierarchyPath: l.hierarchyPath || getHierarchyBreadcrumb(String(l.locationId)),
          onHand: Number(l.onHand) || 0,
          available: Number(l.available) || Number(l.onHand) || 0,
          unitCost: Number(l.unitCost) || 0,
          stockValue: Number(l.stockValue) || 0
        };
      });
  }, [stockDetails, locationMetaMap]);

  // Auto-pick source godown when stock details load and item is selected
  useEffect(() => {
    if (godownsWithStock.length > 0 && selectedSkuId) {
      if (initialFromLocId && godownsWithStock.some(g => g.locationId === String(initialFromLocId))) {
        setSourceLocationId(String(initialFromLocId));
      } else if (!sourceLocationId || !godownsWithStock.some(g => g.locationId === sourceLocationId)) {
        setSourceLocationId(godownsWithStock[0].locationId);
      }
    } else if (!selectedSkuId) {
      setSourceLocationId('');
    }
  }, [godownsWithStock, initialFromLocId, selectedSkuId]);

  // Current active Source Godown details
  const activeSourceGodown = useMemo(() => {
    return godownsWithStock.find(g => g.locationId === sourceLocationId) || null;
  }, [godownsWithStock, sourceLocationId]);

  const sourceAvailableQty = activeSourceGodown?.onHand || 0;

  // Real batches present at the selected source godown
  useEffect(() => {
    if (!sourceLocationId || !stockDetails) {
      setBatchRows([]);
      return;
    }

    const locBatches = (stockDetails.batches || []).filter(
      b => String(b.locationId) === String(sourceLocationId) && (Number(b.remainingQty) || 0) > 0.0001
    );

    if (locBatches.length > 0) {
      setBatchRows(locBatches.map((b, idx) => {
        const avQty = Number(b.remainingQty) || 0;
        const initialTrf = idx === 0 ? Math.min(avQty, 1) : 0;
        return {
          batchNumber: b.batchNumber,
          reference: b.reference || '-',
          date: b.date ? new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
          availableQty: avQty,
          transferQty: initialTrf,
          rate: Number(b.rate) || Number(selectedSku?.avgCost || selectedSku?.costPrice || 0),
          selected: idx === 0
        };
      }));
    } else if (sourceAvailableQty > 0.0001) {
      // Direct opening stock / unbatched inventory at this location
      setBatchRows([{
        batchNumber: 'General Lot / Primary Stock',
        reference: 'In-Stock Balance',
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        availableQty: sourceAvailableQty,
        transferQty: Math.min(sourceAvailableQty, 1),
        rate: activeSourceGodown?.unitCost || Number(selectedSku?.avgCost || selectedSku?.costPrice || 0),
        selected: true
      }]);
    } else {
      setBatchRows([]);
    }
  }, [sourceLocationId, stockDetails, sourceAvailableQty, activeSourceGodown, selectedSku]);

  // Available Reels at the selected source godown (for reel-based paper/materials)
  const availableSourceReels = useMemo(() => {
    if (!stockDetails?.reels || !sourceLocationId) return [];
    return stockDetails.reels.filter(
      r => String(r.locationId) === String(sourceLocationId) && r.status === 'Available'
    );
  }, [stockDetails, sourceLocationId]);

  const hasReels = availableSourceReels.length > 0;

  // Handle reel checkbox toggles
  const handleToggleReel = (reelId: string) => {
    setSelectedReelIds(prev => {
      const next = new Set(prev);
      if (next.has(reelId)) next.delete(reelId);
      else next.add(reelId);
      return next;
    });
  };

  const selectedReelsWeight = useMemo(() => {
    return availableSourceReels
      .filter(r => selectedReelIds.has(r.id || r.reelNumber))
      .reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
  }, [availableSourceReels, selectedReelIds]);

  // Handle batch selection & transfer qty change
  const handleBatchQtyChange = (idx: number, qty: number) => {
    setBatchRows(prev => prev.map((row, i) => {
      if (i === idx) {
        const validQty = Math.max(0, Math.min(row.availableQty, qty));
        return { ...row, transferQty: validQty, selected: validQty > 0 };
      }
      return row;
    }));
  };

  const handleMaxBatchQty = (idx: number) => {
    setBatchRows(prev => prev.map((row, i) => {
      if (i === idx) {
        return { ...row, transferQty: row.availableQty, selected: true };
      }
      return row;
    }));
  };

  const handleToggleBatchSelect = (idx: number) => {
    setBatchRows(prev => prev.map((row, i) => {
      if (i === idx) {
        const nextSel = !row.selected;
        return { 
          ...row, 
          selected: nextSel, 
          transferQty: nextSel ? (row.transferQty > 0 ? row.transferQty : Math.min(row.availableQty, 1)) : 0 
        };
      }
      return row;
    }));
  };

  // Auto FIFO Allocation across available batches
  const handleFifoAutoAllocate = () => {
    if (batchRows.length === 0) return;
    // Allocate max possible across batches from first to last
    setBatchRows(prev => prev.map((row, idx) => {
      if (idx === 0) {
        return { ...row, transferQty: row.availableQty, selected: true };
      }
      return { ...row, transferQty: 0, selected: false };
    }));
    showToast('Allocated FIFO from oldest stock layer', 'info');
  };

  // Destination current on-hand stock
  const destCurrentStock = useMemo(() => {
    if (!destLocationId || !stockDetails) return 0;
    const match = stockDetails.locations.find(l => String(l.locationId) === String(destLocationId));
    if (match) return Number(match.onHand) || 0;
    const balMatch = balancesList.find(b => String(b.locationId) === String(destLocationId));
    return Number(balMatch?.quantity || balMatch?.onHand || 0);
  }, [destLocationId, stockDetails, balancesList]);

  // Totals
  const totalTransferQty = hasReels && selectedReelIds.size > 0 
    ? selectedReelsWeight 
    : batchRows.reduce((sum, b) => sum + (b.selected ? b.transferQty : 0), 0);

  const totalTransferValue = batchRows.reduce(
    (sum, b) => sum + (b.selected ? b.transferQty * b.rate : 0), 
    0
  );

  const projectedDestStock = destCurrentStock + totalTransferQty;
  const projectedSourceStock = Math.max(0, sourceAvailableQty - totalTransferQty);

  // Dual unit conversions
  const totalTransferAltUnit = useMemo(() => {
    if (!selectedSku?.altUnit || !totalTransferQty) return null;
    const converted = convertPrimaryToAlt(totalTransferQty, selectedSku);
    return `${converted.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${selectedSku.altUnit}`;
  }, [totalTransferQty, selectedSku]);

  const totalCompanyStock = Number(stockDetails?.summary?.onHand ?? 0);
  const totalCompanyStockAlt = useMemo(() => {
    if (!selectedSku?.altUnit || !totalCompanyStock) return null;
    const converted = convertPrimaryToAlt(totalCompanyStock, selectedSku);
    return `${converted.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${selectedSku.altUnit}`;
  }, [totalCompanyStock, selectedSku]);

  // Validation
  const isSameLocation = sourceLocationId && destLocationId && String(sourceLocationId) === String(destLocationId);
  const isExceedingStock = totalTransferQty > sourceAvailableQty + 0.0001;
  const canSubmit = selectedSkuId && 
                    sourceLocationId && 
                    destLocationId && 
                    !isSameLocation && 
                    totalTransferQty > 0 && 
                    !isExceedingStock && 
                    !isSubmitting;

  // Classification Filter Counts (Finishes, Semi, Raw only - No Excel categories)
  const filterCounts = useMemo(() => {
    let finished = 0;
    let semi = 0;
    let raw = 0;
    skus.forEach(s => {
      const cls = getItemClassification(s);
      if (cls === 'products') finished++;
      else if (cls === 'semi') semi++;
      else if (cls === 'materials') raw++;
    });
    return {
      all: skus.length,
      finished,
      semi,
      raw
    };
  }, [skus]);

  // Fast memoized SKU filtering with Finishes, Semi, Raw classification filters
  const filteredSkus = useMemo(() => {
    const q = skuSearchQuery.trim().toLowerCase();
    return skus.filter(s => {
      const cls = getItemClassification(s);
      if (itemTypeFilter === 'FINISHED' && cls !== 'products') return false;
      if (itemTypeFilter === 'SEMI' && cls !== 'semi') return false;
      if (itemTypeFilter === 'RAW' && cls !== 'materials') return false;
      if (!q) return true;
      return (s.skuCode || '').toLowerCase().includes(q) ||
             (s.name || '').toLowerCase().includes(q) ||
             (s.brand || '').toLowerCase().includes(q);
    });
  }, [skus, skuSearchQuery, itemTypeFilter]);

  // Limit rendering in viewport to 80 items so typing and filtering is 0ms instantaneous
  const displayedSkus = useMemo(() => filteredSkus.slice(0, 80), [filteredSkus]);

  // ── SUBMIT HANDLER ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      if (isSameLocation) {
        showToast('Source and destination godowns cannot be identical', 'error');
      } else if (isExceedingStock) {
        showToast(`Cannot transfer ${totalTransferQty} ${unit}. Available: ${sourceAvailableQty} ${unit}`, 'error');
      } else {
        showToast('Please select valid godowns and enter transfer quantity', 'error');
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedBatches = batchRows.filter(b => b.selected && b.transferQty > 0);
      
      const batchesPayload = selectedBatches.map(b => ({
        batchNumber: b.batchNumber === 'General Lot / Primary Stock' ? 'UNKNOWN' : b.batchNumber,
        quantity: b.transferQty,
        rate: b.rate,
        reels: hasReels 
          ? availableSourceReels.filter(r => selectedReelIds.has(r.id || r.reelNumber)) 
          : []
      }));

      await recordTransferV2({
        skuId: selectedSkuId,
        fromLocationId: sourceLocationId,
        toLocationId: destLocationId,
        quantity: totalTransferQty,
        batchNumber: selectedBatches.length === 1 && selectedBatches[0].batchNumber !== 'General Lot / Primary Stock' 
          ? selectedBatches[0].batchNumber 
          : undefined,
        batches: batchesPayload.length > 0 ? batchesPayload : undefined,
        reels: hasReels ? availableSourceReels.filter(r => selectedReelIds.has(r.id || r.reelNumber)) : undefined,
        remarks: remarks || `Stock transfer voucher ${voucherNumber}`,
        company: companyId
      });

      showToast(`Transferred ${totalTransferQty.toLocaleString('en-IN')} ${unit} successfully!`, 'success');
      onTransferSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Stock transfer failed:', err);
      showToast(err?.response?.data?.msg || err?.message || 'Failed to complete stock transfer', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="max-w-[96vw] xl:max-w-7xl"
      padding="p-0"
      hideCloseButton={true}
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-[90vh] max-h-[920px] bg-slate-50 font-sans select-none overflow-hidden rounded-2xl shadow-2xl">
        
        {/* ── 1. VOUCHER TOP HEADER ── */}
        <div className="px-4 py-2.5 bg-white border-b border-blue-200 flex items-center justify-between shrink-0 shadow-3xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-3xs">
              <ArrowRightLeft className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs sm:text-sm tracking-wider text-blue-900 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200">
                  {voucherNumber}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-900 font-bold border border-blue-200 uppercase tracking-wider">
                  Stock Transfer Voucher
                </span>
                <span className="hidden sm:inline-block text-[11px] text-slate-500 font-medium">
                  Inter-Godown Transfer Journal
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-600 font-bold uppercase text-[11px]">Date:</span>
              <input 
                type="date" 
                value={voucherDate} 
                onChange={e => setVoucherDate(e.target.value)}
                className="bg-transparent text-slate-900 font-mono text-xs focus:outline-none cursor-pointer font-bold"
              />
            </div>

            <button
              type="button"
              onClick={() => selectedSkuId && fetchLiveStock(selectedSkuId)}
              disabled={isLoadingStock}
              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer border border-slate-200"
              title="Refresh live stock balances"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStock ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── 2. SKU / ITEM MASTER SELECTOR BAR ── */}
        <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 min-w-[280px] max-w-xl" ref={skuDropdownRef}>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Select Item / Material to Transfer:
            </label>
            <div 
              onClick={() => setIsSkuDropdownOpen(!isSkuDropdownOpen)}
              className="px-3.5 py-2 bg-slate-50 hover:bg-white border border-slate-300 hover:border-blue-500 rounded-xl cursor-pointer flex items-center justify-between gap-2 transition-all shadow-3xs"
            >
              {selectedSku ? (
                <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                  <span className="font-mono text-xs font-bold text-blue-900 bg-blue-100/80 px-2 py-0.5 rounded border border-blue-200 shrink-0">
                    {selectedSku.skuCode}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {selectedSku.name}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-full uppercase shrink-0">
                    {selectedSku.category || 'General'}
                  </span>
                  {getSkuSpecOrConversion(selectedSku) && (
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 shrink-0 hidden sm:inline-block">
                      {getSkuSpecOrConversion(selectedSku)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-400 text-xs sm:text-sm">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Search &amp; Select Item / Material to Transfer...</span>
                </div>
              )}
              <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${isSkuDropdownOpen ? 'rotate-180' : ''}`} />
            </div>

            {/* Dropdown Menu Popover with Finishes, Raw, Semi Filter Chips & Card List */}
            {isSkuDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-full min-w-[340px] sm:min-w-[560px] md:min-w-[620px] bg-white border border-slate-200 rounded-2xl shadow-2xl z-[999] overflow-hidden flex flex-col max-h-[420px] animate-in fade-in zoom-in-95">
                
                {/* Popover Header: Canonical Category Filters (Finishes, Semi, Raw) & Fast Search */}
                <div className="sticky top-0 bg-white/95 backdrop-blur-xs p-2.5 border-b border-slate-100 z-10 space-y-2 shadow-3xs">
                  {/* Category Title & Count */}
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Tag className="w-3 h-3 text-blue-600" />
                      <span className="uppercase tracking-wider">Item Classification:</span>
                    </span>
                    <span className="font-mono text-slate-400">
                      Showing {displayedSkus.length} of {filteredSkus.length} items
                    </span>
                  </div>

                  {/* 4 Clean Filter Pills: All, Finishes, Semi, Raw */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                    <button
                      type="button"
                      onClick={() => setItemTypeFilter('ALL')}
                      className={`px-3 py-1 rounded-full text-[10.5px] font-bold shrink-0 transition-all cursor-pointer ${
                        itemTypeFilter === 'ALL'
                          ? 'bg-blue-600 text-white shadow-3xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      All ({filterCounts.all})
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemTypeFilter('FINISHED')}
                      className={`px-3 py-1 rounded-full text-[10.5px] font-bold shrink-0 transition-all cursor-pointer ${
                        itemTypeFilter === 'FINISHED'
                          ? 'bg-blue-600 text-white shadow-3xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Finishes ({filterCounts.finished})
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemTypeFilter('SEMI')}
                      className={`px-3 py-1 rounded-full text-[10.5px] font-bold shrink-0 transition-all cursor-pointer ${
                        itemTypeFilter === 'SEMI'
                          ? 'bg-blue-600 text-white shadow-3xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Semi ({filterCounts.semi})
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemTypeFilter('RAW')}
                      className={`px-3 py-1 rounded-full text-[10.5px] font-bold shrink-0 transition-all cursor-pointer ${
                        itemTypeFilter === 'RAW'
                          ? 'bg-blue-600 text-white shadow-3xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Raw ({filterCounts.raw})
                    </button>
                  </div>

                  {/* Fast Instant Search Bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={skuSearchQuery}
                      onChange={e => setSkuSearchQuery(e.target.value)}
                      placeholder="Type SKU code, item name, or brand..."
                      className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                      autoFocus
                    />
                    {skuSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setSkuSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Items Card List Matching Design */}
                <div className="overflow-y-auto max-h-[300px] p-2 space-y-1.5">
                  {displayedSkus.map(s => {
                    const isSelected = s._id === selectedSkuId;
                    const specBadge = getSkuSpecOrConversion(s);
                    return (
                      <div
                        key={s._id}
                        onClick={() => {
                          setSelectedSkuId(s._id);
                          setIsSkuDropdownOpen(false);
                        }}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                          isSelected
                            ? 'bg-blue-100/70 border-blue-200 text-blue-950 font-bold shadow-3xs'
                            : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80 text-slate-800'
                        }`}
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          {/* Top Row: Item Name */}
                          <div className="font-bold text-slate-900 text-xs sm:text-[13px] leading-snug break-words">
                            {s.name}
                          </div>

                          {/* Bottom Row: SKU Code • Category/Brand • Spec/Conversion (e.g. 300 Pcs/GBL) */}
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] font-medium flex-wrap">
                            <span className="font-mono text-slate-400 font-semibold">{s.skuCode}</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-500 font-semibold uppercase">
                              {s.brand || s.category || 'General'}
                            </span>
                            {specBadge && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="font-bold text-blue-600 font-mono">{specBadge}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Right: Active Status Badge */}
                        <div className="shrink-0 flex items-center">
                          <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full border bg-emerald-50 text-emerald-600 border-emerald-200">
                            {s.status || 'Active'}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {filteredSkus.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-400 italic">
                      No items found matching &ldquo;{skuSearchQuery}&rdquo; in {itemTypeFilter !== 'ALL' ? itemTypeFilter.toLowerCase() : 'all categories'}.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Live SKU Summary Stats */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 flex flex-col text-right">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Company Stock</span>
              <div className="flex items-baseline gap-1 font-mono font-bold text-xs sm:text-sm text-slate-900">
                {selectedSku ? (
                  <>
                    <span>{totalCompanyStock.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    <span className="text-xs text-slate-600">{unit}</span>
                    {totalCompanyStockAlt && (
                      <span className="text-[11px] text-blue-700 font-semibold ml-1">({totalCompanyStockAlt})</span>
                    )}
                  </>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </div>
            </div>

            <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 flex flex-col text-right">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Godowns with Stock</span>
              <span className="font-mono font-bold text-xs sm:text-sm text-blue-800">
                {selectedSku ? `${godownsWithStock.length} Godown${godownsWithStock.length === 1 ? '' : 's'}` : '-'}
              </span>
            </div>

            <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 flex flex-col text-right">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Valuation Rate</span>
              <span className="font-mono font-bold text-xs sm:text-sm text-slate-900">
                {selectedSku ? (
                  `₹${Number(selectedSku.avgCost || selectedSku.costPrice || selectedSku.standardCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ${unit}`
                ) : (
                  '-'
                )}
              </span>
            </div>
          </div>
        </div>

        {/* ── 3. DUAL-PANE STOCK JOURNAL VOUCHER LAYOUT ── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 overflow-hidden min-h-0">
          
          {/* ══════════════════════════════════════════════════════════
              LEFT PANE: SOURCE GODOWN (TRANSFER OUT / DISPATCH)
             ══════════════════════════════════════════════════════════ */}
          <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-3xs min-h-0">
            {/* Header */}
            <div className="px-3.5 py-2.5 bg-gradient-to-r from-blue-50 to-slate-50 border-b border-blue-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center text-[10px] font-black">
                  OUT
                </div>
                <div>
                  <h3 className="text-xs font-black text-blue-950 uppercase tracking-wider">
                    Source Godown (Transfer Out / Dispatch)
                  </h3>
                  <p className="text-[10px] text-slate-500">Pick where stock will be deducted from</p>
                </div>
              </div>

              {activeSourceGodown && (
                <div className="flex items-center gap-1.5 bg-blue-100/70 border border-blue-200 px-2.5 py-0.5 rounded-md text-xs font-bold text-blue-900 font-mono">
                  <span>Avail:</span>
                  <span>{sourceAvailableQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}</span>
                </div>
              )}
            </div>

            {/* Source Godown Selection Area or Blank State */}
            {!selectedSku ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-100 shadow-3xs">
                  <Box className="w-6 h-6 stroke-[1.8]" />
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-700">Select an Item to Transfer</p>
                <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                  Choose an item from the top selector to view godowns and available stock layers.
                </p>
              </div>
            ) : (
              <>
                <div className="p-3 border-b border-slate-100 bg-slate-50/60 shrink-0 space-y-2">
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    Select Source Godown with In-Stock Balances:
                  </label>

                  {godownsWithStock.length > 0 ? (
                    <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {godownsWithStock.map(g => {
                        const isSelected = g.locationId === sourceLocationId;
                        return (
                          <div
                            key={g.locationId}
                            onClick={() => setSourceLocationId(g.locationId)}
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
                      <span>No godown currently holds stock for this item. Please select an item that has on-hand balance.</span>
                    </div>
                  )}
                </div>

            {/* Source Batches / Reels Breakdown Table */}
            <div className="flex-1 flex flex-col p-3 overflow-hidden min-h-0">
              <div className="flex items-center justify-between mb-1.5 shrink-0">
                <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-blue-600" />
                  <span>Available Batches & Stock Layers</span>
                </span>

                <button
                  type="button"
                  onClick={handleFifoAutoAllocate}
                  className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-blue-600" />
                  <span>FIFO Allocate</span>
                </button>
              </div>

              {/* Reels Mode if SKU has reels */}
              {hasReels ? (
                <div className="flex-1 border border-slate-200 rounded-lg overflow-y-auto">
                  <div className="bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200 flex items-center justify-between">
                    <span>Individual Reels at Source Godown ({availableSourceReels.length} available)</span>
                    <span className="font-mono text-blue-700 font-bold">Selected: {selectedReelsWeight} {unit}</span>
                  </div>
                  <div className="divide-y divide-slate-100 text-xs">
                    {availableSourceReels.map(r => {
                      const isSel = selectedReelIds.has(r.id || r.reelNumber);
                      return (
                        <div 
                          key={r.id || r.reelNumber}
                          onClick={() => handleToggleReel(r.id || r.reelNumber)}
                          className={`p-2 flex items-center justify-between cursor-pointer transition-colors ${
                            isSel ? 'bg-blue-50 font-semibold text-blue-950' : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={isSel} 
                              onChange={() => {}} 
                              className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="font-mono font-bold">{r.reelNumber}</span>
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                              Batch: {r.batchNumber}
                            </span>
                          </div>
                          <div className="font-mono font-bold text-blue-900">
                            {r.weight} {unit}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Regular Batches Table */
                <div className="flex-1 border border-slate-200 rounded-lg overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 font-mono text-[10px] uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-1.5 px-2 w-8 text-center">Sel</th>
                        <th className="py-1.5 px-2">Batch / Lot #</th>
                        <th className="py-1.5 px-2 text-right">In-Stock</th>
                        <th className="py-1.5 px-2 w-28 text-right">Transfer Qty</th>
                        <th className="py-1.5 px-2 text-right">Rate</th>
                        <th className="py-1.5 px-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {batchRows.map((row, idx) => {
                        const lineAmount = row.transferQty * row.rate;
                        return (
                          <tr 
                            key={row.batchNumber + idx} 
                            className={`transition-colors ${row.selected ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                          >
                            <td className="py-1.5 px-2 text-center">
                              <input
                                type="checkbox"
                                checked={row.selected}
                                onChange={() => handleToggleBatchSelect(idx)}
                                className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <div className="font-mono font-bold text-slate-900 truncate max-w-[130px]" title={row.batchNumber}>
                                {row.batchNumber}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Ref: {row.reference}
                              </div>
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                              {row.availableQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-1 px-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={row.availableQty}
                                  step="any"
                                  value={row.transferQty === 0 && !row.selected ? '' : row.transferQty}
                                  onChange={e => handleBatchQtyChange(idx, parseFloat(e.target.value) || 0)}
                                  placeholder="0"
                                  className="w-16 px-1.5 py-1 text-right font-mono text-xs font-bold bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-600"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleMaxBatchQty(idx)}
                                  className="px-1 py-0.5 text-[9px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded transition-colors cursor-pointer"
                                  title="Allocate entire batch"
                                >
                                  MAX
                                </button>
                              </div>
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono text-slate-600">
                              ₹{row.rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900">
                              ₹{lineAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                      {batchRows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-xs text-slate-400">
                            No batches available at this source location.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Source Outward Subtotal */}
              <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
                <span className="text-slate-500 font-medium">Source Deductions:</span>
                <div className="flex items-center gap-3 font-mono font-bold">
                  <span className="text-blue-900">
                    Total: {totalTransferQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}
                  </span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-800">
                    Value: ₹{totalTransferValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
              </>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════
              RIGHT PANE: DESTINATION GODOWN (TRANSFER IN / RECEIPT)
             ══════════════════════════════════════════════════════════ */}
          <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-3xs min-h-0">
            {/* Header */}
            <div className="px-3.5 py-2.5 bg-gradient-to-r from-emerald-50 to-slate-50 border-b border-emerald-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">
                  IN
                </div>
                <div>
                  <h3 className="text-xs font-black text-emerald-950 uppercase tracking-wider">
                    Destination Godown (Transfer In / Receipt)
                  </h3>
                  <p className="text-[10px] text-slate-500">Pick destination where stock will be received</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 bg-emerald-100/70 border border-emerald-200 px-2.5 py-0.5 rounded-md text-xs font-bold text-emerald-900 font-mono">
                <span>Inward:</span>
                <span>+{totalTransferQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}</span>
              </div>
            </div>

            {/* Destination Godown Selection Area */}
            <div className="p-3 border-b border-slate-100 bg-slate-50/60 shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                  Select Destination Location:
                </label>
                <LocationSelectPopup
                  label=""
                  locations={locations}
                  locationId={destLocationId}
                  warehouseId={destWarehouseId}
                  floorId={destFloorId}
                  zoneId={destZoneId}
                  onChange={(wh, fl, zn, loc) => {
                    setDestWarehouseId(wh);
                    setDestFloorId(fl);
                    setDestZoneId(zn);
                    setDestLocationId(loc);
                  }}
                  companyId={companyId}
                  skuId={selectedSkuId}
                  unit={unit}
                  variant="compact"
                  hideLabel={true}
                />
              </div>

              {/* Hierarchy Breadcrumb Display Card */}
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 overflow-hidden">
                  <MapPin className={`w-4 h-4 shrink-0 ${destLocationId ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <div className="truncate">
                    <span className={`font-bold block truncate ${destLocationId ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                      {destLocationId ? (locationMetaMap.get(destLocationId)?.name || 'Destination Godown') : 'Select destination godown...'}
                    </span>
                    {destLocationId ? (
                      <span className="text-[10px] text-slate-500 font-mono truncate block">
                        {getHierarchyBreadcrumb(destLocationId)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-mono truncate block">
                        Click picker above to choose destination
                      </span>
                    )}
                  </div>
                </div>

                {isSameLocation && (
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 shrink-0">
                    Cannot be identical to source!
                  </span>
                )}
              </div>
            </div>

            {/* Stock Impact Analysis Card */}
            <div className="p-3 border-b border-slate-100 bg-emerald-50/30 shrink-0">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-2">
                Destination Stock Impact Analysis:
              </span>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Current Stock</span>
                  <span className="font-mono font-bold text-xs sm:text-sm text-slate-800">
                    {destLocationId ? `${destCurrentStock.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${unit}` : '-'}
                  </span>
                </div>

                <div className="bg-emerald-50/80 p-2 rounded-lg border border-emerald-300">
                  <span className="text-[10px] text-emerald-700 block uppercase font-bold">Transfer Inward</span>
                  <span className="font-mono font-bold text-xs sm:text-sm text-emerald-800">
                    {totalTransferQty > 0 ? `+${totalTransferQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${unit}` : '0'}
                  </span>
                </div>

                <div className="bg-white p-2 rounded-lg border border-blue-200">
                  <span className="text-[10px] text-blue-700 block uppercase font-bold">Projected Stock</span>
                  <span className="font-mono font-bold text-xs sm:text-sm text-blue-900">
                    {destLocationId ? `${projectedDestStock.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${unit}` : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Inward Batches Preview Table */}
            <div className="flex-1 flex flex-col p-3 overflow-hidden min-h-0">
              <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5 shrink-0">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                <span>Inward Receipt Lot Breakdown</span>
              </span>

              <div className="flex-1 border border-slate-200 rounded-lg overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 font-mono text-[10px] uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-1.5 px-2">Batch / Lot #</th>
                      <th className="py-1.5 px-2 text-right">Inward Qty</th>
                      <th className="py-1.5 px-2 text-right">Rate</th>
                      <th className="py-1.5 px-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {batchRows.filter(b => b.selected && b.transferQty > 0).map((b, idx) => (
                      <tr key={b.batchNumber + idx} className="hover:bg-slate-50">
                        <td className="py-1.5 px-2 font-mono font-bold text-slate-900">
                          {b.batchNumber}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-700">
                          +{b.transferQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-600">
                          ₹{b.rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900">
                          ₹{(b.transferQty * b.rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    {batchRows.filter(b => b.selected && b.transferQty > 0).length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-xs text-slate-400">
                          No items allocated yet. Select batches from the left pane.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Destination Inward Subtotal */}
              <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
                <span className="text-slate-500 font-medium">Destination Addition:</span>
                <div className="flex items-center gap-3 font-mono font-bold">
                  <span className="text-emerald-800">
                    Total: +{totalTransferQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}
                  </span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-800">
                    Value: ₹{totalTransferValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 4. BOTTOM VOUCHER SUMMARY & ACTIONS BAR ── */}
        <div className="p-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg">
          {/* Narration Input */}
          <div className="flex-1 min-w-[280px] max-w-xl flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider shrink-0">
              Remarks:
            </span>
            <input
              type="text"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Enter transfer purpose, requisition reference, or narration..."
              className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Metrics & Submit Buttons */}
          <div className="flex items-center gap-3">
            {/* Summary metrics pill */}
            <div className="bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-slate-500 font-medium">Transfer Qty:</span>
                <span className="font-mono font-bold text-blue-900">
                  {totalTransferQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}
                </span>
                {totalTransferAltUnit && (
                  <span className="text-[11px] font-semibold text-slate-600">({totalTransferAltUnit})</span>
                )}
              </div>

              <div className="w-px h-4 bg-slate-300" />

              <div className="flex items-center gap-1">
                <span className="text-slate-500 font-medium">Value:</span>
                <span className="font-mono font-bold text-slate-900">
                  ₹{totalTransferValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 active:scale-95'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Posting Transfer...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Post Stock Transfer</span>
                </>
              )}
            </button>
          </div>
        </div>

      </form>
    </Modal>
  );
};

export default StockTransferModal;

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, Scissors, Printer, CheckCircle2, AlertTriangle, 
  ArrowRight, Layers, Box, Scale, RefreshCw, FileText,
  Activity, RotateCcw, Calculator, Search, Tag, ChevronDown, Check, Package, Sparkles
} from 'lucide-react';
import Modal from '../ui/Modal';
import { 
  SkuV2, WarehouseLocationV2, AvailableReelV2, 
  getNextCuttingSlipNumberV2, getAvailableReelsV2, createCuttingSlipV2, CuttingSlipV2
} from '../../api/mfgApiV2';
import { getItemClassification } from '../../utils/skuClassification';
import { LocationSelectPopup } from '../stock_v2/LocationSelectPopup';

interface CuttingSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  skus: SkuV2[];
  locations: WarehouseLocationV2[];
  initialBatch?: string;
  initialSkuId?: string;
  onSaved?: (slip: CuttingSlipV2) => void;
}

export const CuttingSlipModal: React.FC<CuttingSlipModalProps> = ({
  isOpen,
  onClose,
  companyId,
  skus,
  locations,
  initialBatch,
  initialSkuId,
  onSaved
}) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [slipNumber, setSlipNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [machineName, setMachineName] = useState('Sheeter 01');
  const [operatorName, setOperatorName] = useState('');
  const [notes, setNotes] = useState('');

  // ── 1. AVAILABLE REELS & SEARCHABLE REEL ITEM DROPDOWN (NO DEFAULT VALUE) ──
  const [availableReels, setAvailableReels] = useState<AvailableReelV2[]>([]);
  const [selectedReelItemKey, setSelectedReelItemKey] = useState<string>(initialSkuId || '');
  const [reelItemSearch, setReelItemSearch] = useState<string>('');
  const [reelCategoryFilter, setReelCategoryFilter] = useState<string>('ALL');
  const [showReelDropdown, setShowReelDropdown] = useState<boolean>(false);
  const reelDropdownRef = useRef<HTMLDivElement>(null);

  const [selectedBatch, setSelectedBatch] = useState<string>(initialBatch || 'ALL');
  const [selectedReelIds, setSelectedReelIds] = useState<Set<string>>(new Set());

  // ── 2. TARGET SHEETS SPEC & RICH SEARCHABLE SEMI-GOOD DROPDOWN (NO DEFAULT VALUE) ──
  const [targetSkuId, setTargetSkuId] = useState<string>('');
  const [targetSkuSearch, setTargetSkuSearch] = useState<string>('');
  const [targetCategoryFilter, setTargetCategoryFilter] = useState<string>('ALL');
  const [showTargetDropdown, setShowTargetDropdown] = useState<boolean>(false);
  const targetDropdownRef = useRef<HTMLDivElement>(null);

  const [destinationLocationId, setDestinationLocationId] = useState<string>('');
  const [destWarehouseId, setDestWarehouseId] = useState<string>('');
  const [destFloorId, setDestFloorId] = useState<string>('');
  const [destZoneId, setDestZoneId] = useState<string>('');
  const [destLocationDisplay, setDestLocationDisplay] = useState<string>('');
  const [sheetWidth, setSheetWidth] = useState<string>('57');
  const [sheetLength, setSheetLength] = useState<string>('70');
  const [sheetGsm, setSheetGsm] = useState<string>('52');
  const [sheetsPerReamInput, setSheetsPerReamInput] = useState<string>('500');

  // ── 3. MACHINE CUTTING METER (DIRECT KNIFE CUTS ONLY - FREELY EDITABLE) ──
  const [cutsCountInput, setCutsCountInput] = useState<string>('');
  const [reelsOnStandInput, setReelsOnStandInput] = useState<string>('1');
  const [slitsCountInput, setSlitsCountInput] = useState<string>('1');

  // Derived numeric properties
  const sheetsPerReam = parseFloat(sheetsPerReamInput) || 500;
  const reelsOnStand = Math.max(1, parseFloat(reelsOnStandInput) || 1);
  const slitsCount = Math.max(1, parseFloat(slitsCountInput) || 1);

  // Simultaneous Dual Units (Sheets <-> Reams)
  const [actualSheetsInput, setActualSheetsInput] = useState<string>('');
  const [actualReamsInput, setActualReamsInput] = useState<string>('');

  // Print Mode State
  const [isPrintMode, setIsPrintMode] = useState(false);

  // Helper for clean currency/rate display (avoids long float precision artifacts)
  const formatRate = (rate: number | string | undefined | null) => {
    const n = Number(rate);
    if (isNaN(n) || n === 0) return '0.00';
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (targetDropdownRef.current && !targetDropdownRef.current.contains(e.target as Node)) {
        setShowTargetDropdown(false);
      }
      if (reelDropdownRef.current && !reelDropdownRef.current.contains(e.target as Node)) {
        setShowReelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── SEMI-FINISHED GOODS FILTERED LIST (STRICTLY SEMI GOODS) ──
  const semiGoodSkus = useMemo(() => {
    const strictlySemi = skus.filter(s => {
      if (!s || s.isDeleted) return false;
      const type = getItemClassification(s);
      const rawType = ((s as any).itemType || '').toLowerCase();
      const code = (s.skuCode || '').toUpperCase();
      const cat = (s.category || '').toLowerCase();
      return type === 'semi' || 
             rawType.includes('semi') || 
             code.startsWith('SM-') || 
             code.startsWith('SFG-') || 
             cat.includes('semi');
    });

    if (strictlySemi.length > 0) return strictlySemi;

    // Fallback if no strict semi goods exist
    return skus.filter(s => {
      if (!s || s.isDeleted) return false;
      const cat = (s.category || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return s.paperType === 'Sheets' || cat.includes('sheet') || name.includes('sheet');
    });
  }, [skus]);

  // Semi-goods category breakdown for filter chips
  const semiCategoryBreakdown = useMemo(() => {
    const catMap = new Map<string, number>();
    semiGoodSkus.forEach(s => {
      const cat = s.category?.trim() || 'General';
      catMap.set(cat, (catMap.get(cat) || 0) + 1);
    });
    return {
      total: semiGoodSkus.length,
      categories: Array.from(catMap.entries()).sort((a, b) => b[1] - a[1])
    };
  }, [semiGoodSkus]);

  // Filtered target SKUs matching search & category
  const filteredTargetSkus = useMemo(() => {
    return semiGoodSkus.filter(s => {
      if (targetCategoryFilter !== 'ALL') {
        const cat = s.category?.trim() || 'General';
        if (cat.toLowerCase() !== targetCategoryFilter.toLowerCase()) return false;
      }
      if (!targetSkuSearch.trim()) return true;
      const q = targetSkuSearch.toLowerCase().trim();
      const name = (s.name || '').toLowerCase();
      const code = (s.skuCode || '').toLowerCase();
      const cat = (s.category || '').toLowerCase();
      const dims = `${s.width || ''}x${s.length || ''} ${s.gsm || ''}`.toLowerCase();
      return name.includes(q) || code.includes(q) || cat.includes(q) || dims.includes(q);
    });
  }, [semiGoodSkus, targetCategoryFilter, targetSkuSearch]);

  const selectedTargetSkuDoc = useMemo(() => {
    return skus.find(s => s._id === targetSkuId) || null;
  }, [skus, targetSkuId]);

  // Spec badge helper
  const getSkuSpecOrConversion = (sku: SkuV2) => {
    const parts: string[] = [];
    if (sku.width && sku.length) parts.push(`${sku.width} x ${sku.length} cm`);
    if (sku.gsm) parts.push(`${sku.gsm} GSM`);
    if (sku.altUnitConversion) parts.push(`1 Ream = ${sku.altUnitConversion} Sheets`);
    return parts.join(' • ');
  };

  // 1. Load initial data
  useEffect(() => {
    if (!isOpen || !companyId) return;

    let isMounted = true;
    const fetchInit = async () => {
      setLoading(true);
      try {
        const [numRes, reelsRes] = await Promise.all([
          getNextCuttingSlipNumberV2(companyId),
          getAvailableReelsV2(companyId)
        ]);

        if (!isMounted) return;
        setSlipNumber(numRes.slipNumber);
        const loadedReels = reelsRes.availableReels || [];
        setAvailableReels(loadedReels);

        // Default destination location
        if (locations.length > 0 && !destinationLocationId) {
          const cutLoc = locations.find(l => 
            (l.name || '').toLowerCase().includes('cut') || 
            (l.name || '').toLowerCase().includes('sheet') ||
            (l.name || '').toLowerCase().includes('gnd')
          ) || locations[0];
          if (cutLoc?._id) {
            setDestinationLocationId(cutLoc._id);
            setDestLocationDisplay(cutLoc.name || '');
            if (cutLoc.level === 'Storage Location') {
              const z = cutLoc.parentId ? locations.find(l => l._id === cutLoc.parentId) : undefined;
              const f = z?.parentId ? locations.find(l => l._id === z.parentId) : undefined;
              const w = f?.parentId ? locations.find(l => l._id === f.parentId) : undefined;
              if (z?._id) setDestZoneId(z._id);
              if (f?._id) setDestFloorId(f._id);
              if (w?._id) setDestWarehouseId(w._id);
            } else if (cutLoc.level === 'Zone') {
              setDestZoneId(cutLoc._id);
              const f = cutLoc.parentId ? locations.find(l => l._id === cutLoc.parentId) : undefined;
              const w = f?.parentId ? locations.find(l => l._id === f.parentId) : undefined;
              if (f?._id) setDestFloorId(f._id);
              if (w?._id) setDestWarehouseId(w._id);
            } else if (cutLoc.level === 'Floor') {
              setDestFloorId(cutLoc._id);
              const w = cutLoc.parentId ? locations.find(l => l._id === cutLoc.parentId) : undefined;
              if (w?._id) setDestWarehouseId(w._id);
            } else if (cutLoc.level === 'Factory') {
              setDestWarehouseId(cutLoc._id);
            }
          }
        }

        // No default value for target SKU (User selects deliberately)
      } catch (err) {
        console.error('Failed to init cutting slip voucher:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInit();
    return () => { isMounted = false; };
  }, [isOpen, companyId, semiGoodSkus.length]);

  // Target SKU select handler
  const handleSelectTargetSku = (sku: SkuV2) => {
    setTargetSkuId(sku._id || '');
    if (sku.width) setSheetWidth(String(sku.width));
    if (sku.length) setSheetLength(String(sku.length));
    if (sku.gsm) setSheetGsm(String(sku.gsm));
    const rawReam = (sku as any).sheetsPerReam ?? (sku as any).standardSheets ?? sku.pages;
    const validReam = (rawReam && Number(rawReam) > 0 && Number(rawReam) <= 1000) ? Number(rawReam) : 500;
    setSheetsPerReamInput(String(validReam));
    setTargetSkuSearch('');
    setShowTargetDropdown(false);
  };

  // ── PAPER REEL RAW MATERIALS LIST (STRICTLY PAPER REELS) ──
  const paperReelSkus = useMemo(() => {
    return skus.filter(s => {
      if (!s || s.isDeleted) return false;
      const type = getItemClassification(s);
      const rawType = ((s as any).itemType || '').toLowerCase();
      const code = (s.skuCode || '').toUpperCase();
      const cat = (s.category || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      const paperType = (s.paperType || '').toLowerCase();

      // Check if this SKU exists in availableReels
      const inAvailable = availableReels.some(r => r.skuId === s._id || r.skuCode === s.skuCode);
      if (inAvailable) return true;

      // Reel classification checks
      const isReel = paperType.includes('reel') || 
                     name.includes('reel') || 
                     cat.includes('reel') || 
                     code.includes('REEL');
      
      const isRawOrMaterial = type === 'materials' || rawType.includes('raw') || code.startsWith('RM-');
      return isReel || (isRawOrMaterial && (s.unit || '').toLowerCase() === 'kg');
    });
  }, [skus, availableReels]);

  // Aggregate available stock details for each paper reel SKU
  const reelItemsWithStock = useMemo(() => {
    const stockMap = new Map<string, { reelsCount: number; totalWeight: number; batches: string[] }>();
    availableReels.forEach(r => {
      const key = r.skuId || r.skuCode || r.skuName || '';
      if (!stockMap.has(key)) {
        stockMap.set(key, { reelsCount: 0, totalWeight: 0, batches: [] });
      }
      const st = stockMap.get(key)!;
      st.reelsCount += 1;
      st.totalWeight += Number(r.weight) || 0;
      if (r.purchaseBatch && !st.batches.includes(r.purchaseBatch)) {
        st.batches.push(r.purchaseBatch);
      }
    });

    const itemsList: Array<{
      key: string;
      skuId: string;
      name: string;
      code: string;
      category: string;
      width?: number;
      gsm?: number;
      reelsCount: number;
      totalWeight: number;
      batches: string[];
    }> = [];

    const processedKeys = new Set<string>();

    paperReelSkus.forEach(s => {
      const k = s._id || s.skuCode || '';
      processedKeys.add(k);
      const st = stockMap.get(s._id || '') || stockMap.get(s.skuCode || '') || { reelsCount: 0, totalWeight: 0, batches: [] };
      itemsList.push({
        key: k,
        skuId: s._id || '',
        name: s.name,
        code: s.skuCode || '',
        category: s.category || 'Paper Reels',
        width: s.width,
        gsm: s.gsm,
        reelsCount: st.reelsCount,
        totalWeight: st.totalWeight,
        batches: st.batches
      });
    });

    // Add any reels from availableReels that weren't caught
    availableReels.forEach(r => {
      const k = r.skuId || r.skuCode || '';
      if (k && !processedKeys.has(k)) {
        processedKeys.add(k);
        const st = stockMap.get(k) || { reelsCount: 1, totalWeight: Number(r.weight) || 0, batches: [r.purchaseBatch] };
        itemsList.push({
          key: k,
          skuId: r.skuId,
          name: r.skuName || 'Paper Reel',
          code: r.skuCode || '',
          category: 'Paper Reels',
          width: r.width,
          gsm: r.gsm,
          reelsCount: st.reelsCount,
          totalWeight: st.totalWeight,
          batches: st.batches
        });
      }
    });

    return itemsList.sort((a, b) => b.reelsCount - a.reelsCount);
  }, [paperReelSkus, availableReels]);

  // Reel category breakdown for chips
  const reelCategoryBreakdown = useMemo(() => {
    const catMap = new Map<string, number>();
    reelItemsWithStock.forEach(item => {
      const cat = item.category?.trim() || 'General';
      catMap.set(cat, (catMap.get(cat) || 0) + 1);
    });
    return {
      total: reelItemsWithStock.length,
      categories: Array.from(catMap.entries()).sort((a, b) => b[1] - a[1])
    };
  }, [reelItemsWithStock]);

  // Filtered reel items matching search & category
  const filteredReelItems = useMemo(() => {
    return reelItemsWithStock.filter(item => {
      if (reelCategoryFilter !== 'ALL') {
        const cat = item.category?.trim() || 'General';
        if (cat.toLowerCase() !== reelCategoryFilter.toLowerCase()) return false;
      }
      if (!reelItemSearch.trim()) return true;
      const q = reelItemSearch.toLowerCase().trim();
      const name = (item.name || '').toLowerCase();
      const code = (item.code || '').toLowerCase();
      const cat = (item.category || '').toLowerCase();
      const dims = `${item.width || ''} ${item.gsm || ''}`.toLowerCase();
      return name.includes(q) || code.includes(q) || cat.includes(q) || dims.includes(q);
    });
  }, [reelItemsWithStock, reelCategoryFilter, reelItemSearch]);

  const selectedReelItemDoc = useMemo(() => {
    if (!selectedReelItemKey) return null;
    return reelItemsWithStock.find(i => i.key === selectedReelItemKey || i.skuId === selectedReelItemKey) || null;
  }, [reelItemsWithStock, selectedReelItemKey]);

  // Reel select handler
  const handleSelectReelItem = (itemKey: string) => {
    setSelectedReelItemKey(itemKey);
    setSelectedBatch('ALL');
    setSelectedReelIds(new Set());
    setReelItemSearch('');
    setShowReelDropdown(false);
  };

  // Set selectedReelItemKey ONLY if initialSkuId is explicitly passed in props
  useEffect(() => {
    if (initialSkuId && !selectedReelItemKey) {
      setSelectedReelItemKey(initialSkuId);
    }
  }, [initialSkuId]);

  // Reels for the selected item (empty if no item chosen)
  const reelsForSelectedItem = useMemo(() => {
    if (!selectedReelItemKey) return [];
    return availableReels.filter(r => (r.skuId || r.skuCode || r.skuName) === selectedReelItemKey || r.skuId === selectedReelItemKey);
  }, [availableReels, selectedReelItemKey]);

  // Helper to safely get the actual rate per KG for a reel (with fallback to matched SKU rate or default)
  const getReelRate = (r: { ratePerKg?: number; skuId?: string; skuCode?: string }) => {
    let rRate = Number(r.ratePerKg) || 0;
    if (rRate < 1) {
      const matchedSku = skus.find(s => s._id === r.skuId || s.skuCode === r.skuCode);
      const skuCost = Number(matchedSku?.costPrice || matchedSku?.avgCost || matchedSku?.purchasePrice || (matchedSku as any)?.rate) || 0;
      rRate = skuCost >= 1 ? skuCost : 80;
    }
    return rRate;
  };

  // Batches for the selected item
  const batchesForSelectedItem = useMemo(() => {
    const map = new Map<string, { batch: string; count: number; totalWeight: number; avgRate: number }>();
    reelsForSelectedItem.forEach(r => {
      const b = r.purchaseBatch || 'No Batch';
      const rRate = getReelRate(r);
      if (!map.has(b)) {
        map.set(b, { batch: b, count: 0, totalWeight: 0, avgRate: rRate });
      }
      const entry = map.get(b)!;
      entry.count += 1;
      entry.totalWeight += Number(r.weight) || 0;
      entry.avgRate = rRate || entry.avgRate;
    });
    return Array.from(map.values()).sort((a, b) => a.batch.localeCompare(b.batch));
  }, [reelsForSelectedItem, skus]);

  // Filtered reels to display (based on selectedBatch)
  const displayedReels = useMemo(() => {
    if (selectedBatch === 'ALL') return reelsForSelectedItem;
    return reelsForSelectedItem.filter(r => (r.purchaseBatch || 'No Batch') === selectedBatch);
  }, [reelsForSelectedItem, selectedBatch]);

  // Toggle single reel
  const handleToggleReel = (reelId: string) => {
    setSelectedReelIds(prev => {
      const next = new Set(prev);
      if (next.has(reelId)) next.delete(reelId);
      else next.add(reelId);
      return next;
    });
  };

  // Toggle all reels in current view
  const handleToggleAllDisplayed = () => {
    const allSelected = displayedReels.length > 0 && displayedReels.every(r => selectedReelIds.has(r.id));
    setSelectedReelIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        displayedReels.forEach(r => next.delete(r.id));
      } else {
        displayedReels.forEach(r => next.add(r.id));
      }
      return next;
    });
  };

  // Selected Reels array
  const selectedReels = useMemo(() => {
    return availableReels.filter(r => selectedReelIds.has(r.id));
  }, [availableReels, selectedReelIds]);


  // Source consumption metrics & accurate cost calculation
  const totalInputWeight = useMemo(() => {
    return selectedReels.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
  }, [selectedReels]);

  const totalInputCost = useMemo(() => {
    const sum = selectedReels.reduce((acc, r) => acc + ((Number(r.weight) || 0) * getReelRate(r)), 0);
    return Math.round(sum * 100) / 100;
  }, [selectedReels, skus]);

  const avgInputRatePerKg = useMemo(() => {
    if (totalInputWeight <= 0) return 0;
    return Math.round((totalInputCost / totalInputWeight) * 100) / 100;
  }, [totalInputCost, totalInputWeight]);

  // Primary source SKU
  const sourceSkuDoc = useMemo(() => {
    if (selectedReels.length === 0) {
      if (selectedReelItemKey !== 'ALL') {
        return skus.find(s => s._id === selectedReelItemKey || s.skuCode === selectedReelItemKey || s.name === selectedReelItemKey) || null;
      }
      return null;
    }
    return skus.find(s => s._id === selectedReels[0].skuId || s.skuCode === selectedReels[0].skuCode) || null;
  }, [selectedReels, selectedReelItemKey, skus]);

  // Theoretical Yield Calculation (Standard Paper Formula)
  // Sheets = (Weight in Kg * 10,000,000) / (Length_cm * Width_cm * GSM)
  const theoreticalSheets = useMemo(() => {
    const w = parseFloat(sheetWidth) || 0;
    const l = parseFloat(sheetLength) || 0;
    const gsm = parseFloat(sheetGsm) || 0;
    if (totalInputWeight <= 0 || w <= 0 || l <= 0 || gsm <= 0) return 0;
    const calc = (totalInputWeight * 10000000) / (w * l * gsm);
    return Math.round(calc);
  }, [totalInputWeight, sheetWidth, sheetLength, sheetGsm]);

  const theoreticalReams = useMemo(() => {
    const spr = sheetsPerReam || 500;
    return Math.round((theoreticalSheets / spr) * 100) / 100;
  }, [theoreticalSheets, sheetsPerReam]);

  // Machine Sheeter Output Formulas (Direct Knife Cuts only)
  // Sheets per Cut = Reels on Stand * Slits across Width
  const sheetsPerCut = useMemo(() => {
    return Math.max(1, reelsOnStand) * Math.max(1, slitsCount);
  }, [reelsOnStand, slitsCount]);

  const theoreticalCuts = useMemo(() => {
    if (theoreticalSheets <= 0 || sheetsPerCut <= 0) return 0;
    return Math.ceil(theoreticalSheets / sheetsPerCut);
  }, [theoreticalSheets, sheetsPerCut]);

  const numCutsCount = parseFloat(cutsCountInput) || 0;
  const machineDerivedSheets = useMemo(() => {
    return Math.round(numCutsCount * sheetsPerCut);
  }, [numCutsCount, sheetsPerCut]);

  const machineDerivedReams = useMemo(() => {
    const spr = sheetsPerReam || 500;
    return Math.round((machineDerivedSheets / spr) * 100) / 100;
  }, [machineDerivedSheets, sheetsPerReam]);

  // Synchronize actual sheets and reams when theoretical is computed
  useEffect(() => {
    if (theoreticalSheets > 0 && !actualSheetsInput && !actualReamsInput) {
      if (theoreticalCuts > 0 && !cutsCountInput) {
        setCutsCountInput(String(theoreticalCuts));
      }
      setActualSheetsInput(String(theoreticalSheets));
      const spr = sheetsPerReam || 500;
      setActualReamsInput(String(Math.round((theoreticalSheets / spr) * 100) / 100));
    }
  }, [theoreticalSheets, theoreticalCuts]);

  // Machine Meter Handlers (Direct Cuts)
  const handleCutsChange = (val: string) => {
    setCutsCountInput(val);
    const cuts = parseFloat(val);
    if (!isNaN(cuts) && cuts >= 0) {
      const totalGenSheets = Math.round(cuts * sheetsPerCut);
      setActualSheetsInput(String(totalGenSheets));
      const spr = sheetsPerReam || 500;
      setActualReamsInput(String(Math.round((totalGenSheets / spr) * 100) / 100));
    }
  };

  const handleReelsOnStandChange = (val: string) => {
    setReelsOnStandInput(val);
    const r = parseFloat(val);
    const effectiveR = !isNaN(r) && r > 0 ? r : 1;
    const cuts = parseFloat(cutsCountInput);
    if (!isNaN(cuts) && cuts > 0) {
      const perCut = effectiveR * slitsCount;
      const totalGenSheets = Math.round(cuts * perCut);
      setActualSheetsInput(String(totalGenSheets));
      setActualReamsInput(String(Math.round((totalGenSheets / sheetsPerReam) * 100) / 100));
    }
  };

  const handleSlitsCountChange = (val: string) => {
    setSlitsCountInput(val);
    const s = parseFloat(val);
    const effectiveS = !isNaN(s) && s > 0 ? s : 1;
    const cuts = parseFloat(cutsCountInput);
    if (!isNaN(cuts) && cuts > 0) {
      const perCut = reelsOnStand * effectiveS;
      const totalGenSheets = Math.round(cuts * perCut);
      setActualSheetsInput(String(totalGenSheets));
      setActualReamsInput(String(Math.round((totalGenSheets / sheetsPerReam) * 100) / 100));
    }
  };

  const handleSheetsPerReamChange = (val: string) => {
    setSheetsPerReamInput(val);
    const spr = parseFloat(val);
    if (!isNaN(spr) && spr > 0) {
      const sheets = parseFloat(actualSheetsInput);
      if (!isNaN(sheets) && sheets > 0) {
        setActualReamsInput(String(Math.round((sheets / spr) * 100) / 100));
      }
    }
  };

  // Dual Unit Handlers (Simultaneous Bi-directional Sync)
  const handleSheetsChange = (val: string) => {
    setActualSheetsInput(val);
    const numSheets = parseFloat(val);
    if (!isNaN(numSheets)) {
      const spr = sheetsPerReam || 500;
      setActualReamsInput(String(Math.round((numSheets / spr) * 100) / 100));
      if (sheetsPerCut > 0) {
        setCutsCountInput(String(Math.round(numSheets / sheetsPerCut)));
      }
    } else {
      setActualReamsInput('');
    }
  };

  const handleReamsChange = (val: string) => {
    setActualReamsInput(val);
    const numReams = parseFloat(val);
    if (!isNaN(numReams)) {
      const spr = sheetsPerReam || 500;
      const computedSheets = Math.round(numReams * spr);
      setActualSheetsInput(String(computedSheets));
      if (sheetsPerCut > 0) {
        setCutsCountInput(String(Math.round(computedSheets / sheetsPerCut)));
      }
    } else {
      setActualSheetsInput('');
    }
  };

  const handleUseTheoreticalCuts = () => {
    if (theoreticalCuts > 0) {
      handleCutsChange(String(theoreticalCuts));
    }
  };

  // Yield Variance & Wastage Calculations
  const numActualSheets = parseFloat(actualSheetsInput) || 0;
  const numActualReams = parseFloat(actualReamsInput) || 0;

  const theoreticalMaxAllowed = useMemo(() => {
    return theoreticalSheets;
  }, [theoreticalSheets]);

  const isExceedingTheoretical = useMemo(() => {
    return theoreticalSheets > 0 && numActualSheets > theoreticalSheets;
  }, [numActualSheets, theoreticalSheets]);

  const varianceSheets = useMemo(() => {
    if (theoreticalSheets <= 0) return 0;
    return numActualSheets - theoreticalSheets;
  }, [numActualSheets, theoreticalSheets]);

  const wastePercentage = useMemo(() => {
    if (theoreticalSheets <= 0) return 0;
    const loss = theoreticalSheets - numActualSheets;
    return Math.round((loss / theoreticalSheets) * 1000) / 10;
  }, [theoreticalSheets, numActualSheets]);

  // Landed cost allocation & accurate costing (Net Cost = Total Reel Input Value)
  const netProductionCost = useMemo(() => {
    return totalInputCost;
  }, [totalInputCost]);

  const effectiveCostPerSheet = useMemo(() => {
    if (numActualSheets <= 0) return 0;
    return Math.round((netProductionCost / numActualSheets) * 10000) / 10000;
  }, [netProductionCost, numActualSheets]);

  const effectiveCostPerReam = useMemo(() => {
    if (numActualReams <= 0) return 0;
    return Math.round((netProductionCost / numActualReams) * 100) / 100;
  }, [netProductionCost, numActualReams]);

  // Semi-Finished 4-UP Book-Size Piece Cost (Parent Sheet Cost / 4)
  const costPer4UpPiece = useMemo(() => {
    if (effectiveCostPerSheet <= 0) return 0;
    return Math.round((effectiveCostPerSheet / 4) * 10000) / 10000;
  }, [effectiveCostPerSheet]);

  // Post Voucher
  const handleSubmit = async () => {
    if (selectedReels.length === 0) {
      alert('Please select at least one paper reel to convert.');
      return;
    }
    if (!targetSkuId) {
      alert('Please select the target converted sheet SKU.');
      return;
    }
    if (!destinationLocationId) {
      alert('Please select the destination location.');
      return;
    }
    if (numActualSheets <= 0) {
      alert('Please enter the actual good sheets produced.');
      return;
    }
    if (theoreticalSheets > 0 && numActualSheets > theoreticalSheets) {
      alert(
        `Cannot post Cutting Slip:\n\nActual good sheets (${numActualSheets.toLocaleString()}) exceeds the theoretical maximum yield (${theoreticalSheets.toLocaleString()} sheets) from ${totalInputWeight} KG of ${sheetGsm} GSM (${sheetWidth}×${sheetLength} CM).\n\nMathematically, that reel can only produce about ${theoreticalSheets.toLocaleString()} parent sheets maximum. Please adjust actual sheets to be ≤ ${theoreticalSheets.toLocaleString()} or increase the input reel weight.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload: Partial<CuttingSlipV2> & { companyId: string } = {
        companyId,
        slipNumber,
        date,
        sourceSku: sourceSkuDoc?._id || selectedReels[0].skuId,
        purchaseBatch: selectedReels[0].purchaseBatch,
        sourceLocationId: selectedReels[0].locationId,
        selectedReels: selectedReels.map(r => ({
          reelNumber: r.reelNumber,
          weight: r.weight,
          width: r.width,
          gsm: r.gsm,
          locationId: r.locationId
        })),
        totalInputWeight,
        inputRatePerKg: avgInputRatePerKg,
        totalInputCost,
        targetSku: targetSkuId,
        sheetWidth: parseFloat(sheetWidth) || 57,
        sheetLength: parseFloat(sheetLength) || 70,
        sheetGsm: parseFloat(sheetGsm) || 52,
        sheetsPerReam: sheetsPerReam || 500,
        startMeterReading: 0,
        endMeterReading: 0,
        cutsCount: numCutsCount,
        reelsOnStand: reelsOnStand || 1,
        slitsCount: slitsCount || 1,
        theoreticalSheets,
        theoreticalReams,
        actualSheets: numActualSheets,
        actualReams: numActualReams,
        varianceSheets,
        wastePercentage,
        scrapWeightKg: 0,
        scrapRatePerKg: 0,
        coreCount: 0,
        coreRatePerPc: 0,
        totalScrapCredit: 0,
        netProductionCost,
        effectiveCostPerSheet,
        effectiveCostPerReam,
        costPer4UpPiece,
        destinationLocationId,
        machineName,
        operatorName,
        notes
      };

      const res = await createCuttingSlipV2(payload);
      if (onSaved) onSaved(res.cuttingSlip);
      try {
        const reelsRes = await getAvailableReelsV2(companyId);
        setAvailableReels(reelsRes.availableReels || []);
      } catch (e) {
        console.error('Error refreshing available reels:', e);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to post cutting slip voucher:', err);
      alert(err?.response?.data?.msg || err?.message || 'Failed to post cutting slip voucher');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="max-w-[98vw] 2xl:max-w-[1760px]"
      maxWidth="max-w-[98vw] 2xl:max-w-[1760px]"
      className="max-h-[96vh] w-full"
      padding="p-0"
      hideCloseButton={true}
    >
      <div className="flex flex-col min-h-0 h-full bg-slate-50 font-sans select-none overflow-hidden">
        {/* Voucher Header (Clean Single-Color Blue ERP Style) */}
        <div className="px-4 py-2 bg-white border-b border-blue-200 flex items-center justify-between shrink-0 shadow-3xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-3xs">
              <Scissors className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs sm:text-sm tracking-wider text-blue-900 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  {slipNumber || 'CS-001'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-900 font-bold border border-blue-200 uppercase tracking-wider">
                  Cutting Slip Voucher (Stock Conversion)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                Reel → Sheet Conversion & Stock Journal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-600 font-bold uppercase text-[11px]">Date:</span>
              <input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)}
                className="bg-transparent text-slate-900 font-mono text-xs focus:outline-none cursor-pointer font-bold"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsPrintMode(!isPrintMode)}
              className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-900 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 shadow-3xs transition-all cursor-pointer"
              title="Toggle printable machine slip view"
            >
              <Printer className="w-3.5 h-3.5 text-blue-600" />
              <span>{isPrintMode ? 'Voucher View' : 'Print Slip'}</span>
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

        {/* Printable View */}
        {isPrintMode ? (
          <div className="flex-1 p-5 bg-white overflow-y-auto print:p-0">
            <div className="max-w-4xl mx-auto border-2 border-slate-800 p-5 rounded-xl space-y-5">
              <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
                <div>
                  <h2 className="text-lg font-black text-slate-900">SRI KRISHNA BOOK WORKS</h2>
                  <p className="text-xs text-slate-600 font-bold uppercase">Paper Sheeting & Slitting Job Order Slip</p>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xs font-bold text-slate-900">{slipNumber || 'CS-001'}</div>
                  <div className="text-[11px] text-slate-600">{date}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                <div className="border border-slate-200 p-2.5 rounded-lg">
                  <span className="font-bold text-slate-800 block mb-1">INPUT (REELS MOUNTED)</span>
                  <div>SKU: <span className="font-bold">{sourceSkuDoc?.name || 'Reels'}</span></div>
                  <div>Batch: <span className="font-bold font-mono">{selectedReels[0]?.purchaseBatch || 'N/A'}</span></div>
                  <div>Reels Count: <span className="font-bold">{selectedReels.length}</span></div>
                  <div>Total Weight: <span className="font-bold font-mono">{totalInputWeight} Kg</span></div>
                </div>
                <div className="border border-slate-200 p-2.5 rounded-lg">
                  <span className="font-bold text-slate-800 block mb-1">OUTPUT (SHEETS REQUIRED)</span>
                  <div>Target SKU: <span className="font-bold">{selectedTargetSkuDoc?.name || 'Sheets'}</span></div>
                  <div>Cut Size: <span className="font-bold">{sheetWidth} x {sheetLength} cm ({sheetGsm} GSM)</span></div>
                  <div>Machine Meter: <span className="font-bold font-mono">{cutsCountInput || '0'} Cuts ({reelsOnStand} Reels on Stand × {slitsCount} Slits)</span></div>
                  <div>Theoretical: <span className="font-bold font-mono">{theoreticalSheets} Sheets ({theoreticalReams} Reams)</span></div>
                  <div>Actual Good: <span className="font-bold font-mono text-blue-900">{numActualSheets} Sheets ({numActualReams} Reams)</span></div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-2.5">
                <span className="font-bold text-xs sm:text-sm text-slate-800 block mb-1.5">INDIVIDUAL REELS LOG</span>
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b text-slate-600 font-mono text-[11px]">
                      <th className="py-1">#</th>
                      <th className="py-1">Reel Number</th>
                      <th className="py-1">Weight (Kg)</th>
                      <th className="py-1">Width (cm)</th>
                      <th className="py-1">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReels.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100 text-xs">
                        <td className="py-1">{i + 1}</td>
                        <td className="py-1 font-mono font-bold">{r.reelNumber}</td>
                        <td className="py-1 font-mono">{r.weight} kg</td>
                        <td className="py-1">{r.width || sheetWidth} cm</td>
                        <td className="py-1 text-slate-600">{r.locationName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-end pt-4 text-xs border-t border-slate-200">
                <div className="space-y-1">
                  <div>Machine: <span className="font-bold">{machineName}</span></div>
                  <div>Operator: <span className="font-bold">{operatorName || '______________'}</span></div>
                </div>
                <div className="text-center">
                  <div className="w-36 border-b border-slate-400 mb-1"></div>
                  <span className="text-[11px] text-slate-600">Supervisor Signature</span>
                </div>
              </div>

              <div className="flex justify-end pt-2 gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-3xs"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Hardcopy
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Dual-Pane Voucher View (Tally Stock Journal) */
          <div className="flex-1 flex flex-col p-2.5 sm:p-3 overflow-y-auto gap-2.5 min-h-0 custom-scrollbar">
            {/* Top Toolbar */}
            <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between gap-2.5 flex-wrap text-xs shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Machine:</span>
                  <input
                    type="text"
                    value={machineName}
                    onChange={e => setMachineName(e.target.value)}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-600 transition-all w-32 sm:w-36"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Operator:</span>
                  <input
                    type="text"
                    value={operatorName}
                    onChange={e => setOperatorName(e.target.value)}
                    placeholder="Operator name"
                    className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-600 transition-all w-36 sm:w-44 placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-700 font-semibold">
                <div className="bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg shadow-3xs text-blue-900 font-bold">
                  Available Stock: <span className="font-mono">{availableReels.length} Reels</span>
                </div>
                <div className="bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg shadow-3xs text-blue-900 font-bold">
                  Paper Items: <span className="font-mono">{reelItemsWithStock.length} SKUs</span>
                </div>
              </div>
            </div>

            {/* Split Screen: Left (Consumption) vs Right (Production) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 min-h-[460px]">
              {/* ── LEFT PANE: CONSUMPTION (Source Reels: Item -> Purchase Batch -> Reels) ── */}
              <div className="bg-white rounded-xl border border-blue-200 shadow-3xs flex flex-col overflow-hidden min-h-[450px]">
                <div className="px-3 py-1.5 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-3xs">
                      1
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                        Consumption (Source Reels Out)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Select paper reel SKU, then select available reels by batch
                      </p>
                    </div>
                  </div>
                </div>

                {/* 1. Paper Reel Item Searchable Dropdown - Neat & Clear */}
                <div className="p-2.5 bg-blue-50/20 border-b border-blue-100 space-y-1 relative" ref={reelDropdownRef}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-950 uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
                      <Package className="w-3.5 h-3.5 text-blue-600" />
                      <span>Select Reel Item (Raw Material):</span>
                    </span>
                    <span className="text-blue-900 bg-blue-100/70 px-2 py-0.5 rounded font-bold text-[11px] border border-blue-200">
                      {reelItemsWithStock.length} Reel {reelItemsWithStock.length === 1 ? 'Item' : 'Items'} In Stock
                    </span>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-blue-600 pointer-events-none" />
                    <input
                      type="text"
                      value={showReelDropdown ? reelItemSearch : (selectedReelItemDoc ? `${selectedReelItemDoc.name} ${selectedReelItemDoc.code ? `(${selectedReelItemDoc.code})` : ''}` : '')}
                      onChange={e => {
                        setReelItemSearch(e.target.value);
                        setShowReelDropdown(true);
                      }}
                      onClick={() => setShowReelDropdown(true)}
                      onFocus={() => setShowReelDropdown(true)}
                      placeholder="Search paper reel name or code..."
                      className="w-full pl-8 pr-8 h-9 bg-white border border-blue-300 hover:border-blue-500 focus:border-blue-600 rounded-lg text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-1 focus:ring-blue-500/20 shadow-3xs cursor-pointer transition-all"
                    />
                    <div className="absolute right-2.5 top-2 flex items-center gap-1">
                      {selectedReelItemKey ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReelItemKey('');
                            setSelectedBatch('ALL');
                            setSelectedReelIds(new Set());
                            setReelItemSearch('');
                          }}
                          className="p-0.5 hover:bg-blue-100 text-blue-700 hover:text-blue-900 rounded cursor-pointer transition-colors"
                          title="Clear selected reel SKU"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <ChevronDown 
                          className="w-3.5 h-3.5 cursor-pointer text-blue-600 hover:text-blue-800" 
                          onClick={() => setShowReelDropdown(!showReelDropdown)} 
                        />
                      )}
                    </div>
                  </div>

                  {/* Dropdown Popover */}
                  {showReelDropdown && (
                    <div className="absolute left-2 right-2 top-full mt-1 bg-white border border-blue-200 rounded-xl shadow-2xl z-[999] max-h-72 overflow-y-auto divide-y divide-slate-100 p-1">
                      {/* Category Filter Chips Header */}
                      <div className="sticky top-0 bg-white/95 backdrop-blur-xs p-1.5 border-b border-blue-100 z-10 space-y-1 shadow-3xs">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3 text-blue-600" />
                            <span>Filter Category:</span>
                          </span>
                          <span>Showing {filteredReelItems.length} of {reelCategoryBreakdown.total}</span>
                        </div>
                        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-thin">
                          <button
                            type="button"
                            onClick={() => setReelCategoryFilter('ALL')}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 transition-all cursor-pointer ${
                              reelCategoryFilter === 'ALL'
                                ? 'bg-blue-600 text-white shadow-3xs'
                                : 'bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200'
                            }`}
                          >
                            All ({reelCategoryBreakdown.total})
                          </button>
                          {reelCategoryBreakdown.categories.slice(0, 10).map(([cat, count]) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setReelCategoryFilter(cat)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 transition-all cursor-pointer ${
                                reelCategoryFilter === cat
                                  ? 'bg-blue-600 text-white shadow-3xs'
                                  : 'bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200'
                              }`}
                            >
                              {cat} ({count})
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* List of Paper Reel SKUs */}
                      {filteredReelItems.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500 italic">
                          No paper reel SKUs found matching search.
                        </div>
                      ) : (
                        filteredReelItems.map(item => {
                          const isSelected = item.key === selectedReelItemKey;
                          return (
                            <div
                              key={item.key}
                              onClick={() => handleSelectReelItem(item.key)}
                              className={`p-2 cursor-pointer rounded-lg transition-colors flex items-center justify-between text-xs ${
                                isSelected ? 'bg-blue-50 font-bold border border-blue-400' : 'hover:bg-blue-50/50'
                              }`}
                            >
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="font-bold text-slate-900 break-words leading-tight text-xs">
                                  {item.name}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="text-[10px] text-slate-500 font-mono font-bold">{item.code}</span>
                                  <span className="text-[10px] text-slate-300">•</span>
                                  <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                                    {item.category || 'Paper Reels'}
                                  </span>
                                  {(item.width || item.gsm) && (
                                    <>
                                      <span className="text-[10px] text-slate-300">•</span>
                                      <span className="text-[10px] font-bold text-blue-700">
                                        {item.width ? `${item.width} CM` : ''} {item.gsm ? `${item.gsm} GSM` : ''}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border ${
                                  item.reelsCount > 0 
                                    ? 'bg-blue-50 text-blue-900 border-blue-200' 
                                    : 'bg-slate-50 text-slate-500 border-slate-200'
                                }`}>
                                  {item.reelsCount} {item.reelsCount === 1 ? 'Reel' : 'Reels'} ({item.totalWeight.toLocaleString()} kg)
                                </span>
                                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded-lg border bg-blue-50 text-blue-700 border-blue-200">
                                  Raw Reel
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {!selectedReelItemKey ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50/50 rounded-xl border border-dashed border-blue-200 m-2.5 min-h-[300px]">
                    <div className="w-11 h-11 rounded-xl bg-blue-100 border border-blue-300 text-blue-700 flex items-center justify-center mb-2 shadow-3xs">
                      <Package className="w-5 h-5 stroke-[2]" />
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider">No Paper Reel Selected</h5>
                    <p className="text-[11px] text-slate-600 max-w-xs mt-1 font-medium leading-relaxed">
                      Click the search box above to choose a paper reel SKU. All available reels and batches will display here with full details.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* 2. Purchase Batch Filter Tabs */}
                    <div className="px-2.5 py-1.5 bg-white border-b border-blue-100 flex items-center justify-between gap-1.5 flex-wrap shrink-0">
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider shrink-0 mr-0.5">
                          Purchase Batch:
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedBatch('ALL')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition-all cursor-pointer ${
                            selectedBatch === 'ALL'
                              ? 'bg-blue-600 text-white shadow-3xs'
                              : 'bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200'
                          }`}
                        >
                          All Batches ({reelsForSelectedItem.length} Reels)
                        </button>
                        {batchesForSelectedItem.map(b => (
                          <button
                            key={b.batch}
                            type="button"
                            onClick={() => setSelectedBatch(b.batch)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition-all cursor-pointer ${
                              selectedBatch === b.batch
                                ? 'bg-blue-600 text-white shadow-3xs'
                                : 'bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200'
                            }`}
                          >
                            {b.batch} ({b.count} Reels • ₹{formatRate(b.avgRate)}/kg)
                          </button>
                        ))}
                      </div>

                      {displayedReels.length > 0 && (
                        <button
                          type="button"
                          onClick={handleToggleAllDisplayed}
                          className="text-xs text-blue-700 hover:text-blue-900 hover:bg-blue-100 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 font-bold shrink-0 cursor-pointer transition-colors shadow-3xs"
                        >
                          {displayedReels.every(r => selectedReelIds.has(r.id)) ? 'Deselect In View' : 'Select In View'}
                        </button>
                      )}
                    </div>

                    {/* 3. Reel Cards Grouped by Purchase Batch */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar min-h-[340px] max-h-[460px] bg-slate-50/40">
                      {displayedReels.length === 0 ? (
                        <div className="p-6 text-center text-slate-600 text-xs font-medium">
                          No reels found in inventory for the selected item and batch.
                        </div>
                      ) : (
                        (selectedBatch === 'ALL' 
                          ? batchesForSelectedItem 
                          : [{ batch: selectedBatch, count: displayedReels.length, totalWeight: displayedReels.reduce((s, r) => s + (Number(r.weight) || 0), 0), avgRate: displayedReels[0] ? getReelRate(displayedReels[0]) : 0 }]
                        ).map(batchInfo => {
                          const batchReels = displayedReels.filter(r => (r.purchaseBatch || 'No Batch') === batchInfo.batch);
                          if (batchReels.length === 0) return null;
                          const isBatchAllSelected = batchReels.every(r => selectedReelIds.has(r.id));

                          return (
                            <div key={batchInfo.batch} className="rounded-lg border border-blue-200 overflow-hidden bg-white shadow-3xs">
                              {/* Batch Header */}
                              <div className="px-2.5 py-1 bg-blue-50/60 border-b border-blue-100 flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-bold text-xs text-blue-950 bg-white px-2 py-0.5 rounded border border-blue-200 shadow-3xs">
                                    Batch: {batchInfo.batch}
                                  </span>
                                  <span className="text-xs text-slate-600 font-medium">
                                    {batchReels.length} {batchReels.length === 1 ? 'Reel' : 'Reels'} • {batchInfo.totalWeight.toLocaleString()} kg • ₹{formatRate(batchInfo.avgRate)}/kg
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedReelIds(prev => {
                                      const next = new Set(prev);
                                      if (isBatchAllSelected) {
                                        batchReels.forEach(r => next.delete(r.id));
                                      } else {
                                        batchReels.forEach(r => next.add(r.id));
                                      }
                                      return next;
                                    });
                                  }}
                                  className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:bg-blue-50 bg-white px-2 py-0.5 rounded border border-blue-200 cursor-pointer transition-colors shadow-3xs"
                                >
                                  {isBatchAllSelected ? 'Deselect Batch' : `Select Batch (${batchReels.length})`}
                                </button>
                              </div>

                              {/* Individual Reels */}
                              <div className="p-1.5 space-y-1.5">
                                {batchReels.map(r => {
                                  const isSelected = selectedReelIds.has(r.id);
                                  const actualRate = getReelRate(r);
                                  const reelCost = Math.round((Number(r.weight) || 0) * actualRate);
                                  return (
                                    <div
                                      key={r.id}
                                      onClick={() => handleToggleReel(r.id)}
                                      className={`p-2 sm:p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                                        isSelected
                                          ? 'bg-blue-50/80 border-2 border-blue-600 shadow-3xs'
                                          : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => {}}
                                          className="w-4 h-4 rounded cursor-pointer pointer-events-none accent-blue-600 shrink-0"
                                        />
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-mono font-bold text-xs sm:text-sm text-slate-900">
                                              {r.reelNumber}
                                            </span>
                                            <span className="text-[10px] sm:text-[11px] font-semibold text-blue-900 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                              {r.locationName || 'Godown'}
                                            </span>
                                          </div>
                                          <div className="text-[11px] text-slate-500 mt-0.5 font-medium flex items-center gap-1.5">
                                            {r.width && <span>{r.width} cm</span>}
                                            {r.width && r.gsm && <span>•</span>}
                                            {r.gsm && <span>{r.gsm} GSM</span>}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="text-right shrink-0">
                                        <div className="font-mono font-bold text-sm sm:text-base text-blue-950">
                                          {r.weight} <span className="text-xs text-slate-500 font-normal">kg</span>
                                        </div>
                                        <div className="text-xs font-mono text-slate-600 mt-0.5">
                                          @₹{formatRate(actualRate)}/kg = <span className="font-bold text-slate-900">₹{reelCost.toLocaleString('en-IN')}</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}

                {/* Left Footer Summary */}
                <div className="p-2 bg-blue-50/60 border-t border-blue-200 shrink-0 flex items-center justify-between text-xs flex-wrap gap-2">
                  <div>
                    <span className="text-slate-600 font-medium">Selected Reels: </span>
                    <span className="font-mono font-bold text-blue-950 text-xs sm:text-sm">{selectedReels.length}</span>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-5">
                    <div>
                      <span className="text-slate-600 font-medium">Total Weight: </span>
                      <span className="font-mono font-bold text-blue-950 text-xs sm:text-sm">{totalInputWeight.toLocaleString()} kg</span>
                    </div>
                    <div>
                      <span className="text-slate-600 font-medium">Value: </span>
                      <span className="font-mono font-bold text-blue-950 text-xs sm:text-sm">₹{totalInputCost.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── RIGHT PANE: GENERATION (Target Sheets & Direct Cuts Meter) ── */}
              <div className="bg-white rounded-xl border border-blue-200 shadow-3xs flex flex-col overflow-hidden min-h-[450px]">
                <div className="px-3 py-1.5 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-3xs">
                      2
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                        Generation (Target Sheets In)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Cut dimensions, live production meter (Sheets ↔ Reams), & godown
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar">
                  {/* Target SKU Searchable Dropdown */}
                  <div className="relative" ref={targetDropdownRef}>
                    <label className="text-[11px] font-bold text-blue-950 uppercase tracking-wider block mb-0.5">
                      Target Converted Sheet SKU (Semi Good) *
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-blue-600 pointer-events-none" />
                      <input
                        type="text"
                        value={showTargetDropdown ? targetSkuSearch : (selectedTargetSkuDoc?.name || '')}
                        onChange={e => {
                          setTargetSkuSearch(e.target.value);
                          setShowTargetDropdown(true);
                        }}
                        onClick={() => setShowTargetDropdown(true)}
                        onFocus={() => setShowTargetDropdown(true)}
                        placeholder="Search semi-finished sheet..."
                        className="w-full pl-8 pr-8 h-9 bg-white border border-blue-300 hover:border-blue-500 focus:border-blue-600 rounded-lg text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-1 focus:ring-blue-500/20 shadow-3xs cursor-pointer transition-all"
                      />
                      <div className="absolute right-2.5 top-2 flex items-center gap-1">
                        {targetSkuId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setTargetSkuId('');
                              setTargetSkuSearch('');
                            }}
                            className="p-0.5 hover:bg-blue-100 text-blue-700 hover:text-blue-900 rounded cursor-pointer transition-colors"
                            title="Clear selected target SKU"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <ChevronDown 
                            className="w-3.5 h-3.5 cursor-pointer text-blue-600 hover:text-blue-800" 
                            onClick={() => setShowTargetDropdown(!showTargetDropdown)} 
                          />
                        )}
                      </div>
                    </div>

                    {/* Dropdown Popover */}
                    {showTargetDropdown && (
                      <div className="absolute left-0 top-full mt-1 w-full min-w-[320px] sm:min-w-[400px] bg-white border border-blue-200 rounded-xl shadow-2xl z-[999] max-h-72 overflow-y-auto divide-y divide-slate-100 p-1">
                        {/* Category Filter Chips Header */}
                        <div className="sticky top-0 bg-white/95 backdrop-blur-xs p-1.5 border-b border-blue-100 z-10 space-y-1 shadow-3xs">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                            <span className="flex items-center gap-1">
                              <Tag className="w-3 h-3 text-blue-600" />
                              <span>Filter Category:</span>
                            </span>
                            <span>Showing {filteredTargetSkus.length} of {semiCategoryBreakdown.total}</span>
                          </div>
                          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-thin">
                            <button
                              type="button"
                              onClick={() => setTargetCategoryFilter('ALL')}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 transition-all cursor-pointer ${
                                targetCategoryFilter === 'ALL'
                                  ? 'bg-blue-600 text-white shadow-3xs'
                                  : 'bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200'
                              }`}
                            >
                              All ({semiCategoryBreakdown.total})
                            </button>
                            {semiCategoryBreakdown.categories.slice(0, 10).map(([cat, count]) => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setTargetCategoryFilter(cat)}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 transition-all cursor-pointer ${
                                  targetCategoryFilter === cat
                                    ? 'bg-blue-600 text-white shadow-3xs'
                                    : 'bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200'
                                }`}
                              >
                                {cat} ({count})
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* List of Semi-Finished Good SKUs */}
                        {filteredTargetSkus.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500 italic">
                            No semi-finished good sheets found matching search.
                          </div>
                        ) : (
                          filteredTargetSkus.map(s => {
                            const isSelected = s._id === targetSkuId;
                            const spec = getSkuSpecOrConversion(s);
                            return (
                              <div
                                key={s._id}
                                onClick={() => handleSelectTargetSku(s)}
                                className={`p-2 cursor-pointer rounded-lg transition-colors flex items-center justify-between text-xs ${
                                  isSelected ? 'bg-blue-50 font-bold border border-blue-400' : 'hover:bg-blue-50/50'
                                }`}
                              >
                                <div className="flex-1 min-w-0 pr-2">
                                  <div className="font-bold text-slate-900 break-words leading-tight text-xs">{s.name}</div>
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span className="text-[10px] text-slate-500 font-mono font-bold">{s.skuCode}</span>
                                    <span className="text-[10px] text-slate-300">•</span>
                                    <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                                      {s.category || 'Semi Goods'}
                                    </span>
                                    {spec && (
                                      <>
                                        <span className="text-[10px] text-slate-300">•</span>
                                        <span className="text-[10px] font-bold text-blue-700">{spec}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded-lg border bg-blue-50 text-blue-700 border-blue-200">
                                    Semi Good
                                  </span>
                                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded-lg border bg-blue-50 text-blue-900 border-blue-200">
                                    {s.status || 'Active'}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Cut Specifications Grid */}
                  <div className="grid grid-cols-4 gap-2 bg-blue-50/30 p-2 rounded-xl border border-blue-100">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">Width (cm)</label>
                      <input
                        type="number"
                        step="any"
                        value={sheetWidth}
                        onChange={e => setSheetWidth(e.target.value)}
                        className="w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-600 shadow-3xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">Length (cm)</label>
                      <input
                        type="number"
                        step="any"
                        value={sheetLength}
                        onChange={e => setSheetLength(e.target.value)}
                        className="w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-600 shadow-3xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">GSM</label>
                      <input
                        type="number"
                        step="any"
                        value={sheetGsm}
                        onChange={e => setSheetGsm(e.target.value)}
                        className="w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-600 shadow-3xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">Sheets / Ream</label>
                      <input
                        type="number"
                        value={sheetsPerReamInput}
                        onChange={e => handleSheetsPerReamChange(e.target.value)}
                        className="w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-600 shadow-3xs"
                      />
                    </div>
                  </div>

                  {/* ── MACHINE CUTTING METER (DIRECT KNIFE CUTS ONLY) ── */}
                  <div className="bg-blue-50/30 border border-blue-200 rounded-xl p-2.5 space-y-2 shadow-3xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-blue-600" />
                        <div>
                          <span className="text-xs font-bold text-blue-950 uppercase tracking-wide block">
                            Machine Cutting Meter (Direct Knife Strokes)
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            Derived Sheets = Knife Cuts × Reels on Stand × Slits Across
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-1">
                        <label className="text-[11px] font-bold text-blue-950 uppercase tracking-wider block mb-0.5">
                          Knife Cuts (Strokes) *
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="1"
                            value={cutsCountInput}
                            onChange={e => handleCutsChange(e.target.value)}
                            placeholder="0"
                            className="w-full h-9 pl-2.5 pr-12 bg-white border-2 border-blue-200 hover:border-blue-400 rounded-lg text-xs sm:text-sm font-bold font-mono text-blue-950 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-600 shadow-3xs transition-all"
                          />
                          <span className="absolute right-2 top-2 text-[10px] font-bold text-blue-700 select-none">
                            CUTS
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">
                          Reels on Stand
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={reelsOnStandInput}
                          onChange={e => handleReelsOnStandChange(e.target.value)}
                          className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-600 shadow-3xs"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">
                          Slits Across
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={slitsCountInput}
                          onChange={e => handleSlitsCountChange(e.target.value)}
                          className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-600 shadow-3xs"
                        />
                      </div>
                    </div>

                    {/* Live Cut Calculation Display */}
                    <div className="flex items-center justify-between flex-wrap gap-1.5 pt-1 border-t border-blue-100 text-xs">
                      <div className="flex items-center gap-1.5 text-blue-950">
                        <span className="font-semibold text-slate-500 text-[11px]">Output:</span>
                        <span className="font-mono bg-white px-2 py-0.5 rounded border border-blue-200 font-bold shadow-3xs">
                          {numCutsCount} cuts × {sheetsPerCut} sh/cut = <span className="text-blue-700 font-bold">{machineDerivedSheets.toLocaleString()} Sheets</span> ({machineDerivedReams} Reams)
                        </span>
                      </div>

                      {theoreticalCuts > 0 && (
                        <button
                          type="button"
                          onClick={handleUseTheoreticalCuts}
                          className="text-[11px] text-blue-600 hover:text-blue-800 font-bold underline flex items-center gap-0.5 cursor-pointer"
                          title="Auto-fill machine cuts using theoretical formula"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Use Theo: {theoreticalCuts.toLocaleString()}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Simultaneous Dual-Unit Actual Production Inputs */}
                  <div className="bg-blue-50/30 border border-blue-200 rounded-xl p-2.5 space-y-2 shadow-3xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-blue-600" />
                        <span>Actual Good Production (Dual Unit Linked)</span>
                      </span>
                      <span className="text-[10px] text-blue-900 font-bold bg-white px-2 py-0.5 rounded-full border border-blue-200 font-mono">
                        1 Ream = {sheetsPerReam} Sheets
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-0.5">
                          Reams Produced
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={actualReamsInput}
                            onChange={e => handleReamsChange(e.target.value)}
                            placeholder="0.00"
                            className={`w-full h-9 pl-2.5 pr-14 bg-white border-2 ${
                              isExceedingTheoretical
                                ? 'border-red-400 focus:border-red-600 focus:ring-red-500/20 text-red-950'
                                : 'border-blue-200 hover:border-blue-400 focus:border-blue-600 focus:ring-blue-500/20 text-blue-950'
                            } rounded-lg text-xs sm:text-sm font-bold font-mono focus:outline-none focus:ring-1 shadow-3xs transition-all`}
                          />
                          <span className={`absolute right-2 top-2 text-[10px] font-bold ${isExceedingTheoretical ? 'text-red-600' : 'text-blue-700'} select-none`}>
                            REAMS
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-0.5">
                          Sheets Count
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={actualSheetsInput}
                            onChange={e => handleSheetsChange(e.target.value)}
                            placeholder="0"
                            className={`w-full h-9 pl-2.5 pr-14 bg-white border-2 ${
                              isExceedingTheoretical
                                ? 'border-red-500 bg-red-50/20 focus:border-red-600 focus:ring-red-500/20 text-red-950'
                                : 'border-blue-200 hover:border-blue-400 focus:border-blue-600 focus:ring-blue-500/20 text-blue-950'
                            } rounded-lg text-xs sm:text-sm font-bold font-mono focus:outline-none focus:ring-1 shadow-3xs transition-all`}
                          />
                          <span className={`absolute right-2 top-2 text-[10px] font-bold ${isExceedingTheoretical ? 'text-red-600' : 'text-blue-700'} select-none`}>
                            SHEETS
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Exceeding Theoretical Limit Warning Banner */}
                    {isExceedingTheoretical && (
                      <div className="p-2.5 bg-red-50 border-2 border-red-300 rounded-lg flex items-start gap-2 text-xs text-red-900 shadow-3xs animate-in fade-in">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-1">
                          <div className="font-bold flex items-center justify-between">
                            <span>Exceeds Theoretical Maximum Yield!</span>
                            <span className="font-mono text-[11px] bg-red-200/80 text-red-900 px-1.5 py-0.5 rounded">
                              Limit: {theoreticalSheets.toLocaleString()} Sheets
                            </span>
                          </div>
                          <p className="text-[11px] text-red-700 leading-tight">
                            Mathematically, {totalInputWeight} KG of {sheetGsm} GSM ({sheetWidth}×{sheetLength} CM) paper can yield at most <strong className="font-mono">{theoreticalSheets.toLocaleString()} parent sheets</strong>. Actual good sheets cannot exceed theoretical maximum without increasing reel weight.
                          </p>
                          <button
                            type="button"
                            onClick={() => handleSheetsChange(String(theoreticalSheets))}
                            className="mt-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-3xs"
                          >
                            <CheckCircle2 className="w-3 h-3 text-white" />
                            Cap to Theoretical Max ({theoreticalSheets.toLocaleString()} Sheets)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Theoretical vs Actual Live Variance Meter */}
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-500">Theoretical (Formula Math):</span>
                      <span className="font-mono font-bold text-slate-800">
                        {theoreticalSheets.toLocaleString()} Sheets ({theoreticalReams} Reams)
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-500">Machine Cuts Output:</span>
                      <span className="font-mono font-bold text-blue-800">
                        {machineDerivedSheets.toLocaleString()} Sheets ({numCutsCount} cuts @ {reelsOnStand}R)
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-500">Actual Good Stock In:</span>
                      <span className={`font-mono font-bold ${isExceedingTheoretical ? 'text-red-700' : 'text-blue-900'}`}>
                        {numActualSheets.toLocaleString()} Sheets ({numActualReams} Reams)
                      </span>
                    </div>

                    <div className="pt-1 border-t border-slate-200 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">Live Production Variance:</span>
                      {isExceedingTheoretical ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold flex items-center gap-1 bg-red-600 text-white shadow-3xs">
                          <AlertTriangle className="w-3 h-3 text-white" />
                          <span>
                            +{varianceSheets.toLocaleString()} Sheets (Exceeds Max by {varianceSheets.toLocaleString()})
                          </span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold flex items-center gap-1 bg-blue-600 text-white shadow-3xs">
                          {varianceSheets < 0 ? <AlertTriangle className="w-3 h-3 text-white" /> : <CheckCircle2 className="w-3 h-3 text-white" />}
                          <span>
                            {varianceSheets > 0 ? '+' : ''}{varianceSheets.toLocaleString()} Sheets ({wastePercentage > 0 ? `-${wastePercentage}% Loss` : '100% Tally'})
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Destination Location */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-0.5">
                      Destination Warehouse Location <span className="text-blue-600">*</span>
                    </label>
                    <LocationSelectPopup
                      hideLabel
                      locations={locations}
                      warehouseId={destWarehouseId}
                      floorId={destFloorId}
                      zoneId={destZoneId}
                      locationId={destinationLocationId}
                      displayValue={destLocationDisplay}
                      badgeColor="blue"
                      companyId={companyId}
                      skuId={targetSkuId}
                      variant="compact"
                      onChange={(wId, fId, zId, lId) => {
                        setDestWarehouseId(wId);
                        setDestFloorId(fId);
                        setDestZoneId(zId);
                        const chosen = lId || zId || fId || wId;
                        setDestinationLocationId(chosen);
                        const matched = locations.find(l => l._id === chosen);
                        if (matched) {
                          setDestLocationDisplay(matched.name);
                        } else {
                          setDestLocationDisplay('');
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── BOTTOM PANE: Costing Valuation & Landed Absorption ── */}
            <div className="bg-white p-2.5 rounded-xl border border-blue-200 shadow-3xs space-y-2 shrink-0">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-blue-950 uppercase tracking-wide flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-blue-600" />
                  <span>Costing & Landed Cost Valuation</span>
                </span>
                <span className="text-[10px] text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-blue-600" />
                  Formula: Landed Rate = Reel Input Value ÷ Good Sheets Produced
                </span>
              </div>

              {/* Compact High-Contrast Costing Reconciliation Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 items-center text-xs">
                {/* Card 1: Total Reel Input Value */}
                <div className="lg:col-span-3 bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-200 flex flex-col justify-between h-full">
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                      Total Reel Input Value
                    </span>
                    <span className="text-[10px] text-emerald-600 font-mono block mt-0.5">
                      {totalInputWeight.toLocaleString('en-IN')} kg @ ₹{avgInputRatePerKg.toFixed(2)}/kg
                    </span>
                  </div>
                  <div className="font-mono font-bold text-base text-emerald-700 mt-2">
                    ₹{totalInputCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Card 2: Actual Good Sheets */}
                <div className="lg:col-span-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex flex-col justify-between h-full">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                    Actual Good Sheets (In)
                  </span>
                  <div className="font-mono font-bold text-base text-slate-900 mt-2">
                    {numActualSheets.toLocaleString()} <span className="text-xs text-slate-500 font-normal">Sheets</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                    ({numActualReams.toLocaleString()} Reams) • Variance: {varianceSheets >= 0 ? `+${varianceSheets}` : varianceSheets} ({wastePercentage}%)
                  </span>
                </div>

                {/* Card 3: Effective Landed Rate */}
                <div className="lg:col-span-3 bg-blue-50/70 p-2.5 rounded-lg border border-blue-200 flex flex-col justify-between h-full">
                  <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider block">
                    Effective Landed Rate
                  </span>
                  <div className="font-mono font-bold text-base text-blue-900 mt-2">
                    ₹{effectiveCostPerSheet.toFixed(3)} <span className="text-[10px] text-blue-700 font-normal">/ sheet</span>
                  </div>
                  <span className="text-[10px] text-blue-700 font-mono mt-0.5">
                    (₹{totalInputCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ÷ {numActualSheets.toLocaleString()})
                  </span>
                </div>

                {/* Card 4: Semi-Finished 4-UP Cost */}
                <div className="lg:col-span-3 bg-blue-900 text-white p-2.5 rounded-lg border border-blue-800 flex flex-col justify-between h-full shadow-3xs">
                  <div>
                    <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider block">
                      Semi-Finished 4-UP Cost (Book Size PCS)
                    </span>
                    <span className="text-[9.5px] text-blue-300 block">
                      4 PCS per parent sheet
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-blue-200 mt-1">
                    ₹{effectiveCostPerSheet.toFixed(3)} ÷ 4 = <span className="font-bold text-white">₹{costPer4UpPiece.toFixed(3)} / PCS</span>
                  </div>
                  <div className="mt-1 px-2 py-0.5 bg-blue-800/80 rounded border border-blue-700 text-center font-mono font-bold text-xs text-white">
                    ₹{costPer4UpPiece.toFixed(2)} per PCS (Approx.)
                  </div>
                </div>
              </div>

              {/* Action Buttons & Remarks */}
              <div className="flex items-center justify-between pt-0.5 gap-2.5 flex-wrap">
                <div className="flex items-center gap-2 text-xs flex-1 min-w-[240px]">
                  <span className="text-slate-600 font-bold uppercase tracking-wider text-[11px]">Remarks:</span>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Sized for long notebook production batch"
                    className="w-full max-w-sm h-8.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-600 shadow-3xs"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-3xs border border-slate-200"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || selectedReels.length === 0 || isExceedingTheoretical}
                    title={
                      isExceedingTheoretical
                        ? `Cannot post: Actual output (${numActualSheets.toLocaleString()} sheets) exceeds theoretical maximum yield (${theoreticalSheets.toLocaleString()} sheets)`
                        : undefined
                    }
                    className={`px-4.5 py-1.5 font-bold rounded-lg text-xs shadow-3xs flex items-center gap-1.5 transition-all ${
                      isExceedingTheoretical
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed border border-slate-300'
                        : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-40'
                    }`}
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Posting Stock Journal...</span>
                      </>
                    ) : isExceedingTheoretical ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        <span>Exceeds Max Theoretical Yield</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        <span>Post Stock Journal & Convert (Ctrl+Enter)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

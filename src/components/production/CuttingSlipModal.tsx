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

  // ── 4. SCRAP & BY-PRODUCTS (RECOVERY & LANDED COSTING) ──
  const [scrapWeightKg, setScrapWeightKg] = useState<string>('');
  const [scrapRatePerKg, setScrapRatePerKg] = useState<string>('18');
  const [coreCount, setCoreCount] = useState<string>('');
  const [coreRatePerPc, setCoreRatePerPc] = useState<string>('15');

  // Print Mode State
  const [isPrintMode, setIsPrintMode] = useState(false);

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
    if (sku.altUnitConversion) {
      setSheetsPerReamInput(String(sku.altUnitConversion));
    } else if (sku.booksGbl) {
      setSheetsPerReamInput(String(sku.booksGbl));
    }
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

  // Batches for the selected item
  const batchesForSelectedItem = useMemo(() => {
    const map = new Map<string, { batch: string; count: number; totalWeight: number; avgRate: number }>();
    reelsForSelectedItem.forEach(r => {
      const b = r.purchaseBatch || 'No Batch';
      if (!map.has(b)) {
        map.set(b, { batch: b, count: 0, totalWeight: 0, avgRate: Number(r.ratePerKg) || 0 });
      }
      const entry = map.get(b)!;
      entry.count += 1;
      entry.totalWeight += Number(r.weight) || 0;
      entry.avgRate = Number(r.ratePerKg) || entry.avgRate;
    });
    return Array.from(map.values()).sort((a, b) => a.batch.localeCompare(b.batch));
  }, [reelsForSelectedItem]);

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
    const sum = selectedReels.reduce((acc, r) => acc + ((Number(r.weight) || 0) * (Number(r.ratePerKg) || 0)), 0);
    return Math.round(sum * 100) / 100;
  }, [selectedReels]);

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

  const varianceSheets = useMemo(() => {
    if (theoreticalSheets <= 0) return 0;
    return numActualSheets - theoreticalSheets;
  }, [numActualSheets, theoreticalSheets]);

  const wastePercentage = useMemo(() => {
    if (theoreticalSheets <= 0) return 0;
    const loss = theoreticalSheets - numActualSheets;
    return Math.round((loss / theoreticalSheets) * 1000) / 10;
  }, [theoreticalSheets, numActualSheets]);

  // Scrap credit calculations
  const numScrapWeight = parseFloat(scrapWeightKg) || 0;
  const numScrapRate = parseFloat(scrapRatePerKg) || 0;
  const numCores = parseFloat(coreCount) || 0;
  const numCoreRate = parseFloat(coreRatePerPc) || 0;

  const totalScrapCredit = useMemo(() => {
    return (numScrapWeight * numScrapRate) + (numCores * numCoreRate);
  }, [numScrapWeight, numScrapRate, numCores, numCoreRate]);

  // Landed cost allocation & accurate costing
  const netProductionCost = useMemo(() => {
    return Math.max(0, totalInputCost - totalScrapCredit);
  }, [totalInputCost, totalScrapCredit]);

  const effectiveCostPerSheet = useMemo(() => {
    if (numActualSheets <= 0) return 0;
    return Math.round((netProductionCost / numActualSheets) * 10000) / 10000;
  }, [netProductionCost, numActualSheets]);

  const effectiveCostPerReam = useMemo(() => {
    if (numActualReams <= 0) return 0;
    return Math.round((netProductionCost / numActualReams) * 100) / 100;
  }, [netProductionCost, numActualReams]);

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
        scrapWeightKg: numScrapWeight,
        scrapRatePerKg: numScrapRate,
        coreCount: numCores,
        coreRatePerPc: numCoreRate,
        totalScrapCredit,
        netProductionCost,
        effectiveCostPerSheet,
        effectiveCostPerReam,
        destinationLocationId,
        machineName,
        operatorName,
        notes
      };

      const res = await createCuttingSlipV2(payload);
      if (onSaved) onSaved(res.cuttingSlip);
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
      className="max-h-[96vh] h-[95vh] w-full"
      padding="p-0"
      hideCloseButton={true}
    >
      <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans">
        {/* Voucher Header (Clean, Light, Modern ERP Style) */}
        <div className="px-5 py-3.5 bg-white border-b border-slate-200/90 flex items-center justify-between shrink-0 shadow-3xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0 shadow-3xs">
              <Scissors className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-mono font-black text-sm sm:text-base tracking-wider text-teal-900 bg-teal-50 px-3 py-1 rounded-xl border border-teal-300 shadow-3xs">
                  {slipNumber || 'CS-001'}
                </span>
                <span className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200 uppercase tracking-wider">
                  CUTTING SLIP VOUCHER (STOCK CONVERSION)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Reel → Sheet Stock Journal with Live Discrepancy & Scrap Reconciliation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200 text-sm">
              <span className="text-slate-500 font-semibold text-xs">Date:</span>
              <input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)}
                className="bg-transparent text-slate-800 font-mono text-sm focus:outline-none cursor-pointer font-bold"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsPrintMode(!isPrintMode)}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-3xs transition-all cursor-pointer"
              title="Toggle printable machine slip view"
            >
              <Printer className="w-4 h-4 text-teal-600" />
              <span>{isPrintMode ? 'Voucher View' : 'Print Slip'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable View */}
        {isPrintMode ? (
          <div className="flex-1 p-8 bg-white overflow-y-auto print:p-0">
            <div className="max-w-4xl mx-auto border-2 border-slate-800 p-6 rounded-xl space-y-6">
              <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">SRI KRISHNA BOOK WORKS</h2>
                  <p className="text-xs text-slate-600 font-medium">PAPER SHEETING & SLITTING JOB ORDER SLIP</p>
                </div>
                <div className="text-right font-mono">
                  <div className="text-sm font-bold text-slate-900">{slipNumber || 'CS-001'}</div>
                  <div className="text-xs text-slate-500">{date}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="border border-slate-200 p-3 rounded-lg">
                  <span className="font-bold text-slate-700 block mb-1">INPUT (REELS MOUNTED)</span>
                  <div>SKU: <span className="font-bold">{sourceSkuDoc?.name || 'Reels'}</span></div>
                  <div>Batch: <span className="font-bold font-mono">{selectedReels[0]?.purchaseBatch || 'N/A'}</span></div>
                  <div>Reels Count: <span className="font-bold">{selectedReels.length}</span></div>
                  <div>Total Weight: <span className="font-bold font-mono">{totalInputWeight} Kg</span></div>
                </div>
                <div className="border border-slate-200 p-3 rounded-lg">
                  <span className="font-bold text-slate-700 block mb-1">OUTPUT (SHEETS REQUIRED)</span>
                  <div>Target SKU: <span className="font-bold">{selectedTargetSkuDoc?.name || 'Sheets'}</span></div>
                  <div>Cut Size: <span className="font-bold">{sheetWidth} x {sheetLength} cm ({sheetGsm} GSM)</span></div>
                  <div>Machine Meter: <span className="font-bold font-mono">{cutsCountInput || '0'} Cuts ({reelsOnStand} Reels on Stand × {slitsCount} Slits)</span></div>
                  <div>Theoretical: <span className="font-bold font-mono">{theoreticalSheets} Sheets ({theoreticalReams} Reams)</span></div>
                  <div>Actual Good: <span className="font-bold font-mono text-emerald-700">{numActualSheets} Sheets ({numActualReams} Reams)</span></div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-3">
                <span className="font-bold text-xs text-slate-700 block mb-2">INDIVIDUAL REELS LOG</span>
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b text-slate-500 font-mono">
                      <th className="py-1">#</th>
                      <th className="py-1">Reel Number</th>
                      <th className="py-1">Weight (Kg)</th>
                      <th className="py-1">Width (cm)</th>
                      <th className="py-1">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReels.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-1">{i + 1}</td>
                        <td className="py-1 font-mono font-bold">{r.reelNumber}</td>
                        <td className="py-1 font-mono">{r.weight} kg</td>
                        <td className="py-1">{r.width || sheetWidth} cm</td>
                        <td className="py-1 text-slate-500">{r.locationName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-end pt-8 text-xs border-t border-slate-200">
                <div className="space-y-1">
                  <div>Machine: <span className="font-bold">{machineName}</span></div>
                  <div>Operator: <span className="font-bold">{operatorName || '______________'}</span></div>
                </div>
                <div className="text-center">
                  <div className="w-40 border-b border-slate-400 mb-1"></div>
                  <span className="text-[10px] text-slate-500">Supervisor Signature</span>
                </div>
              </div>

              <div className="flex justify-end pt-4 gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" /> Print Hardcopy
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Dual-Pane Voucher View (Tally Stock Journal) */
          <div className="flex-1 flex flex-col p-4 overflow-hidden gap-3 min-h-0">
            {/* Top Toolbar */}
            <div className="bg-white px-3.5 py-2.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between gap-4 flex-wrap text-sm shrink-0">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Machine:</span>
                  <input
                    type="text"
                    value={machineName}
                    onChange={e => setMachineName(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all w-36 sm:w-44"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Operator:</span>
                  <input
                    type="text"
                    value={operatorName}
                    onChange={e => setOperatorName(e.target.value)}
                    placeholder="Operator name"
                    className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all w-40 sm:w-48 placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs sm:text-sm text-slate-500 font-medium">
                <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-3xs">
                  Available Stock: <span className="font-mono font-bold text-slate-900">{availableReels.length} Reels</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-3xs">
                  Paper Items: <span className="font-mono font-bold text-slate-900">{reelItemsWithStock.length} SKUs</span>
                </div>
              </div>
            </div>

            {/* Split Screen: Left (Consumption) vs Right (Production) */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0 overflow-hidden">
              {/* ── LEFT PANE: CONSUMPTION (Source Reels: Item -> Purchase Batch -> Reels) ── */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
                <div className="p-3 bg-rose-50/60 border-b border-rose-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-black text-xs shadow-3xs">
                      1
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                        Consumption (Source Reels Out)
                      </h4>
                      <p className="text-xs text-slate-500">
                        Select paper reel item, then choose reels by purchase batch
                      </p>
                    </div>
                  </div>
                </div>

                {/* 1. Paper Reel Item Searchable Dropdown Popover matching Target SKU */}
                <div className="p-3 bg-slate-50/90 border-b border-slate-200/80 space-y-1.5 relative" ref={reelDropdownRef}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-rose-600" />
                      <span>Select Reel Item:</span>
                    </span>
                    <span className="text-slate-500 font-medium text-xs">
                      {reelItemsWithStock.length} Reel {reelItemsWithStock.length === 1 ? 'Item' : 'Items'} available
                    </span>
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={showReelDropdown ? reelItemSearch : (selectedReelItemDoc ? `${selectedReelItemDoc.name} ${selectedReelItemDoc.code ? `(${selectedReelItemDoc.code})` : ''}` : '')}
                      onChange={e => {
                        setReelItemSearch(e.target.value);
                        setShowReelDropdown(true);
                      }}
                      onClick={() => setShowReelDropdown(true)}
                      onFocus={() => setShowReelDropdown(true)}
                      placeholder="Search or select paper reel SKU..."
                      className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500 shadow-2xs cursor-pointer transition-all"
                    />
                    <div className="absolute right-3 top-2.5 flex items-center gap-1 text-slate-400">
                      {selectedReelItemKey ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReelItemKey('');
                            setSelectedBatch('ALL');
                            setSelectedReelIds(new Set());
                            setReelItemSearch('');
                          }}
                          className="p-1 hover:text-slate-600 rounded cursor-pointer"
                          title="Clear selected reel SKU"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : (
                        <ChevronDown 
                          className="w-4 h-4 cursor-pointer hover:text-slate-600" 
                          onClick={() => setShowReelDropdown(!showReelDropdown)} 
                        />
                      )}
                    </div>
                  </div>

                  {/* Dropdown Popover matching Target SKU 1:1 */}
                  {showReelDropdown && (
                    <div className="absolute left-2.5 right-2.5 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-[999] max-h-80 overflow-y-auto divide-y divide-slate-100 p-1">
                      {/* Category Filter Chips Header */}
                      <div className="sticky top-0 bg-white/95 backdrop-blur-xs p-2 border-b border-slate-100 z-10 space-y-1.5 shadow-3xs">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3 text-rose-600" />
                            <span>Filter Category:</span>
                          </span>
                          <span>Showing {filteredReelItems.length} of {reelCategoryBreakdown.total}</span>
                        </div>
                        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-thin">
                          <button
                            type="button"
                            onClick={() => setReelCategoryFilter('ALL')}
                            className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold shrink-0 transition-all cursor-pointer ${
                              reelCategoryFilter === 'ALL'
                                ? 'bg-rose-600 text-white shadow-3xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            All ({reelCategoryBreakdown.total})
                          </button>
                          {reelCategoryBreakdown.categories.slice(0, 10).map(([cat, count]) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setReelCategoryFilter(cat)}
                              className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold shrink-0 transition-all cursor-pointer ${
                                reelCategoryFilter === cat
                                  ? 'bg-rose-600 text-white shadow-3xs'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {cat} ({count})
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* List of Paper Reel SKUs */}
                      {filteredReelItems.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 italic">
                          No paper reel SKUs found matching search.
                        </div>
                      ) : (
                        filteredReelItems.map(item => {
                          const isSelected = item.key === selectedReelItemKey;
                          return (
                            <div
                              key={item.key}
                              onClick={() => handleSelectReelItem(item.key)}
                              className={`p-2.5 cursor-pointer rounded-lg transition-colors flex items-center justify-between text-xs ${
                                isSelected ? 'bg-rose-50/90 font-bold border border-rose-200' : 'hover:bg-rose-50/50'
                              }`}
                            >
                              <div className="flex-1 min-w-0 pr-3">
                                <div className="font-bold text-slate-900 break-words leading-snug text-xs sm:text-[13px]">
                                  {item.name}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="text-[10px] text-slate-400 font-mono">{item.code}</span>
                                  <span className="text-[10px] text-slate-300">•</span>
                                  <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/60">
                                    {item.category || 'Paper Reels'}
                                  </span>
                                  {(item.width || item.gsm) && (
                                    <>
                                      <span className="text-[10px] text-slate-300">•</span>
                                      <span className="text-[10px] font-semibold text-rose-700">
                                        {item.width ? `${item.width} CM` : ''} {item.gsm ? `${item.gsm} GSM` : ''}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`px-2 py-0.5 text-[9.5px] font-black rounded-full border ${
                                  item.reelsCount > 0 
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                    : 'bg-slate-100 text-slate-400 border-slate-200'
                                }`}>
                                  {item.reelsCount} {item.reelsCount === 1 ? 'Reel' : 'Reels'} ({item.totalWeight.toLocaleString()} kg)
                                </span>
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-full border bg-rose-50 text-rose-700 border-rose-200">
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
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 m-3">
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3 shadow-3xs">
                      <Package className="w-6 h-6 stroke-[1.8]" />
                    </div>
                    <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">No Paper Reel Selected</h5>
                    <p className="text-[11px] text-slate-500 max-w-xs mt-1">
                      Search and select a paper reel above to browse its available purchase batches and individual reels.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* 2. Purchase Batch Filter Tabs */}
                    <div className="px-3.5 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-thin">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-0.5">
                          Purchase Batch:
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedBatch('ALL')}
                          className={`px-3 py-1 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                            selectedBatch === 'ALL'
                              ? 'bg-rose-600 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          All Batches ({reelsForSelectedItem.length} Reels)
                        </button>
                        {batchesForSelectedItem.map(b => (
                          <button
                            key={b.batch}
                            type="button"
                            onClick={() => setSelectedBatch(b.batch)}
                            className={`px-3 py-1 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                              selectedBatch === b.batch
                                ? 'bg-rose-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {b.batch} ({b.count} Reels • ₹{b.avgRate}/kg)
                          </button>
                        ))}
                      </div>

                      {displayedReels.length > 0 && (
                        <button
                          type="button"
                          onClick={handleToggleAllDisplayed}
                          className="text-xs text-rose-700 hover:text-rose-900 font-bold shrink-0 cursor-pointer"
                        >
                          {displayedReels.every(r => selectedReelIds.has(r.id)) ? 'Deselect In View' : 'Select In View'}
                        </button>
                      )}
                    </div>

                    {/* 3. Reel Cards Grouped by Purchase Batch */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                      {displayedReels.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs">
                          No reels found in inventory for the selected item and batch.
                        </div>
                      ) : (
                        (selectedBatch === 'ALL' 
                          ? batchesForSelectedItem 
                          : [{ batch: selectedBatch, count: displayedReels.length, totalWeight: displayedReels.reduce((s, r) => s + (Number(r.weight) || 0), 0), avgRate: displayedReels[0]?.ratePerKg || 0 }]
                        ).map(batchInfo => {
                          const batchReels = displayedReels.filter(r => (r.purchaseBatch || 'No Batch') === batchInfo.batch);
                          if (batchReels.length === 0) return null;
                          const isBatchAllSelected = batchReels.every(r => selectedReelIds.has(r.id));

                          return (
                            <div key={batchInfo.batch} className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-3xs">
                              {/* Batch Header */}
                              <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-xs text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200/80 shadow-3xs">
                                    {batchInfo.batch}
                                  </span>
                                  <span className="text-xs text-slate-500 font-medium">
                                    {batchReels.length} {batchReels.length === 1 ? 'Reel' : 'Reels'} • {batchInfo.totalWeight.toLocaleString()} kg • ₹{batchInfo.avgRate}/kg
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
                                  className="text-xs font-bold text-rose-700 hover:text-rose-900 bg-white hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 cursor-pointer transition-colors"
                                >
                                  {isBatchAllSelected ? 'Deselect Batch' : `Select Batch (${batchReels.length})`}
                                </button>
                              </div>

                              {/* Individual Reels */}
                              <div className="p-2 space-y-1.5">
                                {batchReels.map(r => {
                                  const isSelected = selectedReelIds.has(r.id);
                                  const reelCost = Math.round((Number(r.weight) || 0) * (Number(r.ratePerKg) || 0));
                                  return (
                                    <div
                                      key={r.id}
                                      onClick={() => handleToggleReel(r.id)}
                                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                        isSelected
                                          ? 'bg-rose-50/80 border-rose-300 shadow-3xs'
                                          : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => {}}
                                          className="w-4 h-4 text-rose-600 rounded cursor-pointer pointer-events-none accent-rose-600"
                                        />
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold text-xs sm:text-sm text-slate-900">{r.reelNumber}</span>
                                            <span className="text-xs text-slate-500 font-medium truncate">
                                              {r.locationName || 'Godown'}
                                            </span>
                                          </div>
                                          <div className="text-xs text-slate-400 mt-0.5">
                                            {r.width ? `${r.width} cm` : ''} {r.gsm ? `• ${r.gsm} GSM` : ''}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="text-right shrink-0">
                                        <div className="font-mono font-black text-xs sm:text-sm text-slate-900">
                                          {r.weight} <span className="text-xs text-slate-500 font-normal">kg</span>
                                        </div>
                                        <div className="text-xs font-mono text-slate-500">
                                          @₹{r.ratePerKg}/kg = <span className="font-bold text-slate-800">₹{reelCost.toLocaleString('en-IN')}</span>
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
                <div className="p-3.5 bg-slate-50 border-t border-slate-200 shrink-0 flex items-center justify-between text-xs sm:text-sm">
                  <div>
                    <span className="text-slate-500 font-medium">Selected Reels: </span>
                    <span className="font-bold text-slate-900">{selectedReels.length}</span>
                  </div>
                  <div className="flex items-center gap-5">
                    <div>
                      <span className="text-slate-500 font-medium">Total Weight: </span>
                      <span className="font-mono font-black text-rose-700 text-sm sm:text-base">{totalInputWeight.toLocaleString()} kg</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Value: </span>
                      <span className="font-mono font-bold text-slate-900 text-sm sm:text-base">₹{totalInputCost.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── RIGHT PANE: GENERATION (Target Sheets & Direct Cuts Meter) ── */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
                <div className="p-3 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs shadow-3xs">
                      2
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                        Generation (Target Sheets In)
                      </h4>
                      <p className="text-xs text-slate-500">
                        Cut dimensions, dual-unit live production (Sheets ↔ Reams), & godown
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 custom-scrollbar">
                  {/* Target SKU Searchable Dropdown Popover matching Image 2 1:1 */}
                  <div className="relative" ref={targetDropdownRef}>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                      Target Converted Sheet SKU (Semi Good) *
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
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
                        className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 shadow-2xs cursor-pointer transition-all"
                      />
                      <div className="absolute right-3 top-2.5 flex items-center gap-1 text-slate-400">
                        {targetSkuId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setTargetSkuId('');
                              setTargetSkuSearch('');
                            }}
                            className="p-1 hover:text-slate-600 rounded cursor-pointer"
                            title="Clear selected target SKU"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        ) : (
                          <ChevronDown 
                            className="w-4 h-4 cursor-pointer hover:text-slate-600" 
                            onClick={() => setShowTargetDropdown(!showTargetDropdown)} 
                          />
                        )}
                      </div>
                    </div>

                    {/* Dropdown Popover matching Image 2 1:1 */}
                    {showTargetDropdown && (
                      <div className="absolute left-0 top-full mt-1 w-full min-w-[340px] sm:min-w-[460px] bg-white border border-slate-200 rounded-xl shadow-2xl z-[999] max-h-80 overflow-y-auto divide-y divide-slate-100 p-1">
                        {/* Category Filter Chips Header */}
                        <div className="sticky top-0 bg-white/95 backdrop-blur-xs p-2 border-b border-slate-100 z-10 space-y-1.5 shadow-3xs">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                            <span className="flex items-center gap-1">
                              <Tag className="w-3 h-3 text-emerald-600" />
                              <span>Shift Category:</span>
                            </span>
                            <span>Showing {filteredTargetSkus.length} of {semiCategoryBreakdown.total}</span>
                          </div>
                          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-thin">
                            <button
                              type="button"
                              onClick={() => setTargetCategoryFilter('ALL')}
                              className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold shrink-0 transition-all cursor-pointer ${
                                targetCategoryFilter === 'ALL'
                                  ? 'bg-emerald-600 text-white shadow-3xs'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              All ({semiCategoryBreakdown.total})
                            </button>
                            {semiCategoryBreakdown.categories.slice(0, 10).map(([cat, count]) => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setTargetCategoryFilter(cat)}
                                className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold shrink-0 transition-all cursor-pointer ${
                                  targetCategoryFilter === cat
                                    ? 'bg-emerald-600 text-white shadow-3xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {cat} ({count})
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* List of Semi-Finished Good SKUs */}
                        {filteredTargetSkus.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400 italic">
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
                                className={`p-2.5 cursor-pointer rounded-lg transition-colors flex items-center justify-between text-xs ${
                                  isSelected ? 'bg-emerald-50/90 font-bold border border-emerald-200' : 'hover:bg-emerald-50/50'
                                }`}
                              >
                                <div className="flex-1 min-w-0 pr-3">
                                  <div className="font-bold text-slate-900 break-words leading-snug text-xs sm:text-[13px]">{s.name}</div>
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span className="text-[10px] text-slate-400 font-mono">{s.skuCode}</span>
                                    <span className="text-[10px] text-slate-300">•</span>
                                    <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/60">
                                      {s.category || 'Semi Goods'}
                                    </span>
                                    {spec && (
                                      <>
                                        <span className="text-[10px] text-slate-300">•</span>
                                        <span className="text-[10px] font-semibold text-emerald-700">{spec}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-full border bg-purple-50 text-purple-700 border-purple-200">
                                    Semi Good
                                  </span>
                                  <span className="px-2 py-0.5 text-[9.5px] font-extrabold uppercase rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
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
                  <div className="grid grid-cols-4 gap-3 bg-slate-50/90 p-3 rounded-2xl border border-slate-200">
                    <div>
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">Width (cm)</label>
                      <input
                        type="number"
                        step="any"
                        value={sheetWidth}
                        onChange={e => setSheetWidth(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">Length (cm)</label>
                      <input
                        type="number"
                        step="any"
                        value={sheetLength}
                        onChange={e => setSheetLength(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">GSM</label>
                      <input
                        type="number"
                        step="any"
                        value={sheetGsm}
                        onChange={e => setSheetGsm(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">Sheets / Ream</label>
                      <input
                        type="number"
                        value={sheetsPerReamInput}
                        onChange={e => handleSheetsPerReamChange(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* ── MACHINE CUTTING METER (DIRECT KNIFE CUTS ONLY) ── */}
                  <div className="bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-slate-50 border border-indigo-200 rounded-2xl p-3.5 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4.5 h-4.5 text-indigo-700" />
                        <div>
                          <span className="text-xs sm:text-sm font-bold text-indigo-950 uppercase tracking-wide block">
                            Machine Cutting Meter (Direct Knife Strokes)
                          </span>
                          <span className="text-xs text-slate-500 block">
                            Derived Sheets = Knife Cuts × Reels on Stand × Slits Across
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-1">
                        <label className="text-xs font-bold text-indigo-950 uppercase tracking-wider block mb-1">
                          Knife Cuts (Strokes) *
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="1"
                            value={cutsCountInput}
                            onChange={e => handleCutsChange(e.target.value)}
                            placeholder="0"
                            className="w-full pl-3.5 pr-14 py-2.5 bg-white border-2 border-indigo-300 hover:border-indigo-400 rounded-xl text-base font-black font-mono text-indigo-950 focus:outline-none focus:ring-3 focus:ring-indigo-500/25 focus:border-indigo-600 shadow-xs transition-all"
                          />
                          <span className="absolute right-3 top-3 text-[11px] font-bold text-indigo-600 select-none">
                            CUTS
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                          Reels on Stand
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={reelsOnStandInput}
                          onChange={e => handleReelsOnStandChange(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                          Slits Across
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={slitsCountInput}
                          onChange={e => handleSlitsCountChange(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Live Cut Calculation Display */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1.5 border-t border-indigo-100 text-xs">
                      <div className="flex items-center gap-2 text-indigo-950">
                        <span className="font-semibold text-slate-600">Machine Output:</span>
                        <span className="font-mono bg-white px-2.5 py-1 rounded-lg border border-indigo-200 font-bold shadow-3xs">
                          {numCutsCount} cuts × {sheetsPerCut} sh/cut = <span className="text-indigo-700 font-black">{machineDerivedSheets.toLocaleString()} Sheets</span> ({machineDerivedReams} Reams)
                        </span>
                      </div>

                      {theoreticalCuts > 0 && (
                        <button
                          type="button"
                          onClick={handleUseTheoreticalCuts}
                          className="text-xs text-indigo-700 hover:text-indigo-950 font-bold underline flex items-center gap-1 cursor-pointer"
                          title="Auto-fill machine cuts using theoretical formula"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Use Theo Cuts: {theoreticalCuts.toLocaleString()}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Simultaneous Dual-Unit Actual Production Inputs */}
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-bold text-emerald-950 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-emerald-700" />
                        <span>Actual Good Production (Dual Unit Linked)</span>
                      </span>
                      <span className="text-xs text-emerald-800 font-semibold bg-emerald-100/70 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        1 Ream = {sheetsPerReam} Sheets
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                          Reams Produced
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={actualReamsInput}
                            onChange={e => handleReamsChange(e.target.value)}
                            placeholder="0.00"
                            className="w-full pl-3.5 pr-16 py-2.5 bg-white border-2 border-emerald-300 hover:border-emerald-400 rounded-xl text-base font-black font-mono text-emerald-950 focus:outline-none focus:ring-3 focus:ring-emerald-500/25 focus:border-emerald-600 shadow-xs transition-all"
                          />
                          <span className="absolute right-3.5 top-3 text-xs font-bold text-emerald-700 select-none">
                            REAMS
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                          Sheets Count
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={actualSheetsInput}
                            onChange={e => handleSheetsChange(e.target.value)}
                            placeholder="0"
                            className="w-full pl-3.5 pr-16 py-2.5 bg-white border-2 border-emerald-300 hover:border-emerald-400 rounded-xl text-base font-black font-mono text-emerald-950 focus:outline-none focus:ring-3 focus:ring-emerald-500/25 focus:border-emerald-600 shadow-xs transition-all"
                          />
                          <span className="absolute right-3.5 top-3 text-xs font-bold text-emerald-700 select-none">
                            SHEETS
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Theoretical vs Actual Live Variance Meter */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="font-semibold text-slate-500">Theoretical (Formula Math):</span>
                      <span className="font-mono font-bold text-slate-800">
                        {theoreticalSheets.toLocaleString()} Sheets ({theoreticalReams} Reams)
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="font-semibold text-slate-500">Machine Cuts Output:</span>
                      <span className="font-mono font-bold text-indigo-700">
                        {machineDerivedSheets.toLocaleString()} Sheets ({numCutsCount} cuts @ {reelsOnStand}R)
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="font-semibold text-slate-500">Actual Good Stock In:</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {numActualSheets.toLocaleString()} Sheets ({numActualReams} Reams)
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-bold text-slate-700">Live Production Variance:</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-mono font-black flex items-center gap-1.5 ${
                        varianceSheets < 0
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : varianceSheets > 0
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}>
                        {varianceSheets < 0 ? <AlertTriangle className="w-3.5 h-3.5 text-rose-700" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />}
                        <span>
                          {varianceSheets > 0 ? '+' : ''}{varianceSheets.toLocaleString()} Sheets ({wastePercentage > 0 ? `-${wastePercentage}% Loss` : '100% Tally'})
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Destination Location with Mini Factory Warehouse Modal */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                      Destination Warehouse Location <span className="text-rose-500">*</span>
                    </label>
                    <LocationSelectPopup
                      hideLabel
                      locations={locations}
                      warehouseId={destWarehouseId}
                      floorId={destFloorId}
                      zoneId={destZoneId}
                      locationId={destinationLocationId}
                      displayValue={destLocationDisplay}
                      badgeColor="emerald"
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

            {/* ── BOTTOM PANE: By-Products, Scrap Recovery & Landed Costing ── */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5 shrink-0">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-emerald-600" />
                  <span>Costing Valuation, Scrap Salvage & Landed Absorption</span>
                </span>
                <span className="text-xs text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Formula: Net Cost = (Reel Value - Scrap Recovery) ÷ Good Sheets
                </span>
              </div>

              {/* Real-time Costing Breakdown Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/80">
                <div className="px-3 py-1.5 bg-white rounded-xl border border-slate-200 shadow-3xs">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">1. Gross Raw Reel Input</span>
                  <span className="font-mono font-black text-slate-900 text-sm">
                    ₹{totalInputCost.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-slate-500 block font-mono">
                    {totalInputWeight.toLocaleString()} kg @ ₹{avgInputRatePerKg}/kg
                  </span>
                </div>

                <div className="px-3 py-1.5 bg-white rounded-xl border border-slate-200 shadow-3xs">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">2. Scrap Salvage Credit</span>
                  <span className="font-mono font-black text-rose-600 text-sm">
                    - ₹{totalScrapCredit.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-500 block font-mono">
                    Trim Waste + Cores
                  </span>
                </div>

                <div className="px-3 py-1.5 bg-white rounded-xl border border-slate-200 shadow-3xs">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">3. Net Converted Value</span>
                  <span className="font-mono font-black text-indigo-700 text-sm">
                    = ₹{netProductionCost.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-slate-500 block font-mono">
                    Absorbed into output
                  </span>
                </div>

                <div className="px-3 py-1.5 bg-emerald-50/90 rounded-xl border border-emerald-200 shadow-3xs">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">4. Effective Landed Rate</span>
                  <span className="font-mono font-black text-emerald-950 text-sm">
                    ₹{effectiveCostPerSheet.toFixed(3)} <span className="text-[10px] font-normal text-emerald-700">/ sheet</span>
                  </span>
                  <span className="text-[10px] text-emerald-800 block font-mono">
                    ₹{effectiveCostPerReam.toFixed(2)} / ream ({sheetsPerReam} sheets)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs items-center bg-slate-50/90 p-3 rounded-xl border border-slate-200/80">
                {/* Trimming Waste */}
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Trimming Waste (kg)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="any"
                      placeholder="0"
                      value={scrapWeightKg}
                      onChange={e => setScrapWeightKg(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                    />
                    <span className="text-xs font-mono font-bold text-slate-400">@₹</span>
                    <input
                      type="number"
                      step="any"
                      value={scrapRatePerKg}
                      onChange={e => setScrapRatePerKg(e.target.value)}
                      title="Rate per kg of trim scrap"
                      className="w-20 px-2 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs text-center"
                    />
                  </div>
                </div>

                {/* Reel Cores */}
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Reel Cores (pcs)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      placeholder="0"
                      value={coreCount}
                      onChange={e => setCoreCount(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                    />
                    <span className="text-xs font-mono font-bold text-slate-400">@₹</span>
                    <input
                      type="number"
                      step="any"
                      value={coreRatePerPc}
                      onChange={e => setCoreRatePerPc(e.target.value)}
                      title="Salvage rate per empty paper core"
                      className="w-20 px-2 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs text-center"
                    />
                  </div>
                </div>

                {/* Total Scrap Credit */}
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Total Scrap Salvage
                  </label>
                  <div className="px-3.5 py-2 bg-white border border-slate-300 rounded-xl font-mono font-black text-sm text-rose-600 shadow-2xs flex items-center h-[38px]">
                    - ₹{totalScrapCredit.toFixed(2)}
                  </div>
                </div>

                {/* Effective Landed Rate Summary */}
                <div className="bg-emerald-50 border border-emerald-300 p-2.5 rounded-xl text-right shadow-3xs">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                    Inventory Valuation Rate
                  </span>
                  <div className="font-mono font-black text-emerald-950 text-base">
                    ₹{effectiveCostPerSheet.toFixed(3)} <span className="text-xs font-normal text-emerald-700">/ sheet</span>
                  </div>
                  <div className="text-xs font-mono text-emerald-800 font-bold">
                    ₹{effectiveCostPerReam.toFixed(2)} / ream
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                    Net Batch: ₹{netProductionCost.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                  <span className="text-slate-500 font-bold">Remarks:</span>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Sized for long notebook production batch"
                    className="w-80 sm:w-96 px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-2xs"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors cursor-pointer shadow-3xs"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || selectedReels.length === 0}
                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Posting Stock Journal...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-teal-400" />
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

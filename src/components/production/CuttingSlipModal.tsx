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

  // ── 1. AVAILABLE REELS & LEFT-SIDE SELECTION BY ITEM + PURCHASE BATCH ──
  const [availableReels, setAvailableReels] = useState<AvailableReelV2[]>([]);
  const [selectedReelItemKey, setSelectedReelItemKey] = useState<string>('ALL');
  const [selectedBatch, setSelectedBatch] = useState<string>(initialBatch || 'ALL');
  const [selectedReelIds, setSelectedReelIds] = useState<Set<string>>(new Set());

  // ── 2. TARGET SHEETS SPEC & RICH SEARCHABLE SEMI-GOOD DROPDOWN ──
  const [targetSkuId, setTargetSkuId] = useState<string>('');
  const [targetSkuSearch, setTargetSkuSearch] = useState<string>('');
  const [targetCategoryFilter, setTargetCategoryFilter] = useState<string>('ALL');
  const [showTargetDropdown, setShowTargetDropdown] = useState<boolean>(false);
  const targetDropdownRef = useRef<HTMLDivElement>(null);

  const [destinationLocationId, setDestinationLocationId] = useState<string>('');
  const [sheetWidth, setSheetWidth] = useState<string>('57');
  const [sheetLength, setSheetLength] = useState<string>('70');
  const [sheetGsm, setSheetGsm] = useState<string>('52');
  const [sheetsPerReam, setSheetsPerReam] = useState<number>(500);

  // ── 3. MACHINE CUTTING METER (DIRECT KNIFE CUTS ONLY) ──
  const [cutsCountInput, setCutsCountInput] = useState<string>('');
  const [reelsOnStand, setReelsOnStand] = useState<number>(1);
  const [slitsCount, setSlitsCount] = useState<number>(1);

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

  // Close target dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (targetDropdownRef.current && !targetDropdownRef.current.contains(e.target as Node)) {
        setShowTargetDropdown(false);
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
          setDestinationLocationId(cutLoc._id);
        }

        // Auto-pick first semi-finished good if none selected
        if (semiGoodSkus.length > 0 && !targetSkuId) {
          const first = semiGoodSkus[0];
          setTargetSkuId(first._id || '');
          if (first.width) setSheetWidth(String(first.width));
          if (first.length) setSheetLength(String(first.length));
          if (first.gsm) setSheetGsm(String(first.gsm));
          if (first.altUnitConversion) {
            setSheetsPerReam(Number(first.altUnitConversion));
          } else if (first.booksGbl) {
            setSheetsPerReam(Number(first.booksGbl));
          }
        }
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
      setSheetsPerReam(Number(sku.altUnitConversion));
    } else if (sku.booksGbl) {
      setSheetsPerReam(Number(sku.booksGbl));
    }
    setTargetSkuSearch('');
    setShowTargetDropdown(false);
  };

  // ── GROUP AVAILABLE REELS BY ITEM (PAPER REEL SKU) ──
  const uniqueReelItems = useMemo(() => {
    const map = new Map<string, {
      key: string;
      skuId: string;
      code: string;
      name: string;
      category?: string;
      reelsCount: number;
      totalWeight: number;
      batches: string[];
    }>();

    availableReels.forEach(r => {
      const key = r.skuId || r.skuCode || r.skuName || 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          key,
          skuId: r.skuId,
          code: r.skuCode || '',
          name: r.skuName || 'Paper Reel',
          reelsCount: 0,
          totalWeight: 0,
          batches: []
        });
      }
      const item = map.get(key)!;
      item.reelsCount += 1;
      item.totalWeight += Number(r.weight) || 0;
      if (r.purchaseBatch && !item.batches.includes(r.purchaseBatch)) {
        item.batches.push(r.purchaseBatch);
      }
    });

    return Array.from(map.values()).sort((a, b) => b.reelsCount - a.reelsCount);
  }, [availableReels]);

  // Default selectedReelItemKey
  useEffect(() => {
    if (uniqueReelItems.length > 0 && (selectedReelItemKey === 'ALL' || !uniqueReelItems.some(i => i.key === selectedReelItemKey))) {
      if (initialSkuId && uniqueReelItems.some(i => i.skuId === initialSkuId || i.key === initialSkuId)) {
        setSelectedReelItemKey(initialSkuId);
      } else {
        setSelectedReelItemKey(uniqueReelItems[0].key);
      }
    }
  }, [uniqueReelItems, initialSkuId]);

  // Reels for the selected item
  const reelsForSelectedItem = useMemo(() => {
    if (selectedReelItemKey === 'ALL') return availableReels;
    return availableReels.filter(r => (r.skuId || r.skuCode || r.skuName) === selectedReelItemKey);
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

  // Sync reels on stand with selected reels count
  useEffect(() => {
    if (selectedReels.length > 0) {
      setReelsOnStand(selectedReels.length);
    }
  }, [selectedReels.length]);

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

  const handleReelsOnStandChange = (val: number) => {
    const r = Math.max(1, val);
    setReelsOnStand(r);
    const cuts = parseFloat(cutsCountInput);
    if (!isNaN(cuts) && cuts > 0) {
      const perCut = r * Math.max(1, slitsCount);
      const totalGenSheets = Math.round(cuts * perCut);
      setActualSheetsInput(String(totalGenSheets));
      const spr = sheetsPerReam || 500;
      setActualReamsInput(String(Math.round((totalGenSheets / spr) * 100) / 100));
    }
  };

  const handleSlitsCountChange = (val: number) => {
    const s = Math.max(1, val);
    setSlitsCount(s);
    const cuts = parseFloat(cutsCountInput);
    if (!isNaN(cuts) && cuts > 0) {
      const perCut = Math.max(1, reelsOnStand) * s;
      const totalGenSheets = Math.round(cuts * perCut);
      setActualSheetsInput(String(totalGenSheets));
      const spr = sheetsPerReam || 500;
      setActualReamsInput(String(Math.round((totalGenSheets / spr) * 100) / 100));
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
        {/* Voucher Header (Tally Manufacturing Style) */}
        <div className="px-5 py-3 bg-slate-900 text-white flex items-center justify-between shrink-0 shadow-md border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm tracking-wide text-teal-300">
                  {slipNumber || 'CS-2026-0001'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30">
                  CUTTING SLIP VOUCHER (STOCK CONVERSION)
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Reel → Sheet Stock Journal with Live Discrepancy & Scrap Reconciliation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1 rounded-xl border border-slate-700 text-xs">
              <span className="text-slate-400">Date:</span>
              <input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)}
                className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsPrintMode(!isPrintMode)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Toggle printable machine slip view"
            >
              <Printer className="w-3.5 h-3.5 text-teal-400" />
              <span>{isPrintMode ? 'Voucher View' : 'Print Slip'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
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
                  <div className="text-sm font-bold text-slate-900">{slipNumber}</div>
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
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-4 flex-wrap text-xs shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold">Machine:</span>
                  <input
                    type="text"
                    value={machineName}
                    onChange={e => setMachineName(e.target.value)}
                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold">Operator:</span>
                  <input
                    type="text"
                    value={operatorName}
                    onChange={e => setOperatorName(e.target.value)}
                    placeholder="Operator name"
                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
                <div>
                  Available Stock: <span className="font-bold text-slate-900">{availableReels.length} Reels</span>
                </div>
                <div>
                  Paper Items: <span className="font-bold text-slate-900">{uniqueReelItems.length} SKUs</span>
                </div>
              </div>
            </div>

            {/* Split Screen: Left (Consumption) vs Right (Production) */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0 overflow-hidden">
              {/* ── LEFT PANE: CONSUMPTION (Source Reels: Item -> Purchase Batch -> Reels) ── */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
                <div className="p-3 bg-rose-50/50 border-b border-rose-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xs">
                      1
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        Consumption (Source Reels Out)
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        Select paper reel item, then choose reels by purchase batch
                      </p>
                    </div>
                  </div>
                </div>

                {/* 1. Item Selector */}
                <div className="p-2.5 bg-slate-50/90 border-b border-slate-200/80 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-rose-600" />
                      <span>Select Reel Item:</span>
                    </span>
                    <span className="text-slate-400 font-medium">
                      {uniqueReelItems.length} Reel {uniqueReelItems.length === 1 ? 'Item' : 'Items'} available
                    </span>
                  </div>
                  <select
                    value={selectedReelItemKey}
                    onChange={e => {
                      setSelectedReelItemKey(e.target.value);
                      setSelectedBatch('ALL');
                    }}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-3xs cursor-pointer"
                  >
                    {uniqueReelItems.map(item => (
                      <option key={item.key} value={item.key}>
                        {item.name} {item.code ? `(${item.code})` : ''} • {item.reelsCount} Reels ({item.totalWeight.toLocaleString()} kg)
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Purchase Batch Filter Tabs */}
                <div className="px-3 py-2 bg-white border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                      Purchase Batch:
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedBatch('ALL')}
                      className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold shrink-0 transition-all cursor-pointer ${
                        selectedBatch === 'ALL'
                          ? 'bg-rose-600 text-white shadow-3xs'
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
                        className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold shrink-0 transition-all cursor-pointer ${
                          selectedBatch === b.batch
                            ? 'bg-rose-600 text-white shadow-3xs'
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
                      className="text-[11px] text-rose-700 hover:text-rose-900 font-bold shrink-0 cursor-pointer"
                    >
                      {displayedReels.every(r => selectedReelIds.has(r.id)) ? 'Deselect In View' : 'Select In View'}
                    </button>
                  )}
                </div>

                {/* 3. Reel Cards Grouped by Purchase Batch */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar">
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
                          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200/80 shadow-3xs">
                                {batchInfo.batch}
                              </span>
                              <span className="text-[10px] text-slate-500 font-medium">
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
                              className="text-[10px] font-bold text-rose-700 hover:text-rose-900 bg-white hover:bg-rose-50 px-2 py-0.5 rounded border border-rose-200 cursor-pointer transition-colors"
                            >
                              {isBatchAllSelected ? 'Deselect Batch' : `Select Batch (${batchReels.length})`}
                            </button>
                          </div>

                          {/* Individual Reels */}
                          <div className="p-1.5 space-y-1">
                            {batchReels.map(r => {
                              const isSelected = selectedReelIds.has(r.id);
                              const reelCost = Math.round((Number(r.weight) || 0) * (Number(r.ratePerKg) || 0));
                              return (
                                <div
                                  key={r.id}
                                  onClick={() => handleToggleReel(r.id)}
                                  className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                                    isSelected
                                      ? 'bg-rose-50/80 border-rose-300 shadow-3xs'
                                      : 'bg-white border-slate-200/70 hover:bg-slate-50 hover:border-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {}}
                                      className="w-4 h-4 text-rose-600 rounded cursor-pointer pointer-events-none accent-rose-600"
                                    />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-xs text-slate-900">{r.reelNumber}</span>
                                        <span className="text-[10px] text-slate-500 font-medium truncate">
                                          {r.locationName || 'Godown'}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-400 mt-0.5">
                                        {r.width ? `${r.width} cm` : ''} {r.gsm ? `• ${r.gsm} GSM` : ''}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="text-right shrink-0">
                                    <div className="font-mono font-black text-xs text-slate-900">
                                      {r.weight} <span className="text-[10px] text-slate-500 font-normal">kg</span>
                                    </div>
                                    <div className="text-[10px] font-mono text-slate-500">
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

                {/* Left Footer Summary */}
                <div className="p-3 bg-slate-50 border-t border-slate-200 shrink-0 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500">Selected Reels: </span>
                    <span className="font-bold text-slate-900">{selectedReels.length}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-slate-500">Total Weight: </span>
                      <span className="font-mono font-black text-rose-700 text-sm">{totalInputWeight.toLocaleString()} kg</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Value: </span>
                      <span className="font-mono font-bold text-slate-900">₹{totalInputCost.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── RIGHT PANE: GENERATION (Target Sheets & Direct Cuts Meter) ── */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
                <div className="p-3 bg-emerald-50/50 border-b border-emerald-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                      2
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        Generation (Target Sheets In)
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        Cut dimensions, dual-unit live production (Sheets ↔ Reams), & godown
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                  {/* Target SKU Searchable Dropdown Popover matching Image 2 1:1 */}
                  <div className="relative" ref={targetDropdownRef}>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Target Converted Sheet SKU (Semi Good) *
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
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
                        className="w-full pl-8 pr-10 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-3xs cursor-pointer"
                      />
                      <div className="absolute right-2 top-2 flex items-center gap-1 text-slate-400">
                        {targetSkuId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setTargetSkuId('');
                              setTargetSkuSearch('');
                            }}
                            className="p-0.5 hover:text-slate-600 rounded cursor-pointer"
                            title="Clear selected target SKU"
                          >
                            <X className="w-3.5 h-3.5" />
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
                  <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 uppercase block mb-0.5">Width (cm)</label>
                      <input
                        type="number"
                        step="any"
                        value={sheetWidth}
                        onChange={e => setSheetWidth(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 uppercase block mb-0.5">Length (cm)</label>
                      <input
                        type="number"
                        step="any"
                        value={sheetLength}
                        onChange={e => setSheetLength(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 uppercase block mb-0.5">GSM</label>
                      <input
                        type="number"
                        step="any"
                        value={sheetGsm}
                        onChange={e => setSheetGsm(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 uppercase block mb-0.5">Sheets / Ream</label>
                      <input
                        type="number"
                        value={sheetsPerReam}
                        onChange={e => setSheetsPerReam(Number(e.target.value) || 500)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-900"
                      />
                    </div>
                  </div>

                  {/* ── MACHINE CUTTING METER (DIRECT KNIFE CUTS ONLY) ── */}
                  <div className="bg-gradient-to-br from-indigo-50/70 via-blue-50/50 to-slate-50 border border-indigo-200/90 rounded-2xl p-3 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-indigo-700" />
                        <div>
                          <span className="text-xs font-bold text-indigo-950 uppercase tracking-wide block">
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
                        <label className="text-[10px] font-bold text-indigo-900 uppercase block mb-1">
                          Knife Cuts (Strokes) *
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="1"
                            value={cutsCountInput}
                            onChange={e => handleCutsChange(e.target.value)}
                            placeholder="0"
                            className="w-full pl-3 pr-12 py-1.5 bg-white border border-indigo-300 rounded-xl text-sm font-black font-mono text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-3xs"
                          />
                          <span className="absolute right-2.5 top-2 text-[10px] font-bold text-indigo-600 select-none">
                            CUTS
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                          Reels on Stand
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={reelsOnStand}
                          onChange={e => handleReelsOnStandChange(parseInt(e.target.value) || 1)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                          Slits Across
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={slitsCount}
                          onChange={e => handleSlitsCountChange(parseInt(e.target.value) || 1)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Live Cut Calculation Display */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-indigo-100 text-[11px]">
                      <div className="flex items-center gap-2 text-indigo-900">
                        <span className="font-semibold text-slate-600">Machine Output:</span>
                        <span className="font-mono bg-white px-2 py-0.5 rounded border border-indigo-200/80 font-bold">
                          {numCutsCount} cuts × {sheetsPerCut} sh/cut = <span className="text-indigo-700">{machineDerivedSheets.toLocaleString()} Sheets</span> ({machineDerivedReams} Reams)
                        </span>
                      </div>

                      {theoreticalCuts > 0 && (
                        <button
                          type="button"
                          onClick={handleUseTheoreticalCuts}
                          className="text-[10.5px] text-indigo-700 hover:text-indigo-950 font-bold underline flex items-center gap-1 cursor-pointer"
                          title="Auto-fill machine cuts using theoretical formula"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Use Theo Cuts: {theoreticalCuts.toLocaleString()}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Simultaneous Dual-Unit Actual Production Inputs */}
                  <div className="bg-emerald-50/40 border border-emerald-200/80 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Actual Good Production (Dual Unit Linked)</span>
                      </span>
                      <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-100/60 px-2 py-0.5 rounded-full">
                        1 Ream = {sheetsPerReam} Sheets
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                          Reams Produced
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={actualReamsInput}
                            onChange={e => handleReamsChange(e.target.value)}
                            placeholder="0.00"
                            className="w-full pl-3 pr-14 py-2 bg-white border border-emerald-300 rounded-xl text-sm font-black font-mono text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-3xs"
                          />
                          <span className="absolute right-3 top-2 text-xs font-bold text-emerald-600 select-none">
                            REAMS
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                          Sheets Count
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={actualSheetsInput}
                            onChange={e => handleSheetsChange(e.target.value)}
                            placeholder="0"
                            className="w-full pl-3 pr-14 py-2 bg-white border border-emerald-300 rounded-xl text-sm font-black font-mono text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-3xs"
                          />
                          <span className="absolute right-3 top-2 text-xs font-bold text-emerald-600 select-none">
                            SHEETS
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Theoretical vs Actual Live Variance Meter */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-500">Theoretical (Formula Math):</span>
                      <span className="font-mono font-bold text-slate-800">
                        {theoreticalSheets.toLocaleString()} Sheets ({theoreticalReams} Reams)
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-500">Machine Cuts Output:</span>
                      <span className="font-mono font-bold text-indigo-700">
                        {machineDerivedSheets.toLocaleString()} Sheets ({numCutsCount} cuts @ {reelsOnStand}R)
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-500">Actual Good Stock In:</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {numActualSheets.toLocaleString()} Sheets ({numActualReams} Reams)
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Live Production Variance:</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-black flex items-center gap-1 ${
                        varianceSheets < 0
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : varianceSheets > 0
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}>
                        {varianceSheets < 0 ? <AlertTriangle className="w-3 h-3 text-rose-700" /> : <CheckCircle2 className="w-3 h-3 text-emerald-700" />}
                        <span>
                          {varianceSheets > 0 ? '+' : ''}{varianceSheets.toLocaleString()} Sheets ({wastePercentage > 0 ? `-${wastePercentage}% Loss` : '100% Tally'})
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Destination Location */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Destination Warehouse Location *
                    </label>
                    <select
                      value={destinationLocationId}
                      onChange={e => setDestinationLocationId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {locations.map(loc => (
                        <option key={loc._id} value={loc._id}>
                          {loc.name} {loc.code ? `(${loc.code})` : ''} - {loc.level || 'Location'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ── BOTTOM PANE: By-Products, Scrap Recovery & Landed Costing ── */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs space-y-2 shrink-0">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-slate-700" />
                  <span>By-Products, Scrap Recovery & Landed Rate Absorption</span>
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  Material loss cost is absorbed into good sheets for zero-discrepancy costing
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                {/* Trimming Waste */}
                <div>
                  <label className="text-[9.5px] font-bold text-slate-500 uppercase block mb-0.5">
                    Trimming Waste (kg)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="any"
                      placeholder="0"
                      value={scrapWeightKg}
                      onChange={e => setScrapWeightKg(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-800"
                    />
                    <span className="text-[10px] font-mono text-slate-400">@₹</span>
                    <input
                      type="number"
                      step="any"
                      value={scrapRatePerKg}
                      onChange={e => setScrapRatePerKg(e.target.value)}
                      className="w-14 px-1.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-800"
                    />
                  </div>
                </div>

                {/* Reel Cores */}
                <div>
                  <label className="text-[9.5px] font-bold text-slate-500 uppercase block mb-0.5">
                    Reel Cores (pcs)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      placeholder="0"
                      value={coreCount}
                      onChange={e => setCoreCount(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-800"
                    />
                    <span className="text-[10px] font-mono text-slate-400">@₹</span>
                    <input
                      type="number"
                      step="any"
                      value={coreRatePerPc}
                      onChange={e => setCoreRatePerPc(e.target.value)}
                      className="w-14 px-1.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-800"
                    />
                  </div>
                </div>

                {/* Total Scrap Credit */}
                <div>
                  <label className="text-[9.5px] font-bold text-slate-500 uppercase block mb-0.5">
                    Total Scrap Salvage
                  </label>
                  <div className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-mono font-bold text-xs text-slate-700">
                    - ₹{totalScrapCredit.toFixed(2)}
                  </div>
                </div>

                {/* Effective Landed Rate */}
                <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-xl text-right">
                  <span className="text-[9px] font-bold text-emerald-800 uppercase block">
                    Effective Landed Sheet Cost
                  </span>
                  <div className="font-mono font-black text-emerald-950 text-sm">
                    ₹{effectiveCostPerSheet.toFixed(3)} <span className="text-[10px] font-normal text-emerald-700">/ sheet</span>
                  </div>
                  <div className="text-[10px] font-mono text-emerald-800">
                    ₹{effectiveCostPerReam.toFixed(2)} / ream
                  </div>
                  <div className="text-[9px] text-slate-400 mt-0.5">
                    Net: ₹{netProductionCost.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Remarks:</span>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Sized for long notebook production batch"
                    className="w-72 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || selectedReels.length === 0}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Posting Stock Journal...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
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

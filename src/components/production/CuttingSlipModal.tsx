import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Scissors, Printer, CheckCircle2, AlertTriangle, 
  ArrowRight, Layers, Box, Scale, RefreshCw, FileText,
  Activity, RotateCcw, Calculator
} from 'lucide-react';
import Modal from '../ui/Modal';
import { 
  SkuV2, WarehouseLocationV2, AvailableReelV2, 
  getNextCuttingSlipNumberV2, getAvailableReelsV2, createCuttingSlipV2, CuttingSlipV2
} from '../../api/mfgApiV2';

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

  // Available & Selected Reels
  const [availableReels, setAvailableReels] = useState<AvailableReelV2[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>(initialBatch || 'ALL');
  const [selectedReelIds, setSelectedReelIds] = useState<Set<string>>(new Set());

  // Target Sheets Spec
  const [targetSkuId, setTargetSkuId] = useState<string>('');
  const [destinationLocationId, setDestinationLocationId] = useState<string>('');
  const [sheetWidth, setSheetWidth] = useState<string>('57');
  const [sheetLength, setSheetLength] = useState<string>('70');
  const [sheetGsm, setSheetGsm] = useState<string>('52');
  const [sheetsPerReam, setSheetsPerReam] = useState<number>(500);

  // Machine Sheeter Meter & Knife Strokes
  const [cutsCountInput, setCutsCountInput] = useState<string>('');
  const [startMeterReading, setStartMeterReading] = useState<string>('');
  const [endMeterReading, setEndMeterReading] = useState<string>('');
  const [reelsOnStand, setReelsOnStand] = useState<number>(1);
  const [slitsCount, setSlitsCount] = useState<number>(1);
  const [meterMode, setMeterMode] = useState<'cuts' | 'odometer'>('cuts');

  // Simultaneous Dual Units (Sheets <-> Reams)
  const [actualSheetsInput, setActualSheetsInput] = useState<string>('');
  const [actualReamsInput, setActualReamsInput] = useState<string>('');

  // Scrap & By-products
  const [scrapWeightKg, setScrapWeightKg] = useState<string>('');
  const [scrapRatePerKg, setScrapRatePerKg] = useState<string>('18');
  const [coreCount, setCoreCount] = useState<string>('');
  const [coreRatePerPc, setCoreRatePerPc] = useState<string>('15');

  // Print Mode State
  const [isPrintMode, setIsPrintMode] = useState(false);

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
        setAvailableReels(reelsRes.availableReels || []);

        // Default destination location
        if (locations.length > 0 && !destinationLocationId) {
          const cutLoc = locations.find(l => 
            (l.name || '').toLowerCase().includes('cut') || 
            (l.name || '').toLowerCase().includes('sheet') ||
            (l.name || '').toLowerCase().includes('gnd')
          ) || locations[0];
          setDestinationLocationId(cutLoc._id);
        }

        // If initial SKU provided or auto-pick first sheet SKU
        const sheetSkus = skus.filter(s => 
          s.paperType === 'Sheets' || 
          (s.category || '').toLowerCase().includes('sheet') ||
          (s.name || '').toLowerCase().includes('sheet')
        );
        if (sheetSkus.length > 0 && !targetSkuId) {
          setTargetSkuId(sheetSkus[0]._id);
          if (sheetSkus[0].width) setSheetWidth(String(sheetSkus[0].width));
          if (sheetSkus[0].length) setSheetLength(String(sheetSkus[0].length));
          if (sheetSkus[0].gsm) setSheetGsm(String(sheetSkus[0].gsm));
          if (sheetSkus[0].altUnitConversion) setSheetsPerReam(sheetSkus[0].altUnitConversion);
        }
      } catch (err) {
        console.error('Failed to init cutting slip voucher:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInit();
    return () => { isMounted = false; };
  }, [isOpen, companyId]);

  // Target SKU change auto-fills dimensions
  const handleTargetSkuChange = (skuId: string) => {
    setTargetSkuId(skuId);
    const sku = skus.find(s => s._id === skuId);
    if (sku) {
      if (sku.width) setSheetWidth(String(sku.width));
      if (sku.length) setSheetLength(String(sku.length));
      if (sku.gsm) setSheetGsm(String(sku.gsm));
      if (sku.altUnitConversion) setSheetsPerReam(sku.altUnitConversion);
    }
  };

  // Unique batches available
  const availableBatches = useMemo(() => {
    const batches = new Set<string>();
    availableReels.forEach(r => {
      if (r.purchaseBatch) batches.add(r.purchaseBatch);
    });
    return Array.from(batches);
  }, [availableReels]);

  // Filtered reels by batch
  const displayedReels = useMemo(() => {
    if (selectedBatch === 'ALL') return availableReels;
    return availableReels.filter(r => r.purchaseBatch === selectedBatch);
  }, [availableReels, selectedBatch]);

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
    const allSelected = displayedReels.every(r => selectedReelIds.has(r.id));
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

  // Source consumption metrics
  const totalInputWeight = useMemo(() => {
    return selectedReels.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
  }, [selectedReels]);

  const avgInputRatePerKg = useMemo(() => {
    if (totalInputWeight <= 0) return 0;
    const totalCost = selectedReels.reduce((sum, r) => sum + ((Number(r.weight) || 0) * (Number(r.ratePerKg) || 60)), 0);
    return Math.round((totalCost / totalInputWeight) * 100) / 100;
  }, [selectedReels, totalInputWeight]);

  const totalInputCost = useMemo(() => {
    return Math.round(totalInputWeight * avgInputRatePerKg * 100) / 100;
  }, [totalInputWeight, avgInputRatePerKg]);

  // Primary source SKU
  const sourceSkuDoc = useMemo(() => {
    if (selectedReels.length === 0) return null;
    return skus.find(s => s._id === selectedReels[0].skuId) || null;
  }, [selectedReels, skus]);

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

  // Machine Sheeter Output Formulas:
  // 1 Cut Stroke cuts across all reels mounted on stand and slits across width
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

  // Machine Meter Handlers
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

  const handleMeterReadingChange = (startVal: string, endVal: string) => {
    setStartMeterReading(startVal);
    setEndMeterReading(endVal);
    const s = parseFloat(startVal);
    const e = parseFloat(endVal);
    if (!isNaN(s) && !isNaN(e) && e >= s) {
      const diff = Math.round(e - s);
      setCutsCountInput(String(diff));
      const totalGenSheets = Math.round(diff * sheetsPerCut);
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

  // Landed cost allocation
  const netProductionCost = useMemo(() => {
    return Math.max(0, totalInputCost - totalScrapCredit);
  }, [totalInputCost, totalScrapCredit]);

  const effectiveCostPerSheet = useMemo(() => {
    if (numActualSheets <= 0) return 0;
    return Math.round((netProductionCost / numActualSheets) * 1000) / 1000;
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
        startMeterReading: parseFloat(startMeterReading) || 0,
        endMeterReading: parseFloat(endMeterReading) || 0,
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
                Tally-style Reel $\rightarrow$ Sheet Stock Journal with Live Discrepancy & Scrap Reconciliation
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
                  <div>Target SKU: <span className="font-bold">{skus.find(s => s._id === targetSkuId)?.name || 'Sheets'}</span></div>
                  <div>Cut Size: <span className="font-bold">{sheetWidth} x {sheetLength} cm ({sheetGsm} GSM)</span></div>
                  <div>Machine Meter: <span className="font-bold font-mono">{cutsCountInput || '0'} Cuts ({reelsOnStand} Reels on Stand × {slitsCount} Slits)</span></div>
                  {(startMeterReading || endMeterReading) ? (
                    <div>Odometer: <span className="font-bold font-mono">{startMeterReading || '0'} → {endMeterReading || '0'}</span></div>
                  ) : null}
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
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-4 flex-wrap text-xs shrink-0">
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

              <div className="flex items-center gap-3">
                <span className="text-slate-500 font-semibold">Filter Batch (PB):</span>
                <select
                  value={selectedBatch}
                  onChange={e => setSelectedBatch(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="ALL">All Batches ({availableReels.length} Reels)</option>
                  {availableBatches.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Split Screen: Left (Consumption) vs Right (Production) */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0 overflow-hidden">
              {/* LEFT PANE: CONSUMPTION (Source Reels) */}
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
                        Select raw reels loaded onto sheeting stand from godowns
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleAllDisplayed}
                    className="text-[11px] text-rose-700 hover:text-rose-900 font-bold cursor-pointer"
                  >
                    {displayedReels.every(r => selectedReelIds.has(r.id)) ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                {/* Reels Table */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                  {displayedReels.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      No reels found in inventory for the selected batch.
                    </div>
                  ) : (
                    displayedReels.map(r => {
                      const isSelected = selectedReelIds.has(r.id);
                      return (
                        <div
                          key={r.id}
                          onClick={() => handleToggleReel(r.id)}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'bg-rose-50/80 border-rose-300 shadow-2xs'
                              : 'bg-white border-slate-200/80 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="w-4 h-4 text-rose-600 rounded cursor-pointer pointer-events-none"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-xs text-slate-900">{r.reelNumber}</span>
                                <span className="text-[9.5px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded font-mono">
                                  {r.purchaseBatch}
                                </span>
                              </div>
                              <div className="text-[10.5px] text-slate-500 truncate mt-0.5">
                                {r.skuName} • <span className="text-slate-400">{r.locationName}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="font-mono font-black text-xs text-slate-900">
                              {r.weight} <span className="text-[10px] text-slate-500">kg</span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              ₹{r.ratePerKg}/kg
                            </div>
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
                      <span className="font-mono font-black text-rose-700 text-sm">{totalInputWeight} kg</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Value: </span>
                      <span className="font-mono font-bold text-slate-900">₹{totalInputCost.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT PANE: GENERATION (Target Sheets & Live Variance) */}
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
                        Cut dimensions, dual-unit live production (Sheets $\leftrightarrow$ Reams), & godown
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                  {/* Target SKU Selector */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Target Converted Sheet SKU *
                    </label>
                    <select
                      value={targetSkuId}
                      onChange={e => handleTargetSkuChange(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">Select target converted sheet...</option>
                      {skus
                        .filter(s => s.paperType === 'Sheets' || (s.category || '').toLowerCase().includes('sheet') || (s.name || '').toLowerCase().includes('sheet'))
                        .map(s => (
                          <option key={s._id} value={s._id}>
                            {s.name} ({s.skuCode})
                          </option>
                        ))}
                    </select>
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

                  {/* Machine Sheeter Cut Meter & Blade Strokes Panel */}
                  <div className="bg-gradient-to-br from-indigo-50/70 via-blue-50/50 to-slate-50 border border-indigo-200/90 rounded-2xl p-3 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-indigo-700" />
                        <div>
                          <span className="text-xs font-bold text-indigo-950 uppercase tracking-wide block">
                            Machine Cutting Meter (Knife Strokes)
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            Derived Sheets = Knife Cuts × Reels on Stand × Slits Across
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-indigo-200/80 text-[10.5px]">
                        <button
                          type="button"
                          onClick={() => setMeterMode('cuts')}
                          className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                            meterMode === 'cuts' ? 'bg-indigo-600 text-white shadow-3xs' : 'text-slate-600 hover:text-indigo-700'
                          }`}
                        >
                          Direct Cuts
                        </button>
                        <button
                          type="button"
                          onClick={() => setMeterMode('odometer')}
                          className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                            meterMode === 'odometer' ? 'bg-indigo-600 text-white shadow-3xs' : 'text-slate-600 hover:text-indigo-700'
                          }`}
                        >
                          Meter Odometer
                        </button>
                      </div>
                    </div>

                    {meterMode === 'cuts' ? (
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
                            <span className="absolute right-2.5 top-2 text-[10px] font-bold text-indigo-600">
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
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-indigo-900 uppercase block mb-1">
                              Start Meter
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={startMeterReading}
                              onChange={e => handleMeterReadingChange(e.target.value, endMeterReading)}
                              placeholder="0"
                              className="w-full px-2.5 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-indigo-900 uppercase block mb-1">
                              End Meter
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={endMeterReading}
                              onChange={e => handleMeterReadingChange(startMeterReading, e.target.value)}
                              placeholder="0"
                              className="w-full px-2.5 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
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
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800"
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
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] bg-indigo-100/50 px-2.5 py-1 rounded-lg text-indigo-900 font-mono">
                          <span>Meter Stroke Difference: <strong>{cutsCountInput || 0} cuts</strong></span>
                          <span>1 stroke = {sheetsPerCut} sheets</span>
                        </div>
                      </div>
                    )}

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
                      <span className="font-semibold text-slate-500">Machine Meter Output:</span>
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

            {/* BOTTOM PANE: By-Products, Scrap & Landed Rate Reconciliation (Tally Style) */}
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

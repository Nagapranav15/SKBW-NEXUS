import React, { useState, useEffect, useMemo } from 'react';
import { 
  SlidersHorizontal, 
  PlusCircle, 
  MinusCircle, 
  AlertCircle, 
  Check, 
  RefreshCw, 
  Package, 
  MapPin, 
  Info, 
  Layers, 
  Building2, 
  Box, 
  X, 
  BookOpen, 
  ArrowRight, 
  CheckCircle2,
  Sliders
} from 'lucide-react';
import Modal from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { 
  SkuV2, 
  WarehouseLocationV2, 
  recordStockAdjustmentV2, 
  getBalancesV2,
  getSkuStockDetailsV2 
} from '../../api/mfgApiV2';

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
  skus,
  locations,
  initialSku,
  initialLocId,
  onAdjustmentSuccess
}) => {
  const [selectedSkuId, setSelectedSkuId] = useState<string>('');
  const [adjustmentType, setAdjustmentType] = useState<'INCREASE' | 'DECREASE'>('INCREASE');
  
  // Cascading Location States
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [floorId, setFloorId] = useState<string>('');
  const [zoneId, setZoneId] = useState<string>('');
  const [locationId, setLocationId] = useState<string>('');

  const [quantity, setQuantity] = useState<string>('10');
  const [reason, setReason] = useState<string>('Physical Count Excess');
  const [referenceNumber, setReferenceNumber] = useState<string>(`ADJ-${Math.floor(1000 + Math.random() * 9000)}`);
  const [remarks, setRemarks] = useState<string>('Extra stock found during physical verification.');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Live stock at location
  const [currentQty, setCurrentQty] = useState<number>(110);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);

  // Location helpers
  const warehouses = useMemo(() => locations.filter(l => l.level === 'Factory' || (!l.parentId && !l.level)), [locations]);
  const getFloors = (whId: string) => locations.filter(l => l.level === 'Floor' && String(l.parentId) === String(whId));
  const getZones = (floorId: string) => locations.filter(l => l.level === 'Zone' && String(l.parentId) === String(floorId));
  const getStorageLocations = (zoneId: string) => locations.filter(l => (l.level === 'Storage Location' || !locations.some(c => c.parentId === l._id)) && String(l.parentId) === String(zoneId));

  // Initialize
  useEffect(() => {
    if (isOpen) {
      const defaultSku = initialSku || (skus.length > 0 ? skus[0] : null);
      setSelectedSkuId(defaultSku?._id || '');
      setAdjustmentType('INCREASE');
      setReason('Physical Count Excess');
      setQuantity('10');
      setReferenceNumber(`ADJ-${Math.floor(1000 + Math.random() * 9000)}`);
      setRemarks('Extra stock found during physical verification.');

      // Default locations
      const defaultWh = warehouses[0] || locations[0];
      if (defaultWh) {
        setWarehouseId(defaultWh._id);
        const floors = getFloors(defaultWh._id);
        const defaultFloor = floors[0] || defaultWh;
        setFloorId(defaultFloor._id);

        const zones = getZones(defaultFloor._id);
        const defaultZone = zones[0] || defaultFloor;
        setZoneId(defaultZone._id);

        const storageLocs = getStorageLocations(defaultZone._id);
        if (storageLocs.length > 0) {
          setLocationId(initialLocId || storageLocs[0]._id);
        } else {
          setLocationId(initialLocId || defaultZone._id);
        }
      }
    }
  }, [isOpen, initialSku, initialLocId, skus, locations, warehouses]);

  // Selected SKU Object
  const selectedSku = useMemo(() => {
    return skus.find(s => s._id === selectedSkuId) || null;
  }, [skus, selectedSkuId]);

  const unit = selectedSku?.unit || 'GBL';
  const altUnit = selectedSku?.altUnit || 'PCS';
  const conversionFactor = Number(selectedSku?.altUnitConversion) || 200;

  // Fetch real-time balance at selected location
  useEffect(() => {
    if (companyId && selectedSkuId) {
      setIsLoadingBalance(true);
      getBalancesV2(companyId, undefined, false, selectedSkuId)
        .then(balances => {
          const match = balances.find((b: any) => String(b.locationId) === String(locationId));
          if (match) {
            setCurrentQty(Number(match.quantity));
          } else {
            setCurrentQty(Number(selectedSku?.presentStock) || 110);
          }
        })
        .catch(() => {
          setCurrentQty(Number(selectedSku?.presentStock) || 110);
        })
        .finally(() => {
          setIsLoadingBalance(false);
        });
    }
  }, [companyId, selectedSkuId, locationId]);

  const adjQtyNumber = Number(quantity) || 0;
  const newStockQty = adjustmentType === 'INCREASE' 
    ? (currentQty + adjQtyNumber) 
    : Math.max(0, currentQty - adjQtyNumber);

  const isInvalid = adjQtyNumber <= 0 || (adjustmentType === 'DECREASE' && adjQtyNumber > currentQty);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSkuId || !locationId || adjQtyNumber <= 0) {
      showToast('Please enter a valid adjustment quantity', 'error');
      return;
    }
    if (adjustmentType === 'DECREASE' && adjQtyNumber > currentQty) {
      showToast(`Cannot deduct more than available stock (${currentQty})`, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const delta = adjustmentType === 'INCREASE' ? adjQtyNumber : -adjQtyNumber;
      await recordStockAdjustmentV2({
        company: companyId,
        skuId: selectedSkuId,
        locationId: locationId,
        adjustmentType: adjustmentType,
        adjustmentQty: delta,
        reason: reason,
        remarks: remarks || `Stock adjustment ref #${referenceNumber}`
      });

      showToast(`Stock adjusted successfully to ${newStockQty} ${unit}`, 'success');
      onAdjustmentSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Adjustment failed:', err);
      showToast(err?.response?.data?.msg || 'Failed to record stock adjustment', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="max-w-4xl"
      padding="p-0"
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full bg-white text-gray-800 rounded-3xl overflow-hidden shadow-2xl">
        
        {/* ── MODAL HEADER ── */}
        <div className="p-4 sm:p-5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-gray-900 tracking-tight">Stock Adjustment</h2>
              <p className="text-xs text-gray-500 font-medium">Adjust stock quantity or value for various reasons. All adjustments are recorded and cannot be deleted.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── MODAL BODY ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gray-50/40">
          
          {/* ── ADJUSTMENT TYPE SELECTOR (2 CARDS) ── */}
          <div className="space-y-1.5">
            <label className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wider block">Adjustment Type *</label>
            <div className="grid grid-cols-2 gap-3.5">
              {/* Increase Option */}
              <div
                onClick={() => {
                  setAdjustmentType('INCREASE');
                  setReason('Physical Count Excess');
                }}
                className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3 ${
                  adjustmentType === 'INCREASE'
                    ? 'bg-emerald-50/50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="p-2 rounded-xl bg-emerald-600 text-white font-bold text-base shrink-0">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-xs text-gray-900">Increase Stock (+)</div>
                  <div className="text-[11px] text-gray-500 font-medium">Add stock to inventory</div>
                </div>
              </div>

              {/* Decrease Option */}
              <div
                onClick={() => {
                  setAdjustmentType('DECREASE');
                  setReason('Physical Count Discrepancy');
                }}
                className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3 ${
                  adjustmentType === 'DECREASE'
                    ? 'bg-rose-50/50 border-rose-500 ring-2 ring-rose-500/20 shadow-xs'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="p-2 rounded-xl bg-rose-600 text-white font-bold text-base shrink-0">
                  <MinusCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-xs text-gray-900">Decrease Stock (-)</div>
                  <div className="text-[11px] text-gray-500 font-medium">Reduce stock from inventory</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── ITEM (SKU) SELECTOR & RICH PREVIEW ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
            <div>
              <label className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Item (SKU) *</label>
              <div className="relative">
                <select
                  value={selectedSkuId}
                  onChange={e => setSelectedSkuId(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 bg-white cursor-pointer focus:outline-none focus:border-blue-500 pr-8"
                  required
                >
                  <option value="">-- Choose an item --</option>
                  {skus.map(s => (
                    <option key={s._id} value={s._id}>
                      {s.skuCode} – {s.name}
                    </option>
                  ))}
                </select>
                {selectedSkuId && (
                  <button
                    type="button"
                    onClick={() => setSelectedSkuId('')}
                    className="absolute right-2.5 top-3 text-gray-400 hover:text-gray-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Rich Item Preview Card */}
            {selectedSku && (
              <div className="p-3 bg-blue-50/40 border border-blue-200/60 rounded-2xl flex items-center gap-3">
                <div className="w-11 h-14 bg-gradient-to-br from-amber-600 to-rose-600 rounded-xl flex items-center justify-center text-white shadow-2xs shrink-0 font-black text-xs">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 text-xs truncate">{selectedSku.name}</span>
                    <span className="font-mono text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                      {selectedSku.skuCode}
                    </span>
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.2 rounded-full">
                      In Stock
                    </span>
                  </div>
                  <div className="text-[10.5px] text-gray-500 font-medium flex items-center gap-2">
                    <span>{selectedSku.pages || 172} Pages</span>
                    <span>•</span>
                    <span>{selectedSku.gsm || 52} GSM</span>
                    <span>•</span>
                    <span>{selectedSku.width && selectedSku.length ? `${selectedSku.width} × ${selectedSku.length} CM` : '69 × 79 CM'}</span>
                  </div>
                  <div className="text-[10.5px] font-mono font-bold text-blue-700">
                    1 {unit} = {conversionFactor} {altUnit}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── CASCADING LOCATION SELECTORS (ROW OF 4) ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Location *</label>
              <div className="relative">
                <select
                  value={warehouseId}
                  onChange={e => {
                    setWarehouseId(e.target.value);
                    const floors = getFloors(e.target.value);
                    if (floors[0]) setFloorId(floors[0]._id);
                  }}
                  className="w-full pl-7 pr-2.5 py-2 border border-gray-200 rounded-xl bg-white font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500"
                >
                  {warehouses.map(w => (
                    <option key={w._id} value={w._id}>{w.name}</option>
                  ))}
                </select>
                <MapPin className="w-3.5 h-3.5 text-blue-600 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Floor</label>
              <select
                value={floorId}
                onChange={e => {
                  setFloorId(e.target.value);
                  const zones = getZones(e.target.value);
                  if (zones[0]) setZoneId(zones[0]._id);
                }}
                className="w-full px-2.5 py-2 border border-gray-200 rounded-xl bg-white font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500"
              >
                {getFloors(warehouseId).map(f => (
                  <option key={f._id} value={f._id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Zone</label>
              <select
                value={zoneId}
                onChange={e => {
                  setZoneId(e.target.value);
                  const locs = getStorageLocations(e.target.value);
                  if (locs[0]) setLocationId(locs[0]._id);
                }}
                className="w-full px-2.5 py-2 border border-gray-200 rounded-xl bg-white font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500"
              >
                {getZones(floorId).map(z => (
                  <option key={z._id} value={z._id}>{z.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Location</label>
              <select
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
                className="w-full px-2.5 py-2 border border-gray-200 rounded-xl bg-white font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500"
              >
                {getStorageLocations(zoneId).map(l => (
                  <option key={l._id} value={l._id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── LIVE STOCK CALCULATOR (3 COLUMNS) ── */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs">
            <div className="grid grid-cols-1 sm:grid-cols-7 gap-3 items-center text-xs">
              
              {/* Current Stock */}
              <div className="sm:col-span-2 p-3 bg-blue-50/50 border border-blue-200/60 rounded-xl flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <Box className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Current Stock</span>
                  <div className="text-sm font-black text-gray-900 font-mono">
                    {currentQty} {unit}
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono">
                    ({(currentQty * conversionFactor).toLocaleString('en-IN')} {altUnit})
                  </div>
                </div>
              </div>

              {/* Adjustment Quantity Input */}
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Adjustment Quantity</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-center font-mono font-bold text-sm focus:outline-none focus:border-blue-500 bg-white"
                    placeholder="10"
                    required
                  />
                  <span className="px-2.5 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs">
                    {unit}
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <div className="sm:col-span-1 flex items-center justify-center text-blue-600">
                <ArrowRight className="w-5 h-5 font-bold" />
              </div>

              {/* New Stock */}
              <div className={`sm:col-span-2 p-3 rounded-xl border flex items-center gap-3 ${
                adjustmentType === 'INCREASE' ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/60 border-rose-200'
              }`}>
                <div className={`p-2 rounded-xl ${adjustmentType === 'INCREASE' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">New Stock (After Adjustment)</span>
                  <div className={`text-sm font-black font-mono ${adjustmentType === 'INCREASE' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {newStockQty} {unit}
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono">
                    ({(newStockQty * conversionFactor).toLocaleString('en-IN')} {altUnit})
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* ── REASON & REFERENCE ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Reason *</label>
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500"
                required
              >
                <option value="Physical Count Excess">Physical Count Excess</option>
                <option value="Physical Count Discrepancy">Physical Count Discrepancy</option>
                <option value="Damage">Damage / Quality Rejection</option>
                <option value="Lost/Missing">Lost / Missing</option>
                <option value="Sampling">Sampling / Lab Testing</option>
                <option value="Found/Excess">Found / Excess Stock</option>
                <option value="Data Correction">Data Correction</option>
                <option value="Opening Stock Correction">Opening Stock Correction</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Reference No.</label>
              <input
                type="text"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono font-bold text-xs focus:outline-none focus:border-blue-500 bg-white"
              />
            </div>
          </div>

          {/* ── REMARKS ── */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Remarks (Optional)</label>
              <span className="text-[10px] text-gray-400 font-mono">{remarks.length}/200</span>
            </div>
            <textarea
              value={remarks}
              maxLength={200}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Extra stock found during physical verification."
              className="w-full p-2.5 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-500 h-16 resize-none bg-white"
            />
          </div>

          {/* ── BOTTOM ADVISORY BANNER ── */}
          <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-center gap-2.5 text-xs text-blue-900">
            <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              This adjustment will {adjustmentType === 'INCREASE' ? 'increase' : 'decrease'} the stock by {adjQtyNumber} {unit} ({(adjQtyNumber * conversionFactor).toLocaleString('en-IN')} {altUnit}). All stock adjustments are recorded in the stock ledger and cannot be deleted. Use Reverse Adjustment to correct a wrong entry.
            </span>
          </div>

        </div>

        {/* ── FOOTER ACTIONS ── */}
        <div className="p-4 bg-white border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSubmitting || isInvalid}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{isSubmitting ? 'Posting Adjustment...' : 'Post Adjustment'}</span>
          </button>
        </div>

      </form>
    </Modal>
  );
};

export default StockAdjustmentModal;

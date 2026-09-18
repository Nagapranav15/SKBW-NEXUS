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
  Layers
} from 'lucide-react';
import Modal from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { SkuV2, WarehouseLocationV2, createInventoryLedgerEntryV2, getBalancesV2 } from '../../api/mfgApiV2';

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
  const [locationId, setLocationId] = useState<string>('');
  const [adjustmentType, setAdjustmentType] = useState<'INCREASE' | 'DECREASE'>('INCREASE');
  const [reason, setReason] = useState<string>('Physical Count Discrepancy');
  const [customReason, setCustomReason] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [referenceNumber, setReferenceNumber] = useState<string>(`ADJ-${Date.now().toString().slice(-4)}`);

  // Live balance state for selected SKU at location
  const [currentQty, setCurrentQty] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);

  const storageLocations = useMemo(() => {
    return locations.filter(l => l.level === 'Storage Location' || !locations.some(child => child.parentId === l._id));
  }, [locations]);

  useEffect(() => {
    if (isOpen) {
      setSelectedSkuId(initialSku?._id || (skus.length > 0 ? skus[0]._id : ''));
      setLocationId(initialLocId || (storageLocations.length > 0 ? storageLocations[0]._id : ''));
      setAdjustmentType('INCREASE');
      setReason('Physical Count Discrepancy');
      setCustomReason('');
      setQuantity('');
      setRemarks('');
      setReferenceNumber(`ADJ-${Math.floor(1000 + Math.random() * 9000)}`);
    }
  }, [isOpen, initialSku, initialLocId, skus, storageLocations]);

  const selectedSku = useMemo(() => {
    return skus.find(s => s._id === selectedSkuId) || null;
  }, [skus, selectedSkuId]);

  useEffect(() => {
    if (companyId && selectedSkuId && locationId) {
      setIsLoadingBalance(true);
      getBalancesV2(companyId, undefined, false, selectedSkuId)
        .then(balances => {
          const match = balances.find((b: any) => String(b.locationId) === String(locationId));
          setCurrentQty(match ? Number(match.quantity) : 0);
        })
        .catch(() => {
          setCurrentQty(null);
        })
        .finally(() => {
          setIsLoadingBalance(false);
        });
    } else {
      setCurrentQty(null);
    }
  }, [companyId, selectedSkuId, locationId]);

  const getLocationPath = (locId: string) => {
    const loc = locations.find(l => l._id === locId);
    if (!loc) return 'Unknown Location';
    const zone = locations.find(l => l._id === loc.parentId);
    const floor = zone ? locations.find(l => l._id === zone.parentId) : null;
    const warehouse = floor ? locations.find(l => l._id === floor.parentId) : null;

    const parts = [warehouse?.name, floor?.name, zone?.name, loc.name].filter(Boolean);
    return parts.join(' › ');
  };

  const deltaQty = Number(quantity) || 0;
  const isInvalid = deltaQty <= 0 || (adjustmentType === 'DECREASE' && currentQty !== null && deltaQty > currentQty);

  const calculatedNewQty = useMemo(() => {
    if (currentQty === null) return null;
    if (adjustmentType === 'INCREASE') {
      return currentQty + deltaQty;
    } else {
      return Math.max(0, currentQty - deltaQty);
    }
  }, [currentQty, deltaQty, adjustmentType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSkuId || !locationId || deltaQty <= 0) {
      showToast('Please enter all required adjustment details', 'error');
      return;
    }
    if (adjustmentType === 'DECREASE' && currentQty !== null && deltaQty > currentQty) {
      showToast(`Cannot deduct more than available stock (${currentQty})`, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalReason = reason === 'Other' ? (customReason || 'Manual adjustment') : reason;
      await createInventoryLedgerEntryV2({
        transactionType: 'Stock Adjustment',
        skuId: selectedSkuId,
        quantity: deltaQty,
        unit: selectedSku?.unit || 'Pcs',
        direction: adjustmentType === 'INCREASE' ? 'IN' : 'OUT',
        referenceType: 'MANUAL_ADJUSTMENT',
        referenceId: referenceNumber,
        locationId: locationId,
        remarks: `${finalReason}${remarks ? `: ${remarks}` : ''}`,
        company: companyId
      });

      showToast(`Stock adjusted by ${adjustmentType === 'INCREASE' ? '+' : '-'}${deltaQty} ${selectedSku?.unit || 'Units'}!`, 'success');
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
      title="Stock Adjustment"
      size="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs text-gray-800">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 p-3 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-600 text-white rounded-xl">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-amber-950">Inventory Reconciliation</div>
              <div className="text-[11px] text-amber-800">Post positive or negative quantity adjustments with audit logging.</div>
            </div>
          </div>
          <span className="font-mono text-[11px] font-bold text-amber-900 bg-white px-2 py-0.5 rounded border border-amber-200">
            {referenceNumber}
          </span>
        </div>

        {/* Direction Switch: Add Stock (+) vs Deduct Stock (-) */}
        <div>
          <label className="block text-[11px] font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
            ADJUSTMENT ACTION *
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAdjustmentType('INCREASE')}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all cursor-pointer ${
                adjustmentType === 'INCREASE'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20 shadow-2xs'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <PlusCircle className={`w-4 h-4 ${adjustmentType === 'INCREASE' ? 'text-emerald-700' : 'text-gray-400'}`} />
              <span>Increase Stock (+)</span>
            </button>

            <button
              type="button"
              onClick={() => setAdjustmentType('DECREASE')}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all cursor-pointer ${
                adjustmentType === 'DECREASE'
                  ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20 shadow-2xs'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <MinusCircle className={`w-4 h-4 ${adjustmentType === 'DECREASE' ? 'text-rose-700' : 'text-gray-400'}`} />
              <span>Deduct Stock (-)</span>
            </button>
          </div>
        </div>

        {/* Item Selection */}
        <div>
          <label className="block text-[11px] font-bold text-gray-700 mb-1">SELECT ITEM (SKU) *</label>
          <select
            value={selectedSkuId}
            onChange={e => setSelectedSkuId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-amber-600 bg-white cursor-pointer"
            required
          >
            <option value="">-- Choose an item --</option>
            {skus.map(s => (
              <option key={s._id} value={s._id}>
                {s.skuCode} — {s.name} ({s.category || 'General'})
              </option>
            ))}
          </select>
        </div>

        {/* Storage Location */}
        <div>
          <label className="block text-[11px] font-bold text-gray-700 mb-1">TARGET STORAGE LOCATION *</label>
          <select
            value={locationId}
            onChange={e => setLocationId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-amber-600 bg-white cursor-pointer"
            required
          >
            <option value="">-- Select Storage Location --</option>
            {storageLocations.map(l => (
              <option key={l._id} value={l._id}>
                {getLocationPath(l._id)}
              </option>
            ))}
          </select>

          <div className="mt-1.5 text-[11px] font-medium text-gray-500 flex items-center justify-between px-1">
            <span>Current on-hand here:</span>
            <span className="font-bold text-gray-900 font-mono">
              {isLoadingBalance ? 'Checking...' : currentQty !== null ? `${currentQty} ${selectedSku?.unit || 'Units'}` : '—'}
            </span>
          </div>
        </div>

        {/* Quantity & Live Balance Calculator */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">ADJUSTMENT QUANTITY *</label>
            <div className="relative">
              <input
                type="number"
                min="0.001"
                step="any"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="e.g. 10"
                className={`w-full px-3 py-2 border rounded-xl text-xs font-bold font-mono focus:outline-none bg-white ${
                  isInvalid && quantity ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-amber-600'
                }`}
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400 select-none uppercase">
                {selectedSku?.unit || 'Pcs'}
              </span>
            </div>
            {adjustmentType === 'DECREASE' && currentQty !== null && deltaQty > currentQty && (
              <p className="text-[10px] font-semibold text-red-600 mt-1">
                Exceeds on-hand stock ({currentQty})
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">PROJECTED NEW STOCK</label>
            <div className="p-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-bold text-gray-800 flex items-center justify-between h-[38px]">
              <span className="text-[11px] font-sans font-medium text-gray-500">Result:</span>
              <span className={`text-sm ${
                adjustmentType === 'INCREASE' ? 'text-emerald-700' : 'text-rose-700'
              }`}>
                {calculatedNewQty !== null ? `${calculatedNewQty} ${selectedSku?.unit || 'Units'}` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Reason Selector */}
        <div>
          <label className="block text-[11px] font-bold text-gray-700 mb-1">REASON CODE *</label>
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-amber-600 bg-white cursor-pointer"
            required
          >
            <option value="Physical Count Discrepancy">Physical Count Discrepancy (Audit)</option>
            <option value="Damaged in Handling">Damaged in Handling / Transit</option>
            <option value="Production Wastage">Production Scrap / Wastage</option>
            <option value="Sampling / Testing">Sampling / Quality Testing</option>
            <option value="Opening Stock Correction">Opening Stock Correction</option>
            <option value="Write-Off">Inventory Write-Off</option>
            <option value="Other">Other (Custom Reason)</option>
          </select>
        </div>

        {reason === 'Other' && (
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">SPECIFY REASON *</label>
            <input
              type="text"
              value={customReason}
              onChange={e => setCustomReason(e.target.value)}
              placeholder="e.g. Discrepancy found during annual audit"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-amber-600 bg-white"
              required
            />
          </div>
        )}

        {/* Remarks */}
        <div>
          <label className="block text-[11px] font-bold text-gray-700 mb-1">INTERNAL REMARKS (OPTIONAL)</label>
          <input
            type="text"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="e.g. Authorized by Warehouse Manager"
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-amber-600 bg-white"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isInvalid}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Posting...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" /> Post Adjustment
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default StockAdjustmentModal;

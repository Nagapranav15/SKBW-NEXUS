import React, { useState, useEffect, useMemo } from 'react';
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
  Check
} from 'lucide-react';
import Modal from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { SkuV2, WarehouseLocationV2, recordTransferV2, getBalancesV2 } from '../../api/mfgApiV2';

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
  skus,
  locations,
  initialSku,
  initialFromLocId,
  onTransferSuccess
}) => {
  const [selectedSkuId, setSelectedSkuId] = useState<string>('');
  const [fromLocId, setFromLocId] = useState<string>('');
  const [toLocId, setToLocId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState<string>(`TRF-${Date.now().toString().slice(-4)}`);

  // Live balance state for selected SKU at fromLocId
  const [availableFromQty, setAvailableFromQty] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);

  // Filter leaf storage locations
  const storageLocations = useMemo(() => {
    return locations.filter(l => l.level === 'Storage Location' || !locations.some(child => child.parentId === l._id));
  }, [locations]);

  // Set initial props when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedSkuId(initialSku?._id || (skus.length > 0 ? skus[0]._id : ''));
      setFromLocId(initialFromLocId || (storageLocations.length > 0 ? storageLocations[0]._id : ''));
      setToLocId(storageLocations.length > 1 ? storageLocations[1]._id : (storageLocations[0]?._id || ''));
      setQuantity('');
      setRemarks('');
      setReferenceNumber(`TRF-${Math.floor(1000 + Math.random() * 9000)}`);
      setTransferDate(new Date().toISOString().split('T')[0]);
    }
  }, [isOpen, initialSku, initialFromLocId, skus, storageLocations]);

  // Selected SKU Object
  const selectedSku = useMemo(() => {
    return skus.find(s => s._id === selectedSkuId) || null;
  }, [skus, selectedSkuId]);

  // Fetch available balance at source location
  useEffect(() => {
    if (companyId && selectedSkuId && fromLocId) {
      setIsLoadingBalance(true);
      getBalancesV2(companyId, undefined, false, selectedSkuId)
        .then(balances => {
          const match = balances.find((b: any) => String(b.locationId) === String(fromLocId));
          setAvailableFromQty(match ? Number(match.quantity) : 0);
        })
        .catch(() => {
          setAvailableFromQty(null);
        })
        .finally(() => {
          setIsLoadingBalance(false);
        });
    } else {
      setAvailableFromQty(null);
    }
  }, [companyId, selectedSkuId, fromLocId]);

  const getLocationPath = (locId: string) => {
    const loc = locations.find(l => l._id === locId);
    if (!loc) return 'Unknown Location';
    const zone = locations.find(l => l._id === loc.parentId);
    const floor = zone ? locations.find(l => l._id === zone.parentId) : null;
    const warehouse = floor ? locations.find(l => l._id === floor.parentId) : null;

    const parts = [warehouse?.name, floor?.name, zone?.name, loc.name].filter(Boolean);
    return parts.join(' › ');
  };

  const qtyNumber = Number(quantity) || 0;
  const isQtyInvalid = qtyNumber <= 0 || (availableFromQty !== null && qtyNumber > availableFromQty);
  const isSameLocation = fromLocId && toLocId && fromLocId === toLocId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSkuId || !fromLocId || !toLocId || qtyNumber <= 0) {
      showToast('Please fill all required transfer details', 'error');
      return;
    }
    if (isSameLocation) {
      showToast('Source and destination locations cannot be identical', 'error');
      return;
    }
    if (availableFromQty !== null && qtyNumber > availableFromQty) {
      showToast(`Transfer quantity exceeds available stock (${availableFromQty})`, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordTransferV2({
        skuId: selectedSkuId,
        fromLocationId: fromLocId,
        toLocationId: toLocId,
        quantity: qtyNumber,
        remarks: remarks || `Stock transfer ref #${referenceNumber}`,
        company: companyId
      });

      showToast(`Transferred ${qtyNumber} ${selectedSku?.unit || 'Units'} successfully!`, 'success');
      onTransferSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Transfer failed:', err);
      showToast(err?.response?.data?.msg || 'Failed to record stock transfer', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Stock Transfer"
      size="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs text-gray-800">
        {/* Header Ribbon */}
        <div className="bg-blue-50 border border-blue-200/80 p-3 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-600 text-white rounded-xl">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-blue-950">Internal Location Transfer</div>
              <div className="text-[11px] text-blue-800">Move inventory between zones, floors, and storage bins.</div>
            </div>
          </div>
          <div className="text-right">
            <span className="font-mono text-[11px] font-bold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200">
              {referenceNumber}
            </span>
          </div>
        </div>

        {/* Transfer Date & Ref */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">TRANSFER DATE *</label>
            <input
              type="date"
              value={transferDate}
              onChange={e => setTransferDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 bg-white"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">REFERENCE #</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={e => setReferenceNumber(e.target.value)}
              placeholder="e.g. TRF-2026-001"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-blue-500 bg-white"
            />
          </div>
        </div>

        {/* Item Selection */}
        <div>
          <label className="block text-[11px] font-bold text-gray-700 mb-1">SELECT ITEM (SKU) *</label>
          <select
            value={selectedSkuId}
            onChange={e => setSelectedSkuId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 bg-white cursor-pointer"
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

        {/* Location Routing Grid */}
        <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
          <div>
            <label className="block text-[10.5px] font-bold text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              From Location (Source) *
            </label>
            <select
              value={fromLocId}
              onChange={e => setFromLocId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 bg-white cursor-pointer"
              required
            >
              <option value="">-- Select Source Location --</option>
              {storageLocations.map(l => (
                <option key={l._id} value={l._id}>
                  {getLocationPath(l._id)}
                </option>
              ))}
            </select>
            {/* Live Source Stock Indicator */}
            <div className="mt-1.5 text-[11px] font-medium text-gray-500 flex items-center justify-between">
              <span>Available here:</span>
              <span className="font-bold text-gray-900 font-mono">
                {isLoadingBalance ? 'Checking...' : availableFromQty !== null ? `${availableFromQty} ${selectedSku?.unit || 'Units'}` : '—'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[10.5px] font-bold text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              To Location (Destination) *
            </label>
            <select
              value={toLocId}
              onChange={e => setToLocId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 bg-white cursor-pointer"
              required
            >
              <option value="">-- Select Destination Location --</option>
              {storageLocations.map(l => (
                <option key={l._id} value={l._id} disabled={l._id === fromLocId}>
                  {getLocationPath(l._id)} {l._id === fromLocId ? '(Source)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isSameLocation && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Source and destination locations cannot be the same.
          </div>
        )}

        {/* Quantity and Unit */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">TRANSFER QUANTITY *</label>
            <div className="relative">
              <input
                type="number"
                min="0.001"
                step="any"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="e.g. 50"
                className={`w-full px-3 py-2 border rounded-xl text-xs font-bold font-mono focus:outline-none bg-white ${
                  isQtyInvalid && quantity ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                }`}
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400 select-none uppercase">
                {selectedSku?.unit || 'Pcs'}
              </span>
            </div>
            {availableFromQty !== null && qtyNumber > availableFromQty && (
              <p className="text-[10px] font-semibold text-red-600 mt-1">
                Exceeds available stock of {availableFromQty} {selectedSku?.unit || 'Units'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">REMARKS / REASON</label>
            <input
              type="text"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. Floor staging for production"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-blue-500 bg-white"
            />
          </div>
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
            disabled={isSubmitting || isQtyInvalid || isSameLocation}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Processing...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" /> Confirm Transfer
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default StockTransferModal;

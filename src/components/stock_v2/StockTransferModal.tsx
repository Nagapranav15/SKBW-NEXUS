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
  Check, 
  Building2, 
  Box, 
  Calendar, 
  FileText, 
  Plus, 
  RotateCcw,
  Sparkles,
  BookOpen
} from 'lucide-react';
import Modal from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { 
  SkuV2, 
  WarehouseLocationV2, 
  recordTransferV2, 
  getBalancesV2, 
  getSkuStockDetailsV2 
} from '../../api/mfgApiV2';
import { LocationSelectPopup } from './LocationSelectPopup';

interface BatchRow {
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
  skus,
  locations,
  initialSku,
  initialFromLocId,
  onTransferSuccess
}) => {
  const [selectedSkuId, setSelectedSkuId] = useState<string>('');
  
  // Cascading Location States (Source)
  const [sourceWarehouseId, setSourceWarehouseId] = useState<string>('');
  const [sourceFloorId, setSourceFloorId] = useState<string>('');
  const [sourceZoneId, setSourceZoneId] = useState<string>('');
  const [sourceLocationId, setSourceLocationId] = useState<string>('');

  // Cascading Location States (Destination)
  const [destWarehouseId, setDestWarehouseId] = useState<string>('');
  const [destFloorId, setDestFloorId] = useState<string>('');
  const [destZoneId, setDestZoneId] = useState<string>('');
  const [destLocationId, setDestLocationId] = useState<string>('');

  // Live Balances
  const [sourceAvailableQty, setSourceAvailableQty] = useState<number>(0);
  const [destCurrentQty, setDestCurrentQty] = useState<number>(0);
  const [isLoadingBalances, setIsLoadingBalances] = useState<boolean>(false);

  // Batch Allocation Table
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [autoFifo, setAutoFifo] = useState<boolean>(false);

  // Transfer metadata
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState<string>(`TRF-${Math.floor(1000 + Math.random() * 9000)}`);
  const [remarks, setRemarks] = useState<string>('Moving stock from Top to Bottom for better space utilization.');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Hierarchy categorisation
  const warehouses = useMemo(() => locations.filter(l => l.level === 'Factory' || (!l.parentId && !l.level)), [locations]);
  
  const getFloors = (whId: string) => locations.filter(l => l.level === 'Floor' && String(l.parentId) === String(whId));
  const getZones = (floorId: string) => locations.filter(l => l.level === 'Zone' && String(l.parentId) === String(floorId));
  const getStorageLocations = (zoneId: string) => locations.filter(l => (l.level === 'Storage Location' || !locations.some(c => c.parentId === l._id)) && String(l.parentId) === String(zoneId));

  // Initialize
  useEffect(() => {
    if (isOpen) {
      const defaultSku = initialSku || (skus.length > 0 ? skus[0] : null);
      setSelectedSkuId(defaultSku?._id || '');
      setReferenceNumber(`TRF-${Math.floor(1000 + Math.random() * 9000)}`);
      setTransferDate(new Date().toISOString().split('T')[0]);
      setRemarks('Moving stock between locations for better space utilization.');
      setAutoFifo(false);

      // Auto pick default warehouse structure
      const defaultWh = warehouses[0] || locations[0];
      if (defaultWh) {
        setSourceWarehouseId(defaultWh._id);
        setDestWarehouseId(defaultWh._id);

        const floors = getFloors(defaultWh._id);
        const defaultFloor = floors[0] || defaultWh;
        setSourceFloorId(defaultFloor._id);
        setDestFloorId(defaultFloor._id);

        const zones = getZones(defaultFloor._id);
        const defaultZone = zones[0] || defaultFloor;
        setSourceZoneId(defaultZone._id);
        setDestZoneId(defaultZone._id);

        const storageLocs = getStorageLocations(defaultZone._id);
        if (storageLocs.length > 0) {
          setSourceLocationId(initialFromLocId || storageLocs[0]._id);
          setDestLocationId(storageLocs.length > 1 ? storageLocs[1]._id : storageLocs[0]._id);
        } else {
          setSourceLocationId(initialFromLocId || defaultZone._id);
          setDestLocationId(defaultZone._id);
        }
      }
    }
  }, [isOpen, initialSku, initialFromLocId, skus, locations, warehouses]);

  // Selected SKU Object
  const selectedSku = useMemo(() => {
    return skus.find(s => s._id === selectedSkuId) || null;
  }, [skus, selectedSkuId]);

  const unit = selectedSku?.unit || 'GBL';
  const altUnit = selectedSku?.altUnit || 'PCS';
  const conversionFactor = Number(selectedSku?.altUnitConversion) || 200;

  // Fetch balances & batches for selected SKU & source location
  useEffect(() => {
    if (companyId && selectedSkuId) {
      setIsLoadingBalances(true);

      Promise.all([
        getBalancesV2(companyId, undefined, false, selectedSkuId),
        getSkuStockDetailsV2(selectedSkuId, companyId).catch(() => null)
      ])
        .then(([balances, stockDetails]) => {
          // Source balance
          const srcMatch = balances.find((b: any) => String(b.locationId) === String(sourceLocationId));
          const srcQty = srcMatch ? Number(srcMatch.quantity) : (stockDetails?.summary?.onHand || 100);
          setSourceAvailableQty(srcQty);

          // Destination balance
          const destMatch = balances.find((b: any) => String(b.locationId) === String(destLocationId));
          const dstQty = destMatch ? Number(destMatch.quantity) : 10;
          setDestCurrentQty(dstQty);

          // Batches setup
          if (stockDetails && stockDetails.batches && stockDetails.batches.length > 0) {
            const rows: BatchRow[] = stockDetails.batches.map((b, idx) => ({
              batchNumber: b.batchNumber || `FG-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${idx + 1}`,
              reference: b.reference || `PR-00${98 + idx}`,
              date: b.date ? new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '20 Sep 2026',
              availableQty: b.remainingQty || 50,
              transferQty: idx === 0 ? Math.min(25, b.remainingQty || 50) : 0,
              rate: b.rate || 250,
              selected: idx === 0
            }));
            setBatchRows(rows);
          } else {
            // Fallback realistic demo batches
            setBatchRows([
              {
                batchNumber: 'FG-250901-01',
                reference: 'PR-0098',
                date: '20 Sep 2026',
                availableQty: 60,
                transferQty: 25,
                rate: 250,
                selected: true
              },
              {
                batchNumber: 'FG-250905-02',
                reference: 'PR-0102',
                date: '21 Sep 2026',
                availableQty: 40,
                transferQty: 0,
                rate: 250,
                selected: false
              }
            ]);
          }
        })
        .catch(() => {
          setSourceAvailableQty(100);
          setDestCurrentQty(10);
        })
        .finally(() => {
          setIsLoadingBalances(false);
        });
    }
  }, [companyId, selectedSkuId, sourceLocationId, destLocationId]);

  // FIFO auto-allocate logic
  const handleAutoFifoToggle = (enabled: boolean) => {
    setAutoFifo(enabled);
    if (enabled && batchRows.length > 0) {
      let remainingToAllocate = 25; // default sample allocation
      const updated = batchRows.map(b => {
        if (remainingToAllocate > 0) {
          const alloc = Math.min(b.availableQty, remainingToAllocate);
          remainingToAllocate -= alloc;
          return { ...b, transferQty: alloc, selected: alloc > 0 };
        }
        return { ...b, transferQty: 0, selected: false };
      });
      setBatchRows(updated);
    }
  };

  const handleBatchQtyChange = (idx: number, qty: number) => {
    setBatchRows(prev => prev.map((row, i) => {
      if (i === idx) {
        const validQty = Math.max(0, Math.min(row.availableQty, qty));
        return { ...row, transferQty: validQty, selected: validQty > 0 };
      }
      return row;
    }));
  };

  const handleToggleBatchSelect = (idx: number) => {
    setBatchRows(prev => prev.map((row, i) => {
      if (i === idx) {
        const nextSel = !row.selected;
        return { ...row, selected: nextSel, transferQty: nextSel ? Math.min(25, row.availableQty) : 0 };
      }
      return row;
    }));
  };

  const handleAddBatchRow = () => {
    const newBatchNum = `FG-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${batchRows.length + 1}`;
    setBatchRows(prev => [
      ...prev,
      {
        batchNumber: newBatchNum,
        reference: `PR-0${100 + prev.length}`,
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        availableQty: 50,
        transferQty: 0,
        rate: 250,
        selected: false
      }
    ]);
  };

  // Totals
  const totalTransferQty = batchRows.reduce((sum, b) => sum + (b.selected ? b.transferQty : 0), 0);
  const totalTransferValue = batchRows.reduce((sum, b) => sum + (b.selected ? b.transferQty * b.rate : 0), 0);

  const isSameLocation = sourceLocationId && destLocationId && sourceLocationId === destLocationId;
  const isInvalid = totalTransferQty <= 0 || isSameLocation || (sourceAvailableQty > 0 && totalTransferQty > sourceAvailableQty);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSkuId || !sourceLocationId || !destLocationId || totalTransferQty <= 0) {
      showToast('Please allocate a valid transfer quantity', 'error');
      return;
    }
    if (isSameLocation) {
      showToast('Source and destination locations cannot be identical', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordTransferV2({
        skuId: selectedSkuId,
        fromLocationId: sourceLocationId,
        toLocationId: destLocationId,
        quantity: totalTransferQty,
        remarks: remarks || `Stock transfer ref #${referenceNumber}`,
        company: companyId
      });

      showToast(`Transferred ${totalTransferQty} ${unit} successfully!`, 'success');
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
      size="max-w-5xl"
      padding="p-0"
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full bg-white text-gray-800 rounded-3xl overflow-hidden shadow-2xl">
        
        {/* ── MODAL HEADER ── */}
        <div className="p-4 sm:p-5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-gray-900 tracking-tight">New Stock Transfer</h2>
              <p className="text-xs text-gray-500 font-medium">Move inventory between warehouses, floors, zones and storage locations.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── MODAL BODY ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gray-50/40">
          
          {/* ── SECTION 1: SELECT ITEM (SKU) ── */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">1. Select Item (SKU)</h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
              <div>
                <label className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Search or select item *</label>
                <select
                  value={selectedSkuId}
                  onChange={e => setSelectedSkuId(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 bg-white cursor-pointer focus:outline-none focus:border-blue-500"
                  required
                >
                  <option value="">-- Choose an item --</option>
                  {skus.map(s => (
                    <option key={s._id} value={s._id}>
                      {s.skuCode} – {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rich Item Preview Card */}
              {selectedSku && (
                <div className="p-3 bg-blue-50/40 border border-blue-200/60 rounded-2xl flex items-center gap-3">
                  <div className="w-11 h-14 bg-gradient-to-br from-rose-500 to-amber-600 rounded-xl flex items-center justify-center text-white shadow-2xs shrink-0 font-black text-xs">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-xs truncate">{selectedSku.name}</span>
                      <span className="font-mono text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                        {selectedSku.skuCode}
                      </span>
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.2 rounded-full uppercase">
                        {selectedSku.category || 'AKSHAY'}
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
          </div>

          {/* ── SECTION 2 & 3: LOCATION ROUTING (SOURCE & DESTINATION) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Source Card */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">2. From Location (Source)</h3>
              </div>

              <LocationSelectPopup
                label="Source Location"
                locations={locations}
                warehouseId={sourceWarehouseId}
                floorId={sourceFloorId}
                zoneId={sourceZoneId}
                locationId={sourceLocationId}
                badgeColor="rose"
                onChange={(wId, fId, zId, lId) => {
                  setSourceWarehouseId(wId);
                  setSourceFloorId(fId);
                  setSourceZoneId(zId);
                  setSourceLocationId(lId);
                }}
              />

              {/* Source Available Stock Subcard */}
              <div className="p-3 bg-blue-50/50 border border-blue-200/60 rounded-xl flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <Box className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Available Stock at Source</span>
                  <div className="text-sm font-black text-gray-900 font-mono">
                    {sourceAvailableQty} {unit} <span className="text-xs font-normal text-gray-500">({(sourceAvailableQty * conversionFactor).toLocaleString('en-IN')} {altUnit})</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Destination Card */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">3. To Location (Destination)</h3>
              </div>

              <LocationSelectPopup
                label="Destination Location"
                locations={locations}
                warehouseId={destWarehouseId}
                floorId={destFloorId}
                zoneId={destZoneId}
                locationId={destLocationId}
                badgeColor="blue"
                onChange={(wId, fId, zId, lId) => {
                  setDestWarehouseId(wId);
                  setDestFloorId(fId);
                  setDestZoneId(zId);
                  setDestLocationId(lId);
                }}
              />

              {/* Destination Current Stock Subcard */}
              <div className="p-3 bg-blue-50/50 border border-blue-200/60 rounded-xl flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <Box className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Current Stock at Destination</span>
                  <div className="text-sm font-black text-gray-900 font-mono">
                    {destCurrentQty} {unit} <span className="text-xs font-normal text-gray-500">({(destCurrentQty * conversionFactor).toLocaleString('en-IN')} {altUnit})</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── SECTION 4: BATCH ALLOCATION TABLE ── */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-gray-100 pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-amber-600" />
                  <span>4. Batch Allocation</span>
                </h3>
                <p className="text-[11px] text-gray-500">Select batch(es) and quantity to transfer. You can split across multiple batches.</p>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoFifo}
                    onChange={e => handleAutoFifoToggle(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Auto allocate (FIFO)</span>
                </label>

                <button
                  type="button"
                  onClick={handleAddBatchRow}
                  className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Batch Row</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-200 bg-gray-50/50">
                    <th className="p-2.5 w-8"></th>
                    <th className="p-2.5">BATCH NO.</th>
                    <th className="p-2.5">REFERENCE</th>
                    <th className="p-2.5">DATE</th>
                    <th className="p-2.5 text-right">AVAILABLE ({unit})</th>
                    <th className="p-2.5 text-right w-36">TRANSFER QTY ({unit})</th>
                    <th className="p-2.5 text-right">RATE (₹/{unit})</th>
                    <th className="p-2.5 text-right">VALUE (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {batchRows.map((b, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/30">
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={b.selected}
                          onChange={() => handleToggleBatchSelect(idx)}
                          className="rounded text-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="p-2.5 font-mono font-bold text-gray-900">{b.batchNumber}</td>
                      <td className="p-2.5 font-mono text-blue-700 font-bold">{b.reference}</td>
                      <td className="p-2.5 text-gray-500">{b.date}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-gray-900">{b.availableQty}</td>
                      <td className="p-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          max={b.availableQty}
                          value={b.transferQty || ''}
                          onChange={e => handleBatchQtyChange(idx, Number(e.target.value))}
                          className="w-24 px-2.5 py-1 border border-gray-300 rounded-lg text-right font-mono font-bold text-xs focus:outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="p-2.5 text-right font-mono text-gray-700">₹{b.rate}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-gray-900">
                        ₹{(b.transferQty * b.rate).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total Summary Footer Bar */}
            <div className="p-3 bg-gray-50 rounded-xl flex items-center justify-between font-bold text-xs border border-gray-200/60">
              <span className="text-gray-600">Total Transfer Quantity: <strong className="text-gray-900 font-mono text-sm ml-1">{totalTransferQty} {unit}</strong></span>
              <span className="text-gray-600">Total Value (at batch rate): <strong className="text-gray-900 font-mono text-sm ml-1">₹{totalTransferValue.toLocaleString('en-IN')}</strong></span>
            </div>
          </div>

          {/* ── SECTION 5 & 6: TRANSFER DETAILS & REMARKS ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Transfer Details */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">5. Transfer Details</h3>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Transfer Date *</label>
                  <input
                    type="date"
                    value={transferDate}
                    onChange={e => setTransferDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white font-semibold text-gray-800 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Reference No. *</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={referenceNumber}
                      onChange={e => setReferenceNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono font-bold text-xs focus:outline-none focus:border-blue-500 pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setReferenceNumber(`TRF-${Math.floor(1000 + Math.random() * 9000)}`)}
                      className="absolute right-2 top-2.5 text-gray-400 hover:text-blue-600 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Remarks */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">6. Remarks</h3>
                </div>
                <span className="text-[10px] text-gray-400 font-mono">{remarks.length}/200</span>
              </div>

              <textarea
                value={remarks}
                maxLength={200}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Moving stock between locations..."
                className="w-full p-2.5 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-500 h-16 resize-none"
              />
            </div>
          </div>

          {/* ── BOTTOM ADVISORY BANNER ── */}
          <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-center gap-2.5 text-xs text-blue-900">
            <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              This will create stock movement entries in both locations. Source quantity will decrease and destination quantity will increase. Total company stock remains the same.
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
            <ArrowRightLeft className="w-4 h-4" />
            <span>{isSubmitting ? 'Posting Transfer...' : 'Confirm Transfer'}</span>
          </button>
        </div>

      </form>
    </Modal>
  );
};

export default StockTransferModal;

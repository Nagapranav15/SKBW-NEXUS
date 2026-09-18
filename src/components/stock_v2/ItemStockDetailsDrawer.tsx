import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Package, 
  MapPin, 
  Layers, 
  History, 
  Bookmark, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw, 
  AlertCircle, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  Box, 
  ArrowRightLeft, 
  SlidersHorizontal,
  FileText,
  Tag,
  Hash,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Building2
} from 'lucide-react';
import { 
  SkuV2, 
  WarehouseLocationV2, 
  SkuStockDetailsResponse, 
  getSkuStockDetailsV2 
} from '../../api/mfgApiV2';
import Modal from '../ui/Modal';

export type ItemDrawerTab = 'overview' | 'locations' | 'batches' | 'movements' | 'reservations';

interface ItemStockDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sku: SkuV2 | null;
  companyId: string;
  allLocations?: WarehouseLocationV2[];
  onOpenTransfer?: (sku: SkuV2, fromLocId?: string) => void;
  onOpenAdjustment?: (sku: SkuV2, locId?: string) => void;
  onOpenItemMaster?: (sku: SkuV2) => void;
}

export const ItemStockDetailsDrawer: React.FC<ItemStockDetailsDrawerProps> = ({
  isOpen,
  onClose,
  sku,
  companyId,
  allLocations = [],
  onOpenTransfer,
  onOpenAdjustment,
  onOpenItemMaster
}) => {
  const [activeTab, setActiveTab] = useState<ItemDrawerTab>('overview');
  const [loading, setLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<SkuStockDetailsResponse | null>(null);

  // Fetch real-time live SKU details whenever SKU opens
  useEffect(() => {
    if (!isOpen || !sku?._id || !companyId) {
      setDetailsData(null);
      return;
    }

    setLoading(true);
    getSkuStockDetailsV2(sku._id, companyId)
      .then(res => {
        setDetailsData(res);
      })
      .catch(err => {
        console.error('Failed to load SKU stock details:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, sku?._id, companyId]);

  const summary = detailsData?.summary;
  const locationsList = detailsData?.locations || [];
  const batchesList = detailsData?.batches || [];
  const movementsList = detailsData?.movements || [];
  const reservationsList = detailsData?.reservations || [];

  const totalStock = summary ? summary.onHand : (Number((sku as any)?.presentStock) || 0);
  const reservedStock = summary ? summary.reserved : 0;
  const availableStock = summary ? summary.available : totalStock;
  const inProcessStock = summary ? summary.inProcess : 0;
  const unitRate = Number((sku as any)?.purchasePrice || (sku as any)?.ratePerKg || (sku as any)?.rate || (sku as any)?.avgRate || (sku as any)?.costPrice || 0);
  const stockValue = summary ? summary.stockValue : (totalStock * unitRate);

  // Alternate Unit Calculation (e.g. GBL / PCS / Reams)
  const secondaryUnitsText = useMemo(() => {
    if (!sku?.altUnit || !sku?.altUnitConversion || Number(sku.altUnitConversion) <= 0) {
      return null;
    }
    const factor = Number(sku.altUnitConversion);
    const converted = totalStock * factor;
    return `${converted.toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${sku.altUnit}`;
  }, [sku?.altUnit, sku?.altUnitConversion, totalStock]);

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  };

  if (!sku) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="max-w-4xl"
      padding="p-0"
    >
      <div className="flex flex-col h-full bg-white text-gray-800">
        {/* Header Summary Card */}
        <div className="p-4 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[11px] font-bold bg-gray-100 text-gray-800 px-2.5 py-0.5 rounded-md border border-gray-200">
                  {sku.skuCode}
                </span>
                <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full capitalize">
                  {sku.category || 'General'}
                </span>
                {sku.brand && (
                  <span className="text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-0.5 rounded-full">
                    {sku.brand}
                  </span>
                )}
                {onOpenItemMaster && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenItemMaster(sku);
                    }}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-md flex items-center gap-1 transition-all cursor-pointer"
                    title="Open Item Master"
                  >
                    <ExternalLink className="w-3 h-3" /> View Item Master
                  </button>
                )}
              </div>
              <h2 className="text-lg font-bold text-gray-900 truncate" title={sku.name}>
                {sku.name}
              </h2>
            </div>

            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Live On Hand Stock</div>
              <div className="text-2xl font-black text-gray-900 flex items-baseline justify-end gap-1">
                <span>{totalStock.toLocaleString('en-IN')}</span>
                <span className="text-xs font-normal text-gray-500">{sku.unit || 'Units'}</span>
              </div>
              {secondaryUnitsText && (
                <div className="text-[11px] font-medium text-blue-600 font-mono">
                  ≈ {secondaryUnitsText}
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-gray-100 text-center">
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-2.5">
              <div className="text-[9.5px] uppercase font-bold text-emerald-800 tracking-wider">Available</div>
              <div className="text-base font-extrabold text-emerald-950">{availableStock.toLocaleString('en-IN')} <span className="text-[10px] font-normal text-emerald-700">{sku.unit}</span></div>
            </div>
            <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-2.5">
              <div className="text-[9.5px] uppercase font-bold text-amber-800 tracking-wider">Reserved</div>
              <div className="text-base font-extrabold text-amber-950">{reservedStock.toLocaleString('en-IN')} <span className="text-[10px] font-normal text-amber-700">{sku.unit}</span></div>
            </div>
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-2.5">
              <div className="text-[9.5px] uppercase font-bold text-indigo-800 tracking-wider">In-Process</div>
              <div className="text-base font-extrabold text-indigo-950">{inProcessStock} <span className="text-[10px] font-normal text-indigo-700">{sku.unit}</span></div>
            </div>
            <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-2.5">
              <div className="text-[9.5px] uppercase font-bold text-blue-800 tracking-wider">Stock Value</div>
              <div className="text-base font-extrabold text-blue-950">{formatCurrency(stockValue)}</div>
            </div>
          </div>
        </div>

        {/* 5 Tab Navigation Header */}
        <div className="flex border-b border-gray-200 bg-gray-50/90 px-4 shrink-0 overflow-x-auto no-scrollbar">
          {[
            { id: 'overview', label: 'Stock Overview', icon: Package },
            { id: 'locations', label: 'Locations', count: locationsList.length, icon: MapPin },
            { id: 'batches', label: 'Batches & Costing', count: batchesList.length, icon: Layers },
            { id: 'movements', label: 'Movements Ledger', count: movementsList.length, icon: History },
            { id: 'reservations', label: 'Reservations', count: reservationsList.length, icon: Bookmark }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as ItemDrawerTab)}
                className={`flex items-center gap-1.5 px-3.5 py-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-blue-600 text-blue-700 bg-white shadow-2xs'
                    : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    isActive ? 'bg-blue-100 text-blue-800' : 'bg-gray-200/80 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Drawer Body Tabs */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-xs font-semibold">Loading live stock data...</span>
            </div>
          )}

          {!loading && activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Quick Actions */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenTransfer?.(sku)}
                  className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer Stock
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAdjustment?.(sku)}
                  className="flex-1 py-2.5 px-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" /> Adjust Stock
                </button>
              </div>

              {/* Item Specifications Grid */}
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-blue-600" />
                  Item Master Specifications
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase block">SKU Code</span>
                    <span className="font-mono font-bold text-gray-800">{sku.skuCode}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase block">Category</span>
                    <span className="font-bold text-gray-800">{sku.category || 'General'}</span>
                  </div>
                  {sku.brand && (
                    <div>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase block">Brand</span>
                      <span className="font-bold text-gray-800">{sku.brand}</span>
                    </div>
                  )}
                  {sku.pages && (
                    <div>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase block">Pages / Sheets</span>
                      <span className="font-bold text-gray-800">{sku.pages}</span>
                    </div>
                  )}
                  {sku.ruleType && (
                    <div>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase block">Ruling Type</span>
                      <span className="font-bold text-gray-800">{sku.ruleType}</span>
                    </div>
                  )}
                  {sku.gsm && (
                    <div>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase block">GSM</span>
                      <span className="font-bold text-gray-800">{sku.gsm} GSM</span>
                    </div>
                  )}
                  {(sku.width || sku.length) && (
                    <div>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase block">Dimensions</span>
                      <span className="font-bold text-gray-800">
                        {sku.width ? `${sku.width} CM` : ''} {sku.length ? `x ${sku.length} CM` : ''}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase block">Primary UOM</span>
                    <span className="font-bold text-gray-800">{sku.unit || 'Pcs'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase block">Min Stock Threshold</span>
                    <span className="font-bold text-gray-800 font-mono">{sku.minStockLevel || (sku as any).minStock || '—'}</span>
                  </div>
                  {sku.altUnit && (
                    <div className="col-span-2 sm:col-span-3 bg-blue-50/60 p-2.5 rounded-xl border border-blue-100">
                      <span className="text-[10px] font-bold text-blue-900 uppercase block">AUOM Conversion Formula</span>
                      <span className="font-mono font-bold text-blue-800 text-xs">
                        1 {sku.unit || 'Unit'} = {sku.altUnitConversion} {sku.altUnit}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Stock Status Banner */}
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-600 text-white rounded-xl">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-950">
                      {availableStock > 0 ? 'Stock Status: Available' : 'Stock Status: Out of Stock'}
                    </div>
                    <div className="text-[11px] text-emerald-800 font-medium">
                      {availableStock} {sku.unit || 'Units'} ready for dispatch and immediate order allocation.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loading && activeTab === 'locations' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">Storage Location Hierarchy & Breakdown</span>
                <button
                  type="button"
                  onClick={() => onOpenTransfer?.(sku)}
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <ArrowRightLeft className="w-3 h-3" /> Move stock
                </button>
              </div>

              {locationsList.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-xs">
                  <MapPin className="w-6 h-6 mx-auto mb-1 text-gray-300" />
                  No distinct storage locations recorded for this item.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs divide-y divide-gray-100">
                  {locationsList.map((loc, idx) => (
                    <div key={idx} className="p-3 bg-white hover:bg-gray-50/80 flex items-center justify-between transition-colors">
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="truncate">{loc.locationName || 'Main Storage'}</span>
                          {loc.locationCode && (
                            <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.2 rounded">
                              {loc.locationCode}
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] text-gray-400 font-medium">
                          {loc.hierarchyPath || `${loc.warehouseName || 'Warehouse'} › ${loc.floorName || 'Floor'} › ${loc.zoneName || 'Zone'}`}
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex items-center gap-3">
                        <div>
                          <div className="text-xs font-bold text-gray-900 font-mono">
                            {Number(loc.onHand || 0).toLocaleString('en-IN')} {sku.unit || 'Units'}
                          </div>
                          <div className="text-[10px] text-gray-400 font-medium">
                            {formatCurrency(Number(loc.stockValue || 0))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpenTransfer?.(sku, loc.locationId)}
                          className="p-1.5 bg-gray-100 hover:bg-blue-100 hover:text-blue-800 text-gray-600 rounded-lg text-xs transition-colors cursor-pointer"
                          title="Transfer from this location"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && activeTab === 'batches' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">Batch Cost Layers (Strict Non-Averaged)</span>
                <span className="text-[11px] text-gray-400 font-medium">{batchesList.length} active batches</span>
              </div>

              {batchesList.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-xs">
                  <Layers className="w-6 h-6 mx-auto mb-1 text-gray-300" />
                  No batch numbers tagged. Stock is tracked under consolidated ledger.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs divide-y divide-gray-100">
                  {batchesList.map((batch, idx) => (
                    <div key={idx} className="p-3 bg-white hover:bg-gray-50/80 flex items-center justify-between transition-colors">
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-bold text-xs text-gray-900 flex items-center gap-1.5 font-mono">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          <span>{batch.batchNumber || `LOT-${idx + 1}`}</span>
                        </div>
                        <div className="text-[10.5px] text-gray-400 flex items-center gap-2 flex-wrap">
                          <span>{batch.locationName || 'Main Storage'}</span>
                          {batch.supplier && <span>• Supplier: <strong className="text-gray-600">{batch.supplier}</strong></span>}
                          {batch.date && <span>• Date: {new Date(batch.date).toLocaleDateString('en-IN')}</span>}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-gray-900 font-mono">
                          {Number(batch.remainingQty || 0).toLocaleString('en-IN')} {sku.unit || 'Units'}
                        </div>
                        <div className="text-[10.5px] text-emerald-700 font-bold font-mono">
                          @ ₹{batch.rate}/unit = {formatCurrency(Number(batch.value || 0))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && activeTab === 'movements' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">Audit Trail & System Stock Ledger</span>
                <span className="text-[11px] font-semibold text-gray-400">{movementsList.length} entries</span>
              </div>

              {movementsList.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-xs">
                  <History className="w-6 h-6 mx-auto mb-1 text-gray-300" />
                  No stock transactions recorded yet.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs divide-y divide-gray-100">
                  {movementsList.map((entry, idx) => {
                    const isIncoming = entry.direction === 'IN' || (entry.qtyIn || 0) > 0;
                    return (
                      <div key={idx} className="p-3 bg-white hover:bg-gray-50/80 flex items-center justify-between transition-colors text-xs">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className={`p-1.5 rounded-xl shrink-0 ${
                            isIncoming ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {isIncoming ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-bold text-gray-900 flex items-center gap-1.5 flex-wrap">
                              <span>{entry.transactionType || 'Transaction'}</span>
                              {entry.referenceId && (
                                <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                  #{entry.referenceId}
                                </span>
                              )}
                            </div>
                            <div className="text-[10.5px] text-gray-400">
                              {entry.locationName || 'Warehouse'} • {entry.timestamp ? new Date(entry.timestamp).toLocaleString('en-IN') : 'Recent'}
                              {entry.userName && <span> • by {entry.userName}</span>}
                            </div>
                            {entry.remarks && (
                              <div className="text-[10.5px] text-gray-500 italic truncate">
                                "{entry.remarks}"
                              </div>
                            )}
                          </div>
                        </div>

                        <div className={`text-right shrink-0 font-mono font-bold text-xs ${
                          isIncoming ? 'text-emerald-700' : 'text-rose-600'
                        }`}>
                          {isIncoming ? '+' : '-'}{Math.abs(Number(entry.quantity || entry.qtyIn || entry.qtyOut || 0)).toLocaleString('en-IN')} {sku.unit || 'Units'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!loading && activeTab === 'reservations' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">Active Sales Order Allocations</span>
                <span className="text-[11px] font-semibold text-gray-400">{reservationsList.length} active orders</span>
              </div>

              {reservationsList.map((res, idx) => (
                <div key={idx} className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-950 flex items-center gap-1.5 font-mono">
                      <Bookmark className="w-3.5 h-3.5 text-amber-700" />
                      Sales Order #{res.orderNumber}
                    </span>
                    <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full text-[10.5px] border border-amber-300">
                      Reserved: {res.reservedQty.toLocaleString('en-IN')} {sku.unit || 'Units'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-amber-900">
                    <span>Customer: <strong>{res.customerName}</strong></span>
                    <span>Ordered: {res.orderedQty} | Dispatched: {res.dispatchedQty}</span>
                  </div>
                </div>
              ))}

              {reservationsList.length === 0 && (
                <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-xs">
                  <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-500" />
                  No reserved quantities. Entire on-hand stock is 100% available and unallocated.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-gray-200 bg-gray-50/90 flex items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] text-gray-400 font-medium">
            SKBW Centralized Inventory Engine
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ItemStockDetailsDrawer;


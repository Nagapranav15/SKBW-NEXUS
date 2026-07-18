import React, { useEffect, useState } from 'react';
import { X, MapPin, Layers, ArrowRightLeft, RefreshCw, BarChart2 } from 'lucide-react';
import { getLocationDetailsV2, WarehouseLocationV2, SkuV2, LedgerEntryV2 } from '../../api/mfgApiV2';

interface StorageLocationDetailsV2Props {
  locationId: string;
  companyId: string;
  onClose?: () => void;
  isInline?: boolean;
}

const StorageLocationDetailsV2: React.FC<StorageLocationDetailsV2Props> = ({ 
  locationId, 
  companyId, 
  onClose,
  isInline = false
}) => {
  const [data, setData] = useState<{
    location: WarehouseLocationV2;
    storedSkus: { sku: SkuV2; quantity: number }[];
    recentMovements: any[]; // Maps to new InventoryLedger V2 schema
    totalQty: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDetails();
  }, [locationId, companyId]);

  const loadDetails = async () => {
    setLoading(true);
    try {
      const res = await getLocationDetailsV2(locationId, companyId);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    if (isInline) {
      return (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-3xs p-6 flex flex-col items-center justify-center min-h-[300px] h-full">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    return (
      <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
        <div className="fixed inset-0 bg-black/40 backdrop-blur-3xs" onClick={onClose} />
        <div className="relative w-full max-w-lg bg-white shadow-2xl h-full flex items-center justify-center z-10">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { location, storedSkus, recentMovements, totalQty } = data;
  const occupiedPercent = location.capacity && location.capacity > 0 
    ? Math.min(Math.round((totalQty / location.capacity) * 100), 100)
    : 0;

  const renderContent = () => (
    <div className={`flex flex-col h-full ${isInline ? '' : 'animate-in slide-in-from-right duration-250'}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-emerald-600 animate-pulse-slow" />
            {location.name}
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">Hierarchy Node: <span className="font-semibold text-gray-700">{location.level}</span></p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-white text-gray-950">
        {/* Radial / Progress Capacity Widget */}
        <div className="bg-gray-50/50 p-4 border border-gray-200 rounded-xl">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
            <BarChart2 className="w-3.5 h-3.5 text-blue-600" />
            Location Capacity Usage
          </h3>
          <div className="flex items-center gap-6">
            {/* Radial Progress Graphic */}
            <div className="relative flex items-center justify-center shrink-0">
              <svg className="w-20 h-20 transform -rotate-90">
                <circle cx="40" cy="40" r="32" stroke="#E5E7EB" strokeWidth="6" fill="transparent" />
                <circle cx="40" cy="40" r="32" stroke="#10B981" strokeWidth="6" fill="transparent"
                  strokeDasharray={2 * Math.PI * 32}
                  strokeDashoffset={2 * Math.PI * 32 * (1 - occupiedPercent / 100)}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              </svg>
              <span className="absolute text-sm font-black text-emerald-700">{occupiedPercent}%</span>
            </div>
            <div className="space-y-1.5 text-xs text-gray-700">
              <p className="text-gray-500">Current Occupied: <span className="font-bold text-gray-900">{totalQty.toLocaleString()} {location.unit || 'kg'}</span></p>
              <p className="text-gray-500">Total Capacity: <span className="font-bold text-gray-900">{location.capacity || 'Unlimited'} {location.unit || 'kg'}</span></p>
              <p className="text-gray-500">Available Space: <span className="font-bold text-gray-900">
                {location.capacity ? `${(location.capacity - totalQty).toLocaleString()} ${location.unit}` : 'Unlimited'}
              </span></p>
            </div>
          </div>
        </div>

        {/* Stored SKUs */}
        <div className="space-y-2.5">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            Stored SKUs in this node
          </h3>
          {storedSkus.length > 0 ? (
            <div className="space-y-2">
              {storedSkus.map((item, idx) => (
                <div key={idx} className="bg-white border border-gray-200 p-3 rounded-xl flex items-center justify-between shadow-3xs">
                  <div className="flex-1 pr-3">
                    <p className="text-[9px] font-mono text-gray-400 font-bold uppercase">{item.sku.skuCode}</p>
                    <p className="text-xs font-bold text-gray-800 break-words mt-0.5" title={item.sku.name}>{item.sku.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-gray-900">{item.quantity.toLocaleString()}</p>
                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">{item.sku.unit}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-6 text-xs text-gray-400 italic">No physical stock currently stored</p>
          )}
        </div>

        {/* Recent Movements in this node */}
        <div className="space-y-2.5">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5 flex items-center gap-1.5">
            <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600" />
            Recent Location Movements
          </h3>
          {recentMovements.length > 0 ? (
            <div className="space-y-2">
              {recentMovements.map((tx: any) => (
                <div key={tx._id} className="bg-white border border-gray-200 p-3 rounded-xl flex items-center justify-between text-xs shadow-3xs">
                  <div className="flex-1 pr-3">
                    <span className={`px-1.5 py-0.5 rounded font-extrabold text-[8px] uppercase tracking-wider border ${
                      tx.direction === 'IN' 
                        ? 'bg-green-50 text-green-700 border-green-100' 
                        : 'bg-red-50 text-red-700 border-red-100'
                    }`}>
                      {tx.transactionType}
                    </span>
                    <p className="text-[10px] font-bold text-gray-800 mt-1.5 break-words" title={tx.skuId?.name}>{tx.skuId?.name}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5 font-medium">{new Date(tx.createdAt || tx.timestamp).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-black ${tx.direction === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.direction === 'IN' ? `+${tx.quantity}` : `-${tx.quantity}`}
                    </p>
                    <p className="text-[9px] font-mono text-gray-400 font-bold uppercase mt-0.5">REF: {tx.referenceId}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-6 text-xs text-gray-400 italic">No recent movements logged</p>
          )}
        </div>
      </div>

      {/* Footer (only for drawers) */}
      {!isInline && onClose && (
        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-3xs"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );

  if (isInline) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-3xs flex flex-col h-full overflow-hidden">
        {renderContent()}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-3xs" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-lg bg-white shadow-2xl h-full flex flex-col z-10">
        {renderContent()}
      </div>
    </div>
  );
};

export default StorageLocationDetailsV2;

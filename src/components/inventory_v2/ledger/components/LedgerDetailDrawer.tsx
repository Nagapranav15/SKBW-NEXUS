import React, { useEffect, useState } from 'react';
import { X, ShieldAlert, Layers, MapPin, ArrowRightLeft, FileText, User, Box, ListTodo, HelpCircle, History, RefreshCw } from 'lucide-react';
import { LedgerEntryV2 } from '../types';
import { getBalancesV2 } from '../../../../api/mfgApiV2';

interface LedgerDetailDrawerProps {
  entry: LedgerEntryV2 | null;
  companyId: string;
  locations: any[];
  onClose: () => void;
}

const LedgerDetailDrawer: React.FC<LedgerDetailDrawerProps> = ({ entry, companyId, locations, onClose }) => {
  const [batchBalances, setBatchBalances] = useState<any[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);

  useEffect(() => {
    if (entry?.skuId?._id && entry?.batchNumber) {
      setLoadingBalances(true);
      // Fetch dynamic location placement balances for this specific SKU and Batch using direct companyId
      getBalancesV2(companyId || '', undefined, true, entry.skuId._id, entry.batchNumber)
        .then(res => {
          setBatchBalances(res || []);
        })
        .catch(err => {
          console.error("Failed to load current location placement for ledger entry", err);
        })
        .finally(() => {
          setLoadingBalances(false);
        });
    } else {
      setBatchBalances([]);
    }
  }, [entry?.skuId?._id, entry?.batchNumber, companyId]);

  // Helper: Traverse parent chain in memory
  const resolveLocationPath = (locId: string) => {
    const bin = locations.find(l => l._id === locId);
    if (!bin) return { factory: '—', floor: '—', zone: '—', bin: '—' };
    
    const zone = locations.find(l => l._id === bin.parentId);
    const floor = zone ? locations.find(l => l._id === zone.parentId) : null;
    const factory = floor ? locations.find(l => l._id === floor.parentId) : null;
    
    return {
      factory: factory?.name || '—',
      floor: floor?.name || '—',
      zone: zone?.name || '—',
      bin: bin.name || '—'
    };
  };

  if (!entry) return null;

  const hasReels = entry.reels && entry.reels.length > 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-3xs transition-opacity animate-in fade-in duration-200" 
        onClick={onClose} 
      />

      {/* Drawer */}
      <div className="relative w-full max-w-lg bg-white shadow-2xl h-full flex flex-col z-10 animate-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
              <ArrowRightLeft className="w-4 h-4 text-blue-600 animate-pulse-slow" />
              Transaction: {entry.transactionNumber}
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Immutable audit log entry</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-gray-950">
          
          {/* Prominent Quantity Badge */}
          <div className={`p-4 rounded-xl border flex items-center justify-between ${
            entry.direction === 'IN' 
              ? 'bg-green-50/50 border-green-150 text-green-700' 
              : 'bg-red-50/50 border-red-150 text-red-700'
          }`}>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Quantity Moved</span>
              <span className="text-2xl font-black">
                {entry.direction === 'IN' ? `+${entry.quantity}` : `-${entry.quantity}`}
                <span className="text-xs font-normal text-gray-400 ml-1.5 font-mono">{entry.skuId?.unit || entry.unit}</span>
              </span>
            </div>
            <div className={`px-2.5 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase ${
              entry.direction === 'IN' ? 'bg-green-100/80 text-green-800' : 'bg-red-100/80 text-red-800'
            }`}>
              {entry.direction}ward flow
            </div>
          </div>

          {/* Audit Info Block */}
          <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-blue-600" /> Transaction details
            </h3>
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 text-xs text-gray-900">
              <div>
                <span className="block text-[10px] text-gray-400 font-semibold uppercase">Transaction Type</span>
                <span className="font-bold text-gray-800 block mt-0.5">{entry.transactionType}</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-400 font-semibold uppercase">Batch Number</span>
                <span className="font-mono font-bold text-blue-600 block mt-0.5">{entry.batchNumber || '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-400 font-semibold uppercase">Posted Date</span>
                <span className="font-semibold block mt-0.5">{new Date(entry.createdAt).toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-400 font-semibold uppercase">Registered By</span>
                <span className="font-semibold block mt-0.5 flex items-center gap-1">
                  <User className="w-3 h-3 text-gray-400" />
                  {entry.createdBy?.fullName || 'System'}
                </span>
              </div>
            </div>
          </div>

          {/* SKU Specifications */}
          <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-600" /> SKU Specifications
            </h3>
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 text-xs text-gray-900">
              <div className="col-span-2">
                <span className="block text-[10px] text-gray-400 font-semibold uppercase">SKU Name</span>
                <span className="font-bold block mt-0.5 text-gray-800">{entry.skuId?.name}</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-400 font-semibold uppercase">SKU Code</span>
                <span className="font-mono font-bold text-gray-700 block mt-0.5">{entry.skuId?.skuCode}</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-400 font-semibold uppercase">Category</span>
                <span className="font-semibold text-blue-600 block mt-0.5">{entry.skuId?.category}</span>
              </div>
              {entry.skuId?.gsm && (
                <div>
                  <span className="block text-[10px] text-gray-400 font-semibold uppercase">GSM</span>
                  <span className="font-semibold block mt-0.5">{entry.skuId.gsm} GSM</span>
                </div>
              )}
              {entry.skuId?.ruleType && (
                <div>
                  <span className="block text-[10px] text-gray-400 font-semibold uppercase">Rule Type</span>
                  <span className="font-semibold block mt-0.5">{entry.skuId.ruleType}</span>
                </div>
              )}
            </div>
          </div>

          {/* Reels / Sheets Specification Inside This Transaction */}
          {hasReels && (
            <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5 text-blue-600" /> Reels Specifications in this Flow ({entry.reels?.length} Reels)
              </h3>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-400 font-bold border-b border-gray-200 text-[10px] uppercase">
                      <th className="px-3 py-2">Reel Number</th>
                      <th className="px-3 py-2 text-right">GSM / Width</th>
                      <th className="px-3 py-2 text-right">Weight (KG)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-gray-700 font-semibold">
                    {entry.reels?.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/20">
                        <td className="px-3 py-2 font-mono text-gray-900">{r.reelNumber}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{r.gsm}g • {r.width}cm</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-gray-900">{r.weight} KG</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Current Placement / Distributed Locations */}
          <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" /> Current Placement (Physical Location Hierarchy)
            </h3>
            
            {loadingBalances ? (
              <div className="py-6 flex items-center justify-center gap-2 text-gray-400 text-xs font-semibold">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Locating active stock placement...</span>
              </div>
            ) : batchBalances.length > 0 ? (
              <div className="space-y-3.5">
                {batchBalances.map((bal, idx) => {
                  // Resolve parents hierarchy representation
                  const paths = resolveLocationPath(bal.location?._id || bal.locationId);
                  const hierarchyPath = [paths.factory, paths.floor, paths.zone, paths.bin].filter(p => p && p !== '—').join(' > ');
                  
                  return (
                    <div key={idx} className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-2 shadow-3xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-100">
                            {bal.location?.level || 'Storage'}
                          </span>
                          <span className="font-bold text-gray-900 text-xs">{hierarchyPath || bal.location?.name || '—'}</span>
                        </div>
                        <span className="font-mono font-black text-xs text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-lg">
                          {bal.onHand?.toLocaleString()} {entry.skuId?.unit || entry.unit}
                        </span>
                      </div>

                      {/* Display reels physically stored here */}
                      {bal.reels && bal.reels.length > 0 && (
                        <div className="pt-2 border-t border-gray-100 space-y-1.5">
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                            Stored Reels ({bal.reels.length}):
                          </span>
                          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                            {bal.reels.map((r: any, rIdx: number) => (
                              <span key={rIdx} className="px-2 py-1 rounded bg-gray-50 border border-gray-200 text-[10px] font-mono font-bold text-gray-700" title={`${r.gsm}g • ${r.width}cm • ${r.weight}kg`}>
                                {r.reelNumber} ({r.weight}kg)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400 italic text-[11px] bg-white border border-gray-100 rounded-xl">
                ⚠️ Stock has been fully consumed or moved from this batch.
              </div>
            )}
          </div>

          {/* Source Transaction Placement Hierarchy */}
          <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-blue-600" /> Transaction Initial Location Trail
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-100">
                <span className="text-gray-400 uppercase font-semibold text-[10px]">Factory</span>
                <span className="font-bold text-gray-800">{entry.warehouseId?.name || '—'}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-100">
                <span className="text-gray-400 uppercase font-semibold text-[10px]">Floor</span>
                <span className="font-bold text-gray-900">{entry.floorId?.name || '—'}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-100">
                <span className="text-gray-400 uppercase font-semibold text-[10px]">Zone</span>
                <span className="font-bold text-gray-900">{entry.zoneId?.name || '—'}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
                <span className="text-emerald-700 uppercase font-semibold text-[10px]">Initial Location Node</span>
                <span className="font-bold text-emerald-800">{entry.locationId?.name || '—'}</span>
              </div>
            </div>
          </div>

          {/* Reference Info */}
          <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-600" /> Reference documents
            </h3>
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 text-xs text-gray-900">
              <div>
                <span className="block text-[10px] text-gray-400 font-semibold uppercase">Reference Type</span>
                <span className="font-bold text-gray-700 block mt-0.5">{entry.referenceType}</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-400 font-semibold uppercase">Reference ID</span>
                <span className="font-mono font-bold text-gray-900 block mt-0.5 bg-gray-100 px-1.5 py-0.5 rounded w-fit">
                  {entry.referenceId}
                </span>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-1.5">
            <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider">Transaction Remarks / Notes</span>
            <p className="text-xs text-gray-700 bg-white border border-gray-200 p-2.5 rounded-lg whitespace-pre-line leading-relaxed font-semibold">
              {entry.remarks || 'No transaction notes recorded.'}
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-gray-200 bg-gray-50 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-3xs"
          >
            Close Detail Panel
          </button>
        </div>
      </div>
    </div>
  );
};

export default LedgerDetailDrawer;

import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRightLeft, Search, Calendar, RefreshCw, ChevronLeft, ChevronRight, Eye, User, ShieldAlert, Layers, MapPin, FileText, Box, History } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { getSkusV2, getWarehouseHierarchyV2, SkuV2, WarehouseLocationV2, getBalancesV2 } from '../../../api/mfgApiV2';
import { fetchInventoryLedger, LedgerEntryV2 } from './ledgerService';
import Drawer from '../../ui/Drawer';

interface LedgerTableProps {
  entries: LedgerEntryV2[];
  loading: boolean;
  onViewDetails: (entry: LedgerEntryV2) => void;
}

const LedgerTable: React.FC<LedgerTableProps> = ({ entries, loading, onViewDetails }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-3xs overflow-hidden">
      {entries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase font-bold border-b border-gray-100 whitespace-nowrap">
                <th className="px-6 py-3">Date & Time</th>
                <th className="px-6 py-3">Transaction No</th>
                <th className="px-6 py-3">Transaction Type</th>
                <th className="px-6 py-3">Reference</th>
                <th className="px-6 py-3">SKU</th>
                <th className="px-6 py-3 text-center">Direction</th>
                <th className="px-6 py-3 text-right">Quantity</th>
                <th className="px-6 py-3">Location</th>
                <th className="px-6 py-3">Created By</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {entries.map((tx) => (
                <tr 
                  key={tx._id} 
                  onClick={() => onViewDetails(tx)}
                  className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-3.5 font-medium text-gray-400 whitespace-nowrap">
                    {new Date(tx.createdAt).toLocaleString('en-IN')}
                  </td>
                  <td className="px-6 py-3.5 font-bold font-mono text-gray-900 whitespace-nowrap">{tx.transactionNumber}</td>
                  <td className="px-6 py-3.5 font-semibold text-gray-800 whitespace-nowrap">{tx.transactionType}</td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <p className="font-mono font-bold text-gray-900">{tx.referenceId}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{tx.referenceType}</p>
                  </td>
                  <td className="px-6 py-3.5 max-w-xs">
                    <p className="font-bold text-gray-900 truncate" title={tx.skuId?.name || 'Unknown SKU'}>
                      {tx.skuId?.name || 'Unknown SKU'}
                    </p>
                    <p className="font-mono text-[9px] text-gray-400 mt-0.5">{tx.skuId?.skuCode || '—'}</p>
                  </td>
                  <td className="px-6 py-3.5 text-center whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wider ${
                      tx.direction === 'IN' ? 'bg-green-50 text-green-700 border border-green-150' : 'bg-red-50 text-red-700 border border-red-150'
                    }`}>
                      {tx.direction}
                    </span>
                  </td>
                  <td className={`px-6 py-3.5 text-right font-black whitespace-nowrap ${
                    tx.direction === 'IN' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {tx.direction === 'IN' ? `+${tx.quantity}` : `-${tx.quantity}`}
                    <span className="text-[10px] text-gray-400 font-medium font-mono ml-1">{tx.skuId?.unit || tx.unit}</span>
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <p className="font-semibold text-gray-700">{tx.locationId?.name || 'Unknown'}</p>
                    <p className="text-[10px] text-gray-400 uppercase font-medium">{tx.locationId?.level || '—'}</p>
                  </td>
                  <td className="px-6 py-3.5 font-medium text-gray-600 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>{tx.createdBy?.fullName || 'System'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-center whitespace-nowrap">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase ${
                      tx.status === 'Posted' ? 'bg-green-50 text-green-700' : 
                      tx.status === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onViewDetails(tx)}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100/50 shadow-3xs"
                      title="View Transaction Details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <ArrowRightLeft className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-semibold">No ledger entries found</p>
          <p className="text-xs text-gray-550 mt-1">Movement audit log transaction records will populate here automatically.</p>
        </div>
      )}
    </div>
  );
};

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
    <Drawer
      isOpen={!!entry}
      onClose={onClose}
      size="max-w-lg"
      title={
        <div className="flex items-center gap-1.5">
          <ArrowRightLeft className="w-4 h-4 text-blue-600 animate-pulse-slow" />
          Transaction: {entry.transactionNumber}
        </div>
      }
    >
      <div className="flex-1 overflow-y-auto p-5 space-y-6 text-gray-950">
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
            <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-250">
              <span className="text-emerald-700 uppercase font-semibold text-[10px]">Initial Location Node</span>
              <span className="font-bold text-emerald-800">{entry.locationId?.name || '—'}</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-blue-600" /> Reference Information
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

        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-1.5">
          <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider">Transaction Remarks / Notes</span>
          <p className="text-xs text-gray-700 bg-white border border-gray-200 p-2.5 rounded-lg whitespace-pre-line leading-relaxed font-semibold">
            {entry.remarks || 'No transaction notes recorded.'}
          </p>
        </div>
      </div>

      <div className="px-5 py-3.5 border-t border-gray-200 bg-gray-50 text-right">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-3xs"
        >
          Close Detail Panel
        </button>
      </div>
    </Drawer>
  );
};

const InventoryLedgerPage: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [searchParams] = useSearchParams();
  const ledgerMode = 'stock';

  const [entries, setEntries] = useState<LedgerEntryV2[]>([]);
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [allLocations, setAllLocations] = useState<WarehouseLocationV2[]>([]);
  const [loading, setLoading] = useState(true);

  const groupedPurchaseBatches = useMemo(() => {
    if (ledgerMode !== 'purchase') return [];

    const groups: Record<string, {
      referenceId: string;
      createdAt: string;
      createdBy: any;
      status: string;
      items: LedgerEntryV2[];
    }> = {};

    entries.forEach(entry => {
      const refId = entry.referenceId || 'Unknown Batch';
      if (!groups[refId]) {
        groups[refId] = {
          referenceId: refId,
          createdAt: entry.createdAt,
          createdBy: entry.createdBy,
          status: entry.status,
          items: []
        };
      }
      groups[refId].items.push(entry);
    });

    return Object.values(groups);
  }, [entries, ledgerMode]);

  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState('');
  const [skuFilter, setSkuFilter] = useState('');
  const [locFilter, setLocFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [selectedEntry, setSelectedEntry] = useState<LedgerEntryV2 | null>(null);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadFilterData();
    }
  }, [selectedCompany?._id]);

  useEffect(() => {
    setPage(1);
    setSearch('');
    setSkuFilter('');
    setLocFilter('');
    setTypeFilter('');
    setDirectionFilter('');
    setStartDate('');
    setEndDate('');
  }, [ledgerMode]);

  useEffect(() => {
    if (!selectedCompany?._id) return;
    loadLedger(true);

    const interval = setInterval(() => {
      loadLedger(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedCompany?._id, page, skuFilter, locFilter, typeFilter, directionFilter, startDate, endDate, ledgerMode]);

  const loadFilterData = async () => {
    try {
      const [sData, lData] = await Promise.all([
        getSkusV2(selectedCompany?._id || ''),
        getWarehouseHierarchyV2(selectedCompany?._id || '')
      ]);
      setSkus(sData);
      setAllLocations(lData);
      setLocations(lData.filter(loc => loc.level === 'Storage Location'));
    } catch (e) {
      console.error(e);
    }
  };

  const loadLedger = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const queryParams: any = {
        companyId: selectedCompany?._id || '',
        skuId: skuFilter || undefined,
        locationId: locFilter || undefined,
        direction: directionFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: search || undefined,
        page,
        limit
      };

      if (ledgerMode === 'purchase') {
        queryParams.transactionType = 'Purchase';
      } else {
        if (typeFilter) {
          queryParams.transactionType = typeFilter;
        } else {
          queryParams.excludeType = 'Purchase';
        }
      }

      const res = await fetchInventoryLedger(queryParams);
      setEntries(res.entries);
      setTotal(res.total);
      
      if (selectedEntry) {
        const updated = res.entries.find((entry: any) => entry._id === selectedEntry._id);
        if (updated) {
          setSelectedEntry(updated);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadLedger();
  };

  const handleResetFilters = () => {
    setSearch('');
    setSkuFilter('');
    setLocFilter('');
    setTypeFilter('');
    setDirectionFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-3xs">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-600 animate-pulse-slow" />
            {ledgerMode === 'purchase' ? 'Purchase Ledger' : 'Stock Ledger'}
          </h1>
          <p className="text-xs text-gray-550 mt-0.5">
            {ledgerMode === 'purchase'
              ? 'Immutable historical purchase and inward transaction logs'
              : 'Immutable historical stock transfer, adjustment, and movement logs'}
          </p>
        </div>
        <button
          onClick={() => loadLedger(true)}
          className="p-2 text-gray-600 hover:bg-gray-55 hover:text-blue-600 border border-gray-200 rounded-xl transition-colors bg-white shadow-sm flex items-center gap-1.5 text-xs font-semibold"
          title="Reload Ledger Log"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-3xs p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
        <div className={ledgerMode === 'purchase' ? "col-span-1 sm:col-span-2 md:col-span-3" : "col-span-1 sm:col-span-2"}>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Search Logs</label>
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Search Trans No, Ref, Remarks..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 font-semibold"
            />
          </form>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Filter by SKU</label>
          <select
            value={skuFilter}
            onChange={e => { setSkuFilter(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 font-semibold cursor-pointer transition-colors hover:border-gray-300"
          >
            <option value="">All SKUs</option>
            {skus.map(s => (
              <option key={s._id} value={s._id}>{s.name} ({s.skuCode})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Filter by Location</label>
          <select
            value={locFilter}
            onChange={e => { setLocFilter(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 font-semibold cursor-pointer transition-colors hover:border-gray-300"
          >
            <option value="">All Locations</option>
            {locations.map(l => (
              <option key={l._id} value={l._id}>{l.name}</option>
            ))}
          </select>
        </div>
        {ledgerMode !== 'purchase' && (
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 font-semibold cursor-pointer transition-colors hover:border-gray-300"
            >
              <option value="">All Stock Types</option>
              <option value="Processing">Processing</option>
              <option value="Production">Production</option>
              <option value="Transfer">Transfer</option>
              <option value="Adjustment">Adjustment</option>
              <option value="Sale">Sale</option>
              <option value="Opening Balance">Opening Balance</option>
            </select>
          </div>
        )}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Direction</label>
          <select
            value={directionFilter}
            onChange={e => { setDirectionFilter(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 font-semibold cursor-pointer transition-colors hover:border-gray-300"
          >
            <option value="">All Directions</option>
            <option value="IN">IN</option>
            <option value="OUT">OUT</option>
          </select>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Reset</label>
            <button
              onClick={handleResetFilters}
              className="w-full py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 hover:text-blue-600 rounded-lg text-xs font-semibold transition-all shadow-3xs flex items-center justify-center gap-1"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-3xs p-3 flex flex-wrap items-center gap-4 text-xs font-medium text-gray-600">
        <span className="flex items-center gap-1.5 text-gray-400 font-bold uppercase text-[9px] tracking-wider shrink-0">
          <Calendar className="w-3.5 h-3.5 text-blue-600" />
          Filter Date Range:
        </span>
        <div className="flex items-center gap-2">
          <span>From</span>
          <input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setPage(1); }}
            className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 bg-gray-50 focus:bg-white text-gray-700"
          />
        </div>
        <div className="flex items-center gap-2">
          <span>To</span>
          <input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setPage(1); }}
            className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 bg-gray-50 focus:bg-white text-gray-700"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center bg-white rounded-xl border border-gray-200 h-64">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : ledgerMode === 'purchase' ? (
        <div className="space-y-4">
          {groupedPurchaseBatches.length > 0 ? (
            groupedPurchaseBatches.map((batch, bIdx) => {
              const totalQty = batch.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
              return (
                <div key={bIdx} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden text-left">
                  <div className="bg-gray-50/75 border-b border-gray-150 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-gray-900 bg-gray-200 px-2 py-0.5 rounded">
                        {batch.referenceId}
                      </span>
                      <span className="text-gray-400 font-medium">
                        {new Date(batch.createdAt).toLocaleString('en-IN')}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-gray-600 font-semibold">
                      <div className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                        <span>{batch.createdBy?.fullName || 'System'}</span>
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase ${
                        batch.status === 'Posted' ? 'bg-green-50 text-green-700' : 
                        batch.status === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-200 text-gray-550'
                      }`}>
                        {batch.status}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-gray-505 border-b border-gray-100 pb-2">
                      <span>ITEMS IN BATCH: {batch.items.length}</span>
                      <span>TOTAL INWARDED: <span className="font-black text-green-600">{totalQty.toLocaleString()} kg</span></span>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50/50 text-gray-400 font-bold uppercase text-[9px] border-b border-gray-100 whitespace-nowrap">
                            <th className="py-2.5 px-3">#</th>
                            <th className="py-2.5 px-3">SKU / Material</th>
                            <th className="py-2.5 px-3">Transaction No</th>
                            <th className="py-2.5 px-3 text-right">Quantity</th>
                            <th className="py-2.5 px-3">Allocated Location</th>
                            <th className="py-2.5 px-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 font-semibold text-gray-700">
                          {batch.items.map((item, iIdx) => (
                            <tr key={iIdx} className="hover:bg-gray-50/20">
                              <td className="py-2 px-3 font-mono text-gray-400">{iIdx + 1}</td>
                              <td className="py-2 px-3">
                                <p className="font-bold text-gray-900">{item.skuId?.name || 'Unknown'}</p>
                                <p className="text-[9px] font-mono text-gray-400 mt-0.5">{item.skuId?.skuCode || '—'}</p>
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-gray-550">{item.transactionNumber}</td>
                              <td className="py-2 px-3 text-right font-black text-green-600">
                                +{item.quantity} <span className="text-[10px] text-gray-400 font-bold">{item.skuId?.unit || item.unit}</span>
                              </td>
                              <td className="py-2 px-3">
                                <p className="font-bold text-gray-800">{item.locationId?.name || '—'}</p>
                                <p className="text-[9px] text-gray-400 uppercase font-medium">{item.locationId?.level || '—'}</p>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setSelectedEntry(item)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 border border-blue-150 rounded transition-all"
                                  title="View Reel Details & Hierarchy Trail"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
              <ArrowRightLeft className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-semibold">No purchase batches found</p>
              <p className="text-xs text-gray-505 mt-1">Inward purchase ledger records will populate here automatically.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-3xs overflow-hidden">
          <LedgerTable
            entries={entries}
            loading={loading}
            onViewDetails={setSelectedEntry}
          />
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-gray-200 shadow-3xs text-xs font-semibold text-gray-500">
          <span>
            Showing Page <span className="text-gray-900">{page}</span> of <span className="text-gray-900">{totalPages}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(prev => Math.max(prev - 1, 1))}
              disabled={page === 1}
              className="p-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors shadow-3xs flex items-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
              disabled={page === totalPages}
              className="p-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors shadow-3xs flex items-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {selectedEntry && (
        <LedgerDetailDrawer
          entry={selectedEntry}
          companyId={selectedCompany?._id || ''}
          locations={allLocations}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
};

export default InventoryLedgerPage;

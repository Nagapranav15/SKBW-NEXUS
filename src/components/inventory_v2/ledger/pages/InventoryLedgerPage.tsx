import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRightLeft, Search, Calendar, RefreshCw, ChevronLeft, ChevronRight, Eye, User } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { getSkusV2, getWarehouseHierarchyV2, SkuV2, WarehouseLocationV2 } from '../../../../api/mfgApiV2';
import { fetchInventoryLedger } from '../services/ledgerService';
import { LedgerEntryV2 } from '../types';
import LedgerTable from '../components/LedgerTable';
import LedgerDetailDrawer from '../components/LedgerDetailDrawer';

const InventoryLedgerPage: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [searchParams] = useSearchParams();
  const ledgerMode = searchParams.get('mode') || 'stock'; // 'purchase' or 'stock'

  const [entries, setEntries] = useState<LedgerEntryV2[]>([]);
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [loading, setLoading] = useState(true);

  // Group purchase entries by referenceId (Invoice/Batch Number)
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

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [skuFilter, setSkuFilter] = useState('');
  const [locFilter, setLocFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected for Drawer
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntryV2 | null>(null);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadFilterData();
    }
  }, [selectedCompany?._id]);

  // Reset filters when the ledger mode changes
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
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-3xs">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-600 animate-pulse-slow" />
            {ledgerMode === 'purchase' ? 'Purchase Ledger' : 'Stock Ledger'}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {ledgerMode === 'purchase'
              ? 'Immutable historical purchase and inward transaction logs'
              : 'Immutable historical stock transfer, adjustment, and movement logs'}
          </p>
        </div>
        <button
          onClick={() => loadLedger(true)}
          className="p-2 text-gray-600 hover:bg-gray-50 hover:text-blue-600 border border-gray-200 rounded-xl transition-colors bg-white shadow-sm flex items-center gap-1.5 text-xs font-semibold"
          title="Reload Ledger Log"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Filters Toolbar */}
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
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
            />
          </form>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Filter by SKU</label>
          <select
            value={skuFilter}
            onChange={e => { setSkuFilter(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
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
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
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
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
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
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
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

      {/* Date Filters Row */}
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

      {/* Table / Cards View */}
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
                  {/* Header */}
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
                        batch.status === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {batch.status}
                      </span>
                    </div>
                  </div>

                  {/* Body / Lots list */}
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
                              <td className="py-2 px-3 font-mono font-bold text-gray-505">{item.transactionNumber}</td>
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

      {/* Pagination Footer */}
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

      {/* Detail Drawer */}
      {selectedEntry && (
        <LedgerDetailDrawer
          entry={selectedEntry}
          companyId={selectedCompany?._id || ''}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
};

export default InventoryLedgerPage;

import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, Search, Calendar, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { getSkusV2, getWarehouseHierarchyV2, SkuV2, WarehouseLocationV2 } from '../../../../api/mfgApiV2';
import { fetchInventoryLedger } from '../services/ledgerService';
import { LedgerEntryV2 } from '../types';
import LedgerTable from '../components/LedgerTable';
import LedgerDetailDrawer from '../components/LedgerDetailDrawer';

const InventoryLedgerPage: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [entries, setEntries] = useState<LedgerEntryV2[]>([]);
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (selectedCompany?._id) {
      loadLedger();
    }
  }, [selectedCompany?._id, page, skuFilter, locFilter, typeFilter, directionFilter, startDate, endDate]);

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

  const loadLedger = async () => {
    setLoading(true);
    try {
      const res = await fetchInventoryLedger({
        companyId: selectedCompany?._id || '',
        skuId: skuFilter || undefined,
        locationId: locFilter || undefined,
        transactionType: typeFilter || undefined,
        direction: directionFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: search || undefined,
        page,
        limit
      });
      setEntries(res.entries);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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
            Inventory Ledger (Engine V2)
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Immutable historical transaction movements (Single Source of Truth)</p>
        </div>
        <button
          onClick={loadLedger}
          className="p-2 text-gray-600 hover:bg-gray-50 hover:text-blue-600 border border-gray-200 rounded-xl transition-colors bg-white shadow-sm flex items-center gap-1.5 text-xs font-semibold"
          title="Reload Ledger Log"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-3xs p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
        <div className="col-span-1 sm:col-span-2">
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
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Type</label>
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Types</option>
            <option value="Purchase">Purchase</option>
            <option value="Processing">Processing</option>
            <option value="Production">Production</option>
            <option value="Transfer">Transfer</option>
            <option value="Adjustment">Adjustment</option>
            <option value="Sale">Sale</option>
            <option value="Opening Balance">Opening Balance</option>
          </select>
        </div>
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

      {/* Table Component */}
      <LedgerTable
        entries={entries}
        loading={loading}
        onViewDetails={setSelectedEntry}
      />

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
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
};

export default InventoryLedgerPage;

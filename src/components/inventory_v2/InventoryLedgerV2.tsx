import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, Search, Calendar, RefreshCw, X, Eye, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getLedgerV2, getSkusV2, getWarehouseHierarchyV2, LedgerEntryV2, SkuV2, WarehouseLocationV2 } from '../../api/mfgApiV2';

const InventoryLedgerV2: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [ledger, setLedger] = useState<LedgerEntryV2[]>([]);
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [skuFilter, setSkuFilter] = useState('');
  const [locFilter, setLocFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected ledger entry for drawer
  const [selectedLedgerDetails, setSelectedLedgerDetails] = useState<LedgerEntryV2 | null>(null);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadFiltersData();
    }
  }, [selectedCompany?._id]);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadLedger();
    }
  }, [selectedCompany?._id, skuFilter, locFilter, typeFilter, startDate, endDate]);

  const loadFiltersData = async () => {
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
      const data = await getLedgerV2({
        companyId: selectedCompany?._id || '',
        skuId: skuFilter || undefined,
        locationId: locFilter || undefined,
        transactionType: typeFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      });
      setLedger(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setSkuFilter('');
    setLocFilter('');
    setTypeFilter('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-3xs">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-600 animate-pulse-slow" />
            Inventory Ledger (v2)
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Historical transaction audit logs matching ERPNext and SAP ledger standards</p>
        </div>
        <button
          onClick={loadLedger}
          className="p-2 text-gray-600 hover:bg-gray-50 hover:text-blue-600 border border-gray-200 rounded-xl transition-colors bg-white shadow-sm flex items-center gap-1.5 text-xs font-semibold"
          title="Reload Ledger"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-3xs p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Filter by SKU</label>
          <select
            value={skuFilter}
            onChange={e => setSkuFilter(e.target.value)}
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
            onChange={e => setLocFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Locations</option>
            {locations.map(l => (
              <option key={l._id} value={l._id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Filter by Type</label>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Transaction Types</option>
            <option value="Purchase Inward">Purchase Inward</option>
            <option value="Processing Consumption">Processing Consumption</option>
            <option value="Processing Output">Processing Output</option>
            <option value="Production Consumption">Production Consumption</option>
            <option value="Production Output">Production Output</option>
            <option value="Bundle Creation">Bundle Creation</option>
            <option value="Sales Dispatch">Sales Dispatch</option>
            <option value="Location Transfer">Location Transfer</option>
            <option value="Stock Adjustment">Stock Adjustment</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
          />
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
            />
          </div>
          <button
            onClick={resetFilters}
            className="p-2 text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors shadow-3xs"
            title="Reset Filters"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Ledger Table Grid */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-3xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : ledger.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase font-bold border-b border-gray-100">
                  <th className="px-6 py-3">Date & Time</th>
                  <th className="px-6 py-3">Transaction Type</th>
                  <th className="px-6 py-3">Reference ID</th>
                  <th className="px-6 py-3">SKU</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3 text-right">Qty In</th>
                  <th className="px-6 py-3 text-right">Qty Out</th>
                  <th className="px-6 py-3 text-right">Running Balance</th>
                  <th className="px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/70 text-gray-700">
                {ledger.map((tx) => (
                  <tr key={tx._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-gray-400">
                      {new Date(tx.timestamp).toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wider ${
                        tx.qtyIn > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {tx.transactionType}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-semibold text-gray-800 font-mono">{tx.referenceId}</td>
                    <td className="px-6 py-3.5">
                      <p className="font-bold text-gray-900">{tx.skuId?.name}</p>
                      <p className="font-mono text-[9px] text-gray-400 mt-0.5">{tx.skuId?.skuCode}</p>
                    </td>
                    <td className="px-6 py-3.5 font-medium text-gray-600">{tx.locationId?.name || 'Unknown Location'}</td>
                    <td className="px-6 py-3.5 text-right font-black text-green-600">
                      {tx.qtyIn > 0 ? `+${tx.qtyIn}` : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right font-black text-red-600">
                      {tx.qtyOut > 0 ? `-${tx.qtyOut}` : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right font-black text-gray-900">
                      {tx.balanceAfter} <span className="text-[10px] text-gray-400 font-medium">{tx.skuId?.unit}</span>
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <button
                        onClick={() => setSelectedLedgerDetails(tx)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100/50 shadow-3xs"
                        title="View Details"
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
            <p className="text-xs text-gray-500 mt-1">Audit log transactions will appear here as soon as Purchase inwards or stock movements occur.</p>
          </div>
        )}
      </div>

      {/* Transaction Details Slide-Over Drawer */}
      {selectedLedgerDetails && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-3xs" onClick={() => setSelectedLedgerDetails(null)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl h-full flex flex-col z-10 animate-in slide-in-from-right duration-250">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Transaction Details</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">Audit specifications for selected transaction</p>
              </div>
              <button
                onClick={() => setSelectedLedgerDetails(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-gray-950">
              <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-blue-600" /> System Audit Metadata
                </h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs text-gray-900">
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Reference ID</span>
                    <span className="font-bold font-mono text-sm">{selectedLedgerDetails.referenceId}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Timestamp</span>
                    <span className="font-semibold">{new Date(selectedLedgerDetails.timestamp).toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Transaction Type</span>
                    <span className="font-semibold text-blue-600">{selectedLedgerDetails.transactionType}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Registered By</span>
                    <span className="font-semibold">{selectedLedgerDetails.userId?.fullName || 'System Admin'}</span>
                  </div>
                  <div className="col-span-2 border-t border-gray-100 pt-2">
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">SKU Details</span>
                    <span className="font-bold block text-sm mt-0.5">{selectedLedgerDetails.skuId?.name}</span>
                    <span className="font-mono text-xs text-gray-400">({selectedLedgerDetails.skuId?.skuCode})</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Location</span>
                    <span className="font-semibold">{selectedLedgerDetails.locationId?.name || 'Unknown Location'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Stock Change</span>
                    <span className="font-bold">
                      {selectedLedgerDetails.qtyIn > 0 ? `+${selectedLedgerDetails.qtyIn}` : `-${selectedLedgerDetails.qtyOut}`} {selectedLedgerDetails.skuId?.unit}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Running Balance After</span>
                    <span className="font-bold text-sm text-gray-800">{selectedLedgerDetails.balanceAfter} {selectedLedgerDetails.skuId?.unit}</span>
                  </div>
                  <div className="col-span-2 border-t border-gray-100 pt-2">
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Operator Remarks / Notes</span>
                    <p className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg p-2.5 mt-1 leading-relaxed whitespace-pre-line font-medium">
                      {selectedLedgerDetails.remarks || 'No transaction notes recorded.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50 text-right">
              <button
                onClick={() => setSelectedLedgerDetails(null)}
                className="px-5 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-3xs"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryLedgerV2;

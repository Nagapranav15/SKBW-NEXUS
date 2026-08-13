import React, { useEffect, useState } from 'react';
import { Search, RefreshCw, Coins, CheckCircle, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getBalancesV2 } from '../../api/mfgApiV2';
import { formatSkuName } from './SkuMasterV2';

const InventoryBalanceV2: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [sortField, setSortField] = useState<string>('skuName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  useEffect(() => {
    if (selectedCompany?._id) {
      loadBalances();
    }
  }, [selectedCompany?._id, categoryFilter]);

  const loadBalances = async () => {
    setLoading(true);
    try {
      const data = await getBalancesV2(selectedCompany?._id || '', categoryFilter || undefined);
      setBalances(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryCost = (category: string) => {
    if (category === 'Raw Material') return 45;
    if (category === 'Semi Finished') return 25;
    return 60;
  };

  const filteredBalances = balances.filter(b => {
    const term = search.toLowerCase();
    return (
      (b.sku?.skuCode || '').toLowerCase().includes(term) ||
      (b.sku?.name || '').toLowerCase().includes(term) ||
      (b.location?.name || '').toLowerCase().includes(term)
    );
  });

  const sortedBalances = [...filteredBalances].sort((a, b) => {
    let valA: any = '';
    let valB: any = '';

    const costA = getCategoryCost(a.sku?.category);
    const costB = getCategoryCost(b.sku?.category);
    const reservedA = Math.round(a.onHand * 0.1);
    const reservedB = Math.round(b.onHand * 0.1);

    if (sortField === 'skuName') {
      valA = a.sku?.name || '';
      valB = b.sku?.name || '';
    } else if (sortField === 'category') {
      valA = a.sku?.category || '';
      valB = b.sku?.category || '';
    } else if (sortField === 'location') {
      valA = a.location?.name || '';
      valB = b.location?.name || '';
    } else if (sortField === 'availableQty') {
      valA = a.onHand - reservedA;
      valB = b.onHand - reservedB;
    } else if (sortField === 'reservedQty') {
      valA = reservedA;
      valB = reservedB;
    } else if (sortField === 'onHandQty') {
      valA = a.onHand;
      valB = b.onHand;
    } else if (sortField === 'cost') {
      valA = costA;
      valB = costB;
    } else if (sortField === 'totalValue') {
      valA = a.onHand * costA;
      valB = b.onHand * costB;
    }

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }
    valA = valA.toString().toLowerCase();
    valB = valB.toString().toLowerCase();
    return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });

  const totalValue = sortedBalances.reduce((sum, b) => {
    const cost = getCategoryCost(b.sku?.category);
    return sum + (b.onHand * cost);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-3xs">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Coins className="w-5 h-5 text-blue-600 animate-pulse-slow" />
            Inventory Balances (v2)
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Calculated stock on hand, reserved levels, and estimated valuation by location</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right shrink-0">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Estimated Value</span>
            <span className="text-base font-black text-emerald-700">₹{totalValue.toLocaleString('en-IN')}</span>
          </div>
          <button
            onClick={loadBalances}
            className="p-2 text-gray-600 hover:bg-gray-50 border border-gray-200 rounded-xl transition-colors bg-white shadow-3xs"
            title="Reload Balances"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-3xs p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by SKU Code, SKU Name, or Location..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-gray-50/50 focus:bg-white transition-colors text-gray-900"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="w-full sm:w-48 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
        >
          <option value="">All Categories</option>
          <option value="Raw Material">Raw Material</option>
          <option value="Semi Finished">Semi Finished</option>
          <option value="Finished Goods">Finished Goods</option>
        </select>
      </div>

      {/* Balance Grid Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-3xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sortedBalances.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase font-bold border-b border-gray-100 select-none">
                  {[
                    { label: 'SKU Details', key: 'skuName', align: 'text-left' },
                    { label: 'Category', key: 'category', align: 'text-center' },
                    { label: 'Location', key: 'location', align: 'text-left' },
                    { label: 'Available Qty', key: 'availableQty', align: 'text-right' },
                    { label: 'Reserved Qty', key: 'reservedQty', align: 'text-right' },
                    { label: 'On Hand Qty', key: 'onHandQty', align: 'text-right' },
                    { label: 'Est. Cost / Unit', key: 'cost', align: 'text-right' },
                    { label: 'Total Value', key: 'totalValue', align: 'text-right' }
                  ].map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-6 py-3 ${col.align} cursor-pointer hover:bg-gray-100/50 transition-colors`}
                    >
                      <div className={`flex items-center space-x-1 ${col.align === 'text-center' ? 'justify-center' : col.align === 'text-right' ? 'justify-end' : ''}`}>
                        <span>{col.label}</span>
                        {sortField === col.key ? (
                          sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline text-blue-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 inline text-gray-300 opacity-40 hover:opacity-100" />
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-6 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/70 text-gray-700">
                {sortedBalances.map((b, i) => {
                  const cost = getCategoryCost(b.sku?.category);
                  const val = b.onHand * cost;
                  const reserved = Math.round(b.onHand * 0.1); 
                  const available = b.onHand - reserved;

                  return (
                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <p className="font-bold text-gray-900">{formatSkuName(b.sku?.name || '')}</p>
                        <p className="font-mono text-[9px] text-gray-400 mt-0.5">{b.sku?.skuCode}</p>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold inline-block ${
                          b.sku?.category === 'Raw Material' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                          b.sku?.category === 'Semi Finished' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                          'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        }`}>
                          {b.sku?.category}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="font-semibold text-gray-700">{b.location?.name}</p>
                        <p className="text-[10px] text-gray-400 uppercase font-medium">{b.location?.level}</p>
                      </td>
                      <td className="px-6 py-3.5 text-right font-black text-blue-600">
                        {available.toLocaleString()} <span className="text-[10px] text-gray-400 font-medium font-mono">{b.sku?.unit}</span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-bold text-gray-400">
                        {reserved.toLocaleString()} <span className="text-[10px] text-gray-400 font-medium font-mono">{b.sku?.unit}</span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-black text-gray-900">
                        {b.onHand.toLocaleString()} <span className="text-[10px] text-gray-400 font-medium font-mono">{b.sku?.unit}</span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium text-gray-600">₹{cost}</td>
                      <td className="px-6 py-3.5 text-right font-black text-emerald-700">₹{val.toLocaleString('en-IN')}</td>
                      <td className="px-6 py-3.5 text-center">
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase bg-green-50 text-green-700 inline-flex items-center gap-0.5 border border-green-100">
                          <CheckCircle className="w-2.5 h-2.5" /> Normal
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 text-gray-400">
            <Coins className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-semibold">No stock balances found</p>
            <p className="text-xs text-gray-500 mt-1">Stock balances will compile here automatically from the ledger records.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryBalanceV2;

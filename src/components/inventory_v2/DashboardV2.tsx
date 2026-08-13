import React, { useEffect, useState } from 'react';
import { Package, Layers, ArrowRightLeft, RefreshCw, AlertTriangle, Coins, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getDashboardStatsV2 } from '../../api/mfgApiV2';
import { LedgerEntryV2 } from './ledger/ledgerService';

const DashboardV2: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadStats();
    }
  }, [selectedCompany?._id]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const s = await getDashboardStatsV2(selectedCompany?._id);
      setStats(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const formatVal = (val: number) => {
    return `₹${(val || 0).toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-3xs">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600 animate-pulse-slow" />
            Inventory Dashboard (Beta)
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Real-time ledger metrics & raw-to-finish stock aggregates</p>
        </div>
        <button
          onClick={loadStats}
          className="p-2 text-gray-600 hover:bg-gray-50 hover:text-blue-600 border border-gray-200 rounded-xl transition-colors bg-white shadow-sm flex items-center gap-1.5 text-xs font-semibold"
          title="Reload Dashboard"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Sync Ledger
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Unique SKUs */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-3xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Total SKUs</span>
            <span className="text-2xl font-black text-gray-900 block">{stats?.totalSkus || 0}</span>
            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">Active</span>
          </div>
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-600">
            <Package className="w-5 h-5" />
          </div>
        </div>

        {/* RM Stock */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-3xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Raw Materials</span>
            <span className="text-2xl font-black text-gray-900 block">
              {(stats?.rawMaterialStock || 0).toLocaleString()} <span className="text-xs text-gray-400 font-normal">kg</span>
            </span>
            <span className="text-[10px] text-gray-400 font-bold">Reels & Large Sheets</span>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-600">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* SF Stock */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-3xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Semi Finished</span>
            <span className="text-2xl font-black text-gray-900 block">
              {(stats?.semiFinishedStock || 0).toLocaleString()} <span className="text-xs text-gray-400 font-normal">Sheets</span>
            </span>
            <span className="text-[10px] text-gray-400 font-bold">Ruled & Plain Inserts</span>
          </div>
          <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl text-purple-600">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* FG Stock & Value */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-3xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Finished Books</span>
            <span className="text-2xl font-black text-gray-900 block">
              {(stats?.finishedGoodsStock || 0).toLocaleString()} <span className="text-xs text-gray-400 font-normal">pcs</span>
            </span>
            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
              Est Value: {formatVal(stats?.inventoryValue)}
            </span>
          </div>
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600">
            <Coins className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Info Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Movements & Category Distribution */}
        <div className="lg:col-span-2 space-y-6">
          {/* Category Distribution chart */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-3xs p-4">
            <h2 className="text-[14px] font-bold text-gray-900 pb-2 border-b border-gray-100 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              Inventory Balance by Category
            </h2>
            <div className="pt-4 space-y-4">
              {stats?.categoryDistribution?.map((dist: any) => {
                const color = dist.category === 'Raw Material' ? 'bg-amber-500' : dist.category === 'Semi Finished' ? 'bg-purple-500' : 'bg-emerald-500';
                return (
                  <div key={dist.category} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-gray-700">
                      <span>{dist.category}</span>
                      <span>{dist.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${dist.percentage}%` }} />
                    </div>
                  </div>
                );
              })}
              {(!stats?.categoryDistribution || stats.categoryDistribution.length === 0) && (
                <p className="text-center py-6 text-xs text-gray-400 italic">No category split recorded yet</p>
              )}
            </div>
          </div>

          {/* Recent Movements ledger view */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-3xs overflow-hidden">
            <h2 className="text-[14px] font-bold text-gray-900 p-4 border-b border-gray-100 flex items-center gap-1.5">
              <ArrowRightLeft className="w-4 h-4 text-blue-600" />
              Recent Ledger Transactions (v2)
            </h2>
            <div className="overflow-x-auto">
              {stats?.recentTransactions?.length > 0 ? (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 uppercase font-bold border-b border-gray-100">
                      <th className="px-5 py-3">Timestamp</th>
                      <th className="px-5 py-3">Transaction</th>
                      <th className="px-5 py-3">SKU</th>
                      <th className="px-5 py-3 text-right">In</th>
                      <th className="px-5 py-3 text-right">Out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100/70 text-gray-700">
                    {stats.recentTransactions.map((tx: LedgerEntryV2) => (
                      <tr key={tx._id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-2.5 font-medium text-gray-400">
                          {new Date(tx.createdAt || tx.updatedAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="px-5 py-2.5 font-semibold text-gray-800">
                          <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wider ${
                            tx.direction === 'IN' ? 'bg-green-50 text-green-700 border border-green-150' : 'bg-red-50 text-red-700 border border-red-150'
                          }`}>
                            {tx.transactionType}
                          </span>
                        </td>
                        <td className="px-5 py-2.5">
                          <p className="font-bold text-gray-900 break-words">{tx.skuId?.name}</p>
                          <p className="font-mono text-[9px] text-gray-400 mt-0.5">{tx.skuId?.skuCode}</p>
                        </td>
                        <td className="px-5 py-2.5 text-right font-black text-green-600 font-mono">
                          {tx.direction === 'IN' ? `+${tx.quantity}` : '—'}
                        </td>
                        <td className="px-5 py-2.5 text-right font-black text-red-600 font-mono">
                          {tx.direction === 'OUT' ? `-${tx.quantity}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-10 text-gray-400">
                  <ArrowRightLeft className="w-8 h-8 text-gray-300 mx-auto mb-1.5" />
                  <p className="text-xs">No transactions recorded yet in the new ledger</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Low Stock Alerts */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-3xs p-4 h-fit">
          <h2 className="text-[14px] font-bold text-gray-900 pb-2 border-b border-gray-100 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-red-600 animate-bounce" />
            Low Stock Alerts
          </h2>
          <div className="pt-3 space-y-2.5">
            {stats?.lowStockAlerts?.length > 0 ? (
              stats.lowStockAlerts.map((alert: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-red-50/40 border border-red-100/70 rounded-xl">
                  <div className="flex-1 pr-3">
                    <h3 className="text-xs font-bold text-gray-900 break-words">{alert.name}</h3>
                    <p className="text-[9px] font-mono text-gray-400 mt-0.5">{alert.skuCode}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-red-600">{alert.onHand} {alert.unit}</p>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">{alert.category}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Package className="w-8 h-8 text-gray-200 mx-auto mb-1.5" />
                <p className="text-xs font-medium">All item levels normal</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardV2;

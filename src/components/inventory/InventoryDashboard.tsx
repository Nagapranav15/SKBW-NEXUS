import React, { useEffect, useState } from 'react';
import { Package, AlertTriangle, History, Layers, ArrowRightLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as invApi from '../../api/inventoryApi';
import * as ledgerApi from '../../api/inventoryLedgerApi';
import { showToast } from '../ui/Toast';

const StatCard = ({ title, value, icon, bgColor }: any) => (
  <div className="bg-white p-6 rounded-xl border border-gray-200 flex items-center gap-4 hover:shadow-md transition-shadow">
    <div className={`p-3 rounded-lg ${bgColor}`}>{icon}</div>
    <div>
      <p className="text-sm text-gray-500 font-medium">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  </div>
);

const InventoryDashboard: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (selectedCompany) fetchData(); }, [selectedCompany]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dashRes, sumRes, mvRes] = await Promise.all([
        ledgerApi.getInventoryDashboardSummary(selectedCompany?._id),
        invApi.getInventorySummary(selectedCompany?._id),
        invApi.getAllStockMovements(selectedCompany?._id, { limit: 10 })
      ]);
      setStats(dashRes.data);
      setSummary(sumRes.data);
      setMovements(mvRes.data.movements || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  const totalQty = summary.reduce((s: number, i: any) => s + (i.totalQuantity || 0), 0);
  const lowStockCount = stats?.lowStockCount || 0;
  const finishedStock = summary.filter((s: any) => s.item?.category === 'finished').reduce((a: number, s: any) => a + (s.totalQuantity || 0), 0);
  const rawStock = summary.filter((s: any) => s.item?.category === 'raw').reduce((a: number, s: any) => a + (s.totalQuantity || 0), 0);

  // Category breakdown for pie chart simulation
  const categories = summary.reduce((acc: any, s: any) => {
    const cat = s.item?.category || 'uncategorized';
    acc[cat] = (acc[cat] || 0) + (s.totalQuantity || 0);
    return acc;
  }, {});
  const catColors: any = { finished: 'bg-blue-500', semi: 'bg-purple-500', raw: 'bg-amber-500', uncategorized: 'bg-gray-400' };
  const catLabels: any = { finished: 'Finished Goods', semi: 'Work in Progress', raw: 'Raw Materials', uncategorized: 'Other' };

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active SKUs" value={summary.length} icon={<Package className="w-5 h-5 text-blue-600" />} bgColor="bg-blue-50" />
        <StatCard title="Low Stock Items" value={lowStockCount} icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} bgColor="bg-amber-50" />
        <StatCard title="Finished Stock" value={finishedStock.toLocaleString()} icon={<Layers className="w-5 h-5 text-green-600" />} bgColor="bg-green-50" />
        <StatCard title="Raw Materials" value={rawStock.toLocaleString()} icon={<ArrowRightLeft className="w-5 h-5 text-purple-600" />} bgColor="bg-purple-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory by Category */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Inventory by Category</h2>
          </div>
          <div className="p-6">
            {Object.keys(categories).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(categories).map(([cat, qty]: any) => {
                  const pct = totalQty > 0 ? ((qty / totalQty) * 100).toFixed(1) : '0';
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{catLabels[cat] || cat}</span>
                        <span className="text-gray-500">{qty.toLocaleString()} ({pct}%)</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${catColors[cat] || 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">No inventory data yet. Record movements to see stock levels.</p>
            )}
          </div>
        </div>

        {/* Recent Movements */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Movements</h2>
          </div>
          <div className="overflow-x-auto">
            {movements.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-xs font-medium uppercase">
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Item</th>
                    <th className="px-6 py-3">Qty</th>
                    <th className="px-6 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {movements.map((m: any) => (
                    <tr key={m._id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          m.movement_type === 'IN' ? 'bg-green-100 text-green-800' :
                          m.movement_type === 'OUT' ? 'bg-red-100 text-red-800' :
                          m.movement_type === 'TRANSFER' ? 'bg-blue-100 text-blue-800' :
                          m.movement_type === 'ADJUSTMENT' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>{m.movement_type}</span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="text-sm font-medium text-gray-900">{m.item?.name || 'Unknown'}</div>
                        <div className="text-xs text-gray-500">{m.item?.itemId}</div>
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                      <td className="px-6 py-3 text-sm text-gray-500">{new Date(m.date || m.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-400 text-center py-8">No movements recorded yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Low Stock Alerts */}
      {stats?.lowStockItems?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-900">Low Stock Alerts</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs font-medium uppercase">
                  <th className="px-6 py-3">Item</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Current</th>
                  <th className="px-6 py-3">Minimum</th>
                  <th className="px-6 py-3">Deficit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.lowStockItems.map((item: any) => (
                  <tr key={item._id} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.itemId}</div>
                    </td>
                    <td className="px-6 py-3"><span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{item.category}</span></td>
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{item.currentStock}</td>
                    <td className="px-6 py-3 text-sm text-gray-500">{item.minimumStock}</td>
                    <td className="px-6 py-3"><span className={`text-sm font-medium ${item.isOutOfStock ? 'text-red-600' : 'text-amber-600'}`}>{item.deficit}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryDashboard;

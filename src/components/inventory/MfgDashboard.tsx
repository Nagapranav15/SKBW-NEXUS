import React, { useEffect, useState } from 'react';
import { Package, MapPin, ArrowRightLeft, Layers, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as mfgApi from '../../api/mfgApi';

const MfgDashboard: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [stock, setStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (selectedCompany) load(); }, [selectedCompany]);

  const load = async () => {
    setLoading(true);
    try {
      const [s, st] = await Promise.all([
        mfgApi.getDashboardStats(selectedCompany?._id),
        mfgApi.getStock(selectedCompany?._id)
      ]);
      setStats(s.data);
      setStock(st.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  const finished = stock.filter(s => s.sku?.category === 'Finished').reduce((a, s) => a + s.quantity, 0);
  const raw = stock.filter(s => s.sku?.category === 'Raw').reduce((a, s) => a + s.quantity, 0);

  const catBreakdown: any = {};
  stock.forEach(s => { const c = s.sku?.category || 'Other'; catBreakdown[c] = (catBreakdown[c] || 0) + s.quantity; });
  const totalQty = stock.reduce((a, s) => a + s.quantity, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div><h1 className="text-2xl font-bold text-gray-900">Dashboard</h1><p className="text-sm text-gray-500 mt-1">Overview of your manufacturing inventory</p></div>
        <button onClick={load} className="p-2 text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors bg-white shadow-sm" title="Refresh Dashboard"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-blue-50"><MapPin className="w-5 h-5 text-blue-600" /></div>
          <div><p className="text-sm text-gray-500">Total Zones</p><p className="text-2xl font-bold">{stats?.totalZones || 0}</p></div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-green-50"><Package className="w-5 h-5 text-green-600" /></div>
          <div><p className="text-sm text-gray-500">Active SKUs</p><p className="text-2xl font-bold">{stats?.activeSkus || 0}</p></div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-purple-50"><Layers className="w-5 h-5 text-purple-600" /></div>
          <div><p className="text-sm text-gray-500">Finished Stock (GBL)</p><p className="text-2xl font-bold">{finished.toLocaleString()}</p></div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-amber-50"><ArrowRightLeft className="w-5 h-5 text-amber-600" /></div>
          <div><p className="text-sm text-gray-500">Raw Materials</p><p className="text-2xl font-bold">{raw.toLocaleString()}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100"><h2 className="text-lg font-semibold">Inventory by Category</h2></div>
          <div className="p-6 space-y-4">
            {Object.entries(catBreakdown).map(([cat, qty]: any) => {
              const pct = totalQty > 0 ? (qty / totalQty * 100).toFixed(1) : '0';
              const color = cat === 'Finished' ? 'bg-blue-500' : cat === 'Raw' ? 'bg-amber-500' : 'bg-purple-500';
              return (<div key={cat}><div className="flex justify-between text-sm mb-1"><span className="font-medium text-gray-700">{cat}</span><span className="text-gray-500">{qty.toLocaleString()} ({pct}%)</span></div><div className="w-full h-2 bg-gray-100 rounded-full"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div></div>);
            })}
            {Object.keys(catBreakdown).length === 0 && <p className="text-gray-400 text-center py-8">No inventory data yet</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100"><h2 className="text-lg font-semibold">Recent Movements</h2></div>
          <div className="overflow-x-auto">
            {stats?.recentMovements?.length > 0 ? (
              <table className="w-full text-left"><thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase"><th className="px-6 py-3">Type</th><th className="px-6 py-3">SKU</th><th className="px-6 py-3">Qty</th><th className="px-6 py-3">Date</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.recentMovements.map((m: any) => (
                    <tr key={m._id} className="hover:bg-gray-50">
                      <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.type === 'IN' ? 'bg-green-100 text-green-800' : m.type === 'OUT' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{m.type}</span></td>
                      <td className="px-6 py-3 text-sm">{m.sku?.name || '-'}</td>
                      <td className="px-6 py-3 text-sm font-medium">{m.quantity}</td>
                      <td className="px-6 py-3 text-xs text-gray-500">{new Date(m.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-gray-400 text-center py-8">No movements yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MfgDashboard;

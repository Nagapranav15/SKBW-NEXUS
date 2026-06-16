import React, { useEffect, useState } from 'react';
import { Search, Download, AlertTriangle, Package, Eye, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as invApi from '../../api/inventoryApi';
import * as ledgerApi from '../../api/inventoryLedgerApi';
import { showToast } from '../ui/Toast';

const SkuStockPage: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [summary, setSummary] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [detailItem, setDetailItem] = useState<any>(null);
  const [detailMovements, setDetailMovements] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => { if (selectedCompany) loadData(); }, [selectedCompany]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sumRes, lsRes] = await Promise.all([
        invApi.getInventorySummary(selectedCompany?._id),
        ledgerApi.getLowStockItems(selectedCompany?._id)
      ]);
      setSummary(sumRes.data);
      setLowStock(lsRes.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const viewDetails = async (item: any) => {
    setDetailItem(item);
    setDetailLoading(true);
    try {
      const res = await invApi.getStockMovements(item.item?._id, selectedCompany?._id);
      setDetailMovements(res.data.movements || []);
    } catch (err) { console.error(err); }
    finally { setDetailLoading(false); }
  };

  const handleExport = async () => {
    try {
      const res = await ledgerApi.exportInventory(selectedCompany?._id);
      const rows = res.data;
      if (!rows?.length) { showToast('No data to export', 'warning'); return; }
      const headers = Object.keys(rows[0]);
      const csv = [headers.join(','), ...rows.map((r: any) => headers.map(h => `"${r[h] || ''}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `sku_stock_${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
      showToast('Exported successfully', 'success');
    } catch { showToast('Export failed', 'error'); }
  };

  const categories = [...new Set(summary.map((s: any) => s.item?.category).filter(Boolean))];
  const lowStockIds = new Set(lowStock.map((l: any) => l._id?.toString()));

  let filtered = summary;
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((i: any) => i.item?.name?.toLowerCase().includes(s) || i.item?.itemId?.toLowerCase().includes(s));
  }
  if (filterCat) filtered = filtered.filter((i: any) => i.item?.category === filterCat);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-semibold text-gray-900">SKU Master & Stock</h2><p className="text-sm text-gray-500 mt-1">Inventory levels per item</p></div>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"><Download className="w-4 h-4 text-gray-600" /> Export CSV</button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs font-medium uppercase tracking-wider">
                <th className="px-6 py-3">Item Code</th>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">Unit</th>
                <th className="px-6 py-3">Total Stock</th>
                <th className="px-6 py-3">Locations</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">No items found</td></tr>
              ) : filtered.map((s: any) => {
                const isLow = lowStockIds.has(s.item?._id?.toString());
                const isOut = s.totalQuantity === 0;
                return (
                  <tr key={s.item?._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-sm font-medium text-blue-600">{s.item?.itemId}</td>
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{s.item?.name}</td>
                    <td className="px-6 py-3"><span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{s.item?.category || '-'}</span></td>
                    <td className="px-6 py-3 text-sm text-gray-500">{s.item?.primaryUnit || '-'}</td>
                    <td className="px-6 py-3 text-sm font-semibold text-gray-900">{s.totalQuantity?.toLocaleString()}</td>
                    <td className="px-6 py-3 text-sm text-gray-500">{s.locations?.length || 0} zone(s)</td>
                    <td className="px-6 py-3">
                      {isOut ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Out of Stock</span> :
                       isLow ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1 w-fit"><AlertTriangle className="w-3 h-3" />Low</span> :
                       <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">In Stock</span>}
                    </td>
                    <td className="px-6 py-3">
                      <button onClick={() => viewDetails(s)} className="p-1 hover:bg-blue-50 rounded text-blue-600" title="View details"><Eye className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div><h3 className="text-lg font-semibold">{detailItem.item?.name}</h3><p className="text-sm text-gray-500">{detailItem.item?.itemId} · Total: {detailItem.totalQuantity}</p></div>
              <button onClick={() => setDetailItem(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            {/* Locations */}
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Stock by Location</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(detailItem.locations || []).map((loc: any, i: number) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-xs text-gray-500">{loc.warehouse?.name} / {loc.sectionId}</p>
                    <p className="text-lg font-bold text-gray-900">{loc.quantity}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Movements */}
            <div className="flex-1 overflow-y-auto">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Recent Movements</h4>
              {detailLoading ? <p className="text-gray-400 text-sm py-4">Loading...</p> :
               detailMovements.length === 0 ? <p className="text-gray-400 text-sm py-4">No movements</p> : (
                <div className="space-y-2">
                  {detailMovements.slice(0, 20).map((m: any) => (
                    <div key={m._id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          m.movement_type === 'IN' ? 'bg-green-100 text-green-700' :
                          m.movement_type === 'OUT' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>{m.movement_type}</span>
                        <span className="text-gray-600">{m.notes || m.source_type}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-medium ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</span>
                        <span className="text-gray-400 text-xs">{new Date(m.date || m.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkuStockPage;

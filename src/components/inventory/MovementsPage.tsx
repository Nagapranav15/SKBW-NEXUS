import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, Plus, X, Search, Filter, ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as invApi from '../../api/inventoryApi';
import { getItems } from '../../api/itemApi';
import { showToast } from '../ui/Toast';

type MovementType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'PRODUCTION_CONSUME' | 'PRODUCTION_OUTPUT' | '';

const MovementsPage: React.FC = () => {
  const { selectedCompany, hasPermission } = useAuth();
  const canManage = hasPermission('MANAGE_INVENTORY');

  const [movements, setMovements] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filterType, setFilterType] = useState<MovementType>('');
  const [search, setSearch] = useState('');
  const [showRecordModal, setShowRecordModal] = useState(false);

  const [items, setItems] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [form, setForm] = useState({ item: '', warehouse: '', sectionId: '', quantity: '', movement_type: 'IN' as string, source_type: 'MANUAL', notes: '' });

  const limit = 20;

  useEffect(() => { if (selectedCompany) { loadMovements(); loadFormData(); } }, [selectedCompany, page, filterType]);

  const loadMovements = async () => {
    setLoading(true);
    try {
      const res = await invApi.getAllStockMovements(selectedCompany?._id, {
        limit, skip: page * limit,
        ...(filterType ? { movement_type: filterType } : {})
      });
      setMovements(res.data.movements || []);
      setTotal(res.data.total || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadFormData = async () => {
    try {
      const [itemRes, whRes] = await Promise.all([
        getItems(selectedCompany?._id),
        invApi.getWarehouses(selectedCompany?._id)
      ]);
      setItems(itemRes.data.filter((i: any) => i.status === 'active'));
      setWarehouses(whRes.data);
    } catch (err) { console.error(err); }
  };

  const handleRecord = async () => {
    if (!form.item || !form.quantity) return;
    try {
      const qty = Number(form.quantity);
      if (form.movement_type === 'IN') {
        await invApi.addStock({ item: form.item, warehouse: form.warehouse, sectionId: form.sectionId || 'DEFAULT', quantity: qty, company: selectedCompany?._id });
      } else {
        // For other types use adjust endpoint
        await invApi.updateStock(form.item, { quantity: form.movement_type === 'OUT' ? -qty : qty });
      }
      setShowRecordModal(false);
      setForm({ item: '', warehouse: '', sectionId: '', quantity: '', movement_type: 'IN', source_type: 'MANUAL', notes: '' });
      loadMovements();
      showToast('Movement recorded successfully', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.msg || 'Failed to record movement', 'error');
    }
  };

  const sections = warehouses.find((w: any) => w._id === form.warehouse)?.sections || [];

  const typeColors: any = {
    IN: 'bg-green-100 text-green-800', OUT: 'bg-red-100 text-red-800',
    TRANSFER: 'bg-blue-100 text-blue-800', ADJUSTMENT: 'bg-yellow-100 text-yellow-800',
    PRODUCTION_CONSUME: 'bg-orange-100 text-orange-800', PRODUCTION_OUTPUT: 'bg-purple-100 text-purple-800'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Stock Movements</h2>
          <p className="text-sm text-gray-500 mt-1">Track all inventory movements</p>
        </div>
        {canManage && (
          <button onClick={() => setShowRecordModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> Record Movement
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-600"><Filter className="w-4 h-4" /> Filter:</div>
        {['', 'IN', 'OUT', 'TRANSFER', 'ADJUSTMENT'].map(t => (
          <button key={t} onClick={() => { setFilterType(t as MovementType); setPage(0); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {t || 'All'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={loadMovements} className="p-2 hover:bg-gray-100 rounded-lg" title="Refresh"><RefreshCw className="w-4 h-4 text-gray-500" /></button>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs font-medium uppercase tracking-wider">
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Item</th>
                <th className="px-6 py-3">Quantity</th>
                <th className="px-6 py-3">Before → After</th>
                <th className="px-6 py-3">Source</th>
                <th className="px-6 py-3">Location</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">Loading movements...</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">No movements found</td></tr>
              ) : movements.map((m: any) => (
                <tr key={m._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[m.movement_type] || 'bg-gray-100 text-gray-700'}`}>
                      {m.movement_type === 'IN' && <ArrowDownLeft className="w-3 h-3" />}
                      {m.movement_type === 'OUT' && <ArrowUpRight className="w-3 h-3" />}
                      {m.movement_type === 'TRANSFER' && <ArrowRightLeft className="w-3 h-3" />}
                      {m.movement_type}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="text-sm font-medium text-gray-900">{m.item?.name || 'Unknown'}</div>
                    <div className="text-xs text-gray-500">{m.item?.itemId}</div>
                  </td>
                  <td className="px-6 py-3"><span className={`text-sm font-semibold ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</span></td>
                  <td className="px-6 py-3 text-sm text-gray-500">
                    {m.quantity_before != null ? `${m.quantity_before} → ${m.quantity_after}` : '-'}
                  </td>
                  <td className="px-6 py-3"><span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{m.source_type}</span></td>
                  <td className="px-6 py-3 text-sm text-gray-500">
                    {m.warehouse?.name || '-'}{m.sectionId ? ` / ${m.sectionId}` : ''}
                    {m.movement_type === 'TRANSFER' && m.from_warehouse && (
                      <div className="text-xs text-blue-500 mt-0.5">{m.from_warehouse?.name} → {m.to_warehouse?.name || m.warehouse?.name}</div>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-500">{new Date(m.date || m.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-3 text-sm text-gray-400 max-w-[200px] truncate">{m.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-500">Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded text-gray-600 disabled:opacity-50 hover:bg-gray-50">Prev</button>
              <button disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded text-gray-600 disabled:opacity-50 hover:bg-gray-50">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Record Movement Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">Record Movement</h3>
              <button onClick={() => setShowRecordModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Movement Type</label>
                <select value={form.movement_type} onChange={e => setForm(f => ({ ...f, movement_type: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="IN">Inbound</option>
                  <option value="OUT">Outbound</option>
                  <option value="ADJUSTMENT">Adjustment</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
                <select value={form.item} onChange={e => setForm(f => ({ ...f, item: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">Select item...</option>
                  {items.map((i: any) => <option key={i._id} value={i._id}>{i.name} ({i.itemId})</option>)}
                </select>
              </div>
              {form.movement_type === 'IN' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
                    <select value={form.warehouse} onChange={e => setForm(f => ({ ...f, warehouse: e.target.value, sectionId: '' }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                      <option value="">Select warehouse...</option>
                      {warehouses.map((w: any) => <option key={w._id} value={w._id}>{w.name}</option>)}
                    </select>
                  </div>
                  {sections.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                      <select value={form.sectionId} onChange={e => setForm(f => ({ ...f, sectionId: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                        <option value="">Select section...</option>
                        {sections.map((s: any) => <option key={s.sectionId} value={s.sectionId}>{s.name}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" min="1" placeholder="Enter quantity" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={2} placeholder="Optional notes..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowRecordModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleRecord} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Record</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MovementsPage;

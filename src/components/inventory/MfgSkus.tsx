import React, { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, X, Search, Package, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as mfgApi from '../../api/mfgApi';
import { showToast } from '../ui/Toast';

const MfgSkus: React.FC = () => {
  const { selectedCompany, hasPermission, hasRole } = useAuth();
  const canManage = hasPermission('MANAGE_INVENTORY');
  const isAdmin = hasRole('admin');
  const [skus, setSkus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ sku_code: '', name: '', category: 'Raw', brand: '', pages: '', default_books_per_gbl: '', unit_type: 'kg', cost_per_unit: '' });

  useEffect(() => { if (selectedCompany) load(); }, [selectedCompany]);
  const load = async () => { setLoading(true); try { const r = await mfgApi.getSkus(selectedCompany?._id); setSkus(r.data); } catch (e) { console.error(e); } finally { setLoading(false); } };

  const handleSave = async () => {
    try {
      const data = { ...form, pages: form.pages ? Number(form.pages) : null, default_books_per_gbl: form.default_books_per_gbl ? Number(form.default_books_per_gbl) : null, cost_per_unit: Number(form.cost_per_unit) || 0, company: selectedCompany?._id };
      if (editId) await mfgApi.updateSku(editId, data); else await mfgApi.createSku(data);
      setShowModal(false); setEditId(null); load(); showToast(editId ? 'Updated' : 'Created', 'success');
    } catch (e: any) { showToast(e.response?.data?.msg || 'Error', 'error'); }
  };

  const handleDelete = async (id: string) => { if (!confirm('Delete this SKU?')) return; try { await mfgApi.deleteSku(id); load(); showToast('Deleted', 'success'); } catch (e: any) { showToast(e.response?.data?.msg || 'Error', 'error'); } };

  const openEdit = (s: any) => { setForm({ sku_code: s.sku_code, name: s.name, category: s.category, brand: s.brand || '', pages: s.pages?.toString() || '', default_books_per_gbl: s.default_books_per_gbl?.toString() || '', unit_type: s.unit_type, cost_per_unit: s.cost_per_unit?.toString() || '' }); setEditId(s._id); setShowModal(true); };

  let filtered = skus;
  if (search) { const s = search.toLowerCase(); filtered = filtered.filter(sk => sk.name.toLowerCase().includes(s) || sk.sku_code.toLowerCase().includes(s)); }
  if (filterCat) filtered = filtered.filter(sk => sk.category === filterCat);

  const catColors: any = { Raw: 'bg-amber-100 text-amber-800', Semi: 'bg-purple-100 text-purple-800', Finished: 'bg-blue-100 text-blue-800' };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">SKU Master</h1><p className="text-sm text-gray-500">Product catalog for manufacturing</p></div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors bg-white shadow-sm" title="Refresh SKU Master"><RefreshCw className="w-4 h-4" /></button>
          {canManage && <button onClick={() => { setShowModal(true); setEditId(null); setForm({ sku_code: '', name: '', category: 'Raw', brand: '', pages: '', default_books_per_gbl: '', unit_type: 'kg', cost_per_unit: '' }); }} className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><Plus className="w-4 h-4" /> Add SKU</button>}
        </div>
      </div>
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKUs..." className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm" /></div>
        {['', 'Raw', 'Semi', 'Finished'].map(c => <button key={c} onClick={() => setFilterCat(c)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filterCat === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{c || 'All'}</button>)}
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-left"><thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase"><th className="px-6 py-3">Code</th><th className="px-6 py-3">Name</th><th className="px-6 py-3">Category</th><th className="px-6 py-3">Unit</th><th className="px-6 py-3">Pages</th><th className="px-6 py-3">Books/GBL</th>{isAdmin && <th className="px-6 py-3">Cost/Unit</th>}<th className="px-6 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr> :
             filtered.length === 0 ? <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">No SKUs found</td></tr> :
             filtered.map(s => (
              <tr key={s._id} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-sm font-medium text-blue-600">{s.sku_code}</td>
                <td className="px-6 py-3 text-sm font-medium">{s.name}</td>
                <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${catColors[s.category]}`}>{s.category}</span></td>
                <td className="px-6 py-3 text-sm text-gray-500">{s.unit_type}</td>
                <td className="px-6 py-3 text-sm text-gray-500">{s.pages || '-'}</td>
                <td className="px-6 py-3 text-sm text-gray-500">{s.default_books_per_gbl || '-'}</td>
                {isAdmin && <td className="px-6 py-3 text-sm text-gray-500">₹{s.cost_per_unit || 0}</td>}
                <td className="px-6 py-3 flex gap-1">
                  {canManage && <><button onClick={() => openEdit(s)} className="p-1 hover:bg-blue-50 rounded"><Edit className="w-4 h-4 text-blue-600" /></button><button onClick={() => handleDelete(s._id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">{editId ? 'Edit' : 'Add'} SKU</h3><button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button></div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">SKU Code *</label><input value={form.sku_code} onChange={e => setForm({ ...form, sku_code: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium mb-1">Category *</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="Raw">Raw</option><option value="Semi">Semi</option><option value="Finished">Finished</option></select></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Brand</label><input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium mb-1">Unit Type *</label><select value={form.unit_type} onChange={e => setForm({ ...form, unit_type: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="kg">kg</option><option value="pcs">pcs</option><option value="gbl">gbl</option></select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-sm font-medium mb-1">Pages</label><input type="number" value={form.pages} onChange={e => setForm({ ...form, pages: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium mb-1">Books/GBL</label><input type="number" value={form.default_books_per_gbl} onChange={e => setForm({ ...form, default_books_per_gbl: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                {isAdmin && <div><label className="block text-sm font-medium mb-1">Cost/Unit</label><input type="number" value={form.cost_per_unit} onChange={e => setForm({ ...form, cost_per_unit: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">{editId ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MfgSkus;

import React, { useEffect, useState } from 'react';
import { Plus, X, Filter, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as mfgApi from '../../api/mfgApi';
import { showToast } from '../ui/Toast';

const MfgMovements: React.FC = () => {
  const { selectedCompany, hasPermission, hasRole } = useAuth();
  const canManage = hasPermission('MANAGE_INVENTORY');
  const isAdmin = hasRole('admin');
  const [movements, setMovements] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filterType, setFilterType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [skus, setSkus] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [form, setForm] = useState({ type: 'IN', from_zone: '', to_zone: '', sku: '', quantity: '', unit: 'kg', gsm_used: '', books_per_gbl: '', cost_per_unit: '', remarks: '' });
  const limit = 25;

  useEffect(() => { if (selectedCompany) { load(); loadFormData(); } }, [selectedCompany, page, filterType]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await mfgApi.getMovements({ companyId: selectedCompany?._id, limit, skip: page * limit, ...(filterType ? { type: filterType } : {}) });
      setMovements(r.data.movements || []); setTotal(r.data.total || 0);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const loadFormData = async () => {
    try {
      const [s, z] = await Promise.all([mfgApi.getSkus(selectedCompany?._id), mfgApi.getZones(selectedCompany?._id)]);
      setSkus(s.data); setZones(z.data);
    } catch (e) { console.error(e); }
  };

  const handleRecord = async () => {
    try {
      const data: any = { ...form, quantity: Number(form.quantity), company: selectedCompany?._id };
      if (form.gsm_used) data.gsm_used = Number(form.gsm_used);
      if (form.books_per_gbl) data.books_per_gbl = Number(form.books_per_gbl);
      if (form.cost_per_unit) data.cost_per_unit = Number(form.cost_per_unit);
      if (!data.from_zone) delete data.from_zone;
      if (!data.to_zone) delete data.to_zone;
      await mfgApi.recordMovement(data);
      setShowModal(false); load();
      showToast('Movement recorded', 'success');
    } catch (e: any) { showToast(e.response?.data?.msg || 'Failed', 'error'); }
  };

  const typeColors: any = { IN: 'bg-green-100 text-green-800', OUT: 'bg-red-100 text-red-800', TRANSFER: 'bg-blue-100 text-blue-800' };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Movements</h1><p className="text-sm text-gray-500">Track all stock movements</p></div>
        {canManage && <button onClick={() => setShowModal(true)} className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><Plus className="w-4 h-4" /> Record</button>}
      </div>
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4 text-gray-500" />
        {['', 'IN', 'OUT', 'TRANSFER'].map(t => <button key={t} onClick={() => { setFilterType(t); setPage(0); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filterType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{t || 'All'}</button>)}
        <button onClick={load} className="ml-auto p-2 hover:bg-gray-100 rounded-lg"><RefreshCw className="w-4 h-4 text-gray-500" /></button>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-left"><thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase"><th className="px-6 py-3">Type</th><th className="px-6 py-3">SKU</th><th className="px-6 py-3">Qty</th><th className="px-6 py-3">From</th><th className="px-6 py-3">To</th>{isAdmin && <th className="px-6 py-3">Cost</th>}<th className="px-6 py-3">Date</th><th className="px-6 py-3">Remarks</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr> :
             movements.length === 0 ? <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">No movements</td></tr> :
             movements.map(m => (
              <tr key={m._id} className="hover:bg-gray-50">
                <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[m.type]}`}>{m.type}</span></td>
                <td className="px-6 py-3 text-sm">{m.sku?.name || '-'}<div className="text-xs text-gray-400">{m.sku?.sku_code}</div></td>
                <td className="px-6 py-3 text-sm font-semibold">{m.quantity} {m.unit}</td>
                <td className="px-6 py-3 text-sm text-gray-500">{m.from_zone?.zone_code || '-'}</td>
                <td className="px-6 py-3 text-sm text-gray-500">{m.to_zone?.zone_code || '-'}</td>
                {isAdmin && <td className="px-6 py-3 text-sm">₹{m.cost_per_unit || 0}</td>}
                <td className="px-6 py-3 text-xs text-gray-500">{new Date(m.createdAt).toLocaleDateString()}</td>
                <td className="px-6 py-3 text-sm text-gray-400 max-w-[150px] truncate">{m.remarks || '-'}</td>
              </tr>))}
          </tbody></table>
        {total > limit && <div className="px-6 py-3 border-t flex justify-between text-sm"><span className="text-gray-500">{page*limit+1}–{Math.min((page+1)*limit,total)} of {total}</span><div className="flex gap-2"><button disabled={page===0} onClick={()=>setPage(p=>p-1)} className="px-3 py-1 border rounded disabled:opacity-50">Prev</button><button disabled={(page+1)*limit>=total} onClick={()=>setPage(p=>p+1)} className="px-3 py-1 border rounded disabled:opacity-50">Next</button></div></div>}
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">Record Movement</h3><button onClick={()=>setShowModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button></div>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium mb-1">Type</label><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="IN">IN</option><option value="OUT">OUT</option><option value="TRANSFER">TRANSFER</option></select></div>
              <div><label className="block text-sm font-medium mb-1">SKU</label><select value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Select...</option>{skus.map(s=><option key={s._id} value={s._id}>{s.name} ({s.sku_code})</option>)}</select></div>
              {(form.type==='OUT'||form.type==='TRANSFER')&&<div><label className="block text-sm font-medium mb-1">From Zone</label><select value={form.from_zone} onChange={e=>setForm({...form,from_zone:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Select...</option>{zones.map(z=><option key={z._id} value={z._id}>{z.zone_code}</option>)}</select></div>}
              {(form.type==='IN'||form.type==='TRANSFER')&&<div><label className="block text-sm font-medium mb-1">To Zone</label><select value={form.to_zone} onChange={e=>setForm({...form,to_zone:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Select...</option>{zones.map(z=><option key={z._id} value={z._id}>{z.zone_code}</option>)}</select></div>}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Quantity</label><input type="number" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium mb-1">Unit</label><select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="kg">kg</option><option value="pcs">pcs</option><option value="gbl">gbl</option></select></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Remarks</label><textarea value={form.remarks} onChange={e=>setForm({...form,remarks:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5"><button onClick={()=>setShowModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button><button onClick={handleRecord} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Record</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MfgMovements;

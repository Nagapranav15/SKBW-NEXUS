import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit, X, Play, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as mfgApi from '../../api/mfgApi';
import { showToast } from '../ui/Toast';

const MfgBom: React.FC = () => {
  const { selectedCompany, hasPermission } = useAuth();
  const canManage = hasPermission('MANAGE_INVENTORY');
  const [boms, setBoms] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showExecModal, setShowExecModal] = useState<any>(null);
  const [editId, setEditId] = useState<string|null>(null);
  const [form, setForm] = useState({ name: '', output_sku: '', output_quantity: '1', components: [{ sku: '', quantity: '', unit: 'kg' }], notes: '' });
  const [execForm, setExecForm] = useState({ zone_id: '', multiplier: '1' });

  useEffect(() => {
    if (selectedCompany?._id) {
      load();
    }
  }, [selectedCompany]);

  const load = async () => {
    if (!selectedCompany?._id) return;
    setLoading(true);
    try {
      const [b, s, z] = await Promise.all([
        mfgApi.getBoms(selectedCompany._id),
        mfgApi.getSkus(selectedCompany._id),
        mfgApi.getZones(selectedCompany._id)
      ]);
      setBoms(b.data); setSkus(s.data); setZones(z.data);
    } catch(e){console.error(e);}
    finally{setLoading(false);}
  };

  const handleSave = async () => {
    if (!selectedCompany?._id) return;
    try {
      const data = { ...form, output_quantity: Number(form.output_quantity), components: form.components.filter(c => c.sku && c.quantity).map(c => ({ ...c, quantity: Number(c.quantity) })), company: selectedCompany._id };
      if (editId) await mfgApi.updateBom(editId, data); else await mfgApi.createBom(data);
      setShowModal(false); setEditId(null); load(); showToast(editId ? 'Updated' : 'Created', 'success');
    } catch (e: any) { showToast(e.response?.data?.msg || 'Error', 'error'); }
  };

  const handleExecute = async () => {
    if (!selectedCompany?._id) return;
    try {
      await mfgApi.executeBom({ bomId: showExecModal._id, zone_id: execForm.zone_id, multiplier: Number(execForm.multiplier), company: selectedCompany._id });
      setShowExecModal(null); showToast('BOM executed — components consumed, output produced', 'success');
    } catch (e: any) { showToast(e.response?.data?.msg || 'Execution failed', 'error'); }
  };

  const addComponent = () => setForm({ ...form, components: [...form.components, { sku: '', quantity: '', unit: 'kg' }] });
  const removeComponent = (i: number) => setForm({ ...form, components: form.components.filter((_, idx) => idx !== i) });
  const updateComponent = (i: number, field: string, val: string) => { const c = [...form.components]; (c[i] as any)[field] = val; setForm({ ...form, components: c }); };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">BOM & Assembly</h1><p className="text-sm text-gray-500">Bill of Materials and production execution</p></div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors bg-white shadow-sm" title="Refresh BOMs"><RefreshCw className="w-4 h-4" /></button>
          {canManage && <button onClick={() => { setShowModal(true); setEditId(null); setForm({ name: '', output_sku: '', output_quantity: '1', components: [{ sku: '', quantity: '', unit: 'kg' }], notes: '' }); }} className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><Plus className="w-4 h-4" /> Create BOM</button>}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? <p className="text-gray-400 col-span-2 text-center py-12">Loading...</p> :
         boms.length === 0 ? <p className="text-gray-400 col-span-2 text-center py-12">No BOMs yet</p> :
         boms.map(b => (
          <div key={b._id} className="bg-white rounded-xl border overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
              <div><h3 className="font-semibold">{b.name}</h3><p className="text-xs text-gray-500">Output: {b.output_sku?.name} × {b.output_quantity}</p></div>
              <div className="flex gap-1">
                {canManage && <button onClick={() => { setShowExecModal(b); setExecForm({ zone_id: zones[0]?._id || '', multiplier: '1' }); }} className="p-1.5 bg-green-50 hover:bg-green-100 rounded" title="Execute"><Play className="w-4 h-4 text-green-600" /></button>}
                {canManage && <button onClick={() => { setEditId(b._id); setForm({ name: b.name, output_sku: b.output_sku?._id, output_quantity: b.output_quantity.toString(), components: b.components.map((c: any) => ({ sku: c.sku?._id, quantity: c.quantity.toString(), unit: c.unit })), notes: b.notes || '' }); setShowModal(true); }} className="p-1.5 hover:bg-blue-50 rounded"><Edit className="w-4 h-4 text-blue-600" /></button>}
                {canManage && <button onClick={async () => { if (confirm('Delete?')) { await mfgApi.deleteBom(b._id); load(); } }} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>}
              </div>
            </div>
            <div className="p-4">
              <p className="text-xs font-medium text-gray-500 mb-2">COMPONENTS</p>
              <div className="space-y-1">
                {b.components.map((c: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm p-2 bg-gray-50 rounded"><span>{c.sku?.name || '-'}</span><span className="text-gray-500">{c.quantity} {c.unit}</span></div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit BOM Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">{editId ? 'Edit' : 'Create'} BOM</h3><button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button></div>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium mb-1">BOM Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Output SKU</label><select value={form.output_sku} onChange={e => setForm({ ...form, output_sku: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Select...</option>{skus.filter(s => s.category === 'Finished' || s.category === 'Semi').map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">Output Qty</label><input type="number" value={form.output_quantity} onChange={e => setForm({ ...form, output_quantity: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium mb-2">Components</label>
                {form.components.map((c, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <select value={c.sku} onChange={e => updateComponent(i, 'sku', e.target.value)} className="flex-1 px-2 py-1.5 border rounded text-sm"><option value="">SKU...</option>{skus.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select>
                    <input type="number" value={c.quantity} onChange={e => updateComponent(i, 'quantity', e.target.value)} className="w-20 px-2 py-1.5 border rounded text-sm" placeholder="Qty" />
                    <select value={c.unit} onChange={e => updateComponent(i, 'unit', e.target.value)} className="w-16 px-2 py-1.5 border rounded text-sm"><option>kg</option><option>pcs</option><option>gbl</option></select>
                    <button onClick={() => removeComponent(i)} className="p-1 text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                  </div>
                ))}
                <button onClick={addComponent} className="text-sm text-blue-600 hover:text-blue-700">+ Add component</button>
              </div>
              <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5"><button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button><button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">{editId ? 'Update' : 'Create'}</button></div>
          </div>
        </div>
      )}

      {/* Execute BOM Modal */}
      {showExecModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">Execute: {showExecModal.name}</h3><button onClick={() => setShowExecModal(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button></div>
            <p className="text-sm text-gray-600 mb-4">This will consume components and produce output in the selected zone.</p>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium mb-1">Zone</label><select value={execForm.zone_id} onChange={e => setExecForm({ ...execForm, zone_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Select...</option>{zones.map(z => <option key={z._id} value={z._id}>{z.zone_code}</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">Multiplier</label><input type="number" value={execForm.multiplier} onChange={e => setExecForm({ ...execForm, multiplier: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" min="1" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5"><button onClick={() => setShowExecModal(null)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button><button onClick={handleExecute} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Execute</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MfgBom;

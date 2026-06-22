import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, X, Package, ArrowRightLeft, ArrowDownLeft, ArrowUpRight, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as mfgApi from '../../api/mfgApi';
import { showToast } from '../ui/Toast';

interface Props {
  zone: any;
  factory: any;
  floor: any;
  factories: any[];
  floors: any[];
  onBack: () => void;
  onZoneUpdated: (zone: any) => void;
  onZoneDeleted: () => void;
}

const ZoneDetail: React.FC<Props> = ({ zone: initialZone, factory: initialFactory, floor: initialFloor, factories, floors, onBack, onZoneUpdated, onZoneDeleted }) => {
  const { selectedCompany, hasPermission, hasRole } = useAuth();
  const canManage = hasPermission('MANAGE_INVENTORY');
  const isAdmin = hasRole('admin');
  const [zone, setZone] = useState(initialZone);
  const [factory, setFactory] = useState(initialFactory);
  const [floor, setFloor] = useState(initialFloor);
  const [stock, setStock] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showEditZone, setShowEditZone] = useState(false);
  const [form, setForm] = useState({ type: 'IN', sku: '', quantity: '', unit: 'kg', cost_per_unit: '', remarks: '' });
  const [editForm, setEditForm] = useState({ zone_code: '', name: '', description: '', factory_id: '', floor_id: '' });

  useEffect(() => { load(); }, [zone._id]);

  const load = async () => {
    setLoading(true);
    try {
      const [s, m, sk] = await Promise.all([
        mfgApi.getZoneStock(zone._id, selectedCompany?._id),
        mfgApi.getZoneMovements(zone._id, selectedCompany?._id, 20),
        mfgApi.getSkus(selectedCompany?._id)
      ]);
      setStock(s.data || []);
      setMovements(m.data || []);
      setSkus(sk.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleAddStock = async () => {
    try {
      const data: any = {
        type: form.type,
        sku: form.sku,
        quantity: Number(form.quantity),
        unit: form.unit,
        remarks: form.remarks || '',
        company: selectedCompany?._id
      };
      if (form.type === 'IN') data.to_zone = zone._id;
      if (form.type === 'OUT') data.from_zone = zone._id;
      if (form.cost_per_unit) data.cost_per_unit = Number(form.cost_per_unit);
      await mfgApi.recordMovement(data);
      setShowAddStock(false);
      setForm({ type: 'IN', sku: '', quantity: '', unit: 'kg', cost_per_unit: '', remarks: '' });
      load();
      showToast('Stock updated', 'success');
    } catch (e: any) { showToast(e.response?.data?.msg || 'Failed', 'error'); }
  };

  const skuCount = stock.length;
  const totalUnits = stock.reduce((a: number, s: any) => a + s.quantity, 0);
  const typeColors: any = { IN: 'bg-emerald-100 text-emerald-700', OUT: 'bg-red-100 text-red-700', TRANSFER: 'bg-blue-100 text-blue-700' };

  const openEditZone = () => {
    setEditForm({
      zone_code: zone.zone_code,
      name: zone.name || '',
      description: zone.description || '',
      factory_id: factory?._id || zone.factory_id?._id || zone.factory_id || '',
      floor_id: floor?._id || zone.floor_id?._id || zone.floor_id || ''
    });
    setShowEditZone(true);
  };

  const handleEditZone = async () => {
    try {
      const res = await mfgApi.updateZone(zone._id, editForm);
      const updated = res.data;
      setZone(updated);
      const newFactory = factories.find((f: any) => f._id === editForm.factory_id);
      const newFloor = floors.find((f: any) => f._id === editForm.floor_id);
      if (newFactory) setFactory(newFactory);
      if (newFloor) setFloor(newFloor);
      onZoneUpdated(updated);
      setShowEditZone(false);
      showToast('Zone updated', 'success');
    } catch (e: any) { showToast(e.response?.data?.msg || 'Update failed', 'error'); }
  };

  const handleDeleteZone = async () => {
    if (!confirm(`Delete zone ${zone.zone_code}? This cannot be undone.`)) return;
    try {
      await mfgApi.deleteZone(zone._id);
      showToast('Zone deleted', 'success');
      onZoneDeleted();
    } catch (e: any) { showToast(e.response?.data?.msg || 'Cannot delete', 'error'); }
  };

  const editFloors = floors.filter((f: any) => (f.factory_id?._id || f.factory_id) === editForm.factory_id);

  return (
    <div className="p-6 space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Zones
      </button>

      {/* Zone Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mt-0.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{zone.name || zone.zone_code}</h1>
              <span className="inline-block mt-1 text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{zone.zone_code}</span>
              <p className="text-sm text-gray-500 mt-1">{factory?.name} › {floor?.name} — {zone.zone_code}</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            {canManage && (
              <div className="flex gap-1 mt-1">
                <button onClick={openEditZone} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Edit Zone"><Edit className="w-4 h-4 text-gray-500" /></button>
                <button onClick={handleDeleteZone} className="p-2 hover:bg-red-50 rounded-lg transition-colors" title="Delete Zone"><Trash2 className="w-4 h-4 text-red-400" /></button>
              </div>
            )}
            <div className="text-right">
              <p className="text-3xl font-bold text-gray-900">{skuCount}</p>
              <p className="text-sm text-gray-500">SKUs in stock</p>
            </div>
          </div>
        </div>
      </div>

      {/* Current Stock */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Current Stock</h2>
          {canManage && (
            <button onClick={() => setShowAddStock(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Stock
            </button>
          )}
        </div>
        <div className="p-5">
          {loading ? <p className="text-gray-400 text-center py-6">Loading...</p> :
           stock.length === 0 ? (
            <div className="text-center py-10">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">No stock in this zone</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead><tr className="text-xs text-gray-500 uppercase border-b"><th className="pb-2 pr-4">SKU</th><th className="pb-2 pr-4">Category</th><th className="pb-2 pr-4">Quantity</th><th className="pb-2">Unit</th>{isAdmin && <th className="pb-2">Value</th>}</tr></thead>
              <tbody className="divide-y divide-gray-50">
                {stock.map((s: any, i: number) => {
                  const catColor = s.sku?.category === 'Raw' ? 'bg-amber-100 text-amber-700' : s.sku?.category === 'Finished' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-3 pr-4"><p className="font-medium text-[13.5px]">{s.sku?.name}</p><p className="text-xs text-gray-400">{s.sku?.sku_code}</p></td>
                      <td className="py-3 pr-4"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catColor}`}>{s.sku?.category}</span></td>
                      <td className="py-3 pr-4 text-[13.5px] font-semibold">{s.quantity.toLocaleString()}</td>
                      <td className="py-3 text-[13.5px] text-gray-500">{s.sku?.unit_type}</td>
                      {isAdmin && <td className="py-3 text-[13.5px] text-gray-500">₹{(s.quantity * (s.sku?.cost_per_unit || 0)).toLocaleString()}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent Movements */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900">Recent Movements</h2></div>
        <div className="p-5">
          {movements.length === 0 ? (
            <div className="text-center py-10">
              <ArrowRightLeft className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">No movement history for this zone</p>
            </div>
          ) : (
            <div className="space-y-2">
              {movements.map((m: any) => (
                <div key={m._id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[m.type]}`}>
                      {m.type === 'IN' && <ArrowDownLeft className="w-3 h-3" />}
                      {m.type === 'OUT' && <ArrowUpRight className="w-3 h-3" />}
                      {m.type === 'TRANSFER' && <ArrowRightLeft className="w-3 h-3" />}
                      {m.type}
                    </span>
                    <div><p className="text-sm font-medium">{m.sku?.name}</p><p className="text-xs text-gray-400">{m.remarks || m.source || ''}</p></div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{m.quantity} {m.unit}</p>
                    <p className="text-xs text-gray-400">{new Date(m.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Stock Modal */}
      {showAddStock && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Stock to {zone.zone_code}</h3>
              <button onClick={() => setShowAddStock(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium mb-1">Type</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="IN">IN (Add stock)</option><option value="OUT">OUT (Remove stock)</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">SKU</label>
                <select value={form.sku} onChange={e => { const sk = skus.find((s: any) => s._id === e.target.value); setForm({ ...form, sku: e.target.value, unit: sk?.unit_type || form.unit }); }} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Select SKU...</option>
                  {skus.map((s: any) => <option key={s._id} value={s._id}>{s.name} ({s.sku_code})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Quantity</label><input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" min="0.01" step="0.01" /></div>
                <div><label className="block text-sm font-medium mb-1">Unit</label>
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="kg">kg</option><option value="pcs">pcs</option><option value="gbl">gbl</option>
                  </select>
                </div>
              </div>
              {isAdmin && <div><label className="block text-sm font-medium mb-1">Cost/Unit</label><input type="number" value={form.cost_per_unit} onChange={e => setForm({ ...form, cost_per_unit: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>}
              <div><label className="block text-sm font-medium mb-1">Remarks</label><input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Purchase from supplier" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowAddStock(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={handleAddStock} disabled={!form.sku || !form.quantity} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">Record</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Zone Modal */}
      {showEditZone && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Edit Zone</h3>
              <button onClick={() => setShowEditZone(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium mb-1">Zone Code</label><input value={editForm.zone_code} onChange={e => setEditForm({ ...editForm, zone_code: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium mb-1">Name</label><input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Raw Material Store" /></div>
              <div><label className="block text-sm font-medium mb-1">Description</label><input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div className="border-t pt-3 mt-3"><p className="text-xs font-medium text-gray-500 uppercase mb-2">Move to different location</p></div>
              <div><label className="block text-sm font-medium mb-1">Factory</label>
                <select value={editForm.factory_id} onChange={e => setEditForm({ ...editForm, factory_id: e.target.value, floor_id: '' })} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Select factory...</option>
                  {factories.map((f: any) => <option key={f._id} value={f._id}>{f.name} ({f.code})</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Floor</label>
                <select value={editForm.floor_id} onChange={e => setEditForm({ ...editForm, floor_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Select floor...</option>
                  {editFloors.map((f: any) => <option key={f._id} value={f._id}>{f.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowEditZone(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={handleEditZone} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZoneDetail;

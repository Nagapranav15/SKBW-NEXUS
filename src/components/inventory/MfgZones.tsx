import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit, X, Search, Factory, Layers, MapPin, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as mfgApi from '../../api/mfgApi';
import { showToast } from '../ui/Toast';
import ZoneDetail from './ZoneDetail';

const MfgZones: React.FC = () => {
  const { selectedCompany, hasPermission } = useAuth();
  const canManage = hasPermission('MANAGE_INVENTORY');
  const [factories, setFactories] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [zoneStockMap, setZoneStockMap] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterFactory, setFilterFactory] = useState('');
  const [filterFloor, setFilterFloor] = useState('');
  const [showModal, setShowModal] = useState<'factory' | 'floor' | 'zone' | null>(null);
  const [form, setForm] = useState<any>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<any>(null);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadAll();
    }
  }, [selectedCompany]);

  const loadAll = async () => {
    if (!selectedCompany?._id) return;
    setLoading(true);
    try {
      const [f, fl, z, zs] = await Promise.all([
        mfgApi.getFactories(selectedCompany._id),
        mfgApi.getFloors(selectedCompany._id),
        mfgApi.getZones(selectedCompany._id),
        mfgApi.getZonesWithStock(selectedCompany._id)
      ]);
      setFactories(f.data); setFloors(fl.data); setZones(z.data); setZoneStockMap(zs.data || {});
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!selectedCompany?._id) return;
    try {
      if (showModal === 'factory') {
        if (editId) await mfgApi.updateFactory(editId, form);
        else await mfgApi.createFactory({ ...form, company: selectedCompany._id });
      } else if (showModal === 'floor') {
        if (editId) await mfgApi.updateFloor(editId, form);
        else await mfgApi.createFloor({ ...form, company: selectedCompany._id });
      } else if (showModal === 'zone') {
        if (editId) await mfgApi.updateZone(editId, form);
        else await mfgApi.createZone({ ...form, company: selectedCompany._id });
      }
      setShowModal(null); setForm({}); setEditId(null); loadAll();
      showToast(`${showModal} ${editId ? 'updated' : 'created'}`, 'success');
    } catch (e: any) { showToast(e.response?.data?.msg || 'Error', 'error'); }
  };

  const handleDelete = async (type: string, id: string) => {
    if (!confirm('Are you sure?')) return;
    try {
      if (type === 'factory') await mfgApi.deleteFactory(id);
      else if (type === 'floor') await mfgApi.deleteFloor(id);
      else await mfgApi.deleteZone(id);
      loadAll(); showToast('Deleted', 'success');
    } catch (e: any) { showToast(e.response?.data?.msg || 'Cannot delete', 'error'); }
  };

  // If a zone is selected, show detail view
  if (selectedZone) {
    const zFactory = factories.find(f => f._id === (selectedZone.factory_id?._id || selectedZone.factory_id));
    const zFloor = floors.find(f => f._id === (selectedZone.floor_id?._id || selectedZone.floor_id));
    return (
      <ZoneDetail
        zone={selectedZone}
        factory={zFactory}
        floor={zFloor}
        factories={factories}
        floors={floors}
        onBack={() => { setSelectedZone(null); loadAll(); }}
        onZoneUpdated={(updated) => { setSelectedZone(updated); }}
        onZoneDeleted={() => { setSelectedZone(null); loadAll(); }}
      />
    );
  }

  // Filter zones
  let filteredZones = zones;
  if (search) { const s = search.toLowerCase(); filteredZones = filteredZones.filter(z => z.zone_code.toLowerCase().includes(s) || (z.name || '').toLowerCase().includes(s)); }

  // Get factories to display
  let displayFactories = factories;
  if (filterFactory) displayFactories = displayFactories.filter(f => f._id === filterFactory);

  const getFloorZones = (floorId: string) => {
    let fz = filteredZones.filter(z => (z.floor_id?._id || z.floor_id) === floorId);
    if (filterFloor && filterFloor !== floorId) return [];
    return fz;
  };

  const getFactoryFloors = (factoryId: string) => {
    let ff = floors.filter(f => (f.factory_id?._id || f.factory_id) === factoryId);
    if (filterFloor) ff = ff.filter(f => f._id === filterFloor);
    return ff;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Zone Management</h1><p className="text-sm text-gray-500">Manage factories, floors, and storage zones</p></div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="p-2 text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors bg-white shadow-sm" title="Refresh Page"><RefreshCw className="w-4 h-4" /></button>
          {canManage && (
            <>
              <button onClick={() => { setShowModal('factory'); setForm({ name: '', code: '' }); setEditId(null); }} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"><Factory className="w-4 h-4" /> Factory</button>
              <button onClick={() => { setShowModal('floor'); setForm({ name: '', factory_id: factories[0]?._id || '' }); setEditId(null); }} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"><Layers className="w-4 h-4" /> Floor</button>
              <button onClick={() => { setShowModal('zone'); setForm({ zone_code: '', name: '', description: '', floor_id: '', factory_id: factories[0]?._id || '' }); setEditId(null); }} className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700"><Plus className="w-4 h-4" /> Zone</button>
            </>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search zones by name or code..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filterFactory} onChange={e => { setFilterFactory(e.target.value); setFilterFloor(''); }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
          <option value="">All Factories</option>
          {factories.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
        </select>
        <select value={filterFloor} onChange={e => setFilterFloor(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
          <option value="">All Floors</option>
          {floors.filter(f => !filterFactory || (f.factory_id?._id || f.factory_id) === filterFactory).map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
        </select>
      </div>

      {/* Factory → Floor → Zone hierarchy */}
      {displayFactories.map(factory => {
        const factoryFloors = getFactoryFloors(factory._id);
        const totalZones = zones.filter(z => (z.factory_id?._id || z.factory_id) === factory._id).length;
        return (
          <div key={factory._id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Factory Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Factory className="w-5 h-5 text-gray-600" />
                <div><h2 className="font-semibold text-gray-900">{factory.name}</h2><p className="text-xs text-gray-500">Code: {factory.code}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{totalZones} zones</span>
                {canManage && <>
                  <button onClick={() => { setShowModal('factory'); setForm({ name: factory.name, code: factory.code }); setEditId(factory._id); }} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit className="w-4 h-4 text-gray-500" /></button>
                  <button onClick={() => handleDelete('factory', factory._id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-gray-400" /></button>
                </>}
              </div>
            </div>

            {/* Floors */}
            <div className="divide-y divide-gray-50">
              {factoryFloors.map(floor => {
                const floorZones = getFloorZones(floor._id);
                return (
                  <div key={floor._id} className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Layers className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">{floor.name}</span>
                      <span className="text-xs text-gray-400">› {floorZones.length} zones</span>
                      {canManage && <div className="ml-auto flex gap-1">
                        <button onClick={() => { setShowModal('floor'); setForm({ name: floor.name, factory_id: factory._id }); setEditId(floor._id); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-3.5 h-3.5 text-gray-400" /></button>
                        <button onClick={() => handleDelete('floor', floor._id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5 text-gray-400" /></button>
                      </div>}
                    </div>

                    {/* Zone Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {floorZones.map(zone => {
                        const zStock = zoneStockMap[zone._id] || { skuCount: 0, totalQty: 0 };
                        return (
                          <div key={zone._id} onClick={() => setSelectedZone(zone)}
                            className="p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all group">
                            <div className="flex items-start gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-900 text-sm">{zone.name || zone.zone_code}</h4>
                                <p className="text-xs font-mono text-emerald-600 mt-0.5">{zone.zone_code}</p>
                                {zone.description && <p className="text-xs text-gray-500 mt-1">{zone.description}</p>}
                                <p className="text-xs text-gray-400 mt-2">{zStock.skuCount} SKUs · {zStock.totalQty.toLocaleString(undefined, {maximumFractionDigits: 1})} units</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {floorZones.length === 0 && <p className="text-sm text-gray-400 py-2 pl-6">No zones on this floor</p>}
                  </div>
                );
              })}
              {factoryFloors.length === 0 && <p className="text-sm text-gray-400 px-5 py-4">No floors in this factory</p>}
            </div>
          </div>
        );
      })}
      {displayFactories.length === 0 && <div className="bg-white rounded-xl border p-12 text-center text-gray-400">No factories found. Create one to get started.</div>}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold capitalize">{editId ? 'Edit' : 'Add'} {showModal}</h3><button onClick={() => setShowModal(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button></div>
            <div className="space-y-3">
              {showModal === 'factory' && (<>
                <div><label className="block text-sm font-medium mb-1">Name</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium mb-1">Code</label><input value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. F1" /></div>
              </>)}
              {showModal === 'floor' && (<>
                <div><label className="block text-sm font-medium mb-1">Factory</label><select value={form.factory_id || ''} onChange={e => setForm({ ...form, factory_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Select...</option>{factories.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">Floor Name</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </>)}
              {showModal === 'zone' && (<>
                <div><label className="block text-sm font-medium mb-1">Factory</label><select value={form.factory_id || ''} onChange={e => setForm({ ...form, factory_id: e.target.value, floor_id: '' })} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Select...</option>{factories.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">Floor</label><select value={form.floor_id || ''} onChange={e => setForm({ ...form, floor_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Select...</option>{floors.filter(f => (f.factory_id?._id || f.factory_id) === form.factory_id).map(f => <option key={f._id} value={f._id}>{f.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">Zone Code</label><input value={form.zone_code || ''} onChange={e => setForm({ ...form, zone_code: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. A1" /></div>
                <div><label className="block text-sm font-medium mb-1">Name</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Raw Material Store" /></div>
                <div><label className="block text-sm font-medium mb-1">Description</label><input value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </>)}
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowModal(null)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">{editId ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MfgZones;

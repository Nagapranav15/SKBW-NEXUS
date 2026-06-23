import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Plus, X, Package, ArrowRightLeft,
  ArrowDownLeft, ArrowUpRight, Edit, Trash2, MapPin,
  MoreVertical, RefreshCw, TrendingUp
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as mfgApi from '../../api/mfgApi';
import { showToast } from '../ui/Toast';
import { createActivityLog } from '../../api/activityLogApi';

interface Props {
  zone: any;
  factory: any;
  floor: any;
  factories: any[];
  floors: any[];
  onBack: () => void;
  onZoneUpdated: (zone: any) => void;
  onZoneDeleted: (deletedZone?: any) => void;
}

const fmt = (n: number) =>
  (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const fmtCurrency = (n: number) =>
  '₹' + (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${
    status === 'active' ? 'bg-green-100 text-green-700' :
    status === 'inactive' ? 'bg-gray-100 text-gray-500' :
    'bg-yellow-100 text-yellow-700'
  }`}>
    {status ?? 'active'}
  </span>
);

const ZoneDetail: React.FC<Props> = ({
  zone: initialZone, factory: initialFactory, floor: initialFloor,
  factories, floors, onBack, onZoneUpdated, onZoneDeleted
}) => {
  const { selectedCompany, hasPermission, hasRole } = useAuth();
  const canManage = hasPermission('MANAGE_INVENTORY');
  const isAdmin = hasRole('admin');

  const logActivity = async (action: string, name: string, details: string) => {
    if (!selectedCompany) return;
    try {
      await createActivityLog({
        action,
        entityType: 'inventory_zone',
        entityName: name,
        details,
        company: selectedCompany._id
      });
    } catch (e) {
      console.error('Failed to log activity:', e);
    }
  };

  const [zone, setZone] = useState(initialZone);
  const [factory, setFactory] = useState(initialFactory);
  const [floor, setFloor] = useState(initialFloor);

  const [stock, setStock] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddStock, setShowAddStock] = useState(false);
  const [showEditZone, setShowEditZone] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [form, setForm] = useState({
    type: 'IN', sku: '', quantity: '', unit: 'kg', cost_per_unit: '', remarks: ''
  });
  const [editForm, setEditForm] = useState({
    zone_code: '', name: '', description: '', factory_id: '', floor_id: '', status: 'active'
  });

  useEffect(() => { load(); }, [zone._id]);

  const load = async () => {
    setLoading(true);
    try {
      const [s, m, sk] = await Promise.all([
        mfgApi.getZoneStock(zone._id, selectedCompany?._id),
        mfgApi.getZoneMovements(zone._id, selectedCompany?._id, 20),
        mfgApi.getSkus(selectedCompany?._id)
      ]);
      setStock(s.data ?? []);
      setMovements(m.data ?? []);
      setSkus(sk.data ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Computed
  const skuCount = stock.length;
  const activeSkuCount = stock.filter((s: any) => (s.quantity ?? 0) > 0).length;
  const totalUnits = stock.reduce((a: number, s: any) => a + (s.quantity ?? 0), 0);
  const totalValue = stock.reduce((a: number, s: any) => a + (s.quantity ?? 0) * (s.sku?.cost_per_unit ?? 0), 0);

  const locationRows = stock.map((s: any, idx: number) => ({
    _id: s._id ?? idx,
    code: s.location_code ?? `A${idx + 1}`,
    area: s.location_name ?? s.sku?.name ?? 'Storage Area',
    status: 'active',
    itemCount: 1,
    quantity: s.quantity ?? 0,
    value: (s.quantity ?? 0) * (s.sku?.cost_per_unit ?? 0)
  }));

  const topItems = [...stock]
    .sort((a: any, b: any) => (b.quantity ?? 0) - (a.quantity ?? 0))
    .slice(0, showAllItems ? undefined : 5);

  const typeColors: any = {
    IN: 'bg-emerald-100 text-emerald-700',
    OUT: 'bg-red-100 text-red-700',
    TRANSFER: 'bg-blue-100 text-blue-700'
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

      const skuObj = skus.find(s => s._id === form.sku);
      await logActivity('CREATE', zone.name || zone.zone_code, `Recorded stock movement: ${form.type} ${form.quantity} ${form.unit} of SKU: ${skuObj?.name || 'Unknown'} (${skuObj?.sku_code || ''}) in Zone: ${zone.zone_code}`);

      setForm({ type: 'IN', sku: '', quantity: '', unit: 'kg', cost_per_unit: '', remarks: '' });
      load();
      showToast('Stock updated successfully', 'success');
    } catch (e: any) {
      showToast(e.response?.data?.msg || 'Failed to record stock', 'error');
    }
  };

  const openEditZone = () => {
    setEditForm({
      zone_code: zone.zone_code,
      name: zone.name ?? '',
      description: zone.description ?? '',
      factory_id: factory?._id || zone.factory_id?._id || zone.factory_id || '',
      floor_id: floor?._id || zone.floor_id?._id || zone.floor_id || '',
      status: zone.status ?? 'active'
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
      await logActivity('UPDATE', updated.name || updated.zone_code, `Updated Zone: ${updated.name || updated.zone_code}`);
      setShowEditZone(false);
      showToast('Zone updated', 'success');
    } catch (e: any) {
      showToast(e.response?.data?.msg || 'Update failed', 'error');
    }
  };

  const handleDeleteZone = async () => {
    if (!window.confirm(`Delete zone "${zone.zone_code}"? This will move it to the Recycle Bin.`)) return;
    try {
      await mfgApi.deleteZone(zone._id);
      showToast('Zone deleted', 'success');
      onZoneDeleted(zone);
    } catch (e: any) {
      showToast(e.response?.data?.msg || 'Cannot delete zone', 'error');
    }
  };

  const editFloors = floors.filter((f: any) =>
    (f.factory_id?._id || f.factory_id) === editForm.factory_id
  );

  return (
    <div className="h-full flex flex-col">

      {/* ── Compact Header ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex-shrink-0">
        <div className="max-w-5xl mx-auto w-full">
          {/* Back link */}
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Zones
          </button>

          {/* Zone title row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-gray-900 leading-tight">{zone.name || zone.zone_code}</h1>
                  <StatusBadge status={zone.status ?? 'active'} />
                </div>
                <p className="text-xs text-gray-400 flex items-center gap-1 leading-none mt-0.5">
                  <span>{factory?.name ?? '—'}</span>
                  <span>›</span>
                  <span>{floor?.name ?? '—'}</span>
                  <span>›</span>
                  <span className="text-gray-600 font-medium">{zone.zone_code}</span>
                </p>
              </div>
            </div>

            {/* Action buttons */}
            {canManage && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={load}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={openEditZone}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Edit className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={handleDeleteZone}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            )}
          </div>

          {/* Compact 4-tile stats strip */}
          <div className="grid grid-cols-4 gap-2 mt-2.5">
            {[
              {
                label: 'Locations', value: fmt(locationRows.length),
                sub: `Active: ${locationRows.filter(l => l.status === 'active').length}`,
                color: 'text-gray-900'
              },
              {
                label: 'Items', value: fmt(skuCount),
                sub: `Active: ${activeSkuCount}`,
                color: 'text-gray-900'
              },
              {
                label: 'Total Quantity', value: fmt(totalUnits),
                sub: 'All Items',
                color: 'text-blue-700'
              },
              {
                label: 'Stock Value', value: fmtCurrency(totalValue),
                sub: 'All Items',
                color: 'text-amber-600'
              },
            ].map((s, i) => (
              <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500 font-medium leading-none">{s.label}</p>
                <p className={`text-xl font-bold leading-snug ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-400 leading-none">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <div className="max-w-5xl mx-auto w-full space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Locations Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold text-gray-900">Locations in this Zone</h2>
                  {canManage && (
                    <button
                      onClick={() => showToast('Location management coming soon', 'info')}
                      className="flex items-center gap-1 px-2.5 py-1 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Location
                    </button>
                  )}
                </div>

                {locationRows.length === 0 ? (
                  <div className="text-center py-8">
                    <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-1.5" />
                    <p className="text-sm text-gray-400">No locations recorded in this zone yet</p>
                    {canManage && (
                      <button
                        onClick={() => setShowAddStock(true)}
                        className="mt-2 text-sm text-blue-600 hover:underline font-medium"
                      >
                        Add stock to create a location
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                          <th className="px-4 py-2.5 font-semibold">Location Code</th>
                          <th className="px-4 py-2.5 font-semibold">Location Name / Area</th>
                          <th className="px-4 py-2.5 font-semibold">Status</th>
                          <th className="px-4 py-2.5 font-semibold">Items</th>
                          <th className="px-4 py-2.5 font-semibold">Quantity</th>
                          {isAdmin && <th className="px-4 py-2.5 font-semibold">Stock Value</th>}
                          <th className="px-4 py-2.5 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {locationRows.map(loc => (
                          <tr key={loc._id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-4 py-2.5 text-sm font-mono font-semibold text-gray-800">{loc.code}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-700">{loc.area}</td>
                            <td className="px-4 py-2.5"><StatusBadge status={loc.status} /></td>
                            <td className="px-4 py-2.5 text-sm font-semibold text-gray-800">{loc.itemCount}</td>
                            <td className="px-4 py-2.5 text-sm font-semibold text-gray-800">{fmt(loc.quantity)}</td>
                            {isAdmin && <td className="px-4 py-2.5 text-sm text-gray-600">{fmtCurrency(loc.value)}</td>}
                            <td className="px-4 py-2.5 relative">
                              <button
                                onClick={() => setOpenMenuId(openMenuId === String(loc._id) ? null : String(loc._id))}
                                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
                              </button>
                              {openMenuId === String(loc._id) && (
                                <div className="absolute right-4 top-full mt-0.5 w-32 bg-white rounded-lg shadow-lg border border-gray-100 z-10 py-1">
                                  <button
                                    onClick={() => { setOpenMenuId(null); showToast('Edit location coming soon', 'info'); }}
                                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                  ><Edit className="w-3 h-3" /> Edit</button>
                                  <button
                                    onClick={() => { setOpenMenuId(null); showToast('Transfer stock coming soon', 'info'); }}
                                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                  ><ArrowRightLeft className="w-3 h-3" /> Transfer</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Top Items Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-gray-500" />
                    <h2 className="text-[15px] font-semibold text-gray-900">Top Items in this Zone</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {stock.length > 5 && (
                      <button
                        onClick={() => setShowAllItems(!showAllItems)}
                        className="text-sm font-semibold text-blue-600 hover:underline"
                      >
                        {showAllItems ? 'Show Less' : 'View All'}
                      </button>
                    )}
                    {canManage && (
                      <button
                        onClick={() => setShowAddStock(true)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add Stock
                      </button>
                    )}
                  </div>
                </div>

                {stock.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="w-8 h-8 text-gray-300 mx-auto mb-1.5" />
                    <p className="text-sm text-gray-400">No stock recorded in this zone</p>
                    {canManage && (
                      <button
                        onClick={() => setShowAddStock(true)}
                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold mx-auto hover:bg-emerald-700 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add Stock
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                          <th className="px-4 py-2.5 font-semibold">Item / SKU</th>
                          <th className="px-4 py-2.5 font-semibold">Item Name</th>
                          <th className="px-4 py-2.5 font-semibold">Quantity</th>
                          {isAdmin && <th className="px-4 py-2.5 font-semibold">Stock Value</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {topItems.map((s: any, i: number) => {
                          const value = (s.quantity ?? 0) * (s.sku?.cost_per_unit ?? 0);
                          return (
                            <tr key={i} className="hover:bg-gray-50/60 transition-colors">
                              <td className="px-4 py-2.5 text-sm font-mono text-gray-700">{s.sku?.sku_code ?? '—'}</td>
                              <td className="px-4 py-2.5">
                                <p className="text-sm font-medium text-gray-800">{s.sku?.name ?? '—'}</p>
                                {s.sku?.category && (
                                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                                    s.sku.category === 'Raw' ? 'bg-amber-100 text-amber-700' :
                                    s.sku.category === 'Finished' ? 'bg-blue-100 text-blue-700' :
                                    'bg-purple-100 text-purple-700'
                                  }`}>{s.sku.category}</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-sm font-semibold text-gray-800">
                                {fmt(s.quantity)} <span className="text-gray-400 font-normal">{s.sku?.unit_type}</span>
                              </td>
                              {isAdmin && (
                                <td className="px-4 py-2.5 text-sm text-gray-600">{fmtCurrency(value)}</td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Recent Movements */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-gray-500" />
                  <h2 className="text-[15px] font-semibold text-gray-900">Recent Movements</h2>
                </div>
                <div className="p-4">
                  {movements.length === 0 ? (
                    <div className="text-center py-8">
                      <ArrowRightLeft className="w-8 h-8 text-gray-300 mx-auto mb-1.5" />
                      <p className="text-sm text-gray-400">No movement history for this zone</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {movements.map((m: any) => (
                        <div key={m._id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 border border-gray-100 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold ${typeColors[m.type]}`}>
                              {m.type === 'IN' && <ArrowDownLeft className="w-2.5 h-2.5" />}
                              {m.type === 'OUT' && <ArrowUpRight className="w-2.5 h-2.5" />}
                              {m.type === 'TRANSFER' && <ArrowRightLeft className="w-2.5 h-2.5" />}
                              {m.type}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{m.sku?.name ?? '—'}</p>
                              {(m.remarks || m.source) && (
                                <p className="text-xs text-gray-400">{m.remarks || m.source}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-800">{fmt(m.quantity)} {m.unit}</p>
                            <p className="text-xs text-gray-400">{new Date(m.createdAt).toLocaleDateString('en-IN')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Add Stock Modal ─────────────────────────────────────────────── */}
      {showAddStock && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Add / Record Stock</h3>
                <p className="text-sm text-gray-500 mt-0.5">Zone: <span className="font-semibold text-gray-700">{zone.zone_code}</span></p>
              </div>
              <button onClick={() => setShowAddStock(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1 uppercase tracking-wide">Movement Type</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="IN">IN — Add stock to zone</option>
                  <option value="OUT">OUT — Remove stock from zone</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1 uppercase tracking-wide">SKU *</label>
                <select
                  value={form.sku}
                  onChange={e => {
                    const sk = skus.find((s: any) => s._id === e.target.value);
                    setForm({ ...form, sku: e.target.value, unit: sk?.unit_type || form.unit });
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select SKU...</option>
                  {skus.map((s: any) => (
                    <option key={s._id} value={s._id}>{s.name} ({s.sku_code})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1 uppercase tracking-wide">Quantity *</label>
                  <input
                    type="number"
                    value={form.quantity}
                    onChange={e => setForm({ ...form, quantity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    min="0.01" step="0.01" placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1 uppercase tracking-wide">Unit</label>
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="kg">kg</option>
                    <option value="pcs">pcs</option>
                    <option value="gbl">gbl</option>
                    <option value="mtr">mtr</option>
                    <option value="ltr">ltr</option>
                  </select>
                </div>
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1 uppercase tracking-wide">Cost / Unit (₹)</label>
                  <input type="number" value={form.cost_per_unit} onChange={e => setForm({ ...form, cost_per_unit: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="0.00" />
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1 uppercase tracking-wide">Remarks</label>
                <input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="e.g. Purchase from supplier" />
              </div>
            </div>
            <div className="flex justify-end gap-2.5 mt-4 pt-4 border-t border-gray-100">
              <button onClick={() => setShowAddStock(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-[15px] font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
              <button
                onClick={handleAddStock}
                disabled={!form.sku || !form.quantity}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[15px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Record Movement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Zone Modal ──────────────────────────────────────────────── */}
      {showEditZone && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900">Edit Zone</h3>
              <button onClick={() => setShowEditZone(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1 uppercase tracking-wide">Zone Code</label>
                  <input value={editForm.zone_code} onChange={e => setEditForm({ ...editForm, zone_code: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1 uppercase tracking-wide">Status</label>
                  <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1 uppercase tracking-wide">Name</label>
                <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Zone A" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1 uppercase tracking-wide">Description</label>
                <textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Move to Different Location</p>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1 uppercase tracking-wide">Factory</label>
                    <select value={editForm.factory_id} onChange={e => setEditForm({ ...editForm, factory_id: e.target.value, floor_id: '' })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select factory...</option>
                      {factories.map((f: any) => <option key={f._id} value={f._id}>{f.name} ({f.code})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1 uppercase tracking-wide">Floor</label>
                    <select value={editForm.floor_id} onChange={e => setEditForm({ ...editForm, floor_id: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select floor...</option>
                      {editFloors.map((f: any) => <option key={f._id} value={f._id}>{f.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 mt-4 pt-4 border-t border-gray-100">
              <button onClick={() => setShowEditZone(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-[15px] font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleEditZone} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[15px] font-semibold transition-colors">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {openMenuId && (
        <div className="fixed inset-0 z-[5]" onClick={() => setOpenMenuId(null)} />
      )}
    </div>
  );
};

export default ZoneDetail;

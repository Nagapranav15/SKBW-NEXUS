import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Plus, X, Package, ArrowRightLeft,
  ArrowDownLeft, ArrowUpRight, Edit, Trash2, MapPin,
  MoreVertical, RefreshCw, TrendingUp, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as mfgApi from '../../api/mfgApi';
import { showToast } from '../ui/Toast';
import { createActivityLog } from '../../api/activityLogApi';

const MOCK_SKUS = [
  { _id: 'sku-1', sku_code: 'TNPL 58 GSM Reel', name: 'TNPL 58 GSM Paper Reel', category: 'Raw', unit_type: 'Reel', cost_per_unit: 500 },
  { _id: 'sku-2', sku_code: 'JK 60 GSM Reel', name: 'JK 60 GSM Paper Reel', category: 'Raw', unit_type: 'Reel', cost_per_unit: 546.67 },
  { _id: 'sku-3', sku_code: 'Notebook Cover A4', name: 'Notebook Cover A4', category: 'Finished', unit_type: 'Pcs', cost_per_unit: 400 },
  { _id: 'sku-4', sku_code: 'Binding Spiral 12mm', name: 'Binding Spiral 12mm', category: 'Raw', unit_type: 'Pcs', cost_per_unit: 450 },
  { _id: 'sku-5', sku_code: 'Hard Board 18x24', name: 'Hard Board 18x24', category: 'Raw', unit_type: 'Pcs', cost_per_unit: 524.25 },
  { _id: 'sku-6', sku_code: 'Ink Cyan 1L', name: 'Cyan Ink 1 Liter', category: 'Raw', unit_type: 'Ltr', cost_per_unit: 800 },
  { _id: 'sku-7', sku_code: 'Glue Extra 5kg', name: 'Glue Extra Strong 5kg', category: 'Raw', unit_type: 'Pcs', cost_per_unit: 600 },
  { _id: 'sku-8', sku_code: 'Pack Carton Large', name: 'Packing Carton Large Box', category: 'Finished', unit_type: 'Pcs', cost_per_unit: 600 },
  { _id: 'sku-9', sku_code: 'Tape Transparent', name: 'Packaging Tape 2 inch', category: 'Raw', unit_type: 'Pcs', cost_per_unit: 450 },
  { _id: 'sku-10', sku_code: 'Thread Cotton', name: 'Cotton Binding Thread', category: 'Raw', unit_type: 'Pcs', cost_per_unit: 450 },
  { _id: 'sku-11', sku_code: 'Kraft Paper 80GSM', name: 'Kraft Paper Reel 80GSM', category: 'Raw', unit_type: 'Reel', cost_per_unit: 450 },
  { _id: 'sku-12', sku_code: 'Wrapping Film 50cm', name: 'Stretch Wrapping Film Roll', category: 'Raw', unit_type: 'Pcs', cost_per_unit: 500 },
];

const MOCK_ZONE_STOCK_MAP: any = {
  'mock-z1': { locationCount: 3, skuCount: 12, stockValue: 1248750 },
  'mock-z2': { locationCount: 5, skuCount: 8, stockValue: 850000 },
  'mock-z3': { locationCount: 4, skuCount: 6, stockValue: 560000 },
  'mock-z4': { locationCount: 2, skuCount: 3, stockValue: 120000 },
};

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

  useEffect(() => {
    setZone(initialZone);
    setFactory(initialFactory);
    setFloor(initialFloor);
  }, [initialZone, initialFactory, initialFloor]);

  useEffect(() => { load(); }, [zone?._id]);

  const load = async () => {
    setLoading(true);
    try {
      if (zone._id && zone._id.startsWith('mock-')) {
        // Mock data logic
        const mockStock = [
          { sku: MOCK_SKUS[0], quantity: 650, location_code: 'A1', location_name: 'Left Side Area' },
          { sku: MOCK_SKUS[1], quantity: 480, location_code: 'A2', location_name: 'Middle Area' },
          { sku: MOCK_SKUS[2], quantity: 360, location_code: 'A1', location_name: 'Left Side Area' },
          { sku: MOCK_SKUS[3], quantity: 250, location_code: 'A2', location_name: 'Middle Area' },
          { sku: MOCK_SKUS[4], quantity: 200, location_code: 'A3', location_name: 'Right Side Area' },
          { sku: MOCK_SKUS[5], quantity: 120, location_code: 'A1', location_name: 'Left Side Area' },
          { sku: MOCK_SKUS[6], quantity: 100, location_code: 'A2', location_name: 'Middle Area' },
          { sku: MOCK_SKUS[7], quantity: 80, location_code: 'A1', location_name: 'Left Side Area' },
          { sku: MOCK_SKUS[8], quantity: 70, location_code: 'A2', location_name: 'Middle Area' },
          { sku: MOCK_SKUS[9], quantity: 60, location_code: 'A1', location_name: 'Left Side Area' },
          { sku: MOCK_SKUS[10], quantity: 50, location_code: 'A1', location_name: 'Left Side Area' },
          { sku: MOCK_SKUS[11], quantity: 30, location_code: 'A3', location_name: 'Right Side Area' },
        ];
        
        if (zone._id !== 'mock-z1') {
          const stats = MOCK_ZONE_STOCK_MAP[zone._id] || { locationCount: 2, skuCount: 3, stockValue: 120000 };
          const dummyStock: any[] = [];
          for (let k = 0; k < stats.skuCount; k++) {
            const skuItem = MOCK_SKUS[k % MOCK_SKUS.length];
            const qty = Math.round(100 + Math.random() * 200);
            dummyStock.push({
              sku: skuItem,
              quantity: qty,
              location_code: `B${k + 1}`,
              location_name: `Bin B${k + 1}`
            });
          }
          setStock(dummyStock);
        } else {
          setStock(mockStock);
        }

        setMovements([
          { _id: 'm1', type: 'IN', sku: MOCK_SKUS[0], quantity: 200, unit: 'Reel', remarks: 'Received from vendor', createdAt: new Date().toISOString() },
          { _id: 'm2', type: 'OUT', sku: MOCK_SKUS[2], quantity: 50, unit: 'Pcs', remarks: 'Issued to production', createdAt: new Date().toISOString() },
          { _id: 'm3', type: 'TRANSFER', sku: MOCK_SKUS[4], quantity: 20, unit: 'Pcs', remarks: 'Moved to A3', createdAt: new Date().toISOString() },
        ]);
        setSkus(MOCK_SKUS);
      } else {
        const [s, m, sk] = await Promise.all([
          mfgApi.getZoneStock(zone._id, selectedCompany?._id),
          mfgApi.getZoneMovements(zone._id, selectedCompany?._id, 20),
          mfgApi.getSkus(selectedCompany?._id)
        ]);
        setStock(s.data ?? []);
        setMovements(m.data ?? []);
        setSkus(sk.data ?? []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Computed
  const skuCount = stock.length;
  const activeSkuCount = stock.filter((s: any) => (s.quantity ?? 0) > 0).length;
  const totalUnits = zone._id === 'mock-z1' ? 2450 : stock.reduce((a: number, s: any) => a + (s.quantity ?? 0), 0);
  const totalValue = zone._id === 'mock-z1' ? 1248750 : stock.reduce((a: number, s: any) => a + (s.quantity ?? 0) * (s.sku?.cost_per_unit ?? 0), 0);

  const locationRows = zone._id === 'mock-z1'
    ? [
        { _id: 'mock-loc-1', code: 'A1', area: 'Left Side Area', status: 'active', itemCount: 6, quantity: 850, value: 425300 },
        { _id: 'mock-loc-2', code: 'A2', area: 'Middle Area', status: 'active', itemCount: 4, quantity: 1100, value: 580450 },
        { _id: 'mock-loc-3', code: 'A3', area: 'Right Side Area', status: 'active', itemCount: 2, quantity: 500, value: 242100 },
      ]
    : stock.map((s: any, idx: number) => ({
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

      {/* ── Redesigned Header ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="max-w-5xl mx-auto w-full">
          {/* Back link */}
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-750 font-bold mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 font-bold" /> Back to Zones
          </button>

          {/* Zone title row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 bg-blue-50/70 rounded-full flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-blue-600 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl font-black text-gray-900 leading-tight">{zone.name || zone.zone_code}</h1>
                  <span className={`text-[11px] px-2 py-0.5 rounded font-extrabold tracking-wider bg-green-50 text-green-700 uppercase`}>
                    ACTIVE
                  </span>
                </div>
                <p className="text-[13px] text-gray-400 flex items-center gap-1.5 mt-1 font-semibold">
                  <span>{factory?.name ?? 'Factory 1'}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                  <span>{floor?.name ?? 'Ground Floor'}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                  <span className="text-gray-700">{zone.name || zone.zone_code}</span>
                </p>
              </div>
            </div>

            {/* Action buttons */}
            {canManage && (
              <div className="flex items-center gap-2">
                <button
                  onClick={load}
                  className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors shadow-sm bg-white"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={openEditZone}
                  className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 bg-white transition-colors shadow-sm"
                >
                  <Edit className="w-4 h-4 text-gray-500" /> Edit
                </button>
                <button
                  onClick={handleDeleteZone}
                  className="flex items-center gap-1.5 px-4 py-2 border border-red-200 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 bg-white transition-colors shadow-sm"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            )}
          </div>

          {/* Redesigned 4-tile metrics row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {[
              {
                label: 'Locations',
                value: fmt(locationRows.length),
                sub: `Active: ${locationRows.filter(l => l.status === 'active').length}`,
                color: 'text-blue-600'
              },
              {
                label: 'Items',
                value: fmt(skuCount),
                sub: `Active: ${activeSkuCount}`,
                color: 'text-green-600'
              },
              {
                label: 'Total Quantity',
                value: fmt(totalUnits),
                sub: 'All Items',
                color: 'text-purple-600'
              },
              {
                label: 'Stock Value',
                value: fmtCurrency(totalValue),
                sub: 'All Items',
                color: 'text-amber-500' // yellow/orange color
              },
            ].map((s, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                <p className="text-xs text-gray-500 font-semibold leading-none uppercase tracking-wider">{s.label}</p>
                <p className={`text-2xl font-black leading-snug mt-2 ${s.color}`}>{s.value}</p>
                <p className={`text-xs font-semibold leading-none mt-1.5 ${s.label === 'Stock Value' ? 'text-amber-500/80' : s.label === 'Total Quantity' ? 'text-purple-500/80' : 'text-gray-400'}`}>{s.sub}</p>
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
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-base font-bold text-gray-900">Locations in this Zone</h2>
                  {canManage && (
                    <button
                      onClick={() => showToast('Location management coming soon', 'info')}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 border border-gray-200 rounded-xl text-sm font-bold text-blue-600 hover:bg-blue-50/50 bg-white transition-colors shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Location
                    </button>
                  )}
                </div>

                {locationRows.length === 0 ? (
                  <div className="text-center py-10">
                    <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No locations recorded in this zone yet</p>
                    {canManage && (
                      <button
                        onClick={() => setShowAddStock(true)}
                        className="mt-2 text-sm text-blue-600 hover:underline font-semibold"
                      >
                        Add stock to create a location
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50/55 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                          <th className="px-5 py-3 font-bold">Location Code</th>
                          <th className="px-5 py-3 font-bold">Location Name / Area</th>
                          <th className="px-5 py-3 font-bold text-center">Status</th>
                          <th className="px-5 py-3 font-bold text-center">Items</th>
                          <th className="px-5 py-3 font-bold text-right">Quantity</th>
                          {isAdmin && <th className="px-5 py-3 font-bold text-right">Stock Value</th>}
                          <th className="px-5 py-3 font-bold text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100/70">
                        {locationRows.map(loc => (
                          <tr key={loc._id} className="hover:bg-gray-50/40 transition-colors">
                            <td className="px-5 py-3 text-sm font-bold font-mono text-gray-900">{loc.code}</td>
                            <td className="px-5 py-3 text-sm text-gray-600 font-medium">{loc.area}</td>
                            <td className="px-5 py-3 text-center">
                              <span className="text-[10px] px-2 py-0.5 rounded font-extrabold tracking-wider bg-green-50 text-green-700 uppercase">
                                ACTIVE
                              </span>
                            </td>
                            <td className="px-5 py-3 text-sm font-bold text-gray-700 text-center">{loc.itemCount}</td>
                            <td className="px-5 py-3 text-sm font-black text-gray-800 text-right">{fmt(loc.quantity)}</td>
                            {isAdmin && <td className="px-5 py-3 text-sm font-bold text-gray-700 text-right">{fmtCurrency(loc.value)}</td>}
                            <td className="px-5 py-3 text-center relative">
                              <button
                                onClick={() => setOpenMenuId(openMenuId === String(loc._id) ? null : String(loc._id))}
                                className="p-1.5 hover:bg-gray-105 hover:bg-gray-100 rounded-lg transition-colors inline-block text-gray-400 hover:text-gray-700"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                              {openMenuId === String(loc._id) && (
                                <div className="absolute right-6 top-full mt-0.5 w-32 bg-white rounded-lg shadow-lg border border-gray-200 z-10 py-1">
                                  <button
                                    onClick={() => { setOpenMenuId(null); showToast('Edit location coming soon', 'info'); }}
                                    className="w-full text-left px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                  ><Edit className="w-3.5 h-3.5" /> Edit</button>
                                  <button
                                    onClick={() => { setOpenMenuId(null); showToast('Transfer stock coming soon', 'info'); }}
                                    className="w-full text-left px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                  ><ArrowRightLeft className="w-3.5 h-3.5" /> Transfer</button>
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
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    <h2 className="text-base font-bold text-gray-900">Top Items in this Zone</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    {stock.length > 5 && (
                      <button
                        onClick={() => setShowAllItems(!showAllItems)}
                        className="text-xs font-bold text-blue-600 hover:underline hover:text-blue-700 transition-colors"
                      >
                        {showAllItems ? 'Show Less' : 'View All'}
                      </button>
                    )}
                    {canManage && (
                      <button
                        onClick={() => setShowAddStock(true)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Stock
                      </button>
                    )}
                  </div>
                </div>

                {stock.length === 0 ? (
                  <div className="text-center py-10">
                    <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No stock recorded in this zone</p>
                    {canManage && (
                      <button
                        onClick={() => setShowAddStock(true)}
                        className="mt-2 flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold mx-auto hover:bg-emerald-700 transition-colors shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Stock
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50/55 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                          <th className="px-5 py-3 font-bold">Item / SKU</th>
                          <th className="px-5 py-3 font-bold">Item Name</th>
                          <th className="px-5 py-3 font-bold text-right">Quantity</th>
                          {isAdmin && <th className="px-5 py-3 font-bold text-right">Stock Value</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100/70">
                        {topItems.map((s: any, i: number) => {
                          const value = (s.quantity ?? 0) * (s.sku?.cost_per_unit ?? 0);
                          return (
                            <tr key={i} className="hover:bg-gray-50/40 transition-colors">
                              <td className="px-5 py-3 text-sm font-semibold font-mono text-gray-900">{s.sku?.sku_code ?? '—'}</td>
                              <td className="px-5 py-3">
                                <p className="text-sm font-semibold text-gray-800">{s.sku?.name ?? '—'}</p>
                                {s.sku?.category && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold inline-block mt-1 ${
                                    s.sku.category === 'Raw' ? 'bg-amber-50 text-amber-700' :
                                    s.sku.category === 'Finished' ? 'bg-blue-50 text-blue-700' :
                                    'bg-purple-50 text-purple-700'
                                  }`}>{s.sku.category}</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-sm font-black text-gray-800 text-right">
                                {fmt(s.quantity)} <span className="text-gray-400 font-medium text-xs ml-0.5">{s.sku?.unit_type}</span>
                              </td>
                              {isAdmin && (
                                <td className="px-5 py-3 text-sm font-bold text-gray-900 text-right">{fmtCurrency(value)}</td>
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

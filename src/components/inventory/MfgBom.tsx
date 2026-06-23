import React, { useEffect, useState, useCallback } from 'react';
import { 
  Plus, Trash2, Edit, X, Play, RefreshCw, ArrowLeft, 
  Layers, Package, FileText, Search, Settings, HelpCircle 
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as mfgApi from '../../api/mfgApi';
import { showToast } from '../ui/Toast';

// ── Stat Card Component ──────────────────────────────────────────────────────
const StatCard = ({
  label, value, colorClass, borderClass
}: {
  label: string; value: string | number; colorClass: string; borderClass: string;
}) => (
  <div className={`bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-between shadow-xs border-l-4 ${borderClass}`}>
    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</p>
  </div>
);

const MfgBom: React.FC = () => {
  const { selectedCompany, hasPermission } = useAuth();
  const canManage = hasPermission('MANAGE_INVENTORY');

  // Core BOM States
  const [boms, setBoms] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showExecModal, setShowExecModal] = useState<any>(null);
  const [editId, setEditId] = useState<string | null>(null);

  // Forms
  const [form, setForm] = useState({ 
    name: '', 
    output_sku: '', 
    output_quantity: '1', 
    components: [{ sku: '', quantity: '', unit: 'kg' }], 
    notes: '' 
  });
  const [execForm, setExecForm] = useState({ zone_id: '', multiplier: '1' });

  // ── Load data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const [b, s, z] = await Promise.all([
        mfgApi.getBoms(selectedCompany._id),
        mfgApi.getSkus(selectedCompany._id),
        mfgApi.getZones(selectedCompany._id)
      ]);
      setBoms(b.data ?? []);
      setSkus(s.data ?? []);
      setZones(z.data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);

  useEffect(() => { 
    if (selectedCompany) load(); 
  }, [selectedCompany, load]);

  // ── Save & Execute BOM ────────────────────────────────────────────────────
  const handleSave = async () => {
    try {
      if (!form.name.trim()) {
        showToast('BOM Name is required', 'error');
        return;
      }
      if (!form.output_sku) {
        showToast('Output SKU is required', 'error');
        return;
      }
      if (!form.output_quantity || Number(form.output_quantity) <= 0) {
        showToast('Valid Output quantity is required', 'error');
        return;
      }

      const validComponents = form.components.filter(c => c.sku && c.quantity && Number(c.quantity) > 0);
      if (validComponents.length === 0) {
        showToast('At least one component SKU and quantity is required', 'error');
        return;
      }

      const data = { 
        ...form, 
        output_quantity: Number(form.output_quantity), 
        components: validComponents.map(c => ({ ...c, quantity: Number(c.quantity) })), 
        company: selectedCompany?._id 
      };

      if (editId) {
        await mfgApi.updateBom(editId, data);
      } else {
        await mfgApi.createBom(data);
      }

      setShowModal(false); 
      setEditId(null); 
      load(); 
      showToast(editId ? 'BOM Formula Updated' : 'BOM Formula Created', 'success');
    } catch (e: any) { 
      showToast(e.response?.data?.msg || 'Error saving BOM', 'error'); 
    }
  };

  const handleExecute = async () => {
    try {
      if (!execForm.zone_id) {
        showToast('Please select a zone to execute the BOM', 'error');
        return;
      }
      if (!execForm.multiplier || Number(execForm.multiplier) <= 0) {
        showToast('Please enter a valid multiplier', 'error');
        return;
      }

      await mfgApi.executeBom({ 
        bomId: showExecModal._id, 
        zone_id: execForm.zone_id, 
        multiplier: Number(execForm.multiplier), 
        company: selectedCompany?._id 
      });
      setShowExecModal(null); 
      showToast('BOM executed successfully! Components consumed and output produced.', 'success');
      load();
    } catch (e: any) { 
      showToast(e.response?.data?.msg || 'BOM Execution failed due to insufficient stocks', 'error'); 
    }
  };

  const handleDeleteBom = async (id: string, name: string) => {
    if (!window.confirm(`Delete BOM formula "${name}"? This action cannot be undone.`)) return;
    try {
      await mfgApi.deleteBom(id);
      load();
      showToast('BOM formula deleted', 'success');
    } catch (e: any) {
      showToast(e.response?.data?.msg || 'Failed to delete BOM', 'error');
    }
  };

  // Component management handlers
  const addComponent = () => {
    setForm(prev => ({ 
      ...prev, 
      components: [...prev.components, { sku: '', quantity: '', unit: 'kg' }] 
    }));
  };

  const removeComponent = (i: number) => {
    setForm(prev => ({ 
      ...prev, 
      components: prev.components.filter((_, idx) => idx !== i) 
    }));
  };

  const updateComponent = (i: number, field: string, val: string) => {
    const c = [...form.components];
    (c[i] as any)[field] = val;
    setForm(prev => ({ ...prev, components: c }));
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false);
        setShowExecModal(null);
      }
      if (e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setEditId(null);
        setForm({ name: '', output_sku: '', output_quantity: '1', components: [{ sku: '', quantity: '', unit: 'kg' }], notes: '' });
        setShowModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter BOMs
  const filteredBoms = boms.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (b.name ?? '').toLowerCase().includes(q) ||
      (b.output_sku?.name ?? '').toLowerCase().includes(q) ||
      (b.output_sku?.sku_code ?? '').toLowerCase().includes(q) ||
      (b.notes ?? '').toLowerCase().includes(q) ||
      b.components.some((c: any) => (c.sku?.name ?? '').toLowerCase().includes(q))
    );
  });

  // Calculate statistics
  const totalBoms = boms.length;
  const rawSkus = new Set();
  boms.forEach(b => b.components.forEach((c: any) => { if (c.sku) rawSkus.add(c.sku._id || c.sku); }));
  const totalRawComponents = rawSkus.size;

  const outputSkus = new Set();
  boms.forEach(b => { if (b.output_sku) outputSkus.add(b.output_sku._id || b.output_sku); });
  const totalProducible = outputSkus.size;

  const bomsWithNotes = boms.filter(b => (b.notes ?? '').trim().length > 0).length;

  return (
    <div className="max-w-6xl mx-auto w-full p-4 space-y-4">
      
      {/* ── Header Area ────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Link 
              to="/inventory/dashboard" 
              className="group flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-650 transition-colors mb-1.5 font-medium"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to Inventory</span>
            </Link>
            <h1 className="text-2xl font-bold text-gray-955 tracking-tight flex items-center gap-2">
              <Layers className="w-6 h-6 text-blue-650" />
              BOM & Assembly Formulas
            </h1>
            <p className="text-sm text-gray-500 mt-1">Bill of Materials definition and production execution module</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={load}
              title="Refresh"
              className="p-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 rounded-lg transition-colors shadow-xs"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {canManage && (
              <button
                onClick={() => { 
                  setEditId(null); 
                  setForm({ name: '', output_sku: '', output_quantity: '1', components: [{ sku: '', quantity: '', unit: 'kg' }], notes: '' }); 
                  setShowModal(true); 
                }}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Create BOM</span>
                <kbd className="hidden md:inline-block ml-1 px-1 py-0.5 text-[9px] font-mono font-bold text-blue-200 bg-blue-700 rounded">Alt+B</kbd>
              </button>
            )}
          </div>
        </div>

        {/* ── Stat Cards Strip ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          <StatCard label="Total BOMs" value={totalBoms} colorClass="text-gray-905" borderClass="border-l-blue-500" />
          <StatCard label="Unique Components" value={totalRawComponents} colorClass="text-green-605" borderClass="border-l-green-500" />
          <StatCard label="Producible Products" value={totalProducible} colorClass="text-purple-650" borderClass="border-l-purple-500" />
          <StatCard label="With Special Notes" value={bomsWithNotes} colorClass="text-amber-605" borderClass="border-l-amber-500" />
        </div>
      </div>

      {/* ── Search toolbar ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search formulas by name, output product, component SKU or notes..." 
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" 
          />
        </div>
      </div>

      {/* ── BOM Cards Grid ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center shadow-xs">
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-semibold text-gray-500">Loading production recipes...</span>
          </div>
        </div>
      ) : filteredBoms.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center shadow-xs">
          <Layers className="w-12 h-12 text-gray-350 mx-auto mb-2" />
          <h3 className="text-lg font-bold text-gray-800">No BOM Formulas Found</h3>
          <p className="text-sm text-gray-400 mt-1">Create a Bill of Materials to define your manufacturing outputs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredBoms.map(b => (
            <div 
              key={b._id} 
              className="bg-white rounded-xl border border-gray-200 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden"
            >
              {/* Card Header */}
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg leading-snug">{b.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-650 bg-blue-50 px-2 py-0.5 rounded">OUTPUT</span>
                    <span className="text-sm font-bold text-gray-700">
                      {b.output_sku?.name || '-'} <span className="font-normal text-gray-400">({b.output_sku?.sku_code})</span>
                    </span>
                    <span className="text-sm font-extrabold text-blue-600 ml-1">× {b.output_quantity} {b.output_sku?.unit_type || 'pcs'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {canManage && (
                    <button 
                      onClick={() => { 
                        setShowExecModal(b); 
                        setExecForm({ zone_id: zones[0]?._id || '', multiplier: '1' }); 
                      }} 
                      className="p-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors border border-green-200" 
                      title="Execute production assembly"
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                  )}
                  {canManage && (
                    <button 
                      onClick={() => { 
                        setEditId(b._id); 
                        setForm({ 
                          name: b.name, 
                          output_sku: b.output_sku?._id || b.output_sku || '', 
                          output_quantity: b.output_quantity.toString(), 
                          components: b.components.map((c: any) => ({ 
                            sku: c.sku?._id || c.sku || '', 
                            quantity: c.quantity.toString(), 
                            unit: c.unit 
                          })), 
                          notes: b.notes || '' 
                        }); 
                        setShowModal(true); 
                      }} 
                      className="p-2 bg-blue-50 hover:bg-blue-150 text-blue-700 rounded-lg transition-colors border border-blue-200" 
                      title="Edit formula"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  )}
                  {canManage && (
                    <button 
                      onClick={() => handleDeleteBom(b._id, b.name)} 
                      className="p-2 bg-red-55 hover:bg-red-100 text-red-600 rounded-lg transition-colors border border-red-200" 
                      title="Delete formula"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Card Body Components List */}
              <div className="p-5 flex-1">
                <div className="flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  <span>REQUIRED COMPONENTS</span>
                  <span>QTY</span>
                </div>
                <div className="space-y-1.5">
                  {b.components.map((c: any, i: number) => (
                    <div 
                      key={i} 
                      className="flex justify-between items-center text-sm p-2.5 bg-gray-50 border border-gray-100 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-400" />
                        <span className="font-semibold text-gray-800">{c.sku?.name || '-'}</span>
                        <span className="text-xs text-gray-400">({c.sku?.sku_code})</span>
                      </div>
                      <span className="font-bold text-gray-905">{c.quantity} <span className="text-xs font-normal text-gray-500">{c.unit}</span></span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes Banner if present */}
              {b.notes && (
                <div className="px-5 py-3.5 bg-amber-50 border-t border-amber-100 text-xs text-amber-900 flex items-start gap-2">
                  <FileText className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold uppercase tracking-wider text-[10px] text-amber-600 block mb-0.5">Instructions & Notes</span>
                    <p className="leading-relaxed font-medium">{b.notes}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Create/Edit BOM Modal ────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-all">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[85vh] border border-gray-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-150 bg-gray-50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-gray-905">{editId ? 'Edit BOM Recipe' : 'Create BOM Recipe'}</h3>
              </div>
              <button 
                onClick={() => setShowModal(false)} 
                className="p-1 hover:bg-gray-250 text-gray-500 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-[15px]">
              {/* BOM Name */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                  BOM Formula Name *
                </label>
                <input 
                  value={form.name} 
                  onChange={e => setForm({ ...form, name: e.target.value })} 
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 font-semibold"
                  placeholder="e.g. Spiral Binding 40 Pages Master"
                />
              </div>

              {/* Output SKU & Qty */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Output SKU *
                  </label>
                  <select 
                    value={form.output_sku} 
                    onChange={e => {
                      const selectedSku = skus.find(s => s._id === e.target.value);
                      setForm({ ...form, output_sku: e.target.value, output_quantity: '1' });
                    }} 
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
                  >
                    <option value="">Select Finished SKU...</option>
                    {skus.filter(s => s.category === 'Finished' || s.category === 'Semi').map(s => (
                      <option key={s._id} value={s._id}>{s.name} ({s.sku_code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Output Qty *
                  </label>
                  <input 
                    type="number" 
                    value={form.output_quantity} 
                    onChange={e => setForm({ ...form, output_quantity: e.target.value })} 
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 font-bold"
                    min="1"
                  />
                </div>
              </div>

              {/* Components List */}
              <div className="border-t border-gray-150 pt-4 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Required Component Materials *
                  </label>
                  <button 
                    onClick={addComponent} 
                    className="text-sm font-bold text-blue-650 hover:underline flex items-center gap-1"
                  >
                    + Add material
                  </button>
                </div>

                <div className="space-y-2">
                  {form.components.map((c, i) => (
                    <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-center bg-gray-50 p-2 border border-gray-150 rounded-lg">
                      <select 
                        value={c.sku} 
                        onChange={e => {
                          const selectedSku = skus.find(s => s._id === e.target.value);
                          updateComponent(i, 'sku', e.target.value);
                          updateComponent(i, 'unit', selectedSku?.unit_type || 'kg');
                        }} 
                        className="flex-1 min-w-[150px] px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                      >
                        <option value="">Choose Component SKU...</option>
                        {skus.map(s => (
                          <option key={s._id} value={s._id}>{s.name} ({s.sku_code})</option>
                        ))}
                      </select>
                      <input 
                        type="number" 
                        value={c.quantity} 
                        onChange={e => updateComponent(i, 'quantity', e.target.value)} 
                        className="w-24 px-2.5 py-2 border border-gray-200 rounded-lg text-sm font-semibold bg-white" 
                        placeholder="Qty" 
                        min="0"
                      />
                      <select 
                        value={c.unit} 
                        onChange={e => updateComponent(i, 'unit', e.target.value)} 
                        className="w-20 px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                      >
                        <option>kg</option>
                        <option>pcs</option>
                        <option>gbl</option>
                      </select>
                      <button 
                        onClick={() => removeComponent(i)} 
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remarks/Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Assembly Instructions / Notes
                </label>
                <textarea 
                  value={form.notes} 
                  onChange={e => setForm({ ...form, notes: e.target.value })} 
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50" 
                  rows={2} 
                  placeholder="Notes about setup times, binding details, or quality standards..."
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-150 bg-gray-50 flex-shrink-0">
              <button 
                onClick={() => setShowModal(false)} 
                className="px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold transition-colors shadow-xs"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave} 
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-xs"
              >
                {editId ? 'Update Formula' : 'Create Formula'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Execute BOM Modal ────────────────────────────────────────────── */}
      {showExecModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-all">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-150 bg-gray-50">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 text-green-600 fill-current" />
                <h3 className="text-lg font-bold text-gray-905">Execute: {showExecModal.name}</h3>
              </div>
              <button 
                onClick={() => setShowExecModal(null)} 
                className="p-1 hover:bg-gray-250 text-gray-500 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2.5">
                <HelpCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 leading-normal font-medium">
                  This execution consumes components automatically from your selected zone based on the multiplier and registers the produced output SKU in the same zone.
                </p>
              </div>

              {/* Zone selection */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Manufacturing Zone *
                </label>
                <select 
                  value={execForm.zone_id} 
                  onChange={e => setExecForm({ ...execForm, zone_id: e.target.value })} 
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 font-semibold"
                >
                  <option value="">Select execution zone...</option>
                  {zones.map(z => (
                    <option key={z._id} value={z._id}>{z.zone_code} - {z.name}</option>
                  ))}
                </select>
              </div>

              {/* Multiplier */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Batch Multiplier *
                </label>
                <input 
                  type="number" 
                  value={execForm.multiplier} 
                  onChange={e => setExecForm({ ...execForm, multiplier: e.target.value })} 
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 font-bold"
                  min="1"
                />
              </div>

              {/* Calculated Outputs Preview */}
              <div className="pt-2 border-t border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">EXPECTED OUTCOMES</span>
                <div className="text-xs space-y-1 text-gray-650 font-semibold">
                  <div className="flex justify-between">
                    <span>Produces: {showExecModal.output_sku?.name}</span>
                    <span className="text-blue-600 font-extrabold">+{Number(execForm.multiplier || 1) * showExecModal.output_quantity} {showExecModal.output_sku?.unit_type}</span>
                  </div>
                  {showExecModal.components.map((c: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span>Consumes: {c.sku?.name}</span>
                      <span className="text-red-500 font-bold">-{Number(execForm.multiplier || 1) * c.quantity} {c.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-150 bg-gray-50">
              <button 
                onClick={() => setShowExecModal(null)} 
                className="px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold transition-colors shadow-xs"
              >
                Cancel
              </button>
              <button 
                onClick={handleExecute} 
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-xs"
              >
                Confirm Execution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MfgBom;

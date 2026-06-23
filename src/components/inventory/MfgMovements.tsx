import React, { useEffect, useState, useCallback } from 'react';
import { 
  Plus, X, RefreshCw, ArrowLeft, ArrowRightLeft, Search, 
  Layers, Clock, DollarSign, Calendar, MessageSquare, AlertCircle
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

const MfgMovements: React.FC = () => {
  const { selectedCompany, hasPermission, hasRole } = useAuth();
  const canManage = hasPermission('MANAGE_INVENTORY');
  const isAdmin = hasRole('admin');

  // Core movement states
  const [movements, setMovements] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');
  
  // Stats counts
  const [counts, setCounts] = useState({ total: 0, in: 0, out: 0, transfer: 0 });

  // Modal and select data
  const [showModal, setShowModal] = useState(false);
  const [skus, setSkus] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [form, setForm] = useState({ 
    type: 'IN', 
    from_zone: '', 
    to_zone: '', 
    sku: '', 
    quantity: '', 
    unit: 'kg', 
    gsm_used: '', 
    books_per_gbl: '', 
    cost_per_unit: '', 
    remarks: '' 
  });

  const limit = 25;

  // ── Load data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const r = await mfgApi.getMovements({ 
        companyId: selectedCompany._id, 
        limit, 
        skip: page * limit, 
        ...(filterType ? { type: filterType } : {}) 
      });
      setMovements(r.data.movements || []); 
      setTotal(r.data.total || 0);
    } catch (e) { 
      console.error(e); 
    } finally { 
      setLoading(false); 
    }
  }, [selectedCompany, page, filterType]);

  const loadStats = useCallback(async () => {
    if (!selectedCompany) return;
    try {
      const [allR, inR, outR, transR] = await Promise.all([
        mfgApi.getMovements({ companyId: selectedCompany._id, limit: 1 }),
        mfgApi.getMovements({ companyId: selectedCompany._id, limit: 1, type: 'IN' }),
        mfgApi.getMovements({ companyId: selectedCompany._id, limit: 1, type: 'OUT' }),
        mfgApi.getMovements({ companyId: selectedCompany._id, limit: 1, type: 'TRANSFER' }),
      ]);
      setCounts({
        total: allR.data.total || 0,
        in: inR.data.total || 0,
        out: outR.data.total || 0,
        transfer: transR.data.total || 0,
      });
    } catch (e) {
      console.error('Failed to load counts:', e);
    }
  }, [selectedCompany]);

  const loadFormData = useCallback(async () => {
    if (!selectedCompany) return;
    try {
      const [s, z] = await Promise.all([
        mfgApi.getSkus(selectedCompany._id), 
        mfgApi.getZones(selectedCompany._id)
      ]);
      setSkus(s.data ?? []); 
      setZones(z.data ?? []);
    } catch (e) { 
      console.error(e); 
    }
  }, [selectedCompany]);

  useEffect(() => { 
    if (selectedCompany) { 
      load(); 
      loadStats();
      loadFormData(); 
    } 
  }, [selectedCompany, page, filterType, load, loadStats, loadFormData]);

  // ── Record Movement ────────────────────────────────────────────────────────
  const handleRecord = async () => {
    try {
      if (!form.sku) {
        showToast('Please select a SKU', 'error');
        return;
      }
      if (!form.quantity || Number(form.quantity) <= 0) {
        showToast('Please enter a valid quantity', 'error');
        return;
      }

      const data: any = { 
        ...form, 
        quantity: Number(form.quantity), 
        company: selectedCompany?._id 
      };
      
      if (form.gsm_used) data.gsm_used = Number(form.gsm_used);
      if (form.books_per_gbl) data.books_per_gbl = Number(form.books_per_gbl);
      if (form.cost_per_unit) data.cost_per_unit = Number(form.cost_per_unit);
      
      if (!data.from_zone) delete data.from_zone;
      if (!data.to_zone) delete data.to_zone;

      await mfgApi.recordMovement(data);
      setShowModal(false); 
      setForm({ 
        type: 'IN', 
        from_zone: '', 
        to_zone: '', 
        sku: '', 
        quantity: '', 
        unit: 'kg', 
        gsm_used: '', 
        books_per_gbl: '', 
        cost_per_unit: '', 
        remarks: '' 
      });
      load(); 
      loadStats();
      showToast('Movement recorded successfully', 'success');
    } catch (e: any) { 
      showToast(e.response?.data?.msg || 'Failed to record movement', 'error'); 
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false);
      }
      if (e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setShowModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const typeColors: any = { 
    IN: 'bg-green-100 text-green-800 border-green-250', 
    OUT: 'bg-red-100 text-red-800 border-red-250', 
    TRANSFER: 'bg-blue-100 text-blue-800 border-blue-250' 
  };

  // Client-side search within current page movements
  const filtered = movements.filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (m.sku?.name ?? '').toLowerCase().includes(s) ||
      (m.sku?.sku_code ?? '').toLowerCase().includes(s) ||
      (m.remarks ?? '').toLowerCase().includes(s) ||
      (m.type ?? '').toLowerCase().includes(s)
    );
  });

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
            <h1 className="text-2xl font-bold text-gray-905 tracking-tight flex items-center gap-2">
              <ArrowRightLeft className="w-6 h-6 text-blue-650" />
              Stock Movements
            </h1>
            <p className="text-sm text-gray-500 mt-1">Audit log and ledger of SKU transactions across zones</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { load(); loadStats(); }}
              title="Refresh"
              className="p-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 rounded-lg transition-colors shadow-xs"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {canManage && (
              <button
                onClick={() => { 
                  setShowModal(true); 
                  setForm({ type: 'IN', from_zone: '', to_zone: '', sku: '', quantity: '', unit: 'kg', gsm_used: '', books_per_gbl: '', cost_per_unit: '', remarks: '' }); 
                }}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Record Movement</span>
                <kbd className="hidden md:inline-block ml-1 px-1 py-0.5 text-[9px] font-mono font-bold text-blue-200 bg-blue-700 rounded">Alt+M</kbd>
              </button>
            )}
          </div>
        </div>

        {/* ── Stat Cards Strip ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          <StatCard label="Total Transactions" value={counts.total} colorClass="text-gray-905" borderClass="border-l-blue-500" />
          <StatCard label="Inflows (IN)" value={counts.in} colorClass="text-green-600" borderClass="border-l-green-500" />
          <StatCard label="Outflows (OUT)" value={counts.out} colorClass="text-red-650" borderClass="border-l-red-500" />
          <StatCard label="Transfers" value={counts.transfer} colorClass="text-blue-600" borderClass="border-l-blue-650" />
        </div>
      </div>

      {/* ── Search & Filter toolbar ────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center shadow-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Filter current page by SKU name, code, remarks..." 
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" 
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['', 'IN', 'OUT', 'TRANSFER'].map(t => (
            <button 
              key={t} 
              onClick={() => { setFilterType(t); setPage(0); }} 
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                filterType === t 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t || 'All Types'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Movements Table ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-150 text-[13px] font-bold text-gray-550 uppercase tracking-wider">
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">SKU</th>
                <th className="px-6 py-4">Quantity</th>
                <th className="px-6 py-4">From Zone</th>
                <th className="px-6 py-4">To Zone</th>
                {isAdmin && <th className="px-6 py-4">Cost Per Unit</th>}
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-[15px] text-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="w-7 h-7 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm font-medium text-gray-500">Loading movements...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-6 py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <Layers className="w-8 h-8 text-gray-300" />
                      <span className="text-[15px] font-medium">No movements found</span>
                      <p className="text-xs text-gray-400">Record a new movement or adjust filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(m => (
                  <tr key={m._id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${typeColors[m.type]}`}>
                        {m.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900 leading-snug">{m.sku?.name || '-'}</div>
                      <div className="text-xs font-semibold text-gray-500 mt-0.5">{m.sku?.sku_code}</div>
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">
                      {m.quantity} <span className="text-xs font-normal text-gray-500">{m.unit}</span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-650">
                      {m.from_zone ? (
                        <div className="flex flex-col">
                          <span className="text-gray-900 font-semibold">{m.from_zone.zone_code}</span>
                          <span className="text-[11px] text-gray-405">{m.from_zone.name}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 font-normal">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-650">
                      {m.to_zone ? (
                        <div className="flex flex-col">
                          <span className="text-gray-900 font-semibold">{m.to_zone.zone_code}</span>
                          <span className="text-[11px] text-gray-405">{m.to_zone.name}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 font-normal">—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 font-bold text-gray-900">
                        ₹{m.cost_per_unit || 0}
                      </td>
                    )}
                    <td className="px-6 py-4 text-xs font-medium text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span>{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-[200px] truncate" title={m.remarks}>
                      {m.remarks || <span className="text-gray-350 font-normal">No remarks</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Premium Pagination ─────────────────────────────────────────── */}
        {total > limit && (
          <div className="px-6 py-4 border-t border-gray-150 flex items-center justify-between bg-gray-50">
            <span className="text-sm font-medium text-gray-500">
              Showing <span className="font-semibold text-gray-800">{page * limit + 1}</span> to{' '}
              <span className="font-semibold text-gray-800">{Math.min((page + 1) * limit, total)}</span> of{' '}
              <span className="font-semibold text-gray-800">{total}</span> transactions
            </span>
            <div className="flex items-center gap-2">
              <button 
                disabled={page === 0} 
                onClick={() => setPage(p => p - 1)} 
                className="px-3.5 py-2 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white text-gray-700 rounded-lg text-sm font-semibold transition-colors shadow-xs"
              >
                Previous
              </button>
              <button 
                disabled={(page + 1) * limit >= total} 
                onClick={() => setPage(p => p + 1)} 
                className="px-3.5 py-2 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white text-gray-700 rounded-lg text-sm font-semibold transition-colors shadow-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Record Movement Modal ───────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-all">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-150 bg-gray-50">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-gray-905">Record Stock Movement</h3>
              </div>
              <button 
                onClick={() => setShowModal(false)} 
                className="p-1 hover:bg-gray-250 text-gray-500 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Type Select */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Movement Type *
                </label>
                <select 
                  value={form.type} 
                  onChange={e => setForm({ ...form, type: e.target.value, from_zone: '', to_zone: '' })} 
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 font-semibold"
                >
                  <option value="IN">IN (Receive Stock)</option>
                  <option value="OUT">OUT (Issue/Consume Stock)</option>
                  <option value="TRANSFER">TRANSFER (Between Zones)</option>
                </select>
              </div>

              {/* SKU Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Select SKU *
                </label>
                <select 
                  value={form.sku} 
                  onChange={e => {
                    const selectedSku = skus.find(s => s._id === e.target.value);
                    setForm({ ...form, sku: e.target.value, unit: selectedSku?.unit_type || 'kg' });
                  }} 
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
                >
                  <option value="">Select SKU...</option>
                  {skus.map(s => (
                    <option key={s._id} value={s._id}>{s.name} ({s.sku_code})</option>
                  ))}
                </select>
              </div>

              {/* Zones Select */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(form.type === 'OUT' || form.type === 'TRANSFER') && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      From Zone *
                    </label>
                    <select 
                      value={form.from_zone} 
                      onChange={e => setForm({ ...form, from_zone: e.target.value })} 
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
                    >
                      <option value="">Select source zone...</option>
                      {zones.map(z => (
                        <option key={z._id} value={z._id}>{z.zone_code} - {z.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(form.type === 'IN' || form.type === 'TRANSFER') && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      To Zone *
                    </label>
                    <select 
                      value={form.to_zone} 
                      onChange={e => setForm({ ...form, to_zone: e.target.value })} 
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
                    >
                      <option value="">Select destination zone...</option>
                      {zones.map(z => (
                        <option key={z._id} value={z._id}>{z.zone_code} - {z.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Quantity and Unit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Quantity *
                  </label>
                  <input 
                    type="number" 
                    value={form.quantity} 
                    onChange={e => setForm({ ...form, quantity: e.target.value })} 
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 font-semibold"
                    placeholder="Enter quantity"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Unit
                  </label>
                  <select 
                    value={form.unit} 
                    onChange={e => setForm({ ...form, unit: e.target.value })} 
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 font-semibold"
                  >
                    <option value="kg">kg</option>
                    <option value="pcs">pcs</option>
                    <option value="gbl">gbl</option>
                  </select>
                </div>
              </div>

              {/* Advanced Attributes Section */}
              <div className="pt-2 border-t border-gray-100 mt-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Additional attributes (optional)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 font-semibold mb-1">Cost / Unit (₹)</label>
                    <input 
                      type="number" 
                      value={form.cost_per_unit} 
                      onChange={e => setForm({ ...form, cost_per_unit: e.target.value })} 
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 font-semibold mb-1">GSM Used</label>
                    <input 
                      type="number" 
                      value={form.gsm_used} 
                      onChange={e => setForm({ ...form, gsm_used: e.target.value })} 
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
                      placeholder="e.g. 70"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 font-semibold mb-1">Books / GBL</label>
                    <input 
                      type="number" 
                      value={form.books_per_gbl} 
                      onChange={e => setForm({ ...form, books_per_gbl: e.target.value })} 
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
                      placeholder="e.g. 100"
                    />
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Remarks / Notes
                </label>
                <textarea 
                  value={form.remarks} 
                  onChange={e => setForm({ ...form, remarks: e.target.value })} 
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50" 
                  rows={2} 
                  placeholder="Provide transaction details or purpose..."
                />
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-150 bg-gray-50">
              <button 
                onClick={() => setShowModal(false)} 
                className="px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold transition-colors shadow-xs"
              >
                Cancel
              </button>
              <button 
                onClick={handleRecord} 
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-xs"
              >
                Record Transaction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MfgMovements;

import React, { useEffect, useState, useCallback } from 'react';
import { 
  Plus, Edit, Trash2, X, Search, Package, RefreshCw,
  Clock, AlertTriangle, CheckCircle, Eye, ArrowLeft, Layers, Tag
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as mfgApi from '../../api/mfgApi';
import { showToast } from '../ui/Toast';
import { getActivityLogs, createActivityLog } from '../../api/activityLogApi';

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

const MfgSkus: React.FC = () => {
  const { selectedCompany, hasPermission, hasRole } = useAuth();
  const canManage = hasPermission('MANAGE_INVENTORY');
  const isAdmin = hasRole('admin');

  // Core SKU Master states
  const [skus, setSkus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ 
    sku_code: '', name: '', category: 'Raw', brand: '', pages: '', default_books_per_gbl: '', unit_type: 'kg', cost_per_unit: '' 
  });

  // Utility state variables
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('ALL');

  useEffect(() => {
    if (!showActivityLog) {
      setLogSearch('');
      setLogActionFilter('ALL');
    }
  }, [showActivityLog]);

  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
  const [highlightedDuplicateIdx, setHighlightedDuplicateIdx] = useState(0);

  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [deletedItems, setDeletedItems] = useState<any[]>([]);
  const [highlightedRecycleIdx, setHighlightedRecycleIdx] = useState(0);
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const r = await mfgApi.getSkus(selectedCompany._id);
      setSkus(r.data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);

  useEffect(() => { load(); }, [load]);

  // ── Helper: Log activities ───────────────────────────────────────────────
  const logActivity = useCallback(async (action: string, name: string, details: string) => {
    if (!selectedCompany) return;
    try {
      await createActivityLog({
        action,
        entityType: 'inventory_sku',
        entityName: name,
        details,
        company: selectedCompany._id
      });
    } catch (e) {
      console.error('Failed to log activity:', e);
    }
  }, [selectedCompany]);

  // ── Helper: Recycle Bin Local Storage ──────────────────────────────────────
  const addToRecycleBin = useCallback((name: string, data: any) => {
    if (!selectedCompany) return;
    try {
      const key = `recycleBin_inventory_sku_${selectedCompany._id}`;
      const existing = localStorage.getItem(key);
      const items = existing ? JSON.parse(existing) : [];
      items.push({
        _id: data._id || Math.random().toString(36).substr(2, 9),
        name,
        data,
        deletedAt: new Date().toISOString()
      });
      localStorage.setItem(key, JSON.stringify(items));
    } catch (e) {
      console.error('Failed to add to recycle bin:', e);
    }
  }, [selectedCompany]);

  const loadDeletedItems = useCallback(() => {
    if (!selectedCompany) return;
    try {
      const key = `recycleBin_inventory_sku_${selectedCompany._id}`;
      const existing = localStorage.getItem(key);
      setDeletedItems(existing ? JSON.parse(existing) : []);
    } catch (e) {
      console.error('Failed to load deleted SKUs:', e);
    }
  }, [selectedCompany]);

  const openRecycleBin = () => {
    loadDeletedItems();
    setShowRecycleBin(true);
    setHighlightedRecycleIdx(0);
  };

  // ── CRUD Save & Delete ────────────────────────────────────────────────────
  const handleSave = async () => {
    try {
      const data = { 
        ...form, 
        pages: form.pages ? Number(form.pages) : null, 
        default_books_per_gbl: form.default_books_per_gbl ? Number(form.default_books_per_gbl) : null, 
        cost_per_unit: Number(form.cost_per_unit) || 0, 
        company: selectedCompany?._id 
      };

      if (editId) {
        await mfgApi.updateSku(editId, data);
        await logActivity('UPDATE', form.name, `Updated SKU: ${form.name} (${form.sku_code})`);
      } else {
        await mfgApi.createSku(data);
        await logActivity('CREATE', form.name, `Created SKU: ${form.name} (${form.sku_code})`);
      }
      setShowModal(false); 
      setEditId(null); 
      load(); 
      showToast(editId ? 'SKU Updated' : 'SKU Created', 'success');
    } catch (e: any) { 
      showToast(e.response?.data?.msg || 'Error saving SKU', 'error'); 
    }
  };

  const handleDelete = async (id: string) => {
    const itemData = skus.find(s => s._id === id);
    if (!itemData) return;
    if (!window.confirm(`Delete SKU "${itemData.name}"? This will move it to the Recycle Bin.`)) return;
    
    try { 
      await mfgApi.deleteSku(id);
      addToRecycleBin(itemData.name, itemData);
      await logActivity('DELETE', itemData.name, `Deleted SKU: ${itemData.name} (${itemData.sku_code})`);
      load(); 
      showToast('SKU deleted and moved to Recycle Bin', 'success'); 
    } catch (e: any) { 
      showToast(e.response?.data?.msg || 'Failed to delete SKU', 'error'); 
    } 
  };

  const openEdit = (s: any) => { 
    setForm({ 
      sku_code: s.sku_code, 
      name: s.name, 
      category: s.category, 
      brand: s.brand || '', 
      pages: s.pages?.toString() || '', 
      default_books_per_gbl: s.default_books_per_gbl?.toString() || '', 
      unit_type: s.unit_type, 
      cost_per_unit: s.cost_per_unit?.toString() || '' 
    }); 
    setEditId(s._id); 
    setShowModal(true); 
  };

  // ── Find Duplicates ───────────────────────────────────────────────────────
  const handleFindDuplicates = () => {
    const groups: { field: string; value: string; items: any[] }[] = [];
    const codeMap = new Map<string, any[]>();
    const nameMap = new Map<string, any[]>();

    skus.forEach(s => {
      const code = (s.sku_code ?? '').trim().toUpperCase();
      const name = (s.name ?? '').trim().toLowerCase();
      if (code) {
        if (!codeMap.has(code)) codeMap.set(code, []);
        codeMap.get(code)!.push(s);
      }
      if (name) {
        if (!nameMap.has(name)) nameMap.set(name, []);
        nameMap.get(name)!.push(s);
      }
    });

    codeMap.forEach((items, code) => {
      if (items.length > 1) {
        groups.push({ field: 'SKU Code', value: code, items });
      }
    });

    nameMap.forEach((items, name) => {
      if (items.length > 1) {
        groups.push({ field: 'SKU Name', value: items[0].name, items });
      }
    });

    setDuplicateGroups(groups);
    setShowDuplicates(true);
    setHighlightedDuplicateIdx(0);
  };

  // ── Restore deleted SKU ──────────────────────────────────────────────────
  const handleRestoreItem = async (recycleId: string, name: string) => {
    if (!selectedCompany) return;
    try {
      setRecycleBinLoading(true);
      const key = `recycleBin_inventory_sku_${selectedCompany._id}`;
      const existing = localStorage.getItem(key);
      const items = existing ? JSON.parse(existing) : [];
      const item = items.find((i: any) => i._id === recycleId);
      if (!item) {
        showToast('SKU not found in Recycle Bin', 'error');
        return;
      }

      await mfgApi.createSku({
        sku_code: item.data.sku_code,
        name: item.data.name,
        category: item.data.category,
        brand: item.data.brand || '',
        pages: item.data.pages ? Number(item.data.pages) : null,
        default_books_per_gbl: item.data.default_books_per_gbl ? Number(item.data.default_books_per_gbl) : null,
        unit_type: item.data.unit_type,
        cost_per_unit: Number(item.data.cost_per_unit) || 0,
        company: selectedCompany._id
      });

      const updated = items.filter((i: any) => i._id !== recycleId);
      localStorage.setItem(key, JSON.stringify(updated));
      setDeletedItems(updated);

      await logActivity('RESTORE', name, `Restored SKU: ${name} (${item.data.sku_code})`);
      showToast('SKU restored successfully', 'success');
      load();
    } catch (e: any) {
      showToast(e.response?.data?.msg || 'Failed to restore SKU', 'error');
    } finally {
      setRecycleBinLoading(false);
    }
  };

  const handlePermanentDeleteItem = (recycleId: string, name: string) => {
    if (!window.confirm(`Permanently delete SKU "${name}" from Recycle Bin? This cannot be undone.`)) return;
    if (!selectedCompany) return;
    try {
      const key = `recycleBin_inventory_sku_${selectedCompany._id}`;
      const existing = localStorage.getItem(key);
      const items = existing ? JSON.parse(existing) : [];
      const item = items.find((i: any) => i._id === recycleId);
      const updated = items.filter((i: any) => i._id !== recycleId);
      localStorage.setItem(key, JSON.stringify(updated));
      setDeletedItems(updated);

      if (item) {
        logActivity('PURGE', name, `Permanently purged SKU: ${name} (${item.data.sku_code})`);
      }
      showToast('SKU deleted permanently', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to delete permanently', 'error');
    }
  };

  // ── Activity Log fetching ────────────────────────────────────────────────
  const fetchActivityLogs = useCallback(async () => {
    if (!selectedCompany) return;
    try {
      setActivityLogLoading(true);
      const res = await getActivityLogs({
        company: selectedCompany._id,
        entityType: 'inventory_sku',
        limit: 500
      });
      setActivityLogs(res.data.logs || []);
    } catch (err) {
      console.error('Error fetching SKU logs:', err);
    } finally {
      setActivityLogLoading(false);
    }
  }, [selectedCompany]);

  useEffect(() => {
    if (showActivityLog) {
      fetchActivityLogs();
    }
  }, [showActivityLog, fetchActivityLogs]);

  // ── Keyboard Shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowActivityLog(false);
        setShowDuplicates(false);
        setShowRecycleBin(false);
      }
      if (e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'l') {
          e.preventDefault();
          setShowActivityLog(true);
        } else if (key === 'f') {
          e.preventDefault();
          handleFindDuplicates();
        } else if (key === 'r') {
          e.preventDefault();
          openRecycleBin();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [skus]);

  // ── Filtering ─────────────────────────────────────────────────────────────
  let filtered = skus;
  if (search) { 
    const s = search.toLowerCase(); 
    filtered = filtered.filter(sk => 
      (sk.name ?? '').toLowerCase().includes(s) || 
      (sk.sku_code ?? '').toLowerCase().includes(s) ||
      (sk.brand ?? '').toLowerCase().includes(s)
    ); 
  }
  if (filterCat) {
    filtered = filtered.filter(sk => sk.category === filterCat);
  }

  // Count stats
  const totalCount = skus.length;
  const rawCount = skus.filter(s => s.category === 'Raw').length;
  const semiCount = skus.filter(s => s.category === 'Semi').length;
  const finishedCount = skus.filter(s => s.category === 'Finished').length;

  const catColors: any = { 
    Raw: 'bg-amber-100 text-amber-800 border-amber-250', 
    Semi: 'bg-purple-100 text-purple-800 border-purple-250', 
    Finished: 'bg-blue-100 text-blue-800 border-blue-250' 
  };

  const filteredLogs = activityLogs.filter(log => {
    const matchesSearch = !logSearch || 
      log.details?.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.performedBy?.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.entityName?.toLowerCase().includes(logSearch.toLowerCase());
      
    const matchesAction = logActionFilter === 'ALL' || log.action === logActionFilter;
    
    return matchesSearch && matchesAction;
  });

  return (
    <div className="max-w-6xl mx-auto w-full p-4 space-y-4">
      
      {/* ── Header Area ────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-905 tracking-tight flex items-center gap-2">
              <Package className="w-6 h-6 text-blue-650" />
              SKU Master
            </h1>
            <p className="text-sm text-gray-500 mt-1">Product catalog and materials inventory details</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <button
              onClick={load}
              title="Refresh"
              className="p-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 rounded-lg transition-colors shadow-xs"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowActivityLog(true)}
              className="flex items-center space-x-2 px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium shadow-xs text-sm"
            >
              <Clock className="w-4 h-4 text-gray-450" />
              <span>Activity Log</span>
              <kbd className="hidden md:inline-block ml-1 px-1 py-0.5 text-[9px] font-mono font-bold text-gray-400 bg-gray-150 rounded border">Alt+L</kbd>
            </button>
            <button
              onClick={handleFindDuplicates}
              className="flex items-center space-x-2 px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium shadow-xs text-sm"
            >
              <AlertTriangle className="w-4 h-4 text-gray-450" />
              <span>Find Duplicates</span>
              <kbd className="hidden md:inline-block ml-1 px-1 py-0.5 text-[9px] font-mono font-bold text-gray-400 bg-gray-150 rounded border">Alt+F</kbd>
            </button>
            <button
              onClick={openRecycleBin}
              className="flex items-center space-x-2 px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium shadow-xs text-sm"
            >
              <Trash2 className="w-4 h-4 text-gray-450" />
              <span>Recycle Bin</span>
              <kbd className="hidden md:inline-block ml-1 px-1 py-0.5 text-[9px] font-mono font-bold text-gray-400 bg-gray-150 rounded border">Alt+R</kbd>
            </button>
            {canManage && (
              <button
                onClick={() => { 
                  setShowModal(true); 
                  setEditId(null); 
                  setForm({ sku_code: '', name: '', category: 'Raw', brand: '', pages: '', default_books_per_gbl: '', unit_type: 'kg', cost_per_unit: '' }); 
                }}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Add SKU</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Stat Cards Strip ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          <StatCard label="Total SKUs" value={totalCount} colorClass="text-gray-905" borderClass="border-l-blue-500" />
          <StatCard label="Raw Materials" value={rawCount} colorClass="text-amber-600" borderClass="border-l-amber-500" />
          <StatCard label="Semi-Finished" value={semiCount} colorClass="text-purple-650" borderClass="border-l-purple-500" />
          <StatCard label="Finished Goods" value={finishedCount} colorClass="text-blue-600" borderClass="border-l-blue-650" />
        </div>
      </div>

      {/* ── Search & Filter toolbar ────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center shadow-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search SKUs by name, code, brand..." 
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" 
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['', 'Raw', 'Semi', 'Finished'].map(c => (
            <button 
              key={c} 
              onClick={() => setFilterCat(c)} 
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                filterCat === c 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {c || 'All Categories'}
            </button>
          ))}
        </div>
      </div>

      {/* ── SKU Table Card ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200 tracking-wider">
                <th className="px-6 py-3.5">SKU Code</th>
                <th className="px-6 py-3.5">Product Name</th>
                <th className="px-6 py-3.5">Category</th>
                <th className="px-6 py-3.5">Brand</th>
                <th className="px-6 py-3.5">Unit</th>
                <th className="px-6 py-3.5">Pages</th>
                <th className="px-6 py-3.5">Books/GBL</th>
                {isAdmin && <th className="px-6 py-3.5">Cost/Unit</th>}
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={isAdmin ? 9 : 8} className="px-6 py-12 text-center text-gray-400 text-[15px]">Loading SKU master list...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={isAdmin ? 9 : 8} className="px-6 py-12 text-center text-gray-400 text-[15px]">No matching SKUs found</td></tr>
              ) : (
                filtered.map(s => (
                  <tr key={s._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3.5 text-sm font-semibold font-mono text-blue-650">{s.sku_code}</td>
                    <td className="px-6 py-3.5 text-[15px] font-bold text-gray-900">{s.name}</td>
                    <td className="px-6 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${catColors[s.category] || 'bg-gray-100 text-gray-700'}`}>
                        {s.category}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-gray-700">{s.brand || '—'}</td>
                    <td className="px-6 py-3.5 text-sm font-semibold text-gray-800">{s.unit_type}</td>
                    <td className="px-6 py-3.5 text-sm text-gray-600">{s.pages || '—'}</td>
                    <td className="px-6 py-3.5 text-sm text-gray-600">{s.default_books_per_gbl || '—'}</td>
                    {isAdmin && <td className="px-6 py-3.5 text-[15px] font-semibold text-amber-600">₹{s.cost_per_unit || 0}</td>}
                    <td className="px-6 py-3.5 whitespace-nowrap text-right space-x-1.5">
                      {canManage && (
                        <>
                          <button 
                            onClick={() => openEdit(s)} 
                            className="p-1.5 hover:bg-blue-50 text-blue-655 rounded border border-transparent hover:border-blue-200 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(s._id)} 
                            className="p-1.5 hover:bg-red-50 text-red-500 rounded border border-transparent hover:border-red-200 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create / Edit SKU Modal ─────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-5 border-b pb-3">
              <h3 className="text-lg font-bold text-gray-909">{editId ? 'Edit' : 'Add'} SKU Details</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">SKU Code *</label>
                  <input 
                    value={form.sku_code} 
                    onChange={e => setForm({ ...form, sku_code: e.target.value.toUpperCase() })} 
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="e.g. RAW-PAPER-58"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Category *</label>
                  <select 
                    value={form.category} 
                    onChange={e => setForm({ ...form, category: e.target.value })} 
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Raw">Raw Material</option>
                    <option value="Semi">Semi-Finished</option>
                    <option value="Finished">Finished Good</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Product Name *</label>
                <input 
                  value={form.name} 
                  onChange={e => setForm({ ...form, name: e.target.value })} 
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  placeholder="e.g. 58 GSM Maplitho Paper"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Brand</label>
                  <input 
                    value={form.brand} 
                    onChange={e => setForm({ ...form, brand: e.target.value })} 
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="e.g. Century"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Unit Type *</label>
                  <select 
                    value={form.unit_type} 
                    onChange={e => setForm({ ...form, unit_type: e.target.value })} 
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="kg">kg</option>
                    <option value="pcs">pcs</option>
                    <option value="gbl">gbl</option>
                    <option value="mtr">mtr</option>
                    <option value="ltr">ltr</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Pages</label>
                  <input 
                    type="number" 
                    value={form.pages} 
                    onChange={e => setForm({ ...form, pages: e.target.value })} 
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Books/GBL</label>
                  <input 
                    type="number" 
                    value={form.default_books_per_gbl} 
                    onChange={e => setForm({ ...form, default_books_per_gbl: e.target.value })} 
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="0"
                  />
                </div>
                {isAdmin && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Cost/Unit</label>
                    <input 
                      type="number" 
                      value={form.cost_per_unit} 
                      onChange={e => setForm({ ...form, cost_per_unit: e.target.value })} 
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500" 
                      placeholder="0.00"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
              <button 
                onClick={() => setShowModal(false)} 
                className="px-4 py-2 border border-gray-250 rounded-lg text-[15px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave} 
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[15px] font-semibold transition-colors shadow-xs"
              >
                {editId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activity Log Slide-over */}
      {showActivityLog && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={() => setShowActivityLog(false)}></div>
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="pointer-events-auto w-screen max-w-md animate-in slide-in-from-right duration-200">
              <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-2xl">
                {/* Header */}
                <div className="bg-gray-50 px-5 py-6 border-b flex justify-between items-center flex-shrink-0">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">SKU Activity Log</h2>
                    <p className="text-xs text-gray-400">History of SKU catalog modifications</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-gray-500 bg-gray-100 rounded border border-gray-200">Esc</kbd>
                    <button onClick={() => setShowActivityLog(false)} className="text-gray-400 hover:text-gray-500">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div className="bg-gray-50/50 px-5 py-3 border-b flex gap-2 flex-shrink-0">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search logs..."
                      value={logSearch}
                      onChange={e => setLogSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    />
                    {logSearch && (
                      <button onClick={() => setLogSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-450 hover:text-gray-700 text-xs">
                        Clear
                      </button>
                    )}
                  </div>
                  <select
                    value={logActionFilter}
                    onChange={e => setLogActionFilter(e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white text-gray-755 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="ALL">All Actions</option>
                    <option value="CREATE">Creates</option>
                    <option value="UPDATE">Updates</option>
                    <option value="DELETE">Deletes</option>
                    <option value="RESTORE">Restores</option>
                  </select>
                </div>

                {/* Content */}
                <div className="flex-1 py-6 px-5">
                  {activityLogLoading ? (
                    <div className="flex justify-center items-center h-40">
                      <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  ) : activityLogs.length === 0 ? (
                    <p className="text-[15px] text-gray-500 text-center py-8">No recent SKU logs found</p>
                  ) : filteredLogs.length === 0 ? (
                    <p className="text-[15px] text-gray-500 text-center py-8">No matching SKU logs found</p>
                  ) : (
                    <div className="flow-root">
                      <ul role="list" className="-mb-8">
                        {filteredLogs.map((log, logIdx) => (
                          <li key={log._id}>
                            <div className="relative pb-8">
                              {logIdx !== activityLogs.length - 1 ? (
                                <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
                              ) : null}
                              <div className="relative flex space-x-3">
                                <div>
                                  <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                                    log.action === 'CREATE' ? 'bg-green-500 text-white' :
                                    log.action === 'UPDATE' ? 'bg-blue-500 text-white' :
                                    log.action === 'DELETE' ? 'bg-red-500 text-white' :
                                    log.action === 'RESTORE' ? 'bg-emerald-500 text-white' :
                                    'bg-purple-500 text-white'
                                  }`}>
                                    <Clock className="w-4 h-4 text-white" />
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[15px] font-semibold text-gray-950">{log.details}</p>
                                  <div className="flex justify-between items-center mt-1.5 text-xs text-gray-400">
                                    <span>By: {log.performedBy}</span>
                                    <span>{new Date(log.createdAt).toLocaleString('en-IN')}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Find Duplicates Modal */}
      {showDuplicates && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="relative bg-white rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Duplicate SKU Detector
              </h2>
              <div className="flex items-center gap-3">
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold text-gray-500 bg-gray-100 rounded border border-gray-200">Esc</kbd>
                <button onClick={() => setShowDuplicates(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {duplicateGroups.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="font-bold text-gray-800 text-base">No SKU duplicates detected!</p>
                  <p className="text-sm text-gray-400 mt-1">All catalog items have unique codes and names.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-[15px] text-gray-500">The following duplicate SKUs were identified:</p>
                  {duplicateGroups.map((group, idx) => (
                    <div
                      key={idx}
                      className={`border rounded-xl p-4 transition-all duration-150 ${
                        idx === highlightedDuplicateIdx
                          ? 'border-blue-500 bg-blue-50/10 ring-2 ring-blue-500/10 shadow-sm'
                          : 'border-red-150 bg-red-50/5'
                      }`}
                      onMouseEnter={() => setHighlightedDuplicateIdx(idx)}
                    >
                      <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-2 mb-3 border-b pb-2 border-red-100/50">
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider bg-red-100 text-red-800 px-2 py-0.5 rounded mr-2">
                            Duplicate {group.field}
                          </span>
                          <span className="text-xs font-semibold text-gray-600">
                            Value: <span className="font-bold text-gray-800">{group.value}</span>
                          </span>
                        </div>
                        <button
                          onClick={() => setDuplicateGroups(prev => prev.filter((_, i) => i !== idx))}
                          className="px-2 py-1 text-xs font-semibold text-gray-600 bg-gray-150 rounded hover:bg-gray-200 transition-colors"
                        >
                          Keep Both
                        </button>
                      </div>

                      <div className="space-y-2">
                        {group.items.map((item: any) => (
                          <div key={item._id} className="flex justify-between items-center bg-white p-3 border border-gray-100 rounded-lg text-sm">
                            <div>
                              <p className="font-bold text-gray-850">
                                {item.name}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                Code: {item.sku_code} | Category: {item.category} | Brand: {item.brand || '—'}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setShowDuplicates(false);
                                  openEdit(item);
                                }}
                                className="px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-150 rounded font-semibold transition-colors flex items-center gap-1"
                              >
                                <Edit className="w-3 h-3" /> Edit
                              </button>
                              <button
                                onClick={async () => {
                                  await handleDelete(item._id);
                                  handleFindDuplicates();
                                }}
                                className="px-2.5 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-655 border border-red-200 rounded font-semibold transition-colors flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => setShowDuplicates(false)}
                className="px-4 py-2 border border-gray-250 rounded-lg text-[15px] font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recycle Bin Modal */}
      {showRecycleBin && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="relative bg-white rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-500" />
                SKU Master Recycle Bin
              </h2>
              <div className="flex items-center gap-3">
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold text-gray-500 bg-gray-100 rounded border border-gray-200">Esc</kbd>
                <button onClick={() => setShowRecycleBin(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* List Body */}
            <div className="p-6 overflow-y-auto flex-1">
              {recycleBinLoading ? (
                <div className="flex justify-center items-center h-48">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              ) : deletedItems.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-3" />
                  <p className="font-semibold text-gray-800 text-base">Recycle Bin is empty!</p>
                  <p className="text-sm text-gray-400 mt-1">There are no recently deleted items in this company.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Deleted At</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {deletedItems.map((item, idx) => {
                        const isHighlighted = idx === highlightedRecycleIdx;
                        return (
                          <tr
                            key={item._id}
                            className={`transition-colors ${
                              isHighlighted
                                ? 'bg-blue-50/70 hover:bg-blue-100/50'
                                : 'hover:bg-gray-50/50'
                            }`}
                            onMouseEnter={() => setHighlightedRecycleIdx(idx)}
                          >
                            <td className="px-4 py-3 text-gray-400 font-medium">{idx + 1}</td>
                            <td className="px-4 py-3 text-sm font-semibold font-mono text-blue-600">{item.data.sku_code}</td>
                            <td className="px-4 py-3 text-gray-900 font-bold truncate max-w-[200px]" title={item.name}>
                              {item.name}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold border ${catColors[item.data.category] || 'bg-gray-100'}`}>
                                {item.data.category}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {new Date(item.deletedAt).toLocaleString('en-IN')}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                              <button
                                onClick={() => handleRestoreItem(item._id, item.name)}
                                className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 transition-colors inline-flex items-center gap-1"
                              >
                                Restore
                              </button>
                              <button
                                onClick={() => handlePermanentDeleteItem(item._id, item.name)}
                                className="px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors inline-flex items-center gap-1"
                              >
                                Delete Permanent
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => setShowRecycleBin(false)}
                className="px-4 py-2 border border-gray-250 rounded-lg text-[15px] font-medium text-gray-700 hover:bg-gray-150 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MfgSkus;

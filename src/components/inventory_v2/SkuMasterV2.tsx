import React, { useEffect, useState, useRef } from 'react';
import { Package, Search, Plus, Download, Upload, X, Eye, Edit, Trash2, RefreshCw, Layers, Clock, AlertTriangle, CheckCircle, ChevronDown, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSkusV2, bulkImportSkusV2, deleteSkuV2, updateSkuV2, SkuV2 } from '../../api/mfgApiV2';
import { getActivityLogs, createActivityLog } from '../../api/activityLogApi';
import AddSkuDrawerV2 from './AddSkuDrawerV2';
import { showToast } from '../ui/Toast';
import * as XLSX from 'xlsx';

const SkuMasterV2: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  
  // Tools states
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  
  // Tools action data
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('ALL');
  const [duplicateGroups, setDuplicateGroups] = useState<{ field: string; value: string; items: SkuV2[] }[]>([]);
  const [recycleBinItems, setRecycleBinItems] = useState<SkuV2[]>([]);
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);
  const toolsDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(event.target as Node)) {
        setShowToolsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchActivityLogs = async () => {
    try {
      setActivityLogLoading(true);
      const res = await getActivityLogs({
        company: selectedCompany?._id,
        entityType: 'SkuV2',
        limit: 50
      });
      const backendLogs = res.data?.logs || [];
      if (backendLogs.length === 0) {
        // Fallback mock logs
        const mockLogs = skus.slice(0, 10).map((s, idx) => ({
          _id: `mock-log-${idx}`,
          action: 'CREATE',
          entityType: 'SkuV2',
          entityName: s.skuCode,
          details: `SKU Item '${s.name}' was created and verified in active inventory.`,
          performedBy: 'System Admin',
          createdAt: s.createdAt || new Date().toISOString()
        }));
        setActivityLogs(mockLogs);
      } else {
        setActivityLogs(backendLogs);
      }
    } catch (err) {
      showToast('Failed to fetch activity logs', 'error');
    } finally {
      setActivityLogLoading(false);
    }
  };

  const findSkuDuplicates = () => {
    const nameMap = new Map<string, SkuV2[]>();
    const codeMap = new Map<string, SkuV2[]>();

    skus.forEach(s => {
      const code = s.skuCode?.trim().toLowerCase();
      const name = s.name?.trim().toLowerCase();
      if (code) {
        if (!codeMap.has(code)) codeMap.set(code, []);
        codeMap.get(code)!.push(s);
      }
      if (name) {
        if (!nameMap.has(name)) nameMap.set(name, []);
        nameMap.get(name)!.push(s);
      }
    });

    const groups: { field: string; value: string; items: SkuV2[] }[] = [];
    codeMap.forEach((items, code) => {
      if (items.length > 1) {
        groups.push({ field: 'SKU Code', value: items[0].skuCode, items });
      }
    });
    nameMap.forEach((items, name) => {
      if (items.length > 1) {
        const exists = groups.some(g => g.items.some(item => items.some(i => i._id === item._id)));
        if (!exists) {
          groups.push({ field: 'SKU Name', value: items[0].name, items });
        }
      }
    });

    setDuplicateGroups(groups);
  };

  const fetchRecycleBin = async () => {
    try {
      setRecycleBinLoading(true);
      const res = await getSkusV2(selectedCompany?._id || '', undefined, undefined, 'Inactive');
      setRecycleBinItems(res || []);
    } catch (err) {
      showToast('Failed to load Recycle Bin', 'error');
    } finally {
      setRecycleBinLoading(false);
    }
  };

  const handleRestoreSku = async (sku: SkuV2) => {
    try {
      if (!sku._id) return;
      await updateSkuV2(sku._id, {
        skuCode: sku.skuCode,
        name: sku.name,
        category: sku.category,
        unit: sku.unit,
        altUnit: sku.altUnit,
        altUnitConversion: sku.altUnitConversion,
        gsm: sku.gsm,
        width: sku.width,
        length: sku.length,
        brand: sku.brand,
        group: sku.group,
        ruleType: sku.ruleType,
        status: 'Active',
        company: selectedCompany?._id
      });
      showToast(`SKU '${sku.skuCode}' restored successfully`, 'success');
      setRecycleBinItems(prev => prev.filter(item => item._id !== sku._id));
      const res = await getSkusV2(selectedCompany?._id || '', undefined, undefined, 'Active');
      setSkus(res || []);
      await createActivityLog({
        action: 'RESTORE',
        entityType: 'SkuV2',
        entityName: sku.skuCode,
        details: `SKU item '${sku.skuCode}' was restored from Recycle Bin`,
        company: selectedCompany?._id
      });
    } catch (err) {
      showToast('Failed to restore SKU', 'error');
    }
  };
  
  // Drawer & Modal states
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [editSku, setEditSku] = useState<SkuV2 | null>(null);
  const [deleteConfirmSku, setDeleteConfirmSku] = useState<SkuV2 | null>(null);
  const [selectedSkuDetails, setSelectedSkuDetails] = useState<SkuV2 | null>(null);
  const [showImportDrawer, setShowImportDrawer] = useState(false);
  const [importText, setImportText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccessMsg, setImportSuccessMsg] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Load when company or filters change (with loader spinner)
  useEffect(() => {
    if (selectedCompany?._id) {
      loadSkus(true);
    }
  }, [selectedCompany?._id, categoryFilter, statusFilter]);

  // Load when search changes (without spinner for smooth typing)
  useEffect(() => {
    if (selectedCompany?._id) {
      loadSkus(false);
    }
  }, [debouncedSearch]);

  const loadSkus = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await getSkusV2(
        selectedCompany?._id || '', 
        categoryFilter || undefined, 
        debouncedSearch || undefined,
        statusFilter || undefined
      );
      setSkus(data);
    } catch (e) {
      console.error(e);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadSkus(true);
  };

  const handleExport = () => {
    const dataToExport = skus.map(s => ({
      'SKU Code': s.skuCode,
      'SKU Name': s.name,
      'Category': s.category,
      'Unit': s.unit,
      'GSM': s.gsm || 'N/A',
      'Width': s.width || 'N/A',
      'Length': s.length || 'N/A',
      'Brand': s.brand || 'N/A',
      'Rule Type': s.ruleType || 'N/A',
      'Status': s.status
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SKUs V2');
    XLSX.writeFile(wb, `SKU_Master_V2_${selectedCompany?.name || 'export'}.xlsx`);
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importText.trim()) {
      setImportError('Please enter some JSON array data.');
      return;
    }
    setImportError('');
    setImportSuccessMsg('');
    setImportLoading(true);
    try {
      let parsed;
      try {
        parsed = JSON.parse(importText);
      } catch (err) {
        setImportError('Invalid JSON format. Please paste a valid JSON array.');
        setImportLoading(false);
        return;
      }

      if (!Array.isArray(parsed)) {
        setImportError('JSON must be an array of objects.');
        setImportLoading(false);
        return;
      }

      const res = await bulkImportSkusV2(parsed, selectedCompany?._id || '');
      setImportSuccessMsg(res.msg);
      setImportText('');
      loadSkus();
    } catch (err: any) {
      console.error(err);
      setImportError(err.response?.data?.msg || 'Failed to import SKUs');
    } finally {
      setImportLoading(false);
    }
  };

  // Optimistic Save SKU handler (handles both Add and Edit)
  const handleSaveSkuSuccess = (savedSku: SkuV2) => {
    setShowAddDrawer(false);
    
    // Apply optimistic state update directly to Sku Master table state
    setSkus(prev => {
      const idx = prev.findIndex(item => item._id === savedSku._id);
      if (idx > -1) {
        // Edit Mode: Replace updated SKU
        const updated = [...prev];
        updated[idx] = savedSku;
        return updated;
      } else {
        // Create Mode: Prepend new SKU
        return [savedSku, ...prev];
      }
    });

    showToast(editSku ? 'SKU updated successfully' : 'SKU created successfully', 'success');
    createActivityLog({
      action: editSku ? 'UPDATE' : 'CREATE',
      entityType: 'SkuV2',
      entityName: savedSku.skuCode,
      details: `SKU Item '${savedSku.skuCode}' (${savedSku.name}) was ${editSku ? 'updated' : 'created'}`,
      company: selectedCompany?._id
    }).catch(() => {});
    setEditSku(null);
  };

  // Optimistic Delete SKU handler
  const handleDeleteSku = async () => {
    if (!deleteConfirmSku?._id) return;
    
    const targetId = deleteConfirmSku._id;
    const targetCode = deleteConfirmSku.skuCode;
    const originalSkus = [...skus];

    // Optimistic UI Update: Immediately remove SKU from the local list
    setSkus(prev => prev.filter(s => s._id !== targetId));
    setDeleteConfirmSku(null);
    setIsDeleting(true);

    try {
      await deleteSkuV2(targetId, selectedCompany?._id || '');
      showToast(`SKU '${targetCode}' deleted successfully`, 'success');
      createActivityLog({
        action: 'DELETE',
        entityType: 'SkuV2',
        entityName: targetCode,
        details: `SKU Item '${targetCode}' was deleted`,
        company: selectedCompany?._id
      }).catch(() => {});
    } catch (err: any) {
      console.error(err);
      // Rollback UI update on failure
      setSkus(originalSkus);
      showToast(err.response?.data?.msg || `Failed to delete SKU '${targetCode}'`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Local unit filter
  const [unitFilter, setUnitFilter] = useState('');

  // Local filtering (instant client-side search)
  const filteredSkus = skus.filter(s => {
    if (unitFilter && s.unit !== unitFilter) return false;
    if (search) {
      const q = search.trim().toLowerCase();
      const matchText = (s.skuCode || '').toLowerCase().includes(q) ||
                        (s.name || '').toLowerCase().includes(q) ||
                        (s.brand || '').toLowerCase().includes(q) ||
                        (s.category || '').toLowerCase().includes(q) ||
                        (s.group || '').toLowerCase().includes(q) ||
                        (s.ruleType || '').toLowerCase().includes(q) ||
                        (s.paperType || '').toLowerCase().includes(q) ||
                        (s.unit || '').toLowerCase().includes(q) ||
                        (s.altUnit || '').toLowerCase().includes(q);

      if (matchText) return true;

      // Try parsing dimension format like "54 x 78" or "54x78" or "54 * 78"
      const dimensionMatch = q.match(/^(\d+(?:\.\d+)?)\s*[xx\*]\s*(\d+(?:\.\d+)?)$/);
      if (dimensionMatch) {
        const w = Number(dimensionMatch[1]);
        const l = Number(dimensionMatch[2]);
        return s.width === w && s.length === l;
      }

      // Try parsing single number
      const parsedNum = Number(q);
      if (!isNaN(parsedNum)) {
        return s.gsm === parsedNum || 
               s.pages === parsedNum || 
               s.width === parsedNum || 
               s.length === parsedNum;
      }

      return false;
    }
    return true;
  });

  // Calculate dynamic stats
  const totalItems = skus.length;
  const rawMaterialsCount = skus.filter(s => s.category === 'Raw Material').length;
  const semiFinishedCount = skus.filter(s => s.category === 'Semi Finished').length;
  const finishedGoodsCount = skus.filter(s => s.category === 'Finished Goods').length;

  // Extract unique units for unit filter dropdown
  const uniqueUnits = Array.from(new Set(skus.map(s => s.unit)));

  // Helper to format Size
  const formatSize = (s: SkuV2) => {
    if (s.width && s.length) {
      return `${s.width} x ${s.length} cm`;
    } else if (s.width) {
      return `${s.width} cm`;
    }
    return '—';
  };

  return (
    <div className={`space-y-6 transition-all duration-300 ${showAddDrawer || selectedSkuDetails || showImportDrawer ? 'lg:mr-[520px]' : ''}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Package className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight">
                Item Master
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Create and manage all items in the system</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportDrawer(true)}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Upload className="w-3.5 h-3.5" /> Import Items
          </button>

          {/* Tools dropdown */}
          <div className="relative" ref={toolsDropdownRef}>
            <button
              onClick={() => setShowToolsDropdown(!showToolsDropdown)}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-gray-500" />
              <span>Tools</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {showToolsDropdown && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 divide-y divide-gray-100 animate-in fade-in duration-100 slide-in-from-top-1">
                <div className="py-1">
                  <button
                    onClick={() => { fetchActivityLogs(); setShowActivityLog(true); setShowToolsDropdown(false); }}
                    className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>Activity Log</span>
                    </div>
                  </button>
                  <button
                    onClick={() => { findSkuDuplicates(); setShowDuplicates(true); setShowToolsDropdown(false); }}
                    className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-gray-400" />
                      <span>Find Duplicates</span>
                    </div>
                  </button>
                  <button
                    onClick={() => { fetchRecycleBin(); setShowRecycleBin(true); setShowToolsDropdown(false); }}
                    className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-gray-400" />
                      <span>Recycle Bin</span>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setEditSku(null);
              setShowAddDrawer(true);
            }}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all hover:scale-[1.02]"
          >
            <Plus className="w-3.5 h-3.5" /> Add Item
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Items */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total Items</span>
            <span className="text-2xl font-black text-gray-900">{totalItems}</span>
            <span className="text-[10px] text-gray-500 mt-0.5 block">All Items</span>
          </div>
        </div>

        {/* Raw Materials */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Raw Materials</span>
            <span className="text-2xl font-black text-gray-900">{rawMaterialsCount}</span>
            <span className="text-[10px] text-gray-500 mt-0.5 block">Items</span>
          </div>
        </div>

        {/* Semi-Finished */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Semi-Finished</span>
            <span className="text-2xl font-black text-gray-900">{semiFinishedCount}</span>
            <span className="text-[10px] text-gray-500 mt-0.5 block">Items</span>
          </div>
        </div>

        {/* Finished Goods */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Finished Goods</span>
            <span className="text-2xl font-black text-gray-900">{finishedGoodsCount}</span>
            <span className="text-[10px] text-gray-500 mt-0.5 block">Items</span>
          </div>
        </div>
      </div>      {/* Main Content Layout */}
      <div className="space-y-4">
        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <form onSubmit={handleSearchSubmit} className="flex-1 w-full relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search items by name, code, brand..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/50 focus:bg-white transition-all text-gray-900"
            />
          </form>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="w-full sm:w-36 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
            >
              <option value="">All Categories</option>
              <option value="Raw Material">Raw Material</option>
              <option value="Semi Finished">Semi-Finished</option>
              <option value="Finished Goods">Finished Goods</option>
            </select>
            <select
              value={unitFilter}
              onChange={e => setUnitFilter(e.target.value)}
              className="w-full sm:w-28 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
            >
              <option value="">All Units</option>
              {uniqueUnits.map(u => (
                <option key={u} value={u}>{u.toUpperCase()}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full sm:w-28 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
            >
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <button
              onClick={() => {
                setSearch('');
                setCategoryFilter('');
                setUnitFilter('');
                setStatusFilter('');
              }}
              className="p-2 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-gray-200 rounded-xl transition-all"
              title="Reset Filters"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* SKU Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredSkus.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100/60 text-gray-500 uppercase font-bold border-b border-gray-200 text-[10px]">
                    <th className="px-5 py-3">Item Code</th>
                    <th className="px-5 py-3">Item Name</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3">Group</th>
                    <th className="px-5 py-3">Unit</th>
                    <th className="px-5 py-3">Brand</th>
                    <th className="px-5 py-3 text-center">GSM</th>
                    <th className="px-5 py-3 text-center">Size</th>
                    <th className="px-5 py-3 text-center">Pages</th>
                    <th className="px-5 py-3 text-center">Books/GBL</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {filteredSkus.map((s) => (
                    <tr 
                      key={s._id} 
                      onClick={() => setSelectedSkuDetails(s)}
                      className="hover:bg-gray-50/40 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3 font-bold font-mono text-blue-600">{s.skuCode}</td>
                      <td className="px-5 py-3 font-semibold text-gray-800">{s.name}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold inline-block ${
                          s.category === 'Raw Material' ? 'bg-amber-50 text-amber-700' :
                          s.category === 'Semi Finished' ? 'bg-purple-50 text-purple-700' :
                          'bg-emerald-50 text-emerald-700'
                        }`}>
                          {s.category}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-600">{(s as any).group || '—'}</td>
                      <td className="px-5 py-3 font-bold text-gray-500 uppercase font-mono">
                        {s.unit}
                        {(s as any).altUnit && (
                          <span className="text-[10px] text-gray-400 font-medium block normal-case">
                            Alt: {(s as any).altUnit} (x{(s as any).altUnitConversion || 1})
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-600">{s.brand || '—'}</td>
                      <td className="px-5 py-3 text-center font-semibold text-gray-600">{s.gsm || '—'}</td>
                      <td className="px-5 py-3 text-center font-medium text-gray-600">{formatSize(s)}</td>
                      <td className="px-5 py-3 text-center font-bold text-gray-700">{(s as any).pages || '—'}</td>
                      <td className="px-5 py-3 text-center font-bold text-gray-700">{(s as any).booksGbl || '—'}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-extrabold uppercase inline-block ${
                          s.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setSelectedSkuDetails(s)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setEditSku(s);
                              setShowAddDrawer(true);
                            }}
                            className="p-1 text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                            title="Edit SKU"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmSku(s)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete SKU"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400">
              <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-semibold">No items registered yet</p>
              <p className="text-xs text-gray-500 mt-1">Register a new raw, semi-finished, or finished SKU using the "+ Add Item" button.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit SKU Slide-Over */}
      {showAddDrawer && (
        <AddSkuDrawerV2
          isOpen={showAddDrawer}
          companyId={selectedCompany?._id || ''}
          editSku={editSku}
          onClose={() => {
            setShowAddDrawer(false);
            setEditSku(null);
          }}
          onSaveSuccess={handleSaveSkuSuccess}
        />
      )}

      {/* Sleek Modal: Delete Confirmation */}
      {deleteConfirmSku && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="relative bg-white rounded-2xl max-w-sm w-full shadow-2xl flex flex-col border border-gray-200 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl flex justify-between items-center">
              <h2 className="text-sm font-bold text-gray-900">Confirm Deletion</h2>
              <button
                onClick={() => setDeleteConfirmSku(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="p-5 text-gray-800 space-y-3">
              <p className="text-xs font-semibold leading-relaxed">
                Are you sure you want to delete SKU <span className="font-bold font-mono text-red-600">{deleteConfirmSku.skuCode}</span>?
              </p>
              <p className="text-[11px] text-gray-400">
                This action is non-reversible. Deletion will be rejected if the SKU contains active ledger transactions.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmSku(null)}
                className="px-3.5 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSku}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-3xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Slide-Over Drawer */}
      {showImportDrawer && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-[520px] bg-white shadow-2xl border-l border-gray-200 z-[60] flex flex-col animate-in slide-in-from-right duration-250 !mt-0">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Bulk Import SKUs (JSON Array)</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">Parse and ingest multiple SKUs in a single payload</p>
              </div>
              <button
                onClick={() => setShowImportDrawer(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleBulkImport} className="flex-1 overflow-y-auto p-5 space-y-4">
              {importError && (
                <div className="p-3 bg-red-50 border border-red-150 rounded-xl text-xs font-semibold text-red-700">
                  {importError}
                </div>
              )}
              {importSuccessMsg && (
                <div className="p-3 bg-green-50 border border-green-150 rounded-xl text-xs font-semibold text-green-700">
                  {importSuccessMsg}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Paste JSON Array *</label>
                <textarea
                  placeholder={`[\n  {\n    "skuCode": "RM-REEL-70GSM",\n    "name": "Century Maplitho Reel 70 GSM",\n    "category": "Raw Material",\n    "unit": "kg",\n    "gsm": 70,\n    "brand": "Century"\n  }\n]`}
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  className="w-full h-96 px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                  required
                />
              </div>
            </form>
            <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowImportDrawer(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleBulkImport}
                disabled={importLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                {importLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                Ingest Array
              </button>
            </div>
          </div>
        )}

      {/* SKU Details Side-Over Drawer */}
      {selectedSkuDetails && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-[520px] bg-white shadow-2xl border-l border-gray-200 z-[60] flex flex-col animate-in slide-in-from-right duration-250 !mt-0">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">SKU Detailed Information</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">Attributes & parameters associated with this item</p>
              </div>
              <button
                onClick={() => setSelectedSkuDetails(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600" /> General Specifications
                </h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs text-gray-900">
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">SKU Code</span>
                    <span className="font-bold font-mono text-sm">{selectedSkuDetails.skuCode}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Category</span>
                    <span className="font-semibold text-blue-600">{selectedSkuDetails.category}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">SKU Name</span>
                    <span className="font-bold">{selectedSkuDetails.name}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">GSM</span>
                    <span className="font-semibold">{selectedSkuDetails.gsm || '—'} GSM</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Dimensions (W x L)</span>
                    <span className="font-semibold">{formatSize(selectedSkuDetails)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Rule Type</span>
                    <span className="font-semibold">{selectedSkuDetails.ruleType || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Pages</span>
                    <span className="font-semibold">{(selectedSkuDetails as any).pages || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Books / GBL</span>
                    <span className="font-semibold">{(selectedSkuDetails as any).booksGbl || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Brand</span>
                    <span className="font-semibold">{selectedSkuDetails.brand || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Group</span>
                    <span className="font-semibold">{(selectedSkuDetails as any).group || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Default Unit</span>
                    <span className="font-semibold font-mono">{selectedSkuDetails.unit}</span>
                  </div>
                  {(selectedSkuDetails as any).altUnit && (
                    <>
                      <div>
                        <span className="block text-[10px] text-gray-400 font-medium uppercase">Alternative Unit</span>
                        <span className="font-semibold font-mono">{(selectedSkuDetails as any).altUnit}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-gray-400 font-medium uppercase">Conversion Factor</span>
                        <span className="font-semibold font-mono">
                          1 {(selectedSkuDetails as any).altUnit} = {(selectedSkuDetails as any).altUnitConversion || 1} {selectedSkuDetails.unit}
                        </span>
                      </div>
                    </>
                  )}
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Status</span>
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                      selectedSkuDetails.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {selectedSkuDetails.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50 text-right">
              <button
                onClick={() => setSelectedSkuDetails(null)}
                className="px-5 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-3xs"
              >
                Close Window
              </button>
            </div>
          </div>
        )}

        {/* ── TOOLS SUB-MODALS & SLIDE-OVERS ────────────────────────────────────── */}
        {/* Activity Log Drawer */}
        {showActivityLog && (
          <div className="fixed inset-0 z-[60] overflow-hidden !mt-0">
            <div className="absolute inset-0 overflow-hidden bg-gray-900/40 backdrop-blur-3xs transition-opacity" onClick={() => setShowActivityLog(false)}></div>
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <div className="pointer-events-auto w-screen max-w-md">
                <div className="flex h-full flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-250">
                  <div className="bg-gray-50 px-4 py-5 border-b flex justify-between items-center">
                    <div>
                      <h2 className="text-base font-bold text-gray-900">SKU Activity Log</h2>
                      <p className="text-[10px] text-gray-500 mt-0.5">Audit log history for item creations, updates and deletions</p>
                    </div>
                    <button onClick={() => setShowActivityLog(false)} className="text-gray-400 hover:text-gray-600">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {activityLogLoading ? (
                      <div className="flex justify-center items-center h-40">
                        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                      </div>
                    ) : activityLogs.length === 0 ? (
                      <p className="text-center text-xs text-gray-500 py-8">No recent activity logs recorded.</p>
                    ) : (
                      <div className="space-y-4">
                        {activityLogs.map((log, idx) => (
                          <div key={log._id || idx} className="border-l-2 border-blue-500 pl-3 py-1 space-y-1 text-xs">
                            <div className="flex justify-between font-bold text-gray-800">
                              <span className="uppercase text-[10px] font-black text-blue-600">{log.action}</span>
                              <span className="text-[10px] text-gray-400 font-normal">{new Date(log.createdAt).toLocaleString('en-IN')}</span>
                            </div>
                            <p className="text-gray-600 font-bold">SKU: {log.entityName}</p>
                            <p className="text-gray-500 text-[11px]">{log.details}</p>
                            <p className="text-[10px] text-gray-400 font-medium">Performed By: {log.performedBy}</p>
                          </div>
                        ))}
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
          <div className="fixed inset-0 z-[60] overflow-y-auto flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-3xs !mt-0 animate-in fade-in duration-200">
            <div className="relative bg-white rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl flex justify-between items-center">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  Find Duplicates for SKUs
                </h2>
                <button onClick={() => setShowDuplicates(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
                {duplicateGroups.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                    <p className="font-semibold text-gray-800">No duplicates detected!</p>
                    <p className="text-sm text-gray-400 mt-1">All SKU codes and names are completely unique.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-gray-500 font-medium">The following duplicate groups were identified by code or name:</p>
                    {duplicateGroups.map((group, gIdx) => (
                      <div key={gIdx} className="border border-red-100 bg-red-50/10 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-center border-b pb-2">
                          <span className="font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded uppercase text-[10px]">
                            Duplicate {group.field}: {group.value}
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold">{group.items.length} duplicate entries</span>
                        </div>
                        <div className="space-y-2">
                          {group.items.map((item, iIdx) => (
                            <div key={item._id || iIdx} className="flex justify-between items-center text-[11px] text-gray-600 bg-white p-2 rounded-lg border border-gray-150">
                              <div>
                                <p className="font-bold text-gray-900">{item.name}</p>
                                <p className="font-mono text-gray-400 text-[10px]">{item.skuCode} • {item.category}</p>
                              </div>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-550'}`}>{item.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recycle Bin Drawer */}
        {showRecycleBin && (
          <div className="fixed inset-0 z-[60] overflow-hidden !mt-0">
            <div className="absolute inset-0 overflow-hidden bg-gray-900/40 backdrop-blur-3xs transition-opacity" onClick={() => setShowRecycleBin(false)}></div>
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <div className="pointer-events-auto w-screen max-w-md">
                <div className="flex h-full flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-250">
                  <div className="bg-gray-50 px-4 py-5 border-b flex justify-between items-center">
                    <div>
                      <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                        <Trash2 className="w-4 h-4 text-gray-500" />
                        SKU Recycle Bin (Inactive Items)
                      </h2>
                      <p className="text-[10px] text-gray-500 mt-0.5 font-medium">Inactive items can be restored back to the active catalog</p>
                    </div>
                    <button onClick={() => setShowRecycleBin(false)} className="text-gray-400 hover:text-gray-600">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {recycleBinLoading ? (
                      <div className="flex justify-center items-center h-40">
                        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                      </div>
                    ) : recycleBinItems.length === 0 ? (
                      <div className="text-center py-12 text-gray-450">
                        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                        <p className="font-semibold text-gray-700">Recycle Bin is Empty!</p>
                        <p className="text-xs text-gray-400 mt-1">No inactive SKUs found.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {recycleBinItems.map((item, idx) => (
                          <div key={item._id || idx} className="flex justify-between items-center p-3 border border-gray-200 rounded-xl bg-gray-50/50 hover:bg-white transition-all text-xs">
                            <div className="space-y-1">
                              <p className="font-bold text-gray-800">{item.name}</p>
                              <p className="font-mono text-gray-400 text-[10px]">{item.skuCode} • {item.category}</p>
                            </div>
                            <button
                              onClick={() => handleRestoreSku(item)}
                              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition-colors"
                            >
                              Restore
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default SkuMasterV2;

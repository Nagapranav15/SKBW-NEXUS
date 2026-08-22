import React, { useEffect, useState, useRef } from 'react';
import { 
  Warehouse, RefreshCw, Building2, Folder, Layers, MapPin, Search, 
  Edit, Trash2, ChevronDown, ChevronRight, Eye, Clock, AlertTriangle, 
  CheckCircle, Settings, X, Plus, ShieldCheck, PieChart, Sparkles, Filter, Check, Box, ArrowRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { 
  getWarehouseHierarchyV2, 
  createWarehouseLocationV2, 
  updateWarehouseLocationV2, 
  deleteWarehouseLocationV2, 
  WarehouseLocationV2 
} from '../../api/mfgApiV2';
import { getActivityLogs, createActivityLog } from '../../api/activityLogApi';
import StorageLocationDetailsV2 from './StorageLocationDetailsV2';
import { showToast } from '../ui/Toast';
import Modal from '../ui/Modal';
import Drawer from '../ui/Drawer';

const WarehouseStructureV2: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  
  // Tree expansion states
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  
  // Selected Node (Factory, Floor, Zone, or Storage Location) for right inspector panel
  const [selectedNode, setSelectedNode] = useState<WarehouseLocationV2 | null>(null);

  // Modal / Drawer States
  const [showAddModal, setShowAddModal] = useState(false);
  const [editNode, setEditNode] = useState<WarehouseLocationV2 | null>(null);
  const [deleteConfirmNode, setDeleteConfirmNode] = useState<WarehouseLocationV2 | null>(null);

  // Tools dropdown & dialog states
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<{ field: string; value: string; items: WarehouseLocationV2[] }[]>([]);
  const [recycleBinItems, setRecycleBinItems] = useState<WarehouseLocationV2[]>([]);

  // Add / Edit Form State
  const [addForm, setAddForm] = useState<{
    name: string;
    level: 'Factory' | 'Floor' | 'Zone' | 'Storage Location';
    parentId: string;
    capacity: string;
    unit: string;
    status: 'Active' | 'Maintenance' | 'Full';
  }>({
    name: '',
    level: 'Factory',
    parentId: '',
    capacity: '',
    unit: 'kg',
    status: 'Active'
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const toolsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(event.target as Node)) {
        setShowToolsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadWarehouse();
    }
  }, [selectedCompany?._id]);

  // Auto-expand parents matching search query
  useEffect(() => {
    if (searchQuery.trim() && locations.length > 0) {
      const autoExpanded: Record<string, boolean> = {};
      locations.forEach(loc => {
        if (loc.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          let currentParentId = loc.parentId;
          while (currentParentId) {
            autoExpanded[currentParentId] = true;
            const parent = locations.find(p => p._id === currentParentId);
            currentParentId = parent ? parent.parentId : null;
          }
        }
      });
      setExpandedNodes(prev => ({ ...prev, ...autoExpanded }));
    }
  }, [searchQuery, locations]);

  const loadWarehouse = async () => {
    setLoading(true);
    try {
      const data = await getWarehouseHierarchyV2(selectedCompany?._id || '');
      setLocations(data);
      
      // Auto-expand root factory nodes by default
      const rootExpanded: Record<string, boolean> = {};
      data.forEach(l => {
        if (l.level === 'Factory' || l.level === 'Floor') {
          rootExpanded[l._id!] = true;
        }
      });
      setExpandedNodes(rootExpanded);

      // Auto-select first root factory node if nothing is selected
      if (data.length > 0 && !selectedNode) {
        const rootNode = data.find(l => l.level === 'Factory') || data[0];
        setSelectedNode(rootNode);
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to load warehouse structure', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleNode = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExpandAll = () => {
    const all: Record<string, boolean> = {};
    locations.forEach(l => { if (l._id) all[l._id] = true; });
    setExpandedNodes(all);
  };

  const handleCollapseAll = () => {
    setExpandedNodes({});
  };

  const handleOpenAddModal = (level: 'Factory' | 'Floor' | 'Zone' | 'Storage Location', parentId: string) => {
    setAddForm({
      name: '',
      level,
      parentId,
      capacity: '',
      unit: 'kg',
      status: 'Active'
    });
    setEditNode(null);
    setAddError('');
    setShowAddModal(true);
  };

  const handleOpenEditModal = (node: WarehouseLocationV2, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditNode(node);
    setAddForm({
      name: node.name,
      level: node.level,
      parentId: node.parentId || '',
      capacity: node.capacity ? String(node.capacity) : '',
      unit: node.unit || 'kg',
      status: node.status || 'Active'
    });
    setAddError('');
    setShowAddModal(true);
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    if (!addForm.name.trim()) {
      setAddError('Location name is required');
      return;
    }

    if (addForm.level !== 'Factory' && !addForm.parentId) {
      setAddError(`Parent location is required for ${addForm.level}`);
      return;
    }

    setAddLoading(true);
    try {
      if (editNode) {
        // Edit Mode
        const updated = await updateWarehouseLocationV2(editNode._id!, {
          name: addForm.name.trim(),
          level: addForm.level,
          parentId: addForm.parentId || null,
          capacity: addForm.capacity ? Number(addForm.capacity) : undefined,
          unit: addForm.unit,
          status: addForm.status,
          company: selectedCompany?._id
        });
        showToast(`Updated location '${updated.name}'`, 'success');
        if (selectedNode?._id === updated._id) setSelectedNode(updated);
      } else {
        // Create Mode
        const created = await createWarehouseLocationV2({
          name: addForm.name.trim(),
          level: addForm.level,
          parentId: addForm.parentId || null,
          capacity: addForm.capacity ? Number(addForm.capacity) : undefined,
          unit: addForm.unit,
          status: addForm.status,
          company: selectedCompany?._id
        });
        showToast(`Created location '${created.name}'`, 'success');
        setSelectedNode(created);
        if (created.parentId) {
          setExpandedNodes(prev => ({ ...prev, [created.parentId!]: true }));
        }
      }

      setShowAddModal(false);
      await loadWarehouse();
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.msg || err.message || 'Failed to save location';
      setAddError(msg);
      showToast(msg, 'error');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteLocation = async () => {
    if (!deleteConfirmNode || !deleteConfirmNode._id) return;
    try {
      await deleteWarehouseLocationV2(deleteConfirmNode._id, selectedCompany?._id || '');
      showToast(`Deleted '${deleteConfirmNode.name}'`, 'success');
      if (selectedNode?._id === deleteConfirmNode._id) setSelectedNode(null);
      setDeleteConfirmNode(null);
      await loadWarehouse();
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.msg || err.message || 'Failed to delete location';
      showToast(msg, 'error');
    }
  };

  // Tools handlers
  const fetchActivityLogs = async () => {
    try {
      const res = await getActivityLogs({
        company: selectedCompany?._id,
        entityType: 'WarehouseLocationV2',
        limit: 30
      });
      setActivityLogs(res.data?.logs || []);
    } catch (err) {
      showToast('Failed to fetch activity logs', 'error');
    }
  };

  const findDuplicates = () => {
    const parentMap = new Map<string, WarehouseLocationV2[]>();
    locations.forEach(loc => {
      const parentKey = loc.parentId || 'root';
      const nameKey = `${parentKey}::${loc.name?.trim().toLowerCase()}`;
      if (!parentMap.has(nameKey)) parentMap.set(nameKey, []);
      parentMap.get(nameKey)!.push(loc);
    });

    const groups: { field: string; value: string; items: WarehouseLocationV2[] }[] = [];
    parentMap.forEach((items) => {
      if (items.length > 1) {
        groups.push({ field: 'Location Name under same parent', value: items[0].name, items });
      }
    });

    setDuplicateGroups(groups);
  };

  // Filtered Tree Nodes
  const rootFactories = locations.filter(l => l.level === 'Factory');

  // Hierarchy Stats Calculations
  const totalLocations = locations.length;
  const factoryCount = locations.filter(l => l.level === 'Factory').length;
  const floorCount = locations.filter(l => l.level === 'Floor').length;
  const zoneCount = locations.filter(l => l.level === 'Zone').length;
  const storageBinCount = locations.filter(l => l.level === 'Storage Location').length;

  const storageBins = locations.filter(l => l.level === 'Storage Location');
  const avgOccupancy = storageBins.length > 0 
    ? Math.round(storageBins.reduce((sum, b) => sum + (b.occupiedPercent || 0), 0) / storageBins.length)
    : 0;

  // Level Icon Renderer
  const getLevelIcon = (level: string, isExpanded?: boolean) => {
    switch (level) {
      case 'Factory':
        return <Building2 className="w-4 h-4 text-slate-800 shrink-0" />;
      case 'Floor':
        return <Layers className="w-4 h-4 text-blue-600 shrink-0" />;
      case 'Zone':
        return <Folder className="w-4 h-4 text-purple-600 shrink-0" />;
      case 'Storage Location':
        return <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
      default:
        return <Warehouse className="w-4 h-4 text-gray-500 shrink-0" />;
    }
  };

  // Level Badge Style
  const getLevelBadgeStyle = (level: string) => {
    switch (level) {
      case 'Factory':
        return 'bg-slate-900 text-white border-slate-900';
      case 'Floor':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'Zone':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'Storage Location':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Render Tree Recursive Node Component
  const renderTreeNode = (node: WarehouseLocationV2, depth = 0) => {
    const children = locations.filter(l => l.parentId === node._id);
    const hasChildren = children.length > 0;
    const isExpanded = !!expandedNodes[node._id!];
    const isSelected = selectedNode?._id === node._id;

    // Search query check
    const matchesSearch = !searchQuery.trim() || node.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = !filterLevel || node.level === filterLevel;
    const matchesStatus = !filterStatus || node.status === filterStatus;

    if (!matchesSearch && !hasChildren) return null;
    if (filterLevel && node.level !== filterLevel && !hasChildren) return null;

    return (
      <div key={node._id} className="select-none text-left">
        <div
          onClick={() => setSelectedNode(node)}
          className={`group flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-150 cursor-pointer border mb-1 ${
            isSelected 
              ? 'bg-blue-50/90 border-blue-300 shadow-3xs ring-1 ring-blue-400/30' 
              : 'bg-white border-gray-200/80 hover:bg-gray-50 hover:border-gray-300'
          }`}
          style={{ marginLeft: `${depth * 14}px` }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {hasChildren ? (
              <button
                onClick={(e) => toggleNode(node._id!, e)}
                className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-transform"
              >
                <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-blue-600' : ''}`} />
              </button>
            ) : (
              <span className="w-5" />
            )}

            {getLevelIcon(node.level, isExpanded)}

            <span className={`text-xs font-extrabold truncate ${isSelected ? 'text-blue-950' : 'text-gray-900'}`}>
              {node.name}
            </span>

            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${getLevelBadgeStyle(node.level)}`}>
              {node.level === 'Storage Location' ? 'Bin' : node.level}
            </span>
          </div>

          <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
            {/* Occupancy Badge for Storage Location */}
            {node.level === 'Storage Location' && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                (node.occupiedPercent || 0) >= 90 ? 'bg-rose-50 text-rose-700 border-rose-200' :
                (node.occupiedPercent || 0) >= 75 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {node.occupiedPercent || 0}%
              </span>
            )}

            {/* Child Count Badge */}
            {hasChildren && (
              <span className="text-[10px] font-extrabold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">
                {children.length}
              </span>
            )}

            {/* Quick Action Buttons */}
            <div className="hidden group-hover:flex items-center gap-1">
              {node.level !== 'Storage Location' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const childLevel = node.level === 'Factory' ? 'Floor' : node.level === 'Floor' ? 'Zone' : 'Storage Location';
                    handleOpenAddModal(childLevel, node._id!);
                  }}
                  className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                  title={`Add ${node.level === 'Factory' ? 'Floor' : node.level === 'Floor' ? 'Zone' : 'Bin'}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={(e) => handleOpenEditModal(node, e)}
                className="p-1 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded transition-colors"
                title="Edit Location"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmNode(node);
                }}
                className="p-1 text-gray-500 hover:text-rose-600 hover:bg-gray-100 rounded transition-colors"
                title="Delete Location"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Child Nodes */}
        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 flex-1 w-full relative transition-all duration-300 text-left font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-wider">
            <Warehouse className="w-4 h-4" />
            <span>Master Management</span>
          </div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight mt-1 flex items-center gap-2">
            Warehouse Hierarchy & Storage Setup
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Manage multi-level warehouse hierarchy (Factory → Floor → Zone → Storage Location)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadWarehouse()}
            className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 transition-colors shadow-3xs cursor-pointer"
            title="Refresh Hierarchy"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Tools Menu */}
          <div className="relative" ref={toolsDropdownRef}>
            <button
              onClick={() => setShowToolsDropdown(!showToolsDropdown)}
              className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 shadow-3xs cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-gray-500" />
              <span>Tools</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>

            {showToolsDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1.5 animate-in fade-in zoom-in-95">
                <button
                  onClick={() => { setShowToolsDropdown(false); fetchActivityLogs(); setShowActivityLog(true); }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Clock className="w-3.5 h-3.5 text-blue-600" /> Activity Logs
                </button>
                <button
                  onClick={() => { setShowToolsDropdown(false); findDuplicates(); setShowDuplicates(true); }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Find Duplicates
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => handleOpenAddModal('Factory', '')}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-2xl text-xs font-extrabold shadow-md shadow-blue-500/25 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Factory</span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 bg-blue-800/80 rounded-md text-[10px] font-mono text-blue-100 font-bold">
              Alt/Opt+C
            </span>
          </button>
        </div>
      </div>

      {/* Overview Metric Stats Banner */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-3xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Locations</span>
          <span className="text-xl font-black text-gray-900 mt-1 block">{totalLocations}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-3xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Factories</span>
          <span className="text-xl font-black text-slate-800 mt-1 block">{factoryCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-3xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Floors & Zones</span>
          <span className="text-xl font-black text-blue-600 mt-1 block">{floorCount + zoneCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-3xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Storage Racks / Bins</span>
          <span className="text-xl font-black text-emerald-600 mt-1 block">{storageBinCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-3xs col-span-2 md:col-span-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Avg Occupancy</span>
          <span className="text-xl font-black text-purple-600 mt-1 block">{avgOccupancy}%</span>
        </div>
      </div>

      {/* Main Split Interface: Tree (Left) vs Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Collapsible Tree Structure */}
        <div className="lg:col-span-5 bg-white p-4.5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              Hierarchy Structure Tree
            </h2>
            <div className="flex items-center gap-1.5 text-[11px] font-bold">
              <button
                onClick={handleExpandAll}
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
              >
                Expand All
              </button>
              <button
                onClick={handleCollapseAll}
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
              >
                Collapse
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Filter locations by name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={filterLevel}
                onChange={e => setFilterLevel(e.target.value)}
                className="w-full px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-lg font-semibold text-gray-700"
              >
                <option value="">All Levels</option>
                <option value="Factory">Factory</option>
                <option value="Floor">Floor</option>
                <option value="Zone">Zone</option>
                <option value="Storage Location">Storage Bin</option>
              </select>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-lg font-semibold text-gray-700"
              >
                <option value="">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Full">Full</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          {/* Tree View */}
          <div className="max-h-[550px] overflow-y-auto pr-1 space-y-1 border-t border-gray-150 pt-3">
            {rootFactories.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Warehouse className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs font-semibold">No warehouse hierarchy created yet.</p>
                <button
                  onClick={() => handleOpenAddModal('Factory', '')}
                  className="mt-3 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  + Add First Factory
                </button>
              </div>
            ) : (
              rootFactories.map(factory => renderTreeNode(factory, 0))
            )}
          </div>
        </div>

        {/* Right Column: Node Inspector & Live Bin Stock Panel */}
        <div className="lg:col-span-7 space-y-4">
          {selectedNode ? (
            selectedNode.level === 'Storage Location' ? (
              <StorageLocationDetailsV2
                locationId={selectedNode._id!}
                companyId={selectedCompany?._id || ''}
                isInline={true}
              />
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5 text-left">
                {/* Selected Node Header */}
                <div className="flex items-start justify-between pb-4 border-b border-gray-150">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-100 text-slate-900 rounded-2xl">
                      {getLevelIcon(selectedNode.level)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${getLevelBadgeStyle(selectedNode.level)}`}>
                          {selectedNode.level}
                        </span>
                        <span className="text-xs font-bold text-gray-400">ID: {selectedNode._id}</span>
                      </div>
                      <h2 className="text-lg font-black text-gray-900 mt-1">{selectedNode.name}</h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => handleOpenEditModal(selectedNode, e)}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5" /> Edit
                    </button>
                  </div>
                </div>

                {/* Direct Children Stats & Add Action */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider">
                      Sub-Nodes / Children ({locations.filter(l => l.parentId === selectedNode._id).length})
                    </h3>
                    <button
                      onClick={() => {
                        const childLevel = selectedNode.level === 'Factory' ? 'Floor' : selectedNode.level === 'Floor' ? 'Zone' : 'Storage Location';
                        handleOpenAddModal(childLevel, selectedNode._id!);
                      }}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add {selectedNode.level === 'Factory' ? 'Floor' : selectedNode.level === 'Floor' ? 'Zone' : 'Bin'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {locations.filter(l => l.parentId === selectedNode._id).map(child => (
                      <div
                        key={child._id}
                        onClick={() => setSelectedNode(child)}
                        className="p-3.5 bg-gray-50/80 hover:bg-blue-50/60 border border-gray-200 hover:border-blue-300 rounded-xl transition-all cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {getLevelIcon(child.level)}
                          <div>
                            <span className="font-bold text-gray-900 text-xs block truncate">{child.name}</span>
                            <span className="text-[10px] text-gray-400 font-semibold uppercase">{child.level}</span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center text-gray-400 flex flex-col items-center justify-center min-h-[350px]">
              <Warehouse className="w-10 h-10 mb-2 text-gray-300" />
              <h3 className="text-sm font-bold text-gray-700">Select a Location Node</h3>
              <p className="text-xs text-gray-400 max-w-xs mt-1">
                Click any Factory, Floor, Zone, or Storage Rack on the left tree to inspect stock and sub-locations.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Add / Edit Location Node */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={editNode ? `Edit Location: ${editNode.name}` : `Add New ${addForm.level}`}
        size="max-w-lg"
      >
        <form onSubmit={handleSaveLocation} className="space-y-4 text-xs text-left">
          {addError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-semibold">
              {addError}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
              Location Name *
            </label>
            <input
              type="text"
              placeholder={`e.g. ${addForm.level === 'Factory' ? 'SKBW Plant 1' : addForm.level === 'Floor' ? 'Ground Floor' : addForm.level === 'Zone' ? 'Asha Storage' : 'Rack A-1'}`}
              value={addForm.name}
              onChange={e => setAddForm({ ...addForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                Hierarchy Level
              </label>
              <select
                value={addForm.level}
                onChange={e => setAddForm({ ...addForm, level: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-bold bg-white text-gray-900"
                disabled={!!editNode}
              >
                <option value="Factory">Factory (Root)</option>
                <option value="Floor">Floor</option>
                <option value="Zone">Zone</option>
                <option value="Storage Location">Storage Bin / Rack</option>
              </select>
            </div>

            {addForm.level !== 'Factory' && (
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Parent Location *
                </label>
                <select
                  value={addForm.parentId}
                  onChange={e => setAddForm({ ...addForm, parentId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-semibold bg-white text-gray-900"
                  required
                >
                  <option value="">Select Parent...</option>
                  {locations.filter(l => l._id !== editNode?._id).map(l => (
                    <option key={l._id} value={l._id}>{l.name} ({l.level})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {addForm.level === 'Storage Location' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Storage Capacity (Max Qty)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 5000"
                  value={addForm.capacity}
                  onChange={e => setAddForm({ ...addForm, capacity: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-bold text-gray-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Unit
                </label>
                <input
                  type="text"
                  placeholder="e.g. kg / reams"
                  value={addForm.unit}
                  onChange={e => setAddForm({ ...addForm, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-semibold text-gray-700"
                />
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-gray-150 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addLoading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md"
            >
              {addLoading ? 'Saving...' : editNode ? 'Save Changes' : 'Create Location'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Confirmation */}
      <Modal
        isOpen={!!deleteConfirmNode}
        onClose={() => setDeleteConfirmNode(null)}
        title="Confirm Delete Location"
        size="max-w-md"
      >
        <div className="space-y-4 text-xs text-left">
          <p className="text-gray-700 font-medium">
            Are you sure you want to delete <strong className="text-gray-900">{deleteConfirmNode?.name}</strong>?
          </p>
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl">
            <strong>Warning:</strong> Deleting a parent node will also remove access to all sub-locations attached to it.
          </div>

          <div className="pt-3 border-t border-gray-150 flex items-center justify-end gap-2">
            <button
              onClick={() => setDeleteConfirmNode(null)}
              className="px-4 py-2 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteLocation}
              className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-md shadow-rose-500/20"
            >
              Confirm Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default WarehouseStructureV2;

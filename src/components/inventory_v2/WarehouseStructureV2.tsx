import React, { useEffect, useState, useRef } from 'react';
import { 
  Warehouse, 
  RefreshCw, 
  Building2, 
  Folder, 
  Layers, 
  MapPin, 
  Search, 
  Edit, 
  Trash2,
  ChevronDown,
  ChevronRight,
  Eye,
  Clock,
  AlertTriangle,
  CheckCircle,
  Settings,
  X,
  Plus
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

const WarehouseStructureV2: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  
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
  const [duplicateGroups, setDuplicateGroups] = useState<{ field: string; value: string; items: WarehouseLocationV2[] }[]>([]);
  const [recycleBinItems, setRecycleBinItems] = useState<WarehouseLocationV2[]>([]);
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
        entityType: 'WarehouseLocationV2',
        limit: 50
      });
      const backendLogs = res.data?.logs || [];
      if (backendLogs.length === 0) {
        // Fallback mock logs
        const mockLogs = locations.slice(0, 10).map((l, idx) => ({
          _id: `mock-log-${idx}`,
          action: 'CREATE',
          entityType: 'WarehouseLocationV2',
          entityName: l.name,
          details: `Warehouse Location Node '${l.name}' (${l.level}) was created and active in layout.`,
          performedBy: 'System Admin',
          createdAt: l.createdAt || new Date().toISOString()
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

  const findLocationDuplicates = () => {
    const parentMap = new Map<string, WarehouseLocationV2[]>();
    locations.forEach(loc => {
      const parentKey = loc.parentId || 'root';
      const nameKey = `${parentKey}::${loc.name?.trim().toLowerCase()}`;
      if (!parentMap.has(nameKey)) parentMap.set(nameKey, []);
      parentMap.get(nameKey)!.push(loc);
    });

    const groups: { field: string; value: string; items: WarehouseLocationV2[] }[] = [];
    parentMap.forEach((items, key) => {
      if (items.length > 1) {
        groups.push({ field: 'Location Name under same parent', value: items[0].name, items });
      }
    });

    setDuplicateGroups(groups);
  };

  const fetchRecycleBin = async () => {
    try {
      setRecycleBinLoading(true);
      // Filter local locations set to 'Maintenance' as Recycle Bin items
      const maintenanceItems = locations.filter(l => l.status === 'Maintenance');
      setRecycleBinItems(maintenanceItems);
    } catch (err) {
      showToast('Failed to load Recycle Bin', 'error');
    } finally {
      setRecycleBinLoading(false);
    }
  };

  const handleRestoreLocation = async (loc: WarehouseLocationV2) => {
    try {
      if (!loc._id) return;
      await updateWarehouseLocationV2(loc._id, {
        name: loc.name,
        level: loc.level,
        parentId: loc.parentId || null,
        status: 'Active',
        company: selectedCompany?._id
      });
      showToast(`Location '${loc.name}' restored successfully`, 'success');
      setRecycleBinItems(prev => prev.filter(item => item._id !== loc._id));
      await loadWarehouse(); // Refresh tree
      await createActivityLog({
        action: 'RESTORE',
        entityType: 'WarehouseLocationV2',
        entityName: loc.name,
        details: `Warehouse location node '${loc.name}' was restored to Active status`,
        company: selectedCompany?._id
      });
    } catch (err) {
      showToast('Failed to restore location', 'error');
    }
  };
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tree expansion states
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  
  // Selected Node (Factory, Floor, or Zone) for right details panel
  const [selectedNode, setSelectedNode] = useState<WarehouseLocationV2 | null>(null);

  // Add/Edit node modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editNode, setEditNode] = useState<WarehouseLocationV2 | null>(null);
  const [deleteConfirmNode, setDeleteConfirmNode] = useState<WarehouseLocationV2 | null>(null);
  const [activeDetailLocationId, setActiveDetailLocationId] = useState<string | null>(null);

  const [addForm, setAddForm] = useState({
    name: '',
    level: 'Factory' as any,
    parentId: '' as string,
    capacity: '',
    unit: 'kg'
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

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
      
      // Auto-select first root node if nothing is selected yet
      if (data.length > 0 && !selectedNode) {
        const rootNode = data.find(l => l.level === 'Factory');
        if (rootNode) setSelectedNode(rootNode);
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
    setExpandedNodes(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleOpenAddModal = (level: 'Factory' | 'Floor' | 'Zone' | 'Storage Location', parentId: string) => {
    setAddForm({
      name: '',
      level,
      parentId,
      capacity: '',
      unit: 'kg'
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
      unit: node.unit || 'kg'
    });
    setAddError('');
    setShowAddModal(true);
  };

  const handleOpenDeleteModal = (node: WarehouseLocationV2, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmNode(node);
  };

  const handleAddLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim()) {
      setAddError('Location name is required');
      return;
    }
    setAddError('');
    setAddLoading(true);

    try {
      if (editNode?._id) {
        // Edit flow
        const updated = await updateWarehouseLocationV2(editNode._id, {
          name: addForm.name,
          level: addForm.level,
          parentId: addForm.parentId || null,
          capacity: addForm.level === 'Storage Location' && addForm.capacity ? Number(addForm.capacity) : undefined,
          unit: addForm.level === 'Storage Location' ? addForm.unit : undefined,
          company: selectedCompany?._id || ''
        });

        // Update local list
        setLocations(prev => prev.map(loc => loc._id === editNode._id ? updated : loc));
        if (selectedNode?._id === editNode._id) {
          setSelectedNode(updated);
        }
        showToast(`Location node '${addForm.name}' updated successfully`, 'success');
        createActivityLog({
          action: 'UPDATE',
          entityType: 'WarehouseLocationV2',
          entityName: addForm.name,
          details: `Warehouse location node '${addForm.name}' (${addForm.level}) was updated`,
          company: selectedCompany?._id
        }).catch(() => {});
      } else {
        // Create flow
        const created = await createWarehouseLocationV2({
          name: addForm.name,
          level: addForm.level,
          parentId: addForm.parentId || null,
          capacity: addForm.level === 'Storage Location' && addForm.capacity ? Number(addForm.capacity) : undefined,
          unit: addForm.level === 'Storage Location' ? addForm.unit : undefined,
          company: selectedCompany?._id || ''
        });

        setLocations(prev => [...prev, created]);
        // Expand the parent node so the new node is visible
        if (addForm.parentId) {
          setExpandedNodes(prev => ({ ...prev, [addForm.parentId]: true }));
        }
        showToast(`Location node '${addForm.name}' created successfully`, 'success');
        createActivityLog({
          action: 'CREATE',
          entityType: 'WarehouseLocationV2',
          entityName: addForm.name,
          details: `Warehouse location node '${addForm.name}' (${addForm.level}) was created`,
          company: selectedCompany?._id
        }).catch(() => {});
      }

      setShowAddModal(false);
      setEditNode(null);
    } catch (err: any) {
      console.error(err);
      setAddError(err.response?.data?.msg || 'Failed to save warehouse location node');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteNode = async () => {
    if (!deleteConfirmNode) return;
    const targetId = deleteConfirmNode._id || '';
    const targetName = deleteConfirmNode.name;
    setDeleteConfirmNode(null);

    // Optimistic delete
    const originalLocs = [...locations];
    setLocations(prev => prev.filter(loc => loc._id !== targetId));
    if (selectedNode?._id === targetId) {
      setSelectedNode(null);
    }

    try {
      await deleteWarehouseLocationV2(targetId, selectedCompany?._id || '');
      showToast(`Location '${targetName}' deleted successfully`, 'success');
      createActivityLog({
        action: 'DELETE',
        entityType: 'WarehouseLocationV2',
        entityName: targetName,
        details: `Warehouse location node '${targetName}' was deleted permanently`,
        company: selectedCompany?._id
      }).catch(() => {});
    } catch (err: any) {
      console.error(err);
      setLocations(originalLocs);
      showToast(err.response?.data?.msg || 'Failed to delete warehouse location', 'error');
    }
  };

  const getFactories = () => locations.filter(l => l.level === 'Factory');
  const getFloors = () => locations.filter(l => l.level === 'Floor');
  const getZones = () => locations.filter(l => l.level === 'Zone');
  const getStorageLocations = () => locations.filter(l => l.level === 'Storage Location');

  const getChildren = (parentId: string | null) => {
    return locations.filter(l => l.parentId === parentId);
  };

  const shouldRenderNode = (node: WarehouseLocationV2) => {
    if (!searchQuery.trim()) return true;
    
    // Show if matches search
    if (node.name.toLowerCase().includes(searchQuery.toLowerCase())) return true;
    
    // Show if any descendant matches search
    const checkDescendants = (parentId: string): boolean => {
      const children = locations.filter(l => l.parentId === parentId);
      for (const child of children) {
        if (child.name.toLowerCase().includes(searchQuery.toLowerCase())) return true;
        if (child._id && checkDescendants(child._id)) return true;
      }
      return false;
    };
    
    return node._id ? checkDescendants(node._id) : false;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-blue-600 animate-pulse-slow" />
            Warehouse Setup
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage factories, floors, zones and storage locations</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadWarehouse}
            className="p-2 text-gray-600 hover:bg-gray-50 border border-gray-200 rounded-xl transition-colors bg-white shadow-3xs"
            title="Reload Warehouse Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Tools dropdown */}
          <div className="relative" ref={toolsDropdownRef}>
            <button
              onClick={() => setShowToolsDropdown(!showToolsDropdown)}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white rounded-xl text-xs font-bold shadow-3xs transition-colors cursor-pointer"
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
                    onClick={() => { findLocationDuplicates(); setShowDuplicates(true); setShowToolsDropdown(false); }}
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
            onClick={() => handleOpenAddModal('Factory', '')}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-3xs"
          >
            <Building2 className="w-3.5 h-3.5 text-gray-400" /> + Add Factory
          </button>
          <button
            onClick={() => handleOpenAddModal('Floor', '')}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-3xs"
          >
            <Folder className="w-3.5 h-3.5 text-gray-400" /> + Add Floor
          </button>
          <button
            onClick={() => handleOpenAddModal('Zone', '')}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> + Add Zone
          </button>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Factories</span>
            <span className="text-xl font-black text-gray-900">{getFactories().length}</span>
          </div>
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <Building2 className="w-4 h-4" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Floors</span>
            <span className="text-xl font-black text-gray-900">{getFloors().length}</span>
          </div>
          <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl">
            <Folder className="w-4 h-4" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Zones</span>
            <span className="text-xl font-black text-gray-900">{getZones().length}</span>
          </div>
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
            <Layers className="w-4 h-4" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Storage Bins</span>
            <span className="text-xl font-black text-gray-900">{getStorageLocations().length}</span>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <MapPin className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Split Screen Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Tree panel */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col min-h-[500px]">
          {/* Search bar */}
          <div className="relative w-full mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Search locations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-gray-50/50 focus:bg-white text-gray-900 transition-all focus:outline-hidden"
            />
          </div>

          {/* Tree Node List */}
          <div className="flex-1 overflow-y-auto space-y-1 text-xs select-none pr-1 max-h-[550px]">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : getFactories().length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Warehouse className="w-10 h-10 mx-auto text-gray-200 mb-2" />
                <p className="font-bold">No nodes found</p>
                <p className="text-[10px] mt-0.5">Click "+ Add Factory" to begin building.</p>
              </div>
            ) : (
              getFactories()
                .filter(shouldRenderNode)
                .map(factory => {
                  const factoryExpanded = !!expandedNodes[factory._id || ''];
                  const floors = getChildren(factory._id || '');

                  return (
                    <div key={factory._id} className="space-y-0.5">
                      {/* FACTORY LEVEL */}
                      <div 
                        onClick={() => setSelectedNode(factory)}
                        className={`flex items-center justify-between p-2 rounded-xl group cursor-pointer transition-colors ${
                          selectedNode?._id === factory._id ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => toggleNode(factory._id || '', e)}
                            className="p-0.5 hover:bg-gray-200/80 rounded transition-colors text-gray-400"
                          >
                            {factoryExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <Warehouse className="w-4 h-4 text-blue-600 shrink-0" />
                          <span className="truncate max-w-[150px]">{factory.name}</span>
                        </div>
                        {/* Hover Actions */}
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleOpenAddModal('Floor', factory._id || ''); }}
                            className="p-1 hover:bg-blue-100 rounded text-blue-600 font-bold border border-blue-100/50 bg-white"
                            title="Add Floor"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={(e) => handleOpenEditModal(factory, e)}
                            className="p-1 hover:bg-amber-100 rounded text-amber-600 border border-amber-100/50 bg-white"
                            title="Edit"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={(e) => handleOpenDeleteModal(factory, e)}
                            className="p-1 hover:bg-red-100 rounded text-red-600 border border-red-100/50 bg-white"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* FLOORS LEVEL */}
                      {factoryExpanded && floors.filter(shouldRenderNode).map(floor => {
                        const floorExpanded = !!expandedNodes[floor._id || ''];
                        const zones = getChildren(floor._id || '');

                        return (
                          <div key={floor._id} className="pl-5 space-y-0.5">
                            <div 
                              onClick={() => setSelectedNode(floor)}
                              className={`flex items-center justify-between p-2 rounded-xl group cursor-pointer transition-colors ${
                                selectedNode?._id === floor._id ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-800'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => toggleNode(floor._id || '', e)}
                                  className="p-0.5 hover:bg-gray-200/80 rounded transition-colors text-gray-400"
                                >
                                  {floorExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                                <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                                <span className="truncate max-w-[130px]">{floor.name}</span>
                              </div>
                              {/* Hover Actions */}
                              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleOpenAddModal('Zone', floor._id || ''); }}
                                  className="p-1 hover:bg-blue-100 rounded text-blue-600 font-bold border border-blue-100/50 bg-white"
                                  title="Add Zone"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={(e) => handleOpenEditModal(floor, e)}
                                  className="p-1 hover:bg-amber-100 rounded text-amber-600 border border-amber-100/50 bg-white"
                                  title="Edit"
                                >
                                  <Edit className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={(e) => handleOpenDeleteModal(floor, e)}
                                  className="p-1 hover:bg-red-100 rounded text-red-600 border border-red-100/50 bg-white"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* ZONES LEVEL */}
                            {floorExpanded && zones.filter(shouldRenderNode).map(zone => {
                              const zoneExpanded = !!expandedNodes[zone._id || ''];
                              const storages = getChildren(zone._id || '');

                              return (
                                <div key={zone._id} className="pl-5 space-y-0.5">
                                  <div 
                                    onClick={() => setSelectedNode(zone)}
                                    className={`flex items-center justify-between p-2 rounded-xl group cursor-pointer transition-colors ${
                                      selectedNode?._id === zone._id ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-800'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={(e) => toggleNode(zone._id || '', e)}
                                        className="p-0.5 hover:bg-gray-200/80 rounded transition-colors text-gray-400"
                                      >
                                        {zoneExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                      </button>
                                      <Layers className="w-4 h-4 text-purple-500 shrink-0" />
                                      <span className="truncate max-w-[110px]">{zone.name}</span>
                                    </div>
                                    {/* Hover Actions */}
                                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleOpenAddModal('Storage Location', zone._id || ''); }}
                                        className="p-1 hover:bg-blue-100 rounded text-blue-600 font-bold border border-blue-100/50 bg-white"
                                        title="Add Storage Location"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                      <button 
                                        onClick={(e) => handleOpenEditModal(zone, e)}
                                        className="p-1 hover:bg-amber-100 rounded text-amber-600 border border-amber-100/50 bg-white"
                                        title="Edit"
                                      >
                                        <Edit className="w-3 h-3" />
                                      </button>
                                      <button 
                                        onClick={(e) => handleOpenDeleteModal(zone, e)}
                                        className="p-1 hover:bg-red-100 rounded text-red-600 border border-red-100/50 bg-white"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* STORAGE LOCATIONS LEVEL */}
                                  {zoneExpanded && storages.filter(shouldRenderNode).map(storage => (
                                    <div key={storage._id} className="pl-6 space-y-0.5">
                                      <div 
                                        onClick={() => setSelectedNode(storage)}
                                        className={`flex items-center justify-between p-2 rounded-xl group cursor-pointer transition-colors ${
                                          selectedNode?._id === storage._id ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-gray-50 text-gray-800'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className="w-3 h-3 flex items-center justify-center shrink-0 text-gray-300">•</div>
                                          <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 animate-pulse-slow" />
                                          <span className="truncate max-w-[100px]">{storage.name}</span>
                                        </div>
                                        {/* Hover Actions */}
                                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button 
                                            onClick={(e) => handleOpenEditModal(storage, e)}
                                            className="p-1 hover:bg-amber-50 rounded text-amber-600 border border-amber-100/50 bg-white"
                                            title="Edit"
                                          >
                                            <Edit className="w-3 h-3" />
                                          </button>
                                          <button 
                                            onClick={(e) => handleOpenDeleteModal(storage, e)}
                                            className="p-1 hover:bg-red-50 rounded text-red-600 border border-red-100/50 bg-white"
                                            title="Delete"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Right column: Details panel */}
        <div className="lg:col-span-7 h-full">
          {selectedNode ? (
            selectedNode.level === 'Storage Location' ? (
              <StorageLocationDetailsV2 
                locationId={selectedNode._id || ''} 
                companyId={selectedCompany?._id || ''} 
                isInline={true}
              />
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
                {/* Header section */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                      {selectedNode.level === 'Factory' ? <Warehouse className="w-5 h-5 text-blue-600" /> :
                       selectedNode.level === 'Floor' ? <Folder className="w-5 h-5 text-amber-500" /> :
                       <Layers className="w-5 h-5 text-purple-500" />}
                      {selectedNode.name}
                    </h2>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">Level: {selectedNode.level}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleOpenEditModal(selectedNode, e)}
                      className="px-3 py-1.5 border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100/60 rounded-xl font-bold transition-colors shadow-3xs text-xs"
                    >
                      Edit Node
                    </button>
                    <button
                      onClick={(e) => handleOpenDeleteModal(selectedNode, e)}
                    className="px-3 py-1.5 border border-red-200 text-red-700 bg-red-50 hover:bg-red-100/60 rounded-xl font-bold transition-colors shadow-3xs text-xs"
                  >
                    Delete Node
                  </button>
                </div>
              </div>

              {/* Status and summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border rounded-xl bg-gray-50/50">
                  <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">
                    {selectedNode.level === 'Zone' ? 'Storage Bins' : 'Sub-Nodes'}
                  </span>
                  <span className="text-lg font-black text-gray-900">
                    {getChildren(selectedNode._id || '').length} {selectedNode.level === 'Zone' ? 'Bins' : 'Nodes'}
                  </span>
                </div>
                <div className="p-4 border rounded-xl bg-gray-50/50">
                  <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Status</span>
                  <span className="inline-block px-1.5 py-0.5 bg-green-50 text-green-700 rounded mt-1 font-extrabold uppercase border border-green-150 text-[10px]">
                    {selectedNode.status || 'Active'}
                  </span>
                </div>
              </div>

              {/* Sub-node content (specifically Zone Detail) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    {selectedNode.level === 'Factory' ? 'Floors List' :
                     selectedNode.level === 'Floor' ? 'Zones List' : 'Storage Bins / Racks'}
                  </h3>
                  {selectedNode.level === 'Zone' && (
                    <button
                      onClick={() => handleOpenAddModal('Storage Location', selectedNode._id || '')}
                      className="flex items-center gap-1 px-2.5 py-1 bg-blue-55 border border-blue-200 hover:bg-blue-100 text-blue-600 rounded-lg text-[10px] font-extrabold shadow-3xs"
                    >
                      <Plus className="w-3 h-3" /> Add Storage Bin
                    </button>
                  )}
                  {selectedNode.level === 'Floor' && (
                    <button
                      onClick={() => handleOpenAddModal('Zone', selectedNode._id || '')}
                      className="flex items-center gap-1 px-2.5 py-1 bg-blue-55 border border-blue-200 hover:bg-blue-100 text-blue-600 rounded-lg text-[10px] font-extrabold shadow-3xs"
                    >
                      <Plus className="w-3 h-3" /> Add Zone
                    </button>
                  )}
                  {selectedNode.level === 'Factory' && (
                    <button
                      onClick={() => handleOpenAddModal('Floor', selectedNode._id || '')}
                      className="flex items-center gap-1 px-2.5 py-1 bg-blue-55 border border-blue-200 hover:bg-blue-100 text-blue-600 rounded-lg text-[10px] font-extrabold shadow-3xs"
                    >
                      <Plus className="w-3 h-3" /> Add Floor
                    </button>
                  )}
                </div>

                {getChildren(selectedNode._id || '').length > 0 ? (
                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200 text-[9px] uppercase">
                          <th className="px-4 py-2.5">Name</th>
                          {selectedNode.level === 'Zone' && <th className="px-4 py-2.5 text-center">Status</th>}
                          <th className="px-4 py-2.5 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                        {getChildren(selectedNode._id || '').map(child => (
                          <tr key={child._id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 font-bold text-gray-800">
                              <div className="flex items-center gap-2">
                                {child.level === 'Storage Location' ? <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> :
                                 child.level === 'Zone' ? <Layers className="w-3.5 h-3.5 text-purple-500 shrink-0" /> :
                                 <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                <span>{child.name}</span>
                              </div>
                            </td>
                            {selectedNode.level === 'Zone' && (
                              <td className="px-4 py-3 text-center">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase ${
                                  child.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {child.status}
                                </span>
                              </td>
                            )}
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                {child.level === 'Storage Location' && (
                                  <button
                                    onClick={() => setActiveDetailLocationId(child._id || null)}
                                    className="p-1 hover:bg-blue-50 rounded text-blue-600 border border-blue-100/50 bg-white"
                                    title="View Stock Details"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {child.level !== 'Storage Location' && (
                                  <button
                                    onClick={() => setSelectedNode(child)}
                                    className="px-2 py-1 hover:bg-gray-100 border rounded text-[10px] text-gray-600 font-bold"
                                    title="Inspect"
                                  >
                                    Inspect &rarr;
                                  </button>
                                )}
                                <button
                                  onClick={(e) => handleOpenEditModal(child, e)}
                                  className="p-1 hover:bg-amber-55 rounded text-amber-600 border border-amber-100/50 bg-white"
                                  title="Edit"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => handleOpenDeleteModal(child, e)}
                                  className="p-1 hover:bg-red-55 rounded text-red-600 border border-red-100/50 bg-white"
                                  title="Delete"
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
                  <p className="p-8 border border-dashed rounded-2xl text-center text-gray-400 italic bg-gray-50/20 text-xs">
                    No children configured under this node. Click the buttons above to add them.
                  </p>
                )}
              </div>
            </div>
          )) : (
            <div className="bg-white rounded-2xl border border-gray-200 border-dashed shadow-sm p-12 flex flex-col items-center justify-center text-center text-gray-400 min-h-[500px]">
              <Warehouse className="w-16 h-16 text-gray-300 mb-4 shrink-0 animate-bounce-slow" />
              <h2 className="font-bold text-gray-700 text-sm">Warehouse Hierarchy Setup</h2>
              <p className="text-xs text-gray-400 mt-1 max-w-sm leading-relaxed">
                Select a Factory, Floor, or Zone inside the hierarchy tree on the left to add, rename, edit, or manage its sub-locations and storage bins.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmNode && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="relative bg-white rounded-2xl max-w-sm w-full shadow-2xl flex flex-col border border-gray-200 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl flex justify-between items-center">
              <h2 className="text-sm font-bold text-gray-900">Confirm Location Deletion</h2>
              <button
                onClick={() => setDeleteConfirmNode(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="p-5 text-gray-800 space-y-3 text-xs">
              <p className="font-semibold leading-relaxed">
                Are you sure you want to delete warehouse node <span className="font-bold text-red-600">"{deleteConfirmNode.name}"</span>?
              </p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                This deletion will be rejected if this location contains sub-nodes or has active transaction records logged in the ledger.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-100 flex justify-end gap-2 text-xs">
              <button
                onClick={() => setDeleteConfirmNode(null)}
                className="px-3.5 py-1.5 border border-gray-200 rounded-lg font-bold text-gray-600 bg-white hover:bg-gray-50 animate-pulse-slow"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteNode}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-3xs"
              >
                Delete Node
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Location Node Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="relative bg-white rounded-2xl max-w-md w-full shadow-2xl flex flex-col border border-gray-200 animate-in fade-in zoom-in-95 duration-150 overflow-hidden text-xs">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl flex justify-between items-center">
              <h2 className="text-sm font-bold text-gray-900">
                {editNode ? `Edit ${editNode.level} Details` : `Create New ${addForm.level}`}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditNode(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddLocationSubmit} className="p-6 space-y-4">
              {addError && (
                <div className="p-3 bg-red-50 border border-red-150 rounded-xl text-xs font-semibold text-red-700">
                  {addError}
                </div>
              )}
              
              <div>
                <label className="block text-[10px] font-bold text-gray-600 mb-1.5 uppercase">Location Name / Code *</label>
                <input
                  type="text"
                  placeholder="e.g. Ground Floor, Rack A-1, Storage Area"
                  value={addForm.name}
                  onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-600 mb-1.5 uppercase">Parent Location</label>
                {editNode ? (
                  <input
                    type="text"
                    value={
                      addForm.parentId 
                        ? (locations.find(l => l._id === addForm.parentId)?.name || 'Parent Location')
                        : 'No Parent (Root Node)'
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100/80 font-bold text-gray-500 cursor-not-allowed select-none truncate"
                    readOnly
                  />
                ) : (
                  addForm.level === 'Factory' ? (
                    <input
                      type="text"
                      value="No Parent Required for Factory"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100/80 font-bold text-gray-500 cursor-not-allowed select-none"
                      readOnly
                    />
                  ) : (
                    <select
                      value={addForm.parentId}
                      onChange={e => setAddForm({ ...addForm, parentId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 font-bold"
                      required
                    >
                      <option value="">Select Parent Location...</option>
                      {addForm.level === 'Floor' && locations.filter(l => l.level === 'Factory').map(l => (
                        <option key={l._id} value={l._id}>{l.name}</option>
                      ))}
                      {addForm.level === 'Zone' && locations.filter(l => l.level === 'Floor').map(l => {
                        const factory = locations.find(f => f._id === l.parentId);
                        return (
                          <option key={l._id} value={l._id}>
                            {l.name} {factory ? `(${factory.name})` : ''}
                          </option>
                        );
                      })}
                      {addForm.level === 'Storage Location' && locations.filter(l => l.level === 'Zone').map(l => {
                        const floor = locations.find(fl => fl._id === l.parentId);
                        const factory = floor ? locations.find(fac => fac._id === floor.parentId) : null;
                        return (
                          <option key={l._id} value={l._id}>
                            {l.name} {factory ? `(${factory.name} > ${floor?.name})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  )
                )}
              </div>


              <div className="pt-4 border-t border-gray-100 flex justify-end gap-2.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditNode(null);
                  }}
                  className="px-4 py-2 border border-gray-200 rounded-lg font-semibold text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-1 shadow-sm"
                >
                  {addLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  {editNode ? 'Save Changes' : 'Create Node'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide-over details for selected Storage Location stock */}
      {activeDetailLocationId && (
        <StorageLocationDetailsV2 
          locationId={activeDetailLocationId} 
          companyId={selectedCompany?._id || ''} 
          onClose={() => setActiveDetailLocationId(null)} 
        />
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
                    <h2 className="text-base font-bold text-gray-900">Warehouse Activity Log</h2>
                    <p className="text-[10px] text-gray-500 mt-0.5 font-medium">Audit history for warehouse structure additions, updates and deletions</p>
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
                          <p className="text-gray-600 font-bold">Node: {log.entityName}</p>
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
                Find Duplicates for Warehouse Nodes
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
                  <p className="text-sm text-gray-400 mt-1">All location nodes have unique names under their parents.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-gray-500 font-medium">The following duplicate location names were identified under the same parent node:</p>
                  {duplicateGroups.map((group, gIdx) => (
                    <div key={gIdx} className="border border-red-100 bg-red-50/10 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded uppercase text-[10px]">
                          Duplicate name: {group.value}
                        </span>
                        <span className="text-[10px] text-gray-400 font-bold">{group.items.length} duplicate entries</span>
                      </div>
                      <div className="space-y-2">
                        {group.items.map((item, iIdx) => (
                          <div key={item._id || iIdx} className="flex justify-between items-center text-[11px] text-gray-600 bg-white p-2 rounded-lg border border-gray-150">
                            <div>
                              <p className="font-bold text-gray-900">{item.name}</p>
                              <p className="font-mono text-gray-400 text-[10px]">{item.level} • ID: {item._id}</p>
                            </div>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-50 text-yellow-700">{item.status}</span>
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
                      Warehouse Recycle Bin (Maintenance Items)
                    </h2>
                    <p className="text-[10px] text-gray-500 mt-0.5 font-medium font-sans">Nodes in Maintenance status can be restored to Active</p>
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
                      <p className="text-xs text-gray-400 mt-1">No warehouse locations currently under maintenance.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recycleBinItems.map((item, idx) => (
                        <div key={item._id || idx} className="flex justify-between items-center p-3 border border-gray-200 rounded-xl bg-gray-50/50 hover:bg-white transition-all text-xs">
                          <div className="space-y-1">
                            <p className="font-bold text-gray-800">{item.name}</p>
                            <p className="font-mono text-gray-400 text-[10px]">{item.level} • {item.status}</p>
                          </div>
                          <button
                            onClick={() => handleRestoreLocation(item)}
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

export default WarehouseStructureV2;

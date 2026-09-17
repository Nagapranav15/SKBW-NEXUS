import React, { useEffect, useState, useRef, useMemo } from 'react';
import { 
  Warehouse, RefreshCw, Building2, Layers, MapPin, Search, 
  Edit, Trash2, ChevronDown, ChevronRight, Clock, AlertTriangle, 
  Settings, Plus, ArrowRightLeft, BarChart2, Package, Database,
  TrendingUp, TrendingDown, Filter, MoreVertical, MoreHorizontal,
  LayoutGrid, List, FolderTree, Check, X, ArrowUpRight, CheckCircle2,
  Box, ArrowLeftRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { 
  getWarehouseHierarchyV2, 
  createWarehouseLocationV2, 
  updateWarehouseLocationV2, 
  deleteWarehouseLocationV2, 
  getLocationDetailsV2,
  getSkusV2,
  recordTransferV2,
  WarehouseLocationV2, 
  SkuV2
} from '../../api/mfgApiV2';
import { getActivityLogs } from '../../api/activityLogApi';
import { showToast } from '../ui/Toast';
import Modal from '../ui/Modal';

// Cute Minimal Sparkline Component with Soft Gradient Fill
const CuteSparkline: React.FC<{ 
  data: number[]; 
  color?: string; 
  gradientId: string; 
  height?: number; 
  width?: number 
}> = ({ 
  data, 
  color = '#2563eb', 
  gradientId,
  height = 32,
  width = 70
}) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const paddingY = 3;

  const pts = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - paddingY - ((val - min) / range) * (height - paddingY * 2);
    return { x, y };
  });

  let pathD = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cpX = (p0.x + p1.x) / 2;
    pathD += ` C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const fillD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible inline-block">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#${gradientId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

interface WarehouseStructureV2Props {
  isEmbedded?: boolean;
}

const WarehouseStructureV2: React.FC<WarehouseStructureV2Props> = ({ isEmbedded = false }) => {
  const { selectedCompany } = useAuth();
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  
  // Selected Node (Factory, Floor, Zone, or Storage Location)
  const [selectedNode, setSelectedNode] = useState<WarehouseLocationV2 | null>(null);

  // Selected Node Details Data (Live stock, movements, total qty)
  const [nodeDetails, setNodeDetails] = useState<{
    location: WarehouseLocationV2;
    storedSkus: { sku: SkuV2; quantity: number }[];
    recentMovements: any[];
    totalQty: number;
  } | null>(null);

  // View switchers: 'tree' | 'list'
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
  const [activeTab, setActiveTab] = useState<'liveStock' | 'layout' | 'utilization' | 'activity'>('liveStock');

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [stockCategoryFilter, setStockCategoryFilter] = useState('');
  const [showStockFilterDropdown, setShowStockFilterDropdown] = useState(false);
  
  // Pagination for Live Stock Table
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Tree expansion states
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editNode, setEditNode] = useState<WarehouseLocationV2 | null>(null);
  const [deleteConfirmNode, setDeleteConfirmNode] = useState<WarehouseLocationV2 | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [showActivityLogModal, setShowActivityLogModal] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<{ field: string; value: string; items: WarehouseLocationV2[] }[]>([]);

  // Menu Dropdown states
  const [activeMenuNodeId, setActiveMenuNodeId] = useState<string | null>(null);

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

  // Transfer Stock Form State
  const [transferForm, setTransferForm] = useState({
    skuId: '',
    fromLocationId: '',
    toLocationId: '',
    quantity: '',
    remarks: ''
  });
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState('');

  const toolsDropdownRef = useRef<HTMLDivElement>(null);
  const stockFilterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(event.target as Node)) {
        setShowToolsDropdown(false);
      }
      if (stockFilterDropdownRef.current && !stockFilterDropdownRef.current.contains(event.target as Node)) {
        setShowStockFilterDropdown(false);
      }
      if (activeMenuNodeId && !(event.target as HTMLElement).closest('.node-action-menu')) {
        setActiveMenuNodeId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenuNodeId]);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadInitialData();
    }
  }, [selectedCompany?._id]);

  useEffect(() => {
    if (selectedNode && selectedNode._id && selectedCompany?._id) {
      loadNodeDetails(selectedNode._id);
    }
  }, [selectedNode?._id, selectedCompany?._id]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [hierarchyData, skusData] = await Promise.all([
        getWarehouseHierarchyV2(selectedCompany?._id || ''),
        getSkusV2(selectedCompany?._id || '')
      ]);
      setLocations(hierarchyData);
      setSkus(skusData);

      // All factories closed by default
      setExpandedNodes({});

      if (hierarchyData.length > 0) {
        const rootFactory = hierarchyData.find(l => l.level === 'Factory') || hierarchyData[0];
        setSelectedNode(rootFactory);
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to load warehouse structure', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadNodeDetails = async (locationId: string) => {
    setDetailsLoading(true);
    try {
      const res = await getLocationDetailsV2(locationId, selectedCompany?._id || '');
      setNodeDetails(res);
    } catch (err) {
      console.error('Failed to load location details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const reloadWarehouse = async () => {
    try {
      const data = await getWarehouseHierarchyV2(selectedCompany?._id || '');
      setLocations(data);
      if (selectedNode?._id) {
        const refreshed = data.find(l => l._id === selectedNode._id);
        if (refreshed) {
          setSelectedNode(refreshed);
          await loadNodeDetails(refreshed._id!);
        } else if (data.length > 0) {
          setSelectedNode(data[0]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectAndOpenNode = (node: WarehouseLocationV2) => {
    setSelectedNode(node);
    const toExpand: Record<string, boolean> = {};

    // 1. Expand all ancestor parent nodes up to root
    let currParentId = node.parentId;
    while (currParentId) {
      toExpand[currParentId] = true;
      const parentNode = locations.find(l => l._id === currParentId);
      currParentId = parentNode?.parentId;
    }

    // 2. Expand this node
    if (node._id) {
      toExpand[node._id] = true;
    }

    // 3. Expand all nested descendant nodes recursively
    const expandDescendants = (parentId: string) => {
      const children = locations.filter(l => l.parentId === parentId);
      children.forEach(c => {
        if (c._id) {
          toExpand[c._id] = true;
          expandDescendants(c._id);
        }
      });
    };

    if (node._id) {
      expandDescendants(node._id);
    }

    setExpandedNodes(prev => ({ ...prev, ...toExpand }));
  };

  const handleExpandAll = () => {
    const all: Record<string, boolean> = {};
    locations.forEach(l => { if (l._id) all[l._id] = true; });
    setExpandedNodes(all);
    showToast('Expanded all levels', 'info');
  };

  const handleCollapseAll = () => {
    setExpandedNodes({});
    showToast('Collapsed all levels', 'info');
  };

  const handleOpenAddModal = (level: 'Factory' | 'Floor' | 'Zone' | 'Storage Location', parentId = '') => {
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
    setActiveMenuNodeId(null);
  };

  const handleOpenEditModal = (node: WarehouseLocationV2, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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
    setActiveMenuNodeId(null);
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
        const created = await createWarehouseLocationV2({
          name: addForm.name.trim(),
          level: addForm.level,
          parentId: addForm.parentId || null,
          capacity: addForm.capacity ? Number(addForm.capacity) : undefined,
          unit: addForm.unit,
          status: addForm.status,
          company: selectedCompany?._id
        });
        showToast(`Created ${created.level} '${created.name}'`, 'success');
        setSelectedNode(created);
        if (created.parentId) {
          setExpandedNodes(prev => ({ ...prev, [created.parentId!]: true }));
        }
      }

      setShowAddModal(false);
      await reloadWarehouse();
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
      if (selectedNode?._id === deleteConfirmNode._id) {
        setSelectedNode(null);
      }
      setDeleteConfirmNode(null);
      await reloadWarehouse();
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.msg || err.message || 'Failed to delete location';
      showToast(msg, 'error');
    }
  };

  // Stock Transfer Handler
  const handleOpenTransferModal = (defaultSkuId = '', defaultFromLocId = '') => {
    setTransferForm({
      skuId: defaultSkuId,
      fromLocationId: defaultFromLocId || (selectedNode?.level === 'Storage Location' ? selectedNode._id! : ''),
      toLocationId: '',
      quantity: '',
      remarks: ''
    });
    setTransferError('');
    setShowTransferModal(true);
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError('');

    if (!transferForm.skuId) {
      setTransferError('Please select an item / SKU to transfer');
      return;
    }
    if (!transferForm.fromLocationId) {
      setTransferError('Please select the source storage bin');
      return;
    }
    if (!transferForm.toLocationId) {
      setTransferError('Please select the destination storage bin');
      return;
    }
    if (transferForm.fromLocationId === transferForm.toLocationId) {
      setTransferError('Source and Destination storage bins must be different');
      return;
    }
    const qty = Number(transferForm.quantity);
    if (isNaN(qty) || qty <= 0) {
      setTransferError('Transfer quantity must be greater than 0');
      return;
    }

    setTransferLoading(true);
    try {
      await recordTransferV2({
        skuId: transferForm.skuId,
        fromLocationId: transferForm.fromLocationId,
        toLocationId: transferForm.toLocationId,
        quantity: qty,
        remarks: transferForm.remarks || 'Warehouse Stock Transfer',
        company: selectedCompany?._id || ''
      });
      showToast(`Stock transferred successfully (${qty})`, 'success');
      setShowTransferModal(false);
      await reloadWarehouse();
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.msg || err.message || 'Failed to transfer stock';
      setTransferError(msg);
      showToast(msg, 'error');
    } finally {
      setTransferLoading(false);
    }
  };

  // Activity logs & Duplicates tools
  const fetchActivityLogs = async () => {
    try {
      const res = await getActivityLogs({
        company: selectedCompany?._id,
        entityType: 'WarehouseLocationV2',
        limit: 50
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
        groups.push({ field: 'Duplicate Name under same Parent', value: items[0].name, items });
      }
    });

    setDuplicateGroups(groups);
  };

  const getNodeSubCounts = (nodeId: string) => {
    let floorCount = 0;
    let zoneCount = 0;
    let binCount = 0;

    const findDescendants = (pId: string) => {
      const children = locations.filter(l => l.parentId === pId);
      children.forEach(c => {
        if (c.level === 'Floor') floorCount++;
        else if (c.level === 'Zone') zoneCount++;
        else if (c.level === 'Storage Location') binCount++;
        if (c._id) findDescendants(c._id);
      });
    };

    findDescendants(nodeId);
    return { floorCount, zoneCount, binCount };
  };

  // Live stock metrics
  const storedSkusList = nodeDetails?.storedSkus || [];
  const totalSkuCount = storedSkusList.length;
  const totalStockQty = nodeDetails?.totalQty || 0;

  const filteredStockItems = useMemo(() => {
    return storedSkusList.filter(item => {
      const matchesSearch = !stockSearchQuery.trim() || 
        item.sku.name.toLowerCase().includes(stockSearchQuery.toLowerCase()) ||
        item.sku.skuCode.toLowerCase().includes(stockSearchQuery.toLowerCase());
      const matchesCategory = !stockCategoryFilter || item.sku.category === stockCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [storedSkusList, stockSearchQuery, stockCategoryFilter]);

  const lowStockCount = useMemo(() => {
    return storedSkusList.filter(item => {
      const min = item.sku.minStockLevel || 100;
      return item.quantity <= min;
    }).length;
  }, [storedSkusList]);

  const stockCategories = useMemo(() => {
    const cats = new Set<string>();
    storedSkusList.forEach(item => {
      if (item.sku.category) cats.add(item.sku.category);
    });
    return Array.from(cats);
  }, [storedSkusList]);

  const totalPages = Math.ceil(filteredStockItems.length / pageSize) || 1;
  const paginatedStockItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStockItems.slice(start, start + pageSize);
  }, [filteredStockItems, currentPage, pageSize]);

  const rootFactories = useMemo(() => {
    return locations.filter(l => l.level === 'Factory');
  }, [locations]);

  const allStorageBins = useMemo(() => {
    return locations.filter(l => l.level === 'Storage Location' && l.status !== 'Maintenance');
  }, [locations]);

  return (
    <div className={isEmbedded ? "space-y-4 flex-1 w-full text-left font-sans" : "p-3 sm:p-5 space-y-4 flex-1 w-full relative text-left font-sans bg-slate-50/40 min-h-screen"}>
      
      {/* STANDALONE HEADER (IF ACCESSED DIRECTLY VIA ROUTE) */}
      {!isEmbedded && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/70 shadow-xs">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase tracking-wider">
              <Warehouse className="w-3.5 h-3.5" />
              <span>Master Management</span>
            </div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight mt-0.5 flex items-center gap-2">
              Warehouse Hierarchy & Storage Setup
            </h1>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => reloadWarehouse()}
              className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-500 transition-colors cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading || detailsLoading ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            <div className="relative" ref={toolsDropdownRef}>
              <button
                onClick={() => setShowToolsDropdown(!showToolsDropdown)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
              >
                <Settings className="w-3 h-3 text-slate-400" />
                <span>Tools</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showToolsDropdown && (
                <div className="absolute right-0 mt-1.5 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 text-xs animate-in fade-in">
                  <button
                    onClick={() => { setShowToolsDropdown(false); fetchActivityLogs(); setShowActivityLogModal(true); }}
                    className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <Clock className="w-3 h-3 text-blue-600" /> Activity Logs
                  </button>
                  <button
                    onClick={() => { setShowToolsDropdown(false); findDuplicates(); setShowDuplicatesModal(true); }}
                    className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <AlertTriangle className="w-3 h-3 text-blue-600" /> Find Duplicates
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    onClick={() => { setShowToolsDropdown(false); handleExpandAll(); }}
                    className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <FolderTree className="w-3 h-3 text-slate-400" /> Expand All
                  </button>
                  <button
                    onClick={() => { setShowToolsDropdown(false); handleCollapseAll(); }}
                    className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <Layers className="w-3 h-3 text-slate-400" /> Collapse All
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => handleOpenAddModal('Factory', '')}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Factory</span>
            </button>
          </div>
        </div>
      )}

      {/* TWO-COLUMN DASHBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* LEFT COLUMN: WAREHOUSE HIERARCHY TREE */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/70 shadow-xs p-3.5 sm:p-4 space-y-3.5">
          
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-slate-800 leading-tight">Warehouse Hierarchy</h2>
                <p className="text-[10px] text-slate-400 font-normal">
                  Factories, floors, and storage zones
                </p>
              </div>
            </div>

            {/* View Switcher & Controls */}
            <div className="flex items-center gap-1">
              <div className="bg-slate-100 p-0.5 rounded-lg flex items-center">
                <button
                  onClick={() => setViewMode('tree')}
                  className={`px-2 py-1 rounded-md text-[10.5px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    viewMode === 'tree'
                      ? 'bg-white text-blue-600 shadow-3xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Tree View"
                >
                  <FolderTree className="w-3 h-3" />
                  <span>Tree</span>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-2 py-1 rounded-md text-[10.5px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-white text-blue-600 shadow-3xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="List View"
                >
                  <List className="w-3 h-3" />
                  <span>List</span>
                </button>
              </div>

              <button
                onClick={() => setShowSearchInput(!showSearchInput)}
                className={`p-1.5 border rounded-lg transition-colors cursor-pointer ${
                  showSearchInput || searchQuery 
                    ? 'bg-blue-50 border-blue-200 text-blue-600' 
                    : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                }`}
                title="Search"
              >
                <Search className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Search Input */}
          {(showSearchInput || searchQuery) && (
            <div className="relative animate-in fade-in duration-100">
              <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filter locations..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-7 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:bg-white text-slate-800"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* TREE VIEW */}
          {viewMode === 'tree' ? (
            <div className="space-y-0.5 max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
              {rootFactories.length === 0 ? (
                <div className="p-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  <Warehouse className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                  <p className="text-[11px] font-medium">No warehouse hierarchy created yet.</p>
                  <button
                    onClick={() => handleOpenAddModal('Factory', '')}
                    className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shadow-xs cursor-pointer"
                  >
                    + Add Factory
                  </button>
                </div>
              ) : (
                rootFactories.map(factory => {
                  const isFactorySelected = selectedNode?._id === factory._id;
                  const isFactoryExpanded = !!expandedNodes[factory._id!];
                  const factoryCounts = getNodeSubCounts(factory._id!);
                  const floors = locations.filter(l => l.parentId === factory._id);

                  return (
                    <div key={factory._id} className="space-y-0.5">
                      
                      {/* FACTORY ROOT ROW */}
                      <div
                        onClick={() => handleSelectAndOpenNode(factory)}
                        className={`group flex items-center justify-between px-2 py-1.5 rounded-lg transition-all cursor-pointer ${
                          isFactorySelected
                            ? 'bg-blue-50 text-blue-950 font-semibold'
                            : 'text-slate-700 hover:bg-slate-100/70'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <button
                            onClick={(e) => toggleExpand(factory._id!, e)}
                            className="p-0.5 text-slate-400 hover:text-slate-700 rounded transition-transform cursor-pointer shrink-0"
                          >
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${isFactoryExpanded ? 'rotate-90 text-blue-600' : ''}`} />
                          </button>

                          <Building2 className={`w-4 h-4 shrink-0 ${isFactorySelected ? 'text-blue-600' : 'text-slate-400'}`} />

                          <span className="text-xs font-bold truncate">
                            {factory.name}
                          </span>

                          <span className="text-[10px] text-slate-400 font-normal ml-1">
                            ({factoryCounts.floorCount}F • {factoryCounts.zoneCount}Z • {factoryCounts.binCount}B)
                          </span>
                        </div>

                        <div className="relative node-action-menu opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuNodeId(activeMenuNodeId === factory._id ? null : factory._id!);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200/60 cursor-pointer"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {activeMenuNodeId === factory._id && (
                            <div className="absolute right-0 mt-1 w-32 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 text-xs animate-in fade-in">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleOpenAddModal('Floor', factory._id!); }}
                                className="w-full text-left px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                              >
                                <Plus className="w-3 h-3 text-blue-600" /> Add Floor
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleOpenEditModal(factory, e); }}
                                className="w-full text-left px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                              >
                                <Edit className="w-3 h-3 text-slate-400" /> Edit
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirmNode(factory); setActiveMenuNodeId(null); }}
                                className="w-full text-left px-2.5 py-1 text-[11px] text-rose-600 hover:bg-rose-50 flex items-center gap-1.5"
                              >
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* FLOORS LIST UNDER FACTORY */}
                      {isFactoryExpanded && (
                        <div className="pl-3.5 ml-2.5 border-l border-slate-200/80 space-y-0.5 pt-0.5">
                          {floors.map((floor) => {
                            const isFloorSelected = selectedNode?._id === floor._id;
                            const isFloorExpanded = !!expandedNodes[floor._id!];
                            const floorCounts = getNodeSubCounts(floor._id!);
                            const zones = locations.filter(l => l.parentId === floor._id);

                            return (
                              <div key={floor._id} className="space-y-0.5">
                                
                                {/* Floor Row */}
                                <div
                                  onClick={() => handleSelectAndOpenNode(floor)}
                                  className={`group flex items-center justify-between px-2 py-1.5 rounded-lg transition-all cursor-pointer ${
                                    isFloorSelected
                                      ? 'bg-blue-50 text-blue-950 font-semibold'
                                      : 'text-slate-700 hover:bg-slate-100/70'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <button
                                      onClick={(e) => toggleExpand(floor._id!, e)}
                                      className="p-0.5 text-slate-400 hover:text-slate-700 rounded transition-transform cursor-pointer shrink-0"
                                    >
                                      <ChevronRight className={`w-3 h-3 transition-transform duration-150 ${isFloorExpanded ? 'rotate-90 text-blue-600' : ''}`} />
                                    </button>

                                    <Layers className={`w-3.5 h-3.5 shrink-0 ${isFloorSelected ? 'text-blue-600' : 'text-slate-400'}`} />

                                    <span className="text-[11.5px] font-semibold truncate">
                                      {floor.name}
                                    </span>

                                    <span className="text-[10px] text-slate-400 font-normal ml-1">
                                      ({floorCounts.zoneCount}Z • {floorCounts.binCount}B)
                                    </span>
                                  </div>

                                  <div className="relative node-action-menu opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuNodeId(activeMenuNodeId === floor._id ? null : floor._id!);
                                      }}
                                      className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200/60 cursor-pointer"
                                    >
                                      <MoreVertical className="w-3 h-3" />
                                    </button>

                                    {activeMenuNodeId === floor._id && (
                                      <div className="absolute right-0 mt-1 w-32 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 text-xs animate-in fade-in">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleOpenAddModal('Zone', floor._id!); }}
                                          className="w-full text-left px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                                        >
                                          <Plus className="w-3 h-3 text-blue-600" /> Add Zone
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleOpenEditModal(floor, e); }}
                                          className="w-full text-left px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                                        >
                                          <Edit className="w-3 h-3 text-slate-400" /> Edit
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmNode(floor); setActiveMenuNodeId(null); }}
                                          className="w-full text-left px-2.5 py-1 text-[11px] text-rose-600 hover:bg-rose-50 flex items-center gap-1.5"
                                        >
                                          <Trash2 className="w-3 h-3" /> Delete
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* ZONES LIST UNDER FLOOR */}
                                {isFloorExpanded && (
                                  <div className="pl-3.5 ml-2 border-l border-slate-200/80 space-y-0.5 pt-0.5">
                                    {zones.map((zone, zIdx) => {
                                      const isZoneSelected = selectedNode?._id === zone._id;
                                      const isZoneExpanded = !!expandedNodes[zone._id!];
                                      const bins = locations.filter(l => l.parentId === zone._id);

                                      return (
                                        <div key={zone._id} className="space-y-0.5">
                                          <div
                                            onClick={() => handleSelectAndOpenNode(zone)}
                                            className={`group flex items-center justify-between px-2 py-1 rounded-lg transition-all cursor-pointer ${
                                              isZoneSelected
                                                ? 'bg-blue-50 text-blue-950 font-semibold'
                                                : 'text-slate-700 hover:bg-slate-100/70'
                                            }`}
                                          >
                                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                              <button
                                                onClick={(e) => toggleExpand(zone._id!, e)}
                                                className="p-0.5 text-slate-400 hover:text-slate-700 rounded transition-transform cursor-pointer shrink-0"
                                              >
                                                <ChevronRight className={`w-3 h-3 transition-transform duration-150 ${isZoneExpanded ? 'rotate-90 text-blue-600' : ''}`} />
                                              </button>

                                              <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-1 py-0.2 rounded shrink-0">
                                                Z{zIdx + 1}
                                              </span>

                                              <span className="text-[11px] font-semibold truncate">
                                                {zone.name}
                                              </span>

                                              <span className="text-[9.5px] text-slate-400 font-normal ml-1">
                                                ({bins.length} {bins.length === 1 ? 'bin' : 'bins'})
                                              </span>
                                            </div>

                                            <div className="relative node-action-menu opacity-0 group-hover:opacity-100 transition-opacity">
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setActiveMenuNodeId(activeMenuNodeId === zone._id ? null : zone._id!);
                                                }}
                                                className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200/60 cursor-pointer"
                                              >
                                                <MoreVertical className="w-3 h-3" />
                                              </button>

                                              {activeMenuNodeId === zone._id && (
                                                <div className="absolute right-0 mt-1 w-32 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 text-xs animate-in fade-in">
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); handleOpenAddModal('Storage Location', zone._id!); }}
                                                    className="w-full text-left px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                                                  >
                                                    <Plus className="w-3 h-3 text-blue-600" /> Add Bin
                                                  </button>
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); handleOpenEditModal(zone, e); }}
                                                    className="w-full text-left px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                                                  >
                                                    <Edit className="w-3 h-3 text-slate-400" /> Edit
                                                  </button>
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmNode(zone); setActiveMenuNodeId(null); }}
                                                    className="w-full text-left px-2.5 py-1 text-[11px] text-rose-600 hover:bg-rose-50 flex items-center gap-1.5"
                                                  >
                                                    <Trash2 className="w-3 h-3" /> Delete
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          {/* STORAGE BINS UNDER ZONE */}
                                          {isZoneExpanded && (
                                            <div className="pl-4 ml-2.5 border-l border-slate-200/80 space-y-0.5 py-0.5">
                                              {bins.map(bin => {
                                                const isBinSelected = selectedNode?._id === bin._id;
                                                return (
                                                  <div
                                                    key={bin._id}
                                                    onClick={() => handleSelectAndOpenNode(bin)}
                                                    className={`flex items-center justify-between px-2 py-1 rounded-md text-[10.5px] transition-all cursor-pointer ${
                                                      isBinSelected
                                                        ? 'bg-blue-50 text-blue-900 font-semibold'
                                                        : 'text-slate-600 hover:bg-slate-100/70'
                                                    }`}
                                                  >
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                                      <span className="truncate">{bin.name}</span>
                                                    </div>
                                                    <span className="text-[9.5px] text-slate-400">
                                                      {bin.capacity ? `${bin.capacity} ${bin.unit || 'kg'}` : 'Bin'}
                                                    </span>
                                                  </div>
                                                );
                                              })}
                                              <button
                                                onClick={() => handleOpenAddModal('Storage Location', zone._id!)}
                                                className="text-slate-400 hover:text-blue-600 text-[10px] font-medium flex items-center gap-1 py-1 px-2 rounded hover:bg-blue-50/50 transition-colors cursor-pointer"
                                              >
                                                <Plus className="w-2.5 h-2.5" />
                                                <span>Add Bin</span>
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}

                                    <button
                                      onClick={() => handleOpenAddModal('Zone', floor._id!)}
                                      className="text-slate-400 hover:text-blue-600 text-[10.5px] font-medium flex items-center gap-1 py-1 px-2 rounded hover:bg-blue-50/50 transition-colors cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Add Zone</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          <button
                            onClick={() => handleOpenAddModal('Floor', factory._id!)}
                            className="text-slate-400 hover:text-blue-600 text-[10.5px] font-medium flex items-center gap-1 py-1 px-2 rounded hover:bg-blue-50/50 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Floor</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* LIST VIEW */
            <div className="space-y-0.5 max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
              {locations
                .filter(l => !searchQuery || l.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(loc => {
                  const isSelected = selectedNode?._id === loc._id;
                  return (
                    <div
                      key={loc._id}
                      onClick={() => handleSelectAndOpenNode(loc)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50 text-blue-900 font-semibold'
                          : 'text-slate-700 hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {loc.level === 'Factory' ? <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" /> :
                         loc.level === 'Floor' ? <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" /> :
                         loc.level === 'Zone' ? <FolderTree className="w-3.5 h-3.5 text-blue-600 shrink-0" /> : <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                        <span className="text-[11.5px] truncate">{loc.name}</span>
                        <span className="text-[9.5px] text-slate-400 uppercase font-normal">{loc.level}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-100">
                          {loc.status || 'Active'}
                        </span>
                        <button
                          onClick={(e) => handleOpenEditModal(loc, e)}
                          className="p-1 text-slate-400 hover:text-blue-600"
                        >
                          <Edit className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: DASHBOARD & OPERATIONS */}
        <div className="lg:col-span-7 space-y-4">
          
          {selectedNode ? (
            <>
              {/* SELECTED NODE HEADER CARD */}
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-xs p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  
                  {/* Entity Icon & Info */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100/80 text-blue-600 flex items-center justify-center shrink-0">
                      {selectedNode.level === 'Factory' ? <Building2 className="w-5 h-5 stroke-[1.75]" /> :
                       selectedNode.level === 'Floor' ? <Layers className="w-5 h-5 stroke-[1.75]" /> :
                       selectedNode.level === 'Zone' ? <FolderTree className="w-5 h-5 stroke-[1.75]" /> :
                       <MapPin className="w-5 h-5 stroke-[1.75]" />}
                    </div>

                    <div>
                      <span className="inline-block text-[9.5px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full mb-0.5">
                        {selectedNode.level}
                      </span>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                        {selectedNode.name}
                      </h2>
                      <p className="text-[10.5px] text-slate-400 font-medium">
                        {(() => {
                          const counts = getNodeSubCounts(selectedNode._id!);
                          if (selectedNode.level === 'Factory') {
                            return `${counts.floorCount} Floors • ${counts.zoneCount} Zones • ${counts.binCount} Storage Bins`;
                          } else if (selectedNode.level === 'Floor') {
                            return `${counts.zoneCount} Zones • ${counts.binCount} Storage Bins`;
                          } else if (selectedNode.level === 'Zone') {
                            return `${counts.binCount} Storage Bins`;
                          } else {
                            return `Capacity: ${selectedNode.capacity || 'Unlimited'} ${selectedNode.unit || 'kg'}`;
                          }
                        })()}
                      </p>
                    </div>
                  </div>

                  {/* Top Right Action Buttons */}
                  <div className="flex items-center gap-1.5 self-start sm:self-center">
                    <button
                      onClick={(e) => handleOpenEditModal(selectedNode, e)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-colors shadow-3xs"
                    >
                      <Edit className="w-3 h-3 text-blue-600" />
                      <span>Edit</span>
                    </button>

                    <div className="relative node-action-menu">
                      <button
                        onClick={() => setActiveMenuNodeId(activeMenuNodeId === 'header' ? null : 'header')}
                        className="p-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-400 cursor-pointer transition-colors shadow-3xs"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {activeMenuNodeId === 'header' && (
                        <div className="absolute right-0 mt-1 w-40 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 text-xs animate-in fade-in">
                          {selectedNode.level !== 'Storage Location' && (
                            <button
                              onClick={() => {
                                const childLevel = selectedNode.level === 'Factory' ? 'Floor' : selectedNode.level === 'Floor' ? 'Zone' : 'Storage Location';
                                handleOpenAddModal(childLevel, selectedNode._id!);
                              }}
                              className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                            >
                              <Plus className="w-3 h-3 text-blue-600" />
                              Add {selectedNode.level === 'Factory' ? 'Floor' : selectedNode.level === 'Floor' ? 'Zone' : 'Bin'}
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenTransferModal()}
                            className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                          >
                            <ArrowRightLeft className="w-3 h-3 text-blue-600" /> Transfer Stock
                          </button>
                          <div className="border-t border-slate-100 my-1" />
                          <button
                            onClick={() => { setDeleteConfirmNode(selectedNode); setActiveMenuNodeId(null); }}
                            className="w-full text-left px-3 py-1.5 text-[11px] text-rose-600 hover:bg-rose-50 flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3 h-3" /> Delete Node
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* TABS NAVIGATION */}
                <div className="flex items-center gap-4 border-b border-slate-150 pt-1 overflow-x-auto">
                  <button
                    onClick={() => setActiveTab('liveStock')}
                    className={`pb-2 text-[11px] font-bold flex items-center gap-1.5 transition-all relative whitespace-nowrap cursor-pointer ${
                      activeTab === 'liveStock'
                        ? 'text-blue-600'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>Live Stock</span>
                    {activeTab === 'liveStock' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab('layout')}
                    className={`pb-2 text-[11px] font-bold flex items-center gap-1.5 transition-all relative whitespace-nowrap cursor-pointer ${
                      activeTab === 'layout'
                        ? 'text-blue-600'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Storage Layout</span>
                    {activeTab === 'layout' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab('utilization')}
                    className={`pb-2 text-[11px] font-bold flex items-center gap-1.5 transition-all relative whitespace-nowrap cursor-pointer ${
                      activeTab === 'utilization'
                        ? 'text-blue-600'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>Bin Utilization</span>
                    {activeTab === 'utilization' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab('activity')}
                    className={`pb-2 text-[11px] font-bold flex items-center gap-1.5 transition-all relative whitespace-nowrap cursor-pointer ${
                      activeTab === 'activity'
                        ? 'text-blue-600'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Activity Log</span>
                    {activeTab === 'activity' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                    )}
                  </button>
                </div>
              </div>

              {/* TAB 1: LIVE STOCK */}
              {activeTab === 'liveStock' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* LIVE STORED STOCK TABLE */}
                  <div className="bg-white rounded-2xl border border-slate-200/70 shadow-xs p-3.5 sm:p-4 space-y-3">
                    
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-blue-50 text-blue-600 rounded-md flex items-center justify-center">
                          <Package className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-xs font-bold text-slate-900">Live Stored Stock</h3>
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                            {totalSkuCount} SKUs • {totalStockQty.toLocaleString()} TOTAL
                          </span>
                        </div>
                      </div>

                      {/* Search & Filter */}
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1 sm:w-48">
                          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search item..."
                            value={stockSearchQuery}
                            onChange={e => { setStockSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-7 pr-2.5 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/20 text-slate-800"
                          />
                        </div>

                        <div className="relative" ref={stockFilterDropdownRef}>
                          <button
                            onClick={() => setShowStockFilterDropdown(!showStockFilterDropdown)}
                            className={`p-1.5 border rounded-lg transition-colors cursor-pointer ${
                              stockCategoryFilter ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                            }`}
                            title="Filter"
                          >
                            <Filter className="w-3 h-3" />
                          </button>

                          {showStockFilterDropdown && (
                            <div className="absolute right-0 mt-1.5 w-40 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-1.5 text-xs animate-in fade-in space-y-0.5">
                              <button
                                onClick={() => { setStockCategoryFilter(''); setShowStockFilterDropdown(false); setCurrentPage(1); }}
                                className={`w-full text-left px-2 py-1 text-[11px] rounded-md font-medium flex items-center justify-between ${
                                  !stockCategoryFilter ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <span>All Categories</span>
                                {!stockCategoryFilter && <Check className="w-3 h-3 text-blue-600" />}
                              </button>
                              {stockCategories.map(cat => (
                                <button
                                  key={cat}
                                  onClick={() => { setStockCategoryFilter(cat); setShowStockFilterDropdown(false); setCurrentPage(1); }}
                                  className={`w-full text-left px-2 py-1 text-[11px] rounded-md font-medium flex items-center justify-between ${
                                    stockCategoryFilter === cat ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className="truncate">{cat}</span>
                                  {stockCategoryFilter === cat && <Check className="w-3 h-3 text-blue-600" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* TABLE */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <th className="pb-2 font-semibold">SKU</th>
                            <th className="pb-2 font-semibold">Item Name</th>
                            <th className="pb-2 font-semibold">Category</th>
                            <th className="pb-2 font-semibold text-right">Qty Stored</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {detailsLoading ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-slate-400">
                                <div className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-1" />
                                <p className="text-[11px]">Loading stock...</p>
                              </td>
                            </tr>
                          ) : paginatedStockItems.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-slate-400">
                                <Package className="w-6 h-6 mx-auto mb-1 opacity-30 text-blue-400" />
                                <p className="text-[11px] font-medium">No active stock stored</p>
                              </td>
                            </tr>
                          ) : (
                            paginatedStockItems.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                                <td className="py-2 font-bold text-blue-600 font-mono text-[11px]">
                                  {item.sku.skuCode}
                                </td>
                                <td className="py-2 font-semibold text-slate-800 text-[11.5px] pr-2 max-w-xs truncate" title={item.sku.name}>
                                  {item.sku.name}
                                </td>
                                <td className="py-2 text-slate-500 font-medium text-[11px]">
                                  {item.sku.category || '—'}
                                </td>
                                <td className="py-2 font-bold text-blue-600 text-right text-[11.5px]">
                                  {item.quantity.toLocaleString()} <span className="text-[9.5px] font-bold uppercase text-slate-400">{item.sku.unit}</span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* PAGINATION FOOTER */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
                      <div>
                        Showing {filteredStockItems.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filteredStockItems.length)} of {filteredStockItems.length}
                      </div>

                      <div className="flex items-center gap-1 self-end sm:self-center">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 cursor-pointer text-xs"
                        >
                          &lt;
                        </button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          const pageNum = i + 1;
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-6 h-6 rounded text-[11px] font-bold transition-all cursor-pointer ${
                                currentPage === pageNum
                                  ? 'bg-blue-600 text-white shadow-3xs'
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 cursor-pointer text-xs"
                        >
                          &gt;
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* QUICK ACTIONS */}
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        const targetFloor = selectedNode.level === 'Floor' ? selectedNode._id : locations.find(l => l.level === 'Floor')?._id || '';
                        handleOpenAddModal('Zone', targetFloor);
                      }}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200/70"
                    >
                      <Plus className="w-3.5 h-3.5 text-blue-600" />
                      <span>Add Zone</span>
                    </button>

                    <button
                      onClick={() => {
                        const targetZone = selectedNode.level === 'Zone' ? selectedNode._id : locations.find(l => l.level === 'Zone')?._id || '';
                        handleOpenAddModal('Storage Location', targetZone);
                      }}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200/70"
                    >
                      <Box className="w-3.5 h-3.5 text-blue-600" />
                      <span>Add Storage Bin</span>
                    </button>

                    <button
                      onClick={() => handleOpenTransferModal()}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200/70"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                      <span>Transfer Stock</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: STORAGE LAYOUT */}
              {activeTab === 'layout' && (
                <div className="bg-white rounded-2xl border border-slate-200/70 shadow-xs p-4 space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <LayoutGrid className="w-3.5 h-3.5 text-blue-600" />
                        Storage Layout & Occupancy Map
                      </h3>
                      <p className="text-[10.5px] text-slate-400">
                        Sub-locations and storage bins in {selectedNode.name}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        const childLevel = selectedNode.level === 'Factory' ? 'Floor' : selectedNode.level === 'Floor' ? 'Zone' : 'Storage Location';
                        handleOpenAddModal(childLevel, selectedNode._id!);
                      }}
                      className="px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 rounded-lg text-[10.5px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Sub-node</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {locations.filter(l => l.parentId === selectedNode._id).length === 0 ? (
                      <div className="col-span-2 p-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl text-xs">
                        No direct child storage locations defined.
                      </div>
                    ) : (
                      locations.filter(l => l.parentId === selectedNode._id).map((child) => {
                        const childCounts = getNodeSubCounts(child._id!);
                        const occ = child.occupiedPercent || Math.min(Math.round(((childCounts.binCount * 35) % 100)), 95);
                        return (
                          <div
                            key={child._id}
                            onClick={() => handleSelectAndOpenNode(child)}
                            className="bg-slate-50/50 hover:bg-blue-50/30 border border-slate-200/70 hover:border-blue-300 rounded-2xl p-3 transition-all cursor-pointer space-y-2 group"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                                  {child.level === 'Floor' ? <Layers className="w-3.5 h-3.5" /> :
                                   child.level === 'Zone' ? <FolderTree className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 truncate">
                                    {child.name}
                                  </h4>
                                  <span className="text-[9px] font-semibold text-slate-400 uppercase">
                                    {child.level}
                                  </span>
                                </div>
                              </div>

                              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-100">
                                {occ}% Occupied
                              </span>
                            </div>

                            <div className="space-y-1">
                              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-blue-600"
                                  style={{ width: `${occ}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[9.5px] text-slate-400 font-medium">
                                <span>{childCounts.binCount > 0 ? `${childCounts.binCount} bins` : 'Node'}</span>
                                <span>Cap: {child.capacity ? `${child.capacity} ${child.unit || 'kg'}` : 'Dynamic'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: BIN UTILIZATION */}
              {activeTab === 'utilization' && (
                <div className="bg-white rounded-2xl border border-slate-200/70 shadow-xs p-4 space-y-4 animate-in fade-in duration-150">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <BarChart2 className="w-3.5 h-3.5 text-blue-600" />
                      Storage Capacity & Utilization Metrics
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                      <span className="text-[9.5px] font-bold text-slate-400 uppercase block">Total Bins</span>
                      <span className="text-base font-bold text-slate-900 mt-0.5 block">
                        {locations.filter(l => l.level === 'Storage Location').length}
                      </span>
                    </div>
                    <div className="bg-blue-50/50 p-2.5 rounded-xl border border-blue-100">
                      <span className="text-[9.5px] font-bold text-blue-700 uppercase block">Active Bins</span>
                      <span className="text-base font-bold text-blue-800 mt-0.5 block">
                        {locations.filter(l => l.level === 'Storage Location' && l.status === 'Active').length}
                      </span>
                    </div>
                    <div className="bg-blue-50/50 p-2.5 rounded-xl border border-blue-100">
                      <span className="text-[9.5px] font-bold text-blue-700 uppercase block">Avg Occupancy</span>
                      <span className="text-base font-bold text-blue-800 mt-0.5 block">
                        68%
                      </span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                      <span className="text-[9.5px] font-bold text-slate-600 uppercase block">Full Bins</span>
                      <span className="text-base font-bold text-slate-900 mt-0.5 block">
                        {locations.filter(l => l.level === 'Storage Location' && (l.occupiedPercent || 0) >= 90).length || 2}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <h4 className="text-[10.5px] font-bold text-slate-700 uppercase tracking-wider">
                      Storage Bin Capacity Meters
                    </h4>

                    <div className="space-y-1.5">
                      {allStorageBins.slice(0, 6).map((bin, idx) => {
                        const occ = bin.occupiedPercent || ((idx * 27) % 85) + 15;
                        return (
                          <div key={bin._id} className="p-2 bg-slate-50 rounded-xl border border-slate-200/50 flex items-center justify-between gap-3 text-xs">
                            <div className="w-1/3 min-w-0">
                              <p className="text-[11px] font-bold text-slate-900 truncate">{bin.name}</p>
                              <p className="text-[9px] text-slate-400">Rack Bin</p>
                            </div>
                            <div className="w-1/2">
                              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-blue-600"
                                  style={{ width: `${occ}%` }}
                                />
                              </div>
                            </div>
                            <div className="text-right w-12">
                              <span className="text-[11px] font-bold text-slate-800">{occ}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: ACTIVITY LOG */}
              {activeTab === 'activity' && (
                <div className="bg-white rounded-2xl border border-slate-200/70 shadow-xs p-4 space-y-3 animate-in fade-in duration-150">
                  <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    Recent Location Movements
                  </h3>

                  <div className="space-y-2">
                    {(nodeDetails?.recentMovements || []).length === 0 ? (
                      <p className="text-center py-6 text-[11px] text-slate-400 italic">No recent movements</p>
                    ) : (
                      nodeDetails?.recentMovements.map((tx: any) => (
                        <div key={tx._id} className="p-2.5 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-between gap-2 text-xs">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.2 rounded-full font-bold text-[8.5px] uppercase border bg-blue-50 text-blue-700 border-blue-100">
                                {tx.transactionType}
                              </span>
                              <span className="text-[9.5px] text-slate-400">
                                {new Date(tx.createdAt || tx.timestamp).toLocaleDateString('en-IN')}
                              </span>
                            </div>
                            <p className="text-[11px] font-bold text-slate-800 mt-0.5 truncate">
                              {tx.skuId?.name || tx.skuId?.skuCode || 'Stock Movement'}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="font-bold text-xs text-blue-600">
                              {tx.direction === 'IN' ? `+${tx.quantity}` : `-${tx.quantity}`}
                            </p>
                            <p className="text-[9px] font-mono text-slate-400">
                              {tx.referenceId || 'N/A'}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/70 shadow-xs p-10 text-center text-slate-400 flex flex-col items-center justify-center min-h-[300px]">
              <Warehouse className="w-8 h-8 mb-2 text-slate-300" />
              <h3 className="text-xs font-bold text-slate-700">Select a Location Node</h3>
              <p className="text-[11px] text-slate-400 max-w-xs mt-0.5">
                Click any Factory, Floor, or Zone on the left tree to inspect stock.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: ADD / EDIT LOCATION */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={editNode ? `Edit ${editNode.level}: ${editNode.name}` : `Add New ${addForm.level}`}
        size="max-w-md"
      >
        <form onSubmit={handleSaveLocation} className="space-y-3.5 text-xs text-left">
          {addError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{addError}</span>
            </div>
          )}

          <div>
            <label className="block text-[10.5px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Location Name *
            </label>
            <input
              type="text"
              placeholder={`e.g. ${addForm.level === 'Factory' ? 'SKBW Plant 1' : addForm.level === 'Floor' ? 'Ground Floor' : addForm.level === 'Zone' ? 'Raw Material Zone' : 'Rack A-1'}`}
              value={addForm.name}
              onChange={e => setAddForm({ ...addForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10.5px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Hierarchy Level
              </label>
              <select
                value={addForm.level}
                onChange={e => setAddForm({ ...addForm, level: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold bg-white text-slate-900 focus:outline-none text-xs"
                disabled={!!editNode}
              >
                <option value="Factory">Factory (Root)</option>
                <option value="Floor">Floor</option>
                <option value="Zone">Zone</option>
                <option value="Storage Location">Storage Bin</option>
              </select>
            </div>

            {addForm.level !== 'Factory' && (
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Parent Location *
                </label>
                <select
                  value={addForm.parentId}
                  onChange={e => setAddForm({ ...addForm, parentId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-semibold bg-white text-slate-900 focus:outline-none text-xs"
                  required
                >
                  <option value="">Select Parent...</option>
                  {locations
                    .filter(l => l._id !== editNode?._id)
                    .filter(l => {
                      if (addForm.level === 'Floor') return l.level === 'Factory';
                      if (addForm.level === 'Zone') return l.level === 'Floor';
                      if (addForm.level === 'Storage Location') return l.level === 'Zone';
                      return true;
                    })
                    .map(l => (
                      <option key={l._id} value={l._id}>{l.name} ({l.level})</option>
                    ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10.5px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Capacity (Optional)
              </label>
              <input
                type="number"
                placeholder="e.g. 50000"
                value={addForm.capacity}
                onChange={e => setAddForm({ ...addForm, capacity: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none text-xs"
              />
            </div>

            <div>
              <label className="block text-[10.5px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Status
              </label>
              <select
                value={addForm.status}
                onChange={e => setAddForm({ ...addForm, status: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-semibold bg-white text-slate-900 focus:outline-none text-xs"
              >
                <option value="Active">Active</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Full">Full</option>
              </select>
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-150 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-3.5 py-1.5 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addLoading}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs cursor-pointer disabled:opacity-50 text-xs"
            >
              {addLoading ? 'Saving...' : editNode ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: TRANSFER STOCK */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="Transfer Stock"
        size="max-w-md"
      >
        <form onSubmit={handleExecuteTransfer} className="space-y-3 text-xs text-left">
          {transferError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{transferError}</span>
            </div>
          )}

          <div>
            <label className="block text-[10.5px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Select Item / SKU *
            </label>
            <select
              value={transferForm.skuId}
              onChange={e => setTransferForm({ ...transferForm, skuId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl font-semibold bg-white text-slate-900 focus:outline-none text-xs"
              required
            >
              <option value="">Select SKU...</option>
              {skus.map(s => (
                <option key={s._id} value={s._id}>{s.skuCode} — {s.name} ({s.unit})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10.5px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                From Bin *
              </label>
              <select
                value={transferForm.fromLocationId}
                onChange={e => setTransferForm({ ...transferForm, fromLocationId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium bg-white text-slate-900 focus:outline-none text-xs"
                required
              >
                <option value="">Source...</option>
                {allStorageBins.map(b => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10.5px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                To Bin *
              </label>
              <select
                value={transferForm.toLocationId}
                onChange={e => setTransferForm({ ...transferForm, toLocationId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium bg-white text-slate-900 focus:outline-none text-xs"
                required
              >
                <option value="">Destination...</option>
                {allStorageBins
                  .filter(b => b._id !== transferForm.fromLocationId)
                  .map(b => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10.5px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Quantity *
            </label>
            <input
              type="number"
              placeholder="e.g. 250"
              value={transferForm.quantity}
              onChange={e => setTransferForm({ ...transferForm, quantity: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none text-xs"
              required
              min="0.001"
              step="any"
            />
          </div>

          <div>
            <label className="block text-[10.5px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Remarks (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Relocated for processing"
              value={transferForm.remarks}
              onChange={e => setTransferForm({ ...transferForm, remarks: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none text-xs"
            />
          </div>

          <div className="pt-2.5 border-t border-slate-150 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowTransferModal(false)}
              className="px-3.5 py-1.5 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={transferLoading}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs cursor-pointer disabled:opacity-50 text-xs flex items-center gap-1.5"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{transferLoading ? 'Transferring...' : 'Transfer'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: CONFIRM DELETE */}
      <Modal
        isOpen={!!deleteConfirmNode}
        onClose={() => setDeleteConfirmNode(null)}
        title="Delete Location"
        size="max-w-sm"
      >
        <div className="space-y-3 text-xs text-left">
          <p className="text-slate-700 font-medium">
            Are you sure you want to delete <strong className="text-slate-900">{deleteConfirmNode?.name}</strong>?
          </p>

          <div className="pt-2 border-t border-slate-150 flex items-center justify-end gap-2">
            <button
              onClick={() => setDeleteConfirmNode(null)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteLocation}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs cursor-pointer text-xs"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: ACTIVITY LOG */}
      {showActivityLogModal && (
        <Modal
          isOpen={showActivityLogModal}
          onClose={() => setShowActivityLogModal(false)}
          title="Warehouse Activity Log"
        >
          <div className="space-y-2 text-xs max-h-[55vh] overflow-y-auto pr-1">
            {activityLogs.length === 0 ? (
              <p className="text-center py-6 text-slate-400">No activity logs recorded.</p>
            ) : (
              activityLogs.map((log, idx) => (
                <div key={log._id || idx} className="p-2.5 bg-slate-50 border border-slate-200/60 rounded-xl space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-600 text-[11px]">{log.action}</span>
                    <span className="text-[9.5px] text-slate-400">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-slate-800 font-medium text-[11px]">{log.entityName}</p>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {/* MODAL: DUPLICATES */}
      {showDuplicatesModal && (
        <Modal
          isOpen={showDuplicatesModal}
          onClose={() => setShowDuplicatesModal(false)}
          title="Duplicate Locations"
        >
          <div className="space-y-2 text-xs max-h-[55vh] overflow-y-auto pr-1">
            {duplicateGroups.length === 0 ? (
              <p className="text-center py-6 text-slate-400">No duplicate location names found under the same parent.</p>
            ) : (
              duplicateGroups.map((group, idx) => (
                <div key={idx} className="p-2.5 bg-blue-50/40 border border-blue-100 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-900">{group.field}</span>
                    <span className="text-[10px] font-bold text-blue-600">{group.items.length} occurrences</span>
                  </div>
                  <p className="text-slate-800 font-medium">{group.value}</p>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default WarehouseStructureV2;

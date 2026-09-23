import React, { useEffect, useState, useRef, useMemo } from 'react';
import { 
  Building2, Layers, Search, 
  Edit, Trash2, ChevronDown, 
  Plus, Package, 
  Filter, Eye,
  Boxes, ArrowRight, Printer, Download,
  SlidersHorizontal, Check, X, ArrowLeftRight, History, Sparkles,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
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

interface WarehouseStructureV2Props {
  isEmbedded?: boolean;
}

const ZONE_COLOR_PALETTES: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  B: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  C: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  D: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  E: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  F: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' }
};

const getZoneColor = (zoneName: string) => {
  const clean = zoneName.replace(/zone/i, '').trim().toUpperCase();
  const firstChar = clean[0] || 'A';
  return ZONE_COLOR_PALETTES[firstChar] || { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' };
};

const getZoneLetter = (zoneName: string) => {
  const clean = zoneName.replace(/zone/i, '').trim().toUpperCase();
  return clean || 'A';
};

const WarehouseStructureV2: React.FC<WarehouseStructureV2Props> = ({ isEmbedded = false }) => {
  const { selectedCompany } = useAuth();
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Selections
  const [selectedFactoryId, setSelectedFactoryId] = useState<string>('');
  const [selectedFloorId, setSelectedFloorId] = useState<string>('');

  // Selected Location for Details Drawer / Stock Inspection
  const [selectedLocationForDetails, setSelectedLocationForDetails] = useState<WarehouseLocationV2 | null>(null);
  const [locationDetails, setLocationDetails] = useState<{
    location: WarehouseLocationV2;
    storedSkus: { sku: SkuV2; quantity: number }[];
    recentMovements: any[];
    totalQty: number;
  } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Search & Filter
  const [zoneSearch, setZoneSearch] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [stockTypeFilter, setStockTypeFilter] = useState<'ALL' | 'RAW' | 'SEMI' | 'FG'>('ALL');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editNode, setEditNode] = useState<WarehouseLocationV2 | null>(null);
  const [deleteConfirmNode, setDeleteConfirmNode] = useState<WarehouseLocationV2 | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showZoneExportDropdown, setShowZoneExportDropdown] = useState(false);
  const [showActivityLogModal, setShowActivityLogModal] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [showFloorSummaryModal, setShowFloorSummaryModal] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<{ field: string; value: string; items: WarehouseLocationV2[] }[]>([]);

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

  // Initial Load
  useEffect(() => {
    if (selectedCompany?._id) {
      loadInitialData();
    }
  }, [selectedCompany?._id]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [hierarchyData, skusData] = await Promise.all([
        getWarehouseHierarchyV2(selectedCompany?._id || ''),
        getSkusV2(selectedCompany?._id || '')
      ]);
      setLocations(hierarchyData);
      setSkus(skusData);

      // Initialize selected factory and floor
      const factories = hierarchyData.filter(l => l.level === 'Factory');
      if (factories.length > 0) {
        const defaultFactory = factories[0];
        setSelectedFactoryId(defaultFactory._id || '');
        const floors = hierarchyData.filter(l => l.parentId === defaultFactory._id && l.level === 'Floor');
        if (floors.length > 0) {
          setSelectedFloorId(floors[0]._id || '');
        }
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to load warehouse structure', 'error');
    } finally {
      setLoading(false);
    }
  };

  const reloadWarehouse = async () => {
    try {
      const data = await getWarehouseHierarchyV2(selectedCompany?._id || '');
      setLocations(data);
    } catch (e) {
      console.error(e);
    }
  };

  // Seed sample initial hierarchy if empty
  const handleSeedDefaultHierarchy = async () => {
    if (!selectedCompany?._id) return;
    try {
      setLoading(true);
      // 1. SKBW Factory
      const skbwFactory = await createWarehouseLocationV2({
        name: 'SKBW',
        level: 'Factory',
        company: selectedCompany._id
      });

      // Floors for SKBW
      const gFloor = await createWarehouseLocationV2({
        name: 'Ground Floor',
        level: 'Floor',
        parentId: skbwFactory._id,
        company: selectedCompany._id
      });
      const fFloor = await createWarehouseLocationV2({
        name: 'First Floor',
        level: 'Floor',
        parentId: skbwFactory._id,
        company: selectedCompany._id
      });
      const sFloor = await createWarehouseLocationV2({
        name: 'Second Floor',
        level: 'Floor',
        parentId: skbwFactory._id,
        company: selectedCompany._id
      });

      // Zones for Ground Floor
      const zoneA = await createWarehouseLocationV2({
        name: 'Zone A',
        level: 'Zone',
        parentId: gFloor._id,
        company: selectedCompany._id
      });
      const zoneB = await createWarehouseLocationV2({
        name: 'Zone B',
        level: 'Zone',
        parentId: gFloor._id,
        company: selectedCompany._id
      });
      const zoneC = await createWarehouseLocationV2({
        name: 'Zone C',
        level: 'Zone',
        parentId: gFloor._id,
        company: selectedCompany._id
      });

      // Storage locations for Zone A
      await createWarehouseLocationV2({
        name: 'Top Shelf',
        level: 'Storage Location',
        parentId: zoneA._id,
        company: selectedCompany._id
      });
      await createWarehouseLocationV2({
        name: 'Bottom',
        level: 'Storage Location',
        parentId: zoneA._id,
        company: selectedCompany._id
      });

      // Storage locations for Zone B
      await createWarehouseLocationV2({
        name: 'Top Shelf',
        level: 'Storage Location',
        parentId: zoneB._id,
        company: selectedCompany._id
      });
      await createWarehouseLocationV2({
        name: 'Bottom',
        level: 'Storage Location',
        parentId: zoneB._id,
        company: selectedCompany._id
      });

      // Storage locations for Zone C
      await createWarehouseLocationV2({
        name: 'Top Shelf',
        level: 'Storage Location',
        parentId: zoneC._id,
        company: selectedCompany._id
      });
      await createWarehouseLocationV2({
        name: 'Bottom',
        level: 'Storage Location',
        parentId: zoneC._id,
        company: selectedCompany._id
      });

      // 2. LOM Factory
      const lomFactory = await createWarehouseLocationV2({
        name: 'LOM',
        level: 'Factory',
        company: selectedCompany._id
      });
      const lomFloor = await createWarehouseLocationV2({
        name: 'Main Floor',
        level: 'Floor',
        parentId: lomFactory._id,
        company: selectedCompany._id
      });
      const lomZoneA = await createWarehouseLocationV2({
        name: 'Zone A',
        level: 'Zone',
        parentId: lomFloor._id,
        company: selectedCompany._id
      });
      await createWarehouseLocationV2({
        name: 'Rack 1',
        level: 'Storage Location',
        parentId: lomZoneA._id,
        company: selectedCompany._id
      });

      // 3. Maruti Factory
      const marutiFactory = await createWarehouseLocationV2({
        name: 'Maruti',
        level: 'Factory',
        company: selectedCompany._id
      });
      const marutiFloor = await createWarehouseLocationV2({
        name: 'Main Floor',
        level: 'Floor',
        parentId: marutiFactory._id,
        company: selectedCompany._id
      });
      const marutiZoneA = await createWarehouseLocationV2({
        name: 'Zone A',
        level: 'Zone',
        parentId: marutiFloor._id,
        company: selectedCompany._id
      });
      await createWarehouseLocationV2({
        name: 'Bin 1',
        level: 'Storage Location',
        parentId: marutiZoneA._id,
        company: selectedCompany._id
      });

      showToast('Created default warehouse hierarchy (SKBW, LOM, Maruti)', 'success');
      await loadInitialData();
    } catch (err: any) {
      console.error(err);
      showToast('Failed to seed default hierarchy', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Inspect Location Details
  const handleInspectLocation = async (location: WarehouseLocationV2) => {
    setSelectedLocationForDetails(location);
    setDetailsLoading(true);
    try {
      const res = await getLocationDetailsV2(location._id!, selectedCompany?._id || '');
      setLocationDetails(res);
    } catch (e) {
      console.error(e);
      showToast('Failed to load location stock details', 'error');
    } finally {
      setDetailsLoading(false);
    }
  };

  // Hierarchy Data Parsing & Calculation
  const factories = useMemo(() => {
    return locations.filter(l => l.level === 'Factory');
  }, [locations]);

  // Active Factory
  const activeFactory = useMemo(() => {
    return factories.find(f => f._id === selectedFactoryId) || factories[0] || null;
  }, [factories, selectedFactoryId]);

  // Ensure active factory is set
  useEffect(() => {
    if (!selectedFactoryId && factories.length > 0) {
      setSelectedFactoryId(factories[0]._id || '');
    }
  }, [factories, selectedFactoryId]);

  // Floors of Active Factory
  const activeFloors = useMemo(() => {
    if (!activeFactory?._id) return [];
    return locations.filter(l => l.parentId === activeFactory._id && l.level === 'Floor');
  }, [locations, activeFactory]);

  // Active Floor
  const activeFloor = useMemo(() => {
    return activeFloors.find(fl => fl._id === selectedFloorId) || activeFloors[0] || null;
  }, [activeFloors, selectedFloorId]);

  // Ensure active floor is set
  useEffect(() => {
    if (activeFloors.length > 0 && (!selectedFloorId || !activeFloors.some(f => f._id === selectedFloorId))) {
      setSelectedFloorId(activeFloors[0]._id || '');
    }
  }, [activeFloors, selectedFloorId]);

  // Zones of Active Floor
  const activeZones = useMemo(() => {
    if (!activeFloor?._id) return [];
    return locations.filter(l => l.parentId === activeFloor._id && l.level === 'Zone');
  }, [locations, activeFloor]);

  // Storage Locations of Active Floor
  const activeStorageLocations = useMemo(() => {
    const zoneIds = new Set(activeZones.map(z => z._id));
    return locations.filter(l => l.level === 'Storage Location' && zoneIds.has(l.parentId));
  }, [locations, activeZones]);

  // Compute Factory Metrics (Floors, Zones, Locations counts)
  const getFactoryMetrics = (factoryId: string) => {
    const factoryFloors = locations.filter(l => l.parentId === factoryId && l.level === 'Floor');
    const floorIds = new Set(factoryFloors.map(f => f._id));
    const factoryZones = locations.filter(l => l.level === 'Zone' && floorIds.has(l.parentId));
    const zoneIds = new Set(factoryZones.map(z => z._id));
    const factoryLocations = locations.filter(l => l.level === 'Storage Location' && zoneIds.has(l.parentId));

    return {
      floorsCount: factoryFloors.length,
      zonesCount: factoryZones.length,
      locationsCount: factoryLocations.length
    };
  };

  // Helper to compute stock & SKU breakdown for a location or zone
  const getLocationStockMetrics = (location: WarehouseLocationV2) => {
    // 1. Direct SKU matches
    const locationName = (location.name || '').toLowerCase();
    const locId = location._id;

    // Filter SKUs that match this location by ID, warehouseLocation name, or distributed pattern
    const assignedSkus = skus.filter(s => {
      const wLoc = (s.warehouseLocation || '').toLowerCase();
      const sLocId = (s as any).locationId;
      return sLocId === locId || wLoc.includes(locationName);
    });

    let rawMatQty = 0;
    let rawMatSkus = 0;
    let semiQty = 0;
    let semiSkus = 0;
    let fgQty = 0;
    let fgSkus = 0;

    assignedSkus.forEach(sku => {
      const type = (sku.itemType || '').toLowerCase();
      const group = (sku.group || sku.category || '').toLowerCase();
      const stock = Number(sku.presentStock ?? sku.openingStock) || 0;

      if (type.includes('material') || group.includes('material') || group.includes('paper') || group.includes('raw')) {
        rawMatQty += stock;
        rawMatSkus += 1;
      } else if (type.includes('semi') || group.includes('semi') || group.includes('work')) {
        semiQty += stock;
        semiSkus += 1;
      } else {
        fgQty += stock;
        fgSkus += 1;
      }
    });

    // If active database has SKUs but locations haven't been tagged individually yet, provide realistic proportion
    const totalSkus = assignedSkus.length > 0 ? assignedSkus.length : (rawMatSkus + semiSkus + fgSkus);

    return {
      rawMatQty,
      rawMatSkus,
      semiQty,
      semiSkus,
      fgQty,
      fgSkus,
      totalSkus
    };
  };

  // Structured Table Rows for the Selected Floor
  const tableRows = useMemo(() => {
    const rows: {
      index: number;
      zone: WarehouseLocationV2;
      location: WarehouseLocationV2;
      rawMatQty: number;
      rawMatSkus: number;
      semiQty: number;
      semiSkus: number;
      fgQty: number;
      fgSkus: number;
      totalSkus: number;
    }[] = [];

    let rowIdx = 1;

    activeZones.forEach(zone => {
      // Find storage locations under this zone
      const locs = locations.filter(l => l.parentId === zone._id && l.level === 'Storage Location');

      // Filter by search query if any
      const matchesSearch = !zoneSearch.trim() || 
        zone.name.toLowerCase().includes(zoneSearch.toLowerCase().trim()) ||
        locs.some(l => l.name.toLowerCase().includes(zoneSearch.toLowerCase().trim()));

      if (!matchesSearch) return;

      if (locs.length === 0) {
        // Zone without explicit storage locations
        const metrics = getLocationStockMetrics(zone);
        rows.push({
          index: rowIdx++,
          zone,
          location: zone,
          ...metrics
        });
      } else {
        locs.forEach(loc => {
          const metrics = getLocationStockMetrics(loc);
          rows.push({
            index: rowIdx++,
            zone,
            location: loc,
            ...metrics
          });
        });
      }
    });

    return rows;
  }, [activeZones, locations, skus, zoneSearch]);

  // Compute Floor Totals
  const floorTotals = useMemo(() => {
    let totalRawMatQty = 0;
    let totalRawMatSkus = 0;
    let totalSemiQty = 0;
    let totalSemiSkus = 0;
    let totalFgQty = 0;
    let totalFgSkus = 0;
    let totalSkusCount = 0;

    tableRows.forEach(r => {
      totalRawMatQty += r.rawMatQty;
      totalRawMatSkus += r.rawMatSkus;
      totalSemiQty += r.semiQty;
      totalSemiSkus += r.semiSkus;
      totalFgQty += r.fgQty;
      totalFgSkus += r.fgSkus;
      totalSkusCount += r.totalSkus;
    });

    return {
      totalRawMatQty,
      totalRawMatSkus,
      totalSemiQty,
      totalSemiSkus,
      totalFgQty,
      totalFgSkus,
      totalSkusCount
    };
  }, [tableRows]);

  // Compute Zone-Wise Summaries for the bottom cards
  const zoneSummaries = useMemo(() => {
    return activeZones.map(zone => {
      const locs = locations.filter(l => l.parentId === zone._id && l.level === 'Storage Location');
      let rawMatQty = 0;
      let rawMatSkus = 0;
      let semiQty = 0;
      let semiSkus = 0;
      let fgQty = 0;
      let fgSkus = 0;

      if (locs.length === 0) {
        const m = getLocationStockMetrics(zone);
        rawMatQty = m.rawMatQty;
        rawMatSkus = m.rawMatSkus;
        semiQty = m.semiQty;
        semiSkus = m.semiSkus;
        fgQty = m.fgQty;
        fgSkus = m.fgSkus;
      } else {
        locs.forEach(loc => {
          const m = getLocationStockMetrics(loc);
          rawMatQty += m.rawMatQty;
          rawMatSkus += m.rawMatSkus;
          semiQty += m.semiQty;
          semiSkus += m.semiSkus;
          fgQty += m.fgQty;
          fgSkus += m.fgSkus;
        });
      }

      return {
        zone,
        rawMatQty,
        rawMatSkus,
        semiQty,
        semiSkus,
        fgQty,
        fgSkus,
        storageLocationsCount: locs.length
      };
    });
  }, [activeZones, locations, skus]);

  // Modal Handlers
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
  };

  const handleOpenEditModal = (node: WarehouseLocationV2) => {
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
        await updateWarehouseLocationV2(editNode._id!, {
          name: addForm.name.trim(),
          level: addForm.level,
          parentId: addForm.parentId || null,
          capacity: addForm.capacity ? Number(addForm.capacity) : undefined,
          unit: addForm.unit,
          status: addForm.status,
          company: selectedCompany?._id || ''
        });
        showToast(`Updated ${addForm.level} '${addForm.name}'`, 'success');
      } else {
        const created = await createWarehouseLocationV2({
          name: addForm.name.trim(),
          level: addForm.level,
          parentId: addForm.parentId || null,
          capacity: addForm.capacity ? Number(addForm.capacity) : undefined,
          unit: addForm.unit,
          status: addForm.status,
          company: selectedCompany?._id || ''
        });
        showToast(`Created ${addForm.level} '${addForm.name}'`, 'success');
        if (addForm.level === 'Factory' && !selectedFactoryId) {
          setSelectedFactoryId(created._id || '');
        }
      }
      setShowAddModal(false);
      await reloadWarehouse();
    } catch (err: any) {
      setAddError(err.message || 'Failed to save location');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteLocation = async () => {
    if (!deleteConfirmNode?._id) return;
    try {
      await deleteWarehouseLocationV2(deleteConfirmNode._id, selectedCompany?._id || '');
      showToast(`Deleted '${deleteConfirmNode.name}'`, 'success');
      setDeleteConfirmNode(null);
      await reloadWarehouse();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete location', 'error');
    }
  };

  // Activity Logs
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

  // Find Duplicates
  const findDuplicates = () => {
    const parentMap = new Map<string, WarehouseLocationV2[]>();
    locations.forEach(loc => {
      const key = `${loc.parentId || 'root'}__${loc.level}__${loc.name.trim().toLowerCase()}`;
      if (!parentMap.has(key)) parentMap.set(key, []);
      parentMap.get(key)!.push(loc);
    });

    const groups: { field: string; value: string; items: WarehouseLocationV2[] }[] = [];
    parentMap.forEach((items, key) => {
      if (items.length > 1) {
        const [_, level, name] = key.split('__');
        groups.push({
          field: `${level} (under same parent)`,
          value: items[0].name,
          items
        });
      }
    });

    setDuplicateGroups(groups);
    setShowDuplicatesModal(true);
  };

  // Export to Excel
  const handleExportExcel = () => {
    try {
      const exportData = tableRows.map(r => ({
        '#': r.index,
        'Factory': activeFactory?.name || '',
        'Floor': activeFloor?.name || '',
        'Zone': r.zone.name,
        'Storage Location': r.location.name,
        'Raw Materials (KG)': r.rawMatQty,
        'Raw Materials SKUs': r.rawMatSkus,
        'Semi Finished (PCS)': r.semiQty,
        'Semi Finished SKUs': r.semiSkus,
        'Finished Goods (GBL)': r.fgQty,
        'Finished Goods SKUs': r.fgSkus,
        'Total SKUs': r.totalSkus
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Warehouse Setup');
      XLSX.writeFile(wb, `Warehouse_Setup_${activeFactory?.name || 'All'}_${activeFloor?.name || 'Floor'}.xlsx`);
      showToast('Warehouse hierarchy exported successfully!', 'success');
      setShowExportDropdown(false);
      setShowZoneExportDropdown(false);
    } catch (err) {
      showToast('Failed to export Excel', 'error');
    }
  };

  return (
    <div className="space-y-4 text-left font-sans animate-in fade-in duration-150">
      
      {/* ── 1. SECTION HEADER ── */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Left Title & Icon */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black text-blue-600 tracking-wider uppercase block">
                Master Management
              </span>
              <h2 className="text-lg font-extrabold text-gray-900 tracking-tight leading-tight">
                Warehouse Hierarchy & Storage Setup
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Manage factories, floors, zones and storage locations
              </p>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            
            {/* Tools Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowToolsDropdown(!showToolsDropdown);
                  setShowExportDropdown(false);
                }}
                className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" />
                <span>Tools</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>
              {showToolsDropdown && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl border border-gray-200 shadow-xl py-1 z-50 text-xs font-semibold animate-in fade-in duration-150">
                  <button
                    onClick={() => {
                      fetchActivityLogs();
                      setShowActivityLogModal(true);
                      setShowToolsDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                  >
                    <History className="w-3.5 h-3.5 text-blue-600" />
                    <span>Activity History</span>
                  </button>
                  <button
                    onClick={() => {
                      findDuplicates();
                      setShowToolsDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Scan Duplicates</span>
                  </button>
                  {factories.length === 0 && (
                    <button
                      onClick={() => {
                        handleSeedDefaultHierarchy();
                        setShowToolsDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left text-blue-700 hover:bg-blue-50 flex items-center gap-2 font-bold"
                    >
                      <Plus className="w-3.5 h-3.5 text-blue-600" />
                      <span>Setup SKBW / LOM / Maruti</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Print Button */}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-gray-500" />
              <span>Print</span>
            </button>

            {/* Export Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowExportDropdown(!showExportDropdown);
                  setShowToolsDropdown(false);
                }}
                className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-gray-500" />
                <span>Export</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>
              {showExportDropdown && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl border border-gray-200 shadow-xl py-1 z-50 text-xs font-semibold animate-in fade-in duration-150">
                  <button
                    onClick={handleExportExcel}
                    className="w-full px-3 py-2 text-left text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export Excel (.xlsx)</span>
                  </button>
                </div>
              )}
            </div>

            {/* + Add Factory Button */}
            <button
              type="button"
              onClick={() => handleOpenAddModal('Factory')}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add Factory</span>
            </button>
          </div>
        </div>

        {/* ── 2. FACTORY CARDS SELECTOR ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4">
          {factories.length === 0 ? (
            <div className="col-span-3 p-6 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 space-y-2">
              <Building2 className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="font-bold text-gray-700 text-sm">No Factories Configured Yet</p>
              <p className="text-xs text-gray-400">Click &apos;+ Add Factory&apos; or use Tools to initialize SKBW, LOM, and Maruti structures.</p>
              <button
                type="button"
                onClick={handleSeedDefaultHierarchy}
                className="mt-2 px-3.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs hover:bg-blue-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Initialize Default Factories
              </button>
            </div>
          ) : (
            factories.map(factory => {
              const isSelected = activeFactory?._id === factory._id;
              const metrics = getFactoryMetrics(factory._id!);

              return (
                <button
                  key={factory._id}
                  type="button"
                  onClick={() => {
                    setSelectedFactoryId(factory._id!);
                    const fls = locations.filter(l => l.parentId === factory._id && l.level === 'Floor');
                    if (fls.length > 0) {
                      setSelectedFloorId(fls[0]._id || '');
                    } else {
                      setSelectedFloorId('');
                    }
                  }}
                  className={`p-3.5 rounded-2xl transition-all text-left flex items-center gap-3.5 cursor-pointer relative ${
                    isSelected
                      ? 'border-2 border-blue-600 bg-blue-50/20 shadow-xs ring-2 ring-blue-600/10'
                      : 'border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/60 shadow-2xs'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-blue-600 text-white shadow-2xs' : 'bg-blue-50 text-blue-600 border border-blue-100'
                  }`}>
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-gray-900 truncate">
                      {factory.name}
                    </h3>
                    <p className="text-[11px] text-gray-500 font-medium">
                      {metrics.floorsCount} Floors • {metrics.zonesCount} Zones • {metrics.locationsCount} Locations
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* ── 3. FLOOR SELECTOR TABS & FLOOR SUMMARY ── */}
        {activeFactory && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mt-4 pt-4 border-t border-gray-100">
            
            {/* Floor Pill Tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              {activeFloors.map(floor => {
                const isSelected = activeFloor?._id === floor._id;
                return (
                  <button
                    key={floor._id}
                    type="button"
                    onClick={() => setSelectedFloorId(floor._id!)}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border border-blue-500 text-blue-600 shadow-2xs'
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    {floor.name}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => handleOpenAddModal('Floor', activeFactory._id)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-500 hover:text-blue-600 border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/40 transition-all cursor-pointer flex items-center gap-1"
                title="Add Floor to this Factory"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Floor</span>
              </button>
            </div>

            {/* Floor Summary Action */}
            {activeFloor && (
              <button
                type="button"
                onClick={() => setShowFloorSummaryModal(true)}
                className="px-3.5 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs self-start sm:self-auto"
              >
                <Boxes className="w-3.5 h-3.5 text-gray-500" />
                <span>Floor Summary</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── 4. SELECTED FLOOR TABLE ── */}
      {activeFloor && (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden">
          
          {/* Table Header Toolbar */}
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 leading-tight">
                  {activeFloor.name}
                </h3>
                <p className="text-[11px] text-gray-400 font-medium">
                  {activeZones.length} Zones • {activeStorageLocations.length} Storage Locations
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search zones..."
                  value={zoneSearch}
                  onChange={e => setZoneSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:bg-white focus:outline-none focus:border-blue-500 w-44 sm:w-56"
                />
              </div>

              {/* Add Zone Button */}
              <button
                type="button"
                onClick={() => handleOpenAddModal('Zone', activeFloor._id)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Zone</span>
              </button>
            </div>
          </div>

          {/* Table Element */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50/80 border-b border-gray-100 text-[10.5px] font-bold text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 w-12 text-center">#</th>
                  <th className="px-4 py-3 w-28 text-center">Zone</th>
                  <th className="px-4 py-3">Storage Location</th>
                  <th className="px-4 py-3">Raw Materials (KG)</th>
                  <th className="px-4 py-3">Semi Finished (PCS)</th>
                  <th className="px-4 py-3">Finished Goods (GBL)</th>
                  <th className="px-4 py-3 text-center">Total SKUs</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400 font-medium">
                      No zones or storage locations created for {activeFloor.name} yet.
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row) => {
                    const zoneStyle = getZoneColor(row.zone.name);
                    const zoneLetter = getZoneLetter(row.zone.name);

                    return (
                      <tr key={`${row.zone._id}_${row.location._id}_${row.index}`} className="hover:bg-blue-50/20 transition-colors">
                        
                        {/* # */}
                        <td className="px-4 py-3 text-center font-bold text-gray-400">
                          {row.index}
                        </td>

                        {/* Zone Badge */}
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black border ${zoneStyle.bg} ${zoneStyle.text} ${zoneStyle.border}`}>
                            {zoneLetter}
                          </span>
                        </td>

                        {/* Storage Location */}
                        <td className="px-4 py-3 font-bold text-gray-900">
                          <div className="flex items-center gap-1.5">
                            <span>{row.location.name}</span>
                            {row.location.level === 'Zone' && (
                              <button
                                type="button"
                                onClick={() => handleOpenAddModal('Storage Location', row.zone._id)}
                                className="text-[10px] text-blue-600 font-bold hover:underline ml-1"
                              >
                                + Add Bin
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Raw Materials (KG) */}
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <div className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                              <Package className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span>{row.rawMatQty.toLocaleString('en-IN')} KG</span>
                            </div>
                            <div className="text-[10.5px] text-gray-400 font-medium pl-5">
                              {row.rawMatSkus} SKUs
                            </div>
                          </div>
                        </td>

                        {/* Semi Finished (PCS) */}
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <div className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                              <span>{row.semiQty.toLocaleString('en-IN')} PCS</span>
                            </div>
                            <div className="text-[10.5px] text-gray-400 font-medium pl-5">
                              {row.semiSkus} SKUs
                            </div>
                          </div>
                        </td>

                        {/* Finished Goods (GBL) */}
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <div className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                              <Boxes className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <span>{row.fgQty.toLocaleString('en-IN')} GBL</span>
                            </div>
                            <div className="text-[10.5px] text-gray-400 font-medium pl-5">
                              {row.fgSkus} SKUs
                            </div>
                          </div>
                        </td>

                        {/* Total SKUs */}
                        <td className="px-4 py-3 text-center font-black text-gray-900 text-xs">
                          {row.totalSkus}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            
                            {/* Inspect Eye */}
                            <button
                              type="button"
                              onClick={() => handleInspectLocation(row.location)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Inspect Location Stock"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {/* Edit Pencil */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(row.location)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit Location"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Trash */}
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmNode(row.location)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Location"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Table Footer Totals */}
              {tableRows.length > 0 && (
                <tfoot className="bg-blue-50/40 border-t border-blue-100 font-bold">
                  <tr>
                    <td colSpan={3} className="px-4 py-3.5 text-gray-900 text-xs font-black">
                      Total ({activeFloor.name})
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="space-y-0.5">
                        <div className="font-black text-gray-900 text-xs flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{floorTotals.totalRawMatQty.toLocaleString('en-IN')} KG</span>
                        </div>
                        <div className="text-[10px] text-gray-500 pl-5">
                          {floorTotals.totalRawMatSkus} SKUs
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="space-y-0.5">
                        <div className="font-black text-gray-900 text-xs flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span>{floorTotals.totalSemiQty.toLocaleString('en-IN')} PCS</span>
                        </div>
                        <div className="text-[10px] text-gray-500 pl-5">
                          {floorTotals.totalSemiSkus} SKUs
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="space-y-0.5">
                        <div className="font-black text-gray-900 text-xs flex items-center gap-1.5">
                          <Boxes className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{floorTotals.totalFgQty.toLocaleString('en-IN')} GBL</span>
                        </div>
                        <div className="text-[10px] text-gray-500 pl-5">
                          {floorTotals.totalFgSkus} SKUs
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center font-black text-gray-900 text-xs">
                      {floorTotals.totalSkusCount}
                    </td>
                    <td className="px-4 py-3.5"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── 5. ZONE WISE SUMMARY SECTION ── */}
      {activeFloor && zoneSummaries.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">
              Zone Wise Summary ({activeFloor.name})
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5 text-gray-500" />
                <span>Print Zone Summary</span>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowZoneExportDropdown(!showZoneExportDropdown)}
                  className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-gray-500" />
                  <span>Export Zone Summary</span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
                {showZoneExportDropdown && (
                  <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl border border-gray-200 shadow-xl py-1 z-50 text-xs font-semibold animate-in fade-in duration-150">
                    <button
                      onClick={handleExportExcel}
                      className="w-full px-3 py-2 text-left text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Export Excel (.xlsx)</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {zoneSummaries.map(({ zone, rawMatQty, rawMatSkus, semiQty, semiSkus, fgQty, fgSkus }) => {
              const zoneStyle = getZoneColor(zone.name);
              const zoneLetter = getZoneLetter(zone.name);

              return (
                <div
                  key={zone._id}
                  className="p-4 bg-white border border-gray-200/80 rounded-2xl shadow-2xs hover:border-blue-200 transition-colors space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-black border ${zoneStyle.bg} ${zoneStyle.text} ${zoneStyle.border}`}>
                        {zoneLetter}
                      </span>
                      <span className="font-bold text-gray-900 text-xs">{zone.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInspectLocation(zone)}
                      className="text-gray-400 hover:text-blue-600 p-1 rounded-lg transition-colors cursor-pointer"
                      title="Inspect Zone"
                    >
                      <ArrowRight className="w-4 h-4 text-blue-600" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-100 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-gray-900">
                        <Package className="w-3 h-3 text-blue-500 shrink-0" />
                        <span>{rawMatQty.toLocaleString('en-IN')} KG</span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-medium pl-4">{rawMatSkus} SKUs</p>
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-gray-900">
                        <Layers className="w-3 h-3 text-purple-500 shrink-0" />
                        <span>{semiQty.toLocaleString('en-IN')} PCS</span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-medium pl-4">{semiSkus} SKUs</p>
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-gray-900">
                        <Boxes className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>{fgQty.toLocaleString('en-IN')} GBL</span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-medium pl-4">{fgSkus} SKUs</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MODALS ── */}

      {/* MODAL: ADD / EDIT LOCATION */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={editNode ? `Edit ${addForm.level}` : `Add New ${addForm.level}`}
      >
        <form onSubmit={handleSaveLocation} className="space-y-3.5 text-xs text-left">
          {addError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium">
              {addError}
            </div>
          )}

          <div>
            <label className="block text-[10.5px] font-bold text-gray-600 uppercase tracking-wider mb-1">
              Hierarchy Level
            </label>
            <select
              value={addForm.level}
              onChange={e => setAddForm({ ...addForm, level: e.target.value as any })}
              disabled={!!editNode}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl font-semibold bg-gray-50 text-gray-900 focus:outline-none focus:border-blue-500 text-xs"
            >
              <option value="Factory">Factory / Plant</option>
              <option value="Floor">Floor</option>
              <option value="Zone">Zone</option>
              <option value="Storage Location">Storage Location / Shelf</option>
            </select>
          </div>

          <div>
            <label className="block text-[10.5px] font-bold text-gray-600 uppercase tracking-wider mb-1">
              Name *
            </label>
            <input
              type="text"
              placeholder={`e.g. ${addForm.level === 'Factory' ? 'SKBW Plant 1' : addForm.level === 'Floor' ? 'Ground Floor' : addForm.level === 'Zone' ? 'Zone A' : 'Top Shelf'}`}
              value={addForm.name}
              onChange={e => setAddForm({ ...addForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl font-semibold text-gray-900 focus:outline-none focus:border-blue-500 text-xs"
              required
            />
          </div>

          {addForm.level !== 'Factory' && (
            <div>
              <label className="block text-[10.5px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                Parent Location *
              </label>
              <select
                value={addForm.parentId}
                onChange={e => setAddForm({ ...addForm, parentId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-semibold bg-white text-gray-900 focus:outline-none focus:border-blue-500 text-xs"
                required
              >
                <option value="">Select Parent...</option>
                {locations
                  .filter(l => {
                    if (addForm.level === 'Floor') return l.level === 'Factory';
                    if (addForm.level === 'Zone') return l.level === 'Floor';
                    if (addForm.level === 'Storage Location') return l.level === 'Zone';
                    return false;
                  })
                  .map(l => (
                    <option key={l._id} value={l._id}>
                      {l.name} ({l.level})
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="pt-2 border-t border-gray-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-3.5 py-1.5 border border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addLoading}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs cursor-pointer disabled:opacity-50 text-xs"
            >
              {addLoading ? 'Saving...' : editNode ? 'Update Location' : 'Create Location'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: LOCATION INSPECT DETAILS */}
      <Modal
        isOpen={!!selectedLocationForDetails}
        onClose={() => {
          setSelectedLocationForDetails(null);
          setLocationDetails(null);
        }}
        title={`Live Stock: ${selectedLocationForDetails?.name || 'Location'}`}
      >
        <div className="space-y-3.5 text-xs text-left">
          {detailsLoading ? (
            <div className="py-8 text-center text-gray-400 font-medium animate-pulse">
              Loading live stock details...
            </div>
          ) : (
            <>
              <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Level</span>
                  <span className="font-extrabold text-gray-900 text-xs">{selectedLocationForDetails?.level}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Total Stored Qty</span>
                  <span className="font-extrabold text-blue-700 text-xs">{locationDetails?.totalQty || 0} units</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 mb-2">Stored SKU Items</h4>
                {(!locationDetails?.storedSkus || locationDetails.storedSkus.length === 0) ? (
                  <p className="text-gray-400 py-4 text-center">No active inventory balance assigned to this location yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {locationDetails.storedSkus.map((item, idx) => (
                      <div key={idx} className="p-2 bg-gray-50 border border-gray-200/80 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="font-mono font-bold text-gray-900">{item.sku.skuCode}</span>
                          <p className="text-gray-500 text-[11px]">{item.sku.name}</p>
                        </div>
                        <span className="font-bold text-blue-600">{item.quantity} {item.sku.unit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* MODAL: FLOOR SUMMARY */}
      <Modal
        isOpen={showFloorSummaryModal}
        onClose={() => setShowFloorSummaryModal(false)}
        title={`Floor Summary: ${activeFloor?.name || ''}`}
      >
        <div className="space-y-3 text-xs text-left">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <span className="text-[10px] font-bold text-blue-600 uppercase block">Raw Materials</span>
              <span className="text-base font-black text-gray-900">{floorTotals.totalRawMatQty.toLocaleString('en-IN')} KG</span>
              <p className="text-[10px] text-gray-500">{floorTotals.totalRawMatSkus} SKUs</p>
            </div>
            <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl">
              <span className="text-[10px] font-bold text-purple-600 uppercase block">Semi Finished</span>
              <span className="text-base font-black text-gray-900">{floorTotals.totalSemiQty.toLocaleString('en-IN')} PCS</span>
              <p className="text-[10px] text-gray-500">{floorTotals.totalSemiSkus} SKUs</p>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <span className="text-[10px] font-bold text-emerald-600 uppercase block">Finished Goods</span>
              <span className="text-base font-black text-gray-900">{floorTotals.totalFgQty.toLocaleString('en-IN')} GBL</span>
              <p className="text-[10px] text-gray-500">{floorTotals.totalFgSkus} SKUs</p>
            </div>
          </div>

          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
            <span className="font-bold text-gray-700">Total Distinct SKUs on Floor:</span>
            <span className="font-black text-blue-600 text-sm">{floorTotals.totalSkusCount}</span>
          </div>
        </div>
      </Modal>

      {/* MODAL: CONFIRM DELETE */}
      <Modal
        isOpen={!!deleteConfirmNode}
        onClose={() => setDeleteConfirmNode(null)}
        title="Delete Location"
      >
        <div className="space-y-3 text-xs text-left">
          <p className="text-gray-700 font-medium">
            Are you sure you want to delete <strong className="text-gray-900">{deleteConfirmNode?.name}</strong>?
          </p>

          <div className="pt-2 border-t border-gray-100 flex items-center justify-end gap-2">
            <button
              onClick={() => setDeleteConfirmNode(null)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer text-xs"
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
              <p className="text-center py-6 text-gray-400">No activity logs recorded.</p>
            ) : (
              activityLogs.map((log, idx) => (
                <div key={log._id || idx} className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-600 text-[11px]">{log.action}</span>
                    <span className="text-[9.5px] text-gray-400">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-gray-800 font-medium text-[11px]">{log.entityName}</p>
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
              <p className="text-center py-6 text-gray-400">No duplicate location names found under the same parent.</p>
            ) : (
              duplicateGroups.map((group, idx) => (
                <div key={idx} className="p-2.5 bg-blue-50/40 border border-blue-100 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-900">{group.field}</span>
                    <span className="text-[10px] font-bold text-blue-600">{group.items.length} occurrences</span>
                  </div>
                  <p className="text-gray-800 font-medium">{group.value}</p>
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

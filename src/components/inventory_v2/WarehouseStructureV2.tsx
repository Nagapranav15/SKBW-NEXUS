
import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Building2, Layers, Search,
  Edit2, Trash2, ChevronDown,
  Plus, Package, Eye,
  Boxes, ArrowRight, Printer, Download,
  SlidersHorizontal, History, Sparkles,
  FileSpreadsheet, ArrowUpRight, CheckCircle2
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
  getBalancesV2,
  WarehouseLocationV2,
  SkuV2
} from '../../api/mfgApiV2';
import { getActivityLogs } from '../../api/activityLogApi';
import { showToast } from '../ui/Toast';
import Modal from '../ui/Modal';

interface WarehouseStructureV2Props {
  isEmbedded?: boolean;
}

const ZONE_COLOR_PALETTES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  A: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/80', dot: 'bg-blue-500' },
  B: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200/80', dot: 'bg-emerald-500' },
  C: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200/80', dot: 'bg-amber-500' },
  D: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200/80', dot: 'bg-purple-500' },
  E: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200/80', dot: 'bg-rose-500' },
  F: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200/80', dot: 'bg-cyan-500' }
};

const getZoneColor = (zoneName: string) => {
  const clean = zoneName.replace(/zone/i, '').trim().toUpperCase();
  const firstChar = clean[0] || 'A';
  return ZONE_COLOR_PALETTES[firstChar] || { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/80', dot: 'bg-blue-500' };
};

const getZoneLetter = (zoneName: string) => {
  if (!zoneName) return 'Z';
  const match = zoneName.match(/zone\s*([a-zA-Z0-9])/i);
  if (match) return match[1].toUpperCase();
  const clean = zoneName.replace(/zone/i, '').trim().toUpperCase();
  return clean.charAt(0) || zoneName.charAt(0).toUpperCase() || 'Z';
};

const WarehouseStructureV2: React.FC<WarehouseStructureV2Props> = ({ isEmbedded = false }) => {
  const { selectedCompany } = useAuth();
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
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

  // Search
  const [zoneSearch, setZoneSearch] = useState('');

  // Modals & Dropdowns
  const [showAddModal, setShowAddModal] = useState(false);
  const [editNode, setEditNode] = useState<WarehouseLocationV2 | null>(null);
  const [deleteConfirmNode, setDeleteConfirmNode] = useState<WarehouseLocationV2 | null>(null);
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

  // Initial Load
  useEffect(() => {
    if (selectedCompany?._id) {
      loadInitialData();
    }
  }, [selectedCompany?._id]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [hierarchyData, skusData, balancesData] = await Promise.all([
        getWarehouseHierarchyV2(selectedCompany?._id || ''),
        getSkusV2(selectedCompany?._id || ''),
        getBalancesV2(selectedCompany?._id || '').catch(() => [])
      ]);
      setLocations(hierarchyData);
      setSkus(skusData);
      setBalances(balancesData || []);

      // Initialize selected factory and floor
      const factoriesList = hierarchyData.filter(l => l.level === 'Factory');
      if (factoriesList.length > 0) {
        const defaultFactory = factoriesList[0];
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
      const [data, skusData, balancesData] = await Promise.all([
        getWarehouseHierarchyV2(selectedCompany?._id || ''),
        getSkusV2(selectedCompany?._id || '').catch(() => []),
        getBalancesV2(selectedCompany?._id || '').catch(() => [])
      ]);
      setLocations(data);
      if (skusData?.length) setSkus(skusData);
      if (balancesData) setBalances(balancesData);
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

  // Compute Factory Metrics
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

  // Helper to compute live stock & SKU breakdown for a location or zone
  const getLocationStockMetrics = (targetLoc: WarehouseLocationV2) => {
    if (!targetLoc?._id) {
      return { rawMatQty: 0, rawMatSkus: 0, semiQty: 0, semiSkus: 0, fgQty: 0, fgSkus: 0, totalSkus: 0 };
    }

    // Collect all descendant IDs for target location (e.g. if target is Zone, collect Zone ID + all its Bins)
    const targetLocIds = new Set<string>([String(targetLoc._id)]);
    const targetLocNames = new Set<string>([targetLoc.name.toLowerCase().trim()]);

    const childLocations = locations.filter(l => l.parentId === targetLoc._id);
    childLocations.forEach(c => {
      if (c._id) {
        targetLocIds.add(String(c._id));
        targetLocNames.add(c.name.toLowerCase().trim());
      }
    });

    // Also collect parent info for contextual matching
    const parent = targetLoc.parentId ? locations.find(l => l._id === targetLoc.parentId) : null;
    const parentName = parent ? parent.name.toLowerCase().trim() : '';

    let rawMatQty = 0;
    let semiQty = 0;
    let fgQty = 0;

    const rawMatSkuIds = new Set<string>();
    const semiSkuIds = new Set<string>();
    const fgSkuIds = new Set<string>();
    const processedBalancesSkuIds = new Set<string>();

    // 1. Calculate from live Balances (Ledger aggregates)
    if (Array.isArray(balances) && balances.length > 0) {
      balances.forEach((b: any) => {
        const bLocId = b.locationId ? String(b.locationId._id || b.locationId) : '';
        const bLocName = (b.location?.name || b.locationName || '').toLowerCase().trim();

        const isLocMatch = (bLocId && targetLocIds.has(bLocId)) ||
          (bLocName && (targetLocNames.has(bLocName) || (parentName && bLocName.includes(parentName) && bLocName.includes(targetLoc.name.toLowerCase()))));

        if (isLocMatch) {
          const rawSkuId = b.skuId || b.sku?._id;
          const skuIdStr = rawSkuId ? String(rawSkuId._id || rawSkuId) : '';
          const skuObj: SkuV2 | undefined = b.sku || skus.find(s => String(s._id) === skuIdStr);
          const qty = Number(b.onHand ?? b.quantity ?? b.qty) || 0;

          if (qty > 0 && skuObj) {
            processedBalancesSkuIds.add(skuIdStr || skuObj.skuCode);

            const cat = (skuObj.category || '').toLowerCase();
            const group = (skuObj.group || '').toLowerCase();
            const itemType = (skuObj.itemType || '').toLowerCase();
            const paperType = (skuObj.paperType || '').toLowerCase();

            const isRaw = cat.includes('raw') || cat.includes('material') || cat.includes('paper') ||
              group.includes('material') || group.includes('paper') || group.includes('raw') ||
              itemType.includes('material') || itemType.includes('raw') || (paperType !== 'none' && paperType !== '');

            const isSemi = !isRaw && (cat.includes('semi') || group.includes('semi') || itemType.includes('semi') || group.includes('work in progress') || group.includes('wip'));

            if (isRaw) {
              rawMatQty += qty;
              rawMatSkuIds.add(skuIdStr || skuObj.skuCode);
            } else if (isSemi) {
              semiQty += qty;
              semiSkuIds.add(skuIdStr || skuObj.skuCode);
            } else {
              fgQty += qty;
              fgSkuIds.add(skuIdStr || skuObj.skuCode);
            }
          }
        }
      });
    }

    // 2. Secondary fallback: Check SKUs with initialLocation / defaultLocation / warehouseLocation
    skus.forEach(s => {
      const sId = String(s._id || s.skuCode);
      if (processedBalancesSkuIds.has(sId)) return; // Already counted from live ledger

      const initialLocId = String(s.initialLocationId || (s as any).locationId || s.initialLocation?._id || '');
      const defaultLocName = (s.defaultLocation || s.warehouseLocation || (s as any).location || '').toLowerCase().trim();

      const isMatch = (initialLocId && targetLocIds.has(initialLocId)) ||
        (defaultLocName && (targetLocNames.has(defaultLocName) || (parentName && defaultLocName.includes(parentName) && defaultLocName.includes(targetLoc.name.toLowerCase()))));

      if (isMatch) {
        const stock = Number(s.presentStock ?? s.openingStock) || 0;
        if (stock > 0) {
          const cat = (s.category || '').toLowerCase();
          const group = (s.group || '').toLowerCase();
          const itemType = (s.itemType || '').toLowerCase();
          const paperType = (s.paperType || '').toLowerCase();

          const isRaw = cat.includes('raw') || cat.includes('material') || cat.includes('paper') ||
            group.includes('material') || group.includes('paper') || group.includes('raw') ||
            itemType.includes('material') || itemType.includes('raw') || (paperType !== 'none' && paperType !== '');

          const isSemi = !isRaw && (cat.includes('semi') || group.includes('semi') || itemType.includes('semi') || group.includes('work in progress') || group.includes('wip'));

          if (isRaw) {
            rawMatQty += stock;
            rawMatSkuIds.add(sId);
          } else if (isSemi) {
            semiQty += stock;
            semiSkuIds.add(sId);
          } else {
            fgQty += stock;
            fgSkuIds.add(sId);
          }
        }
      }
    });

    const totalSkus = new Set([...rawMatSkuIds, ...semiSkuIds, ...fgSkuIds]).size;

    return {
      rawMatQty,
      rawMatSkus: rawMatSkuIds.size,
      semiQty,
      semiSkus: semiSkuIds.size,
      fgQty,
      fgSkus: fgSkuIds.size,
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
      const locs = locations.filter(l => l.parentId === zone._id && l.level === 'Storage Location');

      const matchesSearch = !zoneSearch.trim() ||
        zone.name.toLowerCase().includes(zoneSearch.toLowerCase().trim()) ||
        locs.some(l => l.name.toLowerCase().includes(zoneSearch.toLowerCase().trim()));

      if (!matchesSearch) return;

      if (locs.length === 0) {
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
  }, [activeZones, locations, skus, balances, zoneSearch]);

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

  // Compute Zone-Wise Summaries
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
  }, [activeZones, locations, skus, balances]);

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

  const [cascadeDelete, setCascadeDelete] = useState(true);

  const handleDeleteLocation = async () => {
    if (!deleteConfirmNode?._id) return;
    try {
      await deleteWarehouseLocationV2(deleteConfirmNode._id, selectedCompany?._id || '', cascadeDelete);
      showToast(`Deleted '${deleteConfirmNode.name}'`, 'success');

      const deletedId = deleteConfirmNode._id;
      const deletedLevel = deleteConfirmNode.level;
      setDeleteConfirmNode(null);

      // Reload hierarchy
      const updated = await getWarehouseHierarchyV2(selectedCompany?._id || '');
      setLocations(updated);

      // Adjust active selections if deleted item was active
      if (deletedLevel === 'Factory' && selectedFactoryId === deletedId) {
        const remainingFactories = updated.filter(l => l.level === 'Factory');
        if (remainingFactories.length > 0) {
          setSelectedFactoryId(remainingFactories[0]._id || '');
          const fls = updated.filter(l => l.parentId === remainingFactories[0]._id && l.level === 'Floor');
          setSelectedFloorId(fls[0]?._id || '');
        } else {
          setSelectedFactoryId('');
          setSelectedFloorId('');
        }
      } else if (deletedLevel === 'Floor' && selectedFloorId === deletedId) {
        const remainingFloors = updated.filter(l => l.parentId === selectedFactoryId && l.level === 'Floor');
        setSelectedFloorId(remainingFloors[0]?._id || '');
      }
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
    <div className="space-y-4 text-left font-sans animate-in fade-in duration-150 max-w-[1600px] mx-auto">

      {/* ── 1. HEADER & CONTROLS ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

          {/* Title & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50/80 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-blue-600 tracking-wider uppercase">
                  Master Management
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {factories.length} {factories.length === 1 ? 'Factory' : 'Factories'}
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Warehouse Structure & Storage Locations
              </h2>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">

            {/* Tools Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowToolsDropdown(!showToolsDropdown);
                  setShowExportDropdown(false);
                }}
                className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                <span>Tools</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
              {showToolsDropdown && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50 text-xs font-medium animate-in fade-in duration-100">
                  <button
                    onClick={() => {
                      fetchActivityLogs();
                      setShowActivityLogModal(true);
                      setShowToolsDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50/70 hover:text-blue-700 flex items-center gap-2 transition-colors"
                  >
                    <History className="w-3.5 h-3.5 text-blue-600" />
                    <span>Activity History</span>
                  </button>
                  <button
                    onClick={() => {
                      findDuplicates();
                      setShowToolsDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50/70 hover:text-blue-700 flex items-center gap-2 transition-colors"
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
                      className="w-full px-3 py-2 text-left text-blue-700 hover:bg-blue-50 flex items-center gap-2 font-semibold border-t border-slate-100"
                    >
                      <Plus className="w-3.5 h-3.5 text-blue-600" />
                      <span>Setup Default Plants</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Print Button */}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
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
                className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
              {showExportDropdown && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50 text-xs font-medium animate-in fade-in duration-100">
                  <button
                    onClick={handleExportExcel}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50/70 hover:text-blue-700 flex items-center gap-2 transition-colors"
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
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Factory</span>
            </button>
          </div>
        </div>

        {/* ── 2. FACTORY CARDS ── */}
        {factories.length === 0 ? (
          <div className="p-6 text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200 space-y-2 mt-3">
            <Building2 className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-700 text-xs">No Factories Configured Yet</p>
            <p className="text-[11px] text-slate-400">Click &apos;+ Add Factory&apos; or use Tools to initialize default factory setup.</p>
            <button
              type="button"
              onClick={handleSeedDefaultHierarchy}
              className="mt-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs hover:bg-blue-700 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Initialize SKBW / LOM / Maruti
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 mt-3 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
            {factories.map(factory => {
              const isSelected = activeFactory?._id === factory._id;
              const metrics = getFactoryMetrics(factory._id!);

              return (
                <div
                  key={factory._id}
                  onClick={() => {
                    setSelectedFactoryId(factory._id!);
                    const fls = locations.filter(l => l.parentId === factory._id && l.level === 'Floor');
                    if (fls.length > 0) {
                      setSelectedFloorId(fls[0]._id || '');
                    } else {
                      setSelectedFloorId('');
                    }
                  }}
                  className={`shrink-0 w-56 sm:w-60 p-2.5 rounded-xl transition-all text-left flex items-center justify-between gap-2.5 cursor-pointer relative group ${isSelected
                      ? 'border border-blue-500 bg-blue-50/40 shadow-xs ring-1 ring-blue-500/20'
                      : 'border border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 border border-slate-200/60'
                      }`}>
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className={`text-xs font-bold truncate ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                          {factory.name}
                        </h3>
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></span>
                        )}
                      </div>
                      <p className="text-[10.5px] text-slate-500 font-medium truncate mt-0.5">
                        {metrics.floorsCount} Floors • {metrics.zonesCount} Zones • {metrics.locationsCount} Locs
                      </p>
                    </div>
                  </div>

                  {/* Factory Actions: Edit & Delete */}
                  <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditModal(factory);
                      }}
                      className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-100/50 rounded transition-colors cursor-pointer"
                      title="Edit Factory"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmNode(factory);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-100/50 rounded transition-colors cursor-pointer"
                      title="Delete Factory"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── 3. FLOOR TABS & SUMMARY ── */}
        {activeFactory && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-3.5 pt-3 border-t border-slate-100">

            {/* Floor Pill Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeFloors.map(floor => {
                const isSelected = activeFloor?._id === floor._id;
                return (
                  <div
                    key={floor._id}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${isSelected
                        ? 'bg-blue-50 border border-blue-400 text-blue-700 shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedFloorId(floor._id!)}
                      className="cursor-pointer"
                    >
                      {floor.name}
                    </button>

                    {/* Quick Floor Edit / Delete if active */}
                    {isSelected && (
                      <div className="flex items-center gap-0.5 ml-1 border-l border-blue-200 pl-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditModal(floor);
                          }}
                          className="p-0.5 text-blue-500 hover:text-blue-700 hover:bg-blue-100/60 rounded cursor-pointer"
                          title="Edit Floor"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmNode(floor);
                          }}
                          className="p-0.5 text-rose-400 hover:text-rose-600 hover:bg-rose-100/60 rounded cursor-pointer"
                          title="Delete Floor"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => handleOpenAddModal('Floor', activeFactory._id)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-blue-600 border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer flex items-center gap-1"
                title="Add Floor to this Factory"
              >
                <Plus className="w-3 h-3" />
                <span>Floor</span>
              </button>
            </div>

            {/* Floor Summary Action */}
            {activeFloor && (
              <button
                type="button"
                onClick={() => setShowFloorSummaryModal(true)}
                className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
              >
                <Boxes className="w-3.5 h-3.5 text-slate-500" />
                <span>Floor Summary</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── 4. FLOOR LOCATIONS TABLE ── */}
      {activeFloor && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">

          {/* Table Header Toolbar */}
          <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/40">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">
                {activeFloor.name}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-[11px] text-slate-500 font-medium">
                {activeZones.length} Zones, {activeStorageLocations.length} Locations
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search zones or bins..."
                  value={zoneSearch}
                  onChange={e => setZoneSearch(e.target.value)}
                  className="pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 w-44 sm:w-52"
                />
              </div>

              {/* Add Zone Button */}
              <button
                type="button"
                onClick={() => handleOpenAddModal('Zone', activeFloor._id)}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Zone</span>
              </button>
            </div>
          </div>

          {/* Table Element */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-3.5 py-2.5 w-10 text-center">#</th>
                  <th className="px-3.5 py-2.5 w-24 text-center">Zone</th>
                  <th className="px-3.5 py-2.5">Storage Location</th>
                  <th className="px-3.5 py-2.5">Raw Materials (KG)</th>
                  <th className="px-3.5 py-2.5">Semi Finished (PCS)</th>
                  <th className="px-3.5 py-2.5">Finished Goods (GBL)</th>
                  <th className="px-3.5 py-2.5 text-center">Total SKUs</th>
                  <th className="px-3.5 py-2.5 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      No zones or storage locations configured for {activeFloor.name} yet.
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row) => {
                    const zoneStyle = getZoneColor(row.zone.name);
                    const zoneLetter = getZoneLetter(row.zone.name);

                    return (
                      <tr key={`${row.zone._id}_${row.location._id}_${row.index}`} className="hover:bg-slate-50/60 transition-colors">

                        {/* # */}
                        <td className="px-3.5 py-2.5 text-center font-semibold text-slate-400">
                          {row.index}
                        </td>

                        {/* Zone Badge */}
                        <td className="px-3.5 py-2.5 text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 shrink-0 overflow-hidden rounded-md text-[11px] font-bold border ${zoneStyle.bg} ${zoneStyle.text} ${zoneStyle.border}`}>
                            {zoneLetter}
                          </span>
                        </td>

                        {/* Storage Location */}
                        <td className="px-3.5 py-2.5 font-semibold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span>{row.location.name}</span>
                            {row.location.level === 'Zone' && (
                              <button
                                type="button"
                                onClick={() => handleOpenAddModal('Storage Location', row.zone._id)}
                                className="text-[10px] text-blue-600 font-semibold hover:underline ml-1"
                              >
                                + Add Bin
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Raw Materials (KG) */}
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-semibold text-slate-800">{row.rawMatQty.toLocaleString('en-IN')} KG</span>
                            <span className="text-[10.5px] text-slate-400 font-normal">({row.rawMatSkus} SKUs)</span>
                          </div>
                        </td>

                        {/* Semi Finished (PCS) */}
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-semibold text-slate-800">{row.semiQty.toLocaleString('en-IN')} PCS</span>
                            <span className="text-[10.5px] text-slate-400 font-normal">({row.semiSkus} SKUs)</span>
                          </div>
                        </td>

                        {/* Finished Goods (GBL) */}
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-semibold text-slate-800">{row.fgQty.toLocaleString('en-IN')} GBL</span>
                            <span className="text-[10.5px] text-slate-400 font-normal">({row.fgSkus} SKUs)</span>
                          </div>
                        </td>

                        {/* Total SKUs */}
                        <td className="px-3.5 py-2.5 text-center font-bold text-slate-800">
                          {row.totalSkus}
                        </td>

                        {/* Actions */}
                        <td className="px-3.5 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">

                            {/* Inspect */}
                            <button
                              type="button"
                              onClick={() => handleInspectLocation(row.location)}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                              title="Inspect Live Stock"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {/* Edit */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(row.location)}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                              title="Edit Location"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete */}
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmNode(row.location)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
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
                <tfoot className="bg-slate-50/70 border-t border-slate-200 text-xs font-semibold">
                  <tr>
                    <td colSpan={3} className="px-3.5 py-2.5 text-slate-900 font-bold">
                      Total ({activeFloor.name})
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-slate-900">{floorTotals.totalRawMatQty.toLocaleString('en-IN')} KG</span>
                        <span className="text-[10px] text-slate-500 font-normal">({floorTotals.totalRawMatSkus} SKUs)</span>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-slate-900">{floorTotals.totalSemiQty.toLocaleString('en-IN')} PCS</span>
                        <span className="text-[10px] text-slate-500 font-normal">({floorTotals.totalSemiSkus} SKUs)</span>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-slate-900">{floorTotals.totalFgQty.toLocaleString('en-IN')} GBL</span>
                        <span className="text-[10px] text-slate-500 font-normal">({floorTotals.totalFgSkus} SKUs)</span>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-bold text-slate-900">
                      {floorTotals.totalSkusCount}
                    </td>
                    <td className="px-3.5 py-2.5"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── 5. ZONE WISE SUMMARY SECTION ── */}
      {activeFloor && zoneSummaries.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900">
                Zone Wise Summary
              </h3>
              <span className="text-[11px] text-slate-400 font-medium">
                ({activeFloor.name})
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Printer className="w-3 h-3 text-slate-400" />
                <span>Print</span>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowZoneExportDropdown(!showZoneExportDropdown)}
                  className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Download className="w-3 h-3 text-slate-400" />
                  <span>Export</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                {showZoneExportDropdown && (
                  <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50 text-xs font-medium animate-in fade-in duration-100">
                    <button
                      onClick={handleExportExcel}
                      className="w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50/70 hover:text-blue-700 flex items-center gap-2 transition-colors"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Export Excel (.xlsx)</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {zoneSummaries.map(({ zone, rawMatQty, rawMatSkus, semiQty, semiSkus, fgQty, fgSkus }) => {
              const zoneStyle = getZoneColor(zone.name);
              const zoneLetter = getZoneLetter(zone.name);

              return (
                <div
                  key={zone._id}
                  className="p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-2xs hover:border-slate-300 transition-colors space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-flex items-center justify-center w-6 h-6 shrink-0 overflow-hidden rounded-md text-[11px] font-bold border ${zoneStyle.bg} ${zoneStyle.text} ${zoneStyle.border}`}>
                        {zoneLetter}
                      </span>
                      <span className="font-bold text-slate-900 text-xs truncate">{zone.name}</span>
                    </div>

                    {/* Zone Actions: Inspect, Edit & Delete */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleInspectLocation(zone)}
                        className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors cursor-pointer flex items-center gap-0.5 text-[11px] font-medium"
                        title="Inspect Live Stock in Zone"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-400 hover:text-blue-600" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(zone)}
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                        title="Edit Zone"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmNode(zone)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        title="Delete Zone"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Raw Mat</span>
                      <span className="font-bold text-slate-800 text-[11px]">{rawMatQty.toLocaleString('en-IN')} KG</span>
                      <p className="text-[10px] text-slate-400 font-normal">{rawMatSkus} SKUs</p>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Semi Fin</span>
                      <span className="font-bold text-slate-800 text-[11px]">{semiQty.toLocaleString('en-IN')} PCS</span>
                      <p className="text-[10px] text-slate-400 font-normal">{semiSkus} SKUs</p>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Finished</span>
                      <span className="font-bold text-slate-800 text-[11px]">{fgQty.toLocaleString('en-IN')} GBL</span>
                      <p className="text-[10px] text-slate-400 font-normal">{fgSkus} SKUs</p>
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
        title={editNode ? `Edit ${addForm.level}: ${editNode.name}` : `Add New ${addForm.level}`}
      >
        <form onSubmit={handleSaveLocation} className="space-y-3.5 text-xs text-left">
          {addError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-medium text-xs">
              {addError}
            </div>
          )}

          <div>
            <label className="block text-[10.5px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Hierarchy Level
            </label>
            <select
              value={addForm.level}
              onChange={e => setAddForm({ ...addForm, level: e.target.value as any })}
              disabled={!!editNode}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-medium bg-slate-50 text-slate-900 focus:outline-none focus:border-blue-500 text-xs"
            >
              <option value="Factory">Factory / Plant</option>
              <option value="Floor">Floor</option>
              <option value="Zone">Zone</option>
              <option value="Storage Location">Storage Location / Shelf</option>
            </select>
          </div>

          <div>
            <label className="block text-[10.5px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Name *
            </label>
            <input
              type="text"
              placeholder={`e.g. ${addForm.level === 'Factory' ? 'SKBW Plant 1' : addForm.level === 'Floor' ? 'Ground Floor' : addForm.level === 'Zone' ? 'Zone A' : 'Top Shelf'}`}
              value={addForm.name}
              onChange={e => setAddForm({ ...addForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-medium text-slate-900 focus:outline-none focus:border-blue-500 text-xs"
              required
            />
          </div>

          {addForm.level !== 'Factory' && (
            <div>
              <label className="block text-[10.5px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Parent Location *
              </label>
              <select
                value={addForm.parentId}
                onChange={e => setAddForm({ ...addForm, parentId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-medium bg-white text-slate-900 focus:outline-none focus:border-blue-500 text-xs"
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

          <div>
            <label className="block text-[10.5px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              value={addForm.status}
              onChange={e => setAddForm({ ...addForm, status: e.target.value as any })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-medium bg-white text-slate-900 focus:outline-none focus:border-blue-500 text-xs"
            >
              <option value="Active">Active</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Full">Full</option>
            </select>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-3.5 py-1.5 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50 cursor-pointer text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addLoading}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer disabled:opacity-50 text-xs"
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
            <div className="py-8 text-center text-slate-400 font-medium animate-pulse">
              Loading live stock details...
            </div>
          ) : (
            <>
              <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider block">Level</span>
                  <span className="font-bold text-slate-900 text-xs">{selectedLocationForDetails?.level}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider block">Total Stored Qty</span>
                  <span className="font-bold text-blue-700 text-xs">{locationDetails?.totalQty || 0} units</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-2">Stored SKU Items</h4>
                {(!locationDetails?.storedSkus || locationDetails.storedSkus.length === 0) ? (
                  <p className="text-slate-400 py-4 text-center">No active inventory balance assigned to this location yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {locationDetails.storedSkus.map((item, idx) => (
                      <div key={idx} className="p-2 bg-slate-50 border border-slate-200/80 rounded-lg flex items-center justify-between">
                        <div>
                          <span className="font-mono font-bold text-slate-900">{item.sku.skuCode}</span>
                          <p className="text-slate-500 text-[11px]">{item.sku.name}</p>
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
              <span className="text-[10px] font-semibold text-blue-600 uppercase block">Raw Materials</span>
              <span className="text-sm font-bold text-slate-900">{floorTotals.totalRawMatQty.toLocaleString('en-IN')} KG</span>
              <p className="text-[10px] text-slate-500">{floorTotals.totalRawMatSkus} SKUs</p>
            </div>
            <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl">
              <span className="text-[10px] font-semibold text-purple-600 uppercase block">Semi Finished</span>
              <span className="text-sm font-bold text-slate-900">{floorTotals.totalSemiQty.toLocaleString('en-IN')} PCS</span>
              <p className="text-[10px] text-slate-500">{floorTotals.totalSemiSkus} SKUs</p>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <span className="text-[10px] font-semibold text-emerald-600 uppercase block">Finished Goods</span>
              <span className="text-sm font-bold text-slate-900">{floorTotals.totalFgQty.toLocaleString('en-IN')} GBL</span>
              <p className="text-[10px] text-slate-500">{floorTotals.totalFgSkus} SKUs</p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <span className="font-semibold text-slate-700">Total Distinct SKUs on Floor:</span>
            <span className="font-bold text-blue-600 text-sm">{floorTotals.totalSkusCount}</span>
          </div>
        </div>
      </Modal>

      {/* MODAL: CONFIRM DELETE */}
      <Modal
        isOpen={!!deleteConfirmNode}
        onClose={() => setDeleteConfirmNode(null)}
        title={`Delete ${deleteConfirmNode?.level || 'Location'}`}
      >
        <div className="space-y-3.5 text-xs text-left">
          <p className="text-slate-700 font-medium">
            Are you sure you want to delete <strong className="text-slate-900">{deleteConfirmNode?.name}</strong> ({deleteConfirmNode?.level})?
          </p>

          <label className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 font-medium text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={cascadeDelete}
              onChange={e => setCascadeDelete(e.target.checked)}
              className="w-4 h-4 text-rose-600 rounded border-gray-300 focus:ring-rose-500"
            />
            <span>Also delete all sub-locations (floors, zones, shelves) under this location</span>
          </label>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              onClick={() => setDeleteConfirmNode(null)}
              className="px-3.5 py-1.5 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50 cursor-pointer text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteLocation}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer text-xs"
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
                <div key={log._id || idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-blue-600 text-[11px]">{log.action}</span>
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

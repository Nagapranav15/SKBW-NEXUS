
import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Building2, Layers, Search,
  Edit2, Trash2, ChevronDown, ChevronUp,
  Plus, Package, Eye,
  Boxes, ArrowRight, Printer, Download,
  SlidersHorizontal, History, Sparkles,
  FileSpreadsheet, ArrowUpRight, CheckCircle2,
  Scale, FileText, Info, X, AlertTriangle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
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
import UniversalPrintVoucherModal from '../ui/UniversalPrintVoucherModal';
import FactoryStockPrintModal from './FactoryStockPrintModal';

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

/**
 * Calculates net weight in Kilograms (KG) for any inventory item / SKU
 * taking into account explicit reels, units (KG, MT, gm), paper ream weights,
 * sheets per ream, GSM x Dimensions, alt units, and bundle multipliers.
 */
export const calculateSkuWeightInKg = (
  sku: SkuV2 | any,
  quantity: number,
  reels?: { weight: number; reelNumber?: string; gsm?: number; width?: any }[]
): {
  weightKg: number | null;
  formattedWeight: string;
  calcNote: string;
} => {
  const qty = Number(quantity) || 0;
  if (!sku || isNaN(qty) || qty === 0) {
    return { weightKg: 0, formattedWeight: '0.00 KG', calcNote: 'Zero quantity' };
  }

  // 1. Explicit reel weights from live reels array
  if (Array.isArray(reels) && reels.length > 0) {
    const reelsSum = reels.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
    if (reelsSum > 0) {
      return {
        weightKg: reelsSum,
        formattedWeight: `${reelsSum.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} KG`,
        calcNote: `${reels.length} reel${reels.length > 1 ? 's' : ''} batch weight`
      };
    }
  }

  const unitLower = (sku.unit || '').toLowerCase().trim();

  // 2. Unit is already in KG / KGS / Kilograms
  if (['kg', 'kgs', 'kilogram', 'kilograms'].includes(unitLower)) {
    return {
      weightKg: qty,
      formattedWeight: `${qty.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} KG`,
      calcNote: 'Direct weight (KG)'
    };
  }

  // Metric Tonne
  if (['tonne', 'ton', 'tons', 'tonnes', 'mt'].includes(unitLower)) {
    const kg = qty * 1000;
    return {
      weightKg: kg,
      formattedWeight: `${kg.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} KG`,
      calcNote: `${qty.toLocaleString('en-IN')} MT × 1,000`
    };
  }

  // Grams
  if (['g', 'gm', 'gms', 'gram', 'grams'].includes(unitLower)) {
    const kg = qty / 1000;
    return {
      weightKg: kg,
      formattedWeight: `${kg.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} KG`,
      calcNote: `${qty.toLocaleString('en-IN')} g ÷ 1,000`
    };
  }

  // 3. Alt Unit in KG
  const altUnitLower = (sku.altUnit || '').toLowerCase().trim();
  const altConversion = Number(sku.altUnitConversion) || 0;
  if (altConversion > 0 && ['kg', 'kgs', 'kilogram', 'kilograms'].includes(altUnitLower)) {
    const isAltPrimaryToAlt = sku.altUnitDirection !== 'ALT_TO_PRIMARY';
    const kg = isAltPrimaryToAlt ? qty * altConversion : qty / altConversion;
    return {
      weightKg: kg,
      formattedWeight: `${kg.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} KG`,
      calcNote: `Alt Unit (${altConversion} KG/${sku.unit})`
    };
  }

  // 4. Paper sheets / reams / pcs with explicit reamWeight
  const reamWeight = Number(sku.reamWeight) || 0;
  const sheetsPerReam = Number(sku.pages) || 500;

  if (reamWeight > 0) {
    if (['ream', 'reams'].includes(unitLower)) {
      const kg = qty * reamWeight;
      return {
        weightKg: kg,
        formattedWeight: `${kg.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} KG`,
        calcNote: `${qty.toLocaleString('en-IN')} Reams × ${reamWeight} KG/Ream`
      };
    }
    if (['sheet', 'sheets', 'pcs', 'pc', 'pieces'].includes(unitLower)) {
      const kg = (qty / sheetsPerReam) * reamWeight;
      return {
        weightKg: kg,
        formattedWeight: `${kg.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} KG`,
        calcNote: `(${qty.toLocaleString('en-IN')} ÷ ${sheetsPerReam} sheets) × ${reamWeight} KG/Ream`
      };
    }
  }

  // 5. Paper dimensions fallback (GSM, width, length)
  const gsm = Number(sku.gsm) || 0;
  let w = Number(sku.width) || 0;
  let l = Number(sku.length) || 0;

  if ((w === 0 || l === 0) && sku.name) {
    const match = sku.name.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/i);
    if (match) {
      if (w === 0) w = Number(match[1]) || 0;
      if (l === 0) l = Number(match[2]) || 0;
    }
  }

  if (gsm > 0 && w > 0 && l > 0) {
    const isInches = w <= 60 && l <= 60;
    const wCm = isInches ? w * 2.54 : w;
    const lCm = isInches ? l * 2.54 : l;
    const singleSheetKg = (wCm * lCm * gsm) / 10000000;

    if (['sheet', 'sheets', 'pcs', 'pc', 'pieces'].includes(unitLower)) {
      const kg = qty * singleSheetKg;
      return {
        weightKg: kg,
        formattedWeight: `${kg.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} KG`,
        calcNote: `${qty.toLocaleString('en-IN')} sheets @ ${(singleSheetKg * 1000).toFixed(1)}g (${gsm} GSM ${w}×${l})`
      };
    }
    if (['ream', 'reams'].includes(unitLower)) {
      const calcRw = singleSheetKg * sheetsPerReam;
      const kg = qty * calcRw;
      return {
        weightKg: kg,
        formattedWeight: `${kg.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} KG`,
        calcNote: `${qty.toLocaleString('en-IN')} Reams × ${calcRw.toFixed(2)} KG/Ream`
      };
    }
  }

  // 6. Finished Goods / Books (GBL / Bundle / PCS)
  const booksPerGbl = Number(sku.booksGbl) || 0;
  const pages = Number(sku.pages) || 0;
  if (['gbl', 'bundle', 'bundles'].includes(unitLower) && booksPerGbl > 0 && pages > 0 && gsm > 0 && w > 0 && l > 0) {
    const isInches = w <= 60 && l <= 60;
    const wCm = isInches ? w * 2.54 : w;
    const lCm = isInches ? l * 2.54 : l;
    const singleLeafKg = (wCm * lCm * gsm) / 10000000;
    const bookLeaves = pages / 2;
    const bookKg = bookLeaves * singleLeafKg;
    const totalBooks = qty * booksPerGbl;
    const kg = totalBooks * bookKg;
    return {
      weightKg: kg,
      formattedWeight: `${kg.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} KG`,
      calcNote: `${totalBooks} books (${booksPerGbl}/Gbl) × ${(bookKg * 1000).toFixed(0)}g`
    };
  }

  return {
    weightKg: null,
    formattedWeight: '—',
    calcNote: `Unit: ${sku.unit || 'unit'}`
  };
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
  const [showPrintManifest, setShowPrintManifest] = useState(false);
  const [showFactoryPrintModal, setShowFactoryPrintModal] = useState(false);
  const [locationDetails, setLocationDetails] = useState<{
    location: WarehouseLocationV2;
    storedSkus: { sku: SkuV2; quantity: number }[];
    recentMovements: any[];
    totalQty: number;
  } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Inspect Modal UI State (Search, Categories, Tabs, Reel Expand)
  const [inspectSearch, setInspectSearch] = useState('');
  const [inspectCategoryFilter, setInspectCategoryFilter] = useState<'ALL' | 'RAW' | 'SEMI' | 'FINISHED'>('ALL');
  const [inspectActiveTab, setInspectActiveTab] = useState<'items' | 'movements'>('items');
  const [expandedReels, setExpandedReels] = useState<Record<string, boolean>>({});

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

  useRealtimeSync(['warehouse_location', 'inventory'], () => {
    if (selectedCompany?._id) {
      loadInitialData();
    }
  });

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
    setInspectSearch('');
    setInspectCategoryFilter('ALL');
    setInspectActiveTab('items');
    setExpandedReels({});
    setDetailsLoading(true);
    try {
      const res = await getLocationDetailsV2(location._id!, selectedCompany?._id || '');
      setLocationDetails(res);
    } catch (e) {
      console.error(e);
      // Non-blocking: local balances & skus still render immediately
    } finally {
      setDetailsLoading(false);
    }
  };

  // Location Hierarchy Breadcrumb
  const locationBreadcrumb = useMemo(() => {
    if (!selectedLocationForDetails) return '';
    const parts: string[] = [selectedLocationForDetails.name];
    let currentParentId = selectedLocationForDetails.parentId;
    while (currentParentId) {
      const parent = locations.find(l => l._id === currentParentId);
      if (parent) {
        parts.unshift(parent.name);
        currentParentId = parent.parentId;
      } else {
        break;
      }
    }
    return parts.join(' › ');
  }, [selectedLocationForDetails, locations]);

  // Comprehensive items list & weights for the inspected location / zone
  const inspectedItems = useMemo(() => {
    if (!selectedLocationForDetails) return [];

    const targetLoc = selectedLocationForDetails;
    const targetLocIds = new Set<string>([String(targetLoc._id)]);
    const targetLocNames = new Set<string>([targetLoc.name.toLowerCase().trim()]);

    const childLocations = locations.filter(l => l.parentId === targetLoc._id);
    childLocations.forEach(c => {
      if (c._id) {
        targetLocIds.add(String(c._id));
        targetLocNames.add(c.name.toLowerCase().trim());
      }
    });

    const parent = targetLoc.parentId ? locations.find(l => l._id === targetLoc.parentId) : null;
    const parentName = parent ? parent.name.toLowerCase().trim() : '';

    const itemsMap = new Map<string, {
      skuId: string;
      sku: SkuV2;
      quantity: number;
      categoryType: 'Raw Material' | 'Semi Finished' | 'Finished Goods';
      weightKg: number | null;
      formattedWeight: string;
      weightNote: string;
      reels?: any[];
      subLocationName?: string;
    }>();

    // 1. Process from balances (live ledger aggregates)
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
            const cat = (skuObj.category || '').toLowerCase();
            const group = (skuObj.group || '').toLowerCase();
            const itemType = (skuObj.itemType || '').toLowerCase();
            const paperType = (skuObj.paperType || '').toLowerCase();

            const isRaw = cat.includes('raw') || cat.includes('material') || cat.includes('paper') ||
              group.includes('material') || group.includes('paper') || group.includes('raw') ||
              itemType.includes('material') || itemType.includes('raw') || (paperType !== 'none' && paperType !== '');

            const isSemi = !isRaw && (cat.includes('semi') || group.includes('semi') || itemType.includes('semi') || group.includes('work in progress') || group.includes('wip'));

            const categoryType: 'Raw Material' | 'Semi Finished' | 'Finished Goods' = isRaw
              ? 'Raw Material'
              : isSemi
                ? 'Semi Finished'
                : 'Finished Goods';

            const key = skuIdStr || skuObj.skuCode;
            const weightInfo = calculateSkuWeightInKg(skuObj, qty, b.reels);

            if (itemsMap.has(key)) {
              const existing = itemsMap.get(key)!;
              const newQty = existing.quantity + qty;
              const combinedReels = [...(existing.reels || []), ...(b.reels || [])];
              const combinedWeight = calculateSkuWeightInKg(skuObj, newQty, combinedReels);
              itemsMap.set(key, {
                ...existing,
                quantity: newQty,
                weightKg: combinedWeight.weightKg,
                formattedWeight: combinedWeight.formattedWeight,
                weightNote: combinedWeight.calcNote,
                reels: combinedReels
              });
            } else {
              itemsMap.set(key, {
                skuId: key,
                sku: skuObj,
                quantity: qty,
                categoryType,
                weightKg: weightInfo.weightKg,
                formattedWeight: weightInfo.formattedWeight,
                weightNote: weightInfo.calcNote,
                reels: b.reels,
                subLocationName: b.location?.name || b.locationName || ''
              });
            }
          }
        }
      });
    }

    // 2. Secondary fallback from skus default/initial locations
    skus.forEach(s => {
      const sId = String(s._id || s.skuCode);
      if (itemsMap.has(sId)) return; // Already counted from ledger balances

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

          const categoryType = isRaw ? 'Raw Material' : isSemi ? 'Semi Finished' : 'Finished Goods';
          const weightInfo = calculateSkuWeightInKg(s, stock);

          itemsMap.set(sId, {
            skuId: sId,
            sku: s,
            quantity: stock,
            categoryType,
            weightKg: weightInfo.weightKg,
            formattedWeight: weightInfo.formattedWeight,
            weightNote: weightInfo.calcNote,
            subLocationName: s.defaultLocation || ''
          });
        }
      }
    });

    // 3. Merge in any items from backend locationDetails?.storedSkus if not already in itemsMap
    if (locationDetails?.storedSkus && locationDetails.storedSkus.length > 0) {
      locationDetails.storedSkus.forEach(item => {
        if (!item.sku || !item.quantity || item.quantity <= 0) return;
        const sId = String(item.sku._id || item.sku.skuCode);
        if (!itemsMap.has(sId)) {
          const cat = (item.sku.category || '').toLowerCase();
          const group = (item.sku.group || '').toLowerCase();
          const itemType = (item.sku.itemType || '').toLowerCase();
          const isRaw = cat.includes('raw') || cat.includes('material') || cat.includes('paper') ||
            group.includes('material') || group.includes('paper') || group.includes('raw') ||
            itemType.includes('material') || itemType.includes('raw');
          const isSemi = !isRaw && (cat.includes('semi') || group.includes('semi') || itemType.includes('semi') || group.includes('wip'));
          const categoryType = isRaw ? 'Raw Material' : isSemi ? 'Semi Finished' : 'Finished Goods';
          const weightInfo = calculateSkuWeightInKg(item.sku, item.quantity);
          itemsMap.set(sId, {
            skuId: sId,
            sku: item.sku,
            quantity: item.quantity,
            categoryType,
            weightKg: weightInfo.weightKg,
            formattedWeight: weightInfo.formattedWeight,
            weightNote: weightInfo.calcNote
          });
        }
      });
    }

    return Array.from(itemsMap.values());
  }, [selectedLocationForDetails, locations, balances, skus, locationDetails]);

  // Filtered items based on search and category tab
  const filteredInspectedItems = useMemo(() => {
    return inspectedItems.filter(item => {
      if (inspectCategoryFilter === 'RAW' && item.categoryType !== 'Raw Material') return false;
      if (inspectCategoryFilter === 'SEMI' && item.categoryType !== 'Semi Finished') return false;
      if (inspectCategoryFilter === 'FINISHED' && item.categoryType !== 'Finished Goods') return false;

      if (inspectSearch.trim()) {
        const q = inspectSearch.toLowerCase().trim();
        const codeMatch = item.sku.skuCode.toLowerCase().includes(q);
        const nameMatch = item.sku.name.toLowerCase().includes(q);
        const catMatch = (item.sku.category || '').toLowerCase().includes(q);
        return codeMatch || nameMatch || catMatch;
      }
      return true;
    });
  }, [inspectedItems, inspectCategoryFilter, inspectSearch]);

  // Totals for inspected items
  const inspectedTotals = useMemo(() => {
    let totalWeight = 0;
    let totalQty = 0;
    let hasWeightItems = 0;

    inspectedItems.forEach(item => {
      totalQty += item.quantity;
      if (item.weightKg !== null && item.weightKg !== undefined && item.weightKg > 0) {
        totalWeight += item.weightKg;
        hasWeightItems++;
      }
    });

    const rawItems = inspectedItems.filter(i => i.categoryType === 'Raw Material');
    const semiItems = inspectedItems.filter(i => i.categoryType === 'Semi Finished');
    const fgItems = inspectedItems.filter(i => i.categoryType === 'Finished Goods');

    const rawWeight = rawItems.reduce((sum, i) => sum + (i.weightKg || 0), 0);
    const semiWeight = semiItems.reduce((sum, i) => sum + (i.weightKg || 0), 0);
    const fgWeight = fgItems.reduce((sum, i) => sum + (i.weightKg || 0), 0);

    return {
      totalWeight,
      totalQty,
      hasWeightItems,
      rawCount: rawItems.length,
      rawWeight,
      semiCount: semiItems.length,
      semiWeight,
      fgCount: fgItems.length,
      fgWeight,
      totalCount: inspectedItems.length
    };
  }, [inspectedItems]);

  // Export inspected location items to Excel
  const handleExportInspectedItemsExcel = () => {
    if (!selectedLocationForDetails || inspectedItems.length === 0) {
      showToast('No items to export', 'info');
      return;
    }
    const data = inspectedItems.map((item, idx) => ({
      '#': idx + 1,
      'Location': selectedLocationForDetails.name,
      'Level': selectedLocationForDetails.level,
      'Hierarchy': locationBreadcrumb,
      'SKU Code': item.sku.skuCode,
      'Item Name': item.sku.name,
      'Category': item.categoryType,
      'Stored Quantity': item.quantity,
      'Unit': item.sku.unit,
      'Respective Weight (KG)': item.weightKg !== null ? item.weightKg : 'N/A',
      'Weight Calculation Note': item.weightNote,
      'GSM': item.sku.gsm || '',
      'Width': item.sku.width || '',
      'Length': item.sku.length || '',
      'Brand': item.sku.brand || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stored_Items');
    XLSX.writeFile(wb, `${selectedLocationForDetails.name.replace(/\s+/g, '_')}_Stock_and_Weights.xlsx`);
    showToast('Exported location stock with weights', 'success');
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

    // Collect all descendant IDs for target location (e.g. if target is Factory/Floor/Zone, collect all nested children)
    const targetLocIds = new Set<string>([String(targetLoc._id)]);
    const targetLocNames = new Set<string>([targetLoc.name.toLowerCase().trim()]);

    const queue = [String(targetLoc._id)];
    while (queue.length > 0) {
      const parentId = queue.shift();
      const children = locations.filter(l => l.parentId && String(l.parentId) === parentId);
      for (const child of children) {
        if (child._id && !targetLocIds.has(String(child._id))) {
          targetLocIds.add(String(child._id));
          targetLocNames.add(child.name.toLowerCase().trim());
          queue.push(String(child._id));
        }
      }
    }

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

  // Stock and SKU metrics for the location/zone/floor/factory currently selected for deletion
  const confirmNodeMetrics = useMemo(() => {
    if (!deleteConfirmNode) return null;
    return getLocationStockMetrics(deleteConfirmNode);
  }, [deleteConfirmNode, locations, balances, skus]);

  const confirmNodeTotalQty = confirmNodeMetrics ? (confirmNodeMetrics.rawMatQty + confirmNodeMetrics.semiQty + confirmNodeMetrics.fgQty) : 0;
  const confirmNodeTotalSkus = confirmNodeMetrics ? confirmNodeMetrics.totalSkus : 0;
  const confirmNodeHasData = (confirmNodeTotalQty > 0.0001) || (confirmNodeTotalSkus > 0);

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

    // Strict safeguard: Prevent deletion if contains active stock or SKUs
    const metrics = getLocationStockMetrics(deleteConfirmNode);
    const totalQty = metrics.rawMatQty + metrics.semiQty + metrics.fgQty;
    if (totalQty > 0.0001 || metrics.totalSkus > 0) {
      showToast(
        `Cannot delete '${deleteConfirmNode.name}' because it contains active inventory (${totalQty > 0 ? totalQty.toFixed(1) + ' units' : 'stored items'} across ${metrics.totalSkus} item(s)). Please transfer or remove all stock first.`,
        'error'
      );
      return;
    }

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
              onClick={() => setShowFactoryPrintModal(true)}
              className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Print comprehensive Factory Stock & Location Inventory Manifest PDF"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print PDF</span>
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
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50 text-xs font-medium animate-in fade-in duration-100">
                  <button
                    onClick={handleExportExcel}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50/70 hover:text-blue-700 flex items-center gap-2 transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export Excel (.xlsx)</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowFactoryPrintModal(true);
                      setShowExportDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50/70 hover:text-blue-700 flex items-center gap-2 transition-colors border-t border-slate-100"
                  >
                    <Printer className="w-3.5 h-3.5 text-blue-600" />
                    <span>Print PDF Manifest</span>
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
                  {(() => {
                    const fMetrics = getLocationStockMetrics(factory);
                    const fStock = fMetrics.rawMatQty + fMetrics.semiQty + fMetrics.fgQty;
                    const fHasData = fStock > 0.0001 || fMetrics.totalSkus > 0;

                    return (
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
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            fHasData ? 'text-slate-300 hover:text-rose-500 hover:bg-rose-50' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-100/50'
                          }`}
                          title={
                            fHasData
                              ? `Contains ${fStock.toLocaleString('en-IN')} units (${fMetrics.totalSkus} SKUs) - cannot be deleted`
                              : "Delete Factory"
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })()}
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
                    {isSelected && (() => {
                      const flMetrics = getLocationStockMetrics(floor);
                      const flStock = flMetrics.rawMatQty + flMetrics.semiQty + flMetrics.fgQty;
                      const flHasData = flStock > 0.0001 || flMetrics.totalSkus > 0;

                      return (
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
                            className={`p-0.5 rounded cursor-pointer ${
                              flHasData ? 'text-rose-300 hover:text-rose-500 hover:bg-rose-100/60' : 'text-rose-400 hover:text-rose-600 hover:bg-rose-100/60'
                            }`}
                            title={
                              flHasData
                                ? `Contains ${flStock.toLocaleString('en-IN')} units (${flMetrics.totalSkus} SKUs) - cannot be deleted`
                                : "Delete Floor"
                            }
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })()}
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
                      <tr
                        key={`${row.zone._id}_${row.location._id}_${row.index}`}
                        onClick={() => handleInspectLocation(row.location)}
                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                        title="Click to view all items and respective weights in this storage location"
                      >

                        {/* # */}
                        <td className="px-3.5 py-2.5 text-center font-semibold text-slate-400 group-hover:text-blue-600 transition-colors">
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
                            <span className="group-hover:text-blue-700 transition-colors">{row.location.name}</span>
                            {row.location.level === 'Zone' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenAddModal('Storage Location', row.zone._id);
                                }}
                                className="text-[10px] text-blue-600 font-semibold hover:underline ml-1 cursor-pointer"
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
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-slate-100 group-hover:bg-blue-100 group-hover:text-blue-700 text-xs font-bold transition-colors">
                            {row.totalSkus}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-3.5 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">

                            {/* Inspect */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInspectLocation(row.location);
                              }}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                              title="Inspect Live Stock & Weights"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {/* Edit */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(row.location);
                              }}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                              title="Edit Location"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete */}
                            {(() => {
                              const locTotalQty = row.rawMatQty + row.semiQty + row.fgQty;
                              const locHasData = locTotalQty > 0.0001 || row.totalSkus > 0;

                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmNode(row.location);
                                  }}
                                  className={`p-1 rounded transition-colors cursor-pointer ${
                                    locHasData ? 'text-slate-300 hover:text-rose-500 hover:bg-rose-50' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                  }`}
                                  title={
                                    locHasData
                                      ? `Contains ${locTotalQty.toLocaleString('en-IN')} units (${row.totalSkus} SKUs) - cannot be deleted`
                                      : "Delete Location"
                                  }
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              );
                            })()}
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
                onClick={() => setShowFactoryPrintModal(true)}
                className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                title="Print Factory & Zone Stock Manifest"
              >
                <Printer className="w-3 h-3 text-slate-400" />
                <span>Print PDF</span>
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
                  onClick={() => handleInspectLocation(zone)}
                  className="p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-2xs hover:border-blue-400 hover:shadow-xs transition-all space-y-2.5 cursor-pointer group"
                  title="Click to view all items and respective weights in this zone"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-flex items-center justify-center w-6 h-6 shrink-0 overflow-hidden rounded-md text-[11px] font-bold border ${zoneStyle.bg} ${zoneStyle.text} ${zoneStyle.border}`}>
                        {zoneLetter}
                      </span>
                      <span className="font-bold text-slate-900 text-xs truncate group-hover:text-blue-700 transition-colors">{zone.name}</span>
                    </div>

                    {/* Zone Actions: Inspect, Edit & Delete */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInspectLocation(zone);
                        }}
                        className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors cursor-pointer flex items-center gap-0.5 text-[11px] font-medium"
                        title="Inspect Live Stock & Weights in Zone"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-400 hover:text-blue-600" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditModal(zone);
                        }}
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                        title="Edit Zone"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {(() => {
                        const zoneTotalQty = rawMatQty + semiQty + fgQty;
                        const zoneTotalSkus = rawMatSkus + semiSkus + fgSkus;
                        const zoneHasData = zoneTotalQty > 0.0001 || zoneTotalSkus > 0;

                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmNode(zone);
                            }}
                            className={`p-1 rounded transition-colors cursor-pointer ${
                              zoneHasData ? 'text-slate-300 hover:text-rose-500 hover:bg-rose-50' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                            }`}
                            title={
                              zoneHasData
                                ? `Contains ${zoneTotalQty.toLocaleString('en-IN')} units (${zoneTotalSkus} SKUs) - cannot be deleted`
                                : "Delete Zone"
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        );
                      })()}
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

      {/* MODAL: LOCATION INSPECT DETAILS & WEIGHTS */}
      <Modal
        isOpen={!!selectedLocationForDetails}
        onClose={() => {
          setSelectedLocationForDetails(null);
          setLocationDetails(null);
          setExpandedReels({});
        }}
        maxWidth="max-w-5xl"
        title={
          <div className="flex items-center justify-between w-full pr-6 text-left">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-blue-100/80 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                <Scale className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {selectedLocationForDetails?.name || 'Location Stock & Weights'}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                    {selectedLocationForDetails?.level}
                  </span>
                  {selectedLocationForDetails?.status && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                      selectedLocationForDetails.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {selectedLocationForDetails.status}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                  {locationBreadcrumb}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportInspectedItemsExcel}
                disabled={inspectedItems.length === 0}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-40"
                title="Export this location's items and weights to Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">Export Excel</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPrintManifest(true)}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                title="Print location inventory manifest"
              >
                <Printer className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Print</span>
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-left flex flex-col">
          {/* Top 3 Metric Cards - Bigger, Spacier & Clean (No Capacity Limit) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3.5">
            {/* 1. Total Net Weight */}
            <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-2xl flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">
                  TOTAL NET WEIGHT
                </span>
                <div className="w-6 h-6 rounded-lg bg-blue-100/70 flex items-center justify-center text-blue-600 shrink-0">
                  <Scale className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="my-1.5 flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-[26px] font-black tracking-tight text-slate-900">
                  {inspectedTotals.totalWeight.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-black text-blue-600 uppercase">KG</span>
              </div>
              <p className="text-xs text-slate-500 font-medium truncate">
                From {inspectedTotals.hasWeightItems} SKU(s)
              </p>
            </div>

            {/* 2. Total Stored Quantity */}
            <div className="p-4 bg-white border border-slate-200/90 rounded-2xl flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  TOTAL STORED QTY
                </span>
                <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Package className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="my-1.5 flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-[26px] font-black tracking-tight text-slate-900">
                  {inspectedTotals.totalQty.toLocaleString('en-IN')}
                </span>
                <span className="text-xs font-semibold text-slate-400">Units</span>
              </div>
              <p className="text-xs text-slate-500 font-medium truncate">
                {inspectedTotals.totalCount} distinct SKU item(s)
              </p>
            </div>

            {/* 3. Breakdown */}
            <div className="p-4 bg-white border border-slate-200/90 rounded-2xl flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  BREAKDOWN
                </span>
                <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Boxes className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="my-1.5 flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[11px] font-extrabold">
                  {inspectedTotals.rawCount} RM
                </span>
                <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-[11px] font-extrabold">
                  {inspectedTotals.semiCount} SF
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-extrabold">
                  {inspectedTotals.fgCount} FG
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium truncate">
                RM: {inspectedTotals.rawWeight.toLocaleString('en-IN', { maximumFractionDigits: 1 })} KG
              </p>
            </div>
          </div>

          {/* Filter & Tab Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Category Filter Chips */}
              <button
                type="button"
                onClick={() => setInspectCategoryFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  inspectCategoryFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                All ({inspectedItems.length})
              </button>
              <button
                type="button"
                onClick={() => setInspectCategoryFilter('RAW')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  inspectCategoryFilter === 'RAW'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100/70 border border-blue-200/60'
                }`}
              >
                Raw Materials ({inspectedTotals.rawCount})
              </button>
              <button
                type="button"
                onClick={() => setInspectCategoryFilter('SEMI')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  inspectCategoryFilter === 'SEMI'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100/70 border border-purple-200/60'
                }`}
              >
                Semi Finished ({inspectedTotals.semiCount})
              </button>
              <button
                type="button"
                onClick={() => setInspectCategoryFilter('FINISHED')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  inspectCategoryFilter === 'FINISHED'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100/70 border border-emerald-200/60'
                }`}
              >
                Finished Goods ({inspectedTotals.fgCount})
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter items or SKU code..."
                  value={inspectSearch}
                  onChange={e => setInspectSearch(e.target.value)}
                  className="pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 w-44 sm:w-52"
                />
                {inspectSearch && (
                  <button
                    type="button"
                    onClick={() => setInspectSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* View Tab Toggle */}
              {locationDetails?.recentMovements && locationDetails.recentMovements.length > 0 && (
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() => setInspectActiveTab('items')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      inspectActiveTab === 'items'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Items
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectActiveTab('movements')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      inspectActiveTab === 'movements'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Movements ({locationDetails.recentMovements.length})
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* MAIN VIEW: Stored Items Table */}
          {inspectActiveTab === 'items' && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white flex-1 flex flex-col h-[380px]">
              <div className="overflow-x-auto flex-1 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50/90 sticky top-0 z-10 border-b border-slate-200 text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider backdrop-blur-xs">
                    <tr>
                      <th className="px-3 py-2 w-10 text-center">#</th>
                      <th className="px-3 py-2">Item / SKU Details</th>
                      <th className="px-3 py-2 w-28">Category</th>
                      <th className="px-3 py-2 text-right w-28">Stored Quantity</th>
                      <th className="px-3 py-2 text-right w-44">Respective Weight</th>
                      <th className="px-3 py-2 text-right w-24">Specs / Reels</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredInspectedItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="h-[300px] text-center text-slate-400">
                          {inspectSearch ? (
                            <p>No items matching "{inspectSearch}" in this location.</p>
                          ) : (
                            <div className="space-y-1">
                              <p className="font-semibold text-slate-600">No active inventory balance found in this location.</p>
                              <p className="text-[11px] text-slate-400">Stock transfers or purchase batch receipts will automatically appear here.</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredInspectedItems.map((item, idx) => {
                        const isRaw = item.categoryType === 'Raw Material';
                        const isSemi = item.categoryType === 'Semi Finished';
                        const categoryBadge = isRaw
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : isSemi
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200';

                        const isReelsExpanded = !!expandedReels[item.skuId];
                        const hasReels = Array.isArray(item.reels) && item.reels.length > 0;

                        return (
                          <React.Fragment key={`${item.skuId}_${idx}`}>
                            <tr className="hover:bg-slate-50/70 transition-colors">
                              {/* # */}
                              <td className="px-3 py-2 text-center font-semibold text-slate-400">
                                {idx + 1}
                              </td>

                              {/* SKU Code & Name in ONE line */}
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2 whitespace-nowrap min-w-0">
                                  <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-slate-200/80 shrink-0">
                                    {item.sku.skuCode}
                                  </span>
                                  <span className="text-slate-800 font-semibold text-xs truncate max-w-[240px]" title={item.sku.name}>
                                    {item.sku.name}
                                  </span>
                                  {item.sku.paperType && item.sku.paperType !== 'None' && (
                                    <span className="text-[10px] text-slate-400 shrink-0">
                                      ({item.sku.paperType})
                                    </span>
                                  )}
                                  {item.subLocationName && (
                                    <span className="text-[10px] text-slate-400 shrink-0">
                                      • Loc: {item.subLocationName}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Category Badge in ONE line */}
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${categoryBadge}`}>
                                  {item.categoryType}
                                </span>
                              </td>

                              {/* Stored Quantity in ONE line */}
                              <td className="px-3 py-2 text-right font-bold text-slate-900 whitespace-nowrap">
                                <span className="text-xs">
                                  {item.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                                </span>
                                <span className="text-[10.5px] font-semibold text-slate-500 ml-1">
                                  {item.sku.unit}
                                </span>
                              </td>

                              {/* Respective Weight (KG) in ONE line */}
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Scale className="w-3 h-3 text-blue-500 shrink-0" />
                                  <span className="font-extrabold text-blue-900 text-xs">
                                    {item.formattedWeight}
                                  </span>
                                  {item.weightNote && item.weightKg !== null && item.weightKg > 0 && (
                                    <span className="text-[10px] text-slate-400 font-normal truncate max-w-[130px]" title={item.weightNote}>
                                      ({item.weightNote})
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Specs / Reels in ONE line */}
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                {hasReels ? (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedReels(prev => ({ ...prev, [item.skuId]: !prev[item.skuId] }))}
                                    className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-[10.5px] font-bold border border-blue-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>{item.reels!.length} Reels</span>
                                    {isReelsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  </button>
                                ) : (
                                  <div className="text-[10.5px] text-slate-500 font-medium whitespace-nowrap inline-flex items-center gap-1">
                                    {item.sku.gsm ? <span>{item.sku.gsm} GSM</span> : null}
                                    {(item.sku.width || item.sku.length) ? (
                                      <span>• {item.sku.width || ''}{item.sku.length ? `×${item.sku.length}` : ''}"</span>
                                    ) : null}
                                    {!item.sku.gsm && !item.sku.width && <span>—</span>}
                                  </div>
                                )}
                              </td>
                            </tr>

                            {/* Expandable Reels Sub-Row */}
                            {hasReels && isReelsExpanded && (
                              <tr className="bg-blue-50/30">
                                <td colSpan={6} className="px-5 py-3">
                                  <div className="bg-white border border-blue-100 rounded-lg p-2.5 shadow-2xs space-y-2">
                                    <div className="flex items-center justify-between text-[11px] font-bold text-blue-900 border-b border-blue-100 pb-1">
                                      <span>Stored Reels Breakdown ({item.reels!.length} reels)</span>
                                      <span>Batch Weights</span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                      {item.reels!.map((r: any, rIdx: number) => (
                                        <div key={rIdx} className="p-2 bg-slate-50 border border-slate-200/80 rounded-md text-left">
                                          <div className="font-mono font-bold text-slate-800 text-[11px]">
                                            {r.reelNumber || `Reel #${rIdx + 1}`}
                                          </div>
                                          <div className="text-blue-700 font-extrabold text-xs mt-0.5">
                                            {Number(r.weight || 0).toLocaleString('en-IN')} KG
                                          </div>
                                          {(r.gsm || r.width) && (
                                            <div className="text-[9.5px] text-slate-400 mt-0.5">
                                              {r.gsm ? `${r.gsm} GSM` : ''} {r.width ? `• ${r.width}"` : ''}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>

                  {/* Summary Totals Footer */}
                  {filteredInspectedItems.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-xs font-bold text-slate-900 sticky bottom-0 z-10">
                      <tr>
                        <td colSpan={3} className="px-3.5 py-2.5 text-slate-800">
                          Total ({filteredInspectedItems.length} items shown)
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-extrabold text-slate-900">
                          {filteredInspectedItems.reduce((sum, i) => sum + i.quantity, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Units
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-extrabold text-blue-900">
                          <div className="flex items-center justify-end gap-1.5">
                            <Scale className="w-3.5 h-3.5 text-blue-600" />
                            <span>
                              {filteredInspectedItems.reduce((sum, i) => sum + (i.weightKg || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} KG
                            </span>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* SECONDARY VIEW: Recent Movements */}
          {inspectActiveTab === 'movements' && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white flex-1 flex flex-col h-[380px]">
              <div className="overflow-x-auto flex-1 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2">Date & Time</th>
                      <th className="px-3 py-2">SKU Item</th>
                      <th className="px-3 py-2 text-center">Direction</th>
                      <th className="px-3 py-2 text-right">Quantity</th>
                      <th className="px-3 py-2">Transaction</th>
                      <th className="px-3 py-2">User / Ref</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {(!locationDetails?.recentMovements || locationDetails.recentMovements.length === 0) ? (
                      <tr>
                        <td colSpan={6} className="h-[300px] text-center text-slate-400">
                          No recent inventory ledger movements recorded for this location.
                        </td>
                      </tr>
                    ) : (
                      locationDetails.recentMovements.map((m: any, mIdx: number) => {
                        const isDirIn = m.direction === 'IN' || (m.qtyIn && m.qtyIn > 0);
                        const qty = m.quantity || m.qtyIn || m.qtyOut || 0;
                        const dateStr = m.timestamp || m.createdAt ? new Date(m.timestamp || m.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        }) : '—';

                        return (
                          <tr key={m._id || mIdx} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-3 py-2 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                              {dateStr}
                            </td>
                            <td className="px-3 py-2">
                              <span className="font-mono font-bold text-slate-800 mr-1.5">
                                {m.skuId?.skuCode || m.sku?.skuCode || 'SKU'}
                              </span>
                              <span className="text-slate-600 text-[11px]">
                                {m.skuId?.name || m.sku?.name || ''}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isDirIn ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {isDirIn ? 'IN' : 'OUT'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-slate-900 whitespace-nowrap">
                              {isDirIn ? '+' : '-'}{qty.toLocaleString('en-IN')} {m.skuId?.unit || m.sku?.unit || ''}
                            </td>
                            <td className="px-3 py-2 text-slate-600 text-[11px]">
                              {m.transactionType || m.referenceType || 'Ledger Entry'}
                            </td>
                            <td className="px-3 py-2 text-slate-500 text-[11px] truncate max-w-[130px]" title={m.createdBy?.fullName || m.referenceNumber}>
                              {m.createdBy?.fullName || m.referenceNumber || '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* UNIVERSAL PRINT VOUCHER MODAL: LOCATION STOCK MANIFEST */}
      {showPrintManifest && selectedLocationForDetails && (() => {
        const manifestColumns = [
          { header: '#', align: 'center' as const, width: 'w-8', render: (_: any, idx: number) => <span className="font-bold text-slate-500">{idx + 1}</span> },
          {
            header: 'Item / SKU Specification',
            render: (item: any) => (
              <div>
                <div className="font-bold text-slate-900">{item.sku.name}</div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {item.sku.skuCode}
                  {item.sku.gsm ? ` • ${item.sku.gsm} GSM` : ''}
                  {(item.sku.width || item.sku.length) ? ` • ${item.sku.width || ''}${item.sku.length ? `×${item.sku.length}` : ''}"` : ''}
                </div>
              </div>
            )
          },
          {
            header: 'Category',
            align: 'center' as const,
            render: (item: any) => (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {item.categoryType}
              </span>
            )
          },
          {
            header: 'Stored Quantity',
            align: 'right' as const,
            render: (item: any) => (
              <span className="font-mono font-bold text-slate-900">
                {item.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {item.unit}
              </span>
            )
          },
          {
            header: 'Calculated Weight',
            align: 'right' as const,
            render: (item: any) => (
              <div className="text-right">
                <span className="font-mono font-bold text-blue-900">{item.formattedWeight}</span>
                {item.weightNote && item.weightKg !== null && item.weightKg > 0 && (
                  <span className="text-[9.5px] text-slate-400 block">({item.weightNote})</span>
                )}
              </div>
            )
          },
          {
            header: 'Physical Format',
            align: 'center' as const,
            render: (item: any) => (
              <span className="text-[10px] text-slate-600">
                {item.reels?.length ? `${item.reels.length} Reels` : item.sku.paperType || item.unit}
              </span>
            )
          }
        ];

        return (
          <UniversalPrintVoucherModal
            isOpen={showPrintManifest}
            onClose={() => setShowPrintManifest(false)}
            modalTitle="Location Stock Manifest Print Preview"
            modalSubtitle="Official Godown / Storage Location Inventory Manifest"
            companyName="SKBW WAREHOUSE & LOGISTICS"
            voucherSubtitle="STORAGE LOCATION STOCK MANIFEST • INVENTORY AUDIT VOUCHER"
            voucherNumber={`LOC-${selectedLocationForDetails.name}`}
            status={{
              label: selectedLocationForDetails.status?.toUpperCase() || 'ACTIVE',
              variant: selectedLocationForDetails.status === 'Active' ? 'success' : 'warning',
            }}
            metaLeft={{
              title: 'Storage Location Details',
              primaryTitle: `${selectedLocationForDetails.name} (${selectedLocationForDetails.level})`,
              rows: [
                { label: 'Hierarchy Path', value: locationBreadcrumb },
                { label: 'Location Code', value: selectedLocationForDetails.code || selectedLocationForDetails.name },
                ...(selectedLocationForDetails.capacity ? [{ label: 'Rated Capacity', value: `${selectedLocationForDetails.capacity} kg` }] : []),
              ]
            }}
            metaRight={{
              title: 'Audit & Physical Count Info',
              fields: [
                { label: 'Manifest Date', value: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
                { label: 'Stored SKU Count', value: `${inspectedItems.length} SKUs` },
                { label: 'Total Physical Units', value: `${inspectedTotals.totalQty.toLocaleString('en-IN')} Units` },
                { label: 'Consolidated Weight', value: `${inspectedTotals.totalWeight.toLocaleString('en-IN')} KG` },
              ]
            }}
            columns={manifestColumns}
            data={inspectedItems}
            summaryLeft={{
              title: 'Location Category Breakdown',
              rows: [
                { label: 'Raw Materials', value: `${inspectedTotals.rawCount} items (${inspectedTotals.rawWeight.toLocaleString('en-IN')} KG)` },
                { label: 'Semi Finished Goods', value: `${inspectedTotals.semiCount} items` },
                { label: 'Finished Goods', value: `${inspectedTotals.fgCount} items` },
              ]
            }}
            summaryRight={{
              rows: [
                { label: 'Total Units Stored', value: `${inspectedTotals.totalQty.toLocaleString('en-IN')} Units` },
                { label: 'Total Net Weight', value: `${inspectedTotals.totalWeight.toLocaleString('en-IN')} KG`, isGrandTotal: true },
              ]
            }}
            signatures={[
              { title: 'Warehouse Storekeeper', subtitle: 'Physical Count Verification' },
              { title: 'Inventory Auditor', subtitle: 'Stock Reconciliation' },
              { title: 'Plant / Operations Head', subtitle: 'Executive Authorization' },
            ]}
          />
        );
      })()}

      {/* FACTORY STOCK & LOCATION MANIFEST PRINT MODAL */}
      <FactoryStockPrintModal
        isOpen={showFactoryPrintModal}
        onClose={() => setShowFactoryPrintModal(false)}
        companyName={selectedCompany?.name || 'SKBW MANUFACTURING & WAREHOUSE'}
        activeFactory={activeFactory}
        factories={factories}
        onSelectFactory={(fId) => setSelectedFactoryId(fId)}
        locations={locations}
        skus={skus}
        balances={balances}
      />

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
          {confirmNodeHasData ? (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2.5">
              <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Deletion Blocked: Active Data Found</span>
              </div>
              <p className="text-xs text-rose-800 leading-relaxed">
                <strong>{deleteConfirmNode?.name}</strong> ({deleteConfirmNode?.level}) cannot be deleted because it contains active inventory data:
              </p>
              <div className="grid grid-cols-3 gap-2 bg-white/90 p-2.5 rounded-lg border border-rose-100 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase tracking-wider font-semibold">Total Stock</span>
                  <span className="font-bold text-rose-700 text-sm">{confirmNodeTotalQty.toLocaleString('en-IN')} units</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase tracking-wider font-semibold">Distinct SKUs</span>
                  <span className="font-bold text-slate-800 text-sm">{confirmNodeTotalSkus} item(s)</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase tracking-wider font-semibold">Breakdown</span>
                  <span className="text-[11px] text-slate-600 font-medium block">
                    {confirmNodeMetrics?.rawMatQty ? `${confirmNodeMetrics.rawMatQty} RM ` : ''}
                    {confirmNodeMetrics?.semiQty ? `${confirmNodeMetrics.semiQty} Semi ` : ''}
                    {confirmNodeMetrics?.fgQty ? `${confirmNodeMetrics.fgQty} FG` : ''}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-rose-700 font-medium">
                Please transfer, consume, or clear all stock and associated items from this {deleteConfirmNode?.level?.toLowerCase() || 'location'} before deleting it.
              </p>
            </div>
          ) : (
            <>
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
            </>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              onClick={() => setDeleteConfirmNode(null)}
              className="px-3.5 py-1.5 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50 cursor-pointer text-xs"
            >
              {confirmNodeHasData ? 'Close' : 'Cancel'}
            </button>
            <button
              disabled={confirmNodeHasData}
              onClick={handleDeleteLocation}
              className={`px-4 py-1.5 rounded-lg font-semibold shadow-xs text-xs flex items-center gap-1.5 ${
                confirmNodeHasData
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  : 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
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

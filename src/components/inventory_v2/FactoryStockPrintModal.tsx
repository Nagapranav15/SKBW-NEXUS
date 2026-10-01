import React, { useRef, useState, useMemo } from 'react';
import {
  X, Printer, Download, Search, Filter,
  Building2, Layers, MapPin, Scale, Package,
  Boxes, CheckCircle2, ChevronDown, FileSpreadsheet, Eye
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { WarehouseLocationV2, SkuV2 } from '../../api/mfgApiV2';
import { calculateSkuWeightInKg } from './WarehouseStructureV2';

interface FactoryStockPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyName?: string;
  activeFactory: WarehouseLocationV2 | null;
  factories: WarehouseLocationV2[];
  onSelectFactory?: (factoryId: string) => void;
  locations: WarehouseLocationV2[];
  skus: SkuV2[];
  balances: any[];
}

export const FactoryStockPrintModal: React.FC<FactoryStockPrintModalProps> = ({
  isOpen,
  onClose,
  companyName = 'SKBW MANUFACTURING & WAREHOUSE',
  activeFactory,
  factories = [],
  onSelectFactory,
  locations = [],
  skus = [],
  balances = []
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Filters inside modal preview
  const [selectedFloorFilter, setSelectedFloorFilter] = useState<string>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'ALL' | 'RAW' | 'SEMI' | 'FINISHED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewSection, setViewSection] = useState<'ALL' | 'ROSTER' | 'LOCATIONS'>('ALL');

  // Map of all locations for fast lookup
  const locMap = useMemo(() => {
    const map = new Map<string, WarehouseLocationV2>();
    locations.forEach(loc => {
      if (loc._id) map.set(String(loc._id), loc);
    });
    return map;
  }, [locations]);

  // Helper: check if a location belongs to the active factory
  const isDescendantOfFactory = (loc: WarehouseLocationV2 | undefined | null, factoryId: string): boolean => {
    if (!loc || !factoryId) return false;
    if (loc._id === factoryId) return true;
    let currParentId = loc.parentId ? String(loc.parentId) : null;
    let guard = 0;
    while (currParentId && guard < 10) {
      if (currParentId === factoryId) return true;
      const parent = locMap.get(currParentId);
      if (!parent) break;
      currParentId = parent.parentId ? String(parent.parentId) : null;
      guard++;
    }
    return false;
  };

  // Locations strictly belonging to active factory
  const factoryLocations = useMemo(() => {
    if (!activeFactory?._id) return [];
    return locations.filter(l => isDescendantOfFactory(l, activeFactory._id!));
  }, [locations, activeFactory, locMap]);

  const factoryLocationIds = useMemo(() => {
    return new Set<string>(factoryLocations.map(l => String(l._id)));
  }, [factoryLocations]);

  const factoryLocationNames = useMemo(() => {
    return new Set<string>(factoryLocations.map(l => (l.name || '').toLowerCase().trim()));
  }, [factoryLocations]);

  // Floors, Zones, and Storage Locations in this Factory
  const factoryFloors = useMemo(() => {
    if (!activeFactory?._id) return [];
    return factoryLocations.filter(l => l.parentId === activeFactory._id && l.level === 'Floor');
  }, [factoryLocations, activeFactory]);

  const factoryZones = useMemo(() => {
    const floorIds = new Set(factoryFloors.map(f => f._id));
    return factoryLocations.filter(l => l.level === 'Zone' && (floorIds.has(l.parentId) || l.parentId === activeFactory?._id));
  }, [factoryLocations, factoryFloors, activeFactory]);

  const factoryStorageLocations = useMemo(() => {
    const zoneIds = new Set(factoryZones.map(z => z._id));
    const floorIds = new Set(factoryFloors.map(f => f._id));
    return factoryLocations.filter(l =>
      l.level === 'Storage Location' && (zoneIds.has(l.parentId) || floorIds.has(l.parentId) || l.parentId === activeFactory?._id)
    );
  }, [factoryLocations, factoryZones, factoryFloors, activeFactory]);

  // Compute Location Breadcrumb Path (e.g. Ground Floor › Zone A › Top Shelf)
  const getLocationPathInfo = (locIdOrObj: any): {
    path: string;
    floorName: string;
    zoneName: string;
    locationName: string;
  } => {
    let loc: WarehouseLocationV2 | undefined;
    if (typeof locIdOrObj === 'object' && locIdOrObj !== null) {
      loc = locIdOrObj._id ? (locMap.get(String(locIdOrObj._id)) || locIdOrObj) : locIdOrObj;
    } else if (locIdOrObj) {
      loc = locMap.get(String(locIdOrObj));
    }

    if (!loc) {
      return { path: 'Main Factory Storage', floorName: 'Main Plant', zoneName: 'General', locationName: 'Unassigned' };
    }

    const parts: string[] = [loc.name];
    let curr = loc.parentId ? String(loc.parentId) : null;
    let guard = 0;
    while (curr && curr !== activeFactory?._id && guard < 6) {
      const p = locMap.get(curr);
      if (!p) break;
      parts.unshift(p.name);
      curr = p.parentId ? String(p.parentId) : null;
      guard++;
    }

    let floorName = 'Main Plant';
    let zoneName = 'General';
    let locationName = loc.name;

    if (parts.length >= 3) {
      floorName = parts[0];
      zoneName = parts[1];
      locationName = parts[2];
    } else if (parts.length === 2) {
      floorName = parts[0];
      zoneName = parts[1];
    } else if (parts.length === 1) {
      if (loc.level === 'Floor') floorName = loc.name;
      else if (loc.level === 'Zone') zoneName = loc.name;
    }

    return {
      path: parts.join(' › '),
      floorName,
      zoneName,
      locationName
    };
  };

  // Comprehensive Factory Inventory Items
  const factoryItems = useMemo(() => {
    if (!activeFactory?._id) return [];

    const itemsMap = new Map<string, {
      id: string;
      sku: SkuV2;
      skuCode: string;
      skuName: string;
      categoryType: 'Raw Material' | 'Semi Finished' | 'Finished Goods';
      category: string;
      locationPath: string;
      floorName: string;
      zoneName: string;
      locationName: string;
      locationId: string;
      quantity: number;
      unit: string;
      weightKg: number | null;
      formattedWeight: string;
      weightNote: string;
      reels?: any[];
      batchNumber?: string;
    }>();

    // 1. Process from live balances
    if (Array.isArray(balances) && balances.length > 0) {
      balances.forEach((b: any) => {
        const bLocId = b.locationId ? String(b.locationId._id || b.locationId) : '';
        const bLocName = (b.location?.name || b.locationName || '').toLowerCase().trim();

        const isLocMatch = (bLocId && factoryLocationIds.has(bLocId)) ||
          (bLocName && factoryLocationNames.has(bLocName)) ||
          (b.location && isDescendantOfFactory(b.location, activeFactory._id!));

        if (isLocMatch) {
          const rawSkuId = b.skuId || b.sku?._id;
          const skuIdStr = rawSkuId ? String(rawSkuId._id || rawSkuId) : '';
          const skuObj: SkuV2 | undefined = b.sku || skus.find(s => String(s._id) === skuIdStr || s.skuCode === skuIdStr);
          const qty = Number(b.onHand ?? b.quantity ?? b.qty) || 0;

          if (qty > 0 && skuObj) {
            const cat = (skuObj.category || '').toLowerCase();
            const group = (skuObj.group || '').toLowerCase();
            const itemType = (skuObj.itemType || '').toLowerCase();
            const paperType = (skuObj.paperType || '').toLowerCase();

            const isRaw = cat.includes('raw') || cat.includes('material') || cat.includes('paper') ||
              group.includes('material') || group.includes('paper') || group.includes('raw') ||
              itemType.includes('material') || itemType.includes('raw') || (paperType !== 'none' && paperType !== '');

            const isSemi = !isRaw && (cat.includes('semi') || group.includes('semi') || itemType.includes('semi') || group.includes('wip') || group.includes('work in progress'));

            const categoryType: 'Raw Material' | 'Semi Finished' | 'Finished Goods' = isRaw
              ? 'Raw Material'
              : isSemi
                ? 'Semi Finished'
                : 'Finished Goods';

            const weightInfo = calculateSkuWeightInKg(skuObj, qty, b.reels);
            const pathInfo = getLocationPathInfo(b.location || bLocId || bLocName);
            const locKey = bLocId || pathInfo.path;
            const itemKey = `${locKey}__${skuObj.skuCode}__${b.batchNumber || ''}`;

            if (itemsMap.has(itemKey)) {
              const existing = itemsMap.get(itemKey)!;
              const newQty = existing.quantity + qty;
              const combinedReels = [...(existing.reels || []), ...(b.reels || [])];
              const combinedWeight = calculateSkuWeightInKg(skuObj, newQty, combinedReels);
              itemsMap.set(itemKey, {
                ...existing,
                quantity: newQty,
                weightKg: combinedWeight.weightKg,
                formattedWeight: combinedWeight.formattedWeight,
                weightNote: combinedWeight.calcNote,
                reels: combinedReels
              });
            } else {
              itemsMap.set(itemKey, {
                id: itemKey,
                sku: skuObj,
                skuCode: skuObj.skuCode,
                skuName: skuObj.name,
                categoryType,
                category: skuObj.category || 'General',
                locationPath: pathInfo.path,
                floorName: pathInfo.floorName,
                zoneName: pathInfo.zoneName,
                locationName: pathInfo.locationName,
                locationId: bLocId,
                quantity: qty,
                unit: skuObj.unit || 'unit',
                weightKg: weightInfo.weightKg,
                formattedWeight: weightInfo.formattedWeight,
                weightNote: weightInfo.calcNote,
                reels: b.reels,
                batchNumber: b.batchNumber
              });
            }
          }
        }
      });
    }

    // 2. Fallback from SKUs present stock
    skus.forEach(s => {
      const sId = String(s._id || s.skuCode);
      const initialLocId = String(s.initialLocationId || (s as any).locationId || s.initialLocation?._id || '');
      const defaultLocName = (s.defaultLocation || s.warehouseLocation || (s as any).location || '').toLowerCase().trim();

      const isLocMatch = (initialLocId && factoryLocationIds.has(initialLocId)) ||
        (defaultLocName && factoryLocationNames.has(defaultLocName));

      if (isLocMatch) {
        const stock = Number(s.presentStock ?? s.openingStock) || 0;
        if (stock > 0) {
          const pathInfo = getLocationPathInfo(initialLocId || defaultLocName);
          const locKey = initialLocId || pathInfo.path;
          const itemKey = `${locKey}__${s.skuCode}__initial`;

          if (!itemsMap.has(itemKey)) {
            const cat = (s.category || '').toLowerCase();
            const group = (s.group || '').toLowerCase();
            const itemType = (s.itemType || '').toLowerCase();
            const paperType = (s.paperType || '').toLowerCase();

            const isRaw = cat.includes('raw') || cat.includes('material') || cat.includes('paper') ||
              group.includes('material') || group.includes('paper') || group.includes('raw') ||
              itemType.includes('material') || itemType.includes('raw') || (paperType !== 'none' && paperType !== '');

            const isSemi = !isRaw && (cat.includes('semi') || group.includes('semi') || itemType.includes('semi') || group.includes('wip'));

            const categoryType = isRaw ? 'Raw Material' : isSemi ? 'Semi Finished' : 'Finished Goods';
            const weightInfo = calculateSkuWeightInKg(s, stock);

            itemsMap.set(itemKey, {
              id: itemKey,
              sku: s,
              skuCode: s.skuCode,
              skuName: s.name,
              categoryType,
              category: s.category || 'General',
              locationPath: pathInfo.path,
              floorName: pathInfo.floorName,
              zoneName: pathInfo.zoneName,
              locationName: pathInfo.locationName,
              locationId: initialLocId,
              quantity: stock,
              unit: s.unit || 'unit',
              weightKg: weightInfo.weightKg,
              formattedWeight: weightInfo.formattedWeight,
              weightNote: weightInfo.calcNote
            });
          }
        }
      }
    });

    return Array.from(itemsMap.values()).sort((a, b) => {
      if (a.floorName !== b.floorName) return a.floorName.localeCompare(b.floorName);
      if (a.zoneName !== b.zoneName) return a.zoneName.localeCompare(b.zoneName);
      return a.locationName.localeCompare(b.locationName);
    });
  }, [activeFactory, factoryLocationIds, factoryLocationNames, balances, skus, locMap]);

  // Filtered Items for Display
  const filteredItems = useMemo(() => {
    return factoryItems.filter(item => {
      // Floor filter
      if (selectedFloorFilter !== 'ALL' && item.floorName !== selectedFloorFilter) {
        return false;
      }
      // Category filter
      if (selectedCategoryFilter === 'RAW' && item.categoryType !== 'Raw Material') return false;
      if (selectedCategoryFilter === 'SEMI' && item.categoryType !== 'Semi Finished') return false;
      if (selectedCategoryFilter === 'FINISHED' && item.categoryType !== 'Finished Goods') return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const codeMatch = item.skuCode.toLowerCase().includes(q);
        const nameMatch = item.skuName.toLowerCase().includes(q);
        const locMatch = item.locationPath.toLowerCase().includes(q);
        const catMatch = item.category.toLowerCase().includes(q);
        const batchMatch = (item.batchNumber || '').toLowerCase().includes(q);
        return codeMatch || nameMatch || locMatch || catMatch || batchMatch;
      }

      return true;
    });
  }, [factoryItems, selectedFloorFilter, selectedCategoryFilter, searchQuery]);

  // Overall Factory Totals
  const factoryTotals = useMemo(() => {
    let totalStockQty = 0;
    let totalNetWeightKg = 0;
    const uniqueSkus = new Set<string>();
    const occupiedLocationKeys = new Set<string>();

    let rawMatCount = 0;
    let rawMatQty = 0;
    let rawMatWeight = 0;

    let semiCount = 0;
    let semiQty = 0;
    let semiWeight = 0;

    let fgCount = 0;
    let fgQty = 0;
    let fgWeight = 0;

    factoryItems.forEach(item => {
      totalStockQty += item.quantity;
      if (item.weightKg) totalNetWeightKg += item.weightKg;
      uniqueSkus.add(item.skuCode);
      occupiedLocationKeys.add(item.locationPath);

      if (item.categoryType === 'Raw Material') {
        rawMatCount++;
        rawMatQty += item.quantity;
        if (item.weightKg) rawMatWeight += item.weightKg;
      } else if (item.categoryType === 'Semi Finished') {
        semiCount++;
        semiQty += item.quantity;
        if (item.weightKg) semiWeight += item.weightKg;
      } else {
        fgCount++;
        fgQty += item.quantity;
        if (item.weightKg) fgWeight += item.weightKg;
      }
    });

    const totalStorageLocationsCount = factoryStorageLocations.length || factoryZones.length;
    const occupiedLocationsCount = Math.min(occupiedLocationKeys.size, totalStorageLocationsCount || occupiedLocationKeys.size);
    const availableLocationsCount = Math.max(0, totalStorageLocationsCount - occupiedLocationsCount);

    return {
      totalStockQty,
      totalNetWeightKg,
      totalUniqueSkus: uniqueSkus.size,
      totalFloors: factoryFloors.length,
      totalZones: factoryZones.length,
      totalStorageLocations: totalStorageLocationsCount,
      occupiedLocationsCount,
      availableLocationsCount,
      rawMatCount,
      rawMatQty,
      rawMatWeight,
      semiCount,
      semiQty,
      semiWeight,
      fgCount,
      fgQty,
      fgWeight
    };
  }, [factoryItems, factoryStorageLocations, factoryZones, factoryFloors]);

  // Zone-Wise Summaries Table
  const zoneSummaries = useMemo(() => {
    return factoryZones.map(zone => {
      // Find parent floor
      const floor = zone.parentId ? locMap.get(String(zone.parentId)) : null;
      const floorName = floor ? floor.name : 'Main Floor';

      // Storage locations under this zone
      const childLocs = factoryStorageLocations.filter(l => l.parentId === zone._id);

      // Items in this zone
      const zoneItems = factoryItems.filter(item =>
        item.zoneName === zone.name || (zone._id && item.locationId === zone._id)
      );

      let zRawQty = 0;
      let zRawWeight = 0;
      let zSemiQty = 0;
      let zFgQty = 0;
      let zWeight = 0;
      const zSkus = new Set<string>();

      zoneItems.forEach(i => {
        zSkus.add(i.skuCode);
        if (i.weightKg) zWeight += i.weightKg;
        if (i.categoryType === 'Raw Material') {
          zRawQty += i.quantity;
          if (i.weightKg) zRawWeight += i.weightKg;
        } else if (i.categoryType === 'Semi Finished') {
          zSemiQty += i.quantity;
        } else {
          zFgQty += i.quantity;
        }
      });

      return {
        zoneId: zone._id,
        zoneName: zone.name,
        floorName,
        storageLocationsCount: childLocs.length,
        itemCount: zoneItems.length,
        uniqueSkusCount: zSkus.size,
        rawMatQty: zRawQty,
        rawMatWeight: zRawWeight,
        semiQty: zSemiQty,
        fgQty: zFgQty,
        totalWeightKg: zWeight
      };
    });
  }, [factoryZones, factoryStorageLocations, factoryItems, locMap]);

  // Export to Excel
  const handleExportExcel = () => {
    if (!activeFactory || factoryItems.length === 0) return;

    // Sheet 1: Master Inventory Roster
    const rosterData = factoryItems.map((item, idx) => ({
      '#': idx + 1,
      'Factory': activeFactory.name,
      'Floor': item.floorName,
      'Zone': item.zoneName,
      'Storage Location': item.locationName,
      'Full Hierarchy': item.locationPath,
      'SKU Code': item.skuCode,
      'Item Name': item.skuName,
      'Category': item.categoryType,
      'Stored Quantity': item.quantity,
      'Unit': item.unit,
      'Calculated Weight (KG)': item.weightKg ?? 'N/A',
      'Weight Note': item.weightNote,
      'GSM': item.sku.gsm || '',
      'Width': item.sku.width || '',
      'Length': item.sku.length || '',
      'Brand': item.sku.brand || '',
      'Batch Number': item.batchNumber || ''
    }));

    // Sheet 2: Zone Summaries
    const summaryData = zoneSummaries.map((z, idx) => ({
      '#': idx + 1,
      'Factory': activeFactory.name,
      'Floor': z.floorName,
      'Zone': z.zoneName,
      'Storage Locations': z.storageLocationsCount,
      'Unique SKUs': z.uniqueSkusCount,
      'Raw Materials (KG)': z.rawMatWeight,
      'Semi Finished (Units)': z.semiQty,
      'Finished Goods (Units)': z.fgQty,
      'Total Weight (KG)': z.totalWeightKg
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(rosterData);
    const ws2 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Factory_Master_Roster');
    XLSX.utils.book_append_sheet(wb, ws2, 'Zone_Summaries');
    XLSX.writeFile(wb, `${activeFactory.name.replace(/\s+/g, '_')}_Factory_Inventory_Manifest.xlsx`);
  };

  // Print Handshake
  const handlePrint = () => {
    const printContent = printAreaRef.current;
    if (!printContent) return;

    const printWin = window.open('', '_blank', 'width=1000,height=800');
    if (!printWin) {
      window.print();
      return;
    }

    const docTitle = `FACTORY_AUDIT_${activeFactory?.name || 'PLANT'}_${new Date().toISOString().slice(0, 10)}`;

    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${docTitle}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10pt;
      color: #0f172a;
      background: #fff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .print-sheet {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px;
    }
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2.5px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .company-title {
      font-size: 18pt;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #0f172a;
    }
    .voucher-sub {
      font-size: 8.5pt;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 3px;
    }
    .doc-badge {
      text-align: right;
    }
    .doc-number {
      font-size: 13pt;
      font-weight: 800;
      font-family: monospace;
      color: #1d4ed8;
    }
    .status-pill {
      display: inline-block;
      padding: 3px 10px;
      font-size: 8pt;
      font-weight: 800;
      text-transform: uppercase;
      border-radius: 6px;
      margin-top: 4px;
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }

    /* Top Metadata Grid */
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
      font-size: 9pt;
    }
    .meta-box h4 {
      font-size: 7.5pt;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 800;
      margin-bottom: 4px;
      letter-spacing: 0.5px;
    }
    .meta-box .primary-val {
      font-size: 11pt;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      padding: 1.5px 0;
      font-size: 8.5pt;
    }
    .meta-row .label { color: #64748b; font-weight: 500; }
    .meta-row .value { color: #0f172a; font-weight: 700; }

    /* Metric Cards Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 18px;
    }
    .metric-card {
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .metric-title {
      font-size: 7pt;
      font-weight: 800;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .metric-value {
      font-size: 15pt;
      font-weight: 900;
      color: #0f172a;
      margin: 4px 0 2px 0;
      line-height: 1.1;
    }
    .metric-sub {
      font-size: 7.5pt;
      color: #64748b;
      font-weight: 600;
    }

    /* Section Headers */
    .section-title {
      font-size: 10pt;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-left: 3.5px solid #2563eb;
      padding-left: 8px;
      margin: 18px 0 8px 0;
    }

    /* Tables */
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 8.5pt;
    }
    table.data-table th, table.data-table td {
      border: 1px solid #cbd5e1;
      padding: 5px 7px;
    }
    table.data-table th {
      background: #f1f5f9;
      font-weight: 800;
      text-transform: uppercase;
      font-size: 7pt;
      color: #1e293b;
      letter-spacing: 0.3px;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-mono { font-family: monospace; }
    .font-bold { font-weight: 700; }
    .badge-raw { background: #eff6ff; color: #1d4ed8; padding: 1.5px 5px; border-radius: 4px; font-weight: 700; font-size: 7pt; }
    .badge-semi { background: #fef3c7; color: #b45309; padding: 1.5px 5px; border-radius: 4px; font-weight: 700; font-size: 7pt; }
    .badge-fg { background: #ecfdf5; color: #047857; padding: 1.5px 5px; border-radius: 4px; font-weight: 700; font-size: 7pt; }

    /* Summary Wrapper */
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 24px;
      font-size: 8.5pt;
    }
    .summary-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .summary-card h4 {
      font-size: 7.5pt;
      text-transform: uppercase;
      font-weight: 800;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 6px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 2.5px 0;
    }
    .summary-row.grand {
      border-top: 1.5px solid #0f172a;
      margin-top: 4px;
      padding-top: 5px;
      font-weight: 900;
      font-size: 10pt;
      color: #0f172a;
    }

    /* Signatures */
    .signatures-block {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      padding-top: 36px;
      border-top: 1.5px solid #cbd5e1;
      margin-top: 24px;
      text-align: center;
      font-size: 8pt;
      color: #475569;
    }
    .sig-line {
      border-top: 1px dashed #64748b;
      padding-top: 6px;
      font-weight: 700;
      color: #0f172a;
    }

    @media print {
      @page { size: A4 portrait; margin: 8mm 10mm; }
      body { margin: 0; }
      .print-sheet { padding: 0; max-width: 100%; }
      tr { page-break-inside: avoid; }
      .metric-card, .summary-card, .signatures-block { break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${printContent.innerHTML}
</body>
</html>`);

    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
      printWin.close();
    }, 400);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden animate-modalPop font-sans">

        {/* ── 1. MODAL TOP TOOLBAR (Hidden on Paper) ── */}
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 truncate">
                <span>Factory Stock Manifest & Location Inventory</span>
                <span className="font-mono text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded font-bold">
                  {activeFactory?.name || 'All Plants'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 truncate">
                Comprehensive Factory Audit • Total Stock • Total Locations • All Stored SKUs
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              title="Export Full Factory Roster to Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>

            <button
              onClick={handlePrint}
              type="button"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            <button
              onClick={onClose}
              type="button"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Close Preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── 2. FILTER & PREVIEW CONTROLS (Hidden on Paper) ── */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Factory Selector (if multiple exist) */}
            {factories.length > 1 && onSelectFactory && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Factory:</span>
                <select
                  value={activeFactory?._id || ''}
                  onChange={(e) => onSelectFactory(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-md font-semibold text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  {factories.map(f => (
                    <option key={f._id} value={f._id}>{f.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Floor Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Floor:</span>
              <select
                value={selectedFloorFilter}
                onChange={(e) => setSelectedFloorFilter(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-md font-medium text-slate-700 text-xs focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">All Floors ({factoryFloors.length})</option>
                {factoryFloors.map(fl => (
                  <option key={fl._id} value={fl.name}>{fl.name}</option>
                ))}
              </select>
            </div>

            {/* Category Selector */}
            <div className="flex items-center gap-1">
              {(['ALL', 'RAW', 'SEMI', 'FINISHED'] as const).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(cat)}
                  className={`px-2 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                    selectedCategoryFilter === cat
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'ALL' ? 'All Items' : cat === 'RAW' ? 'Raw Mat' : cat === 'SEMI' ? 'Semi FG' : 'Finished'}
                </button>
              ))}
            </div>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search SKU, Item, Location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 bg-slate-50 border border-slate-300 rounded-md text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* ── 3. SCROLLABLE PRINTABLE PREVIEW CONTAINER ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-200/60">
          <div
            ref={printAreaRef}
            className="print-sheet bg-white mx-auto shadow-md border border-slate-300 rounded-xl p-6 sm:p-8 max-w-4xl relative text-xs text-slate-800"
          >

            {/* Document Header */}
            <div className="doc-header flex justify-between items-start border-b-2 border-slate-900 pb-3 mb-4">
              <div>
                <h1 className="company-title text-xl font-black uppercase tracking-wider text-slate-900">
                  {companyName}
                </h1>
                <p className="voucher-sub text-[10px] font-bold text-slate-500 tracking-wider">
                  FACTORY INVENTORY & LOCATION STOCK MANIFEST • OFFICIAL GODOWN AUDIT
                </p>
              </div>

              <div className="doc-badge text-right">
                <div className="doc-number text-sm font-black font-mono text-blue-700">
                  FAC-{activeFactory?.name?.toUpperCase().replace(/\s+/g, '-') || 'PLANT'}
                </div>
                <div className="mt-1">
                  <span className="status-pill inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-300">
                    VERIFIED LIVE AUDIT
                  </span>
                </div>
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="meta-grid grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-3.5 mb-4 text-[11px]">
              {/* Left Column: Factory Structure */}
              <div className="meta-box space-y-1">
                <h4 className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                  Factory & Plant Architecture
                </h4>
                <div className="primary-val font-bold text-slate-900 text-sm">
                  {activeFactory?.name || 'Main Factory'}
                </div>
                <div className="meta-row flex justify-between text-[11px]">
                  <span className="label text-slate-500">Plant Status:</span>
                  <span className="value font-bold text-slate-800">{activeFactory?.status || 'Active'}</span>
                </div>
                <div className="meta-row flex justify-between text-[11px]">
                  <span className="label text-slate-500">Total Factory Floors:</span>
                  <span className="value font-bold text-slate-800">{factoryTotals.totalFloors} Floors</span>
                </div>
                <div className="meta-row flex justify-between text-[11px]">
                  <span className="label text-slate-500">Total Storage Zones:</span>
                  <span className="value font-bold text-slate-800">{factoryTotals.totalZones} Zones</span>
                </div>
                <div className="meta-row flex justify-between text-[11px]">
                  <span className="label text-slate-500">Total Storage Locations:</span>
                  <span className="value font-black text-blue-700">
                    {factoryTotals.totalStorageLocations} Locations
                  </span>
                </div>
              </div>

              {/* Right Column: Physical Stock Consolidated */}
              <div className="meta-box space-y-1">
                <h4 className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                  Audit & Physical Stock Summary
                </h4>
                <div className="primary-val font-mono font-bold text-blue-900 text-sm">
                  {factoryTotals.totalNetWeightKg.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} KG
                </div>
                <div className="meta-row flex justify-between text-[11px]">
                  <span className="label text-slate-500">Audit Date & Time:</span>
                  <span className="value font-bold text-slate-800">
                    {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="meta-row flex justify-between text-[11px]">
                  <span className="label text-slate-500">Total Physical Units:</span>
                  <span className="value font-bold text-slate-800">
                    {factoryTotals.totalStockQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Units
                  </span>
                </div>
                <div className="meta-row flex justify-between text-[11px]">
                  <span className="label text-slate-500">Total Distinct SKUs:</span>
                  <span className="value font-bold text-slate-800">{factoryTotals.totalUniqueSkus} SKUs</span>
                </div>
                <div className="meta-row flex justify-between text-[11px]">
                  <span className="label text-slate-500">Locations Occupied:</span>
                  <span className="value font-bold text-emerald-700">
                    {factoryTotals.occupiedLocationsCount} of {factoryTotals.totalStorageLocations} ({factoryTotals.totalStorageLocations > 0 ? Math.round((factoryTotals.occupiedLocationsCount / factoryTotals.totalStorageLocations) * 100) : 0}%)
                  </span>
                </div>
              </div>
            </div>

            {/* ── 4 KEY METRIC CARDS (High Visibility on Paper) ── */}
            <div className="metrics-grid grid grid-cols-4 gap-2.5 mb-4">
              {/* Card 1: Total Locations */}
              <div className="metric-card bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <div className="metric-title text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                  Total Locations
                </div>
                <div className="metric-value text-lg font-black text-slate-900">
                  {factoryTotals.totalStorageLocations}
                </div>
                <div className="metric-sub text-[9.5px] text-slate-500 font-medium">
                  {factoryTotals.totalFloors} Flr • {factoryTotals.totalZones} Zn
                </div>
              </div>

              {/* Card 2: Total Net Weight */}
              <div className="metric-card bg-blue-50/60 border border-blue-200 rounded-lg p-2.5">
                <div className="metric-title text-[9px] font-bold text-blue-700 uppercase tracking-wide">
                  Total Stock Weight
                </div>
                <div className="metric-value text-lg font-black text-blue-900 font-mono">
                  {factoryTotals.totalNetWeightKg.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                  <span className="text-[10px] font-bold ml-0.5">KG</span>
                </div>
                <div className="metric-sub text-[9.5px] text-blue-600 font-medium">
                  Net calculated mass
                </div>
              </div>

              {/* Card 3: Total Stock Units */}
              <div className="metric-card bg-emerald-50/60 border border-emerald-200 rounded-lg p-2.5">
                <div className="metric-title text-[9px] font-bold text-emerald-700 uppercase tracking-wide">
                  Total Stock Units
                </div>
                <div className="metric-value text-lg font-black text-emerald-900 font-mono">
                  {factoryTotals.totalStockQty.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
                <div className="metric-sub text-[9.5px] text-emerald-600 font-medium">
                  Across {factoryTotals.totalUniqueSkus} SKU types
                </div>
              </div>

              {/* Card 4: Raw Material Mass */}
              <div className="metric-card bg-amber-50/60 border border-amber-200 rounded-lg p-2.5">
                <div className="metric-title text-[9px] font-bold text-amber-700 uppercase tracking-wide">
                  Raw Material Stock
                </div>
                <div className="metric-value text-lg font-black text-amber-900 font-mono">
                  {factoryTotals.rawMatWeight.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                  <span className="text-[10px] font-bold ml-0.5">KG</span>
                </div>
                <div className="metric-sub text-[9.5px] text-amber-700 font-medium">
                  {factoryTotals.rawMatCount} raw SKU lines
                </div>
              </div>
            </div>

            {/* ── SECTION 1: ZONE WISE & FLOOR WISE SUMMARY ── */}
            <div className="section-title text-xs font-bold text-slate-900 uppercase tracking-wider border-l-4 border-blue-600 pl-2 mb-2">
              1. Factory Structure & Zone-Wise Stock Summary
            </div>
            <table className="data-table w-full border-collapse border border-slate-300 text-left text-[10.5px] mb-4">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="border border-slate-300 p-1.5 text-center w-8">#</th>
                  <th className="border border-slate-300 p-1.5">Floor</th>
                  <th className="border border-slate-300 p-1.5">Zone Name</th>
                  <th className="border border-slate-300 p-1.5 text-center">Locations</th>
                  <th className="border border-slate-300 p-1.5 text-right">Raw Materials (KG)</th>
                  <th className="border border-slate-300 p-1.5 text-right">Semi Finished</th>
                  <th className="border border-slate-300 p-1.5 text-right">Finished Goods</th>
                  <th className="border border-slate-300 p-1.5 text-center">SKUs</th>
                  <th className="border border-slate-300 p-1.5 text-right">Total Est. Weight</th>
                </tr>
              </thead>
              <tbody>
                {zoneSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="border border-slate-300 p-3 text-center text-slate-400">
                      No zones configured under this factory.
                    </td>
                  </tr>
                ) : (
                  zoneSummaries.map((z, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="border border-slate-300 p-1.5 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="border border-slate-300 p-1.5 font-bold text-slate-800">{z.floorName}</td>
                      <td className="border border-slate-300 p-1.5 font-semibold text-slate-900">{z.zoneName}</td>
                      <td className="border border-slate-300 p-1.5 text-center font-mono">
                        {z.storageLocationsCount > 0 ? `${z.storageLocationsCount} Bins` : 'Direct Zone'}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono font-medium">
                        {z.rawMatWeight > 0 ? `${z.rawMatWeight.toLocaleString('en-IN', { maximumFractionDigits: 1 })} KG` : '—'}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono">
                        {z.semiQty > 0 ? z.semiQty.toLocaleString('en-IN') : '—'}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono">
                        {z.fgQty > 0 ? z.fgQty.toLocaleString('en-IN') : '—'}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-center font-bold text-slate-700">
                        {z.uniqueSkusCount}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono font-bold text-blue-900">
                        {z.totalWeightKg > 0 ? `${z.totalWeightKg.toLocaleString('en-IN', { maximumFractionDigits: 1 })} KG` : '—'}
                      </td>
                    </tr>
                  ))
                )}
                {/* Zone Summaries Total Row */}
                <tr className="bg-slate-100/80 font-bold border-t-2 border-slate-900 text-slate-900">
                  <td colSpan={3} className="border border-slate-300 p-1.5 text-right uppercase">
                    Factory Structure Totals:
                  </td>
                  <td className="border border-slate-300 p-1.5 text-center font-mono font-black text-blue-800">
                    {factoryTotals.totalStorageLocations}
                  </td>
                  <td className="border border-slate-300 p-1.5 text-right font-mono font-black">
                    {factoryTotals.rawMatWeight.toLocaleString('en-IN', { maximumFractionDigits: 1 })} KG
                  </td>
                  <td className="border border-slate-300 p-1.5 text-right font-mono font-bold">
                    {factoryTotals.semiQty.toLocaleString('en-IN')}
                  </td>
                  <td className="border border-slate-300 p-1.5 text-right font-mono font-bold">
                    {factoryTotals.fgQty.toLocaleString('en-IN')}
                  </td>
                  <td className="border border-slate-300 p-1.5 text-center font-black">
                    {factoryTotals.totalUniqueSkus}
                  </td>
                  <td className="border border-slate-300 p-1.5 text-right font-mono font-black text-blue-900">
                    {factoryTotals.totalNetWeightKg.toLocaleString('en-IN', { maximumFractionDigits: 1 })} KG
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── SECTION 2: DETAILED MASTER INVENTORY ROSTER ── */}
            <div className="section-title text-xs font-bold text-slate-900 uppercase tracking-wider border-l-4 border-blue-600 pl-2 mb-2 flex items-center justify-between">
              <span>2. Detailed Inventory Roster — Everything Present in {activeFactory?.name || 'Factory'}</span>
              <span className="text-[10px] text-slate-500 font-normal">
                Showing {filteredItems.length} of {factoryItems.length} items
              </span>
            </div>

            <table className="data-table w-full border-collapse border border-slate-300 text-left text-[10.5px] mb-4">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="border border-slate-300 p-1.5 text-center w-8">#</th>
                  <th className="border border-slate-300 p-1.5">Storage Location Hierarchy</th>
                  <th className="border border-slate-300 p-1.5">Item / SKU Specification</th>
                  <th className="border border-slate-300 p-1.5 text-center">Category</th>
                  <th className="border border-slate-300 p-1.5 text-right">Stored Qty</th>
                  <th className="border border-slate-300 p-1.5 text-right">Net Weight (KG)</th>
                  <th className="border border-slate-300 p-1.5 text-center">Physical Format / Reel</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="border border-slate-300 p-4 text-center text-slate-400">
                      No stock items found matching the selected filter or no inventory stored in this factory yet.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      {/* # */}
                      <td className="border border-slate-300 p-1.5 text-center font-bold text-slate-500">
                        {idx + 1}
                      </td>

                      {/* Location Hierarchy Path */}
                      <td className="border border-slate-300 p-1.5">
                        <div className="font-bold text-slate-900 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-blue-600 inline shrink-0" />
                          <span>{item.locationName}</span>
                        </div>
                        <div className="text-[9.5px] text-slate-500 font-mono">
                          {item.locationPath}
                        </div>
                      </td>

                      {/* Item Specification */}
                      <td className="border border-slate-300 p-1.5">
                        <div className="font-bold text-slate-900">{item.skuName}</div>
                        <div className="text-[9.5px] text-slate-500 font-mono">
                          <span className="font-bold text-blue-700">{item.skuCode}</span>
                          {item.sku.gsm ? ` • ${item.sku.gsm} GSM` : ''}
                          {(item.sku.width || item.sku.length) ? ` • ${item.sku.width || ''}${item.sku.length ? `×${item.sku.length}` : ''}"` : ''}
                          {item.sku.brand ? ` • ${item.sku.brand}` : ''}
                          {item.batchNumber ? ` • Batch: ${item.batchNumber}` : ''}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="border border-slate-300 p-1.5 text-center">
                        <span className={
                          item.categoryType === 'Raw Material'
                            ? 'badge-raw bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold text-[9px]'
                            : item.categoryType === 'Semi Finished'
                              ? 'badge-semi bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold text-[9px]'
                              : 'badge-fg bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold text-[9px]'
                        }>
                          {item.categoryType}
                        </span>
                      </td>

                      {/* Stored Quantity */}
                      <td className="border border-slate-300 p-1.5 text-right font-mono font-bold text-slate-900">
                        {item.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {item.unit}
                      </td>

                      {/* Calculated Weight */}
                      <td className="border border-slate-300 p-1.5 text-right font-mono">
                        <span className="font-bold text-blue-900">{item.formattedWeight}</span>
                        {item.weightNote && item.weightKg !== null && item.weightKg > 0 && (
                          <span className="text-[9px] text-slate-400 block font-sans">({item.weightNote})</span>
                        )}
                      </td>

                      {/* Physical Format / Reels */}
                      <td className="border border-slate-300 p-1.5 text-center text-[10px] text-slate-600">
                        {item.reels?.length ? (
                          <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                            {item.reels.length} Reel{item.reels.length > 1 ? 's' : ''}
                          </span>
                        ) : (
                          item.sku.paperType || item.unit
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* ── SECTION 3: SUMMARY & GRAND TOTALS BREAKDOWN ── */}
            <div className="summary-grid grid grid-cols-2 gap-4 mb-6">
              {/* Left Box: Category & Location Utilization */}
              <div className="summary-card bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] space-y-1.5">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase border-b border-slate-200 pb-1">
                  Plant Category & Storage Utilization
                </h4>
                <div className="summary-row flex justify-between">
                  <span className="text-slate-500">Raw Materials:</span>
                  <span className="font-bold text-slate-800">
                    {factoryTotals.rawMatCount} SKUs • {factoryTotals.rawMatWeight.toLocaleString('en-IN')} KG ({factoryTotals.rawMatQty.toLocaleString('en-IN')} Units)
                  </span>
                </div>
                <div className="summary-row flex justify-between">
                  <span className="text-slate-500">Semi Finished Goods:</span>
                  <span className="font-bold text-slate-800">
                    {factoryTotals.semiCount} SKUs • {factoryTotals.semiWeight.toLocaleString('en-IN')} KG ({factoryTotals.semiQty.toLocaleString('en-IN')} Units)
                  </span>
                </div>
                <div className="summary-row flex justify-between">
                  <span className="text-slate-500">Finished Goods:</span>
                  <span className="font-bold text-slate-800">
                    {factoryTotals.fgCount} SKUs • {factoryTotals.fgWeight.toLocaleString('en-IN')} KG ({factoryTotals.fgQty.toLocaleString('en-IN')} Units)
                  </span>
                </div>
                <div className="summary-row flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Storage Location Utilization:</span>
                  <span className="font-bold text-blue-700">
                    {factoryTotals.occupiedLocationsCount} of {factoryTotals.totalStorageLocations} Locations ({factoryTotals.totalStorageLocations > 0 ? Math.round((factoryTotals.occupiedLocationsCount / factoryTotals.totalStorageLocations) * 100) : 0}%)
                  </span>
                </div>
              </div>

              {/* Right Box: Grand Totals */}
              <div className="summary-card bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] space-y-1.5">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase border-b border-slate-200 pb-1">
                  Factory Consolidated Totals
                </h4>
                <div className="summary-row flex justify-between">
                  <span className="text-slate-500">Total Configured Locations:</span>
                  <span className="font-bold text-slate-800">
                    {factoryTotals.totalStorageLocations} Locations ({factoryTotals.totalFloors} Floors, {factoryTotals.totalZones} Zones)
                  </span>
                </div>
                <div className="summary-row flex justify-between">
                  <span className="text-slate-500">Total Unique SKUs Present:</span>
                  <span className="font-bold text-slate-800">{factoryTotals.totalUniqueSkus} Active SKUs</span>
                </div>
                <div className="summary-row flex justify-between">
                  <span className="text-slate-500">Total Physical Units:</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {factoryTotals.totalStockQty.toLocaleString('en-IN')} Units
                  </span>
                </div>
                <div className="summary-row grand flex justify-between border-t-2 border-slate-900 pt-1.5 text-xs">
                  <span className="font-black text-slate-900">Total Consolidated Net Weight:</span>
                  <span className="font-black font-mono text-blue-700 text-sm">
                    {factoryTotals.totalNetWeightKg.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} KG
                  </span>
                </div>
              </div>
            </div>

            {/* ── SECTION 4: OFFICIAL SIGNATURES ── */}
            <div className="signatures-block grid grid-cols-3 gap-6 pt-8 border-t border-slate-300 text-center text-[10px] text-slate-600 mt-6">
              <div>
                <div className="sig-line border-t border-slate-400 pt-1 font-bold text-slate-900">
                  Warehouse In-Charge / Storekeeper
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">Physical Stock Count Verification</div>
              </div>
              <div>
                <div className="sig-line border-t border-slate-400 pt-1 font-bold text-slate-900">
                  Inventory Auditor / Quality Control
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">Reconciliation & Batch Validation</div>
              </div>
              <div>
                <div className="sig-line border-t border-slate-400 pt-1 font-bold text-slate-900">
                  Factory Manager / Operations Head
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">Plant Authorization & Final Sign-off</div>
              </div>
            </div>

            {/* Print Footer Notice */}
            <div className="mt-6 pt-2 border-t border-slate-200 text-center text-[8.5px] text-slate-400">
              Generated by SKBW ERP System • Official Plant Inventory Audit Document • Confidential & Proprietary
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default FactoryStockPrintModal;

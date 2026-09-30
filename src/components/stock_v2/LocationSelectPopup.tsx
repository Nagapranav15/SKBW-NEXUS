import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  Building2, 
  Layers, 
  Box, 
  MapPin,
  ChevronRight, 
  ChevronDown,
  Check, 
  X,
  Search,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { WarehouseLocationV2, getBalancesV2 } from '../../api/mfgApiV2';
import { useAuth } from '../../context/AuthContext';

interface LocationSelectPopupProps {
  label?: string;
  locations: WarehouseLocationV2[];
  warehouseId?: string;
  floorId?: string;
  zoneId?: string;
  locationId: string;
  onChange: (warehouseId: string, floorId: string, zoneId: string, locationId: string) => void;
  badgeColor?: 'blue' | 'rose' | 'indigo' | 'emerald';
  disabled?: boolean;
  required?: boolean;
  unit?: string;
  locationStockMap?: Record<string, { qty: number; batches?: number }>;
  variant?: 'card' | 'compact';
  hideLabel?: boolean;
  className?: string;
  displayValue?: string;
  companyId?: string;
  skuId?: string;
}

export const LocationSelectPopup: React.FC<LocationSelectPopupProps> = ({
  label,
  locations = [],
  warehouseId = '',
  floorId = '',
  zoneId = '',
  locationId,
  onChange,
  disabled = false,
  required = true,
  unit: unitProp,
  locationStockMap: externalStockMap,
  variant = 'card',
  hideLabel = false,
  className = '',
  displayValue,
  companyId: propCompanyId,
  skuId
}) => {
  const { selectedCompany } = useAuth();
  const effectiveCompanyId = propCompanyId || selectedCompany?._id || '';

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [liveStockMap, setLiveStockMap] = useState<Record<string, { qty: number; batches: number }>>({});
  const [liveUnit, setLiveUnit] = useState<string>('');
  const [stockLoading, setStockLoading] = useState(false);

  // Draft selection state inside popup
  const [selectedWhId, setSelectedWhId] = useState<string>(warehouseId);
  const [selectedFId, setSelectedFId] = useState<string>(floorId);
  const [selectedZId, setSelectedZId] = useState<string>(zoneId);
  const [selectedLId, setSelectedLId] = useState<string>(locationId);

  // Normalized location list - no fake demo data
  const allLocs = useMemo(() => {
    return Array.isArray(locations) ? locations : [];
  }, [locations]);

  // Lookup map
  const locMap = useMemo(() => {
    const map = new Map<string, WarehouseLocationV2>();
    allLocs.forEach(l => {
      if (l && l._id) map.set(String(l._id), l);
    });
    return map;
  }, [allLocs]);

  // Effective stock map: external prop > live-fetched > empty
  const activeStockMap = useMemo(() => {
    if (externalStockMap && Object.keys(externalStockMap).length > 0) return externalStockMap;
    if (Object.keys(liveStockMap).length > 0) return liveStockMap;
    return {};
  }, [externalStockMap, liveStockMap]);

  // Effective unit: explicit prop > detected from balances > empty string
  const unit = unitProp || liveUnit || '';

  // Fetch live stock data when popup opens, filtered by skuId if specified
  const fetchLiveStock = useCallback(async () => {
    if (!effectiveCompanyId) return;

    // If skuId is explicitly provided as empty string (e.g. product expected but not yet selected)
    if (skuId === '') {
      setLiveStockMap({});
      setLiveUnit('');
      return;
    }

    setStockLoading(true);
    try {
      const balances = await getBalancesV2(effectiveCompanyId, undefined, true, skuId);
      if (!Array.isArray(balances) || balances.length === 0) {
        setLiveStockMap({});
        return;
      }

      const stockByLoc: Record<string, { qty: number; batches: Set<string> }> = {};
      let detectedUnit = '';

      balances.forEach((b: any) => {
        // Double-check skuId match
        if (skuId) {
          const bSkuId = String(b.skuId?._id || b.skuId || b.sku?._id || b.sku || '');
          if (bSkuId && bSkuId !== String(skuId)) return;
        }

        const locId = b.locationId ? String(b.locationId._id || b.locationId) : '';
        if (!locId) return;

        const qty = Number(b.onHand ?? b.quantity ?? b.qty) || 0;
        if (qty <= 0) return;

        const batchKey = b.batchNumber || b.batch || 'default';
        const itemUnit = b.sku?.unit || b.skuId?.unit || b.unit || '';
        if (itemUnit && !detectedUnit) detectedUnit = itemUnit;

        if (!stockByLoc[locId]) {
          stockByLoc[locId] = { qty: 0, batches: new Set() };
        }
        stockByLoc[locId].qty += qty;
        stockByLoc[locId].batches.add(batchKey);
      });

      const finalMap: Record<string, { qty: number; batches: number }> = {};
      for (const [locId, data] of Object.entries(stockByLoc)) {
        finalMap[locId] = { qty: Math.round(data.qty * 100) / 100, batches: data.batches.size };
      }

      setLiveStockMap(finalMap);
      if (detectedUnit) setLiveUnit(detectedUnit);
    } catch (err) {
      console.error('LocationSelectPopup: Failed to fetch live stock', err);
    } finally {
      setStockLoading(false);
    }
  }, [effectiveCompanyId, skuId]);

  // Helper to get real stock & batch counts for any node
  const getLocationStock = (nodeId: string, _level: string) => {
    const id = String(nodeId);
    if (activeStockMap && activeStockMap[id]) {
      return activeStockMap[id];
    }

    // Sum stock from children for parents (Warehouse, Floor, Zone)
    let totalQty = 0;
    let totalBatches = 0;
    const sumChildren = (pId: string) => {
      const children = allLocs.filter(l => l && String(l.parentId) === String(pId));
      children.forEach(c => {
        const cId = String(c._id);
        if (activeStockMap && activeStockMap[cId]) {
          totalQty += Number(activeStockMap[cId].qty || 0);
          totalBatches += Number(activeStockMap[cId].batches || 0);
        }
        sumChildren(cId);
      });
    };
    sumChildren(id);

    if (totalQty > 0) {
      return { qty: Math.round(totalQty * 100) / 100, batches: totalBatches };
    }

    return { qty: 0, batches: 0 };
  };

  // Full path resolver
  const getPathParts = (item?: WarehouseLocationV2): string[] => {
    if (!item) return [];
    const parts: string[] = [(item.name || '').trim()];
    let currentParentId = item.parentId ? String(item.parentId) : null;
    let guard = 0;
    const visited = new Set<string>();
    if (item._id) visited.add(String(item._id));

    while (currentParentId && guard < 8) {
      if (visited.has(currentParentId)) break;
      visited.add(currentParentId);

      const parent = locMap.get(currentParentId);
      if (!parent) break;
      parts.unshift((parent.name || '').trim());
      currentParentId = parent.parentId ? String(parent.parentId) : null;
      guard++;
    }
    return parts;
  };

  // Active breadcrumbs for current props
  const currentTarget = locMap.get(locationId) || locMap.get(zoneId) || locMap.get(floorId) || locMap.get(warehouseId);
  const currentParts = getPathParts(currentTarget);

  const currentWhName = locMap.get(warehouseId)?.name || currentParts[0] || 'Warehouse';
  const currentFloorName = locMap.get(floorId)?.name || currentParts[1] || 'Floor';
  const currentZoneName = locMap.get(zoneId)?.name || currentParts[2] || 'Zone';
  const currentLocName = locMap.get(locationId)?.name || currentParts[3] || 'Location';

  // Draft target path preview inside modal
  const draftTarget = locMap.get(selectedLId) || locMap.get(selectedZId) || locMap.get(selectedFId) || locMap.get(selectedWhId);
  const draftParts = getPathParts(draftTarget);

  // Sync draft state on open or prop change (all nodes closed/collapsed by default)
  useEffect(() => {
    if (isOpen) {
      let wh = warehouseId || '';
      let fl = floorId || '';
      let zn = zoneId || '';
      let lc = locationId || '';

      if (lc && (!wh || !fl || !zn)) {
        const target = locMap.get(lc);
        if (target) {
          if (target.level === 'Storage Location') {
            const z = target.parentId ? locMap.get(String(target.parentId)) : undefined;
            const f = z?.parentId ? locMap.get(String(z.parentId)) : undefined;
            const w = f?.parentId ? locMap.get(String(f.parentId)) : undefined;
            if (z?._id) zn = String(z._id);
            if (f?._id) fl = String(f._id);
            if (w?._id) wh = String(w._id);
          } else if (target.level === 'Zone') {
            zn = String(target._id);
            const f = target.parentId ? locMap.get(String(target.parentId)) : undefined;
            const w = f?.parentId ? locMap.get(String(f.parentId)) : undefined;
            if (f?._id) fl = String(f._id);
            if (w?._id) wh = String(w._id);
          } else if (target.level === 'Floor') {
            fl = String(target._id);
            const w = target.parentId ? locMap.get(String(target.parentId)) : undefined;
            if (w?._id) wh = String(w._id);
          } else if (target.level === 'Factory') {
            wh = String(target._id);
          }
        }
      }

      setSelectedWhId(wh);
      setSelectedFId(fl);
      setSelectedZId(zn);
      setSelectedLId(lc);
      setSearchQuery('');
      // Everything closed by default
      setExpandedNodes({});
      if (effectiveCompanyId && (!externalStockMap || Object.keys(externalStockMap).length === 0)) {
        fetchLiveStock();
      }
    }
  }, [isOpen, warehouseId, floorId, zoneId, locationId, locMap, effectiveCompanyId, externalStockMap, fetchLiveStock]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Node selection handler
  const handleSelectNode = (node: WarehouseLocationV2) => {
    if (!node || !node._id) return;
    const nId = String(node._id);
    const lvl = node.level;

    if (lvl === 'Storage Location') {
      const parentZone = node.parentId ? locMap.get(String(node.parentId)) : undefined;
      const parentFloor = parentZone?.parentId ? locMap.get(String(parentZone.parentId)) : undefined;
      const parentWh = parentFloor?.parentId ? locMap.get(String(parentFloor.parentId)) : undefined;

      setSelectedLId(nId);
      if (parentZone?._id) setSelectedZId(String(parentZone._id));
      if (parentFloor?._id) setSelectedFId(String(parentFloor._id));
      if (parentWh?._id) setSelectedWhId(String(parentWh._id));
    } else if (lvl === 'Zone') {
      const parentFloor = node.parentId ? locMap.get(String(node.parentId)) : undefined;
      const parentWh = parentFloor?.parentId ? locMap.get(String(parentFloor.parentId)) : undefined;

      // Directly select the zone itself (allows assigning storage directly to zones)
      setSelectedZId(nId);
      setSelectedLId(nId);

      // Auto-expand zone so child bins are visible if user wants to pick a bin
      const childBins = allLocs.filter(l => l.level === 'Storage Location' && String(l.parentId) === nId);
      if (childBins.length > 0) {
        setExpandedNodes(prev => ({ ...prev, [nId]: true }));
      }

      if (parentFloor?._id) setSelectedFId(String(parentFloor._id));
      if (parentWh?._id) setSelectedWhId(String(parentWh._id));
    } else if (lvl === 'Floor') {
      setExpandedNodes(prev => ({ ...prev, [nId]: !prev[nId] }));
      const parentWh = node.parentId ? locMap.get(String(node.parentId)) : undefined;
      if (parentWh?._id) setSelectedWhId(String(parentWh._id));
    } else if (lvl === 'Factory' || !node.parentId) {
      setExpandedNodes(prev => ({ ...prev, [nId]: !prev[nId] }));
    }
  };

  const handleConfirm = () => {
    onChange(selectedWhId, selectedFId, selectedZId, selectedLId);
    setIsOpen(false);
  };

  // Exact matching Level Badges from Image 2
  const getNodeLevelBadge = (level: string, hasStock: boolean) => {
    if (level === 'Factory') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80 uppercase tracking-wider shrink-0">
          WAREHOUSE
        </span>
      );
    }
    if (level === 'Floor') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200/80 uppercase tracking-wider shrink-0">
          FLOOR
        </span>
      );
    }
    if (level === 'Zone') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80 uppercase tracking-wider shrink-0">
          ZONE
        </span>
      );
    }
    return (
      <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider shrink-0 border ${
        hasStock 
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80' 
          : 'bg-gray-100 text-gray-500 border-gray-200/80'
      }`}>
        {hasStock ? 'ACTIVE BIN' : 'EMPTY BIN'}
      </span>
    );
  };

  // Exact matching Node Icons from Image 2
  const getNodeIcon = (level: string, hasStock: boolean) => {
    if (level === 'Factory') {
      return (
        <div className="p-1 bg-blue-600 text-white rounded-lg shadow-3xs shrink-0">
          <Building2 className="w-3.5 h-3.5" />
        </div>
      );
    }
    if (level === 'Floor') {
      return (
        <div className="p-1 bg-slate-100 text-slate-700 rounded-lg shrink-0">
          <Layers className="w-3.5 h-3.5" />
        </div>
      );
    }
    if (level === 'Zone') {
      return (
        <div className="p-1 bg-amber-100 text-amber-700 rounded-lg shrink-0">
          <Box className="w-3.5 h-3.5" />
        </div>
      );
    }
    return (
      <div className={`p-1 rounded-lg shrink-0 ${hasStock ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
        <MapPin className="w-3.5 h-3.5" />
      </div>
    );
  };

  // Root Factories
  const rootFactories = useMemo(() => {
    return allLocs.filter(l => l.level === 'Factory' || (!l.parentId && !l.level));
  }, [allLocs]);

  // Filter matching
  const matchesSearch = (item: WarehouseLocationV2): boolean => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (item.name?.toLowerCase().includes(q)) return true;
    const children = allLocs.filter(c => String(c.parentId) === String(item._id));
    return children.some(c => matchesSearch(c));
  };

  return (
    <div className={`space-y-1.5 font-sans ${className}`}>
      {variant === 'compact' ? (
        <div>
          {!hideLabel && label && (
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              {label} {required && <span className="text-rose-500">*</span>}
            </label>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) setIsOpen(true);
            }}
            className={`w-full px-3 py-2 bg-white border border-gray-200 hover:border-blue-400 rounded-lg transition-all cursor-pointer shadow-3xs group flex items-center justify-between gap-2 text-xs text-left h-[38px] ${
              disabled ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            title="Click to select warehouse hierarchy storage location"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
              <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate font-semibold text-gray-800 text-xs">
                {displayValue ? (
                  <span className="font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 truncate">{displayValue}</span>
                ) : locationId && currentTarget ? (
                  <span className="inline-flex items-center gap-1 truncate">
                    {currentParts.length > 1 ? (
                      <>
                        <span className="text-gray-500 font-medium truncate">{currentParts.slice(0, -1).join(' > ')} &gt; </span>
                        <span className="font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 shrink-0">{currentParts[currentParts.length - 1]}</span>
                      </>
                    ) : (
                      <span className="font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{currentParts[0]}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-gray-400 font-normal">Select Location...</span>
                )}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600 shrink-0 transition-colors" />
          </button>
        </div>
      ) : (
        <>
          {/* Label */}
          {!hideLabel && (
            <div className="flex items-center justify-between">
              <label className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wider block">
                {label} {required && <span className="text-rose-500">*</span>}
              </label>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(true)}
                className="text-[10.5px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>Change Location</span>
                <ChevronRight className="w-3 h-3 text-blue-500" />
              </button>
            </div>
          )}

          {/* Trigger Box on Form */}
          <div
            onClick={() => !disabled && setIsOpen(true)}
            className={`w-full p-2.5 bg-white border border-slate-200/90 hover:border-blue-400 rounded-2xl transition-all cursor-pointer shadow-3xs group flex items-center justify-between gap-3 ${
              disabled ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            title="Click to select location"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl shrink-0 bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shadow-3xs">
                <Layers className="w-4 h-4 stroke-[2]" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center flex-wrap gap-1 text-xs font-semibold text-slate-800">
                  <span className="text-slate-900 font-bold">{currentWhName}</span>
                  <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                  <span className="text-slate-600">{currentFloorName}</span>
                  <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                  <span className="text-slate-600">{currentZoneName}</span>
                  <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                  <span className="font-bold px-1.5 py-0.5 rounded-md text-[11px] bg-blue-50 text-blue-700 border border-blue-100">
                    {currentLocName}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Storage Bin: <span className="font-semibold text-slate-700">{currentLocName}</span> ({currentWhName} • {currentFloorName} • {currentZoneName})
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(true);
              }}
              className="px-2.5 py-1 bg-slate-50 group-hover:bg-blue-50 group-hover:text-blue-700 text-slate-600 rounded-xl text-[11px] font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>Select</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        </>
      )}

      {/* ── CUTE, MINIMAL & INFORMATIONAL POPUP (NO DARK BG SHIFT) ── */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[200000] flex items-center justify-center p-3 sm:p-4 bg-slate-950/40 backdrop-blur-xs animate-fadeIn font-sans"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="bg-white rounded-[26px] border border-slate-200/80 shadow-2xl shadow-slate-900/15 w-full max-w-[440px] overflow-hidden animate-scaleIn flex flex-col max-h-[82vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: Clean & Cute Blue */}
            <div className="p-4 pb-3 flex items-center justify-between bg-gradient-to-b from-sky-50/50 via-white to-white border-b border-slate-100/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-100/70 flex items-center justify-center shrink-0 shadow-3xs">
                  <Layers className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 tracking-tight leading-tight">
                    Warehouse Hierarchy
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Factories, floors, and storage zones
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full text-slate-300 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Minimal Search Pill */}
            <div className="px-4 py-2 bg-slate-50/40 border-b border-slate-100/70">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/80 rounded-full focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all shadow-3xs">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search warehouse, floor, zone, or bin..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center shrink-0 cursor-pointer text-[9px]"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Path Banner */}
            <div className="px-4 py-1.5 bg-slate-50/60 border-b border-slate-100/70">
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Path:</span>
                {draftParts.length > 0 ? (
                  <div className="flex items-center flex-wrap gap-1 font-semibold text-[11px] truncate">
                    {draftParts.map((p, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="text-slate-300">›</span>}
                        <span className={idx === draftParts.length - 1 ? 'text-blue-700 font-bold' : 'text-slate-600'}>
                          {p}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 text-[11px] flex items-center gap-1">
                    Select a bin or zone below
                    <Sparkles className="w-3 h-3 text-amber-400" />
                  </span>
                )}
              </div>
            </div>

            {/* Informational Micro Table Header (Matching Image 2) */}
            <div className="grid grid-cols-12 px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/40">
              <div className="col-span-7 flex items-center gap-1.5">
                <span>Location</span>
                {stockLoading && <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-500" />}
              </div>
              <div className="col-span-2 text-center">Batches</div>
              <div className="col-span-3 text-right">Qty {unit ? `(${unit})` : ''}</div>
            </div>

            {/* Tree Content: Clean, Borderless, Exactly like Image 2 */}
            <div className="px-2 py-1.5 overflow-y-auto flex-1 max-h-[350px] custom-scrollbar divide-y divide-slate-50">
              {rootFactories.filter(matchesSearch).length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <Layers className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
                  <p className="text-xs font-semibold">No locations found</p>
                </div>
              ) : (
                rootFactories.filter(matchesSearch).map(factory => {
                  const fId = String(factory._id);
                  const isExpanded = !!expandedNodes[fId] || searchQuery.trim().length > 0;
                  const floors = allLocs.filter(l => l.level === 'Floor' && String(l.parentId) === fId);
                  const isSelected = selectedWhId === fId;
                  const fStock = getLocationStock(fId, 'Factory');

                  return (
                    <div key={fId} className="py-0.5 select-none">
                      {/* FACTORY ROW */}
                      <div
                        onClick={() => handleSelectNode(factory)}
                        className={`grid grid-cols-12 px-2 py-1.5 items-center rounded-xl transition-all cursor-pointer ${
                          isSelected && !selectedFId
                            ? 'bg-blue-50/80 text-blue-900 font-bold' 
                            : 'hover:bg-slate-50/80 text-slate-800'
                        }`}
                      >
                        <div className="col-span-7 flex items-center gap-1.5 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => toggleExpand(fId, e)}
                            className="p-0.5 rounded text-slate-400 hover:text-blue-600 transition-colors shrink-0"
                          >
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${isExpanded ? 'rotate-90 text-blue-600' : ''}`} />
                          </button>
                          {getNodeIcon('Factory', fStock.qty > 0)}
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {factory.name}
                          </span>
                          {getNodeLevelBadge('Factory', fStock.qty > 0)}
                        </div>

                        <div className="col-span-2 text-center">
                          {fStock.batches > 0 ? (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-200/70">
                              {fStock.batches}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono text-[11px]">—</span>
                          )}
                        </div>

                        <div className="col-span-3 text-right">
                          {fStock.qty > 0 ? (
                            <span className="font-mono font-bold text-[11px] text-slate-800">
                              {fStock.qty} <span className="text-[9px] text-slate-400 font-normal">{unit}</span>
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono text-[11px]">0</span>
                          )}
                        </div>
                      </div>

                      {/* FLOORS UNDER FACTORY */}
                      {isExpanded && (
                        <div className="space-y-0.5">
                          {floors.filter(matchesSearch).map(floor => {
                            const flId = String(floor._id);
                            const isFlExpanded = !!expandedNodes[flId] || searchQuery.trim().length > 0;
                            const zones = allLocs.filter(l => l.level === 'Zone' && String(l.parentId) === flId);
                            const isFlSelected = selectedFId === flId;
                            const flStock = getLocationStock(flId, 'Floor');

                            return (
                              <div key={flId} className="space-y-0.5">
                                {/* FLOOR ROW */}
                                <div
                                  onClick={() => handleSelectNode(floor)}
                                  className={`grid grid-cols-12 px-2 py-1.5 items-center rounded-xl transition-all cursor-pointer ${
                                    isFlSelected && !selectedZId
                                      ? 'bg-blue-50/70 text-blue-900 font-semibold' 
                                      : 'hover:bg-slate-50/80 text-slate-700'
                                  }`}
                                >
                                  <div className="col-span-7 flex items-center gap-1.5 min-w-0 pl-3.5">
                                    <button
                                      type="button"
                                      onClick={(e) => toggleExpand(flId, e)}
                                      className="p-0.5 rounded text-slate-400 hover:text-blue-600 shrink-0"
                                    >
                                      <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${isFlExpanded ? 'rotate-90 text-blue-600' : ''}`} />
                                    </button>
                                    {getNodeIcon('Floor', flStock.qty > 0)}
                                    <span className="text-xs font-semibold text-slate-800 truncate">
                                      {floor.name}
                                    </span>
                                    {getNodeLevelBadge('Floor', flStock.qty > 0)}
                                  </div>

                                  <div className="col-span-2 text-center">
                                    {flStock.batches > 0 ? (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-200/70">
                                        {flStock.batches}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 font-mono text-[11px]">—</span>
                                    )}
                                  </div>

                                  <div className="col-span-3 text-right">
                                    {flStock.qty > 0 ? (
                                      <span className="font-mono font-bold text-[11px] text-slate-800">
                                        {flStock.qty} <span className="text-[9px] text-slate-400 font-normal">{unit}</span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 font-mono text-[11px]">0</span>
                                    )}
                                  </div>
                                </div>

                                {/* ZONES UNDER FLOOR */}
                                {isFlExpanded && (
                                  <div className="space-y-0.5">
                                    {zones.filter(matchesSearch).map((zone) => {
                                      const zId = String(zone._id);
                                      const isZExpanded = !!expandedNodes[zId] || searchQuery.trim().length > 0;
                                      const bins = allLocs.filter(l => l.level === 'Storage Location' && String(l.parentId) === zId);
                                      const isZSelected = selectedZId === zId;
                                      const isZoneDirectlySelected = selectedZId === zId && (selectedLId === zId || !selectedLId);
                                      const zStock = getLocationStock(zId, 'Zone');

                                      return (
                                        <div key={zId} className="space-y-0.5">
                                          {/* ZONE ROW */}
                                          <div
                                            onClick={() => handleSelectNode(zone)}
                                            className={`grid grid-cols-12 px-2 py-1.5 items-center rounded-xl transition-all cursor-pointer ${
                                              isZoneDirectlySelected
                                                ? 'bg-blue-50/80 text-blue-900 font-bold border border-blue-200/70 shadow-3xs'
                                                : isZSelected
                                                ? 'bg-slate-50 text-slate-800'
                                                : 'hover:bg-slate-50/80 text-slate-700'
                                            }`}
                                          >
                                            <div className="col-span-7 flex items-center gap-1.5 min-w-0 pl-7">
                                              {bins.length > 0 ? (
                                                <button
                                                  type="button"
                                                  onClick={(e) => toggleExpand(zId, e)}
                                                  className="p-0.5 rounded text-slate-400 hover:text-blue-600 shrink-0 cursor-pointer"
                                                  title={isZExpanded ? "Collapse bins" : "Expand bins"}
                                                >
                                                  <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${isZExpanded ? 'rotate-90 text-blue-600' : ''}`} />
                                                </button>
                                              ) : (
                                                <span className="w-3.5 inline-block shrink-0" />
                                              )}
                                              {getNodeIcon('Zone', zStock.qty > 0)}
                                              <span className={`text-xs truncate ${isZoneDirectlySelected ? 'font-bold text-blue-900' : 'font-semibold text-slate-800'}`}>
                                                {zone.name}
                                              </span>
                                              {getNodeLevelBadge('Zone', zStock.qty > 0)}
                                            </div>

                                            <div className="col-span-2 text-center">
                                              {zStock.batches > 0 ? (
                                                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-200/70">
                                                  {zStock.batches}
                                                </span>
                                              ) : (
                                                <span className="text-slate-300 font-mono text-[11px]">—</span>
                                              )}
                                            </div>

                                            <div className="col-span-3 text-right flex items-center justify-end gap-1.5">
                                              {zStock.qty > 0 ? (
                                                <span className="font-mono font-bold text-[11px] text-slate-800">
                                                  {zStock.qty} <span className="text-[9px] text-slate-400 font-normal">{unit}</span>
                                                </span>
                                              ) : (
                                                <span className="text-slate-300 font-mono text-[11px]">0</span>
                                              )}

                                              {isZoneDirectlySelected && (
                                                <div className="w-3.5 h-3.5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-3xs">
                                                  <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          {/* BINS UNDER ZONE */}
                                          {isZExpanded && bins.length > 0 && (
                                            <div className="space-y-0.5">
                                              {bins.filter(matchesSearch).map(bin => {
                                                const bId = String(bin._id);
                                                const isBinSelected = selectedLId === bId;
                                                const bStock = getLocationStock(bId, 'Storage Location');
                                                const hasStock = bStock.qty > 0;

                                                return (
                                                  <div
                                                    key={bId}
                                                    onClick={() => handleSelectNode(bin)}
                                                    className={`grid grid-cols-12 px-2 py-1.5 items-center rounded-xl transition-all cursor-pointer ${
                                                      isBinSelected
                                                        ? 'bg-blue-50/90 text-blue-900 font-bold border border-blue-200/80 shadow-3xs'
                                                        : 'hover:bg-slate-50/90 text-slate-700'
                                                    }`}
                                                  >
                                                    <div className="col-span-7 flex items-center gap-1.5 min-w-0 pl-10.5">
                                                      <span className="w-3.5 inline-block shrink-0" />
                                                      {getNodeIcon('Storage Location', hasStock)}
                                                      <span className={`text-xs truncate ${isBinSelected ? 'font-bold text-blue-950' : 'font-medium text-slate-800'}`}>
                                                        {bin.name}
                                                      </span>
                                                      {getNodeLevelBadge('Storage Location', hasStock)}
                                                    </div>

                                                    <div className="col-span-2 text-center">
                                                      {bStock.batches > 0 ? (
                                                        <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-200/70">
                                                          {bStock.batches}
                                                        </span>
                                                      ) : (
                                                        <span className="text-slate-300 font-mono text-[11px]">—</span>
                                                      )}
                                                    </div>

                                                    <div className="col-span-3 text-right flex items-center justify-end gap-1.5">
                                                      {hasStock ? (
                                                        <span className="font-mono font-bold text-[11px] text-slate-900">
                                                          {bStock.qty} <span className="text-[9px] text-slate-400 font-normal">{unit}</span>
                                                        </span>
                                                      ) : (
                                                        <span className="text-slate-300 font-mono text-[11px]">0</span>
                                                      )}

                                                      {isBinSelected && (
                                                        <div className="w-3.5 h-3.5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-3xs">
                                                          <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-3 px-4 bg-white border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] text-slate-500 font-medium truncate block">
                  {draftParts.length > 0 ? (
                    <span>Ready: <strong className="text-slate-800 font-semibold">{draftParts[draftParts.length - 1]}</strong></span>
                  ) : (
                    'Choose a location'
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="px-4 py-1.5 text-xs font-bold rounded-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white shadow-blue-200 shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Check className="w-3 h-3 stroke-[2.5]" />
                  <span>Confirm Location</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

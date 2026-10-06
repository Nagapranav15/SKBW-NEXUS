import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  Building2,
  Layers, 
  Box, 
  MapPin,
  ChevronRight, 
  Check, 
  X, 
  Search, 
  AlertCircle,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { WarehouseLocationV2, getBalancesV2 } from '../../api/mfgApiV2';

interface LocationSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawHierarchy?: WarehouseLocationV2[];
  selectedLocationId?: string;
  onSelectLocation: (locId: string, locPath: string) => void;
  title?: string;
  unit?: string;
  locationStockMap?: Record<string, { qty: number; batches?: number }>;
  companyId?: string;
  skuId?: string;
  zIndex?: number;
}

export const LocationSelectModal: React.FC<LocationSelectModalProps> = ({
  isOpen,
  onClose,
  rawHierarchy = [],
  selectedLocationId = '',
  onSelectLocation,
  title = 'Warehouse Hierarchy',
  unit: unitProp,
  locationStockMap: externalStockMap,
  companyId,
  skuId,
  zIndex = 10050
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [tempSelectedId, setTempSelectedId] = useState<string>(selectedLocationId);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [liveStockMap, setLiveStockMap] = useState<Record<string, { qty: number; batches: number }>>({});
  const [liveUnit, setLiveUnit] = useState<string>('');
  const [stockLoading, setStockLoading] = useState(false);

  const hierarchyToUse = useMemo(() => {
    return Array.isArray(rawHierarchy) && rawHierarchy.length > 0 ? rawHierarchy : [];
  }, [rawHierarchy]);

  // Determine which stock map to use: external prop > live-fetched > empty
  const locationStockMap = useMemo(() => {
    if (externalStockMap && Object.keys(externalStockMap).length > 0) return externalStockMap;
    if (Object.keys(liveStockMap).length > 0) return liveStockMap;
    return {};
  }, [externalStockMap, liveStockMap]);

  // Determine unit: explicit prop > detected from balances > fallback
  const unit = unitProp || liveUnit || '';

  // Build Location Map & Paths
  const locMap = useMemo(() => {
    const map = new Map<string, WarehouseLocationV2>();
    hierarchyToUse.forEach(item => {
      if (item && item._id) map.set(String(item._id), item);
    });
    return map;
  }, [hierarchyToUse]);

  // Fetch live stock data when modal opens, filtered by skuId if specified
  const fetchLiveStock = useCallback(async () => {
    if (!companyId) return;

    if (skuId === '') {
      setLiveStockMap({});
      setLiveUnit('');
      return;
    }

    setStockLoading(true);
    try {
      const balances = await getBalancesV2(companyId, undefined, true, skuId);
      if (!Array.isArray(balances) || balances.length === 0) {
        setLiveStockMap({});
        setStockLoading(false);
        return;
      }

      const stockByLoc: Record<string, { qty: number; batches: Set<string> }> = {};
      let detectedUnit = '';

      balances.forEach((b: any) => {
        if (skuId) {
          const bSkuId = String(b.skuId?._id || b.skuId || b.sku?._id || b.sku || '');
          if (bSkuId && bSkuId !== String(skuId)) return;
        }

        const locId = b.locationId ? String(b.locationId._id || b.locationId) : '';
        if (!locId) return;

        const qty = Number(b.onHand ?? b.quantity ?? b.qty) || 0;
        if (qty <= 0) return;

        const batchKey = b.batchNumber || b.batch || 'default';
        const skuUnit = b.sku?.unit || b.skuId?.unit || b.unit || '';
        if (skuUnit && !detectedUnit) detectedUnit = skuUnit;

        if (!stockByLoc[locId]) {
          stockByLoc[locId] = { qty: 0, batches: new Set() };
        }
        stockByLoc[locId].qty += qty;
        stockByLoc[locId].batches.add(batchKey);
      });

      // Convert Sets to counts
      const finalMap: Record<string, { qty: number; batches: number }> = {};
      for (const [locId, data] of Object.entries(stockByLoc)) {
        finalMap[locId] = { qty: Math.round(data.qty * 100) / 100, batches: data.batches.size };
      }

      setLiveStockMap(finalMap);
      if (detectedUnit) setLiveUnit(detectedUnit);
    } catch (err) {
      console.error('LocationSelectModal: Failed to fetch live stock', err);
    } finally {
      setStockLoading(false);
    }
  }, [companyId, skuId]);

  const getLocationStock = (nodeId: string, _level: string) => {
    const id = String(nodeId);
    // Direct match in stock map
    if (locationStockMap && locationStockMap[id]) {
      return locationStockMap[id];
    }

    // Sum children recursively
    let totalQty = 0;
    let totalBatches = 0;
    const sumChildren = (pId: string) => {
      const children = hierarchyToUse.filter(l => l && String(l.parentId) === String(pId));
      children.forEach(c => {
        const cId = String(c._id);
        if (locationStockMap && locationStockMap[cId]) {
          totalQty += Number(locationStockMap[cId].qty || 0);
          totalBatches += Number(locationStockMap[cId].batches || 0);
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

  const getFullPath = (item: WarehouseLocationV2): string => {
    if (!item) return '';
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
    return parts.join(' › ');
  };

  useEffect(() => {
    if (isOpen) {
      setTempSelectedId(selectedLocationId);
      setSearchQuery('');
      setWarningMsg(null);
      setExpandedNodes({});
      // Fetch live stock data when modal opens
      if (companyId) {
        fetchLiveStock();
      }
    }
  }, [isOpen, selectedLocationId, companyId, fetchLiveStock]);

  if (!isOpen) return null;

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleItemSelect = (item: WarehouseLocationV2, e: React.MouseEvent) => {
    e.stopPropagation();
    const lvl = item.level;
    if (lvl === 'Factory' || lvl === 'Floor') {
      toggleExpand(String(item._id), e);
      setWarningMsg(`Please select a Zone or Storage Bin`);
      setTimeout(() => setWarningMsg(null), 2200);
      return;
    }

    setWarningMsg(null);
    const id = String(item._id || item.name);
    setTempSelectedId(id);
  };

  const handleApply = () => {
    if (!tempSelectedId) {
      onClose();
      return;
    }

    const locObj = locMap.get(tempSelectedId) || hierarchyToUse.find(l => l.name?.toLowerCase().trim() === tempSelectedId.toLowerCase().trim());
    if (locObj) {
      const fullPath = getFullPath(locObj);
      onSelectLocation(String(locObj._id || locObj.name), fullPath);
    } else {
      onSelectLocation(tempSelectedId, tempSelectedId);
    }
    onClose();
  };

  const selectedLocObj = tempSelectedId ? (locMap.get(tempSelectedId) || hierarchyToUse.find(l => l.name?.toLowerCase().trim() === tempSelectedId.toLowerCase().trim())) : null;
  const selectedPathStr = selectedLocObj ? getFullPath(selectedLocObj) : '';

  // Filter matching
  const matchesSearch = (item: WarehouseLocationV2): boolean => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (item.name?.toLowerCase().includes(q)) return true;
    const children = hierarchyToUse.filter(c => String(c.parentId) === String(item._id));
    return children.some(c => matchesSearch(c));
  };

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

  const rootFactories = hierarchyToUse.filter(l => l.level === 'Factory' || (!l.parentId && !l.level));

  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-[2px] animate-fadeIn font-sans"
      style={{ zIndex }}
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-[26px] shadow-2xl shadow-slate-900/15 w-full max-w-[440px] overflow-hidden border border-slate-200/80 flex flex-col max-h-[82vh] animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 pb-3 flex items-center justify-between bg-gradient-to-b from-sky-50/50 via-white to-white border-b border-slate-100/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-100/70 flex items-center justify-center shrink-0 shadow-3xs">
              <Layers className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 tracking-tight leading-tight">
                {title}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Factories, floors, and storage zones
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full text-slate-300 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer"
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

        {/* Warning Toast */}
        {warningMsg && (
          <div className="bg-amber-50/90 border border-amber-200/70 mx-4 mt-2 rounded-xl p-2 px-3 text-amber-800 text-[11px] font-semibold flex items-center gap-1.5 animate-fadeIn">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{warningMsg}</span>
          </div>
        )}

        {/* Path Banner */}
        <div className="px-4 py-1.5 bg-slate-50/60 border-b border-slate-100/70">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Path:</span>
            {selectedPathStr ? (
              <div className="text-blue-700 font-bold text-[11px] truncate">
                {selectedPathStr}
              </div>
            ) : (
              <span className="text-slate-400 text-[11px] flex items-center gap-1">
                Choose a zone or bin below
                <Sparkles className="w-3 h-3 text-amber-400" />
              </span>
            )}
          </div>
        </div>

        {/* Informational Micro Table Header */}
        <div className="grid grid-cols-12 px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/40">
          <div className="col-span-7 flex items-center gap-1">
            Location
            {stockLoading && (
              <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-500" />
            )}
          </div>
          <div className="col-span-2 text-center">Batches</div>
          <div className="col-span-3 text-right">Qty{unit ? ` (${unit})` : ''}</div>
        </div>

        {/* Tree Content */}
        <div className="px-2 py-1.5 overflow-y-auto flex-1 max-h-[350px] custom-scrollbar divide-y divide-slate-50">
          {hierarchyToUse.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <Layers className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
              <p className="text-xs font-semibold">No warehouse hierarchy loaded</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Pass rawHierarchy data to display locations</p>
            </div>
          ) : rootFactories.filter(matchesSearch).length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <Search className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
              <p className="text-xs font-semibold">No matching locations</p>
            </div>
          ) : (
            rootFactories.filter(matchesSearch).map(factory => {
              const fId = String(factory._id);
              const isExpanded = !!expandedNodes[fId] || searchQuery.trim().length > 0;
              const floors = hierarchyToUse.filter(l => l.level === 'Floor' && String(l.parentId) === fId);
              const isSelected = tempSelectedId === fId || tempSelectedId === factory.name;
              const fStock = getLocationStock(fId, 'Factory');

              return (
                <div key={fId} className="py-0.5 select-none">
                  {/* FACTORY ROW */}
                  <div
                    onClick={(e) => handleItemSelect(factory, e)}
                    className={`grid grid-cols-12 px-2 py-1.5 items-center rounded-xl transition-all cursor-pointer ${
                      isSelected
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
                        const zones = hierarchyToUse.filter(l => l.level === 'Zone' && String(l.parentId) === flId);
                        const isFlSelected = tempSelectedId === flId || tempSelectedId === floor.name;
                        const flStock = getLocationStock(flId, 'Floor');

                        return (
                          <div key={flId} className="space-y-0.5">
                            {/* FLOOR ROW */}
                            <div
                              onClick={(e) => handleItemSelect(floor, e)}
                              className={`grid grid-cols-12 px-2 py-1.5 items-center rounded-xl transition-all cursor-pointer ${
                                isFlSelected
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
                                  const bins = hierarchyToUse.filter(l => l.level === 'Storage Location' && String(l.parentId) === zId);
                                  const isZSelected = tempSelectedId === zId || tempSelectedId === zone.name;
                                  const zStock = getLocationStock(zId, 'Zone');

                                  return (
                                    <div key={zId} className="space-y-0.5">
                                      {/* ZONE ROW */}
                                      <div
                                        onClick={(e) => handleItemSelect(zone, e)}
                                        className={`grid grid-cols-12 px-2 py-1.5 items-center rounded-xl transition-all cursor-pointer ${
                                          isZSelected
                                            ? 'bg-blue-50/80 text-blue-900 font-bold border border-blue-200/70 shadow-3xs'
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
                                          <span className={`text-xs truncate ${isZSelected ? 'font-bold text-blue-900' : 'font-semibold text-slate-800'}`}>
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

                                          {isZSelected && (
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
                                            const isBinSelected = tempSelectedId === bId || tempSelectedId === bin.name;
                                            const bStock = getLocationStock(bId, 'Storage Location');
                                            const hasStock = bStock.qty > 0;

                                            return (
                                              <div
                                                key={bId}
                                                onClick={(e) => handleItemSelect(bin, e)}
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
              {selectedPathStr ? (
                <span>Ready: <strong className="text-slate-800 font-semibold">{selectedPathStr.split(' › ').pop()}</strong></span>
              ) : (
                'Choose a location'
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 text-xs font-bold rounded-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white shadow-blue-200 shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Check className="w-3 h-3 stroke-[2.5]" />
              <span>Apply</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

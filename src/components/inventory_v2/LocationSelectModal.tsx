import React, { useState, useMemo, useEffect } from 'react';
import { 
  Layers, 
  LayoutGrid, 
  Box, 
  ChevronRight, 
  Check, 
  X, 
  Search, 
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { WarehouseLocationV2 } from '../../api/mfgApiV2';

interface LocationSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawHierarchy?: WarehouseLocationV2[];
  selectedLocationId?: string;
  onSelectLocation: (locId: string, locPath: string) => void;
  title?: string;
}

const DEFAULT_DEMO_HIERARCHY: WarehouseLocationV2[] = [
  { _id: 'fact-skbw', name: 'SKBW', level: 'Factory', parentId: null, status: 'Active' },
  { _id: 'floor-ground', name: 'Ground', level: 'Floor', parentId: 'fact-skbw', status: 'Active' },
  { _id: 'zone-a', name: 'A', level: 'Zone', parentId: 'floor-ground', status: 'Active' },
  { _id: 'loc-top', name: 'Top', level: 'Storage Location', parentId: 'zone-a', status: 'Active' },
  { _id: 'loc-bottom', name: 'Bottom', level: 'Storage Location', parentId: 'zone-a', status: 'Active' },
  { _id: 'zone-m', name: 'M', level: 'Zone', parentId: 'floor-ground', status: 'Active' },
  { _id: 'loc-m1', name: 'Bin 1', level: 'Storage Location', parentId: 'zone-m', status: 'Active' },
  { _id: 'loc-m2', name: 'Bin 2', level: 'Storage Location', parentId: 'zone-m', status: 'Active' },
  { _id: 'zone-s', name: 'S', level: 'Zone', parentId: 'floor-ground', status: 'Active' },
  { _id: 'loc-s1', name: 'Bin 1', level: 'Storage Location', parentId: 'zone-s', status: 'Active' },
  { _id: 'loc-s2', name: 'Bin 2', level: 'Storage Location', parentId: 'zone-s', status: 'Active' },
  { _id: 'floor-1st', name: '1st', level: 'Floor', parentId: 'fact-skbw', status: 'Active' },
  { _id: 'floor-2nd', name: '2nd', level: 'Floor', parentId: 'fact-skbw', status: 'Active' },
  { _id: 'fact-lom', name: 'LOM', level: 'Factory', parentId: null, status: 'Active' },
  { _id: 'fact-maruti', name: 'Maruti', level: 'Factory', parentId: null, status: 'Active' }
];

export const LocationSelectModal: React.FC<LocationSelectModalProps> = ({
  isOpen,
  onClose,
  rawHierarchy = [],
  selectedLocationId = '',
  onSelectLocation,
  title = 'Warehouse Hierarchy'
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [tempSelectedId, setTempSelectedId] = useState<string>(selectedLocationId);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  const hierarchyToUse = useMemo(() => {
    return Array.isArray(rawHierarchy) && rawHierarchy.length > 0 ? rawHierarchy : DEFAULT_DEMO_HIERARCHY;
  }, [rawHierarchy]);

  // Build Location Map & Paths
  const locMap = useMemo(() => {
    const map = new Map<string, WarehouseLocationV2>();
    hierarchyToUse.forEach(item => {
      if (item && item._id) map.set(String(item._id), item);
    });
    return map;
  }, [hierarchyToUse]);

  // Sub-counts calculator for node badge (e.g. 3F · 9Z · 14B)
  const getNodeSubCounts = (nodeId: string) => {
    let floorCount = 0;
    let zoneCount = 0;
    let binCount = 0;

    const findDescendants = (pId: string) => {
      const children = hierarchyToUse.filter(l => l && String(l.parentId) === String(pId));
      children.forEach(c => {
        if (c.level === 'Floor') floorCount++;
        else if (c.level === 'Zone') zoneCount++;
        else if (c.level === 'Storage Location') binCount++;
        if (c._id) findDescendants(String(c._id));
      });
    };

    findDescendants(nodeId);
    return { floorCount, zoneCount, binCount };
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
      const initialExpanded: Record<string, boolean> = {};

      if (selectedLocationId) {
        const target = locMap.get(selectedLocationId) || hierarchyToUse.find(l => l.name?.toLowerCase().trim() === selectedLocationId.toLowerCase().trim());
        if (target) {
          let curr: WarehouseLocationV2 | undefined = target;
          let g = 0;
          while (curr && g < 8) {
            if (curr._id) initialExpanded[String(curr._id)] = true;
            if (curr.parentId) {
              initialExpanded[String(curr.parentId)] = true;
              curr = locMap.get(String(curr.parentId));
            } else {
              break;
            }
            g++;
          }
        }
      }

      // If nothing expanded, expand root factories by default
      if (Object.keys(initialExpanded).length === 0) {
        hierarchyToUse.filter(l => l.level === 'Factory' || (!l.parentId && !l.level)).forEach(f => {
          if (f._id) initialExpanded[String(f._id)] = true;
        });
      }

      setExpandedNodes(initialExpanded);
    }
  }, [isOpen, selectedLocationId, hierarchyToUse, locMap]);

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

  const rootFactories = hierarchyToUse.filter(l => l.level === 'Factory' || (!l.parentId && !l.level));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/25 backdrop-blur-xs animate-fadeIn font-sans">
      <div className="bg-white rounded-[26px] shadow-2xl shadow-slate-900/10 w-full max-w-[390px] overflow-hidden border border-slate-100 flex flex-col max-h-[82vh] animate-scaleIn">
        
        {/* Cute Minimal Header */}
        <div className="p-4 pb-3 flex items-center justify-between bg-gradient-to-b from-sky-50/50 via-white to-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-500 border border-blue-100/70 flex items-center justify-center shrink-0 shadow-3xs">
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
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50/90 hover:bg-slate-50 border border-slate-200/60 rounded-full focus-within:bg-white focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-100 transition-all">
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
          <div className="bg-amber-50/90 border border-amber-200/70 mx-4 mb-2 rounded-xl p-2 px-3 text-amber-800 text-[11px] font-semibold flex items-center gap-1.5 animate-fadeIn">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{warningMsg}</span>
          </div>
        )}

        {/* Cute Selection Pill Banner */}
        <div className="px-4 py-1.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50/80 rounded-xl text-xs text-slate-600">
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

        {/* Tree Content: Clean, Borderless, Minimal */}
        <div className="px-3 py-2 overflow-y-auto flex-1 max-h-[360px] custom-scrollbar space-y-0.5">
          {rootFactories.filter(matchesSearch).length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <Layers className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
              <p className="text-xs font-semibold">No locations found</p>
            </div>
          ) : (
            rootFactories.filter(matchesSearch).map(factory => {
              const fId = String(factory._id);
              const isExpanded = !!expandedNodes[fId] || searchQuery.trim().length > 0;
              const counts = getNodeSubCounts(fId);
              const floors = hierarchyToUse.filter(l => l.level === 'Floor' && String(l.parentId) === fId);

              return (
                <div key={fId} className="space-y-0.5 select-none">
                  {/* FACTORY ROW */}
                  <div
                    onClick={(e) => handleItemSelect(factory, e)}
                    className="group flex items-center justify-between py-2 px-2.5 rounded-xl transition-all cursor-pointer hover:bg-slate-50/80 text-slate-700"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Layers className="w-4 h-4 text-slate-400 group-hover:text-slate-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {factory.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal ml-0.5 shrink-0">
                        ({counts.floorCount}F · {counts.zoneCount}Z · {counts.binCount}B)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => toggleExpand(fId, e)}
                      className="p-1 rounded-md text-slate-300 hover:text-slate-600 transition-colors"
                    >
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${isExpanded ? 'rotate-90 text-slate-600' : ''}`} />
                    </button>
                  </div>

                  {/* FLOORS UNDER FACTORY */}
                  {isExpanded && (
                    <div className="pl-3.5 space-y-0.5">
                      {floors.filter(matchesSearch).map(floor => {
                        const flId = String(floor._id);
                        const isFlExpanded = !!expandedNodes[flId] || searchQuery.trim().length > 0;
                        const flCounts = getNodeSubCounts(flId);
                        const zones = hierarchyToUse.filter(l => l.level === 'Zone' && String(l.parentId) === flId);

                        return (
                          <div key={flId} className="space-y-0.5">
                            {/* FLOOR ROW */}
                            <div
                              onClick={(e) => handleItemSelect(floor, e)}
                              className="group flex items-center justify-between py-1.5 px-2 rounded-lg transition-all cursor-pointer hover:bg-slate-50/80 text-slate-600"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="text-xs font-semibold text-slate-700 truncate">
                                  {floor.name}
                                </span>
                                <span className="text-[10px] text-slate-400 font-normal ml-0.5 shrink-0">
                                  ({flCounts.zoneCount}Z · {flCounts.binCount}B)
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => toggleExpand(flId, e)}
                                className="p-1 rounded-md text-slate-300 hover:text-slate-600"
                              >
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${isFlExpanded ? 'rotate-90 text-slate-600' : ''}`} />
                              </button>
                            </div>

                            {/* ZONES UNDER FLOOR */}
                            {isFlExpanded && (
                              <div className="pl-3.5 space-y-0.5">
                                {zones.filter(matchesSearch).map((zone) => {
                                  const zId = String(zone._id);
                                  const isZExpanded = !!expandedNodes[zId] || searchQuery.trim().length > 0;
                                  const bins = hierarchyToUse.filter(l => l.level === 'Storage Location' && String(l.parentId) === zId);
                                  const isZSelected = tempSelectedId === zId || tempSelectedId === zone.name;

                                  return (
                                    <div key={zId} className="space-y-0.5">
                                      {/* ZONE ROW */}
                                      <div
                                        onClick={(e) => handleItemSelect(zone, e)}
                                        className={`group flex items-center justify-between py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                                          isZSelected && !bins.length
                                            ? 'bg-blue-50/90 text-blue-900 border border-blue-200/80 shadow-3xs'
                                            : 'hover:bg-slate-50/80 text-slate-600'
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                          <LayoutGrid className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                          <span className="text-xs font-medium text-slate-700 truncate">
                                            {zone.name}
                                          </span>
                                          <span className="text-[10px] text-slate-400 font-normal shrink-0">
                                            ({bins.length} {bins.length === 1 ? 'bin' : 'bins'})
                                          </span>
                                        </div>

                                        {bins.length > 0 ? (
                                          <button
                                            type="button"
                                            onClick={(e) => toggleExpand(zId, e)}
                                            className="p-1 rounded-md text-slate-300 hover:text-slate-600"
                                          >
                                            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${isZExpanded ? 'rotate-90 text-slate-600' : ''}`} />
                                          </button>
                                        ) : (
                                          <span className="text-[9.5px] font-medium text-slate-400">
                                            Select
                                          </span>
                                        )}
                                      </div>

                                      {/* BINS UNDER ZONE */}
                                      {isZExpanded && bins.length > 0 && (
                                        <div className="pl-4 space-y-0.5">
                                          {bins.filter(matchesSearch).map(bin => {
                                            const bId = String(bin._id);
                                            const isBinSelected = tempSelectedId === bId || tempSelectedId === bin.name;

                                            return (
                                              <div
                                                key={bId}
                                                onClick={(e) => handleItemSelect(bin, e)}
                                                className={`group flex items-center justify-between py-1.5 px-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                                                  isBinSelected
                                                    ? 'bg-blue-50/90 text-blue-900 border border-blue-200/80 shadow-3xs'
                                                    : 'hover:bg-slate-50/90 text-slate-600'
                                                }`}
                                              >
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <Box className={`w-3.5 h-3.5 shrink-0 ${isBinSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                                                  <span className={`truncate ${isBinSelected ? 'font-bold' : 'font-normal'}`}>
                                                    {bin.name}
                                                  </span>
                                                </div>

                                                <div className="flex items-center gap-1.5 shrink-0">
                                                  <span className="text-[10px] text-slate-400 font-mono">
                                                    {bin.capacity ? `${bin.capacity} ${bin.unit || 'kg'}` : ''}
                                                  </span>
                                                  {isBinSelected && (
                                                    <div className="w-3.5 h-3.5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-3xs">
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

        {/* Minimal Cute Footer */}
        <div className="p-3 px-4 bg-white border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] text-slate-500 font-medium truncate block">
              {selectedPathStr ? (
                <span>Ready: <strong className="text-slate-700 font-semibold">{selectedPathStr.split(' › ').pop()}</strong></span>
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
};

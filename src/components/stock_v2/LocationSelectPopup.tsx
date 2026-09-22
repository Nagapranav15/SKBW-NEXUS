import React, { useState, useMemo, useEffect } from 'react';
import { 
  Building2, 
  Layers, 
  LayoutGrid, 
  Box, 
  ChevronRight, 
  ChevronDown,
  Check, 
  X,
  Search,
  Sparkles
} from 'lucide-react';
import { WarehouseLocationV2 } from '../../api/mfgApiV2';

interface LocationSelectPopupProps {
  label: string;
  locations: WarehouseLocationV2[];
  warehouseId: string;
  floorId: string;
  zoneId: string;
  locationId: string;
  onChange: (warehouseId: string, floorId: string, zoneId: string, locationId: string) => void;
  badgeColor?: 'blue' | 'rose' | 'indigo' | 'emerald';
  disabled?: boolean;
  required?: boolean;
}

const FALLBACK_LOCATIONS: WarehouseLocationV2[] = [
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

export const LocationSelectPopup: React.FC<LocationSelectPopupProps> = ({
  label,
  locations = [],
  warehouseId,
  floorId,
  zoneId,
  locationId,
  onChange,
  badgeColor = 'blue',
  disabled = false,
  required = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Draft selection state inside popup
  const [selectedWhId, setSelectedWhId] = useState<string>(warehouseId);
  const [selectedFId, setSelectedFId] = useState<string>(floorId);
  const [selectedZId, setSelectedZId] = useState<string>(zoneId);
  const [selectedLId, setSelectedLId] = useState<string>(locationId);

  // Normalized location list
  const allLocs = useMemo(() => {
    return Array.isArray(locations) && locations.length > 0 ? locations : FALLBACK_LOCATIONS;
  }, [locations]);

  // Lookup map
  const locMap = useMemo(() => {
    const map = new Map<string, WarehouseLocationV2>();
    allLocs.forEach(l => {
      if (l && l._id) map.set(String(l._id), l);
    });
    return map;
  }, [allLocs]);

  // Sub-counts calculator for node badge (e.g. 3F · 9Z · 14B)
  const getNodeSubCounts = (nodeId: string) => {
    let floorCount = 0;
    let zoneCount = 0;
    let binCount = 0;

    const findDescendants = (pId: string) => {
      const children = allLocs.filter(l => l && String(l.parentId) === String(pId));
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

  // Sync draft state on open or prop change
  useEffect(() => {
    if (isOpen) {
      setSelectedWhId(warehouseId);
      setSelectedFId(floorId);
      setSelectedZId(zoneId);
      setSelectedLId(locationId);
      setSearchQuery('');

      // Auto-expand path to currently selected node
      const initialExpanded: Record<string, boolean> = {};
      const targetId = locationId || zoneId || floorId || warehouseId;
      if (targetId) {
        let curr = locMap.get(targetId);
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
      // Expand root factories by default if none expanded
      if (Object.keys(initialExpanded).length === 0) {
        allLocs.filter(l => l.level === 'Factory' || (!l.parentId && !l.level)).forEach(f => {
          if (f._id) initialExpanded[String(f._id)] = true;
        });
      }
      setExpandedNodes(initialExpanded);
    }
  }, [isOpen, warehouseId, floorId, zoneId, locationId, locMap, allLocs]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Node selection handler: automatically resolves full hierarchy
  const handleSelectNode = (node: WarehouseLocationV2) => {
    if (!node || !node._id) return;
    const nId = String(node._id);
    const lvl = node.level;

    if (lvl === 'Storage Location') {
      // Bin selected: walk up parent chain
      const parentZone = node.parentId ? locMap.get(String(node.parentId)) : undefined;
      const parentFloor = parentZone?.parentId ? locMap.get(String(parentZone.parentId)) : undefined;
      const parentWh = parentFloor?.parentId ? locMap.get(String(parentFloor.parentId)) : undefined;

      setSelectedLId(nId);
      if (parentZone?._id) setSelectedZId(String(parentZone._id));
      if (parentFloor?._id) setSelectedFId(String(parentFloor._id));
      if (parentWh?._id) setSelectedWhId(String(parentWh._id));
    } else if (lvl === 'Zone') {
      // Zone selected: find parent floor and warehouse
      const parentFloor = node.parentId ? locMap.get(String(node.parentId)) : undefined;
      const parentWh = parentFloor?.parentId ? locMap.get(String(parentFloor.parentId)) : undefined;

      // Find child bins under this zone
      const childBins = allLocs.filter(l => l.level === 'Storage Location' && String(l.parentId) === nId);
      if (childBins.length > 0) {
        // Toggle expansion to show bins
        setExpandedNodes(prev => ({ ...prev, [nId]: !prev[nId] }));
        setSelectedZId(nId);
        setSelectedLId(String(childBins[0]._id));
      } else {
        setSelectedZId(nId);
        setSelectedLId(nId);
      }
      if (parentFloor?._id) setSelectedFId(String(parentFloor._id));
      if (parentWh?._id) setSelectedWhId(String(parentWh._id));
    } else if (lvl === 'Floor') {
      // Toggle expansion for floor
      setExpandedNodes(prev => ({ ...prev, [nId]: !prev[nId] }));
      const zones = allLocs.filter(l => l.level === 'Zone' && String(l.parentId) === nId);
      if (zones.length > 0) {
        setSelectedFId(nId);
        const firstZone = zones[0];
        const firstBin = allLocs.find(l => l.level === 'Storage Location' && String(l.parentId) === String(firstZone._id));
        setSelectedZId(String(firstZone._id));
        setSelectedLId(firstBin?._id ? String(firstBin._id) : String(firstZone._id));
        const parentWh = node.parentId ? locMap.get(String(node.parentId)) : undefined;
        if (parentWh?._id) setSelectedWhId(String(parentWh._id));
      }
    } else if (lvl === 'Factory' || !node.parentId) {
      // Toggle expansion for factory
      setExpandedNodes(prev => ({ ...prev, [nId]: !prev[nId] }));
    }
  };

  const handleConfirm = () => {
    onChange(selectedWhId, selectedFId, selectedZId, selectedLId);
    setIsOpen(false);
  };

  const cuteTheme = {
    rose: {
      badgeBg: 'bg-rose-50/80 text-rose-600 border-rose-100',
      iconBox: 'bg-rose-50 text-rose-500 border border-rose-100/70',
      activeDot: 'bg-rose-500',
      selectedItem: 'bg-rose-50/90 text-rose-900 border border-rose-200/80 shadow-3xs',
      selectedText: 'text-rose-700',
      checkBg: 'bg-rose-500 text-white',
      btnPrimary: 'bg-rose-500 hover:bg-rose-600 active:scale-[0.98] text-white shadow-rose-200 shadow-sm',
      headerBg: 'bg-gradient-to-b from-rose-50/50 via-white to-white'
    },
    blue: {
      badgeBg: 'bg-blue-50/80 text-blue-600 border-blue-100',
      iconBox: 'bg-blue-50 text-blue-500 border border-blue-100/70',
      activeDot: 'bg-blue-500',
      selectedItem: 'bg-blue-50/90 text-blue-900 border border-blue-200/80 shadow-3xs',
      selectedText: 'text-blue-700',
      checkBg: 'bg-blue-600 text-white',
      btnPrimary: 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white shadow-blue-200 shadow-sm',
      headerBg: 'bg-gradient-to-b from-sky-50/50 via-white to-white'
    },
    indigo: {
      badgeBg: 'bg-indigo-50/80 text-indigo-600 border-indigo-100',
      iconBox: 'bg-indigo-50 text-indigo-500 border border-indigo-100/70',
      activeDot: 'bg-indigo-500',
      selectedItem: 'bg-indigo-50/90 text-indigo-900 border border-indigo-200/80 shadow-3xs',
      selectedText: 'text-indigo-700',
      checkBg: 'bg-indigo-600 text-white',
      btnPrimary: 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-indigo-200 shadow-sm',
      headerBg: 'bg-gradient-to-b from-indigo-50/50 via-white to-white'
    },
    emerald: {
      badgeBg: 'bg-emerald-50/80 text-emerald-600 border-emerald-100',
      iconBox: 'bg-emerald-50 text-emerald-500 border border-emerald-100/70',
      activeDot: 'bg-emerald-500',
      selectedItem: 'bg-emerald-50/90 text-emerald-900 border border-emerald-200/80 shadow-3xs',
      selectedText: 'text-emerald-700',
      checkBg: 'bg-emerald-600 text-white',
      btnPrimary: 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white shadow-emerald-200 shadow-sm',
      headerBg: 'bg-gradient-to-b from-emerald-50/50 via-white to-white'
    }
  }[badgeColor];

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
    <div className="space-y-1.5 font-sans">
      {/* Label */}
      <div className="flex items-center justify-between">
        <label className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wider block">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(true)}
          className="text-[10px] font-semibold text-slate-400 hover:text-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
        >
          <span>Browse</span>
          <ChevronRight className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Cute Trigger Pill Box on Form */}
      <div
        onClick={() => !disabled && setIsOpen(true)}
        className={`w-full p-2.5 bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl transition-all cursor-pointer shadow-3xs group flex items-center justify-between gap-3 ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
        title="Click to select warehouse location"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl shrink-0 ${cuteTheme.iconBox} flex items-center justify-center shadow-3xs`}>
            <Layers className="w-4 h-4 stroke-[2]" />
          </div>

          <div className="min-w-0">
            {/* Breadcrumb Path */}
            <div className="flex items-center flex-wrap gap-1 text-xs font-semibold text-slate-800">
              <span className="text-slate-900 font-bold">{currentWhName}</span>
              <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
              <span className="text-slate-600">{currentFloorName}</span>
              <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
              <span className="text-slate-600">{currentZoneName}</span>
              <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
              <span className={`font-bold px-1.5 py-0.5 rounded-md text-[11px] ${cuteTheme.badgeBg} border`}>
                {currentLocName}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Storage Bin: <span className="font-semibold text-slate-600">{currentLocName}</span>
            </div>
          </div>
        </div>

        {/* Small cute button */}
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
          className="px-2.5 py-1 bg-slate-50 group-hover:bg-slate-100 text-slate-600 rounded-xl text-[11px] font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1"
        >
          <span>Change</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
      </div>

      {/* ── CUTE & MINIMAL POPUP MODAL ── */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/25 backdrop-blur-xs animate-fadeIn font-sans">
          <div 
            className="bg-white rounded-[26px] border border-slate-100 shadow-2xl shadow-slate-900/10 w-full max-w-[390px] overflow-hidden animate-scaleIn flex flex-col max-h-[82vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cute Top Header */}
            <div className={`p-4 pb-3 flex items-center justify-between ${cuteTheme.headerBg}`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-2xl ${cuteTheme.iconBox} flex items-center justify-center shrink-0 shadow-3xs`}>
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

            {/* Cute Selection Pill Banner */}
            <div className="px-4 py-1.5">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50/80 rounded-xl text-xs text-slate-600">
                <span className={`w-1.5 h-1.5 rounded-full ${cuteTheme.activeDot} shrink-0 animate-pulse`} />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Path:</span>
                {draftParts.length > 0 ? (
                  <div className="flex items-center flex-wrap gap-1 font-semibold text-[11px] truncate">
                    {draftParts.map((p, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="text-slate-300">›</span>}
                        <span className={idx === draftParts.length - 1 ? `${cuteTheme.selectedText} font-bold` : 'text-slate-600'}>
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
                  const floors = allLocs.filter(l => l.level === 'Floor' && String(l.parentId) === fId);
                  const isSelected = selectedWhId === fId;

                  return (
                    <div key={fId} className="space-y-0.5 select-none">
                      {/* FACTORY ROW */}
                      <div
                        onClick={() => handleSelectNode(factory)}
                        className={`group flex items-center justify-between py-2 px-2.5 rounded-xl transition-all cursor-pointer ${
                          isSelected && !selectedFId
                            ? 'bg-slate-100 text-slate-900 font-bold' 
                            : 'hover:bg-slate-50/80 text-slate-700'
                        }`}
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
                            const zones = allLocs.filter(l => l.level === 'Zone' && String(l.parentId) === flId);
                            const isFlSelected = selectedFId === flId;

                            return (
                              <div key={flId} className="space-y-0.5">
                                {/* FLOOR ROW */}
                                <div
                                  onClick={() => handleSelectNode(floor)}
                                  className={`group flex items-center justify-between py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                                    isFlSelected && !selectedZId
                                      ? 'bg-slate-100 text-slate-900 font-semibold' 
                                      : 'hover:bg-slate-50/80 text-slate-600'
                                  }`}
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
                                      const bins = allLocs.filter(l => l.level === 'Storage Location' && String(l.parentId) === zId);
                                      const isZSelected = selectedZId === zId;

                                      return (
                                        <div key={zId} className="space-y-0.5">
                                          {/* ZONE ROW (Clean, no boxes inside boxes) */}
                                          <div
                                            onClick={() => handleSelectNode(zone)}
                                            className={`group flex items-center justify-between py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                                              isZSelected && (!bins.length || selectedLId === zId)
                                                ? cuteTheme.selectedItem
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
                                                const isBinSelected = selectedLId === bId;

                                                return (
                                                  <div
                                                    key={bId}
                                                    onClick={() => handleSelectNode(bin)}
                                                    className={`group flex items-center justify-between py-1.5 px-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                                                      isBinSelected
                                                        ? cuteTheme.selectedItem
                                                        : 'hover:bg-slate-50/90 text-slate-600'
                                                    }`}
                                                  >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                      <Box className={`w-3.5 h-3.5 shrink-0 ${isBinSelected ? cuteTheme.selectedText : 'text-slate-400'}`} />
                                                      <span className={`truncate ${isBinSelected ? 'font-bold' : 'font-normal'}`}>
                                                        {bin.name}
                                                      </span>
                                                    </div>

                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                      <span className="text-[10px] text-slate-400 font-mono">
                                                        {bin.capacity ? `${bin.capacity} ${bin.unit || 'kg'}` : ''}
                                                      </span>
                                                      {isBinSelected && (
                                                        <div className={`w-3.5 h-3.5 rounded-full ${cuteTheme.checkBg} flex items-center justify-center shadow-3xs`}>
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
                  {draftParts.length > 0 ? (
                    <span>Ready: <strong className="text-slate-700 font-semibold">{draftParts[draftParts.length - 1]}</strong></span>
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
                  className={`px-4 py-1.5 text-xs font-bold rounded-full ${cuteTheme.btnPrimary} flex items-center gap-1.5 cursor-pointer transition-all`}
                >
                  <Check className="w-3 h-3 stroke-[2.5]" />
                  <span>Confirm Location</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

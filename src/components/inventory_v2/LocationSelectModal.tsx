import React, { useState, useMemo, useEffect } from 'react';
import { MapPin, X, ChevronDown, ChevronRight, AlertCircle, Search } from 'lucide-react';
import { WarehouseLocationV2 } from '../../api/mfgApiV2';

interface LocationSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawHierarchy?: WarehouseLocationV2[];
  selectedLocationId?: string;
  onSelectLocation: (locId: string, locPath: string) => void;
  title?: string;
}

interface TreeNode {
  item: WarehouseLocationV2;
  children: TreeNode[];
  path: string;
}

const DEFAULT_DEMO_HIERARCHY: WarehouseLocationV2[] = [
  { _id: 'fact-1', name: 'Main Factory (Unit 1)', level: 'Factory', parentId: null, status: 'Active' },
  { _id: 'floor-1', name: 'Ground Floor', level: 'Floor', parentId: 'fact-1', status: 'Active' },
  { _id: 'zone-1', name: 'Zone A - Raw Paper Store', level: 'Zone', parentId: 'floor-1', status: 'Active' },
  { _id: 'loc-1', name: 'Rack 01 - Reel Bay A', level: 'Storage Location', parentId: 'zone-1', status: 'Active' },
  { _id: 'loc-2', name: 'Rack 02 - Reel Bay B', level: 'Storage Location', parentId: 'zone-1', status: 'Active' },
  { _id: 'zone-2', name: 'Zone B - Finished Goods Store', level: 'Zone', parentId: 'floor-1', status: 'Active' },
  { _id: 'loc-3', name: 'Pallet Bay 101', level: 'Storage Location', parentId: 'zone-2', status: 'Active' },
  { _id: 'floor-2', name: 'First Floor (WIP & Semi)', level: 'Floor', parentId: 'fact-1', status: 'Active' },
  { _id: 'zone-3', name: 'Zone C - Semi Finished Storage', level: 'Zone', parentId: 'floor-2', status: 'Active' },
  { _id: 'loc-4', name: 'Shelf 01 - Book Blocks', level: 'Storage Location', parentId: 'zone-3', status: 'Active' },
  { _id: 'loc-5', name: 'Shelf 02 - Cover Boards', level: 'Storage Location', parentId: 'zone-3', status: 'Active' },
  { _id: 'fact-2', name: 'Secondary Godown (Unit 2)', level: 'Factory', parentId: null, status: 'Active' },
  { _id: 'floor-3', name: 'Main Floor', level: 'Floor', parentId: 'fact-2', status: 'Active' },
  { _id: 'zone-4', name: 'Zone D - Dispatch & Buffer', level: 'Zone', parentId: 'floor-3', status: 'Active' }
];

export const LocationSelectModal: React.FC<LocationSelectModalProps> = ({
  isOpen,
  onClose,
  rawHierarchy = [],
  selectedLocationId = '',
  onSelectLocation,
  title = 'Select Location'
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
    return parts.join(' ➔ ');
  };

  // Build Safe Tree Nodes with cycle protection
  const treeNodes = useMemo(() => {
    if (!isOpen) return [];

    const visitedIds = new Set<string>();

    const buildNodes = (parentId: string | null, parentPath: string, depth: number): TreeNode[] => {
      if (depth > 6) return [];

      const children = hierarchyToUse.filter(item => {
        if (!item || !item.name) return false;
        const itemId = String(item._id || item.name);
        if (visitedIds.has(itemId)) return false;

        if (!parentId) {
          return !item.parentId || !locMap.has(String(item.parentId));
        }
        return String(item.parentId) === String(parentId);
      });

      return children.map(item => {
        const itemId = String(item._id || item.name);
        visitedIds.add(itemId);
        const currentPath = parentPath ? `${parentPath} ➔ ${item.name}` : item.name;
        
        return {
          item,
          path: currentPath,
          children: buildNodes(itemId, currentPath, depth + 1)
        };
      });
    };

    return buildNodes(null, '', 0);
  }, [isOpen, hierarchyToUse, locMap]);

  useEffect(() => {
    if (isOpen) {
      setTempSelectedId(selectedLocationId);
      setSearchQuery('');
      setWarningMsg(null);
      const initialExpanded: Record<string, boolean> = {};

      if (selectedLocationId) {
        const target = locMap.get(selectedLocationId) || hierarchyToUse.find(l => l.name?.toLowerCase().trim() === selectedLocationId.toLowerCase().trim());
        if (target && target.parentId) {
          let pId: string | null = String(target.parentId);
          let g = 0;
          while (pId && g < 8) {
            initialExpanded[pId] = true;
            const parent = locMap.get(pId);
            pId = parent?.parentId ? String(parent.parentId) : null;
            g++;
          }
        }
      }

      setExpandedNodes(initialExpanded);
    }
  }, [isOpen, selectedLocationId, hierarchyToUse, locMap]);

  if (!isOpen) return null;

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleItemSelect = (node: TreeNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const lvl = node.item.level;
    if (lvl === 'Factory' || lvl === 'Floor') {
      setWarningMsg(`Cannot select ${lvl}. Choose Zone or Loc.`);
      setTimeout(() => setWarningMsg(null), 2500);
      return;
    }

    setWarningMsg(null);
    const id = String(node.item._id || node.item.name);
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

  const renderTree = (nodes: TreeNode[], depth = 0) => {
    return (
      <div className="space-y-0.5">
        {nodes.map(node => {
          const id = String(node.item._id || node.item.name);
          const isExpanded = !!expandedNodes[id] || (searchQuery.trim().length > 0);
          const hasChildren = Array.isArray(node.children) && node.children.length > 0;
          const level = node.item.level || 'Zone';
          const isSelectable = level === 'Zone' || level === 'Storage Location' || (level !== 'Factory' && level !== 'Floor');
          const isSelected = tempSelectedId === id || tempSelectedId === node.item.name;

          if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            const matchesCurrent = node.item.name.toLowerCase().includes(query);
            const matchesChildren = node.children.some(c => c.item.name.toLowerCase().includes(query) || c.children.some(cc => cc.item.name.toLowerCase().includes(query)));
            if (!matchesCurrent && !matchesChildren) {
              return null;
            }
          }

          return (
            <div key={id} className="select-none">
              <div 
                onClick={(e) => {
                  if (hasChildren && !isSelectable) {
                    toggleExpand(id, e);
                  } else if (isSelectable) {
                    handleItemSelect(node, e);
                  } else {
                    handleItemSelect(node, e);
                  }
                }}
                style={{ paddingLeft: `${depth * 16 + 6}px` }}
                className={`group flex items-center justify-between py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                  isSelected 
                    ? 'bg-blue-50/90 border border-blue-200 text-blue-900 shadow-2xs font-semibold' 
                    : isSelectable 
                      ? 'hover:bg-slate-50 text-gray-800' 
                      : 'hover:bg-slate-50/70 text-gray-700'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {hasChildren ? (
                    <button 
                      type="button"
                      onClick={(e) => toggleExpand(id, e)}
                      className="w-4 h-4 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3 text-blue-600 font-bold" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-gray-400" />
                      )}
                    </button>
                  ) : (
                    <span className="w-4 inline-block"></span>
                  )}

                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></span>
                  )}

                  <span className={`text-[11px] truncate ${
                    isSelected ? 'font-bold text-blue-800' :
                    level === 'Factory' ? 'font-bold text-gray-900' :
                    level === 'Floor' ? 'font-semibold text-gray-800' :
                    level === 'Zone' ? 'font-medium text-gray-800' : 'font-normal text-gray-700'
                  }`}>
                    {node.item.name}
                  </span>
                </div>

                <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded shrink-0 ml-1.5 border ${
                  isSelected ? 'bg-blue-100 text-blue-800 border-blue-200' :
                  level === 'Factory' ? 'bg-purple-50 text-purple-700 border-purple-200/60' :
                  level === 'Floor' ? 'bg-slate-100 text-slate-600 border-slate-200/60' :
                  level === 'Zone' ? 'bg-blue-50 text-blue-700 border-blue-200/60' :
                  'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                }`}>
                  {level === 'Storage Location' ? 'Loc' : level}
                </span>
              </div>

              {isExpanded && hasChildren && (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-1 w-px bg-slate-200/80"></div>
                  {renderTree(node.children, depth + 1)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-slate-900/35 backdrop-blur-xs animate-fadeIn font-sans">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[340px] overflow-hidden border border-gray-100 flex flex-col max-h-[80vh] animate-scaleUp">
        
        {/* Compact Clean Header */}
        <div className="bg-white p-3 px-4 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100/80 shadow-2xs">
              <MapPin className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-900 tracking-tight leading-tight">{title}</h3>
              <p className="text-[10px] text-gray-400 font-normal">Select Zone or Loc (Locked Factory/Floor)</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search Filter Bar */}
        <div className="px-3.5 pt-2.5 pb-1">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7.5 pr-7 py-1.5 bg-slate-50 border border-gray-200 rounded-lg text-[11px] text-gray-800 placeholder-gray-400 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Warning Toast */}
        {warningMsg && (
          <div className="bg-amber-50 border border-amber-200 mx-3.5 mt-1.5 rounded-lg p-1.5 px-2.5 text-amber-900 text-[10px] font-semibold flex items-center gap-1.5 animate-fadeIn">
            <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
            <span>{warningMsg}</span>
          </div>
        )}

        {/* Tree Container */}
        <div className="p-2.5 px-3 overflow-y-auto flex-1 max-h-[260px] custom-scrollbar">
          {treeNodes.length > 0 ? (
            renderTree(treeNodes)
          ) : (
            <div className="py-8 text-center text-gray-400">
              <MapPin className="w-5 h-5 mx-auto mb-1 text-gray-300" />
              <p className="text-[11px] font-medium">No locations configured</p>
            </div>
          )}
        </div>

        {/* Footer & Compact Action Buttons */}
        <div className="p-2.5 px-3.5 bg-slate-50/60 border-t border-gray-100 flex items-center justify-between gap-2 rounded-b-2xl">
          <div className="min-w-0 flex-1 pr-1">
            {selectedPathStr ? (
              <div className="text-[10px] text-blue-700 font-semibold truncate flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-blue-600 shrink-0"></span>
                <span className="truncate">{selectedPathStr}</span>
              </div>
            ) : (
              <span className="text-[10px] text-gray-400 italic">No location selected</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 font-semibold text-[11px] cursor-pointer transition-all shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-3.5 py-1 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-bold text-[11px] cursor-pointer shadow-2xs hover:shadow transition-all shrink-0 whitespace-nowrap"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

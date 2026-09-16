import React, { useState, useMemo, useEffect } from 'react';
import { MapPin, X, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
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

  // Expand top-level nodes by default when modal opens
  useEffect(() => {
    if (isOpen) {
      setTempSelectedId(selectedLocationId);
      setWarningMsg(null);
      const initialExpanded: Record<string, boolean> = {};
      hierarchyToUse.forEach(item => {
        if (item) {
          const itemId = String(item._id || item.name);
          if (item.level === 'Factory' || item.level === 'Floor') {
            initialExpanded[itemId] = true;
          }
        }
      });
      setExpandedNodes(initialExpanded);
    }
  }, [isOpen, selectedLocationId, hierarchyToUse]);

  if (!isOpen) return null;

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCheckboxClick = (node: TreeNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const lvl = node.item.level;
    // User CANNOT select Factory or Floor!
    if (lvl === 'Factory' || lvl === 'Floor') {
      setWarningMsg(`Cannot select ${lvl} level. Please expand and select a Zone or Loc (Storage Location).`);
      setTimeout(() => setWarningMsg(null), 3500);
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

  const renderTree = (nodes: TreeNode[], depth = 0) => {
    return (
      <div className="space-y-1">
        {nodes.map(node => {
          const id = String(node.item._id || node.item.name);
          const isExpanded = !!expandedNodes[id];
          const hasChildren = Array.isArray(node.children) && node.children.length > 0;
          const level = node.item.level || 'Zone';
          const isSelectable = level === 'Zone' || level === 'Storage Location' || (level !== 'Factory' && level !== 'Floor');
          const isSelected = tempSelectedId === id || tempSelectedId === node.item.name;

          return (
            <div key={id} className="select-none">
              <div 
                onClick={(e) => {
                  if (hasChildren) toggleExpand(id, e);
                  if (isSelectable) handleCheckboxClick(node, e);
                }}
                style={{ paddingLeft: `${depth * 20 + 8}px` }}
                className={`flex items-center gap-2.5 py-2 px-3 rounded-xl transition-all cursor-pointer ${
                  isSelected 
                    ? 'bg-blue-50/90 border border-blue-300 text-blue-900 shadow-2xs font-bold' 
                    : isSelectable 
                      ? 'hover:bg-gray-50 text-gray-800' 
                      : 'hover:bg-gray-50/70 text-gray-500 opacity-90'
                }`}
              >
                {/* Arrow Collapse / Expand */}
                {hasChildren ? (
                  <button 
                    type="button"
                    onClick={(e) => toggleExpand(id, e)}
                    className="p-1 rounded-md hover:bg-gray-200 text-gray-500 cursor-pointer transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-blue-600 font-bold" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                ) : (
                  <span className="w-6 inline-block"></span>
                )}

                {/* Custom Styled Checkbox */}
                <div 
                  onClick={(e) => handleCheckboxClick(node, e)}
                  className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                    !isSelectable 
                      ? 'bg-gray-100 border border-gray-300 opacity-40 cursor-not-allowed' 
                      : isSelected 
                        ? 'bg-blue-600 border border-blue-600 text-white shadow-2xs cursor-pointer' 
                        : 'border-2 border-blue-400/80 bg-white hover:border-blue-600 cursor-pointer'
                  }`}
                  title={!isSelectable ? `Cannot select ${level}. Select a Zone or Loc instead.` : `Select ${node.item.name}`}
                >
                  {isSelected && (
                    <svg className="w-3.5 h-3.5 text-white stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                {/* Level Label & Badge */}
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${
                    level === 'Factory' ? 'font-extrabold text-gray-900 text-sm' :
                    level === 'Floor' ? 'font-bold text-gray-800' :
                    level === 'Zone' ? 'font-bold text-blue-700' : 'font-medium text-gray-700'
                  }`}>
                    {node.item.name}
                  </span>
                  
                  <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full ${
                    level === 'Factory' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                    level === 'Floor' ? 'bg-slate-100 text-slate-700 border border-slate-200' :
                    level === 'Zone' ? 'bg-blue-100 text-blue-800 border border-blue-300 font-extrabold' :
                    'bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold'
                  }`}>
                    {level === 'Storage Location' ? 'Loc' : level}
                  </span>
                </div>
              </div>

              {/* Render Children Recursively if Expanded */}
              {isExpanded && hasChildren && (
                <div className="relative">
                  <div className="absolute left-6 top-0 bottom-2 w-px bg-blue-100/80"></div>
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn font-sans">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 flex flex-col max-h-[90vh] animate-scaleUp">
        
        {/* Modern Blue Header matching Screenshot */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 px-6 flex items-center justify-between text-white shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-inner">
              <MapPin className="w-6 h-6 text-white stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold tracking-tight">{title}</h3>
              <p className="text-xs text-blue-100 font-medium">Select a Zone or Loc (Factory & Floor locked)</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Toast Notification for Invalid Selection */}
        {warningMsg && (
          <div className="bg-amber-50 border-b border-amber-200/80 p-3 px-5 text-amber-900 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{warningMsg}</span>
          </div>
        )}

        {/* Tree Container */}
        <div className="p-5 overflow-y-auto flex-1 max-h-[420px] custom-scrollbar">
          {treeNodes.length > 0 ? (
            renderTree(treeNodes)
          ) : (
            <div className="py-12 text-center text-gray-400">
              <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-xs font-semibold">No warehouse locations configured</p>
            </div>
          )}
        </div>

        {/* Action Buttons matching Screenshot */}
        <div className="p-4 px-6 bg-gray-50/80 border-t border-gray-100 flex items-center justify-end gap-3 rounded-b-3xl">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-700 bg-white hover:bg-gray-100 font-semibold text-xs cursor-pointer transition-all shadow-2xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-8 py-2.5 rounded-xl text-white bg-blue-600 hover:bg-blue-700 font-extrabold text-xs cursor-pointer shadow-md hover:shadow-lg transition-all"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

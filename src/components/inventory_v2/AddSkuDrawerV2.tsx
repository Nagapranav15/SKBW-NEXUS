import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Save, RefreshCw, BookOpen, Layers, Plus, Trash2, AlertCircle, MapPin, Search, ChevronDown, ChevronRight, Lock, Package, Building2, Pencil, Settings2, X } from 'lucide-react';
import { createSkuV2, updateSkuV2, SkuV2, getMetadataV2, updateMetadataV2, getSkusV2, getNextSkuCodeV2, getBalancesV2, getWarehouseHierarchyV2, WarehouseLocationV2 } from '../../api/mfgApiV2';
import { getParties } from '../../api/partyApi';
import Modal from '../ui/Modal';
import { BomCopyPasteControls } from './BomCopyPasteControls';
import { LocationSelectModal } from './LocationSelectModal';
import { showToast } from '../ui/Toast';
import { 
  validateUomConversion, 
  getUomDirection, 
  roundUomQty, 
  UomDirection,
  normalizeAndDeduplicateUnits
} from '../../utils/uomConversion';

interface AddSkuDrawerV2Props {
  isOpen: boolean;
  companyId: string;
  editSku?: SkuV2 | null;
  defaultCategory?: string;
  activeSection?: 'products' | 'materials' | 'semi';
  existingProductsCount?: number;
  existingMaterialsCount?: number;
  existingSemiCount?: number;
  onClose: () => void;
  onSaveSuccess: (savedSku: SkuV2) => void;
  customColumns?: string[];
  customColumnTypes?: { [colName: string]: string };
  customColumnValues?: { [key: string]: any };
  customColumnOptions?: { [colName: string]: { label: string; color: string }[] };
  setCustomColumnValues?: React.Dispatch<React.SetStateAction<{ [key: string]: any }>>;
  createdCategories?: { id?: string; name: string; type?: 'products' | 'materials' | 'semi'; uom?: string }[];
  onCategoryCreated?: (newCategory: { id: string; name: string; type: 'products' | 'materials' | 'semi'; uom: string; fields: string[] }) => void;
  onUnitCreated?: (newUnit: string) => void;
  onMetadataUpdated?: () => void;
}


export const SearchableMaterialDropdown: React.FC<{
  value: string;
  materials: SkuV2[];
  onChange: (selectedName: string, matchedSku?: SkuV2) => void;
}> = ({ value, materials, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; placeAbove: boolean }>({
    top: 0,
    left: 0,
    width: 0,
    placeAbove: false
  });

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < 280 && rect.top > spaceBelow;
    
    const width = Math.min(Math.max(rect.width, 580), window.innerWidth - 24);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - width - 12);
    }

    setCoords({
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      left,
      width,
      placeAbove
    });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, { capture: true });
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open]);

  const allMaterials = React.useMemo(() => {
    return (materials || []).filter(m => {
      const cat = (m.category || '').trim().toLowerCase();
      const code = (m.skuCode || '').trim().toUpperCase();
      const isFinishedGoods = cat === 'finished goods' || cat === 'products' || cat === 'finished' || code.startsWith('FG-') || code.startsWith('FG');
      return !isFinishedGoods;
    });
  }, [materials]);

  const filtered = allMaterials.filter(m =>
    (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.skuCode || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.category || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-full text-left">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) updatePosition();
          setOpen(!open);
        }}
        className="w-full px-3 py-2 bg-white border border-gray-200 hover:border-blue-300 rounded-xl text-xs font-semibold text-gray-800 flex items-center justify-between shadow-2xs transition-all cursor-pointer"
      >
        <span className="truncate">
          {value || <span className="text-gray-400 font-normal">-- Select Raw Material --</span>}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: `${coords.left}px`,
            ...(coords.placeAbove 
              ? { bottom: `${window.innerHeight - coords.top}px` } 
              : { top: `${coords.top}px` }
            ),
            width: `${coords.width}px`,
            zIndex: 999999
          }}
          className="bg-white border border-gray-200 rounded-2xl shadow-2xl p-2.5 space-y-2 text-xs animate-in fade-in zoom-in-95 duration-75"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search.trim()) {
                  e.preventDefault();
                  onChange(search.trim());
                  setOpen(false);
                  setSearch('');
                }
              }}
              placeholder="Search or type raw material..."
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
            />
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 no-scrollbar">
            {search.trim() && !allMaterials.some(m => (m.name || '').toLowerCase() === search.trim().toLowerCase()) && (
              <div
                onClick={() => {
                  onChange(search.trim());
                  setOpen(false);
                  setSearch('');
                }}
                className="p-2.5 hover:bg-emerald-50 text-emerald-700 font-bold rounded-xl cursor-pointer transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-600" />
                <span>Add "{search.trim()}"</span>
              </div>
            )}

            {filtered.map(mat => {
              const isSelected = mat.name === value;
              return (
                <div
                  key={mat._id || mat.skuCode || mat.name}
                  onClick={() => {
                    onChange(mat.name, mat);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`p-2.5 hover:bg-blue-50/80 rounded-xl cursor-pointer transition-colors flex items-center justify-between gap-3 group ${
                    isSelected ? 'bg-blue-50 text-blue-900 font-bold' : ''
                  }`}
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-xs leading-snug group-hover:text-blue-700 break-words">{mat.name}</div>
                    <div className="text-[10.5px] text-gray-400 flex items-center gap-1.5 flex-wrap">
                      <span className="bg-gray-100 px-1.5 py-0.2 rounded text-gray-700 font-mono font-bold">{mat.skuCode}</span>
                      <span>·</span>
                      <span className="capitalize">{mat.category || 'Raw Material'}</span>
                      {mat.gsm && (
                        <>
                          <span>·</span>
                          <span className="bg-slate-100 px-1 py-0.2 rounded text-slate-600 font-semibold">{mat.gsm} GSM</span>
                        </>
                      )}
                      {(mat.width || mat.length) && (
                        <>
                          <span>·</span>
                          <span className="text-slate-500 font-mono">{mat.width ? `${mat.width}cm` : ''}{mat.length ? ` x ${mat.length}cm` : ''}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    {mat.unit || 'Kg'}
                  </span>
                </div>
              );
            })}

            {filtered.length === 0 && !search.trim() && (
              <div className="p-4 text-center text-xs text-gray-400 italic">
                No raw materials found
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const AddSkuDrawerV2: React.FC<AddSkuDrawerV2Props> = ({
  isOpen,
  companyId,
  editSku,
  defaultCategory,
  activeSection,
  onClose,
  onSaveSuccess,
  customColumns = [],
  customColumnTypes = {},
  customColumnValues = {},
  setCustomColumnValues,
  customColumnOptions = {},
  createdCategories = [],
  onCategoryCreated,
  onUnitCreated,
  onMetadataUpdated
}) => {
  const [form, setForm] = useState({
    skuCode: '',
    name: '',
    category: '',
    paperType: '' as '' | 'Reels' | 'Sheets' | 'Board' | 'None',
    unit: '',
    altUnit: '',
    altUnitConversion: '',
    altUnitDirection: '' as '' | UomDirection,
    gsm: '',
    width: '',
    length: '',
    brand: '',
    title: '',
    group: '',
    ruleType: '',
    pages: '',
    reamWeight: '',
    booksGbl: '',
    defaultLocation: 'SKBW',
    minStockLevel: '500',
    reorderLevel: '',
    openingStock: '',
    initialLocationId: '',
    recipeYieldQty: '',
    recipeYieldUnit: '',
    preferredVendor: '',
    status: 'Active' as 'Active' | 'Inactive'
  });

  const [rawMaterialsList, setRawMaterialsList] = useState<SkuV2[]>([]);
  const [allSkusList, setAllSkusList] = useState<SkuV2[]>([]);
  const [internalCategoryCards, setInternalCategoryCards] = useState<any[]>([]);
  const allCategories = React.useMemo(() => {
    return (createdCategories && createdCategories.length > 0) ? createdCategories : internalCategoryCards;
  }, [createdCategories, internalCategoryCards]);

  const [selectedType, setSelectedType] = useState<'products' | 'materials' | 'semi'>('products');
  const [formCustomValues, setFormCustomValues] = useState<{ [colName: string]: any }>({});
  const [dynamicLocationText, setDynamicLocationText] = useState<string>('Loading location...');
  const [availableLocations, setAvailableLocations] = useState<{ id: string; name: string }[]>([]);
  const [rawHierarchy, setRawHierarchy] = useState<WarehouseLocationV2[]>([]);
  const [vendorsList, setVendorsList] = useState<{ id: string; name: string }[]>([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const cachedHierarchyRef = React.useRef<WarehouseLocationV2[] | null>(null);

  // Helper to build parent-to-child location path (Factory ➔ Zone ➔ Storage Location)
  const buildLocationPath = (locIdOrObj: any, allLocations: WarehouseLocationV2[]): string => {
    if (!locIdOrObj) return '';
    if (typeof locIdOrObj === 'object') {
      if (locIdOrObj._id) {
        const path = buildLocationPath(locIdOrObj._id, allLocations);
        if (path && path !== locIdOrObj._id) return path;
      }
      if (locIdOrObj.name) return locIdOrObj.name;
    }

    const targetStr = String(locIdOrObj).trim();
    const locMap = new Map<string, WarehouseLocationV2>();
    allLocations.forEach(loc => {
      if (loc._id) locMap.set(String(loc._id), loc);
    });

    let current = locMap.get(targetStr);
    if (!current) {
      current = allLocations.find(l => l.name?.toLowerCase() === targetStr.toLowerCase());
    }

    if (!current) return targetStr;

    const path: string[] = [current.name.trim()];
    let parentId = current.parentId ? String(current.parentId) : null;
    let guard = 0;

    while (parentId && guard < 10) {
      const parent = locMap.get(parentId);
      if (!parent) break;
      path.unshift(parent.name.trim());
      parentId = parent.parentId ? String(parent.parentId) : null;
      guard++;
    }

    return path.join(' ➔ ');
  };


  useEffect(() => {
    let isMounted = true;
    if (!isOpen || !companyId) return;

    // Fetch suppliers / vendors for materials reorder selection
    getParties({ company: companyId, type: 'vendor', limit: 1000, light: true })
      .then(res => {
        if (!isMounted) return;
        const rawList = res.data?.parties || (Array.isArray(res.data) ? res.data : []);
        const list = rawList.map((p: any) => ({
          id: String(p._id || p.id || ''),
          name: p.firmName || p.ownerName || p.contactName || p.name || p.companyName || p.tradeName || ''
        })).filter((v: any) => v.name);
        setVendorsList(list);
      })
      .catch(() => {
        if (isMounted) setVendorsList([]);
      });

    const fetchLocationData = async () => {
      try {
        const hierarchy = await getWarehouseHierarchyV2(companyId).catch(() => []);
        cachedHierarchyRef.current = hierarchy;
        
        if (hierarchy && hierarchy.length > 0) {
          if (isMounted) setRawHierarchy(hierarchy);
          const locOptions = hierarchy.map(loc => ({
            id: String(loc._id || ''),
            name: buildLocationPath(loc._id, hierarchy || [])
          }));
          if (isMounted) setAvailableLocations(locOptions);
        }
        
        if (editSku?._id) {
          const balances = await getBalancesV2(companyId, undefined, undefined, editSku._id).catch(() => []);
          
          if (balances && balances.length > 0) {
            const locPaths: string[] = [];
            for (const b of balances) {
              const locObj = b.locationId || b.location;
              if (locObj) {
                if (typeof locObj === 'object' && locObj._id) {
                  const p = buildLocationPath(locObj._id, hierarchy || []);
                  const qtyText = b.onHand !== undefined ? ` (${b.onHand} ${editSku.unit || ''})` : '';
                  locPaths.push(`${p}${qtyText}`);
                } else if (typeof locObj === 'object' && locObj.name) {
                  locPaths.push(locObj.name);
                } else if (typeof locObj === 'string') {
                  const p = buildLocationPath(locObj, hierarchy || []);
                  locPaths.push(p);
                }
              }
            }
            if (locPaths.length > 0) {
              const unique = Array.from(new Set(locPaths));
              if (isMounted) setDynamicLocationText(unique.join(' • '));
              return;
            }
          }

          const directLoc = (editSku as any)?.initialLocationId || 
                           (editSku as any)?.initialLocation || 
                           (editSku as any)?.locationId || 
                           (editSku as any)?.warehouseLocation || 
                           (editSku as any)?.location || 
                           (editSku as any)?.locationName || 
                           (editSku as any)?.defaultLocation;
          if (directLoc) {
            const locPath = buildLocationPath(directLoc, hierarchy || []);
            if (locPath && isMounted) {
              setDynamicLocationText(locPath);
              return;
            }
          }
        }

        if (isMounted) setDynamicLocationText('Not assigned to any location');
      } catch (err) {
        if (isMounted) setDynamicLocationText('Not assigned to any location');
      }
    };

    fetchLocationData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, editSku?._id, companyId]);

  useEffect(() => {
    if (isOpen && companyId) {
      getSkusV2(companyId).then(skus => {
        if (skus) {
          setAllSkusList(skus);
          const rawAndSemi = skus.filter(item => {
            const cat = (item.category || '').trim().toLowerCase();
            const code = (item.skuCode || '').trim().toUpperCase();
            const isFinishedGoods = cat === 'finished goods' || cat === 'products' || cat === 'finished' || code.startsWith('FG-') || code.startsWith('FG');
            return !isFinishedGoods;
          });
          setRawMaterialsList(rawAndSemi);

          // Dynamically discover and sync units, ruleTypes, and brands present on active SKUs
          const activeUnits = new Set<string>();
          const activeRuleTypes = new Set<string>();
          const activeBrands = new Set<string>();
          skus.forEach(s => {
            if (s.unit && s.unit.trim()) activeUnits.add(s.unit.trim());
            if (s.altUnit && s.altUnit.trim()) activeUnits.add(s.altUnit.trim());
            if (s.ruleType && s.ruleType.trim()) activeRuleTypes.add(s.ruleType.trim());
            if (s.brand && s.brand.trim()) activeBrands.add(s.brand.trim());
          });
          if (activeUnits.size > 0) {
            setUnitsList(prev => normalizeAndDeduplicateUnits([...prev, ...Array.from(activeUnits)]));
          }
          if (activeRuleTypes.size > 0) {
            setRuleTypesList(prev => Array.from(new Set([...prev, ...Array.from(activeRuleTypes)])));
          }
          if (activeBrands.size > 0) {
            setBrandsList(prev => Array.from(new Set([...prev, ...Array.from(activeBrands)])));
          }
        }
      }).catch(console.error);
    }
  }, [isOpen, companyId]);

  useEffect(() => {
    if (isOpen) {
      const initial: { [colName: string]: any } = {};
      const skuId = editSku?._id || 'new';
      customColumns.forEach(col => {
        const valKey = `${skuId}_${col}`;
        initial[col] = customColumnValues[valKey] ?? '';
      });
      setFormCustomValues(initial);
    }
  }, [isOpen, editSku, customColumns, customColumnValues]);

  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [unitsList, setUnitsList] = useState<string[]>([]);
  const [ruleTypesList, setRuleTypesList] = useState<string[]>([]);
  const [groupsList, setGroupsList] = useState<string[]>([]);
  const [brandsList, setBrandsList] = useState<string[]>([]);

  const displayUnits = React.useMemo(() => {
    const list = [...unitsList];
    if (form.unit && !list.some(u => u.toLowerCase() === form.unit.trim().toLowerCase())) {
      list.push(form.unit.trim());
    }
    if (form.altUnit && !list.some(u => u.toLowerCase() === form.altUnit.trim().toLowerCase())) {
      list.push(form.altUnit.trim());
    }
    return normalizeAndDeduplicateUnits(list);
  }, [unitsList, form.unit, form.altUnit]);

  const displayRuleTypes = React.useMemo(() => {
    const list = [...ruleTypesList];
    if (form.ruleType && !list.some(r => r.toLowerCase() === form.ruleType.trim().toLowerCase())) {
      list.push(form.ruleType.trim());
    }
    return Array.from(new Set(list.filter(Boolean)));
  }, [ruleTypesList, form.ruleType]);


  // Initialize selectedType when drawer opens or activeSection / editSku changes
  useEffect(() => {
    if (!isOpen) return;
    if (editSku) {
      const catLower = (editSku.category || '').toLowerCase().trim();
      const codeUpper = (editSku.skuCode || '').toUpperCase().trim();
      const matched = (allCategories || []).find(c => c && c.name?.toLowerCase().trim() === catLower);
      if (matched?.type) {
        setSelectedType(matched.type);
        return;
      }
      if (catLower.includes('semi') || catLower.includes('wip') || codeUpper.startsWith('SM') || codeUpper.startsWith('SF') || codeUpper.startsWith('SEM')) {
        setSelectedType('semi');
        return;
      }
      if (catLower.includes('raw') || catLower.includes('material') || catLower.includes('reel') || codeUpper.startsWith('RM')) {
        setSelectedType('materials');
        return;
      }
      setSelectedType('products');
    } else {
      if (activeSection === 'semi') setSelectedType('semi');
      else if (activeSection === 'materials') setSelectedType('materials');
      else setSelectedType('products');
    }
  }, [isOpen, editSku, activeSection, allCategories]);

  const resolvedSection = selectedType;

  const itemMainType = React.useMemo(() => {
    if (selectedType === 'semi') return 'Semi';
    if (selectedType === 'materials') return 'Materials';
    return 'Products';
  }, [selectedType]);

  const handleItemTypeChange = (newType: 'products' | 'materials' | 'semi') => {
    setSelectedType(newType);

    // Find matching categories for newly selected type
    const matchingCats = (allCategories || []).filter(c => c && (c.type === newType || (!c.type && newType === 'products')));
    const newCategory = matchingCats[0]?.name || (newType === 'products' ? 'Products' : newType === 'semi' ? 'Semi' : 'Materials');
    const newUom = matchingCats[0]?.uom || (newType === 'materials' ? 'Kg' : newType === 'semi' ? 'Ream' : 'Pcs');

    setForm(prev => ({
      ...prev,
      category: newCategory,
      unit: newUom,
      paperType: newType === 'materials' ? (prev.paperType || 'Reels') : (newType === 'semi' ? 'Sheets' : ''),
      pages: (newType === 'materials' && prev.paperType !== 'Sheets') ? '' : (newType === 'semi' ? (prev.pages || '500') : prev.pages),
      ruleType: newType === 'materials' ? '' : prev.ruleType
    }));

    setIsNameManuallyEdited(false);

    if (!editSku) {
      regenerateSkuCode(newCategory, newType);
    }
  };

  const availableCategories = React.useMemo(() => {
    const targetType = selectedType;
    const list: string[] = [];

    // 1. Fetch categories created in the Categories Tab strictly matching target section type
    (allCategories || []).forEach(c => {
      if (c && c.name && c.name.trim() && (c.type === targetType || (!c.type && targetType === 'products'))) {
        const trimmed = c.name.trim();
        if (!list.includes(trimmed)) {
          list.push(trimmed);
        }
      }
    });

    // 2. Include form.category only if valid, non-empty, and matching the section
    const trimmedFormCat = (form.category || '').trim();
    if (trimmedFormCat && !list.includes(trimmedFormCat) && trimmedFormCat !== '—' && trimmedFormCat !== '-') {
      const catObj = (allCategories || []).find(c => c && c.name?.toLowerCase().trim() === trimmedFormCat.toLowerCase());
      if (!catObj || catObj.type === targetType) {
        list.push(trimmedFormCat);
      }
    }

    return list.filter(item => typeof item === 'string' && item.trim().length > 0);
  }, [selectedType, allCategories, form.category]);

  // Modal popup for creating a new category matching Categories Tab structure
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [categoryModalForm, setCategoryModalForm] = useState<{
    name: string;
    type: 'products' | 'materials' | 'semi';
    uom: string;
    fieldsText: string;
  }>({
    name: '',
    type: 'materials',
    uom: '',
    fieldsText: 'Paper Type, GSM, Width (cm), Length (cm), Standard Sheets'
  });

  const handleOpenAddCategoryModal = () => {
    if (companyId) {
      loadMetadata();
    }
    const currentType = resolvedSection || 'products';
    const defaultFields = currentType === 'materials'
      ? 'Paper Type, GSM, Width (cm), Length (cm), Standard Sheets'
      : currentType === 'semi'
      ? 'Brand, GSM, Rule Type, Size, Pages'
      : 'Pages, Size, GSM, Ruling, Brand';
    
    setCategoryModalForm({
      name: '',
      type: currentType,
      uom: displayUnits[0] || '',
      fieldsText: defaultFields
    });
    setShowAddCategoryModal(true);
  };

  const handleSaveCategoryModal = async () => {
    if (!categoryModalForm.name.trim()) {
      showToast('Please enter category name', 'error');
      return;
    }
    const trimmed = categoryModalForm.name.trim();
    const chosenUom = categoryModalForm.uom.trim() || displayUnits[0] || '';
    const fieldsArr = categoryModalForm.fieldsText
      .split(/[,·]/)
      .map(f => f.trim())
      .filter(Boolean);

    const newCategoryObj = {
      id: `cat-${Date.now()}`,
      name: trimmed,
      type: categoryModalForm.type,
      uom: chosenUom,
      fields: fieldsArr.length > 0 ? fieldsArr : ['Type']
    };

    if (onCategoryCreated) {
      onCategoryCreated(newCategoryObj);
    }

    const updated = categoriesList.includes(trimmed) ? categoriesList : [...categoriesList, trimmed];
    setCategoriesList(updated);

    let updatedUnits = [...unitsList];
    if (chosenUom && !updatedUnits.some(u => u.toLowerCase() === chosenUom.toLowerCase())) {
      updatedUnits.push(chosenUom);
      setUnitsList(normalizeAndDeduplicateUnits(updatedUnits));
    }

    try {
      const updatedCategoryCards = [
        ...(createdCategories as any || []).filter((c: any) => c && c.name && c.name.toLowerCase().trim() !== trimmed.toLowerCase()),
        newCategoryObj
      ];
      await updateMetadataV2({
        companyId,
        categories: updated,
        categoryCards: updatedCategoryCards,
        units: normalizeAndDeduplicateUnits(updatedUnits),
        ruleTypes: ruleTypesList,
        groups: groupsList,
        brands: brandsList,
        categoryFields: categoryFieldsMap
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('skbw_metadata_updated', { detail: { type: 'category', value: trimmed } }));
      }
      if (onUnitCreated && chosenUom) {
        onUnitCreated(chosenUom);
      }
      if (onMetadataUpdated) {
        onMetadataUpdated();
      }

      showToast(`Category "${trimmed}" created in ${categoryModalForm.type.toUpperCase()}!`, 'success');
    } catch (err) {
      console.error('Failed to save category metadata:', err);
    }

    updateFormField({
      category: trimmed
    });
    if (!editSku) {
      regenerateSkuCode(trimmed);
    }
    setShowAddCategoryModal(false);
  };
  
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);
  const lastSpecsRef = React.useRef<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [hasAltUnit, setHasAltUnit] = useState(false);

  // Brand searchable dropdown list (strictly synced with Categories/Settings metadata brands)
  const [brandSearch, setBrandSearch] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [brandAtFocus, setBrandAtFocus] = useState<string | null>(null);

  const availableBrands = React.useMemo(() => {
    const uniqueMap = new Map<string, string>();
    (brandsList || []).forEach(item => {
      if (typeof item === 'string' && item.trim()) {
        const trimmed = item.trim();
        const key = trimmed.toLowerCase();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, trimmed);
        }
      }
    });

    return Array.from(uniqueMap.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [brandsList]);

  const handleAddNewBrand = async (newBrandInput: string) => {
    const trimmed = newBrandInput.trim();
    if (!trimmed) return;

    const updatedBrands = Array.from(new Set([...brandsList, trimmed]));
    setBrandsList(updatedBrands);
    setForm(prev => ({ ...prev, brand: trimmed }));
    setBrandSearch(trimmed);
    setShowBrandDropdown(false);

    try {
      await updateMetadataV2({
        companyId,
        categories: categoriesList,
        categoryCards: createdCategories as any,
        units: unitsList,
        ruleTypes: ruleTypesList,
        groups: groupsList,
        brands: updatedBrands,
        categoryFields: categoryFieldsMap,
        standardizedSheets
      });
      showToast(`Brand "${trimmed}" saved to brands list!`, 'success');
    } catch (err) {
      console.error('Failed to save brand to metadata:', err);
    }
  };

  // BOM Recipe Materials State (Empty by default)
  const [bomItems, setBomItems] = useState<{ id: string; name: string; qty: string; uom: string; inStock: number; notes: string }[]>([]);

  // Production Process Steps State
  const [processSteps, setProcessSteps] = useState<{ id: string; stepName: string; machine: string }[]>([]);

  const handleAddBomItem = () => {
    setBomItems(prev => [
      ...prev,
      { id: 'bom_' + Date.now(), name: '', qty: '', uom: form.unit || 'Kg', inStock: 0, notes: '' }
    ]);
  };

  const removeBomItem = (id: string) => {
    setBomItems(prev => prev.filter(i => i.id !== id));
  };

  const updateBomItem = (id: string, field: string, value: any) => {
    setBomItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleAddProcessStep = () => {
    setProcessSteps(prev => [
      ...prev,
      { id: 'step_' + Date.now(), stepName: '', machine: '' }
    ]);
  };

  const removeProcessStep = (id: string) => {
    setProcessSteps(prev => prev.filter(s => s.id !== id));
  };

  const updateProcessStep = (id: string, field: string, value: any) => {
    setProcessSteps(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const brandContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (brandContainerRef.current && !brandContainerRef.current.contains(e.target as Node)) {
        setShowBrandDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Category specific field visibility mapping
  const [categoryFieldsMap, setCategoryFieldsMap] = useState<Record<string, string[]>>({
    "Raw Material": ["gsm", "title", "width", "length", "paperType", "altUnit"],
    "Semi Finished": ["gsm", "width", "length", "ruleType", "group", "altUnit"],
    "Finished Goods": ["gsm", "brand", "width", "length", "ruleType", "pages", "altUnit"]
  });

  // Custom Options Modal Popup state
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'categories' | 'units' | 'ruleTypes' | 'groups' | null;
    nameValue: string;
    selectedFields: string[];
  }>({
    isOpen: false,
    type: null,
    nameValue: '',
    selectedFields: ['gsm', 'width', 'length']
  });

  const DEFAULT_STANDARDIZED_SHEETS = [
    { id: '1', name: '23×36" (Double Demy)', w: '58.4', l: '91.4' },
    { id: '2', name: '20×30" (Crown)', w: '50.8', l: '76.2' },
    { id: '3', name: '18×23" (Demy)', w: '45.7', l: '58.4' },
    { id: '4', name: '25×36" (Royal)', w: '63.5', l: '91.4' },
    { id: '5', name: '30×40" (Double Royal)', w: '76.2', l: '101.6' },
    { id: '6', name: '46×57 CM', w: '46', l: '57' },
    { id: '7', name: '58.5×91 CM', w: '58.5', l: '91' }
  ];

  const [standardizedSheets, setStandardizedSheets] = useState<{ id: string; name: string; w: string; l: string }[]>(DEFAULT_STANDARDIZED_SHEETS);
  const [showEditSheetsModal, setShowEditSheetsModal] = useState(false);
  const [sheetForm, setSheetForm] = useState({ id: '', name: '', w: '', l: '' });

  // Load custom metadata lists & brands from database
  useEffect(() => {
    if (companyId && isOpen) {
      setUnitsList([]);
      setRuleTypesList([]);
      setBrandsList([]);
      setCategoriesList([]);
      setGroupsList([]);
      loadMetadata();
    }
  }, [companyId, isOpen]);

  useEffect(() => {
    const handleMetadataChange = () => {
      if (companyId) {
        loadMetadata();
      }
    };
    window.addEventListener('skbw_metadata_updated', handleMetadataChange);
    return () => window.removeEventListener('skbw_metadata_updated', handleMetadataChange);
  }, [companyId]);

  const loadMetadata = async () => {
    try {
      const data = await getMetadataV2(companyId);
      if (data) {
        if (Array.isArray(data.categories)) setCategoriesList(data.categories);
        if (Array.isArray(data.categoryCards)) setInternalCategoryCards(data.categoryCards);
        if (Array.isArray(data.units)) {
          setUnitsList(normalizeAndDeduplicateUnits(data.units));
        } else {
          setUnitsList([]);
        }
        if (Array.isArray(data.ruleTypes)) {
          setRuleTypesList(data.ruleTypes);
        } else {
          setRuleTypesList([]);
        }
        if (Array.isArray(data.groups)) setGroupsList(data.groups);
        if (Array.isArray(data.brands)) {
          setBrandsList(data.brands);
        } else {
          setBrandsList([]);
        }
        if (data.standardizedSheets && Array.isArray(data.standardizedSheets) && data.standardizedSheets.length > 0) {
          setStandardizedSheets(data.standardizedSheets);
        }
        if (data.categoryFields) {
          // Migrate old database 'dimensions' schema to separate 'width' and 'length' fields dynamically on load
          const migratedFields: Record<string, string[]> = {};
          Object.entries(data.categoryFields).forEach(([cat, fields]) => {
            let updated = Array.isArray(fields) ? [...fields] : (fields ? [fields as string] : []);
            if (updated.includes('dimensions')) {
              updated = updated.filter(f => f !== 'dimensions');
              if (!updated.includes('width')) updated.push('width');
              if (!updated.includes('length')) updated.push('length');
            }
            // Guarantee altUnit is included for all categories
            if (!updated.includes('altUnit')) {
              updated.push('altUnit');
            }
            // Brand is only for Finished Goods
            if (["Raw Material", "Semi Finished"].includes(cat)) {
              updated = updated.filter(f => f !== 'brand');
            }
            migratedFields[cat] = updated;
          });
          setCategoryFieldsMap(migratedFields);
        }
      }
    } catch (e) {
      console.error('Failed to load dynamic options metadata', e);
    }
  };

  const handleSaveStandardizedSheet = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sheetForm.name.trim() || !sheetForm.w || !sheetForm.l) {
      showToast('Please enter sheet name, width, and length', 'warning');
      return;
    }
    let updated: { id: string; name: string; w: string; l: string }[] = [];
    if (sheetForm.id) {
      updated = standardizedSheets.map(s => s.id === sheetForm.id ? { ...s, name: sheetForm.name.trim(), w: String(sheetForm.w), l: String(sheetForm.l) } : s);
    } else {
      const newSheet = { id: String(Date.now()), name: sheetForm.name.trim(), w: String(sheetForm.w), l: String(sheetForm.l) };
      updated = [...standardizedSheets, newSheet];
    }
    setStandardizedSheets(updated);
    setSheetForm({ id: '', name: '', w: '', l: '' });
    try {
      await updateMetadataV2({
        companyId,
        categories: categoriesList,
        units: unitsList,
        ruleTypes: ruleTypesList,
        groups: groupsList,
        brands: brandsList,
        categoryFields: categoryFieldsMap,
        standardizedSheets: updated
      });
      showToast('Saved standardized sheet size successfully!', 'success');
    } catch (err) {
      console.error('Failed to save standardized sheets metadata:', err);
    }
  };

  const handleDeleteStandardizedSheet = async (idToDelete: string) => {
    const updated = standardizedSheets.filter(s => s.id !== idToDelete);
    setStandardizedSheets(updated);
    try {
      await updateMetadataV2({
        companyId,
        categories: categoriesList,
        units: unitsList,
        ruleTypes: ruleTypesList,
        groups: groupsList,
        brands: brandsList,
        categoryFields: categoryFieldsMap,
        standardizedSheets: updated
      });
      showToast('Removed sheet size preset', 'info');
    } catch (err) {
      console.error('Failed to update standardized sheets metadata:', err);
    }
  };

  const handleAddNewOption = (field: 'categories' | 'units' | 'ruleTypes' | 'groups') => {
    setModalConfig({
      isOpen: true,
      type: field,
      nameValue: '',
      selectedFields: field === 'categories' ? ['gsm', 'width', 'length'] : []
    });
  };

  const handleSaveCustomOption = async () => {
    const field = modalConfig.type;
    const cleanVal = modalConfig.nameValue.trim();
    if (!field || !cleanVal) return;

    try {
      let updatedCategories = [...categoriesList];
      let updatedUnits = [...unitsList];
      let updatedRuleTypes = [...ruleTypesList];
      let updatedGroups = [...groupsList];
      let updatedFieldsMap = { ...categoryFieldsMap };

      let updatedCategoryCards = [...(createdCategories as any || [])];

      if (field === 'categories') {
        const defaultUom = resolvedSection === 'materials' ? 'Kg' : resolvedSection === 'semi' ? 'Ream' : 'Pcs';
        const newCategoryObj = {
          id: `cat-${Date.now()}`,
          name: cleanVal,
          type: resolvedSection,
          uom: defaultUom,
          fields: modalConfig.selectedFields && modalConfig.selectedFields.length > 0 ? modalConfig.selectedFields : (resolvedSection === 'materials' ? ['GSM', 'Width (cm)', 'Brand'] : resolvedSection === 'semi' ? ['GSM', 'Rule Type', 'Size'] : ['Pages', 'Size', 'Ruling'])
        };

        if (onCategoryCreated) {
          onCategoryCreated(newCategoryObj);
        }

        updatedCategoryCards = [
          ...updatedCategoryCards.filter((c: any) => c && c.name && c.name.toLowerCase().trim() !== cleanVal.toLowerCase()),
          newCategoryObj
        ];

        if (!updatedCategories.includes(cleanVal)) {
          updatedCategories.push(cleanVal);
          setCategoriesList(updatedCategories);
        }
        updatedFieldsMap[cleanVal] = modalConfig.selectedFields;
        setCategoryFieldsMap(updatedFieldsMap);
        setForm(prev => ({ ...prev, category: cleanVal }));
      } else if (field === 'units') {
        if (!updatedUnits.includes(cleanVal)) {
          updatedUnits.push(cleanVal);
          setUnitsList(updatedUnits);
        }
        setForm(prev => ({ ...prev, unit: cleanVal }));
      } else if (field === 'groups') {
        if (!updatedGroups.includes(cleanVal)) {
          updatedGroups.push(cleanVal);
          setGroupsList(updatedGroups);
        }
        setForm(prev => ({ ...prev, group: cleanVal }));
      } else {
        if (!updatedRuleTypes.includes(cleanVal)) {
          updatedRuleTypes.push(cleanVal);
          setRuleTypesList(updatedRuleTypes);
        }
        setForm(prev => ({ ...prev, ruleType: cleanVal }));
      }

      await updateMetadataV2({
        companyId,
        categories: updatedCategories,
        categoryCards: updatedCategoryCards,
        units: updatedUnits,
        ruleTypes: updatedRuleTypes,
        groups: updatedGroups,
        categoryFields: updatedFieldsMap
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('skbw_metadata_updated', { detail: { type: field, value: cleanVal } }));
      }
      if (onUnitCreated && field === 'units') {
        onUnitCreated(cleanVal);
      }
      if (onMetadataUpdated) {
        onMetadataUpdated();
      }

      setModalConfig({ isOpen: false, type: null, nameValue: '', selectedFields: [] });
    } catch (e) {
      console.error(e);
      alert('Failed to save dynamic option to settings database.');
    }
  };

  // Sync brandSearch with form.brand
  useEffect(() => {
    setBrandSearch(form.brand);
  }, [form.brand]);

  // Update form state if editSku is provided or changes
  useEffect(() => {
    if (editSku) {
      setForm({
        skuCode: editSku.skuCode || '',
        name: editSku.name || '',
        category: editSku.category || (resolvedSection === 'products' ? 'Products' : resolvedSection === 'semi' ? 'Semi' : 'Materials'),
        paperType: (editSku.paperType || '') as '' | 'Reels' | 'Sheets' | 'Board' | 'None',
        unit: editSku.unit || '',
        altUnit: editSku.altUnit || '',
        altUnitConversion: editSku.altUnitConversion !== undefined ? String(editSku.altUnitConversion) : '',
        altUnitDirection: (editSku.altUnitDirection || '') as '' | UomDirection,
        gsm: editSku.gsm !== undefined ? String(editSku.gsm) : '',
        width: editSku.width !== undefined ? String(editSku.width) : '',
        length: editSku.length !== undefined ? String(editSku.length) : '',
        brand: editSku.brand || '',
        title: editSku.title || '',
        group: editSku.group || '',
        ruleType: editSku.ruleType || '',
        pages: (editSku as any).pages !== undefined ? String((editSku as any).pages) : '',
        reamWeight: (editSku as any).reamWeight !== undefined ? String((editSku as any).reamWeight) : '',
        booksGbl: (editSku as any).booksGbl !== undefined ? String((editSku as any).booksGbl) : '',
        defaultLocation: (editSku as any).defaultLocation || 'SKBW',
        minStockLevel: (editSku as any).minStockLevel !== undefined && (editSku as any).minStockLevel !== null ? String((editSku as any).minStockLevel) : ((editSku as any).minStock !== undefined ? String((editSku as any).minStock) : ''),
        reorderLevel: (editSku as any).reorderLevel !== undefined && (editSku as any).reorderLevel !== null ? String((editSku as any).reorderLevel) : ((editSku as any).reorderQty !== undefined ? String((editSku as any).reorderQty) : ''),
        openingStock: (editSku as any)?.openingStock !== undefined ? String((editSku as any)?.openingStock) : '',
        initialLocationId: (() => {
          const rawLoc = (editSku as any)?.initialLocationId || 
                         (editSku as any)?.initialLocation || 
                         (editSku as any)?.locationId || 
                         (editSku as any)?.location || 
                         (editSku as any)?.warehouseLocation || 
                         (editSku as any)?.defaultLocation || 
                         '';
          return typeof rawLoc === 'object' ? (rawLoc._id || rawLoc.name || '') : String(rawLoc);
        })(),
        recipeYieldQty: (editSku as any)?.recipeYieldQty !== undefined ? String((editSku as any)?.recipeYieldQty) : ((editSku as any)?.batchYieldQty !== undefined ? String((editSku as any)?.batchYieldQty) : ''),
        recipeYieldUnit: (editSku as any)?.recipeYieldUnit || editSku.unit || '',
        preferredVendor: (editSku as any)?.preferredVendor || '',
        status: editSku.status || 'Active'
      });
      setHasAltUnit(!!editSku.altUnit);
      setIsNameManuallyEdited(false);
      lastSpecsRef.current = JSON.stringify({
        cat: editSku.category || '',
        pages: (editSku as any).pages || '',
        brand: editSku.brand || '',
        ruleType: editSku.ruleType || '',
        gsm: editSku.gsm || '',
        width: editSku.width || '',
        length: editSku.length || '',
        paperType: editSku.paperType || '',
        title: editSku.title || '',
        group: editSku.group || ''
      });
      if ((editSku as any).bomItems && Array.isArray((editSku as any).bomItems)) {
        setBomItems((editSku as any).bomItems.map((b: any, idx: number) => {
          const matchedSku = (allSkusList || []).find(s => 
            (b.skuId && String(s._id) === String(b.skuId)) ||
            (b.skuCode && s.skuCode === b.skuCode) ||
            (b.id && String(s._id) === String(b.id)) ||
            (b.name && s.name === b.name)
          );
          const currentName = matchedSku?.name || b.name || b.itemName || b.skuName || '';
          return {
            id: b.id || b._id || `bom_${idx}_${Date.now()}`,
            skuId: b.skuId || matchedSku?._id,
            skuCode: b.skuCode || matchedSku?.skuCode,
            name: currentName,
            qty: String(b.qty ?? b.quantity ?? ''),
            uom: matchedSku?.unit || b.uom || b.unit || 'Kg',
            inStock: Number((matchedSku as any)?.openingStock ?? b.inStock ?? 0),
            notes: b.notes || ''
          };
        }));
      } else {
        setBomItems([]);
      }
      if ((editSku as any).processSteps && Array.isArray((editSku as any).processSteps)) {
        setProcessSteps((editSku as any).processSteps.map((s: any, idx: number) => ({
          id: s.id || s._id || `step_${idx}_${Date.now()}`,
          stepName: s.stepName || s.name || s.step || '',
          machine: s.machine || s.machineName || s.workCenter || ''
        })));
      } else {
        setProcessSteps([]);
      }
    } else {
      setForm({
        skuCode: '',
        name: '',
        category: '',
        paperType: '' as '' | 'Reels' | 'Sheets' | 'None',
        unit: '',
        altUnit: '',
        altUnitConversion: '',
        altUnitDirection: '' as '' | UomDirection,
        gsm: '',
        width: '',
        length: '',
        brand: '',
        title: '',
        group: '',
        ruleType: '',
        pages: '',
        reamWeight: '',
        booksGbl: '',
        defaultLocation: 'SKBW',
        minStockLevel: '',
        reorderLevel: '',
        openingStock: '',
        initialLocationId: '',
        recipeYieldQty: '',
        recipeYieldUnit: '',
        preferredVendor: '',
        status: 'Active'
      });
      setHasAltUnit(false);
      setIsNameManuallyEdited(false);
      lastSpecsRef.current = '';
      setBomItems([]);
      setProcessSteps([]);
    }
  }, [editSku, isOpen, defaultCategory, resolvedSection, createdCategories]);

  const isProductCategory = React.useMemo(() => {
    if (resolvedSection === 'products' || form.category === 'Finished Goods' || form.category === 'Products') return true;
    if (resolvedSection === 'materials' || resolvedSection === 'semi') return false;
    const matched = (allCategories || []).find(c => c.name === form.category);
    if (matched) return matched.type === 'products';
    return !['Raw Material', 'Semi Finished'].includes(form.category);
  }, [resolvedSection, form.category, allCategories]);

  const isRawOrSemi = React.useMemo(() => {
    return resolvedSection === 'materials' || resolvedSection === 'semi' || ['Raw Material', 'Semi Finished'].includes(form.category);
  }, [resolvedSection, form.category]);

  const activeFields = React.useMemo(() => {
    // Field attributes are purely category notes and do NOT affect or restrict any fields when adding/editing an item.
    if (resolvedSection === 'materials' || form.category === 'Raw Material' || form.category === 'Materials' || (!isProductCategory && resolvedSection !== 'semi')) {
      return ['gsm', 'title', 'width', 'length', 'paperType', 'pages', 'reamWeight', 'booksGbl', 'altUnit'];
    } else if (resolvedSection === 'semi' || form.category === 'Semi Finished' || form.category === 'Semi') {
      return ['gsm', 'title', 'width', 'length', 'ruleType', 'paperType', 'group', 'pages', 'reamWeight', 'booksGbl', 'altUnit'];
    } else {
      // Products / Finished Goods (Pages, brands, ruling types, UOM, AUOM)
      return ['gsm', 'brand', 'width', 'length', 'ruleType', 'pages', 'reamWeight', 'booksGbl', 'altUnit'];
    }
  }, [resolvedSection, form.category, isProductCategory]);

  // Auto-generate neat sequential SKU Code (RM-001, FG-001, SM-001) - strictly monotonic, never reusing deleted item IDs
  const regenerateSkuCode = async (targetCategory?: string, overrideType?: 'products' | 'materials' | 'semi') => {
    if (editSku) return; // NEVER overwrite or change SKU Code when editing an existing SKU!

    const currentSection = overrideType || resolvedSection;
    let prefix: 'RM' | 'FG' | 'SM' = 'RM';

    if (currentSection === 'products') {
      prefix = 'FG';
    } else if (currentSection === 'semi') {
      prefix = 'SM';
    } else {
      prefix = 'RM';
    }

    // 1. First check backend for definitive next code (accounts for both active and deleted items + Sequence counter)
    if (companyId) {
      try {
        const res = await getNextSkuCodeV2(companyId, prefix);
        if (res && res.nextCode) {
          setForm(prev => ({ ...prev, skuCode: res.nextCode }));
          return;
        }
      } catch (e) {
        console.warn('Could not fetch next code from backend, calculating from local state:', e);
      }
    }

    // 2. Fallback: Strictly monotonic sequence (maxSeq + 1) for active items
    const skuSourceList = (allSkusList && allSkusList.length > 0) ? allSkusList : rawMaterialsList;
    let maxSeq = 0;
    const regex = new RegExp(`^${prefix}-(\\d{1,4})$`, 'i');
    (skuSourceList || []).forEach(s => {
      if (s.isDeleted) return;
      const code = (s.skuCode || '').trim();
      const match = code.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > 0 && num < 10000 && num > maxSeq) {
          maxSeq = num;
        }
      }
    });

    try {
      const localMaxKey = `skbw_max_sku_seq_${companyId || 'default'}_${prefix}`;
      const savedVal = localStorage.getItem(localMaxKey);
      if (savedVal) {
        const savedMax = parseInt(savedVal, 10);
        if (!isNaN(savedMax)) {
          if (savedMax >= 10000) {
            localStorage.removeItem(localMaxKey);
          } else if (savedMax > maxSeq) {
            maxSeq = savedMax;
          }
        }
      }
    } catch (_) {}

    const nextSeq = maxSeq + 1;
    const nextSkuCode = `${prefix}-${String(nextSeq).padStart(3, '0')}`;
    setForm(prev => ({ ...prev, skuCode: nextSkuCode }));
  };

  useEffect(() => {
    if (!editSku && isOpen && !form.skuCode) {
      regenerateSkuCode();
    }
  }, [isOpen, form.category, !editSku, activeSection]);

    // Helper to compile Sku Name dynamically from specification inputs
    const compileSkuName = (formData: typeof form): string => {
      const isMat = resolvedSection === 'materials' || formData.category === 'Raw Material' || formData.category === 'Materials' || (formData.skuCode || '').startsWith('RM');
      const isSemi = resolvedSection === 'semi' || formData.category === 'Semi Finished' || formData.category === 'Semi' || (formData.skuCode || '').startsWith('SM');

      if (isMat) {
        const parts: string[] = [];
        const brandOrTitle = formData.brand?.trim() || formData.title?.trim() || '';
        if (brandOrTitle) parts.push(brandOrTitle);
        const formatType = formData.paperType === 'Reels' ? 'Reel' : formData.paperType === 'Board' ? 'Board' : formData.paperType === 'Sheets' ? 'Sheet' : '';
        if (formatType && !parts.some(p => p.toLowerCase().includes(formatType.toLowerCase()))) {
          parts.push(formatType);
        }
        if (formData.gsm) parts.push(`${formData.gsm} GSM`);
        let sizeStr = '';
        if (formData.width && formData.length) {
          sizeStr = `${formData.width} x ${formData.length} CM`;
        } else if (formData.width) {
          sizeStr = `${formData.width} CM`;
        }
        if (sizeStr) parts.push(sizeStr);
        return parts.filter(Boolean).join(' ');
      } else if (isSemi) {
        const parts: string[] = [];
        const brandOrTitle = formData.brand?.trim() || formData.title?.trim() || '';
        if (brandOrTitle) parts.push(brandOrTitle);
        const formatType = formData.paperType === 'Board' ? 'Board' : 'Sheet';
        if (formatType && !parts.some(p => p.toLowerCase().includes(formatType.toLowerCase()))) {
          parts.push(formatType);
        }
        if (formData.gsm) parts.push(`${formData.gsm} GSM`);
        let sizeStr = '';
        if (formData.width && formData.length) {
          sizeStr = `${formData.width} x ${formData.length} CM`;
        } else if (formData.width) {
          sizeStr = `${formData.width} CM`;
        }
        if (sizeStr) parts.push(sizeStr);
        if (formData.ruleType?.trim()) {
          const clean = formData.ruleType.trim();
          const wrapped = (clean.startsWith('(') && clean.endsWith(')')) ? clean : `(${clean})`;
          parts.push(wrapped);
        }
        return parts.filter(Boolean).join(' ');
      } else {
        // Finished Goods / Products: Name consists of Pages, Brand, and Rule Type only (GSM, Width, Height are saved in attributes but not synced into name)
        const parts: string[] = [];
        if (formData.pages) parts.push(`${formData.pages}P`);
        if (formData.brand?.trim()) parts.push(formData.brand.trim());
        if (formData.title?.trim()) parts.push(formData.title.trim());
        if (formData.ruleType?.trim()) {
          const clean = formData.ruleType.trim();
          const wrapped = (clean.startsWith('(') && clean.endsWith(')')) ? clean : `(${clean})`;
          parts.push(wrapped);
        }
        return parts.filter(Boolean).join(' ');
      }
    };

    const updateFormField = (updates: Partial<typeof form>) => {
      setForm(prev => {
        const nextForm = { ...prev, ...updates };
        if (!isNameManuallyEdited) {
          const nextCompiled = compileSkuName(nextForm);
          if (nextCompiled) {
            nextForm.name = nextCompiled;
          }
        }
        return nextForm;
      });
    };

    // Compile Sku Name dynamically from other inputs
    useEffect(() => {
      if (isNameManuallyEdited) return;

      const compiled = compileSkuName(form);
      if (compiled && compiled !== form.name) {
        setForm(prev => ({ ...prev, name: compiled }));
      }
    }, [
      form.category,
      form.paperType,
      form.ruleType,
      form.gsm,
      form.width,
      form.length,
      form.pages,
      form.brand,
      form.title,
      form.group,
      isNameManuallyEdited,
      resolvedSection
    ]);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.skuCode.trim() || !form.name.trim()) {
        setErrorMsg('SKU Code and SKU Name are required');
        return;
      }

      if (!form.unit || !form.unit.trim()) {
        setErrorMsg('Please select a UOM (Unit)');
        return;
      }

      if (form.altUnit) {
        const uomCheck = validateUomConversion(form.unit, form.altUnit, form.altUnitConversion);
        if (!uomCheck.valid) {
          setErrorMsg(uomCheck.error || 'Invalid UOM conversion');
          return;
        }
      }

      setErrorMsg('');
      setIsSaving(true);
      try {
        const payload: any = {
          skuCode: form.skuCode.trim(),
          name: form.name.trim(),
          category: form.category,
          paperType: form.paperType,
          unit: form.unit,
          altUnit: form.altUnit || '',
          altUnitConversion: form.altUnit && form.altUnitConversion ? Number(form.altUnitConversion) : null,
          altUnitDirection: form.altUnit && form.altUnitConversion ? (form.altUnitDirection || '') : '',
          gsm: form.gsm ? Number(form.gsm) : null,
          width: form.width ? Number(form.width) : null,
          length: form.length ? Number(form.length) : null,
          brand: form.brand.trim() || '',
          title: form.title.trim() || '',
          group: form.group.trim() || '',
          ruleType: form.ruleType || '',
          pages: form.pages ? Number(form.pages) : (form.paperType === 'Sheets' ? 500 : null),
          reamWeight: form.reamWeight ? Number(form.reamWeight) : null,
          booksGbl: form.booksGbl ? Number(form.booksGbl) : null,
          minStockLevel: form.minStockLevel !== '' && !isNaN(Number(form.minStockLevel)) ? Number(form.minStockLevel) : null,
          reorderLevel: form.reorderLevel !== '' && !isNaN(Number(form.reorderLevel)) ? Number(form.reorderLevel) : null,
          openingStock: form.openingStock ? Number(form.openingStock) : 0,
          initialLocationId: form.initialLocationId || '',
          initialLocation: form.initialLocationId || '',
          recipeYieldQty: Number(form.recipeYieldQty) || 1,
          recipeYieldUnit: form.recipeYieldUnit || form.unit || 'Pcs',
          batchYieldQty: Number(form.recipeYieldQty) || 1,
          batchYieldUnit: form.recipeYieldUnit || form.unit || 'Pcs',
          preferredVendor: form.preferredVendor || '',
          status: form.status || 'Active',
          company: companyId,
          bomItems: bomItems.length > 0 ? bomItems : [],
          processSteps: processSteps.length > 0 ? processSteps : []
        };

        // Auto-save category/brand/group to metadata on submission if not already present
        let metadataUpdated = false;
        let updatedCategories = [...categoriesList];
        let updatedGroups = [...groupsList];
        let updatedBrands = [...brandsList];

        if (form.category.trim() && !categoriesList.includes(form.category.trim())) {
          updatedCategories.push(form.category.trim());
          setCategoriesList(updatedCategories);
          metadataUpdated = true;
        }

        if (form.group.trim() && !groupsList.includes(form.group.trim())) {
          updatedGroups.push(form.group.trim());
          setGroupsList(updatedGroups);
          metadataUpdated = true;
        }

        if (form.brand.trim() && !brandsList.includes(form.brand.trim())) {
          updatedBrands.push(form.brand.trim());
          setBrandsList(updatedBrands);
          metadataUpdated = true;
        }

        if (metadataUpdated) {
          try {
            await updateMetadataV2({
              companyId,
              categories: updatedCategories,
              units: unitsList,
              ruleTypes: ruleTypesList,
              groups: updatedGroups,
              brands: updatedBrands,
              categoryFields: categoryFieldsMap
            });
          } catch (e) {
            console.error("Failed to auto-save new options to metadata", e);
          }
        }

        let saved;
        if (editSku?._id && !editSku._id.startsWith('demo-')) {
          saved = await updateSkuV2(editSku._id, payload);
        } else {
          saved = await createSkuV2(payload);
          try {
            const match = (saved.skuCode || '').match(/^([A-Z]+)-(\d{1,4})$/i);
            if (match) {
              const p = match[1].toUpperCase();
              const n = parseInt(match[2], 10);
              if (!isNaN(n) && n > 0 && n < 10000) {
                const localMaxKey = `skbw_max_sku_seq_${companyId || 'default'}_${p}`;
                const currentMax = parseInt(localStorage.getItem(localMaxKey) || '0', 10);
                if (!isNaN(currentMax) && currentMax >= 10000) {
                  localStorage.setItem(localMaxKey, String(n));
                } else if (!isNaN(n) && n > currentMax) {
                  localStorage.setItem(localMaxKey, String(n));
                }
              }
            }
          } catch (_) {}
        }

        if (setCustomColumnValues && saved?._id) {
          setCustomColumnValues(prev => {
            const updated = { ...prev };
            customColumns.forEach(col => {
              const key = `${saved._id}_${col}`;
              if (formCustomValues[col] !== undefined) {
                updated[key] = formCustomValues[col];
              }
            });
            return updated;
          });
        }

        onSaveSuccess(saved);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.response?.data?.msg || 'Failed to save SKU');
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <>
        <Modal
          isOpen={isOpen}
          onClose={onClose}
          size="max-w-4xl"
          title={
            <div className="flex items-center gap-2 text-left">
              <div className="p-2 bg-slate-100 text-slate-700 rounded-xl border border-slate-200">
                <Package className="w-4 h-4 text-slate-700" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 text-base">
                    {editSku ? 'Edit SKU Item' : 'Add New SKU Item'}
                  </span>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1 uppercase tracking-wider ${
                    itemMainType === 'Materials'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : itemMainType === 'Semi'
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {itemMainType}
                  </span>
                </div>
              </div>
            </div>
          }
        >
          <form onSubmit={handleSubmit} className="p-2 space-y-6 max-h-[75vh] overflow-y-auto text-left">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-150 rounded-xl text-xs font-semibold text-red-700">
                {errorMsg}
              </div>
            )}

            {/* Group 1: General Information */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-gray-900 border-b border-gray-100 pb-1.5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                General Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">SKU CODE *</label>
                  <input
                    type="text"
                    placeholder="e.g. RM-REEL-01"
                    value={form.skuCode}
                    onChange={e => setForm({ ...form, skuCode: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800"
                    required
                  />
                </div>

                {/* ITEM TYPE (Selectable & Interchangeable: Products / Materials / Semi) */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1 flex items-center justify-between">
                    <span>ITEM TYPE *</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                      selectedType === 'materials'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : selectedType === 'semi'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {itemMainType}
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      value={selectedType}
                      onChange={e => handleItemTypeChange(e.target.value as 'products' | 'materials' | 'semi')}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer appearance-none shadow-2xs pr-8"
                    >
                      <option value="products">PRODUCTS (Finished Goods)</option>
                      <option value="materials">MATERIALS (Raw Materials)</option>
                      <option value="semi">SEMI (Semi Finished Goods)</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
                {/* 2. CATEGORY (Selectable & Editable whether creating or editing) */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1 flex items-center justify-between">
                    <span>CATEGORY *</span>
                    <button
                      type="button"
                      onClick={handleOpenAddCategoryModal}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Category</span>
                    </button>
                  </label>

                  <div className="relative">
                    <select
                      value={form.category}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '__ADD_NEW__') {
                          handleOpenAddCategoryModal();
                        } else {
                          const matchedCat = (createdCategories || []).find(c => c && c.name?.toLowerCase().trim() === val.toLowerCase().trim());
                          const catUom = matchedCat?.uom;

                          if (catUom && !unitsList.some(u => u.toLowerCase() === catUom.toLowerCase())) {
                            setUnitsList(prev => [...prev, catUom]);
                          }

                          updateFormField({
                            category: val
                          });
                          if (!editSku) {
                            regenerateSkuCode(val);
                          }
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-bold text-gray-800 cursor-pointer appearance-none shadow-2xs pr-8"
                      required
                    >
                      <option value="" disabled>Select Category</option>
                      {availableCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option value="__ADD_NEW__" className="font-bold text-blue-600 bg-blue-50">
                        + Add New Category...
                      </option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>



                {/* 4. PROMINENT ACTIVE / INACTIVE STATUS TOGGLE */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] font-bold text-gray-700 mb-1 flex items-center justify-between">
                    <span>ITEM STATUS</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${form.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                      {form.status === 'Active' ? 'Active' : 'Inactive'}
                    </span>
                  </label>
                  <div className="flex items-center gap-3 h-[38px] px-3 py-1.5 bg-gray-50/90 border border-gray-200 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, status: prev.status === 'Active' ? 'Inactive' : 'Active' }))}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${form.status === 'Active' ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${form.status === 'Active' ? 'translate-x-4' : 'translate-x-0'}`}
                      />
                    </button>
                    <span 
                      className="text-xs font-semibold text-gray-700 cursor-pointer select-none truncate" 
                      onClick={() => setForm(prev => ({ ...prev, status: prev.status === 'Active' ? 'Inactive' : 'Active' }))}
                    >
                      {form.status === 'Active' ? 'Item is Active (Usable)' : 'Item is Inactive (Disabled)'}
                    </span>
                  </div>
                </div>



                {/* Format Category Radio Selector */}
                {activeFields.includes('paperType') && (
                  <div className="col-span-2 bg-gray-50/70 p-3 rounded-xl border border-gray-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-600">FORMAT CATEGORY</span>
                    <div className="flex items-center gap-4">
                      {isRawOrSemi && (resolvedSection === 'semi' || form.category === 'Semi Finished' || form.category === 'Semi') ? (
                        <>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700">
                            <input
                              type="radio"
                              name="paperType"
                              value="Sheets"
                              checked={form.paperType === 'Sheets' || !form.paperType}
                              onChange={() => updateFormField({ paperType: 'Sheets' })}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            Sheets
                          </label>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700">
                            <input
                              type="radio"
                              name="paperType"
                              value="Board"
                              checked={form.paperType === 'Board'}
                              onChange={() => updateFormField({ paperType: 'Board' })}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            Board
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700">
                            <input
                              type="radio"
                              name="paperType"
                              value="Reels"
                              checked={form.paperType === 'Reels' || (!form.paperType && resolvedSection === 'materials')}
                              onChange={() => updateFormField({ paperType: 'Reels', length: '' })}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            Reels
                          </label>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700">
                            <input
                              type="radio"
                              name="paperType"
                              value="Sheets"
                              checked={form.paperType === 'Sheets'}
                              onChange={() => updateFormField({ paperType: 'Sheets' })}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            Sheets
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-gray-600 flex items-center gap-1.5">
                      <span>SKU NAME *</span>
                      {!isNameManuallyEdited ? (
                        <span className="text-[9.5px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          Auto-Syncing
                        </span>
                      ) : (
                        <span className="text-[9.5px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          Custom Name
                        </span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNameManuallyEdited(false);
                        const compiled = compileSkuName(form);
                        if (compiled) {
                          setForm(prev => ({ ...prev, name: compiled }));
                        }
                      }}
                      className="text-[11px] text-blue-600 font-bold hover:underline hover:text-blue-800 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Force re-sync name from current fields"
                    >
                      ⚡ Re-sync auto name
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. 111P AKSHAY (SR)"
                    value={form.name}
                    onChange={e => {
                      setForm(prev => ({ ...prev, name: e.target.value }));
                      setIsNameManuallyEdited(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800"
                    required
                  />
                </div>

                {/* For Product categories: Pages, Brand, Ruling Types, Primary Unit, Alternate Units right below SKU Name */}
                {isProductCategory && (
                  <>
                    {/* 1. Pages */}
                    {activeFields.includes('pages') && (
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                          {form.paperType === 'Sheets' ? 'STANDARD SHEETS/REAM' : 'PAGES'}
                        </label>
                        <input
                          type="number"
                          placeholder={form.paperType === 'Sheets' ? 'e.g. 500' : 'e.g. 112 / 132'}
                          value={form.pages}
                          onChange={e => updateFormField({ pages: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800"
                        />
                      </div>
                    )}

                    {/* 2. Brand */}
                    {activeFields.includes('brand') && (
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">BRAND</label>
                        <div className="relative" ref={brandContainerRef}>
                          <input
                            type="text"
                            placeholder="Search or type brand..."
                            value={brandSearch}
                            onChange={e => {
                              setBrandSearch(e.target.value);
                              updateFormField({ brand: e.target.value });
                            }}
                            onFocus={() => {
                              setShowBrandDropdown(true);
                              setBrandAtFocus(form.brand);
                            }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800"
                          />
                          {showBrandDropdown && (
                            <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-20 divide-y divide-gray-50">
                              {availableBrands
                                .filter(b => {
                                  if (brandSearch === brandAtFocus || !brandSearch.trim()) return true;
                                  return b.toLowerCase().includes(brandSearch.toLowerCase().trim());
                                })
                                .map(b => (
                                  <button
                                    key={b}
                                    type="button"
                                    onClick={() => {
                                      updateFormField({ brand: b });
                                      setBrandSearch(b);
                                      setShowBrandDropdown(false);
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs hover:bg-blue-50 hover:text-blue-600 transition-colors font-semibold text-gray-700 block"
                                  >
                                    {b}
                                  </button>
                                ))
                              }
                              {brandSearch.trim() && !availableBrands.some(b => b.toLowerCase() === brandSearch.trim().toLowerCase()) && (
                                <button
                                  type="button"
                                  onClick={() => handleAddNewBrand(brandSearch)}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-green-50 text-green-600 font-bold transition-colors block"
                                >
                                  + Add Brand "{brandSearch.trim()}"
                                </button>
                              )}
                              {availableBrands.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase().trim())).length === 0 && !brandSearch.trim() && (
                                <div className="px-3 py-2 text-xs text-gray-400 italic">No brands found</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 3. Ruling Types */}
                    {activeFields.includes('ruleType') && (
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">RULING TYPE</label>
                        <select
                          value={form.ruleType}
                          onChange={e => {
                            if (e.target.value === '__ADD_NEW__') {
                              handleAddNewOption('ruleTypes');
                            } else {
                              updateFormField({ ruleType: e.target.value });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800 cursor-pointer"
                        >
                          <option value="">-- Select Rule Type --</option>
                          {displayRuleTypes.map(rule => (
                            <option key={rule} value={rule}>{rule}</option>
                          ))}
                          <option value="__ADD_NEW__" className="text-blue-600 font-bold">+ Add Custom...</option>
                        </select>
                      </div>
                    )}

                    {/* 4. UOM (Base Unit) */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        UOM *
                      </label>
                      <select
                        value={displayUnits.find(u => u.toLowerCase() === (form.unit || '').trim().toLowerCase()) || form.unit || ''}
                        onChange={e => {
                          if (e.target.value === '__ADD_NEW__') {
                            handleAddNewOption('units');
                          } else {
                            updateFormField({ unit: e.target.value });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800 cursor-pointer"
                        required
                      >
                        <option value="">Select Units</option>
                        {displayUnits.map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                        <option value="__ADD_NEW__" className="text-blue-600 font-bold">+ Add Custom...</option>
                      </select>
                    </div>

                    {/* 5. AUOM Toggle */}
                    {activeFields.includes('altUnit') && (
                      <div className="flex items-end h-full">
                        <label className="flex items-center space-x-2.5 bg-gray-50 border border-gray-200 hover:border-blue-300 hover:bg-blue-50/10 rounded-xl px-3 py-2 w-full cursor-pointer select-none transition-all">
                          <input
                            type="checkbox"
                            checked={hasAltUnit}
                            onChange={e => {
                              const checked = e.target.checked;
                              setHasAltUnit(checked);
                              if (!checked) {
                                setForm(prev => ({ ...prev, altUnit: '', altUnitConversion: '' }));
                              }
                            }}
                            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300 cursor-pointer"
                          />
                          <div className="text-left">
                            <span className="block text-[11px] font-bold text-gray-700">Enable AUOM</span>
                            <span className="block text-[9px] text-gray-400 font-medium leading-tight">Alternate packaging / sales unit</span>
                          </div>
                        </label>
                      </div>
                    )}

                    {/* AUOM & Conversion Rate if Enabled */}
                    {activeFields.includes('altUnit') && hasAltUnit && (() => {
                      const effectiveDirection = getUomDirection(form.unit, form.altUnit, form.altUnitDirection || undefined);
                      const factorNum = Number(form.altUnitConversion) || 0;
                      const isUnitSame = !!(form.unit && form.altUnit && form.unit.trim().toLowerCase() === form.altUnit.trim().toLowerCase());
                      const isFactorInvalid = !!(form.altUnit && form.altUnitConversion && factorNum <= 0);

                      const baseUnitLabel = effectiveDirection === 'PRIMARY_TO_ALT' ? (form.unit || 'Primary') : (form.altUnit || 'AUOM');
                      const targetUnitLabel = effectiveDirection === 'PRIMARY_TO_ALT' ? (form.altUnit || 'AUOM') : (form.unit || 'Primary');
                      const inverseFactor = factorNum > 0 ? roundUomQty(1 / factorNum) : 0;

                      return (
                        <div className="col-span-2 space-y-2 bg-gradient-to-br from-blue-50/40 via-indigo-50/20 to-blue-50/40 p-4 rounded-2xl border border-blue-100 shadow-xs animate-in fade-in duration-200">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                              Alternate Unit of Measurement (AUOM)
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-600 mb-1">AUOM</label>
                              <select
                                value={displayUnits.find(u => u.toLowerCase() === (form.altUnit || '').trim().toLowerCase()) || form.altUnit || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === '__ADD_NEW__') {
                                    handleAddNewOption('units');
                                  } else {
                                    let defaultConversion = form.altUnitConversion;
                                    const upperVal = val.toUpperCase();
                                    const upperUnit = (form.unit || '').toUpperCase();
                                    if ((upperVal === 'GBL' && upperUnit.includes('PC')) || (upperUnit === 'GBL' && upperVal.includes('PC'))) {
                                      defaultConversion = '200';
                                    } else if ((upperVal === 'REAM' && upperUnit.includes('PC')) || (upperUnit === 'REAM' && upperVal.includes('PC'))) {
                                      defaultConversion = '500';
                                    }
                                    setForm(prev => ({
                                      ...prev,
                                      altUnit: val,
                                      altUnitConversion: defaultConversion,
                                      altUnitDirection: '',
                                      booksGbl: (upperVal === 'GBL' || upperUnit === 'GBL') ? '200' : prev.booksGbl
                                    }));
                                  }
                                }}
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800 cursor-pointer"
                              >
                                <option value="">Select Units</option>
                                {displayUnits.map(unit => (
                                  <option key={unit} value={unit}>{unit}</option>
                                ))}
                                <option value="__ADD_NEW__" className="text-blue-600 font-bold">+ Add Custom...</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-600 mb-1">CONVERSION FACTOR</label>
                              <div className="relative">
                                <input
                                  type="number"
                                  placeholder="e.g. 200"
                                  min="0.000001"
                                  step="any"
                                  value={form.altUnitConversion}
                                  onChange={e => setForm({ ...form, altUnitConversion: e.target.value })}
                                  className={`w-full pl-3 pr-20 py-2 border rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-900 font-mono ${
                                    isFactorInvalid ? 'border-red-400 focus:ring-red-400' : 'border-gray-200'
                                  }`}
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-600 font-mono uppercase select-none">
                                  {targetUnitLabel}
                                </div>
                              </div>
                            </div>
                          </div>

                          {isUnitSame && (
                            <div className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              UOM and AUOM cannot be identical.
                            </div>
                          )}

                          {isFactorInvalid && (
                            <div className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              Conversion factor must be greater than 0.
                            </div>
                          )}

                          {form.altUnit && form.altUnitConversion && factorNum > 0 && !isUnitSame && (
                            <div className="bg-white/90 border border-blue-200/80 rounded-xl p-2.5 shadow-2xs space-y-1 text-center">
                              <div className="text-xs font-bold text-slate-800 flex items-center justify-center gap-2">
                                <span className="text-gray-500 font-medium text-[11px]">Relationship:</span>
                                <span className="bg-blue-100 text-blue-900 px-2.5 py-0.5 rounded-md font-mono text-xs font-extrabold border border-blue-200">
                                  1 {baseUnitLabel} = {form.altUnitConversion} {targetUnitLabel}
                                </span>
                              </div>
                              <div className="text-[10px] text-gray-500 font-mono">
                                Inverse: 1 {targetUnitLabel} = {inverseFactor} {baseUnitLabel}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>

            {/* Group 2: Specifications */}
            {((!isProductCategory && activeFields.includes('ruleType')) || (!isProductCategory && activeFields.includes('title')) || activeFields.includes('gsm') || activeFields.includes('width') || activeFields.includes('length')) && (
              <div className="space-y-4 border-t border-gray-100 pt-4">
                <h3 className="text-xs font-bold text-gray-900 pb-1.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  Specifications
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {activeFields.includes('gsm') && (
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">GSM</label>
                      <input
                        type="number"
                        placeholder="e.g. 70"
                        value={form.gsm}
                        onChange={e => updateFormField({ gsm: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800"
                      />
                    </div>
                  )}

                  {!isProductCategory && activeFields.includes('ruleType') && (
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">RULE TYPE</label>
                      <select
                        value={form.ruleType}
                        onChange={e => {
                          if (e.target.value === '__ADD_NEW__') {
                            handleAddNewOption('ruleTypes');
                          } else {
                            updateFormField({ ruleType: e.target.value });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800 cursor-pointer"
                      >
                        <option value="">-- Select Rule Type --</option>
                        {displayRuleTypes.map(rule => (
                          <option key={rule} value={rule}>{rule}</option>
                        ))}
                        <option value="__ADD_NEW__" className="text-blue-600 font-bold">+ Add Custom...</option>
                      </select>
                    </div>
                  )}

                  {!isProductCategory && activeFields.includes('title') && (
                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        {resolvedSection === 'materials' || form.category === 'Raw Material' || form.category === 'Materials' ? 'PAPER BRAND / MILL (e.g. BILT, CARTILUMIN)' : 'TITLE (DESCRIPTION)'}
                      </label>
                      <input
                        type="text"
                        placeholder={
                          form.paperType === 'Sheets' ? "e.g. CARTILUMIN" :
                          form.paperType === 'Reels' ? "e.g. BILT" :
                          resolvedSection === 'semi' || form.category === 'Semi Finished' || form.category === 'Semi' ? "e.g. Inner Pages Form" : "e.g. BILT / CARTILUMIN"
                        }
                        value={form.title}
                        onChange={e => updateFormField({ title: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800"
                      />
                    </div>
                  )}

                  {(form.paperType === 'Sheets' || resolvedSection === 'semi' || form.category === 'Semi Finished' || form.category === 'Semi') && (
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        STANDARD SHEETS / REAM *
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 500"
                        value={form.pages}
                        onChange={e => updateFormField({ pages: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-bold text-gray-800"
                      />
                    </div>
                  )}

                  {activeFields.includes('width') && (
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">WIDTH (CM)</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 57"
                        value={form.width}
                        onChange={e => updateFormField({ width: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800"
                      />
                    </div>
                  )}

                  {activeFields.includes('length') && form.paperType !== 'Reels' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">LENGTH (CM)</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 70"
                        value={form.length}
                        onChange={e => updateFormField({ length: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Group 3: Additional Attributes (Hidden for Finished Goods / Products) */}
            {!isProductCategory && (
              <div className="space-y-4 border-t border-gray-100 pt-4">
                <h3 className="text-xs font-bold text-gray-900 pb-1.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  Inventory & Additional Attributes
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {/* UOM */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                      UOM *
                    </label>
                    <select
                      value={displayUnits.find(u => u.toLowerCase() === (form.unit || '').trim().toLowerCase()) || form.unit || ''}
                      onChange={e => {
                        if (e.target.value === '__ADD_NEW__') {
                          handleAddNewOption('units');
                        } else {
                          updateFormField({ unit: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800 cursor-pointer"
                      required
                    >
                      <option value="">Select Units</option>
                      {displayUnits.map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                      <option value="__ADD_NEW__" className="text-blue-600 font-bold">+ Add Custom...</option>
                    </select>
                  </div>

                  {activeFields.includes('altUnit') && (
                    <div className="flex items-end h-full">
                      <label className="flex items-center space-x-2.5 bg-gray-50 border border-gray-200 hover:border-blue-300 hover:bg-blue-50/10 rounded-xl px-3 py-2 w-full cursor-pointer select-none transition-all">
                        <input
                          type="checkbox"
                          checked={hasAltUnit}
                          onChange={e => {
                            const checked = e.target.checked;
                            setHasAltUnit(checked);
                            if (!checked) {
                              updateFormField({ altUnit: '', altUnitConversion: '' });
                            }
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300 cursor-pointer"
                        />
                        <div className="text-left">
                          <span className="block text-[11px] font-bold text-gray-700">Enable AUOM</span>
                          <span className="block text-[9px] text-gray-400 font-medium leading-tight">Alternate packaging / sales unit</span>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* AUOM & Conversion Rate if Enabled */}
                  {activeFields.includes('altUnit') && hasAltUnit && (() => {
                    const effectiveDirection = getUomDirection(form.unit, form.altUnit, form.altUnitDirection || undefined);
                    const factorNum = Number(form.altUnitConversion) || 0;
                    const isUnitSame = !!(form.unit && form.altUnit && form.unit.trim().toLowerCase() === form.altUnit.trim().toLowerCase());
                    const isFactorInvalid = !!(form.altUnit && form.altUnitConversion && factorNum <= 0);

                    const baseUnitLabel = effectiveDirection === 'PRIMARY_TO_ALT' ? (form.unit || 'Primary') : (form.altUnit || 'AUOM');
                    const targetUnitLabel = effectiveDirection === 'PRIMARY_TO_ALT' ? (form.altUnit || 'AUOM') : (form.unit || 'Primary');
                    const inverseFactor = factorNum > 0 ? roundUomQty(1 / factorNum) : 0;

                    return (
                      <div className="col-span-2 space-y-2 bg-gradient-to-br from-blue-50/40 via-indigo-50/20 to-blue-50/40 p-4 rounded-2xl border border-blue-100 shadow-xs animate-in fade-in duration-200">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                            Alternate Unit of Measurement (AUOM)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">AUOM</label>
                            <select
                              value={displayUnits.find(u => u.toLowerCase() === (form.altUnit || '').trim().toLowerCase()) || form.altUnit || ''}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === '__ADD_NEW__') {
                                  handleAddNewOption('units');
                                } else {
                                  let defaultConversion = form.altUnitConversion;
                                  const upperVal = val.toUpperCase();
                                  const upperUnit = (form.unit || '').toUpperCase();
                                  if ((upperVal === 'GBL' && upperUnit.includes('PC')) || (upperUnit === 'GBL' && upperVal.includes('PC'))) {
                                    defaultConversion = '200';
                                  } else if ((upperVal === 'REAM' && upperUnit.includes('PC')) || (upperUnit === 'REAM' && upperVal.includes('PC'))) {
                                    defaultConversion = '500';
                                  }
                                  updateFormField({
                                    altUnit: val,
                                    altUnitConversion: defaultConversion,
                                    altUnitDirection: '',
                                    booksGbl: (upperVal === 'GBL' || upperUnit === 'GBL') ? '200' : form.booksGbl
                                  });
                                }
                              }}
                              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800 cursor-pointer"
                            >
                              <option value="">Select Units</option>
                              {displayUnits.map(unit => (
                                <option key={unit} value={unit}>{unit}</option>
                              ))}
                              <option value="__ADD_NEW__" className="text-blue-600 font-bold">+ Add Custom...</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">CONVERSION FACTOR</label>
                            <div className="relative">
                              <input
                                type="number"
                                placeholder="e.g. 200"
                                min="0.000001"
                                step="any"
                                value={form.altUnitConversion}
                                onChange={e => updateFormField({ altUnitConversion: e.target.value })}
                                className={`w-full pl-3 pr-20 py-2 border rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-900 font-mono ${
                                  isFactorInvalid ? 'border-red-400 focus:ring-red-400' : 'border-gray-200'
                                }`}
                              />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-600 font-mono uppercase select-none">
                                {targetUnitLabel}
                              </div>
                            </div>
                          </div>
                        </div>

                        {isUnitSame && (
                          <div className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            UOM and AUOM cannot be identical.
                          </div>
                        )}

                        {isFactorInvalid && (
                          <div className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            Conversion factor must be greater than 0.
                          </div>
                        )}

                        {form.altUnit && form.altUnitConversion && factorNum > 0 && !isUnitSame && (
                          <div className="bg-white/90 border border-blue-200/80 rounded-xl p-2.5 shadow-2xs space-y-1 text-center">
                            <div className="text-xs font-bold text-slate-800 flex items-center justify-center gap-2">
                              <span className="text-gray-500 font-medium text-[11px]">Relationship:</span>
                              <span className="bg-blue-100 text-blue-900 px-2.5 py-0.5 rounded-md font-mono text-xs font-extrabold border border-blue-200">
                                1 {baseUnitLabel} = {form.altUnitConversion} {targetUnitLabel}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono">
                              Inverse: 1 {targetUnitLabel} = {inverseFactor} {baseUnitLabel}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Attributes for Semi-Finished Goods (Group & Status removed) */}
                  {(resolvedSection === 'semi' || form.category === 'Semi Finished' || form.category === 'Semi') && (
                    <>

                      {activeFields.includes('pages') && (
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">PAGES / SHEETS</label>
                          <input
                            type="number"
                            placeholder="e.g. 112 / 132"
                            value={form.pages}
                            onChange={e => updateFormField({ pages: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800"
                          />
                        </div>
                      )}

                      {activeFields.includes('reamWeight') && (
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">REAM WEIGHT (KG)</label>
                          <input
                            type="number"
                            step="any"
                            placeholder="e.g. 10.37"
                            value={form.reamWeight}
                            onChange={e => updateFormField({ reamWeight: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800"
                          />
                        </div>
                      )}

                      {activeFields.includes('booksGbl') && (
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">BOOKS / GBL</label>
                          <input
                            type="number"
                            placeholder="e.g. 200 / 240"
                            value={form.booksGbl}
                            onChange={e => updateFormField({ booksGbl: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Stock Levels Section (Available for ALL categories) */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <h3 className="text-xs font-bold text-gray-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Stock Levels & Reorder Configuration
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Min Stock Level */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    <span>Min Stock Level</span>
                  </label>
                  <input
                    type="number"
                    placeholder="500"
                    value={form.minStockLevel || ''}
                    onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                  <span className="block text-[10px] text-gray-400 mt-1 font-medium leading-tight">
                    Alert when stock falls at or below this level
                  </span>
                </div>

                {/* 2. Reorder Level */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    <span>Reorder Level</span>
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 20"
                    value={form.reorderLevel || ''}
                    onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                  <span className="block text-[10px] text-gray-400 mt-1 font-medium leading-tight">
                    Reorder when stock reaches this level
                  </span>
                </div>

                {/* 3. Preferred Vendor (Reorder) - Only for Materials & Semi */}
                {isRawOrSemi && (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" />
                      <span>Select Preferred Vendor (Reorder)</span>
                    </label>
                    <select
                      value={form.preferredVendor || ''}
                      onChange={(e) => setForm({ ...form, preferredVendor: e.target.value })}
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
                    >
                      <option value="">-- Select Preferred Vendor --</option>
                      {vendorsList.map(v => (
                        <option key={v.id || v.name} value={v.name}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <span className="block text-[10px] text-gray-400 mt-1 font-medium leading-tight">
                      Default vendor selected for material reorders
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Dynamic Custom Fields Section */}
            {customColumns && customColumns.length > 0 && (
              <div className="space-y-3 border-t border-gray-100 pt-4">
                <h3 className="text-xs font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  Custom Fields
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {customColumns.map((col) => {
                    const colType = (customColumnTypes && customColumnTypes[col]) || 'text';
                    const cellVal = formCustomValues[col] ?? '';

                    if (colType === 'checkbox') {
                      return (
                        <div key={col} className="flex items-center gap-2 pt-2">
                          <input
                            type="checkbox"
                            checked={!!cellVal}
                            onChange={(e) => {
                              setFormCustomValues(prev => ({ ...prev, [col]: e.target.checked }));
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <label className="text-xs font-semibold text-gray-700">{col}</label>
                        </div>
                      );
                    }

                    if (colType === 'dropdown') {
                      const options = (customColumnOptions && customColumnOptions[col]) || [
                        { label: 'Option 1', color: '#e0f2fe' },
                        { label: 'Option 2', color: '#dcfce7' },
                        { label: 'Option 3', color: '#fef9c3' }
                      ];
                      const activeVal = cellVal || (options[0]?.label || 'Option 1');
                      const activeOpt = options.find(o => o.label === activeVal) || options[0];
                      return (
                        <div key={col}>
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">{col.toLowerCase()}</label>
                          <select
                            value={activeVal}
                            onChange={(e) => {
                              setFormCustomValues(prev => ({ ...prev, [col]: e.target.value }));
                            }}
                            style={{ backgroundColor: activeOpt?.color || '#e0f2fe' }}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:outline-none cursor-pointer shadow-2xs"
                          >
                            {options.map(opt => (
                              <option key={opt.label} value={opt.label}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      );
                    }

                    return (
                      <div key={col}>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">{col.toLowerCase()}</label>
                        <input
                          type={colType === 'number' ? 'number' : colType === 'date' ? 'date' : 'text'}
                          value={cellVal ?? ''}
                          placeholder={`Enter ${col.toLowerCase()}...`}
                          onChange={(e) => {
                            setFormCustomValues(prev => ({ ...prev, [col]: e.target.value }));
                          }}
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-800 focus:outline-none focus:border-blue-500 shadow-2xs"
                        />
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

                {/* BOM is for Finished Goods / Products AND Semi Finished materials (NO BOM for Raw Materials) */}
                {resolvedSection !== 'materials' && (resolvedSection === 'products' || resolvedSection === 'semi' || form.category === 'Finished Goods' || form.category === 'Semi Finished' || !(form.category || '').toLowerCase().includes('raw')) && (
                  <div className="space-y-4 border-t border-gray-100 pt-4">
                    {/* BOM Header card banner */}
                    <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-900">
                          Bill of Materials — quantities for one batch of this product.
                        </span>
                      </div>
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        ✓ {bomItems.length} items set
                      </span>
                    </div>

                    {/* Bill of Materials (Paper & Covers) Table */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 relative">
                      <div className="flex items-center justify-between">
                        <div className="flex items-start gap-2.5">
                          <div className="p-2 bg-[#064E3B] text-white rounded-lg shrink-0 shadow-2xs">
                            <BookOpen className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 text-sm">Bill of Materials</h4>
                            <p className="text-[11px] text-gray-500">
                              Enter the quantities for one <strong>batch</strong>. Work orders scale consumption by (qty ÷ batch size × units produced).
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <BomCopyPasteControls
                            getCopyPayload={() => {
                              if (!bomItems || bomItems.length === 0) return null;
                              return {
                                sourceSkuId: editSku?._id,
                                sourceSkuCode: form.skuCode,
                                sourceName: form.name || form.skuCode || 'Product',
                                basis: form.recipeYieldQty || '1',
                                basisUnit: form.unit || 'Pcs',
                                lines: bomItems.map(item => ({
                                  id: item.id,
                                  name: item.name,
                                  qty: item.qty,
                                  uom: item.uom,
                                  inStock: item.inStock,
                                  notes: item.notes
                                })),
                                copiedAt: Date.now()
                              };
                            }}
                            onPaste={(copied, mode) => {
                              if (mode === 'replace') {
                                setBomItems(copied.lines.map((l, i) => ({
                                  id: `b-paste-${Date.now()}-${i}`,
                                  name: l.name,
                                  qty: String(l.qty || ''),
                                  uom: l.uom || form.unit || 'Kg',
                                  inStock: l.inStock ?? 0,
                                  notes: l.notes || ''
                                })));
                                if (copied.basis) {
                                  setForm(prev => ({ ...prev, recipeYieldQty: String(copied.basis) }));
                                }
                              } else {
                                const existingNames = new Set(bomItems.map(i => (i.name || '').toLowerCase().trim()));
                                const toAdd = copied.lines
                                  .filter(l => !existingNames.has((l.name || '').toLowerCase().trim()))
                                  .map((l, i) => ({
                                    id: `b-merge-${Date.now()}-${i}`,
                                    name: l.name,
                                    qty: String(l.qty || ''),
                                    uom: l.uom || form.unit || 'Kg',
                                    inStock: l.inStock ?? 0,
                                    notes: l.notes || ''
                                  }));
                                if (bomItems.length === 0 && copied.basis) {
                                  setForm(prev => ({ ...prev, recipeYieldQty: String(copied.basis) }));
                                }
                                setBomItems(prev => [...prev, ...toAdd]);
                              }
                            }}
                            existingCount={bomItems.length}
                          />
                          <button
                            type="button"
                            onClick={handleAddBomItem}
                            className="px-3 py-1.5 border border-[#064E3B] text-[#064E3B] hover:bg-emerald-50/40 font-medium rounded-md text-xs flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Item</span>
                          </button>
                        </div>
                      </div>

                      {/* Customizable Batch Size Yield Row with UOM & AUOM Select */}
                      {(() => {
                        const availableYieldUnits = Array.from(new Set([form.unit, form.altUnit].filter(Boolean)));
                        return (
                          <div className="flex items-center gap-2 text-xs text-gray-600 font-medium py-1 border-b border-gray-100">
                            <span>This recipe makes</span>
                            <input
                              type="number"
                              min="1"
                              value={form.recipeYieldQty || ''}
                              onChange={(e) => setForm({ ...form, recipeYieldQty: e.target.value })}
                              className="w-16 px-2 py-0.5 border border-blue-300 rounded-md text-xs font-extrabold text-blue-700 text-center focus:ring-2 focus:ring-blue-500 bg-blue-50/60"
                            />
                            {availableYieldUnits.length > 1 ? (
                              <select
                                value={form.recipeYieldUnit || form.unit || 'Pcs'}
                                onChange={(e) => setForm({ ...form, recipeYieldUnit: e.target.value })}
                                className="px-2 py-0.5 border border-blue-300 rounded-md text-xs font-extrabold text-blue-800 bg-blue-50/60 cursor-pointer focus:ring-2 focus:ring-blue-500"
                              >
                                {availableYieldUnits.map(u => (
                                  <option key={u} value={u}>{u}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="font-bold text-gray-800 uppercase">{form.unit || 'Pcs'}</span>
                            )}
                            <span className="italic text-gray-400 text-[11px]">(use 1 for per-unit quantities)</span>
                          </div>
                        );
                      })()}

                      {/* BOM Table Grid */}
                      {bomItems.length === 0 ? (
                        <div className="bg-gray-50/60 border border-dashed border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400">
                          No BOM materials added yet — click "+ Add Material" to define raw material consumption
                        </div>
                      ) : (
                        <div className="overflow-visible relative min-h-[160px]">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase">
                                <th className="py-2 px-2">ITEM</th>
                                <th className="py-2 px-2 w-24 text-center">QTY</th>
                                <th className="py-2 px-2 w-20 text-center">UOM</th>
                                <th className="py-2 px-2 w-20 text-center">IN STOCK</th>
                                <th className="py-2 px-1 w-8 text-center"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {bomItems.map((item, idx) => (
                                <tr key={item.id} className="relative z-10" style={{ zIndex: 100 - idx }}>
                                  <td className="py-2 px-2">
                                    <SearchableMaterialDropdown
                                      value={item.name}
                                      materials={allSkusList && allSkusList.length > 0 ? allSkusList : rawMaterialsList}
                                      onChange={(selectedName, matchedSku) => {
                                        updateBomItem(item.id, 'name', selectedName);
                                        if (matchedSku) {
                                          updateBomItem(item.id, 'skuId', matchedSku._id);
                                          updateBomItem(item.id, 'skuCode', matchedSku.skuCode);
                                          updateBomItem(item.id, 'uom', matchedSku.unit || 'Kg');
                                          updateBomItem(item.id, 'inStock', (matchedSku as any).openingStock ?? 0);
                                        }
                                      }}
                                    />
                                  </td>
                                  <td className="py-2 px-2">
                                    <input
                                      type="number"
                                      step="any"
                                      value={item.qty}
                                      onChange={(e) => updateBomItem(item.id, 'qty', e.target.value)}
                                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-800 bg-white font-mono text-center"
                                      placeholder="Qty"
                                    />
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    <input
                                      type="text"
                                      value={item.uom || ''}
                                      onChange={(e) => updateBomItem(item.id, 'uom', e.target.value)}
                                      className="w-full px-1.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white text-center uppercase"
                                      placeholder="UOM"
                                    />
                                  </td>
                                  <td className="py-2 px-2 text-center text-gray-500 font-mono">{item.inStock}</td>
                                  <td className="py-2 px-1 text-center">
                                    <button
                                      type="button"
                                      onClick={() => removeBomItem(item.id)}
                                      className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                      title="Remove item"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Book Manufacturing Process Steps Section */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-blue-50 text-blue-700 rounded-lg">
                            <Layers className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 text-xs">Book Manufacturing Process Routing</h4>
                            <p className="text-[10px] text-gray-400">Sequential manufacturing steps (Printing, Folding, Stitching, Binding, Trimming).</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddProcessStep}
                          className="px-3 py-1.5 border border-blue-300 text-blue-700 hover:bg-blue-50 font-bold rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Step</span>
                        </button>
                      </div>

                      {processSteps.length === 0 ? (
                        <div className="bg-gray-50/60 border border-dashed border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400">
                          No process routing steps added yet — click "+ Add Step" to add manufacturing operations
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {processSteps.map((step, sIdx) => (
                            <div key={step.id} className="flex items-center gap-2 bg-gray-50/70 p-2 rounded-xl border border-gray-150">
                              <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                                {sIdx + 1}
                              </span>
                              <input
                                type="text"
                                value={step.stepName}
                                onChange={(e) => updateProcessStep(step.id, 'stepName', e.target.value)}
                                className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 bg-white"
                                placeholder="Process step name (e.g. Reel Cutting)"
                              />
                              <input
                                type="text"
                                value={step.machine}
                                onChange={(e) => updateProcessStep(step.id, 'machine', e.target.value)}
                                className="w-44 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white"
                                placeholder="Machine / Work Center"
                              />
                              <button
                                type="button"
                                onClick={() => removeProcessStep(step.id)}
                                className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

            {/* Bottom Form Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-all cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition-all shadow-sm cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving SKU...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save SKU Item</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      {/* Dynamic Option Custom Modal Popup */}
      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ isOpen: false, type: null, nameValue: '', selectedFields: [] })}
        size="max-w-sm"
        title={`Add Custom ${modalConfig.type === 'categories' ? 'Category' : modalConfig.type === 'units' ? 'Unit' : modalConfig.type === 'groups' ? 'Group' : 'Rule Type'}`}
      >
        <div className="space-y-4 text-xs text-left">
          <div>
            <label className="block text-[9px] font-bold text-gray-500 mb-1 uppercase">
              {modalConfig.type === 'categories' ? 'Category Name' : modalConfig.type === 'units' ? 'Unit Symbol' : modalConfig.type === 'groups' ? 'Group Name' : 'Rule Name'} *
            </label>
            <input
              type="text"
              placeholder={
                modalConfig.type === 'categories' ? 'e.g. Packing Material' :
                modalConfig.type === 'units' ? 'e.g. gross' :
                modalConfig.type === 'groups' ? 'e.g. 132P Happy days (UR)' : 'e.g. Single Line'
              }
              value={modalConfig.nameValue}
              onChange={e => setModalConfig(prev => ({ ...prev, nameValue: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 font-semibold text-gray-800 bg-white"
              autoFocus
            />
          </div>

          {/* Checklist of fields for new Category */}
          {modalConfig.type === 'categories' && (
            <div className="space-y-2 border-t pt-3">
              <span className="block text-[9px] font-black text-gray-500 uppercase tracking-wider mb-1">
                Select Required Fields
              </span>
              <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100 max-h-40 overflow-y-auto">
                {[
                  { id: 'brand', label: 'Brand' },
                  { id: 'title', label: 'Title (Description)' },
                  { id: 'group', label: 'Group' },
                  { id: 'gsm', label: 'GSM' },
                  { id: 'width', label: 'Width (cm)' },
                  { id: 'length', label: 'Length (cm)' },
                  { id: 'paperType', label: 'Format Reels/Sheets' },
                  { id: 'ruleType', label: 'Rule Type' },
                  { id: 'pages', label: 'Pages' },
                  { id: 'booksGbl', label: 'Books / GBL' },
                  { id: 'altUnit', label: 'Alternative Unit' }
                ].map(f => (
                  <label key={f.id} className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition-colors">
                    <input
                      type="checkbox"
                      checked={modalConfig.selectedFields.includes(f.id)}
                      onChange={e => {
                        const newFields = e.target.checked
                          ? [...modalConfig.selectedFields, f.id]
                          : modalConfig.selectedFields.filter(x => x !== f.id);
                        setModalConfig(prev => ({ ...prev, selectedFields: newFields }));
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    <span className="text-[10px] font-semibold text-gray-700">{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t">
            <button
              type="button"
              onClick={() => setModalConfig({ isOpen: false, type: null, nameValue: '', selectedFields: [] })}
              className="px-3 py-1.5 border border-gray-200 rounded-lg font-bold hover:bg-gray-100 text-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveCustomOption}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors"
            >
              Save Option
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Standardized Sheets Modal */}
      <Modal
        isOpen={showEditSheetsModal}
        onClose={() => {
          setShowEditSheetsModal(false);
          setSheetForm({ id: '', name: '', w: '', l: '' });
        }}
        size="max-w-lg"
        title={
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-amber-600" />
            <span className="font-bold text-gray-900 text-base">Standardized Sheet Sizes</span>
          </div>
        }
      >
        <div className="space-y-4 text-xs text-left p-1">
          {/* Add / Edit Form */}
          <form onSubmit={handleSaveStandardizedSheet} className="bg-amber-50/60 p-3 rounded-xl border border-amber-200/80 space-y-3">
            <div className="text-[11px] font-bold text-amber-900 flex items-center justify-between">
              <span>{sheetForm.id ? 'Edit Sheet Size Preset' : 'Add New Sheet Size Preset'}</span>
              {sheetForm.id && (
                <button
                  type="button"
                  onClick={() => setSheetForm({ id: '', name: '', w: '', l: '' })}
                  className="text-[10px] text-amber-700 underline font-semibold cursor-pointer"
                >
                  Cancel Edit
                </button>
              )}
            </div>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <label className="block text-[10px] font-bold text-gray-600 mb-1">PRESET NAME *</label>
                <input
                  type="text"
                  placeholder='e.g. 23×36" (Double Demy)'
                  value={sheetForm.name}
                  onChange={e => setSheetForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white font-semibold text-gray-800"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-[10px] font-bold text-gray-600 mb-1">WIDTH (CM) *</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 58.4"
                  value={sheetForm.w}
                  onChange={e => setSheetForm(prev => ({ ...prev, w: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white font-semibold text-gray-800"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-[10px] font-bold text-gray-600 mb-1">LENGTH (CM) *</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 91.4"
                  value={sheetForm.l}
                  onChange={e => setSheetForm(prev => ({ ...prev, l: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white font-semibold text-gray-800"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-2xs text-xs cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{sheetForm.id ? 'Update Preset' : 'Add Preset'}</span>
              </button>
            </div>
          </form>

          {/* List of Current Presets */}
          <div className="space-y-2">
            <span className="block text-[11px] font-bold text-gray-700">Existing Presets</span>
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {standardizedSheets.map(s => (
                <div key={s.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200/80 hover:bg-white transition-colors">
                  <div>
                    <span className="font-bold text-gray-800 text-xs">{s.name}</span>
                    <span className="ml-2 text-[11px] text-gray-500">({s.w} × {s.l} cm)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSheetForm({ id: s.id, name: s.name, w: s.w, l: s.l })}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                      title="Edit Preset"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteStandardizedSheet(s.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                      title="Delete Preset"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {standardizedSheets.length === 0 && (
                <div className="p-4 text-center text-gray-400 italic bg-gray-50 rounded-xl">
                  No standardized sheet presets found.
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t">
            <button
              type="button"
              onClick={() => {
                setShowEditSheetsModal(false);
                setSheetForm({ id: '', name: '', w: '', l: '' });
              }}
              className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Location Tree Selector Modal */}
      <LocationSelectModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        rawHierarchy={rawHierarchy}
        selectedLocationId={form.initialLocationId}
        onSelectLocation={(locId, locPath) => {
          setForm(prev => ({ ...prev, initialLocationId: locId, defaultLocation: locPath }));
          setDynamicLocationText(locPath);
        }}
      />

      {/* Add New Category Modal */}
      {showAddCategoryModal && (
        <Modal
          isOpen={showAddCategoryModal}
          onClose={() => setShowAddCategoryModal(false)}
          title="Add New Category"
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Category Name *</label>
              <input
                type="text"
                value={categoryModalForm.name}
                onChange={(e) => setCategoryModalForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Notebooks, Paper Reels, Covers"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-semibold"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Item Group Type</label>
                <select
                  value={categoryModalForm.type}
                  onChange={(e) => {
                    const nextType = e.target.value as 'products' | 'materials' | 'semi';
                    const defaultFields = nextType === 'materials'
                      ? 'Paper Type, GSM, Width (cm), Length (cm), Standard Sheets'
                      : nextType === 'semi'
                      ? 'Brand, GSM, Rule Type, Size, Pages'
                      : 'Pages, Size, GSM, Ruling, Brand';
                    setCategoryModalForm(prev => ({
                      ...prev,
                      type: nextType,
                      fieldsText: defaultFields
                    }));
                  }}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-semibold bg-white cursor-pointer"
                >
                  <option value="products">Products</option>
                  <option value="materials">Materials</option>
                  <option value="semi">Semi</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Default UOM</label>
                <select
                  value={categoryModalForm.uom}
                  onChange={(e) => {
                    if (e.target.value === '__ADD_NEW__') {
                      const newUnit = window.prompt('Enter new Unit of Measurement (e.g. Box, Bundle, Roll, Pcs):');
                      if (newUnit && newUnit.trim()) {
                        const clean = newUnit.trim();
                        const updatedUnits = normalizeAndDeduplicateUnits([...unitsList, clean]);
                        setUnitsList(updatedUnits);
                        setCategoryModalForm(prev => ({ ...prev, uom: clean }));
                        if (companyId) {
                          updateMetadataV2({
                            companyId,
                            units: updatedUnits
                          }).catch(console.error);
                          if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('skbw_metadata_updated', { detail: { type: 'units', value: clean } }));
                          }
                        }
                        if (onUnitCreated) {
                          onUnitCreated(clean);
                        }
                      }
                    } else {
                      setCategoryModalForm(prev => ({ ...prev, uom: e.target.value }));
                    }
                  }}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 bg-white font-semibold cursor-pointer"
                >
                  <option value="">-- Select UOM --</option>
                  {displayUnits.map(u => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  <option value="__ADD_NEW__" className="text-blue-600 font-bold">+ Add Custom Unit...</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">Field Attributes / Notes (optional)</label>
              <input
                type="text"
                value={categoryModalForm.fieldsText}
                onChange={(e) => setCategoryModalForm(prev => ({ ...prev, fieldsText: e.target.value }))}
                placeholder="e.g. Type, Specifications, Notes"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-semibold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-100 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCategoryModal}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold cursor-pointer shadow-sm"
              >
                Save Category
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default AddSkuDrawerV2;

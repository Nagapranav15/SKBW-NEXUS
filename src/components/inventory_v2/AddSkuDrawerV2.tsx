import React, { useState, useEffect, useRef } from 'react';
import { Save, RefreshCw, BookOpen, Layers, Plus, Trash2, Tag, AlertCircle, MapPin, Search, ChevronDown, Check } from 'lucide-react';
import { createSkuV2, updateSkuV2, SkuV2, getMetadataV2, updateMetadataV2, getSkusV2 } from '../../api/mfgApiV2';
import Modal from '../ui/Modal';
import Drawer from '../ui/Drawer';

interface AddSkuDrawerV2Props {
  isOpen: boolean;
  companyId: string;
  editSku?: SkuV2 | null;
  defaultCategory?: string;
  onClose: () => void;
  onSaveSuccess: (savedSku: SkuV2) => void;
  customColumns?: string[];
  customColumnTypes?: { [colName: string]: string };
  customColumnValues?: { [key: string]: any };
  setCustomColumnValues?: React.Dispatch<React.SetStateAction<{ [key: string]: any }>>;
  customColumnOptions?: { [colName: string]: { label: string; color: string }[] };
}

export const DEMO_RAW_LIBRARY: SkuV2[] = [
  { skuCode: 'RM-REEL-70', name: 'Maplitho Paper Reel 70 GSM', category: 'Paper Reels', unit: 'Kg', status: 'Active' },
  { skuCode: 'RM-BOARD-300', name: 'Grey Duplex Cover Board 300 GSM', category: 'Cover Board', unit: 'Pcs', status: 'Active' },
  { skuCode: 'RM-WIRE-24', name: 'Book Stitching Wire #24', category: 'Stitching Wire', unit: 'Kg', status: 'Active' },
  { skuCode: 'RM-GLUE-HM', name: 'Hotmelt Binding Adhesive', category: 'Adhesives', unit: 'Kg', status: 'Active' },
  { skuCode: 'RM-KRAFT-120', name: 'Kraft Packing Paper 120 GSM', category: 'Packaging', unit: 'Kg', status: 'Active' }
];

export const SearchableMaterialDropdown: React.FC<{
  value: string;
  materials: SkuV2[];
  onChange: (selectedName: string, matchedSku?: SkuV2) => void;
}> = ({ value, materials, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const allMaterials = React.useMemo(() => {
    const list = [...materials];
    for (const demo of DEMO_RAW_LIBRARY) {
      if (!list.some(m => (m.name || '').toLowerCase() === demo.name.toLowerCase())) {
        list.push(demo);
      }
    }
    return list;
  }, [materials]);

  const filtered = allMaterials.filter(m =>
    (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.skuCode || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.category || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-full text-left" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 bg-white border border-gray-200 hover:border-purple-300 rounded-xl text-xs font-semibold text-gray-800 flex items-center justify-between shadow-2xs transition-all cursor-pointer"
      >
        <span className="truncate">
          {value || <span className="text-gray-400 font-normal">-- Select Raw Material --</span>}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-72 bg-white border border-gray-200 rounded-2xl shadow-2xl p-2 space-y-2 text-xs z-[100]">
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
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none bg-gray-50/50"
            />
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
            {search.trim() && !allMaterials.some(m => (m.name || '').toLowerCase() === search.trim().toLowerCase()) && (
              <div
                onClick={() => {
                  onChange(search.trim());
                  setOpen(false);
                  setSearch('');
                }}
                className="p-2 hover:bg-emerald-50 text-emerald-700 font-bold rounded-xl cursor-pointer transition-colors flex items-center gap-1.5"
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
                  className={`p-2 hover:bg-purple-50 rounded-xl cursor-pointer transition-colors flex items-center justify-between group ${
                    isSelected ? 'bg-purple-50/70 font-bold' : ''
                  }`}
                >
                  <div className="space-y-0.5 max-w-[180px]">
                    <div className="font-semibold text-gray-900 text-xs truncate group-hover:text-purple-700">{mat.name}</div>
                    <div className="text-[10px] text-gray-400 flex items-center gap-1.5">
                      <span className="bg-gray-100 px-1.5 py-0.2 rounded text-gray-600 font-mono">{mat.skuCode}</span>
                      <span>·</span>
                      <span>{mat.category || 'Raw Material'}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    {mat.unit || 'Kg'}
                  </span>
                </div>
              );
            })}

            {filtered.length === 0 && !search.trim() && (
              <div className="p-3 text-center text-xs text-gray-400 italic">
                No raw materials found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AddSkuDrawerV2: React.FC<AddSkuDrawerV2Props> = ({
  isOpen,
  companyId,
  editSku,
  defaultCategory,
  onClose,
  onSaveSuccess,
  customColumns = [],
  customColumnTypes = {},
  customColumnValues = {},
  setCustomColumnValues,
  customColumnOptions = {}
}) => {
  const [form, setForm] = useState({
    skuCode: '',
    name: '',
    category: defaultCategory || 'Raw Material',
    paperType: 'None' as 'Reels' | 'Sheets' | 'None',
    unit: 'kg',
    altUnit: '',
    altUnitConversion: '',
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
    defaultLocation: 'Main Warehouse - Bay A1',
    minStockLevel: '500',
    reorderLevel: '',
    maxStockLevel: '',
    status: 'Active' as 'Active' | 'Inactive'
  });

  const [rawMaterialsList, setRawMaterialsList] = useState<SkuV2[]>([]);
  const [formCustomValues, setFormCustomValues] = useState<{ [colName: string]: any }>({});

  useEffect(() => {
    if (isOpen && companyId) {
      getSkusV2(companyId).then(skus => {
        const rawOnly = (skus || []).filter(item => {
          const cat = (item.category || '').toLowerCase();
          const name = (item.name || '').toLowerCase();
          return cat.includes('raw') || cat.includes('material') || cat === 'raw material' || cat.includes('reel') || cat.includes('board') || name.includes('reel') || name.includes('wire') || name.includes('adhesive') || name.includes('glue');
        });
        setRawMaterialsList(rawOnly);
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

  const [categoriesList, setCategoriesList] = useState<string[]>(["Raw Material", "Semi Finished", "Finished Goods"]);
  const [unitsList, setUnitsList] = useState<string[]>(["kg", "pcs", "Sheets", "Reels", "mtr"]);
  const [ruleTypesList, setRuleTypesList] = useState<string[]>(["Plain", "Single Line", "Double Line", "Square Ruled", "Four Line", "Unruled", "UR"]);
  const [groupsList, setGroupsList] = useState<string[]>(["132P Happy days (UR)", "220P Happy days (SR)"]);
  const [brandsList, setBrandsList] = useState<string[]>(["Happy Days", "Classmate", "Navneet"]);
  
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [hasAltUnit, setHasAltUnit] = useState(false);

  // Brand searchable dropdown lists (separated for Finished Goods vs Raw Materials)
  const [existingBrands, setExistingBrands] = useState<string[]>([]);
  const [fgBrandsList, setFgBrandsList] = useState<string[]>([]);
  const [brandSearch, setBrandSearch] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [brandAtFocus, setBrandAtFocus] = useState<string | null>(null);
  const [groupAtFocus, setGroupAtFocus] = useState<string | null>(null);

  // BOM Recipe Materials State (Empty by default)
  const [bomItems, setBomItems] = useState<{ id: string; name: string; qty: string; uom: string; inStock: number; notes: string }[]>([]);

  // Production Process Steps State
  const [processSteps, setProcessSteps] = useState<{ id: string; stepName: string; machine: string }[]>([]);

  const handleAddBomItem = () => {
    setBomItems(prev => [
      ...prev,
      { id: 'bom_' + Date.now(), name: '', qty: '1', uom: 'Pcs', inStock: 500, notes: '' }
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
  const groupContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (brandContainerRef.current && !brandContainerRef.current.contains(e.target as Node)) {
        setShowBrandDropdown(false);
      }
      if (groupContainerRef.current && !groupContainerRef.current.contains(e.target as Node)) {
        setShowGroupDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Category specific field visibility mapping
  const [categoryFieldsMap, setCategoryFieldsMap] = useState<Record<string, string[]>>({
    "Raw Material": ["gsm", "brand", "title", "width", "length", "paperType", "altUnit"],
    "Semi Finished": ["gsm", "brand", "width", "length", "ruleType", "altUnit", "group"],
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

  // Load custom metadata lists & brands from database
  useEffect(() => {
    if (companyId) {
      loadMetadata();
      loadExistingBrands();
    }
  }, [companyId]);

  const loadMetadata = async () => {
    try {
      const data = await getMetadataV2(companyId);
      if (data) {
        if (data.categories?.length) setCategoriesList(data.categories);
        if (data.units?.length) setUnitsList(data.units);
        if (data.ruleTypes?.length) setRuleTypesList(data.ruleTypes);
        if (data.groups?.length) setGroupsList(data.groups);
        if (data.brands?.length) {
          setBrandsList(data.brands);
          setExistingBrands(data.brands);
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
            // Guarantee altUnit field is present for standard categories
            if (["Raw Material", "Semi Finished", "Finished Goods"].includes(cat)) {
              if (!updated.includes('altUnit')) {
                updated.push('altUnit');
              }
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

  const loadExistingBrands = async () => {
    try {
      const skus = await getSkusV2(companyId);
      
      // Filter brands based on category
      const fgBrands = skus
        .filter(s => s.category === 'Finished Goods')
        .map(s => s.brand)
        .filter((b): b is string => !!b && typeof b === 'string' && b.trim() !== '');
        
      const rawBrands = skus
        .filter(s => s.category === 'Raw Material')
        .map(s => s.brand)
        .filter((b): b is string => !!b && typeof b === 'string' && b.trim() !== '');

      setFgBrandsList(Array.from(new Set(fgBrands)));
      setExistingBrands(prev => Array.from(new Set([...prev, ...rawBrands])));
    } catch (e) {
      console.error('Failed to load existing brands', e);
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

      if (field === 'categories') {
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
        units: updatedUnits,
        ruleTypes: updatedRuleTypes,
        groups: updatedGroups,
        categoryFields: updatedFieldsMap
      });

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

  // Sync groupSearch with form.group
  useEffect(() => {
    setGroupSearch(form.group);
  }, [form.group]);

  // Update form state if editSku is provided or changes
  useEffect(() => {
    if (editSku) {
      setForm({
        skuCode: editSku.skuCode || '',
        name: editSku.name || '',
        category: editSku.category || 'Raw Material',
        paperType: editSku.paperType || 'None',
        unit: editSku.unit || 'kg',
        altUnit: editSku.altUnit || '',
        altUnitConversion: editSku.altUnitConversion !== undefined ? String(editSku.altUnitConversion) : '',
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
        openingStock: (editSku as any).openingStock !== undefined ? String((editSku as any).openingStock) : '',
        status: editSku.status || 'Active'
      });
      setHasAltUnit(!!editSku.altUnit);
      setIsNameManuallyEdited(true); // Edit SKU should keep its loaded name
      if ((editSku as any).bomItems && Array.isArray((editSku as any).bomItems)) {
        setBomItems((editSku as any).bomItems);
      } else {
        setBomItems([]);
      }
      if ((editSku as any).processSteps && Array.isArray((editSku as any).processSteps)) {
        setProcessSteps((editSku as any).processSteps);
      } else {
        setProcessSteps([]);
      }
    } else {
      setForm({
        skuCode: '',
        name: '',
        category: defaultCategory || 'Raw Material',
        paperType: 'None',
        unit: 'kg',
        altUnit: '',
        altUnitConversion: '',
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
        openingStock: '',
        status: 'Active'
      });
      setHasAltUnit(false);
      setIsNameManuallyEdited(false);
      setBomItems([]);
      setProcessSteps([]);
    }
  }, [editSku, isOpen]);

  // Load custom metadata lists & brands from database
  useEffect(() => {
    if (companyId) {
      loadMetadata();
      loadExistingBrands();
    }
  }, [companyId]);

  const activeFields = [...(categoryFieldsMap[form.category] || ['gsm', 'width', 'length'])];
  if (form.paperType === 'Sheets' && !activeFields.includes('pages')) {
    activeFields.push('pages');
    activeFields.push('reamWeight');
  }

  // Auto-generate SKU Code
  useEffect(() => {
    if (!editSku) {
      regenerateSkuCode();
    }
  }, [form.category, editSku]);

    const regenerateSkuCode = () => {
      const prefix = form.category === 'Raw Material' ? 'RM' : form.category === 'Semi Finished' ? 'SF' : 'FG';
      const rand = Math.floor(10000 + Math.random() * 90000);
      setForm(prev => ({ ...prev, skuCode: `${prefix}-${rand}` }));
    };

    // Compile Sku Name dynamically from other inputs
    useEffect(() => {
      if (!isNameManuallyEdited && !editSku) {
        if (form.category === 'Raw Material') {
          if (!form.brand && !form.title && !form.gsm && !form.width && !form.length) {
            setForm(prev => ({ ...prev, name: '' }));
            return;
          }
          const parts: string[] = [];
          if (form.brand) parts.push(form.brand);
          if (form.title) parts.push(form.title);
          const formatType = form.paperType === 'Reels' ? 'Reel' : form.paperType === 'Sheets' ? 'Sheet' : '';
          if (formatType) parts.push(formatType);
          if (form.gsm) parts.push(`${form.gsm} GSM`);
          let sizeStr = '';
          if (form.width && form.length) {
            sizeStr = `${form.width} x ${form.length} CM`;
          } else if (form.width) {
            sizeStr = `${form.width} CM`;
          }
          if (sizeStr) parts.push(sizeStr);
          setForm(prev => ({ ...prev, name: parts.join(' ') }));
        } else if (form.category === 'Finished Goods') {
          if (!form.pages && !form.brand && !form.ruleType) {
            setForm(prev => ({ ...prev, name: '' }));
            return;
          }
          if (form.group) {
            setForm(prev => ({ ...prev, name: form.group }));
          } else {
            if (!form.pages && !form.brand && !form.ruleType) {
              setForm(prev => ({ ...prev, name: '' }));
              return;
            }
            const parts: string[] = [];
            if (form.pages) parts.push(`${form.pages}P`);
            if (form.brand) parts.push(form.brand);
            if (form.ruleType) {
              const clean = form.ruleType.trim();
              const wrapped = (clean.startsWith('(') && clean.endsWith(')')) ? clean : `(${clean})`;
              parts.push(wrapped);
            }
            setForm(prev => ({ ...prev, name: parts.join(' ') }));
          }
        } else {
          const active = categoryFieldsMap[form.category] || [];
          const parts: string[] = [];
          if (active.includes('brand') && form.brand) parts.push(form.brand);
          if (active.includes('title') && form.title) parts.push(form.title);
          if (active.includes('gsm') && form.gsm) parts.push(`${form.gsm}GSM`);
          
          let sizeStr = '';
          const hasWidth = active.includes('width');
          const hasLength = active.includes('length');
          if (hasWidth && hasLength && form.width && form.length) {
            const sep = form.category === 'Semi Finished' ? ' * ' : 'x';
            sizeStr = `${form.width}${sep}${form.length}CM`;
          } else if (hasWidth && form.width) {
            sizeStr = `${form.width}CM`;
          } else if (hasLength && form.length) {
            sizeStr = `${form.length}CM`;
          }
          if (sizeStr) parts.push(sizeStr);

          if (active.includes('ruleType') && form.ruleType) {
            const clean = form.ruleType.trim();
            if (clean) {
              const wrapped = (clean.startsWith('(') && clean.endsWith(')')) ? clean : `(${clean})`;
              parts.push(wrapped);
            }
          }
          
          if (parts.length > 0) {
            setForm(prev => ({ ...prev, name: parts.join(' ') }));
          } else {
            setForm(prev => ({ ...prev, name: '' }));
          }
        }
      }
    }, [form.category, form.paperType, form.ruleType, form.gsm, form.width, form.length, form.unit, form.pages, form.brand, form.title, form.group, isNameManuallyEdited, editSku, categoryFieldsMap]);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.skuCode.trim() || !form.name.trim()) {
        setErrorMsg('SKU Code and SKU Name are required');
        return;
      }
      setErrorMsg('');
      setIsSaving(true);
      try {
        const payload = {
          skuCode: form.skuCode.trim(),
          name: form.name.trim(),
          category: form.category,
          paperType: form.paperType,
          unit: form.unit,
          altUnit: form.altUnit || undefined,
          altUnitConversion: form.altUnit ? (form.altUnitConversion ? Number(form.altUnitConversion) : undefined) : undefined,
          gsm: form.gsm ? Number(form.gsm) : undefined,
          width: form.width ? Number(form.width) : undefined,
          length: form.length ? Number(form.length) : undefined,
          brand: form.brand.trim() || undefined,
          title: form.title.trim() || undefined,
          group: form.group.trim() || undefined,
          ruleType: form.ruleType || undefined,
          pages: form.pages ? Number(form.pages) : undefined,
          reamWeight: form.reamWeight ? Number(form.reamWeight) : undefined,
          booksGbl: form.booksGbl ? Number(form.booksGbl) : undefined,
          openingStock: form.openingStock ? Number(form.openingStock) : 0,
          status: form.status || 'Active',
          company: companyId,
          bomItems: bomItems.length > 0 ? bomItems : undefined,
          processSteps: processSteps.length > 0 ? processSteps : undefined
        };

        // Auto-save brand/group to metadata on submission if not already present
        let metadataUpdated = false;
        let updatedGroups = [...groupsList];
        let updatedBrands = [...brandsList];

        if (form.group.trim() && !groupsList.includes(form.group.trim())) {
          updatedGroups.push(form.group.trim());
          setGroupsList(updatedGroups);
          metadataUpdated = true;
        }

        if (form.brand.trim() && !brandsList.includes(form.brand.trim())) {
          updatedBrands.push(form.brand.trim());
          setBrandsList(updatedBrands);
          setExistingBrands(prev => Array.from(new Set([...prev, form.brand.trim()])));
          metadataUpdated = true;
        }

        if (metadataUpdated) {
          try {
            await updateMetadataV2({
              companyId,
              categories: categoriesList,
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
        if (editSku?._id) {
          saved = await updateSkuV2(editSku._id, payload);
        } else {
          saved = await createSkuV2(payload);
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
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
                <Save className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 text-base">
                    {editSku ? 'Edit SKU Item' : 'Add New SKU Item'}
                  </span>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold px-2.5 py-0.5 rounded-md flex items-center gap-1">
                    {form.category || 'Notebooks'}
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
                <span className="w-2 h-2 rounded-full bg-purple-600"></span>
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
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800"
                    required
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">CATEGORY *</label>
                  <select
                    value={form.category}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '__ADD_NEW__') {
                        handleAddNewOption('categories');
                      } else {
                        setForm(prev => ({
                          ...prev,
                          category: val,
                          paperType: val === 'Raw Material' ? 'Reels' : 'None',
                          ruleType: val === 'Finished Goods' ? (prev.ruleType || 'UR') : (val === 'Raw Material' ? '' : prev.ruleType)
                        }));
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800 cursor-pointer"
                  >
                    {categoriesList.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__ADD_NEW__" className="text-purple-600 font-bold">+ Add Custom...</option>
                  </select>
                </div>



                {/* Reels vs Sheets Radio Selector */}
                {activeFields.includes('paperType') && (
                  <div className="col-span-2 bg-gray-50/70 p-3 rounded-xl border border-gray-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-600">FORMAT CATEGORY</span>
                    <div className="flex items-center gap-4">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700">
                        <input
                          type="radio"
                          name="paperType"
                          value="Reels"
                          checked={form.paperType === 'Reels'}
                          onChange={() => setForm({ ...form, paperType: 'Reels', length: '' })}
                          className="text-purple-600 focus:ring-purple-500"
                        />
                        Reels
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700">
                        <input
                          type="radio"
                          name="paperType"
                          value="Sheets"
                          checked={form.paperType === 'Sheets'}
                          onChange={() => setForm({ ...form, paperType: 'Sheets' })}
                          className="text-purple-600 focus:ring-purple-500"
                        />
                        Sheets
                      </label>
                    </div>
                  </div>
                )}

                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-gray-600">SKU NAME *</label>
                    {!editSku && isNameManuallyEdited && (
                      <button
                        type="button"
                        onClick={() => setIsNameManuallyEdited(false)}
                        className="text-[10px] text-purple-600 font-bold hover:underline"
                      >
                        Re-sync auto name
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Maplitho Paper Reel 70 GSM"
                    value={form.name}
                    onChange={e => {
                      setForm({ ...form, name: e.target.value });
                      setIsNameManuallyEdited(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800"
                    required
                  />
                </div>

                {/* For Finished Goods: Pages, Brand, Rule Type, Primary Unit, Alternate Units right below SKU Name */}
                {form.category === 'Finished Goods' && (
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
                          onChange={e => setForm({ ...form, pages: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800"
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
                              setForm(prev => ({ ...prev, brand: e.target.value }));
                            }}
                            onFocus={() => {
                              setShowBrandDropdown(true);
                              setBrandAtFocus(form.brand);
                            }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800"
                          />
                          {showBrandDropdown && (
                            <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-20 divide-y divide-gray-50">
                              {fgBrandsList
                                .filter(b => {
                                  if (brandSearch === brandAtFocus) return true;
                                  return b.toLowerCase().includes(brandSearch.toLowerCase());
                                })
                                .map(b => (
                                  <button
                                    key={b}
                                    type="button"
                                    onClick={() => {
                                      setForm(prev => ({ ...prev, brand: b }));
                                      setBrandSearch(b);
                                      setShowBrandDropdown(false);
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs hover:bg-purple-50 hover:text-purple-600 transition-colors font-semibold text-gray-700 block"
                                  >
                                    {b}
                                  </button>
                                ))
                              }
                              {brandSearch.trim() && !fgBrandsList.some(b => b.toLowerCase() === brandSearch.toLowerCase()) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newBrand = brandSearch.trim();
                                    if (!fgBrandsList.includes(newBrand)) {
                                      setFgBrandsList(prev => [...prev, newBrand]);
                                    }
                                    setForm(prev => ({ ...prev, brand: newBrand }));
                                    setShowBrandDropdown(false);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-green-50 text-green-600 font-bold transition-colors block"
                                >
                                  + Add Brand "{brandSearch.trim()}"
                                </button>
                              )}
                              {fgBrandsList.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase())).length === 0 && !brandSearch.trim() && (
                                <div className="px-3 py-2 text-xs text-gray-400 italic">No brands found</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 3. Rule Type */}
                    {activeFields.includes('ruleType') && (
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">RULE TYPE</label>
                        <select
                          value={form.ruleType}
                          onChange={e => {
                            if (e.target.value === '__ADD_NEW__') {
                              handleAddNewOption('ruleTypes');
                            } else {
                              setForm({ ...form, ruleType: e.target.value });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800 cursor-pointer"
                        >
                          {ruleTypesList.map(rule => (
                            <option key={rule} value={rule}>{rule}</option>
                          ))}
                          <option value="__ADD_NEW__" className="text-purple-600 font-bold">+ Add Custom...</option>
                        </select>
                      </div>
                    )}

                    {/* 4. Primary Unit */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">PRIMARY UNIT *</label>
                      <select
                        value={form.unit}
                        onChange={e => {
                          if (e.target.value === '__ADD_NEW__') {
                            handleAddNewOption('units');
                          } else {
                            setForm({ ...form, unit: e.target.value });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800 cursor-pointer"
                      >
                        <option value="">Select Unit</option>
                        {unitsList.map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                        <option value="__ADD_NEW__" className="text-purple-600 font-bold">+ Add Custom...</option>
                      </select>
                    </div>

                    {/* 5. Alternate Units Toggle */}
                    {activeFields.includes('altUnit') && (
                      <div className="flex items-end h-full">
                        <label className="flex items-center space-x-2.5 bg-gray-50 border border-gray-200 hover:border-purple-300 hover:bg-purple-50/10 rounded-xl px-3 py-2 w-full cursor-pointer select-none transition-all">
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
                            className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 border-gray-300 cursor-pointer"
                          />
                          <div className="text-left">
                            <span className="block text-[11px] font-bold text-gray-700">Enable Alternate Unit</span>
                            <span className="block text-[9px] text-gray-400 font-medium leading-tight">Packaging conversions</span>
                          </div>
                        </label>
                      </div>
                    )}

                    {/* Alternate Unit & Conversion Rate if Enabled */}
                    {activeFields.includes('altUnit') && hasAltUnit && (
                      <div className="col-span-2 grid grid-cols-2 gap-3 bg-purple-50/20 p-3.5 rounded-xl border border-purple-100/50 animate-in fade-in duration-200">
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">ALTERNATIVE UNIT</label>
                          <select
                            value={form.altUnit}
                            onChange={e => {
                              if (e.target.value === '__ADD_NEW__') {
                                handleAddNewOption('units');
                              } else {
                                setForm({ ...form, altUnit: e.target.value });
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800 cursor-pointer"
                          >
                            <option value="">Select Alternative</option>
                            {unitsList.map(unit => (
                              <option key={unit} value={unit}>{unit}</option>
                            ))}
                            <option value="__ADD_NEW__" className="text-purple-600 font-bold">+ Add Custom...</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">CONVERSION RATE</label>
                          <div className="relative">
                            <input
                              type="number"
                              placeholder="Multiplier rate"
                              value={form.altUnitConversion}
                              onChange={e => setForm({ ...form, altUnitConversion: e.target.value })}
                              className="w-full pl-3 pr-14 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800 font-mono"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 uppercase font-mono select-none">
                              {form.altUnit || 'units'}
                            </div>
                          </div>
                        </div>
                        {form.altUnit && form.altUnitConversion && (
                          <div className="col-span-2 text-center bg-white py-1.5 px-3 rounded-lg border border-slate-100 text-[10.5px] font-medium text-slate-500">
                            Formula: <span className="font-bold text-slate-800">1 {form.unit}</span> = <span className="font-extrabold text-purple-600 font-mono text-xs">{form.altUnitConversion}</span> × <span className="font-bold text-slate-800">{form.altUnit}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Group 2: Specifications */}
            {(activeFields.includes('gsm') || activeFields.includes('brand') || activeFields.includes('title') || activeFields.includes('width') || activeFields.includes('length')) && (
              <div className="space-y-4 border-t border-gray-100 pt-4">
                <h3 className="text-xs font-bold text-gray-900 pb-1.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-600"></span>
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
                        onChange={e => setForm({ ...form, gsm: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800"
                      />
                    </div>
                  )}
                  {/* Skip Brand for Finished Goods as it's right below SKU Name */}
                  {form.category !== 'Finished Goods' && activeFields.includes('brand') && (
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">BRAND</label>
                      <div className="relative" ref={brandContainerRef}>
                        <input
                          type="text"
                          placeholder="Search or type brand..."
                          value={brandSearch}
                          onChange={e => {
                            setBrandSearch(e.target.value);
                            setForm(prev => ({ ...prev, brand: e.target.value }));
                          }}
                          onFocus={() => {
                            setShowBrandDropdown(true);
                            setBrandAtFocus(form.brand);
                          }}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800"
                        />
                        {showBrandDropdown && (
                          <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-20 divide-y divide-gray-50">
                            {existingBrands
                              .filter(b => {
                                if (brandSearch === brandAtFocus) return true;
                                return b.toLowerCase().includes(brandSearch.toLowerCase());
                              })
                              .map(b => (
                                <button
                                  key={b}
                                  type="button"
                                  onClick={() => {
                                    setForm(prev => ({ ...prev, brand: b }));
                                    setBrandSearch(b);
                                    setShowBrandDropdown(false);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-purple-50 hover:text-purple-600 transition-colors font-semibold text-gray-700 block"
                                >
                                  {b}
                                </button>
                              ))
                            }
                            {brandSearch.trim() && !existingBrands.some(b => b.toLowerCase() === brandSearch.toLowerCase()) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newBrand = brandSearch.trim();
                                  if (!existingBrands.includes(newBrand)) {
                                    setExistingBrands(prev => [...prev, newBrand]);
                                  }
                                  setForm(prev => ({ ...prev, brand: newBrand }));
                                  setShowBrandDropdown(false);
                                }}
                                className="w-full px-3 py-2 text-left text-xs hover:bg-green-50 text-green-600 font-bold transition-colors block"
                              >
                                + Add Brand "{brandSearch.trim()}"
                              </button>
                            )}
                            {existingBrands.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase())).length === 0 && !brandSearch.trim() && (
                              <div className="px-3 py-2 text-xs text-gray-400 italic">No brands found</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeFields.includes('title') && (
                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">TITLE (DESCRIPTION)</label>
                      <input
                        type="text"
                        placeholder="e.g. Premium White Paper Roll"
                        value={form.title}
                        onChange={e => setForm({ ...form, title: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800"
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
                        onChange={e => setForm({ ...form, width: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800"
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
                        onChange={e => setForm({ ...form, length: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Group 3: Additional Attributes */}
            <div className="space-y-4 border-t border-gray-100 pt-4">
              <h3 className="text-xs font-bold text-gray-900 pb-1.5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                Inventory & Additional Attributes
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {/* For non-Finished Goods: Primary Unit & Alternate Unit right here */}
                {form.category !== 'Finished Goods' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">PRIMARY UNIT *</label>
                      <select
                        value={form.unit}
                        onChange={e => {
                          if (e.target.value === '__ADD_NEW__') {
                            handleAddNewOption('units');
                          } else {
                            setForm({ ...form, unit: e.target.value });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800 cursor-pointer"
                      >
                        <option value="">Select Unit</option>
                        {unitsList.map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                        <option value="__ADD_NEW__" className="text-purple-600 font-bold">+ Add Custom...</option>
                      </select>
                    </div>

                    {activeFields.includes('altUnit') && (
                      <div className="flex items-end h-full">
                        <label className="flex items-center space-x-2.5 bg-gray-50 border border-gray-200 hover:border-purple-300 hover:bg-purple-50/10 rounded-xl px-3 py-2 w-full cursor-pointer select-none transition-all">
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
                            className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 border-gray-300 cursor-pointer"
                          />
                          <div className="text-left">
                            <span className="block text-[11px] font-bold text-gray-700">Enable Alternate Unit</span>
                            <span className="block text-[9px] text-gray-400 font-medium leading-tight">Packaging conversions</span>
                          </div>
                        </label>
                      </div>
                    )}

                    {activeFields.includes('altUnit') && hasAltUnit && (
                      <div className="col-span-2 grid grid-cols-2 gap-3 bg-purple-50/20 p-3.5 rounded-xl border border-purple-100/50 animate-in fade-in duration-200">
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">ALTERNATIVE UNIT</label>
                          <select
                            value={form.altUnit}
                            onChange={e => {
                              if (e.target.value === '__ADD_NEW__') {
                                handleAddNewOption('units');
                              } else {
                                setForm({ ...form, altUnit: e.target.value });
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800 cursor-pointer"
                          >
                            <option value="">Select Alternative</option>
                            {unitsList.map(unit => (
                              <option key={unit} value={unit}>{unit}</option>
                            ))}
                            <option value="__ADD_NEW__" className="text-purple-600 font-bold">+ Add Custom...</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">CONVERSION RATE</label>
                          <div className="relative">
                            <input
                              type="number"
                              placeholder="Multiplier rate"
                              value={form.altUnitConversion}
                              onChange={e => setForm({ ...form, altUnitConversion: e.target.value })}
                              className="w-full pl-3 pr-14 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800 font-mono"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 uppercase font-mono select-none">
                              {form.altUnit || 'units'}
                            </div>
                          </div>
                        </div>
                        {form.altUnit && form.altUnitConversion && (
                          <div className="col-span-2 text-center bg-white py-1.5 px-3 rounded-lg border border-slate-100 text-[10.5px] font-medium text-slate-500">
                            Formula: <span className="font-bold text-slate-800">1 {form.unit}</span> = <span className="font-extrabold text-purple-600 font-mono text-xs">{form.altUnitConversion}</span> × <span className="font-bold text-slate-800">{form.altUnit}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {activeFields.includes('group') && (
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">GROUP</label>
                    <div className="relative" ref={groupContainerRef}>
                      <input
                        type="text"
                        placeholder="Search or type group..."
                        value={groupSearch}
                        onChange={e => {
                          setGroupSearch(e.target.value);
                          setForm(prev => ({ ...prev, group: e.target.value }));
                        }}
                        onFocus={() => {
                          setShowGroupDropdown(true);
                          setGroupAtFocus(form.group);
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800"
                      />
                      {showGroupDropdown && (
                        <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-20 divide-y divide-gray-50">
                          {groupsList
                            .filter(g => {
                              if (groupSearch === groupAtFocus) return true;
                              return g.toLowerCase().includes(groupSearch.toLowerCase());
                            })
                            .map(g => (
                              <button
                                key={g}
                                type="button"
                                onClick={() => {
                                  setForm(prev => ({ ...prev, group: g }));
                                  setGroupSearch(g);
                                  setShowGroupDropdown(false);
                                }}
                                className="w-full px-3 py-2 text-left text-xs hover:bg-purple-50 hover:text-purple-600 transition-colors font-semibold text-gray-700 block"
                              >
                                {g}
                              </button>
                            ))
                          }
                          {groupSearch.trim() && !groupsList.some(g => g.toLowerCase() === groupSearch.toLowerCase()) && (
                            <button
                              type="button"
                              onClick={() => {
                                const newGrp = groupSearch.trim();
                                if (!groupsList.includes(newGrp)) {
                                  setGroupsList(prev => [...prev, newGrp]);
                                }
                                setForm(prev => ({ ...prev, group: newGrp }));
                                setShowGroupDropdown(false);
                              }}
                              className="w-full px-3 py-2 text-left text-xs hover:bg-green-50 text-green-600 font-bold transition-colors block"
                            >
                              + Add Group "{groupSearch.trim()}"
                            </button>
                          )}
                          {groupsList.filter(g => g.toLowerCase().includes(groupSearch.toLowerCase())).length === 0 && !groupSearch.trim() && (
                            <div className="px-3 py-2 text-xs text-gray-400 italic">No groups found</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {form.category !== 'Finished Goods' && activeFields.includes('ruleType') && (
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">RULE TYPE</label>
                    <select
                      value={form.ruleType}
                      onChange={e => {
                        if (e.target.value === '__ADD_NEW__') {
                          handleAddNewOption('ruleTypes');
                        } else {
                          setForm({ ...form, ruleType: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800 cursor-pointer"
                    >
                      {ruleTypesList.map(rule => (
                        <option key={rule} value={rule}>{rule}</option>
                      ))}
                      <option value="__ADD_NEW__" className="text-purple-600 font-bold">+ Add Custom...</option>
                    </select>
                  </div>
                )}
                {form.category !== 'Finished Goods' && activeFields.includes('pages') && (
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                      {form.paperType === 'Sheets' ? 'STANDARD SHEETS/REAM' : 'PAGES'}
                    </label>
                    <input
                      type="number"
                      placeholder={form.paperType === 'Sheets' ? 'e.g. 500' : 'e.g. 112 / 132'}
                      value={form.pages}
                      onChange={e => setForm({ ...form, pages: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800"
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
                      onChange={e => setForm({ ...form, reamWeight: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800"
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
                      onChange={e => setForm({ ...form, booksGbl: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">STATUS</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white font-semibold text-gray-800 cursor-pointer"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Stock Levels Section (Available for ALL categories, exact match to user screenshot!) */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <h3 className="text-xs font-bold text-gray-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Stock Levels
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

                {/* 3. Max Stock Level */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    <span>Max Stock Level</span>
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 100"
                    value={form.maxStockLevel || ''}
                    onChange={(e) => setForm({ ...form, maxStockLevel: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                  <span className="block text-[10px] text-gray-400 mt-1 font-medium leading-tight">
                    Upper limit — don't stock beyond this
                  </span>
                </div>
              </div>
            </div>

            {/* Dynamic Custom Fields Section */}
            {customColumns && customColumns.length > 0 && (
              <div className="space-y-3 border-t border-gray-100 pt-4">
                <h3 className="text-xs font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-600"></span>
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
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
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
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-800 focus:outline-none focus:border-purple-500 shadow-2xs"
                        />
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

                {/* BOM is ONLY for Finished Goods / Products */}
                {(form.category === 'Finished Goods' || form.category === 'Products' || (form.category || '').toLowerCase().includes('notebook') || (form.category || '').toLowerCase().includes('diary')) && (
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
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-purple-50 text-purple-700 rounded-lg">
                            <BookOpen className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 text-xs">Bill of Materials (Paper & Covers)</h4>
                            <p className="text-[10px] text-gray-400">Enter paper reel consumption and cover board quantities per batch.</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddBomItem}
                          className="px-3 py-1.5 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-bold rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Material</span>
                        </button>
                      </div>

                      {/* BOM Table Grid */}
                      {bomItems.length === 0 ? (
                        <div className="bg-gray-50/60 border border-dashed border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400">
                          No BOM materials added yet — click "+ Add Material" to define raw material consumption
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase">
                                <th className="py-2 px-2">ITEM</th>
                                <th className="py-2 px-2 w-20">QTY</th>
                                <th className="py-2 px-2 w-16">UOM</th>
                                <th className="py-2 px-2 w-20">IN STOCK</th>
                                <th className="py-2 px-2">NOTES</th>
                                <th className="py-2 px-1 w-8 text-center"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {bomItems.map((item) => (
                                <tr key={item.id}>
                                  <td className="py-2 px-2">
                                    <SearchableMaterialDropdown
                                      value={item.name}
                                      materials={rawMaterialsList}
                                      onChange={(selectedName, matchedSku) => {
                                        updateBomItem(item.id, 'name', selectedName);
                                        if (matchedSku) {
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
                                    />
                                  </td>
                                  <td className="py-2 px-2 text-gray-500 font-semibold">{item.uom}</td>
                                  <td className="py-2 px-2 text-gray-500 font-mono">{item.inStock}</td>
                                  <td className="py-2 px-2">
                                    <input
                                      type="text"
                                      value={item.notes}
                                      onChange={(e) => updateBomItem(item.id, 'notes', e.target.value)}
                                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white"
                                      placeholder="e.g. Paper Reel"
                                    />
                                  </td>
                                  <td className="py-2 px-1 text-center">
                                    <button
                                      type="button"
                                      onClick={() => removeBomItem(item.id)}
                                      className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-xs transition-all shadow-sm cursor-pointer flex items-center gap-2 disabled:opacity-50"
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
                      className="rounded border-gray-305 text-blue-605 focus:ring-blue-500 w-3.5 h-3.5"
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
    </>
  );
};

export default AddSkuDrawerV2;

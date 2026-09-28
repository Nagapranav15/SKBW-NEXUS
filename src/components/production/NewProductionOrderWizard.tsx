import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, ChevronDown, Plus, Trash2, RotateCcw, 
  Layers, Box, Receipt, Calculator, MessageSquare, 
  Check, X, Search, Loader2, Settings, Building2, MapPin
} from 'lucide-react';
import { ProductionOrder } from '../../types/production';
import { getNextProductionOrderNumber, createProductionOrder } from '../../api/productionApi';
import { getSkusV2, getWarehouseHierarchyV2, SkuV2, WarehouseLocationV2 } from '../../api/mfgApiV2';
import { LocationSelectPopup } from '../stock_v2/LocationSelectPopup';
import { Modal } from '../ui/Modal';
import { showToast } from '../ui/Toast';

interface NewProductionOrderWizardProps {
  onCancel: () => void;
  onCreated: (order: ProductionOrder) => void;
  companyId?: string;
  initialSkus?: SkuV2[];
}

export interface DepartmentPreset {
  id: string;
  name: string;
  locationName: string;
  warehouseId?: string;
  floorId?: string;
  zoneId?: string;
  locationId?: string;
}

interface MaterialRow {
  id: string;
  component: string;
  code: string;
  uom: string;
  requiredQty: number;
  sourceLocation: string;
  locationId?: string;
  warehouseId?: string;
  floorId?: string;
  zoneId?: string;
  rate: number;
  amount: number;
  basePerPiece?: number;
}

interface ScrapRow {
  id: string;
  item: string;
  uom: string;
  qty: number;
  rate: number;
  amount: number;
}

interface AdditionalCostRow {
  id: string;
  costType: string;
  basis: 'Total / Batch' | 'Per GBL' | 'Per Piece' | 'Lump Sum';
  amount: number;
  appliedAs: 'Total Cost for this production' | 'Per Unit (GBL)' | 'Per Unit (PCS)';
}

const DEFAULT_DEPARTMENT_PRESETS: DepartmentPreset[] = [
  {
    id: 'dept-notebook',
    name: 'Notebook Manufacturing',
    locationName: 'SKBW - Ground Floor',
    warehouseId: 'fact-skbw',
    floorId: 'floor-ground',
    zoneId: 'zone-a',
    locationId: 'loc-top'
  },
  {
    id: 'dept-ruling',
    name: 'Ruling & Cutting Line',
    locationName: 'SKBW - Ground Floor',
    warehouseId: 'fact-skbw',
    floorId: 'floor-ground',
    zoneId: 'zone-m',
    locationId: 'loc-m-top'
  },
  {
    id: 'dept-binding',
    name: 'Binding Department',
    locationName: 'SKBW - 1st Floor',
    warehouseId: 'fact-skbw',
    floorId: 'floor-1st',
    zoneId: '',
    locationId: ''
  },
  {
    id: 'dept-cover',
    name: 'Index & Cover Prep',
    locationName: 'LOM Warehouse',
    warehouseId: 'fact-lom',
    floorId: '',
    zoneId: '',
    locationId: ''
  },
  {
    id: 'dept-printing',
    name: 'Printing Department',
    locationName: 'SKBW - Ground Floor',
    warehouseId: 'fact-skbw',
    floorId: 'floor-ground',
    zoneId: 'zone-a',
    locationId: 'loc-bottom'
  },
  {
    id: 'dept-packing',
    name: 'Packing Department',
    locationName: 'SKBW - Ground Floor',
    warehouseId: 'fact-skbw',
    floorId: 'floor-ground',
    zoneId: 'zone-s',
    locationId: 'loc-s1'
  },
  {
    id: 'dept-dispatch',
    name: 'Dispatch Department',
    locationName: 'LOM Warehouse',
    warehouseId: 'fact-lom',
    floorId: '',
    zoneId: '',
    locationId: ''
  }
];

export const NewProductionOrderWizard: React.FC<NewProductionOrderWizardProps> = ({
  onCancel,
  onCreated,
  companyId,
  initialSkus = []
}) => {
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Master Data
  const [backendSkus, setBackendSkus] = useState<SkuV2[]>(initialSkus);
  const [warehouseLocations, setWarehouseLocations] = useState<WarehouseLocationV2[]>([]);

  // Department Presets (matching Sales Order presets in localStorage)
  const [departmentPresets, setDepartmentPresets] = useState<DepartmentPreset[]>(() => {
    try {
      const stored = localStorage.getItem('skbw_department_presets_v2');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_DEPARTMENT_PRESETS;
  });

  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState<boolean>(false);
  const [showManageDeptModal, setShowManageDeptModal] = useState<boolean>(false);
  const [newDeptName, setNewDeptName] = useState<string>('');
  const [newDeptLocation, setNewDeptLocation] = useState<string>('SKBW - Ground Floor');
  const [newDeptWhId, setNewDeptWhId] = useState<string>('fact-skbw');
  const [newDeptFlId, setNewDeptFlId] = useState<string>('floor-ground');
  const [newDeptZnId, setNewDeptZnId] = useState<string>('zone-a');
  const [newDeptLocId, setNewDeptLocId] = useState<string>('loc-top');
  const departmentDropdownRef = useRef<HTMLDivElement>(null);

  // Output Location Coordinates
  const [selectedWhId, setSelectedWhId] = useState<string>('fact-skbw');
  const [selectedFlId, setSelectedFlId] = useState<string>('floor-ground');
  const [selectedZnId, setSelectedZnId] = useState<string>('zone-a');
  const [selectedLocId, setSelectedLocId] = useState<string>('loc-top');

  // Top Bar fields (Reference number removed per user request)
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [orderDate, setOrderDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [department, setDepartment] = useState<string>('Notebook Manufacturing');

  // Product Selection fields
  const [selectedSkuId, setSelectedSkuId] = useState<string>('');
  const [productName, setProductName] = useState<string>('');
  const [productCode, setProductCode] = useState<string>('');
  const [showProductDropdown, setShowProductDropdown] = useState<boolean>(false);
  const [productSearch, setProductSearch] = useState<string>('');
  const productDropdownRef = useRef<HTMLDivElement>(null);

  // Output Location & Planned Qty
  const [outputLocation, setOutputLocation] = useState<string>('SKBW - Ground Floor');
  const [plannedQty, setPlannedQty] = useState<number | string>('');
  const [uom, setUom] = useState<string>('PCS');
  const [conversionFactor, setConversionFactor] = useState<number>(300);

  // Remarks
  const [remarks, setRemarks] = useState<string>('');

  // Materials Table
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [activeMaterialDropdownId, setActiveMaterialDropdownId] = useState<string | null>(null);

  // Scrap / By-Products Table
  const [scrapItems, setScrapItems] = useState<ScrapRow[]>([]);

  // Additional Costs Table
  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCostRow[]>([]);

  // Load backend sequence number & SKUs
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        if (companyId) {
          const [nextNum, skusRes, whRes] = await Promise.allSettled([
            getNextProductionOrderNumber(companyId),
            getSkusV2(companyId),
            getWarehouseHierarchyV2(companyId)
          ]);

          if (!isMounted) return;

          if (nextNum.status === 'fulfilled' && nextNum.value) {
            setOrderNumber(nextNum.value);
          }
          if (skusRes.status === 'fulfilled' && Array.isArray(skusRes.value)) {
            setBackendSkus(skusRes.value);
          }
          if (whRes.status === 'fulfilled' && Array.isArray(whRes.value)) {
            setWarehouseLocations(whRes.value);
          }
        }
      } catch (err) {
        console.error('Error loading production order initial data:', err);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [companyId]);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (productDropdownRef.current && !productDropdownRef.current.contains(target)) {
        setShowProductDropdown(false);
      }
      if (departmentDropdownRef.current && !departmentDropdownRef.current.contains(target)) {
        setShowDepartmentDropdown(false);
      }
      if (!target.closest('.material-dropdown-container')) {
        setActiveMaterialDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Producible Finished Goods & Semi-Finished SKUs
  const producibleSkus = useMemo(() => {
    return backendSkus.filter(s => {
      const cat = (s.category || '').toLowerCase();
      const code = (s.skuCode || '').toUpperCase();
      return !code.startsWith('RM-') && !cat.includes('raw') && !cat.includes('material');
    });
  }, [backendSkus]);

  const filteredProductOptions = useMemo(() => {
    if (!productSearch.trim()) return producibleSkus;
    const q = productSearch.toLowerCase();
    return producibleSkus.filter(s => 
      s.name.toLowerCase().includes(q) || s.skuCode.toLowerCase().includes(q)
    );
  }, [producibleSkus, productSearch]);

  const currentSku = useMemo(() => {
    return backendSkus.find(s => s._id === selectedSkuId);
  }, [backendSkus, selectedSkuId]);

  // Item Classification: Raw Materials vs Semi-Finished Goods vs Finished Goods
  const getItemClassification = (sku: SkuV2): 'products' | 'materials' | 'semi' => {
    const cat = (sku.category || '').toLowerCase().trim();
    const code = (sku.skuCode || '').toUpperCase().trim();
    const name = (sku.name || '').toLowerCase().trim();

    // 1. Semi Finished Goods (Semi Goods)
    if (
      code.startsWith('SFG-') || 
      code.startsWith('SFG') || 
      code.startsWith('SM-') || 
      code.startsWith('SM') || 
      code.startsWith('SEM') ||
      cat.includes('semi') || 
      cat.includes('wip') || 
      cat.includes('sub-assembly') || 
      cat.includes('sub') || 
      cat.includes('ruled cut') || 
      cat.includes('sheets') || 
      name.includes('signature') || 
      name.includes('ruled') || 
      name.includes('book block')
    ) {
      return 'semi';
    }

    // 2. Raw Materials
    if (
      cat.includes('raw') || 
      cat.includes('material') || 
      cat === 'raw material' || 
      cat.includes('reel') || 
      cat.includes('board') || 
      cat.includes('paper') || 
      code.startsWith('RM-') || 
      code.startsWith('RM') || 
      name.includes('reel') || 
      name.includes('gsm') || 
      name.includes('wire') || 
      name.includes('adhesive') || 
      name.includes('glue')
    ) {
      return 'materials';
    }

    // 3. Finished Goods
    return 'products';
  };

  // Only Raw Materials and Semi Goods can be selected as components in production
  const rawAndSemiSkus = useMemo(() => {
    const list = backendSkus.filter(s => {
      const type = getItemClassification(s);
      return type === 'materials' || type === 'semi';
    });
    if (list.length > 0) return list;
    return backendSkus.filter(s => {
      const code = (s.skuCode || '').toUpperCase();
      return !code.startsWith('FG-') && !code.startsWith('FG');
    });
  }, [backendSkus]);

  const [materialTypeFilter, setMaterialTypeFilter] = useState<'all' | 'materials' | 'semi'>('all');

  const rawCount = useMemo(() => rawAndSemiSkus.filter(s => getItemClassification(s) === 'materials').length, [rawAndSemiSkus]);
  const semiCount = useMemo(() => rawAndSemiSkus.filter(s => getItemClassification(s) === 'semi').length, [rawAndSemiSkus]);

  // Filter SKUs for Material / Component dropdown strictly to Raw Materials & Semi Goods
  const getFilteredMaterialSkus = (searchTerm: string) => {
    let base = rawAndSemiSkus;
    if (materialTypeFilter === 'materials') {
      base = base.filter(s => getItemClassification(s) === 'materials');
    } else if (materialTypeFilter === 'semi') {
      base = base.filter(s => getItemClassification(s) === 'semi');
    }

    if (!searchTerm || !searchTerm.trim()) return base;
    const q = searchTerm.toLowerCase().trim();
    return base.filter(s => 
      s.name.toLowerCase().includes(q) || 
      (s.skuCode && s.skuCode.toLowerCase().includes(q)) ||
      (s.category && s.category.toLowerCase().includes(q)) ||
      (s.brand && s.brand.toLowerCase().includes(q))
    );
  };

  // Handle selecting an item from the Material dropdown
  const handleSelectMaterialSku = (rowId: string, sku: SkuV2) => {
    const defaultRate = (sku as any).purchasePrice || (sku as any).standardCost || (sku as any).rate || 0;
    const uomVal = (sku.unit || 'PCS').toUpperCase();
    setMaterials(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      const qty = row.requiredQty > 0 ? row.requiredQty : 1;
      const rate = defaultRate > 0 ? defaultRate : row.rate;
      return {
        ...row,
        component: sku.name,
        code: sku.skuCode || row.code,
        uom: uomVal,
        rate: rate,
        amount: Math.round(qty * rate * 100) / 100
      };
    }));
    setActiveMaterialDropdownId(null);
  };

  // STRICTLY ASSIGNED UNITS ONLY (No extra/duplicate units like KG, BOX, BDL)
  const availableUnits = useMemo(() => {
    if (!currentSku) return ['PCS', 'GBL'];
    const set = new Set<string>();
    if (currentSku.unit) set.add(currentSku.unit.toUpperCase().trim());
    if (currentSku.altUnit) set.add(currentSku.altUnit.toUpperCase().trim());
    const conv = Number(currentSku.booksGbl || currentSku.altUnitConversion || 0);
    if (conv > 0) {
      set.add('PCS');
      set.add('GBL');
    }
    if (set.size === 0) set.add('PCS');
    return Array.from(set);
  }, [currentSku]);

  const numPlannedQty = Number(plannedQty) || 0;
  
  const plannedPcs = useMemo(() => {
    if (uom === 'GBL') {
      return numPlannedQty * (conversionFactor || 300);
    }
    return numPlannedQty;
  }, [numPlannedQty, uom, conversionFactor]);

  const plannedGbl = useMemo(() => {
    const factor = conversionFactor > 0 ? conversionFactor : 300;
    if (uom === 'GBL') {
      return numPlannedQty;
    }
    if (numPlannedQty <= 0) return 0;
    return Math.round((numPlannedQty / factor) * 100) / 100;
  }, [numPlannedQty, uom, conversionFactor]);

  const availableOutputLocations = useMemo(() => {
    const list = warehouseLocations.map(w => w.name).filter(Boolean);
    if (list.length > 0) return list;
    return [
      'Finished Goods (FG-001)',
      'Main Factory - Finished Goods',
      'SKBW - Ground Floor',
      'LOM Warehouse'
    ];
  }, [warehouseLocations]);

  // Handle department preset selection with automatic location assignment
  const handleSelectDepartmentPreset = (preset: DepartmentPreset) => {
    setDepartment(preset.name);
    setShowDepartmentDropdown(false);

    if (preset.locationName) {
      setOutputLocation(preset.locationName);
      if (preset.warehouseId) setSelectedWhId(preset.warehouseId);
      if (preset.floorId) setSelectedFlId(preset.floorId);
      if (preset.zoneId) setSelectedZnId(preset.zoneId);
      if (preset.locationId) setSelectedLocId(preset.locationId);
      showToast(`Selected "${preset.name}" (Auto-assigned: ${preset.locationName})`, 'success');
    }
  };

  // Add new department preset with full location coordinates
  const handleAddNewDepartmentPreset = () => {
    if (!newDeptName.trim()) {
      showToast('Please enter a department name', 'error');
      return;
    }
    const newPreset: DepartmentPreset = {
      id: `dept-${Date.now()}`,
      name: newDeptName.trim(),
      locationName: newDeptLocation || 'Main Factory',
      warehouseId: newDeptWhId || undefined,
      floorId: newDeptFlId || undefined,
      zoneId: newDeptZnId || undefined,
      locationId: newDeptLocId || undefined
    };
    const updated = [newPreset, ...departmentPresets];
    setDepartmentPresets(updated);
    try {
      localStorage.setItem('skbw_department_presets_v2', JSON.stringify(updated));
    } catch (e) {}
    setNewDeptName('');
    showToast(`Added "${newPreset.name}" to department presets`, 'success');
  };

  const handleDeleteDepartmentPreset = (id: string) => {
    const updated = departmentPresets.filter(p => p.id !== id);
    setDepartmentPresets(updated);
    try {
      localStorage.setItem('skbw_department_presets_v2', JSON.stringify(updated));
    } catch (e) {}
    showToast('Department preset deleted', 'info');
  };

  // Output location change handler
  const handleOutputLocationChange = (whId: string, flId: string, znId: string, locId: string) => {
    setSelectedWhId(whId);
    setSelectedFlId(flId);
    setSelectedZnId(znId);
    setSelectedLocId(locId);

    const locObj = warehouseLocations.find(l => String(l._id) === String(locId));
    const whObj = warehouseLocations.find(l => String(l._id) === String(whId));
    const floorObj = warehouseLocations.find(l => String(l._id) === String(flId));
    const pathStr = [whObj?.name, floorObj?.name, locObj?.name].filter(Boolean).join(' - ') || locObj?.name || 'Selected Location';
    setOutputLocation(pathStr);
  };

  // Material source location change handler via Mini Factory modal
  const handleMaterialLocationChange = (rowId: string, whId: string, flId: string, znId: string, locId: string) => {
    const locObj = warehouseLocations.find(l => String(l._id) === String(locId));
    const whObj = warehouseLocations.find(l => String(l._id) === String(whId));
    const floorObj = warehouseLocations.find(l => String(l._id) === String(flId));
    const pathStr = [whObj?.name, floorObj?.name, locObj?.name].filter(Boolean).join(' - ') || locObj?.name || 'Selected Location';

    setMaterials(prev => prev.map(m => {
      if (m.id !== rowId) return m;
      return {
        ...m,
        sourceLocation: pathStr,
        locationId: locId,
        warehouseId: whId,
        floorId: flId,
        zoneId: znId
      };
    }));
  };

  // Handle product selection & auto BOM load
  const handleSelectProduct = (sku: SkuV2) => {
    setSelectedSkuId(sku._id);
    setProductName(sku.name);
    setProductCode(sku.skuCode);
    setShowProductDropdown(false);
    setProductSearch('');

    // Dynamic unit adjustment strictly matching the product
    const assignedUnit = (sku.unit || 'PCS').toUpperCase().trim();
    setUom(assignedUnit);

    const factor = sku.booksGbl && sku.booksGbl > 0 ? sku.booksGbl : (sku.altUnitConversion || 300);
    setConversionFactor(factor);

    const rawBom = sku.bomItems || (sku as any).bom || [];
    if (Array.isArray(rawBom) && rawBom.length > 0) {
      const yieldQty = Number(sku.recipeYieldQty) || Number(sku.batchYieldQty) || 1;
      const targetPcs = plannedPcs > 0 ? plannedPcs : 1;

      const loadedMaterials: MaterialRow[] = rawBom.map((raw: any, idx: number) => {
        const rawQty = Number(raw.qty) || Number(raw.qtyPerBatch) || 1;
        const perPieceBasis = rawQty / yieldQty;
        const requiredQty = plannedPcs > 0 ? Math.round(perPieceBasis * targetPcs * 100) / 100 : rawQty;
        const rate = Number(raw.rate) || 0;
        return {
          id: `mat-${idx + 1}-${Date.now()}`,
          component: raw.name || raw.itemName || `Component ${idx + 1}`,
          code: raw.skuCode || raw.code || `RM-${String(idx + 1).padStart(3, '0')}`,
          uom: raw.uom || raw.unit || 'PCS',
          requiredQty,
          sourceLocation: 'SKBW - Ground Floor',
          rate,
          amount: Math.round(requiredQty * rate * 100) / 100,
          basePerPiece: perPieceBasis
        };
      });
      setMaterials(loadedMaterials);
    } else {
      setMaterials([]);
    }
  };

  const handleLoadFromBom = () => {
    if (!currentSku) {
      showToast('Please select a product first', 'error');
      return;
    }

    const rawBom = currentSku.bomItems || (currentSku as any).bom || [];
    if (Array.isArray(rawBom) && rawBom.length > 0) {
      handleSelectProduct(currentSku);
      showToast('BOM loaded and scaled successfully!', 'success');
      return;
    }

    if (materials.length > 0) {
      const targetPcs = plannedPcs > 0 ? plannedPcs : 1;
      setMaterials(prev => prev.map(m => {
        const base = m.basePerPiece || (m.requiredQty / (targetPcs || 1));
        const req = Math.round(base * targetPcs * 100) / 100;
        return {
          ...m,
          requiredQty: req,
          amount: Math.round(req * m.rate * 100) / 100
        };
      }));
      showToast('Materials re-scaled for current quantity', 'success');
    } else {
      showToast('No recipe found for this product. Use "+ Add Material" to add components.', 'info');
    }
  };

  const handleQuantityChange = (val: string) => {
    setPlannedQty(val);
    const newQty = Number(val) || 0;
    const newPcs = uom === 'GBL' ? newQty * (conversionFactor || 300) : newQty;
    
    if (newPcs > 0) {
      setMaterials(prev => prev.map(m => {
        if (m.basePerPiece !== undefined && m.basePerPiece > 0) {
          const req = Math.round(m.basePerPiece * newPcs * 100) / 100;
          return {
            ...m,
            requiredQty: req,
            amount: Math.round(req * m.rate * 100) / 100
          };
        }
        return m;
      }));
    }
  };

  const handleUpdateMaterial = (id: string, field: keyof MaterialRow, val: any) => {
    setMaterials(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: val };
      if (field === 'requiredQty' || field === 'rate') {
        const qty = Number(field === 'requiredQty' ? val : updated.requiredQty) || 0;
        const rate = Number(field === 'rate' ? val : updated.rate) || 0;
        updated.amount = Math.round(qty * rate * 100) / 100;
        if (field === 'requiredQty' && plannedPcs > 0) {
          updated.basePerPiece = qty / plannedPcs;
        }
      }
      return updated;
    }));
  };

  const handleAddMaterial = () => {
    const newId = `mat-${Date.now()}`;
    const nextIdx = materials.length + 1;
    setMaterials(prev => [
      ...prev,
      {
        id: newId,
        component: '',
        code: `RM-${String(nextIdx).padStart(3, '0')}`,
        uom: 'PCS',
        requiredQty: 1,
        sourceLocation: outputLocation || 'SKBW - Ground Floor',
        locationId: selectedLocId || undefined,
        warehouseId: selectedWhId || undefined,
        floorId: selectedFlId || undefined,
        zoneId: selectedZnId || undefined,
        rate: 0,
        amount: 0,
        basePerPiece: 0
      }
    ]);
    setActiveMaterialDropdownId(newId);
  };

  const handleDeleteMaterial = (id: string) => {
    setMaterials(prev => prev.filter(m => m.id !== id));
  };

  const handleUpdateScrap = (id: string, field: keyof ScrapRow, val: any) => {
    setScrapItems(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: val };
      if (field === 'qty' || field === 'rate') {
        const qty = Number(field === 'qty' ? val : updated.qty) || 0;
        const rate = Number(field === 'rate' ? val : updated.rate) || 0;
        updated.amount = Math.round(qty * rate * 100) / 100;
      }
      return updated;
    }));
  };

  const handleAddScrap = () => {
    const newId = `scrap-${Date.now()}`;
    setScrapItems(prev => [
      ...prev,
      {
        id: newId,
        item: '',
        uom: 'KG',
        qty: 0,
        rate: 0,
        amount: 0
      }
    ]);
  };

  const handleDeleteScrap = (id: string) => {
    setScrapItems(prev => prev.filter(s => s.id !== id));
  };

  const handleUpdateCost = (id: string, field: keyof AdditionalCostRow, val: any) => {
    setAdditionalCosts(prev => prev.map(row => {
      if (row.id !== id) return row;
      return { ...row, [field]: val };
    }));
  };

  const handleAddCost = () => {
    const newId = `cost-${Date.now()}`;
    setAdditionalCosts(prev => [
      ...prev,
      {
        id: newId,
        costType: '',
        basis: 'Total / Batch',
        amount: 0,
        appliedAs: 'Total Cost for this production'
      }
    ]);
  };

  const handleDeleteCost = (id: string) => {
    setAdditionalCosts(prev => prev.filter(c => c.id !== id));
  };

  const totalMaterialCost = useMemo(() => {
    return materials.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [materials]);

  const totalScrapCost = useMemo(() => {
    return scrapItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [scrapItems]);

  const totalAdditionalCost = useMemo(() => {
    return additionalCosts.reduce((sum, row) => {
      const amt = Number(row.amount) || 0;
      if (row.basis === 'Per GBL') {
        return sum + (amt * (plannedGbl || 1));
      }
      if (row.basis === 'Per Piece') {
        return sum + (amt * (plannedPcs || 1));
      }
      return sum + amt;
    }, 0);
  }, [additionalCosts, plannedGbl, plannedPcs]);

  const totalProductionCost = useMemo(() => {
    return totalMaterialCost + totalAdditionalCost + totalScrapCost;
  }, [totalMaterialCost, totalAdditionalCost, totalScrapCost]);

  const costPerGbl = useMemo(() => {
    if (plannedGbl <= 0) return 0;
    return Math.round((totalProductionCost / plannedGbl) * 100) / 100;
  }, [totalProductionCost, plannedGbl]);

  const costPerPiece = useMemo(() => {
    if (plannedPcs <= 0) return 0;
    return Math.round((totalProductionCost / plannedPcs) * 100) / 100;
  }, [totalProductionCost, plannedPcs]);

  const formatCurrency = (val: number) => {
    return (val || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const handleCreateOrder = async () => {
    if (!productName.trim()) {
      showToast('Please select a product to manufacture', 'error');
      return;
    }
    if (numPlannedQty <= 0) {
      showToast('Please enter a planned quantity greater than 0', 'error');
      return;
    }

    try {
      setSubmitting(true);

      const payload: any = {
        orderNumber: orderNumber.trim() || 'PO-0001',
        itemId: currentSku?._id || undefined,
        itemName: productName.trim(),
        itemCode: productCode.trim() || 'FG-001',
        itemType: 'Finished Good',
        plannedQty: numPlannedQty,
        plannedUom: uom,
        plannedPcs: plannedPcs,
        conversionFactor: conversionFactor,
        producedQty: 0,
        producedPcs: 0,
        balanceQty: numPlannedQty,
        balancePcs: plannedPcs,
        materialStatus: 'Ready',
        status: 'Planned',
        progress: 0,
        department: department.trim() || 'Notebook Manufacturing',
        factory: outputLocation.trim() || 'Main Factory',
        outputLocation: outputLocation.trim(),
        locationId: selectedLocId || undefined,
        warehouseId: selectedWhId || undefined,
        floorId: selectedFlId || undefined,
        zoneId: selectedZnId || undefined,
        orderDate: orderDate,
        plannedStartDate: orderDate,
        requiredCompletionDate: orderDate,
        priority: 'Normal',
        remarks: remarks.trim(),
        bomType: 'Custom BOM (Production Order Only)',
        bomItems: materials.map(m => ({
          id: m.id,
          component: m.component,
          code: m.code,
          type: 'Raw',
          qtyPerBatch: m.requiredQty,
          totalRequired: m.requiredQty,
          uom: m.uom,
          availableStock: 999999,
          stockStatus: 'Available',
          rate: m.rate,
          amount: m.amount,
          sourceLocation: m.sourceLocation,
          locationId: m.locationId
        })),
        byProducts: scrapItems,
        additionalCosts: additionalCosts,
        costSummary: {
          materialCost: totalMaterialCost,
          scrapCost: totalScrapCost,
          additionalCost: totalAdditionalCost,
          totalProductionCost: totalProductionCost,
          outputQuantity: `${plannedPcs} PCS (${plannedGbl.toFixed(2)} GBL)`,
          costPerGbl: costPerGbl,
          costPerPiece: costPerPiece
        },
        productionEntries: [],
        company: companyId
      };

      const created = await createProductionOrder(payload);
      showToast(`Production Order ${created.orderNumber} created successfully!`, 'success');
      onCreated(created);
    } catch (err: any) {
      console.error('Failed to create production order:', err);
      showToast(err.response?.data?.msg || err.message || 'Failed to create production order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-gray-800 font-sans select-none overflow-hidden text-xs">
      {/* ── TOP HEADER / TITLE BAR ── */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shadow-3xs">
            <Box className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900 leading-tight">Create Production Order</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                New Order
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">Manufacturing execution with bill of materials & cost ledger</p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-gray-400 hover:text-gray-700 transition-all cursor-pointer"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── SCROLLABLE MASTER WORKSPACE ── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {/* ── ROW 1: TOP CONTROL BAR (Clean 3-column layout without reference number) ── */}
        <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-3xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            
            {/* Production Order No */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                Production Order No.
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={orderNumber}
                  onChange={e => setOrderNumber(e.target.value)}
                  placeholder="e.g. PO-0001"
                  className="w-full h-9 pl-3 pr-14 text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-none transition-all placeholder:text-gray-400"
                />
                <span className="absolute right-2 px-2 py-0.5 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200/60 rounded-md pointer-events-none">
                  Auto
                </span>
              </div>
            </div>

            {/* Order Date */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                Order Date
              </label>
              <div className="relative flex items-center">
                <input
                  type="date"
                  value={orderDate}
                  onChange={e => setOrderDate(e.target.value)}
                  className="w-full h-9 px-3 pr-8 text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-none transition-all"
                />
                <Calendar className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Department (Preset Field with Location Assignment & Manage Modal) */}
            <div className="relative" ref={departmentDropdownRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  Department
                </label>
                <button
                  type="button"
                  onClick={() => setShowManageDeptModal(true)}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer"
                  title="Manage Department Presets"
                >
                  <Settings className="w-3 h-3" />
                  <span>Presets</span>
                </button>
              </div>

              <div
                onClick={() => setShowDepartmentDropdown(!showDepartmentDropdown)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-lg flex items-center justify-between cursor-pointer hover:border-gray-300 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-600 transition-all"
              >
                <span className="text-xs font-semibold text-gray-800 truncate">
                  {department || 'Select Department...'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-1" />
              </div>

              {/* Department Presets Dropdown */}
              {showDepartmentDropdown && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-64 overflow-hidden flex flex-col p-1 animate-in fade-in zoom-in-95 duration-100 min-w-[280px]">
                  {/* Dropdown Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/80 rounded-t-lg">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Department Presets</span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-gray-200/80 text-gray-600">ALT+D</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDepartmentDropdown(false);
                        setShowManageDeptModal(true);
                      }}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Settings className="w-3 h-3" />
                      <span>Manage</span>
                    </button>
                  </div>

                  {/* List of Presets */}
                  <div className="overflow-y-auto max-h-52 divide-y divide-gray-100 p-1">
                    {departmentPresets.map(preset => {
                      const isSelected = department === preset.name;
                      return (
                        <div
                          key={preset.id}
                          onClick={() => handleSelectDepartmentPreset(preset)}
                          className={`p-2.5 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-colors ${
                            isSelected ? 'bg-blue-50/80 text-blue-900 font-bold' : 'hover:bg-gray-50/80 text-gray-800'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <span className="block font-semibold truncate">{preset.name}</span>
                          </div>
                          {preset.locationName && (
                            <span className="px-2 py-0.5 text-[9.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md shrink-0">
                              {preset.locationName}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── ROW 2: PRODUCT & OUTPUT TARGETS ── */}
        <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-3xs">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-end">
            
            {/* Product to Manufacture (EXACT 1:1 WITH USER SCREENSHOT) */}
            <div className="lg:col-span-4 relative" ref={productDropdownRef}>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                Product to Manufacture <span className="text-red-500">*</span>
              </label>
              <div
                onClick={() => setShowProductDropdown(!showProductDropdown)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-lg flex items-center justify-between cursor-pointer hover:border-gray-300 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-600 transition-all shadow-3xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  {productName ? (
                    <>
                      <span className="text-xs font-bold text-gray-900 truncate">
                        {productName}
                      </span>
                      {productCode && (
                        <span className="text-[10px] font-mono font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200/60 shrink-0">
                          {productCode}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">Select product...</span>
                  )}
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-1" />
              </div>

              {/* Product dropdown list matching exact screenshot design */}
              {showProductDropdown && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-72 overflow-hidden flex flex-col p-1 animate-in fade-in zoom-in-95 duration-100 w-full min-w-[340px]">
                  <div className="p-2 border-b border-gray-100 flex items-center gap-2 bg-gray-50/80 rounded-t-lg">
                    <Search className="w-4 h-4 text-gray-400 shrink-0" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      placeholder="Search product..."
                      className="w-full text-xs bg-transparent border-none outline-none text-gray-800 placeholder:text-gray-400"
                      autoFocus
                    />
                  </div>
                  <div className="overflow-y-auto max-h-60 divide-y divide-gray-100 p-1">
                    {filteredProductOptions.length === 0 ? (
                      <div className="p-3 text-xs text-gray-400 text-center italic">No products found</div>
                    ) : (
                      filteredProductOptions.map(sku => {
                        const isSelected = selectedSkuId === sku._id;
                        const conv = Number(sku.booksGbl || sku.altUnitConversion || 0);
                        return (
                          <div
                            key={sku._id}
                            onClick={() => handleSelectProduct(sku)}
                            className={`p-2.5 rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                              isSelected 
                                ? 'bg-blue-100/90 font-bold border border-blue-200' 
                                : 'hover:bg-blue-50/80'
                            }`}
                          >
                            <div className="flex-1 min-w-0 pr-3">
                              <div className="font-bold text-gray-900 truncate text-xs">{sku.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-gray-400 font-mono">{sku.skuCode}</span>
                                <span className="text-[10px] text-gray-300">•</span>
                                <span className="text-[10px] text-gray-500 truncate">{sku.brand || sku.category || 'Finished Goods'}</span>
                                {conv > 0 && (
                                  <>
                                    <span className="text-[10px] text-gray-300">•</span>
                                    <span className="text-[10px] font-semibold text-blue-600">{conv} Pcs/GBL</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="px-2 py-0.5 text-[9.5px] font-extrabold uppercase rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                                {sku.status || 'Active'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Output Location (Single clean field with Mini Factory modal) */}
            <div className="lg:col-span-4">
              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                Output Location (Finished Goods) <span className="text-red-500">*</span>
              </label>
              <LocationSelectPopup
                locations={warehouseLocations}
                warehouseId={selectedWhId}
                floorId={selectedFlId}
                zoneId={selectedZnId}
                locationId={selectedLocId}
                displayValue={outputLocation}
                onChange={handleOutputLocationChange}
                variant="compact"
                hideLabel
                className="w-full"
              />
            </div>

            {/* Planned Quantity to Produce with STRICTLY ASSIGNED UNITS ONLY */}
            <div className="lg:col-span-4">
              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                Planned Quantity to Produce <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    value={plannedQty}
                    onChange={e => handleQuantityChange(e.target.value)}
                    placeholder="0"
                    className="w-full h-9 px-3 text-xs font-bold text-gray-900 bg-white border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg outline-none transition-all placeholder:text-gray-400"
                  />
                </div>
                
                {/* UOM Selector: strictly ONLY assigned units for that respective item */}
                <div className="w-20 relative shrink-0">
                  <select
                    value={uom}
                    onChange={e => setUom(e.target.value)}
                    className="w-full h-9 pl-2.5 pr-6 text-xs font-bold text-gray-800 bg-white border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg outline-none transition-all appearance-none cursor-pointer"
                  >
                    {availableUnits.map(unitOption => (
                      <option key={unitOption} value={unitOption}>{unitOption}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Conversion Badge */}
                <div className="h-9 px-3 bg-blue-50/70 border border-blue-200/70 rounded-lg flex flex-col justify-center shrink-0 min-w-[125px]">
                  <span className="text-xs font-bold text-blue-700 leading-tight">
                    {numPlannedQty > 0 ? (
                      uom === 'GBL' ? `= ${plannedPcs} PCS` : `= ${plannedGbl.toFixed(2)} GBL`
                    ) : (
                      uom === 'GBL' ? '- PCS' : '- GBL'
                    )}
                  </span>
                  <span className="text-[9px] font-medium text-blue-600/80 leading-tight">
                    (Auto from conversion)
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ── ROW 3: MATERIALS TO BE CONSUMED (FROM BOM) ── */}
        <div className="bg-white rounded-xl border border-gray-200/90 shadow-3xs overflow-hidden">
          {/* Card Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shadow-3xs">
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-gray-900 text-xs sm:text-sm">
                Materials to be Consumed (From BOM)
              </h3>
            </div>
            <button
              onClick={handleLoadFromBom}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 font-bold rounded-lg text-xs cursor-pointer transition-all shadow-3xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Load from BOM
            </button>
          </div>

          {/* Table with Mini Factory modal for Source Location */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/90 border-b border-gray-200 text-[10.5px] font-bold text-gray-600 uppercase tracking-wider">
                  <th className="py-2.5 px-3 text-center w-8">#</th>
                  <th className="py-2.5 px-3">Material / Component</th>
                  <th className="py-2.5 px-3 w-24 text-center">Item Code</th>
                  <th className="py-2.5 px-3 w-16 text-center">UOM</th>
                  <th className="py-2.5 px-3 w-32 text-right">Required Qty<br/><span className="text-[9.5px] font-normal normal-case text-gray-400">({numPlannedQty > 0 ? `for ${plannedQty} ${uom}` : 'qty'})</span></th>
                  <th className="py-2.5 px-3 min-w-[210px]">Source Location<br/><span className="text-[9.5px] font-normal normal-case text-gray-400">(Collect from)</span></th>
                  <th className="py-2.5 px-3 w-24 text-right">Rate (₹)</th>
                  <th className="py-2.5 px-3 w-28 text-right">Material Cost (₹)</th>
                  <th className="py-2.5 px-3 w-10 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {materials.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-xs text-gray-400 italic">
                      No materials added yet. Select a product above or click <strong>"+ Add Material"</strong> to add components.
                    </td>
                  </tr>
                ) : (
                  materials.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-2 px-3 text-center text-gray-400 font-medium">
                        {idx + 1}
                      </td>

                      {/* Material / Component: Searchable Dropdown & Visible Input Box */}
                      <td className="py-2 px-3 relative material-dropdown-container">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={row.component}
                            onChange={e => {
                              handleUpdateMaterial(row.id, 'component', e.target.value);
                              setActiveMaterialDropdownId(row.id);
                            }}
                            onFocus={() => setActiveMaterialDropdownId(row.id)}
                            onClick={() => setActiveMaterialDropdownId(row.id)}
                            placeholder="Select or enter component..."
                            className="w-full pl-8 pr-7 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all placeholder:text-gray-400 shadow-3xs"
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                            {row.component ? (
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateMaterial(row.id, 'component', '');
                                  setActiveMaterialDropdownId(row.id);
                                }}
                                className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setActiveMaterialDropdownId(activeMaterialDropdownId === row.id ? null : row.id)}
                                className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Searchable Material Dropdown (Raw Materials & Semi Goods) */}
                        {activeMaterialDropdownId === row.id && (
                          <div className="absolute left-3 top-full mt-1.5 w-[420px] sm:w-[500px] bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] max-h-72 overflow-hidden flex flex-col p-1 animate-in fade-in zoom-in-95 duration-100">
                            {/* Type filter tabs: All vs Materials vs Semi Goods */}
                            <div className="flex items-center gap-1 p-1 bg-gray-50/90 rounded-lg border-b border-gray-100 mb-1">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setMaterialTypeFilter('all'); }}
                                className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-colors cursor-pointer ${
                                  materialTypeFilter === 'all' 
                                    ? 'bg-white text-blue-700 shadow-3xs border border-gray-200/60' 
                                    : 'text-gray-500 hover:text-gray-800'
                                }`}
                              >
                                All ({rawAndSemiSkus.length})
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setMaterialTypeFilter('materials'); }}
                                className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-colors cursor-pointer ${
                                  materialTypeFilter === 'materials' 
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200 shadow-3xs' 
                                    : 'text-gray-500 hover:text-amber-700'
                                }`}
                              >
                                Materials ({rawCount})
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setMaterialTypeFilter('semi'); }}
                                className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-colors cursor-pointer ${
                                  materialTypeFilter === 'semi' 
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200 shadow-3xs' 
                                    : 'text-gray-500 hover:text-purple-700'
                                }`}
                              >
                                Semi Goods ({semiCount})
                              </button>
                            </div>

                            {/* Item List */}
                            <div className="overflow-y-auto max-h-60 divide-y divide-gray-100 p-1">
                              {getFilteredMaterialSkus(row.component).length === 0 ? (
                                <div className="p-4 text-center text-xs text-gray-400 italic">No matching materials or semi goods found</div>
                              ) : (
                                getFilteredMaterialSkus(row.component).map(sku => {
                                  const isSelected = row.component.toLowerCase() === sku.name.toLowerCase();
                                  const conv = Number(sku.booksGbl || sku.altUnitConversion || 0);
                                  const itemType = getItemClassification(sku);
                                  return (
                                    <div
                                      key={sku._id}
                                      onClick={() => handleSelectMaterialSku(row.id, sku)}
                                      className={`p-2.5 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-colors ${
                                        isSelected ? 'bg-blue-100/90 font-bold border border-blue-200' : 'hover:bg-blue-50/80'
                                      }`}
                                    >
                                      <div className="flex-1 min-w-0 pr-3">
                                        <div className="font-bold text-gray-900 truncate">{sku.name}</div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          <span className="text-[10px] text-gray-400 font-mono">{sku.skuCode}</span>
                                          <span className="text-[10px] text-gray-300">•</span>
                                          <span className="text-[10px] text-gray-500 truncate">{sku.brand || sku.category || (itemType === 'semi' ? 'Semi Finished' : 'Raw Material')}</span>
                                          {sku.unit && (
                                            <>
                                              <span className="text-[10px] text-gray-300">•</span>
                                              <span className="text-[10px] font-semibold text-blue-600">{sku.unit}</span>
                                            </>
                                          )}
                                          {conv > 0 && (
                                            <>
                                              <span className="text-[10px] text-gray-300">•</span>
                                              <span className="text-[10px] font-semibold text-indigo-600">{conv} Pcs/GBL</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {itemType === 'semi' ? (
                                          <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                                            Semi Goods
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                            Material
                                          </span>
                                        )}
                                        <span className="px-2 py-0.5 text-[9.5px] font-extrabold uppercase rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                                          {sku.status || 'Active'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Item Code */}
                      <td className="py-2 px-3 text-center">
                        <input
                          type="text"
                          value={row.code}
                          onChange={e => handleUpdateMaterial(row.id, 'code', e.target.value)}
                          placeholder="RM-001"
                          className="w-24 text-center font-mono text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all placeholder:text-gray-400 shadow-3xs"
                        />
                      </td>

                      {/* UOM */}
                      <td className="py-2 px-3 text-center">
                        <input
                          type="text"
                          value={row.uom}
                          onChange={e => handleUpdateMaterial(row.id, 'uom', e.target.value)}
                          className="w-16 text-center text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg px-1.5 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all shadow-3xs"
                        />
                      </td>

                      {/* Required Qty */}
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="any"
                          value={row.requiredQty}
                          onChange={e => handleUpdateMaterial(row.id, 'requiredQty', e.target.value)}
                          className="w-full text-right font-bold text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all shadow-3xs"
                        />
                      </td>
                      
                      {/* Source Location with Mini Factory Warehouse Hierarchy Modal */}
                      <td className="py-2 px-3">
                        <LocationSelectPopup
                          locations={warehouseLocations}
                          locationId={row.locationId || ''}
                          displayValue={row.sourceLocation || 'Select Location...'}
                          onChange={(wh, fl, zn, loc) => handleMaterialLocationChange(row.id, wh, fl, zn, loc)}
                          variant="compact"
                          hideLabel
                          className="w-full min-w-[200px]"
                        />
                      </td>

                      {/* Rate */}
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={row.rate}
                          onChange={e => handleUpdateMaterial(row.id, 'rate', e.target.value)}
                          className="w-20 text-right text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all shadow-3xs"
                        />
                      </td>

                      {/* Material Cost */}
                      <td className="py-2 px-3 text-right">
                        <div className="w-24 text-right font-bold text-gray-900 text-xs py-1.5 px-2 bg-gray-50 border border-gray-200/80 rounded-lg ml-auto">
                          {formatCurrency(row.amount)}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => handleDeleteMaterial(row.id)}
                          className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete material"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Bottom Control */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 bg-gray-50/50">
            <button
              onClick={handleAddMaterial}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 font-bold rounded-lg text-xs cursor-pointer transition-all shadow-3xs"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              Add Material
            </button>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold text-gray-700">Total Material Cost (₹)</span>
              <span className="font-extrabold text-gray-900 text-sm">
                {formatCurrency(totalMaterialCost)}
              </span>
            </div>
          </div>
        </div>

        {/* ── ROW 4: SPLIT 2-COLUMN (FINISHED GOODS OUTPUT & BY-PRODUCTS/SCRAP) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* Card 1: Finished Goods Output */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200/90 shadow-3xs overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-white">
              <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shadow-3xs">
                <Box className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-gray-900 text-xs sm:text-sm">
                Finished Goods Output
              </h3>
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/90 border-b border-gray-200 text-[10.5px] font-bold text-gray-600 uppercase tracking-wider">
                    <th className="py-2.5 px-2.5 text-center w-7">#</th>
                    <th className="py-2.5 px-2.5">Product</th>
                    <th className="py-2.5 px-2.5 text-center">Item Code</th>
                    <th className="py-2.5 px-2.5 text-center">UOM</th>
                    <th className="py-2.5 px-2.5 text-right">Qty (PCS)</th>
                    <th className="py-2.5 px-2.5 text-right">Qty (GBL)</th>
                    <th className="py-2.5 px-2.5 text-right">Total Cost (₹)</th>
                    <th className="py-2.5 px-2.5 text-right">Cost/Piece (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {productName ? (
                    <tr className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-2.5 px-2.5 text-center text-gray-400 font-medium">1</td>
                      <td className="py-2.5 px-2.5 font-bold text-gray-900">{productName}</td>
                      <td className="py-2.5 px-2.5 text-center font-mono text-gray-500">{productCode || '-'}</td>
                      <td className="py-2.5 px-2.5 text-center font-bold text-gray-700">{uom}</td>
                      <td className="py-2.5 px-2.5 text-right font-extrabold text-gray-900">{plannedPcs || 0}</td>
                      <td className="py-2.5 px-2.5 text-right font-bold text-gray-800">{plannedGbl.toFixed(2)}</td>
                      <td className="py-2.5 px-2.5 text-right font-extrabold text-gray-900">{formatCurrency(totalProductionCost)}</td>
                      <td className="py-2.5 px-2.5 text-right font-bold text-blue-700">{formatCurrency(costPerPiece)}</td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-xs text-gray-400 italic">
                        Select a product above to preview finished goods output & costing.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Card 2: By-Products / Scrap (Optional) */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-gray-200/90 shadow-3xs overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-white">
                <div className="w-6 h-6 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold shadow-3xs">
                  <Box className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <h3 className="font-bold text-gray-900 text-xs sm:text-sm">
                  By-Products / Scrap (Optional)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/90 border-b border-gray-200 text-[10.5px] font-bold text-gray-600 uppercase tracking-wider">
                      <th className="py-2 px-2 text-center w-7">#</th>
                      <th className="py-2 px-2">Item</th>
                      <th className="py-2 px-2 w-14 text-center">UOM</th>
                      <th className="py-2 px-2 w-16 text-right">Qty</th>
                      <th className="py-2 px-2 w-16 text-right">Rate (₹)</th>
                      <th className="py-2 px-2 w-20 text-right">Amount (₹)</th>
                      <th className="py-2 px-2 w-8 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {scrapItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-5 text-center text-xs text-gray-400 italic">
                          No scrap or by-products specified.
                        </td>
                      </tr>
                    ) : (
                      scrapItems.map((scrap, idx) => (
                        <tr key={scrap.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-2 px-2 text-center text-gray-400 font-medium">{idx + 1}</td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={scrap.item}
                              onChange={e => handleUpdateScrap(scrap.id, 'item', e.target.value)}
                              placeholder="e.g. Scrap Paper"
                              className="w-full text-xs font-semibold text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all placeholder:text-gray-400 shadow-3xs"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <input
                              type="text"
                              value={scrap.uom}
                              onChange={e => handleUpdateScrap(scrap.id, 'uom', e.target.value)}
                              className="w-14 text-center text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all shadow-3xs"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={scrap.qty}
                              onChange={e => handleUpdateScrap(scrap.id, 'qty', e.target.value)}
                              className="w-16 text-right text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all shadow-3xs"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={scrap.rate}
                              onChange={e => handleUpdateScrap(scrap.id, 'rate', e.target.value)}
                              className="w-16 text-right text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all shadow-3xs"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <div className="w-20 text-right font-bold text-gray-900 text-xs py-1.5 px-2 bg-gray-50 border border-gray-200/80 rounded-lg ml-auto">
                              {formatCurrency(scrap.amount)}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              onClick={() => handleDeleteScrap(scrap.id)}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete scrap item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Scrap Footer */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 bg-gray-50/50">
              <button
                onClick={handleAddScrap}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-purple-200 text-purple-700 hover:bg-purple-50 font-bold rounded-lg text-xs cursor-pointer transition-all shadow-3xs"
              >
                <Plus className="w-3 h-3 stroke-[2.5]" />
                Add Scrap
              </button>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-gray-700">Total Scrap Cost (₹)</span>
                <span className="font-extrabold text-gray-900">
                  {formatCurrency(totalScrapCost)}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* ── ROW 5: SPLIT 2-COLUMN (ADDITIONAL COSTS & COST SUMMARY) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* Card 1: Additional Costs (Optional) */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200/90 shadow-3xs overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-white">
                <div className="w-6 h-6 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold shadow-3xs">
                  <Receipt className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <h3 className="font-bold text-gray-900 text-xs sm:text-sm">
                  Additional Costs (Optional)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/90 border-b border-gray-200 text-[10.5px] font-bold text-gray-600 uppercase tracking-wider">
                      <th className="py-2 px-2 text-center w-7">#</th>
                      <th className="py-2 px-2">Cost Type</th>
                      <th className="py-2 px-2 w-28">Basis</th>
                      <th className="py-2 px-2 w-24 text-right">Amount (₹)</th>
                      <th className="py-2 px-2 min-w-[170px]">Applied As</th>
                      <th className="py-2 px-2 w-8 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {additionalCosts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-5 text-center text-xs text-gray-400 italic">
                          No additional costs added. Click "+ Add Cost" to include labor, electricity, or overheads.
                        </td>
                      </tr>
                    ) : (
                      additionalCosts.map((cost, idx) => (
                        <tr key={cost.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-2 px-2 text-center text-gray-400 font-medium">{idx + 1}</td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={cost.costType}
                              onChange={e => handleUpdateCost(cost.id, 'costType', e.target.value)}
                              placeholder="e.g. Wages, Electricity"
                              className="w-full text-xs font-semibold text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all placeholder:text-gray-400 shadow-3xs"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <div className="relative">
                              <select
                                value={cost.basis}
                                onChange={e => handleUpdateCost(cost.id, 'basis', e.target.value)}
                                className="w-full text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 pr-6 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none appearance-none cursor-pointer transition-all shadow-3xs"
                              >
                                <option value="Total / Batch">Total / Batch</option>
                                <option value="Per GBL">Per GBL</option>
                                <option value="Per Piece">Per Piece</option>
                                <option value="Lump Sum">Lump Sum</option>
                              </select>
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={cost.amount}
                              onChange={e => handleUpdateCost(cost.id, 'amount', e.target.value)}
                              className="w-24 text-right text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all shadow-3xs"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <div className="relative">
                              <select
                                value={cost.appliedAs}
                                onChange={e => handleUpdateCost(cost.id, 'appliedAs', e.target.value)}
                                className="w-full text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 pr-6 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none appearance-none cursor-pointer transition-all shadow-3xs"
                              >
                                <option value="Total Cost for this production">Total Cost for this production</option>
                                <option value="Per Unit (GBL)">Per Unit (GBL)</option>
                                <option value="Per Unit (PCS)">Per Unit (PCS)</option>
                              </select>
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              onClick={() => handleDeleteCost(cost.id)}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete cost"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Additional Cost Footer */}
            <div className="px-4 py-2.5 border-t border-gray-200 bg-gray-50/50">
              <button
                onClick={handleAddCost}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-purple-200 text-purple-700 hover:bg-purple-50 font-bold rounded-lg text-xs cursor-pointer transition-all shadow-3xs"
              >
                <Plus className="w-3 h-3 stroke-[2.5]" />
                Add Cost
              </button>
            </div>
          </div>

          {/* Card 2: Cost Summary */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-gray-200/90 shadow-3xs overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-white">
              <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shadow-3xs">
                <Calculator className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <h3 className="font-bold text-gray-900 text-xs sm:text-sm">
                Cost Summary
              </h3>
            </div>
            <div className="p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-gray-600">
                <span>Material Cost (A)</span>
                <span className="font-bold text-gray-900">{formatCurrency(totalMaterialCost)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span>Scrap Cost</span>
                <span className="font-bold text-gray-900">{formatCurrency(totalScrapCost)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span>Additional Cost (B)</span>
                <span className="font-bold text-gray-900">{formatCurrency(totalAdditionalCost)}</span>
              </div>
              
              {/* Highlighted Total Production Cost Banner */}
              <div className="bg-blue-50/80 border border-blue-200/70 rounded-xl p-2.5 flex items-center justify-between font-bold text-blue-900 text-xs sm:text-sm">
                <span>Total Production Cost (A + B)</span>
                <span>{formatCurrency(totalProductionCost)}</span>
              </div>

              <div className="pt-1 flex items-center justify-between text-gray-600">
                <span>Output Quantity</span>
                <span className="font-bold text-gray-900">
                  {numPlannedQty > 0 ? (
                    uom === 'GBL' ? `${plannedQty} GBL (${plannedPcs} PCS)` : `${plannedPcs} PCS (${plannedGbl.toFixed(2)} GBL)`
                  ) : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span>Cost per GBL (₹)</span>
                <span className="font-bold text-gray-900">{formatCurrency(costPerGbl)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span>Cost per Piece (₹)</span>
                <span className="font-bold text-gray-900">{formatCurrency(costPerPiece)}</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* ── FOOTER CONTROL BAR (Sales Drawer V2 Style) ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3.5 bg-white border-t border-gray-200 shrink-0">
        
        {/* Remarks Input */}
        <div className="relative w-full sm:max-w-md">
          <MessageSquare className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="Remarks (Optional)"
            className="w-full h-8 pl-9 pr-3 text-xs text-gray-800 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-none transition-all placeholder:text-gray-400"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreateOrder}
            disabled={submitting}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <span>Create Production Order</span>
            )}
          </button>
        </div>

      </div>

      {/* ── MANAGE DEPARTMENT PRESETS MODAL ── */}
      <Modal
        isOpen={showManageDeptModal}
        onClose={() => setShowManageDeptModal(false)}
        title="Manage Department Presets"
        maxWidth="max-w-xl"
        zIndex="z-[99999]"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            Department presets appear in the department selector dropdown. Selecting a preset automatically assigns its linked factory and storage location.
          </p>

          {/* List of Presets */}
          <div className="max-h-60 overflow-y-auto border border-gray-200/90 rounded-xl divide-y divide-gray-100">
            {departmentPresets.map(preset => (
              <div key={preset.id} className="p-3 flex items-center justify-between text-xs hover:bg-gray-50/80 transition-colors">
                <div className="min-w-0 pr-2">
                  <span className="font-bold text-gray-900 block truncate">{preset.name}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold mt-1 bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span className="truncate">{preset.locationName || 'Main Factory'}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteDepartmentPreset(preset.id)}
                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors shrink-0"
                  title="Delete preset"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Add new preset form with Mini Factory Location Modal */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleAddNewDepartmentPreset();
            }}
            className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2.5"
          >
            <span className="text-[11px] font-bold text-blue-900 block uppercase tracking-wide">
              + Add New Department Preset (Press Enter to Add)
            </span>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-xs items-center">
              <div className="md:col-span-5">
                <input
                  type="text"
                  placeholder="Department Name (e.g. Ruling Line 2)"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all placeholder:text-gray-400 shadow-3xs"
                />
              </div>
              <div className="md:col-span-5">
                <LocationSelectPopup
                  locations={warehouseLocations}
                  warehouseId={newDeptWhId}
                  floorId={newDeptFlId}
                  zoneId={newDeptZnId}
                  locationId={newDeptLocId}
                  displayValue={newDeptLocation}
                  onChange={(wh, fl, zn, loc) => {
                    setNewDeptWhId(wh);
                    setNewDeptFlId(fl);
                    setNewDeptZnId(zn);
                    setNewDeptLocId(loc);
                    const locObj = warehouseLocations.find(l => String(l._id) === String(loc));
                    const whObj = warehouseLocations.find(l => String(l._id) === String(wh));
                    const floorObj = warehouseLocations.find(l => String(l._id) === String(fl));
                    const pathStr = [whObj?.name, floorObj?.name, locObj?.name].filter(Boolean).join(' - ') || locObj?.name || 'Selected Location';
                    setNewDeptLocation(pathStr);
                  }}
                  variant="compact"
                  hideLabel
                  className="w-full"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-lg text-xs cursor-pointer shadow-3xs transition-all"
                >
                  Add
                </button>
              </div>
            </div>
          </form>

          {/* Modal Footer */}
          <div className="flex justify-between items-center pt-2 border-t border-gray-100 text-xs">
            <button
              type="button"
              onClick={() => {
                setDepartmentPresets(DEFAULT_DEPARTMENT_PRESETS);
                try {
                  localStorage.setItem('skbw_department_presets_v2', JSON.stringify(DEFAULT_DEPARTMENT_PRESETS));
                } catch (e) {}
                showToast('Reset to default department presets', 'info');
              }}
              className="text-[11px] font-bold text-gray-500 hover:text-gray-700 cursor-pointer"
            >
              Reset to Defaults
            </button>
            <button
              type="button"
              onClick={() => setShowManageDeptModal(false)}
              className="px-4 py-1.5 bg-gray-900 text-white font-bold rounded-xl text-xs cursor-pointer hover:bg-gray-800 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

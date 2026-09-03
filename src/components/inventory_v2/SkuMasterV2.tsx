import React, { useEffect, useState, useRef, useMemo } from 'react';
import { 
  Package, 
  Layers, 
  Settings, 
  Folder, 
  Search, 
  Plus, 
  Download, 
  Upload, 
  X, 
  Eye, 
  Edit, 
  Trash2, 
  RefreshCw, 
  Save,
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  History, 
  HelpCircle, 
  Share2, 
  FileText, 
  Tag, 
  Columns, 
  ArrowUpDown, 
  Check, 
  Sparkles, 
  Bell, 
  Paperclip,
  Building,
  Building2,
  Lock,
  MapPin,
  SlidersHorizontal,
  ExternalLink,
  ClipboardList,
  AlertCircle,
  Book,
  BookOpen,
  Scroll,
  Disc,
  Copy
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  getSkusV2, 
  getBalancesV2,
  bulkImportSkusV2, 
  deleteSkuV2, 
  updateSkuV2, 
  getMetadataV2,
  updateMetadataV2,
  getWarehouseHierarchyV2,
  WarehouseLocationV2,
  SkuV2 
} from '../../api/mfgApiV2';
import { getActivityLogs, createActivityLog } from '../../api/activityLogApi';
import AddSkuDrawerV2, { SearchableMaterialDropdown } from './AddSkuDrawerV2';
import { showToast } from '../ui/Toast';
import * as XLSX from 'xlsx';
import Modal from '../ui/Modal';

// Helper to format SKU Name
export const formatSkuName = (name: string): string => {
  if (!name) return '';
  return name
    .replace(/(\d+)\s*GSM/gi, '$1 GSM')
    .replace(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)\s*CM/gi, '$1 x $2 CM')
    .replace(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)(?!\s*CM)/gi, '$1 x $2')
    .replace(/(\d+(?:\.\d+)?)\s*CM(?!\w)/gi, '$1 CM')
    .replace(/\s+/g, ' ')
    .trim();
};

// Helper to format Size
const formatSize = (s: SkuV2) => {
  let w = s.width;
  let l = s.length;
  if (!w || !l) {
    const match = s.name.match(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)/i);
    if (match) {
      if (!w) w = Number(match[1]);
      if (!l) l = Number(match[2]);
    }
  }
  if (w && l) {
    return `${w} x ${l} CM`;
  } else if (w) {
    return `${w} CM (W)`;
  } else if (l) {
    return `${l} CM (L)`;
  }
  return '—';
};

// Category interface for Categories tab
interface CategoryCardData {
  id: string;
  name: string;
  type: 'products' | 'materials' | 'semi';
  uom: string;
  fields: string[];
}

const DEFAULT_CATEGORIES: CategoryCardData[] = [
  // Products Categories (Book Manufacturing)
  { id: 'fg-1', name: 'Notebooks', type: 'products', uom: 'Pcs', fields: ['Pages', 'Size', 'Ruling'] },
  { id: 'fg-2', name: 'Executive Diaries', type: 'products', uom: 'Pcs', fields: ['Cover Type', 'Size', 'GSM'] },
  { id: 'fg-3', name: 'Longbooks', type: 'products', uom: 'Pcs', fields: ['Pages', 'Size', 'Rule Type'] },
  { id: 'fg-4', name: 'Drawing Books', type: 'products', uom: 'Pcs', fields: ['Pages', 'Size', 'Paper GSM'] },
  { id: 'fg-5', name: 'Hardbound Register', type: 'products', uom: 'Pcs', fields: ['Pages', 'Size', 'Binding'] },
  
  // Materials Categories (Paper Reels, Boards & Accessories)
  { id: 'rm-1', name: 'Paper Reels', type: 'materials', uom: 'Kg', fields: ['GSM', 'Width (cm)', 'Brand'] },
  { id: 'rm-2', name: 'Duplex Cover Board', type: 'materials', uom: 'Pcs', fields: ['GSM', 'Size'] },
  { id: 'rm-3', name: 'Stitching Wire & Thread', type: 'materials', uom: 'Kg', fields: ['Gauge', 'Type'] },
  { id: 'rm-4', name: 'Binding Glue & Adhesives', type: 'materials', uom: 'Kg', fields: ['Grade', 'Viscosity'] },

  // Semi Categories (Cut Sheets, Ruled Stock & Inner Blocks)
  { id: 'sfg-1', name: 'Ruled Cut Sheets', type: 'semi', uom: 'Ream', fields: ['GSM', 'Rule Type', 'Size'] },
  { id: 'sfg-2', name: 'Printed Inner Signatures', type: 'semi', uom: 'Set', fields: ['Title', 'Pages'] },
  { id: 'sfg-3', name: 'Folded Book Blocks', type: 'semi', uom: 'Pcs', fields: ['Form Factor', 'Pages'] }
];

// BOM Recipe Item interface
interface BomRecipeItem {
  id: string;
  name: string;
  qty: number;
  uom: string;
  inStock: number;
  notes?: string;
}

const SkuMasterV2: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useAuth();
  const currentCompanyId = selectedCompany?._id || '';

  // Key to force row animation trigger on reload / tab change
  const [animationKey, setAnimationKey] = useState(Date.now());

  // 4 Main Tabs State: 'products' | 'materials' | 'semi' | 'categories'
  const [activeMainTab, setActiveMainTab] = useState<'products' | 'materials' | 'semi' | 'categories'>('products');
  
  // Categories SubTab State: 'products' | 'materials' | 'semi'
  const [activeCategorySubTab, setActiveCategorySubTab] = useState<'products' | 'materials' | 'semi'>('products');

  // Custom Products Sub-Filter Dropdown State (Only shown in Products tab)
  const [showProductTypeDropdown, setShowProductTypeDropdown] = useState(false);
  const [selectedProductSubFilter, setSelectedProductSubFilter] = useState<'all' | 'finished-goods' | 'sub-assemblies'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Dynamic Custom Columns State
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [rowGrades, setRowGrades] = useState<{ [skuId: string]: string }>({});

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowProductTypeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Categories list state
  const [categoriesData, setCategoriesData] = useState<CategoryCardData[]>(() => {
    const saved = localStorage.getItem('skbw_erp_categories_cards');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return DEFAULT_CATEGORIES;
  });

  // Save categories cards to localStorage on update
  useEffect(() => {
    localStorage.setItem('skbw_erp_categories_cards', JSON.stringify(categoriesData));
  }, [categoriesData]);

  // Category modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryCardData | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    type: 'products' as 'products' | 'materials' | 'semi',
    uom: 'Pcs',
    fieldsText: ''
  });

  // Expanded Category IDs
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>([]);

  // Core SKU data states
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Sorting & Filtering
  const [sortRules] = useState<{ field: string; order: 'asc' | 'desc' }[]>(() => {
    const saved = localStorage.getItem('skbw_erp_sort_rules_skus');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [];
  });
  const [filterRules, setFilterRules] = useState<{ id: string; field: string; operator: string; value: string }[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Dynamic work order & dispatch order calculation helpers (Remove fake defaults)
  const getWorkOrderCount = (sku: SkuV2 | null) => {
    if (!sku) return 0;
    if ((sku as any).workOrderCount !== undefined) return Number((sku as any).workOrderCount) || 0;
    if ((sku as any).workOrdersCount !== undefined) return Number((sku as any).workOrdersCount) || 0;
    return 0;
  };

  const getDispatchOrderCount = (sku: SkuV2 | null) => {
    if (!sku) return 0;
    if ((sku as any).dispatchOrderCount !== undefined) return Number((sku as any).dispatchOrderCount) || 0;
    if ((sku as any).dispatchOrdersCount !== undefined) return Number((sku as any).dispatchOrdersCount) || 0;
    return 0;
  };

  // Add Custom Column Modal State (exact match to user screenshot!)
  const [showAddCustomColumnModal, setShowAddCustomColumnModal] = useState(false);
  const [newCustomColName, setNewCustomColName] = useState('');
  const [selectedFieldType, setSelectedFieldType] = useState<'text' | 'number' | 'date' | 'checkbox' | 'dropdown' | 'file' | 'formula'>('text');
  const [customColumnTypes, setCustomColumnTypes] = useState<{ [colName: string]: string }>({});
  const [customColumnValues, setCustomColumnValues] = useState<{ [key: string]: any }>({});

  // Dropdown Options & Formula State for Add Custom Column modal (matching user screenshots!)
  const [dropdownOptionsList, setDropdownOptionsList] = useState<{ id: string; label: string; color: string }[]>([
    { id: 'opt_1', label: 'Option 1', color: '#e0f2fe' }
  ]);
  const [formulaExpression, setFormulaExpression] = useState('');

  // Stored column definitions
  const [customColumnOptions, setCustomColumnOptions] = useState<{ [colName: string]: { label: string; color: string }[] }>({});
  const [customColumnFormulas, setCustomColumnFormulas] = useState<{ [colName: string]: string }>({});

  const evaluateFormula = (formulaStr: string, sku: SkuV2) => {
    if (!formulaStr) return '—';
    try {
      let replaced = formulaStr
        .replace(/\{Stock\}/gi, String(sku.openingStock || 0))
        .replace(/\{Pages\}/gi, String(sku.pages || 0))
        .replace(/\{GSM\}/gi, String(sku.gsm || 0))
        .replace(/\{Ream Weight\}/gi, String(sku.reamWeight || 0));
      const sanitized = replaced.replace(/[^0-9\+\-\*\/\(\)\.\s]/g, '');
      if (!sanitized.trim()) return '—';
      const result = Function(`"use strict"; return (${sanitized})`)();
      if (isNaN(result) || !isFinite(result)) return '—';
      return Number(result).toFixed(2);
    } catch {
      return '—';
    }
  };

  const [draggedColIdx, setDraggedColIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedColIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedColIdx === null || draggedColIdx === targetIndex) return;

    setCustomColumns(prev => {
      const next = [...prev];
      const [moved] = next.splice(draggedColIdx, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDraggedColIdx(null);
  };

  const handleAddCustomColumn = () => {
    setShowAddCustomColumnModal(true);
  };

  const moveColumnLeft = (idx: number) => {
    if (idx <= 0) return;
    setCustomColumns(prev => {
      const copy = [...prev];
      const temp = copy[idx - 1];
      copy[idx - 1] = copy[idx];
      copy[idx] = temp;
      return copy;
    });
  };

  const moveColumnRight = (idx: number) => {
    if (idx >= customColumns.length - 1) return;
    setCustomColumns(prev => {
      const copy = [...prev];
      const temp = copy[idx + 1];
      copy[idx + 1] = copy[idx];
      copy[idx] = temp;
      return copy;
    });
  };

  const removeCustomColumn = (colName: string) => {
    setCustomColumns(prev => prev.filter(c => c !== colName));
  };

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals & Popups
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);

  // Add SKU Modal
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [editSku, setEditSku] = useState<SkuV2 | null>(null);
  const [selectedSkuDetails, setSelectedSkuDetails] = useState<SkuV2 | null>(null);
  const [deleteConfirmSku, setDeleteConfirmSku] = useState<SkuV2 | null>(null);

  // Item Details Modal State
  const [detailsSubTab, setDetailsSubTab] = useState<'details' | 'work-orders' | 'dispatches' | 'rough-calc'>('details');
  const [itemAttributes, setItemAttributes] = useState({
    fabricGsm: '70 GSM Maplitho',
    size: '18 x 24 CM',
    color: 'Single Line Ruled'
  });
  const [stockLevels, setStockLevels] = useState({
    minLevel: '500',
    reorderLevel: ''
  });
  const [bomRecipeItems, setBomRecipeItems] = useState<BomRecipeItem[]>([
    { id: 'b-1', name: 'Maplitho Paper Reel 70 GSM (Kraft Roll)', qty: 0.2, uom: 'Kg', inStock: 600, notes: 'Paper Reel' },
    { id: 'b-2', name: 'Grey Duplex Cover Board 300 GSM', qty: 1, uom: 'Pcs', inStock: 15000, notes: 'Cover Board' },
    { id: 'b-3', name: 'Book Stitching Wire #24', qty: 0.02, uom: 'Kg', inStock: 180, notes: 'Wire' },
    { id: 'b-4', name: 'Hotmelt Binding Adhesive', qty: 0.05, uom: 'Kg', inStock: 2200, notes: 'Glue' }
  ]);
  const [recipeYieldQty, setRecipeYieldQty] = useState<string>('1');
  const [buildBatchYieldQty, setBuildBatchYieldQty] = useState<string>('1');
  const [itemGrade, setItemGrade] = useState('Option 2');
  const [isSavingBom, setIsSavingBom] = useState(false);

  const handleSaveBomRecipe = async () => {
    if (!selectedSkuDetails?._id) {
      showToast('No SKU item selected to save BOM', 'error');
      return;
    }
    setIsSavingBom(true);
    try {
      await updateSkuV2(selectedSkuDetails._id, {
        bomItems: bomRecipeItems,
        recipeYieldQty: Number(recipeYieldQty) || 1,
        company: selectedCompany?._id
      });
      setSelectedSkuDetails(prev => prev ? ({ ...prev, bomItems: bomRecipeItems, recipeYieldQty: Number(recipeYieldQty) || 1 }) : null);
      showToast('BOM Recipe saved successfully to database!', 'success');
      loadSkus(false);
    } catch (err: any) {
      console.error('Failed to save BOM recipe:', err);
      showToast(err.message || 'Failed to save BOM recipe', 'error');
    } finally {
      setIsSavingBom(false);
    }
  };

  // ── Build BOMs / Bulk Edit BOM Modal state & handlers ──
  // ── Per-Tab Independent Column Customizer Tool State ──
  const DEFAULT_PRODUCTS_COLUMNS = [
    { id: 'skuCode', label: 'ID / SKU Code', visible: true },
    { id: 'name', label: 'Item Name', visible: true },
    { id: 'category', label: 'Category', visible: true },
    { id: 'unit', label: 'UOM', visible: true },
    { id: 'altUnit', label: 'AUOM (Alt Unit)', visible: true },
    { id: 'altUnitConversion', label: 'Con Rate', visible: true },
    { id: 'gsm', label: 'GSM', visible: true },
    { id: 'size', label: 'Size', visible: true },
    { id: 'pages', label: 'Pages / Sheets', visible: true },
    { id: 'bom', label: 'BOM Recipe', visible: true },
    { id: 'openingStock', label: 'Stock', visible: true },
    { id: 'workOrders', label: 'Work Orders', visible: true },
    { id: 'dispatchOrders', label: 'Dispatch Orders', visible: true }
  ];

  const DEFAULT_MATERIALS_COLUMNS = [
    { id: 'skuCode', label: 'ID / SKU Code', visible: true },
    { id: 'name', label: 'Item Name', visible: true },
    { id: 'category', label: 'Category', visible: true },
    { id: 'unit', label: 'UOM', visible: true },
    { id: 'altUnit', label: 'AUOM (Alt Unit)', visible: true },
    { id: 'altUnitConversion', label: 'Con Rate', visible: true },
    { id: 'gsm', label: 'GSM', visible: true },
    { id: 'size', label: 'Size', visible: true },
    { id: 'openingStock', label: 'Stock', visible: true },
    { id: 'workOrders', label: 'Work Orders', visible: true },
    { id: 'dispatchOrders', label: 'Dispatch Orders', visible: true }
  ];

  const DEFAULT_SEMI_COLUMNS = [
    { id: 'skuCode', label: 'ID / SKU Code', visible: true },
    { id: 'name', label: 'Item Name', visible: true },
    { id: 'category', label: 'Category', visible: true },
    { id: 'unit', label: 'UOM', visible: true },
    { id: 'altUnit', label: 'AUOM (Alt Unit)', visible: true },
    { id: 'altUnitConversion', label: 'Con Rate', visible: true },
    { id: 'gsm', label: 'GSM', visible: true },
    { id: 'size', label: 'Size', visible: true },
    { id: 'pages', label: 'Pages / Sheets', visible: true },
    { id: 'bom', label: 'BOM Recipe', visible: true },
    { id: 'openingStock', label: 'Stock', visible: true },
    { id: 'workOrders', label: 'Work Orders', visible: true },
    { id: 'dispatchOrders', label: 'Dispatch Orders', visible: true }
  ];

  const STORAGE_KEY = 'skbw_sku_master_tab_columns_v2';

  const [tabColumnsMap, setTabColumnsMap] = useState<Record<string, typeof DEFAULT_PRODUCTS_COLUMNS>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            products: Array.isArray(parsed.products) ? parsed.products : DEFAULT_PRODUCTS_COLUMNS,
            materials: Array.isArray(parsed.materials) ? parsed.materials : DEFAULT_MATERIALS_COLUMNS,
            semi: Array.isArray(parsed.semi) ? parsed.semi : DEFAULT_SEMI_COLUMNS
          };
        }
      }
    } catch (e) {
      console.error('Failed to load column settings from localStorage', e);
    }
    return {
      products: DEFAULT_PRODUCTS_COLUMNS,
      materials: DEFAULT_MATERIALS_COLUMNS,
      semi: DEFAULT_SEMI_COLUMNS
    };
  });

  // Persist tabColumnsMap whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabColumnsMap));
    } catch (e) {
      console.error('Failed to save column settings to localStorage', e);
    }
  }, [tabColumnsMap]);

  const columnsConfig = tabColumnsMap[activeMainTab] || DEFAULT_PRODUCTS_COLUMNS;
  const setColumnsConfig = (newVal: typeof DEFAULT_PRODUCTS_COLUMNS | ((prev: typeof DEFAULT_PRODUCTS_COLUMNS) => typeof DEFAULT_PRODUCTS_COLUMNS)) => {
    setTabColumnsMap(prevMap => {
      const currentTab = activeMainTab in prevMap ? activeMainTab : 'products';
      const currentList = prevMap[currentTab] || DEFAULT_PRODUCTS_COLUMNS;
      const updated = typeof newVal === 'function' ? newVal(currentList) : newVal;
      return { ...prevMap, [currentTab]: updated };
    });
  };

  const [showColumnCustomizer, setShowColumnCustomizer] = useState(false);
  const columnCustomizerRef = useRef<HTMLDivElement>(null);
  const [draggedPopoverColIdx, setDraggedPopoverColIdx] = useState<number | null>(null);

  const handlePopoverDragStart = (e: React.DragEvent, idx: number) => {
    setDraggedPopoverColIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handlePopoverDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handlePopoverDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (draggedPopoverColIdx === null || draggedPopoverColIdx === dropIdx) return;
    const updated = [...columnsConfig];
    const [moved] = updated.splice(draggedPopoverColIdx, 1);
    updated.splice(dropIdx, 0, moved);
    setColumnsConfig(updated);
    setDraggedPopoverColIdx(null);
  };

  // Memoized visible columns according to current tab columnsConfig order and visibility
  const visibleColumns = useMemo(() => {
    return columnsConfig.filter(col => {
      if (col.id === 'bom' && activeMainTab !== 'products' && activeMainTab !== 'semi') {
        return false;
      }
      if (col.id === 'pages' && activeMainTab === 'materials') {
        return false;
      }
      return col.visible;
    });
  }, [columnsConfig, activeMainTab]);

  const [draggedHeaderIdx, setDraggedHeaderIdx] = useState<number | null>(null);

  const handleHeaderDragStart = (e: React.DragEvent, visibleIdx: number) => {
    setDraggedHeaderIdx(visibleIdx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleHeaderDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleHeaderDrop = (e: React.DragEvent, dropVisibleIdx: number) => {
    e.preventDefault();
    if (draggedHeaderIdx === null || draggedHeaderIdx === dropVisibleIdx) return;
    
    const sourceCol = visibleColumns[draggedHeaderIdx];
    const targetCol = visibleColumns[dropVisibleIdx];
    
    if (!sourceCol || !targetCol) return;

    const sourceFullIdx = columnsConfig.findIndex(c => c.id === sourceCol.id);
    const targetFullIdx = columnsConfig.findIndex(c => c.id === targetCol.id);

    if (sourceFullIdx === -1 || targetFullIdx === -1) return;

    const next = [...columnsConfig];
    const [moved] = next.splice(sourceFullIdx, 1);
    next.splice(targetFullIdx, 0, moved);
    
    setColumnsConfig(next);
    setDraggedHeaderIdx(null);
  };

  const [showBuildBomsModal, setShowBuildBomsModal] = useState(false);
  const [activeBomProduct, setActiveBomProduct] = useState<SkuV2 | null>(null);
  const [activeRecipeItems, setActiveRecipeItems] = useState<BomRecipeItem[]>([]);
  const [buildBomsSearch, setBuildBomsSearch] = useState('');
  const [onlyNoRecipeFilter, setOnlyNoRecipeFilter] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [isSavingBuildBom, setIsSavingBuildBom] = useState(false);

  const [modalDynamicLocation, setModalDynamicLocation] = useState<string>('Loading location...');

  // Helper to build parent-to-child location path (Factory ➔ Zone ➔ Storage Location)
  const buildModalLocationPath = (locId: string, allLocations: WarehouseLocationV2[]): string => {
    const locMap = new Map(allLocations.map(l => [l._id, l]));
    const current = locMap.get(locId);
    if (!current) return locId;

    const path: string[] = [current.name];
    let parentId = current.parentId;
    let guard = 0;

    while (parentId && guard < 10) {
      const parent = locMap.get(parentId);
      if (!parent) break;
      path.unshift(parent.name);
      parentId = parent.parentId;
      guard++;
    }

    return path.join(' ➔ ');
  };

  // Sync saved SKU attributes, stock levels, BOM items & yield quantity when viewing item details
  useEffect(() => {
    let isMounted = true;
    if (!selectedSkuDetails) return;

    const fetchModalLocationData = async () => {
      try {
        const hierarchy = currentCompanyId ? await getWarehouseHierarchyV2(currentCompanyId).catch(() => []) : [];
        
        if (selectedSkuDetails._id && currentCompanyId) {
          const balances = await getBalancesV2(currentCompanyId, undefined, undefined, selectedSkuDetails._id).catch(() => []);
          
          if (balances && balances.length > 0) {
            const locPaths: string[] = [];
            for (const b of balances) {
              const locObj = b.locationId || b.location;
              if (locObj) {
                if (typeof locObj === 'object' && locObj._id) {
                  const p = buildModalLocationPath(locObj._id, hierarchy);
                  const qtyText = b.onHand !== undefined ? ` (${b.onHand} ${selectedSkuDetails.unit || ''})` : '';
                  locPaths.push(`${p}${qtyText}`);
                } else if (typeof locObj === 'object' && locObj.name) {
                  locPaths.push(locObj.name);
                } else if (typeof locObj === 'string') {
                  const p = buildModalLocationPath(locObj, hierarchy);
                  locPaths.push(p);
                }
              }
            }
            if (locPaths.length > 0) {
              const unique = Array.from(new Set(locPaths));
              if (isMounted) setModalDynamicLocation(unique.join(' • '));
              return;
            }
          }

          const directLoc = (selectedSkuDetails as any)?.locationId || (selectedSkuDetails as any)?.warehouseLocation || (selectedSkuDetails as any)?.location || (selectedSkuDetails as any)?.locationName;
          if (directLoc) {
            if (typeof directLoc === 'object' && directLoc._id) {
              if (isMounted) setModalDynamicLocation(buildModalLocationPath(directLoc._id, hierarchy));
              return;
            } else if (typeof directLoc === 'string') {
              if (isMounted) setModalDynamicLocation(buildModalLocationPath(directLoc, hierarchy));
              return;
            }
          }
        }

        if (isMounted) setModalDynamicLocation('Not assigned to any location');
      } catch (err) {
        if (isMounted) setModalDynamicLocation('Not assigned to any location');
      }
    };

    fetchModalLocationData();

    return () => {
      isMounted = false;
    };
  }, [selectedSkuDetails, currentCompanyId]);

  useEffect(() => {
    if (selectedSkuDetails) {
      setRecipeYieldQty(String((selectedSkuDetails as any).recipeYieldQty || (selectedSkuDetails as any).batchYieldQty || '1'));
      
      const pType = selectedSkuDetails.paperType && selectedSkuDetails.paperType !== 'None' ? selectedSkuDetails.paperType : '';
      const gsmStr = selectedSkuDetails.gsm ? `${selectedSkuDetails.gsm} GSM` : '';
      const gsmCombined = [pType, gsmStr].filter(Boolean).join(' ') || 'Standard Paper';

      const w = selectedSkuDetails.width;
      const l = selectedSkuDetails.length;
      const sizeStr = w && l ? `${w} x ${l} CM` : formatSize(selectedSkuDetails);

      setItemAttributes({
        fabricGsm: gsmCombined,
        size: sizeStr,
        color: selectedSkuDetails.ruleType || 'Single Line Ruled'
      });

      setStockLevels({
        minLevel: String((selectedSkuDetails as any).minStockLevel ?? '500'),
        reorderLevel: String((selectedSkuDetails as any).reorderLevel ?? '')
      });

      if ((selectedSkuDetails as any).bomItems && Array.isArray((selectedSkuDetails as any).bomItems) && (selectedSkuDetails as any).bomItems.length > 0) {
        setBomRecipeItems((selectedSkuDetails as any).bomItems.map((item: any, idx: number) => ({
          id: item.id || `b-${idx}`,
          name: item.name,
          qty: item.qty ?? '',
          uom: item.uom || 'Pcs',
          inStock: Number(item.inStock) || 0,
          notes: item.notes || ''
        })));
      } else {
        setBomRecipeItems([]);
      }
    }
  }, [selectedSkuDetails]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Trigger animation refresh on main tab change
  useEffect(() => {
    setAnimationKey(Date.now());
  }, [activeMainTab, search, categoryFilter, selectedProductSubFilter]);

  // Load SKUs when company or filters change
  useEffect(() => {
    if (selectedCompany?._id) {
      loadSkus(true);
    }
  }, [selectedCompany?._id, categoryFilter, statusFilter]);

  // Load SKUs when search changes
  useEffect(() => {
    if (selectedCompany?._id) {
      loadSkus(false);
    }
  }, [debouncedSearch]);

  // Poller to refresh data every 10s
  useEffect(() => {
    if (!selectedCompany?._id) return;
    const interval = setInterval(() => {
      loadSkus(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedCompany?._id, categoryFilter, statusFilter, debouncedSearch]);

  const loadSkus = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const companyId = selectedCompany?._id || '';
      const [data, balancesData] = await Promise.all([
        getSkusV2(
          companyId, 
          categoryFilter || undefined, 
          debouncedSearch || undefined,
          statusFilter || undefined
        ),
        companyId ? getBalancesV2(companyId).catch(() => []) : Promise.resolve([])
      ]);

      const balanceMap = new Map<string, number>();
      if (Array.isArray(balancesData)) {
        balancesData.forEach((b: any) => {
          const sId = b.skuId || b.sku?._id;
          const qty = Number(b.onHand) || Number(b.quantity) || 0;
          if (sId) {
            balanceMap.set(sId, (balanceMap.get(sId) || 0) + qty);
          }
        });
      }

      const formatted = (data || []).map(item => {
        const hasBalance = balanceMap.has(item._id);
        const liveStock = hasBalance ? balanceMap.get(item._id)! : (Array.isArray(balancesData) && balancesData.length > 0 ? 0 : (item.openingStock ?? 0));
        return {
          ...item,
          name: formatSkuName(item.name),
          openingStock: liveStock,
          presentStock: liveStock
        };
      });
      setSkus(formatted);
    } catch (e) {
      console.error(e);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  // Demo Finished Products (Notebooks, Diaries, Longbooks, Registers)
  const DEMO_FINISHED_PRODUCTS: SkuV2[] = [
    {
      _id: 'demo-p-1',
      skuCode: 'FG-001',
      name: '132P Happy Days Notebook (UR) · 57x70 CM',
      category: 'Finished Goods',
      unit: 'Pcs',
      altUnit: 'Box',
      altUnitConversion: 10,
      openingStock: 1100,
      status: 'Active',
      ruleType: 'Unruled (UR)',
      brand: 'Happy Days',
      paperType: 'Sheets',
      gsm: 52
    },
    {
      _id: 'demo-p-2',
      skuCode: 'FG-002',
      name: '220P Classmate Longbook (SR) · 18x24 CM',
      category: 'Finished Goods',
      unit: 'Pcs',
      altUnit: 'Dozen',
      altUnitConversion: 12,
      openingStock: 1800,
      status: 'Active',
      ruleType: 'Single Line (SR)',
      brand: 'Classmate',
      paperType: 'Sheets',
      gsm: 56
    },
    {
      _id: 'demo-p-3',
      skuCode: 'FG-003',
      name: 'Hardbound Executive Diary 2026',
      category: 'Finished Goods',
      unit: 'Pcs',
      altUnit: 'Box',
      altUnitConversion: 5,
      openingStock: 400,
      status: 'Active',
      brand: 'Navneet',
      paperType: 'Sheets',
      gsm: 70
    },
    {
      _id: 'demo-p-4',
      skuCode: 'FG-004',
      name: '192P Premium Drawing Book · A4',
      category: 'Finished Goods',
      unit: 'Pcs',
      altUnit: 'Pack',
      altUnitConversion: 10,
      openingStock: 150,
      status: 'Active',
      brand: 'Happy Days',
      paperType: 'Sheets',
      gsm: 100
    },
    {
      _id: 'demo-p-5',
      skuCode: 'FG-005',
      name: '300P Hardbound Account Register',
      category: 'Finished Goods',
      unit: 'Pcs',
      altUnit: 'Box',
      altUnitConversion: 6,
      openingStock: 1100,
      status: 'Active',
      brand: 'Classmate',
      paperType: 'Sheets'
    }
  ];

  // Demo Semi Finished Materials (Cut Sheets, Inner Signatures, Folded Book Blocks)
  const DEMO_SEMI_MATERIALS: SkuV2[] = [
    {
      _id: 'demo-sf-1',
      skuCode: 'SEM-001',
      name: 'Ruled Cut Sheets 70 GSM · 32x44 CM',
      category: 'Semi Finished',
      unit: 'Ream',
      altUnit: 'Bundle',
      altUnitConversion: 5,
      openingStock: 0,
      status: 'Active',
      paperType: 'Sheets',
      brand: 'Classmate Paper Mills'
    },
    {
      _id: 'demo-sf-2',
      skuCode: 'SEM-002',
      name: 'Printed Inner Signatures (132P Block)',
      category: 'Semi Finished',
      unit: 'Set',
      altUnit: 'Box',
      altUnitConversion: 20,
      openingStock: 1100,
      status: 'Active',
      paperType: 'Sheets',
      brand: 'Bestfriend Publishing'
    },
    {
      _id: 'demo-sf-3',
      skuCode: 'SEM-003',
      name: 'Folded Book Blocks A4 (192P)',
      category: 'Semi Finished',
      unit: 'Pcs',
      altUnit: 'Crate',
      altUnitConversion: 50,
      openingStock: 450,
      status: 'Active',
      paperType: 'Sheets',
      brand: 'Happy Days'
    }
  ];

  // Demo Raw Materials (Paper Reels, Duplex Board, Stitching Wire, Glue)
  const DEMO_RAW_MATERIALS: SkuV2[] = [
    {
      _id: 'demo-rm-1',
      skuCode: 'RM-001',
      name: 'Maplitho Paper Reel 70 GSM (Kraft Roll)',
      category: 'Raw Material',
      unit: 'Kg',
      altUnit: 'Roll',
      altUnitConversion: 250,
      openingStock: 600,
      status: 'Active',
      paperType: 'Reels',
      gsm: 70,
      brand: 'Classmate Paper Mills'
    },
    {
      _id: 'demo-rm-2',
      skuCode: 'RM-002',
      name: 'Grey Duplex Cover Board 300 GSM',
      category: 'Raw Material',
      unit: 'Pcs',
      altUnit: 'Pallet',
      altUnitConversion: 1000,
      openingStock: 15000,
      status: 'Active',
      paperType: 'Sheets',
      gsm: 300,
      brand: 'Bestfriend Publishing'
    },
    {
      _id: 'demo-rm-3',
      skuCode: 'RM-003',
      name: 'Book Stitching Wire #24',
      category: 'Raw Material',
      unit: 'Kg',
      altUnit: 'Spool',
      altUnitConversion: 15,
      openingStock: 180,
      status: 'Active',
      brand: 'UrbanThread Apparel'
    },
    {
      _id: 'demo-rm-4',
      skuCode: 'RM-004',
      name: 'Hotmelt Binding Adhesive',
      category: 'Raw Material',
      unit: 'Kg',
      altUnit: 'Bag',
      altUnitConversion: 25,
      openingStock: 2200,
      status: 'Active',
      brand: 'Campus Store Co.'
    }
  ];

  // Helper to determine Item Type of SKU
  const getItemType = (item: SkuV2): 'products' | 'materials' | 'semi' => {
    const cat = (item.category || '').toLowerCase();
    const name = (item.name || '').toLowerCase();
    const code = (item.skuCode || '').toUpperCase();
    if (cat.includes('semi') || cat.includes('wip') || cat === 'semi finished' || cat.includes('sub') || code.startsWith('SEM') || code.startsWith('SF') || name.includes('ruled cut') || name.includes('inner signature') || name.includes('book block')) {
      return 'semi';
    }
    if (cat.includes('raw') || cat.includes('material') || cat === 'raw material' || cat.includes('reel') || cat.includes('board') || code.startsWith('RM') || name.includes('reel') || name.includes('wire') || name.includes('adhesive') || name.includes('glue')) {
      return 'materials';
    }
    return 'products';
  };

  // Helper to format SKU Code with exact sequential pattern (FG-001, RM-001, SEM-001)
  const formatSkuCodeWithSeq = (item: SkuV2, prefix: 'FG' | 'RM' | 'SEM', index: number): string => {
    const code = (item.skuCode || '').trim();
    const match = code.match(/^(FG|RM|SEM)-(\d+)$/i);
    if (match && match[1].toUpperCase() === prefix) {
      const num = parseInt(match[2], 10);
      return `${prefix}-${String(num).padStart(3, '0')}`;
    }
    return `${prefix}-${String(index + 1).padStart(3, '0')}`;
  };

  // Products List (Only database finished products)
  const productsList = useMemo(() => {
    const raw = skus.length > 0 ? skus.filter(item => getItemType(item) === 'products') : DEMO_FINISHED_PRODUCTS;
    return raw.map((item, idx) => ({
      ...item,
      skuCode: formatSkuCodeWithSeq(item, 'FG', idx)
    }));
  }, [skus]);

  // Materials List (Only database raw materials)
  const materialsList = useMemo(() => {
    const raw = skus.length > 0 ? skus.filter(item => getItemType(item) === 'materials') : DEMO_RAW_MATERIALS;
    return raw.map((item, idx) => ({
      ...item,
      skuCode: formatSkuCodeWithSeq(item, 'RM', idx)
    }));
  }, [skus]);

  // Semi List (Only database semi-finished materials)
  const semiList = useMemo(() => {
    const raw = skus.length > 0 ? skus.filter(item => getItemType(item) === 'semi') : DEMO_SEMI_MATERIALS;
    return raw.map((item, idx) => ({
      ...item,
      skuCode: formatSkuCodeWithSeq(item, 'SEM', idx)
    }));
  }, [skus]);

  // Combined Raw Materials and Semi-Finished Materials ONLY (excluding Finished Goods) for BOM Recipe selection
  const rawAndSemiMaterials = useMemo(() => {
    const combined = [...materialsList, ...semiList];
    return combined.filter(item => {
      const cat = (item.category || '').trim().toLowerCase();
      const code = (item.skuCode || '').trim().toUpperCase();
      const isFinishedGoods = cat === 'finished goods' || cat === 'products' || cat === 'finished' || code.startsWith('FG-') || code.startsWith('FG');
      return !isFinishedGoods;
    });
  }, [materialsList, semiList]);

  // BOM handlers inside Item Details Modal
  const handleDeleteBomItem = (id: string) => {
    setBomRecipeItems(prev => prev.filter(b => b.id !== id));
    showToast('Recipe ingredient removed', 'info');
  };

  const handleAddBomItem = () => {
    const newIngredient: BomRecipeItem = {
      id: `b-${Date.now()}`,
      name: '',
      qty: '' as any,
      uom: 'Kg',
      inStock: 0,
      notes: ''
    };
    setBomRecipeItems(prev => [...prev, newIngredient]);
    showToast('New ingredient row added to recipe', 'success');
  };

  // Helper to determine if an item can have a BOM recipe (Finished Goods & Semi-Finished Materials)
  const isBomProductItem = (s: SkuV2): boolean => {
    const cat = (s.category || '').trim().toLowerCase();
    const code = (s.skuCode || '').trim().toUpperCase();
    const name = (s.name || '').trim().toLowerCase();

    // Exclude Raw Materials or items starting with RM-
    if (
      cat === 'raw material' ||
      code.startsWith('RM-') ||
      code.startsWith('RM') ||
      name.includes('reel') ||
      name.includes('board') ||
      name.includes('wire') ||
      name.includes('adhesive')
    ) {
      return false;
    }

    return true;
  };

  const bomProductSkus = useMemo(() => {
    return skus.filter(isBomProductItem);
  }, [skus]);

  // Build BOMs memoized helpers & handlers (Placed after materialsList & semiList initialization)
  const productsWithRecipeCount = useMemo(() => {
    return bomProductSkus.filter(s => (s as any).bomItems && (s as any).bomItems.length > 0).length;
  }, [bomProductSkus]);

  const filteredBuildProducts = useMemo(() => {
    const baseList = bomProductSkus.length > 0 ? bomProductSkus : [...productsList, ...semiList];
    return baseList.filter(p => {
      const matchesSearch = (p.name || '').toLowerCase().includes(buildBomsSearch.toLowerCase()) ||
                            (p.skuCode || '').toLowerCase().includes(buildBomsSearch.toLowerCase());
      const hasRecipe = (p as any).bomItems && (p as any).bomItems.length > 0;
      if (onlyNoRecipeFilter && hasRecipe) return false;
      return matchesSearch;
    });
  }, [bomProductSkus, productsList, semiList, buildBomsSearch, onlyNoRecipeFilter]);

  const filteredRawCatalog = useMemo(() => {
    return materialsList.filter(m => (m.name || '').toLowerCase().includes(catalogSearch.toLowerCase()));
  }, [materialsList, catalogSearch]);

  const filteredSemiCatalog = useMemo(() => {
    const list = semiList.length > 0 ? semiList : skus.filter(s => s.category === 'Semi Finished');
    return list.filter(s => (s.name || '').toLowerCase().includes(catalogSearch.toLowerCase()));
  }, [semiList, skus, catalogSearch]);

  useEffect(() => {
    if (showBuildBomsModal && !activeBomProduct && filteredBuildProducts.length > 0) {
      handleSelectBomProduct(filteredBuildProducts[0]);
    }
  }, [showBuildBomsModal, filteredBuildProducts]);

  const handleSelectBomProduct = (prod: SkuV2) => {
    setActiveBomProduct(prod);
    if ((prod as any).bomItems && Array.isArray((prod as any).bomItems)) {
      setActiveRecipeItems((prod as any).bomItems.map((item: any, idx: number) => ({
        id: item.id || `b-${idx}`,
        name: item.name,
        qty: Number(item.qty) || 1,
        uom: item.uom || 'Kg',
        inStock: item.inStock ?? 500,
        notes: item.notes || ''
      })));
    } else {
      setActiveRecipeItems([]);
    }
  };

  const handleSaveBuildBomRecipe = async () => {
    if (!activeBomProduct?._id) return;
    setIsSavingBuildBom(true);
    try {
      await updateSkuV2(activeBomProduct._id, {
        bomItems: activeRecipeItems,
        company: selectedCompany?._id
      });
      showToast(`BOM Recipe saved for ${activeBomProduct.name}!`, 'success');
      loadSkus(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to save BOM recipe', 'error');
    } finally {
      setIsSavingBuildBom(false);
    }
  };

  // Dynamic Product Sub-Counts calculation
  const productCounts = useMemo(() => {
    const diaries = productsList.filter(s => (s.category || '').toLowerCase().includes('diary') || (s.category || '').toLowerCase().includes('register'));
    const notebooks = productsList.filter(s => !diaries.includes(s));

    return {
      all: productsList.length,
      finishedGoods: notebooks.length,
      subAssemblies: diaries.length
    };
  }, [productsList]);

  // Filter SKUs based on active main tab & sub-filter
  const tabFilteredSkus = useMemo(() => {
    if (activeMainTab === 'categories') return [];
    
    if (activeMainTab === 'products') {
      if (selectedProductSubFilter === 'finished-goods') {
        return productsList.filter(s => !(s.category || '').toLowerCase().includes('diary') && !(s.category || '').toLowerCase().includes('register'));
      }

      if (selectedProductSubFilter === 'sub-assemblies') {
        return productsList.filter(s => (s.category || '').toLowerCase().includes('diary') || (s.category || '').toLowerCase().includes('register'));
      }

      return productsList;
    }

    if (activeMainTab === 'materials') {
      return materialsList;
    }

    if (activeMainTab === 'semi') {
      return semiList;
    }

    return skus;
  }, [skus, productsList, materialsList, semiList, activeMainTab, selectedProductSubFilter]);

  // Custom filter and sorting
  const filteredAndSortedSkus = useMemo(() => {
    let list = [...tabFilteredSkus];

    // Apply custom filter rules
    if (filterRules && filterRules.length > 0) {
      list = list.filter(item => {
        return filterRules.every(rule => {
          if (!rule.value || !rule.value.trim()) return true;
          const targetStr = rule.value.toLowerCase().trim();
          let itemVal = (item as any)[rule.field];
          if (rule.field === 'dimensions') itemVal = formatSize(item);
          if (itemVal === undefined || itemVal === null) itemVal = '';
          const valStr = String(itemVal).toLowerCase();

          switch (rule.operator) {
            case 'equals': return valStr === targetStr;
            case 'contains': return valStr.includes(targetStr);
            case 'greater_than': return Number(itemVal) > Number(rule.value);
            case 'less_than': return Number(itemVal) < Number(rule.value);
            default: return valStr.includes(targetStr);
          }
        });
      });
    }

    // Apply sorting
    if (sortRules && sortRules.length > 0) {
      list.sort((a, b) => {
        for (const rule of sortRules) {
          let fieldA = (a as any)[rule.field];
          let fieldB = (b as any)[rule.field];
          if (fieldA === undefined || fieldA === null) fieldA = '';
          if (fieldB === undefined || fieldB === null) fieldB = '';

          if (typeof fieldA === 'number' && typeof fieldB === 'number') {
            if (fieldA !== fieldB) return rule.order === 'asc' ? fieldA - fieldB : fieldB - fieldA;
          } else {
            const strA = String(fieldA).localeCompare(String(fieldB));
            if (strA !== 0) return rule.order === 'asc' ? strA : -strA;
          }
        }
        return 0;
      });
    }

    return list;
  }, [tabFilteredSkus, filterRules, sortRules]);

  // Reset pagination on tab or search change
  useEffect(() => {
    setPage(1);
  }, [activeMainTab, search, categoryFilter, selectedProductSubFilter]);

  // Pagination calculation
  const total = filteredAndSortedSkus.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);
  
  const paginatedSkus = useMemo(() => {
    return filteredAndSortedSkus.slice((page - 1) * limit, page * limit);
  }, [filteredAndSortedSkus, page, limit]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(paginatedSkus.map(s => s._id!).filter(Boolean));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };



  // Activity Log fetcher
  const fetchActivityLogs = async () => {
    try {
      setActivityLogLoading(true);
      const res = await getActivityLogs({
        company: selectedCompany?._id,
        entityType: 'SkuV2',
        limit: 50
      });
      const backendLogs = res.data?.logs || [];
      if (backendLogs.length === 0) {
        const mockLogs = skus.slice(0, 10).map((s, idx) => ({
          _id: `mock-log-${idx}`,
          action: 'CREATE',
          entityType: 'SkuV2',
          entityName: s.skuCode,
          details: `Item '${s.name}' was verified in system inventory.`,
          performedBy: selectedCompany?.companyName || 'Admin',
          createdAt: s.createdAt || new Date().toISOString()
        }));
        setActivityLogs(mockLogs);
      } else {
        setActivityLogs(backendLogs);
      }
    } catch (err) {
      showToast('Failed to fetch activity logs', 'error');
    } finally {
      setActivityLogLoading(false);
    }
  };

  // Export handlers
  const handleExportCSV = () => {
    if (filteredAndSortedSkus.length === 0) {
      showToast('No items available to export', 'error');
      return;
    }
    const exportData = filteredAndSortedSkus.map(s => ({
      'Item Code': s.skuCode,
      'Item Name': s.name,
      'Category': s.category,
      'Primary Unit': s.unit,
      'Alternate Unit': s.altUnit || '—',
      'Conversion Rate': s.altUnitConversion || '—',
      'GSM': s.gsm || '—',
      'Width': s.width || '—',
      'Length': s.length || '—',
      'Opening Stock': s.openingStock || 0,
      'Status': s.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Items');
    XLSX.writeFile(workbook, `Items_Export_${activeMainTab}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Items exported successfully', 'success');
  };

  // Delete Single SKU
  const handleDeleteSku = async () => {
    if (!deleteConfirmSku?._id) return;
    try {
      await deleteSkuV2(deleteConfirmSku._id, selectedCompany?._id || '');
      showToast(`Item '${deleteConfirmSku.skuCode}' deleted`, 'success');
      setDeleteConfirmSku(null);
      loadSkus(false);
      createActivityLog({
        action: 'DELETE',
        entityType: 'SkuV2',
        entityName: deleteConfirmSku.skuCode,
        details: `Deleted item '${deleteConfirmSku.name}'`,
        company: selectedCompany?._id
      }).catch(() => {});
    } catch (e) {
      showToast('Failed to delete item', 'error');
    }
  };

  // Category Card Handlers
  const handleOpenAddCategoryModal = () => {
    setEditingCategory(null);
    setCategoryForm({
      name: '',
      type: activeCategorySubTab,
      uom: 'Pcs',
      fieldsText: 'Pages, Size, Ruling'
    });
    setShowCategoryModal(true);
  };

  const handleOpenEditCategoryModal = (cat: CategoryCardData) => {
    setEditingCategory(cat);
    setCategoryForm({
      name: cat.name,
      type: cat.type,
      uom: cat.uom,
      fieldsText: cat.fields.join(', ')
    });
    setShowCategoryModal(true);
  };

  const handleSaveCategory = () => {
    if (!categoryForm.name.trim()) {
      showToast('Please enter category name', 'error');
      return;
    }
    const fieldsArr = categoryForm.fieldsText
      .split(/[,·]/)
      .map(f => f.trim())
      .filter(Boolean);

    if (editingCategory) {
      setCategoriesData(prev => prev.map(c => c.id === editingCategory.id ? {
        ...c,
        name: categoryForm.name.trim(),
        type: categoryForm.type,
        uom: categoryForm.uom.trim() || 'Pcs',
        fields: fieldsArr.length > 0 ? fieldsArr : ['Type']
      } : c));
      showToast(`Category '${categoryForm.name}' updated`, 'success');
    } else {
      const newCat: CategoryCardData = {
        id: `cat-${Date.now()}`,
        name: categoryForm.name.trim(),
        type: categoryForm.type,
        uom: categoryForm.uom.trim() || 'Pcs',
        fields: fieldsArr.length > 0 ? fieldsArr : ['Type']
      };
      setCategoriesData(prev => [...prev, newCat]);
      showToast(`Category '${categoryForm.name}' created`, 'success');
    }
    setShowCategoryModal(false);
  };

  const handleDeleteCategory = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete category '${name}'?`)) {
      setCategoriesData(prev => prev.filter(c => c.id !== id));
      showToast(`Category '${name}' deleted`, 'success');
    }
  };

  const toggleExpandCategory = (id: string) => {
    setExpandedCategoryIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Get active tab label text
  const getTabLabel = (tab: string) => {
    switch (tab) {
      case 'products': return 'Products';
      case 'materials': return 'Materials';
      case 'semi': return 'Semi';
      case 'categories': return 'Categories';
      default: return 'Items';
    }
  };

  // Default category parameter for Add SKU drawer
  const getDefaultCategoryForDrawer = () => {
    if (activeMainTab === 'products') return 'Finished Goods';
    if (activeMainTab === 'semi') return 'Semi Finished';
    return 'Raw Material';
  };

  return (
    <div className="min-h-screen bg-gray-50/60 p-4 md:p-6 space-y-4 font-sans text-gray-800">
      
      {/* ── CLEAN TOP HEADER ── */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          Item Master
        </h1>
      </div>

      {/* ── 4 MAIN TAB NAVIGATION BAR (Products, Materials, Semi, Categories) ── */}
      <div className="border-b border-gray-200 flex items-center gap-2 pt-2 overflow-x-auto">
        
        {/* Tab 1: Products (All Finished Products) */}
        <button
          onClick={() => setActiveMainTab('products')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-semibold rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
            activeMainTab === 'products'
              ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50/40'
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50'
          }`}
        >
          <BookOpen className={`w-4 h-4 ${activeMainTab === 'products' ? 'text-purple-600' : 'text-gray-400'}`} />
          <span>Products</span>
        </button>

        {/* Tab 2: Materials (All Raw Materials) */}
        <button
          onClick={() => setActiveMainTab('materials')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-semibold rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
            activeMainTab === 'materials'
              ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50/40'
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50'
          }`}
        >
          <Scroll className={`w-4 h-4 ${activeMainTab === 'materials' ? 'text-purple-600' : 'text-gray-400'}`} />
          <span>Materials</span>
        </button>

        {/* Tab 3: Semi (Only Semi Finished Materials) */}
        <button
          onClick={() => setActiveMainTab('semi')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-semibold rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
            activeMainTab === 'semi'
              ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50/40'
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50'
          }`}
        >
          <Copy className={`w-4 h-4 ${activeMainTab === 'semi' ? 'text-purple-600' : 'text-gray-400'}`} />
          <span>Semi</span>
        </button>

        {/* Tab 4: Categories */}
        <button
          onClick={() => setActiveMainTab('categories')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-semibold rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
            activeMainTab === 'categories'
              ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50/40'
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50'
          }`}
        >
          <Folder className={`w-4 h-4 ${activeMainTab === 'categories' ? 'text-purple-600' : 'text-gray-400'}`} />
          <span>Categories</span>
        </button>
      </div>

      {/* ── VIEW CONTENT AREA ── */}
      {activeMainTab !== 'categories' ? (
        
        /* ── GOODS / MATERIALS DATA TABLE VIEW ── */
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs relative">
          
          {/* Header Control Row (Toolbar matching Makoro Image 2 & 3!) */}
          <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 bg-white rounded-t-2xl relative z-30">
            
            {/* Left Counter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-700">
                Items: <span className="text-purple-600 font-bold">{total}</span>
              </span>
            </div>

            {/* Right Toolbar Controls */}
            <div className="flex items-center flex-wrap gap-2.5">

              {/* 0. Column Customizer Popover Tool */}
              <div className="relative" ref={columnCustomizerRef}>
                <button
                  type="button"
                  onClick={() => setShowColumnCustomizer(!showColumnCustomizer)}
                  className={`px-3 py-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-2xs ${
                    showColumnCustomizer ? 'bg-purple-50 text-purple-700 border-purple-300' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                  title="Customize & Rearrange Columns"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600" />
                  <span>Columns ({columnsConfig.filter(c => c.visible).length})</span>
                </button>

                {showColumnCustomizer && (
                  <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-72 bg-white/95 backdrop-blur-md rounded-2xl border border-gray-200 shadow-2xl p-3.5 z-50 animate-in fade-in duration-150 text-left">
                    <div className="flex items-center justify-between pb-2.5 border-b border-gray-100 mb-2.5">
                      <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Customize Columns</h4>
                      <button
                        type="button"
                        onClick={() => {
                          if (activeMainTab === 'materials') setColumnsConfig(DEFAULT_MATERIALS_COLUMNS);
                          else if (activeMainTab === 'semi') setColumnsConfig(DEFAULT_SEMI_COLUMNS);
                          else setColumnsConfig(DEFAULT_PRODUCTS_COLUMNS);
                        }}
                        className="text-[10.5px] font-bold text-purple-600 hover:underline cursor-pointer"
                      >
                        Reset default
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {columnsConfig
                        .filter(col => {
                          if (col.id === 'bom' && activeMainTab !== 'products' && activeMainTab !== 'semi') return false;
                          if (col.id === 'pages' && activeMainTab === 'materials') return false;
                          return true;
                        })
                        .map((col, idx) => (
                        <div
                          key={col.id}
                          draggable={true}
                          onDragStart={(e) => handlePopoverDragStart(e, idx)}
                          onDragOver={handlePopoverDragOver}
                          onDrop={(e) => handlePopoverDrop(e, idx)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold cursor-grab active:cursor-grabbing transition-all select-none ${
                            draggedPopoverColIdx === idx
                              ? 'bg-purple-100/90 border-purple-500 shadow-xl scale-[1.02] opacity-80 ring-2 ring-purple-400 z-10'
                              : 'bg-gray-50/80 border-gray-200/80 hover:bg-purple-50/40 hover:border-purple-300'
                          }`}
                        >
                          <label className="flex items-center gap-2.5 cursor-pointer text-gray-800 font-semibold" onClick={(e) => e.stopPropagation()}>
                            <span className="text-gray-400 font-bold select-none text-xs">⋮⋮</span>
                            <input
                              type="checkbox"
                              checked={col.visible}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setColumnsConfig(prev => prev.map(c => c.id === col.id ? { ...c, visible: checked } : c));
                              }}
                              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="text-[12px]">{col.label}</span>
                          </label>

                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-2xs">
                            Drag
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {/* 1. Filter funnel icon button with Popover matching Images 3 & 4 */}
              <div className="relative" ref={filterDropdownRef}>
                <button
                  onClick={() => setShowFilterPanel(!showFilterPanel)}
                  className={`p-2 rounded-lg border transition-all cursor-pointer ${
                    showFilterPanel || filterRules.length > 0
                      ? 'bg-purple-50 text-purple-700 border-purple-300'
                      : 'bg-white text-purple-600 border-gray-200 hover:bg-purple-50/50'
                  }`}
                  title="Filter options"
                >
                  <Filter className="w-4 h-4 text-purple-600" />
                </button>

                {/* Filter Popover matching Images 3 & 4 */}
                {showFilterPanel && (
                  <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-80 sm:w-96 bg-white/95 backdrop-blur-md rounded-2xl border border-gray-200 shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-left">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-gray-900">Filters</h4>
                        {filterRules.length > 0 && (
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {filterRules.length} active
                          </span>
                        )}
                      </div>
                      {filterRules.length > 0 && (
                        <button
                          onClick={() => setFilterRules([])}
                          className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    {/* Rules list */}
                    {filterRules.length === 0 ? (
                      <div className="border border-dashed border-gray-300 rounded-2xl p-6 text-center">
                        <p className="text-sm font-semibold text-gray-700">No filters applied</p>
                        <p className="text-xs text-gray-400 mt-1">Add a filter to narrow down rows</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                        {filterRules.map((rule) => (
                          <div key={rule.id} className="bg-gray-50/70 border border-gray-200 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">WHERE</span>
                              <button
                                onClick={() => setFilterRules(prev => prev.filter(r => r.id !== rule.id))}
                                className="text-gray-400 hover:text-gray-600 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Field */}
                            <select
                              value={rule.field}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, field: val } : r));
                              }}
                              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 bg-white cursor-pointer"
                            >
                              <option value="name">Name</option>
                              <option value="skuCode">ID / SKU Code</option>
                              <option value="category">Category</option>
                              <option value="unit">UOM</option>
                              <option value="gsm">GSM</option>
                              <option value="openingStock">Stock</option>
                            </select>

                            {/* Operator */}
                            <select
                              value={rule.operator}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, operator: val } : r));
                              }}
                              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 bg-white cursor-pointer"
                            >
                              <option value="contains">Contains</option>
                              <option value="equals">Equals</option>
                              <option value="greater_than">Greater than</option>
                              <option value="less_than">Less than</option>
                            </select>

                            {/* Value */}
                            <input
                              type="text"
                              placeholder="Value"
                              value={rule.value}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, value: val } : r));
                              }}
                              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 bg-white placeholder-gray-400"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add filter button */}
                    <button
                      onClick={() => {
                        setFilterRules(prev => [
                          ...prev,
                          { id: 'filter_' + Date.now(), field: 'name', operator: 'contains', value: '' }
                        ]);
                      }}
                      className="w-full mt-3 py-2.5 border border-dashed border-gray-300 hover:border-purple-300 hover:bg-purple-50/40 rounded-xl text-xs font-semibold text-gray-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add filter</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 2. Interactive Products Sub-Filter Custom Dropdown (ONLY shown in Products tab!) */}
              {activeMainTab === 'products' ? (
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowProductTypeDropdown(!showProductTypeDropdown)}
                    className={`bg-white hover:bg-gray-50 border rounded-xl px-3.5 py-2 text-xs font-semibold text-gray-800 flex items-center gap-2 shadow-2xs transition-all cursor-pointer ${
                      showProductTypeDropdown ? 'border-emerald-600 ring-2 ring-emerald-100' : 'border-gray-200'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-purple-600" />
                    <span>
                      {selectedProductSubFilter === 'all'
                        ? 'All products'
                        : selectedProductSubFilter === 'finished-goods'
                        ? 'Finished Goods'
                        : 'Diaries & Registers'}
                    </span>
                    {showProductTypeDropdown ? (
                      <ChevronUp className="w-3.5 h-3.5 text-purple-600 ml-1" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-1" />
                    )}
                  </button>

                  {/* Dropdown Menu Popup matching Image 1 & 2 */}
                  {showProductTypeDropdown && (
                    <div className="absolute right-0 top-full mt-1.5 w-64 bg-white/95 backdrop-blur-md rounded-2xl border border-gray-100 shadow-xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      {/* Option 1: All products */}
                      <button
                        onClick={() => {
                          setSelectedProductSubFilter('all');
                          setCategoryFilter('');
                          setShowProductTypeDropdown(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          selectedProductSubFilter === 'all'
                            ? 'bg-emerald-50/70 text-purple-700 font-bold'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <BookOpen className="w-4 h-4 text-purple-600" />
                          <span>All products ({productCounts.all})</span>
                        </div>
                        {selectedProductSubFilter === 'all' && (
                          <Check className="w-4 h-4 text-purple-600 font-bold stroke-[3]" />
                        )}
                      </button>

                      {/* Option 2: Finished Goods */}
                      <button
                        onClick={() => {
                          setSelectedProductSubFilter('finished-goods');
                          setShowProductTypeDropdown(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          selectedProductSubFilter === 'finished-goods'
                            ? 'bg-emerald-50/70 text-purple-700 font-bold'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Book className="w-4 h-4 text-purple-600" />
                          <span>Finished Goods ({productCounts.finishedGoods})</span>
                        </div>
                        {selectedProductSubFilter === 'finished-goods' && (
                          <Check className="w-4 h-4 text-purple-600 font-bold stroke-[3]" />
                        )}
                      </button>

                      {/* Option 3: Diaries & Registers */}
                      <button
                        onClick={() => {
                          setSelectedProductSubFilter('sub-assemblies');
                          setShowProductTypeDropdown(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          selectedProductSubFilter === 'sub-assemblies'
                            ? 'bg-emerald-50/70 text-purple-700 font-bold'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Scroll className="w-4 h-4 text-purple-600" />
                          <span>Diaries & Registers ({productCounts.subAssemblies})</span>
                        </div>
                        {selectedProductSubFilter === 'sub-assemblies' && (
                          <Check className="w-4 h-4 text-purple-600 font-bold stroke-[3]" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {/* 3. Help icon button */}
              <button 
                onClick={() => setShowHelpModal(true)}
                className="p-2 text-purple-600 hover:bg-purple-50/50 rounded-lg border border-transparent hover:border-purple-100 transition-all cursor-pointer"
                title="Help & Info"
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              {/* 4. Build BOMs / Bulk Edit BOM button (Replaces Activity Log in Products tab matching Screenshot 1!) */}
              {activeMainTab === 'products' && (
                <button 
                  onClick={() => setShowBuildBomsModal(true)}
                  className="p-2 text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100/90 rounded-xl border border-emerald-200/80 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                  title="Build BOMs / Bulk Edit BOM"
                >
                  <ClipboardList className="w-4 h-4 text-emerald-700 stroke-[2.2]" />
                </button>
              )}

              {/* 5. Share / Export button */}
              <button 
                onClick={handleExportCSV}
                className="p-2 text-purple-600 hover:bg-purple-50/50 rounded-lg border border-transparent hover:border-purple-100 transition-all cursor-pointer"
                title="Export Data"
              >
                <Share2 className="w-4 h-4" />
              </button>

              {/* 6. Global Search Box Input (Replaces dropdown in Materials & Semi modules!) */}
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${getTabLabel(activeMainTab).toLowerCase()}...`}
                  className="pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl w-48 md:w-60 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 shadow-2xs"
                />
                {search && (
                  <button 
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 7. Download icon button */}
              <button
                onClick={handleExportCSV}
                className="p-2 text-purple-600 hover:bg-purple-50/50 rounded-lg border border-transparent hover:border-purple-100 transition-all cursor-pointer"
                title="Download CSV/Excel"
              >
                <Download className="w-4 h-4" />
              </button>

              {/* 8. Plus Circle Button */}
              <button
                onClick={() => { setEditSku(null); setShowAddDrawer(true); }}
                className="w-8 h-8 rounded-full border border-gray-200 bg-white hover:bg-purple-50 text-purple-600 flex items-center justify-center transition-all shadow-2xs cursor-pointer font-bold"
                title={`Add ${getTabLabel(activeMainTab).slice(0, -1)}`}
              >
                <Plus className="w-4 h-4 text-purple-600" />
              </button>

            </div>
          </div>

          {/* Filter Panel Drawer if toggled */}
          {showFilterPanel && (
            <div className="p-4 bg-purple-50/40 border-b border-purple-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-purple-900">Active Filters:</span>
                {categoryFilter && (
                  <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                    Category: {categoryFilter}
                    <X className="w-3 h-3 cursor-pointer" onClick={() => setCategoryFilter('')} />
                  </span>
                )}
                {search && (
                  <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                    Search: "{search}"
                    <X className="w-3 h-3 cursor-pointer" onClick={() => setSearch('')} />
                  </span>
                )}
              </div>
              <button
                onClick={() => { setCategoryFilter(''); setSearch(''); }}
                className="text-purple-700 hover:underline font-semibold cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          )}

          {/* Drag & Drop Column Reordering Bar */}
          {customColumns.length > 0 && (
            <div className="bg-purple-50/50 border-b border-purple-100 px-4 py-2 flex items-center gap-2 overflow-x-auto text-xs">
              <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
                <span>⋮⋮</span> Drag to reorder columns:
              </span>
              {customColumns.map((col, idx) => (
                <div
                  key={col}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, idx)}
                  className={`inline-flex items-center gap-1.5 bg-white border border-purple-200 hover:border-purple-400 px-2.5 py-1 rounded-xl text-xs font-semibold text-purple-900 shadow-2xs cursor-grab active:cursor-grabbing transition-all ${
                    draggedColIdx === idx ? 'opacity-40 ring-2 ring-purple-400' : ''
                  }`}
                >
                  <span className="text-gray-400 font-bold select-none text-[10px]">⋮⋮</span>
                  <span>{col}</span>
                  <button
                    type="button"
                    onClick={() => removeCustomColumn(col)}
                    className="text-gray-400 hover:text-rose-600 font-bold ml-1 text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Table Element with All Requested Columns & Actions */}
          <div className="overflow-x-auto rounded-b-2xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider select-none">
                  <th className="py-3 px-3 w-8 text-center whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={paginatedSkus.length > 0 && selectedIds.length === paginatedSkus.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </th>

                  {/* Dynamic Table Headers matching visibleColumns order */}
                  {visibleColumns.map((col) => (
                    <th
                      key={col.id}
                      className="py-3 px-3 whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}
                  
                  {/* Dynamic Custom Columns */}
                  {customColumns.map((col, idx) => (
                    <th
                      key={col}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, idx)}
                      className={`py-3 px-3 whitespace-nowrap group cursor-grab active:cursor-grabbing hover:bg-purple-50 transition-colors ${
                        draggedColIdx === idx ? 'opacity-40 bg-purple-100/50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400 font-bold select-none text-xs">⋮⋮</span>
                        <span>{col}</span>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all text-xs font-bold text-gray-400">
                          {idx > 0 && (
                            <button
                              onClick={() => moveColumnLeft(idx)}
                              className="hover:text-purple-600 px-0.5 cursor-pointer"
                              title="Move column left"
                            >
                              ‹
                            </button>
                          )}
                          {idx < customColumns.length - 1 && (
                            <button
                              onClick={() => moveColumnRight(idx)}
                              className="hover:text-purple-600 px-0.5 cursor-pointer"
                              title="Move column right"
                            >
                              ›
                            </button>
                          )}
                          <button
                            onClick={() => removeCustomColumn(col)}
                            className="hover:text-rose-600 px-0.5 cursor-pointer"
                            title="Remove column"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}

                  {/* Add Custom Column (+) Header Button */}
                  <th className="py-3 px-2 text-center w-8 whitespace-nowrap">
                    <button
                      onClick={handleAddCustomColumn}
                      className="p-1 rounded-md text-gray-400 hover:text-purple-600 hover:bg-purple-50 font-bold transition-all cursor-pointer"
                      title="Add Custom Column"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </th>

                  {/* ACTIONS Column */}
                  <th className="py-3 px-3 text-right whitespace-nowrap">ACTIONS</th>
                </tr>
              </thead>
              <tbody key={animationKey} className="divide-y divide-gray-100 text-xs text-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={1 + visibleColumns.length + customColumns.length + 2} className="py-12 text-center text-gray-400 whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                        <span>Loading items...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedSkus.length === 0 ? (
                  <tr>
                    <td colSpan={1 + visibleColumns.length + customColumns.length + 2} className="py-12 text-center text-gray-400 whitespace-nowrap">
                      <div className="flex flex-col items-center gap-2">
                        <Package className="w-8 h-8 text-gray-300" />
                        <p className="font-semibold text-gray-600">No {getTabLabel(activeMainTab).toLowerCase()} found</p>
                        <p className="text-[11px]">Click below to create your first item</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedSkus.map((sku, index) => {
                    const isSelected = selectedIds.includes(sku._id!);

                    return (
                      <tr 
                        key={sku._id || index}
                        onClick={() => {
                          setEditSku(sku);
                          setShowAddDrawer(true);
                        }}
                        style={{
                          animation: 'slideDownFade 0.35s ease-out forwards',
                          animationDelay: `${index * 45}ms`
                        }}
                        className={`hover:bg-purple-50/20 transition-all cursor-pointer opacity-0 whitespace-nowrap ${isSelected ? 'bg-purple-50/30' : ''}`}
                      >
                        <td className="py-3 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleSelectAll ? (e.target.checked ? handleSelectRow(sku._id!, true) : handleSelectRow(sku._id!, false)) : null}
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                          />
                        </td>

                        {/* Render cells dynamically based on visibleColumns order */}
                        {visibleColumns.map(c => {
                          switch (c.id) {
                            case 'skuCode':
                              return (
                                <td key="skuCode" className="py-3 px-3 font-mono font-semibold text-gray-700 text-xs whitespace-nowrap">
                                  {sku.skuCode}
                                </td>
                              );
                            case 'name':
                              let itemDomainIcon = '📖';
                              if (activeMainTab === 'materials' || (sku.name || '').toLowerCase().includes('reel') || (sku.name || '').toLowerCase().includes('wire') || (sku.name || '').toLowerCase().includes('adhesive')) {
                                itemDomainIcon = '🗞️';
                              } else if (activeMainTab === 'semi' || (sku.name || '').toLowerCase().includes('sheet') || (sku.name || '').toLowerCase().includes('signature')) {
                                itemDomainIcon = '📑';
                              } else if ((sku.name || '').toLowerCase().includes('diary')) {
                                itemDomainIcon = '📚';
                              }
                              return (
                                <td key="name" className="py-3 px-3 font-medium text-gray-900 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className="text-base">{itemDomainIcon}</span>
                                    <span className="font-semibold text-gray-900">{sku.name}</span>
                                  </div>
                                </td>
                              );
                            case 'category':
                              const categoryText = sku.category || (
                                (sku.skuCode || '').toUpperCase().startsWith('RM') || activeMainTab === 'materials' ? 'Raw Material' :
                                (sku.skuCode || '').toUpperCase().startsWith('SEM') || activeMainTab === 'semi' ? 'Semi Finished' : 'Finished Goods'
                              );
                              return (
                                <td key="category" className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                                  {categoryText}
                                </td>
                              );
                            case 'unit':
                              return (
                                <td key="unit" className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                                  {sku.unit || 'Pcs'}
                                </td>
                              );
                            case 'altUnit':
                              return (
                                <td key="altUnit" className="py-3 px-3 text-gray-500 whitespace-nowrap">
                                  {sku.altUnit ? sku.altUnit : '-'}
                                </td>
                              );
                            case 'altUnitConversion':
                              return (
                                <td key="altUnitConversion" className="py-3 px-3 text-gray-700 font-mono text-[11px] font-semibold whitespace-nowrap">
                                  {sku.altUnit && sku.altUnitConversion ? `1 ${sku.altUnit} = ${sku.altUnitConversion} ${sku.unit || 'Pcs'}` : '-'}
                                </td>
                              );
                            case 'gsm':
                              return (
                                <td key="gsm" className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                                  {sku.gsm ? `${sku.gsm} GSM` : '52 GSM'}
                                </td>
                              );
                            case 'size':
                              return (
                                <td key="size" className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                                  {formatSize(sku)}
                                </td>
                              );
                            case 'pages':
                              const pageMatch = sku.name.match(/(\d+)P/i);
                              const pagesStr = sku.pages ? `${sku.pages} P` : pageMatch ? `${pageMatch[1]} P` : (activeMainTab === 'products' ? '132 P' : '—');
                              return (
                                <td key="pages" className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                                  {pagesStr}
                                </td>
                              );
                            case 'bom':
                              const isBomApplicable = activeMainTab === 'products' || activeMainTab === 'semi' || sku.category === 'Finished Goods' || sku.category === 'Semi Finished' || sku.category === 'Products' || sku.category === 'Semi' || (sku.category || '').toLowerCase().includes('notebook') || (sku.category || '').toLowerCase().includes('diary') || (sku.category || '').toLowerCase().includes('semi');
                              const hasBom = isBomApplicable && Array.isArray((sku as any).bomItems) && (sku as any).bomItems.length > 0;
                              return (
                                <td key="bom" className="py-3 px-3 whitespace-nowrap">
                                  {hasBom ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Defined
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                      Pending
                                    </span>
                                  )}
                                </td>
                              );
                            case 'openingStock':
                              const liveStockQty = Number(sku.presentStock ?? sku.openingStock ?? 0);
                              const minThreshold = Number(sku.minStockLevel || 0);

                              let stockBadge = (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-extrabold bg-emerald-100 text-emerald-800 shadow-2xs">
                                  {liveStockQty.toLocaleString('en-IN')} {sku.unit || 'Pcs'}
                                </span>
                              );
                              if (liveStockQty <= 0) {
                                stockBadge = (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 shadow-2xs">
                                    0 {sku.unit || 'Pcs'}
                                  </span>
                                );
                              } else if (minThreshold > 0 && liveStockQty <= minThreshold) {
                                stockBadge = (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-100 text-amber-800 shadow-2xs">
                                    Low ({liveStockQty.toLocaleString('en-IN')} {sku.unit || 'Pcs'})
                                  </span>
                                );
                              }
                              return (
                                <td key="openingStock" className="py-3 px-3 whitespace-nowrap">
                                  {stockBadge}
                                </td>
                              );
                            case 'workOrders':
                              return (
                                <td key="workOrders" className="py-3 px-3 whitespace-nowrap">
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200">
                                    {getWorkOrderCount(sku)}
                                  </span>
                                </td>
                              );
                            case 'dispatchOrders':
                              return (
                                <td key="dispatchOrders" className="py-3 px-3 whitespace-nowrap">
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold bg-purple-50 text-purple-600 border border-purple-200">
                                    {getDispatchOrderCount(sku)}
                                  </span>
                                </td>
                              );
                            default:
                              return null;
                          }
                        })}

                        {/* Dynamic Custom Column Cells */}
                        {customColumns.map(col => {
                          const colType = customColumnTypes[col] || 'text';
                          const valKey = `${sku._id || index}_${col}`;
                          const cellVal = customColumnValues[valKey];

                          if (col === 'GRADE') {
                            const val = rowGrades[sku._id || index] || (index % 3 === 0 ? 'Option 2' : index % 2 === 0 ? 'Option 3' : 'Option 1');
                            return (
                              <td key={col} className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={val}
                                  onChange={(e) => setRowGrades(prev => ({ ...prev, [sku._id || index]: e.target.value }))}
                                  className="bg-emerald-50/70 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-2.5 py-1 text-xs font-bold text-emerald-800 focus:outline-none cursor-pointer shadow-2xs transition-all"
                                >
                                  <option value="Option 1">Option 1</option>
                                  <option value="Option 2">Option 2</option>
                                  <option value="Option 3">Option 3</option>
                                </select>
                              </td>
                            );
                          }

                          if (colType === 'checkbox') {
                            return (
                              <td key={col} className="py-3 px-3 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={!!cellVal}
                                  onChange={(e) => setCustomColumnValues(prev => ({ ...prev, [valKey]: e.target.checked }))}
                                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                />
                              </td>
                            );
                          }

                          if (colType === 'number') {
                            return (
                              <td key={col} className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="number"
                                  value={cellVal ?? ''}
                                  placeholder="0"
                                  onChange={(e) => setCustomColumnValues(prev => ({ ...prev, [valKey]: e.target.value }))}
                                  className="px-2 py-1 text-xs font-mono font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-purple-400 focus:border-purple-400 w-24"
                                />
                              </td>
                            );
                          }

                          if (colType === 'date') {
                            return (
                              <td key={col} className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="date"
                                  value={cellVal ?? ''}
                                  onChange={(e) => setCustomColumnValues(prev => ({ ...prev, [valKey]: e.target.value }))}
                                  className="px-2 py-1 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-purple-400 focus:border-purple-400"
                                />
                              </td>
                            );
                          }

                          if (colType === 'dropdown') {
                            const options = customColumnOptions[col] || [
                              { label: 'Option 1', color: '#e0f2fe' },
                              { label: 'Option 2', color: '#dcfce7' },
                              { label: 'Option 3', color: '#fef9c3' }
                            ];
                            const activeVal = cellVal || (options[0]?.label || 'Option 1');
                            const activeOpt = options.find(o => o.label === activeVal) || options[0];
                            return (
                              <td key={col} className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={activeVal}
                                  onChange={(e) => setCustomColumnValues(prev => ({ ...prev, [valKey]: e.target.value }))}
                                  style={{ backgroundColor: activeOpt?.color || '#e0f2fe' }}
                                  className="border border-gray-200/80 rounded-xl px-2.5 py-1 text-xs font-bold text-gray-800 focus:outline-none cursor-pointer shadow-2xs transition-all"
                                >
                                  {options.map(opt => (
                                    <option key={opt.label} value={opt.label}>{opt.label}</option>
                                  ))}
                                </select>
                              </td>
                            );
                          }

                          if (colType === 'formula') {
                            const expression = customColumnFormulas[col] || '';
                            const calculatedVal = evaluateFormula(expression, sku);
                            return (
                              <td key={col} className="py-3 px-3 whitespace-nowrap font-mono font-bold text-purple-700 text-xs">
                                {calculatedVal}
                              </td>
                            );
                          }

                          return (
                            <td key={col} className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={cellVal ?? ''}
                                placeholder={`Set ${col.toLowerCase()}...`}
                                onChange={(e) => setCustomColumnValues(prev => ({ ...prev, [valKey]: e.target.value }))}
                                className="px-2.5 py-1 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-purple-400 focus:border-purple-400 w-28"
                              />
                            </td>
                          );
                        })}

                        {/* (+) Column Cell */}
                        <td className="py-3 px-2 text-center text-gray-300">
                          +
                        </td>

                        {/* ACTIONS Column (Edit & Trash icons) */}
                        <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit Icon */}
                            <button
                              onClick={() => {
                                setEditSku(sku);
                                setShowAddDrawer(true);
                              }}
                              className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-all cursor-pointer font-bold"
                              title="Edit item"
                            >
                              <Edit className="w-4 h-4 text-purple-600" />
                            </button>

                            {/* Trash Delete Icon */}
                            <button
                              onClick={() => setDeleteConfirmSku(sku)}
                              className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                              title="Delete item"
                            >
                              <Trash2 className="w-4 h-4 text-rose-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer: Add item button slot */}
          <div className="p-4 border-t border-gray-100 bg-gray-50/40">
            <button
              onClick={() => { setEditSku(null); setShowAddDrawer(true); }}
              className="px-4 py-2 border border-purple-300 text-purple-600 hover:bg-purple-50 bg-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add {activeMainTab === 'products' ? 'product' : activeMainTab === 'materials' ? 'raw material' : 'semi finished material'}</span>
            </button>
          </div>

        </div>

      ) : (

        /* ── CATEGORIES TAB VIEW ── */
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-5 space-y-5">
          
          {/* Header Count & Actions Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              {activeCategorySubTab === 'products' ? 'Product Categories:' : activeCategorySubTab === 'materials' ? 'Material Categories:' : 'Semi Categories:'} 
              <span className="text-purple-600 font-bold ml-1">
                {categoriesData.filter(c => c.type === activeCategorySubTab).length}
              </span>
            </h2>

            <div className="flex items-center gap-2">
              <button 
                onClick={handleOpenAddCategoryModal}
                className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full transition-all shadow-sm cursor-pointer"
                title="Add Category"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Item Categories Sub-header & Subtabs */}
          <div className="space-y-3">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
              ITEM CATEGORIES
            </span>

            {/* Subtabs Segmented Buttons */}
            <div className="bg-gray-100/80 p-1 rounded-xl inline-flex gap-1 border border-gray-200 overflow-x-auto">
              <button
                onClick={() => setActiveCategorySubTab('products')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeCategorySubTab === 'products'
                    ? 'bg-white text-purple-700 shadow-2xs font-bold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Products
              </button>

              <button
                onClick={() => setActiveCategorySubTab('materials')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeCategorySubTab === 'materials'
                    ? 'bg-white text-purple-700 shadow-2xs font-bold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Materials
              </button>

              <button
                onClick={() => setActiveCategorySubTab('semi')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeCategorySubTab === 'semi'
                    ? 'bg-white text-purple-700 shadow-2xs font-bold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Semi
              </button>
            </div>
          </div>

          {/* Select all bar */}
          <div className="bg-gray-50 border border-gray-200/80 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs font-semibold text-gray-600">
            <input type="checkbox" className="rounded border-gray-300 text-purple-600" />
            <span>Select all</span>
          </div>

          {/* Category Cards List */}
          <div className="space-y-3">
            {categoriesData.filter(c => c.type === activeCategorySubTab).map(cat => {
              const isExpanded = expandedCategoryIds.includes(cat.id);
              const linkedItemsCount = skus.filter(s => s.category?.toLowerCase() === cat.name.toLowerCase()).length || 1;

              return (
                <div 
                  key={cat.id}
                  className="bg-white border border-gray-200 hover:border-purple-300 rounded-2xl p-4 shadow-2xs transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    
                    {/* Left Details */}
                    <div className="flex items-center gap-3">
                      <input type="checkbox" className="rounded border-gray-300 text-purple-600" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-sm">{cat.name}</span>
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                            <Paperclip className="w-3 h-3" />
                            {cat.uom}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 font-normal mt-0.5">
                          {cat.fields.join(' · ')}
                        </p>
                      </div>
                    </div>

                    {/* Right Metadata & Action Buttons */}
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-400 font-medium hidden sm:inline-block">
                        {cat.fields.length} {cat.fields.length === 1 ? 'field' : 'fields'}
                      </span>

                      {/* Linked Items Green Pill Badge */}
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-lg shadow-2xs">
                        {linkedItemsCount} {cat.type === 'products' ? 'product' : 'material'}{linkedItemsCount > 1 ? 's' : ''}
                      </span>

                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => handleOpenEditCategoryModal(cat)}
                          className="p-1.5 text-gray-400 hover:text-purple-600 rounded-lg hover:bg-purple-50 transition-all cursor-pointer"
                          title="Edit category"
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        <button 
                          onClick={() => handleDeleteCategory(cat.id, cat.name)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                          title="Delete category"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <button 
                          onClick={() => toggleExpandCategory(cat.id)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-all cursor-pointer"
                          title="Expand details"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="pt-3 border-t border-gray-100 text-xs text-gray-600 space-y-2 animate-fade-in bg-gray-50/50 p-3 rounded-xl">
                      <p className="font-semibold text-gray-800">Fields / Variant Attributes:</p>
                      <div className="flex flex-wrap gap-2">
                        {cat.fields.map(field => (
                          <span key={field} className="bg-white border border-gray-200 px-2.5 py-1 rounded-md text-gray-700 font-medium">
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>

          {/* Bottom Dashed Add Category Dropzone */}
          <div
            onClick={handleOpenAddCategoryModal}
            className="border-2 border-dashed border-gray-200 hover:border-purple-400 rounded-2xl p-4 text-center text-purple-600 font-semibold text-xs hover:bg-purple-50/40 cursor-pointer transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add {activeCategorySubTab === 'products' ? 'product' : activeCategorySubTab === 'materials' ? 'material' : 'semi'} category</span>
          </div>

        </div>

      )}

      {/* ── PAGINATION FOOTER ── */}
      {activeMainTab !== 'categories' && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 py-2">
          
          <div>
            Showing <strong className="text-gray-900">{startItem}–{endItem}</strong> of <strong className="text-gray-900">{total}</strong> items
          </div>

          <div className="flex items-center gap-4">
            
            {/* Rows Per Page */}
            <div className="flex items-center gap-2">
              <span>Rows</span>
              <select
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 focus:outline-none shadow-2xs cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Page Box */}
            <div className="flex items-center gap-1.5">
              <span>Page</span>
              <span className="font-bold text-gray-900 bg-white border border-gray-200 rounded-md px-2 py-1 shadow-2xs">
                {page}
              </span>
              <span>of {totalPages}</span>
            </div>

            {/* Navigation Arrows */}
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(1)}
                className="p-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
              >
                &laquo;
              </button>
              <button
                disabled={page <= 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                className="p-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
              >
                &lsaquo;
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                className="p-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
              >
                &rsaquo;
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                className="p-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
              >
                &raquo;
              </button>
            </div>

          </div>

        </div>
      )}

      {/* ── ADD / EDIT CATEGORY MODAL ── */}
      {showCategoryModal && (
        <Modal
          isOpen={showCategoryModal}
          onClose={() => setShowCategoryModal(false)}
          title={editingCategory ? 'Edit Category' : 'Add New Category'}
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Category Name</label>
              <input
                type="text"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Notebooks, Paper Reels"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Item Group Type</label>
                <select
                  value={categoryForm.type}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500"
                >
                  <option value="products">Products</option>
                  <option value="materials">Materials</option>
                  <option value="semi">Semi</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Default UOM</label>
                <input
                  type="text"
                  value={categoryForm.uom}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, uom: e.target.value }))}
                  placeholder="e.g. Pcs, Kg, Ream"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">Field Attributes (comma separated)</label>
              <input
                type="text"
                value={categoryForm.fieldsText}
                onChange={(e) => setCategoryForm(prev => ({ ...prev, fieldsText: e.target.value }))}
                placeholder="Pages, Size, GSM, Ruling"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-100 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCategory}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold shadow-xs"
              >
                Save Category
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── ADD / EDIT SKU MODAL ── */}
      <AddSkuDrawerV2
        isOpen={showAddDrawer}
        companyId={selectedCompany?._id || ''}
        editSku={editSku}
        defaultCategory={getDefaultCategoryForDrawer()}
        activeSection={activeMainTab === 'products' ? 'products' : activeMainTab === 'semi' ? 'semi' : 'materials'}
        existingProductsCount={productsList.length}
        existingMaterialsCount={materialsList.length}
        existingSemiCount={semiList.length}
        onClose={() => setShowAddDrawer(false)}
        onSaveSuccess={() => {
          setShowAddDrawer(false);
          loadSkus(false);
        }}
        customColumns={customColumns}
        customColumnTypes={customColumnTypes}
        customColumnValues={customColumnValues}
        setCustomColumnValues={setCustomColumnValues}
        customColumnOptions={customColumnOptions}
      />

      {/* ── DELETE CONFIRMATION MODAL ── */}
      {deleteConfirmSku && (
        <Modal
          isOpen={!!deleteConfirmSku}
          onClose={() => setDeleteConfirmSku(null)}
          title="Confirm Delete"
        >
          <div className="space-y-4 text-xs">
            <p>
              Are you sure you want to delete item <strong className="text-gray-900">{deleteConfirmSku.skuCode}</strong> ({deleteConfirmSku.name})?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmSku(null)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-gray-600 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSku}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 shadow-xs"
              >
                Delete Item
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── ITEM DETAILS & RECIPE BOM MODAL ── */}
      {selectedSkuDetails && (
        <Modal
          isOpen={!!selectedSkuDetails}
          onClose={() => setSelectedSkuDetails(null)}
          size="max-w-4xl"
          title={
            <div className="flex items-center justify-between w-full pr-6 text-left">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
                  <Book className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 text-base">{selectedSkuDetails.name}</span>
                    <span className="font-mono text-xs text-gray-400">{selectedSkuDetails.skuCode}</span>
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {selectedSkuDetails.category || (
                        (selectedSkuDetails.skuCode || '').toUpperCase().startsWith('RM') ? 'Raw Material' :
                        (selectedSkuDetails.skuCode || '').toUpperCase().startsWith('SEM') ? 'Semi Finished' : 'Finished Goods'
                      )}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const itemToEdit = selectedSkuDetails;
                  setSelectedSkuDetails(null);
                  setEditSku(itemToEdit);
                  setShowAddDrawer(true);
                }}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Edit Full Item</span>
              </button>
            </div>
          }
        >
          <div className="space-y-5 text-xs text-left max-h-[75vh] overflow-y-auto pr-1">
            
            {/* Modal Subtabs */}
            <div className="border-b border-gray-200 flex items-center gap-6 text-xs font-semibold text-gray-500">
              <button
                onClick={() => setDetailsSubTab('details')}
                className={`pb-2 transition-all cursor-pointer ${detailsSubTab === 'details' ? 'text-purple-700 border-b-2 border-purple-600 font-bold' : 'hover:text-gray-800'}`}
              >
                Details
              </button>
              <button
                onClick={() => setDetailsSubTab('work-orders')}
                className={`pb-2 transition-all cursor-pointer flex items-center gap-1.5 ${detailsSubTab === 'work-orders' ? 'text-purple-700 border-b-2 border-purple-600 font-bold' : 'hover:text-gray-800'}`}
              >
                <span>Work Orders</span>
                <span className="bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                  {getWorkOrderCount(selectedSkuDetails)}
                </span>
              </button>
              <button
                onClick={() => setDetailsSubTab('dispatches')}
                className={`pb-2 transition-all cursor-pointer flex items-center gap-1.5 ${detailsSubTab === 'dispatches' ? 'text-purple-700 border-b-2 border-purple-600 font-bold' : 'hover:text-gray-800'}`}
              >
                <span>Dispatches</span>
                <span className="bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                  {getDispatchOrderCount(selectedSkuDetails)}
                </span>
              </button>
              <button
                onClick={() => setDetailsSubTab('rough-calc')}
                className={`pb-2 transition-all cursor-pointer ${detailsSubTab === 'rough-calc' ? 'text-purple-700 border-b-2 border-purple-600 font-bold' : 'hover:text-gray-800'}`}
              >
                Rough Calculations
              </button>
            </div>

            {/* TAB CONTENT: Details */}
            {detailsSubTab === 'details' && (
              <div className="space-y-6">

                {/* Read-Only Warehouse Storage Location */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-gray-700 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-purple-600" />
                      <span>Warehouse Storage Location</span>
                    </div>
                    <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-gray-400" />
                      Read-Only
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={modalDynamicLocation || 'Unassigned (No warehouse stock entry)'}
                      className="w-full pl-3 pr-24 py-2 bg-gray-50/80 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 font-mono cursor-not-allowed select-none"
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      <span className="text-[9.5px] font-bold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
                        System Tracked
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* 1. Item Attributes */}
                <div className="space-y-3">
                  <h3 className="font-bold text-gray-900 text-xs">Item Attributes</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Paper Grade & GSM</label>
                      <input
                        type="text"
                        value={itemAttributes.fabricGsm}
                        onChange={(e) => setItemAttributes(prev => ({ ...prev, fabricGsm: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Trimmed Size</label>
                      <input
                        type="text"
                        value={itemAttributes.size}
                        onChange={(e) => setItemAttributes(prev => ({ ...prev, size: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Ruling & Printing Spec</label>
                      <input
                        type="text"
                        value={itemAttributes.color}
                        onChange={(e) => setItemAttributes(prev => ({ ...prev, color: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={async () => {
                        if (!selectedSkuDetails?._id) return;
                        try {
                          await updateSkuV2(selectedSkuDetails._id, {
                            ruleType: itemAttributes.color,
                            company: selectedCompany?._id
                          });
                          setSelectedSkuDetails(prev => prev ? { ...prev, ruleType: itemAttributes.color } : null);
                          showToast('Item Attributes updated successfully!', 'success');
                          loadSkus(false);
                        } catch (err: any) {
                          showToast(err.message || 'Failed to update attributes', 'error');
                        }
                      }}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-xs shadow-2xs cursor-pointer"
                    >
                      Save Attributes
                    </button>
                    <button
                      onClick={() => {
                        if (selectedSkuDetails) {
                          const pType = selectedSkuDetails.paperType && selectedSkuDetails.paperType !== 'None' ? selectedSkuDetails.paperType : '';
                          const gsmStr = selectedSkuDetails.gsm ? `${selectedSkuDetails.gsm} GSM` : '';
                          setItemAttributes({
                            fabricGsm: [pType, gsmStr].filter(Boolean).join(' ') || 'Standard Paper',
                            size: formatSize(selectedSkuDetails),
                            color: selectedSkuDetails.ruleType || 'Single Line Ruled'
                          });
                        }
                      }}
                      className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl font-semibold text-xs shadow-2xs cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* 2. Stock Levels */}
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <h3 className="font-bold text-gray-900 text-xs">Stock Levels</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                        <span>Min Stock Level</span>
                      </label>
                      <input
                        type="text"
                        value={stockLevels.minLevel}
                        onChange={(e) => setStockLevels(prev => ({ ...prev, minLevel: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">Alert when stock falls at or below this level</p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                        <span>Reorder Level</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 20"
                        value={stockLevels.reorderLevel}
                        onChange={(e) => setStockLevels(prev => ({ ...prev, reorderLevel: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">Reorder when stock reaches this level</p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!selectedSkuDetails?._id) return;
                      try {
                        await updateSkuV2(selectedSkuDetails._id, {
                          minStockLevel: Number(stockLevels.minLevel) || 0,
                          reorderLevel: Number(stockLevels.reorderLevel) || 0,
                          company: selectedCompany?._id
                        });
                        setSelectedSkuDetails(prev => prev ? {
                          ...prev,
                          minStockLevel: Number(stockLevels.minLevel) || 0,
                          reorderLevel: Number(stockLevels.reorderLevel) || 0
                        } : null);
                        showToast('Stock levels saved successfully!', 'success');
                        loadSkus(false);
                      } catch (err: any) {
                        showToast(err.message || 'Failed to save stock levels', 'error');
                      }
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-xs shadow-2xs cursor-pointer mt-1"
                  >
                    Save levels
                  </button>
                </div>

                {/* 3. Bill of Materials (BOM) - Shown for Finished Goods & Semi-Finished Materials! */}
                {(selectedSkuDetails?.category === 'Finished Goods' || selectedSkuDetails?.category === 'Semi Finished' || selectedSkuDetails?.category === 'Products' || selectedSkuDetails?.category === 'Semi' || (selectedSkuDetails?.category || '').toLowerCase().includes('notebook') || (selectedSkuDetails?.category || '').toLowerCase().includes('diary') || (selectedSkuDetails?.category || '').toLowerCase().includes('semi')) && (
                  <div className="space-y-3 border-t border-gray-100 pt-4">
                    {/* Yellow Notice Banner */}
                    <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-3 flex items-center justify-between text-xs font-semibold text-amber-900 shadow-2xs">
                      <span>Bill of Materials — quantities for one batch of this product.</span>
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-0.5 rounded-full text-xs font-semibold">
                        ✓ {bomRecipeItems.length} items set
                      </span>
                    </div>

                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-2">
                        <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                          <ClipboardList className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-xs">Bill of Materials (Paper & Covers)</h4>
                          <p className="text-[11px] text-gray-400">Enter paper reel consumption and cover board quantities per batch.</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button 
                          onClick={handleAddBomItem}
                          className="px-3 py-1.5 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold rounded-lg text-xs shadow-2xs flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Material
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                      <span>This recipe makes</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={recipeYieldQty}
                        onChange={(e) => setRecipeYieldQty(e.target.value)}
                        className="w-16 px-2 py-0.5 border border-purple-300 rounded-md text-xs font-extrabold text-purple-700 text-center focus:ring-2 focus:ring-purple-500 bg-purple-50/60"
                      />
                      <span className="font-bold text-gray-700">{selectedSkuDetails?.unit || 'Pcs'}</span>
                      <span className="italic text-gray-400">(use 1 for per-unit quantities)</span>
                    </div>

                    {/* Recipe Items Table */}
                    <div className="border border-gray-200 rounded-xl shadow-2xs relative">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px]">
                          <tr>
                            <th className="py-2.5 px-3">Item</th>
                            <th className="py-2.5 px-3">Qty</th>
                            <th className="py-2.5 px-3">UoM</th>
                            <th className="py-2.5 px-3">In Stock</th>
                            <th className="py-2.5 px-3">Notes</th>
                            <th className="py-2.5 px-3 text-right"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-800">
                          {bomRecipeItems.map((b) => (
                            <tr key={b.id}>
                              <td className="py-2 px-3">
                                <SearchableMaterialDropdown
                                  value={b.name}
                                  materials={rawAndSemiMaterials}
                                  onChange={(selectedName, matchedSku) => {
                                    setBomRecipeItems(prev => prev.map(item => {
                                      if (item.id === b.id) {
                                        return {
                                          ...item,
                                          name: selectedName,
                                          uom: matchedSku?.unit || item.uom || 'Kg',
                                          inStock: (matchedSku as any)?.openingStock ?? item.inStock ?? 0
                                        };
                                      }
                                      return item;
                                    }));
                                  }}
                                />
                              </td>
                              <td className="py-2 px-3 w-24">
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="Qty"
                                  value={b.qty === 0 || b.qty === undefined ? '' : b.qty}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setBomRecipeItems(prev => prev.map(item => item.id === b.id ? { ...item, qty: val === '' ? ('' as any) : Number(val) } : item));
                                  }}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold text-center focus:outline-none focus:border-purple-500"
                                />
                              </td>
                              <td className="py-2 px-3 text-gray-500 font-medium">{b.uom}</td>
                              <td className="py-2 px-3 text-gray-500 font-mono">{b.inStock}</td>
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  placeholder="Optional"
                                  value={b.notes || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setBomRecipeItems(prev => prev.map(item => item.id === b.id ? { ...item, notes: val } : item));
                                  }}
                                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-600 focus:outline-none focus:border-purple-500"
                                />
                              </td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  onClick={() => handleDeleteBomItem(b.id)}
                                  className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                                  title="Remove ingredient"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="p-2.5 bg-gray-50 border-t border-gray-100 text-gray-500 font-semibold text-[11px] flex items-center justify-between">
                        <span>Items: {bomRecipeItems.length} materials</span>
                        <button
                          onClick={handleSaveBomRecipe}
                          disabled={isSavingBom}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isSavingBom ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          <span>Save BOM Recipe</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Process Steps */}
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                        <SlidersHorizontal className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-xs">Book Manufacturing Process Steps</h4>
                        <p className="text-[11px] text-gray-400">Reel Slitting &rarr; Paper Ruling &rarr; Folding &rarr; Wire Stitching &rarr; Cover Lamination &rarr; Trimming</p>
                      </div>
                    </div>

                    <button 
                      onClick={() => showToast('Process step added', 'success')}
                      className="px-3 py-1.5 border border-purple-300 text-purple-600 bg-white hover:bg-purple-50 rounded-lg font-semibold text-xs shadow-2xs flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Step
                    </button>
                  </div>

                  <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-xs font-medium bg-gray-50/50">
                    No custom steps yet — click "Add Step" to define book production routing
                  </div>
                </div>

                {/* 5. Custom Fields (Rendered dynamically ONLY if custom columns exist!) */}
                {customColumns.length > 0 && (
                  <div className="space-y-3 border-t border-gray-100 pt-4">
                    <h4 className="font-bold text-gray-900 text-xs">Custom Fields</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {customColumns.map((col) => {
                        const colType = customColumnTypes[col] || 'text';
                        const valKey = `${selectedSkuDetails._id || 0}_${col}`;
                        const cellVal = customColumnValues[valKey];

                        if (colType === 'checkbox') {
                          return (
                            <div key={col} className="flex items-center gap-2 pt-2">
                              <input
                                type="checkbox"
                                checked={!!cellVal}
                                onChange={(e) => setCustomColumnValues(prev => ({ ...prev, [valKey]: e.target.checked }))}
                                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                              />
                              <label className="text-xs font-semibold text-gray-700">{col}</label>
                            </div>
                          );
                        }

                        if (colType === 'dropdown') {
                          const options = customColumnOptions[col] || [
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
                                onChange={(e) => setCustomColumnValues(prev => ({ ...prev, [valKey]: e.target.value }))}
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

                        if (colType === 'formula') {
                          const expression = customColumnFormulas[col] || '';
                          const calculatedVal = evaluateFormula(expression, selectedSkuDetails);
                          return (
                            <div key={col}>
                              <label className="block text-[11px] font-semibold text-gray-600 mb-1">{col.toLowerCase()}</label>
                              <div className="w-full bg-purple-50/50 border border-purple-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-purple-700">
                                {calculatedVal}
                              </div>
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
                              onChange={(e) => setCustomColumnValues(prev => ({ ...prev, [valKey]: e.target.value }))}
                              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-800 focus:outline-none focus:border-purple-500 shadow-2xs"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* TAB CONTENT: Work Orders */}
            {detailsSubTab === 'work-orders' && (
              <div className="py-6 text-center text-gray-400 space-y-2">
                <ClipboardList className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="font-semibold text-gray-700 text-xs">Active Production Work Orders for {selectedSkuDetails.skuCode}</p>
                <p className="text-[11px]">3 active book printing & binding orders on factory floor.</p>
              </div>
            )}

            {/* TAB CONTENT: Dispatches */}
            {detailsSubTab === 'dispatches' && (
              <div className="py-6 text-center text-gray-400 space-y-2">
                <Book className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="font-semibold text-gray-700 text-xs">Fulfillment & Dispatches</p>
                <p className="text-[11px]">3 pending delivery challans to distributors.</p>
              </div>
            )}

            {/* TAB CONTENT: Rough Calculations */}
            {detailsSubTab === 'rough-calc' && (
              <div className="py-6 text-center text-gray-400 space-y-2">
                <SlidersHorizontal className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="font-semibold text-gray-700 text-xs">Paper Yield & Unit Cost Estimator</p>
                <p className="text-[11px]">Calculated paper reel cost: ₹18.20 per notebook unit.</p>
              </div>
            )}

          </div>
        </Modal>
      )}

      {/* ── ACTIVITY LOG POPUP MODAL ── */}
      {showActivityLog && (
        <Modal
          isOpen={showActivityLog}
          onClose={() => setShowActivityLog(false)}
          title="Items Activity History Log"
        >
          <div className="space-y-3 text-xs max-h-[60vh] overflow-y-auto pr-1">
            {activityLogLoading ? (
              <p className="text-center py-6 text-gray-400">Loading activity history...</p>
            ) : activityLogs.length === 0 ? (
              <p className="text-center py-6 text-gray-400">No activity logs found.</p>
            ) : (
              activityLogs.map((log, idx) => (
                <div key={log._id || idx} className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-700">{log.action}</span>
                    <span className="text-[10px] text-gray-400">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-gray-800 font-medium">{log.entityName}</p>
                  <p className="text-gray-500 text-[11px]">{log.details}</p>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {/* ── HELP / GUIDE MODAL ── */}
      {showHelpModal && (
        <Modal
          isOpen={showHelpModal}
          onClose={() => setShowHelpModal(false)}
          title="Book Manufacturing Items Module Overview"
        >
          <div className="space-y-3 text-xs text-gray-700">
            <p>
              Welcome to the <strong>Book Manufacturing Items Module</strong>:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Products:</strong> Finished notebooks, diaries, longbooks, registers.</li>
              <li><strong>Materials:</strong> Paper reels, kraft rolls, duplex board, stitching wire.</li>
              <li><strong>Semi:</strong> Ruled cut sheets, inner signatures, folded book blocks.</li>
              <li><strong>Categories:</strong> Category structures and default UOM specifications.</li>
            </ul>
            <div className="pt-3 flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 bg-purple-600 text-white rounded-xl font-semibold"
              >
                Got it
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── ADD CUSTOM COLUMN MODAL (Exact match to user screenshot!) ── */}
      {showAddCustomColumnModal && (
        <Modal
          isOpen={showAddCustomColumnModal}
          onClose={() => setShowAddCustomColumnModal(false)}
          size="max-w-md"
          title={
            <div className="flex items-center justify-between text-left w-full">
              <h3 className="text-base font-bold text-gray-900">Add Custom Column</h3>
            </div>
          }
        >
          <div className="space-y-5 text-left text-xs">
            {/* Field 1: Column Name */}
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                COLUMN NAME
              </label>
              <input
                type="text"
                placeholder="e.g. Remarks, Priority, Tracking URL"
                value={newCustomColName}
                onChange={(e) => setNewCustomColName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                autoFocus
              />
            </div>

            {/* Field 2: Field Type Cards Grid */}
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                FIELD TYPE
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {/* Card 1: Text */}
                <button
                  type="button"
                  onClick={() => setSelectedFieldType('text')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative ${
                    selectedFieldType === 'text'
                      ? 'bg-emerald-50/50 border-emerald-600 ring-1 ring-emerald-600'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {selectedFieldType === 'text' && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-600"></span>
                  )}
                  <span className="block font-bold text-gray-900 text-xs">Text</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5 font-medium">Short or long text</span>
                </button>

                {/* Card 2: Number */}
                <button
                  type="button"
                  onClick={() => setSelectedFieldType('number')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative ${
                    selectedFieldType === 'number'
                      ? 'bg-emerald-50/50 border-emerald-600 ring-1 ring-emerald-600'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {selectedFieldType === 'number' && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-600"></span>
                  )}
                  <span className="block font-bold text-gray-900 text-xs">Number</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5 font-medium">Numeric value</span>
                </button>

                {/* Card 3: Date */}
                <button
                  type="button"
                  onClick={() => setSelectedFieldType('date')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative ${
                    selectedFieldType === 'date'
                      ? 'bg-emerald-50/50 border-emerald-600 ring-1 ring-emerald-600'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {selectedFieldType === 'date' && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-600"></span>
                  )}
                  <span className="block font-bold text-gray-900 text-xs">Date</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5 font-medium">Date picker</span>
                </button>

                {/* Card 4: Checkbox */}
                <button
                  type="button"
                  onClick={() => setSelectedFieldType('checkbox')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative ${
                    selectedFieldType === 'checkbox'
                      ? 'bg-emerald-50/50 border-emerald-600 ring-1 ring-emerald-600'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {selectedFieldType === 'checkbox' && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-600"></span>
                  )}
                  <span className="block font-bold text-gray-900 text-xs">Checkbox</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5 font-medium">Yes / No toggle</span>
                </button>

                {/* Card 5: Dropdown */}
                <button
                  type="button"
                  onClick={() => setSelectedFieldType('dropdown')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative ${
                    selectedFieldType === 'dropdown'
                      ? 'bg-emerald-50/50 border-emerald-600 ring-1 ring-emerald-600'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {selectedFieldType === 'dropdown' && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-600"></span>
                  )}
                  <span className="block font-bold text-gray-900 text-xs">Dropdown</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5 font-medium">Single-select options</span>
                </button>

                {/* Card 6: File / Link */}
                <button
                  type="button"
                  onClick={() => setSelectedFieldType('file')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative ${
                    selectedFieldType === 'file'
                      ? 'bg-emerald-50/50 border-emerald-600 ring-1 ring-emerald-600'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {selectedFieldType === 'file' && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-600"></span>
                  )}
                  <span className="block font-bold text-gray-900 text-xs">File / Link</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5 font-medium">URL or file link</span>
                </button>

                {/* Card 7: Formula */}
                <button
                  type="button"
                  onClick={() => setSelectedFieldType('formula')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative col-span-1 ${
                    selectedFieldType === 'formula'
                      ? 'bg-emerald-50/50 border-emerald-600 ring-1 ring-emerald-600'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {selectedFieldType === 'formula' && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-600"></span>
                  )}
                  <span className="block font-bold text-gray-900 text-xs">Formula</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5 font-medium">Computed expression</span>
                </button>
              </div>
            </div>

            {/* DROPDOWN OPTIONS Section (when selectedFieldType === 'dropdown', matching Screenshot 1!) */}
            {selectedFieldType === 'dropdown' && (
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    DROPDOWN OPTIONS
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const nextNum = dropdownOptionsList.length + 1;
                      const colors = ['#e0f2fe', '#dcfce7', '#fef9c3', '#ffe4e6', '#f3e8ff', '#f3f4f6'];
                      const color = colors[(nextNum - 1) % colors.length];
                      setDropdownOptionsList(prev => [
                        ...prev,
                        { id: 'opt_' + Date.now(), label: `Option ${nextNum}`, color }
                      ]);
                    }}
                    className="text-[11px] font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer"
                  >
                    + ADD OPTION
                  </button>
                </div>

                <div className="space-y-2">
                  {dropdownOptionsList.map((opt) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <span className="text-gray-300 select-none font-bold text-xs cursor-grab">⋮⋮</span>
                      <input
                        type="text"
                        value={opt.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDropdownOptionsList(prev => prev.map(o => o.id === opt.id ? { ...o, label: val } : o));
                        }}
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:ring-1 focus:ring-purple-400 bg-white"
                        placeholder="Option name"
                      />

                      {/* Pill Color Pickers */}
                      <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-full border border-gray-200">
                        {['#f3f4f6', '#e0f2fe', '#dcfce7', '#fef9c3', '#ffe4e6', '#f3e8ff'].map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              setDropdownOptionsList(prev => prev.map(o => o.id === opt.id ? { ...o, color: c } : o));
                            }}
                            style={{ backgroundColor: c }}
                            className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer border border-gray-300/40 ${
                              opt.color === c ? 'scale-125 ring-2 ring-purple-500' : 'hover:scale-110'
                            }`}
                          />
                        ))}
                      </div>

                      {dropdownOptionsList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDropdownOptionsList(prev => prev.filter(o => o.id !== opt.id))}
                          className="p-1 text-gray-400 hover:text-rose-500 transition-colors cursor-pointer text-xs font-bold"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 italic">Options will appear in this order in the dropdown.</p>
              </div>
            )}

            {/* FORMULA EXPRESSION Section (when selectedFieldType === 'formula', matching Screenshot 2!) */}
            {selectedFieldType === 'formula' && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  EXPRESSION
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. {Stock} * {Pages}"
                  value={formulaExpression}
                  onChange={(e) => setFormulaExpression(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-mono text-gray-800 bg-white focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-[10px] text-gray-400 leading-normal">
                  Click a column above to insert it, or type <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700 font-mono">{"{Column Name}"}</code> manually. Supports + - * / ( ). Division by zero shows —.
                </p>
              </div>
            )}

            {/* Modal Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowAddCustomColumnModal(false)}
                className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-xs transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const rawName = newCustomColName.trim();
                  const name = rawName ? rawName.toUpperCase() : `CUSTOM FIELD ${customColumns.length + 1}`;
                  if (!customColumns.includes(name)) {
                    setCustomColumns(prev => [...prev, name]);
                    setCustomColumnTypes(prev => ({ ...prev, [name]: selectedFieldType }));
                    if (selectedFieldType === 'dropdown') {
                      setCustomColumnOptions(prev => ({ ...prev, [name]: dropdownOptionsList.map(o => ({ label: o.label, color: o.color })) }));
                    } else if (selectedFieldType === 'formula') {
                      setCustomColumnFormulas(prev => ({ ...prev, [name]: formulaExpression }));
                    }
                    showToast(`Custom column '${name}' added`, 'success');
                  }
                  setNewCustomColName('');
                  setFormulaExpression('');
                  setDropdownOptionsList([{ id: 'opt_1', label: 'Option 1', color: '#e0f2fe' }]);
                  setShowAddCustomColumnModal(false);
                }}
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white font-semibold rounded-xl text-xs transition-all shadow-sm cursor-pointer"
              >
                Add Column
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── BUILD BOMS / BULK EDIT BOM MODAL ── */}
      {showBuildBomsModal && (
        <Modal
          isOpen={showBuildBomsModal}
          onClose={() => setShowBuildBomsModal(false)}
          size="max-w-[1300px]"
          maxWidth="max-w-[1300px]"
        >
          <div className="p-5 space-y-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-emerald-100/70 text-emerald-800 rounded-2xl shrink-0">
                  <ClipboardList className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 truncate">
                    <span>Build BOMs</span>
                  </h3>
                  <p className="text-xs text-gray-400 font-medium truncate">
                    Define recipes product by product — a faster alternative to the Excel import.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => handleExportCSV()}
                  className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-gray-500" /> Export all (CSV)
                </button>
                <div className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-xl">
                  {productsWithRecipeCount} of {bomProductSkus.length} items have a recipe
                </div>
                <button
                  onClick={() => setShowBuildBomsModal(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 3-Column Body Layout */}
            <div className="grid grid-cols-12 gap-4 flex-1 overflow-hidden min-h-[540px]">
              
              {/* Column 1: Products Selector List (3 cols) */}
              <div className="col-span-3 border border-gray-200 rounded-2xl p-3 flex flex-col gap-3 bg-gray-50/40 overflow-hidden">
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      value={buildBomsSearch}
                      onChange={(e) => setBuildBomsSearch(e.target.value)}
                      placeholder="Search products..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 shadow-2xs"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-600 cursor-pointer select-none px-1">
                    <input
                      type="checkbox"
                      checked={onlyNoRecipeFilter}
                      onChange={(e) => setOnlyNoRecipeFilter(e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span>Only products without a recipe</span>
                  </label>
                </div>

                {/* Product List */}
                <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                  {filteredBuildProducts.map((prod) => {
                    const hasRecipe = (prod as any).bomItems && (prod as any).bomItems.length > 0;
                    const isSelected = activeBomProduct?._id === prod._id;

                    return (
                      <div
                        key={prod._id}
                        onClick={() => handleSelectBomProduct(prod)}
                        className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-start gap-2.5 border ${
                          isSelected
                            ? 'bg-emerald-50/80 border-emerald-300 shadow-2xs'
                            : 'bg-white border-transparent hover:bg-gray-100/80 hover:border-gray-200'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {hasRecipe ? (
                            <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">
                              ✓
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-[10px]">
                              !
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-gray-900 truncate">{prod.name}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{prod.skuCode}</div>
                        </div>
                      </div>
                    );
                  })}

                  {filteredBuildProducts.length === 0 && (
                    <div className="p-4 text-center text-xs text-gray-400 italic">
                      No products match search
                    </div>
                  )}
                </div>
              </div>

              {/* Column 2: Active Product Recipe Builder (6 cols) */}
              <div className="col-span-6 border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 bg-white overflow-hidden shadow-2xs">
                {activeBomProduct ? (
                  <>
                    {/* Active Product Header Bar */}
                    <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                      <div className="min-w-0 pr-2">
                        <h4 className="font-bold text-gray-900 text-sm truncate" title={activeBomProduct.name}>{activeBomProduct.name}</h4>
                        <p className="text-xs text-gray-400 font-mono truncate">{activeBomProduct.skuCode}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={handleSaveBuildBomRecipe}
                          disabled={isSavingBuildBom}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isSavingBuildBom ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          <span>Save recipe</span>
                        </button>
                      </div>
                    </div>

                    {/* Sub-header details bar */}
                    <div className="flex items-center gap-3 text-xs font-semibold text-gray-500 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      <span>ITEMS <strong>{activeRecipeItems.length}</strong></span>
                      <span>·</span>
                      <div className="flex items-center gap-1.5">
                        <span>BATCH SIZE:</span>
                        <input
                          type="number"
                          min="1"
                          placeholder="1"
                          value={buildBatchYieldQty}
                          onChange={(e) => setBuildBatchYieldQty(e.target.value)}
                          className="w-14 px-1.5 py-0.5 border border-purple-300 rounded text-xs font-bold text-purple-700 text-center bg-white"
                        />
                        <strong className="text-gray-800">{activeBomProduct?.unit || 'Pcs'}</strong>
                      </div>
                      <span>·</span>
                      <span className="text-[11px] font-normal text-gray-400">Quantities are per unit produced</span>
                    </div>

                    {/* Top Search Dropdown input to quickly add material */}
                    <div className="relative z-30">
                      <SearchableMaterialDropdown
                        value=""
                        materials={rawAndSemiMaterials}
                        onChange={(selectedName, matchedSku) => {
                          if (!selectedName) return;
                          setActiveRecipeItems(prev => [
                            ...prev,
                            {
                              id: `b-${Date.now()}`,
                              name: selectedName,
                              qty: '' as any,
                              uom: matchedSku?.unit || 'Kg',
                              inStock: (matchedSku as any)?.openingStock ?? 0,
                              notes: ''
                            }
                          ]);
                        }}
                      />
                    </div>

                    {/* Draggable Recipe Items List */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 border border-gray-100 rounded-xl p-2 bg-gray-50/20">
                      {activeRecipeItems.map((b) => (
                        <div
                          key={b.id}
                          className="p-2 bg-white border border-gray-200 rounded-xl shadow-2xs flex items-center gap-2 text-xs"
                        >
                          <span className="text-gray-400 font-bold select-none cursor-grab text-[11px]">⋮⋮</span>

                          <div className="flex-1 font-semibold text-gray-800 text-xs truncate">
                            {b.name}
                          </div>

                          <div className="w-20">
                            <input
                              type="number"
                              step="any"
                              value={b.qty}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setActiveRecipeItems(prev => prev.map(item => item.id === b.id ? { ...item, qty: val } : item));
                              }}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold text-center focus:outline-none focus:border-purple-500"
                            />
                          </div>

                          <span className="text-gray-500 font-medium text-[11px] w-8">{b.uom}</span>

                          <span className="text-gray-400 font-mono text-[10px] w-12 text-center">{b.inStock}</span>

                          <div className="w-28">
                            <input
                              type="text"
                              placeholder="Notes"
                              value={b.notes || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setActiveRecipeItems(prev => prev.map(item => item.id === b.id ? { ...item, notes: val } : item));
                              }}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none focus:border-purple-500"
                            />
                          </div>

                          <button
                            onClick={() => setActiveRecipeItems(prev => prev.filter(item => item.id !== b.id))}
                            className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}

                      {activeRecipeItems.length === 0 && (
                        <div className="p-8 text-center text-xs text-gray-400 italic">
                          No material ingredients added to recipe yet. Select from right catalog or use search box above!
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] font-semibold text-gray-400">
                      {activeRecipeItems.length} items
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-400">
                    <ClipboardList className="w-10 h-10 text-gray-300 mb-2" />
                    <p className="font-semibold text-gray-600">Select a product from the left list</p>
                    <p className="text-xs">Choose any product to view or edit its BOM recipe ingredients</p>
                  </div>
                )}
              </div>

              {/* Column 3: Materials Catalog Panel (3 cols) */}
              <div className="col-span-3 border border-gray-200 rounded-2xl p-3 flex flex-col gap-3 bg-gray-50/40 overflow-hidden">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Filter catalog..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 shadow-2xs"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  {/* Section 1: Raw Materials */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                      MATERIALS ({filteredRawCatalog.length})
                    </div>
                    {filteredRawCatalog.map((mat) => {
                      const isAdded = activeRecipeItems.some(b => b.name === mat.name);
                      return (
                        <div
                          key={mat._id || mat.skuCode || mat.name}
                          onClick={() => {
                            if (!activeBomProduct) {
                              showToast('Please select a product on the left first', 'warning');
                              return;
                            }
                            if (!isAdded) {
                              setActiveRecipeItems(prev => [
                                ...prev,
                                {
                                  id: `b-${Date.now()}`,
                                  name: mat.name,
                                  qty: 1,
                                  uom: mat.unit || 'Kg',
                                  inStock: Number((mat as any).presentStock ?? (mat as any).openingStock ?? 0),
                                  notes: ''
                                }
                              ]);
                            }
                          }}
                          className={`p-2 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-all border ${
                            isAdded
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                              : 'bg-white border-gray-200 hover:border-purple-300 text-gray-800 shadow-2xs'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={isAdded ? 'text-emerald-600 font-bold' : 'text-purple-600 font-bold'}>
                              {isAdded ? '✓' : '+'}
                            </span>
                            <span className="truncate text-[11px]">{mat.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                            {Number((mat as any).presentStock ?? (mat as any).openingStock ?? 0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Section 2: Semi-Finished Goods */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                      SUB-ASSEMBLIES ({filteredSemiCatalog.length})
                    </div>
                    {filteredSemiCatalog.map((semi) => {
                      const isAdded = activeRecipeItems.some(b => b.name === semi.name);
                      return (
                        <div
                          key={semi._id || semi.skuCode || semi.name}
                          onClick={() => {
                            if (!activeBomProduct) {
                              showToast('Please select a product on the left first', 'warning');
                              return;
                            }
                            if (!isAdded) {
                              setActiveRecipeItems(prev => [
                                ...prev,
                                {
                                  id: `b-${Date.now()}`,
                                  name: semi.name,
                                  qty: 1,
                                  uom: semi.unit || 'Pcs',
                                  inStock: Number((semi as any).presentStock ?? (semi as any).openingStock ?? 0),
                                  notes: ''
                                }
                              ]);
                            }
                          }}
                          className={`p-2 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-all border ${
                            isAdded
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                              : 'bg-white border-gray-200 hover:border-purple-300 text-gray-800 shadow-2xs'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={isAdded ? 'text-emerald-600 font-bold' : 'text-purple-600 font-bold'}>
                              {isAdded ? '✓' : '+'}
                            </span>
                            <span className="truncate text-[11px]">{semi.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                            {Number((semi as any).presentStock ?? (semi as any).openingStock ?? 0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </Modal>
      )}

      {/* Row Entrance Keyframe Animation */}
      <style>{`
        @keyframes slideDownFade {
          from {
            opacity: 0;
            transform: translateY(-12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

    </div>
  );
};

export default SkuMasterV2;

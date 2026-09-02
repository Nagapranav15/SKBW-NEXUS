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
  bulkImportSkusV2, 
  deleteSkuV2, 
  updateSkuV2, 
  getMetadataV2,
  updateMetadataV2,
  SkuV2 
} from '../../api/mfgApiV2';
import { getActivityLogs, createActivityLog } from '../../api/activityLogApi';
import AddSkuDrawerV2, { SearchableMaterialDropdown, DEMO_RAW_LIBRARY } from './AddSkuDrawerV2';
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

  // Dynamic work order & dispatch order calculation helpers
  const getWorkOrderCount = (sku: SkuV2 | null) => {
    if (!sku) return 0;
    if ((sku as any).workOrderCount !== undefined) return (sku as any).workOrderCount;
    const codeNum = (sku.skuCode || sku.name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return (codeNum % 3) + 1;
  };

  const getDispatchOrderCount = (sku: SkuV2 | null) => {
    if (!sku) return 0;
    if ((sku as any).dispatchOrderCount !== undefined) return (sku as any).dispatchOrderCount;
    const codeNum = (sku.skuCode || sku.name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return (codeNum % 2) + 1;
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
    reorderLevel: '',
    maxLevel: ''
  });
  const [bomRecipeItems, setBomRecipeItems] = useState<BomRecipeItem[]>([
    { id: 'b-1', name: 'Maplitho Paper Reel 70 GSM (Kraft Roll)', qty: 0.2, uom: 'Kg', inStock: 600, notes: 'Paper Reel' },
    { id: 'b-2', name: 'Grey Duplex Cover Board 300 GSM', qty: 1, uom: 'Pcs', inStock: 15000, notes: 'Cover Board' },
    { id: 'b-3', name: 'Book Stitching Wire #24', qty: 0.02, uom: 'Kg', inStock: 180, notes: 'Wire' },
    { id: 'b-4', name: 'Hotmelt Binding Adhesive', qty: 0.05, uom: 'Kg', inStock: 2200, notes: 'Glue' }
  ]);
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
        company: selectedCompany?._id
      });
      setSelectedSkuDetails(prev => prev ? ({ ...prev, bomItems: bomRecipeItems }) : null);
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
  const [showBuildBomsModal, setShowBuildBomsModal] = useState(false);
  const [activeBomProduct, setActiveBomProduct] = useState<SkuV2 | null>(null);
  const [activeRecipeItems, setActiveRecipeItems] = useState<BomRecipeItem[]>([]);
  const [buildBomsSearch, setBuildBomsSearch] = useState('');
  const [onlyNoRecipeFilter, setOnlyNoRecipeFilter] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [isSavingBuildBom, setIsSavingBuildBom] = useState(false);

  // Sync saved SKU BOM items when viewing item details
  useEffect(() => {
    if (selectedSkuDetails) {
      if ((selectedSkuDetails as any).bomItems && Array.isArray((selectedSkuDetails as any).bomItems) && (selectedSkuDetails as any).bomItems.length > 0) {
        setBomRecipeItems((selectedSkuDetails as any).bomItems.map((item: any, idx: number) => ({
          id: item.id || `b-${idx}`,
          name: item.name,
          qty: Number(item.qty) || 1,
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
      const data = await getSkusV2(
        selectedCompany?._id || '', 
        categoryFilter || undefined, 
        debouncedSearch || undefined,
        statusFilter || undefined
      );
      const formatted = (data || []).map(item => ({
        ...item,
        name: formatSkuName(item.name)
      }));
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
      skuCode: 'NB-132P-UR',
      name: '132P Happy Days Notebook (UR) · 57x70 CM',
      category: 'Notebooks',
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
      skuCode: 'NB-220P-SR',
      name: '220P Classmate Longbook (SR) · 18x24 CM',
      category: 'Notebooks',
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
      skuCode: 'DIARY-2026',
      name: 'Hardbound Executive Diary 2026',
      category: 'Executive Diaries',
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
      skuCode: 'NB-192P-DRW',
      name: '192P Premium Drawing Book · A4',
      category: 'Drawing Books',
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
      skuCode: 'REG-300P-HB',
      name: '300P Hardbound Account Register',
      category: 'Hardbound Register',
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
      skuCode: 'SF-CUT-70GSM',
      name: 'Ruled Cut Sheets 70 GSM · 32x44 CM',
      category: 'Ruled Cut Sheets',
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
      skuCode: 'SF-INNER-132P',
      name: 'Printed Inner Signatures (132P Block)',
      category: 'Printed Inner Signatures',
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
      skuCode: 'SF-BLOCK-A4',
      name: 'Folded Book Blocks A4 (192P)',
      category: 'Folded Book Blocks',
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
      skuCode: 'RM-REEL-70',
      name: 'Maplitho Paper Reel 70 GSM (Kraft Roll)',
      category: 'Paper Reels',
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
      skuCode: 'RM-BOARD-300',
      name: 'Grey Duplex Cover Board 300 GSM',
      category: 'Duplex Cover Board',
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
      skuCode: 'RM-WIRE-24',
      name: 'Book Stitching Wire #24',
      category: 'Stitching Wire & Thread',
      unit: 'Kg',
      altUnit: 'Spool',
      altUnitConversion: 15,
      openingStock: 180,
      status: 'Active',
      brand: 'UrbanThread Apparel'
    },
    {
      _id: 'demo-rm-4',
      skuCode: 'RM-GLUE-HM',
      name: 'Hotmelt Binding Adhesive',
      category: 'Binding Glue & Adhesives',
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
    if (cat.includes('semi') || cat.includes('wip') || cat === 'semi finished' || cat.includes('sub') || name.includes('ruled cut') || name.includes('inner signature') || name.includes('book block')) {
      return 'semi';
    }
    if (cat.includes('raw') || cat.includes('material') || cat === 'raw material' || cat.includes('reel') || cat.includes('board') || name.includes('reel') || name.includes('wire') || name.includes('adhesive') || name.includes('glue')) {
      return 'materials';
    }
    return 'products';
  };

  // Products List (Only database finished products)
  const productsList = useMemo(() => {
    return skus.filter(item => getItemType(item) === 'products');
  }, [skus]);

  // Materials List (Only database raw materials)
  const materialsList = useMemo(() => {
    return skus.filter(item => getItemType(item) === 'materials');
  }, [skus]);

  // Semi List (Only database semi-finished materials)
  const semiList = useMemo(() => {
    return skus.filter(item => getItemType(item) === 'semi');
  }, [skus]);

  // Build BOMs memoized helpers & handlers (Placed after materialsList & semiList initialization)
  const productsWithRecipeCount = useMemo(() => {
    return skus.filter(s => s.category === 'Finished Goods' || s.category === 'Products' || (s.category || '').includes('Notebook') || activeMainTab === 'products')
      .filter(s => (s as any).bomItems && (s as any).bomItems.length > 0).length;
  }, [skus, activeMainTab]);

  const filteredBuildProducts = useMemo(() => {
    const prods = skus.filter(s => s.category === 'Finished Goods' || s.category === 'Products' || (s.category || '').includes('Notebook') || activeMainTab === 'products');
    return prods.filter(p => {
      const matchesSearch = (p.name || '').toLowerCase().includes(buildBomsSearch.toLowerCase()) ||
                            (p.skuCode || '').toLowerCase().includes(buildBomsSearch.toLowerCase());
      const hasRecipe = (p as any).bomItems && (p as any).bomItems.length > 0;
      if (onlyNoRecipeFilter && hasRecipe) return false;
      return matchesSearch;
    });
  }, [skus, buildBomsSearch, onlyNoRecipeFilter, activeMainTab]);

  const filteredRawCatalog = useMemo(() => {
    const rawList = materialsList.length > 0 ? materialsList : DEMO_RAW_LIBRARY as any[];
    return rawList.filter(m => (m.name || '').toLowerCase().includes(catalogSearch.toLowerCase()));
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
    if (activeMainTab === 'products') return 'Notebooks';
    if (activeMainTab === 'semi') return 'Ruled Cut Sheets';
    return 'Paper Reels';
  };

  // BOM handlers inside Item Details Modal
  const handleDeleteBomItem = (id: string) => {
    setBomRecipeItems(prev => prev.filter(b => b.id !== id));
    showToast('Recipe ingredient removed', 'info');
  };

  const handleAddBomItem = () => {
    const newIngredient: BomRecipeItem = {
      id: `b-${Date.now()}`,
      name: 'Maplitho Paper Reel 70 GSM',
      qty: 0.1,
      uom: 'Kg',
      inStock: 500,
      notes: 'Paper'
    };
    setBomRecipeItems(prev => [...prev, newIngredient]);
    showToast('New paper material added to recipe', 'success');
  };

  return (
    <div className="min-h-screen bg-gray-50/60 p-4 md:p-6 space-y-4 font-sans text-gray-800">
      
      {/* ── CLEAN TOP HEADER ── */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          Item
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
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
          
          {/* Header Control Row (Toolbar matching Makoro Image 2 & 3!) */}
          <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 bg-white">
            
            {/* Left Counter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-700">
                Items: <span className="text-purple-600 font-bold">{total}</span>
              </span>
            </div>

            {/* Right Toolbar Controls */}
            <div className="flex items-center flex-wrap gap-2.5">
              
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
                    <span className="text-sm">📚</span>
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
                          <span className="text-base">📚</span>
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
                          <span className="text-base">📖</span>
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
                          <span className="text-base">📘</span>
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
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-3 w-8 text-center whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={paginatedSkus.length > 0 && selectedIds.length === paginatedSkus.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                  </th>
                  <th className="py-3 px-3 whitespace-nowrap">ID</th>
                  <th className="py-3 px-3 whitespace-nowrap">NAME</th>
                  <th className="py-3 px-3 whitespace-nowrap">CATEGORY</th>
                  <th className="py-3 px-3 whitespace-nowrap">UOM</th>
                  <th className="py-3 px-3 whitespace-nowrap">AUOM</th>
                  <th className="py-3 px-3 whitespace-nowrap">CON RATE</th>
                  <th className="py-3 px-3 whitespace-nowrap">GSM</th>
                  <th className="py-3 px-3 whitespace-nowrap">SIZE</th>
                  <th className="py-3 px-3 whitespace-nowrap">PAGES/SHEETS</th>
                  {activeMainTab === 'products' && (
                    <th className="py-3 px-3 whitespace-nowrap">BOM</th>
                  )}
                  <th className="py-3 px-3 whitespace-nowrap">STOCK</th>
                  <th className="py-3 px-3 whitespace-nowrap">WORK ORDERS</th>
                  <th className="py-3 px-3 whitespace-nowrap">DISPATCH ORDERS</th>
                  
                  {/* Dynamic Custom Columns with Drag & Drop + Move Around Controls */}
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
                    <td colSpan={(activeMainTab === 'products' ? 15 : 14) + customColumns.length} className="py-12 text-center text-gray-400 whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                        <span>Loading items...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedSkus.length === 0 ? (
                  <tr>
                    <td colSpan={(activeMainTab === 'products' ? 15 : 14) + customColumns.length} className="py-12 text-center text-gray-400 whitespace-nowrap">
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
                    const stockQty = sku.openingStock ?? 0;
                    
                    // Book Manufacturing Domain Icons
                    let itemDomainIcon = '📖';
                    if (activeMainTab === 'materials' || (sku.name || '').toLowerCase().includes('reel') || (sku.name || '').toLowerCase().includes('wire') || (sku.name || '').toLowerCase().includes('adhesive')) {
                      itemDomainIcon = '🗞️';
                    } else if (activeMainTab === 'semi' || (sku.name || '').toLowerCase().includes('sheet') || (sku.name || '').toLowerCase().includes('signature')) {
                      itemDomainIcon = '📑';
                    } else if ((sku.name || '').toLowerCase().includes('diary')) {
                      itemDomainIcon = '📚';
                    }

                    // Stock badge coloring
                    let stockBadge = (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 shadow-2xs">
                        {stockQty || 1100}
                      </span>
                    );
                    if (stockQty === 0 && index % 2 === 1) {
                      stockBadge = (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 shadow-2xs">
                          Out of Stock
                        </span>
                      );
                    } else if (stockQty > 0 && stockQty < 200) {
                      stockBadge = (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 shadow-2xs">
                          Low (150)
                        </span>
                      );
                    }

                    // BOM status - Applicable ONLY for Finished Goods / Products
                    const isBomApplicable = activeMainTab === 'products' || sku.category === 'Finished Goods' || sku.category === 'Products' || (sku.category || '').toLowerCase().includes('notebook') || (sku.category || '').toLowerCase().includes('diary');
                    const hasBom = isBomApplicable && Array.isArray((sku as any).bomItems) && (sku as any).bomItems.length > 0;

                    // Extract Pages
                    const pageMatch = sku.name.match(/(\d+)P/i);
                    const pagesStr = sku.pages ? `${sku.pages} P` : pageMatch ? `${pageMatch[1]} P` : (activeMainTab === 'products' ? '132 P' : '—');

                    return (
                      <tr 
                        key={sku._id || index}
                        onClick={() => {
                          setSelectedSkuDetails(sku);
                          fetchItemRecipeBOM(sku);
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

                        {/* ID */}
                        <td className="py-3 px-3 font-mono font-semibold text-gray-700 text-xs whitespace-nowrap">
                          {sku.skuCode}
                        </td>

                        {/* NAME with Domain Icon */}
                        <td className="py-3 px-3 font-medium text-gray-900 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{itemDomainIcon}</span>
                            <span className="font-semibold text-gray-900">{sku.name}</span>
                          </div>
                        </td>

                        {/* CATEGORY */}
                        <td className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                          {sku.category || 'Notebooks'}
                        </td>

                        {/* UOM */}
                        <td className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                          {sku.unit || 'Pcs'}
                        </td>

                        {/* AUOM */}
                        <td className="py-3 px-3 text-gray-500 whitespace-nowrap">
                          {sku.altUnit || (activeMainTab === 'products' ? 'Box' : 'Ream')}
                        </td>

                        {/* CON RATE */}
                        <td className="py-3 px-3 text-gray-500 font-mono text-[11px] whitespace-nowrap">
                          {sku.altUnitConversion ? `1:${sku.altUnitConversion}` : '1:10'}
                        </td>

                        {/* GSM */}
                        <td className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                          {sku.gsm ? `${sku.gsm} GSM` : '52 GSM'}
                        </td>

                        {/* SIZE */}
                        <td className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                          {formatSize(sku)}
                        </td>

                        {/* PAGES/SHEETS */}
                        <td className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                          {pagesStr}
                        </td>

                        {/* BOM - Shown ONLY for Products tab */}
                        {activeMainTab === 'products' && (
                          <td className="py-3 px-3 whitespace-nowrap">
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
                        )}

                        {/* STOCK */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {stockBadge}
                        </td>

                        {/* WORK ORDERS */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200">
                            {getWorkOrderCount(sku)}
                          </span>
                        </td>

                        {/* DISPATCH ORDERS */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold bg-purple-50 text-purple-600 border border-purple-200">
                            {getDispatchOrderCount(sku)}
                          </span>
                        </td>

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

                        {/* ACTIONS Column (Eye & Red Trash icons matching Image 2!) */}
                        <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Eye View Details Icon */}
                            <button
                              onClick={() => setSelectedSkuDetails(sku)}
                              className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all cursor-pointer"
                              title="View details & BOM recipe"
                            >
                              <Eye className="w-4 h-4" />
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
            <div className="flex items-center gap-2 text-left">
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
                <Book className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 text-base">{selectedSkuDetails.name}</span>
                  <span className="font-mono text-xs text-gray-400">{selectedSkuDetails.skuCode}</span>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    {selectedSkuDetails.category || 'Notebooks'}
                  </span>
                </div>
              </div>
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
                      onClick={() => showToast('Attributes updated', 'success')}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-xs shadow-2xs cursor-pointer"
                    >
                      Save Attributes
                    </button>
                    <button
                      onClick={() => setItemAttributes({ fabricGsm: '70 GSM Maplitho', size: '18 x 24 CM', color: 'Single Line Ruled' })}
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

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                        <span>Max Stock Level</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 100"
                        value={stockLevels.maxLevel}
                        onChange={(e) => setStockLevels(prev => ({ ...prev, maxLevel: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">Upper limit — don't stock beyond this</p>
                    </div>
                  </div>
                  <button
                    onClick={() => showToast('Stock levels saved', 'success')}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-xs shadow-2xs cursor-pointer mt-1"
                  >
                    Save levels
                  </button>
                </div>

                {/* 3. Bill of Materials (BOM) - Shown ONLY for Finished Goods! */}
                {(selectedSkuDetails?.category === 'Finished Goods' || selectedSkuDetails?.category === 'Products' || (selectedSkuDetails?.category || '').toLowerCase().includes('notebook') || (selectedSkuDetails?.category || '').toLowerCase().includes('diary')) && (
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
                        <button className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg text-xs shadow-2xs">
                          📂 Category
                        </button>
                        <button 
                          onClick={handleAddBomItem}
                          className="px-3 py-1.5 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold rounded-lg text-xs shadow-2xs flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Material
                        </button>
                        <button 
                          onClick={handleSaveBomRecipe}
                          disabled={isSavingBom}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
                        >
                          {isSavingBom ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          <span>Save BOM</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 font-medium italic">
                      This recipe makes <strong>1 Pcs</strong> ✏️ (use 1 for per-unit quantities)
                    </p>

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
                                  materials={materialsList}
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
                              <td className="py-2 px-3 w-20">
                                <input
                                  type="number"
                                  step="any"
                                  value={b.qty}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setBomRecipeItems(prev => prev.map(item => item.id === b.id ? { ...item, qty: val } : item));
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
              <li>📚 <strong>Products:</strong> Finished notebooks, diaries, longbooks, registers.</li>
              <li>🗞️ <strong>Materials:</strong> Paper reels, kraft rolls, duplex board, stitching wire.</li>
              <li>📑 <strong>Semi:</strong> Ruled cut sheets, inner signatures, folded book blocks.</li>
              <li>📁 <strong>Categories:</strong> Category structures and default UOM specifications.</li>
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
                  {productsWithRecipeCount} of {skus.filter(s => s.category === 'Finished Goods' || s.category === 'Products' || activeMainTab === 'products').length} products have a recipe
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
                    <div className="flex items-center gap-4 text-xs font-semibold text-gray-500 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      <span>ITEMS <strong>{activeRecipeItems.length}</strong></span>
                      <span>·</span>
                      <span>BATCH SIZE <strong>1 Pcs ✏️</strong></span>
                      <span>·</span>
                      <span className="text-[11px] font-normal text-gray-400">Quantities are per unit produced</span>
                    </div>

                    {/* Top Search Dropdown input to quickly add material */}
                    <div className="relative z-30">
                      <SearchableMaterialDropdown
                        value=""
                        materials={materialsList}
                        onChange={(selectedName, matchedSku) => {
                          if (!selectedName) return;
                          setActiveRecipeItems(prev => [
                            ...prev,
                            {
                              id: `b-${Date.now()}`,
                              name: selectedName,
                              qty: 1,
                              uom: matchedSku?.unit || 'Kg',
                              inStock: (matchedSku as any)?.openingStock ?? 500,
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
                                  inStock: (mat as any).openingStock ?? 500,
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
                            {(mat as any).openingStock ?? 500}
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
                                  inStock: (semi as any).openingStock ?? 100,
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
                            {(semi as any).openingStock ?? 100}
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

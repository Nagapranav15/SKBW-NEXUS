import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useSearchParams } from 'react-router-dom';
import SettingsPage from './SettingsPage';
import { 
  Package, 
  Folder, 
  Search, 
  Plus, 
  Download, 
  X, 
  Edit, 
  Trash2, 
  RefreshCw, 
  Save,
  ChevronDown, 
  ChevronUp, 
  Filter, 
  HelpCircle, 
  Share2, 
  Tag, 
  Check, 
  Paperclip,
  Lock,
  MapPin,
  SlidersHorizontal,
  ClipboardList,
  AlertCircle,
  Book,
  BookOpen,
  Scroll,
  Copy,
  ClipboardPaste,
  Pencil,
  Ruler,
  Hash,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  Boxes,
  Component,
  FileSpreadsheet,
  Upload,
  History,
  FileText,
  Columns,
  Eye,
  ShoppingCart,
  Settings,
  RotateCcw,
  Building2,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  ExternalLink,
  Bookmark
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { 
  getSkusV2, 
  getBalancesV2,
  createSkuV2,
  deleteSkuV2, 
  updateSkuV2,
  bulkImportSkusV2,
  bulkDeleteSkusV2,
  bulkUpdateSkusV2,
  renumberSkusV2,
  getWarehouseHierarchyV2,
  WarehouseLocationV2,
  getSkuStockDetailsV2,
  getMetadataV2,
  updateMetadataV2,
  SkuV2 
} from '../../api/mfgApiV2';
import AddSkuDrawerV2, { SearchableMaterialDropdown } from './AddSkuDrawerV2';
import { normalizeAndDeduplicateUnits } from '../../utils/uomConversion';
import { getParties } from '../../api/partyApi';
import { showToast } from '../ui/Toast';
import * as XLSX from 'xlsx';
import Modal from '../ui/Modal';
import { formatSkuName } from '../../utils/skuUtils';
import { BomCopyPasteControls, MakoroPasteIcon } from './BomCopyPasteControls';
import { copyBom, useCopiedBom } from '../../utils/bomClipboard';

// Helper to render neat domain icon for items
const renderItemDomainIcon = (skuItem: SkuV2, currentTab?: string) => {
  const code = (skuItem.skuCode || '').toUpperCase();
  const cat = (skuItem.category || skuItem.group || '').toLowerCase();
  const nameLower = (skuItem.name || '').toLowerCase();

  const isRaw = currentTab === 'materials' || 
                code.startsWith('RM') || 
                cat.includes('raw') || 
                cat.includes('material') || 
                nameLower.includes('reel') || 
                nameLower.includes('wire') || 
                nameLower.includes('adhesive') || 
                nameLower.includes('glue') || 
                nameLower.includes('board');

  const isSemi = currentTab === 'semi' || 
                 code.startsWith('SFG') || 
                 cat.includes('semi') || 
                 nameLower.includes('sheet') || 
                 nameLower.includes('signature') || 
                 nameLower.includes('block');

  if (isRaw) {
    return (
      <div className="w-6 h-6 rounded-md bg-amber-50 text-amber-600 border border-amber-200/70 flex items-center justify-center shrink-0 shadow-2xs" title="Raw Material">
        <Layers className="w-3.5 h-3.5" />
      </div>
    );
  }
  if (isSemi) {
    return (
      <div className="w-6 h-6 rounded-md bg-teal-50 text-teal-600 border border-teal-200/70 flex items-center justify-center shrink-0 shadow-2xs" title="Semi Finished">
        <Boxes className="w-3.5 h-3.5" />
      </div>
    );
  }
  // Finished Goods (Products)
  return (
    <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 border border-blue-200/70 flex items-center justify-center shrink-0 shadow-2xs" title="Finished Good">
      <Package className="w-3.5 h-3.5" />
    </div>
  );
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
  { id: 'cat-products', name: 'Products', type: 'products', uom: 'Pcs', fields: ['Pages', 'Size', 'Rule Type', 'Brand'] },
  { id: 'cat-materials', name: 'Materials', type: 'materials', uom: 'Kg', fields: ['Paper Type', 'GSM', 'Width (cm)', 'Length (cm)', 'Standard Sheets'] },
  { id: 'cat-semi', name: 'Semi', type: 'semi', uom: 'Ream', fields: ['Brand', 'GSM', 'Rule Type', 'Size'] }
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
  const { selectedCompany } = useAuth();
  const currentCompanyId = selectedCompany?._id || '';

  const [searchParams, setSearchParams] = useSearchParams();

  // Key to force row animation trigger on reload / tab change
  const [animationKey, setAnimationKey] = useState(Date.now());

  // 5 Main Tabs State: 'products' | 'materials' | 'semi' | 'categories' | 'settings' (persisted in URL & localStorage)
  const [activeMainTab, setActiveMainTab] = useState<'products' | 'materials' | 'semi' | 'categories' | 'settings'>(() => {
    const tabFromUrl = searchParams.get('tab') as any;
    if (tabFromUrl && ['products', 'materials', 'semi', 'categories', 'settings'].includes(tabFromUrl)) {
      return tabFromUrl;
    }
    const tabFromStorage = localStorage.getItem('skbw_item_master_active_tab') as any;
    if (tabFromStorage && ['products', 'materials', 'semi', 'categories', 'settings'].includes(tabFromStorage)) {
      return tabFromStorage;
    }
    return 'products';
  });

  const handleMainTabChange = (tab: 'products' | 'materials' | 'semi' | 'categories' | 'settings') => {
    setActiveMainTab(tab);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      if (tab !== 'categories') {
        next.delete('subtab');
      }
      return next;
    }, { replace: true });
    localStorage.setItem('skbw_item_master_active_tab', tab);
  };

  // Categories SubTab State: 'products' | 'materials' | 'semi' (persisted in URL & localStorage)
  const [activeCategorySubTab, setActiveCategorySubTabState] = useState<'products' | 'materials' | 'semi'>(() => {
    const subTabFromUrl = searchParams.get('subtab') as any;
    if (subTabFromUrl && ['products', 'materials', 'semi'].includes(subTabFromUrl)) {
      return subTabFromUrl;
    }
    const subTabFromStorage = localStorage.getItem('skbw_item_master_cat_subtab') as any;
    if (subTabFromStorage && ['products', 'materials', 'semi'].includes(subTabFromStorage)) {
      return subTabFromStorage;
    }
    return 'products';
  });

  const setActiveCategorySubTab = (subtab: 'products' | 'materials' | 'semi') => {
    setActiveCategorySubTabState(subtab);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('subtab', subtab);
      return next;
    }, { replace: true });
    localStorage.setItem('skbw_item_master_cat_subtab', subtab);
  };

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') as any;
    if (tabFromUrl && ['products', 'materials', 'semi', 'categories', 'settings'].includes(tabFromUrl) && tabFromUrl !== activeMainTab) {
      setActiveMainTab(tabFromUrl);
    }
    const subTabFromUrl = searchParams.get('subtab') as any;
    if (subTabFromUrl && ['products', 'materials', 'semi'].includes(subTabFromUrl) && subTabFromUrl !== activeCategorySubTab) {
      setActiveCategorySubTabState(subTabFromUrl);
    }
  }, [searchParams]);

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

  const [categoriesData, setCategoriesData] = useState<CategoryCardData[]>([]);

  const saveCategoriesToDb = async (updatedCards: CategoryCardData[], optionalUnits?: string[]) => {
    if (!selectedCompany?._id) return;
    try {
      const catNames = Array.from(new Set(updatedCards.map(c => c.name)));
      const allUnits = optionalUnits || unitsList;
      await updateMetadataV2({
        companyId: selectedCompany._id,
        categoryCards: updatedCards,
        categories: catNames,
        units: normalizeAndDeduplicateUnits(allUnits)
      });
      localStorage.setItem(`skbw_erp_categories_cards_${selectedCompany._id}`, JSON.stringify(updatedCards));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('skbw_metadata_updated'));
      }
    } catch (err) {
      console.error('Failed to save categories to MongoDB:', err);
    }
  };

  // Category modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryCardData | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    type: 'products' as 'products' | 'materials' | 'semi',
    uom: '',
    fieldsText: ''
  });

  const [unitsList, setUnitsList] = useState<string[]>([]);

  const loadMetadata = useCallback((companyId?: string) => {
    const id = companyId || selectedCompany?._id;
    if (!id) {
      setCategoriesData([]);
      setUnitsList([]);
      return;
    }
    getMetadataV2(id).then(data => {
      if (data?.units && Array.isArray(data.units)) {
        setUnitsList(normalizeAndDeduplicateUnits(data.units));
      } else {
        setUnitsList([]);
      }
      if (data?.categoryCards !== undefined && Array.isArray(data.categoryCards)) {
        setCategoriesData(data.categoryCards);
        localStorage.setItem(`skbw_erp_categories_cards_${id}`, JSON.stringify(data.categoryCards));
      } else {
        setCategoriesData([]);
      }
    }).catch(err => {
      console.error('Failed to load company metadata in SkuMasterV2:', err);
    });
  }, [selectedCompany?._id]);

  useEffect(() => {
    if (selectedCompany?._id) {
      const companyId = selectedCompany._id;
      // Load company-isolated categories from cache
      const cached = localStorage.getItem(`skbw_erp_categories_cards_${companyId}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            setCategoriesData(parsed);
          }
        } catch (e) {}
      } else {
        setCategoriesData([]);
      }

      loadMetadata(companyId);

      const handleMetadataUpdated = () => {
        loadMetadata(companyId);
      };
      window.addEventListener('skbw_metadata_updated', handleMetadataUpdated);
      return () => {
        window.removeEventListener('skbw_metadata_updated', handleMetadataUpdated);
      };
    } else {
      setCategoriesData([]);
      setUnitsList([]);
    }
  }, [selectedCompany?._id, loadMetadata]);

  // Expanded Category IDs
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>([]);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  // Core SKU data states
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter] = useState('');

  // Global reactive BOM clipboard
  const copiedBom = useCopiedBom();

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Sorting & Filtering (Default strictly to natural Ascending order FG-001, FG-002, ...)
  const [sortRules, setSortRules] = useState<{ field: string; order: 'asc' | 'desc' }[]>(() => {
    try {
      const saved = localStorage.getItem('skbw_erp_sort_rules_skus_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // If it was previously saved as skuCode desc, reset to asc
          if (parsed[0]?.field === 'skuCode' && parsed[0]?.order === 'desc') {
            return [{ field: 'skuCode', order: 'asc' }];
          }
          return parsed;
        }
      }
    } catch (e) {}
    return [{ field: 'skuCode', order: 'asc' }];
  });

  const handleColumnSort = (fieldId: string) => {
    setSortRules(prev => {
      const existing = prev.find(r => r.field === fieldId);
      let updated: { field: string; order: 'asc' | 'desc' }[];
      if (!existing) {
        updated = [{ field: fieldId, order: 'asc' }];
      } else if (existing.order === 'asc') {
        updated = [{ field: fieldId, order: 'desc' }];
      } else {
        updated = [{ field: 'skuCode', order: 'asc' }];
      }
      localStorage.setItem('skbw_erp_sort_rules_skus_v2', JSON.stringify(updated));
      return updated;
    });
  };
  const [filterRules, setFilterRules] = useState<{ id: string; field: string; operator: string; value: string }[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const toolbarActionsRef = useRef<HTMLDivElement>(null);

  // Close filter and action dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false);
      }
      if (toolbarActionsRef.current && !toolbarActionsRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
        setShowColumnPicker(false);
        setShowExportMenu(false);
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

  // Selection & Bulk Operations
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkOperating, setIsBulkOperating] = useState(false);
  const [bulkEditFields, setBulkEditFields] = useState({
    status: false,
    category: false,
    altUnit: false,
    unit: false,
    gsm: false
  });
  const [bulkEditValues, setBulkEditValues] = useState({
    status: 'Active',
    category: '',
    altUnit: 'GBL',
    unit: 'Pcs',
    gsm: '52'
  });

  // Modals & Popups
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Toolbar Dropdowns & Popovers
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Duplicates Scanner
  const [isScanningDuplicates, setIsScanningDuplicates] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<{ field: string; value: string; items: SkuV2[] }[]>([]);
  const [highlightedDuplicateIdx, setHighlightedDuplicateIdx] = useState<number>(0);
  const [compareGroup, setCompareGroup] = useState<{ field: string; value: string; items: SkuV2[] } | null>(null);

  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);

  // Recycle Bin Modal State
  const [showRecycleBinModal, setShowRecycleBinModal] = useState(false);
  const [recycledSkus, setRecycledSkus] = useState<SkuV2[]>([]);
  const [loadingRecycleBin, setLoadingRecycleBin] = useState(false);

  // Add SKU Modal
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [editSku, setEditSku] = useState<SkuV2 | null>(null);
  const [selectedSkuDetails, setSelectedSkuDetails] = useState<SkuV2 | null>(null);
  const [deleteConfirmSku, setDeleteConfirmSku] = useState<SkuV2 | null>(null);

  // Item Details Modal State
  const [detailsSubTab, setDetailsSubTab] = useState<'details' | 'locations' | 'work-orders' | 'dispatches'>('details');
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
  const [recipeYieldQty, setRecipeYieldQty] = useState<string>('');
  const [recipeYieldUnit, setRecipeYieldUnit] = useState<string>('');
  const [buildBatchYieldQty, setBuildBatchYieldQty] = useState<string>('1');
  const [buildBatchYieldUnit, setBuildBatchYieldUnit] = useState<string>('');
  const [isSavingBom, setIsSavingBom] = useState(false);
  const [isEditingItemBom, setIsEditingItemBom] = useState(false);

  const handleSaveBomRecipe = async () => {
    if (!selectedSkuDetails?._id) {
      showToast('No SKU item selected to save BOM', 'error');
      return;
    }
    setIsSavingBom(true);
    try {
      const yieldQty = Number(recipeYieldQty) || 1;
      const yieldUnit = recipeYieldUnit || (selectedSkuDetails as any).recipeYieldUnit || (selectedSkuDetails as any).batchYieldUnit || selectedSkuDetails.unit || 'Pcs';
      await updateSkuV2(selectedSkuDetails._id, {
        bomItems: bomRecipeItems,
        recipeYieldQty: yieldQty,
        recipeYieldUnit: yieldUnit,
        batchYieldQty: yieldQty,
        batchYieldUnit: yieldUnit,
        company: selectedCompany?._id
      });
      setSelectedSkuDetails(prev => prev ? ({ ...prev, bomItems: bomRecipeItems, recipeYieldQty: yieldQty, recipeYieldUnit: yieldUnit, batchYieldQty: yieldQty, batchYieldUnit: yieldUnit }) : null);
      setSkus(prev => prev.map(s => s._id === selectedSkuDetails._id ? { ...s, bomItems: bomRecipeItems, recipeYieldQty: yieldQty, recipeYieldUnit: yieldUnit, batchYieldQty: yieldQty, batchYieldUnit: yieldUnit } : s));
      if (activeBomProduct?._id === selectedSkuDetails._id) {
        setActiveBomProduct(prev => prev ? ({ ...prev, bomItems: bomRecipeItems, recipeYieldQty: yieldQty, recipeYieldUnit: yieldUnit, batchYieldQty: yieldQty, batchYieldUnit: yieldUnit }) : null);
        setActiveRecipeItems(bomRecipeItems);
        setBuildBatchYieldQty(String(yieldQty));
        setBuildBatchYieldUnit(yieldUnit);
      }
      showToast('BOM Recipe saved successfully to database!', 'success');
      setIsEditingItemBom(false);
      loadSkus(false);
    } catch (err: any) {
      console.error('Failed to save BOM recipe:', err);
      showToast(err.message || 'Failed to save BOM recipe', 'error');
    } finally {
      setIsSavingBom(false);
    }
  };

  // Direct paste copied BOM to a single SKU item
  const handleDirectPasteBomToSku = async (targetSku: SkuV2) => {
    if (!copiedBom || !targetSku._id) return;
    try {
      const existingItems = (targetSku as any).bomItems || [];
      const existingNames = new Set(existingItems.map((i: any) => (i.name || '').toLowerCase().trim()));
      const newItems = copiedBom.lines
        .filter(l => !existingNames.has((l.name || '').toLowerCase().trim()))
        .map((l, i) => ({
          id: `b-paste-${Date.now()}-${i}`,
          name: l.name,
          qty: l.qty,
          uom: l.uom,
          inStock: l.inStock ?? 0,
          notes: l.notes || ''
        }));
      
      const updatedBomItems = existingItems.length === 0 
        ? copiedBom.lines.map((l, i) => ({
            id: `b-paste-${Date.now()}-${i}`,
            name: l.name,
            qty: l.qty,
            uom: l.uom,
            inStock: l.inStock ?? 0,
            notes: l.notes || ''
          }))
        : [...existingItems, ...newItems];

      const yieldQty = existingItems.length === 0 && copiedBom.basis ? Number(copiedBom.basis) || 1 : ((targetSku as any).recipeYieldQty || (targetSku as any).batchYieldQty || 1);
      const yieldUnit = copiedBom.basisUnit || (targetSku as any).recipeYieldUnit || (targetSku as any).batchYieldUnit || targetSku.unit || 'Pcs';

      const patchData: any = {
        bomItems: updatedBomItems,
        recipeYieldQty: yieldQty,
        recipeYieldUnit: yieldUnit,
        batchYieldQty: yieldQty,
        batchYieldUnit: yieldUnit,
        company: selectedCompany?._id
      };
      if ((targetSku.altUnit || '').toLowerCase().trim() === (targetSku.unit || '').toLowerCase().trim()) {
        patchData.altUnit = '';
        patchData.altUnitConversion = null;
      }

      await updateSkuV2(targetSku._id, patchData);

      // Instant optimistic state update across table and modal
      setSkus(prev => prev.map(s => s._id === targetSku._id ? { ...s, bomItems: updatedBomItems, recipeYieldQty: yieldQty, recipeYieldUnit: yieldUnit, batchYieldQty: yieldQty, batchYieldUnit: yieldUnit } : s));
      if (activeBomProduct?._id === targetSku._id) {
        setActiveBomProduct(prev => prev ? { ...prev, bomItems: updatedBomItems, recipeYieldQty: yieldQty, recipeYieldUnit: yieldUnit, batchYieldQty: yieldQty, batchYieldUnit: yieldUnit } : null);
        setActiveRecipeItems(updatedBomItems.map((item, idx) => ({
          id: item.id || `b-${idx}`,
          skuId: item.skuId,
          skuCode: item.skuCode,
          name: item.name,
          qty: item.qty,
          uom: item.uom || 'Kg',
          inStock: item.inStock ?? 0,
          notes: item.notes || ''
        })));
        setBuildBatchYieldQty(String(yieldQty));
        setBuildBatchYieldUnit(yieldUnit);
      }
      if (selectedSkuDetails?._id === targetSku._id) {
        setSelectedSkuDetails(prev => prev ? { ...prev, bomItems: updatedBomItems, recipeYieldQty: yieldQty, recipeYieldUnit: yieldUnit, batchYieldQty: yieldQty, batchYieldUnit: yieldUnit } : null);
        setBomRecipeItems(updatedBomItems);
        setRecipeYieldQty(String(yieldQty));
        setRecipeYieldUnit(yieldUnit);
      }

      showToast(`Pasted BOM from "${copiedBom.sourceName}" to "${targetSku.name || targetSku.skuCode}"!`, 'success');
      loadSkus(false);
    } catch (err: any) {
      console.error('Failed to paste BOM:', err);
      showToast(err.response?.data?.msg || err.message || 'Failed to paste BOM', 'error');
    }
  };

  // Batch paste copied BOM to all filtered products without a recipe (Bulk Edit BOM modal)
  const handleBatchPasteToAllWithoutRecipe = async (targets: SkuV2[]) => {
    if (!copiedBom || targets.length === 0) return;
    if (!window.confirm(`Paste BOM from "${copiedBom.sourceName}" (${copiedBom.lines.length} items) to all ${targets.length} products without a recipe?`)) {
      return;
    }
    try {
      showToast(`Pasting BOM to ${targets.length} products...`, 'info');
      const targetIds = new Set(targets.map(t => t._id));
      const pastedYield = Number(copiedBom.basis) || 1;
      const pastedUnit = copiedBom.basisUnit || '';

      for (const targetSku of targets) {
        if (!targetSku._id) continue;
        const targetYieldUnit = pastedUnit || (targetSku as any).recipeYieldUnit || (targetSku as any).batchYieldUnit || targetSku.unit || 'Pcs';
        const items = copiedBom.lines.map((l, i) => ({
          id: `b-paste-${Date.now()}-${i}`,
          skuId: l.skuId,
          skuCode: l.skuCode,
          name: l.name,
          qty: l.qty,
          uom: l.uom || 'Kg',
          inStock: l.inStock ?? 0,
          notes: l.notes || ''
        }));
        const patchData: any = {
          bomItems: items,
          recipeYieldQty: pastedYield,
          recipeYieldUnit: targetYieldUnit,
          batchYieldQty: pastedYield,
          batchYieldUnit: targetYieldUnit,
          company: selectedCompany?._id
        };
        if ((targetSku.altUnit || '').toLowerCase().trim() === (targetSku.unit || '').toLowerCase().trim()) {
          patchData.altUnit = '';
          patchData.altUnitConversion = null;
        }
        await updateSkuV2(targetSku._id, patchData);
      }

      // Instant optimistic state update for all targets
      const pastedLines = copiedBom.lines.map((l, i) => ({
        id: `b-paste-${Date.now()}-${i}`,
        skuId: l.skuId,
        skuCode: l.skuCode,
        name: l.name,
        qty: l.qty,
        uom: l.uom || 'Kg',
        inStock: l.inStock ?? 0,
        notes: l.notes || ''
      }));

      setSkus(prev => prev.map(s => targetIds.has(s._id) ? { ...s, bomItems: pastedLines, recipeYieldQty: pastedYield, recipeYieldUnit: pastedUnit || s.unit || 'Pcs', batchYieldQty: pastedYield, batchYieldUnit: pastedUnit || s.unit || 'Pcs' } : s));
      if (activeBomProduct && targetIds.has(activeBomProduct._id)) {
        const activeYieldUnit = pastedUnit || activeBomProduct.unit || 'Pcs';
        setActiveBomProduct(prev => prev ? { ...prev, bomItems: pastedLines, recipeYieldQty: pastedYield, recipeYieldUnit: activeYieldUnit, batchYieldQty: pastedYield, batchYieldUnit: activeYieldUnit } : null);
        setActiveRecipeItems(pastedLines);
        setBuildBatchYieldQty(String(pastedYield));
        setBuildBatchYieldUnit(activeYieldUnit);
      }

      showToast(`Successfully pasted BOM to ${targets.length} products!`, 'success');
      loadSkus(false);
    } catch (err: any) {
      console.error('Failed batch paste:', err);
      showToast('Error pasting BOM to some products', 'error');
    }
  };

  // Bulk paste copied BOM to all selected items
  const handleBulkPasteBom = async () => {
    if (!copiedBom || selectedIds.length === 0) return;
    const count = selectedIds.length;
    if (!window.confirm(`Are you sure you want to paste the BOM from "${copiedBom.sourceName}" (${copiedBom.lines.length} materials) onto ${count} selected items?`)) {
      return;
    }

    try {
      let updatedCount = 0;
      const updatedSkusMap = new Map<string, { bomItems: any[]; yieldQty: number }>();

      for (const id of selectedIds) {
        const sku = skus.find(s => s._id === id);
        if (!sku) continue;
        const existingItems = (sku as any).bomItems || [];
        const existingNames = new Set(existingItems.map((i: any) => (i.name || '').toLowerCase().trim()));
        const newItems = copiedBom.lines
          .filter(l => !existingNames.has((l.name || '').toLowerCase().trim()))
          .map((l, i) => ({
            id: `b-bulk-paste-${Date.now()}-${i}`,
            skuId: l.skuId,
            skuCode: l.skuCode,
            name: l.name,
            qty: l.qty,
            uom: l.uom || 'Kg',
            inStock: l.inStock ?? 0,
            notes: l.notes || ''
          }));

        const updatedBomItems = existingItems.length === 0 
          ? copiedBom.lines.map((l, i) => ({
              id: `b-bulk-paste-${Date.now()}-${i}`,
              skuId: l.skuId,
              skuCode: l.skuCode,
              name: l.name,
              qty: l.qty,
              uom: l.uom || 'Kg',
              inStock: l.inStock ?? 0,
              notes: l.notes || ''
            }))
          : [...existingItems, ...newItems];

        const yieldQty = existingItems.length === 0 && copiedBom.basis ? Number(copiedBom.basis) || 1 : ((sku as any).recipeYieldQty || (sku as any).batchYieldQty || 1);
        const yieldUnit = copiedBom.basisUnit || (sku as any).recipeYieldUnit || (sku as any).batchYieldUnit || sku.unit || 'Pcs';

        await updateSkuV2(id, {
          bomItems: updatedBomItems,
          recipeYieldQty: yieldQty,
          recipeYieldUnit: yieldUnit,
          batchYieldQty: yieldQty,
          batchYieldUnit: yieldUnit,
          company: selectedCompany?._id
        });
        updatedSkusMap.set(id, { bomItems: updatedBomItems, yieldQty, yieldUnit });
        updatedCount++;
      }

      // Instant optimistic state update
      setSkus(prev => prev.map(s => {
        const update = updatedSkusMap.get(s._id);
        if (update) {
          return { ...s, bomItems: update.bomItems, recipeYieldQty: update.yieldQty, recipeYieldUnit: update.yieldUnit, batchYieldQty: update.yieldQty, batchYieldUnit: update.yieldUnit };
        }
        return s;
      }));

      showToast(`Successfully pasted BOM to ${updatedCount} items!`, 'success');
      setSelectedIds([]);
      loadSkus(false);
    } catch (err: any) {
      console.error('Failed bulk paste BOM:', err);
      showToast('Error applying BOM to some items', 'error');
    }
  };

  // ── Build BOMs / Bulk Edit BOM Modal state & handlers ──
  // ── Per-Tab Independent Column Customizer Tool State ──
  const DEFAULT_PRODUCTS_COLUMNS = [
    { id: 'skuCode', label: 'ID / SKU CODE', visible: true },
    { id: 'name', label: 'ITEM NAME', visible: true },
    { id: 'category', label: 'CATEGORY', visible: true },
    { id: 'status', label: 'STATUS', visible: true },
    { id: 'unit', label: 'UOM', visible: true },
    { id: 'altUnitConversion', label: 'CON RATE', visible: true },
    { id: 'altUnit', label: 'AUOM', visible: true },
    { id: 'gsm', label: 'GSM', visible: true },
    { id: 'size', label: 'SIZE', visible: true },
    { id: 'pages', label: 'PAGES', visible: true },
    { id: 'bom', label: 'BOM RECIPE', visible: true },
    { id: 'openingStock', label: 'STOCK', visible: false },
    { id: 'workOrders', label: 'WORK ORDERS', visible: false },
    { id: 'dispatchOrders', label: 'DISPATCH ORDERS', visible: false }
  ];

  const DEFAULT_MATERIALS_COLUMNS = [
    { id: 'skuCode', label: 'ID / SKU CODE', visible: true },
    { id: 'name', label: 'ITEM NAME', visible: true },
    { id: 'category', label: 'CATEGORY', visible: true },
    { id: 'status', label: 'STATUS', visible: true },
    { id: 'unit', label: 'UOM', visible: true },
    { id: 'altUnitConversion', label: 'CON RATE', visible: true },
    { id: 'altUnit', label: 'AUOM', visible: true },
    { id: 'gsm', label: 'GSM', visible: true },
    { id: 'size', label: 'SIZE', visible: true },
    { id: 'pages', label: 'SHEETS PER REAM', visible: true },
    { id: 'preferredVendor', label: 'PREFERRED VENDOR', visible: true },
    { id: 'openingStock', label: 'STOCK', visible: false },
    { id: 'workOrders', label: 'WORK ORDERS', visible: false },
    { id: 'dispatchOrders', label: 'DISPATCH ORDERS', visible: false }
  ];

  const DEFAULT_SEMI_COLUMNS = [
    { id: 'skuCode', label: 'ID / SKU CODE', visible: true },
    { id: 'name', label: 'ITEM NAME', visible: true },
    { id: 'category', label: 'CATEGORY', visible: true },
    { id: 'status', label: 'STATUS', visible: true },
    { id: 'unit', label: 'UOM', visible: true },
    { id: 'altUnitConversion', label: 'CON RATE', visible: true },
    { id: 'altUnit', label: 'AUOM', visible: true },
    { id: 'gsm', label: 'GSM', visible: true },
    { id: 'size', label: 'SIZE', visible: true },
    { id: 'pages', label: 'SHEETS PER REAM', visible: true },
    { id: 'preferredVendor', label: 'PREFERRED VENDOR', visible: true },
    { id: 'bom', label: 'BOM RECIPE', visible: true },
    { id: 'openingStock', label: 'STOCK', visible: false },
    { id: 'workOrders', label: 'WORK ORDERS', visible: false },
    { id: 'dispatchOrders', label: 'DISPATCH ORDERS', visible: false }
  ];

  const STORAGE_KEY = 'skbw_sku_master_tab_columns_v18';

  // Helper to sanitize column list against current valid defaults
  const sanitizeColumns = (savedList: any[], defaultList: typeof DEFAULT_PRODUCTS_COLUMNS) => {
    if (!Array.isArray(savedList)) return defaultList;
    const defaultIds = new Set(defaultList.map(c => c.id));
    // Filter out obsolete or deleted column IDs, and update label to current standard
    const validSaved = savedList.filter(c => c && defaultIds.has(c.id)).map(c => {
      const def = defaultList.find(d => d.id === c.id);
      return def ? { ...c, label: def.label } : c;
    });
    // Add any missing default columns
    const savedIds = new Set(validSaved.map(c => c.id));
    const missing = defaultList.filter(c => !savedIds.has(c.id));
    return [...validSaved, ...missing];
  };

  const [tabColumnsMap, setTabColumnsMap] = useState<Record<string, typeof DEFAULT_PRODUCTS_COLUMNS>>(() => {
    try {
      // Clean up legacy keys which may contain obsolete column IDs
      localStorage.removeItem('skbw_sku_master_tab_columns_v2');
      localStorage.removeItem('skbw_sku_master_tab_columns_v3');
      localStorage.removeItem('skbw_sku_master_tab_columns_v4');
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            products: sanitizeColumns(parsed.products, DEFAULT_PRODUCTS_COLUMNS),
            materials: sanitizeColumns(parsed.materials, DEFAULT_MATERIALS_COLUMNS),
            semi: sanitizeColumns(parsed.semi, DEFAULT_SEMI_COLUMNS)
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
      return col.visible;
    });
  }, [columnsConfig, activeMainTab]);

  const [showBuildBomsModal, setShowBuildBomsModal] = useState(false);
  const [activeBomProduct, setActiveBomProduct] = useState<SkuV2 | null>(null);
  const [activeRecipeItems, setActiveRecipeItems] = useState<BomRecipeItem[]>([]);
  const [buildBomsSearch, setBuildBomsSearch] = useState('');
  const [onlyNoRecipeFilter, setOnlyNoRecipeFilter] = useState(false);
  const [buildBomsTitleFilter, setBuildBomsTitleFilter] = useState('');
  const [buildBomsRulingFilter, setBuildBomsRulingFilter] = useState('');
  const [buildBomsSortBy, setBuildBomsSortBy] = useState<'default' | 'title-asc' | 'title-desc' | 'ruling-asc' | 'ruling-desc' | 'name-asc' | 'name-desc'>('default');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [isSavingBuildBom, setIsSavingBuildBom] = useState(false);

  const [modalInitialLocationText, setModalInitialLocationText] = useState<string>('Loading...');
  const [modalDynamicLocationsText, setModalDynamicLocationsText] = useState<string>('Loading...');
  const [modalDynamicLiveStock, setModalDynamicLiveStock] = useState<number | null>(null);
  const [modalLocationsBreakdown, setModalLocationsBreakdown] = useState<any[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState<boolean>(false);

  // Miniature Stock Overview Modal
  const [showMiniStockModal, setShowMiniStockModal] = useState<boolean>(false);
  const [miniStockLoading, setMiniStockLoading] = useState<boolean>(false);
  const [miniStockData, setMiniStockData] = useState<any>(null);
  const [miniStockTab, setMiniStockTab] = useState<'movements' | 'locations' | 'batches'>('movements');

  const handleOpenMiniStockOverview = async () => {
    if (!selectedSkuDetails?._id || !currentCompanyId) return;
    setShowMiniStockModal(true);
    setMiniStockLoading(true);
    try {
      const res = await getSkuStockDetailsV2(selectedSkuDetails._id, currentCompanyId);
      setMiniStockData(res);
    } catch (err) {
      console.error('Failed to load miniature stock overview:', err);
    } finally {
      setMiniStockLoading(false);
    }
  };

  const [isEditingThresholds, setIsEditingThresholds] = useState<boolean>(false);
  const [tempMinStock, setTempMinStock] = useState<string>('');
  const [tempReorder, setTempReorder] = useState<string>('');
  const [tempVendor, setTempVendor] = useState<string>('');
  const [isSavingThresholds, setIsSavingThresholds] = useState<boolean>(false);
  const [modalVendorsList, setModalVendorsList] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!currentCompanyId) return;
    getParties({ company: currentCompanyId, type: 'vendor', limit: 1000, light: true })
      .then(res => {
        const rawList = res.data?.parties || (Array.isArray(res.data) ? res.data : []);
        const list = rawList.map((p: any) => ({
          id: String(p._id || p.id || ''),
          name: p.firmName || p.ownerName || p.contactName || p.name || p.companyName || ''
        })).filter((v: any) => v.name);
        setModalVendorsList(list);
      })
      .catch(() => setModalVendorsList([]));
  }, [currentCompanyId]);

  // Helper to build parent-to-child location path (Factory ➔ Zone ➔ Storage Location)
  const buildModalLocationPath = (locIdOrObj: any, allLocations: WarehouseLocationV2[]): string => {
    if (!locIdOrObj) return '';
    if (typeof locIdOrObj === 'object') {
      if (locIdOrObj._id && Array.isArray(allLocations) && allLocations.length > 0) {
        const path = buildModalLocationPath(locIdOrObj._id, allLocations);
        if (path && path !== locIdOrObj._id && !path.startsWith('[object')) return path;
      }
      if (locIdOrObj.name) return locIdOrObj.name;
    }

    const targetStr = String(locIdOrObj).trim();
    if (!targetStr || targetStr === '[object Object]') return '';

    if (Array.isArray(allLocations) && allLocations.length > 0) {
      const locMap = new Map(allLocations.map(l => [l._id, l]));
      let current = locMap.get(targetStr);

      if (!current) {
        current = allLocations.find(l => l.name?.toLowerCase() === targetStr.toLowerCase());
      }

      if (current) {
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
      }
    }

    const isMongoId = /^[0-9a-fA-F]{24}$/.test(targetStr);
    if (isMongoId) {
      return 'Main Warehouse - Bay A1';
    }

    return targetStr;
  };

  const handleSaveThresholds = async () => {
    if (!selectedSkuDetails?._id) return;
    setIsSavingThresholds(true);
    try {
      const minVal = Number(tempMinStock) || 0;
      const reorderVal = Number(tempReorder) || 0;
      await updateSkuV2(selectedSkuDetails._id, {
        minStockLevel: minVal,
        reorderLevel: reorderVal,
        preferredVendor: tempVendor,
        company: currentCompanyId
      });
      setSelectedSkuDetails(prev => prev ? ({
        ...prev,
        minStockLevel: minVal,
        reorderLevel: reorderVal,
        preferredVendor: tempVendor
      }) : null);
      setSkus(prevSkus => prevSkus.map(item => item._id === selectedSkuDetails._id ? {
        ...item,
        minStockLevel: minVal,
        reorderLevel: reorderVal,
        preferredVendor: tempVendor
      } : item));
      showToast('Stock levels and preferred vendor updated successfully!', 'success');
      loadSkus(false);
      setIsEditingThresholds(false);
    } catch (err: any) {
      console.error('Failed to save stock thresholds:', err);
      showToast(err.message || 'Failed to update stock thresholds', 'error');
    } finally {
      setIsSavingThresholds(false);
    }
  };

  // Sync saved SKU attributes, stock levels, BOM items & yield quantity when viewing item details
  useEffect(() => {
    let isMounted = true;
    if (!selectedSkuDetails) return;

    const fetchModalLocationData = async () => {
      setIsLoadingLocations(true);
      try {
        const hierarchy = currentCompanyId ? await getWarehouseHierarchyV2(currentCompanyId).catch(() => []) : [];
        
        let initialLocStr = 'SKBW';
        let dynamicLocsStr = 'No live stock entries assigned';
        let resolvedLiveStock: number | null = null;
        let resolvedLocationsBreakdown: any[] = [];

        // 1. Resolve Initial Assigned Location
        const directLoc = (selectedSkuDetails as any)?.initialLocation || 
                         (selectedSkuDetails as any)?.defaultLocation ||
                         (selectedSkuDetails as any)?.initialLocationId || 
                         (selectedSkuDetails as any)?.locationId || 
                         (selectedSkuDetails as any)?.warehouseLocation || 
                         (selectedSkuDetails as any)?.location || 
                         (selectedSkuDetails as any)?.locationName || 
                         'SKBW';
        if (directLoc) {
          const directStr = typeof directLoc === 'object' ? (directLoc.name || 'SKBW') : String(directLoc).trim();
          if (directStr.toLowerCase().includes('skbw') || directStr === 'Main Warehouse - Bay A1' || !directStr) {
            initialLocStr = 'SKBW';
          } else {
            const locPath = buildModalLocationPath(directLoc, hierarchy);
            if (locPath) {
              initialLocStr = locPath.toLowerCase().includes('skbw') ? 'SKBW' : locPath;
            } else {
              initialLocStr = directStr;
            }
          }
        }

        // 2. Fetch Detailed Live Stock & Locations Breakdown
        if (selectedSkuDetails._id && currentCompanyId) {
          const stockDetails = await getSkuStockDetailsV2(selectedSkuDetails._id, currentCompanyId).catch(() => null);
          if (stockDetails && Array.isArray(stockDetails.locations) && stockDetails.locations.length > 0) {
            resolvedLocationsBreakdown = stockDetails.locations.map(loc => ({
              ...loc,
              hierarchyPath: loc.hierarchyPath || buildModalLocationPath(loc.locationId, hierarchy) || loc.locationName
            }));
            resolvedLiveStock = stockDetails.summary?.onHand ?? 0;
            const stockUnit = selectedSkuDetails.unit || (getItemType(selectedSkuDetails) === 'materials' ? 'KG' : 'Pcs');
            const locPaths = resolvedLocationsBreakdown.map(l => `${l.hierarchyPath || l.locationName} (${l.onHand} ${stockUnit})`);
            dynamicLocsStr = locPaths.join(' • ');
          } else {
            const balances = await getBalancesV2(currentCompanyId, undefined, undefined, selectedSkuDetails._id).catch(() => []);
            if (balances && balances.length > 0) {
              const sumOnHand = balances.reduce((s: number, b: any) => s + Number(b.onHand ?? b.quantity ?? 0), 0);
              resolvedLiveStock = sumOnHand;

              const locPaths: string[] = [];
              resolvedLocationsBreakdown = balances.map((b: any) => {
                const locObj = b.locationId || b.location;
                const p = buildModalLocationPath(locObj, hierarchy);
                const locName = typeof locObj === 'object' ? locObj.name : (p || 'Warehouse Location');
                const locCode = typeof locObj === 'object' ? (locObj.code || '') : '';
                const onHand = Number(b.onHand ?? b.quantity ?? 0);
                const reserved = Number(b.reserved ?? 0);
                const available = Math.max(0, onHand - reserved);
                const stockUnit = selectedSkuDetails.unit || (getItemType(selectedSkuDetails) === 'materials' ? 'KG' : 'Pcs');
                if (p) locPaths.push(`${p} (${onHand} ${stockUnit})`);
                return {
                  locationId: typeof locObj === 'object' ? locObj._id : String(locObj || ''),
                  locationName: locName,
                  locationCode: locCode,
                  hierarchyPath: p,
                  onHand,
                  reserved,
                  available,
                  unitCost: Number(b.unitCost || 0),
                  stockValue: Number(b.stockValue || (onHand * Number((selectedSkuDetails as any).purchasePrice || (selectedSkuDetails as any).ratePerKg || (selectedSkuDetails as any).rate || 0)))
                };
              });
              if (locPaths.length > 0) {
                dynamicLocsStr = Array.from(new Set(locPaths)).join(' • ');
              }
            } else {
              resolvedLiveStock = 0;
              resolvedLocationsBreakdown = [];
            }
          }
        } else {
          resolvedLiveStock = 0;
          resolvedLocationsBreakdown = [];
        }

        if (isMounted) {
          setModalInitialLocationText(initialLocStr);
          setModalDynamicLocationsText(dynamicLocsStr);
          setModalDynamicLiveStock(resolvedLiveStock ?? 0);
          setModalLocationsBreakdown(resolvedLocationsBreakdown);
        }
      } catch (err) {
        if (isMounted) {
          setModalInitialLocationText('SKBW');
          setModalDynamicLocationsText('No live stock entries assigned');
          setModalDynamicLiveStock(0);
          setModalLocationsBreakdown([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingLocations(false);
        }
      }
    };

    fetchModalLocationData();

    return () => {
      isMounted = false;
    };
  }, [selectedSkuDetails, currentCompanyId]);

  useEffect(() => {
    if (selectedSkuDetails) {
      setDetailsSubTab('details');
      setRecipeYieldQty((selectedSkuDetails as any).recipeYieldQty !== undefined ? String((selectedSkuDetails as any).recipeYieldQty) : ((selectedSkuDetails as any).batchYieldQty !== undefined ? String((selectedSkuDetails as any).batchYieldQty) : ''));
      setRecipeYieldUnit((selectedSkuDetails as any).recipeYieldUnit || selectedSkuDetails.unit || 'Pcs');
      
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
        setBomRecipeItems((selectedSkuDetails as any).bomItems.map((item: any, idx: number) => {
          const matchedSku = (skus || []).find(s => 
            (item.skuId && String(s._id) === String(item.skuId)) ||
            (item.skuCode && s.skuCode === item.skuCode) ||
            (item.id && String(s._id) === String(item.id)) ||
            (item.name && s.name === item.name)
          );
          const currentName = matchedSku?.name || item.name || item.itemName || '';
          return {
            id: item.id || `b-${idx}`,
            skuId: item.skuId || matchedSku?._id,
            skuCode: item.skuCode || matchedSku?.skuCode,
            name: currentName,
            qty: item.qty ?? '',
            uom: matchedSku?.unit || item.uom || 'Pcs',
            inStock: Number(item.inStock) || 0,
            notes: item.notes || ''
          };
        }));
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
          const rawId = b.skuId || b.sku?._id;
          const sId = rawId ? String(rawId._id || rawId) : '';
          const qty = Number(b.onHand) || Number(b.quantity) || 0;
          if (sId) {
            balanceMap.set(sId, (balanceMap.get(sId) || 0) + qty);
          }
        });
      }

      const formatted = (data || []).map(item => {
        const itemId = String(item._id);
        const ledgerStock = balanceMap.get(itemId) || 0;
        const liveStock = ledgerStock;
        
        let cleanAltUnit = (item.altUnit || '').trim();
        const cleanUnit = (item.unit || '').trim();
        if (
          !cleanAltUnit ||
          cleanAltUnit === '—' ||
          cleanAltUnit === '–' ||
          cleanAltUnit === '-' ||
          cleanAltUnit.includes('â') ||
          cleanAltUnit.includes('€') ||
          cleanAltUnit.includes('\uFFFD') ||
          cleanAltUnit.toLowerCase() === 'n/a' ||
          cleanAltUnit.toLowerCase() === 'none' ||
          cleanAltUnit.toLowerCase() === 'null' ||
          cleanAltUnit.toLowerCase() === 'undefined' ||
          cleanAltUnit.toLowerCase() === cleanUnit.toLowerCase()
        ) {
          cleanAltUnit = '';
        }

        return {
          ...item,
          altUnit: cleanAltUnit,
          altUnitConversion: cleanAltUnit ? item.altUnitConversion : undefined,
          name: formatSkuName(item.name),
          openingStock: 0,
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
      openingStock: 0,
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
      openingStock: 0,
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
      openingStock: 0,
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
      openingStock: 0,
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
      openingStock: 0,
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
      openingStock: 0,
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
      openingStock: 0,
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
      openingStock: 0,
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
      openingStock: 0,
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
      openingStock: 0,
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
      openingStock: 0,
      status: 'Active',
      brand: 'Campus Store Co.'
    }
  ];

  // Helper to determine Item Type of SKU
  const getItemType = (item: SkuV2): 'products' | 'materials' | 'semi' => {
    const cat = (item.category || '').toLowerCase().trim();
    const name = (item.name || '').toLowerCase();
    const code = (item.skuCode || '').toUpperCase().trim();

    // 1. Check against dynamic categories configured in Categories tab
    const matchedCat = (categoriesData || []).find(c => c.name.toLowerCase().trim() === cat);
    if (matchedCat) {
      return matchedCat.type;
    }

    // 2. Semi-finished / WIP
    if (
      cat.includes('semi') || 
      cat.includes('wip') || 
      cat === 'semi finished' || 
      cat.includes('sub') || 
      code.startsWith('SM-') || 
      code.startsWith('SM') || 
      code.startsWith('SEM') || 
      code.startsWith('SFG') || 
      code.startsWith('SF') || 
      name.includes('ruled cut') || 
      name.includes('inner signature') || 
      name.includes('book block')
    ) {
      return 'semi';
    }

    // 3. Raw Materials
    if (
      cat.includes('raw') || 
      cat.includes('material') || 
      cat === 'raw material' || 
      cat.includes('reel') || 
      cat.includes('board') || 
      code.startsWith('RM-') || 
      code.startsWith('RM') || 
      name.includes('reel') || 
      name.includes('wire') || 
      name.includes('adhesive') || 
      name.includes('glue')
    ) {
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

  // Available unique Titles & Rulings for Build BOMs filter dropdowns
  const buildBomsAvailableTitles = useMemo(() => {
    const titles = new Set<string>();
    bomProductSkus.forEach(s => {
      const t = (s.title || s.brand || '').trim();
      if (t) titles.add(t);
    });
    return Array.from(titles).sort((a, b) => a.localeCompare(b));
  }, [bomProductSkus]);

  const buildBomsAvailableRulings = useMemo(() => {
    const rulings = new Set<string>();
    bomProductSkus.forEach(s => {
      const r = (s.ruleType || '').trim();
      if (r) rulings.add(r);
    });
    return Array.from(rulings).sort((a, b) => a.localeCompare(b));
  }, [bomProductSkus]);

  const filteredBuildProducts = useMemo(() => {
    let baseList: SkuV2[] = [];
    if (activeMainTab === 'semi') {
      baseList = semiList.length > 0 ? semiList : skus.filter(s => (s.category || '').toLowerCase().includes('semi') || (s.skuCode || '').startsWith('SM'));
    } else {
      baseList = bomProductSkus.length > 0 ? bomProductSkus : [...productsList, ...semiList];
    }
    const filtered = baseList.filter(p => {
      const matchesSearch = (p.name || '').toLowerCase().includes(buildBomsSearch.toLowerCase()) ||
                            (p.skuCode || '').toLowerCase().includes(buildBomsSearch.toLowerCase()) ||
                            (p.title || '').toLowerCase().includes(buildBomsSearch.toLowerCase()) ||
                            (p.ruleType || '').toLowerCase().includes(buildBomsSearch.toLowerCase());
      const hasRecipe = (p as any).bomItems && (p as any).bomItems.length > 0;
      if (onlyNoRecipeFilter && hasRecipe) return false;

      // Title filter
      if (buildBomsTitleFilter) {
        const pTitle = (p.title || p.brand || '').trim().toLowerCase();
        if (pTitle !== buildBomsTitleFilter.toLowerCase()) return false;
      }

      // Ruling filter
      if (buildBomsRulingFilter) {
        const pRuling = (p.ruleType || '').trim().toLowerCase();
        if (pRuling !== buildBomsRulingFilter.toLowerCase()) return false;
      }

      return matchesSearch;
    });

    // Sort by Title or Ruling
    if (buildBomsSortBy === 'title-asc') {
      return [...filtered].sort((a, b) => (a.title || a.brand || a.name || '').localeCompare(b.title || b.brand || b.name || ''));
    } else if (buildBomsSortBy === 'title-desc') {
      return [...filtered].sort((a, b) => (b.title || b.brand || b.name || '').localeCompare(a.title || a.brand || a.name || ''));
    } else if (buildBomsSortBy === 'ruling-asc') {
      return [...filtered].sort((a, b) => (a.ruleType || '').localeCompare(b.ruleType || ''));
    } else if (buildBomsSortBy === 'ruling-desc') {
      return [...filtered].sort((a, b) => (b.ruleType || '').localeCompare(a.ruleType || ''));
    } else if (buildBomsSortBy === 'name-asc') {
      return [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (buildBomsSortBy === 'name-desc') {
      return [...filtered].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    }

    return filtered;
  }, [bomProductSkus, productsList, semiList, skus, activeMainTab, buildBomsSearch, onlyNoRecipeFilter, buildBomsTitleFilter, buildBomsRulingFilter, buildBomsSortBy]);

  const filteredRawCatalog = useMemo(() => {
    return materialsList.filter(m => (m.name || '').toLowerCase().includes(catalogSearch.toLowerCase()));
  }, [materialsList, catalogSearch]);

  const filteredSemiCatalog = useMemo(() => {
    const list = semiList.length > 0 ? semiList : skus.filter(s => s.category === 'Semi Finished');
    return list.filter(s => (s.name || '').toLowerCase().includes(catalogSearch.toLowerCase()));
  }, [semiList, skus, catalogSearch]);

  useEffect(() => {
    if (showBuildBomsModal && filteredBuildProducts.length > 0) {
      if (!activeBomProduct || !filteredBuildProducts.some(p => p._id === activeBomProduct._id)) {
        handleSelectBomProduct(filteredBuildProducts[0]);
      }
    }
  }, [showBuildBomsModal, filteredBuildProducts]);

  const handleSelectBomProduct = (prod: SkuV2) => {
    setActiveBomProduct(prod);
    setBuildBatchYieldQty(String((prod as any).recipeYieldQty ?? (prod as any).batchYieldQty ?? '1'));
    setBuildBatchYieldUnit((prod as any).recipeYieldUnit || (prod as any).batchYieldUnit || prod.unit || 'Pcs');
    if ((prod as any).bomItems && Array.isArray((prod as any).bomItems)) {
      setActiveRecipeItems((prod as any).bomItems.map((item: any, idx: number) => {
        const matchedSku = (skus || []).find(s => 
          (item.skuId && String(s._id) === String(item.skuId)) ||
          (item.skuCode && s.skuCode === item.skuCode) ||
          (item.id && String(s._id) === String(item.id)) ||
          (item.name && s.name === item.name)
        );
        const currentName = matchedSku?.name || item.name || item.itemName || '';
        return {
          id: item.id || `b-${idx}`,
          skuId: item.skuId || matchedSku?._id,
          skuCode: item.skuCode || matchedSku?.skuCode,
          name: currentName,
          qty: Number(item.qty) || 1,
          uom: item.uom || matchedSku?.unit || 'Kg',
          inStock: Number((matchedSku as any)?.openingStock ?? item.inStock ?? 0),
          notes: item.notes || ''
        };
      }));
    } else {
      setActiveRecipeItems([]);
    }
  };

  const handleSaveBuildBomRecipe = async () => {
    if (!activeBomProduct?._id) return;
    setIsSavingBuildBom(true);
    try {
      const yieldQty = Number(buildBatchYieldQty) || 1;
      const yieldUnit = buildBatchYieldUnit || (activeBomProduct as any).recipeYieldUnit || (activeBomProduct as any).batchYieldUnit || activeBomProduct.unit || 'Pcs';
      await updateSkuV2(activeBomProduct._id, {
        bomItems: activeRecipeItems,
        recipeYieldQty: yieldQty,
        recipeYieldUnit: yieldUnit,
        batchYieldQty: yieldQty,
        batchYieldUnit: yieldUnit,
        company: selectedCompany?._id
      });
      // Instant optimistic update across local state
      setSkus(prev => prev.map(s => s._id === activeBomProduct._id ? { ...s, bomItems: activeRecipeItems, recipeYieldQty: yieldQty, recipeYieldUnit: yieldUnit, batchYieldQty: yieldQty, batchYieldUnit: yieldUnit } : s));
      setActiveBomProduct(prev => prev ? { ...prev, bomItems: activeRecipeItems, recipeYieldQty: yieldQty, recipeYieldUnit: yieldUnit, batchYieldQty: yieldQty, batchYieldUnit: yieldUnit } : null);
      if (selectedSkuDetails?._id === activeBomProduct._id) {
        setSelectedSkuDetails(prev => prev ? { ...prev, bomItems: activeRecipeItems, recipeYieldQty: yieldQty, recipeYieldUnit: yieldUnit, batchYieldQty: yieldQty, batchYieldUnit: yieldUnit } : null);
        setBomRecipeItems(activeRecipeItems);
        setRecipeYieldQty(String(yieldQty));
        setRecipeYieldUnit(yieldUnit);
      }

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

    // Apply categoryFilter if set
    if (categoryFilter && categoryFilter.trim()) {
      const catLower = categoryFilter.toLowerCase().trim();
      list = list.filter(item => {
        const itemCat = (item.category || '').toLowerCase();
        const itemGroup = (item.group || '').toLowerCase();
        const itemName = (item.name || '').toLowerCase();
        return itemCat === catLower || itemGroup === catLower || itemName.includes(catLower);
      });
    }

    // Apply custom filter rules
    if (filterRules && filterRules.length > 0) {
      list = list.filter(item => {
        return filterRules.every(rule => {
          if (!rule.value || !rule.value.trim()) return true;
          const targetStr = rule.value.toLowerCase().trim();
          let itemVal: any = '';
          let isNumeric = false;

          switch (rule.field) {
            case 'skuCode':
            case 'code':
              itemVal = item.skuCode || item.code || item.itemCode || item._id || '';
              break;
            case 'name':
              itemVal = item.name || item.firmName || '';
              break;
            case 'brand':
              itemVal = item.brand || '';
              break;
            case 'category':
              itemVal = item.category || item.itemCategory || item.group || '';
              break;
            case 'unit':
            case 'uom':
              itemVal = item.unit || item.uom || item.unitOfMeasurement || '';
              break;
            case 'gsm':
              itemVal = Number(item.gsm) || 0;
              isNumeric = true;
              break;
            case 'pages':
              itemVal = Number(item.pages) || 0;
              isNumeric = true;
              break;
            case 'openingStock':
            case 'stock':
              itemVal = Number((item as any).presentStock || 0);
              isNumeric = true;
              break;
            case 'dimensions':
              itemVal = formatSize(item);
              break;
            case 'rate':
            case 'price':
              itemVal = Number(item.rate !== undefined ? item.rate : item.price !== undefined ? item.price : item.unitPrice) || 0;
              isNumeric = true;
              break;
            case 'hsn':
            case 'hsnCode':
              itemVal = item.hsn || item.hsnCode || '';
              break;
            default:
              itemVal = (item as any)[rule.field] !== undefined ? (item as any)[rule.field] : '';
              if (typeof itemVal === 'number') isNumeric = true;
          }

          if (itemVal === undefined || itemVal === null) itemVal = '';
          const valStr = String(itemVal).toLowerCase();
          const cleanTarget = targetStr.replace(/^[^a-z0-9]+/, '');

          switch (rule.operator) {
            case 'equals':
              if (isNumeric && !isNaN(Number(targetStr))) {
                return Number(itemVal) === Number(targetStr);
              }
              return valStr === targetStr;
            case 'contains':
              return valStr.includes(targetStr) || (cleanTarget.length >= 2 && valStr.includes(cleanTarget));
            case 'greater_than':
              return Number(itemVal) > Number(targetStr);
            case 'less_than':
              return Number(itemVal) < Number(targetStr);
            default:
              return valStr.includes(targetStr) || (cleanTarget.length >= 2 && valStr.includes(cleanTarget));
          }
        });
      });
    }

    // Apply sorting
    if (sortRules && sortRules.length > 0) {
      list.sort((a, b) => {
        for (const rule of sortRules) {
          let fieldA: any;
          let fieldB: any;

          if (rule.field.startsWith('custom_')) {
            const colName = rule.field.replace('custom_', '');
            fieldA = customColumnValues[`${a._id}_${colName}`] || '';
            fieldB = customColumnValues[`${b._id}_${colName}`] || '';
          } else if (rule.field === 'skuCode' || rule.field === 'code') {
            fieldA = a.skuCode || a.code || '';
            fieldB = b.skuCode || b.code || '';
            const comp = String(fieldA).localeCompare(String(fieldB), undefined, { numeric: true, sensitivity: 'base' });
            if (comp !== 0) return rule.order === 'asc' ? comp : -comp;
            continue;
          } else if (rule.field === 'size' || rule.field === 'dimensions') {
            fieldA = (a.width || 0) * (a.length || 0);
            fieldB = (b.width || 0) * (b.length || 0);
          } else if (rule.field === 'workOrders') {
            fieldA = getWorkOrderCount(a);
            fieldB = getWorkOrderCount(b);
          } else if (rule.field === 'dispatchOrders') {
            fieldA = getDispatchOrderCount(a);
            fieldB = getDispatchOrderCount(b);
          } else if (rule.field === 'category') {
            fieldA = a.category || a.itemCategory || a.group || '';
            fieldB = b.category || b.itemCategory || b.group || '';
          } else if (rule.field === 'pages') {
            fieldA = Number(a.pages) || 0;
            fieldB = Number(b.pages) || 0;
          } else if (rule.field === 'gsm') {
            fieldA = Number(a.gsm) || 0;
            fieldB = Number(b.gsm) || 0;
          } else if (rule.field === 'openingStock' || rule.field === 'stock') {
            fieldA = Number((a as any).presentStock || 0);
            fieldB = Number((b as any).presentStock || 0);
          } else if (rule.field === 'rate' || rule.field === 'price') {
            fieldA = Number(a.rate !== undefined ? a.rate : a.price !== undefined ? a.price : a.unitPrice) || 0;
            fieldB = Number(b.rate !== undefined ? b.rate : b.price !== undefined ? b.price : b.unitPrice) || 0;
          } else if (rule.field === 'altUnitConversion') {
            fieldA = a.altUnitConversion || 0;
            fieldB = b.altUnitConversion || 0;
          } else {
            fieldA = (a as any)[rule.field];
            fieldB = (b as any)[rule.field];
          }

          if (fieldA === undefined || fieldA === null) fieldA = '';
          if (fieldB === undefined || fieldB === null) fieldB = '';

          if (typeof fieldA === 'number' && typeof fieldB === 'number') {
            if (fieldA !== fieldB) return rule.order === 'asc' ? fieldA - fieldB : fieldB - fieldA;
          } else {
            const numA = Number(fieldA);
            const numB = Number(fieldB);
            if (!isNaN(numA) && !isNaN(numB) && fieldA !== '' && fieldB !== '') {
              if (numA !== numB) return rule.order === 'asc' ? numA - numB : numB - numA;
            }
            const strA = String(fieldA).localeCompare(String(fieldB), undefined, { numeric: true, sensitivity: 'base' });
            if (strA !== 0) return rule.order === 'asc' ? strA : -strA;
          }
        }
        return 0;
      });
    } else {
      // Natural sequential sort by SKU Code if no explicit sort rule
      list.sort((a, b) => {
        const codeA = a.skuCode || a.code || '';
        const codeB = b.skuCode || b.code || '';
        if (!codeA && !codeB) return (a.name || '').localeCompare(b.name || '');
        if (!codeA) return 1;
        if (!codeB) return -1;
        return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
      });
    }

    return list;
  }, [tabFilteredSkus, filterRules, sortRules]);

  // Full scrolling table list (pagination removed as requested)
  const paginatedSkus = filteredAndSortedSkus;

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

  const fetchRecycleBinSkus = async () => {
    if (!selectedCompany?._id) return;
    setLoadingRecycleBin(true);
    try {
      const data = await getSkusV2(selectedCompany._id, undefined, undefined, undefined, true);
      setRecycledSkus(data || []);
    } catch (err) {
      console.error('Failed to fetch recycle bin items:', err);
    } finally {
      setLoadingRecycleBin(false);
    }
  };

  const handleRestoreSku = async (sku: SkuV2) => {
    if (!sku._id || !selectedCompany?._id) return;
    try {
      await updateSkuV2(sku._id, { isDeleted: false, status: 'Active', company: selectedCompany._id });
      showToast(`Restored item '${sku.skuCode}' to active inventory`, 'success');
      fetchRecycleBinSkus();
      loadSkus(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to restore item', 'error');
    }
  };

  const handlePermanentDeleteSku = async (sku: SkuV2) => {
    if (!sku._id || !selectedCompany?._id) return;
    if (!window.confirm(`Permanently delete '${sku.skuCode}' (${sku.name})? This action CANNOT be undone.`)) return;
    try {
      await deleteSkuV2(sku._id, selectedCompany._id, true);
      showToast(`Permanently deleted item '${sku.skuCode}'`, 'success');
      fetchRecycleBinSkus();
      loadSkus(false);
    } catch (err: any) {
      showToast(err.response?.data?.msg || err.message || 'Failed to permanently delete item', 'error');
    }
  };

  useEffect(() => {
    if (showActivityLog) {
      fetchActivityLogs();
    }
  }, [showActivityLog]);

  const [isRenumbering, setIsRenumbering] = useState(false);
  const autoRenumberedRef = useRef(false);

  const handleRenumberSkus = async (silent = false) => {
    if (!selectedCompany?._id || isRenumbering) return;
    if (!silent && !window.confirm("Re-sequence all existing SKU codes into clean continuous series (FG-001..., SM-001..., RM-001...)?")) {
      return;
    }
    setIsRenumbering(true);
    try {
      // Execute fast atomic backend bulk renumbering
      const res = await renumberSkusV2(selectedCompany._id);
      
      await loadSkus(false);

      if (!silent) {
        showToast(res?.msg || "Renumbered SKUs into continuous series successfully!", "success");
      }
    } catch (err: any) {
      console.error('Renumbering error:', err);
      if (!silent) showToast(err.response?.data?.msg || "Failed to re-sequence SKUs", "error");
    } finally {
      setIsRenumbering(false);
    }
  };

  const getExportDataForSkus = (targetSkus: SkuV2[]) => {
    const cleanVal = (v: any) => {
      if (v === undefined || v === null || v === '' || v === '—' || String(v).includes('â€')) return '';
      return v;
    };

    return targetSkus.map(s => {
      if (activeMainTab === 'products') {
        return {
          'ID / SKU Code': s.skuCode || '',
          'SKU NAME': s.name || '',
          'PAGES': cleanVal(s.pages),
          'BRAND': cleanVal(s.brand),
          'RULE TYPE': cleanVal(s.ruleType),
          'Category': s.category || s.group || 'Products',
          'UOM': s.unit || 'Pcs',
          'AUOM (Alt Unit)': cleanVal(s.altUnit),
          'Con Rate': cleanVal(s.altUnitConversion),
          'GSM': cleanVal(s.gsm),
          'WIDTH (CM)': cleanVal(s.width),
          'LENGTH (CM)': cleanVal(s.length),
          'Min Stock Level': s.minStockLevel || 0,
          'Reorder Level': cleanVal((s as any).reorderLevel),
          'Status': s.status || 'Active',
          'Preferred Vendor': cleanVal((s as any).preferredVendor)
        };
      } else if (activeMainTab === 'semi') {
        return {
          'ID / SKU Code': s.skuCode || '',
          'SKU NAME': s.name || '',
          'PAGES': cleanVal(s.pages),
          'TITLE': cleanVal((s as any).title || s.brand),
          'RULE TYPE': cleanVal(s.ruleType),
          'Category': s.category || s.group || 'Semi',
          'UOM': s.unit || 'Ream',
          'AUOM (Alt Unit)': cleanVal(s.altUnit),
          'Con Rate': cleanVal(s.altUnitConversion),
          'GSM': cleanVal(s.gsm),
          'WIDTH (CM)': cleanVal(s.width),
          'LENGTH (CM)': cleanVal(s.length),
          'Min Stock Level': s.minStockLevel || 0,
          'Reorder Level': cleanVal((s as any).reorderLevel),
          'Status': s.status || 'Active',
          'Preferred Vendor': cleanVal((s as any).preferredVendor)
        };
      } else {
        // Raw Materials
        return {
          'ID / SKU Code': s.skuCode || '',
          'SKU NAME': s.name || '',
          'TITLE': cleanVal((s as any).title || s.name),
          'Category': s.category || s.group || 'Materials',
          'Paper Type': s.paperType || 'None',
          'GSM': cleanVal(s.gsm),
          'WIDTH (CM)': cleanVal(s.width),
          'LENGTH (CM)': cleanVal(s.length),
          'STANDARD SHEETS / REAM': cleanVal(s.pages),
          'UOM': s.unit || 'Kg',
          'Min Stock Level': s.minStockLevel || 0,
          'Reorder Level': cleanVal((s as any).reorderLevel),
          'Status': s.status || 'Active',
          'Preferred Vendor': cleanVal((s as any).preferredVendor)
        };
      }
    });
  };

  const handleExportExcel = () => {
    const targetSkus = selectedIds.length > 0 
      ? filteredAndSortedSkus.filter(s => selectedIds.includes(s._id!))
      : filteredAndSortedSkus;

    if (targetSkus.length === 0) {
      showToast('No items available to export', 'error');
      return;
    }
    setIsExporting(true);
    try {
      const exportData = getExportDataForSkus(targetSkus);
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Items');
      const suffix = selectedIds.length > 0 ? `_selected_${selectedIds.length}` : '';
      XLSX.writeFile(workbook, `Items_Export_${activeMainTab}${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast(`Exported ${targetSkus.length} ${selectedIds.length > 0 ? 'selected ' : ''}items to Excel`, 'success');
    } catch (err) {
      showToast('Failed to export Excel', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = () => {
    const targetSkus = selectedIds.length > 0 
      ? filteredAndSortedSkus.filter(s => selectedIds.includes(s._id!))
      : filteredAndSortedSkus;

    if (targetSkus.length === 0) {
      showToast('No items available to export', 'error');
      return;
    }
    setIsExporting(true);
    try {
      const exportData = getExportDataForSkus(targetSkus);
      if (exportData.length === 0) return;

      const headers = Object.keys(exportData[0]);
      const csvContent = '\uFEFF' + [
        headers.join(','),
        ...exportData.map(row => headers.map(h => {
          const clean = String((row as any)[h] ?? '').replace(/"/g, '""');
          return clean.includes(',') || clean.includes('\n') ? `"${clean}"` : clean;
        }).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      const suffix = selectedIds.length > 0 ? `_selected_${selectedIds.length}` : '';
      link.setAttribute('download', `Items_Export_${activeMainTab}${suffix}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Exported ${targetSkus.length} ${selectedIds.length > 0 ? 'selected ' : ''}items to CSV`, 'success');
    } catch (err) {
      showToast('Failed to export CSV', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const getTabLabel = (tab: string) => {
    switch (tab) {
      case 'products': return 'Products';
      case 'materials': return 'Materials';
      case 'semi': return 'Semi';
      case 'categories': return 'Categories';
      case 'settings': return 'Settings';
      default: return 'Items';
    }
  };

  const handleExportPDF = () => {
    const targetSkus = selectedIds.length > 0 
      ? filteredAndSortedSkus.filter(s => selectedIds.includes(s._id!))
      : filteredAndSortedSkus;

    if (targetSkus.length === 0) {
      showToast('No records available to export PDF', 'info');
      return;
    }

    const tabTitle = getTabLabel(activeMainTab).toUpperCase();
    const title = `${tabTitle} MASTER REPORT ${selectedIds.length > 0 ? `(${selectedIds.length} SELECTED)` : ''}`;
    const companyName = selectedCompany?.name || 'SKBW ERP';
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      doc.setFontSize(14);
      doc.setTextColor(29, 78, 216);
      doc.setFont('helvetica', 'bold');
      doc.text(`${companyName} — ${title}`, 14, 14);

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated on ${dateStr} • Total Records: ${targetSkus.length}`, 14, 20);

      const isRawOrSemiTab = activeMainTab === 'materials' || activeMainTab === 'semi';
      const headers = isRawOrSemiTab
        ? ['#', 'Item Code', 'Item Name', 'Category', 'UOM', 'GSM', 'Pages', 'Status']
        : ['#', 'Item Code', 'Item Name', 'Category', 'UOM', 'Con Rate', 'AUOM', 'GSM', 'Pages', 'Status'];

      const rows = targetSkus.map((item, idx) => {
        if (isRawOrSemiTab) {
          return [
            idx + 1,
            item.skuCode || '—',
            item.name || '—',
            item.category || item.group || (activeMainTab === 'semi' ? 'Semi Finished' : 'Raw Material'),
            item.unit || (activeMainTab === 'semi' ? 'Ream' : 'Kg'),
            item.gsm || '—',
            item.pages || '—',
            item.status || 'Active'
          ];
        }

        const conRateStr = item.altUnit && item.altUnitConversion
          ? `1 ${item.unit || 'Pcs'} = ${item.altUnitConversion} ${item.altUnit}`
          : '—';

        return [
          idx + 1,
          item.skuCode || '—',
          item.name || '—',
          item.category || 'Finished Goods',
          item.unit || 'Pcs',
          conRateStr,
          item.altUnit || '—',
          item.gsm || '—',
          item.pages || '—',
          item.status || 'Active'
        ];
      });

      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: 25,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [29, 78, 216], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 }
      });

      doc.save(`${companyName.replace(/\s+/g, '_')}_${tabTitle}_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast(`Exported PDF for ${targetSkus.length} ${selectedIds.length > 0 ? 'selected ' : ''}items`, 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('Failed to export PDF', 'error');
    }
  };

  // Bulk Edit & Bulk Delete Handlers
  const handleBulkEditSkus = async () => {
    if (selectedIds.length === 0 || !selectedCompany?._id) return;
    const updates: any = {};
    if (bulkEditFields.status) updates.status = bulkEditValues.status;
    if (bulkEditFields.category) updates.category = bulkEditValues.category;
    if (bulkEditFields.altUnit) updates.altUnit = bulkEditValues.altUnit;
    if (bulkEditFields.unit) updates.unit = bulkEditValues.unit;
    if (bulkEditFields.gsm) updates.gsm = bulkEditValues.gsm;

    if (Object.keys(updates).length === 0) {
      showToast('Please select at least one field to update', 'warning');
      return;
    }

    setIsBulkOperating(true);
    try {
      await bulkUpdateSkusV2(selectedIds, selectedCompany._id, updates);
      showToast(`Successfully updated ${selectedIds.length} items`, 'success');
      setShowBulkEditModal(false);
      setSelectedIds([]);
      loadSkus(false);
    } catch (err: any) {
      showToast(err?.response?.data?.msg || err?.message || 'Failed to update items', 'error');
    } finally {
      setIsBulkOperating(false);
    }
  };

  const handleBulkDeleteSkus = async () => {
    if (selectedIds.length === 0 || !selectedCompany?._id) return;
    setIsBulkOperating(true);
    try {
      await bulkDeleteSkusV2(selectedIds, selectedCompany._id);
      showToast(`Moved ${selectedIds.length} items to Recycle Bin`, 'success');
      setShowBulkDeleteModal(false);
      setSelectedIds([]);
      loadSkus(false);
    } catch (err: any) {
      showToast(err?.response?.data?.msg || err?.message || 'Failed to delete items', 'error');
    } finally {
      setIsBulkOperating(false);
    }
  };

  const handleDownloadSampleCSV = () => {
    let headers: string[] = [];
    let sampleRows: string[][] = [];

    if (activeMainTab === 'products') {
      headers = [
        'ID / SKU Code',
        'SKU NAME',
        'PAGES',
        'BRAND',
        'RULE TYPE',
        'Category',
        'UOM',
        'AUOM (Alt Unit)',
        'Con Rate',
        'GSM',
        'WIDTH (CM)',
        'LENGTH (CM)',
        'Min Stock Level',
        'Reorder Level',
        'Status',
        'Preferred Vendor'
      ];
      sampleRows = [
        ['FG-001', 'Bestfriend (UR)', '132', 'Bestfriend', 'UR', 'Longbooks', 'Pcs', 'Box', '500', '52', '14.25', '35', '50', '20', 'Active', ''],
        ['FG-002', '142P Bestfriend (UR)', '142', 'Bestfriend', 'UR', 'Executive Diaries', 'Pcs', 'Box', '200', '52', '57', '70', '50', '20', 'Active', ''],
        ['FG-003', 'Deluxe Spiral Notebook A4', '192', 'Bestfriend', 'Plain', 'Notebooks', 'Pcs', 'Box', '24', '70', '21', '29.7', '100', '50', 'Active', '']
      ];
    } else if (activeMainTab === 'semi') {
      headers = [
        'ID / SKU Code',
        'SKU NAME',
        'TITLE',
        'RULE TYPE',
        'Category',
        'UOM',
        'AUOM (Alt Unit)',
        'Con Rate',
        'GSM',
        'WIDTH (CM)',
        'LENGTH (CM)',
        'Min Stock Level',
        'Reorder Level',
        'Status',
        'Preferred Vendor'
      ];
      sampleRows = [
        ['SM-001', 'Akshay Inner Form 52 GSM 14.25 x 35 CM (SR)', 'Akshay Inner Form', 'Single Line', 'Inner Forms', 'Ream', 'Bundles', '50', '52', '14.25', '35', '100', '50', 'Active', 'Apex Print Pack'],
        ['SM-002', 'Cover Board 250 GSM 57 x 70 CM', 'Cover Board', 'Plain', 'Covers', 'Pcs', 'Bundles', '100', '250', '57', '70', '200', '100', 'Active', 'Sunrise Laminators']
      ];
    } else {
      // Raw materials
      headers = [
        'ID / SKU Code',
        'SKU NAME',
        'TITLE',
        'Category',
        'Paper Type',
        'GSM',
        'WIDTH (CM)',
        'LENGTH (CM)',
        'STANDARD SHEETS / REAM',
        'UOM',
        'Min Stock Level',
        'Reorder Level',
        'Status',
        'Preferred Vendor'
      ];
      sampleRows = [
        ['RM-001', 'Maplitho Reel 70 GSM 84 CM', 'Maplitho', 'Paper Reels', 'Reels', '70', '84', '', '', 'Kg', '300', '100', 'Active', 'Bhavani Paper Mill'],
        ['RM-002', 'Duplex Board Sheet 300 GSM 57 x 70 CM (500 Sheets)', 'Duplex Board', 'Duplex Cover Board', 'Sheets', '300', '57', '70', '500', 'Kg', '500', '200', 'Active', 'Apex Board Traders'],
        ['RM-003', 'Craft Paper Reel 80 GSM 90 CM', 'Craft Paper', 'Paper Reels', 'Reels', '80', '90', '', '', 'Kg', '200', '50', 'Active', 'Sri Balaji Paper Mart']
      ];
    }

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...sampleRows.map(row => row.map(val => {
        const clean = String(val ?? '').replace(/"/g, '""');
        return clean.includes(',') || clean.includes('\n') ? `"${clean}"` : clean;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `sample_${activeMainTab}_import_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Downloaded sample template for ${getTabLabel(activeMainTab)}`, 'success');
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompany?._id) return;
    setIsImporting(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (!rawRows || rawRows.length <= 1) {
        showToast('Uploaded file is empty or missing data rows', 'error');
        setIsImporting(false);
        return;
      }

      const headers: string[] = (rawRows[0] || []).map((h: any) => String(h || '').trim());
      const headerMap: Record<string, number> = {};
      headers.forEach((h, idx) => {
        const cleanH = h.toLowerCase().replace(/[^a-z0-9]/g, '');
        headerMap[cleanH] = idx;
      });

      // Scan all existing items to find the current highest sequential number per prefix
      const maxSeqMap: Record<string, number> = {};
      (skus || []).forEach(s => {
        if (s.isDeleted) return;
        const code = String(s.skuCode || '').trim();
        const match = code.match(/^([A-Za-z]+)[-_]?(\d{1,6})$/);
        if (match) {
          const pref = match[1].toUpperCase();
          const num = parseInt(match[2], 10);
          if (!isNaN(num) && num < 100000) {
            maxSeqMap[pref] = Math.max(maxSeqMap[pref] || 0, num);
          }
        }
      });

      // Also check localStorage for tracked max sequence
      ['RM', 'FG', 'SFG', 'SM', 'NB', 'DB'].forEach(prefix => {
        try {
          const key = `skbw_max_sku_seq_${selectedCompany._id}_${prefix}`;
          const val = localStorage.getItem(key);
          if (val) {
            const num = parseInt(val, 10);
            if (!isNaN(num) && num < 100000) {
              maxSeqMap[prefix] = Math.max(maxSeqMap[prefix] || 0, num);
            }
          }
        } catch (_) {}
      });

      const itemsToCreate: any[] = [];
      const dynamicCategoriesToCreate: { name: string; type: 'products' | 'materials' | 'semi'; uom: string }[] = [];
      const dynamicBrandsToCreate: string[] = [];
      const dynamicUnitsToCreate: string[] = [];
      const dynamicRuleTypesToCreate: string[] = [];

      for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0 || !row.some(Boolean)) continue;

        const getFieldVal = (...aliases: string[]) => {
          for (const alias of aliases) {
            const cleanK = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
            const idx = headerMap[cleanK];
            if (idx !== undefined && row[idx] !== undefined && row[idx] !== null) {
              let valStr = String(row[idx]).trim();
              if (
                valStr === '—' || 
                valStr === '–' || 
                valStr === '-' || 
                valStr.includes('â€') || 
                valStr.toLowerCase() === 'n/a' || 
                valStr.toLowerCase() === 'none' || 
                valStr.toLowerCase() === 'null' ||
                valStr.toLowerCase() === 'undefined'
              ) {
                return '';
              }
              if (valStr !== '') return valStr;
            }
          }
          return '';
        };

        const explicitSku = getFieldVal(
          'idskucode', 'skucode', 'itemcode', 'code', 'id', 'itemcodeskucode',
          'productcode', 'skuid', 'itemid', 'materialcode', 'semicode', 'sku',
          'item_code', 'sku_code'
        );
        let skuCode = explicitSku;

        // Ignore auto-generated timestamp SKU codes from CSV (e.g. SKU-1789470761533-1) so we auto-assign continuous sequence code
        if (skuCode && (/^SKU-\d{8,}/i.test(skuCode.trim()) || /^TEMP-/i.test(skuCode.trim()))) {
          skuCode = '';
        }

        if (!skuCode) {
          const firstColStr = String(row[0] || '').trim();
          if (firstColStr && !/^\d+$/.test(firstColStr) && !/^SKU-\d{8,}/i.test(firstColStr) && !/^TEMP-/i.test(firstColStr)) {
            skuCode = firstColStr;
          }
        }

        const defaultTabCat = activeMainTab === 'materials' ? 'Raw Material' : activeMainTab === 'semi' ? 'Semi Finished' : 'Finished Goods';
        const rawCategory = getFieldVal('category', 'itemcategory', 'group', 'itemgroup', 'categoryname');
        const category = (rawCategory || defaultTabCat).trim();
        const group = rawCategory || category;

        const catLower = (category || '').toLowerCase();
        let defaultPrefix = 'FG';
        let targetSection: 'products' | 'materials' | 'semi' = 'products';

        if (catLower.includes('semi') || catLower.includes('wip') || catLower.includes('sub') || activeMainTab === 'semi') {
          defaultPrefix = 'SM';
          targetSection = 'semi';
        } else if (catLower.includes('raw') || catLower.includes('material') || catLower.includes('reel') || catLower.includes('board') || catLower.includes('paper') || activeMainTab === 'materials') {
          defaultPrefix = 'RM';
          targetSection = 'materials';
        } else {
          defaultPrefix = 'FG';
          targetSection = 'products';
        }

        const unit = getFieldVal('uom', 'unit', 'primaryuom', 'primaryunit', 'baseunit', 'mainunit') || (targetSection === 'materials' ? 'Kg' : targetSection === 'semi' ? 'Ream' : 'Pcs');

        // Dynamic category registration if category is new
        if (category) {
          const existsInCatData = categoriesData.some(c => c.name.toLowerCase().trim() === catLower);
          const alreadyQueued = dynamicCategoriesToCreate.some(c => c.name.toLowerCase().trim() === catLower);
          if (!existsInCatData && !alreadyQueued) {
            dynamicCategoriesToCreate.push({
              name: category,
              type: targetSection,
              uom: unit
            });
          }
        }

        if (skuCode) {
          // If explicit SKU code is provided, update sequence tracker for its prefix
          const match = skuCode.match(/^([A-Za-z]+)[-_]?(\d{1,6})$/);
          if (match) {
            const pref = match[1].toUpperCase();
            const num = parseInt(match[2], 10);
            if (!isNaN(num) && num < 100000) {
              maxSeqMap[pref] = Math.max(maxSeqMap[pref] || 0, num);
            }
          }
        } else {
          // Auto-generate code continuing monotonically from current highest number
          const pref = defaultPrefix.toUpperCase();
          const nextSeq = (maxSeqMap[pref] || 0) + 1;
          maxSeqMap[pref] = nextSeq;
          skuCode = `${defaultPrefix}-${String(nextSeq).padStart(3, '0')}`;
        }

        const name = getFieldVal('skuname', 'itemname', 'name', 'materialname', 'productname', 'title') || String(row[1] || '').trim();
        if (!name && !skuCode) continue;

        let altUnit = getFieldVal('auomaltunit', 'auom', 'altunit', 'secondaryuom', 'secondaryunit', 'alternateunit', 'auomsecondaryunit') || '';
        if (
          !altUnit || 
          altUnit.toLowerCase().trim() === unit.toLowerCase().trim() ||
          altUnit === '—' ||
          altUnit === '-' ||
          altUnit.includes('â€')
        ) {
          altUnit = '';
        }

        // Extract Con Rate / Conversion Rate
        const rawConRate = getFieldVal('conrate', 'conversionrate', 'altunitconversion', 'conversion', 'rate', 'factor');
        let altUnitConversion: number | undefined = undefined;
        if (rawConRate) {
          const numDirect = Number(rawConRate);
          if (!isNaN(numDirect) && numDirect > 0) {
            altUnitConversion = numDirect;
          } else {
            const eqMatch = rawConRate.match(/=\s*(\d+(?:\.\d+)?)/);
            if (eqMatch) {
              altUnitConversion = Number(eqMatch[1]);
            } else {
              const allNums = rawConRate.match(/\d+(?:\.\d+)?/g);
              if (allNums && allNums.length > 0) {
                altUnitConversion = Number(allNums[allNums.length - 1]);
              }
            }
          }
        }

        // Extract GSM
        const rawGsm = getFieldVal('gsm', 'papergsm', 'grammage');
        const gsmMatch = rawGsm.match(/(\d+(?:\.\d+)?)/);
        const gsm = gsmMatch ? Number(gsmMatch[1]) : (rawGsm ? Number(rawGsm) || 0 : undefined);

        // Extract Dimensions / Size
        let width = Number(getFieldVal('widthcm', 'width', 'widthmm', 'breadth', 'w')) || undefined;
        let length = Number(getFieldVal('lengthcm', 'length', 'lengthmm', 'height', 'l')) || undefined;
        const rawSize = getFieldVal('size', 'dimensions', 'dimension', 'booksize', 'cutsize');
        if ((!width || !length) && rawSize) {
          const dimMatch = rawSize.match(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)/);
          if (dimMatch) {
            if (!width) width = Number(dimMatch[1]);
            if (!length) length = Number(dimMatch[2]);
          } else {
            const singleDim = rawSize.match(/(\d+(?:\.\d+)?)/);
            if (singleDim && !width) {
              width = Number(singleDim[1]);
            }
          }
        }

        // Extract Pages / Standard Sheets
        const rawPages = getFieldVal('pages', 'standardsheetsream', 'standardsheets', 'sheetsperream', 'sheetsream', 'pagessheets', 'sheets', 'reamsheets', 'bookpages', 'sheetcount');
        const pagesMatch = rawPages.match(/(\d+)/);
        const pages = pagesMatch ? Number(pagesMatch[1]) : (rawPages ? Number(rawPages) || undefined : undefined);

        // Extract Brand, Rule Type & Title
        const brand = getFieldVal('brand', 'brandname', 'make');
        const ruleType = getFieldVal('ruletype', 'rule', 'ruling');
        const title = getFieldVal('title', 'itemtitle', 'description', 'itemdescription');

        if (unit && unit.trim()) {
          const uTrim = unit.trim();
          if (!dynamicUnitsToCreate.some(u => u.toLowerCase() === uTrim.toLowerCase())) {
            dynamicUnitsToCreate.push(uTrim);
          }
        }
        if (altUnit && altUnit.trim()) {
          const auTrim = altUnit.trim();
          if (!dynamicUnitsToCreate.some(u => u.toLowerCase() === auTrim.toLowerCase())) {
            dynamicUnitsToCreate.push(auTrim);
          }
        }
        if (ruleType && ruleType.trim()) {
          const rtTrim = ruleType.trim();
          if (!dynamicRuleTypesToCreate.some(r => r.toLowerCase() === rtTrim.toLowerCase())) {
            dynamicRuleTypesToCreate.push(rtTrim);
          }
        }

        if (brand && brand.trim()) {
          const brandTrimmed = brand.trim();
          const brandLower = brandTrimmed.toLowerCase();
          if (!dynamicBrandsToCreate.some(b => b.toLowerCase() === brandLower)) {
            dynamicBrandsToCreate.push(brandTrimmed);
          }
        }

        // Extract Paper Type
        const rawPaperType = getFieldVal('papertype', 'papertypeform', 'type', 'materialtype');
        let paperType: 'Reels' | 'Sheets' | 'None' = 'None';
        if (/reel/i.test(rawPaperType)) {
          paperType = 'Reels';
        } else if (/sheet/i.test(rawPaperType) || /board/i.test(rawPaperType)) {
          paperType = 'Sheets';
        } else if (activeMainTab === 'materials') {
          if ((rawCategory || '').toLowerCase().includes('reel') || (name || '').toLowerCase().includes('reel')) paperType = 'Reels';
          else if ((rawCategory || '').toLowerCase().includes('board') || (rawCategory || '').toLowerCase().includes('sheet')) paperType = 'Sheets';
          else paperType = 'Reels';
        }

        // Extract Min Stock
        const rawMinStock = getFieldVal('minstocklevel', 'minstock', 'minimumstock', 'lowstockalert');
        const minStockMatch = rawMinStock.match(/(\d+(?:\.\d+)?)/);
        const minStockLevel = minStockMatch ? Number(minStockMatch[1]) : (rawMinStock ? Number(rawMinStock) || undefined : undefined);

        // Extract Reorder Level & Preferred Vendor
        const rawReorder = getFieldVal('reorderlevel', 'reorder');
        const reorderLevel = rawReorder ? Number(rawReorder) || undefined : undefined;
        const preferredVendor = getFieldVal('preferredvendor', 'vendor', 'preferred_vendor', 'supplier', 'preferredsupplier') || '';

        // Extract Status
        const rawStatus = getFieldVal('status', 'itemstatus', 'state').toLowerCase();
        const status: 'Active' | 'Inactive' = rawStatus === 'inactive' ? 'Inactive' : 'Active';

        itemsToCreate.push({
          company: selectedCompany._id,
          skuCode: skuCode || `${defaultPrefix}-${String(((maxSeqMap[defaultPrefix.toUpperCase()] = (maxSeqMap[defaultPrefix.toUpperCase()] || 0) + 1))).padStart(3, '0')}`,
          name: name || skuCode,
          category,
          group,
          unit,
          altUnit: altUnit || undefined,
          altUnitConversion,
          gsm,
          pages,
          width,
          length,
          paperType,
          openingStock: 0,
          presentStock: 0,
          minStockLevel,
          reorderLevel,
          preferredVendor,
          initialLocation: 'SKBW',
          defaultLocation: 'SKBW',
          status,
          brand: brand || undefined,
          ruleType: ruleType || undefined,
          title: title || undefined
        });
      }

      // Save dynamically discovered new categories into MongoDB and state
      if (dynamicCategoriesToCreate.length > 0) {
        const newCategoryCards: CategoryCardData[] = dynamicCategoriesToCreate.map(dc => ({
          id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          name: dc.name,
          type: dc.type,
          uom: dc.uom,
          fields: ['Type']
        }));
        const updatedCatCards = [...categoriesData, ...newCategoryCards];
        setCategoriesData(updatedCatCards);
        await saveCategoriesToDb(updatedCatCards);
      }

      // Save dynamically discovered new units, rule types, and brands to MongoDB metadata
      if (dynamicBrandsToCreate.length > 0 || dynamicUnitsToCreate.length > 0 || dynamicRuleTypesToCreate.length > 0) {
        try {
          const meta = await getMetadataV2(selectedCompany._id).catch(() => null);
          const existingBrands = Array.isArray(meta?.brands) ? meta.brands : [];
          const brandSet = new Set(existingBrands.map((b: string) => b.trim().toLowerCase()));
          const brandsToAdd = dynamicBrandsToCreate.filter(b => !brandSet.has(b.toLowerCase()));
          const mergedBrands = [...existingBrands, ...brandsToAdd];

          const existingUnits = Array.isArray(meta?.units) ? meta.units : [];
          const unitSet = new Set(existingUnits.map((u: string) => u.trim().toLowerCase()));
          const unitsToAdd = dynamicUnitsToCreate.filter(u => !unitSet.has(u.toLowerCase()));
          const mergedUnits = normalizeAndDeduplicateUnits([...existingUnits, ...unitsToAdd]);

          const existingRuleTypes = Array.isArray(meta?.ruleTypes) ? meta.ruleTypes : [];
          const ruleTypeSet = new Set(existingRuleTypes.map((r: string) => r.trim().toLowerCase()));
          const ruleTypesToAdd = dynamicRuleTypesToCreate.filter(r => !ruleTypeSet.has(r.toLowerCase()));
          const mergedRuleTypes = Array.from(new Set([...existingRuleTypes, ...ruleTypesToAdd]));

          if (brandsToAdd.length > 0 || unitsToAdd.length > 0 || ruleTypesToAdd.length > 0) {
            await updateMetadataV2({
              companyId: selectedCompany._id,
              categories: meta?.categories,
              units: mergedUnits,
              ruleTypes: mergedRuleTypes,
              groups: meta?.groups,
              brands: mergedBrands,
              categoryFields: meta?.categoryFields,
              standardizedSheets: meta?.standardizedSheets
            });
            window.dispatchEvent(new CustomEvent('skbw_metadata_updated'));
          }
        } catch (metaErr) {
          console.warn('Failed to sync imported metadata:', metaErr);
        }
      }

      // Save updated sequence counters to localStorage so manual drawer creation seamlessly continues
      Object.entries(maxSeqMap).forEach(([pref, maxSeq]) => {
        try {
          const key = `skbw_max_sku_seq_${selectedCompany._id}_${pref}`;
          localStorage.setItem(key, String(maxSeq));
        } catch (_) {}
      });

      if (itemsToCreate.length === 0) {
        showToast('No valid item records parsed from file', 'warning');
        setIsImporting(false);
        return;
      }

      let createdCount = 0;
      let updatedCount = 0;

      // Instant fast bulk import in single atomic batch
      let bulkSucceeded = false;
      try {
        const bulkRes = await bulkImportSkusV2(itemsToCreate, selectedCompany._id);
        if (bulkRes && (bulkRes.importedCount !== undefined || bulkRes.msg)) {
          bulkSucceeded = true;
          showToast(bulkRes.msg || `Successfully processed ${itemsToCreate.length} item(s)!`, 'success');
        }
      } catch (bulkErr) {
        console.warn('Bulk import endpoint returned error, falling back to per-item upsert:', bulkErr);
      }

      // Fallback: per-item create / update if bulkWrite wasn't processed
      if (!bulkSucceeded) {
        for (const item of itemsToCreate) {
          try {
            const existingItem = skus.find(s => (s.skuCode || '').toLowerCase().trim() === item.skuCode.toLowerCase().trim());
            if (existingItem && existingItem._id) {
              await updateSkuV2(existingItem._id, item);
              updatedCount++;
            } else {
              await createSkuV2(item);
              createdCount++;
            }
          } catch (itemErr) {
            console.error('Failed to import SKU row:', item, itemErr);
          }
        }

        const summaryMsg = updatedCount > 0 
          ? `Successfully imported: ${createdCount} created, ${updatedCount} updated!`
          : `Successfully imported ${createdCount} item(s) into database!`;
        showToast(summaryMsg, 'success');
      }

      createActivityLog({
        action: 'IMPORT',
        entityType: 'SkuV2',
        entityName: `${itemsToCreate.length} items imported`,
        details: `Imported ${itemsToCreate.length} items into ${activeMainTab} via file import`,
        company: selectedCompany?._id
      }).catch(() => {});

      await loadSkus(false);
    } catch (err: any) {
      console.error('Import failed:', err);
      showToast(err.message || 'Failed to import file', 'error');
    } finally {
      setIsImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleFindDuplicates = () => {
    setIsScanningDuplicates(true);
    try {
      const listToScan = tabFilteredSkus.length > 0 ? tabFilteredSkus : skus;
      const groups: { field: string; value: string; items: SkuV2[] }[] = [];

      const codeMap = new Map<string, SkuV2[]>();
      const nameMap = new Map<string, SkuV2[]>();

      listToScan.forEach(item => {
        const code = (item.skuCode || '').trim().toLowerCase();
        const name = (item.name || '').trim().toLowerCase();

        if (code && code !== '-' && code !== 'n/a' && code !== 'none') {
          if (!codeMap.has(code)) codeMap.set(code, []);
          codeMap.get(code)!.push(item);
        }

        if (name && name !== '-' && name !== 'n/a' && name !== 'none') {
          if (!nameMap.has(name)) nameMap.set(name, []);
          nameMap.get(name)!.push(item);
        }
      });

      codeMap.forEach((items) => {
        if (items.length > 1) {
          groups.push({ field: 'SKU Code', value: items[0].skuCode, items });
        }
      });

      nameMap.forEach((items) => {
        if (items.length > 1) {
          const ids = new Set(items.map(it => it._id));
          const alreadyAdded = groups.some(g => g.items.length === items.length && g.items.every(it => ids.has(it._id)));
          if (!alreadyAdded) {
            groups.push({ field: 'Item Name', value: items[0].name, items });
          }
        }
      });

      setDuplicateGroups(groups);
      setHighlightedDuplicateIdx(0);
      setShowDuplicatesModal(true);

      if (groups.length === 0) {
        showToast(`No duplicate items found! All ${getTabLabel(activeMainTab)} are unique.`, 'success');
      } else {
        showToast(`Found ${groups.length} duplicate group(s) in ${getTabLabel(activeMainTab)}!`, 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to scan for duplicates', 'error');
    } finally {
      setIsScanningDuplicates(false);
    }
  };

  const handleDeleteDuplicateItem = async (sku: SkuV2) => {
    if (!sku._id) return;
    try {
      if (sku._id.startsWith('demo-')) {
        showToast(`Deleted item ${sku.skuCode}`, 'success');
        setDuplicateGroups(prev => prev.map(g => ({
          ...g,
          items: g.items.filter(it => it._id !== sku._id)
        })).filter(g => g.items.length > 1));
        setSkus(prev => prev.filter(s => s._id !== sku._id));
        return;
      }

      // Record sequence so deleted ID is never reused (only for clean sequential codes < 10000)
      const numMatch = (sku.skuCode || '').match(/^([A-Z]+)-(\d{1,4})$/i);
      if (numMatch && selectedCompany?._id) {
        const p = numMatch[1].toUpperCase();
        const n = parseInt(numMatch[2], 10);
        if (!isNaN(n) && n > 0 && n < 10000) {
          const localMaxKey = `skbw_max_sku_seq_${selectedCompany._id}_${p}`;
          const currentMax = parseInt(localStorage.getItem(localMaxKey) || '0', 10);
          if (!isNaN(currentMax) && currentMax >= 10000) {
            localStorage.setItem(localMaxKey, String(n));
          } else if (!isNaN(n) && n > currentMax) {
            localStorage.setItem(localMaxKey, String(n));
          }
        }
      }

      await deleteSkuV2(sku._id, selectedCompany?._id || '');
      showToast(`Deleted item ${sku.skuCode}`, 'success');
      setDuplicateGroups(prev => prev.map(g => ({
        ...g,
        items: g.items.filter(it => it._id !== sku._id)
      })).filter(g => g.items.length > 1));
      loadSkus(false);
    } catch (err: any) {
      if (err.response?.status === 404) {
        showToast(`Deleted item ${sku.skuCode}`, 'success');
        setDuplicateGroups(prev => prev.map(g => ({
          ...g,
          items: g.items.filter(it => it._id !== sku._id)
        })).filter(g => g.items.length > 1));
        setSkus(prev => prev.filter(s => s._id !== sku._id));
        return;
      }
      showToast(err.message || 'Failed to delete item', 'error');
    }
  };

  // Delete Single SKU
  const handleDeleteSku = async () => {
    if (!deleteConfirmSku?._id) return;
    try {
      if (deleteConfirmSku._id.startsWith('demo-')) {
        showToast(`Item '${deleteConfirmSku.skuCode}' deleted`, 'success');
        const deletedId = deleteConfirmSku._id;
        setDeleteConfirmSku(null);
        setSkus(prev => prev.filter(s => s._id !== deletedId));
        return;
      }

      // Record sequence so deleted ID is never reused (only for clean sequential codes < 10000)
      if (deleteConfirmSku.skuCode && selectedCompany?._id) {
        const numMatch = deleteConfirmSku.skuCode.match(/^([A-Z]+)-(\d{1,4})$/i);
        if (numMatch) {
          const p = numMatch[1].toUpperCase();
          const n = parseInt(numMatch[2], 10);
          if (!isNaN(n) && n > 0 && n < 10000) {
            const localMaxKey = `skbw_max_sku_seq_${selectedCompany._id}_${p}`;
            const currentMax = parseInt(localStorage.getItem(localMaxKey) || '0', 10);
            if (!isNaN(currentMax) && currentMax >= 10000) {
              localStorage.setItem(localMaxKey, String(n));
            } else if (!isNaN(n) && n > currentMax) {
              localStorage.setItem(localMaxKey, String(n));
            }
          }
        }
      }

      const targetCompanyId = selectedCompany?._id || (typeof deleteConfirmSku.company === 'object' ? (deleteConfirmSku.company as any)._id : deleteConfirmSku.company) || '';
      await deleteSkuV2(deleteConfirmSku._id, targetCompanyId);
      showToast(`Item '${deleteConfirmSku.skuCode}' deleted`, 'success');
      const deletedId = deleteConfirmSku._id;
      setDeleteConfirmSku(null);
      setSkus(prev => prev.filter(s => s._id !== deletedId));
      loadSkus(false);
      createActivityLog({
        action: 'DELETE',
        entityType: 'SkuV2',
        entityName: deleteConfirmSku.skuCode,
        details: `Deleted item '${deleteConfirmSku.name}' (${deleteConfirmSku.skuCode}). Code is retired.`,
        company: targetCompanyId
      }).catch(() => {});
    } catch (e: any) {
      if (e.response?.status === 404) {
        showToast(`Item '${deleteConfirmSku.skuCode}' deleted`, 'success');
        const deletedId = deleteConfirmSku._id;
        setDeleteConfirmSku(null);
        setSkus(prev => prev.filter(s => s._id !== deletedId));
        return;
      }
      showToast(e.response?.data?.msg || e.message || 'Failed to delete item', 'error');
    }
  };

  // Inline Table Category Change Handler (Saves directly to MongoDB database)
  const handleInlineCategoryChange = async (sku: SkuV2, newCatName: string) => {
    if (!sku._id) return;
    try {
      // 1. Instant local UI update
      setSkus(prev => prev.map(s => s._id === sku._id ? { ...s, group: newCatName, category: newCatName } : s));
      
      // 2. Persist to MongoDB database via API
      await updateSkuV2(sku._id, {
        group: newCatName,
        category: newCatName
      });
      
      showToast(`Category updated to '${newCatName}' for ${sku.skuCode}`, 'success');

      // 3. Log activity
      createActivityLog({
        action: 'UPDATE',
        entityType: 'SkuV2',
        entityName: sku.skuCode,
        details: `Updated category of item '${sku.name}' to '${newCatName}'`,
        company: selectedCompany?._id
      }).catch(() => {});
    } catch (err) {
      console.error('Failed to update category:', err);
      showToast('Failed to update category in database', 'error');
      loadSkus(false);
    }
  };

  // Category Card Handlers
  const handleOpenAddCategoryModal = () => {
    loadMetadata();
    setEditingCategory(null);
    setCategoryForm({
      name: '',
      type: activeCategorySubTab,
      uom: unitsList[0] || '',
      fieldsText: 'Pages, Size, Ruling'
    });
    setShowCategoryModal(true);
  };

  const handleOpenEditCategoryModal = (cat: CategoryCardData) => {
    loadMetadata();
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
    const chosenUom = categoryForm.uom.trim() || unitsList[0] || '';
    const fieldsArr = categoryForm.fieldsText
      .split(/[,·]/)
      .map(f => f.trim())
      .filter(Boolean);

    let updatedUnits = [...unitsList];
    if (chosenUom && !updatedUnits.some(u => u.toLowerCase() === chosenUom.toLowerCase())) {
      updatedUnits.push(chosenUom);
      setUnitsList(normalizeAndDeduplicateUnits(updatedUnits));
    }

    if (editingCategory) {
      const updatedCards = categoriesData.map(c => c.id === editingCategory.id ? {
        ...c,
        name: categoryForm.name.trim(),
        type: categoryForm.type,
        uom: chosenUom,
        fields: fieldsArr.length > 0 ? fieldsArr : ['Type']
      } : c);
      setCategoriesData(updatedCards);
      saveCategoriesToDb(updatedCards, updatedUnits);
      showToast(`Category '${categoryForm.name}' updated`, 'success');
    } else {
      const newCat: CategoryCardData = {
        id: `cat-${Date.now()}`,
        name: categoryForm.name.trim(),
        type: categoryForm.type,
        uom: chosenUom,
        fields: fieldsArr.length > 0 ? fieldsArr : ['Type']
      };
      const updatedCards = [...categoriesData, newCat];
      setCategoriesData(updatedCards);
      saveCategoriesToDb(updatedCards, updatedUnits);
      showToast(`Category '${categoryForm.name}' created`, 'success');
    }
    setShowCategoryModal(false);
  };

  const handleDeleteCategory = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete category '${name}'?`)) {
      const updatedCards = categoriesData.filter(c => c.id !== id);
      setCategoriesData(updatedCards);
      saveCategoriesToDb(updatedCards);
      showToast(`Category '${name}' deleted`, 'success');
    }
  };

  const toggleExpandCategory = (id: string) => {
    setExpandedCategoryIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Default category parameter for Add SKU drawer
  const getDefaultCategoryForDrawer = () => {
    const targetType = activeMainTab === 'products' ? 'products' : activeMainTab === 'semi' ? 'semi' : activeMainTab === 'categories' ? activeCategorySubTab : 'materials';
    const sectionCats = (categoriesData || []).filter(c => c.type === targetType).map(c => c.name);
    if (sectionCats.length > 0) return sectionCats[0];
    return '';
  };

  const dynamicTotalCount = useMemo(() => {
    if (activeMainTab === 'categories') {
      return categoriesData.filter(c => c.type === activeCategorySubTab).length;
    }
    return filteredAndSortedSkus.length;
  }, [activeMainTab, activeCategorySubTab, categoriesData, filteredAndSortedSkus]);

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 space-y-4 font-sans text-gray-800">
      
      {/* 1. Header Banner */}
      <div className="flex flex-row items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-2xs relative">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-blue-100/80 text-blue-700 rounded-2xl shadow-2xs">
            <Package className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span>Item Master</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-bold transition-all">
                {dynamicTotalCount} Total
              </span>
            </h1>
            <p className="text-xs text-gray-500 font-medium">
              Unified master directory for Products, Raw Materials, Semi Finished Goods & Categories.
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Top Navigation Tabs Bar & Action Toolbar (Exact match to Business Directory / 1st Image!) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 bg-white px-4 rounded-2xl shadow-2xs relative">
        {/* Backdrop overlay to close open popovers on outside click */}
        {(showSortMenu || showColumnPicker || showExportMenu) && (
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => {
              setShowSortMenu(false);
              setShowColumnPicker(false);
              setShowExportMenu(false);
            }}
          />
        )}

        {/* Tab Selection (Scrollable on small screens) */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-full">
          {/* Tab 1: Products (All Finished Products) */}
          <button
            onClick={() => handleMainTabChange('products')}
            className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
              activeMainTab === 'products'
                ? 'border-teal-700 text-teal-700 bg-transparent'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
            }`}
          >
            <Package className={`w-4 h-4 ${activeMainTab === 'products' ? 'text-teal-700' : 'text-slate-400'}`} />
            <span>Products</span>
          </button>

          {/* Tab 2: Materials (All Raw Materials) */}
          <button
            onClick={() => handleMainTabChange('materials')}
            className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
              activeMainTab === 'materials'
                ? 'border-teal-700 text-teal-700 bg-transparent'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
            }`}
          >
            <Layers className={`w-4 h-4 ${activeMainTab === 'materials' ? 'text-teal-700' : 'text-slate-400'}`} />
            <span>Materials</span>
          </button>

          {/* Tab 3: Semi (Only Semi Finished Materials) */}
          <button
            onClick={() => handleMainTabChange('semi')}
            className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
              activeMainTab === 'semi'
                ? 'border-teal-700 text-teal-700 bg-transparent'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
            }`}
          >
            <Boxes className={`w-4 h-4 ${activeMainTab === 'semi' ? 'text-teal-700' : 'text-slate-400'}`} />
            <span>Semi</span>
          </button>

          {/* Tab 4: Categories */}
          <button
            onClick={() => handleMainTabChange('categories')}
            className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
              activeMainTab === 'categories'
                ? 'border-teal-700 text-teal-700 bg-transparent'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
            }`}
          >
            <Folder className={`w-4 h-4 ${activeMainTab === 'categories' ? 'text-teal-700' : 'text-slate-400'}`} />
            <span>Categories</span>
          </button>

          {/* Tab 5: Settings */}
          <button
            onClick={() => handleMainTabChange('settings')}
            className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
              activeMainTab === 'settings'
                ? 'border-teal-700 text-teal-700 bg-transparent'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
            }`}
          >
            <Settings className={`w-4 h-4 ${activeMainTab === 'settings' ? 'text-teal-700' : 'text-slate-400'}`} />
            <span>Settings</span>
          </button>
        </div>

        {/* Right Action Bar (Search + Icon-Only Action Tools + Add Item Button) matching Business Directory */}
        <div ref={toolbarActionsRef} className="py-2 flex items-center gap-2 flex-wrap shrink-0 relative z-40">
              
              {/* 1. Global Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${getTabLabel(activeMainTab).toLowerCase()}...`}
                  className="pl-8 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl w-40 md:w-52 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs font-medium"
                />
                {search && (
                  <button 
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 2. Filters Icon Button & Dynamic Filter Popover */}
              <div className="relative" ref={filterDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowFilterPanel(!showFilterPanel);
                    setShowSortMenu(false);
                    setShowColumnPicker(false);
                    setShowExportMenu(false);
                  }}
                  className={`p-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
                    filterRules.length > 0
                      ? 'bg-blue-600 text-white border-blue-600 shadow-blue-100'
                      : 'bg-white hover:bg-blue-50/60 text-blue-600 border-gray-200 hover:border-blue-200'
                  }`}
                  title={`Filter Results ${filterRules.length > 0 ? `(${filterRules.length} rules)` : ''}`}
                  aria-label="Filter Results"
                >
                  <Filter className="w-4 h-4" />
                </button>
                {!showFilterPanel && (
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                    Filters
                  </div>
                )}

                {/* Filter Popover matching Business Directory */}
                {showFilterPanel && (
                  <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white/95 backdrop-blur-md rounded-2xl border border-gray-200 shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150 text-left">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-gray-900">Filters</h4>
                        {filterRules.length > 0 && (
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {filterRules.length} active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {filterRules.length > 0 && (
                          <button
                            onClick={() => setFilterRules([])}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                          >
                            Clear All
                          </button>
                        )}
                        <button
                          onClick={() => setShowFilterPanel(false)}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Rules list */}
                    {filterRules.length === 0 ? (
                      <div className="border border-dashed border-gray-300 rounded-2xl p-6 text-center bg-white">
                        <p className="text-sm font-bold text-gray-800">No filters applied</p>
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
                              <option value="name">Item Name</option>
                              <option value="skuCode">SKU Code</option>
                              <option value="brand">Brand</option>
                              <option value="category">Category</option>
                              <option value="unit">UOM</option>
                              <option value="gsm">GSM</option>
                              <option value="pages">Pages</option>
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
                      className="w-full mt-3 py-2.5 border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/40 rounded-xl text-xs font-semibold text-gray-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add filter</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 3. Sort Icon Button & Dropdown */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => {
                    setShowSortMenu(!showSortMenu);
                    setShowColumnPicker(false);
                    setShowExportMenu(false);
                    setShowFilterPanel(false);
                  }}
                  className="p-2 rounded-xl bg-white hover:bg-blue-50/60 border border-gray-200 hover:border-blue-200 text-blue-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
                  title="Sort Records"
                  aria-label="Sort Records"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
                {!showSortMenu && (
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                    Sort Options
                  </div>
                )}
                {showSortMenu && (
                  <div className="absolute right-0 mt-1.5 w-52 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-2 space-y-1 text-xs text-left">
                    <div className="px-2 py-1 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Sort Options</div>
                    <button
                      onClick={() => { setSortRules([{ field: 'name', order: 'asc' }]); setShowSortMenu(false); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between ${sortRules[0]?.field === 'name' && sortRules[0]?.order === 'asc' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-700 cursor-pointer'}`}
                    >
                      <span>Item Name (A to Z)</span>
                    </button>
                    <button
                      onClick={() => { setSortRules([{ field: 'name', order: 'desc' }]); setShowSortMenu(false); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between ${sortRules[0]?.field === 'name' && sortRules[0]?.order === 'desc' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-700 cursor-pointer'}`}
                    >
                      <span>Item Name (Z to A)</span>
                    </button>
                    <button
                      onClick={() => { setSortRules([{ field: 'openingStock', order: 'desc' }]); setShowSortMenu(false); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between ${sortRules[0]?.field === 'openingStock' && sortRules[0]?.order === 'desc' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-700 cursor-pointer'}`}
                    >
                      <span>Stock (High to Low)</span>
                    </button>
                    <button
                      onClick={() => { setSortRules([{ field: 'openingStock', order: 'asc' }]); setShowSortMenu(false); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between ${sortRules[0]?.field === 'openingStock' && sortRules[0]?.order === 'asc' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-700 cursor-pointer'}`}
                    >
                      <span>Stock (Low to High)</span>
                    </button>
                    <button
                      onClick={() => { setSortRules([{ field: 'skuCode', order: 'asc' }]); setShowSortMenu(false); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between ${sortRules[0]?.field === 'skuCode' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-700 cursor-pointer'}`}
                    >
                      <span>SKU Code (A to Z)</span>
                    </button>
                    <button
                      onClick={() => { setSortRules([{ field: 'category', order: 'asc' }]); setShowSortMenu(false); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between ${sortRules[0]?.field === 'category' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-700 cursor-pointer'}`}
                    >
                      <span>Category (A to Z)</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 4. Columns Icon Button & Dropdown */}
              <div className="relative group" ref={columnCustomizerRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowColumnPicker(!showColumnPicker);
                    setShowSortMenu(false);
                    setShowExportMenu(false);
                    setShowFilterPanel(false);
                  }}
                  className="p-2 rounded-xl bg-white hover:bg-blue-50/60 border border-gray-200 hover:border-blue-200 text-blue-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
                  title="Toggle Columns"
                  aria-label="Toggle Columns"
                >
                  <Columns className="w-4 h-4" />
                </button>
                {!showColumnPicker && (
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                    Column Visibility
                  </div>
                )}
                {showColumnPicker && (
                  <div className="absolute right-0 mt-1.5 w-60 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-3 space-y-2 text-xs text-left">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Visible Columns</span>
                      <button 
                        onClick={() => {
                          if (activeMainTab === 'materials') setColumnsConfig(DEFAULT_MATERIALS_COLUMNS);
                          else if (activeMainTab === 'semi') setColumnsConfig(DEFAULT_SEMI_COLUMNS);
                          else setColumnsConfig(DEFAULT_PRODUCTS_COLUMNS);
                        }} 
                        className="text-[10.5px] text-blue-600 font-bold hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
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
                            className={`flex items-center justify-between p-1.5 rounded-lg border text-xs font-semibold cursor-grab active:cursor-grabbing transition-all select-none ${
                              draggedPopoverColIdx === idx
                                ? 'bg-blue-100/90 border-blue-500 shadow-md scale-[1.01] opacity-80'
                                : 'bg-gray-50/80 border-gray-200/80 hover:bg-blue-50/40 hover:border-blue-300'
                            }`}
                          >
                            <label className="flex items-center gap-2 cursor-pointer text-gray-800 font-semibold" onClick={(e) => e.stopPropagation()}>
                              <span className="text-gray-400 font-bold select-none text-[10px]">⋮⋮</span>
                              <input
                                type="checkbox"
                                checked={col.visible}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setColumnsConfig(prev => prev.map(c => c.id === col.id ? { ...c, visible: checked } : c));
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                              />
                              <span className="text-xs">{col.label}</span>
                            </label>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider bg-white border border-gray-200 px-1 py-0.2 rounded shadow-2xs">
                              Drag
                            </span>
                          </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Export Icon Button & Dropdown */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => {
                    setShowExportMenu(!showExportMenu);
                    setShowSortMenu(false);
                    setShowColumnPicker(false);
                    setShowFilterPanel(false);
                  }}
                  className="p-2 rounded-xl bg-white hover:bg-blue-50/60 border border-gray-200 hover:border-blue-200 text-blue-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
                  title="Export Data (PDF / Excel)"
                  aria-label="Export Data (PDF / Excel)"
                >
                  <Download className="w-4 h-4" />
                </button>
                {!showExportMenu && (
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                    Export Data
                  </div>
                )}
                {showExportMenu && (
                  <div className="absolute right-0 mt-1.5 w-48 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-2 space-y-1 text-xs text-left">
                    <button
                      onClick={() => { handleExportCSV(); setShowExportMenu(false); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl font-semibold hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 text-gray-700 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                      <span>Export CSV (.csv)</span>
                    </button>
                    <button
                      onClick={() => { handleExportExcel(); setShowExportMenu(false); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl font-semibold hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 text-gray-700 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Export Excel (.xlsx)</span>
                    </button>
                    <button
                      onClick={() => { handleExportPDF(); setShowExportMenu(false); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl font-semibold hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 text-gray-700 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-rose-600" />
                      <span>Export PDF</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 6. Sample CSV Icon Button */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={handleDownloadSampleCSV}
                  className="p-2 rounded-xl bg-white hover:bg-blue-50/60 text-blue-600 border border-gray-200 hover:border-blue-200 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
                  title="Download Sample CSV Template"
                  aria-label="Download Sample CSV Template"
                >
                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                </button>
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                  Sample CSV
                </div>
              </div>

              {/* 7. Import CSV Icon Button */}
              <div className="relative group">
                <label
                  className={`p-2 rounded-xl border text-blue-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
                    isImporting ? 'bg-blue-100 border-blue-300 animate-pulse' : 'bg-white hover:bg-blue-50/60 border-gray-200 hover:border-blue-200'
                  }`}
                  title="Import Excel/CSV File"
                  aria-label="Import Excel/CSV File"
                >
                  <Upload className={`w-4 h-4 text-blue-600 ${isImporting ? 'animate-bounce' : ''}`} />
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    disabled={isImporting}
                    onChange={handleImportCSV}
                    className="hidden"
                  />
                </label>
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                  Import Excel/CSV
                </div>
              </div>

              {/* 8. Re-sequence / Renumber Continuous SKU Series */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => handleRenumberSkus(false)}
                  disabled={isRenumbering}
                  className={`p-2 rounded-xl border text-amber-700 transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
                    isRenumbering ? 'bg-amber-100 border-amber-300 animate-spin' : 'bg-white hover:bg-amber-50/60 border-gray-200 hover:border-amber-200'
                  }`}
                  title="Re-sequence SKU Codes to Continuous Series (FG-001..., SM-001..., RM-001...)"
                  aria-label="Re-sequence SKU Codes to Continuous Series"
                >
                  <RefreshCw className={`w-4 h-4 text-amber-600 ${isRenumbering ? 'animate-spin' : ''}`} />
                </button>
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                  Renumber Continuous Series
                </div>
              </div>

              {/* 8. Activity Logs Icon Button */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => {
                    fetchActivityLogs();
                    setShowActivityLog(true);
                  }}
                  className="p-2 rounded-xl bg-white hover:bg-blue-50/60 border border-gray-200 hover:border-blue-200 text-blue-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
                  title="Activity Logs"
                  aria-label="Activity Logs"
                >
                  <History className="w-4 h-4 text-blue-600" />
                </button>
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                  Activity Logs
                </div>
              </div>

              {/* 8.5 Recycle Bin Icon Button */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => {
                    fetchRecycleBinSkus();
                    setShowRecycleBinModal(true);
                  }}
                  className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100/80 border border-rose-200 text-rose-700 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
                  title="Recycle Bin (View / Restore Deleted Items)"
                  aria-label="Recycle Bin"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" />
                </button>
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                  Recycle Bin
                </div>
              </div>

              {/* 9. Find Duplicates Icon Button */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={handleFindDuplicates}
                  disabled={isScanningDuplicates}
                  className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100/80 border border-amber-200 text-amber-700 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
                  title="Scan for Duplicate Items"
                  aria-label="Scan for Duplicate Items"
                >
                  <Copy className={`w-4 h-4 text-amber-600 ${isScanningDuplicates ? 'animate-spin' : ''}`} />
                </button>
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                  Find Duplicates
                </div>
              </div>

              {/* Build BOMs quick action for Products & Semi tabs */}
              {(activeMainTab === 'products' || activeMainTab === 'semi') && (
                <div className="relative group">
                  <button 
                    type="button"
                    onClick={() => setShowBuildBomsModal(true)}
                    className="p-2 text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100/90 rounded-xl border border-emerald-200/80 transition-all cursor-pointer shadow-2xs flex items-center justify-center"
                    title="Build BOMs / Bulk Recipe Matrix"
                    aria-label="Build BOMs / Bulk Recipe Matrix"
                  >
                    <ClipboardList className="w-4 h-4 text-emerald-700 stroke-[2.2]" />
                  </button>
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                    Build BOMs
                  </div>
                </div>
              )}

              {/* 10. Add New Item Icon Button (Circular + Button) */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => { 
                    if (activeMainTab === 'categories') {
                      handleOpenAddCategoryModal();
                    } else {
                      setEditSku(null); 
                      setShowAddDrawer(true); 
                    }
                  }}
                  className="w-8 h-8 rounded-full border border-gray-200 bg-white hover:bg-blue-50 text-blue-600 flex items-center justify-center transition-all shadow-2xs cursor-pointer font-bold shrink-0"
                  title={`Add New ${activeMainTab === 'categories' ? 'Category' : getTabLabel(activeMainTab).slice(0, -1)}`}
                  aria-label={`Add New ${activeMainTab === 'categories' ? 'Category' : getTabLabel(activeMainTab).slice(0, -1)}`}
                >
                  <Plus className="w-4 h-4 text-blue-600 stroke-[2.5]" />
                </button>
                <div className="absolute top-full mt-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                  Add {activeMainTab === 'categories' ? 'Category' : getTabLabel(activeMainTab).slice(0, -1)}
                </div>
              </div>
            </div>
          </div>

          {/* ── 2.5 Bulk Selection Bar (Grey Theme) ── */}
          {selectedIds.length > 0 && activeMainTab !== 'categories' && (
            <div className="bg-gray-100 border border-gray-200 text-gray-800 px-4 py-2.5 rounded-2xl shadow-xs flex items-center justify-between flex-wrap gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <span><strong className="text-gray-900">{selectedIds.length}</strong> {getTabLabel(activeMainTab).toLowerCase()} selected</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {copiedBom && (
                  <button
                    type="button"
                    onClick={handleBulkPasteBom}
                    className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
                    title={`Paste BOM from "${copiedBom.sourceName}" to ${selectedIds.length} selected items`}
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Paste BOM ({selectedIds.length})</span>
                  </button>
                )}
                <button
                  onClick={handleExportExcel}
                  disabled={isExporting}
                  className="px-3.5 py-1.5 bg-white hover:bg-gray-200/60 text-gray-700 border border-gray-300 font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all disabled:opacity-50"
                  title={`Export ${selectedIds.length} selected items`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isExporting ? 'Exporting...' : `Export (${selectedIds.length})`}</span>
                </button>
                <button
                  onClick={() => setShowBulkEditModal(true)}
                  className="px-3.5 py-1.5 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  title={`Bulk edit ${selectedIds.length} selected items`}
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Bulk Edit ({selectedIds.length})</span>
                </button>
                <button
                  onClick={() => setShowBulkDeleteModal(true)}
                  className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
                  title={`Delete ${selectedIds.length} selected items`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete ({selectedIds.length})</span>
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="px-3 py-1.5 bg-transparent hover:bg-black/5 text-gray-600 font-semibold rounded-xl cursor-pointer transition-all ml-1"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* ── 3. VIEW CONTENT AREA ── */}
          {activeMainTab === 'settings' ? (
            <div 
              style={{ animation: 'slideDownFade 0.35s ease-out forwards' }}
              className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs p-4 opacity-0"
            >
              <SettingsPage />
            </div>
          ) : activeMainTab !== 'categories' ? (
            
            /* ── GOODS / MATERIALS DATA TABLE VIEW ── */
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden relative">

          {/* Filter Panel Drawer if toggled */}
          {showFilterPanel && (
            <div className="p-4 bg-blue-50/40 border-b border-blue-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-blue-900">Active Filters:</span>
                {categoryFilter && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                    Category: {categoryFilter}
                    <X className="w-3 h-3 cursor-pointer" onClick={() => setCategoryFilter('')} />
                  </span>
                )}
                {search && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                    Search: "{search}"
                    <X className="w-3 h-3 cursor-pointer" onClick={() => setSearch('')} />
                  </span>
                )}
              </div>
              <button
                onClick={() => { setCategoryFilter(''); setSearch(''); }}
                className="text-blue-700 hover:underline font-semibold cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          )}

          {/* Drag & Drop Column Reordering Bar */}
          {customColumns.length > 0 && (
            <div className="bg-blue-50/50 border-b border-blue-100 px-4 py-2 flex items-center gap-2 overflow-x-auto text-xs">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
                <span>⋮⋮</span> Drag to reorder columns:
              </span>
              {customColumns.map((col, idx) => (
                <div
                  key={col}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, idx)}
                  className={`inline-flex items-center gap-1.5 bg-white border border-blue-200 hover:border-blue-400 px-2.5 py-1 rounded-xl text-xs font-semibold text-blue-900 shadow-2xs cursor-grab active:cursor-grabbing transition-all ${
                    draggedColIdx === idx ? 'opacity-40 ring-2 ring-blue-400' : ''
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
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3 w-8 text-center text-gray-400 font-semibold select-none">#</th>

                  {/* Dynamic Table Headers matching visibleColumns order */}
                  {visibleColumns.map((col) => {
                    const currentSort = sortRules.find(r => r.field === col.id);
                    return (
                      <th
                        key={col.id}
                        onClick={() => handleColumnSort(col.id)}
                        className="py-3 px-3 whitespace-nowrap cursor-pointer hover:bg-gray-100/80 transition-colors select-none group"
                        title={`Sort by ${col.label}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={currentSort ? 'text-blue-700 font-bold' : ''}>{col.label}</span>
                          {currentSort ? (
                            currentSort.order === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-blue-600 font-bold shrink-0" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-blue-600 font-bold shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </th>
                    );
                  })}
                  
                  {/* Dynamic Custom Columns */}
                  {customColumns.map((col, idx) => {
                    const currentSort = sortRules.find(r => r.field === `custom_${col}`);
                    return (
                      <th
                        key={col}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, idx)}
                        className={`py-3 px-3 whitespace-nowrap group cursor-grab active:cursor-grabbing hover:bg-blue-50 transition-colors select-none ${
                          draggedColIdx === idx ? 'opacity-40 bg-blue-100/50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-400 font-bold select-none text-xs">⋮⋮</span>
                          <span 
                            onClick={() => handleColumnSort(`custom_${col}`)}
                            className="cursor-pointer hover:text-blue-600 transition-colors"
                            title={`Sort by ${col}`}
                          >
                            {col}
                          </span>
                          {currentSort && (
                            currentSort.order === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-blue-600 font-bold shrink-0" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-blue-600 font-bold shrink-0" />
                            )
                          )}
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all text-xs font-bold text-gray-400 ml-1">
                            {idx > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); moveColumnLeft(idx); }}
                                className="hover:text-blue-600 px-0.5 cursor-pointer"
                                title="Move column left"
                              >
                                ‹
                              </button>
                            )}
                            {idx < customColumns.length - 1 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); moveColumnRight(idx); }}
                                className="hover:text-blue-600 px-0.5 cursor-pointer"
                                title="Move column right"
                              >
                                ›
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); removeCustomColumn(col); }}
                              className="hover:text-rose-600 px-0.5 cursor-pointer"
                              title="Remove column"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      </th>
                    );
                  })}

                  {/* Add Custom Column (+) Header Button */}
                  <th className="py-3 px-2 text-center w-8 whitespace-nowrap">
                    <button
                      onClick={handleAddCustomColumn}
                      className="p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 font-bold transition-all cursor-pointer"
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
                    <td colSpan={1 + 1 + visibleColumns.length + customColumns.length + 2} className="py-12 text-center text-gray-400 whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                        <span>Loading items...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedSkus.length === 0 ? (
                  <tr>
                    <td colSpan={1 + 1 + visibleColumns.length + customColumns.length + 2} className="py-12 text-center text-gray-400 whitespace-nowrap">
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
                          setDetailsSubTab('details');
                          setSelectedSkuDetails(sku);
                        }}
                        style={{
                          animation: 'slideDownFade 0.35s ease-out forwards',
                          animationDelay: `${index * 45}ms`
                        }}
                        className={`hover:bg-blue-50/20 transition-all cursor-pointer opacity-0 whitespace-nowrap ${isSelected ? 'bg-blue-50/30' : ''}`}
                      >
                        <td className="py-3 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleSelectRow(sku._id!, e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-3 text-center text-gray-400 font-mono font-semibold text-xs whitespace-nowrap">
                          {index + 1}
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
                              const cleanItemName = (sku.name || '').replace(/\s*\(\d+\s*Sheets\s*\/?\s*Ream\)/gi, '').trim();
                              return (
                                <td key="name" className="py-3 px-3 font-medium text-gray-900 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    {renderItemDomainIcon(sku, activeMainTab)}
                                    <span className="font-semibold text-gray-900">{cleanItemName}</span>
                                  </div>
                                </td>
                              );
                            case 'category':
                              const catToShow = sku.category || sku.group || (
                                (sku.skuCode || '').toUpperCase().startsWith('RM') || activeMainTab === 'materials' ? 'Raw Material' :
                                (sku.skuCode || '').toUpperCase().startsWith('SEM') || (sku.skuCode || '').toUpperCase().startsWith('SF') || activeMainTab === 'semi' ? 'Semi Finished' : 'Finished Goods'
                              );

                              return (
                                <td key="category" className="py-3 px-3 whitespace-nowrap">
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50/90 text-blue-800 border border-blue-200/80 shadow-2xs">
                                    {catToShow}
                                  </span>
                                </td>
                              );
                            case 'status':
                              const isItemActive = (sku.status || 'Active').toLowerCase() === 'active';
                              return (
                                <td key="status" className="py-3 px-3 whitespace-nowrap">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                    isItemActive 
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' 
                                      : 'bg-gray-100 text-gray-600 border border-gray-200/60'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isItemActive ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                                    {sku.status || 'Active'}
                                  </span>
                                </td>
                              );
                            case 'brand':
                              return (
                                <td key="brand" className="py-3 px-3 whitespace-nowrap">
                                  {sku.brand ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200/80">
                                      {sku.brand}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              );
                            case 'group':
                            case 'itemCategory':
                              return (
                                <td key={c.id} className="py-3 px-3 whitespace-nowrap">
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200/80">
                                    {sku.group || '—'}
                                  </span>
                                </td>
                              );
                            case 'altUnit': {
                              const cleanAlt = (sku.altUnit || '').trim();
                              const cleanPrimary = (sku.unit || '').trim().toLowerCase();
                              const isInvalidAlt = 
                                !cleanAlt || 
                                cleanAlt === '—' || 
                                cleanAlt === '–' || 
                                cleanAlt === '-' || 
                                cleanAlt.includes('â') || 
                                cleanAlt.includes('€') || 
                                cleanAlt.includes('\uFFFD') || 
                                cleanAlt.toLowerCase() === 'n/a' || 
                                cleanAlt.toLowerCase() === 'none' || 
                                cleanAlt.toLowerCase() === cleanPrimary;

                              return (
                                <td key="altUnit" className="py-3 px-3 whitespace-nowrap">
                                  {!isInvalidAlt ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700">
                                      {cleanAlt}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              );
                            }
                            case 'altUnitConversion': {
                              const cleanAlt = (sku.altUnit || '').trim();
                              const cleanPrimary = (sku.unit || '').trim().toLowerCase();
                              const isInvalidAlt = 
                                !cleanAlt || 
                                cleanAlt === '—' || 
                                cleanAlt === '–' || 
                                cleanAlt === '-' || 
                                cleanAlt.includes('â') || 
                                cleanAlt.includes('€') || 
                                cleanAlt.includes('\uFFFD') || 
                                cleanAlt.toLowerCase() === 'n/a' || 
                                cleanAlt.toLowerCase() === 'none' || 
                                cleanAlt.toLowerCase() === cleanPrimary;

                              const isAltPcs = cleanAlt.toLowerCase().includes('pc');
                              const isPrimaryPcs = cleanPrimary.includes('pc');
                              const outerUnit = (isAltPcs && !isPrimaryPcs) ? sku.unit : cleanAlt;
                              const innerUnit = (isAltPcs && !isPrimaryPcs) ? cleanAlt : (sku.unit || 'Pcs');
                              const hasValidConRate = !!sku.altUnitConversion && Number(sku.altUnitConversion) > 0;

                              return (
                                <td key="altUnitConversion" className="py-3 px-3 text-gray-700 font-mono text-[11px] font-semibold whitespace-nowrap">
                                  {!isInvalidAlt && hasValidConRate ? (
                                    <span><strong>1 {outerUnit}</strong> = <strong>{sku.altUnitConversion} {innerUnit}</strong></span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              );
                            }
                            case 'unit':
                              return (
                                <td key="unit" className="py-3 px-3 whitespace-nowrap">
                                  {sku.unit ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-50 text-gray-700 border border-gray-200/60">
                                      {sku.unit}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
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
                              const isSheetItemCol = sku.paperType === 'Sheets' || activeMainTab === 'materials' || activeMainTab === 'semi' || getItemType(sku) === 'materials' || getItemType(sku) === 'semi' || (sku.name || '').toLowerCase().includes('sheet');
                              const pagesStr = sku.pages
                                ? `${sku.pages} ${isSheetItemCol ? 'Sheets/Ream' : 'P'}`
                                : isSheetItemCol
                                  ? '500 Sheets/Ream'
                                  : pageMatch
                                    ? `${pageMatch[1]} P`
                                    : (activeMainTab === 'products' ? '132 P' : '—');
                              return (
                                <td key="pages" className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                                  {pagesStr}
                                </td>
                              );
                            case 'bom':
                              const isBomApplicable = activeMainTab !== 'materials' && getItemType(sku) !== 'materials' && !(sku.category || '').toLowerCase().includes('raw');
                              if (!isBomApplicable) {
                                return (
                                  <td key="bom" className="py-3 px-3 text-center text-gray-400 font-bold whitespace-nowrap">
                                    —
                                  </td>
                                );
                              }
                              const hasBom = Array.isArray((sku as any).bomItems) && (sku as any).bomItems.length > 0;
                              return (
                                <td key="bom" className="py-3 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    {hasBom ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        Defined
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                        Pending
                                      </span>
                                    )}

                                    {/* Quick Copy BOM */}
                                    {hasBom && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyBom({
                                            sourceSkuId: sku._id,
                                            sourceSkuCode: sku.skuCode,
                                            sourceName: sku.name || sku.skuCode,
                                            basis: (sku as any).recipeYieldQty || (sku as any).batchYieldQty || 1,
                                            basisUnit: (sku as any).recipeYieldUnit || (sku as any).batchYieldUnit || sku.unit || 'Pcs',
                                            lines: (sku as any).bomItems || []
                                          });
                                          showToast(`BOM copied from "${sku.name || sku.skuCode}" (${(sku as any).bomItems?.length} items)! Ready to paste.`, 'success');
                                        }}
                                        className="p-1 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-all cursor-pointer"
                                        title={`Copy BOM from ${sku.name || sku.skuCode}`}
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                    )}

                                    {/* Quick Paste BOM if clipboard has copied recipe */}
                                    {copiedBom && isBomApplicable && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDirectPasteBomToSku(sku);
                                        }}
                                        className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded-md transition-all cursor-pointer"
                                        title={`Paste BOM from "${copiedBom.sourceName}" to this product`}
                                      >
                                        <ClipboardPaste className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            case 'openingStock':
                              const liveStockQty = Number((sku as any).presentStock || 0);
                              const minThreshold = Number((sku as any).minStockLevel || 0);

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
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200">
                                    {getDispatchOrderCount(sku)}
                                  </span>
                                </td>
                              );
                            case 'preferredVendor':
                              return (
                                <td key="preferredVendor" className="py-3 px-3 whitespace-nowrap">
                                  {(sku as any).preferredVendor ? (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60 shadow-2xs">
                                      {(sku as any).preferredVendor}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              );
                            default:
                              return (
                                <td key={c.id} className="py-3 px-3 text-gray-500 whitespace-nowrap">
                                  {(sku as any)[c.id] !== undefined && (sku as any)[c.id] !== null ? String((sku as any)[c.id]) : '—'}
                                </td>
                              );
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
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
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
                                  className="px-2 py-1 text-xs font-mono font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-blue-400 focus:border-blue-400 w-24"
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
                                  className="px-2 py-1 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
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
                              <td key={col} className="py-3 px-3 whitespace-nowrap font-mono font-bold text-blue-700 text-xs">
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
                                className="px-2.5 py-1 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-blue-400 focus:border-blue-400 w-28"
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
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer font-bold"
                              title="Edit item"
                            >
                              <Edit className="w-4 h-4 text-blue-600" />
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
              className="px-4 py-2 border border-blue-300 text-blue-600 hover:bg-blue-50 bg-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add {activeMainTab === 'products' ? 'product' : activeMainTab === 'materials' ? 'raw material' : 'semi finished material'}</span>
            </button>
          </div>

        </div>

      ) : (

        /* ── CATEGORIES TAB VIEW ── */
        <div className="space-y-4 text-left animate-in fade-in duration-200">
          
          {/* Top Categories Toolbar & Section Navigation */}
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            
            {/* Left: Section Header & Cute Segmented Subtabs */}
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>Categories Master</span>
                  <span className="bg-blue-50 text-blue-700 border border-blue-200/80 text-[11px] font-bold px-2 py-0.5 rounded-full">
                    {categoriesData.length} Total
                  </span>
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure structural categories, default UOMs, and variant attribute fields
                </p>
              </div>

              {/* Subtabs Segmented Buttons with cute badges */}
              <div className="bg-slate-100/90 p-1 rounded-xl inline-flex items-center gap-1 border border-slate-200/80 shadow-2xs self-start md:self-auto">
                <button
                  onClick={() => setActiveCategorySubTab('products')}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                    activeCategorySubTab === 'products'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <Package className={`w-3.5 h-3.5 ${activeCategorySubTab === 'products' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span>Products</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeCategorySubTab === 'products' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {categoriesData.filter(c => c.type === 'products').length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveCategorySubTab('materials')}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                    activeCategorySubTab === 'materials'
                      ? 'bg-white text-amber-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <Layers className={`w-3.5 h-3.5 ${activeCategorySubTab === 'materials' ? 'text-amber-600' : 'text-slate-400'}`} />
                  <span>Materials</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeCategorySubTab === 'materials' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {categoriesData.filter(c => c.type === 'materials').length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveCategorySubTab('semi')}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                    activeCategorySubTab === 'semi'
                      ? 'bg-white text-purple-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <Boxes className={`w-3.5 h-3.5 ${activeCategorySubTab === 'semi' ? 'text-purple-600' : 'text-slate-400'}`} />
                  <span>Semi</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeCategorySubTab === 'semi' ? 'bg-purple-100 text-purple-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {categoriesData.filter(c => c.type === 'semi').length}
                  </span>
                </button>
              </div>
            </div>

            {/* Right: Search & Add Category Button */}
            <div className="flex items-center gap-2.5 self-end sm:self-auto">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  placeholder={`Search ${activeCategorySubTab}...`}
                  className="pl-8 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl w-36 sm:w-48 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs font-medium"
                />
                {categorySearchQuery && (
                  <button 
                    onClick={() => setCategorySearchQuery('')}
                    className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button 
                onClick={handleOpenAddCategoryModal}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add {activeCategorySubTab === 'products' ? 'Product' : activeCategorySubTab === 'materials' ? 'Material' : 'Semi'} Category</span>
              </button>
            </div>
          </div>

          {/* Cards Grid / Empty State */}
          {(() => {
            const currentSubTabCats = categoriesData.filter(c => c.type === activeCategorySubTab);
            const filtered = currentSubTabCats.filter(c => {
              if (!categorySearchQuery) return true;
              const q = categorySearchQuery.toLowerCase().trim();
              return c.name.toLowerCase().includes(q) || (c.uom && c.uom.toLowerCase().includes(q)) || (c.fields && c.fields.some(f => f.toLowerCase().includes(q)));
            });

            if (filtered.length === 0) {
              return (
                <div className="py-14 px-6 text-center flex flex-col items-center justify-center space-y-4 rounded-2xl border-2 border-dashed border-gray-200/90 bg-white shadow-2xs">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-xs transition-transform hover:scale-105 ${
                    activeCategorySubTab === 'products'
                      ? 'bg-blue-50 border border-blue-100 text-blue-600'
                      : activeCategorySubTab === 'materials'
                        ? 'bg-amber-50 border border-amber-100 text-amber-600'
                        : 'bg-purple-50 border border-purple-100 text-purple-600'
                  }`}>
                    {activeCategorySubTab === 'products' ? (
                      <Package className="w-8 h-8" />
                    ) : activeCategorySubTab === 'materials' ? (
                      <Layers className="w-8 h-8" />
                    ) : (
                      <Boxes className="w-8 h-8" />
                    )}
                  </div>
                  <div className="max-w-md space-y-1.5">
                    <h3 className="text-sm font-bold text-gray-900">
                      {categorySearchQuery ? 'No matching categories found' : `No ${activeCategorySubTab === 'products' ? 'Product' : activeCategorySubTab === 'materials' ? 'Material' : 'Semi'} Categories Yet`}
                    </h3>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {categorySearchQuery 
                        ? `We couldn't find any categories matching "${categorySearchQuery}".`
                        : `Create your first category to organize your ${activeCategorySubTab === 'products' ? 'finished products' : activeCategorySubTab === 'materials' ? 'raw materials' : 'semi-finished items'} with customized variant attributes and default measurement units.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenAddCategoryModal}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-md flex items-center gap-1.5 cursor-pointer mt-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create {activeCategorySubTab === 'products' ? 'Product' : activeCategorySubTab === 'materials' ? 'Material' : 'Semi'} Category</span>
                  </button>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filtered.map((cat, index) => {
                    const linkedItemsCount = skus.filter(s => {
                      const cName = cat.name.toLowerCase();
                      const sGroup = (s.group || '').toLowerCase();
                      const sCat = (s.category || '').toLowerCase();
                      const sName = (s.name || '').toLowerCase();
                      return sGroup === cName || sCat === cName || (sCat === 'finished goods' && sName.includes(cName)) || (sCat === 'raw material' && sName.includes(cName));
                    }).length;

                    return (
                      <div 
                        key={cat.id}
                        style={{
                          animation: 'slideDownFade 0.3s ease-out forwards',
                          animationDelay: `${index * 35}ms`
                        }}
                        className="bg-white border border-gray-200/80 hover:border-blue-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all space-y-3 opacity-0 group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          
                          {/* Left: Avatar Icon + Category Name + UOM */}
                          <div className="flex items-start gap-3">
                            <div className={`p-2.5 rounded-xl border shrink-0 transition-transform group-hover:scale-105 ${
                              cat.type === 'products' 
                                ? 'bg-blue-50 text-blue-600 border-blue-100' 
                                : cat.type === 'materials' 
                                  ? 'bg-amber-50 text-amber-600 border-amber-100' 
                                  : 'bg-purple-50 text-purple-600 border-purple-100'
                            }`}>
                              {cat.type === 'products' ? <Package className="w-4 h-4" /> : cat.type === 'materials' ? <Layers className="w-4 h-4" /> : <Boxes className="w-4 h-4" />}
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span 
                                  onClick={() => {
                                    handleMainTabChange(cat.type === 'products' ? 'products' : cat.type === 'semi' ? 'semi' : 'materials');
                                    setCategoryFilter(cat.name);
                                  }}
                                  className="font-bold text-gray-900 text-sm hover:text-blue-600 cursor-pointer transition-colors"
                                  title={`View all ${cat.name} items`}
                                >
                                  {cat.name}
                                </span>
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                                  <Paperclip className="w-2.5 h-2.5" />
                                  {cat.uom || 'Unit'}
                                </span>
                              </div>

                              {/* Variant Attribute Tags */}
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                {cat.fields && cat.fields.length > 0 ? (
                                  cat.fields.map(field => (
                                    <span key={field} className="text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200/70 px-2 py-0.5 rounded-md">
                                      {field}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-gray-400 italic">No custom fields</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: Item Count Badge & Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Linked Items Pill */}
                            <button
                              onClick={() => {
                                handleMainTabChange(cat.type === 'products' ? 'products' : cat.type === 'semi' ? 'semi' : 'materials');
                                setCategoryFilter(cat.name);
                              }}
                              className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200/80 px-2.5 py-1 rounded-lg shadow-2xs cursor-pointer transition-all flex items-center gap-1.5"
                              title={`Filter items by category '${cat.name}'`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>{linkedItemsCount} {cat.type === 'products' ? 'product' : 'material'}{linkedItemsCount === 1 ? '' : 's'}</span>
                            </button>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-0.5">
                              <button 
                                onClick={() => handleOpenEditCategoryModal(cat)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all cursor-pointer"
                                title="Edit category"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              <button 
                                onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                                title="Delete category"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Dashed Add Category Dropzone */}
                <div
                  onClick={handleOpenAddCategoryModal}
                  className="border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-2xl p-3.5 text-center text-blue-600 font-semibold text-xs hover:bg-blue-50/40 cursor-pointer transition-all flex items-center justify-center gap-2 shadow-2xs hover:shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add {activeCategorySubTab === 'products' ? 'Product' : activeCategorySubTab === 'materials' ? 'Material' : 'Semi'} Category</span>
                </div>
              </div>
            );
          })()}

        </div>

      )}

      {/* ── TABLE SUMMARY FOOTER ── */}
      {activeMainTab !== 'categories' && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 py-3 px-4 bg-gray-50/70 border-t border-gray-200/80 rounded-b-2xl">
          <div>
            Showing all <strong className="text-gray-900">{filteredAndSortedSkus.length}</strong> items
          </div>
          {selectedIds.length > 0 && (
            <div className="text-blue-700 font-semibold bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
              {selectedIds.length} item{selectedIds.length > 1 ? 's' : ''} selected
            </div>
          )}
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
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Item Group Type</label>
                <select
                  value={categoryForm.type}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="products">Products</option>
                  <option value="materials">Materials</option>
                  <option value="semi">Semi</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Default UOM</label>
                <select
                  value={categoryForm.uom}
                  onChange={(e) => {
                    if (e.target.value === '__ADD_NEW__') {
                      const newUnit = window.prompt('Enter new Unit of Measurement (e.g. Box, Bundle, Roll):');
                      if (newUnit && newUnit.trim()) {
                        const clean = newUnit.trim();
                        const updatedUnits = normalizeAndDeduplicateUnits([...unitsList, clean]);
                        setUnitsList(updatedUnits);
                        setCategoryForm(prev => ({ ...prev, uom: clean }));
                        if (selectedCompany?._id) {
                          updateMetadataV2({
                            companyId: selectedCompany._id,
                            units: updatedUnits
                          }).catch(console.error);
                          if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('skbw_metadata_updated', { detail: { type: 'units', value: clean } }));
                          }
                        }
                      }
                    } else {
                      setCategoryForm(prev => ({ ...prev, uom: e.target.value }));
                    }
                  }}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 bg-white"
                >
                  <option value="">-- Select UOM --</option>
                  {unitsList.map(u => (
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
                value={categoryForm.fieldsText}
                onChange={(e) => setCategoryForm(prev => ({ ...prev, fieldsText: e.target.value }))}
                placeholder="e.g. Type, Specifications, Notes"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
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
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs"
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
        defaultCategory=""
        activeSection={
          editSku
            ? (
                (editSku.category || '').toLowerCase().includes('semi') || (editSku.skuCode || '').startsWith('SM') ? 'semi' :
                (editSku.category || '').toLowerCase().includes('raw') || (editSku.category || '').toLowerCase().includes('reel') || (editSku.skuCode || '').startsWith('RM') ? 'materials' : 'products'
              )
            : (activeMainTab === 'products' ? 'products' : activeMainTab === 'semi' ? 'semi' : activeMainTab === 'categories' ? activeCategorySubTab : 'materials')
        }
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
        createdCategories={categoriesData}
        onCategoryCreated={(newCat) => {
          const updatedCards = [
            ...categoriesData.filter(c => c.name.toLowerCase().trim() !== newCat.name.toLowerCase().trim()),
            newCat
          ];
          setCategoriesData(updatedCards);
          saveCategoriesToDb(updatedCards);
        }}
        onUnitCreated={(newUnit) => {
          setUnitsList(prev => normalizeAndDeduplicateUnits([...prev, newUnit]));
          loadMetadata();
        }}
        onMetadataUpdated={() => {
          loadMetadata();
        }}
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
          className="h-[84vh] min-h-[580px]"
          title={
            <div className="flex items-center justify-between w-full pr-6 text-left">
              <div className="flex items-center gap-2">
                {renderItemDomainIcon(selectedSkuDetails, activeMainTab)}
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const itemToEdit = selectedSkuDetails;
                    setSelectedSkuDetails(null);
                    setEditSku(itemToEdit);
                    setShowAddDrawer(true);
                  }}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit Item</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const itemToDelete = selectedSkuDetails;
                    setSelectedSkuDetails(null);
                    setDeleteConfirmSku(itemToDelete);
                  }}
                  className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-5 text-xs text-left h-full flex flex-col overflow-y-auto pr-1">
            
            {/* Modal Subtabs */}
            <div className="border-b border-gray-200 flex items-center gap-6 text-xs font-semibold text-gray-500 shrink-0">
              <button
                type="button"
                onClick={() => setDetailsSubTab('details')}
                className={`pb-2 transition-all cursor-pointer ${detailsSubTab === 'details' ? 'text-blue-700 border-b-2 border-blue-600 font-bold' : 'hover:text-gray-800'}`}
              >
                Details & Categories
              </button>
              <button
                type="button"
                onClick={() => setDetailsSubTab('locations')}
                className={`pb-2 transition-all cursor-pointer flex items-center gap-1.5 ${detailsSubTab === 'locations' ? 'text-blue-700 border-b-2 border-blue-600 font-bold' : 'hover:text-gray-800'}`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Locations</span>
                {modalLocationsBreakdown.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 font-bold px-1.5 py-0.2 rounded-full text-[10px]">
                    {modalLocationsBreakdown.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setDetailsSubTab('work-orders')}
                className={`pb-2 transition-all cursor-pointer flex items-center gap-1.5 ${detailsSubTab === 'work-orders' ? 'text-blue-700 border-b-2 border-blue-600 font-bold' : 'hover:text-gray-800'}`}
              >
                <span>Work Orders</span>
                <span className="bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                  {getWorkOrderCount(selectedSkuDetails)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDetailsSubTab('dispatches')}
                className={`pb-2 transition-all cursor-pointer flex items-center gap-1.5 ${detailsSubTab === 'dispatches' ? 'text-blue-700 border-b-2 border-blue-600 font-bold' : 'hover:text-gray-800'}`}
              >
                <span>Dispatches</span>
                <span className="bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                  {getDispatchOrderCount(selectedSkuDetails)}
                </span>
              </button>
            </div>

            {/* TAB CONTENT: Details & Categories arranged in Neat Cards */}
            {detailsSubTab === 'details' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

                    {/* CARD 1: 🏷️ General & Classification */}
                    {(() => {
                      const isRawOrSemiDetail = 
                        (selectedSkuDetails.category || '').toLowerCase().includes('raw') ||
                        (selectedSkuDetails.category || '').toLowerCase().includes('material') ||
                        (selectedSkuDetails.category || '').toLowerCase().includes('semi') ||
                        (selectedSkuDetails.category || '').toLowerCase().includes('wip') ||
                        (selectedSkuDetails.skuCode || '').toUpperCase().startsWith('RM') ||
                        (selectedSkuDetails.skuCode || '').toUpperCase().startsWith('SEM') ||
                        (selectedSkuDetails.skuCode || '').toUpperCase().startsWith('SF') ||
                        (selectedSkuDetails.skuCode || '').toUpperCase().startsWith('SM') ||
                        activeMainTab === 'materials' || activeMainTab === 'semi';

                      const itemTypeLabel = 
                        (selectedSkuDetails.category || '').toLowerCase().includes('raw') ||
                        (selectedSkuDetails.category || '').toLowerCase().includes('material') ||
                        (selectedSkuDetails.skuCode || '').toUpperCase().startsWith('RM') ||
                        activeMainTab === 'materials'
                          ? 'Raw Material'
                          : (selectedSkuDetails.category || '').toLowerCase().includes('semi') ||
                            (selectedSkuDetails.category || '').toLowerCase().includes('wip') ||
                            (selectedSkuDetails.skuCode || '').toUpperCase().startsWith('SEM') ||
                            (selectedSkuDetails.skuCode || '').toUpperCase().startsWith('SF') ||
                            (selectedSkuDetails.skuCode || '').toUpperCase().startsWith('SM') ||
                            activeMainTab === 'semi'
                          ? 'Semi Finished'
                          : 'Products (Finished Goods)';

                      return (
                        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                <Tag className="w-4 h-4" />
                              </div>
                              <h4 className="font-bold text-gray-900 text-xs">General & Classification</h4>
                            </div>
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                              (selectedSkuDetails.status || 'Active') === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {selectedSkuDetails.status || 'Active'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                            <div>
                              <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">ITEM TYPE</span>
                              <span className="font-bold text-gray-900 text-xs block truncate">{itemTypeLabel}</span>
                            </div>
                            <div>
                              <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">SKU CODE</span>
                              <span className="font-mono font-bold text-blue-600 text-xs block truncate">{selectedSkuDetails.skuCode}</span>
                            </div>
                            <div className={isRawOrSemiDetail ? '' : 'col-span-2'}>
                              <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">CATEGORY</span>
                              <span className="font-bold text-gray-900 text-xs block truncate">
                                {selectedSkuDetails.category || (
                                  (selectedSkuDetails.skuCode || '').toUpperCase().startsWith('RM') ? 'Raw Material' :
                                  (selectedSkuDetails.skuCode || '').toUpperCase().startsWith('SEM') ? 'Semi Finished' : 'Finished Goods'
                                )}
                              </span>
                            </div>
                            {isRawOrSemiDetail && (
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">PREFERRED VENDOR</span>
                                <span className="font-bold text-blue-600 text-xs block truncate">{(selectedSkuDetails as any).preferredVendor || '—'}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                  {/* CARD 2: 📐 Specifications & Paper Format */}
                  <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                          <Ruler className="w-4 h-4" />
                        </div>
                        <h4 className="font-bold text-gray-900 text-xs">Specifications & Paper Format</h4>
                      </div>
                      {selectedSkuDetails.paperType && selectedSkuDetails.paperType !== 'None' && getItemType(selectedSkuDetails) !== 'semi' && activeMainTab !== 'semi' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {selectedSkuDetails.paperType}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                      <div>
                        <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">GSM</span>
                        <span className="font-bold text-gray-900 text-xs">{selectedSkuDetails.gsm ? `${selectedSkuDetails.gsm} GSM` : '—'}</span>
                      </div>
                      <div>
                        <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">TRIMMED SIZE</span>
                        <span className="font-bold text-gray-900 text-xs">{formatSize(selectedSkuDetails) !== '-' ? formatSize(selectedSkuDetails) : '—'}</span>
                      </div>
                      <div>
                        <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">RULING SPEC</span>
                        <span className="font-bold text-gray-900 text-xs">{selectedSkuDetails.ruleType || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                          {selectedSkuDetails.paperType === 'Sheets' || getItemType(selectedSkuDetails) === 'materials' || getItemType(selectedSkuDetails) === 'semi' || activeMainTab === 'semi' ? 'SHEETS PER REAM' : 'PAGES'}
                        </span>
                        <span className="font-bold text-gray-900 text-xs">
                          {selectedSkuDetails.pages ? `${selectedSkuDetails.pages} ${selectedSkuDetails.paperType === 'Sheets' || getItemType(selectedSkuDetails) === 'materials' || getItemType(selectedSkuDetails) === 'semi' ? 'Sheets' : 'Pages'}` : (getItemType(selectedSkuDetails) === 'materials' || getItemType(selectedSkuDetails) === 'semi' ? '500 Sheets' : '—')}
                        </span>
                      </div>
                      {selectedSkuDetails.reamWeight ? (
                        <div>
                          <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">REAM WEIGHT</span>
                          <span className="font-bold text-gray-900 text-xs">{selectedSkuDetails.reamWeight} KG</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* CARD 3: 🔄 Units & Conversion Logic */}
                  <div className="bg-white p-4 rounded-2xl border border-amber-200/70 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                          <RefreshCw className="w-4 h-4" />
                        </div>
                        <h4 className="font-bold text-gray-900 text-xs">Units & Conversion Logic</h4>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                      <div>
                        <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">UOM</span>
                        <span className="font-bold text-gray-900 text-xs">{selectedSkuDetails.unit || 'Pcs'}</span>
                      </div>
                      <div>
                        <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">AUOM</span>
                        <span className="font-bold text-blue-700 text-xs">
                          {selectedSkuDetails.altUnit || '—'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-[#faf5ff] p-3 rounded-xl border border-[#f3e8ff] text-center space-y-0.5">
                      <div className="text-[10px] font-black text-blue-600 uppercase tracking-wider">CONVERSION FORMULA</div>
                      <div className="font-extrabold text-xs text-blue-950">
                        {selectedSkuDetails.altUnit && selectedSkuDetails.altUnitConversion ? (() => {
                          const isAltPcs = (selectedSkuDetails.altUnit || '').toLowerCase().includes('pc');
                          const isPrimaryPcs = (selectedSkuDetails.unit || '').toLowerCase().includes('pc');
                          const outerUnit = (isAltPcs && !isPrimaryPcs) ? selectedSkuDetails.unit : selectedSkuDetails.altUnit;
                          const innerUnit = (isAltPcs && !isPrimaryPcs) ? selectedSkuDetails.altUnit : (selectedSkuDetails.unit || 'Pcs');
                          return `1 ${outerUnit} = ${selectedSkuDetails.altUnitConversion} ${innerUnit}`;
                        })() : (
                          `Direct Unit Tracking (${selectedSkuDetails.unit || 'Pcs'})`
                        )}
                      </div>
                    </div>
                  </div>

                  {/* CARD 4: 📦 Stock & Warehouse Location */}
                  {(() => {
                    const stockUnit = selectedSkuDetails.unit || (selectedSkuDetails.paperType === 'Sheets' ? 'Sheets' : selectedSkuDetails.paperType === 'Reels' ? 'KG' : (getItemType(selectedSkuDetails) === 'materials' ? 'KG' : 'Pcs'));
                    const liveStockQty = modalDynamicLiveStock !== null 
                      ? modalDynamicLiveStock 
                      : (Number((selectedSkuDetails as any).presentStock) || 0);

                    const minStockRaw = (selectedSkuDetails as any).minStockLevel ?? (selectedSkuDetails as any).minStock;
                    const hasMinStock = minStockRaw !== undefined && minStockRaw !== null && minStockRaw !== '' && !isNaN(Number(minStockRaw));
                    const minStockNum = hasMinStock ? Number(minStockRaw) : 0;
                    const minStockDisplay = hasMinStock ? `${minStockNum.toLocaleString('en-IN')} ${stockUnit}` : '—';

                    const reorderRaw = (selectedSkuDetails as any).reorderLevel ?? (selectedSkuDetails as any).reorderQty;
                    const hasReorder = reorderRaw !== undefined && reorderRaw !== null && reorderRaw !== '' && !isNaN(Number(reorderRaw));
                    const reorderNum = hasReorder ? Number(reorderRaw) : 0;
                    const reorderDisplay = hasReorder ? `${reorderNum.toLocaleString('en-IN')} ${stockUnit}` : '—';

                    const unitRate = Number((selectedSkuDetails as any).purchasePrice || (selectedSkuDetails as any).ratePerKg || (selectedSkuDetails as any).rate || (selectedSkuDetails as any).avgRate || (selectedSkuDetails as any).cost || 0);
                    const totalEstVal = liveStockQty * unitRate;

                    let statusBadge = { label: 'Normal', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
                    if (liveStockQty === 0) {
                      statusBadge = { label: 'Out of Stock', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
                    } else if (hasMinStock && minStockNum > 0 && liveStockQty <= minStockNum) {
                      statusBadge = { label: 'Low Stock', bg: 'bg-amber-50 text-amber-800 border-amber-200' };
                    } else if (hasReorder && reorderNum > 0 && liveStockQty <= reorderNum) {
                      statusBadge = { label: 'Low Stock', bg: 'bg-amber-50 text-amber-800 border-amber-200' };
                    }

                    return (
                      <div className="bg-white p-5 rounded-2xl border border-gray-200/90 shadow-2xs space-y-3.5">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-gray-100 gap-2">
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                              <Package className="w-4 h-4" />
                            </div>
                            <h4 className="font-bold text-gray-900 text-xs whitespace-nowrap">Stock & Thresholds</h4>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isEditingThresholds ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={handleSaveThresholds}
                                  disabled={isSavingThresholds}
                                  className="h-6.5 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2 rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>{isSavingThresholds ? 'Saving...' : 'Save'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsEditingThresholds(false)}
                                  className="h-6.5 text-[10px] font-bold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-2 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                  <span>Cancel</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setTempMinStock(hasMinStock ? String(minStockNum) : '');
                                  setTempReorder(hasReorder ? String(reorderNum) : '');
                                  setTempVendor((selectedSkuDetails as any).preferredVendor || '');
                                  setIsEditingThresholds(true);
                                }}
                                className="h-6.5 text-[10px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 rounded-lg border border-amber-200/80 flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
                              >
                                <Edit className="w-3 h-3 shrink-0" />
                                <span>Edit</span>
                              </button>
                            )}
                            <span className={`h-6.5 px-2 rounded-lg text-[10px] font-black uppercase border flex items-center justify-center whitespace-nowrap ${statusBadge.bg}`}>
                              {statusBadge.label}
                            </span>
                            {statusBadge.label !== 'Normal' && (
                              <a
                                href={`/inventory-v2/purchases?reorderSkuId=${selectedSkuDetails._id}`}
                                className="h-6.5 text-[10px] font-black text-white bg-amber-600 hover:bg-amber-700 px-2 rounded-lg flex items-center gap-1 shadow-2xs transition-all cursor-pointer no-underline whitespace-nowrap"
                                title="Create Purchase Batch Reorder for this item"
                              >
                                <ShoppingCart className="w-3 h-3 shrink-0" />
                                <span>Reorder</span>
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Unified Stock & Thresholds Metrics 4-Tile Grid - Sits exactly in place */}
                        <div className="space-y-2.5">
                          <div className="grid grid-cols-2 gap-2.5 text-xs">
                            <div className="bg-slate-50/90 p-3 rounded-xl border border-slate-200/80">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1 whitespace-nowrap">
                                LIVE ON-HAND
                              </span>
                              <span className="font-mono font-extrabold text-emerald-600 text-sm block truncate">
                                {liveStockQty.toLocaleString('en-IN')} {stockUnit}
                              </span>
                            </div>
                            <div className="bg-slate-50/90 p-3 rounded-xl border border-slate-200/80">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1 whitespace-nowrap">
                                EST. LIVE VALUE
                              </span>
                              <span className="font-mono font-extrabold text-slate-800 text-sm block truncate">
                                ₹{totalEstVal.toLocaleString('en-IN')}
                              </span>
                            </div>
                            <div className="bg-slate-50/90 p-3 rounded-xl border border-slate-200/80">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1 whitespace-nowrap">
                                MIN THRESHOLD
                              </span>
                              {isEditingThresholds ? (
                                <input
                                  type="number"
                                  value={tempMinStock}
                                  onChange={(e) => setTempMinStock(e.target.value)}
                                  className="w-full px-2 py-1 border border-amber-400 rounded-lg text-xs font-bold text-gray-900 bg-white"
                                  placeholder="e.g. 500"
                                  autoFocus
                                />
                              ) : (
                                <span className="font-mono font-extrabold text-amber-600 text-sm block truncate">
                                  {minStockDisplay}
                                </span>
                              )}
                            </div>
                            <div className="bg-slate-50/90 p-3 rounded-xl border border-slate-200/80">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1 whitespace-nowrap">
                                REORDER LEVEL
                              </span>
                              {isEditingThresholds ? (
                                <input
                                  type="number"
                                  value={tempReorder}
                                  onChange={(e) => setTempReorder(e.target.value)}
                                  className="w-full px-2 py-1 border border-amber-400 rounded-lg text-xs font-bold text-gray-900 bg-white"
                                  placeholder="e.g. 100"
                                />
                              ) : (
                                <span className="font-mono font-extrabold text-blue-600 text-sm block truncate">
                                  {reorderDisplay}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Preferred Vendor Row (Editable when in edit mode) */}
                          <div className="bg-slate-50/90 px-3.5 py-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                                <Building2 className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">PREFERRED VENDOR</span>
                                {isEditingThresholds ? (
                                  <select
                                    value={tempVendor}
                                    onChange={(e) => setTempVendor(e.target.value)}
                                    className="w-full px-2 py-1 mt-0.5 border border-amber-400 rounded-lg text-xs font-bold text-gray-900 bg-white cursor-pointer"
                                  >
                                    <option value="">-- Select Vendor --</option>
                                    {modalVendorsList.map(v => (
                                      <option key={v.id || v.name} value={v.name}>{v.name}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="font-bold text-gray-900 text-xs block truncate">
                                    {(selectedSkuDetails as any).preferredVendor || '—'}
                                  </span>
                                )}
                              </div>
                            </div>
                            {(selectedSkuDetails as any).preferredVendor && !isEditingThresholds && (
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-200/60 shrink-0 whitespace-nowrap">
                                Primary Supplier
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                </div>

                {/* 3. Bill of Materials (BOM) - Shown for Finished Goods & Semi-Finished Materials! */}
                {(getItemType(selectedSkuDetails) === 'products' || getItemType(selectedSkuDetails) === 'semi' || activeMainTab === 'products' || activeMainTab === 'semi' || !(selectedSkuDetails?.category || '').toLowerCase().includes('raw')) && (
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
                      <div className="flex items-start gap-2.5">
                        <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0 shadow-2xs">
                          <ClipboardList className="w-4 h-4 text-blue-700" />
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm">Bill of Materials</h4>
                          <p className="text-[11px] text-gray-500">
                            Quantities for one <strong>batch</strong>. Work orders scale consumption by (qty ÷ batch size × units produced).
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <BomCopyPasteControls
                          getCopyPayload={() => {
                            if (!bomRecipeItems || bomRecipeItems.length === 0) return null;
                            return {
                              sourceSkuId: selectedSkuDetails?._id,
                              sourceSkuCode: selectedSkuDetails?.skuCode,
                              sourceName: selectedSkuDetails?.name || selectedSkuDetails?.skuCode || 'Product',
                              basis: recipeYieldQty,
                              basisUnit: recipeYieldUnit || (selectedSkuDetails as any).recipeYieldUnit || (selectedSkuDetails as any).batchYieldUnit || selectedSkuDetails?.unit || 'Pcs',
                              lines: bomRecipeItems.map(item => ({
                                id: item.id,
                                name: item.name,
                                qty: item.qty,
                                uom: item.uom,
                                inStock: item.inStock,
                                notes: item.notes
                              }))
                            };
                          }}
                          onPaste={(copied, mode) => {
                            setIsEditingItemBom(true);
                            if (mode === 'replace') {
                              setBomRecipeItems(copied.lines.map((l, i) => ({
                                id: `b-paste-${Date.now()}-${i}`,
                                name: l.name,
                                qty: Number(l.qty) || 1,
                                uom: l.uom,
                                inStock: l.inStock ?? 0,
                                notes: l.notes || ''
                              })));
                              if (copied.basis) setRecipeYieldQty(String(copied.basis));
                              if (copied.basisUnit) setRecipeYieldUnit(copied.basisUnit);
                            } else {
                              const existingNames = new Set(bomRecipeItems.map(i => (i.name || '').toLowerCase().trim()));
                              const toAdd = copied.lines
                                .filter(l => !existingNames.has((l.name || '').toLowerCase().trim()))
                                .map((l, i) => ({
                                  id: `b-merge-${Date.now()}-${i}`,
                                  name: l.name,
                                  qty: Number(l.qty) || 1,
                                  uom: l.uom,
                                  inStock: l.inStock ?? 0,
                                  notes: l.notes || ''
                                }));
                              if (bomRecipeItems.length === 0 && copied.basis) {
                                setRecipeYieldQty(String(copied.basis));
                              }
                              if (copied.basisUnit) {
                                setRecipeYieldUnit(copied.basisUnit);
                              }
                              setBomRecipeItems(prev => [...prev, ...toAdd]);
                            }
                          }}
                          existingCount={bomRecipeItems.length}
                          sourceLabel={selectedSkuDetails?.name}
                          onToast={showToast}
                        />

                        {!isEditingItemBom ? (
                          <button 
                            type="button"
                            onClick={() => setIsEditingItemBom(true)}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                          >
                            <Edit className="w-3.5 h-3.5" /> Edit BOM
                          </button>
                        ) : (
                          <button 
                            type="button"
                            onClick={handleAddBomItem}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> Add Item
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Recipe Yield Box */}
                    {(() => {
                      const availableYieldUnits = Array.from(new Set([selectedSkuDetails?.unit, selectedSkuDetails?.altUnit].filter(Boolean)));
                      const activeUnit = recipeYieldUnit || selectedSkuDetails?.unit || 'Pcs';

                      return (
                        <div className="border border-gray-200 rounded-xl p-2.5 px-3.5 text-xs text-gray-700 font-medium flex items-center gap-2 bg-gray-50/60">
                          <span>This recipe makes</span>
                          {isEditingItemBom ? (
                            <>
                              <input
                                type="number"
                                min="1"
                                value={recipeYieldQty || ''}
                                onChange={(e) => setRecipeYieldQty(e.target.value)}
                                className="w-16 px-2 py-1 border border-blue-300 rounded-lg font-bold text-gray-900 text-center bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                              />
                              {availableYieldUnits.length > 1 ? (
                                <select
                                  value={activeUnit}
                                  onChange={(e) => setRecipeYieldUnit(e.target.value)}
                                  className="px-2.5 py-1 border border-blue-300 rounded-lg font-bold text-blue-800 bg-blue-50 cursor-pointer focus:ring-2 focus:ring-blue-500"
                                >
                                  {availableYieldUnits.map(u => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              ) : (
                                <strong className="text-gray-900">{selectedSkuDetails?.unit || 'Pcs'}</strong>
                              )}
                              <span className="text-gray-400 font-normal">(use 1 for per-unit quantities)</span>
                            </>
                          ) : (
                            <>
                              <strong className="text-blue-900 font-extrabold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md font-mono">
                                {recipeYieldQty || '1'} {activeUnit}
                              </strong>
                              <span className="text-gray-400 font-normal">(quantities are configured per batch)</span>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* Recipe Items Table */}
                    <div className="border border-gray-200 rounded-xl overflow-x-auto shadow-2xs bg-white">
                      {bomRecipeItems.length === 0 && !isEditingItemBom ? (
                        <div className="text-center py-10 text-gray-400 text-xs space-y-2">
                          <ClipboardList className="w-8 h-8 mx-auto text-gray-300" />
                          <p className="font-semibold text-gray-600">No Bill of Materials configured yet</p>
                          <p className="text-[11px]">Click "Edit BOM" above to add ingredients and raw material ratios.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingItemBom(true);
                              handleAddBomItem();
                            }}
                            className="mt-1 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" /> Configure BOM Now
                          </button>
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                          <thead className="bg-gray-50/80 text-gray-500 font-bold text-[11px] border-b border-gray-200">
                            <tr>
                              <th className="py-2.5 px-3">Item</th>
                              <th className="py-2.5 px-3 text-center w-24">Qty</th>
                              <th className="py-2.5 px-3 text-center w-20">UOM</th>
                              <th className="py-2.5 px-3 text-center w-20">In Stock</th>
                              <th className="py-2.5 px-3 text-center w-20 font-bold">Runs</th>
                              {isEditingItemBom && <th className="py-2.5 px-3 text-right w-10"></th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-gray-800">
                            {bomRecipeItems.map((b, idx) => {
                              const qtyNum = Number(b.qty);
                              const inStockNum = Number(b.inStock) || 0;
                              const runs = (qtyNum > 0) ? Math.floor(inStockNum / qtyNum) : null;

                              return (
                                <tr key={b.id} className="hover:bg-gray-50/50">
                                  <td className="py-2.5 px-3">
                                    {isEditingItemBom ? (
                                      <div className="relative" style={{ zIndex: 100 - idx }}>
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
                                      </div>
                                    ) : (
                                      <div className="font-bold text-gray-900 text-xs leading-snug">
                                        {b.name || '—'}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-center w-24">
                                    {isEditingItemBom ? (
                                      <input
                                        type="number"
                                        step="any"
                                        placeholder="Qty"
                                        value={b.qty === 0 || b.qty === undefined ? '' : b.qty}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setBomRecipeItems(prev => prev.map(item => item.id === b.id ? { ...item, qty: val === '' ? ('' as any) : Number(val) } : item));
                                        }}
                                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold font-mono text-center focus:outline-none focus:border-blue-500 bg-white"
                                      />
                                    ) : (
                                      <span className="font-mono font-bold text-gray-900">{b.qty !== undefined && b.qty !== '' ? b.qty : '—'}</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-center w-20">
                                    {isEditingItemBom ? (
                                      <input
                                        type="text"
                                        value={b.uom || ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setBomRecipeItems(prev => prev.map(item => item.id === b.id ? { ...item, uom: val } : item));
                                        }}
                                        className="w-full border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs font-semibold text-center uppercase focus:outline-none focus:border-blue-500 bg-white"
                                        placeholder="UOM"
                                      />
                                    ) : (
                                      <span className="text-gray-600 font-semibold whitespace-nowrap">{b.uom}</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-center text-gray-600 font-mono whitespace-nowrap w-20">{b.inStock ?? 0}</td>
                                  <td className="py-2 px-3 text-center font-bold text-gray-900 whitespace-nowrap w-20">
                                    {runs !== null ? runs.toLocaleString() : '—'}
                                  </td>
                                  {isEditingItemBom && (
                                    <td className="py-2 px-3 text-right w-10">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteBomItem(b.id)}
                                        className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                                        title="Remove material"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}

                      {/* Bottom Summary Bar */}
                      <div className="p-3 bg-white border-t border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-10 text-xs">
                          <div>
                            <div className="text-[11px] text-gray-400 font-medium">Items</div>
                            <div className="text-sm font-bold text-gray-900">{bomRecipeItems.length} items</div>
                          </div>
                          <div>
                            <div className="text-[11px] text-gray-400 font-medium">Can make</div>
                            <div className="text-sm font-bold text-gray-900">
                              {(() => {
                                const validRuns = bomRecipeItems
                                  .map(b => (b.qty && Number(b.qty) > 0) ? Math.floor((Number(b.inStock) || 0) / Number(b.qty)) : null)
                                  .filter((v): v is number => v !== null);
                                if (validRuns.length === 0) return '—';
                                return `${Math.min(...validRuns).toLocaleString()} units`;
                              })()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isEditingItemBom ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (selectedSkuDetails) {
                                    const defaultBom = (selectedSkuDetails as any).bomItems || [];
                                    setBomRecipeItems(defaultBom);
                                    setRecipeYieldQty(String(selectedSkuDetails.recipeYieldQty || '1'));
                                    setRecipeYieldUnit(selectedSkuDetails.recipeYieldUnit || selectedSkuDetails.unit || 'Pcs');
                                  }
                                  setIsEditingItemBom(false);
                                }}
                                className="px-3.5 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold rounded-xl text-xs cursor-pointer transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveBomRecipe}
                                disabled={isSavingBom}
                                className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all disabled:opacity-50"
                              >
                                {isSavingBom ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                <span>Save recipe</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsEditingItemBom(true)}
                              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              <span>Edit BOM</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Process Steps */}
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                        <SlidersHorizontal className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-xs">Book Manufacturing Process Steps</h4>
                        <p className="text-[11px] text-gray-400">Reel Slitting &rarr; Paper Ruling &rarr; Folding &rarr; Wire Stitching &rarr; Cover Lamination &rarr; Trimming</p>
                      </div>
                    </div>

                    <button 
                      onClick={() => showToast('Process step added', 'success')}
                      className="px-3 py-1.5 border border-blue-300 text-blue-600 bg-white hover:bg-blue-50 rounded-lg font-semibold text-xs shadow-2xs flex items-center gap-1 cursor-pointer"
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
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
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
                              <div className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-blue-700">
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
                              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-800 focus:outline-none focus:border-blue-500 shadow-2xs"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* TAB CONTENT: Locations (Initial & Live Multi-Location Breakdown) */}
            {detailsSubTab === 'locations' && (
              <div className="space-y-4">
                {/* Summary Header - Live Total Stock Across All Locations */}
                <div className="bg-white p-4 rounded-2xl border border-gray-200/90 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-emerald-600" />
                      LIVE TOTAL ON-HAND
                    </span>
                    <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Live Consolidated
                    </span>
                  </div>
                  <div className="font-mono font-extrabold text-emerald-600 text-base">
                    {(modalDynamicLiveStock !== null ? modalDynamicLiveStock : (Number((selectedSkuDetails as any).presentStock) || 0)).toLocaleString('en-IN')} {selectedSkuDetails.unit || 'Pcs'}
                  </div>
                  <p className="text-[10.5px] text-gray-400">Consolidated quantity currently held across all warehouse locations</p>
                </div>

                {/* Multi-Location Live Breakdown Table / Card List */}
                <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-xs">Live Multi-Location Inventory Breakdown</h4>
                        <p className="text-[10.5px] text-gray-500">Same item distributed across warehouse bins, bays, and racks</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenMiniStockOverview}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-all cursor-pointer shadow-2xs"
                      title="Open miniature stock overview popup"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Stock Transfers & Logs</span>
                    </button>
                  </div>

                  {isLoadingLocations ? (
                    <div className="py-12 flex items-center justify-center gap-2 text-gray-400">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                      <span className="text-xs font-medium">Resolving live storage locations...</span>
                    </div>
                  ) : modalLocationsBreakdown.length === 0 ? (
                    <div className="p-6 text-center space-y-3">
                      <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                        <MapPin className="w-6 h-6 text-slate-400" />
                      </div>
                      <div className="space-y-1 max-w-md mx-auto">
                        <p className="font-bold text-gray-800 text-xs">Warehouse Storage Breakdown</p>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          When stock is transferred or received across warehouse locations, each location and on-hand balance will be listed here automatically.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-50/80 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                            <th className="py-2.5 px-4">Location Name & Code</th>
                            <th className="py-2.5 px-4">Full Hierarchy Path</th>
                            <th className="py-2.5 px-4 text-right">On-Hand Stock</th>
                            <th className="py-2.5 px-4 text-right">Available</th>
                            <th className="py-2.5 px-4 text-right">Est. Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {modalLocationsBreakdown.map((loc, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
                                  <span className="font-bold text-gray-900">{loc.locationName || 'Warehouse Storage'}</span>
                                  {loc.locationCode && (
                                    <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                      {loc.locationCode}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-[11px] text-gray-600 font-medium">
                                  {loc.hierarchyPath || `${loc.warehouseName || 'Warehouse'} ➔ ${loc.zoneName || loc.floorName || 'General Zone'}`}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className="font-mono font-bold text-emerald-700 text-xs">
                                  {Number(loc.onHand || 0).toLocaleString('en-IN')} {selectedSkuDetails.unit || 'Pcs'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className="font-mono font-bold text-blue-700 text-xs">
                                  {Number(loc.available !== undefined ? loc.available : loc.onHand || 0).toLocaleString('en-IN')} {selectedSkuDetails.unit || 'Pcs'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className="font-mono font-bold text-gray-800 text-xs">
                                  ₹{Number(loc.stockValue || (Number(loc.onHand || 0) * Number((selectedSkuDetails as any).purchasePrice || (selectedSkuDetails as any).ratePerKg || (selectedSkuDetails as any).rate || 0))).toLocaleString('en-IN')}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: Work Orders */}
            {detailsSubTab === 'work-orders' && (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-gray-400 space-y-3 bg-slate-50/60 rounded-2xl border border-dashed border-gray-200 my-auto min-h-[380px]">
                <div className="w-14 h-14 rounded-2xl bg-white shadow-2xs border border-gray-200/80 flex items-center justify-center text-gray-400">
                  <ClipboardList className="w-7 h-7 text-gray-400" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <p className="font-bold text-gray-800 text-sm">Active Production Work Orders for {selectedSkuDetails.skuCode}</p>
                  <p className="text-xs text-gray-500">No active work orders currently scheduled for this SKU on factory floor.</p>
                </div>
              </div>
            )}

            {/* TAB CONTENT: Dispatches */}
            {detailsSubTab === 'dispatches' && (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-gray-400 space-y-3 bg-slate-50/60 rounded-2xl border border-dashed border-gray-200 my-auto min-h-[380px]">
                <div className="w-14 h-14 rounded-2xl bg-white shadow-2xs border border-gray-200/80 flex items-center justify-center text-gray-400">
                  <Package className="w-7 h-7 text-gray-400" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <p className="font-bold text-gray-800 text-sm">Fulfillment & Dispatches for {selectedSkuDetails.skuCode}</p>
                  <p className="text-xs text-gray-500">No pending dispatches or delivery challans recorded for this item.</p>
                </div>
              </div>
            )}

          </div>
        </Modal>
      )}

      {/* ── MINIATURE STOCK OVERVIEW & TRANSFER LOGS POPUP MODAL ── */}
      {showMiniStockModal && selectedSkuDetails && (
        <Modal
          isOpen={showMiniStockModal}
          onClose={() => setShowMiniStockModal(false)}
          title={
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
                <RotateCcw className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                  <span>Stock Overview & Activity Logs</span>
                  <span className="font-mono text-[10.5px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                    {selectedSkuDetails.skuCode}
                  </span>
                </div>
                <div className="text-[11px] font-medium text-gray-500 truncate max-w-md">
                  {selectedSkuDetails.name}
                </div>
              </div>
            </div>
          }
        >
          <div className="space-y-4 text-xs max-h-[75vh] overflow-y-auto pr-1">
            {/* 4 Clean Mini KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 text-center space-y-0.5">
                <div className="text-[9.5px] font-bold text-emerald-800 uppercase tracking-wider">Live On-Hand</div>
                <div className="text-base font-extrabold text-emerald-950 font-mono">
                  {Number(miniStockData?.summary?.onHand ?? modalDynamicLiveStock ?? (Number((selectedSkuDetails as any).presentStock) || 0)).toLocaleString('en-IN')}
                  <span className="text-[10px] font-semibold text-emerald-700 ml-1">{selectedSkuDetails.unit || 'Pcs'}</span>
                </div>
              </div>

              <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3 text-center space-y-0.5">
                <div className="text-[9.5px] font-bold text-blue-800 uppercase tracking-wider">Available</div>
                <div className="text-base font-extrabold text-blue-950 font-mono">
                  {Number(miniStockData?.summary?.available ?? (modalDynamicLiveStock ?? (Number((selectedSkuDetails as any).presentStock) || 0))).toLocaleString('en-IN')}
                  <span className="text-[10px] font-semibold text-blue-700 ml-1">{selectedSkuDetails.unit || 'Pcs'}</span>
                </div>
              </div>

              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-center space-y-0.5">
                <div className="text-[9.5px] font-bold text-amber-800 uppercase tracking-wider">Reserved / Pending</div>
                <div className="text-base font-extrabold text-amber-950 font-mono">
                  {Number(miniStockData?.summary?.reserved ?? 0).toLocaleString('en-IN')}
                  <span className="text-[10px] font-semibold text-amber-700 ml-1">{selectedSkuDetails.unit || 'Pcs'}</span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center space-y-0.5">
                <div className="text-[9.5px] font-bold text-slate-600 uppercase tracking-wider">Est. Stock Value</div>
                <div className="text-base font-extrabold text-slate-900 font-mono truncate">
                  ₹{Number(miniStockData?.summary?.stockValue ?? ((modalDynamicLiveStock ?? (Number((selectedSkuDetails as any).presentStock) || 0)) * Number((selectedSkuDetails as any).purchasePrice || (selectedSkuDetails as any).ratePerKg || (selectedSkuDetails as any).rate || (selectedSkuDetails as any).avgRate || 0))).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Mini Subtab Navigation Buttons */}
            <div className="flex border-b border-gray-200 bg-gray-50/80 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setMiniStockTab('movements')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  miniStockTab === 'movements'
                    ? 'bg-white text-blue-700 shadow-2xs border border-gray-200/80'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Transfers & Logs</span>
                <span className="bg-gray-100 text-gray-700 font-extrabold px-1.5 py-0.2 rounded-full text-[10px]">
                  {miniStockData?.movements?.length ?? 0}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMiniStockTab('locations')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  miniStockTab === 'locations'
                    ? 'bg-white text-blue-700 shadow-2xs border border-gray-200/80'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Locations</span>
                <span className="bg-gray-100 text-gray-700 font-extrabold px-1.5 py-0.2 rounded-full text-[10px]">
                  {miniStockData?.locations?.length ?? modalLocationsBreakdown.length ?? 0}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMiniStockTab('batches')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  miniStockTab === 'batches'
                    ? 'bg-white text-blue-700 shadow-2xs border border-gray-200/80'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Batches</span>
                <span className="bg-gray-100 text-gray-700 font-extrabold px-1.5 py-0.2 rounded-full text-[10px]">
                  {miniStockData?.batches?.length ?? 0}
                </span>
              </button>
            </div>

            {/* Tab Body */}
            {miniStockLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                <span className="text-xs font-semibold">Loading live stock transactions...</span>
              </div>
            ) : (
              <>
                {/* 1. Movements & Transfers Tab */}
                {miniStockTab === 'movements' && (
                  <div className="space-y-2.5">
                    {(!miniStockData?.movements || miniStockData.movements.length === 0) ? (
                      <div className="text-center py-10 bg-slate-50/70 rounded-2xl border border-dashed border-gray-200 text-gray-400 space-y-1.5">
                        <History className="w-6 h-6 mx-auto text-gray-300" />
                        <p className="font-bold text-gray-700 text-xs">No Stock Movement Logs Recorded</p>
                        <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                          Stock movements, warehouse transfers, purchase receipts, and production issues for this SKU will appear here in chronological order.
                        </p>
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs divide-y divide-gray-100 max-h-[340px] overflow-y-auto">
                        {miniStockData.movements.map((m: any, idx: number) => {
                          const isIncoming = m.direction === 'IN' || (m.qtyIn || 0) > 0 || (m.quantity || 0) > 0;
                          const isTransfer = (m.transactionType || '').toLowerCase().includes('transfer');
                          return (
                            <div key={m.id || idx} className="p-3 bg-white hover:bg-slate-50/80 flex items-center justify-between transition-colors gap-3">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className={`p-2 rounded-xl shrink-0 ${
                                  isTransfer
                                    ? 'bg-blue-100 text-blue-800'
                                    : isIncoming
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {isTransfer ? (
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                  ) : isIncoming ? (
                                    <ArrowDownLeft className="w-3.5 h-3.5" />
                                  ) : (
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                  )}
                                </div>
                                <div className="space-y-0.5 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-gray-900 text-xs">{m.transactionType || 'Stock Movement'}</span>
                                    {m.referenceId && (
                                      <span className="font-mono text-[9.5px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded border border-slate-200">
                                        #{m.referenceId}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10.5px] text-gray-400 flex items-center gap-1.5 flex-wrap">
                                    <span>{m.locationName || 'Warehouse'}</span>
                                    <span>•</span>
                                    <span>{m.timestamp ? new Date(m.timestamp).toLocaleString('en-IN') : 'Recent'}</span>
                                    {m.userName && <span>• by {m.userName}</span>}
                                  </div>
                                  {m.remarks && (
                                    <div className="text-[10.5px] text-gray-500 italic truncate">
                                      "{m.remarks}"
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className={`font-mono font-extrabold text-xs ${
                                  isIncoming ? 'text-emerald-600' : 'text-rose-600'
                                }`}>
                                  {isIncoming ? '+' : '-'}{Math.abs(Number(m.quantity || m.qtyIn || m.qtyOut || 0)).toLocaleString('en-IN')} {selectedSkuDetails.unit || 'Pcs'}
                                </div>
                                {m.balanceAfter !== undefined && (
                                  <div className="text-[10px] text-gray-400 font-mono">
                                    Bal: {Number(m.balanceAfter).toLocaleString('en-IN')}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Locations Tab */}
                {miniStockTab === 'locations' && (
                  <div className="space-y-2.5">
                    {((miniStockData?.locations || modalLocationsBreakdown).length === 0) ? (
                      <div className="text-center py-10 bg-slate-50/70 rounded-2xl border border-dashed border-gray-200 text-gray-400 space-y-1">
                        <MapPin className="w-6 h-6 mx-auto text-gray-300" />
                        <p className="font-bold text-gray-700 text-xs">Warehouse Storage</p>
                        <p className="text-[11px] text-gray-400">No multi-bay partitions recorded yet.</p>
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs divide-y divide-gray-100 max-h-[340px] overflow-y-auto">
                        {(miniStockData?.locations || modalLocationsBreakdown).map((loc: any, idx: number) => (
                          <div key={idx} className="p-3 bg-white hover:bg-slate-50/80 flex items-center justify-between transition-colors">
                            <div className="space-y-0.5 min-w-0">
                              <div className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span className="truncate">{loc.locationName || 'Warehouse Storage'}</span>
                                {loc.locationCode && (
                                  <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.2 rounded">
                                    {loc.locationCode}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10.5px] text-gray-400 font-medium">
                                {loc.hierarchyPath || `${loc.warehouseName || 'Warehouse'} ➔ ${loc.floorName || 'Floor'} ➔ ${loc.zoneName || 'Zone'}`}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-xs font-bold text-emerald-700 font-mono">
                                {Number(loc.onHand || 0).toLocaleString('en-IN')} {selectedSkuDetails.unit || 'Pcs'}
                              </div>
                              <div className="text-[10px] text-gray-400 font-medium">
                                ₹{Number(loc.stockValue || 0).toLocaleString('en-IN')}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Batches Tab */}
                {miniStockTab === 'batches' && (
                  <div className="space-y-2.5">
                    {(!miniStockData?.batches || miniStockData.batches.length === 0) ? (
                      <div className="text-center py-10 bg-slate-50/70 rounded-2xl border border-dashed border-gray-200 text-gray-400 space-y-1">
                        <Layers className="w-6 h-6 mx-auto text-gray-300" />
                        <p className="font-bold text-gray-700 text-xs">No Batch Numbers Tagged</p>
                        <p className="text-[11px] text-gray-400">Stock is tracked under general consolidated inventory.</p>
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs divide-y divide-gray-100 max-h-[340px] overflow-y-auto">
                        {miniStockData.batches.map((b: any, idx: number) => (
                          <div key={idx} className="p-3 bg-white hover:bg-slate-50/80 flex items-center justify-between transition-colors">
                            <div className="space-y-0.5 min-w-0">
                              <div className="font-bold text-xs text-gray-900 flex items-center gap-1.5 font-mono">
                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                <span>Batch #{b.batchNumber || `B-${idx + 1}`}</span>
                                {b.supplier && <span className="text-[10px] font-sans text-gray-500">({b.supplier})</span>}
                              </div>
                              <div className="text-[10.5px] text-gray-400">
                                {b.locationName || 'Main Storage'} • {b.date ? new Date(b.date).toLocaleDateString('en-IN') : 'Recent'}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-xs font-bold text-gray-900 font-mono">
                                {Number(b.remainingQty || 0).toLocaleString('en-IN')} {selectedSkuDetails.unit || 'Pcs'}
                              </div>
                              <div className="text-[10.5px] text-emerald-700 font-bold font-mono">
                                @ ₹{b.rate}/unit = ₹{Number(b.value || 0).toLocaleString('en-IN')}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Modal Bottom Footer Actions */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
              <a
                href={`/stock-inventory-v2?search=${encodeURIComponent(selectedSkuDetails.skuCode)}`}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors no-underline"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Full Inventory Hub</span>
              </a>
              <button
                type="button"
                onClick={() => setShowMiniStockModal(false)}
                className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
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
                    <span className="font-bold text-blue-700">{log.action}</span>
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
                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold"
              >
                Got it
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── DUPLICATE ITEMS SCANNER MODAL ── */}
      {showDuplicatesModal && (
        <Modal
          isOpen={showDuplicatesModal}
          onClose={() => setShowDuplicatesModal(false)}
          title={`Find Duplicates — ${getTabLabel(activeMainTab).toUpperCase()}`}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-4 text-left">
            {duplicateGroups.length === 0 ? (
              <div className="py-12 text-center bg-slate-50 border border-dashed border-gray-200 rounded-2xl">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
                <h3 className="font-bold text-base text-gray-900">No Duplicates Detected!</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  All entries in <span className="font-semibold">{getTabLabel(activeMainTab)}</span> have unique SKU codes and names.
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                <p className="text-xs text-gray-500 font-medium">
                  The following duplicate groups were identified. Check details and clean up if necessary:
                </p>
                
                {duplicateGroups.map((group, gIdx) => (
                  <div 
                    key={gIdx}
                    className={`border rounded-xl p-4 transition-all duration-150 ${
                      gIdx === highlightedDuplicateIdx
                        ? 'border-blue-500 bg-blue-50/20 ring-2 ring-blue-500/20 shadow-xs'
                        : 'border-red-200 bg-red-50/10'
                    }`}
                    onMouseEnter={() => setHighlightedDuplicateIdx(gIdx)}
                  >
                    <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-2 mb-3 border-b pb-2 border-red-100/50">
                      <div>
                        <span className="text-xs font-bold bg-red-100 text-red-800 px-2.5 py-0.5 rounded-lg border border-red-200">
                          Duplicate by {group.field}: {group.value}
                        </span>
                        <span className="text-xs text-gray-500 font-mono ml-2">{group.items.length} records</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCompareGroup(group)}
                          title="View Both"
                          className="px-2.5 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Both</span>
                        </button>
                        <button
                          onClick={() => {
                            setDuplicateGroups(prev => prev.filter((_, i) => i !== gIdx));
                            setHighlightedDuplicateIdx(prev => (prev > 0 ? prev - 1 : 0));
                          }}
                          title="Keep Both"
                          className="px-2.5 py-1 text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Keep Both</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {group.items.map((item) => (
                        <div key={item._id} className="flex justify-between items-center bg-white p-3 border border-gray-200 rounded-xl text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                                {item.skuCode}
                              </span>
                              <p className="font-bold text-gray-900 text-sm">
                                {item.name}
                              </p>
                            </div>
                            <div className="text-xs text-gray-500 mt-1 flex items-center space-x-2 flex-wrap">
                              <span>Category: {item.category || item.group || '—'}</span>
                              <span className="text-gray-300">|</span>
                              <span>UOM: {item.unit || '—'}</span>
                              {item.gsm && (
                                <>
                                  <span className="text-gray-300">|</span>
                                  <span>GSM: {item.gsm}</span>
                                </>
                              )}
                              <span className="text-gray-300">|</span>
                              <span>Stock: <strong className="text-gray-800">{item.openingStock ?? 0}</strong></span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => {
                                setEditSku(item);
                                setShowAddDrawer(true);
                                setShowDuplicatesModal(false);
                              }}
                              className="px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteDuplicateItem(item)}
                              className="px-2.5 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowDuplicatesModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-100 font-bold text-xs cursor-pointer text-gray-700"
              >
                Close Window
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── COMPARE DUPLICATES MODAL (Side by side) ── */}
      {compareGroup && (
        <div className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative bg-white rounded-2xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Copy className="w-5 h-5 text-blue-600" />
                <span>Compare Duplicates — {compareGroup.field}: {compareGroup.value}</span>
              </h3>
              <button
                onClick={() => setCompareGroup(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              {compareGroup.items.slice(0, 2).map((item, idx) => (
                <div key={item._id || idx} className="border border-gray-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
                  <div className="flex justify-between items-center border-b pb-2 border-gray-100">
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full">
                      Item #{idx + 1}
                    </span>
                    <span className="text-xs font-mono text-gray-400">ID: {item._id?.slice(-6) || '—'}</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-gray-400 text-[10px] uppercase font-bold">SKU Code:</span>
                      <p className="font-mono font-bold text-gray-900 text-sm">{item.skuCode}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px] uppercase font-bold">Item Name:</span>
                      <p className="font-bold text-gray-900">{item.name}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100">
                      <div>
                        <span className="text-gray-400 text-[10px] uppercase font-bold">Category:</span>
                        <p className="font-medium text-gray-800">{item.category || item.group || '—'}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 text-[10px] uppercase font-bold">UOM:</span>
                        <p className="font-medium text-gray-800">{item.unit || '—'}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 text-[10px] uppercase font-bold">GSM:</span>
                        <p className="font-medium text-gray-800">{item.gsm || '—'}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 text-[10px] uppercase font-bold">Pages:</span>
                        <p className="font-medium text-gray-800">{item.pages || '—'}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 text-[10px] uppercase font-bold">Opening Stock:</span>
                        <p className="font-bold text-emerald-700">{item.openingStock ?? 0}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 text-[10px] uppercase font-bold">Status:</span>
                        <p className="font-medium text-gray-800">{item.status || 'Active'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => {
                        setEditSku(item);
                        setShowAddDrawer(true);
                        setCompareGroup(null);
                        setShowDuplicatesModal(false);
                      }}
                      className="flex-1 py-1.5 bg-blue-50 text-blue-700 font-bold rounded-lg hover:bg-blue-100 text-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        handleDeleteDuplicateItem(item);
                        setCompareGroup(null);
                      }}
                      className="flex-1 py-1.5 bg-red-50 text-red-700 font-bold rounded-lg hover:bg-red-100 text-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setCompareGroup(null)}
                className="px-4 py-2 bg-gray-800 text-white rounded-xl text-xs font-bold hover:bg-gray-900 cursor-pointer"
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
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
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
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
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:ring-1 focus:ring-blue-400 bg-white"
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
                              opt.color === c ? 'scale-125 ring-2 ring-blue-500' : 'hover:scale-110'
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
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-mono text-gray-800 bg-white focus:ring-2 focus:ring-blue-500"
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
          hideCloseButton={true}
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
                  title="Close Build BOMs"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 3-Column Body Layout */}
            <div className="grid grid-cols-12 gap-4 flex-1 overflow-hidden min-h-[540px]">
              
              {/* Column 1: Products Selector List (3 cols) */}
              <div className="col-span-3 border border-gray-200 rounded-2xl p-3 flex flex-col gap-2.5 bg-gray-50/40 overflow-hidden">
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      value={buildBomsSearch}
                      onChange={(e) => setBuildBomsSearch(e.target.value)}
                      placeholder="Search products..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 shadow-2xs font-medium"
                    />
                  </div>

                  {/* Title & Ruling Spec Filter Row */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <select
                        value={buildBomsTitleFilter}
                        onChange={(e) => setBuildBomsTitleFilter(e.target.value)}
                        className="w-full px-2 py-1 text-[11px] font-semibold bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs truncate"
                        title="Filter by Title"
                      >
                        <option value="">All Titles ({buildBomsAvailableTitles.length})</option>
                        {buildBomsAvailableTitles.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <select
                        value={buildBomsRulingFilter}
                        onChange={(e) => setBuildBomsRulingFilter(e.target.value)}
                        className="w-full px-2 py-1 text-[11px] font-semibold bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs truncate"
                        title="Filter by Ruling"
                      >
                        <option value="">All Rulings ({buildBomsAvailableRulings.length})</option>
                        {buildBomsAvailableRulings.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Sort Controls Row */}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={buildBomsSortBy}
                      onChange={(e) => setBuildBomsSortBy(e.target.value as any)}
                      className="w-full px-2 py-1 text-[11px] font-bold bg-blue-50/80 border border-blue-200 rounded-lg text-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                      title="Sort products list"
                    >
                      <option value="default">Sort: Default Code</option>
                      <option value="title-asc">Sort: Title (A → Z)</option>
                      <option value="title-desc">Sort: Title (Z → A)</option>
                      <option value="ruling-asc">Sort: Ruling (A → Z)</option>
                      <option value="ruling-desc">Sort: Ruling (Z → A)</option>
                      <option value="name-asc">Sort: Product Name (A → Z)</option>
                    </select>

                    {(buildBomsTitleFilter || buildBomsRulingFilter || buildBomsSortBy !== 'default' || onlyNoRecipeFilter || buildBomsSearch) && (
                      <button
                        type="button"
                        onClick={() => {
                          setBuildBomsSearch('');
                          setBuildBomsTitleFilter('');
                          setBuildBomsRulingFilter('');
                          setBuildBomsSortBy('default');
                          setOnlyNoRecipeFilter(false);
                        }}
                        className="px-2 py-1 text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg shrink-0 cursor-pointer transition-all"
                        title="Reset all filters"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-600 cursor-pointer select-none px-1">
                    <input
                      type="checkbox"
                      checked={onlyNoRecipeFilter}
                      onChange={(e) => setOnlyNoRecipeFilter(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Only products without a recipe</span>
                  </label>
                </div>

                {/* Product List with Quick Copy/Paste on Hover & Clipboard Banner */}
                {copiedBom && (
                  <div className="p-2.5 bg-emerald-50/90 border border-emerald-200 rounded-xl flex flex-col gap-2 text-xs shrink-0 shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">BOM in Clipboard</span>
                        <span className="text-xs font-bold text-gray-800 truncate block" title={copiedBom.sourceName}>
                          {copiedBom.sourceName} ({copiedBom.lines.length} items)
                        </span>
                      </div>
                      {activeBomProduct && (
                        <button
                          type="button"
                          onClick={async () => {
                            await handleDirectPasteBomToSku(activeBomProduct);
                            setActiveRecipeItems(copiedBom.lines.map((l, i) => ({
                              id: `b-build-paste-${Date.now()}-${i}`,
                              name: l.name,
                              qty: Number(l.qty) || 1,
                              uom: l.uom,
                              inStock: l.inStock ?? 500,
                              notes: l.notes || ''
                            })));
                            if (copiedBom.basis) setBuildBatchYieldQty(String(copiedBom.basis));
                          }}
                          className="px-2.5 py-1 bg-[#064E3B] hover:bg-[#0B6B63] text-white rounded-md text-[11px] font-medium shrink-0 cursor-pointer shadow-2xs transition-all"
                        >
                          Paste to Active
                        </button>
                      )}
                    </div>

                    {/* Bulk Action: Paste to all products without a recipe! */}
                    {(() => {
                      const noRecipeProducts = filteredBuildProducts.filter(p => !(p as any).bomItems || (p as any).bomItems.length === 0);
                      if (noRecipeProducts.length === 0) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => handleBatchPasteToAllWithoutRecipe(noRecipeProducts)}
                          className="w-full py-1.5 px-2 bg-white hover:bg-emerald-100/70 border border-emerald-300 text-emerald-900 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-all"
                        >
                          <MakoroPasteIcon className="w-3.5 h-3.5 text-[#064E3B]" />
                          <span>Paste to all {noRecipeProducts.length} without recipe</span>
                        </button>
                      );
                    })()}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                  {filteredBuildProducts.map((prod) => {
                    const hasRecipe = (prod as any).bomItems && (prod as any).bomItems.length > 0;
                    const isSelected = activeBomProduct?._id === prod._id;

                    return (
                      <div
                        key={prod._id}
                        onClick={() => handleSelectBomProduct(prod)}
                        className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between border group/item ${
                          isSelected
                            ? 'bg-emerald-50/80 border-emerald-300 shadow-2xs'
                            : 'bg-white border-transparent hover:bg-gray-100/80 hover:border-gray-200'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
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
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className="text-[10px] text-gray-400 font-mono">{prod.skuCode}</span>
                              {(prod.title || prod.brand) && (
                                <span className="text-[9.5px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded font-medium border border-emerald-200/60 truncate max-w-[100px]" title={prod.title || prod.brand}>
                                  {prod.title || prod.brand}
                                </span>
                              )}
                              {prod.ruleType && (
                                <span className="text-[9.5px] text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded font-medium border border-blue-200/60 truncate max-w-[100px]" title={prod.ruleType}>
                                  {prod.ruleType}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Quick Copy / Paste Icons for this product in the list matching Makoro style */}
                        <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                          {hasRecipe && (
                            <div className="relative group/copy">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyBom({
                                    sourceSkuId: prod._id,
                                    sourceSkuCode: prod.skuCode,
                                    sourceName: prod.name || prod.skuCode,
                                    basis: (prod as any).recipeYieldQty || (prod as any).batchYieldQty || 1,
                                    basisUnit: (prod as any).recipeYieldUnit || (prod as any).batchYieldUnit || prod.unit || 'Pcs',
                                    lines: (prod as any).bomItems || []
                                  });
                                  showToast(`BOM copied from "${prod.name || prod.skuCode}"! Ready to paste.`, 'success');
                                }}
                                className="h-6 w-6 rounded border border-gray-200 bg-white text-[#0B6B63] hover:border-[#0B6B63] flex items-center justify-center shadow-2xs transition-all cursor-pointer"
                                aria-label="Copy BOM"
                              >
                                <Copy className="w-3 h-3 text-[#0B6B63]" />
                              </button>
                              <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1 hidden group-hover/copy:block z-50 whitespace-nowrap">
                                <div className="bg-[#323842] text-white text-[11px] font-normal px-2.5 py-1 rounded-md shadow-xl">
                                  Copy this BOM
                                </div>
                              </div>
                            </div>
                          )}
                          {copiedBom && (
                            <div className="relative group/paste">
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await handleDirectPasteBomToSku(prod);
                                  if (activeBomProduct?._id === prod._id) {
                                    setActiveRecipeItems(copiedBom.lines.map((l, i) => ({
                                      id: `b-build-paste-${Date.now()}-${i}`,
                                      name: l.name,
                                      qty: Number(l.qty) || 1,
                                      uom: l.uom,
                                      inStock: l.inStock ?? 500,
                                      notes: l.notes || ''
                                    })));
                                    if (copiedBom.basis) setBuildBatchYieldQty(String(copiedBom.basis));
                                  }
                                }}
                                className="h-6 w-6 rounded border border-gray-200 bg-white text-[#0B6B63] hover:border-[#0B6B63] flex items-center justify-center shadow-2xs transition-all cursor-pointer"
                                aria-label="Paste BOM"
                              >
                                <MakoroPasteIcon className="w-3 h-3 text-[#0B6B63]" />
                              </button>
                              <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1 hidden group-hover/paste:block z-50 whitespace-nowrap">
                                <div className="bg-[#323842] text-white text-[11px] font-normal px-2.5 py-1 rounded-md shadow-xl">
                                  Paste BOM into this product
                                </div>
                              </div>
                            </div>
                          )}
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
                        <BomCopyPasteControls
                          getCopyPayload={() => {
                            if (!activeRecipeItems || activeRecipeItems.length === 0) return null;
                            return {
                              sourceSkuId: activeBomProduct?._id,
                              sourceSkuCode: activeBomProduct?.skuCode,
                              sourceName: activeBomProduct?.name || activeBomProduct?.skuCode || 'Product',
                              basis: buildBatchYieldQty,
                              basisUnit: buildBatchYieldUnit || (activeBomProduct as any)?.recipeYieldUnit || activeBomProduct?.unit || 'Pcs',
                              lines: activeRecipeItems.map(item => ({
                                id: item.id,
                                name: item.name,
                                qty: item.qty,
                                uom: item.uom,
                                inStock: item.inStock,
                                notes: item.notes
                              }))
                            };
                          }}
                          onPaste={(copied, mode) => {
                            if (mode === 'replace') {
                              setActiveRecipeItems(copied.lines.map((l, i) => ({
                                id: `b-build-paste-${Date.now()}-${i}`,
                                name: l.name,
                                qty: Number(l.qty) || 1,
                                uom: l.uom,
                                inStock: l.inStock ?? 500,
                                notes: l.notes || ''
                              })));
                              if (copied.basis) setBuildBatchYieldQty(String(copied.basis));
                              if (copied.basisUnit) setBuildBatchYieldUnit(copied.basisUnit);
                            } else {
                              const existingNames = new Set(activeRecipeItems.map(i => (i.name || '').toLowerCase().trim()));
                              const toAdd = copied.lines
                                .filter(l => !existingNames.has((l.name || '').toLowerCase().trim()))
                                .map((l, i) => ({
                                  id: `b-build-merge-${Date.now()}-${i}`,
                                  name: l.name,
                                  qty: Number(l.qty) || 1,
                                  uom: l.uom,
                                  inStock: l.inStock ?? 500,
                                  notes: l.notes || ''
                                }));
                              if (activeRecipeItems.length === 0 && copied.basis) {
                                setBuildBatchYieldQty(String(copied.basis));
                              }
                              if (copied.basisUnit) {
                                setBuildBatchYieldUnit(copied.basisUnit);
                              }
                              setActiveRecipeItems(prev => [...prev, ...toAdd]);
                            }
                          }}
                          existingCount={activeRecipeItems.length}
                          sourceLabel={activeBomProduct?.name}
                          onToast={showToast}
                        />
                        <button
                          onClick={handleSaveBuildBomRecipe}
                          disabled={isSavingBuildBom}
                          className="px-3.5 py-1.5 bg-[#064E3B] hover:bg-[#0B6B63] text-white font-medium rounded-md text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isSavingBuildBom ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          <span>Save recipe</span>
                        </button>
                      </div>
                    </div>

                    {/* Sub-header details bar with UOM & AUOM support */}
                    {(() => {
                      const uom = activeBomProduct?.unit || 'Pcs';
                      const auom = activeBomProduct?.altUnit;
                      const hasAuom = !!(auom && auom.trim() && auom.trim().toLowerCase() !== uom.trim().toLowerCase());
                      const currentUnit = buildBatchYieldUnit || (activeBomProduct as any)?.recipeYieldUnit || uom;

                      const options: { value: string; label: string }[] = [];
                      options.push({ value: uom, label: hasAuom ? `${uom} (UOM)` : uom });
                      if (hasAuom) {
                        options.push({ value: auom!.trim(), label: `${auom!.trim()} (AUOM)` });
                      }

                      return (
                        <div className="flex items-center gap-3 text-xs font-semibold text-gray-500 bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex-wrap">
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
                              className="w-16 px-2 py-1 border border-blue-300 rounded-lg text-xs font-bold text-blue-700 text-center bg-white shadow-2xs focus:ring-2 focus:ring-blue-400 focus:outline-none"
                              title="Batch Yield Quantity (Number of pieces)"
                            />
                            {options.length > 1 ? (
                              <select
                                value={currentUnit}
                                onChange={(e) => setBuildBatchYieldUnit(e.target.value)}
                                className="px-2.5 py-1 border border-blue-300 rounded-lg text-xs font-bold text-blue-900 bg-blue-50/90 cursor-pointer shadow-2xs focus:ring-2 focus:ring-blue-400 focus:outline-none"
                                title="Yield Unit (UOM / AUOM)"
                              >
                                {options.map(opt => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <strong className="text-gray-800 bg-white border border-gray-200 px-2.5 py-1 rounded-lg text-xs font-bold font-mono shadow-2xs">
                                {uom}
                              </strong>
                            )}
                          </div>
                          <span>·</span>
                          <span className="text-[11px] font-normal text-gray-400">Quantities configured per batch produced</span>
                        </div>
                      );
                    })()}

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
                              skuId: matchedSku?._id,
                              skuCode: matchedSku?.skuCode,
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

                    {/* Draggable Recipe Items List with Runs calculation */}
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 border border-gray-100 rounded-xl p-2 bg-gray-50/20">
                      {activeRecipeItems.length > 0 && (
                        <div className="flex items-center gap-2 px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          <span className="w-4"></span>
                          <span className="flex-1">Material</span>
                          <span className="w-20 text-center">Qty</span>
                          <span className="w-16 text-center">UOM</span>
                          <span className="w-16 text-center">In Stock</span>
                          <span className="w-16 text-center">Runs</span>
                          <span className="w-6"></span>
                        </div>
                      )}

                      {activeRecipeItems.map((b) => {
                        const qtyNum = Number(b.qty);
                        const inStockNum = Number(b.inStock) || 0;
                        const runs = (qtyNum > 0) ? Math.floor(inStockNum / qtyNum) : null;

                        return (
                          <div
                            key={b.id}
                            className="p-2.5 bg-white border border-gray-200 rounded-xl shadow-2xs flex items-center gap-2.5 text-xs hover:border-gray-300 transition-colors"
                          >
                            <span className="text-gray-400 font-bold select-none cursor-grab text-[11px] w-4">⋮⋮</span>

                            <div className="flex-1 font-bold text-gray-900 text-xs min-w-0 pr-2 leading-relaxed" title={b.name}>
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
                                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold font-mono text-center focus:outline-none focus:border-[#064E3B] bg-white"
                                placeholder="Qty"
                              />
                            </div>

                            <div className="w-16">
                              <input
                                type="text"
                                value={b.uom || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setActiveRecipeItems(prev => prev.map(item => item.id === b.id ? { ...item, uom: val } : item));
                                }}
                                className="w-full border border-gray-200 rounded-lg px-1.5 py-1 text-xs font-semibold text-center uppercase focus:outline-none focus:border-[#064E3B] bg-white"
                                placeholder="UOM"
                              />
                            </div>

                            <span className="text-gray-400 font-mono text-[11px] w-16 text-center">{b.inStock}</span>

                            <span className="text-gray-900 font-bold text-[11px] w-16 text-center">
                              {runs !== null ? runs.toLocaleString() : '—'}
                            </span>

                            <button
                              onClick={() => setActiveRecipeItems(prev => prev.filter(item => item.id !== b.id))}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-all cursor-pointer w-6 flex items-center justify-center"
                              title="Remove material"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}

                      {activeRecipeItems.length === 0 && (
                        <div className="p-8 text-center text-xs text-gray-400 italic">
                          No material ingredients added to recipe yet. Paste a BOM or select from the right catalog!
                        </div>
                      )}
                    </div>

                    {/* Bottom Summary Bar matching Makoro style */}
                    <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between shadow-2xs shrink-0">
                      <div className="flex items-center gap-8 text-xs">
                        <div>
                          <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Items</div>
                          <div className="text-xs font-bold text-gray-900">{activeRecipeItems.length} items</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Can make</div>
                          <div className="text-xs font-bold text-gray-900">
                            {(() => {
                              const validRuns = activeRecipeItems
                                .map(b => (b.qty && Number(b.qty) > 0) ? Math.floor((Number(b.inStock) || 0) / Number(b.qty)) : null)
                                .filter((v): v is number => v !== null);
                              if (validRuns.length === 0) return '—';
                              return `${Math.min(...validRuns).toLocaleString()} units`;
                            })()}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleSaveBuildBomRecipe}
                        disabled={isSavingBuildBom}
                        className="px-3.5 py-1.5 bg-[#064E3B] hover:bg-[#0B6B63] text-white font-medium rounded-md text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isSavingBuildBom ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        <span>Save recipe</span>
                      </button>
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
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 shadow-2xs"
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
                                  inStock: Number((mat as any).presentStock || 0),
                                  notes: ''
                                }
                              ]);
                            }
                          }}
                          className={`p-2 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-all border ${
                            isAdded
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                              : 'bg-white border-gray-200 hover:border-blue-300 text-gray-800 shadow-2xs'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={isAdded ? 'text-emerald-600 font-bold' : 'text-blue-600 font-bold'}>
                              {isAdded ? '✓' : '+'}
                            </span>
                            <span className="truncate text-[11px]">{mat.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                            {Number((mat as any).presentStock || 0)}
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
                                  inStock: Number((semi as any).presentStock || 0),
                                  notes: ''
                                }
                              ]);
                            }
                          }}
                          className={`p-2 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-all border ${
                            isAdded
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                              : 'bg-white border-gray-200 hover:border-blue-300 text-gray-800 shadow-2xs'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={isAdded ? 'text-emerald-600 font-bold' : 'text-blue-600 font-bold'}>
                              {isAdded ? '✓' : '+'}
                            </span>
                            <span className="truncate text-[11px]">{semi.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                            {Number((semi as any).presentStock || 0)}
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

      {/* ── BULK EDIT SKUS MODAL (Cream / Beige Theme) ── */}
      {showBulkEditModal && (
        <Modal
          isOpen={showBulkEditModal}
          onClose={() => setShowBulkEditModal(false)}
          title={`Bulk Edit ${selectedIds.length} ${getTabLabel(activeMainTab).toUpperCase()} Records`}
          maxWidth="max-w-xl"
        >
          <div className="space-y-4 text-left">
            <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700 font-medium leading-relaxed">
              Check the boxes next to the fields you want to update. Any unchecked fields will remain unchanged across the <strong>{selectedIds.length}</strong> selected items.
            </div>

            <div className="space-y-3">
              {/* Status */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50/80 transition-colors">
                <input
                  type="checkbox"
                  id="sku_bulk_status_check"
                  checked={bulkEditFields.status}
                  onChange={e => setBulkEditFields(prev => ({ ...prev, status: e.target.checked }))}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <div className="flex-1">
                  <label htmlFor="sku_bulk_status_check" className="block text-xs font-bold text-gray-700 cursor-pointer">
                    Status
                  </label>
                  <select
                    disabled={!bulkEditFields.status}
                    value={bulkEditValues.status}
                    onChange={e => setBulkEditValues(prev => ({ ...prev, status: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white disabled:bg-gray-100 disabled:text-gray-400 font-semibold"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Category */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50/80 transition-colors">
                <input
                  type="checkbox"
                  id="sku_bulk_category_check"
                  checked={bulkEditFields.category}
                  onChange={e => setBulkEditFields(prev => ({ ...prev, category: e.target.checked }))}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <div className="flex-1">
                  <label htmlFor="sku_bulk_category_check" className="block text-xs font-bold text-gray-700 cursor-pointer">
                    Category
                  </label>
                  <input
                    type="text"
                    list="sku_bulk_cat_list"
                    disabled={!bulkEditFields.category}
                    placeholder="Select or enter category"
                    value={bulkEditValues.category}
                    onChange={e => setBulkEditValues(prev => ({ ...prev, category: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white disabled:bg-gray-100 disabled:text-gray-400 font-semibold"
                  />
                  <datalist id="sku_bulk_cat_list">
                    {categoriesData.map(c => (
                      <option key={c.id || c.name} value={c.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* AUOM (altUnit) */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50/80 transition-colors">
                <input
                  type="checkbox"
                  id="sku_bulk_altunit_check"
                  checked={bulkEditFields.altUnit}
                  onChange={e => setBulkEditFields(prev => ({ ...prev, altUnit: e.target.checked }))}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <div className="flex-1">
                  <label htmlFor="sku_bulk_altunit_check" className="block text-xs font-bold text-gray-700 cursor-pointer">
                    AUOM (Packaging / Sales Unit)
                  </label>
                  <input
                    type="text"
                    disabled={!bulkEditFields.altUnit}
                    placeholder="e.g. GBL, BOX, CTN, PKT, BDL, REAM"
                    value={bulkEditValues.altUnit}
                    onChange={e => setBulkEditValues(prev => ({ ...prev, altUnit: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white disabled:bg-gray-100 disabled:text-gray-400 font-semibold"
                  />
                </div>
              </div>

              {/* UOM (unit) */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50/80 transition-colors">
                <input
                  type="checkbox"
                  id="sku_bulk_unit_check"
                  checked={bulkEditFields.unit}
                  onChange={e => setBulkEditFields(prev => ({ ...prev, unit: e.target.checked }))}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <div className="flex-1">
                  <label htmlFor="sku_bulk_unit_check" className="block text-xs font-bold text-gray-700 cursor-pointer">
                    UOM (Base Inventory Unit)
                  </label>
                  <input
                    type="text"
                    disabled={!bulkEditFields.unit}
                    placeholder="e.g. Pcs, Kg, Sheets"
                    value={bulkEditValues.unit}
                    onChange={e => setBulkEditValues(prev => ({ ...prev, unit: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white disabled:bg-gray-100 disabled:text-gray-400 font-semibold"
                  />
                </div>
              </div>

              {/* GSM */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50/80 transition-colors">
                <input
                  type="checkbox"
                  id="sku_bulk_gsm_check"
                  checked={bulkEditFields.gsm}
                  onChange={e => setBulkEditFields(prev => ({ ...prev, gsm: e.target.checked }))}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <div className="flex-1">
                  <label htmlFor="sku_bulk_gsm_check" className="block text-xs font-bold text-gray-700 cursor-pointer">
                    GSM (Paper Weight)
                  </label>
                  <input
                    type="text"
                    disabled={!bulkEditFields.gsm}
                    placeholder="e.g. 52, 54, 58, 60, 70"
                    value={bulkEditValues.gsm}
                    onChange={e => setBulkEditValues(prev => ({ ...prev, gsm: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white disabled:bg-gray-100 disabled:text-gray-400 font-semibold"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowBulkEditModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkEditSkus}
                disabled={isBulkOperating || !Object.values(bulkEditFields).some(Boolean)}
                className="px-4 py-2 text-xs font-bold bg-[#785b3a] hover:bg-[#634a2d] text-white rounded-xl shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isBulkOperating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Apply to {selectedIds.length} Items</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── BULK DELETE SKUS CONFIRMATION MODAL ── */}
      {showBulkDeleteModal && (
        <Modal
          isOpen={showBulkDeleteModal}
          onClose={() => setShowBulkDeleteModal(false)}
          title={`Delete ${selectedIds.length} Items`}
          maxWidth="max-w-md"
        >
          <div className="space-y-4 text-left">
            <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-100 rounded-2xl">
              <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="text-xs">
                <h4 className="font-bold text-rose-900 text-sm">Confirm Bulk Deletion</h4>
                <p className="text-rose-700 mt-1 leading-relaxed">
                  Are you sure you want to move <strong>{selectedIds.length}</strong> selected {getTabLabel(activeMainTab).toLowerCase()} items to the Recycle Bin?
                </p>
                <p className="text-gray-500 mt-1.5 text-[11px]">
                  You can restore these items anytime from the Recycle Bin.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteSkus}
                disabled={isBulkOperating}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isBulkOperating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Move to Recycle Bin</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── RECYCLE BIN MODAL ── */}
      {showRecycleBinModal && (
        <Modal
          isOpen={showRecycleBinModal}
          onClose={() => setShowRecycleBinModal(false)}
          title={`Recycle Bin (${recycledSkus.length} Items)`}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-4 text-left">
            <div className="flex items-center justify-between p-3.5 bg-rose-50 border border-rose-100 rounded-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-rose-900 text-sm">Recycle Bin Repository</h4>
                  <p className="text-[11px] text-rose-700">
                    Deleted items stay safely stored in the Recycle Bin. You can restore them anytime or permanently remove them.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchRecycleBinSkus}
                disabled={loadingRecycleBin}
                className="px-3 py-1.5 bg-white hover:bg-rose-100/60 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingRecycleBin ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {loadingRecycleBin ? (
              <div className="py-12 text-center text-xs font-bold text-gray-400 animate-pulse">
                Loading deleted items...
              </div>
            ) : recycledSkus.length === 0 ? (
              <div className="py-12 text-center space-y-2 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                <Trash2 className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="text-xs font-bold text-gray-600">Recycle Bin is Empty</p>
                <p className="text-[11px] text-gray-400">No deleted items in this company.</p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto border border-gray-200 rounded-2xl divide-y divide-gray-100 bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-50/80 text-gray-500 font-bold text-[11px] sticky top-0 bg-white z-10 border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-3">SKU CODE</th>
                      <th className="py-2.5 px-3">ITEM NAME</th>
                      <th className="py-2.5 px-3">CATEGORY</th>
                      <th className="py-2.5 px-3">UOM</th>
                      <th className="py-2.5 px-3 text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                    {recycledSkus.map(sku => (
                      <tr key={sku._id} className="hover:bg-rose-50/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-rose-600">{sku.skuCode}</td>
                        <td className="py-2.5 px-3 font-bold text-gray-900">{sku.name}</td>
                        <td className="py-2.5 px-3 text-gray-600">{sku.category || '—'}</td>
                        <td className="py-2.5 px-3 text-gray-600">{sku.unit}</td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleRestoreSku(sku)}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                              title="Restore to active inventory"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Restore</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePermanentDeleteSku(sku)}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                              title="Delete permanently from database"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowRecycleBinModal(false)}
                className="px-4 py-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl cursor-pointer"
              >
                Close
              </button>
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

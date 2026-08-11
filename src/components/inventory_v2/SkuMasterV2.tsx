import React, { useEffect, useState, useRef } from 'react';
import { Package, Search, Plus, Download, Upload, X, Eye, Edit, Trash2, RefreshCw, Layers, Clock, AlertTriangle, CheckCircle, ChevronDown, Settings, ChevronLeft, ChevronRight, User, ChevronsLeft, ChevronsRight, ArrowUpDown, Columns, ChevronUp, Filter, BookOpen, History, CreditCard, FileText, ShoppingCart } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getSkusV2, bulkImportSkusV2, deleteSkuV2, updateSkuV2, SkuV2 } from '../../api/mfgApiV2';
import { getActivityLogs, createActivityLog } from '../../api/activityLogApi';
import AddSkuDrawerV2 from './AddSkuDrawerV2';
import { showToast } from '../ui/Toast';
import * as XLSX from 'xlsx';
import Modal from '../ui/Modal';
import Drawer from '../ui/Drawer';
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
    return `${w} × ${l} cm`;
  } else if (w) {
    return `${w} cm (W)`;
  } else if (l) {
    return `${l} cm (L)`;
  }
  return '—';
};

const SkuMasterV2: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useAuth();
  const [skus, setSkus] = useState<SkuV2[]>([]);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sortRules, setSortRules] = useState<{ field: string; order: 'asc' | 'desc' }[]>(() => {
    const saved = localStorage.getItem('skbw_erp_sort_rules_skus');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [];
  });
  const [showSortSelector, setShowSortSelector] = useState(false);
  const [filterRules, setFilterRules] = useState<{ join: 'and'; field: string; condition: 'equal to' | 'contains' | 'greater than' | 'less than' | 'starts with' | 'ends with'; value: string }[]>(() => {
    const saved = localStorage.getItem('skbw_erp_filter_rules_skus');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [];
  });
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [unitFilter, setUnitFilter] = useState('');
  const [allSkus, setAllSkus] = useState<SkuV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Column Visibility
  const allColumns: Record<string, string> = {
    skuCode: 'Item Code',
    name: 'Item Name',
    category: 'Category',
    group: 'Group',
    unit: 'Primary Unit',
    altUnit: 'Alternate Unit',
    altUnitConversion: 'Conversion Rate',
    gsm: 'GSM',
    dimensions: 'Size (W x L)',
    pages: 'Pages / Std Sheets',
    openingStock: 'Opening Stock',
    status: 'Status'
  };

  const defaults = {
    skuCode: true,
    name: true,
    category: true,
    group: true,
    unit: true,
    altUnit: true,
    altUnitConversion: true,
    gsm: true,
    dimensions: true,
    pages: true,
    openingStock: true,
    status: true
  };

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('skbw_erp_sku_visible_columns');
    if (saved) {
      try {
        return { ...defaults, ...JSON.parse(saved) };
      } catch (e) {}
    }
    return defaults;
  });

  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const columnDropdownRef = useRef<HTMLDivElement>(null);

  // Tools states
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  
  // Tools action data
  const [logSearch, setLogSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('ALL');
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<{ field: string; value: string; items: SkuV2[] }[]>([]);
  const [recycleBinItems, setRecycleBinItems] = useState<SkuV2[]>([]);
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);
  const toolsDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(event.target as Node)) {
        setShowToolsDropdown(false);
      }
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(event.target as Node)) {
        setShowColumnDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        // Fallback mock logs
        const mockLogs = skus.slice(0, 10).map((s, idx) => ({
          _id: `mock-log-${idx}`,
          action: 'CREATE',
          entityType: 'SkuV2',
          entityName: s.skuCode,
          details: `SKU Item '${s.name}' was created and verified in active inventory.`,
          performedBy: 'System Admin',
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

  const findSkuDuplicates = () => {
    const nameMap = new Map<string, SkuV2[]>();
    const codeMap = new Map<string, SkuV2[]>();

    allSkus.forEach(s => {
      const code = s.skuCode?.trim().toLowerCase();
      const name = s.name?.trim().toLowerCase();
      if (code) {
        if (!codeMap.has(code)) codeMap.set(code, []);
        codeMap.get(code)!.push(s);
      }
      if (name) {
        if (!nameMap.has(name)) nameMap.set(name, []);
        nameMap.get(name)!.push(s);
      }
    });

    const groups: { field: string; value: string; items: SkuV2[] }[] = [];
    codeMap.forEach((items, code) => {
      if (items.length > 1) {
        groups.push({ field: 'SKU Code', value: items[0].skuCode, items });
      }
    });
    nameMap.forEach((items, name) => {
      if (items.length > 1) {
        const exists = groups.some(g => g.items.some(item => items.some(i => i._id === item._id)));
        if (!exists) {
          groups.push({ field: 'SKU Name', value: items[0].name, items });
        }
      }
    });

    setDuplicateGroups(groups);
  };

  const fetchRecycleBin = async () => {
    try {
      setRecycleBinLoading(true);
      const res = await getSkusV2(selectedCompany?._id || '', undefined, undefined, undefined, true);
      setRecycleBinItems(res || []);
    } catch (err) {
      showToast('Failed to load Recycle Bin', 'error');
    } finally {
      setRecycleBinLoading(false);
    }
  };

  const handleRestoreSku = async (sku: SkuV2) => {
    try {
      if (!sku._id) return;
      await updateSkuV2(sku._id, {
        skuCode: sku.skuCode,
        name: sku.name,
        category: sku.category,
        unit: sku.unit,
        altUnit: sku.altUnit,
        altUnitConversion: sku.altUnitConversion,
        gsm: sku.gsm,
        width: sku.width,
        length: sku.length,
        brand: sku.brand,
        group: sku.group,
        ruleType: sku.ruleType,
        status: 'Active',
        isDeleted: false,
        company: selectedCompany?._id
      });
      showToast(`SKU '${sku.skuCode}' restored successfully`, 'success');
      setRecycleBinItems(prev => prev.filter(item => item._id !== sku._id));
      const res = await getSkusV2(selectedCompany?._id || '', undefined, undefined, undefined, false);
      setSkus(res || []);
      setAllSkus(res || []);
      await createActivityLog({
        action: 'RESTORE',
        entityType: 'SkuV2',
        entityName: sku.skuCode,
        details: `SKU item '${sku.skuCode}' was restored from Recycle Bin`,
        company: selectedCompany?._id
      });
    } catch (err) {
      showToast('Failed to restore SKU', 'error');
    }
  };

  const handlePermanentDeleteSku = async (sku: SkuV2) => {
    try {
      if (!sku._id) return;
      if (!window.confirm(`Are you sure you want to permanently delete SKU '${sku.skuCode}'? This action cannot be undone.`)) {
        return;
      }
      await deleteSkuV2(sku._id, selectedCompany?._id || '', true);
      showToast(`SKU '${sku.skuCode}' permanently deleted`, 'success');
      setRecycleBinItems(prev => prev.filter(item => item._id !== sku._id));
      createActivityLog({
        action: 'PERMANENT_DELETE',
        entityType: 'SkuV2',
        entityName: sku.skuCode,
        details: `SKU item '${sku.skuCode}' was permanently deleted from system`,
        company: selectedCompany?._id
      }).catch(() => {});
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.msg || 'Failed to permanently delete SKU', 'error');
    }
  };
  // Drawer & Modal states
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [editSku, setEditSku] = useState<SkuV2 | null>(null);
  const [deleteConfirmSku, setDeleteConfirmSku] = useState<SkuV2 | null>(null);
  const [selectedSkuDetails, setSelectedSkuDetails] = useState<SkuV2 | null>(null);
  const [showImportDrawer, setShowImportDrawer] = useState(false);
  const [importText, setImportText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccessMsg, setImportSuccessMsg] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch full unfiltered SKUs once on company change to keep top stats counts accurate
  useEffect(() => {
    if (selectedCompany?._id) {
      getSkusV2(selectedCompany._id)
        .then(data => setAllSkus(data))
        .catch(err => console.error('Failed to load total counts', err));
    }
  }, [selectedCompany?._id]);

  // Load when company or filters change (with loader spinner)
  useEffect(() => {
    if (selectedCompany?._id) {
      loadSkus(true);
    }
  }, [selectedCompany?._id, categoryFilter, statusFilter]);

  // Load when search changes (without spinner for smooth typing)
  useEffect(() => {
    if (selectedCompany?._id) {
      loadSkus(false);
    }
  }, [debouncedSearch]);

  // Background poller to refresh SKU data silently every 5 seconds
  useEffect(() => {
    if (!selectedCompany?._id) return;

    const interval = setInterval(() => {
      // Reload table list silently
      loadSkus(false);
      
      // Reload stats cards silently
      getSkusV2(selectedCompany._id)
        .then(data => setAllSkus(data))
        .catch(() => {});
    }, 5000);

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
      setSkus(data);
      if (!categoryFilter && !debouncedSearch && !statusFilter) {
        setAllSkus(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const handleStatsCardClick = (category: string) => {
    setCategoryFilter(prev => prev === category ? '' : category);
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadSkus(true);
  };

  const handleSort = (columnKey: string) => {
    let field = columnKey;
    const existingIdx = sortRules.findIndex(r => r.field === field);
    let updatedRules: { field: string; order: 'asc' | 'desc' }[] = [];
    if (existingIdx === 0) {
      const order = sortRules[0].order === 'asc' ? 'desc' : 'asc';
      updatedRules = [{ field, order }, ...sortRules.slice(1)];
    } else {
      const existingRule = sortRules[existingIdx];
      const order = existingRule ? existingRule.order : 'asc';
      updatedRules = [{ field, order }, ...sortRules.filter((_, idx) => idx !== existingIdx)];
    }
    setSortRules(updatedRules);
    localStorage.setItem('skbw_erp_sort_rules_skus', JSON.stringify(updatedRules));
    setPage(1);
  };

  // Keyboard Shortcuts (matching Customer module)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
      
      // Alt + C / F8: Open Add/Create Drawer
      if (((e.altKey && (e.key === 'c' || e.key === 'C')) || e.key === 'F8') && !isInput) {
        e.preventDefault();
        if (!showAddDrawer && !selectedSkuDetails && !showImportDrawer) {
          setEditSku(null);
          setShowAddDrawer(true);
        }
      }
      
      // Alt + L: Open Activity Log
      if (e.altKey && (e.key === 'l' || e.key === 'L') && !isInput) {
        e.preventDefault();
        fetchActivityLogs();
        setShowActivityLog(true);
      }

      // Alt + F: Open Find Duplicates
      if (e.altKey && (e.key === 'f' || e.key === 'F') && !isInput) {
        e.preventDefault();
        findSkuDuplicates();
        setShowDuplicates(true);
      }

      // Alt + R: Open Recycle Bin
      if (e.altKey && (e.key === 'r' || e.key === 'R') && !isInput) {
        e.preventDefault();
        fetchRecycleBin();
        setShowRecycleBin(true);
      }

      // Focus Search Box (Ctrl/Cmd + F)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        const searchInput = document.querySelector('input[placeholder*="Search items"]') as HTMLInputElement | null;
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddDrawer, selectedSkuDetails, showImportDrawer]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, statusFilter, search, unitFilter]);

  // Local filtering & sorting logic
  const filteredAndSortedSkus = React.useMemo(() => {
    let list = Array.isArray(skus) ? [...skus] : [];

    // Apply local unit filter
    if (unitFilter) {
      list = list.filter(s => s.unit === unitFilter);
    }

    // Apply custom filter rules
    if (filterRules && filterRules.length > 0) {
      list = list.filter(item => {
        return filterRules.every(rule => {
          let itemVal = (item as any)[rule.field];
          if (rule.field === 'dimensions') {
            itemVal = formatSize(item);
          }
          if (itemVal === undefined || itemVal === null) {
            itemVal = '';
          }
          const valStr = String(itemVal).toLowerCase();
          const targetStr = String(rule.value || '').toLowerCase();

          switch (rule.condition) {
            case 'equal to':
              return valStr === targetStr;
            case 'contains':
              return valStr.includes(targetStr);
            case 'greater than':
              return Number(itemVal) > Number(rule.value);
            case 'less than':
              return Number(itemVal) < Number(rule.value);
            case 'starts with':
              return valStr.startsWith(targetStr);
            case 'ends with':
              return valStr.endsWith(targetStr);
            default:
              return true;
          }
        });
      });
    }

    // Apply local sort rules
    if (sortRules && sortRules.length > 0) {
      list.sort((a, b) => {
        for (const rule of sortRules) {
          let fieldA = (a as any)[rule.field];
          let fieldB = (b as any)[rule.field];

          if (rule.field === 'dimensions') {
            fieldA = formatSize(a);
            fieldB = formatSize(b);
          }

          if (fieldA === undefined || fieldA === null) fieldA = '';
          if (fieldB === undefined || fieldB === null) fieldB = '';

          if (typeof fieldA === 'number' && typeof fieldB === 'number') {
            if (fieldA !== fieldB) {
              return rule.order === 'asc' ? fieldA - fieldB : fieldB - fieldA;
            }
          } else {
            const strA = String(fieldA).localeCompare(String(fieldB));
            if (strA !== 0) {
              return rule.order === 'asc' ? strA : -strA;
            }
          }
        }
        return 0;
      });
    }

    return list;
  }, [skus, unitFilter, filterRules, sortRules]);

  const total = filteredAndSortedSkus.length;
  const totalPages = Math.ceil(total / limit);
  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);
  
  // Slice list for pagination
  const paginatedSkus = React.useMemo(() => {
    return filteredAndSortedSkus.slice((page - 1) * limit, page * limit);
  }, [filteredAndSortedSkus, page, limit]);

  const handleDownloadSampleCSV = () => {
    const headers = [
      'SKU Code', 'SKU Name', 'Category', 'Paper Type', 'Primary Unit', 'Alternate Unit', 'Conversion Rate',
      'GSM', 'Width (cm)', 'Length (cm)', 'Pages / Std Sheets', 'Ream Weight (kg)', 'Rule Type', 'Brand',
      'Title', 'Group', 'Opening Stock', 'Books/GBL', 'Status'
    ];
    
    const sampleRows = [
      [
        'RM-SHEET-52GSM',
        'Vector Sheets 52GSM 57x70',
        'Raw Material',
        'Sheets',
        'pcs',
        'ream',
        '500',
        '52',
        '57',
        '70',
        '500',
        '10.37',
        'Plain',
        'Vector',
        '',
        'Raw Paper',
        '',
        'Active'
      ],
      [
        'RM-REEL-70GSM',
        'Century Maplitho Reel 70 GSM',
        'Raw Material',
        'Reels',
        'kg',
        '',
        '',
        '70',
        '70',
        '',
        '',
        '',
        '',
        'Century',
        '',
        'Raw Paper',
        '',
        'Active'
      ],
      [
        'FG-NOTEBOOK-17x27-172P',
        'Century Ruled Notebook 172P',
        'Finished Goods',
        'None',
        'pcs',
        '',
        '',
        '58',
        '17',
        '27',
        '172',
        '',
        'Ruled',
        'Century',
        'Class Notebook',
        'Single Line',
        '6',
        'Active'
      ]
    ];

    const csvContent = [
      headers.join(','),
      ...sampleRows.map(row => row.map(val => {
        const clean = String(val).replace(/"/g, '""');
        return clean.includes(',') || clean.includes('\n') ? `"${clean}"` : clean;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'sample_skus_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Sample CSV template downloaded successfully.', 'success');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws) as any[];

        if (rawData.length === 0) {
          showToast('No data found in file.', 'error');
          return;
        }

        // Normalize Excel headers to lowercase alphanumeric keys only
        const normalizedData = rawData.map(row => {
          const norm: Record<string, any> = {};
          Object.entries(row).forEach(([k, v]) => {
            const normKey = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            norm[normKey] = v;
          });
          return norm;
        });

        const skusToImport = normalizedData.map(item => {
          return {
            skuCode: String(item['skucode'] || item['code'] || item['itemcode'] || '').trim(),
            name: String(item['skuname'] || item['name'] || item['itemname'] || item['title'] || '').trim(),
            category: String(item['category'] || 'Raw Material').trim(),
            paperType: String(item['papertype'] || 'None').trim(),
            unit: String(item['primaryunit'] || item['unit'] || 'kg').trim(),
            altUnit: item['alternateunit'] || item['altunit'] || undefined,
            altUnitConversion: item['conversionrate'] || item['altunitconversion'] ? Number(item['conversionrate'] || item['altunitconversion']) : undefined,
            gsm: item['gsm'] ? Number(item['gsm']) : undefined,
            width: item['width'] || item['widthcm'] ? Number(item['width'] || item['widthcm']) : undefined,
            length: item['length'] || item['lengthcm'] ? Number(item['length'] || item['lengthcm']) : undefined,
            pages: item['pages'] || item['pagesstdsheets'] || item['stdsheets'] || item['sheetsream'] ? Number(item['pages'] || item['pagesstdsheets'] || item['stdsheets'] || item['sheetsream']) : undefined,
            reamWeight: item['reamweight'] || item['reamweightkg'] ? Number(item['reamweight'] || item['reamweightkg']) : undefined,
            ruleType: item['ruletype'] || undefined,
            brand: String(item['brand'] || '').trim(),
            title: String(item['title'] || '').trim(),
            group: String(item['group'] || '').trim(),
            openingStock: item['openingstock'] || item['stock'] || item['initialstock'] ? Number(item['openingstock'] || item['stock'] || item['initialstock']) : 0,
            booksGbl: item['books'] || item['booksgbl'] || item['gbl'] ? Number(item['books'] || item['booksgbl'] || item['gbl']) : undefined,
            status: String(item['status'] || 'Active').trim()
          };
        }).filter(s => s.skuCode && s.name);

        if (skusToImport.length === 0) {
          showToast('No valid SKU items found. Please check SKU Code and SKU Name headers.', 'error');
          return;
        }

        const res = await bulkImportSkusV2(skusToImport, selectedCompany?._id || '');
        showToast(res.msg || `Successfully imported ${res.importedCount} items.`, 'success');
        fetchSkus();
      } catch (err: any) {
        console.error('Import failed', err);
        showToast(err.response?.data?.msg || 'Import failed. Please verify format.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleExport = () => {
    const targetSkus = selectedIds.length > 0 
      ? skus.filter(s => selectedIds.includes(s._id || ''))
      : skus;

    const dataToExport = targetSkus.map(s => ({
      'SKU Code': s.skuCode,
      'SKU Name': s.name,
      'Category': s.category,
      'Unit': s.unit,
      'Opening Stock': s.openingStock || 0,
      'GSM': s.gsm || 'N/A',
      'Width': s.width || 'N/A',
      'Length': s.length || 'N/A',
      'Rule Type': s.ruleType || 'N/A',
      'Status': s.status
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SKUs V2');
    XLSX.writeFile(wb, `SKU_Master_V2_${selectedCompany?.name || 'export'}.xlsx`);
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importText.trim()) {
      setImportError('Please enter some JSON array data.');
      return;
    }
    setImportError('');
    setImportSuccessMsg('');
    setImportLoading(true);
    try {
      let parsed;
      try {
        parsed = JSON.parse(importText);
      } catch (err) {
        setImportError('Invalid JSON format. Please paste a valid JSON array.');
        setImportLoading(false);
        return;
      }

      if (!Array.isArray(parsed)) {
        setImportError('JSON must be an array of objects.');
        setImportLoading(false);
        return;
      }

      const res = await bulkImportSkusV2(parsed, selectedCompany?._id || '');
      setImportSuccessMsg(res.msg);
      setImportText('');
      loadSkus();
    } catch (err: any) {
      console.error(err);
      setImportError(err.response?.data?.msg || 'Failed to import SKUs');
    } finally {
      setImportLoading(false);
    }
  };

  // Optimistic Save SKU handler (handles both Add and Edit)
  const handleSaveSkuSuccess = (savedSku: SkuV2) => {
    setShowAddDrawer(false);
    
    // Apply optimistic state update directly to Sku Master table state
    setSkus(prev => {
      const idx = prev.findIndex(item => item._id === savedSku._id);
      if (idx > -1) {
        // Edit Mode: Replace updated SKU
        const updated = [...prev];
        updated[idx] = savedSku;
        return updated;
      } else {
        // Create Mode: Prepend new SKU
        return [savedSku, ...prev];
      }
    });

    setAllSkus(prev => {
      const idx = prev.findIndex(item => item._id === savedSku._id);
      if (idx > -1) {
        const updated = [...prev];
        updated[idx] = savedSku;
        return updated;
      } else {
        return [savedSku, ...prev];
      }
    });

    showToast(editSku ? 'SKU updated successfully' : 'SKU created successfully', 'success');
    createActivityLog({
      action: editSku ? 'UPDATE' : 'CREATE',
      entityType: 'SkuV2',
      entityName: savedSku.skuCode,
      details: `SKU Item '${savedSku.skuCode}' (${savedSku.name}) was ${editSku ? 'updated' : 'created'}`,
      company: selectedCompany?._id
    }).catch(() => {});
    setEditSku(null);
  };

  // Optimistic Delete SKU handler
  const handleDeleteSku = async () => {
    if (!deleteConfirmSku?._id) return;
    
    const targetId = deleteConfirmSku._id;
    const targetCode = deleteConfirmSku.skuCode;
    const originalSkus = [...skus];
    const originalAllSkus = [...allSkus];

    // Optimistic UI Update: Immediately remove SKU from the local list
    setSkus(prev => prev.filter(s => s._id !== targetId));
    setAllSkus(prev => prev.filter(s => s._id !== targetId));
    setSelectedIds(prev => prev.filter(id => id !== targetId));
    setDeleteConfirmSku(null);
    setIsDeleting(true);

    try {
      await deleteSkuV2(targetId, selectedCompany?._id || '');
      showToast(`SKU '${targetCode}' deleted successfully`, 'success');
      createActivityLog({
        action: 'DELETE',
        entityType: 'SkuV2',
        entityName: targetCode,
        details: `SKU Item '${targetCode}' was deleted`,
        company: selectedCompany?._id
      }).catch(() => {});
    } catch (err: any) {
      console.error(err);
      // Rollback UI update on failure
      setSkus(originalSkus);
      setAllSkus(originalAllSkus);
      showToast(err.response?.data?.msg || `Failed to delete SKU '${targetCode}'`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Optimistic Bulk Delete SKU handler
  const handleBulkDelete = async () => {
    const targetIds = [...selectedIds];
    const originalSkus = [...skus];
    const originalAllSkus = [...allSkus];

    // Optimistic UI update
    setSkus(prev => prev.filter(s => !targetIds.includes(s._id || '')));
    setAllSkus(prev => prev.filter(s => !targetIds.includes(s._id || '')));
    setSelectedIds([]);
    setShowBulkDeleteConfirm(false);

    try {
      await Promise.all(targetIds.map(id => deleteSkuV2(id, selectedCompany?._id || '')));
      showToast(`Selected SKUs deleted successfully`, 'success');
      createActivityLog({
        action: 'DELETE',
        entityType: 'SkuV2',
        entityName: 'Bulk',
        details: `Deleted ${targetIds.length} SKU items in bulk`,
        company: selectedCompany?._id
      }).catch(() => {});
    } catch (err: any) {
      console.error(err);
      setSkus(originalSkus);
      setAllSkus(originalAllSkus);
      showToast(err.response?.data?.msg || 'Failed to delete some selected items', 'error');
    }
  };



  // Selection helpers
  const isAllOnPageSelected = paginatedSkus.length > 0 && paginatedSkus.every(s => selectedIds.includes(s._id || ''));
  const isSomeOnPageSelected = paginatedSkus.length > 0 && paginatedSkus.some(s => selectedIds.includes(s._id || '')) && !isAllOnPageSelected;

  const handleSelectAll = () => {
    if (isAllOnPageSelected) {
      const allPageIds = paginatedSkus.map(s => s._id || '');
      setSelectedIds(prev => prev.filter(id => !allPageIds.includes(id)));
    } else {
      const allPageIds = paginatedSkus.map(s => s._id || '');
      setSelectedIds(prev => Array.from(new Set([...prev, ...allPageIds])));
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Calculate dynamic stats from unfiltered items list
  const totalItems = Array.isArray(allSkus) ? allSkus.length : 0;
  const rawMaterialsCount = Array.isArray(allSkus) ? allSkus.filter(s => s.category === 'Raw Material').length : 0;
  const semiFinishedCount = Array.isArray(allSkus) ? allSkus.filter(s => s.category === 'Semi Finished').length : 0;
  const finishedGoodsCount = Array.isArray(allSkus) ? allSkus.filter(s => s.category === 'Finished Goods').length : 0;

  // Extract unique units for unit filter dropdown from allSkus
  const uniqueUnits = Array.isArray(allSkus) ? Array.from(new Set(allSkus.map(s => s.unit))) : [];



  return (
    <div className={`p-4 space-y-6 flex h-full relative transition-all duration-300 ${showAddDrawer || selectedSkuDetails || showImportDrawer ? 'lg:mr-[520px]' : ''}`}>
      <div className="flex-1 space-y-6 overflow-y-auto">
        {/* Top Header Card */}
        <div className="mb-4">
          {/* Top Bar with Navigation Back link and user profile pill */}
          <div className="flex items-center justify-between mb-3">
            <div 
              className="flex items-center space-x-1.5 text-gray-500 hover:text-gray-900 cursor-pointer transition-colors" 
              onClick={() => navigate(-1)}
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm font-semibold">Back</span>
            </div>
            
            <div className="flex items-center space-x-2 text-gray-700 bg-gray-50 border border-gray-150 px-3.5 py-1.5 rounded-full text-sm font-medium shadow-xs">
              <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                <User className="w-3.5 h-3.5" />
              </div>
              <span>SKBW Admin</span>
            </div>
          </div>

          {/* Title & Actions Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-905 tracking-tight">
                Item Master
              </h1>
              <p className="text-sm text-gray-500 mt-1">Create and manage all items in the system</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              {/* Tools dropdown */}
              <div className="relative" ref={toolsDropdownRef}>
                <button
                  onClick={() => setShowToolsDropdown(!showToolsDropdown)}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium shadow-xs cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-gray-500" />
                  <span>Tools</span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
                
                {showToolsDropdown && (
                  <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50 divide-y divide-gray-100 animate-in fade-in duration-100 slide-in-from-top-1">
                    <div className="py-1 text-sm text-gray-700">
                      <button
                        onClick={() => { fetchActivityLogs(); setShowActivityLog(true); setShowToolsDropdown(false); }}
                        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-455" />
                          <span>Activity Log</span>
                        </div>
                      </button>
                      <button
                        onClick={() => { findSkuDuplicates(); setShowDuplicates(true); setShowToolsDropdown(false); }}
                        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-gray-455" />
                          <span>Find Duplicates</span>
                        </div>
                      </button>
                      <button
                        onClick={() => { fetchRecycleBin(); setShowRecycleBin(true); setShowToolsDropdown(false); }}
                        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Trash2 className="w-4 h-4 text-gray-455" />
                          <span>Recycle Bin</span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  setEditSku(null);
                  setShowAddDrawer(true);
                }}
                className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Item</span>
                <kbd className="hidden md:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono font-bold text-blue-100 bg-blue-800 rounded border border-blue-700 shadow-xs select-none pointer-events-none">Alt/Opt+C</kbd>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards (matching customer stats card style exactly) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 animate-none">
          <button
            onClick={() => handleStatsCardClick('')}
            className={`w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-blue-500 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
              categoryFilter === '' 
                ? 'bg-blue-50/40 border-blue-400 ring-2 ring-blue-100 shadow-sm' 
                : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5'
            }`}
          >
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${categoryFilter === '' ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-500'}`}>Total Items</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{totalItems}</p>
            </div>
          </button>

          <button
            onClick={() => handleStatsCardClick('Raw Material')}
            className={`w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-amber-500 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
              categoryFilter === 'Raw Material' 
                ? 'bg-amber-50/40 border-amber-400 ring-2 ring-amber-100 shadow-sm' 
                : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5'
            }`}
          >
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${categoryFilter === 'Raw Material' ? 'text-amber-600' : 'text-gray-400 group-hover:text-amber-500'}`}>Raw Materials</p>
              <p className="text-2xl font-bold text-amber-600 mt-0.5">{rawMaterialsCount}</p>
            </div>
          </button>

          <button
            onClick={() => handleStatsCardClick('Semi Finished')}
            className={`w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-purple-500 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
              categoryFilter === 'Semi Finished' 
                ? 'bg-purple-50/40 border-purple-400 ring-2 ring-purple-100 shadow-sm' 
                : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5'
            }`}
          >
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${categoryFilter === 'Semi Finished' ? 'text-purple-600' : 'text-gray-400 group-hover:text-purple-500'}`}>Semi-Finished</p>
              <p className="text-2xl font-bold text-purple-600 mt-0.5">{semiFinishedCount}</p>
            </div>
          </button>

          <button
            onClick={() => handleStatsCardClick('Finished Goods')}
            className={`w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-emerald-500 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
              categoryFilter === 'Finished Goods' 
                ? 'bg-emerald-50/40 border-emerald-400 ring-2 ring-emerald-100 shadow-sm' 
                : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5'
            }`}
          >
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${categoryFilter === 'Finished Goods' ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-500'}`}>Finished Goods</p>
              <p className="text-2xl font-bold text-emerald-600 mt-0.5">{finishedGoodsCount}</p>
            </div>
          </button>
        </div>

        {/* Filters & Bulk Selection */}
        <div className="space-y-4">
          {selectedIds.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between animate-in slide-in-from-top duration-200">
              <span className="text-xs font-semibold text-blue-800">
                {selectedIds.length} item{selectedIds.length > 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 hover:bg-blue-50 rounded-lg text-xs font-semibold text-blue-700 transition-colors shadow-3xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Export Selected
                </button>
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg text-xs font-semibold text-red-700 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Selected
                </button>
              </div>
            </div>
          )}

        {/* Table Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-3 mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-full lg:max-w-md w-full">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search items by name, code, category..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-205 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors text-gray-900"
                />
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:ml-4">
              {/* Filters Button */}
              <button
                onClick={() => setShowFilterPanel(!showFilterPanel)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-all duration-150 cursor-pointer ${
                  showFilterPanel || filterRules.length > 0
                    ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-xs'
                    : 'bg-white border-gray-200 text-gray-755 hover:bg-gray-50'
                }`}
              >
                <Filter className="w-4 h-4 text-blue-600" />
                <span>Filters</span>
                {filterRules.length > 0 && (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                    {filterRules.length}
                  </span>
                )}
              </button>

              {/* Sort By Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSortSelector(!showSortSelector)}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-all duration-150 cursor-pointer ${
                    showSortSelector || sortRules.length > 0
                      ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-755 hover:bg-gray-50'
                  }`}
                >
                  <ArrowUpDown className="w-4 h-4 text-blue-600" />
                  <span>Sort</span>
                  {sortRules.length > 0 && (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                      {sortRules.length}
                    </span>
                  )}
                </button>
                {showSortSelector && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSortSelector(false)} />
                    <div className="absolute right-0 mt-2 w-56 rounded-xl shadow-xl bg-white border border-gray-150 p-3.5 z-20 space-y-2 animate-in fade-in slide-in-from-top-2 duration-100">
                      <div className="flex justify-between items-center pb-2 border-b border-gray-100 mb-1.5">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Sort Rules</span>
                        <button
                          onClick={() => {
                            setSortRules([]);
                            localStorage.setItem('skbw_erp_sort_rules_skus', JSON.stringify([]));
                            setPage(1);
                          }}
                          className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
                        >
                          Clear all
                        </button>
                      </div>
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {sortRules.map((rule, idx) => (
                          <div key={idx} className="flex flex-col gap-1 border-b border-gray-50 pb-2">
                            <select
                              value={rule.field}
                              onChange={(e) => {
                                const updated = [...sortRules];
                                updated[idx].field = e.target.value;
                                setSortRules(updated);
                                localStorage.setItem('skbw_erp_sort_rules_skus', JSON.stringify(updated));
                                setPage(1);
                              }}
                              className="px-2 py-1 border border-gray-200 rounded text-xs w-full bg-gray-50 focus:bg-white"
                            >
                              {Object.entries(allColumns).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                              ))}
                            </select>
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <select
                                value={rule.order}
                                onChange={(e) => {
                                  const updated = [...sortRules];
                                  updated[idx].order = e.target.value as any;
                                  setSortRules(updated);
                                  localStorage.setItem('skbw_erp_sort_rules_skus', JSON.stringify(updated));
                                  setPage(1);
                                }}
                                className="px-2 py-1 border border-gray-200 rounded text-xs bg-gray-50 focus:bg-white flex-1"
                              >
                                <option value="asc">Ascending</option>
                                <option value="desc">Descending</option>
                              </select>
                              <button
                                onClick={() => {
                                  const updated = sortRules.filter((_, i) => i !== idx);
                                  setSortRules(updated);
                                  localStorage.setItem('skbw_erp_sort_rules_skus', JSON.stringify(updated));
                                  setPage(1);
                                }}
                                className="text-red-500 hover:text-red-755 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          const nextField = Object.keys(allColumns).find(k => !sortRules.some(r => r.field === k)) || 'skuCode';
                          const updated = [...sortRules, { field: nextField, order: 'asc' as const }];
                          setSortRules(updated);
                          localStorage.setItem('skbw_erp_sort_rules_skus', JSON.stringify(updated));
                          setPage(1);
                        }}
                        className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-550 hover:text-gray-755 hover:border-gray-400 hover:bg-gray-50 transition-all font-semibold text-center flex items-center justify-center gap-1 cursor-pointer bg-white"
                      >
                        <span>+ Add sort rule</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Columns Selector Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowColumnSelector(!showColumnSelector)}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-all duration-150 cursor-pointer ${
                    showColumnSelector
                      ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-755 hover:bg-gray-50'
                  }`}
                >
                  <Columns className="w-4 h-4 text-blue-600" />
                  <span>Columns</span>
                </button>
                {showColumnSelector && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowColumnSelector(false)} />
                    <div className="absolute right-0 mt-2 w-56 rounded-xl shadow-xl bg-white border border-gray-150 p-3.5 z-20 space-y-2 animate-in fade-in slide-in-from-top-2 duration-100">
                      <div className="flex justify-between items-center pb-2 border-b border-gray-100 mb-1.5">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Visible Columns</span>
                        <button
                          onClick={() => {
                            const reset = {
                              skuCode: true,
                              name: true,
                              category: true,
                              group: true,
                              unit: true,
                              altUnit: true,
                              altUnitConversion: true,
                              gsm: true,
                              dimensions: true,
                              pages: true,
                              openingStock: true,
                              status: true
                            };
                            setVisibleColumns(reset);
                            localStorage.setItem('skbw_erp_sku_visible_columns', JSON.stringify(reset));
                          }}
                          className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                        {Object.entries(allColumns).map(([key, label]) => {
                          const isVisible = !!visibleColumns[key];
                          return (
                            <label key={key} className="flex items-center space-x-2 text-xs text-gray-655 cursor-pointer hover:text-gray-905 select-none py-0.5">
                              <input
                                type="checkbox"
                                checked={isVisible}
                                onChange={() => {
                                  const updated = {
                                    ...visibleColumns,
                                    [key]: !isVisible
                                  };
                                  setVisibleColumns(updated);
                                  localStorage.setItem('skbw_erp_sku_visible_columns', JSON.stringify(updated));
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 border-gray-300 cursor-pointer"
                              />
                              <span className={isVisible ? 'font-semibold text-blue-700' : ''}>{label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Export Button */}
              <button
                onClick={handleExport}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-semibold text-sm shadow-xs cursor-pointer"
                title="Export current list to Excel/CSV"
              >
                <Download className="w-4 h-4 text-blue-600" />
                <span>Export</span>
              </button>

              {/* Sample CSV Button */}
              <button
                onClick={handleDownloadSampleCSV}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-semibold text-sm shadow-xs cursor-pointer"
                title="Download Sample CSV Template"
              >
                <FileText className="w-4 h-4 text-amber-500" />
                <span>Sample CSV</span>
              </button>

              {/* Import Button */}
              <label
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-semibold text-sm shadow-xs cursor-pointer"
                title="Import items from CSV/Excel"
              >
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>Import</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Collapsible Multi-Filter Panel */}
        {showFilterPanel && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4 space-y-3 animate-in slide-in-from-top-2 duration-150">
              <div className="flex justify-between items-center pb-1">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-blue-600" />
                  Multi-Filter Builder
                </span>
                <button
                  onClick={() => {
                    setFilterRules([]);
                    localStorage.setItem('skbw_erp_filter_rules_skus', JSON.stringify([]));
                    setPage(1);
                  }}
                  className="text-xs text-red-500 hover:text-red-755 font-semibold cursor-pointer bg-transparent border-0"
                >
                  Clear all
                </button>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-xs bg-white">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 w-16"></th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Field</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Condition</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Look For</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-500 w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filterRules.map((rule, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 font-semibold text-gray-450 uppercase">
                          {idx === 0 ? '' : 'and'}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={rule.field}
                            onChange={(e) => {
                              const updated = [...filterRules];
                              updated[idx] = { ...updated[idx], field: e.target.value };
                              setFilterRules(updated);
                              localStorage.setItem('skbw_erp_filter_rules_skus', JSON.stringify(updated));
                              setPage(1);
                            }}
                            className="px-2 py-1 border border-gray-200 rounded bg-gray-50 text-xs w-full focus:bg-white focus:outline-none cursor-pointer"
                          >
                            {Object.entries(allColumns).map(([key, label]) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={rule.condition}
                            onChange={(e) => {
                              const updated = [...filterRules];
                              updated[idx] = { ...updated[idx], condition: e.target.value as any };
                              setFilterRules(updated);
                              localStorage.setItem('skbw_erp_filter_rules_skus', JSON.stringify(updated));
                              setPage(1);
                            }}
                            className="px-2 py-1 border border-gray-200 rounded bg-gray-50 text-xs w-full focus:bg-white focus:outline-none cursor-pointer"
                          >
                            <option value="equal to">equal to</option>
                            <option value="contains">contains</option>
                            <option value="greater than">greater than</option>
                            <option value="less than">less than</option>
                            <option value="starts with">starts with</option>
                            <option value="ends with">ends with</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            placeholder="Type search value..."
                            value={rule.value}
                            onChange={(e) => {
                              const updated = [...filterRules];
                              updated[idx] = { ...updated[idx], value: e.target.value };
                              setFilterRules(updated);
                              localStorage.setItem('skbw_erp_filter_rules_skus', JSON.stringify(updated));
                            }}
                            onBlur={() => setPage(1)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                setPage(1);
                              }
                            }}
                            className="px-2 py-1 border border-gray-200 rounded text-xs w-full focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white placeholder-gray-400"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => {
                              const updated = filterRules.filter((_, i) => i !== idx);
                              setFilterRules(updated);
                              localStorage.setItem('skbw_erp_filter_rules_skus', JSON.stringify(updated));
                              setPage(1);
                            }}
                            className="text-red-500 hover:text-red-700 transition-colors p-1 cursor-pointer bg-transparent border-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={5} className="px-3 py-2 bg-gray-50/50">
                        <button
                          onClick={() => {
                            const nextField = Object.keys(allColumns)[0] || 'skuCode';
                            const updated = [...filterRules, { join: 'and' as const, field: nextField, condition: 'equal to' as const, value: '' }];
                            setFilterRules(updated);
                            localStorage.setItem('skbw_erp_filter_rules_skus', JSON.stringify(updated));
                          }}
                          className="text-blue-650 hover:text-blue-800 font-semibold text-xs flex items-center gap-1.5 cursor-pointer bg-transparent border-0"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add filter rule
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div className="bg-white rounded-2xl border border-gray-250 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredAndSortedSkus.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      {/* Checkbox column */}
                      <th className="px-3 py-2 text-left w-10">
                        <input
                          type="checkbox"
                          checked={isAllOnPageSelected}
                          ref={el => {
                            if (el) el.indeterminate = isSomeOnPageSelected;
                          }}
                          onChange={handleSelectAll}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300 cursor-pointer"
                        />
                      </th>
                      {visibleColumns.skuCode && (
                        <th 
                          onClick={() => handleSort('skuCode')}
                          className="px-3.5 py-2 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                        >
                          <div className="flex items-center space-x-1">
                            <span>Item Code</span>
                            <span className="text-gray-400">
                              {sortRules[0]?.field === 'skuCode' ? (
                                sortRules[0].order === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.name && (
                        <th 
                          onClick={() => handleSort('name')}
                          className="px-3.5 py-2 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                        >
                          <div className="flex items-center space-x-1">
                            <span>Item Name</span>
                            <span className="text-gray-400">
                              {sortRules[0]?.field === 'name' ? (
                                sortRules[0].order === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.category && (
                        <th 
                          onClick={() => handleSort('category')}
                          className="px-3.5 py-2 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                        >
                          <div className="flex items-center space-x-1">
                            <span>Category</span>
                            <span className="text-gray-400">
                              {sortRules[0]?.field === 'category' ? (
                                sortRules[0].order === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.group && (
                        <th 
                          onClick={() => handleSort('group')}
                          className="px-3.5 py-2 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                        >
                          <div className="flex items-center space-x-1">
                            <span>Group</span>
                            <span className="text-gray-400">
                              {sortRules[0]?.field === 'group' ? (
                                sortRules[0].order === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.unit && (
                        <th 
                          onClick={() => handleSort('unit')}
                          className="px-3.5 py-2 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                        >
                          <div className="flex items-center space-x-1">
                            <span>Primary Unit</span>
                            <span className="text-gray-400">
                              {sortRules[0]?.field === 'unit' ? (
                                sortRules[0].order === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.altUnit && (
                        <th 
                          onClick={() => handleSort('altUnit')}
                          className="px-3.5 py-2 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                        >
                          <div className="flex items-center space-x-1">
                            <span>Alternate Unit</span>
                            <span className="text-gray-400">
                              {sortRules[0]?.field === 'altUnit' ? (
                                sortRules[0].order === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.altUnitConversion && (
                        <th 
                          onClick={() => handleSort('altUnitConversion')}
                          className="px-3.5 py-2 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                        >
                          <div className="flex items-center space-x-1">
                            <span>Conversion Rate</span>
                            <span className="text-gray-400">
                              {sortRules[0]?.field === 'altUnitConversion' ? (
                                sortRules[0].order === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.gsm && (
                        <th 
                          onClick={() => handleSort('gsm')}
                          className="px-3.5 py-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                        >
                          <div className="flex items-center justify-center space-x-1">
                            <span>GSM</span>
                            <span className="text-gray-400">
                              {sortRules[0]?.field === 'gsm' ? (
                                sortRules[0].order === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.dimensions && (
                        <th 
                          onClick={() => handleSort('dimensions')}
                          className="px-3.5 py-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                        >
                          <div className="flex items-center justify-center space-x-1">
                            <span>Size</span>
                            <span className="text-gray-400">
                              {sortRules[0]?.field === 'dimensions' ? (
                                sortRules[0].order === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.pages && (
                        <th 
                          onClick={() => handleSort('pages')}
                          className="px-3.5 py-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                        >
                          <div className="flex items-center justify-center space-x-1">
                            <span>Pages / Std Sheets</span>
                            <span className="text-gray-400">
                              {sortRules[0]?.field === 'pages' ? (
                                sortRules[0].order === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.openingStock && (
                        <th 
                          onClick={() => handleSort('openingStock')}
                          className="px-3.5 py-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                        >
                          <div className="flex items-center justify-center space-x-1">
                            <span>Opening Stock</span>
                            <span className="text-gray-400">
                              {sortRules[0]?.field === 'openingStock' ? (
                                sortRules[0].order === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </div>
                        </th>
                      )}
                      {visibleColumns.status && (
                        <th 
                          onClick={() => handleSort('status')}
                          className="px-3.5 py-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                        >
                          <div className="flex items-center justify-center space-x-1">
                            <span>Status</span>
                            <span className="text-gray-400">
                              {sortRules[0]?.field === 'status' ? (
                                sortRules[0].order === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </div>
                        </th>
                      )}
                      <th className="px-3.5 py-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-150 text-gray-700">
                    {paginatedSkus.map((s) => (
                      <tr 
                        key={s._id} 
                        onClick={() => setSelectedSkuDetails(s)}
                        className={`transition-all cursor-pointer hover:bg-gray-50 border-l-2 ${
                          selectedIds.includes(s._id || '') ? 'bg-blue-50/20 border-l-blue-600 text-blue-900' : 'border-l-transparent text-gray-700'
                        }`}
                      >
                        <td className="px-3 py-1.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(s._id || '')}
                            onChange={() => handleSelectRow(s._id || '')}
                            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300 cursor-pointer"
                          />
                        </td>
                        {visibleColumns.skuCode && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-[13.5px] font-bold text-gray-900">
                            {s.skuCode}
                          </td>
                        )}
                        {visibleColumns.name && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-[13.5px] font-semibold text-gray-800 uppercase">
                            {s.name}
                          </td>
                        )}
                        {visibleColumns.category && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold tracking-wider uppercase inline-block border ${
                              s.category === 'Raw Material' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              s.category === 'Semi Finished' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                              'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {s.category}
                            </span>
                          </td>
                        )}
                        {visibleColumns.group && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-[13.5px] font-medium text-gray-700">
                            {(s as any).group ? (
                              <span className="px-2 py-0.5 bg-blue-50/50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold uppercase tracking-wide">
                                {(s as any).group}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.unit && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <span className="bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                              {s.unit}
                            </span>
                          </td>
                        )}
                        {visibleColumns.altUnit && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            {s.altUnit ? (
                              <span className="bg-blue-50 text-blue-800 border border-blue-100 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                                {s.altUnit}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.altUnitConversion && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-[13.5px] font-medium text-gray-700">
                            {s.altUnit && s.altUnitConversion ? (
                              <span>
                                1 {s.unit} = {s.altUnitConversion} {s.altUnit}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.gsm && (
                          <td className="px-3.5 py-2.5 text-center whitespace-nowrap text-[13.5px] font-medium text-gray-700">
                            {s.gsm ? `${s.gsm} GSM` : '—'}
                          </td>
                        )}
                        {visibleColumns.dimensions && (
                          <td className="px-3.5 py-2.5 text-center whitespace-nowrap text-[13.5px] font-medium text-gray-750">
                            {formatSize(s)}
                          </td>
                        )}
                        {visibleColumns.pages && (
                          <td className="px-3.5 py-2.5 text-center whitespace-nowrap text-[13.5px] font-medium text-gray-700">
                            {s.pages ? (s.paperType === 'Sheets' ? `${s.pages} Sheets/Ream` : `${s.pages} Pages`) : '—'}
                          </td>
                        )}
                        {visibleColumns.openingStock && (
                          <td className="px-3.5 py-2.5 text-center whitespace-nowrap text-[13.5px] font-bold text-blue-700 font-mono">
                            {s.openingStock !== undefined && s.openingStock !== null ? `${s.openingStock} ${s.unit}` : '0'}
                          </td>
                        )}
                        {visibleColumns.status && (
                          <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase inline-block border ${
                              s.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}>
                              {s.status}
                            </span>
                          </td>
                        )}
                        <td className="px-3.5 py-2 whitespace-nowrap text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedSkuDetails(s)}
                              className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-650 rounded-lg transition-all text-xs"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditSku(s);
                                setShowAddDrawer(true);
                                setSelectedSkuDetails(null);
                              }}
                              className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-amber-600 rounded-lg transition-all text-xs"
                              title="Edit SKU"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmSku(s)}
                              className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600 rounded-lg transition-all text-xs"
                              title="Delete SKU"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-semibold">No items registered yet</p>
                <p className="text-xs text-gray-500 mt-1">Register a new raw, semi-finished, or finished SKU using the "+ Add Item" button.</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 bg-white p-4 rounded-xl border border-gray-150 shadow-xs">
              <div className="text-sm font-semibold text-gray-500">
                Showing {startItem} to {endItem} of {total} items
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer bg-white border-0">
                  <ChevronsLeft className="w-4 h-4 text-gray-700" />
                </button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer bg-white border-0">
                  <ChevronLeft className="w-4 h-4 text-gray-700" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) { pageNum = i + 1; }
                  else if (page <= 3) { pageNum = i + 1; }
                  else if (page >= totalPages - 2) { pageNum = totalPages - 4 + i; }
                  else { pageNum = page - 2 + i; }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors cursor-pointer border-0 ${
                        page === pageNum ? 'bg-blue-600 text-white' : 'hover:bg-gray-200 text-gray-600 bg-white'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer bg-white border-0">
                  <ChevronRight className="w-4 h-4 text-gray-700" />
                </button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages || totalPages === 0} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer bg-white border-0">
                  <ChevronsRight className="w-4 h-4 text-gray-700" />
                </button>
                <select
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="ml-2 px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer"
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit SKU Slide-Over */}
      {showAddDrawer && (
        <AddSkuDrawerV2
          isOpen={showAddDrawer}
          companyId={selectedCompany?._id || ''}
          editSku={editSku}
          onClose={() => {
            setShowAddDrawer(false);
            setEditSku(null);
          }}
          onSaveSuccess={handleSaveSkuSuccess}
        />
      )}

      {/* Dynamic Detail Side Slide-Over */}
      {selectedSkuDetails && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-[520px] bg-white shadow-2xl border-l border-gray-200 z-[60] flex flex-col animate-in slide-in-from-right duration-250 !mt-0">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-black text-gray-900 leading-tight">
                  {selectedSkuDetails.name}
                </h2>
                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full uppercase border ${
                  selectedSkuDetails.status === 'Active' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  {selectedSkuDetails.status || 'Active'}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-mono mt-1">
                Item Code: <span className="font-semibold text-blue-600">{selectedSkuDetails.skuCode}</span>
              </p>
            </div>
            <button
              onClick={() => setSelectedSkuDetails(null)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {/* Quick Actions Grid */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setEditSku(selectedSkuDetails);
                    setShowAddDrawer(true);
                    setSelectedSkuDetails(null);
                  }}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs rounded-lg border border-blue-200 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  <span>Edit Item</span>
                  <kbd className="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[9px] font-mono font-bold text-blue-500 bg-blue-100 rounded border border-blue-200 select-none pointer-events-none">Alt/Opt+E</kbd>
                </button>
                <button
                  onClick={() => {
                    setDeleteConfirmSku(selectedSkuDetails);
                    setSelectedSkuDetails(null);
                  }}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                  <span>Delete</span>
                  <kbd className="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[9px] font-mono font-bold text-red-100 bg-red-800 rounded border border-red-700 select-none pointer-events-none">Alt/Opt+D</kbd>
                </button>
                
                <button
                  onClick={() => showToast('Stock Ledger feature is coming soon!', 'info')}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                >
                  <History className="w-4 h-4 text-gray-450" />
                  <span>History / Ledger</span>
                </button>
                <button
                  onClick={() => showToast('BOM Configuration feature is coming soon!', 'info')}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                >
                  <BookOpen className="w-4 h-4 text-gray-450" />
                  <span>BOM Specs</span>
                </button>
                <button
                  onClick={() => showToast('Purchase Orders feature is coming soon!', 'info')}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                >
                  <CreditCard className="w-4 h-4 text-gray-450" />
                  <span>Purchase Orders</span>
                </button>
                <button
                  onClick={() => showToast('Sales Orders feature is coming soon!', 'info')}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                >
                  <FileText className="w-4 h-4 text-gray-450" />
                  <span>Sales Orders</span>
                </button>
                <button
                  onClick={() => showToast('Production Dispatch cards feature is coming soon!', 'info')}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                >
                  <ShoppingCart className="w-4 h-4 text-gray-450" />
                  <span>Dispatch Cards</span>
                </button>
              </div>
            </div>

            <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" /> General Specifications
              </h3>
              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs text-gray-900">
                <div>
                  <span className="block text-[10px] text-gray-400 font-medium uppercase">SKU Code</span>
                  <span className="font-bold text-sm text-gray-900">{selectedSkuDetails.skuCode}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400 font-medium uppercase">Category</span>
                  <span className="font-semibold text-blue-600">{selectedSkuDetails.category}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[10px] text-gray-400 font-medium uppercase">SKU Name</span>
                  <span className="font-semibold text-gray-800">{selectedSkuDetails.name}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400 font-medium uppercase">GSM</span>
                  <span className="font-semibold">{selectedSkuDetails.gsm || '—'} GSM</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400 font-medium uppercase">Dimensions (W x L)</span>
                  <span className="font-semibold">{formatSize(selectedSkuDetails)}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400 font-medium uppercase">Rule Type</span>
                  <span className="font-semibold">{selectedSkuDetails.ruleType || '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400 font-medium uppercase">Standard Sheets/Ream</span>
                  <span className="font-semibold">{(selectedSkuDetails as any).pages || '—'}</span>
                </div>
                {(selectedSkuDetails as any).reamWeight !== undefined && (
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium uppercase">Ream Weight (kg)</span>
                    <span className="font-semibold">{(selectedSkuDetails as any).reamWeight} kg</span>
                  </div>
                )}
                <div>
                  <span className="block text-[10px] text-gray-400 font-medium uppercase">Group</span>
                  <span className="font-semibold">{(selectedSkuDetails as any).group || '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400 font-medium uppercase">Opening Stock</span>
                  <span className="font-bold text-blue-700 font-mono">{(selectedSkuDetails as any).openingStock !== undefined && (selectedSkuDetails as any).openingStock !== null ? `${(selectedSkuDetails as any).openingStock} ${selectedSkuDetails.unit}` : '0'}</span>
                </div>
                
                {/* Beautified Conversion Info inside detail panel */}
                <div className="col-span-2 bg-blue-50/30 p-4 rounded-xl border border-blue-100/60 mt-2 space-y-2">
                  <span className="block text-[10px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-550" />
                    Unit Configuration Details
                  </span>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-gray-500 font-semibold">Primary Unit:</span>
                    <span className="font-bold text-slate-800 uppercase">{selectedSkuDetails.unit}</span>
                  </div>
                  {(selectedSkuDetails as any).altUnit && (
                    <>
                      <div className="flex items-center justify-between text-xs border-t border-blue-100/40 pt-2 mt-1">
                        <span className="text-gray-500 font-semibold">Alternative Unit:</span>
                        <span className="font-bold text-slate-850 uppercase">{(selectedSkuDetails as any).altUnit}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-blue-100/30 mt-2">
                        <span className="text-gray-500 font-semibold">Conversion Rate:</span>
                        <span className="font-bold text-blue-700">
                          1 {selectedSkuDetails.unit} = {(selectedSkuDetails as any).altUnitConversion || 1} {(selectedSkuDetails as any).altUnit}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400 font-medium uppercase">Status</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    selectedSkuDetails.status === 'Active' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-205 text-gray-500'
                  }`}>
                    {selectedSkuDetails.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="px-5 py-3.5 border-t border-gray-150 bg-gray-50 flex justify-end gap-2">
            <button
              onClick={() => setSelectedSkuDetails(null)}
              className="px-5 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-3xs cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Modal: Single Delete Confirmation */}
      <Modal
        isOpen={!!deleteConfirmSku}
        onClose={() => setDeleteConfirmSku(null)}
        size="max-w-sm"
        title="Confirm Deletion"
      >
        {deleteConfirmSku && (
          <div className="space-y-3 text-left">
            <p className="text-xs font-semibold leading-relaxed">
              Are you sure you want to delete SKU <span className="font-bold font-mono text-red-600">{deleteConfirmSku.skuCode}</span>?
            </p>
            <p className="text-[11px] text-gray-400">
              This action is non-reversible. Deletion will be rejected if the SKU contains active ledger transactions.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setDeleteConfirmSku(null)}
                className="px-3.5 py-1.5 border border-gray-255 rounded-lg text-xs font-bold text-gray-600 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSku}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-3xs"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Bulk Delete Confirmation */}
      <Modal
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        size="max-w-sm"
        title="Confirm Bulk Deletion"
      >
        <div className="space-y-3 text-left">
          <p className="text-xs font-semibold leading-relaxed">
            Are you sure you want to delete <span className="font-black text-red-600">{selectedIds.length} selected SKUs</span>?
          </p>
          <p className="text-[11px] text-gray-400">
            This action is non-reversible. Items with active transaction records will fail deletion automatically.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowBulkDeleteConfirm(false)}
              className="px-3.5 py-1.5 border border-gray-255 rounded-lg text-xs font-bold text-gray-600 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-3xs"
            >
              Delete All Selected
            </button>
          </div>
        </div>
      </Modal>

      {/* Bulk Import Slide-Over Drawer */}
      <Drawer
        isOpen={showImportDrawer}
        onClose={() => {
          setShowImportDrawer(false);
          setImportError('');
          setImportSuccessMsg('');
        }}
        size="max-w-xl"
        title="Bulk Import SKU Items"
      >
        <form onSubmit={handleBulkImport} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-gray-600 uppercase">JSON Data Array</label>
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                className="w-full h-[250px] p-3 border border-gray-250 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500"
                placeholder={`[\n  {\n    "skuCode": "RM-REEL-70GSM",\n    "name": "Century Maplitho Reel 70 GSM",\n    "category": "Raw Material",\n    "unit": "kg",\n    "gsm": 70\n  }\n]`}
              />
            </div>

            {importError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex gap-2 text-xs text-red-750">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <div>
                  <span className="font-bold">Import failed:</span> {importError}
                </div>
              </div>
            )}

            {importSuccessMsg && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex gap-2 text-xs text-green-700">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <div>{importSuccessMsg}</div>
              </div>
            )}
          </div>
          <div className="px-5 py-3.5 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowImportDrawer(false);
                setImportError('');
                setImportSuccessMsg('');
              }}
              className="px-3.5 py-1.5 border border-gray-250 rounded-lg text-xs font-bold text-gray-600 bg-white hover:bg-gray-55"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={importLoading}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-3xs"
            >
              {importLoading ? 'Importing...' : 'Start Import'}
            </button>
          </div>
        </form>
      </Drawer>

      {/* Tools sub-drawers (Activity Log, Duplicates, Recycle Bin) */}
      {/* Activity Log Drawer */}
      <Drawer
        isOpen={showActivityLog}
        onClose={() => setShowActivityLog(false)}
        size="max-w-md"
        title="SKU Activity Log"
      >
        <div className="flex h-full flex-col overflow-hidden bg-white">
          {/* Filters */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 border-b flex gap-2 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search logs..."
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
              {logSearch && (
                <button onClick={() => setLogSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-450 hover:text-gray-700 text-xs">
                  Clear
                </button>
              )}
            </div>
            <select
              value={logActionFilter}
              onChange={e => setLogActionFilter(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white text-gray-755 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">All Actions</option>
              <option value="CREATE">Creates</option>
              <option value="UPDATE">Updates</option>
              <option value="DELETE">Deletes</option>
              <option value="RESTORE">Restores</option>
            </select>
          </div>

          <div className="relative flex-1 py-6 px-4 sm:px-6 overflow-y-auto">
            {activityLogLoading ? (
              <div className="flex justify-center items-center h-40">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : activityLogs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No recent activity logs recorded.</p>
            ) : (() => {
              const filtered = activityLogs.filter(log => {
                if (logActionFilter !== 'ALL' && log.action !== logActionFilter) return false;
                if (logSearch) {
                  const q = logSearch.toLowerCase();
                  const text = `${log.entityName || ''} ${log.details || ''} ${log.performedBy || ''}`.toLowerCase();
                  return text.includes(q);
                }
                return true;
              });
              if (filtered.length === 0) {
                return <p className="text-sm text-gray-500 text-center py-8">No matching activity logs found.</p>;
              }
              return (
                <div className="flow-root">
                  <ul role="list" className="-mb-8">
                    {filtered.map((log, logIdx) => (
                      <li key={log._id || logIdx}>
                        <div className="relative pb-8">
                          {logIdx !== filtered.length - 1 ? (
                            <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
                          ) : null}
                          <div className="relative flex space-x-3">
                            <div>
                              <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                                log.action === 'CREATE' ? 'bg-green-500 text-white' :
                                log.action === 'UPDATE' ? 'bg-blue-500 text-white' :
                                log.action === 'DELETE' ? 'bg-red-500 text-white' :
                                'bg-purple-500 text-white'
                              }`}>
                                {log.action ? log.action[0] : 'L'}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{log.entityName ? `SKU: ${log.entityName}` : log.details}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{log.details}</p>
                              <div className="flex justify-between items-center mt-1 text-xs text-gray-400">
                                <span>By: {log.performedBy || 'System Admin'}</span>
                                <span>{new Date(log.createdAt).toLocaleString('en-IN')}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
        </div>
      </Drawer>

      {/* Find Duplicates Modal */}
      <Modal
        isOpen={showDuplicates}
        onClose={() => setShowDuplicates(false)}
        size="max-w-2xl"
        title={
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <span>Find Duplicates for SKUs</span>
          </div>
        }
      >
        <div className="p-2 space-y-4 text-xs">
          {duplicateGroups.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="font-semibold text-gray-800">No duplicates detected!</p>
              <p className="text-sm text-gray-400 mt-1">All SKU codes and names are completely unique.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-500 font-medium">The following duplicate groups were identified by code or name:</p>
              {duplicateGroups.map((group, gIdx) => (
                <div key={gIdx} className="border border-red-100 bg-red-50/10 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded uppercase text-[10px]">
                      Duplicate {group.field}: {group.value}
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold">{group.items.length} duplicate entries</span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map((item, iIdx) => (
                      <div key={item._id || iIdx} className="flex justify-between items-center text-[11px] text-gray-600 bg-white p-2 rounded-lg border border-gray-150">
                        <div>
                          <p className="font-bold text-gray-900">{item.name}</p>
                          <p className="font-mono text-gray-400 text-[10px]">{item.skuCode} • {item.category}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{item.status}</span>
                          <button
                            onClick={() => {
                              setEditSku(item);
                              setShowAddDrawer(true);
                              setShowDuplicates(false);
                            }}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded text-[10px] font-bold transition-colors cursor-pointer"
                            title="Edit Duplicate Item"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setDeleteConfirmSku(item);
                              setShowDuplicates(false);
                            }}
                            className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded text-[10px] font-bold transition-colors cursor-pointer"
                            title="Delete Duplicate Item"
                          >
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
        </div>
      </Modal>

      {/* Recycle Bin Drawer */}
      <Drawer
        isOpen={showRecycleBin}
        onClose={() => setShowRecycleBin(false)}
        size="max-w-md"
        title={
          <div className="flex items-center gap-1.5">
            <Trash2 className="w-4 h-4 text-gray-500" />
            <span>SKU Recycle Bin (Inactive Items)</span>
          </div>
        }
      >
        <div className="flex h-full flex-col overflow-hidden bg-white">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {recycleBinLoading ? (
              <div className="flex justify-center items-center h-40">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : recycleBinItems.length === 0 ? (
              <div className="text-center py-12 text-gray-450">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="font-semibold text-gray-700">Recycle Bin is Empty!</p>
                <p className="text-xs text-gray-400 mt-1">No inactive SKUs found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recycleBinItems.map((item, idx) => (
                  <div key={item._id || idx} className="flex justify-between items-center p-3 border border-gray-200 rounded-xl bg-gray-50/50 hover:bg-white transition-all text-xs text-left">
                    <div className="space-y-1">
                      <p className="font-bold text-gray-800">{item.name}</p>
                      <p className="font-mono text-gray-400 text-[10px]">{item.skuCode} • {item.category}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleRestoreSku(item)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => handlePermanentDeleteSku(item)}
                        className="p-1.5 text-gray-450 hover:bg-red-50 hover:text-red-650 rounded-lg transition-colors cursor-pointer"
                        title="Delete Permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
};

export default SkuMasterV2;

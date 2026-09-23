import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, X, FileText, Trash2, Download, HelpCircle, Check, Eye, Edit, ArrowRight, Layers, Clock, AlertTriangle, CheckCircle, Settings, User, MapPin as MapPinIcon, Ban, Save, Package, Receipt, AlertCircle, Building2, RotateCcw, Filter } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getActivityLogs, createActivityLog } from '../../../api/activityLogApi';
import { getParties } from '../../../api/partyApi';
import { getSkusV2, getWarehouseHierarchyV2, recordTransferV2, SkuV2, WarehouseLocationV2, getBalancesV2, getNextInvoiceNumberV2, getMetadataV2 } from '../../../api/mfgApiV2';
import { 
  getPurchaseInvoicesV2, 
  createPurchaseInvoiceV2, 
  updatePurchaseInvoiceV2,
  cancelPurchaseInvoiceV2,
  PurchaseInvoiceV2 
} from './purchaseService';
import { showToast } from '../../ui/Toast';
import * as XLSX from 'xlsx';
import Modal from '../../ui/Modal';
import { LocationSelectPopup } from '../../stock_v2/LocationSelectPopup';
import { convertAltToPrimary, convertPrimaryToAlt, formatUomFormula } from '../../../utils/uomConversion';

interface PurchaseInvoiceFormItem {
  skuId: string;
  brand: string;
  gsm: string;
  width: string;
  length: string;
  reelsCount: string;
  quantity: string;
  purchasePrice: string;
  reamWeight: string;
  ratePerKg: string;
  lotNumber: string;
  locationId?: string;
  splits?: any[];
  reels: any[];
}

interface InvoiceTableProps {
  invoices: PurchaseInvoiceV2[];
  loading: boolean;
  skus: SkuV2[];
  onViewDetails: (invoice: PurchaseInvoiceV2) => void;
  onEditInvoice: (invoice: PurchaseInvoiceV2) => void;
  onCancelInvoice: (invoice: PurchaseInvoiceV2) => void;
}

const InvoiceTable: React.FC<InvoiceTableProps> = ({ 
  invoices, 
  loading, 
  skus: _skus,
  onViewDetails,
  onEditInvoice: _onEditInvoice,
  onCancelInvoice
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-white">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          <span>Loading purchase batches...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {invoices.length > 0 ? (
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider select-none">
              <th className="py-3 px-3.5 text-left whitespace-nowrap">Batch No.</th>
              <th className="py-3 px-3.5 text-left whitespace-nowrap">Date</th>
              <th className="py-3 px-3.5 text-left whitespace-nowrap">Supplier</th>
              <th className="py-3 px-3.5 text-left whitespace-nowrap">Material Lots</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Total Reels</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Total Reams</th>
              <th className="py-3 px-3.5 text-left whitespace-nowrap">Total Qty</th>
              <th className="py-3 px-3.5 text-left whitespace-nowrap">Total Value</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Status</th>
              <th className="py-3 px-3.5 text-center w-20 whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-xs text-gray-700 bg-white">
            {invoices.map((inv) => {
              const supplierName = typeof inv.vendorId === 'object' && inv.vendorId !== null
                ? (inv.vendorId.firmName || inv.vendorId.ownerName || 'Unknown') 
                : 'Supplier';
              
              const lotsCount = inv.items?.length || 0;
              const lotsLabel = lotsCount === 1 ? '1 Lot' : `${lotsCount} Lots`;
              
              let totalReelsCount = 0;
              let totalReamsCount = 0;
              let totalKgWeight = 0;

              inv.items?.forEach((item) => {
                const resolvedSku = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any) : null;
                const paperType = resolvedSku?.paperType;
                if (paperType === 'Sheets') {
                  const stdSheets = resolvedSku?.pages || 500;
                  const reamWeight = item.reamWeight || resolvedSku?.reamWeight || getFallbackReamWeight(resolvedSku) || 0;
                  const itemReams = (item.quantity || 0) / stdSheets;
                  totalReamsCount += itemReams;
                  totalKgWeight += itemReams * reamWeight;
                } else {
                  totalReelsCount += item.reels?.length || 0;
                  totalKgWeight += item.quantity || 0;
                }
              });

              const isCancelled = inv.status === 'Cancelled';
              const isPosted = inv.status === 'Posted';
              const isDraft = inv.status === 'Draft';

              return (
                <tr 
                  key={inv._id} 
                  className={`hover:bg-blue-50/20 transition-all cursor-pointer whitespace-nowrap ${
                    isCancelled ? 'bg-red-50/30' : ''
                  }`}
                  onClick={() => onViewDetails(inv)}
                >
                  <td className="py-3 px-3.5 font-mono font-bold text-blue-700 text-xs whitespace-nowrap">
                    {inv.invoiceNumber}
                  </td>
                  <td className="py-3 px-3.5 text-gray-500 font-medium text-xs whitespace-nowrap">
                    {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td className="py-3 px-3.5 font-semibold text-gray-900 text-xs whitespace-nowrap">{supplierName}</td>
                  <td className="py-3 px-3.5 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60 shadow-2xs">
                      {lotsLabel}
                    </span>
                  </td>
                  <td className="py-3 px-3.5 font-mono font-semibold text-gray-700 text-xs text-center whitespace-nowrap">
                    {totalReelsCount || '—'}
                  </td>
                  <td className="py-3 px-3.5 font-mono font-semibold text-gray-700 text-xs text-center whitespace-nowrap">
                    {totalReamsCount > 0 ? totalReamsCount.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="py-3 px-3.5 font-mono font-bold text-gray-900 text-xs whitespace-nowrap">
                    {totalKgWeight > 0 ? `${totalKgWeight.toLocaleString('en-IN', { maximumFractionDigits: 2 })} KG` : '—'}
                  </td>
                  <td className="py-3 px-3.5 font-mono font-bold text-gray-900 text-xs whitespace-nowrap">
                    ₹{(inv.subTotal || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-3.5 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      isPosted 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' 
                        : isDraft 
                          ? 'bg-amber-50 text-amber-700 border border-amber-200/60' 
                          : 'bg-red-50 text-red-700 border border-red-200/60'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isPosted ? 'bg-emerald-500' : isDraft ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                      {isPosted ? 'Received' : isDraft ? 'Draft' : 'Cancelled'}
                    </span>
                  </td>
                  <td className="py-3 px-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onViewDetails(inv)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {!isCancelled && (
                        <button
                          onClick={() => onCancelInvoice(inv)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                          title="Cancel Purchase Batch"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="text-center py-16 text-gray-400 bg-white">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-600">No purchase batches found</p>
          <p className="text-xs text-gray-400 mt-1">Click the "+ New Purchase" button to record material receipts.</p>
        </div>
      )}
    </div>
  );
};

const getFallbackReamWeight = (sku: any): number => {
  if (!sku) return 0;
  const gsm = Number(sku.gsm) || 0;
  let w = Number(sku.width) || 0;
  let l = Number(sku.length) || 0;

  // Fallback to name parsing if fields are zero
  if ((w === 0 || l === 0) && sku.name) {
    const match = sku.name.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/i);
    if (match) {
      if (w === 0) w = Number(match[1]) || 0;
      if (l === 0) l = Number(match[2]) || 0;
    }
  }

  const stdSheets = Number(sku.pages) || 500;
  if (gsm > 0 && w > 0 && l > 0) {
    return (w * l * gsm * stdSheets) / 10000000;
  }
  return 0;
};

const PurchaseInvoicePage: React.FC = () => {
  const { selectedCompany } = useAuth();
  const navigate = useNavigate();
  
  // Data lists
  // Tools states
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);

  // Tools action data
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<{ field: string; value: string; items: PurchaseInvoiceV2[] }[]>([]);
  const [recycleBinItems, setRecycleBinItems] = useState<PurchaseInvoiceV2[]>([]);
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);
  const toolsDropdownRef = useRef<HTMLDivElement>(null);

  const [invoices, setInvoices] = useState<PurchaseInvoiceV2[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [refreshingSkus, setRefreshingSkus] = useState(false);
  const [categoriesData, setCategoriesData] = useState<{ id?: string; name: string; type?: 'products' | 'materials' | 'semi' }[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [inventoryBalances, setInventoryBalances] = useState<any[]>([]);

  const refreshItemMasterSkus = async (silent = false) => {
    if (!selectedCompany?._id) return;
    try {
      setRefreshingSkus(true);
      const skuRes = await getSkusV2(selectedCompany._id);
      setSkus((skuRes || []).filter(s => !s.isDeleted && s.status !== 'Inactive'));
      if (!silent) {
        showToast(`Loaded ${(skuRes || []).length} SKUs from Item Master`, 'success');
      }
    } catch (e) {
      console.error(e);
      if (!silent) showToast('Failed to retrieve SKUs from Item Master', 'error');
    } finally {
      setRefreshingSkus(false);
    }
  };

  // Helper to determine Item Type of SKU matching SkuMasterV2 (Materials / Semi / Products)
  const getItemType = (item: SkuV2): 'products' | 'materials' | 'semi' => {
    const cat = (item.category || '').toLowerCase().trim();
    const name = (item.name || '').toLowerCase().trim();
    const code = (item.skuCode || '').toUpperCase().trim();

    // 1. Check against dynamic categories
    const matchedCat = (categoriesData || []).find(c => c && c.name && c.name.toLowerCase().trim() === cat);
    if (matchedCat?.type) {
      return matchedCat.type;
    }

    // 2. Finished Goods / Products (Notebooks, FG items, etc.)
    if (
      code.startsWith('FG') || 
      code.startsWith('PROD') || 
      code.startsWith('PRD') || 
      cat.includes('product') || 
      cat.includes('finished') ||
      cat === 'notebook' ||
      cat === 'notebooks' ||
      cat === 'books'
    ) {
      return 'products';
    }

    // 3. Semi-finished / WIP
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
      code.startsWith('WIP') ||
      name.includes('ruled cut') || 
      name.includes('inner signature') || 
      name.includes('book block')
    ) {
      return 'semi';
    }

    // 4. Raw Materials
    if (
      cat.includes('raw') || 
      cat.includes('material') || 
      cat === 'raw material' || 
      cat.includes('reel') || 
      cat.includes('board') || 
      cat.includes('gum') || 
      cat.includes('ink') || 
      cat.includes('wire') || 
      code.startsWith('RM-') || 
      code.startsWith('RM') || 
      item.paperType === 'Reels' ||
      item.paperType === 'Sheets' ||
      name.includes('reel') || 
      name.includes('wire') || 
      name.includes('adhesive') || 
      name.includes('glue')
    ) {
      return 'materials';
    }

    // Fallback based on SKU Code
    if (code.startsWith('FG')) return 'products';
    if (code.startsWith('SM') || code.startsWith('SF')) return 'semi';
    return 'materials';
  };

  const isSkuMatchingType = (s: SkuV2, purchaseType: string): boolean => {
    const pType = (purchaseType || 'Raw Material').toLowerCase().trim();
    if (pType === 'all' || pType === 'all types' || pType === 'all items' || pType === '') {
      return true;
    }
    const type = getItemType(s);
    if (pType.includes('raw') || pType.includes('material')) {
      return type === 'materials';
    }
    if (pType.includes('semi') || pType.includes('wip')) {
      return type === 'semi';
    }
    if (pType.includes('finish') || pType.includes('product')) {
      return type === 'products';
    }
    return (s.category || '').toLowerCase().includes(pType);
  };
  
  // States
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);

  // Navigation states
  const [activeSubPage, setActiveSubPage] = useState<'list' | 'new' | 'details'>('list');
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoiceV2 | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);
  
  // Details tabs
  const [detailsTab, setDetailsTab] = useState<'lots' | 'allocation' | 'history'>('lots');

  // Allocation Modal state
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [allocateForm, setAllocateForm] = useState({
    itemIndex: 0,
    toLocationId: '',
    quantity: ''
  });
  const [selectedReelsForAllocation, setSelectedReelsForAllocation] = useState<any[]>([]);
  const [allocationsList, setAllocationsList] = useState<{ toLocationId: string; quantity: string; reels: any[] }[]>([]);
  const [splittingItemIdx, setSplittingItemIdx] = useState<number | null>(null);
  const [splitDraftLocId, setSplitDraftLocId] = useState<string>('');
  const [tempSplits, setTempSplits] = useState<{ locationId: string; quantity: string }[]>([]);
  const [allocateSubmitting, setAllocateSubmitting] = useState(false);
  const [allocateError, setAllocateError] = useState('');
  const [focusedRowIdx, setFocusedRowIdx] = useState<number | null>(null);
  const [skuSearchText, setSkuSearchText] = useState<string>('');
  const [supplierSearchText, setSupplierSearchText] = useState<string>('');
  const [supplierFocused, setSupplierFocused] = useState<boolean>(false);

  // Form states: Add Invoice
  const [invoiceForm, setInvoiceForm] = useState<{
    purchaseType: string;
    invoiceNumber: string;
    vendorId: string;
    taxAmount: string;
    freight: string;
    craneCharges: string;
    loadingUnloading: string;
    otherCharges: string;
    dueDate: string;
    items: PurchaseInvoiceFormItem[];
  }>({
    purchaseType: 'Raw Material',
    invoiceNumber: '',
    vendorId: '',
    taxAmount: '0',
    freight: '0',
    craneCharges: '0',
    loadingUnloading: '0',
    otherCharges: '0',
    dueDate: '',
    items: [
      { 
        skuId: '', 
        brand: '',
        gsm: '',
        width: '',
        length: '',
        reelsCount: '',
        quantity: '', 
        purchasePrice: '', 
        reamWeight: '',
        ratePerKg: '',
        lotNumber: '',
        locationId: '',
        splits: [],
        reels: []
      }
    ]
  });
  
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [, setActiveReelModalIdx] = useState<number | null>(null);

  // Date range filters
  const [startDate, setStartDate] = useState('2024-06-01');
  const [endDate, setEndDate] = useState('2024-06-30');

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(event.target as Node)) {
        setShowToolsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcuts listener (matching SkuMasterV2 exactly)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
      
      // Alt + C / F8: Open Add/Create Drawer / Page
      if (((e.altKey && (e.key === 'c' || e.key === 'C')) || e.key === 'F8') && !isInput) {
        e.preventDefault();
        if (activeSubPage !== 'new' && !selectedInvoice) {
          handleNewPurchaseClick();
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
        findPurchaseDuplicates();
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
        const searchInput = document.querySelector('input[placeholder*="Search batches"]') as HTMLInputElement | null;
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSubPage, selectedInvoice]);

  const fetchActivityLogs = async () => {
    try {
      setActivityLogLoading(true);
      const res = await getActivityLogs({
        company: selectedCompany?._id,
        entityType: 'PurchaseInvoiceV2',
        limit: 50
      });
      const backendLogs = res.data?.logs || [];
      if (backendLogs.length === 0) {
        // Fallback mock logs
        const mockLogs = invoices.slice(0, 10).map((inv, idx) => ({
          _id: `mock-log-${idx}`,
          action: 'CREATE',
          entityType: 'PurchaseInvoiceV2',
          entityName: inv.invoiceNumber,
          details: `Purchase Batch '${inv.invoiceNumber}' was created with grand total ₹${inv.grandTotal?.toLocaleString('en-IN')}`,
          performedBy: 'System Admin',
          createdAt: inv.createdAt || new Date().toISOString()
        }));
        setActivityLogs(mockLogs);
      } else {
        setActivityLogs(backendLogs);
      }
    } catch {
      showToast('Failed to fetch activity logs', 'error');
    } finally {
      setActivityLogLoading(false);
    }
  };

  const findPurchaseDuplicates = () => {
    const codeMap = new Map<string, PurchaseInvoiceV2[]>();
    invoices.forEach(inv => {
      const code = inv.invoiceNumber?.trim().toLowerCase();
      if (code) {
        if (!codeMap.has(code)) codeMap.set(code, []);
        codeMap.get(code)!.push(inv);
      }
    });

    const groups: { field: string; value: string; items: PurchaseInvoiceV2[] }[] = [];
    codeMap.forEach((items) => {
      if (items.length > 1) {
        groups.push({ field: 'Batch / Invoice Number', value: items[0].invoiceNumber, items });
      }
    });

    setDuplicateGroups(groups);
  };

  const fetchRecycleBin = async () => {
    try {
      setRecycleBinLoading(true);
      // Filter draft or cancelled invoices as Recycle Bin items
      const cancelledInvoices = invoices.filter(inv => inv.status === 'Draft' || inv.status === 'Cancelled');
      setRecycleBinItems(cancelledInvoices);
    } catch {
      showToast('Failed to load Recycle Bin', 'error');
    } finally {
      setRecycleBinLoading(false);
    }
  };

  const handleRestoreInvoice = async (inv: PurchaseInvoiceV2) => {
    try {
      if (!inv._id) return;
      await updatePurchaseInvoiceV2(inv._id, {
        invoiceNumber: inv.invoiceNumber,
        vendorId: typeof inv.vendorId === 'object' && inv.vendorId !== null ? (inv.vendorId as any)._id : inv.vendorId,
        dueDate: inv.dueDate,
        status: 'Posted',
        company: selectedCompany?._id
      });
      showToast(`Purchase Batch '${inv.invoiceNumber}' restored to Posted successfully`, 'success');
      setRecycleBinItems(prev => prev.filter(item => item._id !== inv._id));
      await loadInvoices(); // Refresh list
      await createActivityLog({
        action: 'RESTORE',
        entityType: 'PurchaseInvoiceV2',
        entityName: inv.invoiceNumber,
        details: `Purchase Batch '${inv.invoiceNumber}' was restored from Recycle Bin`,
        company: selectedCompany?._id
      });
    } catch {
      showToast('Failed to restore purchase batch', 'error');
    }
  };



  useEffect(() => {
    if (selectedCompany?._id) {
      loadFilterData();
    }
  }, [selectedCompany?._id]);

  useEffect(() => {
    if (!selectedCompany?._id) return;
    loadInvoices(true);

    const interval = setInterval(() => {
      loadInvoices(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedCompany?._id, page, vendorFilter, statusFilter, debouncedSearch]);

  // Load balances when detailed invoice is selected
  useEffect(() => {
    if (!selectedCompany?._id || !selectedInvoice) return;
    loadBalances(true);

    const interval = setInterval(() => {
      loadBalances(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedCompany?._id, selectedInvoice]);

  const loadBalances = async (showLoading = true) => {
    try {
      const bals = await getBalancesV2(selectedCompany?._id || '', undefined, true);
      setInventoryBalances(bals);
    } catch (e) {
      console.error(e);
      if (showLoading) {
        showToast('Failed to load inventory balances', 'error');
      }
    }
  };

  const loadFilterData = async () => {
    try {
      const [vendorRes, skuRes, locRes, balRes, metaRes] = await Promise.all([
        getParties({ company: selectedCompany?._id || '', type: 'vendor', limit: 1000 }),
        getSkusV2(selectedCompany?._id || ''),
        getWarehouseHierarchyV2(selectedCompany?._id || ''),
        getBalancesV2(selectedCompany?._id || '', undefined, true).catch(() => []),
        getMetadataV2(selectedCompany?._id || '').catch(() => null)
      ]);
      const vendorList = vendorRes?.data?.parties || (Array.isArray(vendorRes?.data) ? vendorRes.data : []);
      setVendors(vendorList);
      setSkus((skuRes || []).filter(s => !s.isDeleted && s.status !== 'Inactive'));
      setLocations(locRes);
      if (balRes) setInventoryBalances(balRes);
      if (metaRes?.categories) setCategoriesData(metaRes.categories);
    } catch (e) {
      console.error(e);
      showToast('Failed to load filters data', 'error');
    }
  };

  const handleReorderLowStockItems = (targetSkuId?: string) => {
    const skuStockMap = new Map<string, number>();
    (inventoryBalances || []).forEach(b => {
      const sId = typeof b.skuId === 'object' ? b.skuId._id : b.skuId;
      if (sId) {
        skuStockMap.set(String(sId), (skuStockMap.get(String(sId)) || 0) + (b.presentStock || 0));
      }
    });

    let lowStockSkus = skus.filter(s => {
      if (targetSkuId && s._id === targetSkuId) return true;
      const stock = skuStockMap.get(String(s._id)) || 0;
      const reorderThresh = (s as any).reorderLevel || (s as any).reorderQty || (s as any).minStockLevel || 0;
      return reorderThresh > 0 && stock <= reorderThresh;
    });

    if (targetSkuId && lowStockSkus.length === 0) {
      const foundTarget = skus.find(s => s._id === targetSkuId);
      if (foundTarget) lowStockSkus = [foundTarget];
    }

    if (lowStockSkus.length === 0) {
      showToast('All material stock levels are healthy! No items need reordering.', 'info');
      return;
    }

    const firstStorage = locations.find(l => l.level === 'Storage Location')?._id || '';

    const reorderItems = lowStockSkus.map(sku => {
      const stock = skuStockMap.get(String(sku._id)) || 0;
      const targetLevel = (sku as any).reorderLevel || (sku as any).reorderQty || (sku as any).minStockLevel || 100;
      const neededQty = Math.max(targetLevel - stock, targetLevel);

      return {
        skuId: String(sku._id),
        brand: sku.brand || '',
        gsm: String(sku.gsm || ''),
        width: sku.width ? String(sku.width) : '',
        length: sku.length ? String(sku.length) : '',
        reelsCount: '',
        quantity: String(neededQty),
        purchasePrice: String((sku as any).purchasePrice || (sku as any).ratePerKg || (sku as any).cost || '45'),
        reamWeight: (sku as any).reamWeight ? String((sku as any).reamWeight) : '',
        ratePerKg: (sku as any).ratePerKg ? String((sku as any).ratePerKg) : '',
        lotNumber: `REORDER-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`,
        locationId: firstStorage,
        splits: [],
        reels: []
      };
    });

    let firstVendorId = '';
    const firstPref = (lowStockSkus[0] as any)?.preferredVendor;
    if (firstPref) {
      const vMatch = vendors.find(v => 
        v._id === firstPref || 
        (v.firmName && v.firmName.toLowerCase() === firstPref.toLowerCase()) ||
        (v.ownerName && v.ownerName.toLowerCase() === firstPref.toLowerCase()) ||
        (v.name && v.name.toLowerCase() === firstPref.toLowerCase()) ||
        (v.contactName && v.contactName.toLowerCase() === firstPref.toLowerCase())
      );
      if (vMatch) firstVendorId = vMatch._id;
    }

    setInvoiceForm({
      vendorId: firstVendorId,
      invoiceNumber: `PB-REORDER-${Date.now().toString().slice(-4)}`,
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().split('T')[0],
      purchaseType: lowStockSkus[0]?.category || 'Raw Material',
      items: reorderItems
    });
    setEditingInvoiceId(null);
    setIsEditing(false);
    setAddError('');
    setActiveSubPage('new');
    showToast(`Prepared reorder batch for ${lowStockSkus.length} low-stock material(s)`, 'success');
  };

  const reorderTriggeredRef = useRef(false);
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reorderSkuId = urlParams.get('reorderSkuId');
    const reorderAll = urlParams.get('reorderAll');
    if (!reorderTriggeredRef.current && (reorderSkuId || reorderAll === 'true') && skus.length > 0 && vendors.length > 0) {
      reorderTriggeredRef.current = true;
      handleReorderLowStockItems(reorderSkuId || undefined);
    }
  }, [skus.length, vendors.length]);

  const loadInvoices = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const res = await getPurchaseInvoicesV2({
        companyId: selectedCompany?._id || '',
        vendorId: vendorFilter || undefined,
        status: statusFilter || undefined,
        search: debouncedSearch || undefined,
        page,
        limit
      });
      setInvoices(res.invoices || []);
      setTotal(res.total || 0);

      if (selectedInvoice) {
        // Only load fresh balances; do not reset/overwrite the selected invoice reference to avoid reloading bugs
        loadBalances(false);
      }
    } catch (e) {
      console.error(e);
      if (showLoading) {
        showToast('Failed to load purchase batches', 'error');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleStatsCardClick = (statusVal: string) => {
    setStatusFilter(prev => prev === statusVal ? '' : statusVal);
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadInvoices();
  };

  const handleExportExcel = () => {
    const dataToExport = invoices.map(inv => {
      const supplierName = typeof inv.vendorId === 'object' && inv.vendorId !== null ? (inv.vendorId.firmName || inv.vendorId.ownerName) : 'Supplier';
      const firstItem = inv.items?.[0];
      const materialName = firstItem && typeof firstItem.skuId === 'object' && firstItem.skuId !== null ? (firstItem.skuId as any).name : 'Raw Material';
      const qty = inv.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;
      return {
        'Batch No.': inv.invoiceNumber,
        'Date': inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN') : '—',
        'Supplier': supplierName,
        'Material': materialName,
        'Quantity': qty,
        'Rate/KG': firstItem?.purchasePrice || 0,
        'Freight': inv.freight || 0,
        'Crane Charges': inv.craneCharges || 0,
        'Other Charges': inv.otherCharges || 0,
        'Total Value': inv.subTotal,
        'Total Bill Value': inv.grandTotal,
        'Status': inv.status === 'Posted' ? 'Received' : inv.status
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase Batches');
    XLSX.writeFile(workbook, `Purchase_Batches_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Add Item Lot Row
  const handleAddItemRow = () => {
    setInvoiceForm({
      ...invoiceForm,
      items: [
        ...invoiceForm.items,
        { skuId: '', brand: '', gsm: '', width: '', length: '', reelsCount: '', quantity: '', purchasePrice: '', reamWeight: '', ratePerKg: '', lotNumber: '', locationId: '', splits: [], reels: [] }
      ]
    });
  };

  // Remove Item Lot Row
  const handleRemoveItemRow = (idx: number) => {
    const updated = [...invoiceForm.items];
    updated.splice(idx, 1);
    setInvoiceForm({ ...invoiceForm, items: updated });
  };

  // Value Change inside Form Rows
  const handleItemRowChange = (idx: number, field: string, value: string) => {
    const updated = [...invoiceForm.items];
    const item = { ...updated[idx], [field]: value };
    
    // Auto-populate default SKU variables dynamically from Item Master
    if (field === 'skuId') {
      const selectedSku = skus.find(s => s._id === value);
      if (selectedSku) {
        item.brand = selectedSku.brand || '';
        item.gsm = String(selectedSku.gsm || '');
        
        let w = selectedSku.width ? String(selectedSku.width) : '';
        let l = selectedSku.length ? String(selectedSku.length) : '';
        if (!w || !l) {
          const match = selectedSku.name.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/i);
          if (match) {
            if (!w) w = match[1];
            if (!l) l = match[2];
          }
        }
        item.width = w;
        item.length = l;
        const rw = (selectedSku as any).reamWeight || getFallbackReamWeight(selectedSku);
        item.reamWeight = rw ? String(Number(rw.toFixed(4))) : '';
        item.sheetsPerReam = selectedSku.pages || 500;

        // Auto-populate rates from Item Master
        if ((selectedSku as any).ratePerKg) {
          item.ratePerKg = String((selectedSku as any).ratePerKg);
        } else if (selectedSku.standardCost && selectedSku.paperType === 'Sheets') {
          item.ratePerKg = String(selectedSku.standardCost);
        }
        
        if (selectedSku.purchasePrice) {
          item.purchasePrice = String(selectedSku.purchasePrice);
        } else if (selectedSku.standardCost && selectedSku.paperType !== 'Sheets') {
          item.purchasePrice = String(selectedSku.standardCost);
        } else if (item.ratePerKg && rw) {
          item.purchasePrice = String((Number(rw) * Number(item.ratePerKg)) / (selectedSku.pages || 500));
        }

        // Auto-assign storage location
        const firstStorage = locations.find(loc => loc.level === 'Storage Location');
        const defaultLocId = selectedSku.initialLocationId || (selectedSku as any).locationId || firstStorage?._id || '';
        if (defaultLocId && !item.locationId) {
          item.locationId = String(defaultLocId);
        }

        // Initialize default multi-godown split
        item.splits = [{ locationId: item.locationId || defaultLocId, quantity: item.quantity || '0' }];

        // Auto-select preferred vendor if specified on the SKU and batch vendor is not set
        const prefVen = (selectedSku as any).preferredVendor;
        if (prefVen) {
          const matchingVendor = vendors.find(v => 
            v._id === prefVen ||
            (v.firmName && v.firmName.toLowerCase() === prefVen.toLowerCase()) ||
            (v.ownerName && v.ownerName.toLowerCase() === prefVen.toLowerCase()) ||
            (v.contactName && v.contactName.toLowerCase() === prefVen.toLowerCase())
          );
          if (matchingVendor && !invoiceForm.vendorId) {
            setInvoiceForm(prev => ({ ...prev, vendorId: matchingVendor._id }));
          }
        }

        // Auto-suggest reorder quantity if present and item.quantity is empty
        const recReorder = (selectedSku as any).reorderLevel || (selectedSku as any).reorderQty || (selectedSku as any).minStockLevel;
        if (recReorder && !item.quantity) {
          item.quantity = String(recReorder);
          item.splits = [{ locationId: item.locationId || defaultLocId, quantity: String(recReorder) }];
        }
        
        // Reset Reels if not Reels format
        if (selectedSku.paperType !== 'Reels') {
          item.reelsCount = '';
          item.reels = [];
        } else {
          // If Reels, initialize with 1 reel if not set
          if (!item.reelsCount || Number(item.reelsCount) === 0) {
            item.reelsCount = '1';
            item.reels = [{ weight: Number(item.quantity) || 0, width: Number(item.width) || 0, locationId: item.locationId || defaultLocId }];
          }
        }
      }
    }

    if (field === 'reelsCount') {
      const count = Number(value) || 0;
      const currentReels = item.reels || [];
      const newReels = [...currentReels];
      if (newReels.length < count) {
        while (newReels.length < count) {
          newReels.push({ weight: 0 });
        }
      } else if (newReels.length > count) {
        newReels.length = count;
      }
      item.reels = newReels;

      // Auto-compute total quantity if there are reel weights set
      const sum = newReels.reduce((sum, r) => sum + (r.weight || 0), 0);
      if (sum > 0) {
        item.quantity = String(sum);
      }

      if (count > 0) {
        setActiveReelModalIdx(idx);
      }
    }
    
    updated[idx] = item;
    setInvoiceForm({ ...invoiceForm, items: updated });
  };

  const handleReelChange = (itemIdx: number, reelIdx: number, field: string, value: any) => {
    const updatedItems = [...invoiceForm.items];
    const item = { ...updatedItems[itemIdx] };
    const reels = [...(item.reels || [])];
    
    reels[reelIdx] = { ...reels[reelIdx], [field]: field === 'weight' || field === 'width' ? (Number(value) || 0) : value };
    item.reels = reels;

    const sum = reels.reduce((acc, r) => acc + (Number(r.weight) || 0), 0);
    item.quantity = String(sum);

    updatedItems[itemIdx] = item;
    setInvoiceForm({ ...invoiceForm, items: updatedItems });
  };

  const handleAutoSplitReels = (itemIdx: number) => {
    const updatedItems = [...invoiceForm.items];
    const item = { ...updatedItems[itemIdx] };
    const count = Number(item.reelsCount) || 0;
    const totalQty = Number(item.quantity) || 0;
    if (count <= 0) return;

    const splitWeight = totalQty > 0 ? Number((totalQty / count).toFixed(2)) : 0;
    const currentReels = item.reels || [];
    const firstStorage = locations.find(loc => loc.level === 'Storage Location');
    const newReels = Array.from({ length: count }).map((_, rIdx) => ({
      weight: splitWeight,
      width: Number(item.width) || Number(currentReels[rIdx]?.width) || 0,
      locationId: currentReels[rIdx]?.locationId || item.locationId || firstStorage?._id || ''
    }));

    item.reels = newReels;
    if (totalQty > 0) {
      item.quantity = String(splitWeight * count);
    }
    updatedItems[itemIdx] = item;
    setInvoiceForm({ ...invoiceForm, items: updatedItems });
    showToast(`Distributed ${totalQty || (splitWeight * count)} KG evenly across ${count} reels`, 'info');
  };

  const handleApplyLocationToAllReels = (itemIdx: number) => {
    const updatedItems = [...invoiceForm.items];
    const item = { ...updatedItems[itemIdx] };
    const firstLoc = item.reels?.[0]?.locationId || item.locationId;
    if (!firstLoc) return;

    const newReels = (item.reels || []).map(r => ({ ...r, locationId: firstLoc }));
    item.reels = newReels;
    updatedItems[itemIdx] = item;
    setInvoiceForm({ ...invoiceForm, items: updatedItems });
    showToast('Applied storage location to all reels', 'info');
  };

  // ── Multi-Godown Storage Allocation Helpers (Always Active by Default) ─────
  const handleAddSplitRow = (itemIdx: number) => {
    const updatedItems = [...invoiceForm.items];
    const item = { ...updatedItems[itemIdx] };
    const firstStorage = locations.find(loc => loc.level === 'Storage Location');
    const defaultLocId = item.locationId || firstStorage?._id || '';

    const currentSplits = (item.splits && item.splits.length > 0)
      ? item.splits
      : [{ locationId: defaultLocId, quantity: item.quantity || '0' }];
    
    const lastLocId = currentSplits[currentSplits.length - 1]?.locationId || defaultLocId;
    
    // Auto-calculate remaining quantity
    const totalLotQty = Number(item.quantity) || 0;
    const currentAllocated = currentSplits.reduce((sum: number, s: any) => sum + (Number(s.quantity) || 0), 0);
    const remQty = Math.max(0, totalLotQty - currentAllocated);

    item.splits = [...currentSplits, { locationId: lastLocId, quantity: remQty > 0 ? String(remQty) : '0' }];
    updatedItems[itemIdx] = item;
    setInvoiceForm({ ...invoiceForm, items: updatedItems });
  };

  const handleSplitRowChange = (itemIdx: number, splitIdx: number, field: 'locationId' | 'quantity' | 'reams', val: any) => {
    const updatedItems = [...invoiceForm.items];
    const item = { ...updatedItems[itemIdx] };
    const selectedSku = skus.find(s => s._id === item.skuId);
    const stdSheets = selectedSku?.pages || 500;
    const firstStorage = locations.find(loc => loc.level === 'Storage Location');
    const defaultLocId = item.locationId || firstStorage?._id || '';

    const currentSplits = (item.splits && item.splits.length > 0)
      ? [...item.splits]
      : [{ locationId: defaultLocId, quantity: item.quantity || '0' }];

    const targetSplit = { ...(currentSplits[splitIdx] || { locationId: defaultLocId, quantity: '0' }) };

    if (field === 'locationId') {
      targetSplit.locationId = val;
      if (splitIdx === 0) item.locationId = val;
    } else if (field === 'reams') {
      const reams = Number(val) || 0;
      targetSplit.quantity = String(reams * stdSheets);
    } else if (field === 'quantity') {
      targetSplit.quantity = String(val);
    }

    currentSplits[splitIdx] = targetSplit;
    item.splits = currentSplits;

    // Synchronize total lot quantity if user updates splits
    const totalAllocated = currentSplits.reduce((sum: number, s: any) => sum + (Number(s.quantity) || 0), 0);
    item.quantity = String(totalAllocated);

    updatedItems[itemIdx] = item;
    setInvoiceForm({ ...invoiceForm, items: updatedItems });
  };

  const handleRemoveSplitRow = (itemIdx: number, splitIdx: number) => {
    const updatedItems = [...invoiceForm.items];
    const item = { ...updatedItems[itemIdx] };
    const firstStorage = locations.find(loc => loc.level === 'Storage Location');
    const defaultLocId = item.locationId || firstStorage?._id || '';
    const currentSplits = item.splits || [];
    
    if (currentSplits.length <= 1) {
      item.splits = [{ locationId: defaultLocId, quantity: '0' }];
      item.quantity = '0';
    } else {
      const newSplits = currentSplits.filter((_, i) => i !== splitIdx);
      item.splits = newSplits;
      const totalAllocated = newSplits.reduce((sum: number, s: any) => sum + (Number(s.quantity) || 0), 0);
      item.quantity = String(totalAllocated);
    }
    updatedItems[itemIdx] = item;
    setInvoiceForm({ ...invoiceForm, items: updatedItems });
  };

  const handleEvenlySplitGodowns = (itemIdx: number) => {
    const updatedItems = [...invoiceForm.items];
    const item = { ...updatedItems[itemIdx] };
    const firstStorage = locations.find(loc => loc.level === 'Storage Location');
    const defaultLocId = item.locationId || firstStorage?._id || '';
    const currentSplits = (item.splits && item.splits.length > 0)
      ? item.splits
      : [{ locationId: defaultLocId, quantity: item.quantity || '0' }];

    if (currentSplits.length === 0) return;

    const totalLotQty = Number(item.quantity) || 0;
    const count = currentSplits.length;
    const splitQty = Math.floor(totalLotQty / count);
    const remainder = totalLotQty - (splitQty * count);

    const newSplits = currentSplits.map((s: any, i: number) => ({
      ...s,
      quantity: String(i === 0 ? splitQty + remainder : splitQty)
    }));

    item.splits = newSplits;
    updatedItems[itemIdx] = item;
    setInvoiceForm({ ...invoiceForm, items: updatedItems });
    showToast(`Distributed ${totalLotQty} evenly across ${count} godowns`, 'info');
  };

  // Submit Invoice Creation
  const handleInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    if (!invoiceForm.vendorId) {
      setAddError('Please select a Supplier / Vendor');
      return;
    }

    const firstStorage = locations.find(loc => loc.level === 'Storage Location')
      || locations.find(loc => loc.level === 'Zone')
      || locations[0];
    const defaultStorageId = firstStorage?._id || '';

    const finalInvoiceNumber = (invoiceForm.invoiceNumber || '').trim() || `PB${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;

    // Format validated items
    const validatedItems = [];
    for (let i = 0; i < invoiceForm.items.length; i++) {
      const item = invoiceForm.items[i];
      if (!item.skuId) {
        setAddError(`Please select an Item SKU in Lot #${i + 1}`);
        return;
      }

      const selectedSku = skus.find(s => s._id === item.skuId);
      const isReels = selectedSku?.paperType === 'Reels' || Number(item.reelsCount) > 0;
      const isSheets = selectedSku?.paperType === 'Sheets';
      const stdSheets = Number(item.sheetsPerReam) || selectedSku?.pages || 500;

      // Quantity resolution
      let qty = Number(item.quantity) || 0;
      if (isReels && (item.reels || []).length > 0) {
        const reelsWt = (item.reels || []).reduce((sum: number, r: any) => sum + (Number(r.weight) || 0), 0);
        if (reelsWt > 0) {
          qty = reelsWt;
        }
      }
      if (isSheets && qty <= 0 && (item as any).splits && (item as any).splits.length > 0) {
        const splitSum = (item as any).splits.reduce((sum: number, s: any) => sum + (Number(s.quantity) || 0), 0);
        if (splitSum > 0) qty = splitSum;
      }

      // Price resolution
      let price = Number(item.purchasePrice) || 0;
      if (price <= 0 && isSheets) {
        const rw = Number(item.reamWeight) || (selectedSku as any)?.reamWeight || getFallbackReamWeight(selectedSku) || 0;
        const rkg = Number(item.ratePerKg) || 0;
        if (rw > 0 && rkg > 0) {
          price = (rw * rkg) / stdSheets;
        }
      }
      if (price <= 0 && selectedSku?.purchasePrice) {
        price = Number(selectedSku.purchasePrice);
      } else if (price <= 0 && selectedSku?.standardCost) {
        price = Number(selectedSku.standardCost);
      }

      if (qty <= 0) {
        setAddError(`Please enter a valid quantity for Lot #${i + 1} (${selectedSku?.name || 'Item'})`);
        return;
      }
      if (price <= 0) {
        setAddError(`Please enter a valid rate/price for Lot #${i + 1} (${selectedSku?.name || 'Item'})`);
        return;
      }

      // Storage location
      const itemLocId = item.locationId || defaultStorageId;

      // Clean splits
      let cleanedSplits: any[] = [];
      if ((item as any).splits && (item as any).splits.length > 0) {
        cleanedSplits = (item as any).splits
          .filter((s: any) => Number(s.quantity) > 0)
          .map((s: any) => ({
            locationId: s.locationId || itemLocId || defaultStorageId,
            quantity: Number(s.quantity)
          }));
      }
      if (cleanedSplits.length === 0) {
        cleanedSplits = [{
          locationId: itemLocId || defaultStorageId,
          quantity: qty
        }];
      }

      // Clean reels
      let cleanedReels: any[] = [];
      if (isReels && (item.reels || []).length > 0) {
        cleanedReels = (item.reels || []).map((r: any, rIdx: number) => ({
          reelNumber: r.reelNumber || `${finalInvoiceNumber}-R${String(rIdx + 1).padStart(2, '0')}`,
          gsm: Number(r.gsm) || Number(selectedSku?.gsm) || 0,
          width: Number(r.width) || Number(selectedSku?.width) || 0,
          weight: Number(r.weight) || 0,
          locationId: r.locationId || itemLocId || defaultStorageId
        }));
      }

      validatedItems.push({
        skuId: item.skuId,
        quantity: qty,
        unit: selectedSku?.unit || (isReels ? 'kg' : isSheets ? 'Sheets' : 'Pcs'),
        purchasePrice: price,
        totalPrice: qty * price,
        lotNumber: item.lotNumber || finalInvoiceNumber,
        locationId: cleanedSplits[0]?.locationId || itemLocId || defaultStorageId,
        splits: cleanedSplits,
        reels: cleanedReels,
        reamWeight: item.reamWeight ? Number(item.reamWeight) : undefined,
        ratePerKg: item.ratePerKg ? Number(item.ratePerKg) : undefined
      });
    }

    const matTotal = validatedItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = Number(invoiceForm.taxAmount) || 0;
    const freight = Number(invoiceForm.freight) || 0;
    const crane = Number(invoiceForm.craneCharges) || 0;
    const loading = Number(invoiceForm.loadingUnloading) || 0;
    const other = Number(invoiceForm.otherCharges) || 0;

    setAddLoading(true);
    try {
      const invoiceData = {
        invoiceNumber: finalInvoiceNumber,
        vendorId: invoiceForm.vendorId,
        items: validatedItems,
        taxAmount: tax,
        freight,
        craneCharges: crane,
        otherCharges: loading + other, // Combined loading and other charges
        subTotal: matTotal,
        grandTotal: matTotal + tax + freight + crane + loading + other,
        company: selectedCompany?._id,
        status: 'Posted'
      };

      if (isEditing && editingInvoiceId) {
        await updatePurchaseInvoiceV2(editingInvoiceId, invoiceData);
        showToast('Purchase invoice updated successfully!', 'success');
        createActivityLog({
          action: 'UPDATE',
          entityType: 'PurchaseInvoiceV2',
          entityName: invoiceData.invoiceNumber,
          details: `Purchase Batch '${invoiceData.invoiceNumber}' was updated successfully`,
          company: selectedCompany?._id
        }).catch(() => {});
      } else {
        await createPurchaseInvoiceV2(invoiceData);
        showToast('Purchase invoice inwarded successfully!', 'success');
        createActivityLog({
          action: 'CREATE',
          entityType: 'PurchaseInvoiceV2',
          entityName: invoiceData.invoiceNumber,
          details: `Purchase Batch '${invoiceData.invoiceNumber}' was recorded successfully`,
          company: selectedCompany?._id
        }).catch(() => {});
      }

      setActiveSubPage('list');
      setIsEditing(false);
      setEditingInvoiceId(null);
      loadInvoices(false);
    } catch (err: any) {
      console.error(err);
      setAddError(err.response?.data?.msg || err.message || 'Failed to submit purchase invoice');
    } finally {
      setAddLoading(false);
    }
  };

  const handleEditInvoice = (invoice: PurchaseInvoiceV2) => {
    setIsEditing(true);
    setEditingInvoiceId(invoice._id || null);
    
    const firstItemSkuId = invoice.items && invoice.items[0]
      ? (typeof invoice.items[0].skuId === 'object' && invoice.items[0].skuId !== null ? (invoice.items[0].skuId as any)._id : invoice.items[0].skuId)
      : '';
    const firstSkuCategory = firstItemSkuId ? skus.find(s => s._id === firstItemSkuId)?.category : 'Raw Material';

    setInvoiceForm({
      purchaseType: firstSkuCategory || 'Raw Material',
      invoiceNumber: invoice.invoiceNumber,
      vendorId: typeof invoice.vendorId === 'object' && invoice.vendorId !== null ? (invoice.vendorId as any)._id : invoice.vendorId,
      taxAmount: String(invoice.taxAmount || 0),
      freight: String(invoice.freight || 0),
      craneCharges: String(invoice.craneCharges || 0),
      loadingUnloading: '0',
      otherCharges: String(invoice.otherCharges || 0),
      dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      items: (invoice.items || []).map(item => {
        const skuIdVal = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any)._id : item.skuId;
        const selectedSku = skus.find(s => s._id === skuIdVal);
        const locIdVal = typeof item.locationId === 'object' && item.locationId !== null ? (item.locationId as any)._id : item.locationId;
        const mappedReels = (item.reels || []).map(r => ({
          ...r,
          locationId: locIdVal
        }));

        return {
          skuId: skuIdVal,
          brand: selectedSku?.brand || '',
          gsm: selectedSku?.gsm ? String(selectedSku.gsm) : '',
          width: (() => {
            let w = selectedSku?.width ? String(selectedSku.width) : '';
            if (!w && selectedSku?.name) {
              const match = selectedSku.name.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/i);
              if (match) w = match[1];
            }
            return w;
          })(),
          length: (() => {
            let l = selectedSku?.length ? String(selectedSku.length) : '';
            if (!l && selectedSku?.name) {
              const match = selectedSku.name.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/i);
              if (match) l = match[2];
            }
            return l;
          })(),
          reelsCount: String(item.reels?.length || 0),
          quantity: String(item.quantity),
          purchasePrice: String(item.purchasePrice),
          reamWeight: item.reamWeight ? String(item.reamWeight) : ((selectedSku as any)?.reamWeight ? String((selectedSku as any).reamWeight) : ''),
          ratePerKg: item.ratePerKg ? String(item.ratePerKg) : (() => {
            const rw = item.reamWeight || (selectedSku as any)?.reamWeight || 0;
            const stdSheets = selectedSku?.pages || 500;
            if (rw > 0) {
              return String((Number(item.purchasePrice) * stdSheets) / rw);
            }
            return '';
          })(),
          lotNumber: item.lotNumber,
          locationId: locIdVal,
          reels: mappedReels
        };
      })
    });
    setAddError('');
    setActiveSubPage('new');
  };

  const handleNewPurchaseClick = async () => {
    setIsEditing(false);
    setEditingInvoiceId(null);
    refreshItemMasterSkus(true);
    setInvoiceForm({
      purchaseType: 'Raw Material',
      invoiceNumber: '',
      vendorId: '',
      taxAmount: '0',
      freight: '0',
      craneCharges: '0',
      loadingUnloading: '0',
      otherCharges: '0',
      dueDate: new Date().toISOString().split('T')[0],
      items: [{ skuId: '', brand: '', gsm: '', width: '', length: '', reelsCount: '', quantity: '', purchasePrice: '', reamWeight: '', ratePerKg: '', lotNumber: '', locationId: '', splits: [], reels: [] }]
    });
    setAddError('');
    setActiveSubPage('new');

    try {
      const nextNo = await getNextInvoiceNumberV2(selectedCompany?._id || '');
      setInvoiceForm(prev => ({
        ...prev,
        invoiceNumber: nextNo
      }));
    } catch (e) {
      console.error("Failed to load next purchase invoice number:", e);
    }
  };

  const [cancelConfirmInvoice, setCancelConfirmInvoice] = useState<PurchaseInvoiceV2 | null>(null);

  const handleCancelInvoice = (invoice: PurchaseInvoiceV2) => {
    if (invoice.status === 'Cancelled') {
      showToast('This purchase batch is already cancelled.', 'warning');
      return;
    }
    setCancelConfirmInvoice(invoice);
  };

  const executeCancelInvoice = async () => {
    if (!cancelConfirmInvoice) return;
    const invoice = cancelConfirmInvoice;
    try {
      const invId = invoice._id || invoice.invoiceNumber || '';
      await cancelPurchaseInvoiceV2(invId, selectedCompany?._id || '');
      showToast(`Purchase batch ${invoice.invoiceNumber} cancelled successfully!`, 'success');
      createActivityLog({
        action: 'CANCEL',
        entityType: 'PurchaseInvoiceV2',
        entityName: invoice.invoiceNumber,
        details: `Purchase Batch '${invoice.invoiceNumber}' was cancelled and stock removed`,
        company: selectedCompany?._id
      }).catch(() => {});
      loadInvoices();
    } catch (e: any) {
      console.error(e);
      showToast(e.response?.data?.msg || 'Failed to cancel purchase batch', 'error');
    } finally {
      setCancelConfirmInvoice(null);
    }
  };

  // Perform Location Allocation Submit
  const handleAllocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    setAllocateError('');

    const lotItem = selectedInvoice.items[allocateForm.itemIndex];
    const skuId = typeof lotItem.skuId === 'object' && lotItem.skuId !== null ? (lotItem.skuId as any)._id : lotItem.skuId;
    const fromLocationId = typeof lotItem.locationId === 'object' && lotItem.locationId !== null 
      ? (lotItem.locationId as any)._id 
      : lotItem.locationId;

    // Build the list of rows to allocate
    let itemsToAllocate: { toLocationId: string; quantity: number; reels: any[] }[] = [];
    if (allocationsList.length > 0) {
      itemsToAllocate = allocationsList.map(a => ({
        toLocationId: a.toLocationId,
        quantity: Number(a.quantity) || 0,
        reels: a.reels
      }));
    } else {
      const qty = Number(allocateForm.quantity);
      if (isNaN(qty) || qty <= 0) {
        setAllocateError('Please enter a valid allocation quantity or add items to the list first.');
        return;
      }
      if (!allocateForm.toLocationId) {
        setAllocateError('Please select a destination storage area');
        return;
      }
      itemsToAllocate = [{
        toLocationId: allocateForm.toLocationId,
        quantity: qty,
        reels: selectedReelsForAllocation
      }];
    }

    setAllocateSubmitting(true);
    try {
      // Execute all allocations in sequence
      for (const item of itemsToAllocate) {
        await recordTransferV2({
          skuId: skuId as string,
          fromLocationId: fromLocationId as string,
          toLocationId: item.toLocationId,
          quantity: item.quantity,
          remarks: `Location Allocation: ${selectedInvoice.invoiceNumber}`,
          company: selectedCompany?._id || '',
          batchNumber: selectedInvoice.invoiceNumber,
          reels: item.reels
        });
      }

      showToast('Stock allocated successfully!', 'success');
      setShowAllocateModal(false);
      setAllocateForm({ itemIndex: 0, toLocationId: '', quantity: '' });
      setSelectedReelsForAllocation([]);
      setAllocationsList([]);
      loadBalances();
    } catch (err: any) {
      console.error(err);
      setAllocateError(err.response?.data?.msg || 'Failed to allocate stock to location');
    } finally {
      setAllocateSubmitting(false);
    }
  };

  // Helper: Traverse parent chain in memory
  const resolveLocationPath = (locId: string) => {
    const bin = locations.find(l => l._id === locId);
    if (!bin) return { factory: '—', floor: '—', zone: '—', bin: '—' };
    
    const zone = locations.find(l => l._id === bin.parentId);
    const floor = zone ? locations.find(l => l._id === zone.parentId) : null;
    const factory = floor ? locations.find(l => l._id === floor.parentId) : null;
    
    return {
      factory: factory?.name || '—',
      floor: floor?.name || '—',
      zone: zone?.name || '—',
      bin: bin.name || '—'
    };
  };

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  // Form value aggregation
  const formLotsCount = invoiceForm.items.length;
  
  // Dynamic format counts
  let formReelsCount = 0;
  let formReelsWeight = 0;
  let formSheetsCount = 0;
  let formReamsCount = 0;
  let formHasReels = false;
  let formHasSheets = false;

  invoiceForm.items.forEach(item => {
    const sku = skus.find(s => s._id === item.skuId);
    const paperType = sku?.paperType || 'None';
    if (paperType === 'Reels') {
      formHasReels = true;
      formReelsCount += Number(item.reelsCount) || 0;
      formReelsWeight += Number(item.quantity) || 0;
    } else if (paperType === 'Sheets') {
      formHasSheets = true;
      formSheetsCount += Number(item.quantity) || 0;
      const conversion = Number(sku?.pages) || 500;
      formReamsCount += (Number(item.quantity) || 0) / conversion;
    }
  });

  const formTotalWeight = invoiceForm.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const formMatTotal = invoiceForm.items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.purchasePrice) || 0)), 0);
  const formOtherCharges = (Number(invoiceForm.freight) || 0) + (Number(invoiceForm.craneCharges) || 0) + (Number(invoiceForm.loadingUnloading) || 0) + (Number(invoiceForm.otherCharges) || 0);

  // Dashboard Stats (mocked or loaded)
  const dashboardTotalBatches = total;
  const dashboardTotalValue = invoices.reduce((sum, inv) => sum + (inv.subTotal || 0), 0);
  const dashboardPendingReceipts = invoices.filter(inv => inv.status === 'Draft').length;

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 space-y-4 font-sans text-gray-800">
      {/* Main Content Layout */}
      <div className="transition-all duration-300">
        {/* ── SUB-PAGE 3: MAIN LIST VIEW ──────────────────────────────────────── */}
        <div className="space-y-4">
          
          {/* 1. Header Banner (Matching SkuMasterV2 Header Banner exactly) */}
          <div className="flex flex-row items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-2xs relative">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-blue-100/80 text-blue-700 rounded-2xl shadow-2xs">
                <Receipt className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                  <span>Purchase Batches</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-bold transition-all">
                    {total} Total
                  </span>
                </h1>
                <p className="text-xs text-gray-500 font-medium">
                  Unified master directory for supplier invoices, material lots, and godown inward allocations.
                </p>
              </div>
            </div>
          </div>

          {/* ── 2. Top Navigation Tabs Bar & Action Toolbar (Exact match to SkuMasterV2 / Business Directory) ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 bg-white px-4 rounded-2xl shadow-2xs relative">
            {/* Backdrop overlay to close open popovers on outside click */}
            {showToolsDropdown && (
              <div
                className="fixed inset-0 z-40 bg-transparent"
                onClick={() => setShowToolsDropdown(false)}
              />
            )}

            {/* Tab Selection */}
            <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-full">
              {/* Tab 1: All Batches */}
              <button
                onClick={() => { setStatusFilter(''); setPage(1); }}
                className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
                  statusFilter === ''
                    ? 'border-teal-700 text-teal-700 bg-transparent'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
                }`}
              >
                <Receipt className={`w-4 h-4 ${statusFilter === '' ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>All Batches</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-800">{total}</span>
              </button>

              {/* Tab 2: Received Batches */}
              <button
                onClick={() => { setStatusFilter('Posted'); setPage(1); }}
                className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
                  statusFilter === 'Posted'
                    ? 'border-teal-700 text-teal-700 bg-transparent'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
                }`}
              >
                <CheckCircle className={`w-4 h-4 ${statusFilter === 'Posted' ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>Received</span>
              </button>

              {/* Tab 3: Draft / Pending */}
              <button
                onClick={() => { setStatusFilter('Draft'); setPage(1); }}
                className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
                  statusFilter === 'Draft'
                    ? 'border-teal-700 text-teal-700 bg-transparent'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
                }`}
              >
                <Clock className={`w-4 h-4 ${statusFilter === 'Draft' ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>Draft / Pending</span>
              </button>

              {/* Tab 4: Cancelled */}
              <button
                onClick={() => { setStatusFilter('Cancelled'); setPage(1); }}
                className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
                  statusFilter === 'Cancelled'
                    ? 'border-teal-700 text-teal-700 bg-transparent'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
                }`}
              >
                <Ban className={`w-4 h-4 ${statusFilter === 'Cancelled' ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>Cancelled</span>
              </button>
            </div>

            {/* Right Action Bar (Search + Icon-Only Action Tools + Reorder + Add Button) */}
            <div className="py-2 flex items-center gap-2 flex-wrap shrink-0 relative z-40">
              
              {/* 1. Global Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search batches, suppliers..."
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

              {/* 2. Tools Popover Button */}
              <div className="relative" ref={toolsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowToolsDropdown(!showToolsDropdown)}
                  className={`p-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
                    showToolsDropdown
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white hover:bg-blue-50/60 text-blue-600 border-gray-200 hover:border-blue-200'
                  }`}
                  title="Tools & Logs"
                >
                  <Settings className="w-4 h-4" />
                </button>

                {showToolsDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white/95 backdrop-blur-md rounded-2xl border border-gray-200 shadow-2xl p-2 z-50 divide-y divide-gray-100 animate-in fade-in zoom-in-95 duration-150 text-left">
                    <div className="py-1">
                      <button
                        onClick={() => { fetchActivityLogs(); setShowActivityLog(true); setShowToolsDropdown(false); }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span>Activity Log</span>
                        </div>
                        <kbd className="px-1.5 bg-gray-50 border border-gray-200 rounded text-[9px] text-gray-400 font-mono">Alt+L</kbd>
                      </button>
                      <button
                        onClick={() => { findPurchaseDuplicates(); setShowDuplicates(true); setShowToolsDropdown(false); }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-gray-400" />
                          <span>Find Duplicates</span>
                        </div>
                        <kbd className="px-1.5 bg-gray-50 border border-gray-200 rounded text-[9px] text-gray-400 font-mono">Alt+F</kbd>
                      </button>
                      <button
                        onClick={() => { fetchRecycleBin(); setShowRecycleBin(true); setShowToolsDropdown(false); }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Trash2 className="w-3.5 h-3.5 text-gray-400" />
                          <span>Recycle Bin</span>
                        </div>
                        <kbd className="px-1.5 bg-gray-50 border border-gray-200 rounded text-[9px] text-gray-400 font-mono">Alt+R</kbd>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Export Excel Button */}
              <button
                onClick={handleExportExcel}
                className="p-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-2xs bg-white hover:bg-blue-50/60 text-blue-600 border-gray-200 hover:border-blue-200"
                title="Export / Download Excel"
              >
                <Download className="w-4 h-4" />
              </button>

              {/* 4. Reload Button */}
              <button
                onClick={() => { fetchInvoices(); showToast('Purchase batches refreshed', 'info'); }}
                className="p-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-2xs bg-white hover:bg-blue-50/60 text-blue-600 border-gray-200 hover:border-blue-200"
                title="Refresh List"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {/* 5. Reorder Low Stock Action Button */}
              <button
                onClick={() => handleReorderLowStockItems()}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 active:scale-[0.98] cursor-pointer"
                title="Create purchase batch for materials at or below reorder level"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reorder Low Stock</span>
              </button>

              {/* 6. + New Purchase Batch Button */}
              <button
                onClick={handleNewPurchaseClick}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20 active:scale-[0.98] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Purchase</span>
              </button>
            </div>
          </div>

          {/* 3. Statistics Cards (Matching SkuMasterV2 card styling) */}
          {(() => {
            const dashboardReceivedBatches = invoices.filter(inv => inv.status === 'Posted').length;
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  onClick={() => { setStatusFilter(''); setPage(1); }}
                  className={`w-full text-left rounded-2xl shadow-2xs border p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] ${
                    statusFilter === '' 
                      ? 'bg-blue-50/40 border-blue-400 ring-2 ring-blue-100' 
                      : 'bg-white border-gray-200/80 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Total Batches</span>
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  </div>
                  <p className="text-2xl font-black text-gray-900 mt-1 font-mono">{dashboardTotalBatches}</p>
                </button>

                <button
                  onClick={() => { setStatusFilter('Posted'); setPage(1); }}
                  className={`w-full text-left rounded-2xl shadow-2xs border p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] ${
                    statusFilter === 'Posted' 
                      ? 'bg-emerald-50/40 border-emerald-400 ring-2 ring-emerald-100' 
                      : 'bg-white border-gray-200/80 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Received Batches</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  </div>
                  <p className="text-2xl font-black text-emerald-600 mt-1 font-mono">{dashboardReceivedBatches}</p>
                </button>

                <button
                  onClick={() => { setStatusFilter('Draft'); setPage(1); }}
                  className={`w-full text-left rounded-2xl shadow-2xs border p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] ${
                    statusFilter === 'Draft' 
                      ? 'bg-amber-50/40 border-amber-400 ring-2 ring-amber-100' 
                      : 'bg-white border-gray-200/80 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Pending Receipts</span>
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  </div>
                  <p className="text-2xl font-black text-amber-600 mt-1 font-mono">{dashboardPendingReceipts}</p>
                </button>

                <div className="w-full text-left rounded-2xl shadow-2xs border p-4 bg-white border-gray-200/80">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Total Value</span>
                    <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  </div>
                  <p className="text-2xl font-black text-purple-700 mt-1 font-mono">₹{dashboardTotalValue.toLocaleString('en-IN')}</p>
                </div>
              </div>
            );
          })()}

          {/* 4. Table Card Container with Supplier/Date Filters */}
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden space-y-0">
            {/* Filter Sub-bar */}
            <div className="bg-gray-50/50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 text-xs font-semibold text-gray-600">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Supplier:</span>
                <select
                  value={vendorFilter}
                  onChange={e => { setVendorFilter(e.target.value); setPage(1); }}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 shadow-2xs focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="">All Suppliers ({vendors.length})</option>
                  {vendors.map(v => (
                    <option key={v._id} value={v._id}>{v.firmName || v.ownerName}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Date Range:</span>
                <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-2.5 py-1 bg-white text-xs font-semibold shadow-2xs">
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="text-xs border-0 bg-transparent focus:ring-0 p-0 text-gray-700 font-mono font-bold"
                  />
                  <span className="text-gray-400 font-bold text-xs">–</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="text-xs border-0 bg-transparent focus:ring-0 p-0 text-gray-700 font-mono font-bold"
                  />
                </div>

                {(vendorFilter || search || statusFilter || startDate !== '2024-06-01' || endDate !== '2024-06-30') && (
                  <button
                    onClick={() => {
                      setSearch('');
                      setVendorFilter('');
                      setStatusFilter('');
                      setStartDate('2024-06-01');
                      setEndDate('2024-06-30');
                      setPage(1);
                    }}
                    className="text-blue-600 hover:text-blue-800 text-xs font-bold px-2 py-1 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            {/* Invoices Table */}
            <InvoiceTable
              invoices={invoices}
              loading={loading}
              skus={skus}
              onViewDetails={(inv) => {
                setSelectedInvoice(inv);
                setDetailsTab('lots');
                setActiveSubPage('details');
              }}
              onEditInvoice={handleEditInvoice}
              onCancelInvoice={handleCancelInvoice}
            />

            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-white px-4 py-3 border-t border-gray-100 text-xs font-semibold text-gray-500">
                <span>
                  Showing Page <span className="text-gray-900 font-bold">{page}</span> of <span className="text-gray-900 font-bold">{totalPages}</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                    disabled={page === 1}
                    className="p-1.5 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors shadow-2xs flex items-center cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={page === totalPages}
                    className="p-1.5 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors shadow-2xs flex items-center cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 5. Informational Bottom Card */}
          <div className="bg-white p-5 border border-gray-200/80 rounded-2xl shadow-2xs space-y-2.5 text-xs">
            <h4 className="font-bold text-gray-900 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>About Purchase Batches</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 font-medium text-gray-600 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                <span>Each purchase batch can contain multiple materials (different brand, GSM, width, etc.)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                <span>Location allocation happens after inward delivery or during batch registration.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                <span>Dual UOM support: automatic Reams, Sheets, KG, and Unit conversions.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                <span>Stock is tracked lot-wise and godown-wise for precise reconciliation.</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── SUB-PAGE 1: NEW/EDIT FORM POPUP MODAL DIALOG (Matching Item Master Dialog Style) ── */}
      <Modal
        isOpen={activeSubPage === 'new'}
        onClose={() => setActiveSubPage('list')}
        size="max-w-4xl"
        padding="p-0"
        title={
          <div className="flex items-center gap-2 text-left">
            <div className="p-1.5 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
              <Receipt className="w-3.5 h-3.5 text-slate-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 text-sm">
                  {isEditing ? 'Edit Purchase Batch' : 'Add New Purchase Batch'}
                </span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                  {invoiceForm.purchaseType || 'Raw Material'}
                </span>
              </div>
              <p className="text-[10px] text-gray-500 font-medium">
                {isEditing ? 'Modify purchase invoice records, material lots, and storage allocations' : 'Record a new supplier material lot delivery and godown storage allocation'}
              </p>
            </div>
          </div>
        }
      >
        <form onSubmit={handleInvoiceSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden text-left">
          {/* Scrollable Form Body with Balanced Spacing */}
          <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4 custom-scrollbar">
            {addError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{addError}</span>
              </div>
            )}

            {/* 1. Purchase Batch & Supplier Details */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-900 border-b border-gray-100 pb-1.5 flex items-center gap-2 uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                1. Batch & Supplier Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase tracking-wide">BATCH NO. *</label>
                  <input
                    type="text"
                    placeholder="e.g. PB2407001"
                    value={invoiceForm.invoiceNumber}
                    onChange={e => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-mono font-bold text-gray-900 transition-all shadow-3xs"
                  />
                  <span className="text-[9px] text-gray-400 font-medium mt-1 block">Auto-generated if empty</span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase tracking-wide">PURCHASE DATE *</label>
                  <input
                    type="date"
                    value={invoiceForm.dueDate}
                    onChange={e => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800 transition-all shadow-3xs"
                    required
                  />
                </div>

                <div className="relative">
                  <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase tracking-wide">SUPPLIER / VENDOR *</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search or select Supplier..."
                      value={supplierFocused ? supplierSearchText : (vendors.find(v => v._id === invoiceForm.vendorId)?.firmName || vendors.find(v => v._id === invoiceForm.vendorId)?.ownerName || '')}
                      onChange={e => setSupplierSearchText(e.target.value)}
                      onFocus={() => {
                        setSupplierFocused(true);
                        setFocusedRowIdx(null);
                        setSupplierSearchText(vendors.find(v => v._id === invoiceForm.vendorId)?.firmName || vendors.find(v => v._id === invoiceForm.vendorId)?.ownerName || '');
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setSupplierFocused(false);
                        }, 250);
                      }}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800 transition-all shadow-3xs"
                      required
                    />
                    {supplierFocused && (
                      <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-30 divide-y divide-gray-100">
                        {vendors
                          .filter(v => {
                            if (!supplierSearchText.trim()) return true;
                            const term = supplierSearchText.toLowerCase();
                            return (v.firmName || '').toLowerCase().includes(term) || 
                                   (v.ownerName || '').toLowerCase().includes(term);
                          })
                          .map(v => (
                            <button
                              key={v._id}
                              type="button"
                              onMouseDown={() => {
                                setInvoiceForm({ ...invoiceForm, vendorId: v._id });
                                setSupplierFocused(false);
                                setSupplierSearchText('');
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-blue-50 hover:text-blue-700 transition-colors block text-xs cursor-pointer"
                            >
                              <div className="font-bold text-gray-900">{v.firmName || v.ownerName}</div>
                              {v.firmName && v.ownerName && (
                                <div className="text-[10px] text-gray-500 mt-0.5">Contact: {v.ownerName}</div>
                              )}
                            </button>
                          ))
                        }
                        {vendors.filter(v => {
                          if (!supplierSearchText.trim()) return true;
                          const term = supplierSearchText.toLowerCase();
                          return (v.firmName || '').toLowerCase().includes(term) || 
                                 (v.ownerName || '').toLowerCase().includes(term);
                        }).length === 0 && (
                          <div className="px-3 py-3 text-xs text-gray-400 italic text-center">No suppliers found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase tracking-wide">PURCHASE TYPE</label>
                  <select
                    value={invoiceForm.purchaseType || 'Raw Material'}
                    onChange={e => setInvoiceForm({ ...invoiceForm, purchaseType: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800 transition-all shadow-3xs"
                  >
                    <option value="Raw Material">Raw Material</option>
                    <option value="Semi Finished">Semi-Finished</option>
                    <option value="Finished Goods">Finished Goods</option>
                    <option value="All">All Types</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 2. Material Lots & Reel Allocations */}
            <div className="space-y-3">
              <div className="flex justify-between items-center border-b border-gray-100 pb-1.5">
                <h3 className="text-xs font-bold text-gray-900 flex items-center gap-2 uppercase tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                  2. Material Lots & Items ({invoiceForm.items.length})
                </h3>
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-3xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Material Lot</span>
                </button>
              </div>

              <div className="space-y-5">
                {invoiceForm.items.map((item, idx) => {
                  const reelsCount = Number(item.reelsCount) || 0;
                  const selectedSku = skus.find(s => s._id === item.skuId);
                  const paperType = selectedSku?.paperType || 'None';
                  const unitLabel = selectedSku?.unit || 'KG';
                  return (
                    <div key={idx} className="bg-slate-50/60 border border-slate-200/90 rounded-2xl p-5 shadow-3xs space-y-5 text-left transition-all">
                      <div className="flex justify-between items-center border-b border-slate-200/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-black text-gray-900 uppercase font-mono bg-slate-200/80 px-3 py-1 rounded-lg border border-slate-300/60 shadow-3xs">
                            LOT #{idx + 1}
                          </span>
                          {paperType !== 'None' && (
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wider ${
                              paperType === 'Reels' 
                                ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}>
                              {paperType}
                            </span>
                          )}
                        </div>
                        {invoiceForm.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="text-red-500 hover:text-red-700 px-2.5 py-1 hover:bg-red-50 rounded-lg transition-colors text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remove Lot
                          </button>
                        )}
                      </div>

                    {/* Lot Form Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-gray-900">
                      <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                          ITEM SKU *
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Select or search SKU..."
                            value={focusedRowIdx === idx ? skuSearchText : (skus.find(s => s._id === item.skuId)?.name || '')}
                            onChange={e => setSkuSearchText(e.target.value)}
                            onFocus={() => {
                              setFocusedRowIdx(idx);
                              setSupplierFocused(false);
                              setSkuSearchText(skus.find(s => s._id === item.skuId)?.name || '');
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                if (focusedRowIdx === idx) {
                                  setFocusedRowIdx(null);
                                }
                              }, 250);
                            }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white font-semibold text-gray-800 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-3xs"
                            required
                          />
                          {focusedRowIdx === idx && (() => {
                            const activeType = invoiceForm.purchaseType || 'Raw Material';
                            const typeMatchingSkus = skus.filter(s => isSkuMatchingType(s, activeType));
                            const term = (skuSearchText || '').trim().toLowerCase();
                            const matchingSkus = typeMatchingSkus.filter(s => {
                              if (!term) return true;
                              return (s.name || '').toLowerCase().includes(term) || 
                                     (s.skuCode || '').toLowerCase().includes(term) ||
                                     (s.category || '').toLowerCase().includes(term) ||
                                     (s.paperType || '').toLowerCase().includes(term) ||
                                     (s.brand || '').toLowerCase().includes(term) ||
                                     (s.gsm ? String(s.gsm).includes(term) : false);
                            });

                            return (
                              <div className="absolute left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-40 divide-y divide-gray-100">
                                {matchingSkus.map(s => {
                                  const paperLabel = s.paperType && s.paperType !== 'None' ? s.paperType : '';
                                  const sizeLabel = s.width && s.length ? `${s.width}x${s.length} cm` : (s.width ? `${s.width} cm` : '');
                                  const isSelected = item.skuId === s._id;

                                  return (
                                    <button
                                      key={s._id}
                                      type="button"
                                      onMouseDown={() => {
                                        handleItemRowChange(idx, 'skuId', s._id || '');
                                        setFocusedRowIdx(null);
                                        setSkuSearchText('');
                                      }}
                                      className={`w-full px-3.5 py-2.5 text-left transition-colors block text-xs cursor-pointer ${
                                        isSelected ? 'bg-blue-50/80 text-blue-900 border-l-4 border-blue-600' : 'hover:bg-blue-50/40 text-gray-900'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="font-bold text-gray-900 text-xs">{s.name}</div>
                                        <span className="font-mono text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                          {s.skuCode}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                          {s.category || getItemType(s)}
                                        </span>
                                        {paperLabel && (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                                            {paperLabel}
                                          </span>
                                        )}
                                        {s.gsm && (
                                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                            {s.gsm} GSM
                                          </span>
                                        )}
                                        {sizeLabel && (
                                          <span className="text-[9px] text-gray-500 font-mono">
                                            {sizeLabel}
                                          </span>
                                        )}
                                        <span className="text-[9px] text-gray-400 font-medium ml-auto">
                                          Unit: {s.unit || 'KG'}
                                        </span>
                                      </div>
                                    </button>
                                  );
                                })}
                                {matchingSkus.length === 0 && (
                                  <div className="px-3 py-4 text-xs text-gray-400 italic text-center">
                                    No {activeType} SKUs found
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">GSM</label>
                        <input
                          type="number"
                          value={item.gsm}
                          onChange={e => handleItemRowChange(idx, 'gsm', e.target.value)}
                          placeholder="e.g. 230"
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono text-center font-bold focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>

                      {paperType === 'Reels' && (
                        <>
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">WIDTH (CM)</label>
                            <input
                              type="number"
                              value={item.width}
                              onChange={e => handleItemRowChange(idx, 'width', e.target.value)}
                              placeholder="Width in cm"
                              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono text-center font-bold focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">REELS COUNT</label>
                            <input
                              type="number"
                              value={item.reelsCount}
                              onChange={e => handleItemRowChange(idx, 'reelsCount', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono text-center font-bold focus:ring-2 focus:ring-blue-500 bg-white"
                              placeholder="0"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">TOTAL {unitLabel}</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={e => handleItemRowChange(idx, 'quantity', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono text-right font-black focus:ring-2 focus:ring-blue-500 bg-white"
                              placeholder="0"
                              disabled={reelsCount > 0}
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">RATE / {unitLabel} (₹)</label>
                            <input
                              type="number"
                              value={item.purchasePrice}
                              onChange={e => handleItemRowChange(idx, 'purchasePrice', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono text-right font-bold focus:ring-2 focus:ring-blue-500 bg-white"
                              placeholder="0.00"
                              required
                            />
                          </div>
                        </>
                      )}

                      {paperType === 'Sheets' && (
                        <>
                          <div>
                            <label className="block text-[11px] font-semibold text-blue-600 mb-1">QTY IN REAMS *</label>
                            <input
                              type="number"
                              step="any"
                              placeholder="0"
                              value={((Number(item.quantity) || 0) / (Number(item.sheetsPerReam) || selectedSku?.pages || 500)) || ''}
                              onChange={e => {
                                const reams = Number(e.target.value) || 0;
                                const stdSheets = Number(item.sheetsPerReam) || selectedSku?.pages || 500;
                                const totalSheets = reams * stdSheets;
                                
                                const updatedItems = [...invoiceForm.items];
                                updatedItems[idx].quantity = String(totalSheets);
                                
                                const firstStorage = locations.find(loc => loc.level === 'Storage Location');
                                const defaultLocId = updatedItems[idx].locationId || firstStorage?._id || '';
                                updatedItems[idx].splits = [{ locationId: defaultLocId, quantity: String(totalSheets) }];
                                
                                // Recalculate price per sheet
                                const rw = Number(updatedItems[idx].reamWeight) || 0;
                                const rkg = Number(updatedItems[idx].ratePerKg) || 0;
                                if (rw > 0 && rkg > 0) {
                                  updatedItems[idx].purchasePrice = String((rw * rkg) / stdSheets);
                                }
                                setInvoiceForm({ ...invoiceForm, items: updatedItems });
                              }}
                              className="w-full px-3 py-2 border border-blue-200 bg-blue-50/20 rounded-xl text-xs text-right font-bold text-blue-900 focus:ring-2 focus:ring-blue-500"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-blue-600 mb-1">REAM WEIGHT (KG) *</label>
                            <input
                              type="number"
                              step="any"
                              placeholder="e.g. 10.37"
                              value={item.reamWeight || (selectedSku as any)?.reamWeight || (getFallbackReamWeight(selectedSku) ? String(Number(getFallbackReamWeight(selectedSku)!.toFixed(4))) : '')}
                              onChange={e => {
                                const rw = e.target.value;
                                const updatedItems = [...invoiceForm.items];
                                updatedItems[idx].reamWeight = rw;
                                
                                // Recalculate price per sheet
                                const rwNum = Number(rw) || 0;
                                const rkgNum = Number(updatedItems[idx].ratePerKg) || 0;
                                const stdSheets = Number(updatedItems[idx].sheetsPerReam) || selectedSku?.pages || 500;
                                if (rwNum > 0 && rkgNum > 0) {
                                  updatedItems[idx].purchasePrice = String((rwNum * rkgNum) / stdSheets);
                                }
                                setInvoiceForm({ ...invoiceForm, items: updatedItems });
                              }}
                              className="w-full px-3 py-2 border border-blue-200 bg-blue-50/20 rounded-xl text-xs text-right font-bold text-blue-900 focus:ring-2 focus:ring-blue-500"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1">TOTAL WEIGHT (KG)</label>
                            <input
                              type="text"
                              value={(((Number(item.quantity) || 0) / (Number(item.sheetsPerReam) || selectedSku?.pages || 500)) * (Number(item.reamWeight) || (selectedSku as any)?.reamWeight || getFallbackReamWeight(selectedSku) || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' kg'}
                              disabled
                              className="w-full px-3 py-2 border border-gray-200 bg-gray-100/60 rounded-xl text-xs text-right font-bold text-gray-600 cursor-not-allowed"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-blue-600 mb-1">RATE / KG (₹) *</label>
                            <input
                              type="number"
                              step="any"
                              placeholder="e.g. 80"
                              value={item.ratePerKg || ''}
                              onChange={e => {
                                const rkg = e.target.value;
                                const updatedItems = [...invoiceForm.items];
                                updatedItems[idx].ratePerKg = rkg;
                                
                                // Recalculate price per sheet
                                const rwNum = Number(updatedItems[idx].reamWeight) || (selectedSku as any)?.reamWeight || getFallbackReamWeight(selectedSku) || 0;
                                const rkgNum = Number(rkg) || 0;
                                const stdSheets = Number(updatedItems[idx].sheetsPerReam) || selectedSku?.pages || 500;
                                if (rwNum > 0 && rkgNum > 0) {
                                  updatedItems[idx].purchasePrice = String((rwNum * rkgNum) / stdSheets);
                                }
                                setInvoiceForm({ ...invoiceForm, items: updatedItems });
                              }}
                              className="w-full px-3 py-2 border border-blue-200 bg-blue-50/20 rounded-xl text-xs text-right font-bold text-blue-900 focus:ring-2 focus:ring-blue-500"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1">TOTAL SHEETS</label>
                            <input
                              type="text"
                              value={(Number(item.quantity) || 0).toLocaleString() + ' Sheets'}
                              disabled
                              className="w-full px-3 py-2 border border-gray-200 bg-gray-100/60 rounded-xl text-xs text-right font-black text-gray-700 cursor-not-allowed"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1">TOTAL COST (₹)</label>
                            <input
                              type="text"
                              value={'₹' + ((((Number(item.quantity) || 0) / (Number(item.sheetsPerReam) || selectedSku?.pages || 500)) * (Number(item.reamWeight) || (selectedSku as any)?.reamWeight || getFallbackReamWeight(selectedSku) || 0)) * (Number(item.ratePerKg) || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              disabled
                              className="w-full px-3 py-2 border border-gray-200 bg-gray-100/60 rounded-xl text-xs text-right font-black text-gray-800 cursor-not-allowed"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1">RATE / SHEET (₹)</label>
                            <input
                              type="text"
                              value={'₹' + (Number(item.purchasePrice) || 0).toFixed(4)}
                              disabled
                              className="w-full px-3 py-2 border border-gray-200 bg-gray-100/60 rounded-xl text-xs text-right font-bold text-gray-600 cursor-not-allowed"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-blue-600 mb-1">SHEETS / REAM *</label>
                            <input
                              type="number"
                              value={item.sheetsPerReam !== undefined ? item.sheetsPerReam : ((selectedSku as any)?.pages || (selectedSku as any)?.sheetsPerReam || 500)}
                              onChange={e => {
                                const val = Number(e.target.value) || 500;
                                const updatedItems = [...invoiceForm.items];
                                updatedItems[idx].sheetsPerReam = val;

                                const currentReams = ((Number(updatedItems[idx].quantity) || 0) / ((selectedSku as any)?.pages || 500));
                                const totalSheets = (currentReams > 0 ? currentReams : 1) * val;
                                updatedItems[idx].quantity = String(totalSheets);

                                const rwNum = Number(updatedItems[idx].reamWeight) || (selectedSku as any)?.reamWeight || getFallbackReamWeight(selectedSku) || 0;
                                const rkgNum = Number(updatedItems[idx].ratePerKg) || 0;
                                if (rwNum > 0 && rkgNum > 0) {
                                  updatedItems[idx].purchasePrice = String((rwNum * rkgNum) / val);
                                }
                                setInvoiceForm({ ...invoiceForm, items: updatedItems });
                              }}
                              className="w-full px-3 py-2 border border-blue-200 bg-blue-50/20 rounded-xl text-xs text-center font-bold text-blue-900 focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </>
                      )}

                      {paperType === 'None' && (
                        <>
                          {selectedSku?.altUnit && selectedSku?.altUnitConversion ? (
                            <>
                              <div className="col-span-1 sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-blue-600 mb-1">
                                  QTY IN {selectedSku.altUnit}
                                  <span className="text-[10px] font-normal text-gray-400 ml-1 font-mono">({formatUomFormula(selectedSku)})</span>
                                </label>
                                <input
                                  type="number"
                                  placeholder="0"
                                  onChange={e => {
                                    const val = Number(e.target.value) || 0;
                                    const primaryQty = convertAltToPrimary(val, selectedSku);
                                    handleItemRowChange(idx, 'quantity', String(primaryQty));
                                  }}
                                  disabled={item.splits && item.splits.length > 0}
                                  className="w-full px-3 py-2 border border-blue-200 bg-blue-50/20 rounded-xl text-xs text-right font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-gray-600 mb-1 flex items-center justify-between">
                                  <span>TOTAL {unitLabel}</span>
                                  {Number(item.quantity) > 0 && (
                                    <span className="text-[9px] font-bold text-blue-700 font-mono">
                                      {convertPrimaryToAlt(Number(item.quantity), selectedSku)} {selectedSku.altUnit}
                                    </span>
                                  )}
                                </label>
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={e => handleItemRowChange(idx, 'quantity', e.target.value)}
                                  disabled={item.splits && item.splits.length > 0}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-right font-black focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-60"
                                  placeholder="0"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-gray-600 mb-1">RATE / {unitLabel} (₹)</label>
                                <input
                                  type="number"
                                  value={item.purchasePrice}
                                  onChange={e => handleItemRowChange(idx, 'purchasePrice', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-right font-bold focus:ring-2 focus:ring-blue-500 bg-white"
                                  placeholder="0.00"
                                  required
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="col-span-1 sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-gray-600 mb-1">TOTAL {unitLabel}</label>
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={e => handleItemRowChange(idx, 'quantity', e.target.value)}
                                  disabled={item.splits && item.splits.length > 0}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-right font-black focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-60"
                                  placeholder="0"
                                  required
                                />
                              </div>

                              <div className="col-span-1 sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-gray-600 mb-1">RATE / {unitLabel} (₹)</label>
                                <input
                                  type="number"
                                  value={item.purchasePrice}
                                  onChange={e => handleItemRowChange(idx, 'purchasePrice', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-right font-bold focus:ring-2 focus:ring-blue-500 bg-white"
                                  placeholder="0.00"
                                  required
                                />
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {/* Non-reels Godown / Location Allocation Matrix (Default Always Active) */}
                    {!reelsCount && (() => {
                      const firstStorage = locations.find(loc => loc.level === 'Storage Location');
                      const defaultLocId = item.locationId || firstStorage?._id || '';
                      const splits = (item.splits && item.splits.length > 0)
                        ? item.splits
                        : [{ locationId: defaultLocId, quantity: item.quantity || '0' }];
                      const stdSheets = selectedSku?.pages || 500;
                      const isSheets = selectedSku?.paperType === 'Sheets';
                      const totalAllocated = splits.reduce((sum: number, s: any) => sum + (Number(s.quantity) || 0), 0);

                      return (
                        <div className="space-y-3 pt-3 border-t border-slate-200/80 bg-white p-3.5 rounded-xl border border-gray-200 shadow-3xs">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-blue-600" />
                              <span className="text-xs font-black text-gray-900 uppercase tracking-wider">
                                Storage & Godown Allocations
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                                {splits.length} Godown{splits.length > 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {splits.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleEvenlySplitGodowns(idx)}
                                  className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1 cursor-pointer bg-white hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 shadow-3xs transition-colors"
                                  title="Distribute total quantity evenly across godowns"
                                >
                                  ⚡ Split Evenly
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleAddSplitRow(idx)}
                                className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-1 cursor-pointer px-3 py-1.5 rounded-lg shadow-3xs transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" /> Add Location / Godown
                              </button>
                            </div>
                          </div>

                          {/* Allocation Matrix Table */}
                          <div className="overflow-x-auto border border-gray-200 rounded-xl bg-slate-50/50 shadow-3xs">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
                                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                                  <th className="py-2.5 px-3 min-w-[220px]">Target Godown / Storage Location *</th>
                                  {isSheets && (
                                    <th className="py-2.5 px-3 w-28 text-right">Reams</th>
                                  )}
                                  <th className="py-2.5 px-3 w-32 text-right">
                                    {isSheets ? 'Sheets (Primary)' : `Quantity (${unitLabel})`} *
                                  </th>
                                  {isSheets && Number(item.reamWeight) > 0 && (
                                    <th className="py-2.5 px-3 w-28 text-right">Weight (KG)</th>
                                  )}
                                  <th className="py-2.5 px-3 w-32 text-right">Line Subtotal (₹)</th>
                                  <th className="py-2.5 px-2 w-10 text-center"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-150 bg-white">
                                {splits.map((split: any, sIdx: number) => {
                                  const splitSheets = Number(split.quantity) || 0;
                                  const splitReams = isSheets ? (splitSheets / stdSheets) : 0;
                                  const splitWeight = isSheets ? splitReams * (Number(item.reamWeight) || 0) : 0;
                                  const splitAmount = splitSheets * (Number(item.purchasePrice) || 0);

                                  return (
                                    <tr key={sIdx} className="hover:bg-blue-50/30 transition-colors">
                                      <td className="py-2 px-3 text-center font-bold text-gray-400 text-[11px]">{sIdx + 1}</td>
                                      <td className="py-2 px-3">
                                        <LocationSelectPopup
                                          locations={locations}
                                          locationId={split.locationId || ''}
                                          onChange={(_w, _f, _z, locId) => handleSplitRowChange(idx, sIdx, 'locationId', locId)}
                                          variant="compact"
                                          hideLabel
                                        />
                                      </td>
                                      {isSheets && (
                                        <td className="py-2 px-3">
                                          <input
                                            type="number"
                                            value={splitReams || ''}
                                            onChange={e => handleSplitRowChange(idx, sIdx, 'reams', e.target.value)}
                                            placeholder="0"
                                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-right text-gray-900 focus:ring-2 focus:ring-blue-500 bg-white"
                                          />
                                        </td>
                                      )}
                                      <td className="py-2 px-3">
                                        <input
                                          type="number"
                                          value={split.quantity || ''}
                                          onChange={e => handleSplitRowChange(idx, sIdx, 'quantity', e.target.value)}
                                          placeholder="0"
                                          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-black text-right text-blue-700 focus:ring-2 focus:ring-blue-500 bg-white"
                                        />
                                      </td>
                                      {isSheets && Number(item.reamWeight) > 0 && (
                                        <td className="py-2 px-3 text-right font-semibold text-gray-600">
                                          {splitWeight > 0 ? splitWeight.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '0'} kg
                                        </td>
                                      )}
                                      <td className="py-2 px-3 text-right font-black text-gray-900">
                                        ₹{splitAmount.toLocaleString('en-IN')}
                                      </td>
                                      <td className="py-2 px-2 text-center">
                                        {splits.length > 1 ? (
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveSplitRow(idx, sIdx)}
                                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                            title="Remove location allocation"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        ) : (
                                          <span className="text-gray-300 font-bold text-xs">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Live Reconciliation Bar */}
                          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-gray-200 text-xs">
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-gray-500 uppercase text-[10px]">Total Allocated:</span>
                              <span className="font-black text-blue-700 text-sm">
                                {isSheets
                                  ? `${totalAllocated.toLocaleString()} Sheets (${(totalAllocated / stdSheets).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Reams)`
                                  : `${totalAllocated.toLocaleString()} ${unitLabel}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase">Lot Subtotal:</span>
                              <span className="font-black text-gray-900 text-sm">
                                ₹{(totalAllocated * (Number(item.purchasePrice) || 0)).toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Inline Reels List inside card */}
                    {reelsCount > 0 && (
                      <div className="pt-3 border-t border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                            Reel Specifications & Storage Allocation:
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleAutoSplitReels(idx)}
                              className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1 cursor-pointer bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors"
                              title="Evenly distribute total lot weight across all reels"
                            >
                              ⚡ Auto-Split Weight
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyLocationToAllReels(idx)}
                              className="text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center gap-1 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg border border-slate-300 transition-colors"
                              title="Copy first reel's storage location to all other reels"
                            >
                              📍 Location to All
                            </button>
                          </div>
                        </div>

                        <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-3xs">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-gray-50/80 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
                                <th className="py-2 px-3 w-16">Reel</th>
                                <th className="py-2 px-3 w-32">Weight (KG) *</th>
                                <th className="py-2 px-3 w-32">Width (cm) *</th>
                                <th className="py-2 px-3">Storage Allocation *</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
                              {Array.from({ length: reelsCount }).map((_, rIdx) => {
                                const reelObj = item.reels?.[rIdx] || {};
                                const reelWeightVal = reelObj.weight !== undefined && reelObj.weight !== null ? reelObj.weight : '';
                                const reelWidthVal = reelObj.width !== undefined && reelObj.width !== null ? reelObj.width : item.width;
                                const reelLocId = reelObj.locationId || item.locationId || '';

                                return (
                                  <tr key={rIdx} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-2 px-3 font-mono text-gray-500 font-bold">R-{rIdx + 1}</td>
                                    <td className="py-2 px-3">
                                      <input
                                        type="number"
                                        value={reelWeightVal}
                                        onChange={e => handleReelChange(idx, rIdx, 'weight', e.target.value)}
                                        placeholder="0.0"
                                        className="w-full px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-mono font-bold text-gray-900 focus:ring-2 focus:ring-blue-500"
                                        required
                                      />
                                    </td>
                                    <td className="py-2 px-3">
                                      <input
                                        type="number"
                                        value={reelWidthVal}
                                        onChange={e => handleReelChange(idx, rIdx, 'width', e.target.value)}
                                        placeholder="Width"
                                        className="w-full px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500"
                                        required
                                      />
                                    </td>
                                    <td className="py-2 px-3 min-w-[200px]">
                                      <LocationSelectPopup
                                        locations={locations}
                                        locationId={reelLocId}
                                        onChange={(_w, _f, _z, locId) => handleReelChange(idx, rIdx, 'locationId', locId)}
                                        variant="compact"
                                        hideLabel
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {(() => {
                          const enteredReels = item.reels || [];
                          const validCount = enteredReels.filter((r: any) => r && (r.weight > 0 || r.reelNumber)).length;
                          const totalWeight = enteredReels.reduce((sum: number, r: any) => sum + (Number(r.weight) || 0), 0);
                          return (
                            <div className="mt-2 bg-blue-50/80 border border-blue-200/80 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs font-bold text-blue-900">
                              <span className="flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-blue-600" />
                                Reconciliation:
                              </span>
                              <span className="font-mono text-blue-700">
                                {validCount || reelsCount} reels • {totalWeight.toLocaleString('en-IN', { maximumFractionDigits: 2 })} KG
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Summary & Other Charges */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-900 border-b border-gray-100 pb-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              3. Summary & Additional Charges
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">FREIGHT CHARGES (₹)</label>
                <input
                  type="number"
                  value={invoiceForm.freight}
                  onChange={e => setInvoiceForm({ ...invoiceForm, freight: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono font-semibold text-right focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 mb-1">CRANE CHARGES (₹)</label>
                <input
                  type="number"
                  value={invoiceForm.craneCharges}
                  onChange={e => setInvoiceForm({ ...invoiceForm, craneCharges: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono font-semibold text-right focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 mb-1">LOADING / UNLOADING (₹)</label>
                <input
                  type="number"
                  value={invoiceForm.loadingUnloading}
                  onChange={e => setInvoiceForm({ ...invoiceForm, loadingUnloading: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono font-semibold text-right focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 mb-1">OTHER CHARGES (₹)</label>
                <input
                  type="number"
                  value={invoiceForm.otherCharges}
                  onChange={e => setInvoiceForm({ ...invoiceForm, otherCharges: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono font-semibold text-right focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="Labour, Misc etc."
                />
              </div>
            </div>

            {/* Total calculations */}
            <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-lg space-y-2 text-xs font-semibold text-slate-700">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Lots:</span>
                <span className="text-gray-900 font-bold">{formLotsCount} Lots</span>
              </div>
              {formHasReels && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Reels:</span>
                    <span className="text-gray-900 font-bold">{formReelsCount} Reels</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Reel Weight:</span>
                    <span className="text-gray-900 font-bold">{formReelsWeight.toLocaleString('en-IN')} KG</span>
                  </div>
                </>
              )}
              {formHasSheets && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Reams:</span>
                    <span className="text-gray-900 font-bold">{formReamsCount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Reams</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Sheets:</span>
                    <span className="text-gray-900 font-bold">{formSheetsCount.toLocaleString('en-IN')} Sheets</span>
                  </div>
                </>
              )}
              {!formHasReels && !formHasSheets && (
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Qty:</span>
                  <span className="text-gray-900 font-bold">{formTotalWeight.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-slate-200/80 pt-1.5">
                <span>Material Total:</span>
                <span className="font-mono text-gray-900 font-bold">₹{formMatTotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Other Charges Total:</span>
                <span className="font-mono text-gray-900 font-bold">₹{formOtherCharges.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-200/80 pt-1.5 font-bold text-xs text-gray-950">
                <span>Grand Total:</span>
                <span className="font-mono text-blue-600 text-sm font-black">₹{(formMatTotal + formOtherCharges).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          </div>

          {/* Sticky Non-Scrolling Pinned Footer (Always Visible) */}
          <div className="px-5 py-3 bg-white/95 backdrop-blur-sm border-t border-slate-200/90 flex items-center justify-between shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] z-20">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Grand Total:</span>
              <span className="font-mono text-blue-600 text-sm font-black">
                ₹{(formMatTotal + formOtherCharges).toLocaleString('en-IN')}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                ({formLotsCount} {formLotsCount === 1 ? 'Lot' : 'Lots'})
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setActiveSubPage('list')}
                className="px-3.5 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addLoading}
                className="px-5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-md shadow-blue-500/20 active:scale-[0.98] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {addLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Batch...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>{isEditing ? 'Update Purchase Batch' : 'Save Purchase Batch'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── SUB-PAGE 2: BATCH DETAILS DIALOG BOX POPUP ────────────────────────── */}
      {activeSubPage === 'details' && selectedInvoice && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] transition-all duration-200 animate-fadeIn">
          {/* Backdrop Blur Overlay covering 100% of the viewport edge-to-edge */}
          <div 
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity cursor-pointer"
            onClick={() => setActiveSubPage('list')}
          />

          {/* Modal Container */}
          <div className="fixed inset-0 overflow-y-auto flex items-center justify-center p-3 sm:p-5 pointer-events-none">
            <div className="relative bg-white rounded-2xl shadow-2xl shadow-slate-950/20 border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-modalPop font-sans text-xs pointer-events-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600 animate-pulse-slow" />
                  Purchase Batch Details
                </h2>
                <p className="text-[10px] text-gray-500 mt-0.5 font-medium">
                  Registered on {selectedInvoice.createdAt ? new Date(selectedInvoice.createdAt).toLocaleString('en-IN') : '—'} by Admin
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEditInvoice(selectedInvoice)}
                  className="px-3 py-1.5 border border-gray-200 text-gray-700 hover:bg-gray-100 bg-white rounded-lg text-xs font-bold shadow-3xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5 text-amber-500" /> Edit Batch
                </button>
                <button
                  onClick={() => setActiveSubPage('list')}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

          {/* Details Content Scroll Area */}
          {(() => {
            let totalReelsCount = 0;
            let totalReamsCount = 0;
            let totalKgWeight = 0;

            selectedInvoice.items?.forEach(item => {
              const resolvedSku = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any) : null;
              const fullSku = skus.find(s => s._id === (resolvedSku?._id || item.skuId)) || resolvedSku;
              if (resolvedSku?.paperType === 'Sheets' || fullSku?.paperType === 'Sheets') {
                const stdSheets = resolvedSku?.pages || fullSku?.pages || 500;
                const reamWeight = item.reamWeight || resolvedSku?.reamWeight || fullSku?.reamWeight || getFallbackReamWeight(fullSku || resolvedSku) || 0;
                const itemReams = (item.quantity || 0) / stdSheets;
                totalReamsCount += itemReams;
                totalKgWeight += itemReams * reamWeight;
              } else if (item.reels && item.reels.length > 0) {
                totalReelsCount += item.reels.length;
                const reelsWt = item.reels.reduce((s, r) => s + (Number(r.weight) || 0), 0);
                totalKgWeight += reelsWt > 0 ? reelsWt : (item.quantity || 0);
              } else {
                totalKgWeight += item.quantity || 0;
              }
            });

            // Weight-based freight & extra inward expenses per KG
            const totalFreightCharges = (Number(selectedInvoice.freight) || 0) + (Number(selectedInvoice.craneCharges) || 0) + (Number(selectedInvoice.otherCharges) || 0);
            const extraInwardPerKg = (totalFreightCharges > 0 && totalKgWeight > 0) ? (totalFreightCharges / totalKgWeight) : 0;

            return (
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-white">
                {/* Header batch summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 shrink-0">
                  {/* Card 1: Batch Number */}
                  <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-blue-600 font-bold uppercase tracking-wider leading-tight">Batch Number</span>
                    <span className="block text-xs text-blue-900 font-extrabold mt-1 truncate px-1" title={selectedInvoice.invoiceNumber}>
                      {selectedInvoice.invoiceNumber}
                    </span>
                  </div>

                  {/* Card 2: Supplier / Vendor */}
                  <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-indigo-650 font-bold uppercase tracking-wider leading-tight">Supplier</span>
                    <span className="block text-xs text-indigo-900 font-extrabold mt-1 truncate px-1" title={typeof selectedInvoice.vendorId === 'object' && selectedInvoice.vendorId !== null ? (selectedInvoice.vendorId.firmName || selectedInvoice.vendorId.ownerName) : 'Supplier'}>
                      {typeof selectedInvoice.vendorId === 'object' && selectedInvoice.vendorId !== null ? (selectedInvoice.vendorId.firmName || selectedInvoice.vendorId.ownerName) : 'Supplier'}
                    </span>
                  </div>

                  {/* Card 3: Purchase Date */}
                  <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-blue-650 font-bold uppercase tracking-wider leading-tight">Date</span>
                    <span className="block text-xs text-blue-900 font-extrabold mt-1 truncate px-1">
                      {selectedInvoice.createdAt ? new Date(selectedInvoice.createdAt).toLocaleDateString('en-IN') : '—'}
                    </span>
                  </div>

                  {/* Card 4: Total Lots */}
                  <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-emerald-700 font-bold uppercase tracking-wider leading-tight">Lots</span>
                    <span className="block text-base text-emerald-900 font-extrabold mt-0.5">
                      {selectedInvoice.items?.length || 0}
                    </span>
                  </div>

                  {/* Card 5: Total Reels */}
                  <div className="bg-amber-50/40 border border-amber-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-amber-700 font-bold uppercase tracking-wider leading-tight">Reels</span>
                    <span className="block text-base text-amber-900 font-extrabold mt-0.5">
                      {totalReelsCount || '0'}
                    </span>
                  </div>

                  {/* Card 6: Total Reams */}
                  <div className="bg-teal-50/40 border border-teal-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-teal-700 font-bold uppercase tracking-wider leading-tight">Reams</span>
                    <span className="block text-base text-teal-900 font-extrabold mt-0.5">
                      {totalReamsCount > 0 ? totalReamsCount.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '0'}
                    </span>
                  </div>

                  {/* Card 7: Total Weight (KG) */}
                  <div className="bg-red-50/40 border border-red-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-red-650 font-bold uppercase tracking-wider leading-tight">Total KG</span>
                    <span className="block text-base text-red-900 font-extrabold mt-0.5">
                      {totalKgWeight.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Details Tabs and panels */}
                <div className="space-y-4">
                  <div className="flex gap-2 border-b border-gray-200 pb-px">
                <button
                  onClick={() => setDetailsTab('lots')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                    detailsTab === 'lots' 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" /> Material Lots
                </button>
                <button
                  onClick={() => setDetailsTab('allocation')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                    detailsTab === 'allocation' 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <MapPinIcon className="w-3.5 h-3.5" /> Location Allocation
                </button>
                <button
                  onClick={() => setDetailsTab('history')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                    detailsTab === 'history' 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <HelpCircle className="w-3.5 h-3.5" /> History
                </button>
              </div>

              {/* LOTS TAB */}
              {detailsTab === 'lots' && (
                <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4 shadow-3xs">
                  <div className="overflow-x-auto border border-gray-100 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 uppercase font-black border-b border-gray-200 text-[10px] tracking-wider">
                          <th className="px-3 py-2.5">#</th>
                          <th className="px-3 py-2.5">Item</th>
                          <th className="px-3 py-2.5 text-center">GSM</th>
                          <th className="px-3 py-2.5 text-center">Width</th>
                          <th className="px-3 py-2.5 text-center">Reels</th>
                          <th className="px-3 py-2.5 text-right">Total KG</th>
                          <th className="px-3 py-2.5 text-right">Rate/KG (₹)</th>
                          <th className="px-3 py-2.5 text-right">Mat Amount (₹)</th>
                          <th className="px-3 py-2.5 text-right">Landed Rate/KG (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                        {selectedInvoice.items?.map((item, idx) => {
                          const skuIdVal = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any)._id : item.skuId;
                          const resolvedSku = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any) : null;
                          const fullSku = skus.find(s => s._id === (resolvedSku?._id || skuIdVal)) || resolvedSku;
                          const skuName = resolvedSku?.name || fullSku?.name || 'Raw Material';

                          // Brand resolution
                          const brand = item.brand || resolvedSku?.brand || fullSku?.brand || '';

                          // GSM resolution with robust regex fallback from name
                          let gsmVal: string | number = item.gsm || resolvedSku?.gsm || fullSku?.gsm || (item.reels && item.reels[0]?.gsm) || '';
                          if (!gsmVal && skuName) {
                            const gsmMatch = skuName.match(/(\d+)\s*GSM/i);
                            if (gsmMatch) gsmVal = gsmMatch[1];
                          }

                          // Width resolution with robust regex fallback from name
                          let widthVal: string | number = item.width || resolvedSku?.width || fullSku?.width || (item.reels && item.reels[0]?.width) || '';
                          if (!widthVal && skuName) {
                            const widthMatch = skuName.match(/(\d+(?:\.\d+)?)\s*(?:CM|cm|"|in|x|\*)/i);
                            if (widthMatch) widthVal = widthMatch[1];
                          }

                          // Quantity KG resolution
                          let displayQtyKg = item.quantity || 0;
                          const isSheets = (resolvedSku?.paperType === 'Sheets') || (fullSku?.paperType === 'Sheets');
                          if (isSheets) {
                            const stdSheets = resolvedSku?.pages || fullSku?.pages || 500;
                            const reamWeight = item.reamWeight || resolvedSku?.reamWeight || fullSku?.reamWeight || getFallbackReamWeight(fullSku || resolvedSku) || 0;
                            if (reamWeight > 0) {
                              const reams = (item.quantity || 0) / stdSheets;
                              displayQtyKg = reams * reamWeight;
                            }
                          } else if (item.reels && item.reels.length > 0) {
                            const reelsTotalWt = item.reels.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
                            if (reelsTotalWt > 0) displayQtyKg = reelsTotalWt;
                          }

                          // Base Rate / KG
                          const baseRatePerKg = item.ratePerKg || (displayQtyKg > 0 ? (item.totalPrice || 0) / displayQtyKg : (item.purchasePrice || 0));

                          // Landed Rate / KG = Base Purchase Rate + Inward Freight/Crane Expenses per KG
                          const landedRatePerKg = baseRatePerKg + extraInwardPerKg;

                          const reelsCount = item.reels?.length || (!isSheets ? 1 : 0);

                          return (
                            <tr key={idx} className="hover:bg-gray-50/50">
                              <td className="px-3 py-2.5 text-gray-450 font-bold">{idx + 1}</td>
                              <td className="px-3 py-2.5 font-bold text-gray-900">
                                <div>{skuName}</div>
                                {brand && brand !== '—' && (
                                  <div className="text-[10px] text-gray-400 font-normal">{brand}</div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold text-gray-700">{gsmVal || '—'}</td>
                              <td className="px-3 py-2.5 text-center font-bold text-gray-700">
                                {widthVal ? `${widthVal} cm` : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold text-gray-800">
                                {reelsCount > 0 ? reelsCount : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-right font-black text-gray-955">
                                {displayQtyKg.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold text-gray-800 font-mono">
                                ₹{baseRatePerKg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2.5 text-right font-black text-gray-955">
                                ₹{(item.totalPrice || 0).toLocaleString('en-IN')}
                              </td>
                              <td className="px-3 py-2.5 text-right font-black text-blue-700 font-mono">
                                ₹{landedRatePerKg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ALLOCATION TAB */}
              {detailsTab === 'allocation' && (
                <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4 shadow-3xs">
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="font-bold text-gray-800 uppercase tracking-wider text-[10px]">Reels Location Mapping</span>
                    <span className="text-[10px] text-gray-400 font-bold">Total {selectedInvoice.items?.reduce((sum, item) => sum + (item.reels?.length || 0), 0) || 0} Reels</span>
                  </div>
                  
                  <div className="space-y-4">
                    {selectedInvoice.items?.map((item, idx) => {
                      const skuName = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any).name : 'Raw Material';
                      const lotNo = item.lotNumber || `${selectedInvoice.invoiceNumber}-L0${idx + 1}`;
                      return (
                        <div key={idx} className="border border-gray-150 rounded-xl p-3 bg-gray-50/20 space-y-2">
                          <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="text-gray-800 font-black">{skuName}</span>
                            <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-mono">Lot: {lotNo}</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            {item.reels?.map((reel, rIdx) => {
                              const balance = inventoryBalances.find(
                                b => b.batchNumber === selectedInvoice.invoiceNumber && 
                                     b.reels?.some((r: any) => r.reelNumber === reel.reelNumber)
                              );
                              const locationName = balance && balance.location
                                ? balance.location.name 
                                : 'Not Allocated';
                              const rWidth = reel.width || item.width || (typeof item.skuId === 'object' ? (item.skuId as any)?.width : '') || (skuName.match(/(\d+(?:\.\d+)?)\s*(?:CM|cm)/i)?.[1]) || '';
                              return (
                                <div key={rIdx} className="bg-white p-2 border border-gray-100 rounded-lg flex items-center justify-between text-[11px]">
                                  <div className="min-w-0">
                                    <p className="font-bold text-gray-800 truncate">Reel #{reel.reelNumber}</p>
                                    <p className="text-[10px] text-gray-400 font-mono">{reel.weight || 0} KG{rWidth ? ` • ${rWidth} cm` : ''}</p>
                                  </div>
                                  <div className="text-right">
                                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                      locationName === 'Not Allocated' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                                    }`}>
                                      {locationName}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="pt-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setAllocateForm(prev => ({
                                  ...prev,
                                  itemIndex: idx,
                                  lotNumber: lotNo
                                }));
                                setShowAllocateModal(true);
                              }}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold shadow-3xs flex items-center gap-1 transition-all"
                            >
                              <ArrowRight className="w-3 h-3" /> Allocate Reels Location
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* HISTORY TAB */}
              {detailsTab === 'history' && (
                <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4 shadow-3xs">
                  <div className="space-y-4">
                    <div className="border-l-2 border-blue-500 pl-3 py-1 space-y-1 text-xs">
                      <div className="flex justify-between font-bold text-gray-800">
                        <span>Invoice Registered</span>
                        <span className="text-[10px] text-gray-400 font-normal">
                          {selectedInvoice.createdAt ? new Date(selectedInvoice.createdAt).toLocaleString('en-IN') : '—'}
                        </span>
                      </div>
                      <p className="text-gray-500 font-medium">Batch recorded successfully in supplier inward ledger.</p>
                      <p className="text-[10px] text-gray-400 font-medium">Performed By: System Admin</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Payment / Tax details card */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3.5 shadow-3xs">
              <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">Financial Breakdown</h3>
              <div className="space-y-2 text-xs font-semibold text-gray-600">
                <div className="flex justify-between">
                  <span>Material Amount (Subtotal):</span>
                  <span className="text-gray-900 font-bold">₹{(selectedInvoice.subTotal || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax Amount:</span>
                  <span className="text-gray-900 font-bold">₹{(selectedInvoice.taxAmount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between border-t border-b py-2 text-green-700 font-black text-xs bg-green-50/50 px-2 rounded-lg my-1">
                  <span>Total Due to Supplier:</span>
                  <span className="font-mono text-sm">₹{((selectedInvoice.subTotal || 0) + (selectedInvoice.taxAmount || 0)).toLocaleString('en-IN')}</span>
                </div>
                <div className="pt-1.5 space-y-1.5 text-[11px] text-gray-500">
                  <span className="block font-bold text-[10px] text-gray-400 uppercase tracking-wider">Internal Costs (Paid by Us):</span>
                  <div className="flex justify-between pl-2">
                    <span>Freight Charges:</span>
                    <span className="text-gray-800 font-semibold">₹{(selectedInvoice.freight || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between pl-2">
                    <span>Crane Charges:</span>
                    <span className="text-gray-800 font-semibold">₹{(selectedInvoice.craneCharges || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between pl-2">
                    <span>Other / Loading Charges:</span>
                    <span className="text-gray-800 font-semibold">₹{(selectedInvoice.otherCharges || 0).toLocaleString('en-IN')}</span>
                  </div>
                  {extraInwardPerKg > 0 && (
                    <div className="flex justify-between pl-2 text-blue-700 font-bold border-t border-dashed pt-1 mt-1">
                      <span>Inward Additional Expenses / KG:</span>
                      <span className="font-mono">+₹{extraInwardPerKg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/KG</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between border-t pt-2 text-gray-955 font-black">
                  <span>Total Landed Invoice Cost:</span>
                  <span className="text-blue-600 font-black">₹{(selectedInvoice.grandTotal || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>
          );
        })()}

            {/* Footer actions wrapper */}
            <div className="px-6 py-3.5 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
              {selectedInvoice.status !== 'Cancelled' ? (
                <button
                  onClick={() => handleCancelInvoice(selectedInvoice)}
                  className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 bg-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-3xs"
                >
                  <Ban className="w-3.5 h-3.5" /> Cancel Batch
                </button>
              ) : (
                <span className="px-3 py-1.5 bg-red-100/70 text-red-800 border border-red-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Ban className="w-3.5 h-3.5" /> Batch Cancelled
                </span>
              )}
              <button
                onClick={() => setActiveSubPage('list')}
                className="px-5 py-2 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 text-gray-700 font-bold text-xs shadow-3xs cursor-pointer"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}

      {/* ── MULTI-LOCATION STORAGE ALLOCATION SPLIT MODAL ───────────────────────────── */}
      {splittingItemIdx !== null && (() => {
        const item = invoiceForm.items[splittingItemIdx];
        const selectedSku = skus.find(s => s._id === item.skuId);
        const unitLabel = selectedSku?.unit || 'KG';
        const isSheets = selectedSku?.paperType === 'Sheets';
        const stdSheets = selectedSku?.pages || 500;
        
        // Sum of current temp splits
        const totalTempQty = tempSplits.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
        const physicalLocations = locations.filter(loc => loc.level === 'Storage Location');

        return (
          <Modal
            isOpen={splittingItemIdx !== null}
            onClose={() => setSplittingItemIdx(null)}
            title="Split Location Allocation"
          >
            <div className="space-y-4 text-xs text-gray-900 text-left">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-1">
                <div className="font-bold text-sm text-gray-900">{selectedSku?.name || 'Raw Material'}</div>
                <div className="text-gray-500 font-semibold">GSM: {selectedSku?.gsm || '—'} | Format: {selectedSku?.paperType || '—'}</div>
              </div>

              <div className="space-y-3 bg-blue-50/10 border border-blue-100 rounded-xl p-4">
                <div className="text-[10px] font-black text-blue-800 uppercase tracking-wider">Add Godown Allocation Line</div>
                
                <div>
                  <label className="block text-[9px] font-bold text-gray-500 mb-1 uppercase tracking-wider">Storage Location *</label>
                  <LocationSelectPopup
                    locations={locations}
                    locationId={splitDraftLocId}
                    onChange={(_w, _f, _z, locId) => setSplitDraftLocId(locId)}
                    variant="compact"
                    hideLabel
                  />
                </div>

                {isSheets ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 mb-1 uppercase tracking-wider">Reams</label>
                      <input
                        type="number"
                        placeholder="e.g. 10"
                        id="split_reams_input"
                        onChange={e => {
                          const reams = Number(e.target.value) || 0;
                          const sheets = reams * stdSheets;
                          const sheetsInput = document.getElementById("split_sheets_input") as HTMLInputElement;
                          if (sheetsInput) sheetsInput.value = reams > 0 ? String(sheets) : '';
                        }}
                        className="w-full px-2.5 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 mb-1 uppercase tracking-wider">Sheets *</label>
                      <input
                        type="number"
                        placeholder="Total sheets quantity"
                        id="split_sheets_input"
                        className="w-full px-2.5 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Quantity ({unitLabel}) *</label>
                    <input
                      type="number"
                      placeholder="Enter quantity"
                      id="split_qty_input"
                      className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!splitDraftLocId) {
                        showToast("Please select a storage location first.", "error");
                        return;
                      }
                      
                      let qty = 0;
                      if (isSheets) {
                        const sheetsInput = document.getElementById("split_sheets_input") as HTMLInputElement;
                        qty = Number(sheetsInput?.value) || 0;
                      } else {
                        const qtyInput = document.getElementById("split_qty_input") as HTMLInputElement;
                        qty = Number(qtyInput?.value) || 0;
                      }

                      if (qty <= 0) {
                        showToast("Please enter a valid quantity.", "error");
                        return;
                      }

                      setTempSplits([...tempSplits, { locationId: splitDraftLocId, quantity: String(qty) }]);

                      // Reset fields
                      setSplitDraftLocId('');
                      const reamsInput = document.getElementById("split_reams_input") as HTMLInputElement;
                      if (reamsInput) reamsInput.value = '';
                      const sheetsInput = document.getElementById("split_sheets_input") as HTMLInputElement;
                      if (sheetsInput) sheetsInput.value = '';
                      const qtyInput = document.getElementById("split_qty_input") as HTMLInputElement;
                      if (qtyInput) qtyInput.value = '';
                    }}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-extrabold transition-all cursor-pointer"
                  >
                    + Add Allocation
                  </button>
                </div>
              </div>

              {/* Allocations Table */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Allocated Locations</label>
                {tempSplits.length === 0 ? (
                  <div className="text-center py-4 bg-gray-50 rounded-xl border border-gray-150 text-gray-400 font-semibold italic">
                    No allocations added yet.
                  </div>
                ) : (
                  <div className="bg-white border border-gray-250 rounded-xl overflow-hidden shadow-3xs max-h-48 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-250">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-1.5 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wider font-sans">Godown/Location</th>
                          <th className="px-3 py-1.5 text-right text-[9px] font-bold text-gray-400 uppercase tracking-wider font-sans">Quantity</th>
                          <th className="px-3 py-1.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wider font-sans w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-150 bg-white">
                        {tempSplits.map((split, index) => {
                          const paths = resolveLocationPath(split.locationId || '');
                          const hierarchy = [paths.factory, paths.floor, paths.zone].filter(p => p && p !== '—').join(' > ');
                          const locName = locations.find(l => l._id === split.locationId)?.name || 'Unknown Location';
                          const displayLoc = hierarchy ? `${hierarchy} > ${locName}` : locName;
                          const qtyVal = Number(split.quantity) || 0;
                          return (
                            <tr key={index}>
                              <td className="px-3 py-2 font-bold text-gray-900">{displayLoc}</td>
                              <td className="px-3 py-2 text-right font-black text-gray-800">
                                {isSheets 
                                  ? `${qtyVal.toLocaleString()} Sheets (${qtyVal / stdSheets} Reams)`
                                  : `${qtyVal.toLocaleString()} ${unitLabel}`}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => setTempSplits(tempSplits.filter((_, i) => i !== index))}
                                  className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Total Calculation Row */}
              <div className="flex justify-between items-center bg-gray-50 border border-gray-200 rounded-xl p-3">
                <span className="font-bold text-gray-550 uppercase font-sans">Total Allocated Quantity:</span>
                <span className="font-black text-sm text-blue-600">
                  {isSheets 
                    ? `${totalTempQty.toLocaleString()} Sheets (${totalTempQty / stdSheets} Reams)`
                    : `${totalTempQty.toLocaleString()} ${unitLabel}`}
                </span>
              </div>

              {/* Footer Buttons */}
              <div className="sticky bottom-0 bg-white pt-3 pb-0.5 border-t border-gray-150 flex justify-end gap-3 z-10 mt-2">
                <button
                  type="button"
                  onClick={() => setSplittingItemIdx(null)}
                  className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 font-semibold text-xs text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={tempSplits.length === 0}
                  onClick={() => {
                    const updated = [...invoiceForm.items];
                    updated[splittingItemIdx] = {
                      ...item,
                      quantity: String(totalTempQty),
                      splits: tempSplits
                    };
                    setInvoiceForm({ ...invoiceForm, items: updated });
                    setSplittingItemIdx(null);
                  }}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-all disabled:opacity-50 text-xs"
                >
                  Confirm Allocations
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ── LOCATION ALLOCATION MODAL DIALOG ──────────────────────────────────── */}
      {showAllocateModal && selectedInvoice && (() => {
        const lotItem = selectedInvoice.items[allocateForm.itemIndex];
        const defaultLocationId = lotItem 
          ? (typeof lotItem.locationId === 'object' && lotItem.locationId !== null 
             ? (lotItem.locationId as any)._id 
             : lotItem.locationId)
          : '';

        const selectedSkuId = lotItem ? (typeof lotItem.skuId === 'object' && lotItem.skuId !== null ? (lotItem.skuId as any)._id : lotItem.skuId) : '';
        const selectedSku = skus.find(s => s._id === selectedSkuId) || (lotItem && typeof lotItem.skuId === 'object' ? (lotItem.skuId as any) : null);
        const stdSheetsPerReam = selectedSku?.pages || 500;
        
        // Find remaining unallocated quantity at default location
        const unallocatedBal = inventoryBalances.find(
          b => (b.location?._id || b.locationId) === defaultLocationId && 
               b.batchNumber === selectedInvoice.invoiceNumber && 
               (b.sku?._id || b.skuId) === selectedSkuId
        );
        const maxAllocatable = unallocatedBal ? unallocatedBal.onHand : 0;

        const physicalLocations = locations.filter(loc => loc.level === 'Storage Location' && loc._id !== defaultLocationId);
        const hasReels = unallocatedBal && unallocatedBal.reels && unallocatedBal.reels.length > 0;

        const handleReelToggle = (reel: any) => {
          let newSelected = [...selectedReelsForAllocation];
          if (newSelected.some(r => r.reelNumber === reel.reelNumber)) {
            newSelected = newSelected.filter(r => r.reelNumber !== reel.reelNumber);
          } else {
            newSelected.push(reel);
          }
          setSelectedReelsForAllocation(newSelected);
          const sumWeight = newSelected.reduce((sum, r) => sum + r.weight, 0);
          setAllocateForm(prev => ({ ...prev, quantity: sumWeight > 0 ? String(sumWeight) : '' }));
        };

        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/15" onClick={() => !allocateSubmitting && setShowAllocateModal(false)} />

            <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-lg w-full relative z-10 animate-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[85vh]">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <MapPinIcon className="w-4 h-4 text-blue-600 animate-pulse" />
                  Allocate Location & Reels
                </h2>
                <button
                  disabled={allocateSubmitting}
                  onClick={() => setShowAllocateModal(false)}
                  className="p-1.5 hover:bg-gray-150 rounded-lg transition-colors text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAllocateSubmit} className="flex flex-col flex-1 overflow-hidden">
                <div className="p-6 space-y-4 text-left text-xs overflow-y-auto flex-1">
                {allocateError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-700 flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 shrink-0" />
                    <span>{allocateError}</span>
                  </div>
                )}

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold uppercase">Batch Number:</span>
                    <span className="font-bold text-blue-600 font-mono">{selectedInvoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold uppercase">Available Unallocated:</span>
                    <span className="font-black text-gray-900">
                      {selectedSku?.paperType === 'Sheets' 
                        ? `${maxAllocatable.toLocaleString('en-IN')} Sheets (${(maxAllocatable / stdSheetsPerReam).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Reams)` 
                        : `${maxAllocatable.toLocaleString('en-IN')} ${selectedSku?.unit || 'KG'}`}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Select Material Lot *</label>
                    <select
                      value={allocateForm.itemIndex}
                      onChange={e => {
                        setAllocateForm({ ...allocateForm, itemIndex: Number(e.target.value), quantity: '' });
                        setSelectedReelsForAllocation([]);
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                      required
                      disabled={allocateSubmitting}
                    >
                      {selectedInvoice.items?.map((item, idx) => {
                        const name = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any).name : 'Raw Material';
                        const lotNo = item.lotNumber || `${selectedInvoice.invoiceNumber}-L0${idx + 1}`;
                        return (
                          <option key={idx} value={idx}>
                            {name} ({lotNo})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Add Allocation Line Form */}
                  <div className="bg-blue-50/20 border border-blue-100 rounded-xl p-3.5 space-y-3">
                    <div className="text-[10px] font-black text-blue-800 uppercase tracking-wider">
                      Add Location Allocation Line
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 mb-1 uppercase tracking-wider">Destination Storage Location (Warehouse/Floor/Zone/Bin) *</label>
                      <LocationSelectPopup
                        locations={locations}
                        locationId={allocateForm.toLocationId}
                        onChange={(_w, _f, _z, locId) => setAllocateForm(prev => ({ ...prev, toLocationId: locId }))}
                        variant="compact"
                        hideLabel
                        disabled={allocateSubmitting}
                      />
                    </div>

                    {hasReels && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                            Select Reels to Allocate ({selectedReelsForAllocation.length} of {unallocatedBal.reels.length} selected)
                          </label>
                          {unallocatedBal.reels.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const allSelected = selectedReelsForAllocation.length === unallocatedBal.reels.length;
                                if (allSelected) {
                                  setSelectedReelsForAllocation([]);
                                  setAllocateForm(prev => ({ ...prev, quantity: '' }));
                                } else {
                                  setSelectedReelsForAllocation([...unallocatedBal.reels]);
                                  const totalWeight = unallocatedBal.reels.reduce((sum: number, r: any) => sum + (r.weight || 0), 0);
                                  setAllocateForm(prev => ({ ...prev, quantity: String(totalWeight) }));
                                }
                              }}
                              className="text-blue-600 hover:text-blue-700 text-[9px] font-bold transition-colors"
                            >
                              {selectedReelsForAllocation.length === unallocatedBal.reels.length ? 'Deselect All' : 'Select All'}
                            </button>
                          )}
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 max-h-36 overflow-y-auto space-y-1">
                          {unallocatedBal.reels.map((r: any) => {
                            const isChecked = selectedReelsForAllocation.some(sr => sr.reelNumber === r.reelNumber);
                            return (
                              <label key={r.reelNumber} className="flex items-center justify-between p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all cursor-pointer font-semibold text-gray-700">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleReelToggle(r)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3 h-3"
                                  />
                                  <span className="text-[11px] text-gray-900">{r.reelNumber}</span>
                                </div>
                                <span className="text-[11px] text-blue-600 bg-blue-50/50 px-1.5 py-0.5 rounded font-black">
                                  {r.weight} KG
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {selectedSku?.paperType === 'Sheets' ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[9px] font-bold text-gray-500 mb-1 uppercase tracking-wider">Reams to Allocate</label>
                          <input
                            type="number"
                            placeholder="e.g. 10"
                            id="modal_reams_input"
                            onChange={e => {
                              const reams = Number(e.target.value) || 0;
                              const sheets = reams * stdSheetsPerReam;
                              setAllocateForm({ ...allocateForm, quantity: reams > 0 ? String(sheets) : '' });
                            }}
                            className="w-full px-2.5 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-gray-500 mb-1 uppercase tracking-wider">Sheets to Allocate *</label>
                          <input
                            type="number"
                            placeholder="Total sheets quantity"
                            value={allocateForm.quantity}
                            onChange={e => setAllocateForm({ ...allocateForm, quantity: e.target.value })}
                            className="w-full px-2.5 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500"
                            required={allocationsList.length === 0}
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                          Quantity to Allocate ({selectedSku?.unit || 'KG'}) *
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            min="0.001"
                            max={maxAllocatable}
                            placeholder={hasReels ? "Auto-calculated from selected reels" : `Max ${maxAllocatable.toLocaleString()} ${selectedSku?.unit || 'KG'}`}
                            value={allocateForm.quantity}
                            onChange={e => setAllocateForm({ ...allocateForm, quantity: e.target.value })}
                            className="w-full pl-3 pr-12 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-900 bg-white"
                            required={allocationsList.length === 0}
                            disabled={allocateSubmitting || maxAllocatable <= 0 || hasReels}
                          />
                          <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[10px] font-black text-gray-400 uppercase">
                            {selectedSku?.unit || 'KG'}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (!allocateForm.toLocationId) {
                            alert("Please select a destination storage location first.");
                            return;
                          }
                          const qty = Number(allocateForm.quantity);
                          if (isNaN(qty) || qty <= 0) {
                            alert("Please enter a valid quantity to allocate.");
                            return;
                          }
                          // Validate max unallocated remaining
                          const alreadyAllocated = allocationsList.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
                          if (alreadyAllocated + qty > maxAllocatable) {
                            alert(`Cannot allocate more than available unallocated stock (${maxAllocatable.toLocaleString()}).`);
                            return;
                          }

                          setAllocationsList([
                            ...allocationsList,
                            {
                              toLocationId: allocateForm.toLocationId,
                              quantity: allocateForm.quantity,
                              reels: [...selectedReelsForAllocation]
                            }
                          ]);

                          // Reset temporary inputs
                          setAllocateForm(prev => ({ ...prev, toLocationId: '', quantity: '' }));
                          setSelectedReelsForAllocation([]);
                          const reamsInput = document.getElementById("modal_reams_input") as HTMLInputElement;
                          if (reamsInput) reamsInput.value = '';
                        }}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-extrabold transition-all"
                      >
                        + Add Allocation Row
                      </button>
                    </div>
                  </div>

                  {/* Render Allocations List */}
                  {allocationsList.length > 0 && (
                    <div className="space-y-2 border-t pt-3">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        Allocations to Create ({allocationsList.length})
                      </label>
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 max-h-36 overflow-y-auto space-y-1.5">
                        {allocationsList.map((row, index) => {
                          const locName = locations.find(l => l._id === row.toLocationId)?.name || 'Unknown Location';
                          const qtyVal = Number(row.quantity) || 0;
                          return (
                            <div key={index} className="flex justify-between items-center bg-white px-3 py-2 rounded-lg border border-gray-150 text-xs">
                              <div>
                                <span className="font-bold text-gray-900">{locName}</span>
                                <div className="text-[10px] text-gray-400">
                                  {selectedSku?.paperType === 'Sheets' 
                                    ? `${qtyVal.toLocaleString()} Sheets (${(qtyVal / stdSheetsPerReam).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Reams)`
                                    : `${qtyVal.toLocaleString()} ${selectedSku?.unit || 'KG'}`}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setAllocationsList(allocationsList.filter((_, i) => i !== index));
                                }}
                                className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-150 flex justify-end gap-3 flex-shrink-0">
                  <button
                    type="button"
                    disabled={allocateSubmitting}
                    onClick={() => setShowAllocateModal(false)}
                    className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 bg-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={allocateSubmitting || (allocationsList.length === 0 && (maxAllocatable <= 0 || !allocateForm.toLocationId || !allocateForm.quantity))}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {allocateSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Allocating...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-3.5 h-3.5" /> Allocate Stock
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
      {/* ── TOOLS SUB-MODALS & SLIDE-OVERS ────────────────────────────────────── */}
      {/* Activity Log Drawer */}
      {showActivityLog && (
        <div className="fixed inset-0 z-[60] overflow-hidden !mt-0">
          <div className="absolute inset-0 overflow-hidden bg-black/10 transition-opacity" onClick={() => setShowActivityLog(false)}></div>
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="pointer-events-auto w-screen max-w-md">
              <div className="flex h-full flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-250">
                <div className="bg-gray-50 px-4 py-5 border-b flex justify-between items-center">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Purchase Activity Log</h2>
                    <p className="text-[10px] text-gray-500 mt-0.5 font-medium">Audit logs for purchase batch bookings, payments, and cancellations</p>
                  </div>
                  <button onClick={() => setShowActivityLog(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {activityLogLoading ? (
                    <div className="flex justify-center items-center h-40">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                  ) : activityLogs.length === 0 ? (
                    <p className="text-center text-xs text-gray-500 py-8">No recent activity logs recorded.</p>
                  ) : (
                    <div className="space-y-4">
                      {activityLogs.map((log, idx) => (
                        <div key={log._id || idx} className="border-l-2 border-blue-500 pl-3 py-1 space-y-1 text-xs">
                          <div className="flex justify-between font-bold text-gray-800">
                            <span className="uppercase text-[10px] font-black text-blue-600">{log.action}</span>
                            <span className="text-[10px] text-gray-400 font-normal">{new Date(log.createdAt).toLocaleString('en-IN')}</span>
                          </div>
                          <p className="text-gray-600 font-bold">Batch: {log.entityName}</p>
                          <p className="text-gray-500 text-[11px]">{log.details}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Performed By: {log.performedBy}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Find Duplicates Modal */}
      {showDuplicates && (
        <div className="fixed inset-0 z-[60] overflow-y-auto flex items-center justify-center p-4 bg-black/15 !mt-0 animate-in fade-in duration-200">
          <div className="relative bg-white rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl flex justify-between items-center">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Find Duplicates for Purchase Batches
              </h2>
              <button onClick={() => setShowDuplicates(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              {duplicateGroups.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="font-semibold text-gray-800">No duplicates detected!</p>
                  <p className="text-sm text-gray-400 mt-1">All Batch / Invoice numbers are completely unique.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-gray-500 font-medium">The following duplicate Invoice numbers were identified in the system:</p>
                  {duplicateGroups.map((group, gIdx) => (
                    <div key={gIdx} className="border border-red-100 bg-red-50/10 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded uppercase text-[10px]">
                          Duplicate Invoice: {group.value}
                        </span>
                        <span className="text-[10px] text-gray-400 font-bold">{group.items.length} duplicate entries</span>
                      </div>
                      <div className="space-y-2">
                        {group.items.map((item, iIdx) => (
                          <div key={item._id || iIdx} className="flex justify-between items-center text-[11px] text-gray-600 bg-white p-2 rounded-lg border border-gray-150">
                            <div>
                              <p className="font-bold text-gray-900">{item.invoiceNumber}</p>
                              <p className="font-mono text-gray-400 text-[10px]">Grand Total: ₹{item.grandTotal?.toLocaleString('en-IN')}</p>
                            </div>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">{item.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recycle Bin Drawer */}
      {showRecycleBin && (
        <div className="fixed inset-0 z-[60] overflow-hidden !mt-0">
          <div className="absolute inset-0 overflow-hidden bg-black/10 transition-opacity" onClick={() => setShowRecycleBin(false)}></div>
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="pointer-events-auto w-screen max-w-md">
              <div className="flex h-full flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-250">
                <div className="bg-gray-50 px-4 py-5 border-b flex justify-between items-center">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                      <Trash2 className="w-4 h-4 text-gray-500" />
                      Purchase Recycle Bin (Draft/Cancelled)
                    </h2>
                    <p className="text-[10px] text-gray-500 mt-0.5 font-medium font-sans">Draft/Cancelled batches can be restored back to Posted</p>
                  </div>
                  <button onClick={() => setShowRecycleBin(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {recycleBinLoading ? (
                    <div className="flex justify-center items-center h-40">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                  ) : recycleBinItems.length === 0 ? (
                    <div className="text-center py-12 text-gray-450">
                      <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                      <p className="font-semibold text-gray-700">Recycle Bin is Empty!</p>
                      <p className="text-xs text-gray-400 mt-1">No draft or cancelled purchase invoices found.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recycleBinItems.map((item, idx) => (
                        <div key={item._id || idx} className="flex justify-between items-center p-3 border border-gray-200 rounded-xl bg-gray-50/50 hover:bg-white transition-all text-xs">
                          <div className="space-y-1">
                            <p className="font-bold text-gray-800">{item.invoiceNumber}</p>
                            <p className="font-mono text-gray-400 text-[10px]">Grand Total: ₹{item.grandTotal?.toLocaleString('en-IN')} • {item.status}</p>
                          </div>
                          <button
                            onClick={() => handleRestoreInvoice(item)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition-colors"
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* CUSTOM CONFIRMATION DIALOG MODAL */}
      {cancelConfirmInvoice && (
        <Modal
          isOpen={!!cancelConfirmInvoice}
          onClose={() => setCancelConfirmInvoice(null)}
          maxWidth="max-w-md"
          hideCloseButton
        >
          <div className="p-2 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shadow-2xs">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Cancel Purchase Batch
              </h3>
              <span className="inline-block mt-1 text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                {cancelConfirmInvoice.invoiceNumber}
              </span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs text-slate-600 leading-relaxed font-medium">
              Are you sure you want to cancel purchase batch '{cancelConfirmInvoice.invoiceNumber}'? This will mark the batch as Cancelled and remove its stock from Stock and Stock Ledger modules.
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setCancelConfirmInvoice(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-all cursor-pointer"
              >
                No, Keep it
              </button>
              <button
                type="button"
                onClick={executeCancelInvoice}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Yes, Cancel Batch</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// Local icons
const AlertCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export default PurchaseInvoicePage;

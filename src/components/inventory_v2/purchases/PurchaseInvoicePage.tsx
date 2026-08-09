import React, { useEffect, useState, useRef } from 'react';
import { Plus, Search, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, X, FileText, Trash2, Calendar, Coins, Download, Upload, HelpCircle, Check, Eye, MoreVertical, Edit, Printer, ArrowRight, Layers, IndianRupee, Clock, AlertTriangle, CheckCircle, Settings, Trash, RefreshCcw, User, MapPin as MapPinIcon } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { getActivityLogs, createActivityLog } from '../../../api/activityLogApi';
import { getParties } from '../../../api/partyApi';
import { getSkusV2, getWarehouseHierarchyV2, recordTransferV2, SkuV2, WarehouseLocationV2, getBalancesV2, getNextInvoiceNumberV2 } from '../../../api/mfgApiV2';
import { 
  getPurchaseInvoicesV2, 
  createPurchaseInvoiceV2, 
  recordPurchasePaymentV2, 
  updatePurchaseInvoiceV2,
  deletePurchaseInvoiceV2,
  PurchaseInvoiceV2, 
  PurchaseInvoiceItemV2
} from './purchaseService';
import { showToast } from '../../ui/Toast';
import * as XLSX from 'xlsx';
import Modal from '../../ui/Modal';
import Drawer from '../../ui/Drawer';

interface InvoiceTableProps {
  invoices: PurchaseInvoiceV2[];
  loading: boolean;
  skus: SkuV2[];
  onViewDetails: (invoice: PurchaseInvoiceV2) => void;
  onEditInvoice: (invoice: PurchaseInvoiceV2) => void;
  onDeleteInvoice: (invoice: PurchaseInvoiceV2) => void;
}

const InvoiceTable: React.FC<InvoiceTableProps> = ({ 
  invoices, 
  loading, 
  skus,
  onViewDetails,
  onEditInvoice,
  onDeleteInvoice
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-100 shadow-xs">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-xs overflow-hidden">
      {invoices.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-[13px]">
            <thead>
              <tr className="bg-gray-50 text-gray-400 uppercase font-bold text-xs tracking-wider select-none">
                <th className="px-3.5 py-2 text-left">Batch No.</th>
                <th className="px-3.5 py-2 text-left">Date</th>
                <th className="px-3.5 py-2 text-left">Supplier</th>
                <th className="px-3.5 py-2 text-left">Material Lots</th>
                <th className="px-3.5 py-2 text-center">Total Reels</th>
                <th className="px-3.5 py-2 text-center">Total Reams</th>
                <th className="px-3.5 py-2 text-left">Total Qty</th>
                <th className="px-3.5 py-2 text-left">Total Value</th>
                <th className="px-3.5 py-2 text-center">Status</th>
                <th className="px-3.5 py-2 text-center w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700 font-medium bg-white">
              {invoices.map((inv) => {
                const supplierName = typeof inv.vendorId === 'object' && inv.vendorId !== null
                  ? (inv.vendorId.firmName || inv.vendorId.ownerName || 'Unknown') 
                  : 'Supplier';
                
                const lotsCount = inv.items?.length || 0;
                const lotsLabel = lotsCount === 1 ? '1 Lot' : `${lotsCount} Lots`;
                
                let totalReelsCount = 0;
                let totalReamsCount = 0;
                let totalSheetsCount = 0;
                let totalKgWeight = 0;

                inv.items?.forEach((item) => {
                  const resolvedSku = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any) : null;
                  const paperType = resolvedSku?.paperType;
                  if (paperType === 'Sheets') {
                    const stdSheets = resolvedSku?.pages || 500;
                    const reamWeight = item.reamWeight || resolvedSku?.reamWeight || getFallbackReamWeight(resolvedSku) || 0;
                    const itemReams = (item.quantity || 0) / stdSheets;
                    totalReamsCount += itemReams;
                    totalSheetsCount += item.quantity || 0;
                    totalKgWeight += itemReams * reamWeight;
                  } else {
                    totalReelsCount += item.reels?.length || 0;
                    totalKgWeight += item.quantity || 0;
                  }
                });

                const statusColor = inv.status === 'Posted' ? 'bg-green-50 text-green-700 border-green-200' :
                                    inv.status === 'Draft' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                    'bg-red-50 text-red-700 border-red-200';

                return (
                  <tr 
                    key={inv._id} 
                    className="hover:bg-gray-50 border-b border-gray-100/60 transition-colors cursor-pointer text-gray-700" 
                    onClick={() => onViewDetails(inv)}
                  >
                    <td className="px-3.5 py-2 font-bold text-blue-600 text-[13.5px]">{inv.invoiceNumber}</td>
                    <td className="px-3.5 py-2 text-gray-500 font-semibold text-[13px]">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-3.5 py-2 font-bold text-gray-905 text-[13.5px]">{supplierName}</td>
                    <td className="px-3.5 py-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                        {lotsLabel}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 font-semibold text-gray-900 text-[13px] text-center">
                      {totalReelsCount || '—'}
                    </td>
                    <td className="px-3.5 py-2 font-semibold text-gray-900 text-[13px] text-center">
                      {totalReamsCount > 0 ? totalReamsCount.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}
                    </td>
                    <td className="px-3.5 py-2 font-bold text-gray-900 text-[13px]">
                      {totalKgWeight > 0 ? `${totalKgWeight.toLocaleString('en-IN', { maximumFractionDigits: 2 })} KG` : '—'}
                    </td>
                    <td className="px-3.5 py-2 font-bold text-gray-900 text-[13.5px]">
                      ₹{(inv.subTotal || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3.5 py-2 text-center">
                      <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase border ${statusColor}`}>
                        {inv.status === 'Posted' ? 'Received' : inv.status === 'Draft' ? 'Draft' : 'Cancelled'}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onViewDetails(inv)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100/50 shadow-3xs"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteInvoice(inv)}
                          className="p-1.5 text-red-650 hover:bg-red-55 rounded-lg transition-colors border border-red-100/50 shadow-3xs"
                          title="Delete Purchase Batch"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16 text-gray-450 bg-white">
          <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-semibold">No purchase batches registered yet</p>
          <p className="text-xs text-gray-550 mt-1">Click the "+ New Purchase" button to procure materials.</p>
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
    const match = sku.name.match(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)/i);
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
  const [logSearch, setLogSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('ALL');
  const [duplicateGroups, setDuplicateGroups] = useState<{ field: string; value: string; items: PurchaseInvoiceV2[] }[]>([]);
  const [recycleBinItems, setRecycleBinItems] = useState<PurchaseInvoiceV2[]>([]);
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);
  const toolsDropdownRef = useRef<HTMLDivElement>(null);

  const [invoices, setInvoices] = useState<PurchaseInvoiceV2[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [inventoryBalances, setInventoryBalances] = useState<any[]>([]);
  
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
  const [tempSplits, setTempSplits] = useState<{ locationId: string; quantity: string }[]>([]);
  const [allocateSubmitting, setAllocateSubmitting] = useState(false);
  const [allocateError, setAllocateError] = useState('');
  const [focusedRowIdx, setFocusedRowIdx] = useState<number | null>(null);
  const [skuSearchText, setSkuSearchText] = useState<string>('');
  const [supplierSearchText, setSupplierSearchText] = useState<string>('');
  const [supplierFocused, setSupplierFocused] = useState<boolean>(false);

  // Form states: Add Invoice
  const [invoiceForm, setInvoiceForm] = useState({
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
        reels: [] as any[]
      }
    ]
  });
  
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [activeReelModalIdx, setActiveReelModalIdx] = useState<number | null>(null);

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
    } catch (err) {
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
    codeMap.forEach((items, code) => {
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
    } catch (err) {
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
    } catch (err) {
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
      const [vendorRes, skuRes, locRes] = await Promise.all([
        getParties({ company: selectedCompany?._id || '', type: 'vendor', limit: 1000 }),
        getSkusV2(selectedCompany?._id || ''),
        getWarehouseHierarchyV2(selectedCompany?._id || '')
      ]);
      const vendorList = vendorRes?.data?.parties || (Array.isArray(vendorRes?.data) ? vendorRes.data : []);
      setVendors(vendorList);
      setSkus(skuRes);
      setLocations(locRes);
    } catch (e) {
      console.error(e);
      showToast('Failed to load filters data', 'error');
    }
  };

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
        { skuId: '', brand: '', gsm: '', width: '', length: '', reelsCount: '', quantity: '', purchasePrice: '', reamWeight: '', ratePerKg: '', lotNumber: '', reels: [] as any[] }
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
    
    // Auto-populate default SKU variables if skuId changed
    if (field === 'skuId') {
      const selectedSku = skus.find(s => s._id === value);
      if (selectedSku) {
        item.brand = selectedSku.brand || '';
        item.gsm = String(selectedSku.gsm || '');
        
        let w = selectedSku.width ? String(selectedSku.width) : '';
        let l = selectedSku.length ? String(selectedSku.length) : '';
        if (!w || !l) {
          const match = selectedSku.name.match(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)/i);
          if (match) {
            if (!w) w = match[1];
            if (!l) l = match[2];
          }
        }
        item.width = w;
        item.length = l;
        item.reamWeight = (selectedSku as any).reamWeight ? String((selectedSku as any).reamWeight) : '';
        item.ratePerKg = '';
        
        // Reset Reels if not Reels format
        if (selectedSku.paperType !== 'Reels') {
          item.reelsCount = '';
          item.reels = [];
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

  // Submit Invoice Creation
  const handleInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    if (!invoiceForm.vendorId) {
      setAddError('Please select a Supplier');
      return;
    }

    const firstStorage = locations.find(loc => loc.level === 'Storage Location');
    if (!firstStorage) {
      setAddError('No storage location defined in the database. Please complete warehouse setup first.');
      return;
    }

    const finalInvoiceNumber = invoiceForm.invoiceNumber || `PB${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;

    // Format validated items
    const validatedItems = [];
    for (let i = 0; i < invoiceForm.items.length; i++) {
      const item = invoiceForm.items[i];
      if (!item.skuId || !item.quantity || !item.purchasePrice) {
        setAddError(`Please fill all required fields in row ${i + 1}`);
        return;
      }
      
      const qty = Number(item.quantity);
      const price = Number(item.purchasePrice);
      const reelsCount = Number(item.reelsCount) || 0;
      
      if (qty <= 0 || price <= 0) {
        setAddError(`Quantity and price must be positive numbers in row ${i + 1}`);
        return;
      }

      // Generate reels array and group by locationId if reels exist
      if (reelsCount > 0) {
        const reelsByLoc: Record<string, any[]> = {};
        const itemReels = item.reels || [];

        for (let r = 0; r < reelsCount; r++) {
          const reelObj = itemReels[r] || {};
          const reelWeight = Number(reelObj.weight) || 0;
          const reelWidth = Number(reelObj.width) || Number(item.width) || 0;
          const reelLocId = reelObj.locationId || item.locationId || firstStorage._id || '';

          if (!reelsByLoc[reelLocId]) {
            reelsByLoc[reelLocId] = [];
          }

          reelsByLoc[reelLocId].push({
            reelNumber: reelObj.reelNumber || `${finalInvoiceNumber}-L${i + 1}-R${String(r + 1).padStart(2, '0')}`,
            gsm: Number(item.gsm) || 0,
            width: reelWidth,
            weight: reelWeight
          });
        }

        // Push a validated item for each unique location
        const uniqueLocations = Object.keys(reelsByLoc);
        for (let lIdx = 0; lIdx < uniqueLocations.length; lIdx++) {
          const locId = uniqueLocations[lIdx];
          const reelsGroup = reelsByLoc[locId];
          const totalGroupWeight = reelsGroup.reduce((sum, r) => sum + r.weight, 0);

          validatedItems.push({
            skuId: item.skuId,
            quantity: totalGroupWeight,
            unit: 'kg',
            purchasePrice: price,
            totalPrice: totalGroupWeight * price,
            lotNumber: item.lotNumber || `${finalInvoiceNumber}-L0${i + 1}`,
            locationId: locId,
            reels: reelsGroup
          });
        }
      } else if ((item as any).splits && (item as any).splits.length > 0) {
        // Splitted non-reels lot (Multi-location)
        const selectedSku = skus.find(s => s._id === item.skuId);
        for (const split of (item as any).splits) {
          const splitQty = Number(split.quantity) || 0;
          validatedItems.push({
            skuId: item.skuId,
            quantity: splitQty,
            unit: selectedSku?.unit || 'kg',
            purchasePrice: price,
            totalPrice: splitQty * price,
            lotNumber: item.lotNumber || `${finalInvoiceNumber}-L0${i + 1}`,
            locationId: split.locationId,
            reels: [],
            reamWeight: (item as any).reamWeight ? Number((item as any).reamWeight) : undefined,
            ratePerKg: (item as any).ratePerKg ? Number((item as any).ratePerKg) : undefined
          });
        }
      } else {
        // Non-reels lot (standard single location)
        const selectedSku = skus.find(s => s._id === item.skuId);
        const destLocId = item.locationId || firstStorage._id || '';
        validatedItems.push({
          skuId: item.skuId,
          quantity: qty,
          unit: selectedSku?.unit || 'kg',
          purchasePrice: price,
          totalPrice: qty * price,
          lotNumber: item.lotNumber || `${finalInvoiceNumber}-L0${i + 1}`,
          locationId: destLocId,
          reels: [],
          reamWeight: (item as any).reamWeight ? Number((item as any).reamWeight) : undefined,
          ratePerKg: (item as any).ratePerKg ? Number((item as any).ratePerKg) : undefined
        });
      }
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
      loadInvoices();
    } catch (err: any) {
      console.error(err);
      setAddError(err.response?.data?.msg || 'Failed to submit purchase invoice');
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
              const match = selectedSku.name.match(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)/i);
              if (match) w = match[1];
            }
            return w;
          })(),
          length: (() => {
            let l = selectedSku?.length ? String(selectedSku.length) : '';
            if (!l && selectedSku?.name) {
              const match = selectedSku.name.match(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)/i);
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
      items: [{ skuId: '', brand: '', gsm: '', width: '', length: '', reelsCount: '', quantity: '', purchasePrice: '', reamWeight: '', ratePerKg: '', lotNumber: '', reels: [] as any[] }]
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

  const handleDeleteInvoice = async (invoice: PurchaseInvoiceV2) => {
    if (!window.confirm(`Are you sure you want to delete purchase invoice ${invoice.invoiceNumber}? This will reverse the stock entries and adjust the vendor's outstanding balance.`)) {
      return;
    }
    try {
      await deletePurchaseInvoiceV2(invoice._id || '', selectedCompany?._id || '');
      showToast('Purchase invoice deleted successfully!', 'success');
      createActivityLog({
        action: 'DELETE',
        entityType: 'PurchaseInvoiceV2',
        entityName: invoice.invoiceNumber,
        details: `Purchase Batch '${invoice.invoiceNumber}' was deleted permanently`,
        company: selectedCompany?._id
      }).catch(() => {});
      loadInvoices();
    } catch (e) {
      console.error(e);
      showToast('Failed to delete purchase invoice', 'error');
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
  const dashboardTotalWeight = invoices.reduce((sum, inv) => sum + (inv.items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0), 0);
  const dashboardTotalValue = invoices.reduce((sum, inv) => sum + (inv.subTotal || 0), 0);
  const dashboardPendingReceipts = invoices.filter(inv => inv.status === 'Draft').length;

  return (
    <div className="p-4 space-y-6">
      {/* Main Content Layout */}
      <div className={`transition-all duration-300 ${activeSubPage === 'new' || (activeSubPage === 'details' && selectedInvoice) ? 'lg:mr-[640px]' : ''}`}>
        {/* ── SUB-PAGE 3: MAIN LIST VIEW ──────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Top Bar with Navigation Back link and user profile pill (matching Customer module exactly) */}
          <div className="flex items-center justify-between mb-3">
            <div 
              className="flex items-center space-x-1.5 text-gray-500 hover:text-gray-900 cursor-pointer transition-colors" 
              onClick={() => navigate(-1)}
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm font-semibold">Back</span>
            </div>
            
            <div className="flex items-center space-x-2 text-gray-700 bg-gray-50 border border-gray-150 px-3.5 py-1.5 rounded-full text-sm font-medium shadow-xs select-none">
              <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                <User className="w-3.5 h-3.5" />
              </div>
              <span>SKBW Admin</span>
            </div>
          </div>

          {/* Title & Actions Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-955 tracking-tight">
                Purchase Batches
              </h1>
              <p className="text-sm text-gray-500 mt-1">All purchase batches (each batch may contain multiple materials/lot lines)</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              {/* Tools dropdown */}
              <div className="relative" ref={toolsDropdownRef}>
                <button
                  onClick={() => setShowToolsDropdown(!showToolsDropdown)}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-semibold text-sm shadow-xs cursor-pointer animate-fade-in"
                >
                  <Settings className="w-4 h-4 text-gray-500" />
                  <span>Tools</span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>

                {showToolsDropdown && (
                  <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50 divide-y divide-gray-100 animate-in fade-in duration-100 slide-in-from-top-1">
                    <div className="py-1">
                      <button
                        onClick={() => { fetchActivityLogs(); setShowActivityLog(true); setShowToolsDropdown(false); }}
                        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span>Activity Log</span>
                        </div>
                        <kbd className="px-1.5 bg-gray-50 border border-gray-200 rounded text-[9px] text-gray-450 font-mono font-medium">Alt+L</kbd>
                      </button>
                      <button
                        onClick={() => { findPurchaseDuplicates(); setShowDuplicates(true); setShowToolsDropdown(false); }}
                        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-gray-400" />
                          <span>Find Duplicates</span>
                        </div>
                        <kbd className="px-1.5 bg-gray-50 border border-gray-200 rounded text-[9px] text-gray-450 font-mono font-medium">Alt+F</kbd>
                      </button>
                      <button
                        onClick={() => { fetchRecycleBin(); setShowRecycleBin(true); setShowToolsDropdown(false); }}
                        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Trash2 className="w-4 h-4 text-gray-400" />
                          <span>Recycle Bin</span>
                        </div>
                        <kbd className="px-1.5 bg-gray-50 border border-gray-200 rounded text-[9px] text-gray-450 font-mono font-medium">Alt+R</kbd>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleNewPurchaseClick}
                className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Purchase</span>
                <kbd className="hidden md:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono font-bold text-blue-100 bg-blue-800 rounded border border-blue-700 shadow-xs select-none pointer-events-none">Alt/Opt+C</kbd>
              </button>
            </div>
          </div>

          {/* Statistics row */}
          {(() => {
            const dashboardReceivedBatches = invoices.filter(inv => inv.status === 'Posted').length;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 animate-none">
                <button
                  onClick={() => handleStatsCardClick('')}
                  className={`w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-blue-500 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
                    statusFilter === '' 
                      ? 'bg-blue-50/40 border-blue-400 ring-2 ring-blue-100 shadow-sm' 
                      : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${statusFilter === '' ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-500'}`}>Total Batches</p>
                    <p className="text-2xl font-bold text-gray-900 mt-0.5">{dashboardTotalBatches}</p>
                  </div>
                </button>

                <button
                  onClick={() => handleStatsCardClick('Posted')}
                  className={`w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-emerald-500 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
                    statusFilter === 'Posted' 
                      ? 'bg-emerald-50/40 border-emerald-400 ring-2 ring-emerald-100 shadow-sm' 
                      : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${statusFilter === 'Posted' ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-500'}`}>Received Batches</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-0.5">{dashboardReceivedBatches}</p>
                  </div>
                </button>

                <button
                  onClick={() => handleStatsCardClick('Draft')}
                  className={`w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-purple-500 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
                    statusFilter === 'Draft' 
                      ? 'bg-purple-50/40 border-purple-400 ring-2 ring-purple-100 shadow-sm' 
                      : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${statusFilter === 'Draft' ? 'text-purple-600' : 'text-gray-400 group-hover:text-purple-500'}`}>Pending Receipts</p>
                    <p className="text-2xl font-bold text-purple-600 mt-0.5">{dashboardPendingReceipts}</p>
                  </div>
                </button>

                <div
                  className="w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-orange-500 transition-all duration-200 bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5 group"
                >
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider transition-colors group-hover:text-orange-500">Total Value</p>
                    <p className="text-2xl font-bold text-orange-600 mt-0.5">₹{dashboardTotalValue.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Table section */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-xs p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <form onSubmit={handleSearchSubmit} className="flex-1 w-full relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by Batch No, Supplier, Material..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors text-gray-950 font-medium"
                />
              </form>
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <select
                  value={vendorFilter}
                  onChange={e => { setVendorFilter(e.target.value); setPage(1); }}
                  className="w-full sm:w-44 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white text-gray-700 font-semibold cursor-pointer"
                >
                  <option value="">All Suppliers</option>
                  {vendors.map(v => (
                    <option key={v._id} value={v._id}>{v.firmName || v.ownerName}</option>
                  ))}
                </select>

                <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg p-1.5 bg-white text-sm font-semibold">
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="text-xs border-0 bg-transparent focus:ring-0 p-0 text-gray-700 w-24 font-mono font-bold"
                  />
                  <span className="text-gray-400 font-bold text-xs">-</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="text-xs border-0 bg-transparent focus:ring-0 p-0 text-gray-700 w-24 font-mono font-bold"
                  />
                </div>

                <button
                  onClick={handleExportExcel}
                  className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-semibold text-sm shadow-xs cursor-pointer whitespace-nowrap animate-fade-in"
                >
                  <Download className="w-4 h-4 text-gray-505" />
                  <span>Import Excel</span>
                </button>

                <button
                  onClick={() => {
                    setSearch('');
                    setVendorFilter('');
                    setStatusFilter('');
                    setStartDate('2024-06-01');
                    setEndDate('2024-06-30');
                    setPage(1);
                  }}
                  className="p-2 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-gray-200 rounded-xl transition-all"
                  title="Reset Filters"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

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
              onDeleteInvoice={handleDeleteInvoice}
            />

            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-gray-200 shadow-sm text-xs font-semibold text-gray-500">
                <span>
                  Showing Page <span className="text-gray-900">{page}</span> of <span className="text-gray-900">{totalPages}</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                    disabled={page === 1}
                    className="p-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors shadow-3xs flex items-center"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={page === totalPages}
                    className="p-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors shadow-3xs flex items-center"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-blue-50/50 p-4 border border-blue-150 rounded-2xl space-y-2 text-xs">
            <h4 className="font-black text-blue-900 flex items-center gap-1.5">
              <HelpCircle className="w-4.5 h-4.5 text-blue-600 shrink-0" />
              About Purchase Batches
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 font-semibold text-blue-700 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                Each purchase batch can contain multiple materials (different brand, GSM, width, etc.)
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                Location allocation happens after inward.
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                We record only: Reels and KGs (no reel numbers).
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                Stock is tracked lot-wise for accuracy.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SUB-PAGE 1: NEW/EDIT FORM SIDE DRAWER ─────────────────────────────── */}
      {activeSubPage === 'new' && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-[640px] bg-white shadow-2xl border-l border-gray-200 z-[60] flex flex-col animate-in slide-in-from-right duration-250 font-sans text-xs !mt-0">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {isEditing ? 'Edit Purchase Batch' : 'New Purchase Batch'}
              </h2>
              <p className="text-[10px] text-gray-500 mt-0.5 font-medium">
                {isEditing ? 'Modify purchase invoice records and lots' : 'Record a new supplier materials lot delivery'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveSubPage('list')}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-white">
            {addError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-700 flex items-center gap-2">
                <AlertCircleIcon className="w-4 h-4 shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            {/* 1. Purchase Batch Details */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-3xs p-5 space-y-4">
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider border-b pb-2">
                1. Purchase Batch Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Batch No. *</label>
                  <input
                    type="text"
                    placeholder="e.g. PB2407001"
                    value={invoiceForm.invoiceNumber}
                    onChange={e => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-950 font-mono font-bold"
                  />
                  <span className="text-[9px] text-gray-400 font-semibold mt-1 block">Auto-generated if empty</span>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Purchase Date *</label>
                  <input
                    type="date"
                    value={invoiceForm.dueDate}
                    onChange={e => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                    required
                  />
                </div>
                <div className="relative">
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Supplier *</label>
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
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 font-semibold"
                      required
                    />
                    {supplierFocused && (
                      <>
                        <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-30 divide-y divide-gray-50">
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
                                onClick={() => {
                                  setInvoiceForm({ ...invoiceForm, vendorId: v._id });
                                  setSupplierFocused(false);
                                  setSupplierSearchText('');
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-blue-50 hover:text-blue-600 transition-colors block text-[11px]"
                              >
                                <div className="font-bold text-gray-900">{v.firmName || v.ownerName}</div>
                                {v.firmName && v.ownerName && (
                                  <div className="text-[10px] text-gray-400">Owner: {v.ownerName}</div>
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
                            <div className="px-3 py-2 text-xs text-gray-400 italic text-center">No suppliers found</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Purchase Type</label>
                  <select
                    value={invoiceForm.purchaseType || 'Raw Material'}
                    onChange={e => setInvoiceForm({ ...invoiceForm, purchaseType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 font-semibold"
                  >
                    <option value="Raw Material">Raw Material</option>
                    <option value="Semi Finished">Semi-Finished</option>
                    <option value="Finished Goods">Finished Goods</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 2. Material Lots */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                  Material Lots
                </h3>
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black transition-all shadow-3xs"
                >
                  + Add Material Lot
                </button>
              </div>

              <div className="space-y-4">
                {invoiceForm.items.map((item, idx) => {
                  const reelsCount = Number(item.reelsCount) || 0;
                  const selectedSku = skus.find(s => s._id === item.skuId);
                  const paperType = selectedSku?.paperType || 'None';
                  const unitLabel = selectedSku?.unit || 'KG';
                  return (
                    <div key={idx} className="bg-white rounded-xl border border-gray-200 shadow-3xs p-5 space-y-4 text-left">
                      <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                        <span className="text-xs font-black text-gray-900 uppercase font-mono bg-gray-100 px-2 py-0.5 rounded">
                          LOT - {idx + 1}
                        </span>
                        {invoiceForm.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition-colors text-xs font-bold flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remove Lot
                          </button>
                        )}
                      </div>

                      {/* Lot Form Grid */}
                      <div className="grid grid-cols-4 gap-3 text-xs text-gray-900">
                        <div className="col-span-2">
                          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Item SKU *</label>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Search or select SKU..."
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
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white font-semibold text-gray-800 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              required
                            />
                            {focusedRowIdx === idx && (
                              <>
                                <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-30 divide-y divide-gray-50">
                                  {skus
                                    .filter(s => {
                                      const catMatch = s.category === (invoiceForm.purchaseType || 'Raw Material');
                                      if (!catMatch) return false;
                                      if (!skuSearchText.trim()) return true;
                                      const term = skuSearchText.toLowerCase();
                                      return s.name.toLowerCase().includes(term) || 
                                             s.skuCode.toLowerCase().includes(term);
                                    })
                                    .map(s => (
                                      <button
                                        key={s._id}
                                        type="button"
                                        onClick={() => {
                                          handleItemRowChange(idx, 'skuId', s._id);
                                          setFocusedRowIdx(null);
                                          setSkuSearchText('');
                                        }}
                                        className="w-full px-3 py-2 text-left hover:bg-blue-50 hover:text-blue-600 transition-colors block text-[11px]"
                                      >
                                        <div className="font-bold text-gray-900">{s.name}</div>
                                        <div className="text-[10px] text-gray-400">{s.skuCode} • {s.category}</div>
                                      </button>
                                    ))
                                  }
                                  {skus.filter(s => {
                                    const catMatch = s.category === (invoiceForm.purchaseType || 'Raw Material');
                                    if (!catMatch) return false;
                                    if (!skuSearchText.trim()) return true;
                                    const term = skuSearchText.toLowerCase();
                                    return s.name.toLowerCase().includes(term) || 
                                           s.skuCode.toLowerCase().includes(term);
                                  }).length === 0 && (
                                    <div className="px-3 py-2 text-xs text-gray-400 italic text-center">No SKUs found</div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Brand</label>
                          <input
                            type="text"
                            value={item.brand}
                            onChange={e => handleItemRowChange(idx, 'brand', e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">GSM</label>
                          <input
                            type="number"
                            value={item.gsm}
                            onChange={e => handleItemRowChange(idx, 'gsm', e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-center font-bold"
                          />
                        </div>

                        {paperType === 'Reels' && (
                          <>
                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Width (cm)</label>
                              <input
                                type="number"
                                value={item.width}
                                onChange={e => handleItemRowChange(idx, 'width', e.target.value)}
                                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-center font-bold"
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Reels Count</label>
                              <input
                                type="number"
                                value={item.reelsCount}
                                onChange={e => handleItemRowChange(idx, 'reelsCount', e.target.value)}
                                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-center font-bold"
                                placeholder="0"
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Total {unitLabel}</label>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={e => handleItemRowChange(idx, 'quantity', e.target.value)}
                                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-right font-black"
                                placeholder="0"
                                disabled={reelsCount > 0}
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Rate / {unitLabel} (₹)</label>
                              <input
                                type="number"
                                value={item.purchasePrice}
                                onChange={e => handleItemRowChange(idx, 'purchasePrice', e.target.value)}
                                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-right font-bold"
                                placeholder="0.00"
                                required
                              />
                            </div>
                          </>
                        )}

                        {paperType === 'Sheets' && (
                          <>
                            <div>
                              <label className="block text-[9px] font-black text-blue-600 uppercase tracking-wider mb-1">Qty in Reams *</label>
                              <input
                                type="number"
                                placeholder="0"
                                value={((Number(item.quantity) || 0) / (selectedSku?.pages || 500)) || ''}
                                onChange={e => {
                                  const reams = Number(e.target.value) || 0;
                                  const stdSheets = selectedSku?.pages || 500;
                                  const totalSheets = reams * stdSheets;
                                  
                                  const updatedItems = [...invoiceForm.items];
                                  updatedItems[idx].quantity = String(totalSheets);
                                  
                                  // Recalculate price per sheet
                                  const rw = Number(updatedItems[idx].reamWeight) || 0;
                                  const rkg = Number(updatedItems[idx].ratePerKg) || 0;
                                  if (rw > 0 && rkg > 0) {
                                    updatedItems[idx].purchasePrice = String((rw * rkg) / stdSheets);
                                  }
                                  setInvoiceForm({ ...invoiceForm, items: updatedItems });
                                }}
                                disabled={item.splits && item.splits.length > 0}
                                className="w-full px-2.5 py-1.5 border border-blue-200 bg-blue-50/15 rounded-lg text-xs text-right font-bold text-blue-800 focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-blue-600 uppercase tracking-wider mb-1">Ream Weight (kg) *</label>
                              <input
                                type="number"
                                step="any"
                                placeholder="e.g. 10.37"
                                value={item.reamWeight || ''}
                                onChange={e => {
                                  const rw = e.target.value;
                                  const updatedItems = [...invoiceForm.items];
                                  updatedItems[idx].reamWeight = rw;
                                  
                                  // Recalculate price per sheet
                                  const rwNum = Number(rw) || 0;
                                  const rkgNum = Number(updatedItems[idx].ratePerKg) || 0;
                                  const stdSheets = selectedSku?.pages || 500;
                                  if (rwNum > 0 && rkgNum > 0) {
                                    updatedItems[idx].purchasePrice = String((rwNum * rkgNum) / stdSheets);
                                  }
                                  setInvoiceForm({ ...invoiceForm, items: updatedItems });
                                }}
                                className="w-full px-2.5 py-1.5 border border-blue-200 bg-blue-50/15 rounded-lg text-xs text-right font-bold text-blue-800 focus:ring-2 focus:ring-blue-500"
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Total Weight (kg)</label>
                              <input
                                type="text"
                                value={(((Number(item.quantity) || 0) / (selectedSku?.pages || 500)) * (Number(item.reamWeight) || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' kg'}
                                disabled
                                className="w-full px-2.5 py-1.5 border border-gray-150 bg-gray-50 rounded-lg text-xs text-right font-bold text-gray-500 cursor-not-allowed"
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-blue-600 uppercase tracking-wider mb-1">Rate / KG (₹) *</label>
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
                                  const rwNum = Number(updatedItems[idx].reamWeight) || 0;
                                  const rkgNum = Number(rkg) || 0;
                                  const stdSheets = selectedSku?.pages || 500;
                                  if (rwNum > 0 && rkgNum > 0) {
                                    updatedItems[idx].purchasePrice = String((rwNum * rkgNum) / stdSheets);
                                  }
                                  setInvoiceForm({ ...invoiceForm, items: updatedItems });
                                }}
                                className="w-full px-2.5 py-1.5 border border-blue-200 bg-blue-50/15 rounded-lg text-xs text-right font-bold text-blue-800 focus:ring-2 focus:ring-blue-500"
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Total {unitLabel}</label>
                              <input
                                type="text"
                                value={(Number(item.quantity) || 0).toLocaleString()}
                                disabled
                                className="w-full px-2.5 py-1.5 border border-gray-150 bg-gray-50 rounded-lg text-xs text-right font-black text-gray-500 cursor-not-allowed"
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Total Cost (₹)</label>
                              <input
                                type="text"
                                value={'₹' + ((((Number(item.quantity) || 0) / (selectedSku?.pages || 500)) * (Number(item.reamWeight) || 0)) * (Number(item.ratePerKg) || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                disabled
                                className="w-full px-2.5 py-1.5 border border-gray-150 bg-gray-50 rounded-lg text-xs text-right font-black text-gray-700 cursor-not-allowed"
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Rate / {unitLabel} (₹)</label>
                              <input
                                type="text"
                                value={'₹' + (Number(item.purchasePrice) || 0).toFixed(4)}
                                disabled
                                className="w-full px-2.5 py-1.5 border border-gray-150 bg-gray-50 rounded-lg text-xs text-right font-bold text-gray-500 cursor-not-allowed"
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Standard Sheets/Ream</label>
                              <input
                                type="text"
                                value={selectedSku?.pages || 500}
                                disabled
                                className="w-full px-2.5 py-1.5 border border-gray-155 bg-gray-50 rounded-lg text-xs text-center font-bold text-gray-500 cursor-not-allowed"
                              />
                            </div>
                          </>
                        )}

                        {paperType === 'None' && (
                          <>
                            {selectedSku?.altUnit && selectedSku?.altUnitConversion ? (
                              <>
                                <div className="col-span-2">
                                  <label className="block text-[9px] font-black text-blue-600 uppercase tracking-wider mb-1">Qty in {selectedSku.altUnit}</label>
                                  <input
                                    type="number"
                                    placeholder="0"
                                    onChange={e => {
                                      const val = Number(e.target.value) || 0;
                                      const conversion = Number(selectedSku.altUnitConversion) || 1;
                                      handleItemRowChange(idx, 'quantity', String(val * conversion));
                                    }}
                                    disabled={item.splits && item.splits.length > 0}
                                    className="w-full px-2.5 py-1.5 border border-blue-200 bg-blue-50/15 rounded-lg text-xs text-right font-bold text-blue-800 focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Total {unitLabel}</label>
                                  <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={e => handleItemRowChange(idx, 'quantity', e.target.value)}
                                    disabled={item.splits && item.splits.length > 0}
                                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-black disabled:opacity-60"
                                    placeholder="0"
                                    required
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Rate / {unitLabel} (₹)</label>
                                  <input
                                    type="number"
                                    value={item.purchasePrice}
                                    onChange={e => handleItemRowChange(idx, 'purchasePrice', e.target.value)}
                                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-bold"
                                    placeholder="0.00"
                                    required
                                  />
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="col-span-2">
                                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Total {unitLabel}</label>
                                  <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={e => handleItemRowChange(idx, 'quantity', e.target.value)}
                                    disabled={item.splits && item.splits.length > 0}
                                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-black disabled:opacity-60"
                                    placeholder="0"
                                    required
                                  />
                                </div>

                                <div className="col-span-2">
                                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Rate / {unitLabel} (₹)</label>
                                  <input
                                    type="number"
                                    value={item.purchasePrice}
                                    onChange={e => handleItemRowChange(idx, 'purchasePrice', e.target.value)}
                                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-bold"
                                    placeholder="0.00"
                                    required
                                  />
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>

                      {/* Layout details: amount and storage (only for non-reels items) */}
                      <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50/50 p-3 rounded-lg border border-gray-100 text-xs">
                        <div className="flex gap-4">
                          <span className="font-semibold text-gray-500">
                            Lot Subtotal: <span className="font-black text-gray-800 text-sm">₹{((Number(item.quantity) || 0) * (Number(item.purchasePrice) || 0)).toLocaleString('en-IN')}</span>
                          </span>
                        </div>

                        {true && (
                          <div className="flex items-center gap-3">
                            {(item as any).splits && (item as any).splits.length > 0 ? (
                              <div className="bg-blue-50/50 border border-blue-150 rounded-lg p-2.5 space-y-1.5 min-w-[240px]">
                                <div className="flex justify-between items-center gap-4">
                                  <span className="text-[10px] font-black text-blue-800 uppercase tracking-wider">Multi-Location Split</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTempSplits((item as any).splits || []);
                                      setSplittingItemIdx(idx);
                                    }}
                                    className="text-[10px] text-blue-600 hover:text-blue-800 font-extrabold cursor-pointer hover:underline"
                                  >
                                    Edit Split
                                  </button>
                                </div>
                                <div className="text-[10px] text-gray-600 font-bold">
                                  Allocated across {(item as any).splits.length} locations:
                                  <ul className="list-disc pl-3 mt-1 space-y-0.5 font-bold text-gray-700">
                                    {(item as any).splits.slice(0, 3).map((split: any, i: number) => {
                                      const locName = locations.find(l => l._id === split.locationId)?.name || 'Godown';
                                      const qtyVal = Number(split.quantity) || 0;
                                      return (
                                        <li key={i}>
                                          {locName}: {selectedSku?.paperType === 'Sheets' 
                                            ? `${(qtyVal / (selectedSku?.pages || 500)).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Reams` 
                                            : `${qtyVal.toLocaleString()} ${selectedSku?.unit || 'KG'}`}
                                        </li>
                                      );
                                    })}
                                    {(item as any).splits.length > 3 && (
                                      <li className="italic text-gray-400 font-medium">+ {(item as any).splits.length - 3} more...</li>
                                    )}
                                  </ul>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex justify-between items-center">
                                    <span>{reelsCount > 0 ? 'Default Lot Storage:' : 'Lot Storage Location:'}</span>
                                    {item.skuId && !reelsCount && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const initialSplits = item.locationId && item.quantity 
                                            ? [{ locationId: item.locationId, quantity: item.quantity }]
                                            : [];
                                          setTempSplits(initialSplits);
                                          setSplittingItemIdx(idx);
                                        }}
                                        className="text-[9px] text-blue-600 hover:text-blue-800 font-bold ml-2 cursor-pointer hover:underline"
                                      >
                                        [Split Godowns]
                                      </button>
                                    )}
                                  </label>
                                  <select
                                    value={item.locationId || ''}
                                    onChange={e => handleItemRowChange(idx, 'locationId', e.target.value)}
                                    className="px-2 py-1 border border-gray-200 rounded-lg bg-white text-[11px] font-bold text-gray-800 mt-0.5"
                                    required={!((item as any).splits && (item as any).splits.length > 0)}
                                  >
                                    <option value="">-- Select Destination Storage --</option>
                                    {locations.filter(loc => loc.level === 'Storage Location').map(loc => {
                                      const paths = resolveLocationPath(loc._id);
                                      const hierarchy = [paths.factory, paths.floor, paths.zone].filter(p => p && p !== '—').join(' > ');
                                      return (
                                        <option key={loc._id} value={loc._id}>
                                          {hierarchy ? `${hierarchy} > ` : ''}{loc.name}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Inline Reels List inside card (matches handwritten sketch) */}
                      {reelsCount > 0 && (
                        <div className="pt-3 border-t border-gray-100 space-y-2">
                          <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            Reel Specifications & Storage Placement:
                          </span>

                          <div className="overflow-x-auto border border-gray-200 rounded-lg">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-gray-50 text-gray-400 font-bold uppercase text-[9px] border-b border-gray-150">
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
                                    <tr key={rIdx} className="hover:bg-gray-50/20">
                                      <td className="py-1.5 px-3 font-mono text-gray-500 font-bold">R-{rIdx + 1}</td>
                                      <td className="py-1.5 px-3">
                                        <input
                                          type="number"
                                          value={reelWeightVal}
                                          onChange={e => handleReelChange(idx, rIdx, 'weight', e.target.value)}
                                          placeholder="0.0"
                                          className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs font-mono font-bold text-gray-900"
                                          required
                                        />
                                      </td>
                                      <td className="py-1.5 px-3">
                                        <input
                                          type="number"
                                          value={reelWidthVal}
                                          onChange={e => handleReelChange(idx, rIdx, 'width', e.target.value)}
                                          placeholder="Width"
                                          className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs font-mono"
                                          required
                                        />
                                      </td>
                                      <td className="py-1.5 px-3">
                                        <select
                                          value={reelLocId}
                                          onChange={e => handleReelChange(idx, rIdx, 'locationId', e.target.value)}
                                          className="w-full px-2 py-1 border border-gray-200 rounded-md bg-white text-xs font-bold text-gray-800"
                                          required
                                        >
                                          <option value="">-- Choose Storage Area --</option>
                                          {locations.filter(loc => loc.level === 'Storage Location').map(loc => {
                                            const paths = resolveLocationPath(loc._id);
                                            const hierarchy = [paths.factory, paths.floor, paths.zone].filter(p => p && p !== '—').join(' > ');
                                            return (
                                              <option key={loc._id} value={loc._id}>
                                                {hierarchy ? `${hierarchy} > ` : ''}{loc.name}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Summary & Other Charges */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-3xs p-5 space-y-4">
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider border-b pb-2">
                3. Summary & Other Charges
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Freight Charges (₹)</label>
                  <input
                    type="number"
                    value={invoiceForm.freight}
                    onChange={e => setInvoiceForm({ ...invoiceForm, freight: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono text-right"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Crane Charges (₹)</label>
                  <input
                    type="number"
                    value={invoiceForm.craneCharges}
                    onChange={e => setInvoiceForm({ ...invoiceForm, craneCharges: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono text-right"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Loading / Unloading (₹)</label>
                  <input
                    type="number"
                    value={invoiceForm.loadingUnloading}
                    onChange={e => setInvoiceForm({ ...invoiceForm, loadingUnloading: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono text-right"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Other Charges (₹)</label>
                  <input
                    type="number"
                    value={invoiceForm.otherCharges}
                    onChange={e => setInvoiceForm({ ...invoiceForm, otherCharges: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono text-right"
                    placeholder="e.g. Labour, Misc etc."
                  />
                </div>
              </div>

              {/* Total calculations */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-150 space-y-2 text-xs font-semibold text-gray-700 mt-4">
                 <div className="flex justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Lots:</span>
                  <span className="text-gray-900 font-bold">{formLotsCount} Lots</span>
                </div>
                {formHasReels && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Reels:</span>
                      <span className="text-gray-900 font-bold">{formReelsCount} Reels</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Reel Weight:</span>
                      <span className="text-gray-900 font-bold">{formReelsWeight.toLocaleString('en-IN')} KG</span>
                    </div>
                  </>
                )}
                {formHasSheets && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Reams:</span>
                      <span className="text-gray-900 font-bold">{formReamsCount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Reams</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Sheets:</span>
                      <span className="text-gray-900 font-bold">{formSheetsCount.toLocaleString('en-IN')} Sheets</span>
                    </div>
                  </>
                )}
                {!formHasReels && !formHasSheets && (
                  <div className="flex justify-between">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Qty:</span>
                    <span className="text-gray-900 font-bold">{formTotalWeight.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span>Material Total:</span>
                  <span className="font-mono text-gray-900">₹{formMatTotal.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Other Charges Total:</span>
                  <span className="font-mono text-gray-900">₹{formOtherCharges.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold text-sm text-gray-950">
                  <span>Grand Total:</span>
                  <span className="font-mono text-blue-600">₹{(formMatTotal + formOtherCharges).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-5 border-t border-gray-200 bg-gray-50 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setActiveSubPage('list')}
              className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleInvoiceSubmit}
              disabled={addLoading}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm flex items-center justify-center gap-1.5"
            >
              {addLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Batch...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Purchase Batch</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── SUB-PAGE 2: BATCH DETAILS SIDE DRAWER ────────────────────────────── */}
      {activeSubPage === 'details' && selectedInvoice && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-[640px] bg-white shadow-2xl border-l border-gray-200 z-[60] flex flex-col animate-in slide-in-from-right duration-250 font-sans text-xs !mt-0">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
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
                className="px-2.5 py-1.5 border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white rounded-lg text-[10px] font-bold shadow-3xs flex items-center gap-1 transition-all"
              >
                <Edit className="w-3 h-3 text-amber-500" /> Edit
              </button>
              <button
                onClick={() => setActiveSubPage('list')}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Details Content Scroll Area */}
          {(() => {
            const isSheetsInvoice = selectedInvoice.items?.some(item => {
              const resolvedSku = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any) : null;
              return resolvedSku?.paperType === 'Sheets';
            });

            let totalReelsCount = 0;
            let totalReamsCount = 0;
            let totalSheetsCount = 0;
            let totalKgWeight = 0;

            selectedInvoice.items?.forEach(item => {
              const resolvedSku = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any) : null;
              if (resolvedSku?.paperType === 'Sheets') {
                const stdSheets = resolvedSku?.pages || 500;
                const reamWeight = item.reamWeight || resolvedSku?.reamWeight || getFallbackReamWeight(resolvedSku) || 0;
                const itemReams = (item.quantity || 0) / stdSheets;
                totalSheetsCount += item.quantity || 0;
                totalReamsCount += itemReams;
                totalKgWeight += itemReams * reamWeight;
              } else {
                totalReelsCount += item.reels?.length || 0;
                totalKgWeight += item.quantity || 0;
              }
            });

            return (
              <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-white">
                {/* Header batch summary cards (matching Customer module details card UI exactly) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
                  {/* Card 1: Batch Number */}
                  <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-blue-600 font-bold uppercase tracking-wider leading-tight">Batch Number</span>
                    <span className="block text-xs text-blue-900 font-extrabold mt-1 truncate px-1" title={selectedInvoice.invoiceNumber}>
                      {selectedInvoice.invoiceNumber}
                    </span>
                  </div>

                  {/* Card 2: Supplier / Vendor */}
                  <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-indigo-650 font-bold uppercase tracking-wider leading-tight">Supplier / Vendor</span>
                    <span className="block text-xs text-indigo-900 font-extrabold mt-1 truncate px-1" title={typeof selectedInvoice.vendorId === 'object' && selectedInvoice.vendorId !== null ? (selectedInvoice.vendorId.firmName || selectedInvoice.vendorId.ownerName) : 'Supplier'}>
                      {typeof selectedInvoice.vendorId === 'object' && selectedInvoice.vendorId !== null ? (selectedInvoice.vendorId.firmName || selectedInvoice.vendorId.ownerName) : 'Supplier'}
                    </span>
                  </div>

                  {/* Card 3: Purchase Date */}
                  <div className="bg-purple-50/40 border border-purple-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-purple-650 font-bold uppercase tracking-wider leading-tight">Purchase Date</span>
                    <span className="block text-xs text-purple-900 font-extrabold mt-1 truncate px-1">
                      {selectedInvoice.createdAt ? new Date(selectedInvoice.createdAt).toLocaleDateString('en-IN') : '—'}
                    </span>
                  </div>

                  {/* Card 4: Total Lots */}
                  <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-emerald-700 font-bold uppercase tracking-wider leading-tight">Total Lots</span>
                    <span className="block text-xl text-emerald-900 font-extrabold mt-0.5">
                      {selectedInvoice.items?.length || 0}
                    </span>
                  </div>

                  {/* Card 5: Total Reels */}
                  <div className="bg-amber-50/40 border border-amber-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-amber-700 font-bold uppercase tracking-wider leading-tight">Total Reels</span>
                    <span className="block text-xl text-amber-900 font-extrabold mt-0.5">
                      {totalReelsCount || '0'}
                    </span>
                  </div>

                  {/* Card 6: Total Reams */}
                  <div className="bg-teal-50/40 border border-teal-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-teal-700 font-bold uppercase tracking-wider leading-tight">Total Reams</span>
                    <span className="block text-xl text-teal-900 font-extrabold mt-0.5">
                      {totalReamsCount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Card 7: Total Weight (KG) */}
                  <div className="bg-red-50/40 border border-red-100 rounded-xl p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <span className="block text-[10px] text-red-650 font-bold uppercase tracking-wider leading-tight">Total Weight (KG)</span>
                    <span className="block text-xl text-red-900 font-extrabold mt-0.5">
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
                          <th className="px-3 py-2.5 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                        {selectedInvoice.items?.map((item, idx) => {
                          const skuName = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any).name : 'Raw Material';
                          const resolvedSku = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any) : null;
                          const brand = resolvedSku?.brand || 'BILT';
                          const gsm = resolvedSku?.gsm || '52';
                          const width = resolvedSku?.width || '64';
                          
                          let displayQtyKg = item.quantity || 0;
                          if (resolvedSku?.paperType === 'Sheets') {
                            const stdSheets = resolvedSku.pages || 500;
                            const reamWeight = item.reamWeight || resolvedSku?.reamWeight || getFallbackReamWeight(resolvedSku) || 0;
                            if (reamWeight > 0) {
                              const reams = (item.quantity || 0) / stdSheets;
                              displayQtyKg = reams * reamWeight;
                            }
                          }
                          
                          return (
                            <tr key={idx} className="hover:bg-gray-50/50">
                              <td className="px-3 py-2.5 text-gray-450 font-bold">{idx + 1}</td>
                              <td className="px-3 py-2.5 font-bold text-gray-900">
                                <div>{skuName}</div>
                                <div className="text-[10px] text-gray-400 font-normal">{brand}</div>
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold text-gray-700">{gsm}</td>
                              <td className="px-3 py-2.5 text-center font-bold text-gray-700">{width} cm</td>
                              <td className="px-3 py-2.5 text-center font-bold text-gray-800">{item.reels?.length || 0}</td>
                              <td className="px-3 py-2.5 text-right font-black text-gray-955">
                                {displayQtyKg.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2.5 text-right font-black text-gray-955">₹{(item.totalPrice || 0).toLocaleString()}</td>
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
                                     b.reels?.some(r => r.reelNumber === reel.reelNumber)
                              );
                              const locationName = balance && balance.location
                                ? balance.location.name 
                                : 'Not Allocated';
                              return (
                                <div key={rIdx} className="bg-white p-2 border border-gray-100 rounded-lg flex items-center justify-between text-[11px]">
                                  <div className="min-w-0">
                                    <p className="font-bold text-gray-800 truncate">Reel #{reel.reelNumber}</p>
                                    <p className="text-[10px] text-gray-400 font-mono">{reel.weight} KG • {reel.width} cm</p>
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
                  <span>Subtotal Value:</span>
                  <span className="text-gray-900 font-bold">₹{(selectedInvoice.subTotal || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax Amount:</span>
                  <span className="text-gray-900 font-bold">₹{(selectedInvoice.taxAmount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Freight Charges:</span>
                  <span className="text-gray-900 font-bold">₹{(selectedInvoice.freight || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Crane Charges:</span>
                  <span className="text-gray-900 font-bold">₹{(selectedInvoice.craneCharges || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Other / Loading Charges:</span>
                  <span className="text-gray-900 font-bold">₹{(selectedInvoice.otherCharges || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-gray-955 font-black">
                  <span>Grand Total:</span>
                  <span className="text-blue-600 font-black">₹{(selectedInvoice.grandTotal || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>
          );
        })()}

          {/* Footer actions wrapper */}
          <div className="p-5 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
            <button
              onClick={() => handleDeleteInvoice(selectedInvoice)}
              className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 bg-white rounded-xl text-xs font-bold transition-all flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Batch
            </button>
            <button
              onClick={() => setActiveSubPage('list')}
              className="px-5 py-2 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 text-gray-700 font-bold text-xs shadow-3xs"
            >
              Close Window
            </button>
          </div>
        </div>
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
                  <select
                    id="split_location_select"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Choose Storage Location --</option>
                    {physicalLocations.map(loc => {
                      const paths = resolveLocationPath(loc._id);
                      const hierarchy = [paths.factory, paths.floor, paths.zone].filter(p => p && p !== '—').join(' > ');
                      return (
                        <option key={loc._id} value={loc._id}>
                          {hierarchy ? `${hierarchy} > ` : ''}{loc.name}
                        </option>
                      );
                    })}
                  </select>
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
                      const locSelect = document.getElementById("split_location_select") as HTMLSelectElement;
                      const locId = locSelect?.value;
                      if (!locId) {
                        alert("Please select a storage location first.");
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
                        alert("Please enter a valid quantity.");
                        return;
                      }

                      setTempSplits([...tempSplits, { locationId: locId, quantity: String(qty) }]);

                      // Reset fields
                      if (locSelect) locSelect.value = '';
                      const reamsInput = document.getElementById("split_reams_input") as HTMLInputElement;
                      if (reamsInput) reamsInput.value = '';
                      const sheetsInput = document.getElementById("split_sheets_input") as HTMLInputElement;
                      if (sheetsInput) sheetsInput.value = '';
                      const qtyInput = document.getElementById("split_qty_input") as HTMLInputElement;
                      if (qtyInput) qtyInput.value = '';
                    }}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-extrabold transition-all"
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
                          const locName = locations.find(l => l._id === split.locationId)?.name || 'Unknown Location';
                          const qtyVal = Number(split.quantity) || 0;
                          return (
                            <tr key={index}>
                              <td className="px-3 py-2 font-bold text-gray-900">{locName}</td>
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
                      <select
                        value={allocateForm.toLocationId}
                        onChange={e => setAllocateForm({ ...allocateForm, toLocationId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                        disabled={allocateSubmitting}
                      >
                        <option value="">-- Choose Storage Area --</option>
                        {physicalLocations.map(loc => {
                          const paths = resolveLocationPath(loc._id);
                          const hierarchy = [paths.factory, paths.floor, paths.zone].filter(p => p && p !== '—').join(' > ');
                          return (
                            <option key={loc._id} value={loc._id}>
                              {hierarchy ? `${hierarchy} > ` : ''}{loc.name} ({loc.level})
                            </option>
                          );
                        })}
                      </select>
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
                                  const totalWeight = unallocatedBal.reels.reduce((sum, r) => sum + (r.weight || 0), 0);
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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText, Truck, Clock, AlertCircle, Search, Filter, RefreshCw,
  Download, Plus, ChevronDown, ChevronLeft, ChevronRight, Check,
  Calendar, Eye, Printer, MoreVertical, IndianRupee, Layers
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SalesInvoice, getInvoices } from '../../api/invoiceApi';
import {
  DispatchDeliveryRecord,
  INITIAL_DISPATCH_DELIVERIES,
  INITIAL_FEATURED_INVOICE,
  SECOND_FEATURED_INVOICE
} from './invoiceSampleData';
import { CreateInvoiceView } from './CreateInvoiceView';
import { InvoiceSuccessModal } from './InvoiceSuccessModal';
import { showToast } from '../ui/Toast';

export const InvoicesModule: React.FC = () => {
  const { selectedCompany } = useAuth();

  // Active view: 'list' | 'create'
  const [viewMode, setViewMode] = useState<'list' | 'create'>('list');
  const [selectedDispatchForInvoice, setSelectedDispatchForInvoice] = useState<DispatchDeliveryRecord | null>(null);
  const [activeInvoiceForModal, setActiveInvoiceForModal] = useState<SalesInvoice | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  // Deliveries & Invoices Data
  const [deliveries, setDeliveries] = useState<DispatchDeliveryRecord[]>(() => {
    const key = `skbw_invoices_deliveries_${selectedCompany?._id || 'default'}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : INITIAL_DISPATCH_DELIVERIES;
  });

  const [invoicesList, setInvoicesList] = useState<SalesInvoice[]>(() => {
    return [INITIAL_FEATURED_INVOICE, SECOND_FEATURED_INVOICE];
  });

  // Fetch real invoices and deliveries from backend & local storage
  const loadData = async () => {
    try {
      const companyId = selectedCompany?._id;
      const apiInvs = await getInvoices(companyId);
      if (apiInvs && apiInvs.length > 0) {
        // Merge with initial featured
        const map = new Map<string, SalesInvoice>();
        [INITIAL_FEATURED_INVOICE, SECOND_FEATURED_INVOICE, ...apiInvs].forEach(inv => {
          if (inv.invoiceNumber) map.set(inv.invoiceNumber, inv);
        });
        setInvoicesList(Array.from(map.values()));
      }

      // Check deliveries in localStorage or fallback
      const key = `skbw_invoices_deliveries_${companyId || 'default'}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        setDeliveries(JSON.parse(stored));
      } else {
        setDeliveries(INITIAL_DISPATCH_DELIVERIES);
      }
    } catch (err) {
      console.warn('loadData error:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCompany?._id]);

  // Tab state: 'not_invoiced' | 'partially_invoiced' | 'invoiced' | 'all'
  type TabType = 'not_invoiced' | 'partially_invoiced' | 'invoiced' | 'all';
  const [activeTab, setActiveTab] = useState<TabType>('not_invoiced');

  // Filter Bar state
  const [dateRange, setDateRange] = useState('01/09/2026 - 30/09/2026');
  const [searchQuery, setSearchQuery] = useState('');
  const [customerFilter, setCustomerFilter] = useState('All Customers');
  const [regionFilter, setRegionFilter] = useState('All Regions');
  const [transporterFilter, setTransporterFilter] = useState('All Transporters');
  const [statusFilter, setStatusFilter] = useState('All Dispatch Status');

  // Pagination & selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Row dropdown actions
  const [openActionRowId, setOpenActionRowId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionRowId(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Filtered deliveries list based on tab and filters
  const filteredDeliveries = useMemo(() => {
    return deliveries.filter(item => {
      // Tab filter
      if (activeTab === 'not_invoiced' && item.invoiceStatus !== 'Not Invoiced') return false;
      if (activeTab === 'partially_invoiced' && item.invoiceStatus !== 'Partially Invoiced') return false;
      if (activeTab === 'invoiced' && item.invoiceStatus !== 'Invoiced') return false;

      // Status dropdown filter
      if (statusFilter !== 'All Dispatch Status') {
        if (statusFilter === 'Not Invoiced' && item.invoiceStatus !== 'Not Invoiced') return false;
        if (statusFilter === 'Partially Invoiced' && item.invoiceStatus !== 'Partially Invoiced') return false;
        if (statusFilter === 'Invoiced' && item.invoiceStatus !== 'Invoiced') return false;
      }

      // Customer filter
      if (customerFilter !== 'All Customers' && item.customerName !== customerFilter) return false;

      // Region filter
      if (regionFilter !== 'All Regions' && item.region !== regionFilter) return false;

      // Transporter filter
      if (transporterFilter !== 'All Transporters' && item.transporterName !== transporterFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchDispatch = item.dispatchNo.toLowerCase().includes(q);
        const matchCustomer = item.customerName.toLowerCase().includes(q);
        const matchTransporter = item.transporterName.toLowerCase().includes(q);
        const matchOrder = item.orderNumber.toLowerCase().includes(q);
        const matchInvoice = item.invoiceNumber?.toLowerCase().includes(q);
        if (!matchDispatch && !matchCustomer && !matchTransporter && !matchOrder && !matchInvoice) {
          return false;
        }
      }

      return true;
    });
  }, [deliveries, activeTab, statusFilter, customerFilter, regionFilter, transporterFilter, searchQuery]);

  // Pagination calculation
  const totalItems = filteredDeliveries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedDeliveries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDeliveries.slice(start, start + pageSize);
  }, [filteredDeliveries, currentPage, pageSize]);

  // Dynamic Metrics matching Screenshot 1
  const notInvoicedCount = useMemo(() => deliveries.filter(d => d.invoiceStatus === 'Not Invoiced').length, [deliveries]);
  const partiallyInvoicedCount = useMemo(() => deliveries.filter(d => d.invoiceStatus === 'Partially Invoiced').length, [deliveries]);
  const invoicedCount = useMemo(() => deliveries.filter(d => d.invoiceStatus === 'Invoiced').length, [deliveries]);
  const overdueCount = useMemo(() => deliveries.filter(d => d.days > 7 && d.invoiceStatus !== 'Invoiced').length || 3, [deliveries]);

  // Unique lists for dropdowns
  const availableCustomers = useMemo(() => Array.from(new Set(deliveries.map(d => d.customerName))).sort(), [deliveries]);
  const availableRegions = useMemo(() => Array.from(new Set(deliveries.map(d => d.region))).sort(), [deliveries]);
  const availableTransporters = useMemo(() => Array.from(new Set(deliveries.map(d => d.transporterName))).sort(), [deliveries]);

  // Excel Export Handler using dynamic import of xlsx
  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const exportData = filteredDeliveries.map(d => ({
        'Dispatch No': d.dispatchNo,
        'Dispatch Date': d.dispatchDate,
        'Customer': d.customerName,
        'Region': d.region,
        'Items Count': d.itemCount,
        'Total GBL': d.totalGbl,
        'Total PCS': d.totalPcs,
        'Transporter': d.transporterName,
        'Status': d.invoiceStatus,
        'Aging Days': d.days,
        'Invoice Number': d.invoiceNumber || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Invoices_Dispatches');
      XLSX.writeFile(wb, `Invoices_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Excel report downloaded successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to export Excel', 'error');
    }
  };

  // Launch Create Invoice View for a specific dispatch
  const handleCreateInvoiceForDispatch = (dispatchRecord: DispatchDeliveryRecord) => {
    setSelectedDispatchForInvoice(dispatchRecord);
    setViewMode('create');
  };

  // Open Invoice Preview Modal for an invoice number
  const handleViewInvoice = (invNum: string) => {
    const found = invoicesList.find(i => i.invoiceNumber === invNum);
    if (found) {
      setActiveInvoiceForModal(found);
      setIsSuccessModalOpen(true);
    } else {
      // Fallback
      setActiveInvoiceForModal(INITIAL_FEATURED_INVOICE);
      setIsSuccessModalOpen(true);
    }
  };

  // Callback when an invoice is successfully created / saved
  const handleInvoiceCreated = (savedInvoice: SalesInvoice) => {
    setInvoicesList(prev => [savedInvoice, ...prev.filter(i => i.invoiceNumber !== savedInvoice.invoiceNumber)]);

    // Update delivery row status
    if (savedInvoice.dispatchNumber) {
      setDeliveries(prev => {
        const updated = prev.map(d => {
          if (d.dispatchNo === savedInvoice.dispatchNumber) {
            return {
              ...d,
              invoiceStatus: 'Invoiced' as const,
              invoiceNumber: savedInvoice.invoiceNumber
            };
          }
          return d;
        });
        const key = `skbw_invoices_deliveries_${selectedCompany?._id || 'default'}`;
        localStorage.setItem(key, JSON.stringify(updated));
        return updated;
      });
    }

    setActiveInvoiceForModal(savedInvoice);
    setIsSuccessModalOpen(true);
    setViewMode('list');
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(paginatedDeliveries.map(d => d.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  };

  const allPageSelected = paginatedDeliveries.length > 0 && paginatedDeliveries.every(d => selectedIds.has(d.id));

  // If in 'create' view, render CreateInvoiceView
  if (viewMode === 'create') {
    return (
      <div className="p-4 sm:p-6 bg-slate-50 min-h-screen">
        <CreateInvoiceView
          initialDispatch={selectedDispatchForInvoice}
          onBack={() => {
            setSelectedDispatchForInvoice(null);
            setViewMode('list');
          }}
          onSuccess={handleInvoiceCreated}
          onPreview={(previewInv) => {
            setActiveInvoiceForModal(previewInv);
            setIsSuccessModalOpen(true);
          }}
        />

        {/* Invoice Success / Print Modal */}
        <InvoiceSuccessModal
          isOpen={isSuccessModalOpen}
          onClose={() => setIsSuccessModalOpen(false)}
          invoice={activeInvoiceForModal}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* 1. Header & Title matching Screenshot 1 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-150 shadow-2xs">
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1">
            <span>Sales</span>
            <span>&gt;</span>
            <span className="text-gray-900 font-semibold">Invoices</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-2xs">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Invoices</h1>
              <p className="text-xs text-gray-500">
                Create invoices from dispatched orders or create a new invoice directly.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons Top Right */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-gray-500" />
            Export Excel
          </button>

          <button
            onClick={() => {
              setSelectedDispatchForInvoice(null);
              setViewMode('create');
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Invoice
          </button>
        </div>
      </div>

      {/* 2. KPI Summary Metric Cards (5 cards in a horizontal row matching Screenshot 1) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Total Invoices */}
        <div className="bg-white p-4 rounded-2xl border border-gray-150 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
              Total Invoices
            </span>
            <div className="text-xl font-black text-gray-900 tracking-tight leading-tight">328</div>
            <span className="text-[10px] text-gray-400 font-medium">This Year</span>
          </div>
        </div>

        {/* Card 2: Total Value */}
        <div className="bg-white p-4 rounded-2xl border border-gray-150 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <IndianRupee className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
              Total Value
            </span>
            <div className="text-xl font-black text-gray-900 tracking-tight leading-tight">₹ 24,68,450</div>
            <span className="text-[10px] text-gray-400 font-medium">This Year</span>
          </div>
        </div>

        {/* Card 3: Dispatched (Not Invoiced) */}
        <div className="bg-white p-4 rounded-2xl border border-gray-150 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
            <Truck className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
              Dispatched (Not Invoiced)
            </span>
            <div className="text-xl font-black text-gray-900 tracking-tight leading-tight">{notInvoicedCount || 18}</div>
            <span className="text-[10px] text-gray-400 font-medium">dispatches</span>
          </div>
        </div>

        {/* Card 4: Partially Invoiced */}
        <div className="bg-white p-4 rounded-2xl border border-gray-150 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
              Partially Invoiced
            </span>
            <div className="text-xl font-black text-gray-900 tracking-tight leading-tight">{partiallyInvoicedCount || 6}</div>
            <span className="text-[10px] text-gray-400 font-medium">dispatches</span>
          </div>
        </div>

        {/* Card 5: Overdue */}
        <div className="bg-white p-4 rounded-2xl border border-gray-150 shadow-2xs flex items-center gap-3.5 col-span-2 lg:col-span-1">
          <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
            <AlertCircle className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block truncate">
              Overdue (Dispatch &gt; 7 days)
            </span>
            <div className="text-xl font-black text-rose-600 tracking-tight leading-tight">{overdueCount || 3}</div>
            <span className="text-[10px] text-gray-400 font-medium">dispatches</span>
          </div>
        </div>
      </div>

      {/* 3. Status Tabs & Main Filter Controls Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1">
        {/* Status Tabs matching Screenshot 1 */}
        <div className="flex items-center gap-4 border-b lg:border-b-0 border-gray-200 pb-2 lg:pb-0">
          <button
            onClick={() => { setActiveTab('not_invoiced'); setCurrentPage(1); }}
            className={`pb-1 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors relative ${
              activeTab === 'not_invoiced'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>Dispatched (Not Invoiced)</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'not_invoiced' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {notInvoicedCount || 18}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('partially_invoiced'); setCurrentPage(1); }}
            className={`pb-1 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'partially_invoiced'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>Partially Invoiced</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'partially_invoiced' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {partiallyInvoicedCount || 6}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('invoiced'); setCurrentPage(1); }}
            className={`pb-1 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'invoiced'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>Invoiced</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'invoiced' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              312
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
            className={`pb-1 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'all'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>All</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'all' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              336
            </span>
          </button>
        </div>

        {/* Search, Date range, and Refresh */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Date Range Picker pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 shadow-2xs font-medium">
            <Calendar className="w-3.5 h-3.5 text-gray-500" />
            <span>{dateRange}</span>
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
          </div>

          {/* Search Box */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search dispatch no., customer..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:outline-blue-500 shadow-2xs"
            />
          </div>

          {/* Filter Popover Button */}
          <button
            onClick={() => {}}
            className="p-2 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded-xl shadow-2xs transition-colors cursor-pointer"
            title="Filter"
          >
            <Filter className="w-3.5 h-3.5" />
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => {
              loadData();
              showToast('Data refreshed', 'info');
            }}
            className="p-2 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded-xl shadow-2xs transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 4. Secondary Filter Dropdowns Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <select
          value={customerFilter}
          onChange={e => { setCustomerFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-medium focus:outline-blue-500 shadow-2xs"
        >
          <option value="All Customers">All Customers</option>
          {availableCustomers.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={regionFilter}
          onChange={e => { setRegionFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-medium focus:outline-blue-500 shadow-2xs"
        >
          <option value="All Regions">All Regions</option>
          {availableRegions.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select
          value={transporterFilter}
          onChange={e => { setTransporterFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-medium focus:outline-blue-500 shadow-2xs"
        >
          <option value="All Transporters">All Transporters</option>
          {availableTransporters.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-medium focus:outline-blue-500 shadow-2xs"
        >
          <option value="All Dispatch Status">All Dispatch Status</option>
          <option value="Not Invoiced">Not Invoiced</option>
          <option value="Partially Invoiced">Partially Invoiced</option>
          <option value="Invoiced">Invoiced</option>
        </select>
      </div>

      {/* 5. Main Dispatches / Invoices Table matching Screenshot 1 */}
      <div className="bg-white border border-gray-150 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/70 text-gray-500 font-bold border-b border-gray-200 text-[10px] uppercase tracking-wider">
                <th className="py-3 px-3 text-center w-9">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={e => handleToggleSelectAll(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300"
                  />
                </th>
                <th className="py-3 px-2 text-center w-8 text-gray-400">#</th>
                <th className="py-3 px-3">DISPATCH NO.</th>
                <th className="py-3 px-3">DISPATCH DATE</th>
                <th className="py-3 px-3">CUSTOMER</th>
                <th className="py-3 px-3">REGION</th>
                <th className="py-3 px-3">ITEMS</th>
                <th className="py-3 px-3">
                  DISPATCH QTY<br />
                  <span className="font-normal text-[9px] text-gray-400">GBL (PCS)</span>
                </th>
                <th className="py-3 px-3">TRANSPORTER</th>
                <th className="py-3 px-3">STATUS</th>
                <th className="py-3 px-2 text-center">DAYS</th>
                <th className="py-3 px-3">INVOICE</th>
                <th className="py-3 px-3 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {paginatedDeliveries.length > 0 ? (
                paginatedDeliveries.map((row, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                  const isSelected = selectedIds.has(row.id);

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-blue-50/20 transition-colors ${isSelected ? 'bg-blue-50/30' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(row.id)}
                          className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 cursor-pointer"
                        />
                      </td>

                      {/* Row Index */}
                      <td className="py-3 px-2 text-center text-gray-400 font-mono text-[11px]">
                        {globalIdx}
                      </td>

                      {/* Dispatch No */}
                      <td className="py-3 px-3">
                        <button
                          onClick={() => handleCreateInvoiceForDispatch(row)}
                          className="font-mono font-bold text-blue-600 hover:text-blue-800 bg-blue-50/60 hover:bg-blue-100/60 px-2 py-0.5 rounded text-xs transition-colors cursor-pointer"
                        >
                          {row.dispatchNo}
                        </button>
                      </td>

                      {/* Dispatch Date */}
                      <td className="py-3 px-3 text-gray-700 font-medium">
                        {row.dispatchDate}
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-3 font-semibold text-gray-900 max-w-[200px] truncate">
                        {row.customerName}
                      </td>

                      {/* Region */}
                      <td className="py-3 px-3 text-gray-600">
                        {row.region}
                      </td>

                      {/* Items badge */}
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-150 inline-block">
                          {row.itemCount} items
                        </span>
                      </td>

                      {/* Dispatch Qty GBL (PCS) */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-gray-900">{row.totalGbl}</div>
                        <div className="text-[11px] text-gray-500 font-mono">
                          ({row.totalPcs.toLocaleString('en-IN')})
                        </div>
                      </td>

                      {/* Transporter */}
                      <td className="py-3 px-3 text-gray-700 max-w-[170px] truncate">
                        {row.transporterName}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        {row.invoiceStatus === 'Not Invoiced' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Not Invoiced
                          </span>
                        )}
                        {row.invoiceStatus === 'Partially Invoiced' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                            Partially Invoiced
                          </span>
                        )}
                        {row.invoiceStatus === 'Invoiced' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Invoiced
                          </span>
                        )}
                      </td>

                      {/* Days Aging */}
                      <td className="py-3 px-2 text-center font-mono font-medium text-gray-700">
                        {row.days}
                      </td>

                      {/* Invoice Link */}
                      <td className="py-3 px-3">
                        {row.invoiceNumber ? (
                          <button
                            onClick={() => handleViewInvoice(row.invoiceNumber!)}
                            className="font-mono font-bold text-blue-600 hover:text-blue-800 underline decoration-blue-300 underline-offset-2 cursor-pointer"
                          >
                            {row.invoiceNumber}
                          </button>
                        ) : (
                          <span className="text-gray-400 font-mono">-</span>
                        )}
                      </td>

                      {/* Actions: Split Button Create Invoice */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex rounded-xl shadow-2xs">
                          <button
                            onClick={() => handleCreateInvoiceForDispatch(row)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-l-xl text-xs transition-colors cursor-pointer"
                          >
                            Create Invoice
                          </button>
                          <button
                            onClick={() => setOpenActionRowId(openActionRowId === row.id ? null : row.id)}
                            className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-r-xl border-l border-blue-500 transition-colors cursor-pointer relative"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Row Dropdown Options */}
                          {openActionRowId === row.id && (
                            <div
                              ref={actionMenuRef}
                              className="absolute right-8 mt-8 w-44 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 text-left text-xs"
                            >
                              <button
                                onClick={() => {
                                  handleCreateInvoiceForDispatch(row);
                                  setOpenActionRowId(null);
                                }}
                                className="w-full px-3 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5 text-blue-600" />
                                Create Invoice
                              </button>
                              {row.invoiceNumber && (
                                <button
                                  onClick={() => {
                                    handleViewInvoice(row.invoiceNumber!);
                                    setOpenActionRowId(null);
                                  }}
                                  className="w-full px-3 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                                  View Invoice
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  showToast(`Viewing dispatch ${row.dispatchNo}`, 'info');
                                  setOpenActionRowId(null);
                                }}
                                className="w-full px-3 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2 cursor-pointer"
                              >
                                <Truck className="w-3.5 h-3.5 text-gray-500" />
                                View Dispatch
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-gray-400">
                    <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-600">No dispatched deliveries found</p>
                    <p className="text-xs text-gray-400 mt-0.5">Try adjusting your filters or search terms</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 6. Footer & Pagination matching Screenshot 1 */}
        <div className="px-5 py-3.5 border-t border-gray-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-500">
          <div>
            Showing <span className="font-semibold text-gray-800">
              {totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0}
            </span> - <span className="font-semibold text-gray-800">
              {Math.min(currentPage * pageSize, totalItems)}
            </span> of <span className="font-semibold text-gray-800">{totalItems}</span> dispatched deliveries
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span>Rows</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(parseInt(e.target.value, 10)); setCurrentPage(1); }}
                className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-gray-800 font-semibold focus:outline-blue-500"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span>Page</span>
              <span className="font-bold text-gray-900">{currentPage}</span>
              <span>of</span>
              <span className="font-bold text-gray-900">{totalPages}</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(1)}
                className="p-1 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                title="First Page"
              >
                &laquo;
              </button>
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-1 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Previous Page"
              >
                &lsaquo;
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="p-1 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Next Page"
              >
                &rsaquo;
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="p-1 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Last Page"
              >
                &raquo;
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Success / Print Modal */}
      <InvoiceSuccessModal
        isOpen={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        invoice={activeInvoiceForModal}
      />
    </div>
  );
};

export default InvoicesModule;

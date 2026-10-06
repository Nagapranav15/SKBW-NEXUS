import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText, Truck, Clock, AlertCircle, Search, Filter, RefreshCw,
  Download, Plus, ChevronDown, ChevronLeft, ChevronRight, Check,
  Calendar, Eye, Printer, MoreVertical, IndianRupee, Layers, Package
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SalesInvoice, getInvoices, getLocalInvoices } from '../../api/invoiceApi';
import { getDeliveryChallans } from '../../api/deliveryChallanApi';
import { DispatchDeliveryRecord } from './invoiceSampleData';
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

  // Deliveries & Invoices Data - 100% Dynamic, starts empty
  const [deliveries, setDeliveries] = useState<DispatchDeliveryRecord[]>([]);
  const [invoicesList, setInvoicesList] = useState<SalesInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Tab state: 'not_invoiced' | 'partially_invoiced' | 'invoiced' | 'all'
  type TabType = 'not_invoiced' | 'partially_invoiced' | 'invoiced' | 'all';
  const [activeTab, setActiveTab] = useState<TabType>('not_invoiced');

  // Filter Bar state
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

  // Fetch real invoices and deliveries from backend & local storage
  const loadData = async () => {
    setIsLoading(true);
    try {
      const companyId = selectedCompany?._id;

      // 1. Fetch real sales invoices
      let realInvoices: SalesInvoice[] = [];
      try {
        const apiInvs = await getInvoices(companyId);
        if (Array.isArray(apiInvs)) realInvoices = apiInvs;
      } catch (err) {
        console.warn('API getInvoices fallback to local:', err);
      }

      // Merge with local invoices
      const localInvs = getLocalInvoices(companyId);
      const invoiceMap = new Map<string, SalesInvoice>();
      [...localInvs, ...realInvoices].forEach(inv => {
        if (inv && inv.invoiceNumber) {
          invoiceMap.set(inv.invoiceNumber, inv);
        }
      });
      const allInvoices = Array.from(invoiceMap.values());
      setInvoicesList(allInvoices);

      // 2. Fetch real delivery challans
      let rawChallans: any[] = [];
      try {
        const challanRes = await getDeliveryChallans(companyId);
        if (Array.isArray(challanRes?.data)) {
          rawChallans = challanRes.data;
        } else if (Array.isArray(challanRes)) {
          rawChallans = challanRes;
        }
      } catch (err) {
        console.warn('API getDeliveryChallans fallback:', err);
      }

      // Merge with local delivery challans cache
      const cKey = `skbw_delivery_challans_${companyId || 'default'}`;
      const localChallans = JSON.parse(localStorage.getItem(cKey) || '[]');
      const challanMap = new Map<string, any>();
      [...localChallans, ...rawChallans].forEach(ch => {
        const k = ch?.dcNumber || ch?._id;
        if (k) challanMap.set(String(k), ch);
      });
      const combinedChallans = Array.from(challanMap.values());

      // 3. Map real delivery challans to dynamic DispatchDeliveryRecord
      const mappedDeliveries: DispatchDeliveryRecord[] = combinedChallans.map((ch: any) => {
        const dcNo = ch.dcNumber || ch.dispatchNo || '';
        const chId = String(ch._id || '');

        // Match against real invoices
        const matchedInv = allInvoices.find(inv =>
          (dcNo && inv.dispatchNumber === dcNo) ||
          (dcNo && (inv as any).deliveryChallanNumber === dcNo) ||
          (chId && String(inv.dispatchId) === chId)
        );

        const rawDate = ch.date || ch.dispatchDate || ch.createdAt?.split('T')[0] || '';
        let formattedDate = rawDate;
        if (rawDate && rawDate.includes('-')) {
          const parts = rawDate.split('T')[0].split('-');
          if (parts.length === 3) formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }

        let daysElapsed = 0;
        if (rawDate) {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) {
            const diffMs = Date.now() - d.getTime();
            daysElapsed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
          }
        }

        const items = Array.isArray(ch.items) ? ch.items.map((it: any, idx: number) => {
          const gbl = Number(it.deliveredQty || it.quantity || it.orderedQty || 0);
          const pcs = Number(it.deliveredPcs || it.pcs || gbl * 100);
          const rate = Number(it.price || it.rate || it.unitPrice || 0);
          const amount = Number(it.total || (gbl * rate) || 0);
          return {
            itemCode: it.skuCode || it.itemCode || `ITM-${idx + 1}`,
            itemName: it.itemName || it.description || 'Item',
            dispatchedGbl: gbl,
            dispatchedPcs: pcs,
            uom: it.uom || 'GBL',
            locationName: it.locationName || 'Main Storage',
            rate,
            amount
          };
        }) : [];

        const totalGbl = Number(ch.totalGbl) || items.reduce((s, it) => s + it.dispatchedGbl, 0);
        const totalPcs = Number(ch.totalPcs) || items.reduce((s, it) => s + it.dispatchedPcs, 0);
        const totalAmount = Number(ch.subtotal || ch.total) || items.reduce((s, it) => s + it.amount, 0);

        let invStatus: 'Not Invoiced' | 'Partially Invoiced' | 'Invoiced' = 'Not Invoiced';
        if (matchedInv) {
          invStatus = 'Invoiced';
        } else if (ch.invoiceStatus) {
          invStatus = ch.invoiceStatus;
        }

        let parsedBillTo = undefined;
        if (typeof ch.billToAddress === 'string' && ch.billToAddress.trim()) {
          const lines = ch.billToAddress.split('\n').map((l: string) => l.trim()).filter(Boolean);
          parsedBillTo = {
            name: ch.customerName || lines[0] || 'Customer',
            firmName: ch.customerName || lines[0] || 'Customer',
            address: lines.slice(1, -1).join(', ') || lines[1] || 'Main Address',
            city: ch.city || '',
            state: ch.region || '',
            pincode: '',
            phone: ch.customerPhone || ''
          };
        } else if (typeof ch.billToAddress === 'object') {
          parsedBillTo = ch.billToAddress;
        }

        let parsedShipTo = undefined;
        if (typeof ch.shipToAddress === 'string' && ch.shipToAddress.trim()) {
          const lines = ch.shipToAddress.split('\n').map((l: string) => l.trim()).filter(Boolean);
          parsedShipTo = {
            name: ch.customerName || lines[0] || 'Customer',
            firmName: ch.customerName || lines[0] || 'Customer',
            address: lines.slice(1, -1).join(', ') || lines[1] || 'Main Address',
            city: ch.city || '',
            state: ch.region || '',
            pincode: '',
            phone: ch.customerPhone || ''
          };
        } else if (typeof ch.shipToAddress === 'object') {
          parsedShipTo = ch.shipToAddress;
        }

        return {
          id: String(ch._id || dcNo),
          dispatchNo: dcNo,
          dispatchDate: formattedDate,
          customerName: ch.customerName || 'Customer',
          customerPhone: ch.customerPhone || '',
          region: ch.region || '',
          city: ch.city || '',
          orderNumber: ch.orderNumber || (ch.orderId ? 'SO-LINKED' : 'DIRECT'),
          itemCount: items.length,
          totalGbl,
          totalPcs,
          transporterName: ch.transporterName || 'Self / Not specified',
          vehicleNumber: ch.vehicleNumber || '—',
          lrNumber: ch.lrNumber || '—',
          lrDate: ch.lrDate || '',
          packagesCount: ch.items?.length || 1,
          invoiceStatus: invStatus,
          invoiceNumber: matchedInv?.invoiceNumber,
          invoiceDate: matchedInv?.invoiceDate,
          invoiceAmount: matchedInv?.grandTotal,
          days: daysElapsed,
          billToAddress: parsedBillTo,
          shipToAddress: parsedShipTo,
          items
        };
      });

      setDeliveries(mappedDeliveries);
    } catch (err) {
      console.warn('loadData error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCompany?._id]);

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

  // 100% Dynamic Metrics - Computed strictly from real data
  const notInvoicedCount = useMemo(() => deliveries.filter(d => d.invoiceStatus === 'Not Invoiced').length, [deliveries]);
  const partiallyInvoicedCount = useMemo(() => deliveries.filter(d => d.invoiceStatus === 'Partially Invoiced').length, [deliveries]);
  const invoicedDeliveriesCount = useMemo(() => deliveries.filter(d => d.invoiceStatus === 'Invoiced').length, [deliveries]);
  const overdueCount = useMemo(() => deliveries.filter(d => d.days > 7 && d.invoiceStatus !== 'Invoiced').length, [deliveries]);

  const totalInvoicesCount = invoicesList.length;
  const totalInvoicedValue = useMemo(() => {
    return invoicesList.reduce((sum, inv) => sum + (Number(inv.grandTotal || inv.subtotal || 0)), 0);
  }, [invoicesList]);

  // Unique lists for dropdowns - Derived dynamically from real data
  const availableCustomers = useMemo(() => Array.from(new Set(deliveries.map(d => d.customerName).filter(Boolean))).sort(), [deliveries]);
  const availableRegions = useMemo(() => Array.from(new Set(deliveries.map(d => d.region).filter(Boolean))).sort(), [deliveries]);
  const availableTransporters = useMemo(() => Array.from(new Set(deliveries.map(d => d.transporterName).filter(Boolean))).sort(), [deliveries]);

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

  // Open Invoice Preview Modal for a real invoice
  const handleViewInvoice = (invNum: string) => {
    const found = invoicesList.find(i => i.invoiceNumber === invNum);
    if (found) {
      setActiveInvoiceForModal(found);
      setIsSuccessModalOpen(true);
    } else {
      showToast(`Invoice ${invNum} details not found`, 'info');
    }
  };

  // Callback when an invoice is successfully created / saved
  const handleInvoiceCreated = (savedInvoice: SalesInvoice) => {
    setInvoicesList(prev => [savedInvoice, ...prev.filter(i => i.invoiceNumber !== savedInvoice.invoiceNumber)]);

    // Update delivery row status dynamically
    if (savedInvoice.dispatchNumber) {
      setDeliveries(prev => {
        return prev.map(d => {
          if (d.dispatchNo === savedInvoice.dispatchNumber) {
            return {
              ...d,
              invoiceStatus: 'Invoiced' as const,
              invoiceNumber: savedInvoice.invoiceNumber,
              invoiceDate: savedInvoice.invoiceDate,
              invoiceAmount: savedInvoice.grandTotal
            };
          }
          return d;
        });
      });
    }

    setActiveInvoiceForModal(savedInvoice);
    setIsSuccessModalOpen(true);
    setViewMode('list');
    loadData();
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
          allDeliveries={deliveries}
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
        {activeInvoiceForModal && (
          <InvoiceSuccessModal
            isOpen={isSuccessModalOpen}
            onClose={() => setIsSuccessModalOpen(false)}
            invoice={activeInvoiceForModal}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* 1. Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-150 shadow-2xs">
        <div>
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
                Generate and manage GST sales invoices directly from delivery challans.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons Top Right */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            disabled={deliveries.length === 0}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-colors shadow-2xs ${
              deliveries.length > 0
                ? 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 cursor-pointer'
                : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
            }`}
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

      {/* 2. KPI Summary Metric Cards - 100% Dynamic from real data */}
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
            <div className="text-xl font-black text-gray-900 tracking-tight leading-tight">
              {totalInvoicesCount}
            </div>
            <span className="text-[10px] text-gray-400 font-medium">Generated Invoices</span>
          </div>
        </div>

        {/* Card 2: Total Value */}
        <div className="bg-white p-4 rounded-2xl border border-gray-150 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <IndianRupee className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
              Invoiced Value
            </span>
            <div className="text-xl font-black text-emerald-700 tracking-tight leading-tight">
              ₹{totalInvoicedValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-gray-400 font-medium">Total Billed</span>
          </div>
        </div>

        {/* Card 3: Dispatched (Not Invoiced) */}
        <div className="bg-white p-4 rounded-2xl border border-gray-150 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
            <Truck className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
              Ready to Invoice
            </span>
            <div className="text-xl font-black text-purple-700 tracking-tight leading-tight">
              {notInvoicedCount}
            </div>
            <span className="text-[10px] text-gray-400 font-medium">pending dispatches</span>
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
            <div className="text-xl font-black text-amber-700 tracking-tight leading-tight">
              {partiallyInvoicedCount}
            </div>
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
              Aging (&gt; 7 Days)
            </span>
            <div className="text-xl font-black text-rose-600 tracking-tight leading-tight">
              {overdueCount}
            </div>
            <span className="text-[10px] text-gray-400 font-medium">pending dispatches</span>
          </div>
        </div>
      </div>

      {/* 3. Status Tabs & Main Filter Controls Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1">
        {/* Status Tabs with Dynamic Real Counts */}
        <div className="flex items-center gap-4 border-b lg:border-b-0 border-gray-200 pb-2 lg:pb-0 overflow-x-auto">
          <button
            onClick={() => { setActiveTab('not_invoiced'); setCurrentPage(1); }}
            className={`pb-1 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'not_invoiced'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>Dispatched (Not Invoiced)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'not_invoiced' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {notInvoicedCount}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('partially_invoiced'); setCurrentPage(1); }}
            className={`pb-1 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'partially_invoiced'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>Partially Invoiced</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'partially_invoiced' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {partiallyInvoicedCount}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('invoiced'); setCurrentPage(1); }}
            className={`pb-1 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'invoiced'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>Invoiced</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'invoiced' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {invoicedDeliveriesCount}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
            className={`pb-1 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'all'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>All Dispatches</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'all' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {deliveries.length}
            </span>
          </button>
        </div>

        {/* Search, Refresh Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search dispatch no., customer, invoice..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:outline-blue-500 shadow-2xs"
            />
          </div>

          <button
            onClick={() => {
              loadData();
              showToast('Data refreshed dynamically', 'info');
            }}
            className="p-2 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded-xl shadow-2xs transition-colors cursor-pointer"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 4. Secondary Filter Dropdowns Row - 100% Dynamic */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <select
          value={customerFilter}
          onChange={e => { setCustomerFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-medium focus:outline-blue-500 shadow-2xs cursor-pointer"
        >
          <option value="All Customers">All Customers ({availableCustomers.length})</option>
          {availableCustomers.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={regionFilter}
          onChange={e => { setRegionFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-medium focus:outline-blue-500 shadow-2xs cursor-pointer"
        >
          <option value="All Regions">All Regions ({availableRegions.length})</option>
          {availableRegions.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select
          value={transporterFilter}
          onChange={e => { setTransporterFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-medium focus:outline-blue-500 shadow-2xs cursor-pointer"
        >
          <option value="All Transporters">All Transporters ({availableTransporters.length})</option>
          {availableTransporters.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-medium focus:outline-blue-500 shadow-2xs cursor-pointer"
        >
          <option value="All Dispatch Status">All Dispatch Status</option>
          <option value="Not Invoiced">Not Invoiced</option>
          <option value="Partially Invoiced">Partially Invoiced</option>
          <option value="Invoiced">Invoiced</option>
        </select>
      </div>

      {/* 5. Main Dispatches / Invoices Table */}
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
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="py-16 text-center text-gray-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    <p className="font-semibold text-xs text-gray-600">Loading dynamic invoice and dispatch records...</p>
                  </td>
                </tr>
              ) : paginatedDeliveries.length > 0 ? (
                paginatedDeliveries.map((row, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                  const isSelected = selectedIds.has(row.id);

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-blue-50/20 transition-colors ${
                        isSelected ? 'bg-blue-50/30' : ''
                      }`}
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
                      <td className="py-3 px-2 text-center text-gray-400 font-mono">
                        {globalIdx}
                      </td>

                      {/* Dispatch No */}
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-gray-900 block">
                          {row.dispatchNo}
                        </span>
                        <span className="text-[10px] text-gray-400 block font-mono">
                          {row.orderNumber}
                        </span>
                      </td>

                      {/* Dispatch Date */}
                      <td className="py-3 px-3 text-gray-700 font-mono whitespace-nowrap">
                        {row.dispatchDate}
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-gray-900 leading-snug">
                          {row.customerName}
                        </div>
                        {row.customerPhone && (
                          <div className="text-[10px] text-gray-400 font-mono">
                            {row.customerPhone}
                          </div>
                        )}
                      </td>

                      {/* Region */}
                      <td className="py-3 px-3 text-gray-600">
                        {row.region || (row.city ? row.city : '—')}
                      </td>

                      {/* Items */}
                      <td className="py-3 px-3 font-medium text-gray-700">
                        {row.itemCount} items
                      </td>

                      {/* QTY GBL / PCS */}
                      <td className="py-3 px-3 font-mono font-medium text-gray-800">
                        <span>{row.totalGbl} GBL</span>
                        <span className="text-gray-400 text-[10px] ml-1">
                          ({row.totalPcs.toLocaleString()} pcs)
                        </span>
                      </td>

                      {/* Transporter */}
                      <td className="py-3 px-3 text-gray-600 truncate max-w-[140px]" title={row.transporterName}>
                        {row.transporterName}
                      </td>

                      {/* Invoice Status Pill */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {row.invoiceStatus === 'Invoiced' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="w-2.5 h-2.5" />
                            Invoiced
                          </span>
                        )}
                        {row.invoiceStatus === 'Partially Invoiced' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Partially Invoiced
                          </span>
                        )}
                        {row.invoiceStatus === 'Not Invoiced' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            Not Invoiced
                          </span>
                        )}
                      </td>

                      {/* Days Elapsed */}
                      <td className="py-3 px-2 text-center font-mono text-gray-600 font-semibold">
                        {row.days}
                      </td>

                      {/* Invoice Link / Status */}
                      <td className="py-3 px-3">
                        {row.invoiceNumber ? (
                          <button
                            onClick={() => handleViewInvoice(row.invoiceNumber!)}
                            className="text-blue-600 hover:text-blue-800 font-mono font-bold text-xs underline cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>{row.invoiceNumber}</span>
                            <Eye className="w-3 h-3 text-blue-500" />
                          </button>
                        ) : (
                          <span className="text-gray-400 font-mono text-[11px]">—</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {row.invoiceStatus !== 'Invoiced' ? (
                          <button
                            onClick={() => handleCreateInvoiceForDispatch(row)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-2xs cursor-pointer inline-flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Create Invoice</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleViewInvoice(row.invoiceNumber!)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={13} className="py-16 text-center text-gray-400">
                    <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-gray-600">
                      {deliveries.length === 0
                        ? 'No delivery challans recorded yet.'
                        : 'No dispatches match the selected filter criteria.'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {deliveries.length === 0
                        ? 'Create a dispatch in the Dispatch module to see it ready for invoicing.'
                        : 'Try adjusting your filters or search terms.'}
                    </p>
                    {deliveries.length === 0 && (
                      <button
                        onClick={() => {
                          setSelectedDispatchForInvoice(null);
                          setViewMode('create');
                        }}
                        className="mt-3 px-3.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create Standalone Invoice
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 6. Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-gray-50/50 border-t border-gray-150 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span>Showing</span>
            <span className="font-semibold text-gray-900">
              {deliveries.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </span>
            <span>to</span>
            <span className="font-semibold text-gray-900">
              {Math.min(currentPage * pageSize, totalItems)}
            </span>
            <span>of</span>
            <span className="font-semibold text-gray-900">{totalItems}</span>
            <span>dispatches</span>

            <span className="mx-2 text-gray-300">|</span>

            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-xs text-gray-700 cursor-pointer shadow-2xs font-semibold"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className={`p-1.5 rounded-lg border transition-colors ${
                currentPage <= 1
                  ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border-gray-200 cursor-pointer'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className={`p-1.5 rounded-lg border transition-colors ${
                currentPage >= totalPages
                  ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border-gray-200 cursor-pointer'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicesModule;

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart3, TrendingUp, FileText, ShoppingCart, Search, Filter,
  Calendar, Download, RefreshCw, Printer, ChevronDown, Eye, X,
  Building, MapPin, Phone, CheckCircle2, Clock, AlertCircle, ArrowUpDown,
  ChevronLeft, ChevronRight, Layers, IndianRupee, Package, ArrowUp, ArrowDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import { getInvoices, SalesInvoice } from '../../api/invoiceApi';
import { getDeliveryChallans } from '../../api/deliveryChallanApi';
import { getParties } from '../../api/partyApi';
import { getSkusV2 } from '../../api/mfgApiV2';
import { showToast } from '../ui/Toast';

export type ReportTabType = 'sales_register' | 'receivables' | 'sku_sales' | 'regional';

export interface SalesReportRow {
  id: string;
  date: string;
  invoiceNo: string;
  dcNo?: string;
  customerName: string;
  customerId?: string;
  city?: string;
  region?: string;
  itemsCount: number;
  totalGbl: number;
  totalPcs: number;
  totalAmount: number;
  status: 'paid' | 'unpaid' | 'partial' | 'pending';
  items?: any[];
}

export interface ReceivablesReportRow {
  customerId: string;
  customerName: string;
  code?: string;
  phone?: string;
  city?: string;
  region?: string;
  creditLimit: number;
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
  invoiceCount: number;
  lastInvoiceDate?: string;
}

export interface SkuSalesReportRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  category: string;
  totalGblSold: number;
  totalPcsSold: number;
  totalRevenue: number;
  avgRate: number;
  orderCount: number;
}

export interface RegionalReportRow {
  region: string;
  customerCount: number;
  totalOrders: number;
  totalGbl: number;
  totalRevenue: number;
}

// Helper clean string
const cleanVal = (val: any, fallback = ''): string => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val.trim() || fallback;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (val.name) return cleanVal(val.name, fallback);
    if (val.firmName) return cleanVal(val.firmName, fallback);
    if (val._id) return String(val._id);
  }
  return fallback;
};

const SalesReports: React.FC = () => {
  const { selectedCompany } = useAuth();

  // Active Tab
  const [activeTab, setActiveTab] = useState<ReportTabType>('sales_register');

  // Raw API Data
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('ALL');
  const [selectedRegion, setSelectedRegion] = useState('ALL');

  // Date Filter
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [datePreset, setDatePreset] = useState<'All' | 'Today' | 'This Week' | 'This Month' | 'Custom'>('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const dateFilterRef = useRef<HTMLDivElement>(null);

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortField, setSortField] = useState<string>('date');
  const [sortAsc, setSortAsc] = useState(false);

  // Detail Modal State
  const [selectedRowDetail, setSelectedRowDetail] = useState<any | null>(null);

  // Click outside listener for date filter popover
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(e.target as Node)) {
        setShowDateFilter(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Fetch dynamic report data from Backend APIs & Local Storage
  const loadReportData = async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    try {
      const companyId = selectedCompany?._id;

      const [invsRes, dcsRes, partiesRes, skusRes] = await Promise.all([
        getInvoices(companyId).catch(() => [] as SalesInvoice[]),
        getDeliveryChallans(companyId).catch(() => null),
        getParties({ company: companyId, limit: 1000 }).catch(() => null),
        getSkusV2(companyId).catch(() => [])
      ]);

      // 1. Process Invoices
      const invList = Array.isArray(invsRes) ? invsRes : [];
      const localInvsKey = `skbw_local_invoices_${companyId || 'default'}`;
      let localInvs: any[] = [];
      try {
        localInvs = JSON.parse(localStorage.getItem(localInvsKey) || '[]');
      } catch (e) {
        console.warn(e);
      }
      const combinedInvs = [...localInvs, ...invList];
      setInvoices(combinedInvs);

      // 2. Process Delivery Challans
      const dcList = dcsRes?.data?.deliveryChallans || dcsRes?.deliveryChallans || (Array.isArray(dcsRes) ? dcsRes : []);
      setDeliveries(dcList);

      // 3. Process Parties
      const partyList = partiesRes?.data?.parties || partiesRes?.data || (Array.isArray(partiesRes) ? partiesRes : []);
      let localParties: any[] = [];
      try {
        localParties = JSON.parse(localStorage.getItem(`skbw_parties_${companyId || 'default'}`) || '[]');
      } catch (e) {
        console.warn(e);
      }
      setParties([...partyList, ...localParties]);

      // 4. Process SKUs
      setSkus(Array.isArray(skusRes) ? skusRes : []);
    } catch (err) {
      console.error('Failed to load report data:', err);
      showToast('Failed to load latest report data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReportData(true);
  }, [selectedCompany?._id]);

  // Handle Preset Date Filters
  const applyDatePreset = (preset: 'All' | 'Today' | 'This Week' | 'This Month' | 'Custom') => {
    setDatePreset(preset);
    const today = new Date();
    if (preset === 'All') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'Today') {
      const iso = today.toISOString().split('T')[0];
      setStartDate(iso);
      setEndDate(iso);
    } else if (preset === 'This Week') {
      const first = new Date(today.setDate(today.getDate() - today.getDay()));
      const last = new Date(today.setDate(today.getDate() - today.getDay() + 6));
      setStartDate(first.toISOString().split('T')[0]);
      setEndDate(last.toISOString().split('T')[0]);
    } else if (preset === 'This Month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(lastDay.toISOString().split('T')[0]);
    }
    if (preset !== 'Custom') {
      setShowDateFilter(false);
    }
  };

  // Extract unique regions/cities for filter
  const availableRegions = useMemo(() => {
    const regSet = new Set<string>();
    invoices.forEach(inv => {
      const r = cleanVal(inv.region || inv.city || inv.billToAddress?.city || inv.billToAddress?.state);
      if (r) regSet.add(r);
    });
    parties.forEach(p => {
      const r = cleanVal(p.city || p.state || p.region);
      if (r) regSet.add(r);
    });
    return Array.from(regSet).sort();
  }, [invoices, parties]);

  // Extract unique customer names for filter
  const availableCustomers = useMemo(() => {
    const custMap = new Map<string, string>();
    invoices.forEach(inv => {
      const name = cleanVal(inv.customerName);
      if (name) custMap.set(name.toLowerCase(), name);
    });
    parties.forEach(p => {
      const name = cleanVal(p.firmName || p.name);
      if (name) custMap.set(name.toLowerCase(), name);
    });
    return Array.from(custMap.values()).sort();
  }, [invoices, parties]);

  // Date filtering predicate
  const isWithinDateRange = (dateStr?: string) => {
    if (!dateStr) return true;
    const itemDate = new Date(dateStr).getTime();
    if (isNaN(itemDate)) return true;
    if (startDate) {
      const start = new Date(startDate).getTime();
      if (itemDate < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate + 'T23:59:59').getTime();
      if (itemDate > end) return false;
    }
    return true;
  };

  // ── 1. Sales Register Data ──
  const salesRegisterRows = useMemo<SalesReportRow[]>(() => {
    return invoices
      .filter(inv => isWithinDateRange(inv.invoiceDate || inv.date || (inv as any).createdAt))
      .map(inv => {
        const totalGbl = (inv.items || []).reduce((s, it) => s + (Number(it.invoiceQtyGbl || it.dispatchedGbl || it.quantity) || 0), 0);
        const totalPcs = (inv.items || []).reduce((s, it) => s + (Number(it.invoiceQtyPcs || it.dispatchedPcs) || 0), 0);
        return {
          id: inv._id || inv.invoiceNumber,
          date: inv.invoiceDate || (inv as any).date || '',
          invoiceNo: inv.invoiceNumber || '—',
          dcNo: inv.dispatchNumber || (inv as any).dcNumber || '—',
          customerName: cleanVal(inv.customerName, 'Unnamed Customer'),
          customerId: inv.customerId ? String(inv.customerId) : undefined,
          city: cleanVal(inv.city || inv.billToAddress?.city),
          region: cleanVal(inv.region || inv.state || inv.billToAddress?.state),
          itemsCount: (inv.items || []).length,
          totalGbl,
          totalPcs: totalPcs || totalGbl * 100,
          totalAmount: Number(inv.grandTotal || inv.subtotal || 0),
          status: ((inv.status || 'unpaid').toLowerCase() as any),
          items: inv.items || []
        };
      });
  }, [invoices, startDate, endDate]);

  // ── 2. Receivables Report Data ──
  const receivablesRows = useMemo<ReceivablesReportRow[]>(() => {
    const custMap = new Map<string, ReceivablesReportRow>();

    // Pre-populate with directory parties
    parties.forEach(p => {
      const name = cleanVal(p.firmName || p.name);
      if (!name) return;
      const key = name.toLowerCase();
      custMap.set(key, {
        customerId: String(p._id || p.id || key),
        customerName: name,
        code: cleanVal(p.customerCode || p.code),
        phone: cleanVal(p.mobile || p.phone),
        city: cleanVal(p.city || p.billingAddress?.city),
        region: cleanVal(p.region || p.state || p.billingAddress?.state),
        creditLimit: Number(p.creditLimit || 0),
        totalInvoiced: 0,
        totalPaid: 0,
        outstandingBalance: Number(p.openingBalance || p.outstandingBalance || 0),
        invoiceCount: 0,
        lastInvoiceDate: undefined
      });
    });

    // Accumulate invoices
    invoices.forEach(inv => {
      const name = cleanVal(inv.customerName);
      if (!name) return;
      const key = name.toLowerCase();
      const existing = custMap.get(key) || {
        customerId: String(inv.customerId || key),
        customerName: name,
        code: '',
        phone: cleanVal(inv.billToAddress?.phone),
        city: cleanVal(inv.city || inv.billToAddress?.city),
        region: cleanVal(inv.region || inv.state || inv.billToAddress?.state),
        creditLimit: 0,
        totalInvoiced: 0,
        totalPaid: 0,
        outstandingBalance: 0,
        invoiceCount: 0,
        lastInvoiceDate: undefined
      };

      const invDate = inv.invoiceDate || (inv as any).date;
      if (isWithinDateRange(invDate)) {
        const invTotal = Number(inv.grandTotal || inv.subtotal || 0);
        const invPaid = inv.status === 'paid' ? invTotal : Number(inv.paidAmount || 0);
        const invDue = Math.max(0, invTotal - invPaid);

        existing.totalInvoiced += invTotal;
        existing.totalPaid += invPaid;
        existing.outstandingBalance += invDue;
        existing.invoiceCount += 1;

        if (!existing.lastInvoiceDate || (invDate && invDate > existing.lastInvoiceDate)) {
          existing.lastInvoiceDate = invDate;
        }
      }

      custMap.set(key, existing);
    });

    return Array.from(custMap.values()).filter(r => r.totalInvoiced > 0 || r.outstandingBalance > 0);
  }, [invoices, parties, startDate, endDate]);

  // ── 3. SKU Sales Report Data ──
  const skuSalesRows = useMemo<SkuSalesReportRow[]>(() => {
    const skuMap = new Map<string, SkuSalesReportRow>();

    // Pre-populate SKUs from master
    skus.forEach(s => {
      const code = (s.skuCode || s.name || '').toLowerCase().trim();
      if (!code) return;
      skuMap.set(code, {
        skuId: String(s._id || s.id),
        skuCode: s.skuCode || '—',
        skuName: s.name || 'Unnamed Item',
        category: s.category || 'General',
        totalGblSold: 0,
        totalPcsSold: 0,
        totalRevenue: 0,
        avgRate: Number(s.sellingPrice || s.rate || 0),
        orderCount: 0
      });
    });

    invoices.forEach(inv => {
      if (!isWithinDateRange(inv.invoiceDate || inv.date)) return;
      (inv.items || []).forEach(it => {
        const codeKey = (it.skuCode || it.itemName || '').toLowerCase().trim();
        if (!codeKey) return;
        const gbl = Number(it.invoiceQtyGbl || it.dispatchedGbl || it.quantity) || 0;
        const pcs = Number(it.invoiceQtyPcs || it.dispatchedPcs) || (gbl * (it.pcsPerGbl || 100));
        const amt = Number(it.amount || (gbl * (it.rate || 0))) || 0;

        const existing = skuMap.get(codeKey) || {
          skuId: String(it.skuId || codeKey),
          skuCode: it.skuCode || '—',
          skuName: it.itemName || 'Item',
          category: 'General',
          totalGblSold: 0,
          totalPcsSold: 0,
          totalRevenue: 0,
          avgRate: 0,
          orderCount: 0
        };

        existing.totalGblSold += gbl;
        existing.totalPcsSold += pcs;
        existing.totalRevenue += amt;
        existing.orderCount += 1;

        skuMap.set(codeKey, existing);
      });
    });

    return Array.from(skuMap.values())
      .filter(s => s.totalGblSold > 0 || s.totalRevenue > 0)
      .map(s => ({
        ...s,
        avgRate: s.totalGblSold > 0 ? Math.round((s.totalRevenue / s.totalGblSold) * 100) / 100 : s.avgRate
      }));
  }, [invoices, skus, startDate, endDate]);

  // ── 4. Regional Report Data ──
  const regionalRows = useMemo<RegionalReportRow[]>(() => {
    const regMap = new Map<string, RegionalReportRow>();

    invoices.forEach(inv => {
      if (!isWithinDateRange(inv.invoiceDate || inv.date)) return;
      const regName = cleanVal(inv.region || inv.city || inv.billToAddress?.city || inv.billToAddress?.state, 'Unassigned Region');
      const key = regName.toLowerCase();

      const existing = regMap.get(key) || {
        region: regName,
        customerCount: 0,
        totalOrders: 0,
        totalGbl: 0,
        totalRevenue: 0
      };

      const gbl = (inv.items || []).reduce((s, it) => s + (Number(it.invoiceQtyGbl || it.dispatchedGbl || it.quantity) || 0), 0);
      const amt = Number(inv.grandTotal || inv.subtotal || 0);

      existing.totalOrders += 1;
      existing.totalGbl += gbl;
      existing.totalRevenue += amt;

      regMap.set(key, existing);
    });

    return Array.from(regMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [invoices, startDate, endDate]);

  // Overall Minimal Stats Summary Bar
  const summaryStats = useMemo(() => {
    const totalRevenue = salesRegisterRows.reduce((s, r) => s + r.totalAmount, 0);
    const totalGbl = salesRegisterRows.reduce((s, r) => s + r.totalGbl, 0);
    const totalInvoices = salesRegisterRows.length;
    const totalOutstanding = receivablesRows.reduce((s, r) => s + r.outstandingBalance, 0);

    return {
      totalRevenue,
      totalGbl,
      totalInvoices,
      totalOutstanding
    };
  }, [salesRegisterRows, receivablesRows]);

  // Filtered & Sorted Current Tab Rows
  const processedRows = useMemo(() => {
    let rows: any[] = [];
    const q = searchQuery.toLowerCase().trim();

    if (activeTab === 'sales_register') {
      rows = salesRegisterRows.filter(r => {
        const matchesQuery = !q ||
          r.invoiceNo.toLowerCase().includes(q) ||
          r.dcNo?.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.region?.toLowerCase().includes(q);

        const matchesCust = selectedCustomer === 'ALL' || r.customerName.toLowerCase() === selectedCustomer.toLowerCase();
        const matchesReg = selectedRegion === 'ALL' || (r.region || r.city || '').toLowerCase() === selectedRegion.toLowerCase();

        return matchesQuery && matchesCust && matchesReg;
      });
    } else if (activeTab === 'receivables') {
      rows = receivablesRows.filter(r => {
        const matchesQuery = !q ||
          r.customerName.toLowerCase().includes(q) ||
          r.code?.toLowerCase().includes(q) ||
          r.phone?.toLowerCase().includes(q) ||
          r.city?.toLowerCase().includes(q);

        const matchesCust = selectedCustomer === 'ALL' || r.customerName.toLowerCase() === selectedCustomer.toLowerCase();
        const matchesReg = selectedRegion === 'ALL' || (r.region || r.city || '').toLowerCase() === selectedRegion.toLowerCase();

        return matchesQuery && matchesCust && matchesReg;
      });
    } else if (activeTab === 'sku_sales') {
      rows = skuSalesRows.filter(r => {
        return !q ||
          r.skuCode.toLowerCase().includes(q) ||
          r.skuName.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q);
      });
    } else if (activeTab === 'regional') {
      rows = regionalRows.filter(r => {
        const matchesQuery = !q || r.region.toLowerCase().includes(q);
        const matchesReg = selectedRegion === 'ALL' || r.region.toLowerCase() === selectedRegion.toLowerCase();
        return matchesQuery && matchesReg;
      });
    }

    // Sort
    return [...rows].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [activeTab, salesRegisterRows, receivablesRows, skuSalesRows, regionalRows, searchQuery, selectedCustomer, selectedRegion, sortField, sortAsc]);

  // Pagination Slice
  const totalPages = Math.ceil(processedRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedRows.slice(start, start + pageSize);
  }, [processedRows, currentPage, pageSize]);

  // Export to Excel
  const handleExportExcel = () => {
    let exportData: any[] = [];
    let fileName = `Sales_Report_${new Date().toISOString().split('T')[0]}`;

    if (activeTab === 'sales_register') {
      fileName = `Sales_Register_${new Date().toISOString().split('T')[0]}`;
      exportData = processedRows.map(r => ({
        'Invoice Date': r.date,
        'Invoice No': r.invoiceNo,
        'Delivery Challan No': r.dcNo,
        'Customer / Party': r.customerName,
        'Region / City': r.region || r.city || '—',
        'Line Items': r.itemsCount,
        'Total GBL': r.totalGbl,
        'Total Amount (₹)': r.totalAmount,
        'Status': r.status.toUpperCase()
      }));
    } else if (activeTab === 'receivables') {
      fileName = `Customer_Receivables_${new Date().toISOString().split('T')[0]}`;
      exportData = processedRows.map(r => ({
        'Customer Name': r.customerName,
        'Customer Code': r.code || '—',
        'Phone': r.phone || '—',
        'City / Region': r.city || r.region || '—',
        'Total Billed (₹)': r.totalInvoiced,
        'Total Paid (₹)': r.totalPaid,
        'Outstanding Balance (₹)': r.outstandingBalance,
        'Total Invoices': r.invoiceCount
      }));
    } else if (activeTab === 'sku_sales') {
      fileName = `SKU_Sales_Summary_${new Date().toISOString().split('T')[0]}`;
      exportData = processedRows.map(r => ({
        'SKU Code': r.skuCode,
        'Item Name': r.skuName,
        'Category': r.category,
        'GBL Quantity Sold': r.totalGblSold,
        'PCS Quantity Sold': r.totalPcsSold,
        'Average Rate (₹)': r.avgRate,
        'Total Revenue (₹)': r.totalRevenue
      }));
    } else if (activeTab === 'regional') {
      fileName = `Regional_Sales_Summary_${new Date().toISOString().split('T')[0]}`;
      exportData = processedRows.map(r => ({
        'Region / City': r.region,
        'Total Orders': r.totalOrders,
        'Total Volume (GBL)': r.totalGbl,
        'Total Revenue (₹)': r.totalRevenue
      }));
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${fileName}.xlsx`);
    showToast('Report exported to Excel successfully', 'success');
  };

  // Print Report Handler
  const handlePrintReport = () => {
    window.print();
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="p-4 sm:p-6 bg-slate-50/50 min-h-screen space-y-5">
      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shadow-2xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 tracking-tight">Sales & Financial Reports</h1>
              <p className="text-xs text-slate-500 font-medium">Tally-grade real-time financial ledger analytics, register logs, and receivables summary.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => loadReportData(true)}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            title="Refresh Report Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold text-xs shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={handlePrintReport}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-bold text-xs shadow-2xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* ── MINIMAL KPI STATS ROW ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Sales Billed</p>
            <p className="text-lg font-black text-slate-900 font-mono mt-0.5">₹{summaryStats.totalRevenue.toLocaleString('en-IN')}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
            <IndianRupee className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Invoices & Orders</p>
            <p className="text-lg font-black text-slate-900 font-mono mt-0.5">{summaryStats.totalInvoices.toLocaleString('en-IN')}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Volume (GBL)</p>
            <p className="text-lg font-black text-slate-900 font-mono mt-0.5">{summaryStats.totalGbl.toLocaleString('en-IN')} GBL</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold shrink-0">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Receivables</p>
            <p className="text-lg font-black text-rose-700 font-mono mt-0.5">₹{summaryStats.totalOutstanding.toLocaleString('en-IN')}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ── TOP TABS ── */}
      <div className="flex items-center gap-1.5 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-x-auto">
        <button
          onClick={() => { setActiveTab('sales_register'); setCurrentPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'sales_register'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Sales Register Log</span>
        </button>

        <button
          onClick={() => { setActiveTab('receivables'); setCurrentPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'receivables'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>Customer Receivables Statement</span>
        </button>

        <button
          onClick={() => { setActiveTab('sku_sales'); setCurrentPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'sku_sales'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>SKU / Product Sales Summary</span>
        </button>

        <button
          onClick={() => { setActiveTab('regional'); setCurrentPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'regional'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Regional / Market Analysis</span>
        </button>
      </div>

      {/* ── FILTER CONTROLS BAR ── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative w-full md:w-80">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by invoice #, customer name, SKU..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap sm:flex-nowrap">
            {/* Customer Dropdown */}
            {(activeTab === 'sales_register' || activeTab === 'receivables') && (
              <div className="flex-1 sm:flex-initial">
                <select
                  value={selectedCustomer}
                  onChange={e => { setSelectedCustomer(e.target.value); setCurrentPage(1); }}
                  className="w-full sm:w-48 py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs cursor-pointer"
                >
                  <option value="ALL">All Customers</option>
                  {availableCustomers.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Region Dropdown */}
            {availableRegions.length > 0 && (
              <div className="flex-1 sm:flex-initial">
                <select
                  value={selectedRegion}
                  onChange={e => { setSelectedRegion(e.target.value); setCurrentPage(1); }}
                  className="w-full sm:w-44 py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs cursor-pointer"
                >
                  <option value="ALL">All Regions / Cities</option>
                  {availableRegions.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Date Range Popover */}
            <div ref={dateFilterRef} className="relative flex-1 sm:flex-initial">
              <button
                type="button"
                onClick={() => setShowDateFilter(!showDateFilter)}
                className={`w-full sm:w-auto flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                  datePreset !== 'All'
                    ? 'bg-blue-50 text-blue-700 border-blue-300'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>{datePreset === 'All' ? 'Filter Date' : datePreset}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showDateFilter && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Date Presets</span>
                    <button onClick={() => setShowDateFilter(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {(['All', 'Today', 'This Week', 'This Month', 'Custom'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => applyDatePreset(p)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                          datePreset === p
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  {datePreset === 'Custom' && (
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">From Date</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={e => setStartDate(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">To Date</label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={e => setEndDate(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── DATA TABLE ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                {activeTab === 'sales_register' && (
                  <>
                    <th className="py-3 px-4 text-left cursor-pointer hover:bg-slate-100" onClick={() => handleSort('date')}>
                      <div className="flex items-center gap-1">Date <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-left cursor-pointer hover:bg-slate-100" onClick={() => handleSort('invoiceNo')}>
                      <div className="flex items-center gap-1">Invoice # <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-left">DC #</th>
                    <th className="py-3 px-4 text-left cursor-pointer hover:bg-slate-100" onClick={() => handleSort('customerName')}>
                      <div className="flex items-center gap-1">Customer / Party <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-left">Region / City</th>
                    <th className="py-3 px-4 text-right">Line Items</th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('totalGbl')}>
                      <div className="flex items-center justify-end gap-1">Qty (GBL) <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('totalAmount')}>
                      <div className="flex items-center justify-end gap-1">Amount (₹) <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </>
                )}

                {activeTab === 'receivables' && (
                  <>
                    <th className="py-3 px-4 text-left cursor-pointer hover:bg-slate-100" onClick={() => handleSort('customerName')}>
                      <div className="flex items-center gap-1">Customer / Party <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-left">City / Region</th>
                    <th className="py-3 px-4 text-left">Phone</th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('totalInvoiced')}>
                      <div className="flex items-center justify-end gap-1">Total Billed (₹) <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('totalPaid')}>
                      <div className="flex items-center justify-end gap-1">Received (₹) <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('outstandingBalance')}>
                      <div className="flex items-center justify-end gap-1">Outstanding (₹) <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-center">Invoices</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </>
                )}

                {activeTab === 'sku_sales' && (
                  <>
                    <th className="py-3 px-4 text-left cursor-pointer hover:bg-slate-100" onClick={() => handleSort('skuCode')}>
                      <div className="flex items-center gap-1">SKU Code <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-left cursor-pointer hover:bg-slate-100" onClick={() => handleSort('skuName')}>
                      <div className="flex items-center gap-1">Item Description <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-left">Category</th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('totalGblSold')}>
                      <div className="flex items-center justify-end gap-1">GBL Sold <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-right">PCS Sold</th>
                    <th className="py-3 px-4 text-right">Avg Rate (₹)</th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('totalRevenue')}>
                      <div className="flex items-center justify-end gap-1">Total Revenue (₹) <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                  </>
                )}

                {activeTab === 'regional' && (
                  <>
                    <th className="py-3 px-4 text-left cursor-pointer hover:bg-slate-100" onClick={() => handleSort('region')}>
                      <div className="flex items-center gap-1">Region / City Market <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('totalOrders')}>
                      <div className="flex items-center justify-end gap-1">Total Orders <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('totalGbl')}>
                      <div className="flex items-center justify-end gap-1">Total Volume (GBL) <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('totalRevenue')}>
                      <div className="flex items-center justify-end gap-1">Total Revenue (₹) <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                  </>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Loading report metrics...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 italic">
                    No matching report entries found for the selected criteria.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, idx) => (
                  <tr key={row.id || row.customerId || row.skuId || row.region || idx} className="hover:bg-blue-50/40 transition-colors">
                    {/* 1. SALES REGISTER TAB */}
                    {activeTab === 'sales_register' && (
                      <>
                        <td className="py-3 px-4 font-mono text-slate-600">{row.date || '—'}</td>
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">{row.invoiceNo}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">{row.dcNo}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{row.customerName}</td>
                        <td className="py-3 px-4 text-slate-600">{row.region || row.city || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono">{row.itemsCount}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">{row.totalGbl.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">₹{row.totalAmount.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            row.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : row.status === 'partial'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {row.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setSelectedRowDetail(row)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="View Transaction Breakdown"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </>
                    )}

                    {/* 2. RECEIVABLES TAB */}
                    {activeTab === 'receivables' && (
                      <>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{row.customerName}</div>
                          {row.code && <div className="text-[10px] font-mono text-slate-400">Code: {row.code}</div>}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{row.city || row.region || '—'}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{row.phone || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">₹{row.totalInvoiced.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700 font-bold">₹{row.totalPaid.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono text-rose-700 font-black">₹{row.outstandingBalance.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-center font-mono text-slate-700">{row.invoiceCount}</td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setSelectedRowDetail(row)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="View Customer Statement Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </>
                    )}

                    {/* 3. SKU SALES TAB */}
                    {activeTab === 'sku_sales' && (
                      <>
                        <td className="py-3 px-4 font-mono font-bold text-purple-700">{row.skuCode}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{row.skuName}</td>
                        <td className="py-3 px-4 text-slate-600">{row.category}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">{row.totalGblSold.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">{row.totalPcsSold.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">₹{row.avgRate.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">₹{row.totalRevenue.toLocaleString('en-IN')}</td>
                      </>
                    )}

                    {/* 4. REGIONAL TAB */}
                    {activeTab === 'regional' && (
                      <>
                        <td className="py-3 px-4 font-bold text-slate-900">{row.region}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-800">{row.totalOrders}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">{row.totalGbl.toLocaleString('en-IN')} GBL</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">₹{row.totalRevenue.toLocaleString('en-IN')}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── PAGINATION BAR ── */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-500 font-medium">
            <span>Showing {processedRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, processedRows.length)} of {processedRows.length} entries</span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="py-1 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>

            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2.5 py-1 text-xs font-bold text-slate-800">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── DETAIL BREAKDOWN MODAL ── */}
      {selectedRowDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {selectedRowDetail.invoiceNo ? `Invoice Details (${selectedRowDetail.invoiceNo})` : `Customer Statement (${selectedRowDetail.customerName})`}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">Detailed transaction breakdown</p>
                </div>
              </div>
              <button onClick={() => setSelectedRowDetail(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedRowDetail.customerName && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-xs">
                <div className="font-bold text-slate-900">{selectedRowDetail.customerName}</div>
                {selectedRowDetail.city && <div className="text-slate-500">{selectedRowDetail.city}, {selectedRowDetail.region}</div>}
                {selectedRowDetail.phone && <div className="font-mono text-slate-600">Phone: {selectedRowDetail.phone}</div>}
              </div>
            )}

            {selectedRowDetail.items && Array.isArray(selectedRowDetail.items) && selectedRowDetail.items.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">Itemized Breakdown</p>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500">
                        <th className="py-2 px-3 text-left">SKU Code</th>
                        <th className="py-2 px-3 text-left">Item Name</th>
                        <th className="py-2 px-3 text-right">Qty (GBL)</th>
                        <th className="py-2 px-3 text-right">Rate (₹)</th>
                        <th className="py-2 px-3 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedRowDetail.items.map((it: any, idx: number) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-mono font-bold text-purple-700">{it.skuCode || '—'}</td>
                          <td className="py-2 px-3 text-slate-800">{it.itemName || 'Item'}</td>
                          <td className="py-2 px-3 text-right font-mono">{it.invoiceQtyGbl || it.dispatchedGbl || it.quantity || 0}</td>
                          <td className="py-2 px-3 text-right font-mono">₹{Number(it.rate || 0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold">₹{Number(it.amount || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedRowDetail(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesReports;
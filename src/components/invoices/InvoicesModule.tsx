import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText, Truck, Package, CheckCircle2, Clock, AlertCircle,
  Search, Filter, RefreshCw, ChevronDown, ChevronRight,
  Phone, MapPin, Download, Eye, Plus, ArrowUpDown, ChevronLeft,
  Printer, X, ArrowUp, ArrowDown, Calendar, Edit3, Trash2, IndianRupee, Layers, Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import { SalesInvoice, getInvoices, getLocalInvoices, deleteInvoice } from '../../api/invoiceApi';
import { getDeliveryChallans, deleteDeliveryChallan } from '../../api/deliveryChallanApi';
import { getSkusV2 } from '../../api/mfgApiV2';
import { DispatchDeliveryRecord } from './invoiceSampleData';
import { CreateInvoiceModal } from './CreateInvoiceModal';
import { InvoiceSuccessModal } from './InvoiceSuccessModal';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { showToast } from '../ui/Toast';

export type InvoiceTabType = 'pending' | 'partial' | 'history' | 'all';
export type SortField = 'dispatchNo' | 'dispatchDate' | 'customerName' | 'region' | 'itemCount' | 'totalGbl' | 'invoiceStatus' | 'days';
export type InvoiceSortField = 'invoiceNumber' | 'invoiceDate' | 'dispatchNumber' | 'customerName' | 'region' | 'itemCount' | 'subtotal' | 'grandTotal' | 'status';

// Safe string converter to prevent 'Cannot convert object to primitive value'
const toSafeString = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    if (val._id) return toSafeString(val._id);
    if (val.id) return toSafeString(val.id);
    if (val.name) return toSafeString(val.name);
    if (val.skuCode) return toSafeString(val.skuCode);
    try {
      if (typeof val.toString === 'function') {
        const str = val.toString();
        if (str !== '[object Object]') return str;
      }
    } catch {}
    try {
      return JSON.stringify(val);
    } catch {
      return '';
    }
  }
  return '';
};

const getSafeText = (val: any, fallback = ''): string => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val.trim() || fallback;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (val.name) return getSafeText(val.name, fallback);
    if (val.firmName) return getSafeText(val.firmName, fallback);
    if (val.label) return getSafeText(val.label, fallback);
    if (val.title) return getSafeText(val.title, fallback);
    if (val._id) return toSafeString(val._id);
  }
  return fallback;
};

export const InvoicesModule: React.FC = () => {
  const { selectedCompany } = useAuth();

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDirectInvoice, setIsDirectInvoice] = useState(false);
  const [selectedDispatchForModal, setSelectedDispatchForModal] = useState<DispatchDeliveryRecord | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<SalesInvoice | null>(null);

  // Success / Print Preview Modal & Confirmation
  const [activeInvoiceForPreview, setActiveInvoiceForPreview] = useState<SalesInvoice | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [deleteConfirmInvoice, setDeleteConfirmInvoice] = useState<SalesInvoice | null>(null);

  // Raw data from backend & local caches
  const [deliveries, setDeliveries] = useState<DispatchDeliveryRecord[]>([]);
  const [invoicesList, setInvoicesList] = useState<SalesInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState<InvoiceTabType>('pending');

  // Filter Bar state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('ALL');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedTransporter, setSelectedTransporter] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Date Filter Popover
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [datePreset, setDatePreset] = useState<'All' | 'Today' | 'This Week' | 'This Month' | 'Custom'>('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const dateFilterRef = useRef<HTMLDivElement>(null);

  // Filter Popover Menu
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('dispatchNo');
  const [sortAsc, setSortAsc] = useState(false);

  const [invSortField, setInvSortField] = useState<InvoiceSortField>('invoiceNumber');
  const [invSortAsc, setInvSortAsc] = useState(false);

  // Pagination & selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Accordion Expand State (for nested items sub-table)
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  // Close popovers on click outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(e.target as Node)) {
        setShowDateFilter(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Fetch real invoices and deliveries from backend & local storage
  // Fetch real invoices and deliveries from backend & local storage with Parallel Loading & Dynamic Pricing
  const loadData = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setIsLoading(true);
    try {
      const companyId = selectedCompany?._id;

      // Parallel fetch to eliminate waterfall loading & improve speed significantly
      const [apiInvs, challanRes, skusRes] = await Promise.all([
        getInvoices(companyId).catch((err) => {
          console.warn('API getInvoices fallback to local:', err);
          return [] as SalesInvoice[];
        }),
        getDeliveryChallans(companyId).catch((err) => {
          console.warn('API getDeliveryChallans fallback:', err);
          return null;
        }),
        getSkusV2(companyId).catch(() => [])
      ]);

      // 1. Process sales invoices
      const realInvoices = Array.isArray(apiInvs) ? apiInvs : [];
      const localInvs = getLocalInvoices(companyId);
      const invoiceMap = new Map<string, SalesInvoice>();
      [...localInvs, ...realInvoices].forEach(inv => {
        if (inv && inv.invoiceNumber) {
          invoiceMap.set(toSafeString(inv.invoiceNumber), inv);
        }
      });
      const allInvoices = Array.from(invoiceMap.values());
      setInvoicesList(allInvoices);

      // 2. Build SKU Master price map for 100% dynamic rate resolution
      const skuPriceMap = new Map<string, number>();
      const rawSkus = Array.isArray(skusRes) ? skusRes : [];
      rawSkus.forEach((s: any) => {
        const sId = String(s._id || s.id || '');
        const code = (s.skuCode || '').toLowerCase().trim();
        const name = (s.name || '').toLowerCase().trim();
        const price = Number(s.sellingPrice || s.price || s.rate || s.unitPrice || 0);
        if (price > 0) {
          if (sId) skuPriceMap.set(sId, price);
          if (code) skuPriceMap.set(code, price);
          if (name) skuPriceMap.set(name, price);
        }
      });

      // 3. Process delivery challans
      let rawChallans: any[] = [];
      if (Array.isArray(challanRes?.data)) {
        rawChallans = challanRes.data;
      } else if (Array.isArray(challanRes)) {
        rawChallans = challanRes;
      }

      const cKey = `skbw_delivery_challans_${companyId || 'default'}`;
      const localChallans = JSON.parse(localStorage.getItem(cKey) || '[]');
      const challanMap = new Map<string, any>();
      [...localChallans, ...rawChallans].forEach(ch => {
        const k = toSafeString(ch?.dcNumber || ch?._id);
        if (k) challanMap.set(k, ch);
      });
      const combinedChallans = Array.from(challanMap.values());

      // 4. Map delivery challans dynamically
      const mappedDeliveries: DispatchDeliveryRecord[] = combinedChallans.map((ch: any) => {
        const dcNo = getSafeText(ch.dcNumber || ch.dispatchNo);
        const chId = toSafeString(ch._id);

        const matchedInv = allInvoices.find(inv =>
          (dcNo && toSafeString(inv.dispatchNumber) === dcNo) ||
          (dcNo && toSafeString((inv as any).deliveryChallanNumber) === dcNo) ||
          (chId && toSafeString(inv.dispatchId) === chId)
        );

        const rawDate = getSafeText(ch.date || ch.dispatchDate || ch.createdAt?.split('T')[0]);
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
          const itemCodeKey = (it.skuCode || it.itemCode || '').toLowerCase().trim();
          const itemNameKey = (it.itemName || it.description || '').toLowerCase().trim();
          const masterPrice = skuPriceMap.get(itemCodeKey) || skuPriceMap.get(itemNameKey) || 0;
          const rate = Number(it.price || it.rate || it.unitPrice || masterPrice || 0);
          const amount = Number(it.total || (gbl > 0 ? gbl * rate : pcs * rate) || 0);
          return {
            itemCode: getSafeText(it.skuCode || it.itemCode, `FG-${String(idx + 1).padStart(3, '0')}`),
            itemName: getSafeText(it.itemName || it.description, 'Stationery Item'),
            dispatchedGbl: gbl,
            dispatchedPcs: pcs,
            uom: getSafeText(it.uom, 'GBL'),
            locationName: getSafeText(it.locationName, 'Main Storage'),
            rate,
            amount
          };
        }) : [];

        const totalGbl = Number(ch.totalGbl) || items.reduce((s, it) => s + it.dispatchedGbl, 0);
        const totalPcs = Number(ch.totalPcs) || items.reduce((s, it) => s + it.dispatchedPcs, 0);
        const dynamicCalculatedAmount = items.reduce((s, it) => s + (it.amount || 0), 0);

        let invStatus: 'Not Invoiced' | 'Partially Invoiced' | 'Invoiced' = 'Not Invoiced';
        if (matchedInv) {
          invStatus = 'Invoiced';
        } else if (ch.invoiceStatus) {
          invStatus = ch.invoiceStatus;
        }

        const custName = getSafeText(ch.customerName || ch.customer, 'Customer');
        const custPhone = getSafeText(ch.customerPhone || ch.phone || ch.customer?.phone || ch.customer?.mobile, '');
        const regionStr = getSafeText(ch.region || ch.shippingAddress?.state || ch.billingAddress?.state, 'Telangana');
        const cityStr = getSafeText(ch.city || ch.shippingAddress?.city || ch.billingAddress?.city, '');

        let parsedBillTo = undefined;
        if (typeof ch.billToAddress === 'string' && ch.billToAddress.trim()) {
          const lines = ch.billToAddress.split('\n').map((l: string) => l.trim()).filter(Boolean);
          parsedBillTo = {
            name: custName || lines[0] || 'Customer',
            firmName: custName || lines[0] || 'Customer',
            address: lines.slice(1, -1).join(', ') || lines[1] || 'Main Address',
            city: cityStr,
            state: regionStr,
            pincode: '',
            phone: custPhone
          };
        } else if (typeof ch.billToAddress === 'object' && ch.billToAddress !== null) {
          parsedBillTo = ch.billToAddress;
        }

        let parsedShipTo = undefined;
        if (typeof ch.shipToAddress === 'string' && ch.shipToAddress.trim()) {
          const lines = ch.shipToAddress.split('\n').map((l: string) => l.trim()).filter(Boolean);
          parsedShipTo = {
            name: custName || lines[0] || 'Customer',
            firmName: custName || lines[0] || 'Customer',
            address: lines.slice(1, -1).join(', ') || lines[1] || 'Main Address',
            city: cityStr,
            state: regionStr,
            pincode: '',
            phone: custPhone
          };
        } else if (typeof ch.shipToAddress === 'object' && ch.shipToAddress !== null) {
          parsedShipTo = ch.shipToAddress;
        }

        return {
          id: toSafeString(ch._id || dcNo),
          dispatchNo: dcNo,
          dispatchDate: formattedDate,
          customerName: custName,
          customerPhone: custPhone,
          region: regionStr,
          city: cityStr,
          orderNumber: getSafeText(ch.orderNumber || (ch.orderId ? 'SO-LINKED' : 'DIRECT')),
          itemCount: items.length,
          totalGbl,
          totalPcs,
          transporterName: getSafeText(ch.transporterName, 'Self / Not specified'),
          vehicleNumber: getSafeText(ch.vehicleNumber, '—'),
          lrNumber: getSafeText(ch.lrNumber, '—'),
          lrDate: getSafeText(ch.lrDate, ''),
          packagesCount: ch.items?.length || 1,
          invoiceStatus: invStatus,
          invoiceNumber: matchedInv?.invoiceNumber,
          invoiceDate: matchedInv?.invoiceDate,
          invoiceAmount: matchedInv?.grandTotal ?? (dynamicCalculatedAmount > 0 ? dynamicCalculatedAmount : undefined),
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

  useEffect(() => {
    const handleSync = () => loadData(false);
    window.addEventListener('invoice_created', handleSync);
    window.addEventListener('delivery_challan_created', handleSync);
    return () => {
      window.removeEventListener('invoice_created', handleSync);
      window.removeEventListener('delivery_challan_created', handleSync);
    };
  }, []);

  // 100% Dynamic KPI Metrics
  const metrics = useMemo(() => {
    const totalInvoices = invoicesList.length;
    const totalInvoicedValue = invoicesList.reduce((sum, inv) => sum + (Number(inv.grandTotal || inv.subtotal || 0)), 0);
    const readyToInvoice = deliveries.filter(d => d.invoiceStatus === 'Not Invoiced').length;
    const partiallyInvoiced = deliveries.filter(d => d.invoiceStatus === 'Partially Invoiced').length;
    const overdue = deliveries.filter(d => d.days > 7 && d.invoiceStatus !== 'Invoiced').length;

    return {
      totalInvoices,
      totalInvoicedValue,
      readyToInvoice,
      partiallyInvoiced,
      overdue
    };
  }, [deliveries, invoicesList]);

  // Unique Filter Options
  const customerOptions = useMemo(() => {
    const set = new Set<string>();
    deliveries.forEach(r => { if (r.customerName) set.add(r.customerName); });
    invoicesList.forEach(r => { if (r.customerName) set.add(r.customerName); });
    return Array.from(set).sort();
  }, [deliveries, invoicesList]);

  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    deliveries.forEach(r => { if (r.region) set.add(r.region); });
    invoicesList.forEach(r => { if (r.region) set.add(r.region); });
    return Array.from(set).sort();
  }, [deliveries, invoicesList]);

  const transporterOptions = useMemo(() => {
    const set = new Set<string>();
    deliveries.forEach(r => { if (r.transporterName) set.add(r.transporterName); });
    return Array.from(set).sort();
  }, [deliveries]);

  // Apply Date Presets
  const applyDatePreset = (preset: 'All' | 'Today' | 'This Week' | 'This Month') => {
    setDatePreset(preset);
    const now = new Date();
    const toYMD = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'All') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'Today') {
      const todayStr = toYMD(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'This Week') {
      const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
      const lastDay = new Date(now.setDate(now.getDate() - now.getDay() + 6));
      setStartDate(toYMD(firstDay));
      setEndDate(toYMD(lastDay));
    } else if (preset === 'This Month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(toYMD(firstDay));
      setEndDate(toYMD(lastDay));
    }
    setShowDateFilter(false);
  };

  // Filtered Deliveries
  const filteredDeliveries = useMemo(() => {
    const res = deliveries.filter(d => {
      // Tab filter
      if (activeTab === 'pending' && d.invoiceStatus !== 'Not Invoiced') return false;
      if (activeTab === 'partial' && d.invoiceStatus !== 'Partially Invoiced') return false;

      // Dropdown filters
      if (selectedCustomer !== 'ALL' && d.customerName !== selectedCustomer) return false;
      if (selectedRegion !== 'ALL' && d.region !== selectedRegion) return false;
      if (selectedTransporter !== 'ALL' && d.transporterName !== selectedTransporter) return false;
      if (selectedStatus !== 'ALL' && d.invoiceStatus !== selectedStatus) return false;

      // Date range filter
      if (startDate && d.dispatchDate && d.dispatchDate < startDate) return false;
      if (endDate && d.dispatchDate && d.dispatchDate > endDate) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchDispatch = d.dispatchNo.toLowerCase().includes(q);
        const matchCustomer = d.customerName.toLowerCase().includes(q);
        const matchTransporter = d.transporterName.toLowerCase().includes(q);
        const matchOrder = d.orderNumber.toLowerCase().includes(q);
        const matchInvoice = (d.invoiceNumber || '').toLowerCase().includes(q);
        const matchItem = d.items.some(i => i.itemName.toLowerCase().includes(q) || (i.itemCode || '').toLowerCase().includes(q));
        if (!matchDispatch && !matchCustomer && !matchTransporter && !matchOrder && !matchInvoice && !matchItem) {
          return false;
        }
      }
      return true;
    });

    // Sorting
    return res.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'dispatchNo') {
        cmp = a.dispatchNo.localeCompare(b.dispatchNo, undefined, { numeric: true });
      } else if (sortField === 'dispatchDate') {
        cmp = a.dispatchDate.localeCompare(b.dispatchDate);
      } else if (sortField === 'customerName') {
        cmp = a.customerName.localeCompare(b.customerName);
      } else if (sortField === 'region') {
        cmp = a.region.localeCompare(b.region);
      } else if (sortField === 'itemCount') {
        cmp = a.itemCount - b.itemCount;
      } else if (sortField === 'totalGbl') {
        cmp = a.totalGbl - b.totalGbl;
      } else if (sortField === 'invoiceStatus') {
        cmp = a.invoiceStatus.localeCompare(b.invoiceStatus);
      } else if (sortField === 'days') {
        cmp = a.days - b.days;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [deliveries, activeTab, selectedCustomer, selectedRegion, selectedTransporter, selectedStatus, startDate, endDate, searchQuery, sortField, sortAsc]);

  // Filtered Invoices (for History Tab)
  const filteredInvoices = useMemo(() => {
    const res = invoicesList.filter(inv => {
      if (selectedCustomer !== 'ALL' && inv.customerName !== selectedCustomer) return false;
      if (selectedRegion !== 'ALL' && inv.region !== selectedRegion) return false;
      if (startDate && inv.invoiceDate && inv.invoiceDate < startDate) return false;
      if (endDate && inv.invoiceDate && inv.invoiceDate > endDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchNo = (inv.invoiceNumber || '').toLowerCase().includes(q);
        const matchCust = (inv.customerName || '').toLowerCase().includes(q);
        const matchDc = (inv.dispatchNumber || '').toLowerCase().includes(q);
        const matchItem = (inv.items || []).some(i => i.itemName.toLowerCase().includes(q) || (i.skuCode || '').toLowerCase().includes(q));
        if (!matchNo && !matchCust && !matchDc && !matchItem) return false;
      }
      return true;
    });

    return res.sort((a, b) => {
      let cmp = 0;
      if (invSortField === 'invoiceNumber') {
        cmp = (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '', undefined, { numeric: true });
      } else if (invSortField === 'invoiceDate') {
        cmp = (a.invoiceDate || '').localeCompare(b.invoiceDate || '');
      } else if (invSortField === 'customerName') {
        cmp = (a.customerName || '').localeCompare(b.customerName || '');
      } else if (invSortField === 'grandTotal') {
        cmp = (a.grandTotal || 0) - (b.grandTotal || 0);
      }
      return invSortAsc ? cmp : -cmp;
    });
  }, [invoicesList, selectedCustomer, selectedRegion, startDate, endDate, searchQuery, invSortField, invSortAsc]);

  // Paginated Rows (Render all rows directly without pagination slicing)
  const currentTotal = activeTab === 'history' ? filteredInvoices.length : filteredDeliveries.length;
  const totalPages = 1;

  const paginatedDeliveries = filteredDeliveries;
  const paginatedInvoices = filteredInvoices;

  // Accordion Expand Toggle
  const toggleRowExpand = (id: string) => {
    setExpandedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAllExpanded = (activeTab === 'history' ? paginatedInvoices : paginatedDeliveries).length > 0 &&
    (activeTab === 'history' ? paginatedInvoices.every(i => expandedRowIds.has(i.invoiceNumber)) : paginatedDeliveries.every(d => expandedRowIds.has(d.id)));

  const toggleAllDetails = () => {
    if (isAllExpanded) {
      setExpandedRowIds(new Set());
    } else {
      const keys = activeTab === 'history'
        ? paginatedInvoices.map(i => i.invoiceNumber)
        : paginatedDeliveries.map(d => d.id);
      setExpandedRowIds(new Set(keys));
    }
  };

  // Checkbox multi-select
  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      const keys = activeTab === 'history'
        ? paginatedInvoices.map(i => i.invoiceNumber)
        : paginatedDeliveries.map(d => d.id);
      setSelectedIds(new Set(keys));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAllSelected = (activeTab === 'history' ? paginatedInvoices : paginatedDeliveries).length > 0 &&
    (activeTab === 'history' ? paginatedInvoices.every(i => selectedIds.has(i.invoiceNumber)) : paginatedDeliveries.every(d => selectedIds.has(d.id)));

  // Excel Export Handler
  const handleExportExcel = () => {
    try {
      let exportData: any[] = [];
      if (activeTab === 'history') {
        exportData = filteredInvoices.map(inv => ({
          'Invoice Number': inv.invoiceNumber,
          'Invoice Date': inv.invoiceDate,
          'Delivery Challan': inv.dispatchNumber || '-',
          'Customer Name': inv.customerName,
          'Region': inv.region,
          'Items Count': inv.items?.length || 0,
          'Total GBL': inv.totalQtyGbl || 0,
          'Taxable Value': inv.subtotal || 0,
          'Grand Total': inv.grandTotal || 0,
          'Payment Terms': inv.paymentTerms,
          'Status': inv.status || 'Created'
        }));
      } else {
        exportData = filteredDeliveries.map(d => ({
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
      }

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, activeTab === 'history' ? 'Sales_Invoices' : 'Pending_Invoices');
      XLSX.writeFile(wb, `Invoices_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Excel report downloaded successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to export Excel', 'error');
    }
  };

  // Open Create Invoice for specific delivery challan
  const handleOpenCreateInvoice = (record?: DispatchDeliveryRecord) => {
    setEditingInvoice(null);
    setIsDirectInvoice(false);
    setSelectedDispatchForModal(record || (deliveries[0] ?? null));
    setIsCreateModalOpen(true);
  };

  // Open Direct Invoice
  const handleOpenDirectInvoice = () => {
    setEditingInvoice(null);
    setIsDirectInvoice(true);
    setSelectedDispatchForModal(null);
    setIsCreateModalOpen(true);
  };

  // View / Print Invoice
  const handleViewInvoice = (inv: SalesInvoice) => {
    setActiveInvoiceForPreview(inv);
    setIsPreviewModalOpen(true);
  };

  // Edit Invoice
  const handleEditInvoice = (inv: SalesInvoice) => {
    setEditingInvoice(inv);
    setIsDirectInvoice(!inv.dispatchNumber || inv.dispatchNumber === 'DIRECT');
    setSelectedDispatchForModal(deliveries.find(d => d.dispatchNo === inv.dispatchNumber) || null);
    setIsCreateModalOpen(true);
  };

  // Delete Invoice
  const handleDeleteInvoice = (inv: SalesInvoice) => {
    setDeleteConfirmInvoice(inv);
  };

  const executeDeleteInvoice = async (inv: SalesInvoice) => {
    const num = inv.invoiceNumber;
    try {
      const companyId = selectedCompany?._id;
      if (inv._id) {
        await deleteInvoice(inv._id, companyId);
      }
      setInvoicesList(prev => prev.filter(i => i.invoiceNumber !== num));
      showToast(`Invoice ${num} deleted successfully`, 'success');
      loadData(false);
    } catch (err) {
      console.error(err);
      showToast('Failed to delete invoice', 'error');
    }
  };

  // Callback when invoice is saved
  const handleInvoiceCreated = (savedInvoice: SalesInvoice) => {
    setActiveInvoiceForPreview(savedInvoice);
    setIsPreviewModalOpen(true);
    loadData(false);
  };

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 space-y-4 font-sans text-gray-800">
      
      {/* ── 1. TOP HEADER & TITLE BANNER (Matching DispatchModule) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-150 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1">
            <span>Sales</span>
            <span>&gt;</span>
            <span className="text-gray-900 font-semibold">Tax Invoices</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-2xs">
              <FileText className="w-5 h-5 text-blue-600 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Sales Invoices</h1>
              <p className="text-xs text-gray-500">
                Generate official GST sales tax invoices directly from delivery challans or manual sales.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons Top Right */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-gray-500" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={handleOpenDirectInvoice}
            className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            title="Create invoice directly without delivery challan"
          >
            <Plus className="w-4 h-4 text-purple-600 stroke-[2.5]" />
            <span>+ Direct Invoice</span>
          </button>

          <button
            onClick={() => handleOpenCreateInvoice()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-blue-500/25 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>+ Create Invoice</span>
          </button>
        </div>
      </div>



      {/* ── 3. TOP NAVIGATION TABS & ACTION BAR (Identical to DispatchModule) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 bg-white px-4 rounded-2xl shadow-2xs relative">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-full">
          {[
            { id: 'pending', label: 'Pending Invoices', count: metrics.readyToInvoice },
            { id: 'partial', label: 'Partially Invoiced', count: metrics.partiallyInvoiced },
            { id: 'history', label: 'Invoices History', count: metrics.totalInvoices },
            { id: 'all', label: 'All Dispatches', count: deliveries.length }
          ].map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); setCurrentPage(1); }}
                className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
                  active 
                    ? 'border-blue-600 text-blue-700 bg-transparent'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Action Bar */}
        <div className="py-2 flex items-center gap-1.5 flex-wrap shrink-0 relative z-40">
          {/* Global Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search invoice, DC, customer, items..."
              className="pl-8 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl w-36 md:w-48 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs font-medium"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Detailed View / Collapse All */}
          <button
            type="button"
            onClick={toggleAllDetails}
            className={`px-2.5 py-1.5 text-xs rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 font-bold shadow-2xs ${
              isAllExpanded
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
            }`}
            title={isAllExpanded ? "Collapse All Items" : "Expand All Items"}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isAllExpanded ? 'rotate-180' : ''}`} />
            <span className="hidden sm:inline">{isAllExpanded ? 'Collapse All' : 'Detailed View'}</span>
          </button>

          {/* Dedicated Date Filter Button + Popover */}
          <div className="relative" ref={dateFilterRef}>
            <button
              type="button"
              onClick={() => {
                setShowDateFilter(!showDateFilter);
                setShowFilterMenu(false);
              }}
              className={`px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs text-xs font-bold ${
                datePreset !== 'All' || startDate || endDate
                  ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-100'
                  : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'
              }`}
              title="Filter by Date"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden md:inline">
                {datePreset === 'All' ? 'Date Filter' : datePreset === 'Custom' ? 'Custom Date' : datePreset}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {showDateFilter && (
              <div 
                className="absolute right-0 mt-1.5 w-68 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-3 space-y-3 text-xs text-left animate-in fade-in zoom-in-95 duration-100"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                  <span className="font-bold text-gray-800 text-xs">Date Range Filter</span>
                  {(datePreset !== 'All' || startDate || endDate) && (
                    <button
                      onClick={() => applyDatePreset('All')}
                      className="text-blue-600 hover:text-blue-800 text-[11px] font-bold cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {['All', 'Today', 'This Week', 'This Month'].map(preset => (
                    <button
                      key={preset}
                      onClick={() => applyDatePreset(preset as any)}
                      className={`px-2.5 py-1.5 text-xs font-bold rounded-lg text-center transition-colors cursor-pointer ${
                        datePreset === preset ? 'bg-blue-600 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5 pt-2 border-t border-gray-100">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-0.5">From Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => { setStartDate(e.target.value); setDatePreset('Custom'); }}
                      className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-0.5">To Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => { setEndDate(e.target.value); setDatePreset('Custom'); }}
                      className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Filter Popover Icon Button */}
          <div className="relative" ref={filterMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowFilterMenu(!showFilterMenu);
                setShowDateFilter(false);
              }}
              className={`p-2 rounded-xl border transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
                (selectedCustomer !== 'ALL' || selectedRegion !== 'ALL' || selectedTransporter !== 'ALL' || selectedStatus !== 'ALL')
                  ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-100'
                  : 'bg-white hover:bg-blue-50/60 border-gray-200 hover:border-blue-200 text-blue-600'
              }`}
              title="Filter Attributes"
            >
              <Filter className="w-4 h-4 text-blue-600" />
            </button>

            {showFilterMenu && (
              <div 
                className="absolute right-0 mt-1.5 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-3 space-y-3 text-xs text-left animate-in fade-in zoom-in-95 duration-100"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                  <span className="font-bold text-gray-800 text-xs">Filter Attributes</span>
                  {(selectedCustomer !== 'ALL' || selectedRegion !== 'ALL' || selectedTransporter !== 'ALL' || selectedStatus !== 'ALL') && (
                    <button
                      onClick={() => {
                        setSelectedCustomer('ALL');
                        setSelectedRegion('ALL');
                        setSelectedTransporter('ALL');
                        setSelectedStatus('ALL');
                        setCurrentPage(1);
                      }}
                      className="text-blue-600 hover:text-blue-800 text-[11px] font-bold cursor-pointer"
                    >
                      Reset All
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">Customer / Firm</label>
                  <select
                    value={selectedCustomer}
                    onChange={e => { setSelectedCustomer(e.target.value); setCurrentPage(1); }}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 font-medium"
                  >
                    <option value="ALL">All Customers ({customerOptions.length})</option>
                    {customerOptions.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">Destination Region</label>
                  <select
                    value={selectedRegion}
                    onChange={e => { setSelectedRegion(e.target.value); setCurrentPage(1); }}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 font-medium"
                  >
                    <option value="ALL">All Regions ({regionOptions.length})</option>
                    {regionOptions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {activeTab !== 'history' && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">Transporter</label>
                    <select
                      value={selectedTransporter}
                      onChange={e => { setSelectedTransporter(e.target.value); setCurrentPage(1); }}
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 font-medium"
                    >
                      <option value="ALL">All Transporters ({transporterOptions.length})</option>
                      {transporterOptions.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => { loadData(false); showToast('Invoices data refreshed', 'info'); }}
            className="p-2 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded-xl shadow-2xs transition-colors cursor-pointer"
            title="Refresh Invoices"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── 4. MAIN DATA TABLE (MATCHING DISPATCH MODULE) ── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          {activeTab === 'history' ? (
            /* ── INVOICES HISTORY SUB-TABLE ── */
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/80 text-gray-500 font-bold border-b border-gray-200 text-[10px] uppercase tracking-wider">
                  <th className="py-3 px-3 text-center w-9">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={e => toggleSelectAll(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-2 text-center w-8 text-gray-400"></th>
                  <th className="py-3 px-3">INVOICE NO.</th>
                  <th className="py-3 px-3">INVOICE DATE</th>
                  <th className="py-3 px-3">DISPATCH NO.</th>
                  <th className="py-3 px-3">CUSTOMER / FIRM</th>
                  <th className="py-3 px-3">DESTINATION</th>
                  <th className="py-3 px-3 text-center">ITEMS</th>
                  <th className="py-3 px-3 text-right">TOTAL QTY</th>
                  <th className="py-3 px-3 text-right">TAXABLE (₹)</th>
                  <th className="py-3 px-3 text-right">GRAND TOTAL (₹)</th>
                  <th className="py-3 px-3 text-center">STATUS</th>
                  <th className="py-3 px-3 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={13} className="py-16 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                      <p className="font-semibold text-xs text-gray-600">Loading sales tax invoices...</p>
                    </td>
                  </tr>
                ) : paginatedInvoices.length > 0 ? (
                  paginatedInvoices.map((inv) => {
                    const isExpanded = expandedRowIds.has(inv.invoiceNumber);
                    const isSelected = selectedIds.has(inv.invoiceNumber);

                    return (
                      <React.Fragment key={inv.invoiceNumber || inv._id}>
                        <tr
                          onClick={() => toggleRowExpand(inv.invoiceNumber)}
                          className={`hover:bg-blue-50/20 transition-colors cursor-pointer ${
                            isSelected ? 'bg-blue-50/30' : ''
                          }`}
                        >
                          <td className="py-3 px-3 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(inv.invoiceNumber)}
                              className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 cursor-pointer"
                            />
                          </td>

                          <td className="py-3 px-2 text-center">
                            <ChevronRight
                              className={`w-4 h-4 text-gray-400 transition-transform duration-200 mx-auto ${
                                isExpanded ? 'rotate-90 text-blue-600' : ''
                              }`}
                            />
                          </td>

                          {/* Invoice Number */}
                          <td className="py-3 px-3 font-mono font-bold text-blue-700">
                            {getSafeText(inv.invoiceNumber)}
                          </td>

                          {/* Invoice Date */}
                          <td className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                            {getSafeText(inv.invoiceDate)}
                          </td>

                          {/* DC Ref */}
                          <td className="py-3 px-3 font-mono text-gray-700 font-bold">
                            {getSafeText(inv.dispatchNumber, 'DIRECT')}
                          </td>

                          {/* Customer */}
                          <td className="py-3 px-3">
                            <div className="font-bold text-gray-900">{getSafeText(inv.customerName, 'Customer')}</div>
                            {inv.customerPhone && (
                              <div className="text-[10px] text-gray-400 font-mono">{getSafeText(inv.customerPhone)}</div>
                            )}
                          </td>

                          {/* Region */}
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {getSafeText(inv.region, 'Telangana')}
                            </span>
                          </td>

                          {/* Items Count */}
                          <td className="py-3 px-3 text-center font-bold text-gray-700">
                            {inv.items?.length || 0}
                          </td>

                          {/* Total Qty */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-gray-800">
                            {inv.totalQtyGbl || 0} GBL
                          </td>

                          {/* Taxable */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-gray-700">
                            ₹{(inv.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* Grand Total */}
                          <td className="py-3 px-3 text-right font-mono font-black text-emerald-700">
                            ₹{(inv.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                              Billed
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleViewInvoice(inv)}
                                className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                title="View & Print Tax Invoice"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Print</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleEditInvoice(inv)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit Invoice"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteInvoice(inv)}
                                className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Invoice"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Sub-Table for Invoice Items */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70 border-b border-gray-200">
                            <td colSpan={13} className="p-4 pl-12">
                              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
                                <div className="px-3 py-2 bg-gray-100/70 border-b border-gray-200 flex items-center justify-between text-xs font-bold text-gray-700">
                                  <span>Invoice Line Items Breakdown</span>
                                  <span className="font-mono text-blue-700">{inv.items?.length || 0} Items</span>
                                </div>
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 text-[10px] uppercase">
                                      <th className="py-2 px-3">#</th>
                                      <th className="py-2 px-3">SKU Code</th>
                                      <th className="py-2 px-3">Item Description</th>
                                      <th className="py-2 px-3 text-right">Invoiced Qty</th>
                                      <th className="py-2 px-3 text-right">Rate (₹)</th>
                                      <th className="py-2 px-3 text-right">Amount (₹)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {(inv.items || []).map((it, itemIdx) => (
                                      <tr key={itemIdx} className="hover:bg-gray-50">
                                        <td className="py-2 px-3 text-gray-400 font-bold">{itemIdx + 1}</td>
                                        <td className="py-2 px-3 font-mono font-bold text-blue-700">{getSafeText(it.skuCode, '—')}</td>
                                        <td className="py-2 px-3 font-bold text-gray-900">{getSafeText(it.itemName, 'Item')}</td>
                                        <td className="py-2 px-3 text-right font-mono font-bold text-gray-800">
                                          {it.invoiceQtyGbl || it.dispatchedGbl} GBL (= {it.invoiceQtyPcs || it.dispatchedPcs} PCS)
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono text-gray-700">
                                          ₹{Number(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                          ₹{Number(it.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={13} className="py-16 text-center text-gray-400">
                      <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="font-bold text-gray-600">No finalized tax invoices found</p>
                      <p className="text-[11px] text-gray-400">Create an invoice from pending delivery challans or use Direct Invoice</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            /* ── PENDING / DISPATCH DELIVERIES TABLE (MATCHING DISPATCH MODULE) ── */
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/80 text-gray-500 font-bold border-b border-gray-200 text-[10px] uppercase tracking-wider">
                  <th className="py-3 px-3 text-center w-9">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={e => toggleSelectAll(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-2 text-center w-8 text-gray-400"></th>
                  <th className="py-3 px-3">DISPATCH NO.</th>
                  <th className="py-3 px-3">DISPATCH DATE</th>
                  <th className="py-3 px-3">CUSTOMER / FIRM</th>
                  <th className="py-3 px-3">DESTINATION</th>
                  <th className="py-3 px-3 text-center">ITEMS</th>
                  <th className="py-3 px-3 text-right">DISPATCH QTY</th>
                  <th className="py-3 px-3">TRANSPORTER</th>
                  <th className="py-3 px-3 text-center">STATUS</th>
                  <th className="py-3 px-2 text-center">AGE</th>
                  <th className="py-3 px-3">INVOICE REF</th>
                  <th className="py-3 px-3 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={13} className="py-16 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                      <p className="font-semibold text-xs text-gray-600">Loading delivery challans...</p>
                    </td>
                  </tr>
                ) : paginatedDeliveries.length > 0 ? (
                  paginatedDeliveries.map((row) => {
                    const isExpanded = expandedRowIds.has(row.id);
                    const isSelected = selectedIds.has(row.id);

                    const statusClass = row.invoiceStatus === 'Invoiced'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : row.invoiceStatus === 'Partially Invoiced'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-purple-50 text-purple-700 border-purple-200';

                    return (
                      <React.Fragment key={row.id}>
                        <tr
                          onClick={() => toggleRowExpand(row.id)}
                          className={`hover:bg-blue-50/20 transition-colors cursor-pointer ${
                            isSelected ? 'bg-blue-50/30' : ''
                          }`}
                        >
                          <td className="py-3 px-3 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(row.id)}
                              className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 cursor-pointer"
                            />
                          </td>

                          <td className="py-3 px-2 text-center">
                            <ChevronRight
                              className={`w-4 h-4 text-gray-400 transition-transform duration-200 mx-auto ${
                                isExpanded ? 'rotate-90 text-blue-600' : ''
                              }`}
                            />
                          </td>

                          {/* Dispatch No */}
                          <td className="py-3 px-3 font-mono font-bold text-blue-700">
                            {row.dispatchNo}
                          </td>

                          {/* Date */}
                          <td className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                            {row.dispatchDate}
                          </td>

                          {/* Customer */}
                          <td className="py-3 px-3">
                            <div className="font-bold text-gray-900">{row.customerName}</div>
                            {row.customerPhone && (
                              <div className="text-[10px] text-gray-400 font-mono">{row.customerPhone}</div>
                            )}
                          </td>

                          {/* Destination */}
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {row.region || 'Telangana'}
                            </span>
                          </td>

                          {/* Items Count */}
                          <td className="py-3 px-3 text-center font-bold text-gray-700">
                            {row.itemCount}
                          </td>

                          {/* Dispatch Qty */}
                          <td className="py-3 px-3 text-right font-mono">
                            <div className="font-black text-gray-900">{row.totalGbl} GBL</div>
                            <div className="text-[10px] text-gray-400">≈ {row.totalPcs.toLocaleString()} PCS</div>
                          </td>

                          {/* Transporter */}
                          <td className="py-3 px-3">
                            <div className="font-medium text-gray-800 truncate max-w-[140px]">{row.transporterName}</div>
                            {row.vehicleNumber && row.vehicleNumber !== '—' && (
                              <div className="text-[10px] font-mono text-gray-400 uppercase">{row.vehicleNumber}</div>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border shadow-2xs ${statusClass}`}>
                              {row.invoiceStatus === 'Not Invoiced' ? 'Ready to Invoice' : row.invoiceStatus}
                            </span>
                          </td>

                          {/* Age */}
                          <td className="py-3 px-2 text-center font-mono text-gray-500 font-bold">
                            {row.days}d
                          </td>

                          {/* Invoice Ref */}
                          <td className="py-3 px-3 font-mono text-xs">
                            {row.invoiceNumber ? (
                              <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                {row.invoiceNumber}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            {row.invoiceStatus !== 'Invoiced' ? (
                              <button
                                type="button"
                                onClick={() => handleOpenCreateInvoice(row)}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 mx-auto cursor-pointer shadow-2xs transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>+ Invoice</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const inv = invoicesList.find(i => i.invoiceNumber === row.invoiceNumber);
                                  if (inv) handleViewInvoice(inv);
                                  else showToast('Invoice details loaded', 'info');
                                }}
                                className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1 mx-auto cursor-pointer shadow-2xs"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View</span>
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Expandable Sub-Table for Delivery Items */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70 border-b border-gray-200">
                            <td colSpan={13} className="p-4 pl-12">
                              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
                                <div className="px-3 py-2 bg-gray-100/70 border-b border-gray-200 flex items-center justify-between text-xs font-bold text-gray-700">
                                  <span>Delivery Items Breakdown ({row.dispatchNo})</span>
                                  <span className="font-mono text-blue-700">{row.items.length} Lines</span>
                                </div>
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 text-[10px] uppercase">
                                      <th className="py-2 px-3">#</th>
                                      <th className="py-2 px-3">SKU Code</th>
                                      <th className="py-2 px-3">Item Description</th>
                                      <th className="py-2 px-3 text-right">Dispatched Qty</th>
                                      <th className="py-2 px-3 text-right">Unit Rate (₹)</th>
                                      <th className="py-2 px-3 text-right">Total Amount (₹)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {row.items.map((it, itemIdx) => (
                                      <tr key={itemIdx} className="hover:bg-gray-50">
                                        <td className="py-2 px-3 text-gray-400 font-bold">{itemIdx + 1}</td>
                                        <td className="py-2 px-3 font-mono font-bold text-blue-700">{it.itemCode}</td>
                                        <td className="py-2 px-3 font-bold text-gray-900">{it.itemName}</td>
                                        <td className="py-2 px-3 text-right font-mono font-bold text-gray-800">
                                          {it.dispatchedGbl} GBL (= {it.dispatchedPcs} PCS)
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono text-gray-700">
                                          ₹{Number(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                          ₹{Number(it.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={13} className="py-16 text-center text-gray-400">
                      <Truck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="font-bold text-gray-600">No delivery challan records found</p>
                      <p className="text-[11px] text-gray-400">Dispatch orders from Dispatch Module to bill them here</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {/* ── 6. CREATE / EDIT INVOICE MODAL ── */}
      {isCreateModalOpen && (
        <CreateInvoiceModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          initialDispatch={selectedDispatchForModal}
          allDeliveries={deliveries}
          editingInvoice={editingInvoice}
          isDirectInvoice={isDirectInvoice}
          onInvoiceCreated={handleInvoiceCreated}
        />
      )}

      {/* ── 7. INVOICE SUCCESS / PRINT PREVIEW MODAL ── */}
      {activeInvoiceForPreview && (
        <InvoiceSuccessModal
          isOpen={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          invoice={activeInvoiceForPreview}
          onEdit={() => {
            setIsPreviewModalOpen(false);
            handleEditInvoice(activeInvoiceForPreview);
          }}
        />
      )}

      {/* ── 8. DELETE INVOICE CONFIRM MODAL ── */}
      {deleteConfirmInvoice && (
        <ConfirmActionModal
          isOpen={!!deleteConfirmInvoice}
          onClose={() => setDeleteConfirmInvoice(null)}
          onConfirm={() => executeDeleteInvoice(deleteConfirmInvoice)}
          title={`Delete Sales Tax Invoice ${deleteConfirmInvoice.invoiceNumber || ''}`}
          description={`Are you sure you want to delete Tax Invoice ${deleteConfirmInvoice.invoiceNumber || ''}? This action cannot be undone.`}
          bullets={[
            'Delete the tax invoice record permanently',
            'Restore the linked Delivery Challan back to "Not Invoiced" status'
          ]}
          confirmText="Yes, Delete Invoice"
          cancelText="Cancel"
          variant="danger"
        />
      )}

    </div>
  );
};

export default InvoicesModule;


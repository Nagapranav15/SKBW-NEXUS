import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart3, TrendingUp, FileText, ShoppingCart, Search, Filter,
  Calendar, Download, RefreshCw, Printer, ChevronDown, Eye, X,
  Building, MapPin, Phone, CheckCircle2, Clock, AlertCircle, ArrowUpDown,
  ChevronLeft, ChevronRight, Layers, IndianRupee, Package, ArrowUp, ArrowDown,
  Factory, Truck, ShoppingBag, Users, DollarSign, PieChart, ShieldAlert,
  HelpCircle, Percent
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import { getInvoices, SalesInvoice } from '../../api/invoiceApi';
import { getDeliveryChallans } from '../../api/deliveryChallanApi';
import { getParties } from '../../api/partyApi';
import { getSkusV2, getBalancesV2, getLedgerV2, getPurchaseInvoicesV2 } from '../../api/mfgApiV2';
import { getSalesOrdersV2 } from '../../api/salesOrderApiV2';
import { getProductionOrders } from '../../api/productionApi';
import { getTransactions } from '../../api/transactionApi';
import { showToast } from '../ui/Toast';

// Main Category Types
export type MainCategoryType =
  | 'dashboard'
  | 'sales'
  | 'purchases'
  | 'inventory'
  | 'production'
  | 'dispatch'
  | 'orders'
  | 'directory'
  | 'ledger'
  | 'tax';

// Safe String Conversion Helper
const cleanVal = (val: any, fallback = ''): string => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val.trim() || fallback;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (val.name) return cleanVal(val.name, fallback);
    if (val.firmName) return cleanVal(val.firmName, fallback);
    if (val.label) return cleanVal(val.label, fallback);
    if (val._id) return String(val._id);
  }
  return fallback;
};

const SalesReports: React.FC = () => {
  const { selectedCompany } = useAuth();

  // Active Main Category & Sub Report Selection
  const [activeCategory, setActiveCategory] = useState<MainCategoryType>('dashboard');
  const [activeSubReport, setActiveSubReport] = useState<string>('summary');

  // Raw API Master State
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [productions, setProductions] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [inventoryLedger, setInventoryLedger] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filter Bar States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('ALL');
  const [selectedSupplier, setSelectedSupplier] = useState('ALL');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Date Filter Popover & Range State
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [datePreset, setDatePreset] = useState<'All' | 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Last Month' | 'This Quarter' | 'This Year' | 'Custom'>('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const dateFilterRef = useRef<HTMLDivElement>(null);

  // Sorting & Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortField, setSortField] = useState<string>('date');
  const [sortAsc, setSortAsc] = useState(false);

  // Drill-down Detail Modal State
  const [selectedRowDetail, setSelectedRowDetail] = useState<any | null>(null);

  // Close Date Filter popover on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(e.target as Node)) {
        setShowDateFilter(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Parallel Load All Business Master Data
  const loadAllReportData = async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    try {
      const companyId = selectedCompany?._id;

      const [
        invsRes,
        ordersRes,
        dcsRes,
        purchasesRes,
        prodsRes,
        partiesRes,
        skusRes,
        balancesRes,
        invLedgerRes,
        txsRes
      ] = await Promise.all([
        getInvoices(companyId).catch(() => [] as SalesInvoice[]),
        getSalesOrdersV2(companyId).catch(() => []),
        getDeliveryChallans(companyId).catch(() => null),
        getPurchaseInvoicesV2({ companyId }).catch(() => null),
        getProductionOrders({ companyId }).catch(() => []),
        getParties({ company: companyId, limit: 2000 }).catch(() => null),
        getSkusV2(companyId).catch(() => []),
        getBalancesV2(companyId).catch(() => []),
        getLedgerV2({ companyId, limit: 1000 }).catch(() => null),
        getTransactions({ companyId }).catch(() => null)
      ]);

      // 1. Invoices
      const invList = Array.isArray(invsRes) ? invsRes : [];
      const localInvsKey = `skbw_local_invoices_${companyId || 'default'}`;
      let localInvs: any[] = [];
      try {
        localInvs = JSON.parse(localStorage.getItem(localInvsKey) || '[]');
      } catch {}
      setInvoices([...localInvs, ...invList]);

      // 2. Sales Orders
      setSalesOrders(Array.isArray(ordersRes) ? ordersRes : []);

      // 3. Delivery Challans
      const dcList = dcsRes?.data?.deliveryChallans || dcsRes?.deliveryChallans || (Array.isArray(dcsRes) ? dcsRes : []);
      setDeliveries(dcList);

      // 4. Purchases
      const purList = purchasesRes?.data?.invoices || purchasesRes?.invoices || purchasesRes?.data || (Array.isArray(purchasesRes) ? purchasesRes : []);
      setPurchases(purList);

      // 5. Productions
      setProductions(Array.isArray(prodsRes) ? prodsRes : []);

      // 6. Parties
      const partyList = partiesRes?.data?.parties || partiesRes?.data || (Array.isArray(partiesRes) ? partiesRes : []);
      let localParties: any[] = [];
      try {
        localParties = JSON.parse(localStorage.getItem(`skbw_parties_${companyId || 'default'}`) || '[]');
      } catch {}
      setParties([...partyList, ...localParties]);

      // 7. SKUs & Stock Balances
      setSkus(Array.isArray(skusRes) ? skusRes : []);
      setBalances(Array.isArray(balancesRes) ? balancesRes : []);

      // 8. Inventory Movements Ledger
      const ledgerList = invLedgerRes?.data?.ledger || invLedgerRes?.ledger || (Array.isArray(invLedgerRes) ? invLedgerRes : []);
      setInventoryLedger(ledgerList);

      // 9. Financial Transactions
      const txList = txsRes?.data?.transactions || txsRes?.transactions || (Array.isArray(txsRes) ? txsRes : []);
      setTransactions(txList);
    } catch (err) {
      console.error('Failed to fetch full report dataset:', err);
      showToast('Error refreshing report metrics', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllReportData(true);
  }, [selectedCompany?._id]);

  // Date Filter Preset Handler
  const applyDatePreset = (preset: typeof datePreset) => {
    setDatePreset(preset);
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'All') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'Today') {
      const iso = formatDate(today);
      setStartDate(iso);
      setEndDate(iso);
    } else if (preset === 'Yesterday') {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      const iso = formatDate(yest);
      setStartDate(iso);
      setEndDate(iso);
    } else if (preset === 'This Week') {
      const first = new Date(today);
      first.setDate(first.getDate() - first.getDay());
      setStartDate(formatDate(first));
      setEndDate(formatDate(new Date()));
    } else if (preset === 'This Month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(formatDate(first));
      setEndDate(formatDate(new Date()));
    } else if (preset === 'Last Month') {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      setStartDate(formatDate(first));
      setEndDate(formatDate(last));
    } else if (preset === 'This Quarter') {
      const qMonth = Math.floor(today.getMonth() / 3) * 3;
      const first = new Date(today.getFullYear(), qMonth, 1);
      setStartDate(formatDate(first));
      setEndDate(formatDate(new Date()));
    } else if (preset === 'This Year') {
      const first = new Date(today.getFullYear(), 0, 1);
      setStartDate(formatDate(first));
      setEndDate(formatDate(new Date()));
    }
    if (preset !== 'Custom') {
      setShowDateFilter(false);
    }
    setCurrentPage(1);
  };

  // Date Filtering Predicate
  const isWithinDateRange = (dateStr?: string) => {
    if (!dateStr) return true;
    const itemDate = new Date(dateStr).getTime();
    if (isNaN(itemDate)) return true;
    if (startDate) {
      const start = new Date(startDate + 'T00:00:00').getTime();
      if (itemDate < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate + 'T23:59:59').getTime();
      if (itemDate > end) return false;
    }
    return true;
  };

  // Extract Filter Options
  const customersList = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach(i => { if (i.customerName) set.add(i.customerName.trim()); });
    salesOrders.forEach(o => { if (o.customerName) set.add(o.customerName.trim()); });
    parties.filter(p => p.type === 'customer' || !p.type).forEach(p => {
      const n = cleanVal(p.firmName || p.name);
      if (n) set.add(n);
    });
    return Array.from(set).sort();
  }, [invoices, salesOrders, parties]);

  const suppliersList = useMemo(() => {
    const set = new Set<string>();
    purchases.forEach(p => {
      const n = cleanVal(p.vendorName || p.supplierName || p.vendor?.firmName);
      if (n) set.add(n);
    });
    parties.filter(p => p.type === 'vendor' || p.type === 'supplier').forEach(p => {
      const n = cleanVal(p.firmName || p.name);
      if (n) set.add(n);
    });
    return Array.from(set).sort();
  }, [purchases, parties]);

  const regionsList = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach(i => {
      const r = cleanVal(i.region || i.city || i.billToAddress?.city || i.billToAddress?.state);
      if (r) set.add(r);
    });
    parties.forEach(p => {
      const r = cleanVal(p.city || p.state || p.region);
      if (r) set.add(r);
    });
    return Array.from(set).sort();
  }, [invoices, parties]);

  // Executive KPI Metrics Calculation
  const kpiMetrics = useMemo(() => {
    // Current Period Sales Invoices
    const periodInvoices = invoices.filter(i => isWithinDateRange(i.invoiceDate || i.date));
    const totalSales = periodInvoices.reduce((s, i) => s + Number(i.grandTotal || i.subtotal || 0), 0);
    const totalSalesVolumeGbl = periodInvoices.reduce((s, i) =>
      s + (i.items || []).reduce((sub, it) => sub + Number(it.invoiceQtyGbl || it.dispatchedGbl || it.quantity || 0), 0), 0
    );

    // Purchases
    const periodPurchases = purchases.filter(p => isWithinDateRange(p.invoiceDate || p.createdAt || p.date));
    const totalPurchasesCost = periodPurchases.reduce((s, p) => s + Number(p.grandTotal || p.totalAmount || p.total || 0), 0);

    // Outstanding Receivables & Payables
    const totalReceivables = invoices.reduce((s, i) => {
      const tot = Number(i.grandTotal || i.subtotal || 0);
      const paid = i.status === 'paid' ? tot : Number(i.paidAmount || 0);
      return s + Math.max(0, tot - paid);
    }, 0);

    const totalPayables = purchases.reduce((s, p) => {
      const tot = Number(p.grandTotal || p.totalAmount || 0);
      const paid = Number(p.paidAmount || (p.paymentStatus === 'paid' ? tot : 0));
      return s + Math.max(0, tot - paid);
    }, 0);

    // Stock Inventory Valuation
    const stockValuation = skus.reduce((s, sku) => {
      const stock = Number(sku.presentStock || sku.openingStock || 0);
      const cost = Number(sku.costPrice || sku.avgCost || sku.purchasePrice || sku.standardCost || 0);
      return s + (stock * cost);
    }, 0);

    // Low Stock Count
    const lowStockCount = skus.filter(sku => {
      const present = Number(sku.presentStock || 0);
      const min = Number(sku.minStockLevel || 0);
      return min > 0 && present <= min;
    }).length;

    // Production Output
    const periodProductions = productions.filter(p => isWithinDateRange(p.createdAt || p.startDate || p.date));
    const totalProducedQty = periodProductions.reduce((s, p) => s + Number(p.totalProducedQty || p.producedQuantity || p.targetQty || 0), 0);

    // Sales Orders Pending
    const pendingOrdersCount = salesOrders.filter(o => o.status === 'Draft' || o.status === 'Confirmed' || o.status === 'In Production' || o.status === 'Pending').length;
    const pendingDispatchCount = deliveries.filter(d => d.status === 'pending' || d.status === 'in_transit' || d.status === 'Partial').length;

    // Tax Collected
    const totalTaxCollected = periodInvoices.reduce((s, i) => s + Number(i.taxAmount || i.totalTax || 0), 0);

    // Estimated Gross Profit
    const grossProfit = Math.max(0, totalSales - totalPurchasesCost);
    const profitMargin = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : '0';

    return {
      totalSales,
      totalSalesVolumeGbl,
      totalPurchasesCost,
      totalReceivables,
      totalPayables,
      stockValuation,
      lowStockCount,
      totalProducedQty,
      pendingOrdersCount,
      pendingDispatchCount,
      totalTaxCollected,
      grossProfit,
      profitMargin
    };
  }, [invoices, purchases, skus, productions, salesOrders, deliveries, startDate, endDate]);

  // ── GENERATE DATA FOR CURRENT ACTIVE TAB & SUB-REPORT ──
  const activeReportRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    // 1. DASHBOARD OVERVIEW / TRENDS
    if (activeCategory === 'dashboard') {
      return invoices
        .filter(i => isWithinDateRange(i.invoiceDate || i.date))
        .map(i => ({
          id: i._id || i.invoiceNumber,
          date: i.invoiceDate || (i as any).date || '',
          refNo: i.invoiceNumber,
          entity: cleanVal(i.customerName, 'Unnamed Customer'),
          type: 'Invoice Sale',
          region: cleanVal(i.region || i.city || i.billToAddress?.city),
          volume: (i.items || []).reduce((s, it) => s + Number(it.invoiceQtyGbl || it.quantity || 0), 0),
          amount: Number(i.grandTotal || i.subtotal || 0),
          status: i.status || 'unpaid',
          raw: i
        }));
    }

    // 2. SALES REPORTS
    if (activeCategory === 'sales') {
      if (activeSubReport === 'by_customer') {
        const map = new Map<string, any>();
        invoices.filter(i => isWithinDateRange(i.invoiceDate || i.date)).forEach(i => {
          const name = cleanVal(i.customerName, 'Unnamed Customer');
          const key = name.toLowerCase();
          const existing = map.get(key) || {
            id: key,
            customerName: name,
            region: cleanVal(i.region || i.city || i.billToAddress?.city),
            invoiceCount: 0,
            totalGbl: 0,
            grossSales: 0,
            taxAmount: 0,
            netSales: 0
          };
          const amt = Number(i.grandTotal || i.subtotal || 0);
          const tax = Number(i.taxAmount || 0);
          const gbl = (i.items || []).reduce((s, it) => s + Number(it.invoiceQtyGbl || it.quantity || 0), 0);
          existing.invoiceCount += 1;
          existing.totalGbl += gbl;
          existing.grossSales += amt;
          existing.taxAmount += tax;
          existing.netSales += amt;
          map.set(key, existing);
        });
        return Array.from(map.values());
      } else if (activeSubReport === 'by_item') {
        const map = new Map<string, any>();
        invoices.filter(i => isWithinDateRange(i.invoiceDate || i.date)).forEach(i => {
          (i.items || []).forEach(it => {
            const key = (it.skuCode || it.itemName || '').toLowerCase().trim();
            if (!key) return;
            const existing = map.get(key) || {
              id: key,
              skuCode: it.skuCode || '—',
              itemName: it.itemName || 'Item',
              category: it.category || 'General',
              quantityGbl: 0,
              quantityPcs: 0,
              totalRevenue: 0,
              avgRate: 0,
              orderCount: 0
            };
            const gbl = Number(it.invoiceQtyGbl || it.quantity || 0);
            const pcs = Number(it.invoiceQtyPcs) || (gbl * (it.pcsPerGbl || 100));
            const amt = Number(it.amount || (gbl * (it.rate || 0))) || 0;
            existing.quantityGbl += gbl;
            existing.quantityPcs += pcs;
            existing.totalRevenue += amt;
            existing.orderCount += 1;
            map.set(key, existing);
          });
        });
        return Array.from(map.values()).map(s => ({
          ...s,
          avgRate: s.quantityGbl > 0 ? Math.round((s.totalRevenue / s.quantityGbl) * 100) / 100 : 0
        }));
      } else {
        // Sales Summary / Invoices
        return invoices
          .filter(i => isWithinDateRange(i.invoiceDate || i.date))
          .map(i => ({
            id: i._id || i.invoiceNumber,
            date: i.invoiceDate || (i as any).date || '',
            invoiceNo: i.invoiceNumber,
            dcNo: i.dispatchNumber || '—',
            customerName: cleanVal(i.customerName, 'Unnamed Customer'),
            region: cleanVal(i.region || i.city || i.billToAddress?.city),
            itemCount: (i.items || []).length,
            totalGbl: (i.items || []).reduce((s, it) => s + Number(it.invoiceQtyGbl || it.quantity || 0), 0),
            amount: Number(i.grandTotal || i.subtotal || 0),
            status: i.status || 'unpaid',
            raw: i
          }));
      }
    }

    // 3. PURCHASE REPORTS
    if (activeCategory === 'purchases') {
      return purchases
        .filter(p => isWithinDateRange(p.invoiceDate || p.createdAt || p.date))
        .map(p => ({
          id: p._id || p.invoiceNumber || p.batchNumber,
          date: p.invoiceDate || (p.createdAt ? p.createdAt.split('T')[0] : '') || '',
          invoiceNo: p.invoiceNumber || p.batchNumber || 'PUR-001',
          supplierName: cleanVal(p.vendorName || p.supplierName || p.vendor?.firmName || 'Unnamed Vendor'),
          itemCount: (p.items || []).length,
          totalQty: (p.items || []).reduce((s, it) => s + Number(it.quantity || it.receivedQty || 0), 0),
          totalAmount: Number(p.grandTotal || p.totalAmount || p.total || 0),
          status: p.paymentStatus || p.status || 'Received',
          raw: p
        }));
    }

    // 4. INVENTORY REPORTS
    if (activeCategory === 'inventory') {
      if (activeSubReport === 'movement') {
        return inventoryLedger
          .filter(l => isWithinDateRange(l.timestamp || l.createdAt))
          .map(l => ({
            id: l._id,
            date: l.timestamp ? l.timestamp.split('T')[0] : '',
            type: l.transactionType || 'Movement',
            skuCode: l.skuId?.skuCode || '—',
            skuName: l.skuId?.name || 'Item',
            location: l.locationId?.name || 'Warehouse Storage',
            qtyIn: Number(l.qtyIn || 0),
            qtyOut: Number(l.qtyOut || 0),
            balanceAfter: Number(l.balanceAfter || 0),
            raw: l
          }));
      } else {
        // Stock Summary
        return skus.map(s => {
          const present = Number(s.presentStock || s.openingStock || 0);
          const cost = Number(s.costPrice || s.avgCost || s.purchasePrice || s.standardCost || 0);
          return {
            id: s._id || s.skuCode,
            skuCode: s.skuCode || '—',
            name: s.name || 'Unnamed SKU',
            category: s.category || 'General',
            unit: s.unit || 'GBL',
            presentStock: present,
            minStockLevel: Number(s.minStockLevel || 0),
            unitCost: cost,
            totalValue: present * cost,
            status: present <= 0 ? 'Out of Stock' : (s.minStockLevel && present <= s.minStockLevel ? 'Low Stock' : 'In Stock'),
            raw: s
          };
        });
      }
    }

    // 5. PRODUCTION REPORTS
    if (activeCategory === 'production') {
      return productions
        .filter(p => isWithinDateRange(p.createdAt || p.startDate || p.date))
        .map(p => ({
          id: p._id || p.orderNumber,
          date: p.startDate || (p.createdAt ? p.createdAt.split('T')[0] : '') || '',
          orderNo: p.orderNumber || 'PROD-001',
          itemName: p.itemName || p.skuCode || 'Finished Book',
          targetQty: Number(p.targetQty || p.quantity || 0),
          producedQty: Number(p.totalProducedQty || p.producedQuantity || 0),
          department: p.department || 'Manufacturing',
          status: p.status || 'In Production',
          raw: p
        }));
    }

    // 6. DISPATCH REPORTS
    if (activeCategory === 'dispatch') {
      return deliveries
        .filter(d => isWithinDateRange(d.date || d.createdAt))
        .map(d => ({
          id: d._id || d.dcNumber,
          date: d.date || '',
          dcNo: d.dcNumber || 'DC-001',
          customerName: cleanVal(d.customerName || d.consigneeName, 'Direct Consignee'),
          transporter: d.transporterName || 'Self Delivery',
          totalGbl: Number(d.totalGbl || d.totalQuantity || 0),
          status: d.status || 'delivered',
          raw: d
        }));
    }

    // 7. SALES ORDERS REPORTS
    if (activeCategory === 'orders') {
      return salesOrders
        .filter(o => isWithinDateRange(o.orderDate || o.createdAt))
        .map(o => ({
          id: o._id || o.orderNumber,
          date: o.orderDate || (o.createdAt ? o.createdAt.split('T')[0] : '') || '',
          orderNo: o.orderNumber || 'SO-001',
          customerName: cleanVal(o.customerName, 'Unnamed Customer'),
          region: cleanVal(o.region || o.city),
          itemCount: (o.items || []).length,
          totalAmount: Number(o.grandTotal || o.total || 0),
          status: o.status || 'Confirmed',
          raw: o
        }));
    }

    // 8. DIRECTORY / CUSTOMERS & SUPPLIERS
    if (activeCategory === 'directory') {
      return parties.map(p => ({
        id: p._id || p.id,
        name: cleanVal(p.firmName || p.name, 'Unnamed Party'),
        type: p.type || 'customer',
        phone: cleanVal(p.mobile || p.phone),
        city: cleanVal(p.city || p.billingAddress?.city),
        region: cleanVal(p.region || p.state || p.billingAddress?.state),
        creditLimit: Number(p.creditLimit || 0),
        openingBalance: Number(p.openingBalance || 0),
        raw: p
      }));
    }

    // 9. FINANCIAL / LEDGER
    if (activeCategory === 'ledger') {
      return transactions
        .filter(t => isWithinDateRange(t.date || t.createdAt))
        .map(t => ({
          id: t._id || t.voucherNo,
          date: t.date || (t.createdAt ? t.createdAt.split('T')[0] : '') || '',
          voucherNo: t.voucherNo || t.refNo || 'TX-001',
          type: t.transactionType || t.type || 'Payment',
          partyName: cleanVal(t.partyName || t.customerName || t.vendorName, 'Cash/Bank Account'),
          debit: Number(t.debit || (t.type === 'Invoice' ? t.amount : 0)),
          credit: Number(t.credit || (t.type === 'Payment' ? t.amount : 0)),
          balance: Number(t.runningBalance || t.amount || 0),
          raw: t
        }));
    }

    // 10. TAX REPORTS
    if (activeCategory === 'tax') {
      return invoices
        .filter(i => isWithinDateRange(i.invoiceDate || i.date))
        .map(i => {
          const subtotal = Number(i.subtotal || i.taxableAmount || i.grandTotal || 0);
          const tax = Number(i.taxAmount || i.totalTax || 0);
          return {
            id: i._id || i.invoiceNumber,
            date: i.invoiceDate || (i as any).date || '',
            invoiceNo: i.invoiceNumber,
            customerName: cleanVal(i.customerName, 'Unnamed Customer'),
            gstin: cleanVal(i.gstNumber || i.billToAddress?.gstin, 'Unregistered'),
            taxableAmount: subtotal,
            taxAmount: tax,
            totalAmount: Number(i.grandTotal || subtotal + tax),
            raw: i
          };
        });
    }

    return [];
  }, [activeCategory, activeSubReport, invoices, salesOrders, deliveries, purchases, productions, skus, parties, inventoryLedger, transactions, searchQuery, selectedCustomer, selectedSupplier, selectedRegion, selectedStatus, startDate, endDate]);

  // Filter & Sort Processed Rows
  const filteredAndSortedRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let rows = activeReportRows.filter(r => {
      // Universal Query Search
      const matchesSearch = !q || Object.values(r).some(val =>
        val !== null && val !== undefined && String(val).toLowerCase().includes(q)
      );

      // Customer Filter
      const matchesCust = selectedCustomer === 'ALL' || (r.customerName || r.entity || r.name || '').toLowerCase() === selectedCustomer.toLowerCase();

      // Supplier Filter
      const matchesSupp = selectedSupplier === 'ALL' || (r.supplierName || r.vendorName || r.name || '').toLowerCase() === selectedSupplier.toLowerCase();

      // Region Filter
      const matchesReg = selectedRegion === 'ALL' || (r.region || r.city || '').toLowerCase() === selectedRegion.toLowerCase();

      return matchesSearch && matchesCust && matchesSupp && matchesReg;
    });

    // Universal Sorting
    return rows.sort((a: any, b: any) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [activeReportRows, searchQuery, selectedCustomer, selectedSupplier, selectedRegion, sortField, sortAsc]);

  // Pagination Slice
  const totalPages = Math.ceil(filteredAndSortedRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedRows.slice(start, start + pageSize);
  }, [filteredAndSortedRows, currentPage, pageSize]);

  // Column Sort Handler
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Export to Excel Engine
  const handleExportExcel = () => {
    const title = `${activeCategory.toUpperCase()}_Report_${activeSubReport}_${new Date().toISOString().split('T')[0]}`;
    const cleanRows = filteredAndSortedRows.map(r => {
      const copy = { ...r };
      delete copy.raw;
      delete copy.id;
      return copy;
    });

    const ws = XLSX.utils.json_to_sheet(cleanRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${title}.xlsx`);
    showToast('Report exported to Excel successfully', 'success');
  };

  // Print Report Handler
  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="p-4 sm:p-6 bg-slate-50/50 min-h-screen space-y-5">
      {/* ── HEADER & NAVIGATION TITLE ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Enterprise ERP Reports & Analytics</h1>
            <p className="text-xs text-slate-500 font-medium">Real-time Tally-grade ledger audit, financial reporting, stock valuation, and operational analytics.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => loadAllReportData(true)}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            title="Refresh All Report Data"
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

      {/* ── CATEGORY LANDING TABS BAR ── */}
      <div className="flex items-center gap-1.5 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-x-auto">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
          { id: 'sales', label: 'Sales', icon: ShoppingCart },
          { id: 'purchases', label: 'Purchases', icon: ShoppingBag },
          { id: 'inventory', label: 'Stock & Inventory', icon: Layers },
          { id: 'production', label: 'Production', icon: Factory },
          { id: 'dispatch', label: 'Dispatch', icon: Truck },
          { id: 'orders', label: 'Sales Orders', icon: Package },
          { id: 'directory', label: 'Directory', icon: Users },
          { id: 'ledger', label: 'Ledger & Finance', icon: IndianRupee },
          { id: 'tax', label: 'Tax & GST', icon: Percent }
        ].map(cat => (
          <button
            key={cat.id}
            onClick={() => {
              setActiveCategory(cat.id as MainCategoryType);
              setActiveSubReport('summary');
              setCurrentPage(1);
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeCategory === cat.id
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
            }`}
          >
            <cat.icon className="w-3.5 h-3.5" />
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* ── SUB-REPORT SUB-TAB NAVIGATION (IF APPLICABLE) ── */}
      {activeCategory !== 'dashboard' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-100/70 border border-slate-200 rounded-xl overflow-x-auto text-xs font-bold text-slate-600">
          <span className="text-[10px] uppercase font-black text-slate-400 mr-1">Report View:</span>
          {activeCategory === 'sales' && (
            <>
              <SubTabBtn active={activeSubReport === 'summary'} onClick={() => setActiveSubReport('summary')}>Sales Summary</SubTabBtn>
              <SubTabBtn active={activeSubReport === 'by_customer'} onClick={() => setActiveSubReport('by_customer')}>Sales by Customer</SubTabBtn>
              <SubTabBtn active={activeSubReport === 'by_item'} onClick={() => setActiveSubReport('by_item')}>Sales by Item / SKU</SubTabBtn>
            </>
          )}
          {activeCategory === 'inventory' && (
            <>
              <SubTabBtn active={activeSubReport === 'summary'} onClick={() => setActiveSubReport('summary')}>Stock Summary</SubTabBtn>
              <SubTabBtn active={activeSubReport === 'movement'} onClick={() => setActiveSubReport('movement')}>Stock Movement Ledger</SubTabBtn>
            </>
          )}
          {activeCategory === 'purchases' && (
            <SubTabBtn active={true} onClick={() => {}}>Purchase Batch Log</SubTabBtn>
          )}
          {activeCategory === 'production' && (
            <SubTabBtn active={true} onClick={() => {}}>Production Orders</SubTabBtn>
          )}
          {activeCategory === 'dispatch' && (
            <SubTabBtn active={true} onClick={() => {}}>Delivery Challans</SubTabBtn>
          )}
          {activeCategory === 'orders' && (
            <SubTabBtn active={true} onClick={() => {}}>Sales Orders Log</SubTabBtn>
          )}
          {activeCategory === 'directory' && (
            <SubTabBtn active={true} onClick={() => {}}>Party Master Directory</SubTabBtn>
          )}
          {activeCategory === 'ledger' && (
            <SubTabBtn active={true} onClick={() => {}}>Financial Ledger Transactions</SubTabBtn>
          )}
          {activeCategory === 'tax' && (
            <SubTabBtn active={true} onClick={() => {}}>Tax & GST Audit</SubTabBtn>
          )}
        </div>
      )}

      {/* ── EXECUTIVE KPI CARDS ROW (Matching Tally / Enterprise standards) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard title="Sales Revenue" value={`₹${kpiMetrics.totalSales.toLocaleString('en-IN')}`} icon={IndianRupee} color="text-emerald-600" bg="bg-emerald-50" />
        <KpiCard title="Sales Volume" value={`${kpiMetrics.totalSalesVolumeGbl.toLocaleString('en-IN')} GBL`} icon={Layers} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard title="Purchases Spend" value={`₹${kpiMetrics.totalPurchasesCost.toLocaleString('en-IN')}`} icon={ShoppingBag} color="text-purple-600" bg="bg-purple-50" />
        <KpiCard title="Receivables" value={`₹${kpiMetrics.totalReceivables.toLocaleString('en-IN')}`} icon={TrendingUp} color="text-rose-600" bg="bg-rose-50" />
        <KpiCard title="Stock Valuation" value={`₹${kpiMetrics.stockValuation.toLocaleString('en-IN')}`} icon={Package} color="text-indigo-600" bg="bg-indigo-50" />
        <KpiCard title="Gross Margin" value={`${kpiMetrics.profitMargin}%`} icon={Percent} color="text-amber-600" bg="bg-amber-50" />
      </div>

      {/* ── UNIVERSAL FILTER SYSTEM BAR ── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Universal Search */}
          <div className="relative w-full md:w-80">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by ref #, customer, item, SKU..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap sm:flex-nowrap">
            {/* Customer Filter */}
            {customersList.length > 0 && (
              <div className="flex-1 sm:flex-initial">
                <select
                  value={selectedCustomer}
                  onChange={e => { setSelectedCustomer(e.target.value); setCurrentPage(1); }}
                  className="w-full sm:w-44 py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                >
                  <option value="ALL">All Customers</option>
                  {customersList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Supplier Filter */}
            {suppliersList.length > 0 && (
              <div className="flex-1 sm:flex-initial">
                <select
                  value={selectedSupplier}
                  onChange={e => { setSelectedSupplier(e.target.value); setCurrentPage(1); }}
                  className="w-full sm:w-44 py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                >
                  <option value="ALL">All Suppliers</option>
                  {suppliersList.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Region Filter */}
            {regionsList.length > 0 && (
              <div className="flex-1 sm:flex-initial">
                <select
                  value={selectedRegion}
                  onChange={e => { setSelectedRegion(e.target.value); setCurrentPage(1); }}
                  className="w-full sm:w-40 py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                >
                  <option value="ALL">All Regions</option>
                  {regionsList.map(r => (
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
                    {(['All', 'Today', 'Yesterday', 'This Week', 'This Month', 'Last Month', 'This Quarter', 'This Year', 'Custom'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => applyDatePreset(p)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all text-center cursor-pointer ${
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

      {/* ── UNIVERSAL REPORT DATA TABLE ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                {activeCategory === 'sales' && activeSubReport === 'by_customer' && (
                  <>
                    <th className="py-3 px-4 text-left cursor-pointer" onClick={() => handleSort('customerName')}>Customer Name</th>
                    <th className="py-3 px-4 text-left">Region / City</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('invoiceCount')}>Invoices</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('totalGbl')}>Volume (GBL)</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('grossSales')}>Gross Sales (₹)</th>
                    <th className="py-3 px-4 text-right">Tax (₹)</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('netSales')}>Net Sales (₹)</th>
                  </>
                )}

                {activeCategory === 'sales' && activeSubReport === 'by_item' && (
                  <>
                    <th className="py-3 px-4 text-left cursor-pointer" onClick={() => handleSort('skuCode')}>SKU Code</th>
                    <th className="py-3 px-4 text-left cursor-pointer" onClick={() => handleSort('itemName')}>Item Description</th>
                    <th className="py-3 px-4 text-left">Category</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('quantityGbl')}>Qty Sold (GBL)</th>
                    <th className="py-3 px-4 text-right">Qty Sold (PCS)</th>
                    <th className="py-3 px-4 text-right">Avg Rate (₹)</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('totalRevenue')}>Total Revenue (₹)</th>
                  </>
                )}

                {activeCategory === 'sales' && activeSubReport === 'summary' && (
                  <>
                    <th className="py-3 px-4 text-left cursor-pointer" onClick={() => handleSort('date')}>Date</th>
                    <th className="py-3 px-4 text-left cursor-pointer" onClick={() => handleSort('invoiceNo')}>Invoice #</th>
                    <th className="py-3 px-4 text-left">DC #</th>
                    <th className="py-3 px-4 text-left cursor-pointer" onClick={() => handleSort('customerName')}>Customer / Party</th>
                    <th className="py-3 px-4 text-left">Region / City</th>
                    <th className="py-3 px-4 text-right">Items</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('totalGbl')}>Qty (GBL)</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('amount')}>Amount (₹)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Drill-Down</th>
                  </>
                )}

                {activeCategory === 'inventory' && activeSubReport === 'movement' && (
                  <>
                    <th className="py-3 px-4 text-left cursor-pointer" onClick={() => handleSort('date')}>Timestamp</th>
                    <th className="py-3 px-4 text-left">Type</th>
                    <th className="py-3 px-4 text-left cursor-pointer" onClick={() => handleSort('skuCode')}>SKU Code</th>
                    <th className="py-3 px-4 text-left">Item Name</th>
                    <th className="py-3 px-4 text-left">Location</th>
                    <th className="py-3 px-4 text-right">Qty In</th>
                    <th className="py-3 px-4 text-right">Qty Out</th>
                    <th className="py-3 px-4 text-right">Balance After</th>
                  </>
                )}

                {activeCategory === 'inventory' && activeSubReport === 'summary' && (
                  <>
                    <th className="py-3 px-4 text-left cursor-pointer" onClick={() => handleSort('skuCode')}>SKU Code</th>
                    <th className="py-3 px-4 text-left cursor-pointer" onClick={() => handleSort('name')}>Item Description</th>
                    <th className="py-3 px-4 text-left">Category</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('presentStock')}>Present Stock</th>
                    <th className="py-3 px-4 text-right">Min Stock</th>
                    <th className="py-3 px-4 text-right">Unit Cost (₹)</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('totalValue')}>Valuation (₹)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </>
                )}

                {activeCategory !== 'sales' && activeCategory !== 'inventory' && (
                  <>
                    <th className="py-3 px-4 text-left cursor-pointer" onClick={() => handleSort('date')}>Date / Time</th>
                    <th className="py-3 px-4 text-left">Reference #</th>
                    <th className="py-3 px-4 text-left">Party / Description</th>
                    <th className="py-3 px-4 text-left">Details / Region</th>
                    <th className="py-3 px-4 text-right">Volume / Qty</th>
                    <th className="py-3 px-4 text-right">Amount (₹)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Drill-Down</th>
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
                      <span>Fetching dynamic ERP dataset...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 italic">
                    No records found matching the active category filters.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row: any, idx: number) => (
                  <tr key={row.id || idx} className="hover:bg-blue-50/40 transition-colors">
                    {activeCategory === 'sales' && activeSubReport === 'by_customer' && (
                      <>
                        <td className="py-3 px-4 font-bold text-slate-900">{row.customerName}</td>
                        <td className="py-3 px-4 text-slate-600">{row.region || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">{row.invoiceCount}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">{row.totalGbl.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-900">₹{row.grossSales.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500">₹{row.taxAmount.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">₹{row.netSales.toLocaleString('en-IN')}</td>
                      </>
                    )}

                    {activeCategory === 'sales' && activeSubReport === 'by_item' && (
                      <>
                        <td className="py-3 px-4 font-mono font-bold text-purple-700">{row.skuCode}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{row.itemName}</td>
                        <td className="py-3 px-4 text-slate-600">{row.category}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">{row.quantityGbl.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">{row.quantityPcs.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">₹{row.avgRate.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">₹{row.totalRevenue.toLocaleString('en-IN')}</td>
                      </>
                    )}

                    {activeCategory === 'sales' && activeSubReport === 'summary' && (
                      <>
                        <td className="py-3 px-4 font-mono text-slate-600">{row.date || '—'}</td>
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">{row.invoiceNo}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">{row.dcNo}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{row.customerName}</td>
                        <td className="py-3 px-4 text-slate-600">{row.region || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono">{row.itemCount}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">{row.totalGbl.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">₹{row.amount.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            row.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {String(row.status).toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button onClick={() => setSelectedRowDetail(row.raw || row)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg">
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </>
                    )}

                    {activeCategory === 'inventory' && activeSubReport === 'movement' && (
                      <>
                        <td className="py-3 px-4 font-mono text-slate-600">{row.date}</td>
                        <td className="py-3 px-4 font-bold text-blue-700">{row.type}</td>
                        <td className="py-3 px-4 font-mono font-bold text-purple-700">{row.skuCode}</td>
                        <td className="py-3 px-4 text-slate-900 font-bold">{row.skuName}</td>
                        <td className="py-3 px-4 text-slate-600">{row.location}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700 font-bold">+{row.qtyIn}</td>
                        <td className="py-3 px-4 text-right font-mono text-rose-700 font-bold">-{row.qtyOut}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{row.balanceAfter}</td>
                      </>
                    )}

                    {activeCategory === 'inventory' && activeSubReport === 'summary' && (
                      <>
                        <td className="py-3 px-4 font-mono font-bold text-purple-700">{row.skuCode}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{row.name}</td>
                        <td className="py-3 px-4 text-slate-600">{row.category}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{row.presentStock} {row.unit}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500">{row.minStockLevel || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">₹{row.unitCost.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">₹{row.totalValue.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            row.status === 'In Stock' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </>
                    )}

                    {activeCategory !== 'sales' && activeCategory !== 'inventory' && (
                      <>
                        <td className="py-3 px-4 font-mono text-slate-600">{row.date || '—'}</td>
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">{row.invoiceNo || row.orderNo || row.dcNo || row.voucherNo || row.id}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{row.customerName || row.supplierName || row.partyName || row.name || row.entity || '—'}</td>
                        <td className="py-3 px-4 text-slate-600">{row.region || row.city || row.transporter || row.type || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-800">{row.totalGbl || row.totalQty || row.targetQty || row.volume || 0}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">₹{Number(row.totalAmount || row.amount || row.taxAmount || 0).toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {String(row.status || 'Active').toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button onClick={() => setSelectedRowDetail(row.raw || row)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg">
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
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
            <span>Showing {filteredAndSortedRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, filteredAndSortedRows.length)} of {filteredAndSortedRows.length} entries</span>
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
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-100"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2.5 py-1 text-xs font-bold text-slate-800">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-100"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── DRILL-DOWN DETAIL MODAL ── */}
      {selectedRowDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {selectedRowDetail.invoiceNumber || selectedRowDetail.orderNumber || selectedRowDetail.dcNumber || 'Transaction Detail'}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">Itemized audit breakdown</p>
                </div>
              </div>
              <button onClick={() => setSelectedRowDetail(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-xs">
              <div className="font-bold text-slate-900">{selectedRowDetail.customerName || selectedRowDetail.firmName || selectedRowDetail.vendorName || 'General Party'}</div>
              {selectedRowDetail.city && <div className="text-slate-500">{selectedRowDetail.city}, {selectedRowDetail.region || selectedRowDetail.state}</div>}
              {selectedRowDetail.date && <div className="font-mono text-slate-600">Date: {selectedRowDetail.date || selectedRowDetail.invoiceDate}</div>}
            </div>

            {selectedRowDetail.items && Array.isArray(selectedRowDetail.items) && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">Line Items</p>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500">
                        <th className="py-2 px-3 text-left">SKU Code</th>
                        <th className="py-2 px-3 text-left">Item Name</th>
                        <th className="py-2 px-3 text-right">Qty</th>
                        <th className="py-2 px-3 text-right">Rate</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedRowDetail.items.map((it: any, idx: number) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-mono font-bold text-purple-700">{it.skuCode || '—'}</td>
                          <td className="py-2 px-3 text-slate-800">{it.itemName || it.name || 'Item'}</td>
                          <td className="py-2 px-3 text-right font-mono">{it.invoiceQtyGbl || it.quantity || 0}</td>
                          <td className="py-2 px-3 text-right font-mono">₹{Number(it.rate || it.unitPrice || 0).toLocaleString()}</td>
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

// UI Helpers
const SubTabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
      active ? 'bg-white text-blue-700 shadow-2xs' : 'hover:bg-white/60 text-slate-600'
    }`}
  >
    {children}
  </button>
);

const KpiCard: React.FC<{ title: string; value: string; icon: any; color: string; bg: string }> = ({ title, value, icon: Icon, color, bg }) => (
  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{title}</p>
      <p className="text-base font-black text-slate-900 font-mono mt-0.5">{value}</p>
    </div>
    <div className={`w-8 h-8 rounded-xl ${bg} ${color} flex items-center justify-center font-bold shrink-0`}>
      <Icon className="w-4 h-4" />
    </div>
  </div>
);

const LayoutDashboardIcon: React.FC<{ className?: string }> = ({ className }) => (
  <BarChart3 className={className} />
);

export default SalesReports;
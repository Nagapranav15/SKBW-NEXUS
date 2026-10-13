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
import { generateListPdf } from '../../utils/pdfReport';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { useAuth } from '../../context/AuthContext';
import { getInvoices, SalesInvoice } from '../../api/invoiceApi';
import { getDeliveryChallans } from '../../api/deliveryChallanApi';
import { getParties } from '../../api/partyApi';
import { getSkusV2, getBalancesV2, getLedgerV2, getPurchaseInvoicesV2 } from '../../api/mfgApiV2';
import { getSalesOrdersV2 } from '../../api/salesOrderApiV2';
import { getProductionOrders } from '../../api/productionApi';
import { getTransactions } from '../../api/transactionApi';
import { showToast } from '../ui/Toast';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

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

const DONUT_COLORS = ['#0059CF', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#94a3b8'];
const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { x: { grid: { display: false } }, y: { grid: { color: '#f1f5f9' } } }
};
const donutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '65%',
  plugins: { legend: { position: 'right' as const, labels: { boxWidth: 10, font: { size: 12 } } } }
};

const ChartCard: React.FC<{ title: string; empty?: boolean; children: React.ReactNode }> = ({ title, empty, children }) => (
  <div className="bg-gray-50 rounded-xl p-4">
    <h3 className="text-[0.875rem] font-medium text-gray-700 mb-3">{title}</h3>
    <div className="h-56">
      {empty ? (
        <div className="h-full flex items-center justify-center text-[0.875rem] text-gray-400">No data for the selected period</div>
      ) : children}
    </div>
  </div>
);

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
  const [loadIssues, setLoadIssues] = useState<string[]>([]);

  // Filter Bar States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('ALL');
  const [selectedSupplier, setSelectedSupplier] = useState('ALL');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Date Filter Popover & Range State
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
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
      const issues: string[] = [];
      const safe = <T,>(label: string, p: Promise<T>, fallback: T): Promise<T> =>
        p.catch(err => {
          console.error(`Reports: failed to load ${label}`, err);
          issues.push(`${label} could not be loaded`);
          return fallback;
        });

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
        safe('Invoices', getInvoices(companyId), [] as SalesInvoice[]),
        safe('Sales orders', getSalesOrdersV2(companyId), [] as any[]),
        safe('Delivery challans', getDeliveryChallans(companyId), null as any),
        safe('Purchases', getPurchaseInvoicesV2({ companyId }), null as any),
        safe('Production orders', getProductionOrders({ companyId }), [] as any[]),
        safe('Parties', getParties({ company: companyId, limit: 2000 }), null as any),
        safe('Items', getSkusV2(companyId), [] as any[]),
        safe('Stock balances', getBalancesV2(companyId), [] as any[]),
        safe('Stock ledger', getLedgerV2({ companyId, limit: 1000 }), null as any),
        safe('Transactions', getTransactions({ companyId }), null as any)
      ]);

      // 1. Invoices
      const invList = Array.isArray(invsRes) ? invsRes : [];
      const localInvsKey = `skbw_local_invoices_${companyId || 'default'}`;
      let localInvs: any[] = [];
      try {
        localInvs = JSON.parse(localStorage.getItem(localInvsKey) || '[]');
      } catch {}
      const serverNos = new Set(invList.map((i: any) => String(i.invoiceNumber || i._id)));
      const unsyncedLocal = localInvs.filter((i: any) => !serverNos.has(String(i.invoiceNumber || i._id)));
      // Cancelled and draft invoices are not revenue / receivables
      setInvoices([...unsyncedLocal, ...invList].filter((i: any) => {
        const st = String(i.status || '').toLowerCase();
        return st !== 'cancelled' && st !== 'draft';
      }));

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
      const partyIds = new Set(partyList.map((p: any) => String(p._id || p.id || '')));
      setParties([...partyList, ...localParties.filter((p: any) => !partyIds.has(String(p._id || p.id || '')))]);

      // 7. SKUs & Stock Balances
      setSkus(Array.isArray(skusRes) ? skusRes : []);
      setBalances(Array.isArray(balancesRes) ? balancesRes : []);

      // 8. Inventory Movements Ledger
      const ledgerList = invLedgerRes?.data?.ledger || invLedgerRes?.ledger || (Array.isArray(invLedgerRes) ? invLedgerRes : []);
      setInventoryLedger(ledgerList);

      // 9. Financial Transactions
      const txList = txsRes?.data?.transactions || txsRes?.transactions || (Array.isArray(txsRes) ? txsRes : []);
      setTransactions(txList);

      if (partyList.length >= 2000) issues.push('Showing only the first 2,000 parties');
      if (ledgerList.length >= 1000) issues.push('Showing only the latest 1,000 stock ledger entries');
      setLoadIssues(issues);
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
      const cost = Number(sku.avgRate || sku.avgCost || sku.costPrice || sku.standardCost || sku.purchasePrice || sku.ratePerKg || sku.rate || 0);
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

  // ── DASHBOARD CHART DATA ──
  const chartData = useMemo(() => {
    const inRange = invoices.filter(i => isWithinDateRange(i.invoiceDate || (i as any).date));
    const amt = (i: any) => Number(i.grandTotal || i.subtotal || 0);

    const monthMap = new Map<string, number>();
    inRange.forEach(i => {
      const d = new Date(i.invoiceDate || (i as any).date || '');
      if (isNaN(d.getTime())) return;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(k, (monthMap.get(k) || 0) + amt(i));
    });
    const months = Array.from(monthMap.keys()).sort().slice(-12);

    const custMap = new Map<string, number>();
    const regionMap = new Map<string, number>();
    inRange.forEach(i => {
      const c = cleanVal(i.customerName, 'Unnamed Customer');
      custMap.set(c, (custMap.get(c) || 0) + amt(i));
      const r = cleanVal(i.region || i.city || i.billToAddress?.city, 'Unspecified');
      regionMap.set(r, (regionMap.get(r) || 0) + amt(i));
    });
    const topCust = Array.from(custMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const regions = Array.from(regionMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const stockMap = new Map<string, number>();
    skus.forEach(sku => {
      const v = Number(sku.presentStock || 0) * Number(sku.avgRate || sku.avgCost || sku.costPrice || sku.standardCost || sku.purchasePrice || sku.ratePerKg || sku.rate || 0);
      if (v <= 0) return;
      const c = cleanVal(sku.category, 'General');
      stockMap.set(c, (stockMap.get(c) || 0) + v);
    });
    const stockCats = Array.from(stockMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);

    return {
      months: { labels: months, values: months.map(m => Math.round(monthMap.get(m) || 0)) },
      topCust: { labels: topCust.map(c => c[0]), values: topCust.map(c => Math.round(c[1])) },
      regions: { labels: regions.map(r => r[0]), values: regions.map(r => Math.round(r[1])) },
      stock: { labels: stockCats.map(c => c[0]), values: stockCats.map(c => Math.round(c[1])) }
    };
  }, [invoices, skus, startDate, endDate]);

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
          const cost = Number(s.avgRate || s.avgCost || s.costPrice || s.standardCost || s.purchasePrice || s.ratePerKg || s.rate || 0);
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
    if (activeCategory === 'production' && activeSubReport === 'yield') {
      return productions
        .filter(p => isWithinDateRange(p.createdAt || p.startDate || p.date))
        .map(p => {
          const target = Number(p.targetQty || p.quantity || 0);
          const produced = Number(p.totalProducedQty || p.producedQuantity || 0);
          return {
            id: p._id || p.orderNumber,
            date: p.startDate || (p.createdAt ? p.createdAt.split('T')[0] : '') || '',
            orderNo: p.orderNumber || '—',
            itemName: p.itemName || p.skuCode || '—',
            targetQty: target,
            producedQty: produced,
            variance: produced - target,
            yieldPct: target > 0 ? Math.round((produced / target) * 1000) / 10 : 0,
            status: p.status || '—',
            raw: p
          };
        });
    }
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
    if (activeCategory === 'ledger' && activeSubReport === 'ageing') {
      const today = Date.now();
      const map = new Map<string, any>();
      invoices.forEach(i => {
        const total = Number(i.grandTotal || i.subtotal || 0);
        const paid = i.status === 'paid' ? total : Number(i.paidAmount || 0);
        const due = total - paid;
        if (due <= 0.5) return;
        const name = cleanVal(i.customerName, 'Unnamed Customer');
        const key = name.toLowerCase();
        const base = new Date(i.invoiceDate || (i as any).date || '').getTime();
        const days = isNaN(base) ? 0 : Math.max(0, Math.floor((today - base) / 86400000));
        const row = map.get(key) || { id: key, customerName: name, region: cleanVal(i.region || i.city || i.billToAddress?.city), b0: 0, b30: 0, b60: 0, b90: 0, total: 0, invoices: 0 };
        if (days <= 30) row.b0 += due; else if (days <= 60) row.b30 += due; else if (days <= 90) row.b60 += due; else row.b90 += due;
        row.total += due;
        row.invoices += 1;
        map.set(key, row);
      });
      return Array.from(map.values());
    }
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
    if (filteredAndSortedRows.length === 0) {
      showToast('No report rows to print', 'info');
      return;
    }
    const keys = Object.keys(filteredAndSortedRows[0]).filter(k => k !== 'raw' && k !== 'id');
    const label = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
    const fmt = (v: any) => (typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : (v === null || v === undefined || v === '' ? '—' : String(v)));
    generateListPdf({
      companyName: selectedCompany?.name || 'SKBW ERP',
      title: `${activeCategory} report${activeSubReport !== 'summary' ? ` — ${activeSubReport.replace('_', ' ')}` : ''}`,
      meta: [`Rows: ${filteredAndSortedRows.length}`, ...(startDate || endDate ? [`Period: ${startDate || '…'} to ${endDate || '…'}`] : [])],
      head: ['#', ...keys.map(label)],
      body: filteredAndSortedRows.map((r: any, i: number) => [i + 1, ...keys.map(k => fmt(r[k]))]),
      fileName: `${activeCategory}_report_${new Date().toISOString().slice(0, 10)}`,
      rightAlignColumns: keys.map((k, i) => (typeof filteredAndSortedRows[0][k] === 'number' ? i + 1 : -1)).filter(i => i > 0),
    });
  };

  return (
    <div className="p-4 md:p-6 bg-white min-h-[calc(100*var(--vh,1vh))] space-y-4 font-sans text-gray-800">
      {/* ── HEADER ── */}
      <div className="flex items-baseline justify-between gap-4 px-1">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Reports</h1>
          <p className="text-[0.875rem] text-gray-500">
            Ledger audit, financial reporting, stock valuation &amp; operational analytics.
          </p>
        </div>
      </div>

      {/* ── TABS & ACTION TOOLBAR (same as Item Master / Business Directory) ── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between border-b border-gray-200 bg-white px-1 relative">
        {showFilterPanel && (
          <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowFilterPanel(false)} />
        )}
        <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-full min-w-0">
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
            className={`px-4 py-3 text-[0.875rem] font-semibold border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[0.0625rem] ${
              activeCategory === cat.id
                ? 'border-blue-700 text-blue-700 bg-transparent'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
            }`}
          >
            <cat.icon className="w-3.5 h-3.5" />
            <span>{cat.label}</span>
          </button>
        ))}
        </div>

        <div className="py-2 flex items-center gap-2 shrink-0 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search reports..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-8 pr-7 py-1.5 text-[0.875rem] bg-gray-50 border border-gray-200 rounded-xl w-40 md:w-52 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {(customersList.length > 0 || suppliersList.length > 0 || regionsList.length > 0) && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFilterPanel(v => !v)}
                className={`p-2 rounded-xl border flex items-center justify-center cursor-pointer shadow-2xs ${
                  (selectedCustomer !== 'ALL' || selectedSupplier !== 'ALL' || selectedRegion !== 'ALL')
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white hover:bg-blue-50/60 text-blue-600 border-gray-200 hover:border-blue-200'
                }`}
                title="Filters"
              >
                <Filter className="w-4 h-4" />
              </button>
              {showFilterPanel && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-gray-200 shadow-2xl p-4 z-50 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <h4 className="text-[0.875rem] font-semibold text-gray-900">Filters</h4>
                    <button onClick={() => setShowFilterPanel(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
            {/* Customer Filter */}
            {customersList.length > 0 && (
              <div className="w-full">
                <select
                  value={selectedCustomer}
                  onChange={e => { setSelectedCustomer(e.target.value); setCurrentPage(1); }}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[0.875rem] font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
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
              <div className="w-full">
                <select
                  value={selectedSupplier}
                  onChange={e => { setSelectedSupplier(e.target.value); setCurrentPage(1); }}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[0.875rem] font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
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
              <div className="w-full">
                <select
                  value={selectedRegion}
                  onChange={e => { setSelectedRegion(e.target.value); setCurrentPage(1); }}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[0.875rem] font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                >
                  <option value="ALL">All Regions</option>
                  {regionsList.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

                </div>
              )}
            </div>
          )}

            {/* Date Range Popover */}
            <div ref={dateFilterRef} className="relative">
              <button
                type="button"
                onClick={() => setShowDateFilter(!showDateFilter)}
                className={`p-2 rounded-xl border flex items-center justify-center cursor-pointer shadow-2xs ${
                  datePreset !== 'All'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white hover:bg-blue-50/60 text-blue-600 border-gray-200 hover:border-blue-200'
                }`}
                title={datePreset === 'All' ? 'Filter Date' : datePreset}
              >
                <Calendar className="w-4 h-4" />
              </button>

              {showDateFilter && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-[0.875rem] font-medium text-slate-800 uppercase tracking-wider">Date Presets</span>
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
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold text-center cursor-pointer ${
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
                        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">From Date</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={e => setStartDate(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[0.875rem] font-semibold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">To Date</label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={e => setEndDate(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[0.875rem] font-semibold text-slate-800"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

          <button
            type="button"
            onClick={() => loadAllReportData(true)}
            className="p-2 rounded-xl border bg-white hover:bg-blue-50/60 text-blue-600 border-gray-200 hover:border-blue-200 flex items-center justify-center cursor-pointer shadow-2xs"
            title="Refresh All Report Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="p-2 rounded-xl border bg-white hover:bg-blue-50/60 text-blue-600 border-gray-200 hover:border-blue-200 flex items-center justify-center cursor-pointer shadow-2xs"
            title="Export Excel"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handlePrintReport}
            className="p-2 rounded-xl border bg-white hover:bg-blue-50/60 text-blue-600 border-gray-200 hover:border-blue-200 flex items-center justify-center cursor-pointer shadow-2xs"
            title="Print Report"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── SUB-REPORT SUB-TAB NAVIGATION (IF APPLICABLE) ── */}
      {activeCategory !== 'dashboard' && (
        <div className="flex items-center gap-2 px-1 overflow-x-auto text-[0.875rem] font-semibold text-slate-600">
          <span className="text-xs uppercase font-semibold text-slate-400 mr-1">Report View:</span>
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
            <>
              <SubTabBtn active={activeSubReport === 'summary'} onClick={() => setActiveSubReport('summary')}>Production Orders</SubTabBtn>
              <SubTabBtn active={activeSubReport === 'yield'} onClick={() => setActiveSubReport('yield')}>Yield &amp; Variance</SubTabBtn>
            </>
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
            <>
              <SubTabBtn active={activeSubReport === 'summary'} onClick={() => setActiveSubReport('summary')}>Ledger Transactions</SubTabBtn>
              <SubTabBtn active={activeSubReport === 'ageing'} onClick={() => setActiveSubReport('ageing')}>Receivables Ageing</SubTabBtn>
            </>
          )}
          {activeCategory === 'tax' && (
            <SubTabBtn active={true} onClick={() => {}}>Tax & GST Audit</SubTabBtn>
          )}
        </div>
      )}

      {loadIssues.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-[0.875rem]">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Some report data is incomplete. Figures below may be understated.</p>
            <ul className="text-xs list-disc pl-4 mt-0.5">
              {loadIssues.map(m => <li key={m}>{m}</li>)}
            </ul>
          </div>
          <button type="button" onClick={() => loadAllReportData(true)} className="text-xs font-semibold underline cursor-pointer shrink-0">Retry</button>
        </div>
      )}

      {/* ── EXECUTIVE KPI CARDS ROW (Matching Tally / Enterprise standards) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard title="Sales Revenue" value={`₹${kpiMetrics.totalSales.toLocaleString('en-IN')}`} icon={IndianRupee} color="text-emerald-600" bg="bg-emerald-50" />
        <KpiCard title="Sales Volume" value={`${kpiMetrics.totalSalesVolumeGbl.toLocaleString('en-IN')} GBL`} icon={Layers} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard title="Purchases Spend" value={`₹${kpiMetrics.totalPurchasesCost.toLocaleString('en-IN')}`} icon={ShoppingBag} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard title="Receivables" value={`₹${kpiMetrics.totalReceivables.toLocaleString('en-IN')}`} icon={TrendingUp} color="text-rose-600" bg="bg-rose-50" />
        <KpiCard title="Stock Valuation" value={`₹${kpiMetrics.stockValuation.toLocaleString('en-IN')}`} icon={Package} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard title="Gross Margin" value={`${kpiMetrics.profitMargin}%`} icon={Percent} color="text-amber-600" bg="bg-amber-50" />
      </div>

      {activeCategory === 'dashboard' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ChartCard title="Monthly sales (₹)" empty={chartData.months.labels.length === 0}>
            <Bar data={{ labels: chartData.months.labels, datasets: [{ data: chartData.months.values, backgroundColor: '#0059CF', borderRadius: 4 }] }} options={barOptions} />
          </ChartCard>
          <ChartCard title="Top 10 customers (₹)" empty={chartData.topCust.labels.length === 0}>
            <Bar data={{ labels: chartData.topCust.labels, datasets: [{ data: chartData.topCust.values, backgroundColor: '#4B8CE6', borderRadius: 4 }] }} options={{ ...barOptions, indexAxis: 'y' as const }} />
          </ChartCard>
          <ChartCard title="Sales by region" empty={chartData.regions.labels.length === 0}>
            <Doughnut data={{ labels: chartData.regions.labels, datasets: [{ data: chartData.regions.values, backgroundColor: DONUT_COLORS, borderWidth: 0 }] }} options={donutOptions} />
          </ChartCard>
          <ChartCard title="Stock value by category" empty={chartData.stock.labels.length === 0}>
            <Doughnut data={{ labels: chartData.stock.labels, datasets: [{ data: chartData.stock.values, backgroundColor: DONUT_COLORS, borderWidth: 0 }] }} options={donutOptions} />
          </ChartCard>
        </div>
      )}

      {/* ── UNIVERSAL REPORT DATA TABLE ── */}
      <div className="bg-gray-50 rounded-xl overflow-hidden panel-table p-2">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[0.875rem] text-gray-700">
            <thead>
              <tr className="text-xs uppercase font-semibold text-gray-600 border-b border-gray-200">
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

                {activeCategory === 'ledger' && activeSubReport === 'ageing' && (
                  <>
                    <th className="py-3 px-4 text-left cursor-pointer" onClick={() => handleSort('customerName')}>Customer</th>
                    <th className="py-3 px-4 text-left">Region</th>
                    <th className="py-3 px-4 text-right">Open Invoices</th>
                    <th className="py-3 px-4 text-right">0–30 days (₹)</th>
                    <th className="py-3 px-4 text-right">31–60 days (₹)</th>
                    <th className="py-3 px-4 text-right">61–90 days (₹)</th>
                    <th className="py-3 px-4 text-right">90+ days (₹)</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('total')}>Total Due (₹)</th>
                  </>
                )}

                {activeCategory === 'production' && activeSubReport === 'yield' && (
                  <>
                    <th className="py-3 px-4 text-left cursor-pointer" onClick={() => handleSort('date')}>Date</th>
                    <th className="py-3 px-4 text-left">Order #</th>
                    <th className="py-3 px-4 text-left">Item</th>
                    <th className="py-3 px-4 text-right">Target Qty</th>
                    <th className="py-3 px-4 text-right">Produced Qty</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('variance')}>Variance</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('yieldPct')}>Yield %</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </>
                )}

                {activeCategory !== 'sales' && activeCategory !== 'inventory' && !(activeCategory === 'ledger' && activeSubReport === 'ageing') && !(activeCategory === 'production' && activeSubReport === 'yield') && (
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

            <tbody className="bg-white divide-y divide-slate-100 font-medium">
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
                  <tr key={row.id || idx} className="hover:bg-blue-50/40">
                    {activeCategory === 'sales' && activeSubReport === 'by_customer' && (
                      <>
                        <td className="py-3 px-4 font-semibold text-slate-900">{row.customerName}</td>
                        <td className="py-3 px-4 text-slate-600">{row.region || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">{row.invoiceCount}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">{row.totalGbl.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-900">₹{row.grossSales.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500">₹{row.taxAmount.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700">₹{row.netSales.toLocaleString('en-IN')}</td>
                      </>
                    )}

                    {activeCategory === 'sales' && activeSubReport === 'by_item' && (
                      <>
                        <td className="py-3 px-4 font-mono font-semibold text-blue-700">{row.skuCode}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{row.itemName}</td>
                        <td className="py-3 px-4 text-slate-600">{row.category}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">{row.quantityGbl.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">{row.quantityPcs.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">₹{row.avgRate.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700">₹{row.totalRevenue.toLocaleString('en-IN')}</td>
                      </>
                    )}

                    {activeCategory === 'sales' && activeSubReport === 'summary' && (
                      <>
                        <td className="py-3 px-4 font-mono text-slate-600">{row.date || '—'}</td>
                        <td className="py-3 px-4 font-mono font-semibold text-blue-700">{row.invoiceNo}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">{row.dcNo}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{row.customerName}</td>
                        <td className="py-3 px-4 text-slate-600">{row.region || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono">{row.itemCount}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">{row.totalGbl.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">₹{row.amount.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            row.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {String(row.status).toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button onClick={() => setSelectedRowDetail(row.raw || row)} className="icon-btn">
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </>
                    )}

                    {activeCategory === 'inventory' && activeSubReport === 'movement' && (
                      <>
                        <td className="py-3 px-4 font-mono text-slate-600">{row.date}</td>
                        <td className="py-3 px-4 font-semibold text-blue-700">{row.type}</td>
                        <td className="py-3 px-4 font-mono font-semibold text-blue-700">{row.skuCode}</td>
                        <td className="py-3 px-4 text-slate-900 font-semibold">{row.skuName}</td>
                        <td className="py-3 px-4 text-slate-600">{row.location}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700 font-semibold">+{row.qtyIn}</td>
                        <td className="py-3 px-4 text-right font-mono text-rose-700 font-semibold">-{row.qtyOut}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">{row.balanceAfter}</td>
                      </>
                    )}

                    {activeCategory === 'inventory' && activeSubReport === 'summary' && (
                      <>
                        <td className="py-3 px-4 font-mono font-semibold text-blue-700">{row.skuCode}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{row.name}</td>
                        <td className="py-3 px-4 text-slate-600">{row.category}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">{row.presentStock} {row.unit}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500">{row.minStockLevel || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">₹{row.unitCost.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700">₹{row.totalValue.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            row.status === 'In Stock' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </>
                    )}

                    {activeCategory === 'ledger' && activeSubReport === 'ageing' && (
                      <>
                        <td className="py-3 px-4 font-semibold text-slate-900">{row.customerName}</td>
                        <td className="py-3 px-4 text-slate-600">{row.region || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">{row.invoices}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">{row.b0 ? row.b0.toLocaleString('en-IN') : '—'}</td>
                        <td className="py-3 px-4 text-right font-mono text-amber-700">{row.b30 ? row.b30.toLocaleString('en-IN') : '—'}</td>
                        <td className="py-3 px-4 text-right font-mono text-orange-700">{row.b60 ? row.b60.toLocaleString('en-IN') : '—'}</td>
                        <td className="py-3 px-4 text-right font-mono text-rose-600">{row.b90 ? row.b90.toLocaleString('en-IN') : '—'}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">₹{row.total.toLocaleString('en-IN')}</td>
                      </>
                    )}

                    {activeCategory === 'production' && activeSubReport === 'yield' && (
                      <>
                        <td className="py-3 px-4 font-mono text-slate-600">{row.date || '—'}</td>
                        <td className="py-3 px-4 font-mono text-blue-700">{row.orderNo}</td>
                        <td className="py-3 px-4 text-slate-900">{row.itemName}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">{row.targetQty.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">{row.producedQty.toLocaleString('en-IN')}</td>
                        <td className={`py-3 px-4 text-right font-mono ${row.variance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{row.variance > 0 ? '+' : ''}{row.variance.toLocaleString('en-IN')}</td>
                        <td className={`py-3 px-4 text-right font-mono ${row.yieldPct < 95 ? 'text-rose-600' : 'text-emerald-700'}`}>{row.yieldPct}%</td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">{String(row.status).toUpperCase()}</span>
                        </td>
                      </>
                    )}

                    {activeCategory !== 'sales' && activeCategory !== 'inventory' && !(activeCategory === 'ledger' && activeSubReport === 'ageing') && !(activeCategory === 'production' && activeSubReport === 'yield') && (
                      <>
                        <td className="py-3 px-4 font-mono text-slate-600">{row.date || '—'}</td>
                        <td className="py-3 px-4 font-mono font-semibold text-blue-700">{row.invoiceNo || row.orderNo || row.dcNo || row.voucherNo || row.id}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{row.customerName || row.supplierName || row.partyName || row.name || row.entity || '—'}</td>
                        <td className="py-3 px-4 text-slate-600">{row.region || row.city || row.transporter || row.type || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-800">{row.totalGbl || row.totalQty || row.targetQty || row.volume || 0}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">₹{Number(row.totalAmount || row.amount || row.taxAmount || 0).toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {String(row.status || 'Active').toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button onClick={() => setSelectedRowDetail(row.raw || row)} className="icon-btn">
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
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-[0.875rem]">
          <div className="flex items-center gap-2 text-slate-500 font-medium">
            <span>Showing {filteredAndSortedRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, filteredAndSortedRows.length)} of {filteredAndSortedRows.length} entries</span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="py-1 px-2.5 bg-white border border-slate-200 rounded-lg text-[0.875rem] font-semibold text-slate-700"
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
              <span className="px-2.5 py-1 text-[0.875rem] font-semibold text-slate-800">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white max-w-2xl w-full p-6 space-y-4 max-h-[calc(85*var(--vh,1vh))] overflow-y-auto dlg-panel">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-semibold">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-[0.875rem]">
                    {selectedRowDetail.invoiceNumber || selectedRowDetail.orderNumber || selectedRowDetail.dcNumber || 'Transaction Detail'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Itemized audit breakdown</p>
                </div>
              </div>
              <button onClick={() => setSelectedRowDetail(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-[0.875rem]">
              <div className="font-semibold text-slate-900">{selectedRowDetail.customerName || selectedRowDetail.firmName || selectedRowDetail.vendorName || 'General Party'}</div>
              {selectedRowDetail.city && <div className="text-slate-500">{selectedRowDetail.city}, {selectedRowDetail.region || selectedRowDetail.state}</div>}
              {selectedRowDetail.date && <div className="font-mono text-slate-600">Date: {selectedRowDetail.date || selectedRowDetail.invoiceDate}</div>}
            </div>

            {selectedRowDetail.items && Array.isArray(selectedRowDetail.items) && (
              <div className="space-y-2">
                <p className="text-[0.875rem] font-medium text-slate-800 uppercase tracking-wider">Line Items</p>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-[0.875rem]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                        <th className="py-2 px-3 text-left">SKU Code</th>
                        <th className="py-2 px-3 text-left">Item Name</th>
                        <th className="py-2 px-3 text-right">Qty</th>
                        <th className="py-2 px-3 text-right">Rate</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {selectedRowDetail.items.map((it: any, idx: number) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-mono font-semibold text-blue-700">{it.skuCode || '—'}</td>
                          <td className="py-2 px-3 text-slate-800">{it.itemName || it.name || 'Item'}</td>
                          <td className="py-2 px-3 text-right font-mono">{it.invoiceQtyGbl || it.quantity || 0}</td>
                          <td className="py-2 px-3 text-right font-mono">₹{Number(it.rate || it.unitPrice || 0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right font-mono font-semibold">₹{Number(it.amount || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-100 dlg-footer">
              <button
                onClick={() => setSelectedRowDetail(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-[0.875rem] font-semibold cursor-pointer"
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
    className={`px-3 py-1 rounded-lg text-[0.875rem] font-semibold cursor-pointer whitespace-nowrap ${
      active ? 'bg-white text-blue-700 shadow-2xs' : 'hover:bg-white/60 text-slate-600'
    }`}
  >
    {children}
  </button>
);

const KpiCard: React.FC<{ title: string; value: string; icon: any; color: string; bg: string }> = ({ title, value, icon: Icon, color, bg }) => (
  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</p>
      <p className="text-base font-semibold text-slate-900 font-mono mt-0.5">{value}</p>
    </div>
    <div className={`w-8 h-8 rounded-xl ${bg} ${color} flex items-center justify-center font-semibold shrink-0`}>
      <Icon className="w-4 h-4" />
    </div>
  </div>
);

const LayoutDashboardIcon: React.FC<{ className?: string }> = ({ className }) => (
  <BarChart3 className={className} />
);

export default SalesReports;
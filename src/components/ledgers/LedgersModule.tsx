import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText, Search, Download, Plus, ChevronLeft, ChevronRight,
  Printer, ChevronDown, MessageCircle, User, Info, X, ExternalLink,
  CheckCircle2, Clock, AlertCircle, ShoppingBag, Truck, IndianRupee, Layers
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import { getInvoices, SalesInvoice } from '../../api/invoiceApi';
import { getTransactions } from '../../api/transactionApi';
import { getDeliveryChallans } from '../../api/deliveryChallanApi';
import { getParties } from '../../api/partyApi';
import { RecordPaymentModal } from './RecordPaymentModal';
import { PrintLedgerModal } from './PrintLedgerModal';
import { CreateInvoiceModal } from '../invoices/CreateInvoiceModal';
import { showToast } from '../ui/Toast';
import { useNavigate } from 'react-router-dom';

export type LedgerTabType = 'transaction' | 'invoice_wise' | 'payment_wise' | 'outstanding' | 'dispatch_wise' | 'summary';

export interface LedgerTransactionRow {
  id: string;
  date: string;
  type: 'Invoice' | 'Payment' | 'Discount' | 'Adjustment' | 'Dispatch' | 'Opening';
  refNo: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
  balanceType: 'Dr' | 'Cr';
  partyName: string;
  partyId?: string;
  details?: any;
}

export interface CustomerParty {
  id: string;
  name: string;
  code?: string;
  phone?: string;
  address?: string;
  city?: string;
  region?: string;
  creditLimit?: number;
  creditDays?: number;
  openingBalance?: number;
}

const getSafeText = (val: any, fallback = ''): string => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val.trim() || fallback;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (val.name) return getSafeText(val.name, fallback);
    if (val.firmName) return getSafeText(val.firmName, fallback);
    if (val.label) return getSafeText(val.label, fallback);
    if (val._id) return String(val._id);
  }
  return fallback;
};

export const LedgersModule: React.FC = () => {
  const { selectedCompany } = useAuth();
  const navigate = useNavigate();

  // Active Tab State
  const [activeTab, setActiveTab] = useState<LedgerTabType>('transaction');

  // Filter States
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Raw API Data
  const [customers, setCustomers] = useState<CustomerParty[]>([]);
  const [rawInvoices, setRawInvoices] = useState<SalesInvoice[]>([]);
  const [rawTransactions, setRawTransactions] = useState<any[]>([]);
  const [rawDeliveries, setRawDeliveries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Pagination & Expand States
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  // Modal States
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isCreateInvoiceModalOpen, setIsCreateInvoiceModalOpen] = useState<boolean>(false);
  const [isCustomerDetailsModalOpen, setIsCustomerDetailsModalOpen] = useState<boolean>(false);
  const [paymentModalDefaultCustId, setPaymentModalDefaultCustId] = useState<string | undefined>(undefined);
  const [paymentModalDefaultAmount, setPaymentModalDefaultAmount] = useState<number | undefined>(undefined);

  // Fetch dynamic real data from APIs & Local Caches
  const loadLedgerData = async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    try {
      const companyId = selectedCompany?._id;

      // Parallel data fetching for fast load
      const [partiesRes, invsRes, txsRes, dcsRes] = await Promise.all([
        getParties({ company: companyId, type: 'customer' }).catch(() => null),
        getInvoices(companyId).catch(() => []),
        getTransactions({ companyId }).catch(() => null),
        getDeliveryChallans(companyId).catch(() => null)
      ]);

      // 1. Process Parties / Customers
      let partyList: CustomerParty[] = [];
      const rawParties = partiesRes?.data?.parties || partiesRes?.data || partiesRes || [];
      if (Array.isArray(rawParties)) {
        partyList = rawParties.map((p: any) => ({
          id: String(p._id || p.id || p.customerCode || p.firmName),
          name: getSafeText(p.firmName || p.name || p.customerName, 'Unnamed Customer'),
          code: getSafeText(p.customerCode || p.code, ''),
          phone: getSafeText(p.mobile || p.phone || p.contactPerson?.mobile, ''),
          address: getSafeText(p.address || p.billingAddress?.street || p.billingAddress?.address, ''),
          city: getSafeText(p.city || p.billingAddress?.city, ''),
          region: getSafeText(p.region || p.state || p.billingAddress?.state, ''),
          creditLimit: Number(p.creditLimit || p.creditAmount || 0),
          creditDays: Number(p.creditDays || 0),
          openingBalance: Number(p.openingBalance || 0)
        }));
      }

      // Also merge local storage parties if any
      const localPartiesKey = `skbw_parties_${companyId || 'default'}`;
      const localParties = JSON.parse(localStorage.getItem(localPartiesKey) || '[]');
      if (Array.isArray(localParties)) {
        localParties.forEach((lp: any) => {
          const name = getSafeText(lp.firmName || lp.name, '');
          if (name && !partyList.some(p => p.name === name)) {
            partyList.push({
              id: String(lp._id || lp.id || name),
              name,
              code: getSafeText(lp.customerCode || lp.code, ''),
              phone: getSafeText(lp.mobile || lp.phone, ''),
              address: getSafeText(lp.address, ''),
              region: getSafeText(lp.region || lp.state, ''),
              creditLimit: Number(lp.creditLimit || 0),
              creditDays: Number(lp.creditDays || 0),
              openingBalance: Number(lp.openingBalance || 0)
            });
          }
        });
      }

      setCustomers(partyList);

      // 2. Process Invoices
      const invs = Array.isArray(invsRes) ? invsRes : [];
      const localInvsKey = `skbw_local_invoices_${companyId || 'default'}`;
      const localInvs = JSON.parse(localStorage.getItem(localInvsKey) || '[]');
      const combinedInvs = [...localInvs, ...invs];
      setRawInvoices(combinedInvs);

      // 3. Process Transactions (Payments, Receipts, Adjustments)
      let txs = Array.isArray(txsRes?.data) ? txsRes.data : Array.isArray(txsRes) ? txsRes : [];
      const localTxKey = `skbw_transactions_${companyId || 'default'}`;
      const localTxs = JSON.parse(localStorage.getItem(localTxKey) || '[]');
      const combinedTxs = [...localTxs, ...txs];
      setRawTransactions(combinedTxs);

      // 4. Process Delivery Challans / Dispatches
      let dcs = Array.isArray(dcsRes?.data) ? dcsRes.data : Array.isArray(dcsRes) ? dcsRes : [];
      const localDcKey = `skbw_delivery_challans_${companyId || 'default'}`;
      const localDcs = JSON.parse(localStorage.getItem(localDcKey) || '[]');
      const combinedDcs = [...localDcs, ...dcs];
      setRawDeliveries(combinedDcs);

    } catch (err) {
      console.warn('Error loading ledger data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLedgerData();
  }, [selectedCompany?._id]);

  useEffect(() => {
    const handleUpdate = () => loadLedgerData(false);
    window.addEventListener('ledger_updated', handleUpdate);
    window.addEventListener('invoice_created', handleUpdate);
    window.addEventListener('delivery_challan_created', handleUpdate);
    return () => {
      window.removeEventListener('ledger_updated', handleUpdate);
      window.removeEventListener('invoice_created', handleUpdate);
      window.removeEventListener('delivery_challan_created', handleUpdate);
    };
  }, []);

  // Currently Selected Active Customer Object
  const activeCustomer = useMemo(() => {
    if (selectedCustomerId === 'ALL') {
      return customers[0] || null;
    }
    return customers.find(c => c.id === selectedCustomerId || c.name === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  // Available Region Options
  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    customers.forEach(c => { if (c.region) set.add(c.region); });
    rawInvoices.forEach(i => { if (i.region) set.add(i.region); });
    return Array.from(set).sort();
  }, [customers, rawInvoices]);

  // Compute Master Transaction Ledger Rows Dynamically
  const masterLedgerRows = useMemo(() => {
    const rows: LedgerTransactionRow[] = [];
    const custFilterName = activeCustomer ? activeCustomer.name.toLowerCase() : '';

    // 1. Opening Balance Entry
    if (activeCustomer && activeCustomer.openingBalance) {
      const initialOpening = Number(activeCustomer.openingBalance);
      rows.push({
        id: 'tx_opening_0',
        date: dateFrom || '',
        type: 'Opening',
        refNo: '—',
        particulars: 'Opening Balance',
        debit: initialOpening > 0 ? initialOpening : 0,
        credit: initialOpening < 0 ? Math.abs(initialOpening) : 0,
        balance: Math.abs(initialOpening),
        balanceType: initialOpening >= 0 ? 'Dr' : 'Cr',
        partyName: activeCustomer.name
      });
    }

    // 2. Add Sales Invoices (Debit to Customer)
    rawInvoices.forEach((inv, idx) => {
      const cName = getSafeText(inv.customerName, '');
      if (selectedCustomerId !== 'ALL' && activeCustomer) {
        if (!cName.toLowerCase().includes(custFilterName) && inv.customerName !== activeCustomer.name) {
          return;
        }
      }
      const dateStr = inv.invoiceDate || inv.createdAt?.split('T')[0] || '';
      const invAmt = Number(inv.grandTotal || inv.subtotal || 0);

      rows.push({
        id: inv._id || `inv_${idx}`,
        date: dateStr,
        type: 'Invoice',
        refNo: inv.invoiceNumber || '—',
        particulars: `Sales Invoice ${inv.items?.length ? `(${inv.items.length} items)` : ''}`,
        debit: invAmt,
        credit: 0,
        balance: 0,
        balanceType: 'Dr',
        partyName: cName || (activeCustomer ? activeCustomer.name : ''),
        details: inv
      });
    });

    // 3. Add Payments & Receipts (Credit from Customer)
    rawTransactions.forEach((tx, idx) => {
      const cName = getSafeText(tx.partyName || tx.ledgerAccount, '');
      if (selectedCustomerId !== 'ALL' && activeCustomer) {
        if (!cName.toLowerCase().includes(custFilterName) && tx.partyName !== activeCustomer.name) {
          return;
        }
      }
      const dateStr = tx.date?.split('T')[0] || '';
      const amt = Number(tx.amount || 0);
      const isReceipt = tx.type === 'credit' || tx.category === 'Payment';
      const typeLabel = tx.category === 'Discount' ? 'Discount' : tx.category === 'Adjustment' ? 'Adjustment' : 'Payment';

      rows.push({
        id: tx._id || `tx_${idx}`,
        date: dateStr,
        type: typeLabel,
        refNo: tx.referenceId || '—',
        particulars: tx.description || `${tx.paymentMethod || 'Payment'}`,
        debit: isReceipt ? 0 : amt,
        credit: isReceipt ? amt : 0,
        balance: 0,
        balanceType: 'Dr',
        partyName: cName || (activeCustomer ? activeCustomer.name : ''),
        details: tx
      });
    });

    // 4. Add Dispatches (Non-invoiced delivery challans)
    rawDeliveries.forEach((dc, idx) => {
      const cName = getSafeText(dc.customerName || dc.customer, '');
      if (selectedCustomerId !== 'ALL' && activeCustomer) {
        if (!cName.toLowerCase().includes(custFilterName) && dc.customerName !== activeCustomer.name) {
          return;
        }
      }
      if (dc.invoiceStatus === 'Invoiced') return; // Skip if already invoiced

      const dateStr = dc.dispatchDate || dc.date || '';

      rows.push({
        id: dc._id || `dc_${idx}`,
        date: dateStr,
        type: 'Dispatch',
        refNo: dc.dispatchNo || dc.dcNumber || '—',
        particulars: 'Dispatch (Not Invoiced)',
        debit: 0,
        credit: 0,
        balance: 0,
        balanceType: 'Dr',
        partyName: cName || (activeCustomer ? activeCustomer.name : ''),
        details: dc
      });
    });

    // Sort rows by Date ascending
    rows.sort((a, b) => {
      if (!a.date) return -1;
      if (!b.date) return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    // Compute Running Balance row-by-row dynamically!
    let runningBal = 0;
    rows.forEach((r) => {
      if (r.type === 'Opening') {
        runningBal = r.debit - r.credit;
      } else {
        runningBal = runningBal + r.debit - r.credit;
      }
      r.balance = Math.abs(runningBal);
      r.balanceType = runningBal >= 0 ? 'Dr' : 'Cr';
    });

    return rows;
  }, [activeCustomer, selectedCustomerId, rawInvoices, rawTransactions, rawDeliveries, dateFrom]);

  // Filtered Ledger Rows
  const filteredLedgerRows = useMemo(() => {
    return masterLedgerRows.filter(r => {
      if (dateFrom && r.date && r.date < dateFrom) return false;
      if (dateTo && r.date && r.date > dateTo) return false;

      if (selectedStatus !== 'ALL') {
        if (selectedStatus === 'Invoice' && r.type !== 'Invoice') return false;
        if (selectedStatus === 'Payment' && r.type !== 'Payment') return false;
        if (selectedStatus === 'Dispatch' && r.type !== 'Dispatch') return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mRef = r.refNo.toLowerCase().includes(q);
        const mPart = r.particulars.toLowerCase().includes(q);
        const mType = r.type.toLowerCase().includes(q);
        const mParty = r.partyName.toLowerCase().includes(q);
        if (!mRef && !mPart && !mType && !mParty) return false;
      }

      return true;
    });
  }, [masterLedgerRows, dateFrom, dateTo, selectedStatus, searchQuery]);

  // Tab 2 Data: Filtered Sales Invoices
  const filteredInvoiceWiseData = useMemo(() => {
    return rawInvoices.filter(inv => {
      if (selectedCustomerId !== 'ALL' && activeCustomer) {
        if (inv.customerName !== activeCustomer.name) return false;
      }
      if (dateFrom && inv.invoiceDate && inv.invoiceDate < dateFrom) return false;
      if (dateTo && inv.invoiceDate && inv.invoiceDate > dateTo) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mNo = (inv.invoiceNumber || '').toLowerCase().includes(q);
        const mCust = (inv.customerName || '').toLowerCase().includes(q);
        if (!mNo && !mCust) return false;
      }
      return true;
    });
  }, [rawInvoices, selectedCustomerId, activeCustomer, dateFrom, dateTo, searchQuery]);

  // Tab 3 Data: Filtered Payments & Receipts
  const filteredPaymentWiseData = useMemo(() => {
    return rawTransactions.filter(tx => {
      if (selectedCustomerId !== 'ALL' && activeCustomer) {
        if (tx.partyName !== activeCustomer.name && tx.ledgerAccount !== activeCustomer.name) return false;
      }
      const dateStr = tx.date?.split('T')[0] || '';
      if (dateFrom && dateStr && dateStr < dateFrom) return false;
      if (dateTo && dateStr && dateStr > dateTo) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mRef = (tx.referenceId || '').toLowerCase().includes(q);
        const mDesc = (tx.description || '').toLowerCase().includes(q);
        const mParty = (tx.partyName || '').toLowerCase().includes(q);
        if (!mRef && !mDesc && !mParty) return false;
      }
      return true;
    });
  }, [rawTransactions, selectedCustomerId, activeCustomer, dateFrom, dateTo, searchQuery]);

  // Tab 4 Data: Outstanding Unpaid / Partially Paid Invoices
  const filteredOutstandingData = useMemo(() => {
    return rawInvoices.filter(inv => {
      if (inv.status === 'Paid') return false; // Only show pending/unpaid
      if (selectedCustomerId !== 'ALL' && activeCustomer) {
        if (inv.customerName !== activeCustomer.name) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mNo = (inv.invoiceNumber || '').toLowerCase().includes(q);
        const mCust = (inv.customerName || '').toLowerCase().includes(q);
        if (!mNo && !mCust) return false;
      }
      return true;
    }).map(inv => {
      const grandTotal = Number(inv.grandTotal || inv.subtotal || 0);
      const paid = Number((inv as any).paidAmount || 0);
      const pending = Math.max(0, grandTotal - paid);
      
      let daysOverdue = 0;
      if (inv.invoiceDate) {
        const invD = new Date(inv.invoiceDate);
        if (!isNaN(invD.getTime())) {
          daysOverdue = Math.max(0, Math.floor((Date.now() - invD.getTime()) / (1000 * 60 * 60 * 24)));
        }
      }
      return { ...inv, grandTotal, paid, pending, daysOverdue };
    });
  }, [rawInvoices, selectedCustomerId, activeCustomer, searchQuery]);

  // Tab 5 Data: Delivery Challans / Dispatches Breakdown
  const filteredDispatchWiseData = useMemo(() => {
    return rawDeliveries.filter(dc => {
      if (selectedCustomerId !== 'ALL' && activeCustomer) {
        const cName = getSafeText(dc.customerName || dc.customer, '');
        if (cName !== activeCustomer.name) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mNo = (dc.dispatchNo || dc.dcNumber || '').toLowerCase().includes(q);
        const mCust = (dc.customerName || dc.customer || '').toLowerCase().includes(q);
        if (!mNo && !mCust) return false;
      }
      return true;
    });
  }, [rawDeliveries, selectedCustomerId, activeCustomer, searchQuery]);

  // Compute Dynamic Outstanding Financial Summary Card Metrics
  const outstandingMetrics = useMemo(() => {
    const totalSalesInvoices = filteredLedgerRows.filter(r => r.type === 'Invoice').reduce((s, r) => s + r.debit, 0);
    const totalPaymentsReceived = filteredLedgerRows.filter(r => r.type === 'Payment' || r.type === 'Discount').reduce((s, r) => s + r.credit, 0);
    
    const lastRow = filteredLedgerRows[filteredLedgerRows.length - 1];
    const currentBalance = lastRow ? lastRow.balance : 0;
    const currentBalanceType = lastRow ? lastRow.balanceType : 'Dr';

    const pendingDispatchesVal = filteredLedgerRows.filter(r => r.type === 'Dispatch').reduce((s, r) => s + Number(r.details?.invoiceAmount || r.details?.totalValue || 0), 0);

    const overdueVal = filteredOutstandingData.filter(i => i.daysOverdue > 30).reduce((s, i) => s + i.pending, 0);
    const totalPendingVal = currentBalance + pendingDispatchesVal;

    return {
      totalSalesInvoices,
      totalPaymentsReceived,
      currentBalance,
      currentBalanceType,
      overdueVal,
      pendingDispatchesVal,
      totalPendingVal
    };
  }, [filteredLedgerRows, filteredOutstandingData]);

  // Accordion Expand Toggle
  const toggleRowExpand = (id: string) => {
    setExpandedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSelectedCustomerId('ALL');
    setDateFrom('');
    setDateTo('');
    setSelectedRegion('ALL');
    setSelectedStatus('ALL');
    setSearchQuery('');
  };

  // Open Record Payment Modal for specific Customer or Invoice
  const handleTriggerPaymentForInvoice = (inv: any) => {
    const matchedCust = customers.find(c => c.name === inv.customerName);
    setPaymentModalDefaultCustId(matchedCust?.id || activeCustomer?.id);
    setPaymentModalDefaultAmount(inv.pending || inv.grandTotal);
    setIsRecordPaymentOpen(true);
  };

  // Excel Export Handler
  const handleExportExcel = () => {
    try {
      let exportData: any[] = [];
      if (activeTab === 'invoice_wise') {
        exportData = filteredInvoiceWiseData.map((inv, idx) => ({
          '#': idx + 1,
          'Invoice Number': inv.invoiceNumber,
          'Invoice Date': inv.invoiceDate,
          'Customer Name': inv.customerName,
          'Subtotal (₹)': inv.subtotal || 0,
          'Grand Total (₹)': inv.grandTotal || 0,
          'Status': inv.status || 'Created'
        }));
      } else if (activeTab === 'payment_wise') {
        exportData = filteredPaymentWiseData.map((tx, idx) => ({
          '#': idx + 1,
          'Receipt / Ref No': tx.referenceId || '—',
          'Date': tx.date?.split('T')[0] || '—',
          'Customer': tx.partyName || tx.ledgerAccount,
          'Mode': tx.paymentMethod || 'UPI',
          'Amount (₹)': tx.amount || 0,
          'Particulars': tx.description || 'Payment'
        }));
      } else if (activeTab === 'outstanding') {
        exportData = filteredOutstandingData.map((inv, idx) => ({
          '#': idx + 1,
          'Invoice Number': inv.invoiceNumber,
          'Invoice Date': inv.invoiceDate,
          'Customer Name': inv.customerName,
          'Original Value (₹)': inv.grandTotal,
          'Paid Amount (₹)': inv.paid,
          'Pending Outstanding (₹)': inv.pending,
          'Days Overdue': inv.daysOverdue
        }));
      } else {
        exportData = filteredLedgerRows.map((r, idx) => ({
          '#': idx + 1,
          'Date': r.date || '—',
          'Type': r.type,
          'Ref / Voucher No': r.refNo,
          'Particulars': r.particulars,
          'Debit (₹)': r.debit || 0,
          'Credit (₹)': r.credit || 0,
          'Running Balance (₹)': `${r.balance.toLocaleString('en-IN')} ${r.balanceType}`,
          'Customer': r.partyName
        }));
      }

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, activeTab.toUpperCase());
      XLSX.writeFile(wb, `Ledger_${activeTab}_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Excel report downloaded successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to export Excel', 'error');
    }
  };

  // Trigger WhatsApp Statement
  const handleSendWhatsAppStatement = () => {
    if (!activeCustomer || !activeCustomer.phone) {
      showToast('Please select a customer with a registered phone number', 'error');
      return;
    }
    const cleanPhone = activeCustomer.phone.replace(/[^0-9]/g, '');
    const msg = `Dear ${activeCustomer.name},\nYour statement of account balance is ₹${outstandingMetrics.currentBalance.toLocaleString('en-IN')} ${outstandingMetrics.currentBalanceType}.\nTotal Outstanding: ₹${outstandingMetrics.totalPendingVal.toLocaleString('en-IN')}.\nThank you!`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 space-y-4 font-sans text-slate-800">
      
      {/* ── 1. BREADCRUMB & HEADER BANNER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-150 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
            <span>Reports</span>
            <span>&gt;</span>
            <span className="text-slate-900 font-semibold">Ledgers</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-2xs">
              <FileText className="w-5 h-5 text-blue-600 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Ledgers</h1>
              <p className="text-xs text-slate-500">
                View customer ledger, outstanding, payments and transaction history.
              </p>
            </div>
          </div>
        </div>

        {/* Top Right Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {activeCustomer && (
            <button
              onClick={() => setIsCustomerDetailsModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors shadow-2xs cursor-pointer"
            >
              <User className="w-4 h-4 text-blue-600" />
              <span>Customer Info</span>
            </button>
          )}

          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={() => {
              setPaymentModalDefaultCustId(activeCustomer?.id);
              setPaymentModalDefaultAmount(undefined);
              setIsRecordPaymentOpen(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-blue-500/25 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>+ Record Payment</span>
          </button>
        </div>
      </div>


      {/* ── 2. FILTER BAR ── */}
      <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 flex flex-wrap items-end gap-3 shadow-2xs">
        
        {/* Customer Select Dropdown */}
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Customer
            </label>
            {activeCustomer && (
              <button
                onClick={() => setIsCustomerDetailsModalOpen(true)}
                className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>View Details</span>
                <Info className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="relative">
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full pl-3 pr-8 py-2 bg-white border border-slate-250 rounded-xl text-xs font-bold text-slate-800 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 outline-none transition-all appearance-none shadow-2xs cursor-pointer"
            >
              <option value="ALL">All Customers</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.code ? `(${c.code})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        {/* Date From */}
        <div className="w-36">
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
            Date From
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-250 rounded-xl text-xs font-semibold text-slate-800 focus:border-blue-600 outline-none shadow-2xs"
          />
        </div>

        {/* Date To */}
        <div className="w-36">
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
            Date To
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-250 rounded-xl text-xs font-semibold text-slate-800 focus:border-blue-600 outline-none shadow-2xs"
          />
        </div>

        {/* Region */}
        <div className="w-36">
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
            Region
          </label>
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-250 rounded-xl text-xs font-semibold text-slate-800 focus:border-blue-600 outline-none shadow-2xs"
          >
            <option value="ALL">All Regions</option>
            {regionOptions.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div className="w-32">
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
            Status
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-250 rounded-xl text-xs font-semibold text-slate-800 focus:border-blue-600 outline-none shadow-2xs"
          >
            <option value="ALL">All</option>
            <option value="Invoice">Invoices</option>
            <option value="Payment">Payments</option>
            <option value="Dispatch">Dispatches</option>
          </select>
        </div>

        {/* Apply & Reset Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(1)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
          >
            Apply
          </button>
          <button
            onClick={handleResetFilters}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-250 rounded-xl text-xs font-bold transition-colors shadow-2xs cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>


      {/* ── 3. TABS NAVIGATION BAR (Matching InvoicesModule) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 bg-white px-4 rounded-2xl shadow-2xs relative">
        <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-full">
          {[
            { id: 'transaction', label: 'Transaction Ledger', count: filteredLedgerRows.length },
            { id: 'invoice_wise', label: 'Invoice Wise', count: filteredInvoiceWiseData.length },
            { id: 'payment_wise', label: 'Payment Wise', count: filteredPaymentWiseData.length },
            { id: 'outstanding', label: 'Outstanding Invoices', count: filteredOutstandingData.length },
            { id: 'dispatch_wise', label: 'Dispatch Wise', count: filteredDispatchWiseData.length },
            { id: 'summary', label: 'Summary' }
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

        {/* Action on Right of Tab Bar */}
        <div className="py-2 flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsPrintModalOpen(true)}
            className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print Ledger</span>
          </button>
        </div>
      </div>


      {/* ── 4. MAIN DYNAMIC TABS VIEW & SIDEBAR ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* LEFT MAIN AREA (3 COLS) */}
        <div className="lg:col-span-3 space-y-3">
          
          {/* Search & Actions Bar */}
          <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={`Search in ${activeTab.replace('_', ' ')}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-250 rounded-lg text-xs font-medium text-slate-800 outline-none focus:border-blue-600 shadow-2xs"
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Showing active view results
            </span>
          </div>

          {/* DYNAMIC TAB 1: TRANSACTION LEDGER */}
          {activeTab === 'transaction' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
              {isLoading ? (
                <div className="p-12 text-center text-slate-400 text-xs font-bold">
                  Loading ledger entries...
                </div>
              ) : filteredLedgerRows.length === 0 ? (
                <div className="p-12 text-center space-y-2">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">No transaction entries found</p>
                  <p className="text-xs text-slate-500">Try clearing filters or select a different customer</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        <th className="py-3 px-3 w-10 text-center">#</th>
                        <th className="py-3 px-3">DATE</th>
                        <th className="py-3 px-3">TYPE</th>
                        <th className="py-3 px-3">REF NO.</th>
                        <th className="py-3 px-3">PARTICULARS</th>
                        <th className="py-3 px-3 text-right">DEBIT (₹)</th>
                        <th className="py-3 px-3 text-right">CREDIT (₹)</th>
                        <th className="py-3 px-3 text-right">BALANCE (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150">
                      {filteredLedgerRows.map((row, idx) => {
                        const isExpanded = expandedRowIds.has(row.id);
                        let typeBadgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
                        if (row.type === 'Invoice') typeBadgeStyle = 'bg-blue-50 text-blue-700 border-blue-200';
                        if (row.type === 'Payment') typeBadgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        if (row.type === 'Discount') typeBadgeStyle = 'bg-red-50 text-red-700 border-red-200';
                        if (row.type === 'Dispatch') typeBadgeStyle = 'bg-amber-50 text-amber-700 border-amber-200';
                        if (row.type === 'Adjustment') typeBadgeStyle = 'bg-purple-50 text-purple-700 border-purple-200';
                        if (row.type === 'Opening') typeBadgeStyle = 'bg-sky-50 text-sky-700 border-sky-200';

                        return (
                          <React.Fragment key={row.id}>
                            <tr
                              onClick={() => toggleRowExpand(row.id)}
                              className={`cursor-pointer transition-colors duration-150 ${
                                idx % 2 === 0 ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/40 hover:bg-slate-100/60'
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-700 whitespace-nowrap">
                                {row.date || '—'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeBadgeStyle}`}>
                                  {row.type}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-blue-600 hover:underline">
                                {row.refNo}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-800">
                                {row.particulars}
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                                {row.debit > 0 ? row.debit.toLocaleString('en-IN') : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">
                                {row.credit > 0 ? row.credit.toLocaleString('en-IN') : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                                {row.balance.toLocaleString('en-IN')}{' '}
                                <span className="text-[10px] text-slate-500 font-bold">{row.balanceType}</span>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-slate-50 border-y border-slate-200">
                                <td colSpan={8} className="p-4">
                                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                      <span className="font-bold text-slate-800">Entry Details — {row.refNo}</span>
                                      <span className="text-slate-500">{row.date || '—'}</span>
                                    </div>
                                    <p className="text-slate-600">Particulars: <span className="font-medium text-slate-800">{row.particulars}</span></p>
                                    <p className="text-slate-600">Party: <span className="font-medium text-slate-800">{row.partyName || '—'}</span></p>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* DYNAMIC TAB 2: INVOICE WISE */}
          {activeTab === 'invoice_wise' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
              {filteredInvoiceWiseData.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs font-bold">No sales invoices found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        <th className="py-3 px-3 w-10 text-center">#</th>
                        <th className="py-3 px-3">INVOICE NO</th>
                        <th className="py-3 px-3">DATE</th>
                        <th className="py-3 px-3">CUSTOMER</th>
                        <th className="py-3 px-3 text-right">SUBTOTAL (₹)</th>
                        <th className="py-3 px-3 text-right">GRAND TOTAL (₹)</th>
                        <th className="py-3 px-3 text-center">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150">
                      {filteredInvoiceWiseData.map((inv, idx) => (
                        <tr key={inv._id || idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{inv.invoiceNumber}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-700">{inv.invoiceDate}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{inv.customerName}</td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-700">₹{(inv.subtotal || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">₹{(inv.grandTotal || inv.subtotal || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              {inv.status || 'Created'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* DYNAMIC TAB 3: PAYMENT WISE */}
          {activeTab === 'payment_wise' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
              {filteredPaymentWiseData.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs font-bold">No payments or receipts recorded</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        <th className="py-3 px-3 w-10 text-center">#</th>
                        <th className="py-3 px-3">RECEIPT / REF NO</th>
                        <th className="py-3 px-3">DATE</th>
                        <th className="py-3 px-3">CUSTOMER</th>
                        <th className="py-3 px-3">MODE</th>
                        <th className="py-3 px-3">NARRATION</th>
                        <th className="py-3 px-3 text-right">AMOUNT (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150">
                      {filteredPaymentWiseData.map((tx, idx) => (
                        <tr key={tx._id || idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{tx.referenceId || '—'}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-700">{tx.date?.split('T')[0] || '—'}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{tx.partyName || tx.ledgerAccount}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-600">{tx.paymentMethod || 'UPI'}</td>
                          <td className="py-2.5 px-3 text-slate-600">{tx.description || 'Customer Payment'}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-700">₹{(tx.amount || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* DYNAMIC TAB 4: OUTSTANDING INVOICES */}
          {activeTab === 'outstanding' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
              {filteredOutstandingData.length === 0 ? (
                <div className="p-12 text-center text-emerald-600 text-xs font-bold space-y-1">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p>All invoices paid! No pending outstanding bills.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        <th className="py-3 px-3 w-10 text-center">#</th>
                        <th className="py-3 px-3">INVOICE NO</th>
                        <th className="py-3 px-3">DATE</th>
                        <th className="py-3 px-3">CUSTOMER</th>
                        <th className="py-3 px-3 text-right">BILL AMT (₹)</th>
                        <th className="py-3 px-3 text-right">PAID (₹)</th>
                        <th className="py-3 px-3 text-right">PENDING (₹)</th>
                        <th className="py-3 px-3 text-center">OVERDUE</th>
                        <th className="py-3 px-3 text-center">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150">
                      {filteredOutstandingData.map((inv, idx) => (
                        <tr key={inv._id || idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{inv.invoiceNumber}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-700">{inv.invoiceDate}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{inv.customerName}</td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-700">₹{inv.grandTotal.toLocaleString('en-IN')}</td>
                          <td className="py-2.5 px-3 text-right font-medium text-emerald-700">₹{inv.paid.toLocaleString('en-IN')}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-red-600">₹{inv.pending.toLocaleString('en-IN')}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              inv.daysOverdue > 30 ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {inv.daysOverdue} days
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => handleTriggerPaymentForInvoice(inv)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-2xs transition-colors cursor-pointer"
                            >
                              Pay Bill
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* DYNAMIC TAB 5: DISPATCH WISE */}
          {activeTab === 'dispatch_wise' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
              {filteredDispatchWiseData.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs font-bold">No delivery dispatches found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        <th className="py-3 px-3 w-10 text-center">#</th>
                        <th className="py-3 px-3">DISPATCH NO</th>
                        <th className="py-3 px-3">DATE</th>
                        <th className="py-3 px-3">CUSTOMER</th>
                        <th className="py-3 px-3 text-center">ITEMS</th>
                        <th className="py-3 px-3 text-right">TOTAL VALUE (₹)</th>
                        <th className="py-3 px-3 text-center">STATUS</th>
                        <th className="py-3 px-3 text-center">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150">
                      {filteredDispatchWiseData.map((dc, idx) => {
                        const val = Number(dc.invoiceAmount || dc.totalValue || 0);
                        return (
                          <tr key={dc._id || idx} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-amber-700">{dc.dispatchNo || dc.dcNumber || '—'}</td>
                            <td className="py-2.5 px-3 font-medium text-slate-700">{dc.dispatchDate || dc.date || '—'}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">{getSafeText(dc.customerName || dc.customer, '—')}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-700">{dc.items?.length || dc.itemCount || 0}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900">₹{val.toLocaleString('en-IN')}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                dc.invoiceStatus === 'Invoiced' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {dc.invoiceStatus || 'Not Invoiced'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {dc.invoiceStatus !== 'Invoiced' && (
                                <button
                                  onClick={() => setIsCreateInvoiceModalOpen(true)}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold shadow-2xs transition-colors cursor-pointer"
                                >
                                  Invoice DC
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* DYNAMIC TAB 6: SUMMARY */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Sales Invoices</p>
                  <p className="text-2xl font-black text-slate-900">₹{outstandingMetrics.totalSalesInvoices.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Payments Received</p>
                  <p className="text-2xl font-black text-emerald-600">₹{outstandingMetrics.totalPaymentsReceived.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Current Balance</p>
                  <p className="text-2xl font-black text-blue-600">₹{outstandingMetrics.currentBalance.toLocaleString('en-IN')} {outstandingMetrics.currentBalanceType}</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
                <h3 className="font-bold text-slate-900 text-sm">Account Summary Statement</h3>
                <p className="text-xs text-slate-500">
                  Comprehensive audit statement for {activeCustomer ? activeCustomer.name : 'All Customers'}.
                </p>
                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => setIsPrintModalOpen(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Statement</span>
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="px-4 py-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Excel</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>


        {/* RIGHT SIDEBAR PANEL (OUTSTANDING SUMMARY & QUICK ACTIONS) */}
        <div className="space-y-4">
          
          {/* 1. Outstanding Summary Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-150 pb-2.5">
              <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">
                ₹
              </div>
              <h3 className="font-bold text-slate-900 text-xs">Outstanding Summary</h3>
            </div>

            <div className="space-y-2 text-xs">
              <div className="bg-red-50/80 border border-red-150 p-2.5 rounded-xl flex justify-between items-center">
                <span className="font-bold text-red-900">Total Outstanding</span>
                <span className="font-black text-sm text-red-600">
                  ₹ {outstandingMetrics.currentBalance.toLocaleString('en-IN')} {outstandingMetrics.currentBalanceType}
                </span>
              </div>

              <div className="bg-orange-50/60 border border-orange-150 p-2 rounded-xl flex justify-between items-center text-slate-700">
                <span>Overdue (&gt; 30 days)</span>
                <span className="font-bold text-red-600">₹ {outstandingMetrics.overdueVal.toLocaleString('en-IN')} Dr</span>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-2 rounded-xl flex justify-between items-center text-slate-700">
                <span>Not Yet Invoiced</span>
                <span className="font-bold text-slate-900">₹ {outstandingMetrics.pendingDispatchesVal.toLocaleString('en-IN')}</span>
              </div>

              <div className="bg-blue-50/60 border border-blue-150 p-2 rounded-xl flex justify-between items-center font-bold text-blue-900">
                <span>Total Pending</span>
                <span className="font-black text-blue-700">₹ {outstandingMetrics.totalPendingVal.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>


          {/* 2. Quick Actions Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
            <h3 className="font-bold text-slate-900 text-xs border-b border-slate-150 pb-2">
              Quick Actions
            </h3>

            <div className="space-y-2">
              <button
                onClick={() => {
                  setPaymentModalDefaultCustId(activeCustomer?.id);
                  setPaymentModalDefaultAmount(undefined);
                  setIsRecordPaymentOpen(true);
                }}
                className="w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Payment</span>
              </button>

              <button
                onClick={() => setIsCreateInvoiceModalOpen(true)}
                className="w-full py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Create New Invoice</span>
              </button>

              <button
                onClick={handleSendWhatsAppStatement}
                className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>Send Statement (WhatsApp)</span>
              </button>
            </div>
          </div>

        </div>

      </div>


      {/* ── 5. CUSTOMER DETAILS MODAL DIALOG POPUP ── */}
      {isCustomerDetailsModalOpen && activeCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-6 py-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                  {activeCustomer.name[0]}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{activeCustomer.name}</h3>
                  {activeCustomer.code && <p className="text-xs text-slate-400 font-mono">Code: {activeCustomer.code}</p>}
                </div>
              </div>
              <button
                onClick={() => setIsCustomerDetailsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Contact Information</p>
                <p className="text-slate-800"><span className="text-slate-400">Address:</span> {activeCustomer.address || '—'}</p>
                <p className="text-slate-800"><span className="text-slate-400">Region/City:</span> {activeCustomer.region || '—'} {activeCustomer.city ? `, ${activeCustomer.city}` : ''}</p>
                <p className="text-slate-800"><span className="text-slate-400">Phone:</span> {activeCustomer.phone || '—'}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Credit Limit</p>
                  <p className="text-sm font-black text-slate-900">₹{(activeCustomer.creditLimit || 0).toLocaleString('en-IN')}</p>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Credit Days</p>
                  <p className="text-sm font-black text-slate-900">{activeCustomer.creditDays || 0} days</p>
                </div>
              </div>

              <div className="bg-red-50/80 p-3 rounded-xl border border-red-150 flex justify-between items-center">
                <span className="font-bold text-red-900">Current Outstanding</span>
                <span className="font-black text-sm text-red-600">
                  ₹{outstandingMetrics.currentBalance.toLocaleString('en-IN')} {outstandingMetrics.currentBalanceType}
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-150">
                <button
                  onClick={() => setIsCustomerDetailsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setIsCustomerDetailsModalOpen(false);
                    navigate('/directory?tab=customers');
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-2xs flex items-center gap-1 cursor-pointer"
                >
                  <span>View in Directory</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Modals */}
      <RecordPaymentModal
        isOpen={isRecordPaymentOpen}
        onClose={() => {
          setIsRecordPaymentOpen(false);
          setPaymentModalDefaultCustId(undefined);
          setPaymentModalDefaultAmount(undefined);
        }}
        onSuccess={() => loadLedgerData(false)}
        customers={customers}
        defaultCustomerId={paymentModalDefaultCustId || activeCustomer?.id}
        defaultAmount={paymentModalDefaultAmount}
        companyId={selectedCompany?._id}
      />

      <PrintLedgerModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        customer={activeCustomer || undefined}
        dateFrom={dateFrom}
        dateTo={dateTo}
        openingBalance={activeCustomer?.openingBalance || 0}
        openingType="Dr"
        transactions={filteredLedgerRows}
        companyName={selectedCompany?.name || 'SKBW Core'}
      />

      {isCreateInvoiceModalOpen && (
        <CreateInvoiceModal
          isOpen={isCreateInvoiceModalOpen}
          onClose={() => setIsCreateInvoiceModalOpen(false)}
          onSuccess={() => loadLedgerData(false)}
          isDirectInvoice={true}
          dispatchRecord={null}
        />
      )}

    </div>
  );
};

export default LedgersModule;

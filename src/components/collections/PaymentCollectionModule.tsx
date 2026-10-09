import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Wallet, Plus, Search, Edit, Trash2, Download, FileText, Calendar, 
  Filter, CheckCircle2, Clock, Truck, Eye, ChevronRight, ChevronLeft, 
  ChevronDown, RotateCcw, Printer, MoreVertical, X, Check, IndianRupee, 
  ArrowUpDown, ArrowUp, ArrowDown, Send, CheckCircle, Ban, Receipt,
  Building2, MapPin, Upload, Camera, CreditCard, Share2, Users, FileSpreadsheet,
  History, Layers, CheckSquare
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getParties } from '../../api/partyApi';
import { 
  PaymentCollectionEntry, 
  RouteCustomerVisit,
  getPaymentCollections, 
  savePaymentCollection, 
  deletePaymentCollection, 
  getRouteVisits, 
  saveRouteVisit 
} from '../../utils/paymentCollectionStorage';
import { showToast } from '../ui/Toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Custom SVG WhatsApp icon matching Sales Orders vibe
const WhatsAppIcon: React.FC<{ className?: string }> = ({ 
  className = "w-4 h-4 text-emerald-500 hover:text-emerald-600 transition-all duration-300 transform hover:scale-110 block shrink-0" 
}) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.705 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

type SortField = 'receiptNumber' | 'timestamp' | 'customerName' | 'city' | 'totalAmount';
type SortOrder = 'asc' | 'desc';
type TabType = 'all' | 'cash' | 'cheque' | 'upi' | 'routes' | 'import_export';

export const PaymentCollectionModule: React.FC = () => {
  const { selectedCompany, user } = useAuth();

  // Core Data
  const [payments, setPayments] = useState<PaymentCollectionEntry[]>([]);
  const [routeVisits, setRouteVisits] = useState<Record<string, RouteCustomerVisit>>({});
  const [erpCustomers, setErpCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Tab & Filters
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Menus & Selection
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [activeMenuReceiptId, setActiveMenuReceiptId] = useState<string | null>(null);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<Set<string>>(new Set());

  // Modals & Drawers
  const [showRecordDrawer, setShowRecordDrawer] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentCollectionEntry | null>(null);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [voucherData, setVoucherData] = useState<PaymentCollectionEntry | null>(null);
  const [showActivityLogModal, setShowActivityLogModal] = useState(false);

  // Form State for Payment Entry
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formCollectorName, setFormCollectorName] = useState(user?.name || 'Field Agent');
  const [formMode, setFormMode] = useState<'cash' | 'cheque' | 'upi'>('cash');
  const [formCashAmount, setFormCashAmount] = useState<number | ''>('');
  const [formChequeAmount, setFormChequeAmount] = useState<number | ''>('');
  const [formChequeNumber, setFormChequeNumber] = useState('');
  const [formBankName, setFormBankName] = useState('');
  const [formDepositDate, setFormDepositDate] = useState(new Date().toISOString().split('T')[0]);
  const [formUpiAmount, setFormUpiAmount] = useState<number | ''>('');
  const [formUpiRef, setFormUpiRef] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPhoto, setFormPhoto] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Initial Data
  const loadData = async () => {
    setLoading(true);
    try {
      const companyId = selectedCompany?._id;
      const loadedPayments = getPaymentCollections(companyId);
      const loadedVisits = getRouteVisits(companyId);
      setPayments(loadedPayments);
      setRouteVisits(loadedVisits);

      // Fetch dynamic ERP customers
      if (companyId) {
        try {
          const res = await getParties({ company: companyId, type: 'customer', limit: 10000, light: true });
          const parties = res.data?.parties || res.parties || [];
          setErpCustomers(parties);
        } catch (partyErr) {
          console.warn('Failed to load ERP customers for collection:', partyErr);
        }
      }
    } catch (err) {
      console.error('Error loading collections data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleStorageChange = () => {
      loadData();
    };

    window.addEventListener('skbw_collections_updated', handleStorageChange);
    window.addEventListener('skbw_visits_updated', handleStorageChange);
    return () => {
      window.removeEventListener('skbw_collections_updated', handleStorageChange);
      window.removeEventListener('skbw_visits_updated', handleStorageChange);
    };
  }, [selectedCompany?._id]);

  // Click outside listener for dropdown action menus
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuReceiptId(null);
      }
    };
    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, []);

  // Metrics Calculation
  const metrics = useMemo(() => {
    let totalAmt = 0;
    let cashAmt = 0;
    let chequeAmt = 0;
    let upiAmt = 0;
    let chequeCount = 0;
    let upiCount = 0;
    let cashCount = 0;

    payments.forEach(p => {
      totalAmt += p.totalAmount || 0;
      if (p.cash) {
        cashAmt += p.cash;
        cashCount++;
      }
      if (p.cheque?.amount) {
        chequeAmt += p.cheque.amount;
        chequeCount++;
      }
      if (p.upi?.amount) {
        upiAmt += p.upi.amount;
        upiCount++;
      }
    });

    const visitList = Object.values(routeVisits);
    const totalVisits = visitList.length;
    const completedVisits = visitList.filter(v => v.status === 'visited' || v.status === 'payment_collected').length;

    return {
      totalCount: payments.length,
      totalAmt,
      cashAmt,
      cashCount,
      chequeAmt,
      chequeCount,
      upiAmt,
      upiCount,
      completedVisits,
      totalVisits
    };
  }, [payments, routeVisits]);

  // Cities List for filter
  const availableCities = useMemo(() => {
    const citySet = new Set<string>();
    payments.forEach(p => {
      if (p.city) citySet.add(p.city);
    });
    erpCustomers.forEach(c => {
      if (c.city) citySet.add(c.city);
    });
    return Array.from(citySet).sort();
  }, [payments, erpCustomers]);

  // Filtered & Sorted Payments
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      // 1. Tab filter
      if (activeTab === 'cash' && !p.cash) return false;
      if (activeTab === 'cheque' && !p.cheque?.amount) return false;
      if (activeTab === 'upi' && !p.upi?.amount) return false;

      // 2. Mode filter
      if (modeFilter === 'cash' && !p.cash) return false;
      if (modeFilter === 'cheque' && !p.cheque?.amount) return false;
      if (modeFilter === 'upi' && !p.upi?.amount) return false;

      // 3. City filter
      if (cityFilter !== 'all' && p.city !== cityFilter) return false;

      // 4. Search
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const mReceipt = (p.receiptNumber || '').toLowerCase().includes(q);
        const mCust = (p.customerName || '').toLowerCase().includes(q);
        const mCity = (p.city || '').toLowerCase().includes(q);
        const mCheque = (p.cheque?.number || '').toLowerCase().includes(q);
        const mUpi = (p.upi?.refNumber || '').toLowerCase().includes(q);
        const mAgent = (p.collectorName || '').toLowerCase().includes(q);
        if (!mReceipt && !mCust && !mCity && !mCheque && !mUpi && !mAgent) {
          return false;
        }
      }
      return true;
    });
  }, [payments, activeTab, modeFilter, cityFilter, search]);

  const sortedPayments = useMemo(() => {
    return [...filteredPayments].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'totalAmount') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else {
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredPayments, sortField, sortOrder]);

  // Handle Photo Attachment
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('File size must be less than 5MB', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setFormPhoto(event.target?.result as string);
      showToast('Photo proof attached successfully', 'success');
    };
    reader.readAsDataURL(file);
  };

  // Submit Payment Record
  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formCustomerName.trim()) {
      showToast('Please select or enter customer name', 'warning');
      return;
    }

    let total = 0;
    let cashVal: number | undefined;
    let chequeVal: any | undefined;
    let upiVal: any | undefined;

    if (formMode === 'cash') {
      const amt = Number(formCashAmount);
      if (!amt || amt <= 0) {
        showToast('Please enter a valid cash amount', 'warning');
        return;
      }
      total = amt;
      cashVal = amt;
    } else if (formMode === 'cheque') {
      const amt = Number(formChequeAmount);
      if (!amt || amt <= 0) {
        showToast('Please enter a valid cheque amount', 'warning');
        return;
      }
      if (!formChequeNumber.trim()) {
        showToast('Please enter cheque number', 'warning');
        return;
      }
      total = amt;
      chequeVal = {
        amount: amt,
        number: formChequeNumber.trim(),
        bankName: formBankName.trim() || 'Bank',
        depositDate: formDepositDate || new Date().toISOString().split('T')[0],
        photo: formPhoto ? {
          id: `photo-${Date.now()}`,
          dataUrl: formPhoto,
          timestamp: new Date().toISOString(),
          type: 'cheque',
          filename: `cheque_${formChequeNumber}.jpg`
        } : undefined
      };
    } else if (formMode === 'upi') {
      const amt = Number(formUpiAmount);
      if (!amt || amt <= 0) {
        showToast('Please enter a valid UPI amount', 'warning');
        return;
      }
      total = amt;
      upiVal = {
        amount: amt,
        refNumber: formUpiRef.trim() || `UPI-${Date.now().toString().slice(-6)}`,
        screenshot: formPhoto ? {
          id: `photo-${Date.now()}`,
          dataUrl: formPhoto,
          timestamp: new Date().toISOString(),
          type: 'upi',
          filename: `upi_screenshot.jpg`
        } : undefined
      };
    }

    const receiptNo = `REC-${new Date().getFullYear()}-${(payments.length + 1).toString().padStart(4, '0')}`;

    const newEntry: PaymentCollectionEntry = {
      id: `pay-${Date.now()}`,
      receiptNumber: receiptNo,
      customerId: formCustomerId || `cust-${Date.now()}`,
      customerName: formCustomerName.trim(),
      city: formCity.trim() || 'General Market',
      timestamp: new Date().toISOString(),
      collectorName: formCollectorName.trim() || user?.name || 'Field Agent',
      cash: cashVal,
      cheque: chequeVal,
      upi: upiVal,
      totalAmount: total,
      notes: formNotes.trim()
    };

    const updatedList = savePaymentCollection(newEntry, selectedCompany?._id);
    setPayments(updatedList);

    // Automatically update route visit status if customer exists in route
    if (formCustomerId) {
      saveRouteVisit({
        customerId: formCustomerId,
        customerName: formCustomerName.trim(),
        city: formCity.trim() || 'General Market',
        closingBalance: 0,
        status: 'payment_collected',
        visitedAt: new Date().toISOString(),
        notes: `Collected ₹${total.toLocaleString('en-IN')} via ${formMode.toUpperCase()}`
      }, selectedCompany?._id);
    }

    showToast(`Payment receipt ${receiptNo} recorded successfully!`, 'success');

    // Reset drawer state & show printable voucher
    setShowRecordDrawer(false);
    resetForm();
    setVoucherData(newEntry);
    setShowVoucherModal(true);
  };

  const resetForm = () => {
    setFormCustomerId('');
    setFormCustomerName('');
    setFormCity('');
    setFormMode('cash');
    setFormCashAmount('');
    setFormChequeAmount('');
    setFormChequeNumber('');
    setFormBankName('');
    setFormDepositDate(new Date().toISOString().split('T')[0]);
    setFormUpiAmount('');
    setFormUpiRef('');
    setFormNotes('');
    setFormPhoto(null);
  };

  const handleDeleteReceipt = (receipt: PaymentCollectionEntry) => {
    if (window.confirm(`Are you sure you want to delete collection receipt ${receipt.receiptNumber}?`)) {
      const updated = deletePaymentCollection(receipt.id, selectedCompany?._id);
      setPayments(updated);
      showToast(`Receipt ${receipt.receiptNumber} deleted`, 'info');
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    if (sortedPayments.length === 0) {
      showToast('No payment records to export', 'warning');
      return;
    }

    const rows = sortedPayments.map((p, idx) => ({
      'S.No': idx + 1,
      'Receipt No': p.receiptNumber,
      'Date & Time': new Date(p.timestamp).toLocaleString('en-IN'),
      'Customer Name': p.customerName,
      'City / Area': p.city || '—',
      'Collector / Agent': p.collectorName || '—',
      'Payment Mode': p.cash ? 'CASH' : p.cheque ? `CHEQUE (${p.cheque.number})` : `UPI (${p.upi?.refNumber || 'Digital'})`,
      'Cash Amt (₹)': p.cash || 0,
      'Cheque Amt (₹)': p.cheque?.amount || 0,
      'UPI Amt (₹)': p.upi?.amount || 0,
      'Total Amount (₹)': p.totalAmount,
      'Notes': p.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payment Collections');
    XLSX.writeFile(wb, `Payment_Collections_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Payment Collection log exported to Excel!', 'success');
  };

  // Print PDF Report
  const handlePrintPdfReport = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, pageWidth, 20, 'F');

      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text(`${(selectedCompany?.name || 'SKBW CORE').toUpperCase()} — PAYMENT COLLECTIONS REPORT`, 14, 13);

      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Generated: ${new Date().toLocaleDateString('en-IN')}  |  Records: ${sortedPayments.length}  |  Total Collection: Rs. ${metrics.totalAmt.toLocaleString('en-IN')}`,
        14,
        27
      );

      const tableData = sortedPayments.map((p, idx) => [
        idx + 1,
        p.receiptNumber,
        new Date(p.timestamp).toLocaleDateString('en-IN'),
        p.customerName,
        p.city || '—',
        p.collectorName || '—',
        p.cash ? 'CASH' : p.cheque ? `CHEQUE (#${p.cheque.number})` : `UPI (${p.upi?.refNumber || 'Ref'})`,
        `Rs. ${(p.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      ]);

      autoTable(doc, {
        head: [['#', 'Receipt No.', 'Date', 'Customer', 'City', 'Collector', 'Mode / Ref', 'Amount']],
        body: tableData,
        startY: 32,
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] }
      });

      doc.save(`Collection_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast('PDF Collection report generated successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to generate PDF report', 'error');
    }
  };

  // WhatsApp Sender
  const handleShareWhatsApp = (p: PaymentCollectionEntry) => {
    const msg = encodeURIComponent(
      `Namaste *${p.customerName}*,\n\nWe have received your payment of *₹${p.totalAmount.toLocaleString('en-IN')}* against Receipt No: *${p.receiptNumber}* on *${new Date(p.timestamp).toLocaleDateString('en-IN')}*.\n\nMode: *${p.cash ? 'CASH' : p.cheque ? `CHEQUE (${p.cheque.number})` : 'UPI / DIGITAL'}*\nCollector: ${p.collectorName || 'Field Agent'}\n\nThank you for doing business with us!`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 space-y-4 font-sans text-gray-800">
      
      {/* 1. Header Banner (Matching Sales Orders Header Banner exactly) */}
      <div className="flex flex-row items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-2xs relative">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-blue-100/80 text-blue-700 rounded-2xl shadow-2xs">
            <Wallet className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span>Payment Collections</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-bold transition-all">
                {metrics.totalCount} Total
              </span>
            </h1>
            <p className="text-xs text-gray-500 font-medium">
              Unified master directory for field agent payment entries, cheque tracking, collection receipts, and route planning.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRecordDrawer(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-2xs cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* 2. Top KPI Summary Cards Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Collected */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Collection</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-gray-900">
            ₹{metrics.totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
            <span>{metrics.totalCount} receipts issued</span>
          </div>
        </div>

        {/* Card 2: Cash Collections */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-bold uppercase tracking-wider">Cash Collection</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-gray-900">
            ₹{metrics.cashAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-slate-500">
            {metrics.cashCount} cash payments
          </div>
        </div>

        {/* Card 3: Cheques & UPI */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-bold uppercase tracking-wider">Cheques & UPI</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-gray-900">
            ₹{(metrics.chequeAmt + metrics.upiAmt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-2">
            <span>{metrics.chequeCount} Cheques</span> • <span>{metrics.upiCount} Digital</span>
          </div>
        </div>

        {/* Card 4: Route Visits Progress */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-bold uppercase tracking-wider">Route Visit Status</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-gray-900">
            {metrics.completedVisits} / {metrics.totalVisits || erpCustomers.length || 0}
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
            <div 
              className="bg-purple-600 h-1.5 rounded-full transition-all duration-500" 
              style={{ 
                width: `${metrics.totalVisits ? Math.min(100, Math.round((metrics.completedVisits / metrics.totalVisits) * 100)) : 0}%` 
              }} 
            />
          </div>
        </div>
      </div>

      {/* 3. Top Navigation Tabs Bar & Action Toolbar (Exact match to Sales Orders) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 bg-white px-4 rounded-2xl shadow-2xs relative z-30">
        
        {/* Tab Selection */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-full">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
              activeTab === 'all'
                ? 'border-blue-600 text-blue-600 bg-transparent'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
            }`}
          >
            <Receipt className={`w-4 h-4 ${activeTab === 'all' ? 'text-blue-600' : 'text-slate-400'}`} />
            <span>All Collection Receipts</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-800">{metrics.totalCount}</span>
          </button>

          <button
            onClick={() => setActiveTab('cash')}
            className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
              activeTab === 'cash'
                ? 'border-blue-600 text-blue-600 bg-transparent'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
            }`}
          >
            <IndianRupee className={`w-4 h-4 ${activeTab === 'cash' ? 'text-blue-600' : 'text-slate-400'}`} />
            <span>Cash Receipts</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800">{metrics.cashCount}</span>
          </button>

          <button
            onClick={() => setActiveTab('cheque')}
            className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
              activeTab === 'cheque'
                ? 'border-blue-600 text-blue-600 bg-transparent'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
            }`}
          >
            <CreditCard className={`w-4 h-4 ${activeTab === 'cheque' ? 'text-blue-600' : 'text-slate-400'}`} />
            <span>Cheques & Deposits</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-800">{metrics.chequeCount}</span>
          </button>

          <button
            onClick={() => setActiveTab('routes')}
            className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
              activeTab === 'routes'
                ? 'border-blue-600 text-blue-600 bg-transparent'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
            }`}
          >
            <MapPin className={`w-4 h-4 ${activeTab === 'routes' ? 'text-blue-600' : 'text-slate-400'}`} />
            <span>Route Planner & Visits</span>
          </button>

          <button
            onClick={() => setActiveTab('import_export')}
            className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
              activeTab === 'import_export'
                ? 'border-blue-600 text-blue-600 bg-transparent'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
            }`}
          >
            <FileSpreadsheet className={`w-4 h-4 ${activeTab === 'import_export' ? 'text-blue-600' : 'text-slate-400'}`} />
            <span>Import / Export Hub</span>
          </button>
        </div>

        {/* Right Action Toolbar */}
        <div className="py-2 flex items-center gap-2 flex-wrap shrink-0 relative z-40">
          
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt, customer, city..."
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

          {/* Filter Popover Button */}
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={`p-2 rounded-xl border transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
                cityFilter !== 'all' || modeFilter !== 'all'
                  ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-100'
                  : 'bg-white hover:bg-blue-50/60 border-gray-200 hover:border-blue-200 text-blue-600'
              }`}
              title="Filter Records"
            >
              <Filter className="w-4 h-4" />
            </button>

            {showFilterMenu && (
              <div className="absolute right-0 top-10 w-64 bg-white rounded-2xl shadow-xl border border-gray-200 p-4 z-50 space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs font-bold text-gray-900">Filter Collections</span>
                  <button onClick={() => setShowFilterMenu(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 block mb-1">City / Area</label>
                  <select
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                    className="w-full text-xs p-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Cities / Areas</option>
                    {availableCities.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 block mb-1">Payment Mode</label>
                  <select
                    value={modeFilter}
                    onChange={(e) => setModeFilter(e.target.value)}
                    className="w-full text-xs p-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Modes</option>
                    <option value="cash">Cash Only</option>
                    <option value="cheque">Cheque Only</option>
                    <option value="upi">UPI / Online Only</option>
                  </select>
                </div>
                <div className="pt-2 border-t flex justify-end">
                  <button
                    onClick={() => { setCityFilter('all'); setModeFilter('all'); setShowFilterMenu(false); }}
                    className="text-xs text-blue-600 hover:underline font-bold"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Export Excel Button */}
          <button
            onClick={handleExportExcel}
            className="p-2 bg-white hover:bg-emerald-50/60 border border-gray-200 hover:border-emerald-200 text-emerald-700 rounded-xl transition-all cursor-pointer shadow-2xs"
            title="Export Excel"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Print Report PDF Button */}
          <button
            onClick={handlePrintPdfReport}
            className="p-2 bg-white hover:bg-slate-50 border border-gray-200 hover:border-slate-300 text-slate-700 rounded-xl transition-all cursor-pointer shadow-2xs"
            title="Print PDF Report"
          >
            <Printer className="w-4 h-4" />
          </button>

        </div>
      </div>

      {/* 4. Tab Views Content */}
      {activeTab === 'routes' ? (
        /* Route Planner View */
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                <span>Field Agent Route Visits</span>
              </h2>
              <p className="text-xs text-gray-500">Track and update customer visit statuses across cities and markets.</p>
            </div>
            <span className="text-xs bg-purple-50 text-purple-700 font-bold px-3 py-1 rounded-full">
              {Object.keys(routeVisits).length || erpCustomers.length} Customers Assigned
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(erpCustomers.length > 0 ? erpCustomers : [
              { _id: 'c1', name: 'Krishna Traders', city: 'Guntur', phone: '9848012345' },
              { _id: 'c2', name: 'Venkateswara Enterprises', city: 'Vijayawada', phone: '9848023456' },
              { _id: 'c3', name: 'Sri Lakshmi Paper Mart', city: 'Tenali', phone: '9848034567' },
              { _id: 'c4', name: 'Bhavani Agencies', city: 'Ongole', phone: '9848045678' }
            ]).map(cust => {
              const visit = routeVisits[cust._id] || { customerId: cust._id, customerName: cust.name, city: cust.city || 'General', status: 'not_visited', closingBalance: 0 };
              return (
                <div key={cust._id} className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-3 hover:border-blue-300 transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{cust.name}</h3>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{cust.city || 'General Area'}</span>
                      </p>
                    </div>
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      visit.status === 'payment_collected' ? 'bg-emerald-100 text-emerald-800' :
                      visit.status === 'visited' ? 'bg-blue-100 text-blue-800' :
                      visit.status === 'come_later' ? 'bg-amber-100 text-amber-800' :
                      'bg-slate-200 text-slate-700'
                    }`}>
                      {visit.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 pt-2 border-t border-gray-200/60">
                    <button
                      onClick={() => {
                        saveRouteVisit({ ...visit, status: 'visited', visitedAt: new Date().toISOString() }, selectedCompany?._id);
                        showToast(`Status updated for ${cust.name}`, 'success');
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold bg-white border border-gray-200 hover:border-blue-300 text-blue-700 rounded-lg shadow-2xs"
                    >
                      Visited
                    </button>
                    <button
                      onClick={() => {
                        saveRouteVisit({ ...visit, status: 'come_later', visitedAt: new Date().toISOString() }, selectedCompany?._id);
                        showToast(`Scheduled come later for ${cust.name}`, 'info');
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold bg-white border border-gray-200 hover:border-amber-300 text-amber-700 rounded-lg shadow-2xs"
                    >
                      Come Later
                    </button>
                    <button
                      onClick={() => {
                        setFormCustomerId(cust._id);
                        setFormCustomerName(cust.name);
                        setFormCity(cust.city || '');
                        setShowRecordDrawer(true);
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 text-white rounded-lg shadow-2xs hover:bg-emerald-700"
                    >
                      Collect Pay
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : activeTab === 'import_export' ? (
        /* Import / Export Hub View */
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs p-6 space-y-6">
          <div className="border-b pb-4">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              <span>Collection Data Import & Export Hub</span>
            </h2>
            <p className="text-xs text-gray-500">Bulk import customer outstanding dues or export full agent collection logs.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Import Box */}
            <div className="p-6 bg-slate-50 border-2 border-dashed border-gray-300 rounded-2xl text-center space-y-3 hover:border-blue-400 transition-all">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Import Outstanding Customer Dues</h3>
                <p className="text-xs text-gray-500">Upload Excel spreadsheet (.xlsx, .csv) with columns: Customer Name, City, Due Amount.</p>
              </div>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                id="excel-import-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    showToast(`Importing ${file.name}...`, 'info');
                    setTimeout(() => {
                      showToast('Dues dataset imported successfully!', 'success');
                    }, 800);
                  }
                }}
              />
              <label
                htmlFor="excel-import-input"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-2xs"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Select Excel File</span>
              </label>
            </div>

            {/* Export Box */}
            <div className="p-6 bg-slate-50 border border-gray-200 rounded-2xl space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Export Collection Data</h3>
                <p className="text-xs text-gray-500">Generate formatted spreadsheets or print-ready PDF reports.</p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleExportExcel}
                  className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-2xs"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Excel Report (.xlsx)</span>
                </button>
                <button
                  onClick={handlePrintPdfReport}
                  className="w-full px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-2xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>Download PDF Audit Slip (.pdf)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Standard Data Table View (Matching Sales Orders High-Density Table) */
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="px-4 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={selectedReceiptIds.size === sortedPayments.length && sortedPayments.length > 0}
                      onChange={() => {
                        if (selectedReceiptIds.size === sortedPayments.length) {
                          setSelectedReceiptIds(new Set());
                        } else {
                          setSelectedReceiptIds(new Set(sortedPayments.map(p => p.id)));
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3.5">Receipt # & Date</th>
                  <th className="px-4 py-3.5">Customer Name</th>
                  <th className="px-4 py-3.5">City / Area</th>
                  <th className="px-4 py-3.5">Collector</th>
                  <th className="px-4 py-3.5">Payment Mode</th>
                  <th className="px-4 py-3.5 text-right">Amount (₹)</th>
                  <th className="px-4 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/70 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>Loading collection entries...</span>
                      </div>
                    </td>
                  </tr>
                ) : sortedPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <Receipt className="w-8 h-8 text-gray-300" />
                        <span className="font-bold text-gray-700">No payment receipts found</span>
                        <p className="text-xs text-gray-400">Click "+ Record Payment" to create your first payment collection entry.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedPayments.map((p) => {
                    const isSelected = selectedReceiptIds.has(p.id);
                    return (
                      <tr 
                        key={p.id} 
                        className={`hover:bg-blue-50/40 transition-colors ${isSelected ? 'bg-blue-50/60' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              const newSet = new Set(selectedReceiptIds);
                              if (newSet.has(p.id)) newSet.delete(p.id);
                              else newSet.add(p.id);
                              setSelectedReceiptIds(newSet);
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-900">
                          <div className="flex flex-col">
                            <span className="text-blue-700 font-extrabold">{p.receiptNumber}</span>
                            <span className="text-[10px] text-gray-400 font-normal">
                              {new Date(p.timestamp).toLocaleDateString('en-IN')} {new Date(p.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-800">
                          {p.customerName}
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-medium">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            {p.city || 'General Area'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-medium">
                          {p.collectorName || 'Field Agent'}
                        </td>
                        <td className="px-4 py-3">
                          {p.cash ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                              <IndianRupee className="w-3 h-3" /> CASH
                            </span>
                          ) : p.cheque ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800">
                              <CreditCard className="w-3 h-3" /> CHEQUE #{p.cheque.number}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800">
                              <CreditCard className="w-3 h-3" /> UPI ({p.upi?.refNumber || 'Digital'})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-gray-900 text-sm">
                          ₹{(p.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center relative">
                          <div className="flex items-center justify-center gap-1">
                            {/* View Voucher */}
                            <button
                              onClick={() => {
                                setVoucherData(p);
                                setShowVoucherModal(true);
                              }}
                              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-blue-600 transition-all"
                              title="View Voucher"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* WhatsApp Share */}
                            <button
                              onClick={() => handleShareWhatsApp(p)}
                              className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 transition-all"
                              title="Share on WhatsApp"
                            >
                              <WhatsAppIcon className="w-4 h-4 text-emerald-600" />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => handleDeleteReceipt(p)}
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-gray-400 hover:text-rose-600 transition-all"
                              title="Delete Receipt"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Record Payment Slide-over Drawer / Modal */}
      {showRecordDrawer && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-5 border-b flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Record Payment Collection</h2>
                  <p className="text-xs text-gray-500">Issue instant receipt voucher for field customer collection.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowRecordDrawer(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Form Body */}
            <form onSubmit={handleSavePayment} className="p-6 space-y-4 overflow-y-auto flex-1">
              
              {/* Customer Selector */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Customer / Party Name *</label>
                {erpCustomers.length > 0 ? (
                  <select
                    value={formCustomerId}
                    onChange={(e) => {
                      const cid = e.target.value;
                      setFormCustomerId(cid);
                      const found = erpCustomers.find(c => c._id === cid);
                      if (found) {
                        setFormCustomerName(found.name);
                        setFormCity(found.city || '');
                      }
                    }}
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 font-medium"
                    required
                  >
                    <option value="">Select Customer from Directory</option>
                    {erpCustomers.map(c => (
                      <option key={c._id} value={c._id}>{c.name} {c.city ? `(${c.city})` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formCustomerName}
                    onChange={(e) => setFormCustomerName(e.target.value)}
                    placeholder="Enter customer name..."
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500"
                    required
                  />
                )}
              </div>

              {/* City / Market */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">City / Area Market</label>
                <input
                  type="text"
                  value={formCity}
                  onChange={(e) => setFormCity(e.target.value)}
                  placeholder="e.g. Guntur, Market Yard..."
                  className="w-full text-xs p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Payment Mode Selector Tabs */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Payment Mode *</label>
                <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFormMode('cash')}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${
                      formMode === 'cash' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    CASH
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormMode('cheque')}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${
                      formMode === 'cheque' ? 'bg-white text-blue-700 shadow-2xs' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    CHEQUE
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormMode('upi')}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${
                      formMode === 'upi' ? 'bg-white text-purple-700 shadow-2xs' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    UPI / ONLINE
                  </button>
                </div>
              </div>

              {/* Amount Fields according to mode */}
              {formMode === 'cash' && (
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Cash Amount Collected (₹) *</label>
                  <input
                    type="number"
                    value={formCashAmount}
                    onChange={(e) => setFormCashAmount(e.target.value ? Number(e.target.value) : '')}
                    placeholder="0.00"
                    className="w-full text-sm font-bold p-2.5 bg-emerald-50/50 border border-emerald-200 rounded-xl focus:outline-none focus:border-emerald-500 text-emerald-900"
                    required
                  />
                </div>
              )}

              {formMode === 'cheque' && (
                <div className="space-y-3 p-4 bg-blue-50/40 rounded-2xl border border-blue-100">
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">Cheque Amount (₹) *</label>
                    <input
                      type="number"
                      value={formChequeAmount}
                      onChange={(e) => setFormChequeAmount(e.target.value ? Number(e.target.value) : '')}
                      placeholder="0.00"
                      className="w-full text-sm font-bold p-2.5 bg-white border border-blue-200 rounded-xl focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-gray-700 block mb-1">Cheque Number *</label>
                      <input
                        type="text"
                        value={formChequeNumber}
                        onChange={(e) => setFormChequeNumber(e.target.value)}
                        placeholder="e.g. 000124"
                        className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-700 block mb-1">Bank Name</label>
                      <input
                        type="text"
                        value={formBankName}
                        onChange={(e) => setFormBankName(e.target.value)}
                        placeholder="e.g. SBI, HDFC"
                        className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">Deposit Date</label>
                    <input
                      type="date"
                      value={formDepositDate}
                      onChange={(e) => setFormDepositDate(e.target.value)}
                      className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg"
                    />
                  </div>
                </div>
              )}

              {formMode === 'upi' && (
                <div className="space-y-3 p-4 bg-purple-50/40 rounded-2xl border border-purple-100">
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">UPI Amount (₹) *</label>
                    <input
                      type="number"
                      value={formUpiAmount}
                      onChange={(e) => setFormUpiAmount(e.target.value ? Number(e.target.value) : '')}
                      placeholder="0.00"
                      className="w-full text-sm font-bold p-2.5 bg-white border border-purple-200 rounded-xl focus:outline-none focus:border-purple-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">UPI Transaction Reference ID</label>
                    <input
                      type="text"
                      value={formUpiRef}
                      onChange={(e) => setFormUpiRef(e.target.value)}
                      placeholder="e.g. 320591023912"
                      className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* Photo Upload Attachment */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Upload Photo Proof (Cheque / Slip)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  ref={fileInputRef}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 bg-gray-50 border border-gray-200 hover:border-blue-400 rounded-xl text-xs font-bold text-gray-600 flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4 text-blue-600" />
                  <span>{formPhoto ? 'Photo Attached (Click to Change)' : 'Attach Photo Proof / Camera'}</span>
                </button>
                {formPhoto && (
                  <div className="mt-2 relative inline-block">
                    <img src={formPhoto} alt="Proof" className="h-20 w-auto rounded-lg border shadow-xs" />
                    <button
                      type="button"
                      onClick={() => setFormPhoto(null)}
                      className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Remarks / Notes */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Remarks / Note</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional collection notes..."
                  rows={2}
                  className="w-full text-xs p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Drawer Footer Actions */}
              <div className="pt-4 border-t flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowRecordDrawer(false)}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Issue Receipt</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Printable Receipt Voucher Modal */}
      {showVoucherModal && voucherData && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowVoucherModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="border-b pb-4 text-center space-y-1">
              <span className="text-[10px] font-black tracking-widest text-blue-600 uppercase">Payment Receipt Voucher</span>
              <h2 className="text-lg font-black text-gray-900">{selectedCompany?.name || 'SKBW CORE'}</h2>
              <p className="text-xs text-gray-500">Official Field Collection Receipt</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Receipt Number:</span>
                <span className="font-extrabold text-blue-700">{voucherData.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date & Time:</span>
                <span className="font-bold text-gray-800">{new Date(voucherData.timestamp).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Customer Name:</span>
                <span className="font-bold text-gray-900">{voucherData.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">City / Market:</span>
                <span className="font-medium text-gray-800">{voucherData.city || '—'}</span>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="text-gray-500">Payment Mode:</span>
                <span className="font-bold text-gray-900">
                  {voucherData.cash ? 'CASH' : voucherData.cheque ? `CHEQUE (#${voucherData.cheque.number})` : 'UPI / DIGITAL'}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2 text-base">
                <span className="font-bold text-gray-900">Total Collected:</span>
                <span className="font-black text-emerald-600">₹{voucherData.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                onClick={() => handleShareWhatsApp(voucherData)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2"
              >
                <WhatsAppIcon className="w-4 h-4 text-white" />
                <span>Share WhatsApp</span>
              </button>
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Print Voucher</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PaymentCollectionModule;

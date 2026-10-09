import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Banknote, 
  CreditCard, 
  Smartphone, 
  MapPin, 
  Users, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  Search, 
  Plus, 
  Calendar, 
  FileText, 
  Download, 
  Upload, 
  Eye, 
  X, 
  Printer, 
  AlertTriangle, 
  Check, 
  RefreshCw, 
  ArrowRight, 
  Building2, 
  Camera, 
  FileSpreadsheet, 
  Filter, 
  Sparkles,
  Phone,
  Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../ui/Toast';
import { 
  getPaymentCollections, 
  savePaymentCollection, 
  deletePaymentCollection, 
  getRouteVisits, 
  saveRouteVisit, 
  PaymentCollectionEntry, 
  RouteCustomerVisit, 
  PaymentPhotoProof 
} from '../../utils/paymentCollectionStorage';

// Default Master Customers fallback if list empty
const INITIAL_COLLECTION_CUSTOMERS = [
  { id: 'c-1', name: 'Sri Durga Venkateswara Books', city: 'Tirupati', closingBalance: 12450, phone: '9966259732', pgNo: 'PG-01', agent: 'Ramesh Kumar', route: 'Rayalaseema Route' },
  { id: 'c-2', name: 'Malleswari Stationery', city: 'Nizamabad', closingBalance: 8200, phone: '9246912503', pgNo: 'PG-02', agent: 'Suresh V', route: 'North Telangana' },
  { id: 'c-3', name: 'Laxmi Book Center', city: 'Vijayawada', closingBalance: 18430, phone: '9988776655', pgNo: 'PG-03', agent: 'Ramesh Kumar', route: 'Coastal Belt' },
  { id: 'c-4', name: 'Sree Venkatesh Books', city: 'Kadapa', closingBalance: 9780, phone: '9876543210', pgNo: 'PG-04', agent: 'Prakash Rao', route: 'Rayalaseema Route' },
  { id: 'c-5', name: 'Raju Stationers', city: 'Ongole', closingBalance: 4860, phone: '9123456780', pgNo: 'PG-05', agent: 'Ramesh Kumar', route: 'Coastal Belt' },
  { id: 'c-6', name: 'Modern Books', city: 'Hyderabad', closingBalance: 21400, phone: '9988112233', pgNo: 'PG-06', agent: 'Suresh V', route: 'Twin Cities Route' },
  { id: 'c-7', name: 'Srinivasa Book House', city: 'Nellore', closingBalance: 7320, phone: '9012345678', pgNo: 'PG-07', agent: 'Ramesh Kumar', route: 'Coastal Belt' }
];

export const PaymentCollectionModule: React.FC = () => {
  const { selectedCompany, user } = useAuth();
  
  // Tab State: 'dashboard' | 'entry' | 'route' | 'history' | 'io'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'entry' | 'route' | 'history' | 'io'>('dashboard');

  // Core Data States
  const [collections, setCollections] = useState<PaymentCollectionEntry[]>([]);
  const [routeVisits, setRouteVisits] = useState<Record<string, RouteCustomerVisit>>({});
  const [customersList, setCustomersList] = useState<any[]>(INITIAL_COLLECTION_CUSTOMERS);

  // Form State for New Payment Receipt Entry
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'cheque' | 'upi'>('cash');
  const [cashAmount, setCashAmount] = useState<string>('');
  const [chequeAmount, setChequeAmount] = useState<string>('');
  const [chequeNumber, setChequeNumber] = useState<string>('');
  const [chequeBank, setChequeBank] = useState<string>('');
  const [chequeDate, setChequeDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [chequePhoto, setChequePhoto] = useState<PaymentPhotoProof | null>(null);
  
  const [upiAmount, setUpiAmount] = useState<string>('');
  const [upiRefNumber, setUpiRefNumber] = useState<string>('');
  const [upiScreenshot, setUpiScreenshot] = useState<PaymentPhotoProof | null>(null);
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  // Route Planner Filter States
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>('All');
  const [selectedRouteStatusFilter, setSelectedRouteStatusFilter] = useState<string>('All');
  const [routeSearchQuery, setRouteSearchQuery] = useState<string>('');

  // Proof Image Preview Modal State
  const [previewPhoto, setPreviewPhoto] = useState<PaymentPhotoProof | null>(null);
  const [printVoucher, setPrintVoucher] = useState<PaymentCollectionEntry | null>(null);

  // File Input Refs for photo proofs
  const chequePhotoInputRef = useRef<HTMLInputElement>(null);
  const upiPhotoInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();

    const handleUpdate = () => loadData();
    window.addEventListener('skbw_collections_updated', handleUpdate);
    window.addEventListener('skbw_visits_updated', handleUpdate);
    return () => {
      window.removeEventListener('skbw_collections_updated', handleUpdate);
      window.removeEventListener('skbw_visits_updated', handleUpdate);
    };
  }, [selectedCompany?._id]);

  const loadData = () => {
    const companyId = selectedCompany?._id || '';
    const cols = getPaymentCollections(companyId);
    const visits = getRouteVisits(companyId);
    setCollections(cols);
    setRouteVisits(visits);
  };

  // 1. KPI STATS COMPUTATION
  const kpiStats = useMemo(() => {
    let totalCash = 0;
    let totalCheque = 0;
    let totalUpi = 0;

    collections.forEach(c => {
      if (c.cash) totalCash += Number(c.cash) || 0;
      if (c.cheque?.amount) totalCheque += Number(c.cheque.amount) || 0;
      if (c.upi?.amount) totalUpi += Number(c.upi.amount) || 0;
    });

    const totalCollected = totalCash + totalCheque + totalUpi;
    const totalCustomers = customersList.length;

    const visitedCount = Object.values(routeVisits).filter(v => v.status === 'visited' || v.status === 'payment_collected').length;
    const pendingCount = Math.max(0, totalCustomers - visitedCount);
    const comeLaterCount = Object.values(routeVisits).filter(v => v.status === 'come_later').length;

    const targetAmount = 500000;
    const targetProgressPct = Math.min(100, Math.round((totalCollected / targetAmount) * 100));

    // Unique cities count
    const citiesSet = new Set(customersList.map(c => c.city).filter(Boolean));

    return {
      totalCollected,
      totalCash,
      totalCheque,
      totalUpi,
      totalCustomers,
      totalCities: citiesSet.size || 5,
      visitedCount,
      pendingCount,
      comeLaterCount,
      targetProgressPct,
      targetAmount
    };
  }, [collections, routeVisits, customersList]);

  // Handle Photo Proof Upload (Base64)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'cheque' | 'upi') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size should be less than 5MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const proof: PaymentPhotoProof = {
        id: `img-${Date.now()}`,
        dataUrl,
        timestamp: new Date().toLocaleString('en-IN'),
        type,
        filename: file.name
      };

      if (type === 'cheque') setChequePhoto(proof);
      else setUpiScreenshot(proof);
      showToast(`${type.toUpperCase()} proof attached successfully`, 'success');
    };
    reader.readAsDataURL(file);
  };

  // Submit Payment Collection Entry
  const handleSavePaymentReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      showToast('Please select a customer', 'error');
      return;
    }

    const cust = customersList.find(c => c.id === selectedCustomerId || c._id === selectedCustomerId);
    if (!cust) {
      showToast('Customer not found', 'error');
      return;
    }

    let cashNum = 0;
    let chequeNum = 0;
    let upiNum = 0;

    if (paymentMode === 'cash') cashNum = Number(cashAmount) || 0;
    if (paymentMode === 'cheque') chequeNum = Number(chequeAmount) || 0;
    if (paymentMode === 'upi') upiNum = Number(upiAmount) || 0;

    const grandTotal = cashNum + chequeNum + upiNum;
    if (grandTotal <= 0) {
      showToast('Please enter a valid payment amount', 'error');
      return;
    }

    const receiptNum = `RCP-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const newEntry: PaymentCollectionEntry = {
      id: `col-${Date.now()}`,
      receiptNumber: receiptNum,
      customerId: cust.id || cust._id,
      customerName: cust.name || cust.firmName,
      city: cust.city || 'Hyderabad',
      timestamp: new Date().toLocaleString('en-IN', { hour12: true }),
      collectorName: user?.fullName || 'Field Agent',
      cash: cashNum > 0 ? cashNum : undefined,
      cheque: chequeNum > 0 ? {
        amount: chequeNum,
        number: chequeNumber,
        bankName: chequeBank,
        depositDate: chequeDate,
        photo: chequePhoto || undefined
      } : undefined,
      upi: upiNum > 0 ? {
        amount: upiNum,
        refNumber: upiRefNumber,
        screenshot: upiScreenshot || undefined
      } : undefined,
      totalAmount: grandTotal,
      notes: paymentNotes
    };

    savePaymentCollection(newEntry, selectedCompany?._id);

    // Update Route Visit Status automatically
    saveRouteVisit({
      customerId: cust.id || cust._id,
      customerName: cust.name || cust.firmName,
      city: cust.city || 'Hyderabad',
      closingBalance: Math.max(0, (cust.closingBalance || 10000) - grandTotal),
      status: 'payment_collected',
      visitedAt: new Date().toLocaleString('en-IN')
    }, selectedCompany?._id);

    showToast(`Payment Collection Receipt #${receiptNum} recorded successfully`, 'success');

    // Reset Form
    setCashAmount('');
    setChequeAmount('');
    setChequeNumber('');
    setChequeBank('');
    setChequePhoto(null);
    setUpiAmount('');
    setUpiRefNumber('');
    setUpiScreenshot(null);
    setPaymentNotes('');
    setSelectedCustomerId('');
    setCustomerSearch('');

    // Ask to open Receipt Print Voucher
    setPrintVoucher(newEntry);
  };

  // Toggle Route Customer Visit Status
  const handleUpdateVisitStatus = (cust: any, newStatus: RouteCustomerVisit['status']) => {
    const updated = saveRouteVisit({
      customerId: cust.id || cust._id,
      customerName: cust.name || cust.firmName,
      city: cust.city || 'Hyderabad',
      pgNo: cust.pgNo || 'PG-01',
      closingBalance: cust.closingBalance || 10000,
      status: newStatus,
      visitedAt: new Date().toLocaleString('en-IN')
    }, selectedCompany?._id);

    setRouteVisits(updated);
    showToast(`Updated ${cust.name || cust.firmName} visit status to ${newStatus.replace('_', ' ').toUpperCase()}`, 'info');
  };

  // Delete Payment Entry
  const handleDeleteReceipt = (id: string) => {
    if (window.confirm('Are you sure you want to delete this payment receipt?')) {
      const updated = deletePaymentCollection(id, selectedCompany?._id);
      setCollections(updated);
      showToast('Payment receipt deleted', 'info');
    }
  };

  // Export to Excel
  const handleExportToExcel = () => {
    try {
      const exportData = collections.map(c => ({
        'Receipt No': c.receiptNumber,
        'Date & Time': c.timestamp,
        'Customer Name': c.customerName,
        'City': c.city,
        'Collector': c.collectorName,
        'Cash Collected (₹)': c.cash || 0,
        'Cheque Amount (₹)': c.cheque?.amount || 0,
        'Cheque No': c.cheque?.number || '—',
        'Bank Name': c.cheque?.bankName || '—',
        'UPI Amount (₹)': c.upi?.amount || 0,
        'UPI Ref No': c.upi?.refNumber || '—',
        'Total Received (₹)': c.totalAmount,
        'Notes': c.notes || '—'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Payment Collections');
      XLSX.writeFile(wb, `Payment_Collections_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Exported collection report to Excel', 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast('Failed to export to Excel', 'error');
    }
  };

  // Export Summary to PDF
  const handleExportSummaryPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`${selectedCompany?.name || 'SKBW CORE'} - Payment Collections Report`, 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString('en-IN')} | Total Collected: INR ${kpiStats.totalCollected.toLocaleString('en-IN')}`, 14, 23);

      const tableRows = collections.map(c => [
        c.receiptNumber,
        c.customerName,
        c.city,
        `INR ${c.totalAmount.toLocaleString('en-IN')}`,
        c.cash ? 'Cash' : c.cheque ? `Cheque (#${c.cheque.number})` : 'UPI',
        c.timestamp
      ]);

      autoTable(doc, {
        startY: 28,
        head: [['Receipt No', 'Customer Name', 'City', 'Amount', 'Payment Mode', 'Timestamp']],
        body: tableRows,
      });

      doc.save(`Collection_Summary_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast('Generated Payment Collection PDF Report', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('Failed to generate PDF', 'error');
    }
  };

  // Import Customers & Outstanding Balances Excel File
  const handleImportExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<any>(worksheet);

        if (!Array.isArray(json) || json.length === 0) {
          showToast('No valid rows found in uploaded Excel sheet', 'error');
          return;
        }

        const imported = json.map((row, idx) => ({
          id: `imp-${Date.now()}-${idx}`,
          name: row['Customer Name'] || row['Customer'] || row['Party Name'] || row['Name'] || `Customer ${idx+1}`,
          city: row['City'] || row['Town'] || row['Location'] || 'Hyderabad',
          closingBalance: Number(row['Closing Balance'] || row['Outstanding'] || row['Balance'] || row['Amount']) || 0,
          phone: String(row['Mobile'] || row['Phone'] || '—'),
          pgNo: row['PG No'] || `PG-${idx+1}`,
          agent: row['Agent'] || 'Field Agent',
          route: row['Route'] || 'General Route'
        }));

        setCustomersList(prev => [...imported, ...prev]);
        showToast(`Successfully imported ${imported.length} customer records & outstanding dues`, 'success');
      } catch (err) {
        console.error('Excel Import Error:', err);
        showToast('Failed to parse uploaded Excel file', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const filteredRouteCustomers = customersList.filter(c => {
    const matchesCity = selectedCityFilter === 'All' || c.city === selectedCityFilter;
    const visit = routeVisits[c.id || c._id];
    const currentStatus = visit?.status || 'not_visited';
    const matchesStatus = selectedRouteStatusFilter === 'All' || currentStatus === selectedRouteStatusFilter;
    const matchesSearch = !routeSearchQuery.trim() || 
      c.name.toLowerCase().includes(routeSearchQuery.toLowerCase()) || 
      c.city.toLowerCase().includes(routeSearchQuery.toLowerCase());

    return matchesCity && matchesStatus && matchesSearch;
  });

  const uniqueCitiesList = Array.from(new Set(customersList.map(c => c.city).filter(Boolean)));

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-5 text-left bg-slate-50/50 min-h-screen">
      
      {/* ── HEADER BANNER & MODULE TABS ── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-200 shrink-0">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Payment Collections & Field Agent Routes</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Record receipts, track Cash/Cheque/UPI modes, plan agent collection routes, and manage customer dues.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Selector Pills */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shrink-0 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'dashboard' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-teal-600" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('entry')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'entry' ? 'bg-teal-700 text-white shadow-3xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>

          <button
            onClick={() => setActiveTab('route')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'route' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-indigo-600" />
            <span>Route Planner</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'history' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>Collection Logs</span>
          </button>

          <button
            onClick={() => setActiveTab('io')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'io' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Import / Export</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: DASHBOARD & COLLECTION ANALYTICS ── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-5">
          
          {/* Top 4 Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-3xs flex flex-col justify-between h-[115px]">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Total Amount Collected</span>
                <div className="w-7 h-7 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">₹</div>
              </div>
              <div>
                <div className="text-2xl font-black text-slate-900">
                  ₹{kpiStats.totalCollected.toLocaleString('en-IN')}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">
                  Across {collections.length} payment receipts
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-3xs flex flex-col justify-between h-[115px]">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Cash Collection</span>
                <Banknote className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-600">
                  ₹{kpiStats.totalCash.toLocaleString('en-IN')}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">
                  Direct Cash In-Hand
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-3xs flex flex-col justify-between h-[115px]">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Cheque Received</span>
                <CreditCard className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <div className="text-2xl font-black text-indigo-600">
                  ₹{kpiStats.totalCheque.toLocaleString('en-IN')}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">
                  Bank Cheque Receipts
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-3xs flex flex-col justify-between h-[115px]">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>UPI / Bank Transfer</span>
                <Smartphone className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-black text-purple-600">
                  ₹{kpiStats.totalUpi.toLocaleString('en-IN')}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">
                  Online QR & NEFT
                </div>
              </div>
            </div>

          </div>

          {/* Collection Progress & Agent Route Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

            {/* Target Progress Bar Card */}
            <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-3xs flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-teal-600" />
                    <span>Monthly Collection Target</span>
                  </h3>
                  <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                    {kpiStats.targetProgressPct}% Achieved
                  </span>
                </div>

                <div className="pt-4 space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-600">Collected: ₹{kpiStats.totalCollected.toLocaleString('en-IN')}</span>
                    <span className="text-slate-400">Target: ₹{kpiStats.targetAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div className="bg-teal-600 h-full rounded-full transition-all duration-500" style={{ width: `${kpiStats.targetProgressPct}%` }}></div>
                  </div>
                </div>
              </div>

              {/* Agent Visited vs Pending */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-center">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Visited</div>
                  <div className="text-base font-black text-emerald-600 mt-0.5">{kpiStats.visitedCount}</div>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Pending</div>
                  <div className="text-base font-black text-amber-600 mt-0.5">{kpiStats.pendingCount}</div>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Come Later</div>
                  <div className="text-base font-black text-indigo-600 mt-0.5">{kpiStats.comeLaterCount}</div>
                </div>
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-3xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 pb-3 border-b border-slate-100">
                  Quick Actions Hub
                </h3>
                <div className="grid grid-cols-2 gap-3 pt-4">
                  <button
                    onClick={() => setActiveTab('entry')}
                    className="p-3.5 bg-teal-50 hover:bg-teal-100/80 text-teal-800 rounded-xl transition-all font-bold text-xs text-left border border-teal-200 flex flex-col justify-between min-h-[90px] cursor-pointer"
                  >
                    <Plus className="w-5 h-5 text-teal-700" />
                    <div>
                      <div>Record New Receipt</div>
                      <div className="text-[10px] text-teal-600 font-normal mt-0.5">Cash, Cheque, UPI</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveTab('route')}
                    className="p-3.5 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-800 rounded-xl transition-all font-bold text-xs text-left border border-indigo-200 flex flex-col justify-between min-h-[90px] cursor-pointer"
                  >
                    <MapPin className="w-5 h-5 text-indigo-700" />
                    <div>
                      <div>Route Planner</div>
                      <div className="text-[10px] text-indigo-600 font-normal mt-0.5">City & Market Visits</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveTab('history')}
                    className="p-3.5 bg-blue-50 hover:bg-blue-100/80 text-blue-800 rounded-xl transition-all font-bold text-xs text-left border border-blue-200 flex flex-col justify-between min-h-[90px] cursor-pointer"
                  >
                    <Clock className="w-5 h-5 text-blue-700" />
                    <div>
                      <div>Collection Logs</div>
                      <div className="text-[10px] text-blue-600 font-normal mt-0.5">Receipt History & Proofs</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveTab('io')}
                    className="p-3.5 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 rounded-xl transition-all font-bold text-xs text-left border border-emerald-200 flex flex-col justify-between min-h-[90px] cursor-pointer"
                  >
                    <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                    <div>
                      <div>Import / Export</div>
                      <div className="text-[10px] text-emerald-600 font-normal mt-0.5">Excel & PDF Reports</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* Recent Collections Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-3xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Recent Payment Receipts</h3>
              <button 
                onClick={() => setActiveTab('history')}
                className="text-xs font-bold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>View all receipts</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-3 px-4">Receipt No</th>
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">City</th>
                    <th className="py-3 px-4 text-right">Amount Received</th>
                    <th className="py-3 px-4">Payment Mode</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {collections.slice(0, 5).map(c => (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-teal-700">{c.receiptNumber}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{c.customerName}</td>
                      <td className="py-3 px-4 text-slate-500">{c.city}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">₹{c.totalAmount.toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          c.cash ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          c.cheque ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                          'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}>
                          {c.cash ? 'Cash' : c.cheque ? `Cheque (${c.cheque.number || 'Standard'})` : 'UPI / Online'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setPrintVoucher(c)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-bold text-slate-700 transition-colors cursor-pointer"
                        >
                          Print Voucher
                        </button>
                      </td>
                    </tr>
                  ))}
                  {collections.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400 font-medium">
                        No payment collections recorded yet. Click &quot;Record Payment&quot; to add your first receipt.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ── TAB 2: RECORD PAYMENT RECEIPT ── */}
      {activeTab === 'entry' && (
        <div className="max-w-3xl mx-auto space-y-6">
          <form onSubmit={handleSavePaymentReceipt} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-3xs space-y-5">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-teal-600" />
                <span>Record Customer Payment Receipt</span>
              </h2>
              <span className="text-xs text-slate-400 font-semibold">Step 1 of 1</span>
            </div>

            {/* Customer Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Select Customer / Firm <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-teal-500"
                required
              >
                <option value="">-- Choose Customer --</option>
                {customersList.map(c => (
                  <option key={c.id || c._id} value={c.id || c._id}>
                    {c.name || c.firmName} ({c.city}) - Dues: ₹{(c.closingBalance || 0).toLocaleString('en-IN')}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Mode Tabs */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Select Payment Mode</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMode('cash')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    paymentMode === 'cash'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-3xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  <span>Cash Payment</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMode('cheque')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    paymentMode === 'cheque'
                      ? 'bg-indigo-50 text-indigo-800 border-indigo-300 shadow-3xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  <span>Cheque Entry</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMode('upi')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    paymentMode === 'upi'
                      ? 'bg-purple-50 text-purple-800 border-purple-300 shadow-3xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-purple-600" />
                  <span>UPI / Online</span>
                </button>
              </div>
            </div>

            {/* Cash Input */}
            {paymentMode === 'cash' && (
              <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-150 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-emerald-900 mb-1">Cash Amount Received (₹)</label>
                  <input
                    type="number"
                    placeholder="Enter cash amount..."
                    value={cashAmount}
                    onChange={e => setCashAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-900 focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>
              </div>
            )}

            {/* Cheque Input */}
            {paymentMode === 'cheque' && (
              <div className="p-4 bg-indigo-50/40 rounded-xl border border-indigo-150 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-indigo-900 mb-1">Cheque Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="Amount on cheque..."
                      value={chequeAmount}
                      onChange={e => setChequeAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-indigo-900 mb-1">Cheque Number</label>
                    <input
                      type="text"
                      placeholder="6-digit Cheque No..."
                      value={chequeNumber}
                      onChange={e => setChequeNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-indigo-900 mb-1">Bank Name</label>
                    <input
                      type="text"
                      placeholder="e.g. HDFC, SBI, ICICI..."
                      value={chequeBank}
                      onChange={e => setChequeBank(e.target.value)}
                      className="w-full px-3 py-2 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-indigo-900 mb-1">Deposit Date</label>
                    <input
                      type="date"
                      value={chequeDate}
                      onChange={e => setChequeDate(e.target.value)}
                      className="w-full px-3 py-2 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                </div>

                {/* Photo Proof Attachment */}
                <div>
                  <label className="block text-xs font-bold text-indigo-900 mb-1">Cheque Photo Proof</label>
                  <input
                    type="file"
                    ref={chequePhotoInputRef}
                    accept="image/*"
                    onChange={e => handlePhotoUpload(e, 'cheque')}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => chequePhotoInputRef.current?.click()}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{chequePhoto ? 'Change Photo' : 'Upload Cheque Photo'}</span>
                    </button>
                    {chequePhoto && (
                      <span className="text-xs text-indigo-700 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Attached</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* UPI Input */}
            {paymentMode === 'upi' && (
              <div className="p-4 bg-purple-50/40 rounded-xl border border-purple-150 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-purple-900 mb-1">UPI Amount Received (₹)</label>
                    <input
                      type="number"
                      placeholder="Amount transferred..."
                      value={upiAmount}
                      onChange={e => setUpiAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-purple-200 rounded-xl text-xs font-bold text-purple-900 focus:ring-2 focus:ring-purple-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-purple-900 mb-1">UPI Reference / UTR No</label>
                    <input
                      type="text"
                      placeholder="Ref/UTR Number..."
                      value={upiRefNumber}
                      onChange={e => setUpiRefNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-purple-200 rounded-xl text-xs font-bold text-purple-900 focus:ring-2 focus:ring-purple-500 bg-white"
                    />
                  </div>
                </div>

                {/* Screenshot Attachment */}
                <div>
                  <label className="block text-xs font-bold text-purple-900 mb-1">Payment Screenshot Proof</label>
                  <input
                    type="file"
                    ref={upiPhotoInputRef}
                    accept="image/*"
                    onChange={e => handlePhotoUpload(e, 'upi')}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => upiPhotoInputRef.current?.click()}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{upiScreenshot ? 'Change Screenshot' : 'Upload Screenshot'}</span>
                    </button>
                    {upiScreenshot && (
                      <span className="text-xs text-purple-700 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Attached</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Collection Notes */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Remarks / Agent Notes</label>
              <textarea
                placeholder="Optional visit notes or remarks..."
                value={paymentNotes}
                onChange={e => setPaymentNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold text-xs shadow-md shadow-teal-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Save & Issue Payment Receipt</span>
            </button>
          </form>
        </div>
      )}

      {/* ── TAB 3: ROUTE PLANNER & AREA VISITS ── */}
      {activeTab === 'route' && (
        <div className="space-y-5">
          {/* Route Filter Controls */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">City:</span>
              <button
                onClick={() => setSelectedCityFilter('All')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  selectedCityFilter === 'All' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Cities
              </button>
              {uniqueCitiesList.map(city => (
                <button
                  key={city}
                  onClick={() => setSelectedCityFilter(city)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    selectedCityFilter === city ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search route or customer..."
                value={routeSearchQuery}
                onChange={e => setRouteSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 bg-white"
              />
            </div>
          </div>

          {/* Route Customer Cards List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRouteCustomers.map(cust => {
              const visit = routeVisits[cust.id || cust._id];
              const currentStatus = visit?.status || 'not_visited';

              return (
                <div key={cust.id || cust._id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-3xs flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-mono font-bold">
                          {cust.pgNo || 'PG-01'}
                        </span>
                        <h3 className="font-extrabold text-slate-900 text-sm mt-1">{cust.name}</h3>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>{cust.city}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Dues Balance</div>
                        <div className="font-black text-rose-600 text-sm mt-0.5">
                          ₹{(cust.closingBalance || 0).toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Visit Action Status Toggles */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                    <button
                      onClick={() => handleUpdateVisitStatus(cust, 'not_visited')}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        currentStatus === 'not_visited' ? 'bg-slate-200 text-slate-800' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      Pending
                    </button>

                    <button
                      onClick={() => handleUpdateVisitStatus(cust, 'come_later')}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        currentStatus === 'come_later' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      Come Later
                    </button>

                    <button
                      onClick={() => handleUpdateVisitStatus(cust, 'visited')}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        currentStatus === 'visited' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      Visited
                    </button>

                    <button
                      onClick={() => {
                        setSelectedCustomerId(cust.id || cust._id);
                        setActiveTab('entry');
                      }}
                      className="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                    >
                      Collect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 4: COLLECTION LOGS & HISTORY ── */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-3xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900">Payment Collection Logs & Audit History</h3>
            <span className="text-xs font-bold text-slate-500">{collections.length} total receipts recorded</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="py-3 px-4">Receipt No</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Collector Agent</th>
                  <th className="py-3 px-4 text-right">Amount Received</th>
                  <th className="py-3 px-4">Payment Proof</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {collections.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-teal-700">{c.receiptNumber}</td>
                    <td className="py-3.5 px-4 text-slate-500">{c.timestamp}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{c.customerName}</td>
                    <td className="py-3.5 px-4 text-slate-600">{c.collectorName || 'Agent'}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900">₹{c.totalAmount.toLocaleString('en-IN')}</td>
                    <td className="py-3.5 px-4">
                      {c.cheque?.photo ? (
                        <button
                          onClick={() => setPreviewPhoto(c.cheque!.photo!)}
                          className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Cheque Proof</span>
                        </button>
                      ) : c.upi?.screenshot ? (
                        <button
                          onClick={() => setPreviewPhoto(c.upi!.screenshot!)}
                          className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>UPI Proof</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">No image attached</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => setPrintVoucher(c)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold cursor-pointer"
                      >
                        Print
                      </button>
                      <button
                        onClick={() => handleDeleteReceipt(c.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        title="Delete receipt"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {collections.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                      No historical payment collections found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 5: IMPORT / EXPORT HUB ── */}
      {activeTab === 'io' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Import Excel Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-3xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Import Customer Dues from Excel</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Upload .xlsx / .csv spreadsheet to import customer balances.</p>
              </div>
            </div>

            <input
              type="file"
              ref={importFileInputRef}
              accept=".xlsx, .xls, .csv"
              onChange={handleImportExcelFile}
              className="hidden"
            />

            <button
              onClick={() => importFileInputRef.current?.click()}
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Select & Import Excel Spreadsheet</span>
            </button>
          </div>

          {/* Export Reports Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-3xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200 shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Export Collection Reports</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Download collection logs and agent route summaries to Excel / PDF.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleExportToExcel}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Export Excel</span>
              </button>

              <button
                onClick={handleExportSummaryPDF}
                className="py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Export PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PHOTO PROOF PREVIEW MODAL ── */}
      {previewPhoto && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-2xl p-5 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase">Payment Proof Attachment</h3>
              <button onClick={() => setPreviewPhoto(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-2 max-h-[60vh] flex items-center justify-center">
              <img src={previewPhoto.dataUrl} alt="Payment Proof" className="max-h-[50vh] object-contain rounded-lg" />
            </div>
            <div className="text-[11px] text-slate-400 font-medium text-center">
              Uploaded on {previewPhoto.timestamp} ({previewPhoto.filename})
            </div>
          </div>
        </div>
      )}

      {/* ── PRINT RECEIPT VOUCHER MODAL ── */}
      {printVoucher && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-teal-600" />
                <h3 className="text-sm font-extrabold text-slate-900">Payment Receipt Voucher</h3>
              </div>
              <button onClick={() => setPrintVoucher(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between font-bold text-slate-900">
                <span>Receipt #:</span>
                <span className="font-mono text-teal-700">{printVoucher.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date:</span>
                <span className="font-semibold">{printVoucher.timestamp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-900">{printVoucher.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">City:</span>
                <span className="font-semibold">{printVoucher.city}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between font-extrabold text-sm text-slate-900">
                <span>Amount Paid:</span>
                <span className="text-emerald-700">₹{printVoucher.totalAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setPrintVoucher(null)}
                className="flex-1 py-2 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  window.print();
                  setPrintVoucher(null);
                }}
                className="flex-1 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold text-xs shadow-3xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PaymentCollectionModule;

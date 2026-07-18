import React, { useEffect, useState } from 'react';
import { Plus, Search, RefreshCw, ChevronLeft, ChevronRight, X, FileText, Trash2, Calendar, Coins, Download, Upload, HelpCircle, Check } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { getParties } from '../../../../api/partyApi';
import { getSkusV2, getWarehouseHierarchyV2, SkuV2, WarehouseLocationV2 } from '../../../../api/mfgApiV2';
import { 
  getPurchaseInvoicesV2, 
  createPurchaseInvoiceV2, 
  recordPurchasePaymentV2, 
  updatePurchaseInvoiceV2,
  deletePurchaseInvoiceV2,
  PurchaseInvoiceV2, 
  PurchaseInvoiceItemV2 
} from '../services/purchaseService';
import InvoiceTable from '../components/InvoiceTable';
import VendorBalanceCard from '../components/VendorBalanceCard';
import { showToast } from '../../../ui/Toast';
import * as XLSX from 'xlsx';

const PurchaseInvoicePage: React.FC = () => {
  const { selectedCompany } = useAuth();
  
  // Data lists
  const [invoices, setInvoices] = useState<PurchaseInvoiceV2[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  
  // States
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);

  // Selected drawers
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoiceV2 | null>(null);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  
  // Form states: Add Invoice
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: '',
    vendorId: '',
    taxAmount: '0',
    freight: '0',
    craneCharges: '0',
    otherCharges: '0',
    dueDate: '',
    remarks: '',
    items: [
      { 
        skuId: '', 
        quantity: '', 
        purchasePrice: '', 
        lotNumber: '', 
        locationId: '',
        reels: [] as { reelNumber: string; gsm: number; width: number; weight: number }[]
      }
    ]
  });
  
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  // Form states: Record Payment
  const [paymentForm, setPaymentForm] = useState({
    vendorId: '',
    invoiceId: '',
    amount: '',
    paymentMethod: 'bank_transfer',
    referenceId: '',
    remarks: ''
  });
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');

  // Date range filters (mocked/local filter for mockup 2)
  const [startDate, setStartDate] = useState('2024-06-01');
  const [endDate, setEndDate] = useState('2024-06-30');

  useEffect(() => {
    if (selectedCompany?._id) {
      loadFilterData();
    }
  }, [selectedCompany?._id]);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadInvoices();
    }
  }, [selectedCompany?._id, page, vendorFilter, statusFilter]);

  const loadFilterData = async () => {
    try {
      const [vendorRes, skuRes, locRes] = await Promise.all([
        getParties({ company: selectedCompany?._id, type: 'vendor', limit: 1000 }),
        getSkusV2(selectedCompany?._id || ''),
        getWarehouseHierarchyV2(selectedCompany?._id || '')
      ]);
      setVendors(vendorRes.data.parties || []);
      setSkus(skuRes.filter(s => s.status === 'Active' && (s.category === 'Raw Material' || s.category === 'Consumables')));
      setLocations(locRes.filter(l => l.level === 'Storage Location' && l.status === 'Active'));
    } catch (e) {
      console.error(e);
      showToast('Failed to load form master values', 'error');
    }
  };

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const res = await getPurchaseInvoicesV2({
        companyId: selectedCompany?._id || '',
        vendorId: vendorFilter || undefined,
        paymentStatus: statusFilter || undefined,
        search: search || undefined,
        page,
        limit
      });
      setInvoices(res.invoices);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
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

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Purchases');
    XLSX.writeFile(wb, `Purchase_Batches_${selectedCompany?.name || 'export'}.xlsx`);
  };

  // Add Item Row in Invoice
  const handleAddItemRow = () => {
    setInvoiceForm({
      ...invoiceForm,
      items: [
        ...invoiceForm.items, 
        { skuId: '', quantity: '', purchasePrice: '', lotNumber: '', locationId: '', reels: [] }
      ]
    });
  };

  // Remove Item Row in Invoice
  const handleRemoveItemRow = (index: number) => {
    if (invoiceForm.items.length === 1) return;
    const newItems = invoiceForm.items.filter((_, i) => i !== index);
    setInvoiceForm({ ...invoiceForm, items: newItems });
  };

  // Update Item value
  const handleItemValChange = (index: number, key: string, val: string) => {
    const newItems = [...invoiceForm.items];
    newItems[index] = { ...newItems[index], [key]: val };
    setInvoiceForm({ ...invoiceForm, items: newItems });
  };

  // Dynamic Reels Handlers
  const handleAddReel = (itemIdx: number) => {
    const newItems = [...invoiceForm.items];
    const reels = newItems[itemIdx].reels || [];
    const sku = skus.find(s => s._id === newItems[itemIdx].skuId);
    
    reels.push({
      reelNumber: `R-${String(reels.length + 1).padStart(4, '0')}`,
      gsm: sku?.gsm || 52,
      width: sku?.width || 64,
      weight: 0
    });
    newItems[itemIdx].reels = reels;
    setInvoiceForm({ ...invoiceForm, items: newItems });
  };

  const handleRemoveReel = (itemIdx: number, reelIdx: number) => {
    const newItems = [...invoiceForm.items];
    const reels = (newItems[itemIdx].reels || []).filter((_, i) => i !== reelIdx);
    newItems[itemIdx].reels = reels;
    
    // Recalculate quantity based on reel weights
    const totalWeight = reels.reduce((sum, r) => sum + (r.weight || 0), 0);
    newItems[itemIdx].quantity = reels.length > 0 ? String(totalWeight) : '';

    setInvoiceForm({ ...invoiceForm, items: newItems });
  };

  const handleReelChange = (itemIdx: number, reelIdx: number, key: string, val: string) => {
    const newItems = [...invoiceForm.items];
    const reels = [...(newItems[itemIdx].reels || [])];
    
    reels[reelIdx] = {
      ...reels[reelIdx],
      [key]: key === 'reelNumber' ? val : Number(val) || 0
    };
    newItems[itemIdx].reels = reels;

    // Recalculate quantity based on reel weights
    const totalWeight = reels.reduce((sum, r) => sum + (r.weight || 0), 0);
    newItems[itemIdx].quantity = String(totalWeight);

    setInvoiceForm({ ...invoiceForm, items: newItems });
  };

  // Calculate invoice subtotal
  const calculateSubtotal = () => {
    return invoiceForm.items.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.purchasePrice) || 0;
      return sum + (qty * price);
    }, 0);
  };

  const subTotalVal = calculateSubtotal();
  const grandTotalVal = subTotalVal + 
    (Number(invoiceForm.taxAmount) || 0) + 
    (Number(invoiceForm.freight) || 0) + 
    (Number(invoiceForm.craneCharges) || 0) + 
    (Number(invoiceForm.otherCharges) || 0);

  // Submit Invoice Creation
  const handleInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    if (!invoiceForm.vendorId) {
      setAddError('Please select a Vendor');
      return;
    }

    // Validate item inputs
    for (let i = 0; i < invoiceForm.items.length; i++) {
      const item = invoiceForm.items[i];
      if (!item.skuId || !item.quantity || !item.purchasePrice || !item.lotNumber || !item.locationId) {
        setAddError(`Please fill all fields in row ${i + 1}`);
        return;
      }
      if (Number(item.quantity) <= 0 || Number(item.purchasePrice) <= 0) {
        setAddError(`Quantity and price must be positive numbers in row ${i + 1}`);
        return;
      }
    }

    setAddLoading(true);
    try {
      const invoiceData = {
        invoiceNumber: invoiceForm.invoiceNumber || undefined,
        vendorId: invoiceForm.vendorId,
        items: invoiceForm.items,
        taxAmount: Number(invoiceForm.taxAmount) || 0,
        freight: Number(invoiceForm.freight) || 0,
        craneCharges: Number(invoiceForm.craneCharges) || 0,
        otherCharges: Number(invoiceForm.otherCharges) || 0,
        dueDate: invoiceForm.dueDate || undefined,
        remarks: invoiceForm.remarks,
        company: selectedCompany?._id
      };

      if (isEditing && editingInvoiceId) {
        await updatePurchaseInvoiceV2(editingInvoiceId, invoiceData);
        showToast('Purchase invoice updated successfully!', 'success');
      } else {
        await createPurchaseInvoiceV2(invoiceData);
        showToast('Purchase invoice inwarded successfully!', 'success');
      }

      setShowAddDrawer(false);
      setIsEditing(false);
      setEditingInvoiceId(null);
      setInvoiceForm({
        invoiceNumber: '',
        vendorId: '',
        taxAmount: '0',
        freight: '0',
        craneCharges: '0',
        otherCharges: '0',
        dueDate: '',
        remarks: '',
        items: [{ skuId: '', quantity: '', purchasePrice: '', lotNumber: '', locationId: '', reels: [] }]
      });
      loadInvoices();
      loadFilterData();
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
    setInvoiceForm({
      invoiceNumber: invoice.invoiceNumber,
      vendorId: typeof invoice.vendorId === 'object' && invoice.vendorId !== null ? invoice.vendorId._id : (invoice.vendorId || ''),
      taxAmount: String(invoice.taxAmount || 0),
      freight: String(invoice.freight || 0),
      craneCharges: String(invoice.craneCharges || 0),
      otherCharges: String(invoice.otherCharges || 0),
      dueDate: invoice.dueDate ? invoice.dueDate.split('T')[0] : '',
      remarks: invoice.remarks || '',
      items: invoice.items.map(item => ({
        skuId: typeof item.skuId === 'object' && item.skuId !== null ? item.skuId._id : (item.skuId || ''),
        quantity: String(item.quantity),
        purchasePrice: String(item.purchasePrice),
        lotNumber: item.lotNumber,
        locationId: typeof item.locationId === 'object' && item.locationId !== null ? item.locationId._id : (item.locationId || ''),
        reels: item.reels || []
      }))
    });
    setAddError('');
    setShowAddDrawer(true);
  };

  const handleDeleteInvoice = async (invoice: PurchaseInvoiceV2) => {
    if (!window.confirm(`Are you sure you want to delete purchase invoice ${invoice.invoiceNumber}? This will reverse the stock entries and adjust the vendor's outstanding balance.`)) {
      return;
    }
    try {
      await deletePurchaseInvoiceV2(invoice._id || '', selectedCompany?._id || '');
      showToast('Purchase invoice deleted successfully!', 'success');
      loadInvoices();
      loadFilterData();
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.msg || 'Failed to delete purchase invoice', 'error');
    }
  };

  // Submit Payment Recording
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError('');

    const amt = Number(paymentForm.amount);
    if (!paymentForm.vendorId) {
      setPayError('Vendor is required');
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setPayError('Payment amount must be greater than zero');
      return;
    }

    setPayLoading(true);
    try {
      await recordPurchasePaymentV2({
        vendorId: paymentForm.vendorId,
        amount: amt,
        paymentMethod: paymentForm.paymentMethod,
        referenceId: paymentForm.referenceId,
        invoiceId: paymentForm.invoiceId || undefined,
        remarks: paymentForm.remarks,
        company: selectedCompany?._id || ''
      });

      showToast('Vendor payment registered successfully!', 'success');
      setShowPaymentModal(false);
      setPaymentForm({ vendorId: '', invoiceId: '', amount: '', paymentMethod: 'bank_transfer', referenceId: '', remarks: '' });
      loadInvoices();
      loadFilterData();
    } catch (err: any) {
      console.error(err);
      setPayError(err.response?.data?.msg || 'Failed to record payment');
    } finally {
      setPayLoading(false);
    }
  };

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  // Dynamic statistics calculations for top cards
  const totalPurchases = total;
  const totalValue = invoices.reduce((sum, inv) => sum + (inv.subTotal || 0), 0);
  const totalQtyKG = invoices.reduce((sum, inv) => {
    return sum + (inv.items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0);
  }, 0);
  const pendingReceipts = invoices.filter(inv => inv.status === 'Draft' || inv.paymentStatus === 'Unpaid').length;

  return (
    <div className="space-y-6 ">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Coins className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight">
                Purchase List
              </h1>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">All Purchase Batches</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Download className="w-3.5 h-3.5" /> Import from Excel
          </button>
          <button
            onClick={() => {
              setIsEditing(false);
              setEditingInvoiceId(null);
              setInvoiceForm({
                invoiceNumber: '',
                vendorId: '',
                taxAmount: '0',
                freight: '0',
                craneCharges: '0',
                otherCharges: '0',
                dueDate: '',
                remarks: '',
                items: [{ skuId: '', quantity: '', purchasePrice: '', lotNumber: '', locationId: '', reels: [] }]
              });
              setAddError('');
              setShowAddDrawer(true);
            }}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all hover:scale-[1.02]"
          >
            <Plus className="w-3.5 h-3.5" /> + New Purchase
          </button>
        </div>
      </div>

      {/* Dynamic Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Purchases */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total Purchases</span>
            <span className="text-2xl font-black text-gray-900">{totalPurchases}</span>
            <span className="text-[10px] text-gray-500 mt-0.5 block">This Month</span>
          </div>
        </div>

        {/* Total Value */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total Value</span>
            <span className="text-2xl font-black text-emerald-700">₹{totalValue.toLocaleString('en-IN')}</span>
            <span className="text-[10px] text-gray-500 mt-0.5 block">This Month</span>
          </div>
        </div>

        {/* Total Quantity */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
            <Plus className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total Quantity</span>
            <span className="text-2xl font-black text-purple-700">{totalQtyKG.toLocaleString('en-IN')} KG</span>
            <span className="text-[10px] text-gray-500 mt-0.5 block">This Month</span>
          </div>
        </div>

        {/* Pending Receipts */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
            <Calendar className="w-6 h-6 animate-pulse-slow" />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Pending Receipts</span>
            <span className="text-2xl font-black text-red-600">{pendingReceipts}</span>
            <span className="text-[10px] text-gray-500 mt-0.5 block">This Month</span>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="space-y-4">
          {/* Search Toolbar */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <form onSubmit={handleSearchSubmit} className="flex-1 w-full relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by Batch No, Supplier, Material..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/50 focus:bg-white transition-all text-gray-950 font-medium"
              />
            </form>
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <select
                value={vendorFilter}
                onChange={e => { setVendorFilter(e.target.value); setPage(1); }}
                className="w-full sm:w-40 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
              >
                <option value="">All Suppliers</option>
                {vendors.map(v => (
                  <option key={v._id} value={v._id}>{v.firmName || v.ownerName}</option>
                ))}
              </select>

              {/* Date pickers mimicking mockup 2 */}
              <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl p-1 bg-white">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="text-xs border-0 bg-transparent focus:ring-0 p-1 text-gray-700 w-28"
                />
                <span className="text-gray-400 font-bold text-xs">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="text-xs border-0 bg-transparent focus:ring-0 p-1 text-gray-700 w-28"
                />
              </div>

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

          {/* Invoice Table list */}
          <InvoiceTable
            invoices={invoices}
            loading={loading}
            onViewDetails={setSelectedInvoice}
            onEditInvoice={handleEditInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            onRecordPayment={(inv) => {
              setPaymentForm({
                vendorId: typeof inv.vendorId === 'object' && inv.vendorId !== null ? inv.vendorId._id : (inv.vendorId || ''),
                invoiceId: inv._id || '',
                amount: String(Math.max(inv.grandTotal - (inv.paidAmount || 0), 0)),
                paymentMethod: 'bank_transfer',
                referenceId: '',
                remarks: ''
              });
              setPayError('');
              setShowPaymentModal(true);
            }}
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

      {/* Slide-Over Drawer: Add/Edit Purchase Invoice */}
      {showAddDrawer && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-3xs" onClick={() => setShowAddDrawer(false)} />
          <div className="relative w-full max-w-4xl bg-white shadow-2xl h-full flex flex-col z-10 animate-in slide-in-from-right duration-250">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {isEditing ? 'Edit Purchase Invoice' : 'Add Purchase & Material Inward'}
                </h2>
                <p className="text-[11px] text-gray-500 mt-0.5 font-medium">procure raw items and allot them straight to warehouse rack locations</p>
              </div>
              <button
                onClick={() => setShowAddDrawer(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleInvoiceSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-gray-950">
              {addError && (
                <div className="p-3 bg-red-50 border border-red-150 rounded-xl text-xs font-semibold text-red-700">
                  {addError}
                </div>
              )}

              {/* General details */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Select Vendor *</label>
                  <select
                    value={invoiceForm.vendorId}
                    onChange={e => setInvoiceForm({ ...invoiceForm, vendorId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 disabled:opacity-60 font-semibold"
                    required
                    disabled={isEditing}
                  >
                    <option value="">-- Choose Vendor --</option>
                    {vendors.map(v => (
                      <option key={v._id} value={v._id}>{v.firmName || v.ownerName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Batch No. (Optional)</label>
                  <input
                    type="text"
                    placeholder="Auto-generated e.g. PB2406001"
                    value={invoiceForm.invoiceNumber}
                    onChange={e => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-mono font-bold"
                    readOnly={isEditing}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Payment Due Date</label>
                  <input
                    type="date"
                    value={invoiceForm.dueDate}
                    onChange={e => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-700 font-medium"
                  />
                </div>
              </div>

              {/* Items grid */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-xs font-black text-gray-700 uppercase">Items Inward Table</h3>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="px-3 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg font-bold hover:bg-blue-100 transition-colors"
                  >
                    + Add Item Row
                  </button>
                </div>

                <div className="space-y-4">
                  {invoiceForm.items.map((item, idx) => {
                    const matchedSkuId = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any)._id : item.skuId;
                    const matchedSku = skus.find(s => s._id === matchedSkuId) || (typeof item.skuId === 'object' ? item.skuId : null);
                    const isReel = matchedSku?.category === 'Raw Material' && matchedSku?.unit === 'kg';
                    return (
                      <div key={idx} className="p-4 border border-gray-200 rounded-xl bg-gray-100/60 space-y-4 relative">
                        {invoiceForm.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="absolute top-2 right-2 text-red-500 hover:text-red-700 p-1 border rounded bg-white"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="w-full sm:w-56">
                            <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">SKU (Raw / Consumable) *</label>
                            <select
                              value={item.skuId}
                              onChange={e => {
                                const newSkuId = e.target.value;
                                const updated = [...invoiceForm.items];
                                updated[idx] = {
                                  ...updated[idx],
                                  skuId: newSkuId,
                                  reels: []
                                };
                                setInvoiceForm({ ...invoiceForm, items: updated });
                              }}
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 text-xs font-semibold text-gray-800"
                              required
                            >
                              <option value="">-- Select SKU --</option>
                              {skus.map(s => (
                                <option key={s._id} value={s._id}>{s.name} ({s.skuCode})</option>
                              ))}
                            </select>
                          </div>
                          <div className="w-28">
                            <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Lot Number *</label>
                            <input
                              type="text"
                              placeholder="e.g. LOT-A2"
                              value={item.lotNumber}
                              onChange={e => handleItemValChange(idx, 'lotNumber', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white text-xs font-semibold text-gray-900"
                              required
                            />
                          </div>
                          <div className="w-48">
                            <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Storage Location *</label>
                            <select
                              value={item.locationId}
                              onChange={e => handleItemValChange(idx, 'locationId', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 text-xs text-gray-800 font-semibold"
                              required
                            >
                              <option value="">-- Choose Location --</option>
                              {locations.map(l => (
                                <option key={l._id} value={l._id}>{l.name} ({l.level})</option>
                              ))}
                            </select>
                          </div>
                          <div className="w-20">
                            <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Qty *</label>
                            <input
                              type="number"
                              placeholder="0"
                              value={item.quantity}
                              onChange={e => handleItemValChange(idx, 'quantity', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white text-xs font-mono font-bold text-gray-900 text-right read-only:bg-gray-100/50"
                              required
                              readOnly={isReel}
                            />
                          </div>
                          <div className="w-16">
                            <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Unit</label>
                            <input
                              type="text"
                              value={matchedSku?.unit || '—'}
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg bg-gray-100 font-mono text-gray-500 text-center select-none font-bold"
                              readOnly
                            />
                          </div>
                          <div className="w-24">
                            <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Cost Per Unit *</label>
                            <input
                              type="number"
                              placeholder="0"
                              value={item.purchasePrice}
                              onChange={e => handleItemValChange(idx, 'purchasePrice', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white text-xs font-mono font-semibold text-gray-900 text-right"
                              required
                            />
                          </div>
                          <div className="w-24 text-right pr-2 pb-1.5 font-bold font-mono text-gray-800">
                            ₹{((Number(item.quantity) || 0) * (Number(item.purchasePrice) || 0)).toLocaleString('en-IN')}
                          </div>
                        </div>

                        {/* Reels sub-editor */}
                        {isReel && (
                          <div className="mt-2 pl-4 border-l-4 border-blue-400 bg-white p-3.5 rounded-xl border border-gray-200 space-y-3">
                            <div className="flex justify-between items-center border-b pb-1.5">
                              <span className="font-extrabold text-[10px] text-blue-600 uppercase flex items-center gap-1.5">
                                🌀 Reel details editor (Total: {(item.reels || []).length} Reels)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddReel(idx)}
                                className="px-2.5 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold text-[10px] shadow-3xs"
                              >
                                + Add Reel
                              </button>
                            </div>
                            {(item.reels || []).length > 0 ? (
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-[10px]">
                                  <thead>
                                    <tr className="bg-gray-100 text-gray-500 font-bold border-b text-[9px] uppercase">
                                      <th className="px-3 py-1">Reel Number</th>
                                      <th className="px-3 py-1 text-center">GSM</th>
                                      <th className="px-3 py-1 text-center">Width (cm)</th>
                                      <th className="px-3 py-1 text-right">Weight (KG) *</th>
                                      <th className="px-3 py-1 text-center">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y text-gray-700 font-mono font-semibold">
                                    {(item.reels || []).map((reel, rIdx) => (
                                      <tr key={rIdx} className="hover:bg-gray-100/20">
                                        <td className="px-3 py-1.5">
                                          <input
                                            type="text"
                                            value={reel.reelNumber}
                                            onChange={(e) => handleReelChange(idx, rIdx, 'reelNumber', e.target.value)}
                                            className="w-24 px-1.5 py-0.5 border border-gray-200 rounded font-semibold text-[11px]"
                                            required
                                          />
                                        </td>
                                        <td className="px-3 py-1.5 text-center">
                                          <input
                                            type="number"
                                            value={reel.gsm || ''}
                                            onChange={(e) => handleReelChange(idx, rIdx, 'gsm', e.target.value)}
                                            className="w-16 px-1.5 py-0.5 border border-gray-200 rounded text-center text-[11px]"
                                          />
                                        </td>
                                        <td className="px-3 py-1.5 text-center">
                                          <input
                                            type="number"
                                            value={reel.width || ''}
                                            onChange={(e) => handleReelChange(idx, rIdx, 'width', e.target.value)}
                                            className="w-16 px-1.5 py-0.5 border border-gray-200 rounded text-center text-[11px]"
                                          />
                                        </td>
                                        <td className="px-3 py-1.5 text-right">
                                          <input
                                            type="number"
                                            value={reel.weight || ''}
                                            onChange={(e) => handleReelChange(idx, rIdx, 'weight', e.target.value)}
                                            className="w-20 px-1.5 py-0.5 border border-gray-200 rounded text-right text-[11px] font-black text-gray-900 bg-amber-50/10 focus:bg-white"
                                            required
                                          />
                                        </td>
                                        <td className="px-3 py-1.5 text-center">
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveReel(idx, rIdx)}
                                            className="text-red-500 hover:text-red-700 font-bold"
                                          >
                                            Remove
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-[10px] text-gray-400 italic">No reels defined. Click "+ Add Reel" to begin entering reel weights.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Remarks, Tax & Total block */}
              <div className="grid grid-cols-2 gap-6 pt-4 border-t">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase font-semibold">Notes / Remarks</label>
                  <textarea
                    placeholder="Procurement invoice summary or notes..."
                    value={invoiceForm.remarks}
                    onChange={e => setInvoiceForm({ ...invoiceForm, remarks: e.target.value })}
                    className="w-full h-28 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-800"
                  />
                </div>
                <div className="space-y-2 text-right text-xs">
                  <div className="flex justify-between items-center text-xs font-bold text-gray-500">
                    <span>Subtotal:</span>
                    <span className="font-mono text-gray-900 font-black">₹{subTotalVal.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-gray-500">
                    <span>Tax (GST) Amount:</span>
                    <input
                      type="number"
                      value={invoiceForm.taxAmount}
                      onChange={e => setInvoiceForm({ ...invoiceForm, taxAmount: e.target.value })}
                      className="w-28 text-right px-2.5 py-1 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-gray-500">
                    <span>Freight:</span>
                    <input
                      type="number"
                      value={invoiceForm.freight}
                      onChange={e => setInvoiceForm({ ...invoiceForm, freight: e.target.value })}
                      className="w-28 text-right px-2.5 py-1 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-gray-500">
                    <span>Crane Charges:</span>
                    <input
                      type="number"
                      value={invoiceForm.craneCharges}
                      onChange={e => setInvoiceForm({ ...invoiceForm, craneCharges: e.target.value })}
                      className="w-28 text-right px-2.5 py-1 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-gray-500">
                    <span>Other Charges:</span>
                    <input
                      type="number"
                      value={invoiceForm.otherCharges}
                      onChange={e => setInvoiceForm({ ...invoiceForm, otherCharges: e.target.value })}
                      className="w-28 text-right px-2.5 py-1 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="flex justify-between items-center border-t pt-2 text-sm font-black text-gray-900">
                    <span>Total Bill Value:</span>
                    <span className="text-blue-600 font-mono text-base font-black">₹{grandTotalVal.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </form>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddDrawer(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-3xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleInvoiceSubmit}
                disabled={addLoading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md"
              >
                {addLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                Inward Purchase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Record Vendor Payment */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="relative bg-white rounded-2xl max-w-md w-full shadow-2xl flex flex-col border border-gray-200 animate-in fade-in zoom-in-95 duration-150 overflow-hidden text-xs">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl flex justify-between items-center">
              <h2 className="text-sm font-bold text-gray-900">Record Vendor Payment</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
              {payError && (
                <div className="p-3 bg-red-50 border border-red-150 rounded-xl text-xs font-semibold text-red-700">
                  {payError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Select Vendor *</label>
                <select
                  value={paymentForm.vendorId}
                  onChange={e => {
                    setPaymentForm({ ...paymentForm, vendorId: e.target.value, invoiceId: '' });
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold"
                  required
                >
                  <option value="">-- Select Vendor --</option>
                  {vendors.map(v => (
                    <option key={v._id} value={v._id}>{v.firmName || v.ownerName} (Owed: ₹{v.outstanding?.toLocaleString('en-IN') || 0})</option>
                  ))}
                </select>
              </div>

              {paymentForm.vendorId && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Allocate to Invoice (Optional)</label>
                  <select
                    value={paymentForm.invoiceId}
                    onChange={e => {
                      const selectedInv = invoices.find(i => i._id === e.target.value);
                      const bal = selectedInv ? (selectedInv.grandTotal - (selectedInv.paidAmount || 0)) : 0;
                      setPaymentForm({ 
                        ...paymentForm, 
                        invoiceId: e.target.value,
                        amount: selectedInv ? String(bal) : '' 
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">-- Apply to Vendor Account Balance --</option>
                    {invoices
                      .filter(i => {
                        const vId = typeof i.vendorId === 'object' && i.vendorId !== null ? i.vendorId._id : i.vendorId;
                        return vId === paymentForm.vendorId && i.paymentStatus !== 'Paid';
                      })
                      .map(i => (
                        <option key={i._id} value={i._id}>
                          {i.invoiceNumber} (Total: ₹{i.grandTotal.toLocaleString('en-IN')}, Open: ₹{(i.grandTotal - i.paidAmount).toLocaleString('en-IN')})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Amount Paid (₹) *</label>
                  <input
                    type="number"
                    placeholder="e.g. 15000"
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 font-bold text-right"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Payment Method *</label>
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={e => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold"
                    required
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI / GPay</option>
                    <option value="cheque">Cheque</option>
                    <option value="card">Card</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Reference ID / Txn Number</label>
                <input
                  type="text"
                  placeholder="e.g. IMPS-1002302"
                  value={paymentForm.referenceId}
                  onChange={e => setPaymentForm({ ...paymentForm, referenceId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Remarks / Notes</label>
                <textarea
                  placeholder="Additional transaction details..."
                  value={paymentForm.remarks}
                  onChange={e => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                  className="w-full h-20 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-800"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-3xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={payLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  {payLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Details Drawer / Batch details right panel */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-3xs" onClick={() => setSelectedInvoice(null)} />
          <div className="relative w-full max-w-3xl bg-white shadow-2xl h-full flex flex-col z-10 animate-in slide-in-from-right duration-250">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Batch details: {selectedInvoice.invoiceNumber}
                </h2>
                <p className="text-[11px] text-gray-500 mt-0.5 font-medium">Batch configurations, specs, and storage details</p>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-gray-950">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left side: Batch information details */}
                <div className="bg-gray-50/50 rounded-2xl p-5 border border-gray-200 space-y-4">
                  <h3 className="text-xs font-black text-blue-600 uppercase tracking-wider border-b pb-1.5 flex items-center justify-between">
                    <span>Batch Information</span>
                    <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-[9px] uppercase font-extrabold font-sans">
                      Received
                    </span>
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 text-xs font-medium">
                    <div>
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">Supplier</span>
                      <span className="font-bold text-gray-800 text-sm block">
                        {typeof selectedInvoice.vendorId === 'object' && selectedInvoice.vendorId !== null ? (selectedInvoice.vendorId.firmName || selectedInvoice.vendorId.ownerName) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">Invoice No.</span>
                      <span className="font-bold text-gray-800 text-sm block font-mono">{selectedInvoice.invoiceNumber}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">Invoice Date</span>
                      <span className="font-semibold text-gray-700 block">
                        {selectedInvoice.createdAt ? new Date(selectedInvoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">Material</span>
                      <span className="font-bold text-gray-700 block">
                        {selectedInvoice.items?.[0] && typeof selectedInvoice.items[0].skuId === 'object' && selectedInvoice.items[0].skuId !== null ? (selectedInvoice.items[0].skuId as any).name : 'Raw Material'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">Total Quantity</span>
                      <span className="font-black text-gray-900 block text-sm">
                        {selectedInvoice.items?.reduce((sum, item) => sum + (item.quantity || 0), 0).toLocaleString('en-IN')}{' '}
                        {selectedInvoice.items?.[0] && typeof selectedInvoice.items[0].skuId === 'object' && selectedInvoice.items[0].skuId !== null ? (selectedInvoice.items[0].skuId as any).unit : 'KG'}{' '}
                        {selectedInvoice.items?.[0]?.reels?.length ? `(${selectedInvoice.items[0].reels.length} Reels)` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">Rate / KG</span>
                      <span className="font-semibold text-gray-700 block text-sm font-mono">
                        ₹{(selectedInvoice.items?.[0]?.purchasePrice || 0).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">Total Value</span>
                      <span className="font-bold text-gray-700 block text-sm font-mono">
                        ₹{(selectedInvoice.subTotal || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">Freight</span>
                      <span className="font-semibold text-gray-700 block font-mono">₹{(selectedInvoice.freight || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">Crane Charges</span>
                      <span className="font-semibold text-gray-700 block font-mono">₹{(selectedInvoice.craneCharges || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">Other Charges</span>
                      <span className="font-semibold text-gray-700 block font-mono">₹{(selectedInvoice.otherCharges || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="col-span-2 border-t pt-2 mt-1">
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">Total Bill Value</span>
                      <span className="font-black text-blue-600 block text-base font-mono">
                        ₹{(selectedInvoice.grandTotal || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side: Reel Details list if Raw Material reels are present */}
                <div className="bg-gray-50/50 rounded-2xl p-5 border border-gray-200 space-y-4">
                  <h3 className="text-xs font-black text-blue-600 uppercase tracking-wider border-b pb-1.5 flex items-center justify-between">
                    <span>Reel Details</span>
                    <span className="text-[10px] text-gray-400 font-bold">
                      {selectedInvoice.items?.[0]?.reels?.length || 0} Reels
                    </span>
                  </h3>
                  {selectedInvoice.items?.[0]?.reels?.length ? (
                    <div className="border border-gray-300 rounded-xl overflow-hidden bg-white max-h-[300px] overflow-y-auto">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200 uppercase text-[9px] font-sans">
                            <th className="px-3 py-2">Reel No</th>
                            <th className="px-3 py-2 text-center">GSM</th>
                            <th className="px-3 py-2 text-center">Width</th>
                            <th className="px-3 py-2 text-right">Weight (KG)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-700 font-mono font-medium">
                          {selectedInvoice.items[0].reels.map((reel, rIdx) => (
                            <tr key={rIdx} className="hover:bg-gray-50/50">
                              <td className="px-3 py-2 font-bold text-gray-800">{reel.reelNumber}</td>
                              <td className="px-3 py-2 text-center text-gray-600">{reel.gsm}</td>
                              <td className="px-3 py-2 text-center text-gray-600">{reel.width} cm</td>
                              <td className="px-3 py-2 text-right font-black text-gray-900">{reel.weight}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300 p-4">
                      <FileText className="w-8 h-8 text-gray-200 mb-2" />
                      <p className="font-semibold text-[11px]">No Reels Registered</p>
                      <p className="text-[10px] text-gray-500 mt-0.5 text-center">Reel weight metrics are only recorded for Raw Material KG procurements.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* View GRN / Receipt button */}
              <div className="flex justify-center border-t pt-4">
                <button
                  onClick={() => {
                    showToast('Opening Goods Receipt Note (GRN)...', 'info');
                  }}
                  className="flex items-center gap-1.5 px-6 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 font-extrabold text-xs shadow-3xs border border-blue-200 transition-colors"
                >
                  <FileText className="w-4 h-4" /> View GRN / Receipt
                </button>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 text-right">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-5 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-3xs"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseInvoicePage;

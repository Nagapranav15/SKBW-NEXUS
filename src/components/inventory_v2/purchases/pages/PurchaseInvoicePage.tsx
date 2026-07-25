import React, { useEffect, useState } from 'react';
import { Plus, Search, RefreshCw, ChevronLeft, ChevronRight, X, FileText, Trash2, Calendar, Coins, Download, Upload, HelpCircle, Check, Eye, MoreVertical, Edit, Printer, ArrowRight, Layers, IndianRupee } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { getParties } from '../../../../api/partyApi';
import { getSkusV2, getWarehouseHierarchyV2, recordTransferV2, SkuV2, WarehouseLocationV2, getBalancesV2 } from '../../../../api/mfgApiV2';
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
import { showToast } from '../../../ui/Toast';
import * as XLSX from 'xlsx';

const PurchaseInvoicePage: React.FC = () => {
  const { selectedCompany } = useAuth();
  
  // Data lists
  const [invoices, setInvoices] = useState<PurchaseInvoiceV2[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [inventoryBalances, setInventoryBalances] = useState<any[]>([]);
  
  // States
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);

  // Navigation states
  const [activeSubPage, setActiveSubPage] = useState<'list' | 'new' | 'details'>('list');
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoiceV2 | null>(null);
  
  // Details tabs
  const [detailsTab, setDetailsTab] = useState<'lots' | 'allocation' | 'history'>('lots');

  // Allocation Modal state
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [allocateForm, setAllocateForm] = useState({
    itemIndex: 0,
    toLocationId: '',
    quantity: ''
  });
  const [selectedReelsForAllocation, setSelectedReelsForAllocation] = useState<any[]>([]);
  const [allocateSubmitting, setAllocateSubmitting] = useState(false);
  const [allocateError, setAllocateError] = useState('');

  // Form states: Add Invoice
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: '',
    vendorId: '',
    taxAmount: '0',
    freight: '0',
    craneCharges: '0',
    loadingUnloading: '0',
    otherCharges: '0',
    dueDate: '',
    items: [
      { 
        skuId: '', 
        brand: '',
        gsm: '',
        width: '',
        reelsCount: '',
        quantity: '', 
        purchasePrice: '', 
        lotNumber: '',
        reels: [] as any[]
      }
    ]
  });
  
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [activeReelModalIdx, setActiveReelModalIdx] = useState<number | null>(null);

  // Date range filters
  const [startDate, setStartDate] = useState('2024-06-01');
  const [endDate, setEndDate] = useState('2024-06-30');

  useEffect(() => {
    if (selectedCompany?._id) {
      loadFilterData();
    }
  }, [selectedCompany?._id]);

  useEffect(() => {
    if (!selectedCompany?._id) return;
    loadInvoices(true);

    const interval = setInterval(() => {
      loadInvoices(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedCompany?._id, page, vendorFilter, statusFilter]);

  // Load balances when detailed invoice is selected
  useEffect(() => {
    if (!selectedCompany?._id || !selectedInvoice) return;
    loadBalances(true);

    const interval = setInterval(() => {
      loadBalances(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedCompany?._id, selectedInvoice]);

  const loadBalances = async (showLoading = true) => {
    try {
      const bals = await getBalancesV2(selectedCompany?._id || '', undefined, true);
      setInventoryBalances(bals);
    } catch (e) {
      console.error(e);
      if (showLoading) {
        showToast('Failed to load inventory balances', 'error');
      }
    }
  };

  const loadFilterData = async () => {
    try {
      const [vendorRes, skuRes, locRes] = await Promise.all([
        getParties({ company: selectedCompany?._id || '', type: 'vendor', limit: 1000 }),
        getSkusV2(selectedCompany?._id || ''),
        getWarehouseHierarchyV2(selectedCompany?._id || '')
      ]);
      const vendorList = vendorRes?.data?.parties || (Array.isArray(vendorRes?.data) ? vendorRes.data : []);
      setVendors(vendorList);
      setSkus(skuRes);
      setLocations(locRes);
    } catch (e) {
      console.error(e);
      showToast('Failed to load filters data', 'error');
    }
  };

  const loadInvoices = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const res = await getPurchaseInvoicesV2({
        companyId: selectedCompany?._id || '',
        vendorId: vendorFilter || undefined,
        page,
        limit
      });
      setInvoices(res.invoices || []);
      setTotal(res.total || 0);

      if (selectedInvoice) {
        const updated = (res.invoices || []).find((inv: any) => inv._id === selectedInvoice._id);
        if (updated) {
          setSelectedInvoice(updated);
        }
      }
    } catch (e) {
      console.error(e);
      if (showLoading) {
        showToast('Failed to load purchase batches', 'error');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
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

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase Batches');
    XLSX.writeFile(workbook, `Purchase_Batches_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Add Item Lot Row
  const handleAddItemRow = () => {
    setInvoiceForm({
      ...invoiceForm,
      items: [
        ...invoiceForm.items,
        { skuId: '', brand: '', gsm: '', width: '', reelsCount: '', quantity: '', purchasePrice: '', lotNumber: '', reels: [] as any[] }
      ]
    });
  };

  // Remove Item Lot Row
  const handleRemoveItemRow = (idx: number) => {
    const updated = [...invoiceForm.items];
    updated.splice(idx, 1);
    setInvoiceForm({ ...invoiceForm, items: updated });
  };

  // Value Change inside Form Rows
  const handleItemRowChange = (idx: number, field: string, value: string) => {
    const updated = [...invoiceForm.items];
    const item = { ...updated[idx], [field]: value };
    
    // Auto-populate default SKU variables if skuId changed
    if (field === 'skuId') {
      const selectedSku = skus.find(s => s._id === value);
      if (selectedSku) {
        item.brand = selectedSku.brand || '';
        item.gsm = String(selectedSku.gsm || '');
        item.width = String(selectedSku.width || '');
      }
    }

    if (field === 'reelsCount') {
      const count = Number(value) || 0;
      const currentReels = item.reels || [];
      const newReels = [...currentReels];
      if (newReels.length < count) {
        while (newReels.length < count) {
          newReels.push({ weight: 0 });
        }
      } else if (newReels.length > count) {
        newReels.length = count;
      }
      item.reels = newReels;

      // Auto-compute total quantity if there are reel weights set
      const sum = newReels.reduce((sum, r) => sum + (r.weight || 0), 0);
      if (sum > 0) {
        item.quantity = String(sum);
      }

      if (count > 0) {
        setActiveReelModalIdx(idx);
      }
    }
    
    updated[idx] = item;
    setInvoiceForm({ ...invoiceForm, items: updated });
  };

  const handleReelChange = (itemIdx: number, reelIdx: number, field: string, value: any) => {
    const updatedItems = [...invoiceForm.items];
    const item = { ...updatedItems[itemIdx] };
    const reels = [...(item.reels || [])];
    
    reels[reelIdx] = { ...reels[reelIdx], [field]: field === 'weight' || field === 'width' ? (Number(value) || 0) : value };
    item.reels = reels;

    const sum = reels.reduce((acc, r) => acc + (Number(r.weight) || 0), 0);
    item.quantity = String(sum);

    updatedItems[itemIdx] = item;
    setInvoiceForm({ ...invoiceForm, items: updatedItems });
  };

  // Submit Invoice Creation
  const handleInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    if (!invoiceForm.vendorId) {
      setAddError('Please select a Supplier');
      return;
    }

    const firstStorage = locations.find(loc => loc.level === 'Storage Location');
    if (!firstStorage) {
      setAddError('No storage location defined in the database. Please complete warehouse setup first.');
      return;
    }

    const finalInvoiceNumber = invoiceForm.invoiceNumber || `PB${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;

    // Format validated items
    const validatedItems = [];
    for (let i = 0; i < invoiceForm.items.length; i++) {
      const item = invoiceForm.items[i];
      if (!item.skuId || !item.quantity || !item.purchasePrice) {
        setAddError(`Please fill all required fields in row ${i + 1}`);
        return;
      }
      
      const qty = Number(item.quantity);
      const price = Number(item.purchasePrice);
      const reelsCount = Number(item.reelsCount) || 0;
      
      if (qty <= 0 || price <= 0) {
        setAddError(`Quantity and price must be positive numbers in row ${i + 1}`);
        return;
      }

      // Generate reels array and group by locationId if reels exist
      if (reelsCount > 0) {
        const reelsByLoc: Record<string, any[]> = {};
        const itemReels = item.reels || [];

        for (let r = 0; r < reelsCount; r++) {
          const reelObj = itemReels[r] || {};
          const reelWeight = Number(reelObj.weight) || 0;
          const reelWidth = Number(reelObj.width) || Number(item.width) || 0;
          const reelLocId = reelObj.locationId || item.locationId || firstStorage._id || '';

          if (!reelsByLoc[reelLocId]) {
            reelsByLoc[reelLocId] = [];
          }

          reelsByLoc[reelLocId].push({
            reelNumber: reelObj.reelNumber || `${finalInvoiceNumber}-L${i + 1}-R${String(r + 1).padStart(2, '0')}`,
            gsm: Number(item.gsm) || 0,
            width: reelWidth,
            weight: reelWeight
          });
        }

        // Push a validated item for each unique location
        const uniqueLocations = Object.keys(reelsByLoc);
        for (let lIdx = 0; lIdx < uniqueLocations.length; lIdx++) {
          const locId = uniqueLocations[lIdx];
          const reelsGroup = reelsByLoc[locId];
          const totalGroupWeight = reelsGroup.reduce((sum, r) => sum + r.weight, 0);

          validatedItems.push({
            skuId: item.skuId,
            quantity: totalGroupWeight,
            unit: 'kg',
            purchasePrice: price,
            totalPrice: totalGroupWeight * price,
            lotNumber: item.lotNumber || `${finalInvoiceNumber}-L0${i + 1}`,
            locationId: locId,
            reels: reelsGroup
          });
        }
      } else {
        // Non-reels lot
        const destLocId = item.locationId || firstStorage._id || '';
        validatedItems.push({
          skuId: item.skuId,
          quantity: qty,
          unit: 'kg',
          purchasePrice: price,
          totalPrice: qty * price,
          lotNumber: item.lotNumber || `${finalInvoiceNumber}-L0${i + 1}`,
          locationId: destLocId,
          reels: []
        });
      }
    }

    const matTotal = validatedItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = Number(invoiceForm.taxAmount) || 0;
    const freight = Number(invoiceForm.freight) || 0;
    const crane = Number(invoiceForm.craneCharges) || 0;
    const loading = Number(invoiceForm.loadingUnloading) || 0;
    const other = Number(invoiceForm.otherCharges) || 0;

    setAddLoading(true);
    try {
      const invoiceData = {
        invoiceNumber: finalInvoiceNumber,
        vendorId: invoiceForm.vendorId,
        items: validatedItems,
        taxAmount: tax,
        freight,
        craneCharges: crane,
        otherCharges: loading + other, // Combined loading and other charges
        subTotal: matTotal,
        grandTotal: matTotal + tax + freight + crane + loading + other,
        company: selectedCompany?._id,
        status: 'Posted'
      };

      if (isEditing && editingInvoiceId) {
        await updatePurchaseInvoiceV2(editingInvoiceId, invoiceData);
        showToast('Purchase invoice updated successfully!', 'success');
      } else {
        await createPurchaseInvoiceV2(invoiceData);
        showToast('Purchase invoice inwarded successfully!', 'success');
      }

      setActiveSubPage('list');
      setIsEditing(false);
      setEditingInvoiceId(null);
      loadInvoices();
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
      loadingUnloading: '0', // Defaults
      otherCharges: String(invoice.otherCharges || 0),
      dueDate: invoice.dueDate ? invoice.dueDate.split('T')[0] : '',
      items: invoice.items.map(item => ({
        skuId: typeof item.skuId === 'object' && item.skuId !== null ? item.skuId._id : (item.skuId || ''),
        brand: (item.skuId as any)?.brand || '',
        gsm: String((item.skuId as any)?.gsm || ''),
        width: String((item.skuId as any)?.width || ''),
        reelsCount: String(item.reels?.length || ''),
        quantity: String(item.quantity),
        purchasePrice: String(item.purchasePrice),
        lotNumber: item.lotNumber || '',
        reels: item.reels || []
      }))
    });
    setAddError('');
    setActiveSubPage('new');
  };

  const handleDeleteInvoice = async (invoice: PurchaseInvoiceV2) => {
    if (!window.confirm(`Are you sure you want to delete purchase invoice ${invoice.invoiceNumber}? This will reverse the stock entries and adjust the vendor's outstanding balance.`)) {
      return;
    }
    try {
      await deletePurchaseInvoiceV2(invoice._id || '', selectedCompany?._id || '');
      showToast('Purchase invoice deleted successfully!', 'success');
      loadInvoices();
    } catch (e) {
      console.error(e);
      showToast('Failed to delete purchase invoice', 'error');
    }
  };

  // Perform Location Allocation Submit
  const handleAllocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    setAllocateError('');

    const lotItem = selectedInvoice.items[allocateForm.itemIndex];
    const qty = Number(allocateForm.quantity);
    if (isNaN(qty) || qty <= 0) {
      setAllocateError('Please enter a valid allocation weight');
      return;
    }

    if (!allocateForm.toLocationId) {
      setAllocateError('Please select a destination storage area');
      return;
    }

    // Default source location (where initially inwarded)
    const fromLocationId = typeof lotItem.locationId === 'object' && lotItem.locationId !== null 
      ? (lotItem.locationId as any)._id 
      : lotItem.locationId;

    setAllocateSubmitting(true);
    try {
      await recordTransferV2({
        skuId: typeof lotItem.skuId === 'object' && lotItem.skuId !== null ? (lotItem.skuId as any)._id : lotItem.skuId,
        fromLocationId: fromLocationId as string,
        toLocationId: allocateForm.toLocationId,
        quantity: qty,
        remarks: `Location Allocation: ${selectedInvoice.invoiceNumber}`,
        company: selectedCompany?._id || '',
        batchNumber: selectedInvoice.invoiceNumber,
        reels: selectedReelsForAllocation
      });

      showToast('Stock allocated successfully!', 'success');
      setShowAllocateModal(false);
      setAllocateForm({ itemIndex: 0, toLocationId: '', quantity: '' });
      setSelectedReelsForAllocation([]);
      loadBalances();
    } catch (err: any) {
      console.error(err);
      setAllocateError(err.response?.data?.msg || 'Failed to allocate stock to location');
    } finally {
      setAllocateSubmitting(false);
    }
  };

  // Helper: Traverse parent chain in memory
  const resolveLocationPath = (locId: string) => {
    const bin = locations.find(l => l._id === locId);
    if (!bin) return { factory: '—', floor: '—', zone: '—', bin: '—' };
    
    const zone = locations.find(l => l._id === bin.parentId);
    const floor = zone ? locations.find(l => l._id === zone.parentId) : null;
    const factory = floor ? locations.find(l => l._id === floor.parentId) : null;
    
    return {
      factory: factory?.name || '—',
      floor: floor?.name || '—',
      zone: zone?.name || '—',
      bin: bin.name || '—'
    };
  };

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  // Form value aggregation
  const formLotsCount = invoiceForm.items.length;
  const formReelsCount = invoiceForm.items.reduce((sum, item) => sum + (Number(item.reelsCount) || 0), 0);
  const formTotalWeight = invoiceForm.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const formMatTotal = invoiceForm.items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.purchasePrice) || 0)), 0);
  const formOtherCharges = (Number(invoiceForm.freight) || 0) + (Number(invoiceForm.craneCharges) || 0) + (Number(invoiceForm.loadingUnloading) || 0) + (Number(invoiceForm.otherCharges) || 0);

  // Dashboard Stats (mocked or loaded)
  const dashboardTotalBatches = total;
  const dashboardTotalWeight = invoices.reduce((sum, inv) => sum + (inv.items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0), 0);
  const dashboardTotalValue = invoices.reduce((sum, inv) => sum + (inv.subTotal || 0), 0);
  const dashboardPendingReceipts = invoices.filter(inv => inv.status === 'Draft').length;

  return (
    <div className="space-y-6">
      {/* ── SUB-PAGE 1: NEW/EDIT FORM ─────────────────────────────────────────── */}
      {activeSubPage === 'new' ? (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom duration-200">
          {/* Breadcrumb Header */}
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <div className="flex items-center gap-1 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                <span>Purchase</span>
                <ChevronRight className="w-3 h-3" />
                <span className="cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setActiveSubPage('list')}>Purchase Batches</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-gray-600">New Purchase Batch</span>
              </div>
              <h1 className="text-lg font-black text-gray-900 tracking-tight mt-1 flex items-center gap-2">
                <Plus className="w-4.5 h-4.5 text-blue-600" />
                {isEditing ? 'Edit Purchase Batch' : 'New Purchase Batch'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSubPage('list')}
                className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-xl text-xs shadow-3xs flex items-center gap-1 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button
                type="button"
                onClick={handleInvoiceSubmit}
                disabled={addLoading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-colors"
              >
                <Check className="w-3.5 h-3.5" /> Save Purchase Batch
              </button>
            </div>
          </div>

          {addError && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-700 flex items-center gap-2">
              <AlertCircleIcon className="w-4 h-4 shrink-0" />
              <span>{addError}</span>
            </div>
          )}

          {/* Form Content layout */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Column (3/4 width) */}
            <div className="lg:col-span-3 space-y-6">
              {/* Section 1: Purchase Batch Details */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider border-b pb-2">
                  1. Purchase Batch Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Batch No. *</label>
                    <input
                      type="text"
                      placeholder="e.g. PB2407001"
                      value={invoiceForm.invoiceNumber}
                      onChange={e => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-950 font-mono font-bold"
                    />
                    <span className="text-[9px] text-gray-400 font-semibold mt-1 block">Auto-generated if empty</span>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Purchase Date *</label>
                    <input
                      type="date"
                      value={invoiceForm.dueDate}
                      onChange={e => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Supplier *</label>
                    <select
                      value={invoiceForm.vendorId}
                      onChange={e => setInvoiceForm({ ...invoiceForm, vendorId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 font-semibold"
                      required
                    >
                      <option value="">Select Supplier</option>
                      {vendors.map(v => (
                        <option key={v._id} value={v._id}>{v.firmName || v.ownerName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Purchase Type</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 font-semibold"
                    >
                      <option value="Raw Material">Raw Material</option>
                      <option value="Semi Finished">Semi-Finished</option>
                      <option value="Finished Goods">Finished Goods</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Material Lots */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                    Material Lots
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black transition-all shadow-sm"
                  >
                    + Add Material Lot
                  </button>
                </div>

                <div className="space-y-4">
                  {invoiceForm.items.map((item, idx) => {
                    const reelsCount = Number(item.reelsCount) || 0;
                    return (
                      <div key={idx} className="bg-white rounded-xl border border-gray-200 shadow-xs p-5 space-y-4 text-left">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                          <span className="text-xs font-black text-gray-900 uppercase font-mono bg-gray-100 px-2 py-0.5 rounded">
                            LOT - {idx + 1}
                          </span>
                          {invoiceForm.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(idx)}
                              className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition-colors text-xs font-bold flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Remove Lot
                            </button>
                          )}
                        </div>

                        {/* Lot Form Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3.5 text-xs text-gray-900">
                          <div className="col-span-2">
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Item SKU *</label>
                            <select
                              value={item.skuId}
                              onChange={e => handleItemRowChange(idx, 'skuId', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white font-semibold text-gray-800 text-xs"
                              required
                            >
                              <option value="">Select SKU</option>
                              {skus.map(s => (
                                <option key={s._id} value={s._id}>{s.name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Brand</label>
                            <input
                              type="text"
                              value={item.brand}
                              onChange={e => handleItemRowChange(idx, 'brand', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">GSM</label>
                            <input
                              type="number"
                              value={item.gsm}
                              onChange={e => handleItemRowChange(idx, 'gsm', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-center font-bold"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Width (cm)</label>
                            <input
                              type="number"
                              value={item.width}
                              onChange={e => handleItemRowChange(idx, 'width', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-center font-bold"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Reels Count</label>
                            <input
                              type="number"
                              value={item.reelsCount}
                              onChange={e => handleItemRowChange(idx, 'reelsCount', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-center font-bold"
                              placeholder="0"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Total KG</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={e => handleItemRowChange(idx, 'quantity', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-right font-black"
                              placeholder="0"
                              disabled={reelsCount > 0}
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Rate / KG (₹)</label>
                            <input
                              type="number"
                              value={item.purchasePrice}
                              onChange={e => handleItemRowChange(idx, 'purchasePrice', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-right font-bold"
                              placeholder="0.00"
                              required
                            />
                          </div>
                        </div>

                        {/* Layout details: amount and storage (only for non-reels items) */}
                        <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50/50 p-3 rounded-lg border border-gray-100 text-xs">
                          <div className="flex gap-4">
                            <span className="font-semibold text-gray-500">
                              Lot Subtotal: <span className="font-black text-gray-800 text-sm">₹{((Number(item.quantity) || 0) * (Number(item.purchasePrice) || 0)).toLocaleString('en-IN')}</span>
                            </span>
                          </div>

                          {reelsCount === 0 && (
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lot Storage Location:</label>
                              <select
                                value={item.locationId || ''}
                                onChange={e => handleItemRowChange(idx, 'locationId', e.target.value)}
                                className="px-2 py-1 border border-gray-200 rounded-lg bg-white text-[11px] font-bold text-gray-800"
                                required
                              >
                                <option value="">-- Select Destination Storage --</option>
                                {locations.filter(loc => loc.level === 'Storage Location').map(loc => {
                                  const paths = resolveLocationPath(loc._id);
                                  const hierarchy = [paths.factory, paths.floor, paths.zone].filter(p => p && p !== '—').join(' > ');
                                  return (
                                    <option key={loc._id} value={loc._id}>
                                      {hierarchy ? `${hierarchy} > ` : ''}{loc.name}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          )}
                        </div>

                        {/* Inline Reels List inside card (matches handwritten sketch) */}
                        {reelsCount > 0 && (
                          <div className="pt-3 border-t border-gray-100 space-y-2">
                            <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
                              Reel Specifications & Storage Placement:
                            </span>

                            <div className="overflow-x-auto border border-gray-200 rounded-lg">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-gray-50 text-gray-400 font-bold uppercase text-[9px] border-b border-gray-150">
                                    <th className="py-2 px-3 w-16">Reel</th>
                                    <th className="py-2 px-3 w-32">Weight (KG) *</th>
                                    <th className="py-2 px-3 w-32">Width (cm) *</th>
                                    <th className="py-2 px-3">Storage Allocation *</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
                                  {Array.from({ length: reelsCount }).map((_, rIdx) => {
                                    const reelObj = item.reels?.[rIdx] || {};
                                    const reelWeightVal = reelObj.weight !== undefined && reelObj.weight !== null ? reelObj.weight : '';
                                    const reelWidthVal = reelObj.width !== undefined && reelObj.width !== null ? reelObj.width : item.width;
                                    const reelLocId = reelObj.locationId || '';

                                    return (
                                      <tr key={rIdx} className="hover:bg-gray-50/20">
                                        <td className="py-1.5 px-3 font-mono text-gray-500 font-bold">R-{rIdx + 1}</td>
                                        <td className="py-1.5 px-3">
                                          <input
                                            type="number"
                                            value={reelWeightVal}
                                            onChange={e => handleReelChange(idx, rIdx, 'weight', e.target.value)}
                                            placeholder="0.0"
                                            className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs font-mono font-bold text-gray-900"
                                            required
                                          />
                                        </td>
                                        <td className="py-1.5 px-3">
                                          <input
                                            type="number"
                                            value={reelWidthVal}
                                            onChange={e => handleReelChange(idx, rIdx, 'width', e.target.value)}
                                            placeholder="Width"
                                            className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs font-mono"
                                            required
                                          />
                                        </td>
                                        <td className="py-1.5 px-3">
                                          <select
                                            value={reelLocId}
                                            onChange={e => handleReelChange(idx, rIdx, 'locationId', e.target.value)}
                                            className="w-full px-2 py-1 border border-gray-200 rounded-md bg-white text-xs font-bold text-gray-800"
                                            required
                                          >
                                            <option value="">-- Choose Storage Area --</option>
                                            {locations.filter(loc => loc.level === 'Storage Location').map(loc => {
                                              const paths = resolveLocationPath(loc._id);
                                              const hierarchy = [paths.factory, paths.floor, paths.zone].filter(p => p && p !== '—').join(' > ');
                                              return (
                                                <option key={loc._id} value={loc._id}>
                                                  {hierarchy ? `${hierarchy} > ` : ''}{loc.name}
                                                </option>
                                              );
                                            })}
                                          </select>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 3: Other Charges */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider border-b pb-2">
                  3. Other Charges
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Freight Charges (₹)</label>
                    <input
                      type="number"
                      value={invoiceForm.freight}
                      onChange={e => setInvoiceForm({ ...invoiceForm, freight: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Crane Charges (₹)</label>
                    <input
                      type="number"
                      value={invoiceForm.craneCharges}
                      onChange={e => setInvoiceForm({ ...invoiceForm, craneCharges: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Loading / Unloading (₹)</label>
                    <input
                      type="number"
                      value={invoiceForm.loadingUnloading}
                      onChange={e => setInvoiceForm({ ...invoiceForm, loadingUnloading: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Other Charges (₹)</label>
                    <input
                      type="number"
                      value={invoiceForm.otherCharges}
                      onChange={e => setInvoiceForm({ ...invoiceForm, otherCharges: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono text-right"
                      placeholder="e.g. Labour, Tally etc."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column (1/4 width) - Summary Panel */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-5 h-full flex flex-col justify-between min-h-[400px]">
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider pb-2 border-b">
                    Batch Summary
                  </h3>
                  
                  <div className="space-y-3.5 text-xs text-gray-700">
                    <div className="flex justify-between font-semibold">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Total Lots:</span>
                      <span className="text-gray-900 font-black">{formLotsCount}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Total Reels:</span>
                      <span className="text-gray-900 font-black">{formReelsCount}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Total KG:</span>
                      <span className="text-gray-900 font-black font-mono">{formTotalWeight.toLocaleString('en-IN')} KG</span>
                    </div>
                    
                    <div className="flex justify-between font-semibold border-t pt-3">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Material Total:</span>
                      <span className="text-gray-950 font-black font-mono">₹{formMatTotal.toLocaleString('en-IN')}</span>
                    </div>

                    <div className="space-y-2 border-t pt-3">
                      <span className="text-gray-400 font-bold uppercase text-[9px] block mb-1">Other Charges:</span>
                      <div className="flex justify-between text-[11px]">
                        <span>Freight Charges:</span>
                        <span className="font-mono font-bold">₹{(Number(invoiceForm.freight) || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span>Crane Charges:</span>
                        <span className="font-mono font-bold">₹{(Number(invoiceForm.craneCharges) || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span>Loading / Unloading:</span>
                        <span className="font-mono font-bold">₹{(Number(invoiceForm.loadingUnloading) || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span>Other Charges:</span>
                        <span className="font-mono font-bold">₹{(Number(invoiceForm.otherCharges) || 0).toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    <div className="flex justify-between font-black border-t pt-3.5 text-gray-950">
                      <span className="text-gray-400 uppercase text-[10px]">Grand Total:</span>
                      <span className="text-blue-600 font-mono text-base">₹{(formMatTotal + formOtherCharges).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-150 pt-4 bg-gray-50/30 rounded-xl p-3 text-[10px] font-bold text-gray-400 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>We record only reels and KGs. Reel numbers are not entered.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : activeSubPage === 'details' && selectedInvoice ? (
        /* ── SUB-PAGE 2: BATCH READ DETAILS VIEW ──────────────────────────────── */
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom duration-250">
          {/* Breadcrumb Header */}
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <div className="flex items-center gap-1 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                <span>Purchase</span>
                <ChevronRight className="w-3 h-3" />
                <span className="cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setActiveSubPage('list')}>Purchase Batches</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-gray-600">{selectedInvoice.invoiceNumber}</span>
              </div>
              <h1 className="text-lg font-black text-gray-900 tracking-tight mt-1 flex items-center gap-2">
                <FileText className="w-4.5 h-4.5 text-blue-600" />
                Purchase Batch Details
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleEditInvoice(selectedInvoice)}
                className="px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white rounded-xl text-xs font-bold shadow-3xs flex items-center gap-1 transition-all"
              >
                <Edit className="w-3.5 h-3.5 text-amber-500" /> Edit Batch
              </button>
              <button
                className="px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white rounded-xl text-xs font-bold shadow-3xs flex items-center gap-1 transition-all"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
              <button
                onClick={() => setActiveSubPage('list')}
                className="px-4 py-2 bg-gray-900 text-white hover:bg-gray-800 rounded-xl text-xs font-bold shadow-md flex items-center gap-1 transition-all"
              >
                More Actions <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Header batch summary card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 items-center font-medium">
            <div className="flex items-center gap-3 col-span-2">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shrink-0">
                <Coins className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Batch No.</span>
                <span className="text-base font-black text-blue-600 font-mono block truncate">{selectedInvoice.invoiceNumber}</span>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Supplier</span>
              <span className="text-xs font-bold text-gray-800 block truncate">
                {typeof selectedInvoice.vendorId === 'object' && selectedInvoice.vendorId !== null ? (selectedInvoice.vendorId.firmName || selectedInvoice.vendorId.ownerName) : 'Supplier'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Purchase Date</span>
              <span className="text-xs font-bold text-gray-800 block">
                {selectedInvoice.createdAt ? new Date(selectedInvoice.createdAt).toLocaleDateString('en-IN') : '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Purchase Type</span>
              <span className="text-xs font-bold text-gray-800 block">Raw Material</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Lots</span>
              <span className="text-xs font-bold text-gray-900 block font-mono">{selectedInvoice.items?.length || 0} Lots</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Reels</span>
              <span className="text-xs font-bold text-gray-900 block font-mono">
                {selectedInvoice.items?.reduce((sum, item) => sum + (item.reels?.length || 0), 0) || 0}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total KG</span>
              <span className="text-xs font-black text-gray-950 block font-mono">
                {selectedInvoice.items?.reduce((sum, item) => sum + (item.quantity || 0), 0).toLocaleString('en-IN')} KG
              </span>
            </div>
          </div>

          {/* Details Tabs and panels */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Column Tabs content (3/4 width) */}
            <div className="lg:col-span-3 space-y-5">
              <div className="flex gap-2 border-b border-gray-200 pb-px">
                <button
                  onClick={() => setDetailsTab('lots')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                    detailsTab === 'lots' 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" /> Material Lots
                </button>
                <button
                  onClick={() => setDetailsTab('allocation')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                    detailsTab === 'allocation' 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <MapPinIcon className="w-3.5 h-3.5" /> Location Allocation
                </button>

                <button
                  onClick={() => setDetailsTab('history')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                    detailsTab === 'history' 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <HelpCircle className="w-3.5 h-3.5" /> History / Timeline
                </button>
              </div>

              {/* LOTS TAB */}
              {detailsTab === 'lots' && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">
                      1. Material Lots <span className="text-[10px] text-gray-400 font-semibold">(Different materials in this purchase batch)</span>
                    </h3>
                  </div>
                  <div className="overflow-x-auto border border-gray-100 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 uppercase font-black border-b border-gray-200 text-[10px] tracking-wider">
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">Item</th>
                          <th className="px-4 py-3">Brand</th>
                          <th className="px-4 py-3 text-center">GSM</th>
                          <th className="px-4 py-3 text-center">Width (cm)</th>
                          <th className="px-4 py-3 text-center">Reels</th>
                          <th className="px-4 py-3 text-right">Total KG</th>
                          <th className="px-4 py-3 text-right">Rate / KG (₹)</th>
                          <th className="px-4 py-3 text-right">Amount (₹)</th>
                          <th className="px-4 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-gray-700 font-medium">
                        {selectedInvoice.items?.map((item, idx) => {
                          const skuName = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any).name : 'Raw Material';
                          const brand = (item.skuId as any)?.brand || 'BILT';
                          const gsm = (item.skuId as any)?.gsm || '52';
                          const width = (item.skuId as any)?.width || '64';
                          
                          return (
                            <tr key={idx} className="hover:bg-gray-50/50">
                              <td className="px-4 py-3 text-gray-400 font-mono">{idx + 1}</td>
                              <td className="px-4 py-3 font-bold text-gray-900">{skuName}</td>
                              <td className="px-4 py-3 text-gray-600">{brand}</td>
                              <td className="px-4 py-3 text-center font-mono">{gsm}</td>
                              <td className="px-4 py-3 text-center font-mono">{width}</td>
                              <td className="px-4 py-3 text-center font-mono font-bold text-gray-800">{item.reels?.length || 0}</td>
                              <td className="px-4 py-3 text-right font-mono font-black text-gray-950">{(item.quantity || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-mono text-gray-600">₹{(item.purchasePrice || 0).toFixed(2)}</td>
                              <td className="px-4 py-3 text-right font-mono font-black text-gray-950">₹{(item.totalPrice || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-[9px] px-2 py-0.5 rounded font-black uppercase border bg-green-50 text-green-700 border-green-200">
                                  Received
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* LOCATION ALLOCATION TAB */}
              {detailsTab === 'allocation' && (() => {
                // Find initial location of items
                const defaultLocationId = selectedInvoice.items?.[0] 
                  ? (typeof selectedInvoice.items[0].locationId === 'object' && selectedInvoice.items[0].locationId !== null 
                     ? (selectedInvoice.items[0].locationId as any)._id 
                     : selectedInvoice.items[0].locationId)
                  : '';

                // Filter balances to display only physical allocations
                const physicalBalances = inventoryBalances.filter(
                  b => b.batchNumber === selectedInvoice.invoiceNumber && 
                       (b.location?._id || b.locationId) !== defaultLocationId
                );

                const totalAllocated = physicalBalances.reduce((sum, b) => sum + (b.onHand || 0), 0);

                return (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between border-b pb-3">
                      <div>
                        <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">
                          2. Location Allocation <span className="text-[10px] text-gray-400 font-semibold">(Where this batch is stored)</span>
                        </h3>
                        <p className="text-[11px] text-gray-400 font-bold uppercase mt-1">
                          Total Allocated: <span className="text-blue-600">{totalAllocated.toLocaleString()} KG</span> across {physicalBalances.length} locations
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setAllocateForm({ itemIndex: 0, toLocationId: '', quantity: '' });
                          setAllocateError('');
                          setShowAllocateModal(true);
                        }}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black shadow-sm transition-all"
                      >
                        + Allocate Location
                      </button>
                    </div>

                    <div className="overflow-x-auto border border-gray-100 rounded-xl">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 uppercase font-black border-b border-gray-200 text-[10px] tracking-wider">
                            <th className="px-5 py-3">Location</th>
                            <th className="px-5 py-3">Factory</th>
                            <th className="px-5 py-3">Floor</th>
                            <th className="px-5 py-3">Zone</th>
                            <th className="px-5 py-3">Rack / Area</th>
                            <th className="px-5 py-3 text-right">Quantity (KG)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-gray-700 font-semibold">
                          {physicalBalances.map((b, i) => {
                            const paths = resolveLocationPath(b.location?._id || b.locationId);
                            return (
                              <tr key={i} className="hover:bg-gray-50/50">
                                <td className="px-5 py-3 text-blue-600 font-black">{b.location?.name || '—'}</td>
                                <td className="px-5 py-3">{paths.factory}</td>
                                <td className="px-5 py-3">{paths.floor}</td>
                                <td className="px-5 py-3">{paths.zone}</td>
                                <td className="px-5 py-3">{paths.bin}</td>
                                <td className="px-5 py-3 text-right font-mono font-black text-gray-900 text-xs">
                                  {b.onHand.toLocaleString('en-IN')}
                                </td>
                              </tr>
                            );
                          })}

                          {/* Fallback if no allocation done yet */}
                          {physicalBalances.length === 0 && (
                            <tr>
                              <td colSpan={6} className="text-center py-10 text-gray-400 italic">
                                Stock is currently placed in initial In-Transit/Unallocated storage. Click "+ Allocate Location" to distribute stock to warehouse layout.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}



              {/* TIMELINE TAB */}
              {detailsTab === 'history' && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 shadow-sm">
                  <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider border-b pb-2">
                    Procurement Log Timeline
                  </h3>
                  <div className="relative border-l border-gray-200 ml-4 pl-6 space-y-6 text-xs text-gray-700">
                    <div className="relative">
                      <span className="absolute -left-[30px] top-0.5 p-1 bg-green-100 text-green-700 rounded-full border-2 border-white shadow-3xs">
                        <Check className="w-3 h-3" />
                      </span>
                      <p className="font-bold text-gray-900">Purchase Inward Registered (Posted)</p>
                      <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                        Registered on {selectedInvoice.createdAt ? new Date(selectedInvoice.createdAt).toLocaleString('en-IN') : '—'} by Admin
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column Summary card (1/4 width) */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-5 h-full flex flex-col justify-between min-h-[400px]">
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider pb-2 border-b">
                    Batch Summary
                  </h3>
                  
                  <div className="space-y-3.5 text-xs text-gray-700 font-medium">
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Total Lots (Materials):</span>
                      <span className="text-gray-900 font-black">{selectedInvoice.items?.length || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Total Reels:</span>
                      <span className="text-gray-900 font-black">
                        {selectedInvoice.items?.reduce((sum, item) => sum + (item.reels?.length || 0), 0) || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Total KG:</span>
                      <span className="text-gray-900 font-black font-mono">
                        {selectedInvoice.items?.reduce((sum, item) => sum + (item.quantity || 0), 0).toLocaleString('en-IN')} KG
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-3">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Material Total:</span>
                      <span className="text-gray-950 font-black font-mono">₹{(selectedInvoice.subTotal || 0).toLocaleString('en-IN')}</span>
                    </div>

                    <div className="space-y-2 border-t pt-3">
                      <span className="text-gray-400 font-bold uppercase text-[9px] block mb-1">Cost Summary:</span>
                      <div className="flex justify-between text-[11px]">
                        <span>Material Total:</span>
                        <span className="font-mono font-bold">₹{(selectedInvoice.subTotal || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span>Freight Charges:</span>
                        <span className="font-mono font-bold">₹{(selectedInvoice.freight || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span>Crane Charges:</span>
                        <span className="font-mono font-bold">₹{(selectedInvoice.craneCharges || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span>Other Charges:</span>
                        <span className="font-mono font-bold">₹{(selectedInvoice.otherCharges || 0).toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    <div className="flex justify-between font-black border-t pt-3.5 text-gray-950">
                      <span className="text-gray-400 uppercase text-[10px]">Grand Total:</span>
                      <span className="text-blue-600 font-mono text-base">₹{(selectedInvoice.grandTotal || 0).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-150 pt-4 bg-gray-50/30 rounded-xl p-3 text-[10px] font-bold text-gray-400 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>We record only reels and KGs. Reel numbers are not entered.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── SUB-PAGE 3: MAIN LIST VIEW ──────────────────────────────────────── */
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <Coins className="w-5 h-5 text-blue-600" />
                Purchase Batches
              </h1>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">All purchase batches (each batch may contain multiple materials/lot lines)</p>
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
                    loadingUnloading: '0',
                    otherCharges: '0',
                    dueDate: new Date().toISOString().split('T')[0],
                    items: [{ skuId: '', brand: '', gsm: '', width: '', reelsCount: '', quantity: '', purchasePrice: '', lotNumber: '', reels: [] as any[] }]
                  });
                  setAddError('');
                  setActiveSubPage('new');
                }}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> + New Purchase
              </button>
            </div>
          </div>

          {/* Statistics row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                <FileText className="w-6 h-6 animate-pulse-slow" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Batches</span>
                <span className="text-xl font-black text-gray-900 block font-mono mt-0.5">{dashboardTotalBatches}</span>
                <span className="text-[9px] text-gray-500 block font-bold uppercase mt-0.5">This Month</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Quantity</span>
                <span className="text-xl font-black text-emerald-700 block font-mono mt-0.5">{dashboardTotalWeight.toLocaleString('en-IN')} KG</span>
                <span className="text-[9px] text-gray-500 block font-bold uppercase mt-0.5">This Month</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                <IndianRupee className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Value</span>
                <span className="text-xl font-black text-orange-700 block font-mono mt-0.5">₹{dashboardTotalValue.toLocaleString('en-IN')}</span>
                <span className="text-[9px] text-gray-500 block font-bold uppercase mt-0.5">This Month</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Pending Receipts</span>
                <span className="text-xl font-black text-purple-700 block font-mono mt-0.5">{dashboardPendingReceipts}</span>
                <span className="text-[9px] text-gray-500 block font-bold uppercase mt-0.5">This Month</span>
              </div>
            </div>
          </div>

          {/* Table section */}
          <div className="space-y-4">
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
                  className="w-full sm:w-40 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-700 font-bold"
                >
                  <option value="">All Suppliers</option>
                  {vendors.map(v => (
                    <option key={v._id} value={v._id}>{v.firmName || v.ownerName}</option>
                  ))}
                </select>

                <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl p-1 bg-white font-mono font-bold">
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="text-xs border-0 bg-transparent focus:ring-0 p-1 text-gray-700 w-28 font-mono font-bold"
                  />
                  <span className="text-gray-400 font-bold text-xs">-</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="text-xs border-0 bg-transparent focus:ring-0 p-1 text-gray-700 w-28 font-mono font-bold"
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

            <InvoiceTable
              invoices={invoices}
              loading={loading}
              onViewDetails={(inv) => {
                setSelectedInvoice(inv);
                setDetailsTab('lots');
                setActiveSubPage('details');
              }}
              onEditInvoice={handleEditInvoice}
              onDeleteInvoice={handleDeleteInvoice}
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

          <div className="bg-blue-50/50 p-4 border border-blue-150 rounded-2xl space-y-2 text-xs">
            <h4 className="font-black text-blue-900 flex items-center gap-1.5">
              <HelpCircle className="w-4.5 h-4.5 text-blue-600 shrink-0" />
              About Purchase Batches
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 font-semibold text-blue-700 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                Each purchase batch can contain multiple materials (different brand, GSM, width, etc.)
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                Location allocation happens after inward.
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                We record only: Reels and KGs (no reel numbers).
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                Stock is tracked lot-wise for accuracy.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOCATION ALLOCATION MODAL DIALOG ──────────────────────────────────── */}
      {showAllocateModal && selectedInvoice && (() => {
        // Find default location
        const defaultLocationId = selectedInvoice.items?.[0] 
          ? (typeof selectedInvoice.items[0].locationId === 'object' && selectedInvoice.items[0].locationId !== null 
             ? (selectedInvoice.items[0].locationId as any)._id 
             : selectedInvoice.items[0].locationId)
          : '';

        const lotItem = selectedInvoice.items[allocateForm.itemIndex];
        const selectedSkuId = lotItem ? (typeof lotItem.skuId === 'object' && lotItem.skuId !== null ? (lotItem.skuId as any)._id : lotItem.skuId) : '';
        
        // Find remaining unallocated quantity at default location
        const unallocatedBal = inventoryBalances.find(
          b => (b.location?._id || b.locationId) === defaultLocationId && 
               b.batchNumber === selectedInvoice.invoiceNumber && 
               (b.sku?._id || b.skuId) === selectedSkuId
        );
        const maxAllocatable = unallocatedBal ? unallocatedBal.onHand : 0;

        const physicalLocations = locations.filter(loc => loc.level === 'Storage Location' && loc._id !== defaultLocationId);
        const hasReels = unallocatedBal && unallocatedBal.reels && unallocatedBal.reels.length > 0;

        const handleReelToggle = (reel: any) => {
          let newSelected = [...selectedReelsForAllocation];
          if (newSelected.some(r => r.reelNumber === reel.reelNumber)) {
            newSelected = newSelected.filter(r => r.reelNumber !== reel.reelNumber);
          } else {
            newSelected.push(reel);
          }
          setSelectedReelsForAllocation(newSelected);
          const sumWeight = newSelected.reduce((sum, r) => sum + r.weight, 0);
          setAllocateForm(prev => ({ ...prev, quantity: sumWeight > 0 ? String(sumWeight) : '' }));
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/45 backdrop-blur-3xs" onClick={() => !allocateSubmitting && setShowAllocateModal(false)} />

            <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-lg w-full relative z-10 animate-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[85vh]">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <MapPinIcon className="w-4 h-4 text-blue-600 animate-pulse" />
                  Allocate Location & Reels
                </h2>
                <button
                  disabled={allocateSubmitting}
                  onClick={() => setShowAllocateModal(false)}
                  className="p-1.5 hover:bg-gray-150 rounded-lg transition-colors text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAllocateSubmit} className="p-6 space-y-4 text-left text-xs overflow-y-auto flex-1">
                {allocateError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-700 flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 shrink-0" />
                    <span>{allocateError}</span>
                  </div>
                )}

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold uppercase">Batch Number:</span>
                    <span className="font-bold text-blue-600 font-mono">{selectedInvoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold uppercase">Available Unallocated:</span>
                    <span className="font-black text-gray-900 font-mono">
                      {maxAllocatable.toLocaleString('en-IN')} KG
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Select Material Lot *</label>
                    <select
                      value={allocateForm.itemIndex}
                      onChange={e => {
                        setAllocateForm({ ...allocateForm, itemIndex: Number(e.target.value), quantity: '' });
                        setSelectedReelsForAllocation([]);
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                      required
                      disabled={allocateSubmitting}
                    >
                      {selectedInvoice.items?.map((item, idx) => {
                        const name = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any).name : 'Raw Material';
                        const lotNo = item.lotNumber || `${selectedInvoice.invoiceNumber}-L0${idx + 1}`;
                        return (
                          <option key={idx} value={idx}>
                            {name} ({lotNo})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Destination Storage Location (Warehouse/Floor/Zone/Bin) *</label>
                    <select
                      value={allocateForm.toLocationId}
                      onChange={e => setAllocateForm({ ...allocateForm, toLocationId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                      required
                      disabled={allocateSubmitting}
                    >
                      <option value="">-- Choose Storage Area --</option>
                      {physicalLocations.map(loc => {
                        const paths = resolveLocationPath(loc._id);
                        const hierarchy = [paths.factory, paths.floor, paths.zone].filter(p => p && p !== '—').join(' > ');
                        return (
                          <option key={loc._id} value={loc._id}>
                            {hierarchy ? `${hierarchy} > ` : ''}{loc.name} ({loc.level})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {hasReels && (
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        Select Reels to Allocate ({selectedReelsForAllocation.length} of {unallocatedBal.reels.length} selected)
                      </label>
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1.5">
                        {unallocatedBal.reels.map((r: any) => {
                          const isChecked = selectedReelsForAllocation.some(sr => sr.reelNumber === r.reelNumber);
                          return (
                            <label key={r.reelNumber} className="flex items-center justify-between p-2 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all cursor-pointer font-semibold text-gray-700">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleReelToggle(r)}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                />
                                <span className="font-mono text-xs text-gray-900">{r.reelNumber}</span>
                              </div>
                              <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-black">
                                {r.weight} KG
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-gray-400 italic">
                        💡 Sum weight of selected reels will automatically calculate the allocation weight.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Quantity to Allocate (KG) *</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        max={maxAllocatable}
                        placeholder={hasReels ? "Auto-calculated from selected reels" : `Max ${maxAllocatable.toLocaleString()} KG`}
                        value={allocateForm.quantity}
                        onChange={e => setAllocateForm({ ...allocateForm, quantity: e.target.value })}
                        className="w-full pl-3 pr-12 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 font-mono font-bold text-gray-900 bg-white"
                        required
                        disabled={allocateSubmitting || maxAllocatable <= 0 || hasReels}
                      />
                      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[10px] font-black text-gray-400 uppercase font-mono">
                        KG
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-150 flex justify-end gap-3 flex-shrink-0">
                  <button
                    type="button"
                    disabled={allocateSubmitting}
                    onClick={() => setShowAllocateModal(false)}
                    className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 bg-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={allocateSubmitting || maxAllocatable <= 0 || (hasReels && selectedReelsForAllocation.length === 0)}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {allocateSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Allocating...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-3.5 h-3.5" /> Allocate Stock
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// Local icons
const AlertCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const MapPinIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
  </svg>
);

export default PurchaseInvoicePage;

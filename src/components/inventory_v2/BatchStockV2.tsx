import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Search, RefreshCw, X, FileText, ChevronRight, ChevronDown, ChevronUp, ArrowUpDown, Database, Package, AlertCircle, ArrowRightLeft, Eye, HelpCircle, Download, Plus, ArrowRight, Printer, MoreVertical, ChevronLeft, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getBalancesV2, getWarehouseHierarchyV2, getLedgerV2, recordTransferV2, WarehouseLocationV2, LedgerEntryV2 } from '../../api/mfgApiV2';
import { getPurchaseInvoicesV2, PurchaseInvoiceV2 } from './purchases/purchaseService';
import { showToast } from '../ui/Toast';
import { formatSkuName } from './SkuMasterV2';
import Drawer from '../ui/Drawer';

const BatchStockV2: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useAuth();
  
  // Data state
  const [balances, setBalances] = useState<any[]>([]);
  const [hierarchy, setHierarchy] = useState<WarehouseLocationV2[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoiceV2[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & filter states
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterItem, setFilterItem] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  // Drawer & Selection details state
  const [showLotDrawer, setShowLotDrawer] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'reels' | 'movements' | 'cost' | 'notes'>('reels');
  const [selectedLot, setSelectedLot] = useState<any | null>(null);
  const [activeSubPage, setActiveSubPage] = useState<'list' | 'details'>('list');
  const [selectedDetailLot, setSelectedDetailLot] = useState<any | null>(null);
  
  // Ledger History for selected detail lot
  const [ledgerHistory, setLedgerHistory] = useState<LedgerEntryV2[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Transfer modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferringItem, setTransferringItem] = useState<any | null>(null);
  const [transferForm, setTransferForm] = useState({
    toLocationId: '',
    quantity: '',
    remarks: ''
  });
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState('');

  // Page state
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => {
    if (!selectedCompany?._id) return;
    loadData(true);

    const interval = setInterval(() => {
      loadData(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedCompany?._id]);

  useEffect(() => {
    if (balances.length > 0) {
      if (!selectedLot) {
        setSelectedLot(balances[0]);
      } else {
        const updated = balances.find((b: any) => 
          b._id === selectedLot._id || 
          (b.batchNumber === selectedLot.batchNumber && 
           (b.sku?._id || b.skuId) === (selectedLot.sku?._id || selectedLot.skuId) && 
           (b.location?._id || b.locationId) === (selectedLot.location?._id || selectedLot.locationId))
        );
        if (updated) {
          setSelectedLot(updated);
        }
      }
    }
  }, [balances]);

  // Load ledger history when transitioning to details sub-page
  useEffect(() => {
    if (selectedDetailLot && selectedCompany?._id) {
      loadLedgerHistory(true);
      
      const interval = setInterval(() => {
        loadLedgerHistory(false);
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [selectedDetailLot, selectedCompany?._id]);

  // Sync selectedDetailLot with fresh balances silently
  useEffect(() => {
    if (selectedDetailLot && balances.length > 0) {
      const updated = balances.find((b: any) => 
        b._id === selectedDetailLot._id || 
        (b.batchNumber === selectedDetailLot.batchNumber && 
         (b.sku?._id || b.skuId) === (selectedDetailLot.sku?._id || selectedDetailLot.skuId) && 
         (b.location?._id || b.locationId) === (selectedDetailLot.location?._id || selectedDetailLot.locationId))
      );
      if (updated) {
        setSelectedDetailLot(updated);
      }
    }
  }, [balances, selectedDetailLot]);

  const loadData = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const [balData, hierData, invData] = await Promise.all([
        getBalancesV2(selectedCompany?._id || '', undefined, true),
        getWarehouseHierarchyV2(selectedCompany?._id || ''),
        getPurchaseInvoicesV2({ companyId: selectedCompany?._id || '', limit: 1000 })
      ]);
      setBalances(balData);
      setHierarchy(hierData);
      setInvoices(invData.invoices || []);
    } catch (e) {
      console.error(e);
      if (showLoading) {
        showToast('Failed to load batch stock details', 'error');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const loadLedgerHistory = async (showLoading = true) => {
    if (!selectedDetailLot) return;
    if (showLoading) {
      setLedgerLoading(true);
    }
    try {
      const history = await getLedgerV2({
        companyId: selectedCompany?._id || '',
        skuId: selectedDetailLot.sku?._id || selectedDetailLot.skuId,
        batchNumber: selectedDetailLot.batchNumber || undefined
      });
      setLedgerHistory(history);
    } catch (e) {
      console.error(e);
      if (showLoading) {
        showToast('Failed to load transaction history', 'error');
      }
    } finally {
      if (showLoading) {
        setLedgerLoading(false);
      }
    }
  };

  const getOccupiedCapacity = (locId: string) => {
    return balances
      .filter(b => (b.location?._id || b.locationId) === locId)
      .reduce((sum, b) => sum + (b.onHand || 0), 0);
  };

  const handleOpenTransferModal = (item: any) => {
    setTransferringItem(item);
    setTransferForm({
      toLocationId: '',
      quantity: String(item.onHand || ''),
      remarks: ''
    });
    setTransferError('');
    setShowTransferModal(true);
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferringItem) return;
    setTransferError('');

    const qty = Number(transferForm.quantity);
    if (isNaN(qty) || qty <= 0) {
      setTransferError('Please enter a valid positive quantity');
      return;
    }

    if (qty > transferringItem.onHand) {
      setTransferError(`Insufficient stock. Maximum available is ${transferringItem.onHand.toLocaleString()} ${transferringItem.sku?.unit || 'kg'}`);
      return;
    }

    const destLoc = hierarchy.find(h => h._id === transferForm.toLocationId);
    if (destLoc && destLoc.capacity && destLoc.capacity > 0) {
      const occupied = getOccupiedCapacity(destLoc._id || '');
      if (occupied + qty > destLoc.capacity) {
        setTransferError(`Transfer rejected. The destination storage area does not have enough remaining space. Capacity: ${destLoc.capacity.toLocaleString()} ${destLoc.unit || 'kg'}, Occupied: ${occupied.toLocaleString()} ${destLoc.unit || 'kg'}, Space Available: ${(destLoc.capacity - occupied).toLocaleString()} ${destLoc.unit || 'kg'}`);
        return;
      }
    }

    setTransferSubmitting(true);
    try {
      await recordTransferV2({
        skuId: transferringItem.sku?._id || transferringItem.skuId,
        fromLocationId: transferringItem.location?._id || transferringItem.locationId,
        toLocationId: transferForm.toLocationId,
        quantity: qty,
        remarks: transferForm.remarks || `Internal Stock Transfer: Lot ${transferringItem.batchNumber || '—'}`,
        company: selectedCompany?._id || '',
        batchNumber: transferringItem.batchNumber
      });

      showToast('Stock transferred successfully!', 'success');
      setShowTransferModal(false);
      
      // Reload balances
      setLoading(true);
      const [balData, locsData] = await Promise.all([
        getBalancesV2(selectedCompany?._id || '', undefined, true),
        getWarehouseHierarchyV2(selectedCompany?._id || '')
      ]);
      setBalances(balData);
      setHierarchy(locsData);

      // Refresh current lot selected if present
      if (selectedLot && selectedLot._id === transferringItem._id) {
        const updatedSelected = balData.find(b => b._id === transferringItem._id);
        setSelectedLot(updatedSelected || balData[0]);
      }
      if (selectedDetailLot && selectedDetailLot._id === transferringItem._id) {
        const updatedDetail = balData.find(b => b._id === transferringItem._id);
        setSelectedDetailLot(updatedDetail || null);
        loadLedgerHistory();
      }
    } catch (err: any) {
      console.error(err);
      setTransferError(err.response?.data?.msg || 'Failed to complete stock transfer');
    } finally {
      setTransferSubmitting(false);
      setLoading(false);
    }
  };

  // Helper: Traverse parent chain in memory
  const resolveLocationPath = (locId: string) => {
    const bin = hierarchy.find(l => l._id === locId);
    if (!bin) return { factory: '—', floor: '—', zone: '—', bin: '—' };
    
    const zone = hierarchy.find(l => l._id === bin.parentId);
    const floor = zone ? hierarchy.find(l => l._id === zone.parentId) : null;
    const factory = floor ? hierarchy.find(l => l._id === floor.parentId) : null;
    
    return {
      factory: factory?.name || '—',
      floor: floor?.name || '—',
      zone: zone?.name || '—',
      bin: bin.name || '—'
    };
  };

  // Helper to format Lot number
  const getDisplayLotNo = (b: any) => {
    if (!b) return '—';
    const batchNo = b.batchNumber || 'PB2407001';
    
    // Find the first balance entry for this batch number in this SKU to determine the base lot
    const batchBals = balances.filter(x => x.batchNumber === batchNo && (x.sku?._id || x.skuId) === (b.sku?._id || b.skuId));
    const isInitial = batchBals.length > 0 && batchBals[0]._id === b._id;
    
    const baseLot = `${batchNo}-L01`;
    if (isInitial) return baseLot;
    
    // Extract suffix from location name
    const name = b.location?.name || '';
    const parts = name.split('-');
    const suffix = parts[parts.length - 1]?.trim() || '';
    return suffix ? `${baseLot}-${suffix}` : baseLot;
  };

  // Filters logic
  const filteredBalances = balances.filter(b => {
    const displayLot = getDisplayLotNo(b).toLowerCase();
    const skuName = (b.sku?.name || '').toLowerCase();
    const brand = (b.sku?.brand || '').toLowerCase();
    const category = (b.sku?.category || '').toLowerCase();
    const locationName = (b.location?.name || '').toLowerCase();
    
    const matchesSearch = displayLot.includes(search.toLowerCase()) || 
                          skuName.includes(search.toLowerCase()) || 
                          brand.includes(search.toLowerCase()) ||
                          locationName.includes(search.toLowerCase());

    const matchesCategory = !filterCategory || b.sku?.category === filterCategory;
    const matchesItem = !filterItem || (b.sku?._id || b.skuId) === filterItem;
    const matchesLocation = !filterLocation || (b.location?._id || b.locationId) === filterLocation;
    const matchesStatus = !filterStatus || (filterStatus === 'AVAILABLE' ? (b.onHand || 0) > 0 : filterStatus === 'EXHAUSTED' ? (b.onHand || 0) <= 0 : true);
    
    return matchesSearch && matchesCategory && matchesItem && matchesLocation && matchesStatus;
  });

  const [sortField, setSortField] = useState<string>('lotNo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedBalances = [...filteredBalances].sort((a, b) => {
    let valA: any = '';
    let valB: any = '';

    if (sortField === 'lotNo') {
      valA = getDisplayLotNo(a);
      valB = getDisplayLotNo(b);
    } else if (sortField === 'item') {
      valA = a.sku?.name || '';
      valB = b.sku?.name || '';
    } else if (sortField === 'brand') {
      valA = a.sku?.brand || '';
      valB = b.sku?.brand || '';
    } else if (sortField === 'gsm') {
      valA = a.sku?.gsm || 0;
      valB = b.sku?.gsm || 0;
    } else if (sortField === 'width') {
      valA = a.sku?.width || 0;
      valB = b.sku?.width || 0;
    } else if (sortField === 'reels') {
      valA = a.reels?.length || 0;
      valB = b.reels?.length || 0;
    } else if (sortField === 'availableKg') {
      valA = a.onHand || 0;
      valB = b.onHand || 0;
    } else if (sortField === 'rate') {
      valA = a.sku?.costPrice || 0;
      valB = b.sku?.costPrice || 0;
    } else if (sortField === 'location') {
      valA = a.location?.name || '';
      valB = b.location?.name || '';
    }

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }
    valA = valA.toString().toLowerCase();
    valB = valB.toString().toLowerCase();
    return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });

  const totalPages = Math.max(Math.ceil(sortedBalances.length / limit), 1);
  const paginatedBalances = sortedBalances.slice((page - 1) * limit, page * limit);

  // Stats
  const statTotalLots = balances.length;
  
  const rawMatBalances = balances.filter(b => b.sku?.category === 'Raw Material');
  const statRawMatCount = rawMatBalances.length;
  const statRawMatKg = rawMatBalances.reduce((sum, b) => sum + (b.onHand || 0), 0);

  const semiBalances = balances.filter(b => b.sku?.category === 'Semi Finished');
  const statSemiCount = semiBalances.length;
  const statSemiSheets = semiBalances.reduce((sum, b) => sum + (b.onHand || 0), 0);

  const fgBalances = balances.filter(b => b.sku?.category === 'Finished Goods');
  const statFgCount = fgBalances.length;
  const statFgGbl = fgBalances.reduce((sum, b) => sum + (b.sku?.booksGbl || 0), 0);
  const statFgPcs = fgBalances.reduce((sum, b) => sum + (b.onHand || 0), 0);

  // Selected Lot Details (Tab info or calculations)
  const lotTotalReels = selectedLot ? (selectedLot.reels?.length || (selectedLot.sku?.category === 'Raw Material' ? Math.round(selectedLot.onHand / 290) : 0) || 0) : 0;
  const lotValue = selectedLot ? (selectedLot.onHand * (selectedLot.sku?.price || 68)) : 0;

  // Invoice / Supplier lookup for Selected Lot Details
  const matchedInvoice = selectedLot ? invoices.find(inv => inv.invoiceNumber === selectedLot.batchNumber) : null;
  const supplierName = matchedInvoice && typeof matchedInvoice.vendorId === 'object' && matchedInvoice.vendorId !== null 
    ? (matchedInvoice.vendorId.firmName || matchedInvoice.vendorId.ownerName) 
    : 'Hreemkar Papers';

  return (
    <div className="p-4 sm:p-6 space-y-6 flex-1 w-full relative transition-all duration-300">
      <div className="flex-1 space-y-6 overflow-y-auto">
      {/* ── DETAILS SUB-PAGE (LOT VIEW) ──────────────────────────────────────── */}
      {activeSubPage === 'details' && selectedDetailLot ? (() => {
        const detailsInvoice = invoices.find(inv => inv.invoiceNumber === selectedDetailLot.batchNumber);
        const detailsSupplier = detailsInvoice && typeof detailsInvoice.vendorId === 'object' && detailsInvoice.vendorId !== null 
          ? (detailsInvoice.vendorId.firmName || detailsInvoice.vendorId.ownerName) 
          : 'Hreemkar Papers';
        
        // Sum up total reels & KG originally inwarded for this SKU inside this invoice
        const originalInvoiceItem = detailsInvoice?.items?.find(i => (i.skuId as any)?._id === (selectedDetailLot.sku?._id || selectedDetailLot.skuId) || i.skuId === (selectedDetailLot.sku?._id || selectedDetailLot.skuId));
        const originalQty = originalInvoiceItem ? originalInvoiceItem.quantity : selectedDetailLot.onHand;
        const originalReels = originalInvoiceItem ? (originalInvoiceItem.reels?.length || 8) : 8;

        // Calculate all locations storing this lot
        const lotLocations = balances.filter(b => b.batchNumber === selectedDetailLot.batchNumber && (b.sku?._id || b.skuId) === (selectedDetailLot.sku?._id || selectedDetailLot.skuId));
        const totalLotAvailable = lotLocations.reduce((sum, b) => sum + (b.onHand || 0), 0);
        const totalLotReels = lotLocations.reduce((sum, b) => sum + (b.reels?.length || 0), 0);

        // Progress percentage for Donut
        const usedQty = Math.max(originalQty - totalLotAvailable, 0);
        const availablePercent = Math.round((totalLotAvailable / originalQty) * 100);

        return (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom duration-250">
            {/* Header / Breadcrumb */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <div>
                <div className="flex items-center gap-1 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                  <span>Inventory</span>
                  <ChevronRight className="w-3 h-3" />
                  <span className="cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setActiveSubPage('list')}>Batch Stock / Lots</span>
                  <ChevronRight className="w-3 h-3" />
                  <span className="text-gray-600">Batch No: {getDisplayLotNo(selectedDetailLot)}</span>
                </div>
                <h1 className="text-lg font-black text-gray-900 tracking-tight mt-1 flex items-center gap-2">
                  <Database className="w-4.5 h-4.5 text-blue-600 animate-pulse" />
                  Batch Stock / Lot Details
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white rounded-xl text-xs font-bold shadow-3xs flex items-center gap-1 transition-all"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button
                  onClick={() => setActiveSubPage('list')}
                  className="px-4 py-2 bg-gray-950 text-white hover:bg-gray-800 rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-all"
                >
                  <FileText className="w-3.5 h-3.5" /> Stock Ledger
                </button>
                <button
                  onClick={() => setActiveSubPage('list')}
                  className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold shadow-3xs flex items-center gap-1 transition-all"
                >
                  More Actions <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Top Info Banner Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 grid grid-cols-2 md:grid-cols-7 gap-4 items-center">
              <div className="flex items-center gap-3 col-span-2">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shrink-0">
                  <Package className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-gray-900 truncate">{selectedDetailLot.sku?.name}</h2>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 block">
                    Brand: {selectedDetailLot.sku?.brand || 'BILT'} | GSM: {selectedDetailLot.sku?.gsm || 52} | Width: {selectedDetailLot.sku?.width || 64} cm
                  </span>
                </div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Reels</span>
                <span className="text-sm font-bold text-gray-900 block">{originalReels}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total KG</span>
                <span className="text-sm font-bold text-gray-900 block">{originalQty.toLocaleString()} KG</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Available KG</span>
                <span className="text-sm font-semibold text-green-600 block">{totalLotAvailable.toLocaleString()} KG</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Rate / KG</span>
                <span className="text-sm font-bold text-gray-950 block">₹{(selectedDetailLot.sku?.price || 68.00).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Lot Value (Available)</span>
                <span className="text-sm font-semibold text-green-700 block">₹{(totalLotAvailable * (selectedDetailLot.sku?.price || 68.00)).toLocaleString()}</span>
              </div>
            </div>

            {/* Split Page Details */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column (2/3 width) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Lot Information */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4 text-xs font-semibold text-gray-700">
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider border-b pb-2">
                    Lot Information
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3.5 gap-x-4">
                    <div className="flex justify-between border-b border-gray-50 pb-1.5">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Source Batch:</span>
                      <span className="text-gray-950 font-bold">{selectedDetailLot.batchNumber}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-50 pb-1.5">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Supplier:</span>
                      <span className="text-gray-950 font-bold">{detailsSupplier}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-50 pb-1.5">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Purchase Date:</span>
                      <span className="text-gray-950 font-bold">
                        {detailsInvoice?.createdAt ? new Date(detailsInvoice.createdAt).toLocaleDateString('en-IN') : '01/07/2024'}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-gray-50 pb-1.5">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Inward Date:</span>
                      <span className="text-gray-950 font-bold">
                        {detailsInvoice?.createdAt ? new Date(detailsInvoice.createdAt).toLocaleDateString('en-IN') : '01/07/2024'}
                      </span>
                    </div>
                    <div className="flex justify-between col-span-2">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Remarks:</span>
                      <span className="text-gray-800 italic">Maplitho paper reels received.</span>
                    </div>
                  </div>
                </div>

                {/* Recent Transactions (This Lot) */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider border-b pb-2">
                    Recent Transactions (This Lot)
                  </h3>
                  
                  <div className="overflow-x-auto border border-gray-100 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 uppercase font-black border-b border-gray-200 text-[9px]">
                          <th className="px-4 py-3">Date & Time</th>
                          <th className="px-4 py-3 text-center">Type</th>
                          <th className="px-4 py-3">Reference / Purpose</th>
                          <th className="px-4 py-3 text-center">Reels</th>
                          <th className="px-4 py-3 text-right">KG In</th>
                          <th className="px-4 py-3 text-right">KG Out</th>
                          <th className="px-4 py-3 text-right">Available KG</th>
                          <th className="px-4 py-3">Location</th>
                          <th className="px-4 py-3">By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-gray-700 font-semibold">
                        {ledgerLoading ? (
                          <tr>
                            <td colSpan={9} className="text-center py-10">
                              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600" />
                            </td>
                          </tr>
                        ) : ledgerHistory.length > 0 ? (
                          ledgerHistory.map((h, idx) => {
                            const typeColor = h.transactionType === 'Purchase' ? 'bg-green-50 text-green-700 border-green-200' :
                                              h.transactionType === 'Transfer' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                              'bg-purple-50 text-purple-700 border-purple-200';
                             
                             return (
                               <tr key={idx} className="hover:bg-gray-50/50">
                                <td className="px-4 py-3 text-gray-500">
                                  {h.createdAt ? new Date(h.createdAt).toLocaleDateString('en-IN') : '01/07/2024'}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded border ${typeColor}`}>
                                    {h.transactionType}
                                  </span>
                                </td>
                                <td className="px-4 py-3 truncate max-w-xs">{h.remarks || h.referenceId}</td>
                                <td className="px-4 py-3 text-center">{h.reels?.length || '—'}</td>
                                <td className="px-4 py-3 text-right font-semibold text-green-600">{h.qtyIn ? h.qtyIn.toLocaleString() : '—'}</td>
                                <td className="px-4 py-3 text-right font-semibold text-red-600">{h.qtyOut ? h.qtyOut.toLocaleString() : '—'}</td>
                                <td className="px-4 py-3 text-right font-bold text-gray-900">{h.balanceAfter ? h.balanceAfter.toLocaleString() : '—'}</td>
                                <td className="px-4 py-3 text-blue-600 font-bold">{h.locationId?.name || 'Storage'}</td>
                                <td className="px-4 py-3 text-gray-500">Admin</td>
                              </tr>
                            );
                          })
                        ) : (
                          <>
                            {/* Dummy records mimicking Screenshot 5 */}
                            <tr className="hover:bg-gray-50/50">
                              <td className="px-4 py-3 text-gray-500">01/07/2024 10:15 AM</td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-[8px] font-bold uppercase px-2 py-0.5 rounded border bg-green-50 text-green-700 border-green-200">
                                  INWARD
                                </span>
                              </td>
                              <td className="px-4 py-3">Purchase Inward ({selectedDetailLot.batchNumber})</td>
                              <td className="px-4 py-3 text-center">8</td>
                              <td className="px-4 py-3 text-right font-semibold text-green-600">2,350</td>
                              <td className="px-4 py-3 text-right text-gray-400">—</td>
                              <td className="px-4 py-3 text-right font-bold text-gray-900">2,350</td>
                              <td className="px-4 py-3 text-blue-600 font-bold">Outdoor A - A1</td>
                              <td className="px-4 py-3 text-gray-500">Admin</td>
                            </tr>
                            <tr className="hover:bg-gray-50/50">
                              <td className="px-4 py-3 text-gray-500">02/07/2024 09:30 AM</td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-[8px] font-bold uppercase px-2 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                                  MOVE
                                </span>
                              </td>
                              <td className="px-4 py-3">Move to A2</td>
                              <td className="px-4 py-3 text-center">—</td>
                              <td className="px-4 py-3 text-right text-gray-400">—</td>
                              <td className="px-4 py-3 text-right font-semibold text-red-600">950</td>
                              <td className="px-4 py-3 text-right font-bold text-gray-900">1,400</td>
                              <td className="px-4 py-3 text-blue-600 font-bold">Outdoor A - A1</td>
                              <td className="px-4 py-3 text-gray-500">Warehouse</td>
                            </tr>
                            <tr className="hover:bg-gray-50/50">
                              <td className="px-4 py-3 text-gray-500">02/07/2024 09:35 AM</td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-[8px] font-bold uppercase px-2 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                                  MOVE
                                </span>
                              </td>
                              <td className="px-4 py-3">Move from A1 to A2</td>
                              <td className="px-4 py-3 text-center">—</td>
                              <td className="px-4 py-3 text-right font-semibold text-green-600">950</td>
                              <td className="px-4 py-3 text-right text-gray-400">—</td>
                              <td className="px-4 py-3 text-right font-bold text-gray-900">950</td>
                              <td className="px-4 py-3 text-blue-600 font-bold">Outdoor A - A2</td>
                              <td className="px-4 py-3 text-gray-500">Warehouse</td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-center">
                    <button
                      onClick={() => setActiveSubPage('list')}
                      className="px-4 py-2 border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-bold text-blue-600 transition-colors shadow-3xs flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" /> View Full Ledger
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column (1/3 width) */}
              <div className="lg:col-span-1 space-y-6">
                {/* Stock in Locations */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-4">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider border-b pb-2">
                    Stock in Locations
                  </h3>
                  <div className="overflow-x-auto border border-gray-100 rounded-xl text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 font-bold uppercase border-b border-gray-200 text-[9px]">
                          <th className="px-4 py-2.5">Location</th>
                          <th className="px-4 py-2.5 text-center">Reels</th>
                          <th className="px-4 py-2.5 text-right">KG</th>
                          <th className="px-4 py-2.5 text-right">Available KG</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-gray-700 font-semibold">
                        {lotLocations.map((b, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="px-4 py-2.5 text-blue-600 font-bold">{b.location?.name || '—'}</td>
                            <td className="px-4 py-2.5 text-center">{b.reels?.length || '—'}</td>
                            <td className="px-4 py-2.5 text-right">{(b.onHand || 0).toLocaleString()} KG</td>
                            <td className="px-4 py-2.5 text-right font-bold text-green-600">{(b.onHand || 0).toLocaleString()} KG</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Lot Availability Progress Card */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 text-center space-y-4">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider border-b pb-2 text-left">
                    Lot Availability
                  </h3>
                  
                  {/* Visual Circle Donut Progress */}
                  <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-gray-100"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-green-600"
                        strokeDasharray={`${availablePercent}, 100`}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-base font-bold text-gray-900">{totalLotAvailable.toLocaleString()}</span>
                      <span className="text-[9px] font-bold text-gray-400 uppercase">Available KG</span>
                    </div>
                  </div>

                  <div className="flex justify-center gap-6 text-[10px] font-black uppercase text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 bg-green-600 rounded-full" />
                      <span>Available ({totalLotAvailable.toLocaleString()} KG)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 bg-gray-300 rounded-full" />
                      <span>Used ({usedQty.toLocaleString()} KG)</span>
                    </div>
                  </div>
                </div>

                {/* Actions list */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3 text-xs font-semibold text-gray-700">
                  <button
                    onClick={() => handleOpenTransferModal(selectedDetailLot)}
                    className="w-full py-2.5 border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-3xs flex items-center justify-center gap-2"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600" /> Move Stock
                  </button>
                  <button
                    className="w-full py-2.5 border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-3xs flex items-center justify-center gap-2"
                  >
                    <Layers className="w-3.5 h-3.5 text-purple-600" /> Convert / Use Stock
                  </button>
                  <button
                    className="w-full py-2.5 border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-3xs flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-amber-500" /> Lot History
                  </button>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-50/50 p-4 border border-blue-150 rounded-2xl text-[10px] font-bold text-blue-700 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>We do not maintain reel numbers. Stock is tracked by lot, reels count and KG.</span>
            </div>
          </div>
        );
      })() : (
        /* ── MAIN LIST VIEW ──────────────────────────────────── */
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Top Bar with Navigation Back link and user profile pill */}
          <div className="flex items-center justify-between">
            <div 
              className="flex items-center space-x-1.5 text-gray-500 hover:text-gray-900 cursor-pointer transition-colors" 
              onClick={() => navigate(-1)}
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm font-semibold">Back</span>
            </div>
            
            <div className="flex items-center space-x-2 text-gray-700 bg-gray-50 border border-gray-150 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-2xs">
              <div className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                <User className="w-3 h-3" />
              </div>
              <span>SKBW Admin</span>
            </div>
          </div>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-1">
            <div>
              <h1 className="text-2xl font-bold text-gray-905 tracking-tight">Stock</h1>
              <p className="text-sm text-gray-500 mt-1">Live inventory by lot / batch and location</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <button
                onClick={() => loadData()}
                className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl transition-all font-medium text-xs shadow-xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
                <span>Reload</span>
              </button>
              <button
                className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl transition-all font-medium text-xs shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-gray-500" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
              <button
                className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all font-semibold text-xs shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Stock Entry</span>
                <kbd className="hidden md:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono font-bold text-blue-100 bg-blue-800 rounded border border-blue-700 shadow-xs select-none pointer-events-none">Alt/Opt+C</kbd>
              </button>
            </div>
          </div>

          {/* Top 4 Interactive Customer-Style Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <button
              onClick={() => { setFilterCategory(''); setPage(1); }}
              className={`w-full text-left rounded-xl border p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
                filterCategory === '' 
                  ? 'bg-blue-50/50 border-blue-200 ring-1 ring-blue-100 shadow-2xs' 
                  : 'bg-white border-gray-200 border-l-4 border-l-blue-500 hover:shadow-xs'
              }`}
            >
              <div>
                <p className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${filterCategory === '' ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-500'}`}>Total Lots</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">{statTotalLots}</p>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5">Across all categories</p>
              </div>
            </button>

            <button
              onClick={() => { setFilterCategory('Raw Material'); setPage(1); }}
              className={`w-full text-left rounded-xl border p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
                filterCategory === 'Raw Material' 
                  ? 'bg-amber-50/50 border-amber-200 ring-1 ring-amber-100 shadow-2xs' 
                  : 'bg-white border-gray-200 border-l-4 border-l-amber-500 hover:shadow-xs'
              }`}
            >
              <div>
                <p className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${filterCategory === 'Raw Material' ? 'text-amber-600' : 'text-gray-400 group-hover:text-amber-500'}`}>Raw Materials</p>
                <p className="text-2xl font-extrabold text-amber-600 mt-1">{statRawMatCount}</p>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5">{statRawMatKg.toLocaleString('en-IN')} KG</p>
              </div>
            </button>

            <button
              onClick={() => { setFilterCategory('Semi Finished'); setPage(1); }}
              className={`w-full text-left rounded-xl border p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
                filterCategory === 'Semi Finished' 
                  ? 'bg-purple-50/50 border-purple-200 ring-1 ring-purple-100 shadow-2xs' 
                  : 'bg-white border-gray-200 border-l-4 border-l-purple-500 hover:shadow-xs'
              }`}
            >
              <div>
                <p className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${filterCategory === 'Semi Finished' ? 'text-purple-600' : 'text-gray-400 group-hover:text-purple-500'}`}>Semi-Finished</p>
                <p className="text-2xl font-extrabold text-purple-600 mt-1">{statSemiCount}</p>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5">{statSemiSheets.toLocaleString('en-IN')} Sheets</p>
              </div>
            </button>

            <button
              onClick={() => { setFilterCategory('Finished Goods'); setPage(1); }}
              className={`w-full text-left rounded-xl border p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
                filterCategory === 'Finished Goods' 
                  ? 'bg-emerald-50/50 border-emerald-200 ring-1 ring-emerald-100 shadow-2xs' 
                  : 'bg-white border-gray-200 border-l-4 border-l-emerald-500 hover:shadow-xs'
              }`}
            >
              <div>
                <p className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${filterCategory === 'Finished Goods' ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-500'}`}>Finished Goods</p>
                <p className="text-2xl font-extrabold text-emerald-600 mt-1">{statFgCount}</p>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5">{statFgGbl > 0 ? `${statFgGbl} GBL / ` : ''}{statFgPcs.toLocaleString('en-IN')} PCS</p>
              </div>
            </button>
          </div>

          {/* Filter / Search Bar */}
          <div className="bg-white rounded-xl shadow-2xs border border-gray-150 p-3 mb-4 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex-1 w-full relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by Lot No, Item, Brand, GSM, Width..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors text-gray-900"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <select
                value={filterCategory}
                onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
                className="w-full sm:w-36 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
              >
                <option value="">All Categories</option>
                <option value="Raw Material">Raw Material</option>
                <option value="Semi Finished">Semi Finished</option>
                <option value="Finished Goods">Finished Goods</option>
              </select>

              <select
                value={filterItem}
                onChange={e => { setFilterItem(e.target.value); setPage(1); }}
                className="w-full sm:w-36 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
              >
                <option value="">All Items</option>
                {Array.from(new Set(balances.map(b => b.sku?._id || b.skuId))).map(id => {
                  const sku = balances.find(b => (b.sku?._id || b.skuId) === id)?.sku;
                  return <option key={id} value={id}>{sku?.name || 'Item'}</option>;
                })}
              </select>

              <select
                value={filterLocation}
                onChange={e => { setFilterLocation(e.target.value); setPage(1); }}
                className="w-full sm:w-36 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
              >
                <option value="">All Locations</option>
                {hierarchy.filter(h => h.level === 'Storage Location').map(loc => (
                  <option key={loc._id} value={loc._id}>{loc.name}</option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                className="w-full sm:w-32 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
              >
                <option value="">All Status</option>
                <option value="AVAILABLE">Available</option>
                <option value="EXHAUSTED">Exhausted</option>
              </select>

              <button
                className="px-3.5 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white rounded-lg text-xs font-semibold shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-blue-600" /> Filters
              </button>
            </div>
          </div>

          {/* Full Width Table Container */}
          <div className="bg-white rounded-xl border border-gray-150 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50/70 text-gray-500 uppercase font-bold border-b border-gray-200 text-[10px] select-none tracking-wider">
                    {[
                      { label: 'LOT NO.', key: 'lotNo', align: 'text-left', extraClass: 'pl-6 pr-4' },
                      { label: 'ITEM', key: 'item', align: 'text-left', extraClass: 'px-4' },
                      { label: 'BRAND', key: 'brand', align: 'text-left', extraClass: 'px-4' },
                      { label: 'GSM', key: 'gsm', align: 'text-center', extraClass: 'px-4' },
                      { label: 'SIZE / WIDTH', key: 'width', align: 'text-center', extraClass: 'px-4' },
                      { label: 'UNIT', key: 'unit', align: 'text-center', extraClass: 'px-4' },
                      { label: 'AVAILABLE', key: 'availableKg', align: 'text-right', extraClass: 'px-4' },
                      { label: 'LOCATION', key: 'location', align: 'text-left', extraClass: 'px-4' }
                    ].map(col => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className={`py-3.5 ${col.extraClass} ${col.align} cursor-pointer hover:bg-gray-100/60 transition-colors align-middle`}
                      >
                        <div className={`flex items-center space-x-1 ${col.align === 'text-center' ? 'justify-center' : col.align === 'text-right' ? 'justify-end' : ''}`}>
                          <span>{col.label}</span>
                          {sortField === col.key ? (
                            sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline text-blue-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 inline text-gray-300 opacity-40 hover:opacity-100" />
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="px-4 py-3.5 text-center align-middle">STATUS</th>
                    <th className="pl-4 pr-6 py-3.5 text-center align-middle">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700 text-xs">
                  {paginatedBalances.map((b, idx) => {
                    const displayLot = getDisplayLotNo(b);
                    const isSelected = selectedLot && (
                      selectedLot._id === b._id || 
                      (selectedLot.batchNumber === b.batchNumber && 
                       (selectedLot.sku?._id || selectedLot.skuId) === (b.sku?._id || b.skuId) && 
                       (selectedLot.location?._id || selectedLot.locationId) === (b.location?._id || b.locationId))
                    );
                    
                    const isExhausted = (b.onHand || 0) <= 0;
                    const isPartial = (b.onHand || 0) > 0 && (b.onHand || 0) < 100;

                    return (
                      <tr 
                        key={`${b.sku?._id || b.skuId}-${b.location?._id || b.locationId}-${b.batchNumber}-${idx}`} 
                        className={`hover:bg-blue-50/20 transition-colors cursor-pointer border-b border-gray-100 ${
                          isSelected ? 'bg-blue-50/50' : ''
                        }`}
                        onClick={() => {
                          setSelectedLot(b);
                          setSelectedDetailLot(b);
                          setShowLotDrawer(true);
                        }}
                      >
                        <td className="pl-6 pr-4 py-3.5 align-middle font-bold text-blue-600 text-xs whitespace-nowrap">
                          {displayLot}
                          <span className="text-[10px] text-gray-400 font-normal block mt-0.5">
                            {b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '10 Aug 2026'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 align-middle font-semibold text-gray-900 whitespace-nowrap">
                          <p className="leading-tight">{formatSkuName(b.sku?.name || 'Raw Material')}</p>
                          <p className="text-[10px] text-gray-400 font-normal mt-0.5">{b.sku?.category || 'Raw Material'}</p>
                        </td>
                        <td className="px-4 py-3.5 align-middle text-gray-700 font-medium">{b.sku?.brand || 'BILT'}</td>
                        <td className="px-4 py-3.5 align-middle text-center font-medium text-gray-700">{b.sku?.gsm || '52'}</td>
                        <td className="px-4 py-3.5 align-middle text-center font-medium text-gray-700">
                          {b.sku?.width ? `${b.sku.width} cm` : '57 cm'}
                        </td>
                        <td className="px-4 py-3.5 align-middle text-center font-medium text-gray-700">
                          {b.sku?.paperType === 'Sheets' ? 'Reams' : 'Reels'}
                        </td>
                        <td className="px-4 py-3.5 align-middle text-right font-bold">
                          <span className={isExhausted ? 'text-red-600' : isPartial ? 'text-amber-600' : 'text-emerald-600'}>
                            {(b.onHand || 0).toLocaleString('en-IN')} {b.sku?.unit || 'KG'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 align-middle text-left">
                          <span className="font-semibold text-gray-800 text-xs block">{b.location?.name || 'Asha'} &gt;</span>
                          <span className="text-[10px] text-gray-400 font-normal block mt-0.5">
                            {b.location?.parentId ? 'Multiple Locations' : 'Rack 1'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 align-middle text-center">
                          <span className={`inline-flex items-center justify-center text-[9.5px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border leading-none ${
                            isExhausted ? 'bg-red-50 text-red-700 border-red-200' :
                            isPartial ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {isExhausted ? 'EXHAUSTED' : isPartial ? 'PARTIAL' : 'AVAILABLE'}
                          </span>
                        </td>
                        <td className="pl-4 pr-6 py-3.5 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedLot(b);
                                setSelectedDetailLot(b);
                                setShowLotDrawer(true);
                              }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-100 transition-colors"
                              title="View Lot details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenTransferModal(b)}
                              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                              title="More actions"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {paginatedBalances.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center py-16 text-gray-400 italic font-medium">
                        No stock balances match your current search/filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-3.5 border-t border-gray-100 text-xs font-semibold text-gray-500 gap-3">
              <span>Showing {paginatedBalances.length > 0 ? (page - 1) * limit + 1 : 0} to {Math.min(page * limit, sortedBalances.length)} of {sortedBalances.length} lots</span>
              
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 font-bold text-gray-600 transition-colors"
                >
                  &lt;
                </button>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1 rounded-lg font-bold text-xs transition-colors ${
                      page === p 
                        ? 'bg-blue-600 text-white shadow-3xs' 
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}

                <button
                  onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                  disabled={page === totalPages}
                  className="px-2.5 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 font-bold text-gray-600 transition-colors"
                >
                  &gt;
                </button>
              </div>
            </div>
          </div>

          {/* LOT DETAILS SIDE DRAWER */}
          <Drawer
            isOpen={showLotDrawer && !!selectedLot}
            onClose={() => setShowLotDrawer(false)}
            size="max-w-xl"
            title={
              <div>
                <h2 className="text-base font-bold text-gray-900">Lot Details</h2>
              </div>
            }
          >
            {selectedLot && (() => {
              const displayLot = getDisplayLotNo(selectedLot);
              const isExhausted = (selectedLot.onHand || 0) <= 0;
              const isPartial = (selectedLot.onHand || 0) > 0 && (selectedLot.onHand || 0) < 100;
              const reelsCount = selectedLot.reels?.length || (selectedLot.sku?.category === 'Raw Material' ? Math.round(selectedLot.onHand / 290) : 0) || 3;
              const originalWeight = selectedLot.onHand + 50;

              return (
                <div className="flex flex-col h-full overflow-hidden bg-white text-xs">
                  <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Top Lot Title Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-black text-blue-600 font-mono tracking-tight">{displayLot}</span>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-md font-black uppercase tracking-wider border ${
                          isExhausted ? 'bg-red-50 text-red-700 border-red-200' :
                          isPartial ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {isExhausted ? 'EXHAUSTED' : isPartial ? 'PARTIAL' : 'AVAILABLE'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-bold text-gray-800">
                        <span>{formatSkuName(selectedLot.sku?.name || 'Maplitho Reel 52 GSM 57 cm')}</span>
                        <span className="text-gray-400 uppercase text-[11px]">{selectedLot.sku?.brand || 'BILT'}</span>
                      </div>
                    </div>

                    {/* 6-Grid Summary Specs Box */}
                    <div className="bg-gray-50/70 border border-gray-200/80 rounded-2xl p-4 grid grid-cols-3 gap-y-3 gap-x-4">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Purchased On</span>
                        <span className="text-xs font-bold text-gray-900 mt-0.5 block">
                          {selectedLot.createdAt ? new Date(selectedLot.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '10 Aug 2026'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Total Reels</span>
                        <span className="text-xs font-bold text-gray-900 mt-0.5 block">{reelsCount}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Original Weight</span>
                        <span className="text-xs font-bold text-gray-900 mt-0.5 block">{originalWeight} KG</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Available Weight</span>
                        <span className="text-xs font-black text-emerald-600 mt-0.5 block">{(selectedLot.onHand || 0).toLocaleString()} KG</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Rate / KG</span>
                        <span className="text-xs font-bold text-gray-900 mt-0.5 block">₹{(selectedLot.sku?.price || 50.00).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Lot Value (Material)</span>
                        <span className="text-xs font-bold text-gray-900 mt-0.5 block">₹{((selectedLot.onHand || 0) * (selectedLot.sku?.price || 50)).toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-4 border-b border-gray-200 text-xs font-bold pb-px">
                      <button
                        onClick={() => setDrawerTab('reels')}
                        className={`pb-2 border-b-2 transition-colors ${drawerTab === 'reels' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                      >
                        Reels &amp; Locations
                      </button>
                      <button
                        onClick={() => setDrawerTab('movements')}
                        className={`pb-2 border-b-2 transition-colors ${drawerTab === 'movements' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                      >
                        Movements
                      </button>
                      <button
                        onClick={() => setDrawerTab('cost')}
                        className={`pb-2 border-b-2 transition-colors ${drawerTab === 'cost' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                      >
                        Origin &amp; Cost
                      </button>
                      <button
                        onClick={() => setDrawerTab('notes')}
                        className={`pb-2 border-b-2 transition-colors ${drawerTab === 'notes' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                      >
                        Notes
                      </button>
                    </div>

                    {/* Reels in this Lot section */}
                    {drawerTab === 'reels' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-900">Reels in this Lot</span>
                          <button
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition-colors flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add Reel
                          </button>
                        </div>

                        {/* Reels Mini Table */}
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-[11px] border-collapse">
                            <thead>
                              <tr className="bg-gray-50/80 text-gray-400 uppercase font-black border-b border-gray-200 text-[9px]">
                                <th className="px-3 py-2">REEL</th>
                                <th className="px-3 py-2 text-center">WEIGHT (KG)</th>
                                <th className="px-3 py-2 text-center">WIDTH (CM)</th>
                                <th className="px-3 py-2">LOCATION</th>
                                <th className="px-3 py-2 text-right">AVAILABLE (KG)</th>
                                <th className="px-3 py-2 text-center">STATUS</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
                              <tr className="hover:bg-gray-50/50">
                                <td className="px-3 py-2 font-bold text-gray-900">R-1</td>
                                <td className="px-3 py-2 text-center">200</td>
                                <td className="px-3 py-2 text-center">57</td>
                                <td className="px-3 py-2">Asha &gt; Lower Left Rack</td>
                                <td className="px-3 py-2 text-right font-black text-emerald-600">200</td>
                                <td className="px-3 py-2 text-center">
                                  <span className="text-[8.5px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-black uppercase">AVAILABLE</span>
                                </td>
                              </tr>
                              <tr className="hover:bg-gray-50/50">
                                <td className="px-3 py-2 font-bold text-gray-900">R-2</td>
                                <td className="px-3 py-2 text-center">70</td>
                                <td className="px-3 py-2 text-center">58</td>
                                <td className="px-3 py-2">Murali &gt; Top Rack</td>
                                <td className="px-3 py-2 text-right font-black text-emerald-600">70</td>
                                <td className="px-3 py-2 text-center">
                                  <span className="text-[8.5px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-black uppercase">AVAILABLE</span>
                                </td>
                              </tr>
                              <tr className="hover:bg-gray-50/50">
                                <td className="px-3 py-2 font-bold text-gray-900">R-3</td>
                                <td className="px-3 py-2 text-center">30</td>
                                <td className="px-3 py-2 text-center">57</td>
                                <td className="px-3 py-2">Asha &gt; Upper Left Rack</td>
                                <td className="px-3 py-2 text-right font-black text-emerald-600">30</td>
                                <td className="px-3 py-2 text-center">
                                  <span className="text-[8.5px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-black uppercase">AVAILABLE</span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Location Summary Section */}
                        <div className="space-y-2 pt-2">
                          <h4 className="text-[11px] font-bold text-gray-800">Location Summary (By Weight)</h4>
                          <div className="space-y-1.5 text-[11px] font-medium text-gray-700">
                            <div className="flex justify-between items-center py-1 border-b border-gray-100">
                              <span className="font-bold text-gray-800">Asha &gt; Lower Left Rack</span>
                              <span className="font-black text-gray-900">200 KG</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-gray-100">
                              <span className="font-bold text-gray-800">Asha &gt; Upper Left Rack</span>
                              <span className="font-black text-gray-900">30 KG</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-gray-100">
                              <span className="font-bold text-gray-800">Murali &gt; Top Rack</span>
                              <span className="font-black text-gray-900">70 KG</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 font-bold">
                              <span className="text-gray-500">Total Available</span>
                              <span className="text-emerald-600 font-black text-xs">{(selectedLot.onHand || 300).toLocaleString()} KG</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bottom Lot History Button */}
                  <div className="p-4 border-t border-gray-200 bg-gray-50/50">
                    <button
                      onClick={() => {
                        setSelectedDetailLot(selectedLot);
                        setActiveSubPage('details');
                        setShowLotDrawer(false);
                      }}
                      className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-xl text-xs font-bold transition-all shadow-3xs flex items-center justify-center gap-2"
                    >
                      <Eye className="w-3.5 h-3.5" /> View Full Lot History
                    </button>
                  </div>
                </div>
              );
            })()}
          </Drawer>
        </div>
      )}

      {/* ── TRANSFER STOCK DIALOG MODAL ──────────────────────────────────────── */}
      {showTransferModal && transferringItem && (() => {
        const destLocs = hierarchy.filter(
          loc => loc.level === 'Storage Location' && 
                 loc._id !== (transferringItem.location?._id || transferringItem.locationId)
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/45 backdrop-blur-3xs" onClick={() => !transferSubmitting && setShowTransferModal(false)} />

            <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-md w-full relative z-10 animate-in zoom-in-95 duration-150 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-blue-600 animate-pulse" />
                  Move Stock / Lot Transfer
                </h2>
                <button
                  disabled={transferSubmitting}
                  onClick={() => setShowTransferModal(false)}
                  className="p-1.5 hover:bg-gray-150 rounded-lg transition-colors text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleTransferSubmit} className="p-6 space-y-4 text-left text-xs">
                {transferError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-700 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{transferError}</span>
                  </div>
                )}

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold uppercase">Material:</span>
                    <span className="font-bold text-gray-900">{transferringItem.sku?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold uppercase">Lot Number:</span>
                    <span className="font-bold text-blue-600 font-mono">{getDisplayLotNo(transferringItem)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold uppercase">Current Location:</span>
                    <span className="font-bold text-gray-900">{transferringItem.location?.name || 'Storage'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold uppercase">Available stock:</span>
                    <span className="font-black text-gray-900 font-mono">
                      {(transferringItem.onHand || 0).toLocaleString()} {transferringItem.sku?.unit || 'kg'}
                    </span>
                  </div>
                </div>

                <div className="space-y-3.5">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Destination Storage Location *</label>
                    <select
                      value={transferForm.toLocationId}
                      onChange={e => setTransferForm({ ...transferForm, toLocationId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                      required
                      disabled={transferSubmitting}
                    >
                      <option value="">-- Choose Storage Bin --</option>
                      {destLocs.map(loc => {
                        const occupied = getOccupiedCapacity(loc._id || '');
                        const available = loc.capacity ? Math.max(loc.capacity - occupied, 0) : null;
                        const hasSpace = available === null || available > 0;
                        return (
                          <option 
                            key={loc._id} 
                            value={loc._id}
                            disabled={!hasSpace}
                            className={!hasSpace ? "text-gray-400 italic" : "text-gray-800 font-semibold"}
                          >
                            {loc.name} {available !== null ? `(Available: ${available.toLocaleString()} / ${loc.capacity.toLocaleString()} ${loc.unit || 'kg'})` : '(Unlimited Capacity)'}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Quantity to Transfer *</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        max={transferringItem.onHand}
                        value={transferForm.quantity}
                        onChange={e => setTransferForm({ ...transferForm, quantity: e.target.value })}
                        className="w-full pl-3 pr-12 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 font-mono font-bold text-gray-900"
                        required
                        disabled={transferSubmitting}
                      />
                      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[10px] font-black text-gray-400 uppercase font-mono">
                        {transferringItem.sku?.unit || 'kg'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Remarks / Notes</label>
                    <input
                      type="text"
                      placeholder="Optional transfer description"
                      value={transferForm.remarks}
                      onChange={e => setTransferForm({ ...transferForm, remarks: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                      disabled={transferSubmitting}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-150 flex justify-end gap-3">
                  <button
                    type="button"
                    disabled={transferSubmitting}
                    onClick={() => setShowTransferModal(false)}
                    className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 bg-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={transferSubmitting}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {transferSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Moving...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-3.5 h-3.5" /> Confirm Transfer
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
    </div>
  );
};

export default BatchStockV2;

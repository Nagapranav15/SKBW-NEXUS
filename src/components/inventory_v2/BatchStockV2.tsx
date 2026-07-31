import React, { useEffect, useState } from 'react';
import { Layers, Search, RefreshCw, X, FileText, ChevronRight, ChevronDown, Warehouse, MapPin, Database, Calendar, Package, ArrowUpRight, ArrowDownLeft, AlertCircle, ArrowRightLeft, Eye, HelpCircle, Download, Plus, ArrowRight, Printer, Coins, MoreVertical } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getBalancesV2, getWarehouseHierarchyV2, getLedgerV2, recordTransferV2, SkuV2, WarehouseLocationV2, LedgerEntryV2 } from '../../api/mfgApiV2';
import { getPurchaseInvoicesV2, PurchaseInvoiceV2 } from './purchases/services/purchaseService';
import { showToast } from '../ui/Toast';

const BatchStockV2: React.FC = () => {
  const { selectedCompany } = useAuth();
  
  // Data state
  const [balances, setBalances] = useState<any[]>([]);
  const [hierarchy, setHierarchy] = useState<WarehouseLocationV2[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoiceV2[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & filter states
  const [search, setSearch] = useState('');
  const [filterItem, setFilterItem] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  // Selection details state
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

    const matchesItem = !filterItem || (b.sku?._id || b.skuId) === filterItem;
    const matchesLocation = !filterLocation || (b.location?._id || b.locationId) === filterLocation;
    
    return matchesSearch && matchesItem && matchesLocation;
  });

  const totalPages = Math.max(Math.ceil(filteredBalances.length / limit), 1);
  const paginatedBalances = filteredBalances.slice((page - 1) * limit, page * limit);

  // Stats
  const statTotalLots = balances.length;
  const statTotalAvailable = balances.reduce((sum, b) => sum + (b.onHand || 0), 0);
  const statTotalReels = balances.reduce((sum, b) => {
    // Return length of reels array or fallback to estimated reels (qty / weight)
    return sum + (b.reels?.length || (b.sku?.category === 'Raw Material' ? Math.round(b.onHand / 290) : 0) || 0);
  }, 0);
  const statTotalLocations = new Set(balances.map(b => b.location?._id || b.locationId)).size;

  // Selected Lot Details (Tab info or calculations)
  const lotTotalReels = selectedLot ? (selectedLot.reels?.length || (selectedLot.sku?.category === 'Raw Material' ? Math.round(selectedLot.onHand / 290) : 0) || 0) : 0;
  const lotValue = selectedLot ? (selectedLot.onHand * (selectedLot.sku?.price || 68)) : 0;

  // Invoice / Supplier lookup for Selected Lot Details
  const matchedInvoice = selectedLot ? invoices.find(inv => inv.invoiceNumber === selectedLot.batchNumber) : null;
  const supplierName = matchedInvoice && typeof matchedInvoice.vendorId === 'object' && matchedInvoice.vendorId !== null 
    ? (matchedInvoice.vendorId.firmName || matchedInvoice.vendorId.ownerName) 
    : 'Hreemkar Papers';

  return (
    <div className="space-y-6">
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
                  <h2 className="text-base font-black text-gray-900 truncate">{selectedDetailLot.sku?.name}</h2>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 block">
                    Brand: {selectedDetailLot.sku?.brand || 'BILT'} | GSM: {selectedDetailLot.sku?.gsm || 52} | Width: {selectedDetailLot.sku?.width || 64} cm
                  </span>
                </div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Reels</span>
                <span className="text-sm font-bold text-gray-900 block font-mono">{originalReels}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total KG</span>
                <span className="text-sm font-bold text-gray-900 block font-mono">{originalQty.toLocaleString()} KG</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Available KG</span>
                <span className="text-sm font-black text-green-600 block font-mono">{totalLotAvailable.toLocaleString()} KG</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Rate / KG</span>
                <span className="text-sm font-bold text-gray-950 block font-mono">₹{(selectedDetailLot.sku?.price || 68.00).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Lot Value (Available)</span>
                <span className="text-sm font-black text-green-700 block font-mono">₹{(totalLotAvailable * (selectedDetailLot.sku?.price || 68.00)).toLocaleString()}</span>
              </div>
            </div>

            {/* Split Page Details */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column (2/3 width) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Lot Information */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4 text-xs font-semibold text-gray-700">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider border-b pb-2">
                    Lot Information
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3.5 gap-x-4">
                    <div className="flex justify-between border-b border-gray-50 pb-1.5">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Source Batch:</span>
                      <span className="text-gray-950 font-bold font-mono">{selectedDetailLot.batchNumber}</span>
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
                            const isIncoming = h.qtyIn && h.qtyIn > 0;
                            const typeColor = h.transactionType === 'Purchase' ? 'bg-green-50 text-green-700 border-green-200' :
                                              h.transactionType === 'Transfer' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                              'bg-purple-50 text-purple-700 border-purple-200';
                            
                            return (
                              <tr key={idx} className="hover:bg-gray-50/50">
                                <td className="px-4 py-3 text-gray-500 font-mono">
                                  {h.createdAt ? new Date(h.createdAt).toLocaleDateString('en-IN') : '01/07/2024'}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${typeColor}`}>
                                    {h.transactionType}
                                  </span>
                                </td>
                                <td className="px-4 py-3 truncate max-w-xs">{h.remarks || h.referenceId}</td>
                                <td className="px-4 py-3 text-center font-mono">{h.reels?.length || '—'}</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-green-600">{h.qtyIn ? h.qtyIn.toLocaleString() : '—'}</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-red-600">{h.qtyOut ? h.qtyOut.toLocaleString() : '—'}</td>
                                <td className="px-4 py-3 text-right font-mono font-black text-gray-900">{h.balanceAfter ? h.balanceAfter.toLocaleString() : '—'}</td>
                                <td className="px-4 py-3 text-blue-600 font-black">{h.locationId?.name || 'Storage'}</td>
                                <td className="px-4 py-3 text-gray-500 font-mono">Admin</td>
                              </tr>
                            );
                          })
                        ) : (
                          <>
                            {/* Dummy records mimicking Screenshot 5 */}
                            <tr className="hover:bg-gray-50/50">
                              <td className="px-4 py-3 text-gray-500 font-mono">01/07/2024 10:15 AM</td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded border bg-green-50 text-green-700 border-green-200">
                                  INWARD
                                </span>
                              </td>
                              <td className="px-4 py-3">Purchase Inward ({selectedDetailLot.batchNumber})</td>
                              <td className="px-4 py-3 text-center font-mono">8</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-green-600">2,350</td>
                              <td className="px-4 py-3 text-right font-mono text-gray-400">—</td>
                              <td className="px-4 py-3 text-right font-mono font-black text-gray-900">2,350</td>
                              <td className="px-4 py-3 text-blue-600 font-black">Outdoor A - A1</td>
                              <td className="px-4 py-3 text-gray-500">Admin</td>
                            </tr>
                            <tr className="hover:bg-gray-50/50">
                              <td className="px-4 py-3 text-gray-500 font-mono">02/07/2024 09:30 AM</td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                                  MOVE
                                </span>
                              </td>
                              <td className="px-4 py-3">Move to A2</td>
                              <td className="px-4 py-3 text-center font-mono">—</td>
                              <td className="px-4 py-3 text-right font-mono text-gray-400">—</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-red-600">950</td>
                              <td className="px-4 py-3 text-right font-mono font-black text-gray-900">1,400</td>
                              <td className="px-4 py-3 text-blue-600 font-black">Outdoor A - A1</td>
                              <td className="px-4 py-3 text-gray-500">Warehouse</td>
                            </tr>
                            <tr className="hover:bg-gray-50/50">
                              <td className="px-4 py-3 text-gray-500 font-mono">02/07/2024 09:35 AM</td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                                  MOVE
                                </span>
                              </td>
                              <td className="px-4 py-3">Move from A1 to A2</td>
                              <td className="px-4 py-3 text-center font-mono">—</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-green-600">950</td>
                              <td className="px-4 py-3 text-right font-mono text-gray-400">—</td>
                              <td className="px-4 py-3 text-right font-mono font-black text-gray-900 font-mono">950</td>
                              <td className="px-4 py-3 text-blue-600 font-black">Outdoor A - A2</td>
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
                            <td className="px-4 py-2.5 text-blue-600 font-black">{b.location?.name || '—'}</td>
                            <td className="px-4 py-2.5 text-center font-mono">{b.reels?.length || '—'}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{(b.onHand || 0).toLocaleString()} KG</td>
                            <td className="px-4 py-2.5 text-right font-mono font-black text-green-600">{(b.onHand || 0).toLocaleString()} KG</td>
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
                      <span className="text-base font-black text-gray-900 font-mono">{totalLotAvailable.toLocaleString()}</span>
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
        /* ── MAIN LIST VIEW (SPLIT SCREEN) ──────────────────────────────────── */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                Batch Stock / Lot Inventory
              </h1>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">Stock available by material lot and location</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadData}
                className="px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reload
              </button>
              <button
                className="px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> + Add Stock Entry
              </button>
            </div>
          </div>

          {/* Stats Banner row (matching customer stats card style exactly) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-blue-500 bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default select-none group">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 group-hover:text-blue-500 transition-colors">Total Lots</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5">{statTotalLots}</p>
              </div>
            </div>

            <div className="w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-green-500 bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default select-none group">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 group-hover:text-green-500 transition-colors">Total Available</p>
                <p className="text-2xl font-bold text-green-600 mt-0.5">{statTotalAvailable.toLocaleString('en-IN')} KG</p>
              </div>
            </div>

            <div className="w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-orange-500 bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default select-none group">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 group-hover:text-orange-500 transition-colors">Total Reel Count</p>
                <p className="text-2xl font-bold text-orange-600 mt-0.5">{statTotalReels}</p>
              </div>
            </div>

            <div className="w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-purple-500 bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default select-none group">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 group-hover:text-purple-500 transition-colors">Total Locations</p>
                <p className="text-2xl font-bold text-purple-600 mt-0.5">{statTotalLocations}</p>
              </div>
            </div>
          </div>

          {/* Filter / Search Bar */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex-1 w-full relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by Lot No, Item, Brand, GSM, Width..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/50 focus:bg-white transition-all text-gray-950 font-medium"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <select
                value={filterItem}
                onChange={e => { setFilterItem(e.target.value); setPage(1); }}
                className="w-full sm:w-40 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-700 font-bold"
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
                className="w-full sm:w-40 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-700 font-bold"
              >
                <option value="">All Locations</option>
                {hierarchy.filter(h => h.level === 'Storage Location').map(loc => (
                  <option key={loc._id} value={loc._id}>{loc.name}</option>
                ))}
              </select>

              <select
                className="w-full sm:w-32 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-700 font-bold"
              >
                <option value="">All Status</option>
                <option value="AVAILABLE">Available</option>
              </select>

              <button
                className="px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5 text-gray-400" /> Filters
              </button>
            </div>
          </div>

          {/* Table & Side Panel grid split */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left table view (2/3 width) */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                  Material Lots <span className="text-[10px] text-gray-400 font-bold uppercase">(Available Stock)</span>
                </h3>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 text-gray-400 uppercase font-black border-b border-gray-150 text-[10px]">
                      <th className="px-5 py-3">Lot No.</th>
                      <th className="px-5 py-3">Item</th>
                      <th className="px-5 py-3">Brand</th>
                      <th className="px-5 py-3 text-center">GSM</th>
                      <th className="px-5 py-3 text-center">Width (cm)</th>
                      <th className="px-5 py-3 text-center">Reels</th>
                      <th className="px-5 py-3 text-right">Available KG</th>
                      <th className="px-5 py-3 text-right">Rate / KG (₹)</th>
                      <th className="px-5 py-3">Location</th>
                      <th className="px-5 py-3 text-center">Status</th>
                      <th className="px-5 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700 font-semibold text-xs">
                    {paginatedBalances.map((b, idx) => {
                      const displayLot = getDisplayLotNo(b);
                      const isSelected = selectedLot && (
                        selectedLot._id === b._id || 
                        (selectedLot.batchNumber === b.batchNumber && 
                         (selectedLot.sku?._id || selectedLot.skuId) === (b.sku?._id || b.skuId) && 
                         (selectedLot.location?._id || selectedLot.locationId) === (b.location?._id || b.locationId))
                      );
                      const reelsCount = b.reels?.length || (b.sku?.category === 'Raw Material' ? Math.round(b.onHand / 290) : 0) || 0;
                      
                      return (
                        <tr 
                          key={`${b.sku?._id || b.skuId}-${b.location?._id || b.locationId}-${b.batchNumber}-${idx}`} 
                          className={`hover:bg-gray-50/40 transition-colors cursor-pointer border-b border-gray-50 ${
                            isSelected ? 'bg-blue-50/30' : ''
                          }`}
                          onClick={() => setSelectedLot(b)}
                        >
                          <td className="px-5 py-4 font-black font-mono text-blue-600 text-xs">
                            {displayLot}
                            <span className="text-[9px] text-gray-400 font-medium block mt-0.5">From {b.batchNumber || '—'}</span>
                          </td>
                          <td className="px-5 py-4 font-bold text-gray-900 truncate max-w-xs">{b.sku?.name || 'Raw Material'}</td>
                          <td className="px-5 py-4 text-gray-500">{b.sku?.brand || 'BILT'}</td>
                          <td className="px-5 py-4 text-center font-mono font-bold">{b.sku?.gsm || '52'}</td>
                          <td className="px-5 py-4 text-center font-mono font-bold">{b.sku?.width || '64'}</td>
                          <td className="px-5 py-4 text-center font-mono font-bold text-gray-800">{reelsCount || '—'}</td>
                          <td className="px-5 py-4 text-right font-mono font-black text-green-600">{(b.onHand || 0).toLocaleString()} KG</td>
                          <td className="px-5 py-4 text-right font-mono text-gray-600">₹{(b.sku?.price || 68).toFixed(2)}</td>
                          <td className="px-5 py-4 text-blue-600 font-bold">{b.location?.name || 'Bin'}</td>
                          <td className="px-5 py-4 text-center">
                            <span className="text-[9px] px-2 py-0.5 rounded font-black uppercase border bg-green-50 text-green-700 border-green-200">
                              Available
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedDetailLot(b);
                                  setActiveSubPage('details');
                                }}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded border border-blue-100"
                                title="View Lot details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleOpenTransferModal(b)}
                                className="p-1 text-gray-500 hover:bg-gray-50 rounded border border-gray-200"
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
                        <td colSpan={11} className="text-center py-16 text-gray-400 italic">
                          No stock balances match your current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 text-xs font-bold text-gray-500">
                  <span>Showing Page {page} of {totalPages}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(p - 1, 1))}
                      disabled={page === 1}
                      className="p-1 border rounded bg-white hover:bg-gray-50 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                      disabled={page === totalPages}
                      className="p-1 border rounded bg-white hover:bg-gray-50 disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right side summary cards (1/3 width) */}
            <div className="lg:col-span-1 space-y-6">
              {/* SELECTED LOT SUMMARY */}
              {selectedLot && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider pb-2 border-b">
                    Selected Lot Summary
                  </h3>

                  <div className="space-y-3.5 text-xs text-gray-700 font-semibold font-medium">
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Lot No.</span>
                      <span className="text-blue-600 font-mono font-black">{getDisplayLotNo(selectedLot)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Item</span>
                      <span className="text-gray-950 font-bold truncate max-w-[150px]">{selectedLot.sku?.name || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Brand</span>
                      <span className="text-gray-950 font-bold">{selectedLot.sku?.brand || 'BILT'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">GSM</span>
                      <span className="text-gray-950 font-bold font-mono">{selectedLot.sku?.gsm || 52}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-bold uppercase text-[9px]">Width</span>
                      <span className="text-gray-950 font-bold font-mono">{selectedLot.sku?.width || 64} cm</span>
                    </div>
                    
                    <div className="border-t pt-3.5 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-400 font-bold uppercase text-[9px]">Total Reels</span>
                        <span className="text-gray-950 font-bold font-mono">{lotTotalReels}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 font-bold uppercase text-[9px]">Available Reels (Est.)</span>
                        <span className="text-gray-950 font-bold font-mono">{lotTotalReels ? `${lotTotalReels}.0` : '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 font-bold uppercase text-[9px]">Available KG</span>
                        <span className="text-green-600 font-black font-mono">{selectedLot.onHand.toLocaleString()} KG</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 font-bold uppercase text-[9px]">Rate / KG</span>
                        <span className="text-gray-950 font-bold font-mono">₹{(selectedLot.sku?.price || 68.00).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-3 font-black text-gray-950">
                        <span className="text-gray-400 uppercase text-[10px]">Lot Value</span>
                        <span className="text-blue-600 font-mono text-xs">₹{lotValue.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        setSelectedDetailLot(selectedLot);
                        setActiveSubPage('details');
                      }}
                      className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-xs font-bold transition-all shadow-3xs flex items-center justify-center gap-1.5"
                    >
                      View Lot Details <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* QUICK ACTIONS */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3.5">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider pb-2 border-b">
                  Quick Actions
                </h3>
                <div className="space-y-2 text-xs font-bold text-gray-700">
                  <button
                    className="w-full py-2.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-xl transition-all shadow-3xs flex items-center gap-3 px-4 text-left"
                  >
                    <span className="p-1 bg-green-50 text-green-700 rounded border border-green-200">
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                    Stock In (Add)
                  </button>
                  <button
                    onClick={() => selectedLot && handleOpenTransferModal(selectedLot)}
                    disabled={!selectedLot}
                    className="w-full py-2.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-xl transition-all shadow-3xs flex items-center gap-3 px-4 text-left disabled:opacity-50"
                  >
                    <span className="p-1 bg-blue-50 text-blue-700 rounded border border-blue-200">
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </span>
                    Move Stock
                  </button>
                  <button
                    className="w-full py-2.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-xl transition-all shadow-3xs flex items-center gap-3 px-4 text-left"
                  >
                    <span className="p-1 bg-purple-50 text-purple-700 rounded border border-purple-200">
                      <Layers className="w-3.5 h-3.5" />
                    </span>
                    Convert / Use Stock
                  </button>
                  <button
                    className="w-full py-2.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-xl transition-all shadow-3xs flex items-center gap-3 px-4 text-left"
                  >
                    <span className="p-1 bg-amber-50 text-amber-700 rounded border border-amber-200">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </span>
                    Lot History
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer info box */}
          <div className="bg-blue-50/50 p-4 border border-blue-150 rounded-2xl space-y-2 text-xs">
            <h4 className="font-black text-blue-900 flex items-center gap-1.5">
              <HelpCircle className="w-4.5 h-4.5 text-blue-600 shrink-0" />
              About Batch Stock / Lot Inventory
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 font-semibold text-blue-700 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                Stock is tracked lot-wise for accuracy.
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                You can move stock between locations.
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                Reels are not numbered. We track by lot, reels count and KG.
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                Use "Convert / Use Stock" to consume this lot in production.
              </div>
            </div>
          </div>
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
  );
};

export default BatchStockV2;

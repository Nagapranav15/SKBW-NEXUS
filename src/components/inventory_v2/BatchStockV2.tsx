import React, { useEffect, useState } from 'react';
import { Layers, Search, RefreshCw, X, FileText, ChevronRight, ChevronDown, Warehouse, MapPin, Database, Calendar, Package, ArrowUpRight, ArrowDownLeft, AlertCircle, ArrowRightLeft, Eye, HelpCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getBalancesV2, getWarehouseHierarchyV2, getLedgerV2, recordTransferV2, SkuV2, WarehouseLocationV2, LedgerEntryV2 } from '../../api/mfgApiV2';
import { getPurchaseInvoicesV2, PurchaseInvoiceV2 } from './purchases/services/purchaseService';
import { showToast } from '../ui/Toast';

interface LocationNode extends WarehouseLocationV2 {
  children: LocationNode[];
}

const BatchStockV2: React.FC = () => {
  const { selectedCompany } = useAuth();
  
  // Data state
  const [balances, setBalances] = useState<any[]>([]);
  const [hierarchy, setHierarchy] = useState<WarehouseLocationV2[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoiceV2[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & filter states
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSku, setFilterSku] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  
  // Selection details state
  const [selectedDetailBatch, setSelectedDetailBatch] = useState<any | null>(null);
  const [detailsTab, setDetailsTab] = useState<'info' | 'reels' | 'docs'>('info');

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
  
  // Ledger History Drawer states
  const [showLedgerDrawer, setShowLedgerDrawer] = useState(false);
  const [ledgerHistory, setLedgerHistory] = useState<LedgerEntryV2[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadData();
    }
  }, [selectedCompany?._id]);

  const loadData = async () => {
    setLoading(true);
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
      showToast('Failed to load batch stock details', 'error');
    } finally {
      setLoading(false);
    }
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

  const getOccupiedCapacity = (locId: string) => {
    return balances
      .filter(b => (b.location?._id || b.locationId) === locId)
      .reduce((sum, b) => sum + (b.onHand || 0), 0);
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

    const availableStock = transferringItem.onHand || 0;
    if (qty > availableStock) {
      setTransferError(`Cannot transfer more than available stock (${availableStock.toLocaleString()} ${transferringItem.sku?.unit || 'KG'})`);
      return;
    }

    if (!transferForm.toLocationId) {
      setTransferError('Please select a destination storage location');
      return;
    }

    // Double check destination capacity
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
      
      // Reload balances and layout hierarchy
      setLoading(true);
      const [balData, locsData] = await Promise.all([
        getBalancesV2(selectedCompany?._id || '', undefined, true),
        getWarehouseHierarchyV2(selectedCompany?._id || '')
      ]);
      setBalances(balData);
      setHierarchy(locsData);
    } catch (err: any) {
      console.error(err);
      setTransferError(err.response?.data?.msg || 'Failed to complete stock transfer');
    } finally {
      setTransferSubmitting(false);
      setLoading(false);
    }
  };

  const handleOpenLedgerTrail = async (item: any) => {
    setLedgerLoading(true);
    setShowLedgerDrawer(true);
    try {
      const history = await getLedgerV2({
        companyId: selectedCompany?._id || '',
        skuId: item.sku?._id || item.skuId,
        batchNumber: item.batchNumber || undefined
      });
      setLedgerHistory(history);
    } catch (e) {
      console.error(e);
      showToast('Failed to load transaction history', 'error');
    } finally {
      setLedgerLoading(false);
    }
  };

  // Build warehouse tree hierarchy
  const buildTree = (): LocationNode[] => {
    const locMap: Record<string, LocationNode> = {};
    const roots: LocationNode[] = [];

    hierarchy.forEach(loc => {
      if (loc._id) {
        locMap[loc._id] = { ...loc, children: [] };
      }
    });

    hierarchy.forEach(loc => {
      if (loc._id) {
        const node = locMap[loc._id];
        if (loc.parentId && locMap[loc.parentId]) {
          locMap[loc.parentId].children.push(node);
        } else {
          roots.push(node);
        }
      }
    });

    return roots;
  };

  // Calculate dynamic stock sums inside a node
  const computeNodeStock = (nodeId: string, currentBatchNumber?: string, currentSkuId?: string): { qty: number; unit: string } => {
    const getStorageDescendants = (id: string): string[] => {
      const directChildren = hierarchy.filter(l => l.parentId === id);
      let storageIds: string[] = [];
      directChildren.forEach(child => {
        if (child.level === 'Storage Location') {
          storageIds.push(child._id || '');
        } else if (child._id) {
          storageIds = [...storageIds, ...getStorageDescendants(child._id)];
        }
      });
      return storageIds;
    };

    const targetStorageIds = hierarchy.find(l => l._id === nodeId)?.level === 'Storage Location' 
      ? [nodeId] 
      : getStorageDescendants(nodeId);

    const filteredBals = balances.filter(b => {
      const locId = b.location?._id || b.locationId;
      const matchLoc = targetStorageIds.includes(locId);
      const matchBatch = currentBatchNumber ? b.batchNumber === currentBatchNumber : true;
      const matchSku = currentSkuId ? (b.sku?._id || b.skuId) === currentSkuId : true;
      return matchLoc && matchBatch && matchSku;
    });

    const totalQty = filteredBals.reduce((sum, b) => sum + (b.onHand || 0), 0);
    const units = Array.from(new Set(filteredBals.map(b => b.sku?.unit || 'KG')));
    const unitStr = units.length > 1 ? 'KG / PCS' : (units[0] || 'KG');

    return { qty: totalQty, unit: unitStr };
  };

  const getUnallocatedQty = (batchNo: string, skuId: string): number => {
    const inv = invoices.find(i => i.invoiceNumber === batchNo);
    if (!inv) return 0;
    
    // Find the item quantity in this invoice matching the SKU
    const itemQty = inv.items?.find(item => {
      const itSkuId = typeof item.skuId === 'object' && item.skuId !== null ? item.skuId._id : item.skuId;
      return itSkuId === skuId;
    })?.quantity || 0;
    
    // Find the allocated quantity in our warehouse storage locations
    const allocatedQty = balances
      .filter(b => b.batchNumber === batchNo && (b.sku?._id || b.skuId) === skuId)
      .reduce((sum, b) => sum + (b.onHand || 0), 0);
      
    return Math.max(itemQty - allocatedQty, 0);
  };

  // Filter calculations
  const filteredBalances = balances.filter(b => {
    const skuName = b.sku?.name || '';
    const skuCode = b.sku?.skuCode || '';
    const batchNo = b.batchNumber || '';
    const locName = b.location?.name || '';
    const category = b.sku?.category || '';
    const locId = b.location?._id || b.locationId;
    const skuId = b.sku?._id || b.skuId;

    const query = search.toLowerCase();
    const matchSearch = skuName.toLowerCase().includes(query) ||
                        skuCode.toLowerCase().includes(query) ||
                        batchNo.toLowerCase().includes(query) ||
                        locName.toLowerCase().includes(query);

    const matchCategory = !filterCategory || category === filterCategory;
    const matchSku = !filterSku || skuId === filterSku;
    const matchLocation = !filterLocation || locId === filterLocation;
    const matchBatch = !filterBatch || batchNo === filterBatch;

    return matchSearch && matchCategory && matchSku && matchLocation && matchBatch;
  });

  // Unique filter lists
  const uniqueSkus = Array.from(new Set(balances.map(b => b.sku?._id || b.skuId).filter(Boolean))).map(id => {
    return balances.find(b => (b.sku?._id || b.skuId) === id)?.sku;
  }).filter(Boolean) as SkuV2[];

  const uniqueLocations = hierarchy.filter(loc => loc.level === 'Storage Location');
  const uniqueBatches = Array.from(new Set(balances.map(b => b.batchNumber).filter(Boolean))) as string[];

  // Dynamic Statistics
  const totalStockVolume = balances.reduce((sum, b) => sum + (b.onHand || 0), 0);
  const rawMaterialsStock = balances.filter(b => b.sku?.category === 'Raw Material').reduce((sum, b) => sum + (b.onHand || 0), 0);
  const semiFinishedStock = balances.filter(b => b.sku?.category === 'Semi Finished').reduce((sum, b) => sum + (b.onHand || 0), 0);
  const finishedGoodsStock = balances.filter(b => b.sku?.category === 'Finished Goods').reduce((sum, b) => sum + (b.onHand || 0), 0);

  // Tree component for right side panel
  const LocationSummaryTreeNode: React.FC<{ node: LocationNode; currentBatch?: string; currentSku?: string }> = ({ node, currentBatch, currentSku }) => {
    const { qty, unit } = computeNodeStock(node._id || '', currentBatch, currentSku);
    if (qty === 0) return null;

    const [isExpanded, setIsExpanded] = useState(true);
    const hasChildren = node.children.length > 0;
    const isStorage = node.level === 'Storage Location';

    return (
      <div className="text-xs">
        <div 
          onClick={() => !isStorage && setIsExpanded(!isExpanded)}
          className={`flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-gray-50/70 cursor-pointer ${
            isStorage ? 'bg-gray-50/40 font-medium' : 'font-bold'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {!isStorage && (
              <span className="text-gray-400 shrink-0">
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
            )}
            {node.level === 'Factory' && <Warehouse className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
            {node.level === 'Floor' && <FolderIcon className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
            {node.level === 'Zone' && <Layers className="w-3.5 h-3.5 text-purple-500 shrink-0" />}
            {isStorage && <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
            
            <span className="text-gray-700 truncate">{node.name}</span>
          </div>
          <div className="flex items-center gap-1 text-right font-bold font-mono ml-2 shrink-0">
            <span className="text-gray-900">{qty.toLocaleString('en-IN')}</span>
            <span className="text-[9px] text-gray-400 uppercase font-bold">{unit}</span>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="pl-3.5 border-l border-gray-100 ml-3.5 mt-1 space-y-0.5">
            {node.children.map(child => (
              <LocationSummaryTreeNode key={child._id} node={child} currentBatch={currentBatch} currentSku={currentSku} />
            ))}
            
            {node.level === 'Factory' && currentBatch && currentSku && (() => {
              const unallocated = getUnallocatedQty(currentBatch, currentSku);
              if (unallocated > 0) {
                return (
                  <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-red-50/40 text-red-700 font-bold border border-red-100/50">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>Unallocated / In Transit</span>
                    </div>
                    <div className="flex items-center gap-1 text-right font-mono shrink-0">
                      <span>{unallocated.toLocaleString('en-IN')}</span>
                      <span className="text-[9px] text-red-400 uppercase font-bold">{unit}</span>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        )}
      </div>
    );
  };

  const treeData = buildTree();

  // Find info of matched invoice for the selected details batch
  const matchedInvoice = invoices.find(inv => inv.invoiceNumber === selectedDetailBatch?.batchNumber);
  const matchedInvoiceItem = matchedInvoice?.items?.find(item => {
    const itSkuId = typeof item.skuId === 'object' && item.skuId !== null ? item.skuId._id : item.skuId;
    return itSkuId === (selectedDetailBatch?.sku?._id || selectedDetailBatch?.skuId);
  });
  const reelsList = matchedInvoiceItem?.reels || [];

  return (
    <div className="space-y-6">
      {/* 1. VIEW DETAILED BATCH MODE */}
      {selectedDetailBatch ? (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom duration-250">
          {/* Breadcrumb Header */}
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <div className="flex items-center gap-1 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                <span>Inventory</span>
                <ChevronRight className="w-3 h-3" />
                <span className="cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setSelectedDetailBatch(null)}>Batch Stock</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-gray-600">Batch Details</span>
              </div>
              <h1 className="text-lg font-black text-gray-900 tracking-tight mt-1 flex items-center gap-2">
                <Database className="w-4.5 h-4.5 text-blue-600" />
                Batch Stock Details
              </h1>
            </div>
            <button
              onClick={() => setSelectedDetailBatch(null)}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 border border-gray-200 shadow-3xs transition-colors"
              title="Close Details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Top batch overview card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 items-center">
            <div className="flex items-center gap-3 col-span-2">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shrink-0">
                <Database className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Batch No.</span>
                <span className="text-sm font-black text-blue-600 font-mono block truncate">{selectedDetailBatch.batchNumber || '—'}</span>
              </div>
            </div>
            <div className="col-span-2 min-w-0">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Item Name</span>
              <span className="text-xs font-bold text-gray-800 block truncate">{selectedDetailBatch.sku?.name}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Category</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-extrabold uppercase mt-1 inline-block ${
                selectedDetailBatch.sku?.category === 'Raw Material' ? 'bg-amber-50 text-amber-700' :
                selectedDetailBatch.sku?.category === 'Semi Finished' ? 'bg-purple-50 text-purple-700' :
                'bg-emerald-50 text-emerald-700'
              }`}>
                {selectedDetailBatch.sku?.category}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Supplier</span>
              <span className="text-xs font-bold text-gray-600 block truncate">
                {matchedInvoice && typeof matchedInvoice.vendorId === 'object' && matchedInvoice.vendorId !== null
                  ? (matchedInvoice.vendorId.firmName || matchedInvoice.vendorId.ownerName)
                  : 'Opening / Adj'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Available</span>
              <span className="text-sm font-black text-gray-900 block font-mono">
                {selectedDetailBatch.onHand.toLocaleString('en-IN')} <span className="text-[9px] text-gray-400">{selectedDetailBatch.sku?.unit || 'KG'}</span>
              </span>
            </div>
          </div>

          {/* Details Row: Info on left, location wise summary on right */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Col (2/3 width) */}
            <div className="lg:col-span-2 space-y-5">
              {/* Navigation Tabs */}
              <div className="flex gap-2 border-b border-gray-200 pb-px">
                <button
                  onClick={() => setDetailsTab('info')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                    detailsTab === 'info' 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" /> Batch Information
                </button>
                {selectedDetailBatch.sku?.category === 'Raw Material' && selectedDetailBatch.sku?.unit === 'kg' && (
                  <button
                    onClick={() => setDetailsTab('reels')}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                      detailsTab === 'reels' 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" /> Reel Details ({reelsList.length})
                  </button>
                )}
                <button
                  onClick={() => setDetailsTab('docs')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                    detailsTab === 'docs' 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" /> Documents (2)
                </button>
              </div>

              {/* Tab Content 1: Batch Information */}
              {detailsTab === 'info' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left card: Breakdown details */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
                    <h3 className="text-xs font-black text-gray-700 uppercase tracking-wider pb-2 border-b border-gray-100 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-blue-600" /> Procurement Ledger Details
                    </h3>
                    <div className="space-y-2.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-400 font-bold uppercase">Material:</span>
                        <span className="font-semibold text-gray-800">{selectedDetailBatch.sku?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 font-bold uppercase">Supplier:</span>
                        <span className="font-semibold text-gray-800">
                          {matchedInvoice && typeof matchedInvoice.vendorId === 'object' && matchedInvoice.vendorId !== null
                            ? (matchedInvoice.vendorId.firmName || matchedInvoice.vendorId.ownerName)
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 font-bold uppercase">Invoice No:</span>
                        <span className="font-bold text-gray-800 font-mono">{matchedInvoice?.invoiceNumber || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 font-bold uppercase">Invoice Date:</span>
                        <span className="font-semibold text-gray-700">
                          {matchedInvoice?.createdAt ? new Date(matchedInvoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-dashed pt-2">
                        <span className="text-gray-400 font-bold uppercase">Rate / KG:</span>
                        <span className="font-semibold text-gray-800 font-mono">
                          ₹{(matchedInvoiceItem?.purchasePrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 font-bold uppercase">Total Quantity:</span>
                        <span className="font-bold text-gray-800 font-mono">
                          {(matchedInvoiceItem?.quantity || selectedDetailBatch.onHand).toLocaleString('en-IN')} {selectedDetailBatch.sku?.unit}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-gray-400 font-bold uppercase">Total Value (Subtotal):</span>
                        <span className="font-bold text-gray-800 font-mono">
                          ₹{(matchedInvoice?.subTotal || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span className="font-bold uppercase text-[10px]">Freight:</span>
                        <span className="font-semibold font-mono">₹{(matchedInvoice?.freight || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span className="font-bold uppercase text-[10px]">Crane Charges:</span>
                        <span className="font-semibold font-mono">₹{(matchedInvoice?.craneCharges || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span className="font-bold uppercase text-[10px]">Other Charges:</span>
                        <span className="font-semibold font-mono">₹{(matchedInvoice?.otherCharges || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2 mt-2 font-black text-gray-900">
                        <span className="font-bold uppercase">Total Bill Value:</span>
                        <span className="text-blue-600 font-mono text-sm">
                          ₹{(matchedInvoice?.grandTotal || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right card: Batch stock locations */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col justify-between">
                    <div className="space-y-4">
                      <h3 className="text-xs font-black text-gray-700 uppercase tracking-wider pb-2 border-b border-gray-100 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-purple-600" /> Batch Stock In Locations
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="text-gray-400 font-bold uppercase border-b border-gray-100 text-[9px]">
                              <th className="py-2">Location</th>
                              <th className="py-2 text-right">Qty (Available)</th>
                              <th className="py-2 text-center">Unit</th>
                              <th className="py-2 text-center">Last Updated</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 text-gray-700">
                            {balances
                              .filter(b => b.batchNumber === selectedDetailBatch.batchNumber && (b.sku?._id || b.skuId) === (selectedDetailBatch.sku?._id || selectedDetailBatch.skuId))
                              .map((b, i) => (
                                <tr key={i} className="hover:bg-gray-50/50">
                                  <td className="py-2 font-semibold text-gray-800">{b.location?.name || '—'}</td>
                                  <td className="py-2 text-right font-bold font-mono">{b.onHand?.toLocaleString('en-IN')}</td>
                                  <td className="py-2 text-center text-gray-400 font-mono text-[10px] uppercase font-bold">{b.sku?.unit}</td>
                                  <td className="py-2 text-center text-gray-400">
                                    {b.updatedAt ? new Date(b.updatedAt).toLocaleDateString('en-IN') : '—'}
                                  </td>
                                </tr>
                              ))}
                            
                            {/* Render Unallocated/In Transit row */}
                            {(() => {
                              const unallocated = getUnallocatedQty(selectedDetailBatch.batchNumber, selectedDetailBatch.sku?._id || selectedDetailBatch.skuId);
                              if (unallocated > 0) {
                                return (
                                  <tr className="bg-red-50/30 text-red-700">
                                    <td className="py-2 font-bold italic">Unallocated / In Transit</td>
                                    <td className="py-2 text-right font-bold font-mono">{unallocated.toLocaleString('en-IN')}</td>
                                    <td className="py-2 text-center text-red-400 font-mono text-[10px] uppercase font-bold">{selectedDetailBatch.sku?.unit}</td>
                                    <td className="py-2 text-center text-red-400">—</td>
                                  </tr>
                                );
                              }
                              return null;
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-150 mt-4 text-right">
                      <button
                        onClick={() => handleOpenLedgerTrail(selectedDetailBatch)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors inline-flex items-center gap-1.5"
                      >
                        View Stock Movements <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Content 2: Reels details */}
              {detailsTab === 'reels' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-xs font-black text-gray-700 uppercase tracking-wider pb-2 border-b border-gray-100 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-blue-600" /> Physical Reels Allocation Log
                  </h3>
                  {reelsList.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {reelsList.map((reel: any, i: number) => (
                        <div key={i} className="border border-gray-200 rounded-xl p-3 bg-gray-50/40 relative">
                          <div className="flex justify-between items-center border-b pb-1.5 mb-1.5">
                            <span className="font-bold text-xs font-mono text-blue-600">{reel.reelNumber || `R-${i+1}`}</span>
                            <span className="text-[8px] bg-blue-50 text-blue-700 font-extrabold px-1 py-0.5 rounded border border-blue-100">
                              REEL
                            </span>
                          </div>
                          <div className="space-y-1 text-[10px] text-gray-500 font-medium">
                            <div className="flex justify-between">
                              <span>GSM:</span>
                              <span className="font-bold text-gray-800">{reel.gsm} gsm</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Width:</span>
                              <span className="font-bold text-gray-800">{reel.width} cm</span>
                            </div>
                            <div className="flex justify-between border-t pt-1 mt-1 font-bold text-gray-800 text-[11px] font-mono">
                              <span>Weight:</span>
                              <span className="text-gray-900">{reel.weight} kg</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-12 text-xs italic text-gray-400">No raw paper reels declared in this procurement batch</p>
                  )}
                </div>
              )}

              {/* Tab Content 3: Documents */}
              {detailsTab === 'docs' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                  <h3 className="text-xs font-black text-gray-700 uppercase tracking-wider pb-2 border-b border-gray-100 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-600" /> Associated Documents
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-3.5 border border-gray-200 rounded-xl hover:bg-gray-50/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-red-50 text-red-500 rounded-lg">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-800">InvoiceCopy_{selectedDetailBatch.batchNumber}.pdf</p>
                          <p className="text-[10px] text-gray-400 mt-0.5 font-bold uppercase font-mono">2.4 MB • PDF Document</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                    <div className="flex items-center justify-between p-3.5 border border-gray-200 rounded-xl hover:bg-gray-50/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-50 text-blue-500 rounded-lg">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-800">WeightSlip_{selectedDetailBatch.batchNumber}.jpg</p>
                          <p className="text-[10px] text-gray-400 mt-0.5 font-bold uppercase font-mono">1.1 MB • Image JPEG</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Col (1/3 width): Batch Specific Location Summary Tree */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-4 flex flex-col justify-between h-full min-h-[400px]">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center justify-between border-b pb-2">
                      <span>Location-wise Stock Summary</span>
                      <button onClick={() => setSelectedDetailBatch(null)} className="text-gray-400 hover:text-gray-600" title="Close">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">
                      Batch: {selectedDetailBatch.batchNumber} | Item: {selectedDetailBatch.sku?.skuCode}
                    </p>
                  </div>
                  
                  <div className="border border-gray-150 rounded-xl p-3 bg-gray-50/30 space-y-2.5 max-h-[350px] overflow-y-auto">
                    {treeData.length > 0 ? (
                      treeData.map(root => (
                        <LocationSummaryTreeNode key={root._id} node={root} currentBatch={selectedDetailBatch.batchNumber} currentSku={selectedDetailBatch.sku?._id || selectedDetailBatch.skuId} />
                      ))
                    ) : (
                      <p className="text-center text-xs italic text-gray-400 py-6">No locations active</p>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-150 mt-4">
                  <button className="w-full py-2 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold rounded-xl text-xs shadow-3xs flex items-center justify-center gap-1.5 transition-colors">
                    Export Summary
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 2. MAIN BATCH STOCK LIST VIEW (STOCK OVERVIEW) */
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600 animate-pulse-slow" />
                Stock Overview
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">This module tracks all stock (Raw, Semi, Finished) by Batch and Location. No pricing is shown here.</p>
            </div>
            <button
              onClick={() => {
                setLoading(true);
                loadData();
              }}
              className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-xs shadow-3xs flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reload Data
            </button>
          </div>

          {/* Top overview statistics grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                <Layers className="w-6 h-6 animate-pulse-slow" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Stock (All Items)</span>
                <span className="text-xl font-black text-gray-900 block font-mono mt-0.5">{totalStockVolume.toLocaleString('en-IN')}</span>
                <span className="text-[9px] text-gray-400 block font-bold uppercase mt-0.5">KG / PCS</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Raw Materials</span>
                <span className="text-xl font-black text-emerald-700 block font-mono mt-0.5">{rawMaterialsStock.toLocaleString('en-IN')}</span>
                <span className="text-[9px] text-gray-400 block font-bold uppercase mt-0.5">KG</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                <FolderIcon className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Semi-Finished</span>
                <span className="text-xl font-black text-orange-700 block font-mono mt-0.5">{semiFinishedStock.toLocaleString('en-IN')}</span>
                <span className="text-[9px] text-gray-400 block font-bold uppercase mt-0.5">PCS</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                <BookOpenIcon className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Finished Goods</span>
                <span className="text-xl font-black text-purple-700 block font-mono mt-0.5">{finishedGoodsStock.toLocaleString('en-IN')}</span>
                <span className="text-[9px] text-gray-400 block font-bold uppercase mt-0.5">PCS (Books)</span>
              </div>
            </div>
          </div>

          {/* Main Grid Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2/3: Batch Stock List table */}
            <div className="lg:col-span-2 space-y-4 bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-2">
                <h2 className="text-xs font-black text-gray-700 uppercase tracking-wider">Batch Stock List</h2>
              </div>
              
              {/* Dynamic Filter toolbar inside the list card */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="w-full sm:w-auto flex-1 min-w-[120px]">
                  <select
                    value={filterCategory}
                    onChange={e => setFilterCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Categories</option>
                    <option value="Raw Material">Raw Material</option>
                    <option value="Semi Finished">Semi-Finished</option>
                    <option value="Finished Goods">Finished Goods</option>
                  </select>
                </div>

                <div className="w-full sm:w-auto flex-1 min-w-[120px]">
                  <select
                    value={filterSku}
                    onChange={e => setFilterSku(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Items</option>
                    {uniqueSkus.map(s => (
                      <option key={s._id} value={s._id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="w-full sm:w-auto flex-1 min-w-[120px]">
                  <select
                    value={filterLocation}
                    onChange={e => setFilterLocation(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Locations</option>
                    {uniqueLocations.map(l => (
                      <option key={l._id} value={l._id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                <div className="w-full sm:w-auto flex-1 min-w-[120px]">
                  <select
                    value={filterBatch}
                    onChange={e => setFilterBatch(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Batches</option>
                    {uniqueBatches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                <div className="w-full sm:w-auto relative max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>

                <button
                  onClick={() => {
                    setSearch('');
                    setFilterCategory('');
                    setFilterSku('');
                    setFilterLocation('');
                    setFilterBatch('');
                  }}
                  className="p-1.5 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-gray-150 border border-gray-200 rounded-lg transition-all"
                  title="Reset Filters"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredBalances.length > 0 ? (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 uppercase font-bold border-b border-gray-200 text-[10px]">
                        <th className="px-5 py-3">Batch No.</th>
                        <th className="px-5 py-3">Item Name</th>
                        <th className="px-5 py-3">Category</th>
                        <th className="px-5 py-3 text-right">Qty (Available)</th>
                        <th className="px-5 py-3 text-center">Unit</th>
                        <th className="px-5 py-3">Location</th>
                        <th className="px-5 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-gray-700">
                      {filteredBalances.map((b, idx) => {
                        const unit = b.sku?.unit || 'KG';
                        return (
                          <tr 
                            key={idx} 
                            onClick={() => setSelectedDetailBatch(b)}
                            className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                          >
                            <td className="px-5 py-3 font-bold font-mono text-blue-600">{b.batchNumber || '—'}</td>
                            <td className="px-5 py-3 font-bold text-gray-800 truncate max-w-xs">{b.sku?.name}</td>
                            <td className="px-5 py-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-extrabold uppercase inline-block ${
                                b.sku?.category === 'Raw Material' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                b.sku?.category === 'Semi Finished' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                                'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              }`}>
                                {b.sku?.category}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right font-black text-gray-900 text-sm">
                              {b.onHand.toLocaleString('en-IN')}
                            </td>
                            <td className="px-5 py-3 text-center font-bold text-gray-400 uppercase font-mono">{unit}</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-1">
                                <span className="p-0.5 bg-gray-50 border rounded text-gray-400 shrink-0">
                                  <MapPin className="w-3 h-3" />
                                </span>
                                <span className="font-semibold text-gray-600 truncate max-w-[100px]">{b.location?.name || '—'}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-center" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => setSelectedDetailBatch(b)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 border border-blue-100/50 rounded-lg transition-colors shadow-3xs"
                                  title="View Batch Details"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                {b.onHand > 0 && (
                                  <button
                                    onClick={() => handleOpenTransferModal(b)}
                                    className="p-1 text-purple-600 hover:bg-purple-50 border border-purple-100/50 rounded-lg transition-colors shadow-3xs"
                                    title="Transfer Stock"
                                  >
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-16 text-gray-400">
                    <Database className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold">No stock balances found</p>
                    <p className="text-xs text-gray-500 mt-1">Please ensure purchase invoices have been posted and items allocated to location racks.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right 1/3: Location-wise Stock Summary tree */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-4 flex flex-col justify-between h-full min-h-[450px]">
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider pb-2 border-b border-gray-150">
                    Location-wise Stock Summary
                  </h3>
                  
                  <div className="border border-gray-150 rounded-xl p-3.5 bg-gray-50/20 space-y-2.5 max-h-[400px] overflow-y-auto">
                    {loading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : treeData.length > 0 ? (
                      treeData.map(root => (
                        <LocationSummaryTreeNode key={root._id} node={root} />
                      ))
                    ) : (
                      <p className="text-center text-xs italic text-gray-400 py-6">No locations active</p>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-150 mt-4">
                  <button className="w-full py-2.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold rounded-xl text-xs shadow-3xs flex items-center justify-center gap-1.5 transition-colors">
                    Export Summary
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. TRANSACTION LEDGER TRAIL DRAWER */}
      {showLedgerDrawer && selectedBatch && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-3xs" onClick={() => setShowLedgerDrawer(false)} />
          <div className="relative w-full max-w-2xl bg-white shadow-2xl h-full flex flex-col z-10 animate-in slide-in-from-right duration-250">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Audit Ledger: {selectedBatch.sku?.name}
                </h2>
                <p className="text-[11px] text-gray-500 mt-0.5 font-medium">Batch No. {selectedBatch.batchNumber || '—'} in {selectedBatch.location?.name || '—'}</p>
              </div>
              <button
                onClick={() => setShowLedgerDrawer(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-gray-950">
              {/* Batch Summary */}
              <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-200 grid grid-cols-2 gap-y-3 gap-x-4">
                <div>
                  <span className="block text-[9px] text-gray-400 font-bold uppercase">Material</span>
                  <span className="font-bold text-gray-800 text-sm">{selectedBatch.sku?.name}</span>
                </div>
                <div>
                  <span className="block text-[9px] text-gray-400 font-bold uppercase">Batch / PB No.</span>
                  <span className="font-bold text-blue-600 font-mono text-sm">{selectedBatch.batchNumber || '—'}</span>
                </div>
                <div>
                  <span className="block text-[9px] text-gray-400 font-bold uppercase">Default Unit</span>
                  <span className="font-semibold block uppercase font-mono">{selectedBatch.sku?.unit || 'KG'}</span>
                </div>
                <div>
                  <span className="block text-[9px] text-gray-400 font-bold uppercase">On Hand Quantity</span>
                  <span className="font-black text-gray-900 text-sm block">
                    {selectedBatch.onHand.toLocaleString('en-IN')} {selectedBatch.sku?.unit || 'KG'}
                  </span>
                </div>
              </div>

              {/* Transactions List */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-gray-700 uppercase tracking-wider border-b pb-1.5">Transaction trail</h3>
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                  {ledgerLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : ledgerHistory.length > 0 ? (
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-400 uppercase font-bold border-b text-[9px]">
                          <th className="px-4 py-2">Date & Time</th>
                          <th className="px-4 py-2">Txn Type</th>
                          <th className="px-4 py-2">Location</th>
                          <th className="px-4 py-2 text-right">Quantity</th>
                          <th className="px-4 py-2">User</th>
                          <th className="px-4 py-2">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-150/70 text-gray-700">
                        {ledgerHistory.map((log, i) => {
                          const qty = log.qtyIn || log.qtyOut || 0;
                          const isIN = (log.qtyIn || 0) > 0;
                          return (
                            <tr key={i} className="hover:bg-gray-50/50">
                              <td className="px-4 py-2.5 text-gray-400">
                                {new Date(log.createdAt || log.timestamp).toLocaleString('en-IN')}
                              </td>
                              <td className="px-4 py-2.5 font-semibold text-gray-800">
                                <span className={`px-1.5 py-0.5 rounded font-extrabold text-[8px] uppercase border ${
                                  isIN ? 'bg-green-50 text-green-700 border-green-100' :
                                  log.transactionType === 'Transfer' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                  log.transactionType === 'Consumption' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                  'bg-gray-100/85 text-gray-600 border-gray-200'
                                }`}>
                                  {log.transactionType}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 font-semibold text-gray-600">
                                {typeof log.locationId === 'object' && log.locationId !== null ? log.locationId.name : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className={`inline-flex items-center gap-0.5 font-bold font-mono text-[11px] ${
                                  isIN ? 'text-green-600' : 'text-red-500'
                                }`}>
                                  {isIN ? <ArrowDownLeft className="w-3 h-3 shrink-0" /> : <ArrowUpRight className="w-3 h-3 shrink-0" />}
                                  {isIN ? '+' : '-'}{qty.toLocaleString('en-IN')}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-gray-500">
                                {typeof log.userId === 'object' && log.userId !== null ? log.userId.fullName : 'System'}
                              </td>
                              <td className="px-4 py-2.5 italic text-gray-400 break-words" title={log.remarks}>
                                {log.remarks || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-12 text-gray-400">
                      <AlertCircle className="w-6 h-6 text-gray-200 mx-auto mb-2" />
                      <p className="font-semibold text-[10px]">No transaction history found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 text-right">
              <button
                onClick={() => setShowLedgerDrawer(false)}
                className="px-5 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-3xs"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. STOCK TRANSFER MODAL */}
      {showTransferModal && transferringItem && (() => {
        const destLocs = hierarchy.filter(
          loc => loc.level === 'Storage Location' && 
                 loc._id !== (transferringItem.location?._id || transferringItem.locationId)
        );
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-3xs" onClick={() => !transferSubmitting && setShowTransferModal(false)} />

            <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-md w-full relative z-10 animate-in zoom-in-95 duration-150 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-purple-600 animate-pulse" />
                  Transfer Stock
                </h2>
                <button
                  disabled={transferSubmitting}
                  onClick={() => setShowTransferModal(false)}
                  className="p-1.5 hover:bg-gray-150 rounded-lg transition-colors text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleTransferSubmit} className="p-6 space-y-4 text-left">
                {transferError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-700 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{transferError}</span>
                  </div>
                )}

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold uppercase">Material:</span>
                    <span className="font-bold text-gray-800 break-words max-w-[220px] text-right">{transferringItem.sku?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold uppercase">Batch / Lot:</span>
                    <span className="font-bold font-mono text-blue-600">{transferringItem.batchNumber || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold uppercase">Source Location:</span>
                    <span className="font-bold text-gray-800">{transferringItem.location?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-gray-400 font-bold uppercase">Available Stock:</span>
                    <span className="font-black text-gray-900 text-sm font-mono">
                      {transferringItem.onHand.toLocaleString('en-IN')} {transferringItem.sku?.unit || 'KG'}
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
                      <option value="">-- Select Destination Storage --</option>
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
                        placeholder="Enter quantity to move..."
                        value={transferForm.quantity}
                        onChange={e => setTransferForm({ ...transferForm, quantity: e.target.value })}
                        className="w-full pl-3 pr-12 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 font-mono font-bold text-gray-900"
                        required
                        disabled={transferSubmitting}
                      />
                      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[10px] font-black text-gray-400 uppercase font-mono">
                        {transferringItem.sku?.unit || 'KG'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Transfer Remarks / Notes</label>
                    <textarea
                      placeholder="Provide description or reason for this internal movement..."
                      value={transferForm.remarks}
                      onChange={e => setTransferForm({ ...transferForm, remarks: e.target.value })}
                      className="w-full h-20 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
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
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {transferSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Transferring...
                      </>
                    ) : (
                      <>
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Confirm Transfer
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

// Local minimal icons to avoid import misses
const FolderIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);

const BookOpenIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

export default BatchStockV2;

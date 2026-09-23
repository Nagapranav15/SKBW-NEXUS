import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Save, Plus, Trash2, Search, ChevronDown, Calendar, User, Package, 
  AlertCircle, FileText, Check, Percent, X, MoreVertical, Edit2, 
  Phone, MessageSquare, MapPin, Receipt, Truck, Layers, Coins
} from 'lucide-react';
import Modal from '../ui/Modal';
import { getSkusV2, getBalancesV2, SkuV2 } from '../../api/mfgApiV2';
import { getParties } from '../../api/partyApi';
import { 
  createSalesOrderV2, 
  updateSalesOrderV2, 
  getNextSalesOrderNumberV2, 
  SalesOrderV2, 
  SalesOrderItemV2, 
  OtherChargeItem 
} from '../../api/salesOrderApiV2';

interface SalesOrderDrawerV2Props {
  isOpen: boolean;
  companyId: string;
  companyState?: string;
  editOrder?: SalesOrderV2 | null;
  onClose: () => void;
  onSaveSuccess: (savedOrder: SalesOrderV2) => void;
}

interface OrderItemRow {
  skuId: string;
  skuCode: string;
  itemName: string;
  category: string;
  uom: string;
  stockGbl: number | null;
  gbl: number | string;
  pcsPerGbl: number | string;
  totalPcs: number;
  rate: number | string;
  discPercent: number | string;
  amount: number;
}

export const SalesOrderDrawerV2: React.FC<SalesOrderDrawerV2Props> = ({
  isOpen,
  companyId,
  companyState = 'Maharashtra',
  editOrder,
  onClose,
  onSaveSuccess
}) => {
  const [orderNumber, setOrderNumber] = useState('SO-0001');
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customersList, setCustomersList] = useState<any[]>([]);

  const [orderDate, setOrderDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [promisedDate, setPromisedDate] = useState<string>(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [customerPoNumber, setCustomerPoNumber] = useState('');
  const [facility, setFacility] = useState('Main Factory');
  const [orderStatus, setOrderStatus] = useState<string>('Confirmed');
  const [transporter, setTransporter] = useState<string>('Chennupati Cargo Services');
  const [internalNotes, setInternalNotes] = useState('');

  const [availableSkus, setAvailableSkus] = useState<SkuV2[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  
  // Row item search & dropdown state
  const [activeItemDropdownIdx, setActiveItemDropdownIdx] = useState<number | null>(null);
  const [rowSearchTerms, setRowSearchTerms] = useState<{ [key: number]: string }>({});

  // Clean empty initial line items (No hardcoded values)
  const [items, setItems] = useState<OrderItemRow[]>([
    {
      skuId: '',
      skuCode: '',
      itemName: '',
      category: 'Finished Goods',
      uom: 'Pcs',
      stockGbl: null,
      gbl: '',
      pcsPerGbl: '',
      totalPcs: 0,
      rate: '',
      discPercent: 0,
      amount: 0
    }
  ]);

  // Clean initial other charges
  const [otherCharges, setOtherCharges] = useState<OtherChargeItem[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const customerRef = useRef<HTMLDivElement>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
      if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(e.target as Node)) {
        setActiveItemDropdownIdx(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && companyId) {
      Promise.all([
        getSkusV2(companyId).catch(() => []),
        getBalancesV2(companyId).catch(() => []),
        getParties({ company: companyId, type: 'customer', limit: 1000, light: true }).catch(() => ({ data: { parties: [] } }))
      ]).then(([skus, balances, partiesRes]) => {
        const activeOnly = (skus || []).filter((s: SkuV2) => !s.isDeleted && s.status !== 'Inactive');
        setAvailableSkus(activeOnly);
        
        const bMap = new Map<string, number>();
        if (Array.isArray(balances)) {
          balances.forEach((b: any) => {
            const rawId = b.skuId || b.sku?._id;
            const sId = rawId ? String(rawId._id || rawId) : '';
            const qty = Number(b.onHand) || Number(b.quantity) || 0;
            if (sId) bMap.set(sId, (bMap.get(sId) || 0) + qty);
          });
        }
        setStockMap(bMap);

        const loadedParties = partiesRes?.data?.parties || partiesRes?.parties || [];
        setCustomersList(loadedParties);
      });

      if (!editOrder) {
        getNextSalesOrderNumberV2(companyId).then(setOrderNumber).catch(() => setOrderNumber('SO-0001'));
      }
    }
  }, [isOpen, companyId, editOrder]);

  useEffect(() => {
    if (editOrder) {
      setOrderNumber(editOrder.orderNumber || 'SO-0001');
      setSelectedCustomer(editOrder.customer || { firmName: editOrder.customerName });
      setCustomerSearch(editOrder.customerName || '');
      setOrderDate(editOrder.orderDate || new Date().toISOString().split('T')[0]);
      setPromisedDate(editOrder.promisedDate || '');
      setCustomerPoNumber(editOrder.customerPoNumber || '');
      setFacility(editOrder.facility || 'Main Factory');
      setOrderStatus(editOrder.status || 'Confirmed');
      setTransporter(editOrder.transporter || 'Chennupati Cargo Services');
      setInternalNotes(editOrder.internalNotes || '');

      if (editOrder.items && editOrder.items.length > 0) {
        setItems(editOrder.items.map(i => {
          const skuIdStr = typeof i.skuId === 'object' && i.skuId !== null ? (i.skuId as any)._id : i.skuId;
          const pcsPerGbl = Number(i.pcsPerGbl) || (i.altUnitConversion ? Number(i.altUnitConversion) : 240);
          const totalQty = Number(i.quantity) || 0;
          const gbl = Number(i.gbl) || (pcsPerGbl > 0 ? Math.round(totalQty / pcsPerGbl) : totalQty);
          const rate = Number(i.unitPrice) || 0;
          const disc = Number(i.discountPercent) || 0;
          const amt = Number(i.totalAmount) || Math.max(0, (totalQty * rate) * (1 - disc / 100));

          const rawStock = skuIdStr ? (stockMap.get(String(skuIdStr)) || 0) : 0;
          const stockGbl = pcsPerGbl > 0 ? Math.floor(rawStock / pcsPerGbl) : rawStock;

          return {
            skuId: skuIdStr || '',
            skuCode: i.skuCode || '',
            itemName: i.itemName || '',
            category: i.category || 'Finished Goods',
            uom: i.uom || 'Pcs',
            stockGbl: skuIdStr ? stockGbl : null,
            gbl: gbl || '',
            pcsPerGbl: pcsPerGbl || '',
            totalPcs: totalQty || (Number(gbl) * Number(pcsPerGbl)),
            rate: rate || '',
            discPercent: disc || 0,
            amount: amt
          };
        }));
      }

      if (editOrder.otherCharges && Array.isArray(editOrder.otherCharges) && editOrder.otherCharges.length > 0) {
        setOtherCharges(editOrder.otherCharges);
      } else if (editOrder.freightCharges && Number(editOrder.freightCharges) > 0) {
        setOtherCharges([{ name: 'Freight / Transport', quantity: 1, rate: Number(editOrder.freightCharges), amount: Number(editOrder.freightCharges) }]);
      }
    } else {
      setSelectedCustomer(null);
      setCustomerSearch('');
      setOrderDate(new Date().toISOString().split('T')[0]);
      setPromisedDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      setCustomerPoNumber('');
      setFacility('Main Factory');
      setOrderStatus('Confirmed');
      setTransporter('Chennupati Cargo Services');
      setInternalNotes('');
      setItems([
        {
          skuId: '',
          skuCode: '',
          itemName: '',
          category: 'Finished Goods',
          uom: 'Pcs',
          stockGbl: null,
          gbl: '',
          pcsPerGbl: '',
          totalPcs: 0,
          rate: '',
          discPercent: 0,
          amount: 0
        }
      ]);
      setOtherCharges([]);
      setRowSearchTerms({});
    }
  }, [editOrder, isOpen]);

  // Update item row calculations dynamically
  const updateItemRow = (index: number, updates: Partial<OrderItemRow>) => {
    setItems(prev => {
      const copy = [...prev];
      const row = { ...copy[index], ...updates };

      const gblNum = Number(row.gbl) || 0;
      const pcsPerGblNum = Number(row.pcsPerGbl) || 0;
      const rateNum = Number(row.rate) || 0;
      const discNum = Number(row.discPercent) || 0;

      const totalPcs = gblNum * pcsPerGblNum;
      const rawAmt = totalPcs * rateNum;
      const discAmt = (rawAmt * discNum) / 100;
      const finalAmt = Math.max(0, rawAmt - discAmt);

      row.totalPcs = totalPcs;
      row.amount = finalAmt;

      copy[index] = row;
      return copy;
    });
  };

  const handleSelectSku = (index: number, sku: SkuV2) => {
    const pcsPerGbl = (sku as any).altUnitConversion || (sku as any).pages || (sku as any).sheetsPerReam || 240;
    const rawStock = stockMap.get(String(sku._id)) || 0;
    const stockGbl = pcsPerGbl > 0 ? Math.floor(rawStock / pcsPerGbl) : rawStock;
    const defaultRate = (sku as any).sellingPrice || (sku as any).price || (sku as any).standardCost || (sku as any).purchasePrice || '';

    updateItemRow(index, {
      skuId: sku._id,
      skuCode: sku.skuCode,
      itemName: sku.name,
      category: sku.category || 'Finished Goods',
      uom: sku.unit || 'Pcs',
      pcsPerGbl: pcsPerGbl,
      stockGbl: stockGbl,
      rate: defaultRate
    });

    setRowSearchTerms(prev => ({ ...prev, [index]: sku.name }));
    setActiveItemDropdownIdx(null);
  };

  const handleAddItemRow = () => {
    setItems(prev => [
      ...prev,
      {
        skuId: '',
        skuCode: '',
        itemName: '',
        category: 'Finished Goods',
        uom: 'Pcs',
        stockGbl: null,
        gbl: '',
        pcsPerGbl: '',
        totalPcs: 0,
        rate: '',
        discPercent: 0,
        amount: 0
      }
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Other Charges handlers
  const handleAddChargeRow = () => {
    setOtherCharges(prev => [
      ...prev,
      { name: 'Transport / Cargo', quantity: 1, rate: 0, amount: 0 }
    ]);
  };

  const handleUpdateChargeRow = (index: number, updates: Partial<OtherChargeItem>) => {
    setOtherCharges(prev => {
      const copy = [...prev];
      const row = { ...copy[index], ...updates };
      const q = Number(row.quantity) || 0;
      const r = Number(row.rate) || 0;
      row.amount = q * r;
      copy[index] = row;
      return copy;
    });
  };

  const handleRemoveChargeRow = (index: number) => {
    setOtherCharges(prev => prev.filter((_, i) => i !== index));
  };

  // Totals calculations
  const totals = useMemo(() => {
    const itemsTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const otherChargesTotal = otherCharges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const subtotal = itemsTotal + otherChargesTotal;
    const grandTotal = subtotal;

    return {
      itemsTotal,
      otherChargesTotal,
      subtotal,
      grandTotal
    };
  }, [items, otherCharges]);

  const handleSubmit = async (e: React.FormEvent, customStatus?: string) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrorMsg('');

    if (!selectedCustomer && !customerSearch.trim()) {
      setErrorMsg('Please select or enter a Customer / Client name');
      return;
    }

    const validItems = items.filter(i => i.itemName.trim() && Number(i.totalPcs) > 0);
    if (validItems.length === 0) {
      setErrorMsg('Please select an Item / Product and enter valid GBL & PCS quantity');
      return;
    }

    setIsSaving(true);
    try {
      const processedItems: SalesOrderItemV2[] = validItems.map(i => ({
        skuId: i.skuId || undefined,
        skuCode: i.skuCode || 'SKU-001',
        itemName: i.itemName.trim(),
        category: i.category || 'Finished Goods',
        uom: i.uom || 'Pcs',
        quantity: Number(i.totalPcs),
        gbl: Number(i.gbl) || 0,
        pcsPerGbl: Number(i.pcsPerGbl) || 1,
        unitPrice: Number(i.rate) || 0,
        discountPercent: Number(i.discPercent) || 0,
        taxableAmount: Number(i.amount) || 0,
        gstRate: 18,
        totalAmount: Number(i.amount) || 0
      }));

      const payload: Partial<SalesOrderV2> = {
        orderNumber,
        company: companyId,
        customer: selectedCustomer?._id || undefined,
        customerName: customerSearch.trim() || selectedCustomer?.firmName || 'Customer',
        orderDate,
        promisedDate,
        customerPoNumber,
        facility,
        transporter,
        otherCharges,
        internalNotes,
        billingAddress: selectedCustomer?.billingAddress || selectedCustomer?.address || {},
        shippingAddress: selectedCustomer?.shippingAddress || selectedCustomer?.billingAddress || {},
        items: processedItems,
        subtotal: totals.itemsTotal,
        freightCharges: totals.otherChargesTotal,
        grandTotal: totals.grandTotal,
        status: (customStatus || orderStatus || 'Confirmed') as any,
        materialsStatus: 'Ready',
        fulfillmentStatus: 'Not Started'
      };

      let saved: SalesOrderV2;
      if (editOrder?._id) {
        saved = await updateSalesOrderV2(editOrder._id, payload);
      } else {
        saved = await createSalesOrderV2(payload);
      }

      onSaveSuccess(saved);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.msg || err.message || 'Failed to save Sales Order');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customersList.slice(0, 30);
    const q = customerSearch.toLowerCase();
    return customersList.filter(c =>
      (c.firmName || c.ownerName || c.contactName || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.phone || c.mobile || '').includes(q)
    ).slice(0, 30);
  }, [customersList, customerSearch]);

  const getFilteredSkusForRow = (rowIdx: number) => {
    const term = (rowSearchTerms[rowIdx] !== undefined ? rowSearchTerms[rowIdx] : items[rowIdx]?.itemName || '').toLowerCase().trim();
    if (!term) return availableSkus.slice(0, 50);
    return availableSkus.filter(s =>
      (s.name || '').toLowerCase().includes(term) ||
      (s.brand || '').toLowerCase().includes(term) ||
      (s.skuCode || '').toLowerCase().includes(term)
    ).slice(0, 50);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-6xl"
      padding="p-0"
      hideCloseButton={true}
    >
      <form onSubmit={(e) => handleSubmit(e)} className="flex flex-col max-h-[90vh] overflow-hidden font-sans text-xs bg-white">
        
        {/* ── MODAL HEADER ── */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-3xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">
                  {editOrder ? `Edit Sales Order (${orderNumber})` : 'New Sales Order'}
                </h2>
                <span className="bg-blue-50 text-blue-600 text-xs px-2.5 py-0.5 rounded-full font-medium border border-blue-100">
                  {facility}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                Create a new sales order and reserve stock
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1.5 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-white" ref={dropdownContainerRef}>
          
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ── SECTION 1: CUSTOMER DETAILS ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <User className="w-4 h-4 text-blue-600" />
              <span>Customer Details</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              
              {/* Left Column: Customer Selector & Info Card (span 5) */}
              <div className="lg:col-span-5 space-y-2.5">
                <div className="relative" ref={customerRef}>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Customer <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      placeholder="Search customer firm name..."
                      className="w-full pl-8 pr-16 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-3xs"
                    />
                    <div className="absolute right-2 top-2 flex items-center gap-1 text-gray-400">
                      {customerSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomerSearch('');
                            setSelectedCustomer(null);
                          }}
                          className="p-1 hover:text-gray-600 rounded-md cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <ChevronDown 
                        className="w-4 h-4 cursor-pointer hover:text-gray-600" 
                        onClick={() => setShowCustomerDropdown(!showCustomerDropdown)} 
                      />
                    </div>
                  </div>

                  {/* Customer Dropdown Popover */}
                  {showCustomerDropdown && (
                    <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-2xl z-[999] max-h-56 overflow-y-auto divide-y divide-gray-50 p-1">
                      {filteredCustomers.map(c => (
                        <div
                          key={c._id}
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerSearch(c.firmName || c.ownerName || c.contactName);
                            setShowCustomerDropdown(false);
                          }}
                          className="p-2.5 hover:bg-blue-50/70 cursor-pointer rounded-lg transition-colors flex items-center justify-between"
                        >
                          <div>
                            <div className="font-bold text-gray-900 text-xs">{c.firmName || c.ownerName || c.contactName}</div>
                            <div className="text-[10px] text-gray-400">{c.city ? `${c.city}, ` : ''}{c.state || 'Telangana'}</div>
                          </div>
                          <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                            {c.phone || c.mobile || 'Select'}
                          </span>
                        </div>
                      ))}
                      {filteredCustomers.length === 0 && (
                        <div className="p-3 text-center text-gray-400 italic">No customers found</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Customer Details Card */}
                {selectedCustomer ? (
                  <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3 space-y-2 text-[11px] text-gray-700">
                    <div className="flex items-start gap-2">
                      <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                      <span className="font-medium text-gray-800 leading-tight">
                        {selectedCustomer.billingAddress?.addressLine1 || selectedCustomer.address || '3-1-825/25, Vinayaka Chowk'}, {selectedCustomer.city || 'Adilabad'}, {selectedCustomer.state || 'Adilabad Dist'} - {selectedCustomer.pincode || '504001'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                      <div className="flex items-center gap-1.5 text-gray-700 font-bold">
                        <Phone className="w-3.5 h-3.5 text-blue-600" />
                        <span>{selectedCustomer.phone || selectedCustomer.mobile || '9948149513'}</span>
                      </div>
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                        <MessageSquare className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                      </div>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Regular
                      </span>
                      <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        A Grade
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[10.5px] text-gray-600">
                      <div>
                        <span className="text-gray-400">Outstanding: </span>
                        <span className="font-bold text-gray-900">₹{(selectedCustomer.outstandingBalance || 12450).toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Credit Limit: </span>
                        <span className="font-bold text-gray-900">₹{(selectedCustomer.creditLimit || 100000).toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Last Order: </span>
                        <span className="font-bold text-gray-900">
                          {selectedCustomer.lastOrderDate ? new Date(selectedCustomer.lastOrderDate).toLocaleDateString('en-IN') : '15/09/2026'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50/50 border border-dashed border-slate-200 rounded-xl p-3 text-center text-gray-400 text-[11px] italic">
                    Select a customer to view address, phone, credit limit and order history
                  </div>
                )}
              </div>

              {/* Right Columns: Dates, Status, PO, Transporter (span 7) */}
              <div className="lg:col-span-7 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Order Date <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={orderDate}
                        onChange={(e) => setOrderDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs cursor-pointer"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Expected Delivery Date
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={promisedDate}
                        onChange={(e) => setPromisedDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Order Status
                    </label>
                    <select
                      value={orderStatus}
                      onChange={(e) => setOrderStatus(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs cursor-pointer"
                    >
                      <option value="Confirmed">Confirmed (Active Demand)</option>
                      <option value="Draft">Draft</option>
                      <option value="In Production">In Production</option>
                      <option value="Delivered">Delivered</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Customer PO No.
                    </label>
                    <input
                      type="text"
                      value={customerPoNumber}
                      onChange={(e) => setCustomerPoNumber(e.target.value)}
                      placeholder="e.g. PO-88492"
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Transporter
                    </label>
                    <select
                      value={transporter}
                      onChange={(e) => setTransporter(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs cursor-pointer"
                    >
                      <option value="Chennupati Cargo Services">Chennupati Cargo Services</option>
                      <option value="VRL Logistics Ltd">VRL Logistics Ltd</option>
                      <option value="Navata Road Transport">Navata Road Transport</option>
                      <option value="TCI Express">TCI Express</option>
                      <option value="Direct Factory Dispatch">Direct Factory Dispatch / Local Delivery</option>
                    </select>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* ── SECTION 2: ORDER ITEMS ── */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <Package className="w-4 h-4 text-blue-600" />
                <span>Order Items</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="px-3 py-1.5 bg-blue-50/60 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Add Product</span>
                </button>

                <button
                  type="button"
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Items Table with non-clipping container */}
            <div className="border border-gray-200 rounded-2xl shadow-3xs overflow-visible">
              <table className="w-full text-left divide-y divide-gray-200">
                <thead className="bg-gray-50/90 text-[10px] font-bold text-gray-500 uppercase tracking-wider rounded-t-2xl">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 min-w-[240px]">ITEM / PRODUCT</th>
                    <th className="py-2.5 px-3 text-center w-24">STOCK (GBL)</th>
                    <th className="py-2.5 px-3 text-center w-24">GBL <span className="text-red-500">*</span></th>
                    <th className="py-2.5 px-3 text-center w-24">PCS / GBL</th>
                    <th className="py-2.5 px-3 text-center w-24">TOTAL PCS</th>
                    <th className="py-2.5 px-3 text-center w-28">RATE (₹) <span className="text-red-500">*</span></th>
                    <th className="py-2.5 px-3 text-center w-20">DISC %</th>
                    <th className="py-2.5 px-3 text-right w-32">AMOUNT (₹)</th>
                    <th className="py-2.5 px-3 text-center w-20">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {items.map((row, idx) => {
                    const filteredRowSkus = getFilteredSkusForRow(idx);
                    const isDropdownOpen = activeItemDropdownIdx === idx;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                        
                        {/* 1. Index */}
                        <td className="py-2.5 px-3 text-center font-bold text-gray-500">
                          {idx + 1}
                        </td>

                        {/* 2. ITEM / PRODUCT (Clean Name without SKU Code, dynamic searchable combobox) */}
                        <td className="py-2 px-3 relative">
                          <div className="relative">
                            <div className="relative flex items-center">
                              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
                              <input
                                type="text"
                                value={rowSearchTerms[idx] !== undefined ? rowSearchTerms[idx] : row.itemName}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRowSearchTerms(prev => ({ ...prev, [idx]: val }));
                                  setActiveItemDropdownIdx(idx);
                                }}
                                onFocus={() => {
                                  setActiveItemDropdownIdx(idx);
                                  if (rowSearchTerms[idx] === undefined) {
                                    setRowSearchTerms(prev => ({ ...prev, [idx]: row.itemName }));
                                  }
                                }}
                                placeholder="Search product / SKU..."
                                className="w-full pl-8 pr-8 py-1.5 bg-white border border-gray-200 hover:border-blue-400 focus:border-blue-500 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-3xs"
                              />
                              <ChevronDown 
                                className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-2.5 cursor-pointer hover:text-gray-600"
                                onClick={() => setActiveItemDropdownIdx(isDropdownOpen ? null : idx)}
                              />
                            </div>

                            {/* Dropdown Menu Popover */}
                            {isDropdownOpen && (
                              <div className="absolute left-0 top-full mt-1.5 w-84 bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] max-h-60 overflow-y-auto divide-y divide-gray-50 p-1.5 animate-in fade-in zoom-in-95 duration-100">
                                {filteredRowSkus.map(sku => (
                                  <div
                                    key={sku._id}
                                    onClick={() => handleSelectSku(idx, sku)}
                                    className="p-2.5 hover:bg-blue-50/80 cursor-pointer rounded-lg transition-colors flex items-center justify-between group"
                                  >
                                    <div className="truncate pr-2">
                                      <div className="font-bold text-gray-900 text-xs truncate group-hover:text-blue-700">
                                        {sku.name}
                                      </div>
                                      <div className="text-[10px] text-gray-400 mt-0.5">
                                        {sku.category || 'Finished Goods'} • Unit: {sku.unit || 'Pcs'}
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md font-black">
                                        ₹{(sku as any).sellingPrice || (sku as any).price || (sku as any).standardCost || (sku as any).purchasePrice || 23}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                                {filteredRowSkus.length === 0 && (
                                  <div className="p-3 text-center text-gray-400 italic text-[11px]">
                                    {availableSkus.length === 0 ? 'No active products found in Item Master' : 'No matching products'}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 3. STOCK (GBL) */}
                        <td className="py-2 px-3 text-center font-bold text-gray-700">
                          {row.stockGbl !== null ? (
                            <span className="inline-block px-2.5 py-0.5 bg-slate-100 rounded-lg text-gray-800 font-extrabold text-[11px]">
                              {row.stockGbl}
                            </span>
                          ) : (
                            <span className="text-gray-400 font-normal">—</span>
                          )}
                        </td>

                        {/* 4. GBL * */}
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="1"
                            value={row.gbl}
                            onChange={(e) => updateItemRow(idx, { gbl: e.target.value })}
                            placeholder="Qty"
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-center font-extrabold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs"
                            required
                          />
                        </td>

                        {/* 5. PCS / GBL */}
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="1"
                            value={row.pcsPerGbl}
                            onChange={(e) => updateItemRow(idx, { pcsPerGbl: e.target.value })}
                            placeholder="240"
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-center font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs"
                          />
                        </td>

                        {/* 6. TOTAL PCS */}
                        <td className="py-2 px-3 text-center font-extrabold text-gray-900 text-xs">
                          {row.totalPcs > 0 ? row.totalPcs.toLocaleString('en-IN') : '0'}
                        </td>

                        {/* 7. RATE (₹) * */}
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.rate}
                            onChange={(e) => updateItemRow(idx, { rate: e.target.value })}
                            placeholder="0.00"
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-center font-extrabold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs"
                            required
                          />
                        </td>

                        {/* 8. DISC % */}
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={row.discPercent}
                            onChange={(e) => updateItemRow(idx, { discPercent: e.target.value })}
                            className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-xl text-center font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs"
                          />
                        </td>

                        {/* 9. AMOUNT (₹) */}
                        <td className="py-2 px-3 text-right font-black text-gray-900 text-xs">
                          {row.amount > 0 
                            ? row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : '0.00'
                          }
                        </td>

                        {/* 10. ACTIONS */}
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setActiveItemDropdownIdx(isDropdownOpen ? null : idx)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Select product from Item Master"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(idx)}
                              disabled={items.length <= 1}
                              className="p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-30 rounded-lg transition-colors cursor-pointer"
                              title="Delete row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── SECTION 3: OTHER CHARGES & ORDER SUMMARY (2 COLUMNS) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
            
            {/* Left Column: Other Charges & Notes (span 7) */}
            <div className="lg:col-span-7 space-y-4">
              
              {/* Other Charges Card */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                    <Coins className="w-4 h-4 text-blue-600" />
                    <span>Other Charges (Optional)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddChargeRow}
                    className="text-blue-600 hover:text-blue-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Add Charge</span>
                  </button>
                </div>

                {otherCharges.length > 0 ? (
                  <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-3xs">
                    <table className="w-full text-left divide-y divide-gray-200">
                      <thead className="bg-gray-50/90 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        <tr>
                          <th className="py-2 px-3 w-8 text-center">#</th>
                          <th className="py-2 px-3">CHARGE NAME</th>
                          <th className="py-2 px-3 text-center w-20">QTY</th>
                          <th className="py-2 px-3 text-center w-24">RATE (₹)</th>
                          <th className="py-2 px-3 text-right w-28">AMOUNT (₹)</th>
                          <th className="py-2 px-3 text-center w-16">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {otherCharges.map((charge, cIdx) => (
                          <tr key={cIdx} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2 px-3 text-center font-bold text-gray-500">
                              {cIdx + 1}
                            </td>
                            <td className="py-1.5 px-3">
                              <input
                                type="text"
                                value={charge.name}
                                onChange={(e) => handleUpdateChargeRow(cIdx, { name: e.target.value })}
                                placeholder="Transport / Cargo"
                                className="w-full px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-900 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              />
                            </td>
                            <td className="py-1.5 px-3">
                              <input
                                type="number"
                                min="1"
                                value={charge.quantity}
                                onChange={(e) => handleUpdateChargeRow(cIdx, { quantity: Number(e.target.value) || 0 })}
                                className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-center text-xs font-extrabold text-gray-900 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              />
                            </td>
                            <td className="py-1.5 px-3">
                              <input
                                type="number"
                                min="0"
                                value={charge.rate}
                                onChange={(e) => handleUpdateChargeRow(cIdx, { rate: Number(e.target.value) || 0 })}
                                className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-center text-xs font-extrabold text-gray-900 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              />
                            </td>
                            <td className="py-1.5 px-3 text-right font-black text-gray-900">
                              {charge.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveChargeRow(cIdx)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl text-center text-gray-400 text-[11px] italic">
                    No additional charges added. Click "+ Add Charge" to add freight, cargo or packaging expenses.
                  </div>
                )}
              </div>

              {/* Notes / Instructions Card */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Notes / Instructions</span>
                </div>
                <div className="relative">
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Add special packaging, freight, or delivery instructions..."
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs resize-none"
                  />
                  <div className="absolute right-3 bottom-2 text-[10px] text-gray-400 font-mono">
                    {internalNotes.length}/500
                  </div>
                </div>
              </div>

            </div>

            {/* Right Column: Order Summary Card (span 5) */}
            <div className="lg:col-span-5">
              <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 space-y-3.5 shadow-3xs">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                  <Receipt className="w-4 h-4 text-blue-600" />
                  <span>Order Summary</span>
                </div>

                <div className="space-y-2 text-xs font-medium text-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Items Total</span>
                    <span className="font-extrabold text-gray-900">
                      ₹{totals.itemsTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Other Charges</span>
                    <span className="font-extrabold text-gray-900">
                      ₹{totals.otherChargesTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
                    <span className="font-bold text-gray-900">Subtotal</span>
                    <span className="font-extrabold text-gray-900">
                      ₹{totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-sm font-extrabold text-gray-900">Grand Total</span>
                  <span className="text-lg font-black text-blue-600">
                    ₹{totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* ── MODAL FOOTER ── */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50/70 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-xl font-bold text-xs shadow-3xs transition-all cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isSaving}
              onClick={(e) => handleSubmit(e, 'Draft')}
              className="px-4 py-2 bg-white border border-blue-600 text-blue-600 hover:bg-blue-50/70 rounded-xl font-bold text-xs shadow-3xs transition-all cursor-pointer disabled:opacity-50"
            >
              Save as Draft
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              <span>{isSaving ? 'Creating Order...' : (editOrder ? 'Update Sales Order' : 'Create Sales Order')}</span>
            </button>
          </div>
        </div>

      </form>
    </Modal>
  );
};

export default SalesOrderDrawerV2;

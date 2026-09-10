import React, { useState, useEffect, useRef } from 'react';
import { Save, Plus, Trash2, Search, ChevronDown, Calendar, User, Package, AlertCircle, FileText, Check, Percent } from 'lucide-react';
import Modal from '../ui/Modal';
import { getSkusV2, getBalancesV2, SkuV2 } from '../../api/mfgApiV2';
import { getParties } from '../../api/partyApi';
import { createSalesOrderV2, updateSalesOrderV2, getNextSalesOrderNumberV2, SalesOrderV2, SalesOrderItemV2 } from '../../api/salesOrderApiV2';

interface SalesOrderDrawerV2Props {
  isOpen: boolean;
  companyId: string;
  companyState?: string;
  editOrder?: SalesOrderV2 | null;
  onClose: () => void;
  onSaveSuccess: (savedOrder: SalesOrderV2) => void;
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
  const [internalNotes, setInternalNotes] = useState('');
  const [status, setStatus] = useState<'Confirmed' | 'Draft'>('Confirmed');
  const [freightCharges, setFreightCharges] = useState<string>('0');

  const [availableSkus, setAvailableSkus] = useState<SkuV2[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());

  const [items, setItems] = useState<SalesOrderItemV2[]>([
    { skuCode: '', itemName: '', uom: 'Pcs', quantity: 1, unitPrice: 0, discountPercent: 0, taxableAmount: 0, gstRate: 18, totalAmount: 0 }
  ]);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const customerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && companyId) {
      // 1. Fetch SKUs and Balances
      Promise.all([
        getSkusV2(companyId).catch(() => []),
        getBalancesV2(companyId).catch(() => []),
        getParties({ company: companyId, type: 'customer', limit: 1000, light: true }).catch(() => ({ data: { parties: [] } }))
      ]).then(([skus, balances, partiesRes]) => {
        setAvailableSkus(skus || []);
        
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
      setInternalNotes(editOrder.internalNotes || '');
      setStatus(editOrder.status === 'Draft' ? 'Draft' : 'Confirmed');
      setFreightCharges(String(editOrder.freightCharges || 0));

      if (editOrder.items && editOrder.items.length > 0) {
        setItems(editOrder.items.map(i => ({
          skuId: i.skuId,
          skuCode: i.skuCode,
          itemName: i.itemName,
          uom: i.uom || 'Pcs',
          quantity: Number(i.quantity) || 1,
          unitPrice: Number(i.unitPrice) || 0,
          discountPercent: Number(i.discountPercent) || 0,
          taxableAmount: Number(i.taxableAmount) || 0,
          gstRate: Number(i.gstRate) || 18,
          totalAmount: Number(i.totalAmount) || 0
        })));
      }
    } else {
      setSelectedCustomer(null);
      setCustomerSearch('');
      setOrderDate(new Date().toISOString().split('T')[0]);
      setPromisedDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      setCustomerPoNumber('');
      setFacility('Main Factory');
      setInternalNotes('');
      setStatus('Confirmed');
      setFreightCharges('0');
      setItems([{ skuCode: '', itemName: '', uom: 'Pcs', quantity: 1, unitPrice: 0, discountPercent: 0, taxableAmount: 0, gstRate: 18, totalAmount: 0 }]);
    }
  }, [editOrder, isOpen]);

  const isInterstate = React.useMemo(() => {
    if (!selectedCustomer) return false;
    const custState = (selectedCustomer.state || selectedCustomer.billingAddress?.state || '').trim().toLowerCase();
    const compState = (companyState || 'Maharashtra').trim().toLowerCase();
    return custState && compState && custState !== compState;
  }, [selectedCustomer, companyState]);

  // Recalculate line item financials
  const updateLineItem = (index: number, updates: Partial<SalesOrderItemV2>) => {
    setItems(prev => {
      const copy = [...prev];
      const current = { ...copy[index], ...updates };
      
      const qty = Number(current.quantity) || 0;
      const price = Number(current.unitPrice) || 0;
      const disc = Number(current.discountPercent) || 0;
      const gst = Number(current.gstRate) || 0;

      const rawTotal = qty * price;
      const discountAmt = (rawTotal * disc) / 100;
      const taxable = Math.max(0, rawTotal - discountAmt);
      const gstAmt = (taxable * gst) / 100;

      if (isInterstate) {
        current.igstAmount = gstAmt;
        current.cgstAmount = 0;
        current.sgstAmount = 0;
      } else {
        current.cgstAmount = gstAmt / 2;
        current.sgstAmount = gstAmt / 2;
        current.igstAmount = 0;
      }

      current.taxableAmount = taxable;
      current.totalAmount = taxable + gstAmt;

      copy[index] = current;
      return copy;
    });
  };

  const handleSelectSku = (index: number, sku: SkuV2) => {
    updateLineItem(index, {
      skuId: sku._id,
      skuCode: sku.skuCode,
      itemName: sku.name,
      category: sku.category,
      uom: sku.unit || 'Pcs',
      altUnit: sku.altUnit || '',
      altUnitConversion: sku.altUnitConversion || 1,
      unitPrice: (sku as any).sellingPrice || (sku as any).price || 0
    });
  };

  const handleAddItemRow = () => {
    setItems(prev => [
      ...prev,
      { skuCode: '', itemName: '', uom: 'Pcs', quantity: 1, unitPrice: 0, discountPercent: 0, taxableAmount: 0, gstRate: 18, totalAmount: 0 }
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const totals = React.useMemo(() => {
    const subtotal = items.reduce((s, i) => s + (i.taxableAmount || 0), 0);
    const totalCgst = items.reduce((s, i) => s + (i.cgstAmount || 0), 0);
    const totalSgst = items.reduce((s, i) => s + (i.sgstAmount || 0), 0);
    const totalIgst = items.reduce((s, i) => s + (i.igstAmount || 0), 0);
    const freight = Number(freightCharges) || 0;
    const grandTotal = subtotal + totalCgst + totalSgst + totalIgst + freight;
    return { subtotal, totalCgst, totalSgst, totalIgst, freight, grandTotal };
  }, [items, freightCharges]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerSearch.trim()) {
      setErrorMsg('Customer / Client Name is required');
      return;
    }

    const validItems = items.filter(i => i.itemName.trim() && i.quantity > 0);
    if (validItems.length === 0) {
      setErrorMsg('Please add at least one valid line item with quantity > 0');
      return;
    }

    setErrorMsg('');
    setIsSaving(true);

    try {
      const payload: Partial<SalesOrderV2> = {
        orderNumber,
        company: companyId,
        customer: selectedCustomer?._id || undefined,
        customerName: customerSearch.trim(),
        orderDate,
        promisedDate,
        customerPoNumber,
        facility,
        internalNotes,
        billingAddress: selectedCustomer?.billingAddress || {},
        shippingAddress: selectedCustomer?.shippingAddress || {},
        isInterstate,
        items: validItems,
        subtotal: totals.subtotal,
        totalCgst: totals.totalCgst,
        totalSgst: totals.totalSgst,
        totalIgst: totals.totalIgst,
        freightCharges: totals.freight,
        grandTotal: totals.grandTotal,
        status: status || 'Confirmed',
        materialsStatus: 'Ready',
        fulfillmentStatus: 'Not Started'
      };

      let saved;
      if (editOrder?._id) {
        saved = await updateSalesOrderV2(editOrder._id, payload);
      } else {
        saved = await createSalesOrderV2(payload);
      }

      onSaveSuccess(saved);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.msg || 'Failed to save Sales Order');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredCustomers = customersList.filter(c =>
    (c.firmName || c.contactName || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.gstin || '').toLowerCase().includes(customerSearch.toLowerCase())
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="max-w-5xl"
      title={
        <div className="flex items-center gap-3 text-left">
          <div className="p-2 bg-blue-50 text-blue-700 rounded-xl border border-blue-200">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900">
                {editOrder ? `Edit Sales Order (${orderNumber})` : 'New Sales Order'}
              </h3>
              <span className="bg-blue-100 text-blue-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-blue-200">
                {facility}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium">Replicating Makoro ERP & Tally Demand Order Voucher</p>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-left text-xs font-sans">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ── SECTION 1: HEADER & CLIENT INFO ── */}
        <div className="bg-gray-50/70 border border-gray-200/80 rounded-2xl p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Client Selector */}
            <div className="sm:col-span-1 relative" ref={customerRef}>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                CLIENT / CUSTOMER *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="Search customer firm name..."
                  className="w-full pl-8 pr-8 py-2 bg-white border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
                <User className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-2.5 cursor-pointer" onClick={() => setShowCustomerDropdown(!showCustomerDropdown)} />
              </div>

              {showCustomerDropdown && (
                <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-2xl z-[99] max-h-56 overflow-y-auto divide-y divide-gray-50 p-1">
                  {filteredCustomers.map(c => (
                    <div
                      key={c._id}
                      onClick={() => {
                        setSelectedCustomer(c);
                        setCustomerSearch(c.firmName || c.contactName);
                        setShowCustomerDropdown(false);
                      }}
                      className="p-2 hover:bg-blue-50 cursor-pointer rounded-lg transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-gray-900">{c.firmName || c.contactName}</div>
                        <div className="text-[10px] text-gray-400">{c.gstin ? `GST: ${c.gstin}` : (c.city || 'No GSTIN')}</div>
                      </div>
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{c.state || 'MH'}</span>
                    </div>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <div className="p-2 text-center text-gray-400 italic">No customers found</div>
                  )}
                </div>
              )}
            </div>

            {/* Order Date & Delivery Date */}
            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">ORDER DATE</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">PROMISED DELIVERY DATE</label>
              <input
                type="date"
                value={promisedDate}
                onChange={(e) => setPromisedDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">CUSTOMER PO NO.</label>
              <input
                type="text"
                placeholder="e.g. PO-88492"
                value={customerPoNumber}
                onChange={(e) => setCustomerPoNumber(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">FACILITY / UNIT</label>
              <select
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl font-semibold text-gray-800 cursor-pointer focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="Main Factory">Main Factory</option>
                <option value="Unit 2 - Press & Binding">Unit 2 - Press & Binding</option>
                <option value="Warehouse Bay A">Warehouse Bay A</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">ORDER STATUS</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl font-semibold text-gray-800 cursor-pointer focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="Confirmed">Confirmed (Active Demand)</option>
                <option value="Draft">Draft</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── SECTION 2: ORDERED PRODUCTS GRID ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              <span>Ordered Products ({items.length})</span>
            </h4>
            <button
              type="button"
              onClick={handleAddItemRow}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Row</span>
            </button>
          </div>

          <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
            <table className="w-full text-left divide-y divide-gray-200">
              <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Item / Product</th>
                  <th className="py-2.5 px-3">Live Stock</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 px-3 text-right">Rate (₹)</th>
                  <th className="py-2.5 px-3 text-right">Disc %</th>
                  <th className="py-2.5 px-3 text-right">GST %</th>
                  <th className="py-2.5 px-3 text-right">Total (₹)</th>
                  <th className="py-2.5 px-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {items.map((item, idx) => {
                  const sId = typeof item.skuId === 'object' ? item.skuId._id : item.skuId;
                  const liveStock = sId ? (stockMap.get(String(sId)) || 0) : 0;
                  const isLowStock = liveStock < (item.quantity || 1);

                  return (
                    <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                      {/* Product Selector */}
                      <td className="py-2 px-3">
                        <select
                          value={sId || ''}
                          onChange={(e) => {
                            const found = availableSkus.find(s => s._id === e.target.value);
                            if (found) handleSelectSku(idx, found);
                          }}
                          className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                          <option value="">-- Select Product / SKU --</option>
                          {availableSkus.map(s => (
                            <option key={s._id} value={s._id}>
                              [{s.skuCode}] {s.name} ({s.unit})
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Live Stock Indicator */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isLowStock ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {liveStock} {item.uom || 'Pcs'} {isLowStock ? '(Low)' : '(Avail)'}
                        </span>
                      </td>

                      {/* Qty */}
                      <td className="py-2 px-3 text-right w-24">
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(idx, { quantity: Number(e.target.value) })}
                          className="w-full text-right px-2 py-1 bg-white border border-gray-200 rounded-lg font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </td>

                      {/* Rate */}
                      <td className="py-2 px-3 text-right w-28">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItem(idx, { unitPrice: Number(e.target.value) })}
                          className="w-full text-right px-2 py-1 bg-white border border-gray-200 rounded-lg font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </td>

                      {/* Discount % */}
                      <td className="py-2 px-3 text-right w-20">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={item.discountPercent || 0}
                          onChange={(e) => updateLineItem(idx, { discountPercent: Number(e.target.value) })}
                          className="w-full text-right px-2 py-1 bg-white border border-gray-200 rounded-lg font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </td>

                      {/* GST % */}
                      <td className="py-2 px-3 text-right w-20">
                        <select
                          value={item.gstRate || 18}
                          onChange={(e) => updateLineItem(idx, { gstRate: Number(e.target.value) })}
                          className="w-full text-right px-1.5 py-1 bg-white border border-gray-200 rounded-lg font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                          <option value={18}>18%</option>
                          <option value={12}>12%</option>
                          <option value={5}>5%</option>
                          <option value={0}>0%</option>
                        </select>
                      </td>

                      {/* Total */}
                      <td className="py-2 px-3 text-right font-bold text-gray-900 w-32">
                        ₹{(item.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Action */}
                      <td className="py-2 px-2 text-center w-10">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          disabled={items.length <= 1}
                          className="text-gray-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SECTION 3: NOTES & TOTALS FOOTER ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Notes & Freight */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">INTERNAL NOTES / SPECIAL INSTRUCTIONS</label>
              <textarea
                rows={3}
                placeholder="Add special packaging, freight, or delivery instructions..."
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-gray-700">Freight / Transport Charges (₹):</label>
              <input
                type="number"
                min="0"
                value={freightCharges}
                onChange={(e) => setFreightCharges(e.target.value)}
                className="w-32 px-2.5 py-1 bg-white border border-gray-200 rounded-xl text-right font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Financial Summary Card */}
          <div className="bg-gray-50/90 border border-gray-200 rounded-2xl p-4 space-y-2 text-right">
            <div className="flex items-center justify-between text-gray-600 font-medium">
              <span>Subtotal (Taxable):</span>
              <span className="font-bold text-gray-900">₹{totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>

            {isInterstate ? (
              <div className="flex items-center justify-between text-gray-600 font-medium">
                <span>IGST:</span>
                <span className="font-bold text-gray-900">₹{totals.totalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-gray-600 font-medium">
                  <span>CGST:</span>
                  <span className="font-bold text-gray-900">₹{totals.totalCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex items-center justify-between text-gray-600 font-medium">
                  <span>SGST:</span>
                  <span className="font-bold text-gray-900">₹{totals.totalSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </>
            )}

            {totals.freight > 0 && (
              <div className="flex items-center justify-between text-gray-600 font-medium">
                <span>Freight Charges:</span>
                <span className="font-bold text-gray-900">₹{totals.freight.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            <div className="pt-2 border-t border-gray-200 flex items-center justify-between text-sm font-black text-blue-900">
              <span>Grand Total:</span>
              <span className="text-base text-blue-700">₹{totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : editOrder ? 'Update Order' : 'Create Sales Order'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default SalesOrderDrawerV2;

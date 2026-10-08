import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, FileText, Truck, Package, CheckCircle2, AlertTriangle, AlertCircle, Printer,
  Edit3, MapPin, Phone, Save, Plus, Trash2, Calendar, Search,
  ChevronDown, Building, RefreshCw, Check, IndianRupee, Percent
} from 'lucide-react';
import { SalesInvoice, InvoiceItem, AdditionalCharge, createInvoice, updateInvoice, getNextInvoiceNumber } from '../../api/invoiceApi';
import { getDeliveryChallans, updateDeliveryChallan } from '../../api/deliveryChallanApi';
import { getWarehouseHierarchyV2, WarehouseLocationV2, getSkusV2 } from '../../api/mfgApiV2';
import { getParties } from '../../api/partyApi';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../ui/Toast';
import { DispatchDeliveryRecord } from './invoiceSampleData';

// Safe string converter to prevent 'Cannot convert object to primitive value'
const toSafeString = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    if (val._id) return toSafeString(val._id);
    if (val.id) return toSafeString(val.id);
    if (val.name) return toSafeString(val.name);
    if (val.skuCode) return toSafeString(val.skuCode);
    try {
      if (typeof val.toString === 'function') {
        const str = val.toString();
        if (str !== '[object Object]') return str;
      }
    } catch {}
    try {
      return JSON.stringify(val);
    } catch {
      return '';
    }
  }
  return '';
};

export interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDispatch?: DispatchDeliveryRecord | null;
  allDeliveries?: DispatchDeliveryRecord[];
  editingInvoice?: SalesInvoice | null;
  isDirectInvoice?: boolean;
  onInvoiceCreated: (invoice: SalesInvoice) => void;
}

interface InvoiceItemRow {
  key: string;
  itemId?: string;
  skuId?: any;
  skuCode?: string;
  itemName: string;
  uom: string;
  pcsPerGbl: number;
  dispatchedGbl: number;
  dispatchedPcs: number;
  invoiceQtyGbl: number;
  invoiceQtyPcs: number;
  locationId?: string;
  locationName?: string;
  locationPath?: string;
  rate: number;
  discountPct: number;
  taxableAmount: number;
  gstRate: number; // e.g. 12 or 18%
  gstAmount: number;
  totalAmount: number;
  selected: boolean;
}

export const CreateInvoiceModal: React.FC<CreateInvoiceModalProps> = ({
  isOpen,
  onClose,
  initialDispatch,
  allDeliveries = [],
  editingInvoice,
  isDirectInvoice = false,
  onInvoiceCreated
}) => {
  const { selectedCompany } = useAuth();
  const checkboxRef = useRef<HTMLInputElement>(null);

  // Invoice Mode: 'challan' (Linked to DC) | 'direct' (Standalone Invoice)
  const isEditing = Boolean(editingInvoice);
  const [invoiceMode, setInvoiceMode] = useState<'challan' | 'direct'>(() => {
    if (editingInvoice) {
      return (!editingInvoice.dispatchNumber || editingInvoice.dispatchNumber === 'DIRECT') ? 'direct' : 'challan';
    }
    return isDirectInvoice || !initialDispatch ? 'direct' : 'challan';
  });

  // Selected Delivery Challan for Challan Mode
  const [selectedDcNo, setSelectedDcNo] = useState<string>(() => {
    return editingInvoice?.dispatchNumber || initialDispatch?.dispatchNo || (allDeliveries[0]?.dispatchNo || '');
  });

  const activeDispatch = useMemo(() => {
    if (invoiceMode === 'direct') return null;
    return allDeliveries.find(d => d.dispatchNo === selectedDcNo) || initialDispatch || null;
  }, [allDeliveries, selectedDcNo, initialDispatch, invoiceMode]);

  // Parties & Master SKUs
  const [partyOptions, setPartyOptions] = useState<any[]>([]);
  const [availableSkus, setAvailableSkus] = useState<any[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState('');

  // Top details
  const [fetchedInvoiceNo, setFetchedInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentTerms, setPaymentTerms] = useState(editingInvoice?.paymentTerms || '30 Days');
  const [dueDate, setDueDate] = useState(editingInvoice?.dueDate || '');

  // Party info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');

  // Transport & Delivery info
  const [dispatchNo, setDispatchNo] = useState('');
  const [dispatchDate, setDispatchDate] = useState('');
  const [salesOrderNo, setSalesOrderNo] = useState('');
  const [transporter, setTransporter] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [lrDate, setLrDate] = useState('');

  // Address
  const [billToAddress, setBillToAddress] = useState('');
  const [shipToAddress, setShipToAddress] = useState('');
  const [sameAsBillTo, setSameAsBillTo] = useState(true);
  const [editBillTo, setEditBillTo] = useState(false);
  const [editShipTo, setEditShipTo] = useState(false);

  // Items & Charges
  const [itemRows, setItemRows] = useState<InvoiceItemRow[]>([]);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [roundOff, setRoundOff] = useState<number>(0);
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch Next Invoice Number
  useEffect(() => {
    if (!isOpen) return;
    if (editingInvoice?.invoiceNumber) {
      setFetchedInvoiceNo(editingInvoice.invoiceNumber);
      return;
    }
    const compId = selectedCompany?._id;
    getNextInvoiceNumber(compId)
      .then(seq => { if (seq) setFetchedInvoiceNo(seq); })
      .catch(() => {
        const cKey = `skbw_sales_invoices_${compId || 'default'}`;
        const stored = JSON.parse(localStorage.getItem(cKey) || '[]');
        let maxNum = 0;
        stored.forEach((inv: any) => {
          if (inv.invoiceNumber) {
            const match = inv.invoiceNumber.match(/^(?:INV)-?([0-9]+)$/i);
            if (match && match[1]) {
              const num = parseInt(match[1], 10);
              if (num > maxNum) maxNum = num;
            }
          }
        });
        setFetchedInvoiceNo(`INV-${String(maxNum + 1).padStart(3, '0')}`);
      });
  }, [isOpen, editingInvoice, selectedCompany?._id]);

  const invoiceNumber = useMemo(() => {
    if (editingInvoice?.invoiceNumber) return editingInvoice.invoiceNumber;
    return fetchedInvoiceNo || 'INV-001';
  }, [editingInvoice, fetchedInvoiceNo]);

  // Load parties & SKUs
  useEffect(() => {
    if (!isOpen) return;
    const compId = selectedCompany?._id;
    if (!compId) return;

    Promise.all([
      getSkusV2(compId).catch(() => []),
      getParties({ company: compId, limit: 1000, light: true }).catch(() => ({ data: [] }))
    ]).then(([skus, partiesRes]) => {
      setAvailableSkus(Array.isArray(skus) ? skus : []);
      const pList = Array.isArray(partiesRes?.data) ? partiesRes.data : (Array.isArray(partiesRes) ? partiesRes : []);
      setPartyOptions(pList);
    });
  }, [isOpen, selectedCompany?._id]);

  // Auto-fill fields from active delivery challan or editing invoice
  useEffect(() => {
    if (!isOpen) return;

    if (editingInvoice) {
      setCustomerName(editingInvoice.customerName || '');
      setCustomerPhone(editingInvoice.customerPhone || '');
      setRegion(editingInvoice.region || '');
      setCity(editingInvoice.city || '');
      setDispatchNo(editingInvoice.dispatchNumber || '');
      setDispatchDate(editingInvoice.dispatchDate || '');
      setSalesOrderNo(editingInvoice.orderNumber || '');
      setTransporter(editingInvoice.transporterName || '');
      setVehicleNumber(editingInvoice.vehicleNumber || '');
      setLrNumber(editingInvoice.lrNumber || '');
      setLrDate(editingInvoice.lrDate || '');
      setPaymentTerms(editingInvoice.paymentTerms || '30 Days');
      setDueDate(editingInvoice.dueDate || '');
      setRemarks(editingInvoice.remarks || '');
      setSameAsBillTo(editingInvoice.sameAsBillTo ?? true);
      setAdditionalCharges(editingInvoice.additionalCharges || []);

      const billStr = typeof editingInvoice.billTo === 'string' 
        ? editingInvoice.billTo 
        : `${editingInvoice.billTo?.name || editingInvoice.customerName}\n${editingInvoice.billTo?.address || ''}\n${editingInvoice.billTo?.city || ''}${editingInvoice.billTo?.state ? ', ' + editingInvoice.billTo.state : ''} - ${editingInvoice.billTo?.pincode || ''}`;
      setBillToAddress(billStr);

      const shipStr = typeof editingInvoice.shipTo === 'string'
        ? editingInvoice.shipTo
        : `${editingInvoice.shipTo?.name || editingInvoice.customerName}\n${editingInvoice.shipTo?.address || ''}\n${editingInvoice.shipTo?.city || ''}${editingInvoice.shipTo?.state ? ', ' + editingInvoice.shipTo.state : ''} - ${editingInvoice.shipTo?.pincode || ''}`;
      setShipToAddress(shipStr);

      const rows: InvoiceItemRow[] = (editingInvoice.items || []).map((it, idx) => {
        const rate = Number(it.rate) || 0;
        const qtyGbl = Number(it.invoiceQtyGbl || it.dispatchedGbl || 1);
        const taxable = qtyGbl * rate;
        const gstRate = (it as any).gstRate || 12;
        const gstAmount = taxable * (gstRate / 100);
        return {
          key: `edit-${idx}-${Date.now()}`,
          itemId: it.itemId,
          skuId: it.skuId,
          skuCode: it.skuCode,
          itemName: it.itemName,
          uom: it.uom || 'GBL',
          pcsPerGbl: Number(it.pcsPerGbl) || 100,
          dispatchedGbl: Number(it.dispatchedGbl) || qtyGbl,
          dispatchedPcs: Number(it.dispatchedPcs) || (qtyGbl * 100),
          invoiceQtyGbl: qtyGbl,
          invoiceQtyPcs: Number(it.invoiceQtyPcs) || (qtyGbl * 100),
          locationId: it.locationId,
          locationName: it.locationName || 'Main Storage',
          rate,
          discountPct: (it as any).discountPct || 0,
          taxableAmount: taxable,
          gstRate,
          gstAmount,
          totalAmount: taxable + gstAmount,
          selected: true
        };
      });
      setItemRows(rows);
      return;
    }

    if (invoiceMode === 'challan' && activeDispatch) {
      setCustomerName(activeDispatch.customerName || '');
      setCustomerPhone(activeDispatch.customerPhone || '');
      setRegion(activeDispatch.region || '');
      setCity(activeDispatch.city || '');
      setDispatchNo(activeDispatch.dispatchNo || '');
      setDispatchDate(activeDispatch.dispatchDate || '');
      setSalesOrderNo(activeDispatch.orderNumber || '');
      setTransporter(activeDispatch.transporterName || '');
      setVehicleNumber(activeDispatch.vehicleNumber || '');
      setLrNumber(activeDispatch.lrNumber || '');
      setLrDate(activeDispatch.lrDate || '');

      const bAddr = activeDispatch.billToAddress;
      const bStr = typeof bAddr === 'string'
        ? bAddr
        : `${bAddr?.name || activeDispatch.customerName}\n${bAddr?.address || 'Main Road'}\n${bAddr?.city || activeDispatch.city || ''}${bAddr?.state ? ', ' + bAddr.state : ''} - ${bAddr?.pincode || '—'}`;
      setBillToAddress(bStr);

      const sAddr = activeDispatch.shipToAddress;
      const sStr = typeof sAddr === 'string'
        ? sAddr
        : `${sAddr?.name || activeDispatch.customerName}\n${sAddr?.address || 'Main Road'}\n${sAddr?.city || activeDispatch.city || ''}${sAddr?.state ? ', ' + sAddr.state : ''} - ${sAddr?.pincode || '—'}`;
      setShipToAddress(sStr);

      const rows: InvoiceItemRow[] = (activeDispatch.items || []).map((it, idx) => {
        const qtyGbl = Number(it.dispatchedGbl) || 1;
        const pcsPerGbl = Number((it as any).pcsPerGbl) || Math.round(Number(it.dispatchedPcs || 0) / qtyGbl) || 100;
        
        const itemCodeKey = (it.itemCode || (it as any).skuCode || '').toLowerCase().trim();
        const itemNameKey = (it.itemName || (it as any).description || '').toLowerCase().trim();
        const matchedSku = availableSkus.find(s => {
          const c = (s.skuCode || '').toLowerCase().trim();
          const n = (s.name || '').toLowerCase().trim();
          return (itemCodeKey && c === itemCodeKey) || (itemNameKey && n === itemNameKey);
        });
        const masterRate = matchedSku ? Number(matchedSku.sellingPrice || matchedSku.price || matchedSku.rate || 0) : 0;
        const rate = Number(it.rate || (it as any).price || (it as any).unitPrice || masterRate || 0);

        const taxable = qtyGbl * rate;
        const gstRate = 12; // Standard stationery GST
        const gstAmount = taxable * (gstRate / 100);

        return {
          key: `dc-item-${idx}-${Date.now()}`,
          skuCode: it.itemCode,
          itemName: it.itemName,
          uom: it.uom || 'GBL',
          pcsPerGbl,
          dispatchedGbl: qtyGbl,
          dispatchedPcs: Number(it.dispatchedPcs) || (qtyGbl * pcsPerGbl),
          invoiceQtyGbl: qtyGbl,
          invoiceQtyPcs: Number(it.dispatchedPcs) || (qtyGbl * pcsPerGbl),
          locationName: it.locationName || 'Main Storage',
          rate,
          discountPct: 0,
          taxableAmount: taxable,
          gstRate,
          gstAmount,
          totalAmount: taxable + gstAmount,
          selected: true
        };
      });

      setItemRows(rows);
    } else if (invoiceMode === 'direct') {
      if (itemRows.length === 0) {
        handleAddNewDirectItem();
      }
    }
  }, [isOpen, editingInvoice, invoiceMode, activeDispatch]);

  // Handle adding new item in direct invoice mode
  const handleAddNewDirectItem = () => {
    const newKey = `dir-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newRow: InvoiceItemRow = {
      key: newKey,
      skuCode: '',
      itemName: '',
      uom: 'GBL',
      pcsPerGbl: 100,
      dispatchedGbl: 1,
      dispatchedPcs: 100,
      invoiceQtyGbl: 1,
      invoiceQtyPcs: 100,
      locationName: 'Main Storage',
      rate: 0,
      discountPct: 0,
      taxableAmount: 0,
      gstRate: 12,
      gstAmount: 0,
      totalAmount: 0,
      selected: true
    };
    setItemRows(prev => [...prev, newRow]);
  };

  const handleRemoveDirectItem = (key: string) => {
    setItemRows(prev => prev.filter(r => r.key !== key));
  };

  // Direct SKU selection
  const handleSelectSkuForDirectRow = (key: string, skuObj: any) => {
    if (!skuObj) return;
    const pcsPerGbl = Number(skuObj.altUnitConversion || skuObj.booksGbl || 100) || 100;
    const rate = Number(skuObj.sellingPrice || skuObj.rate || skuObj.costPrice || 0);
    const taxable = 1 * rate;
    const gstRate = 12;
    const gstAmount = taxable * (gstRate / 100);

    setItemRows(prev =>
      prev.map(r => {
        if (r.key !== key) return r;
        return {
          ...r,
          skuId: skuObj._id,
          skuCode: skuObj.skuCode || '',
          itemName: skuObj.name || '',
          uom: skuObj.unit || 'GBL',
          pcsPerGbl,
          dispatchedGbl: 1,
          dispatchedPcs: pcsPerGbl,
          invoiceQtyGbl: 1,
          invoiceQtyPcs: pcsPerGbl,
          rate,
          taxableAmount: taxable,
          gstRate,
          gstAmount,
          totalAmount: taxable + gstAmount
        };
      })
    );
  };

  // Direct party select
  const handleSelectParty = (partyId: string) => {
    setSelectedPartyId(partyId);
    const p = partyOptions.find(item => item._id === partyId || item.id === partyId);
    if (p) {
      const pName = p.name || p.companyName || '';
      const pPhone = p.phone || p.mobile || '';
      const pCity = p.city || p.billingAddress?.city || '';
      const pState = p.state || p.billingAddress?.state || '';
      const pGstin = p.gstin || '';
      setCustomerName(pName);
      setCustomerPhone(pPhone);
      setCity(pCity);
      setRegion(pState);
      setCustomerGstin(pGstin);

      const addr = `${pName}\n${p.billingAddress?.address || p.address || 'Main Road'}\n${pCity}${pState ? ', ' + pState : ''} - ${p.billingAddress?.pincode || p.pincode || '—'}`;
      setBillToAddress(addr);
      if (sameAsBillTo) {
        setShipToAddress(addr);
      }
    }
  };

  // Calculations
  const calculations = useMemo(() => {
    const active = itemRows.filter(r => r.selected);
    const totalGbl = active.reduce((s, r) => s + (Number(r.invoiceQtyGbl) || 0), 0);
    const totalPcs = active.reduce((s, r) => s + (Number(r.invoiceQtyPcs) || 0), 0);
    const subtotal = active.reduce((s, r) => s + (Number(r.taxableAmount) || 0), 0);
    const totalGst = active.reduce((s, r) => s + (Number(r.gstAmount) || 0), 0);

    const isInterState = (region || '').toLowerCase().trim() !== 'telangana' && (region || '').trim() !== '';
    const cgst = isInterState ? 0 : totalGst / 2;
    const sgst = isInterState ? 0 : totalGst / 2;
    const igst = isInterState ? totalGst : 0;

    const chargesTotal = additionalCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const rawGrandTotal = subtotal + totalGst + chargesTotal + (Number(roundOff) || 0);
    const grandTotal = Math.round(rawGrandTotal * 100) / 100;

    return {
      totalGbl,
      totalPcs,
      subtotal,
      totalGst,
      cgst,
      sgst,
      igst,
      chargesTotal,
      grandTotal,
      isInterState
    };
  }, [itemRows, additionalCharges, roundOff, region]);

  // Update row quantity / rate / GST
  const updateRowField = (key: string, field: 'invoiceQtyGbl' | 'rate' | 'discountPct' | 'gstRate', value: number) => {
    setItemRows(prev =>
      prev.map(r => {
        if (r.key !== key) return r;
        const updated = { ...r, [field]: value };
        const gbl = Number(updated.invoiceQtyGbl) || 0;
        const rate = Number(updated.rate) || 0;
        const disc = Number(updated.discountPct) || 0;
        const gstR = Number(updated.gstRate) || 0;

        const baseAmount = gbl * rate;
        const discounted = baseAmount - (baseAmount * (disc / 100));
        const gstVal = discounted * (gstR / 100);

        updated.invoiceQtyPcs = gbl * (updated.pcsPerGbl || 100);
        updated.taxableAmount = Math.round(discounted * 100) / 100;
        updated.gstAmount = Math.round(gstVal * 100) / 100;
        updated.totalAmount = Math.round((discounted + gstVal) * 100) / 100;

        return updated;
      })
    );
  };

  // Submit Handler
  const handleSubmitInvoice = async () => {
    if (!customerName.trim()) {
      showToast('Please enter or select a customer name', 'error');
      return;
    }

    const activeItems = itemRows.filter(r => r.selected && r.invoiceQtyGbl > 0);
    if (activeItems.length === 0) {
      showToast('Please add at least one item with valid quantity', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const companyId = selectedCompany?._id;

      const formattedItems: InvoiceItem[] = activeItems.map((it, idx) => ({
        itemId: it.itemId || `inv-itm-${idx + 1}`,
        skuId: it.skuId,
        skuCode: it.skuCode,
        itemName: it.itemName,
        uom: it.uom,
        pcsPerGbl: it.pcsPerGbl,
        dispatchedGbl: it.dispatchedGbl,
        dispatchedPcs: it.dispatchedPcs,
        invoiceQtyGbl: it.invoiceQtyGbl,
        invoiceQtyPcs: it.invoiceQtyPcs,
        locationName: it.locationName,
        rate: it.rate,
        amount: it.totalAmount
      }));

      const payload: Partial<SalesInvoice> = {
        invoiceNumber,
        invoiceDate,
        company: companyId,
        dispatchId: activeDispatch?.id || undefined,
        dispatchNumber: invoiceMode === 'challan' ? (dispatchNo || activeDispatch?.dispatchNo) : 'DIRECT',
        dispatchDate: dispatchDate || undefined,
        orderNumber: salesOrderNo || undefined,
        customerName,
        customerPhone,
        region,
        city,
        transporterName: transporter,
        vehicleNumber,
        lrNumber,
        lrDate,
        paymentTerms,
        dueDate,
        billTo: {
          name: customerName,
          address: billToAddress,
          city,
          state: region,
          phone: customerPhone,
          gstin: customerGstin
        },
        shipTo: {
          name: customerName,
          address: sameAsBillTo ? billToAddress : shipToAddress,
          city,
          state: region,
          phone: customerPhone,
          gstin: customerGstin
        },
        sameAsBillTo,
        items: formattedItems,
        additionalCharges,
        subtotal: calculations.subtotal,
        totalAdditionalCharges: calculations.chargesTotal,
        grandTotal: calculations.grandTotal,
        totalQtyGbl: calculations.totalGbl,
        totalQtyPcs: calculations.totalPcs,
        remarks,
        status: 'created'
      };

      let saved: SalesInvoice;
      if (editingInvoice?._id) {
        saved = await updateInvoice(editingInvoice._id, payload);
        showToast(`Invoice ${invoiceNumber} updated successfully!`, 'success');
      } else {
        saved = await createInvoice(payload);
        showToast(`Invoice ${invoiceNumber} generated successfully!`, 'success');
      }

      // If linked to a Delivery Challan, mark challan as Invoiced
      if (activeDispatch && activeDispatch.id) {
        updateDeliveryChallan(activeDispatch.id, {
          invoiceStatus: 'Invoiced',
          invoiceNumber: saved.invoiceNumber,
          invoiceDate: saved.invoiceDate
        }).catch(() => {});
      }

      window.dispatchEvent(new CustomEvent('invoice_created'));
      onInvoiceCreated(saved);
      onClose();
    } catch (err: any) {
      console.error('Invoice creation failed:', err);
      showToast(err.message || 'Failed to generate invoice', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-150 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        
        {/* ── 1. MODAL HEADER ── */}
        <div className="px-5 py-3.5 border-b border-gray-150 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs">
              <FileText className="w-5 h-5 text-blue-600 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900 tracking-tight">
                  {isEditing ? `Edit Invoice (${editingInvoice?.invoiceNumber})` : 'Create Tax Invoice'}
                </h2>
                <span className="font-mono text-xs font-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md border border-blue-200">
                  {invoiceNumber}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Generate official GST Sales Tax Invoice with itemized billing, taxes & transport records.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switcher */}
            {!isEditing && (
              <div className="flex items-center bg-gray-100 p-0.5 rounded-xl text-xs font-bold border border-gray-200">
                <button
                  type="button"
                  onClick={() => setInvoiceMode('challan')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    invoiceMode === 'challan'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  From Challan
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceMode('direct')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    invoiceMode === 'direct'
                      ? 'bg-white text-purple-700 shadow-2xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Direct Invoice
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── 2. MODAL BODY (SCROLLABLE) ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/50">
          
          {/* Top Selection / Customer Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
            {invoiceMode === 'challan' ? (
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Select Delivery Challan
                </label>
                <select
                  value={selectedDcNo}
                  onChange={e => setSelectedDcNo(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-800 focus:outline-blue-500 cursor-pointer"
                >
                  {allDeliveries.map(d => (
                    <option key={d.id || d.dispatchNo} value={d.dispatchNo}>
                      {d.dispatchNo} — {d.customerName} ({d.totalGbl} GBL)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Select Party / Customer
                </label>
                <select
                  value={selectedPartyId}
                  onChange={e => handleSelectParty(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-800 focus:outline-blue-500 cursor-pointer"
                >
                  <option value="">-- Choose Party or Enter Manually --</option>
                  {partyOptions.map(p => (
                    <option key={p._id || p.id} value={p._id || p.id}>
                      {p.name || p.companyName} {p.city ? `(${p.city})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Customer / Firm Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Enter customer name..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-900 bg-white focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono text-gray-900 bg-white focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Payment Terms & Due Date
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={paymentTerms}
                  onChange={e => setPaymentTerms(e.target.value)}
                  className="px-2 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-800 bg-white focus:outline-blue-500"
                >
                  <option value="Immediate">Immediate</option>
                  <option value="15 Days">15 Days</option>
                  <option value="30 Days">30 Days</option>
                  <option value="45 Days">45 Days</option>
                  <option value="60 Days">60 Days</option>
                </select>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="px-2 py-2 border border-gray-200 rounded-lg text-xs font-mono text-gray-900 bg-white focus:outline-blue-500"
                  placeholder="Due Date"
                />
              </div>
            </div>
          </div>

          {/* Transport & Address Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Transport Details Card */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100 font-bold text-xs text-gray-800">
                <Truck className="w-4 h-4 text-blue-600" />
                <span>Transport & Reference Details</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 block mb-0.5">Linked DC No.</label>
                  <input
                    type="text"
                    value={dispatchNo}
                    onChange={e => setDispatchNo(e.target.value)}
                    placeholder="DO-001..."
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 block mb-0.5">Sales Order No.</label>
                  <input
                    type="text"
                    value={salesOrderNo}
                    onChange={e => setSalesOrderNo(e.target.value)}
                    placeholder="SO-0001..."
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 block mb-0.5">Transporter Name</label>
                  <input
                    type="text"
                    value={transporter}
                    onChange={e => setTransporter(e.target.value)}
                    placeholder="e.g. Navata Road Transport"
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 block mb-0.5">Vehicle Number</label>
                  <input
                    type="text"
                    value={vehicleNumber}
                    onChange={e => setVehicleNumber(e.target.value)}
                    placeholder="TS08 EA 1234"
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono font-bold uppercase"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 block mb-0.5">LR / Waybill No.</label>
                  <input
                    type="text"
                    value={lrNumber}
                    onChange={e => setLrNumber(e.target.value)}
                    placeholder="LR-98765"
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 block mb-0.5">Buyer GSTIN</label>
                  <input
                    type="text"
                    value={customerGstin}
                    onChange={e => setCustomerGstin(e.target.value.toUpperCase())}
                    placeholder="36AAAAA0000A1Z5"
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono font-bold uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Billing & Shipping Address Card */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 font-bold text-xs text-gray-800">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <span>Billing & Shipping Address</span>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] font-normal text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameAsBillTo}
                    onChange={e => setSameAsBillTo(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Same for Shipping</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 block mb-0.5">Bill To Address</label>
                  <textarea
                    rows={3}
                    value={billToAddress}
                    onChange={e => setBillToAddress(e.target.value)}
                    className="w-full p-2 border border-gray-200 rounded-lg text-xs text-gray-800 bg-white font-medium"
                    placeholder="Enter billing address..."
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 block mb-0.5">Ship To Address</label>
                  <textarea
                    rows={3}
                    value={sameAsBillTo ? billToAddress : shipToAddress}
                    onChange={e => setShipToAddress(e.target.value)}
                    disabled={sameAsBillTo}
                    className={`w-full p-2 border border-gray-200 rounded-lg text-xs text-gray-800 ${sameAsBillTo ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
                    placeholder="Enter shipping address..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── 3. INVOICE ITEMS TABLE ── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-xs text-gray-800">Invoice Items & GST Rates</span>
                <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                  {itemRows.length} items
                </span>
              </div>
              {invoiceMode === 'direct' && (
                <button
                  type="button"
                  onClick={handleAddNewDirectItem}
                  className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Line Item</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-100/70 text-gray-600 font-bold border-b border-gray-200 text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 text-center w-8">#</th>
                    <th className="py-2.5 px-3">Item Description</th>
                    <th className="py-2.5 px-3 text-right">Invoice Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Rate (₹)</th>
                    <th className="py-2.5 px-3 text-right">Disc %</th>
                    <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
                    <th className="py-2.5 px-3 text-center">GST %</th>
                    <th className="py-2.5 px-3 text-right">Total (₹)</th>
                    {invoiceMode === 'direct' && <th className="py-2.5 px-2 text-center w-8"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {itemRows.map((row, idx) => (
                    <tr key={row.key} className="hover:bg-blue-50/20 transition-colors">
                      <td className="py-2.5 px-3 text-center font-bold text-gray-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        {invoiceMode === 'direct' ? (
                          <div className="space-y-1">
                            <select
                              value={row.skuId || ''}
                              onChange={e => {
                                const matched = availableSkus.find(s => String(s._id) === e.target.value);
                                handleSelectSkuForDirectRow(row.key, matched);
                              }}
                              className="w-full p-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-900 bg-white"
                            >
                              <option value="">-- Choose Master SKU --</option>
                              {availableSkus.map(s => (
                                <option key={s._id} value={s._id}>
                                  {s.skuCode} — {s.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={row.itemName}
                              onChange={e => {
                                const val = e.target.value;
                                setItemRows(prev => prev.map(r => r.key === row.key ? { ...r, itemName: val } : r));
                              }}
                              placeholder="Item description"
                              className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs"
                            />
                          </div>
                        ) : (
                          <div>
                            <span className="font-mono font-bold text-blue-700 mr-2">{row.skuCode}</span>
                            <span className="font-bold text-gray-900">{row.itemName}</span>
                            <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                              Dispatched: {row.dispatchedGbl} GBL (= {row.dispatchedPcs} PCS)
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Invoice Qty */}
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={row.invoiceQtyGbl || ''}
                            onChange={e => updateRowField(row.key, 'invoiceQtyGbl', Number(e.target.value))}
                            className="w-18 h-8 px-2 border border-slate-300 rounded-lg text-right font-mono font-bold text-slate-800 bg-white text-xs focus:outline-blue-600"
                          />
                          <span className="text-[10px] font-bold text-slate-400">GBL</span>
                        </div>
                      </td>

                      {/* Unit Rate */}
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <span className="text-[10px] font-bold text-slate-400">₹</span>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={row.rate || ''}
                            placeholder="0.00"
                            onChange={e => updateRowField(row.key, 'rate', Number(e.target.value))}
                            className="w-24 h-8 px-2 border border-slate-300 rounded-lg text-right font-mono font-bold text-slate-800 bg-white text-xs focus:outline-blue-600"
                          />
                        </div>
                      </td>

                      {/* Discount % */}
                      <td className="py-2.5 px-3 text-right font-mono">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={row.discountPct || ''}
                          placeholder="0"
                          onChange={e => updateRowField(row.key, 'discountPct', Number(e.target.value))}
                          className="w-14 h-8 px-1.5 border border-slate-200 rounded-lg text-right font-mono text-xs focus:outline-blue-600"
                        />
                      </td>

                      {/* Taxable Amount */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-800">
                        ₹{(row.taxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* GST % */}
                      <td className="py-2.5 px-3 text-center">
                        <select
                          value={row.gstRate}
                          onChange={e => updateRowField(row.key, 'gstRate', Number(e.target.value))}
                          className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white focus:outline-blue-600 cursor-pointer"
                        >
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={12}>12%</option>
                          <option value={18}>18%</option>
                          <option value={28}>28%</option>
                        </select>
                      </td>

                      {/* Total Amount */}
                      <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                        ₹{(row.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {invoiceMode === 'direct' && (
                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveDirectItem(row.key)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 4. SUMMARY TOTALS & TAX BREAKDOWN ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Invoice Remarks / Terms
              </label>
              <textarea
                rows={3}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Remarks, transport instructions, bank details note..."
                className="w-full p-2.5 border border-gray-200 rounded-lg text-xs text-gray-800 bg-white focus:outline-blue-500"
              />
            </div>

            {/* Calculation Card */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs space-y-2 text-xs">
              <div className="flex justify-between text-gray-600 font-medium">
                <span>Taxable Amount ({calculations.totalGbl} GBL):</span>
                <span className="font-mono font-bold">₹{calculations.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              {calculations.isInterState ? (
                <div className="flex justify-between text-indigo-700 font-medium">
                  <span>IGST (Integrated Tax):</span>
                  <span className="font-mono font-bold">₹{calculations.igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>CGST (Central Tax):</span>
                    <span className="font-mono font-bold">₹{calculations.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>SGST (State Tax):</span>
                    <span className="font-mono font-bold">₹{calculations.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </>
              )}

              {calculations.chargesTotal > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Additional Charges:</span>
                  <span className="font-mono font-bold">₹{calculations.chargesTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}

              <div className="pt-2 border-t border-gray-200 flex justify-between items-center text-sm font-black text-gray-900">
                <span>Grand Total (Payable):</span>
                <span className="font-mono text-base text-emerald-700">
                  ₹{calculations.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* ── 5. MODAL FOOTER ── */}
        <div className="px-5 py-3.5 border-t border-gray-150 flex items-center justify-between bg-white shrink-0">
          <div className="text-xs font-semibold text-gray-500">
            Total Qty: <span className="text-gray-900 font-bold font-mono">{calculations.totalGbl} GBL</span> ({calculations.totalPcs.toLocaleString()} PCS)
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSubmitInvoice}
              disabled={isSubmitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm shadow-blue-500/25 transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Generating Invoice...' : isEditing ? 'Update Invoice' : 'Generate Tax Invoice'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};

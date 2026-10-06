import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText, Truck, Calendar, MapPin, Package, Plus, Trash2, Edit3,
  Printer, Eye, Save, ArrowLeft, Settings, ChevronDown, ChevronRight,
  Search, Check, AlertCircle, Building2, Phone, RefreshCw
} from 'lucide-react';
import { SalesInvoice, InvoiceItem, AdditionalCharge, createInvoice, updateInvoice, getNextInvoiceNumber } from '../../api/invoiceApi';
import { getWarehouseHierarchyV2, WarehouseLocationV2 } from '../../api/mfgApiV2';
import { updateDeliveryChallan } from '../../api/deliveryChallanApi';
import { DispatchDeliveryRecord } from './invoiceSampleData';
import { showToast } from '../ui/Toast';
import { useAuth } from '../../context/AuthContext';

interface LocationNode {
  id: string;
  name: string;
  fullPath: string;
  children?: LocationNode[];
}

export interface CreateInvoiceViewProps {
  initialDispatch?: DispatchDeliveryRecord | null;
  existingInvoice?: SalesInvoice | null;
  allDeliveries?: DispatchDeliveryRecord[];
  onBack: () => void;
  onSuccess: (savedInvoice: SalesInvoice) => void;
  onPreview: (previewInvoice: SalesInvoice) => void;
}

export const CreateInvoiceView: React.FC<CreateInvoiceViewProps> = ({
  initialDispatch,
  existingInvoice,
  allDeliveries = [],
  onBack,
  onSuccess,
  onPreview
}) => {
  const { selectedCompany } = useAuth();

  // Selected delivery record (either passed via prop or picked from dropdown)
  const [selectedDispatch, setSelectedDispatch] = useState<DispatchDeliveryRecord | null>(
    initialDispatch || null
  );

  // Top details - 100% dynamic
  const [dispatchNo, setDispatchNo] = useState(
    existingInvoice?.dispatchNumber || initialDispatch?.dispatchNo || ''
  );
  const [dispatchDate, setDispatchDate] = useState(
    existingInvoice?.dispatchDate || initialDispatch?.dispatchDate || ''
  );
  const [salesOrderNo, setSalesOrderNo] = useState(
    existingInvoice?.orderNumber || initialDispatch?.orderNumber || ''
  );
  const [customerName, setCustomerName] = useState(
    existingInvoice?.customerName || initialDispatch?.customerName || ''
  );
  const [phone, setPhone] = useState(
    existingInvoice?.customerPhone || initialDispatch?.customerPhone || ''
  );
  const [region, setRegion] = useState(
    existingInvoice?.region || initialDispatch?.region || ''
  );
  const [city, setCity] = useState(
    existingInvoice?.city || initialDispatch?.city || ''
  );
  const [transporter, setTransporter] = useState(
    existingInvoice?.transporterName || initialDispatch?.transporterName || ''
  );
  const [lrNumber, setLrNumber] = useState(
    existingInvoice?.lrNumber || initialDispatch?.lrNumber || ''
  );
  const [lrDate, setLrDate] = useState(
    existingInvoice?.lrDate || initialDispatch?.lrDate || ''
  );
  const [packagesCount, setPackagesCount] = useState<number>(
    existingInvoice?.numberOfPackages || initialDispatch?.packagesCount || 1
  );

  // Today's formatted date
  const todayFormatted = useMemo(() => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${d}/${m}/${y}`;
  }, []);

  // Invoice Details
  const [invoiceNo, setInvoiceNo] = useState(existingInvoice?.invoiceNumber || '');
  const [invoiceDate, setInvoiceDate] = useState(existingInvoice?.invoiceDate || todayFormatted);
  const [paymentTerms, setPaymentTerms] = useState(existingInvoice?.paymentTerms || '30 Days');
  const [dueDate, setDueDate] = useState(existingInvoice?.dueDate || '');

  // Address
  const [billToAddress, setBillToAddress] = useState(
    existingInvoice?.billTo || initialDispatch?.billToAddress || {
      name: customerName,
      firmName: customerName,
      address: '',
      city: city,
      state: region,
      pincode: '',
      phone: phone
    }
  );
  const [sameAsBillTo, setSameAsBillTo] = useState(existingInvoice?.sameAsBillTo ?? true);
  const [shipToAddress, setShipToAddress] = useState(
    existingInvoice?.shipTo || initialDispatch?.shipToAddress || { ...billToAddress }
  );
  const [isEditingAddress, setIsEditingAddress] = useState<'billTo' | 'shipTo' | null>(null);

  // Items - 100% dynamic from dispatch or empty
  const [items, setItems] = useState<Array<InvoiceItem & { selected?: boolean }>>(() => {
    if (existingInvoice?.items && existingInvoice.items.length > 0) {
      return existingInvoice.items.map(it => ({ ...it, selected: true }));
    }
    if (initialDispatch?.items && initialDispatch.items.length > 0) {
      return initialDispatch.items.map((it, idx) => ({
        itemId: `item-${idx + 1}`,
        itemCode: it.itemCode || `FG-${idx + 1}`,
        itemName: it.itemName,
        uom: it.uom || 'GBL',
        pcsPerGbl: Math.round(it.dispatchedPcs / (it.dispatchedGbl || 1)) || 100,
        dispatchedGbl: it.dispatchedGbl,
        dispatchedPcs: it.dispatchedPcs,
        invoiceQtyGbl: it.dispatchedGbl,
        invoiceQtyPcs: it.dispatchedPcs,
        locationName: it.locationName || 'Main Storage',
        locationPath: it.locationName || 'Main Storage',
        rate: it.rate || 0,
        amount: it.amount || 0,
        selected: true
      }));
    }
    return [];
  });

  // Additional Charges
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>(() => {
    if (existingInvoice?.additionalCharges && existingInvoice.additionalCharges.length > 0) {
      return existingInvoice.additionalCharges;
    }
    return [];
  });

  // Remarks
  const [remarks, setRemarks] = useState(existingInvoice?.remarks || '');

  // Warehouse Location Hierarchy - Dynamically loaded
  const [locationTree, setLocationTree] = useState<LocationNode[]>([]);
  const [activeLocRowIndex, setActiveLocRowIndex] = useState<number | null>(null);
  const [locSearchText, setLocSearchText] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const locDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch real sequence number on mount
  useEffect(() => {
    if (!existingInvoice?.invoiceNumber && selectedCompany?._id) {
      getNextInvoiceNumber(selectedCompany._id).then(seq => {
        if (seq) setInvoiceNo(seq);
      }).catch(err => {
        console.warn('getNextInvoiceNumber error:', err);
      });
    }
  }, [existingInvoice, selectedCompany?._id]);

  // Load real warehouse locations for item location selector
  useEffect(() => {
    if (!selectedCompany?._id) return;
    getWarehouseHierarchyV2(selectedCompany._id).then(locs => {
      if (!Array.isArray(locs) || locs.length === 0) return;

      const locMap = new Map<string, WarehouseLocationV2>();
      locs.forEach((l: any) => { if (l._id) locMap.set(String(l._id), l); });

      const buildTree = (parentId: string | null): LocationNode[] => {
        return locs
          .filter((l: any) => String(l.parentId || '') === String(parentId || ''))
          .map((l: any) => ({
            id: String(l._id),
            name: l.name,
            fullPath: l.name,
            children: buildTree(String(l._id))
          }));
      };

      const roots = buildTree(null);
      if (roots.length > 0) {
        setLocationTree(roots);
        const exp: Record<string, boolean> = {};
        roots.forEach(r => { exp[r.id] = true; });
        setExpandedNodes(exp);
      }
    }).catch(err => {
      console.warn('Failed to load warehouse hierarchy:', err);
    });
  }, [selectedCompany?._id]);

  // Handle switching or selecting delivery record
  const handleSelectDispatchRecord = (rec: DispatchDeliveryRecord) => {
    setSelectedDispatch(rec);
    setDispatchNo(rec.dispatchNo);
    setDispatchDate(rec.dispatchDate);
    setSalesOrderNo(rec.orderNumber);
    setCustomerName(rec.customerName);
    setPhone(rec.customerPhone || '');
    setRegion(rec.region || '');
    setCity(rec.city || '');
    setTransporter(rec.transporterName || '');
    setLrNumber(rec.lrNumber || '');
    setLrDate(rec.lrDate || '');
    setPackagesCount(rec.packagesCount || rec.items?.length || 1);

    if (rec.billToAddress) {
      setBillToAddress(rec.billToAddress);
      setShipToAddress(rec.shipToAddress || rec.billToAddress);
    } else {
      const built = {
        name: rec.customerName,
        firmName: rec.customerName,
        address: '',
        city: rec.city,
        state: rec.region,
        pincode: '',
        phone: rec.customerPhone || ''
      };
      setBillToAddress(built);
      setShipToAddress(built);
    }

    if (rec.items && rec.items.length > 0) {
      setItems(rec.items.map((it, idx) => ({
        itemId: `item-${idx + 1}`,
        itemCode: it.itemCode || `FG-${idx + 1}`,
        itemName: it.itemName,
        uom: it.uom || 'GBL',
        pcsPerGbl: Math.round(it.dispatchedPcs / (it.dispatchedGbl || 1)) || 100,
        dispatchedGbl: it.dispatchedGbl,
        dispatchedPcs: it.dispatchedPcs,
        invoiceQtyGbl: it.dispatchedGbl,
        invoiceQtyPcs: it.dispatchedPcs,
        locationName: it.locationName || 'Main Storage',
        locationPath: it.locationName || 'Main Storage',
        rate: it.rate || 0,
        amount: it.amount || 0,
        selected: true
      })));
    }
    setRemarks(`Invoice for dispatch ${rec.dispatchNo}`);
  };

  // Close location dropdown when clicked outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (locDropdownRef.current && !locDropdownRef.current.contains(e.target as Node)) {
        setActiveLocRowIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Recalculate Due Date when payment terms or invoice date change
  useEffect(() => {
    try {
      const daysMatch = paymentTerms.match(/(\d+)/);
      const daysToAdd = daysMatch ? parseInt(daysMatch[1], 10) : 30;
      let dateObj = new Date();
      if (invoiceDate.includes('/')) {
        const parts = invoiceDate.split('/');
        if (parts.length === 3) dateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      } else if (invoiceDate.includes('-')) {
        dateObj = new Date(invoiceDate);
      }
      dateObj.setDate(dateObj.getDate() + daysToAdd);
      const d = String(dateObj.getDate()).padStart(2, '0');
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const y = dateObj.getFullYear();
      setDueDate(`${d}/${m}/${y}`);
    } catch (_) {}
  }, [invoiceDate, paymentTerms]);

  // Generate sequence if invoiceNo is blank or user clicks refresh
  const handleRegenerateSequence = async () => {
    const nextSeq = await getNextInvoiceNumber(selectedCompany?._id);
    if (nextSeq) {
      setInvoiceNo(nextSeq);
      showToast(`Invoice number refreshed: ${nextSeq}`, 'info');
    }
  };

  // Item quantity and rate change handlers
  const handleItemFieldChange = (index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => {
      const copy = [...prev];
      const item = { ...copy[index], [field]: value };

      if (field === 'invoiceQtyGbl') {
        const gbl = parseFloat(value) || 0;
        item.invoiceQtyPcs = gbl * (item.pcsPerGbl || 100);
        item.amount = Math.round(gbl * (item.rate || 0));
      } else if (field === 'invoiceQtyPcs') {
        const pcs = parseFloat(value) || 0;
        item.amount = Math.round((pcs / (item.pcsPerGbl || 100)) * (item.rate || 0));
      } else if (field === 'rate') {
        const rate = parseFloat(value) || 0;
        item.amount = Math.round((item.invoiceQtyGbl || 0) * rate);
      }

      copy[index] = item;
      return copy;
    });
  };

  const handleToggleItemSelect = (index: number) => {
    setItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], selected: !copy[index].selected };
      return copy;
    });
  };

  const handleToggleAllItems = (checked: boolean) => {
    setItems(prev => prev.map(it => ({ ...it, selected: checked })));
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddItem = () => {
    const newItem: InvoiceItem & { selected: boolean } = {
      itemId: `item-${Date.now()}`,
      itemCode: `FG-${Math.floor(100 + Math.random() * 900)}`,
      itemName: 'Item Description',
      uom: 'GBL',
      pcsPerGbl: 100,
      dispatchedGbl: 1,
      dispatchedPcs: 100,
      invoiceQtyGbl: 1,
      invoiceQtyPcs: 100,
      locationName: 'Main Storage',
      locationPath: 'Main Storage',
      rate: 0,
      amount: 0,
      selected: true
    };
    setItems(prev => [...prev, newItem]);
  };

  // Additional charges handlers
  const handleAddCharge = () => {
    setAdditionalCharges(prev => [...prev, { description: 'Freight / Transport Charge', type: 'Fixed', amount: 0 }]);
  };

  const handleChargeChange = (index: number, field: keyof AdditionalCharge, value: any) => {
    setAdditionalCharges(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveCharge = (index: number) => {
    setAdditionalCharges(prev => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const selectedItems = useMemo(() => items.filter(it => it.selected !== false), [items]);
  const totalDispatchedGbl = useMemo(() => items.reduce((sum, it) => sum + (Number(it.dispatchedGbl) || 0), 0), [items]);
  const totalDispatchedPcs = useMemo(() => items.reduce((sum, it) => sum + (Number(it.dispatchedPcs) || 0), 0), [items]);
  const totalInvoiceGbl = useMemo(() => selectedItems.reduce((sum, it) => sum + (Number(it.invoiceQtyGbl) || 0), 0), [selectedItems]);
  const totalInvoicePcs = useMemo(() => selectedItems.reduce((sum, it) => sum + (Number(it.invoiceQtyPcs) || 0), 0), [selectedItems]);
  const subtotalAmount = useMemo(() => selectedItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0), [selectedItems]);
  const totalChargesAmount = useMemo(() => additionalCharges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0), [additionalCharges]);
  const grandTotal = useMemo(() => subtotalAmount + totalChargesAmount, [subtotalAmount, totalChargesAmount]);

  const allItemsChecked = items.length > 0 && items.every(it => it.selected !== false);

  // Construct complete invoice payload
  const buildInvoicePayload = (status: 'draft' | 'created'): SalesInvoice => {
    return {
      _id: existingInvoice?._id,
      invoiceNumber: invoiceNo.trim(),
      invoiceDate,
      dispatchId: selectedDispatch?.id || undefined,
      dispatchNumber: dispatchNo.trim(),
      dispatchDate,
      orderNumber: salesOrderNo.trim(),
      customerName: customerName.trim(),
      customerPhone: phone.trim(),
      region,
      city,
      transporterName: transporter,
      lrNumber,
      lrDate,
      numberOfPackages: packagesCount,
      paymentTerms,
      dueDate,
      billTo: billToAddress,
      shipTo: sameAsBillTo ? billToAddress : shipToAddress,
      sameAsBillTo,
      items: selectedItems,
      additionalCharges,
      subtotal: subtotalAmount,
      totalAdditionalCharges: totalChargesAmount,
      grandTotal,
      totalQtyGbl: totalInvoiceGbl,
      totalQtyPcs: totalInvoicePcs,
      remarks,
      status,
      company: selectedCompany?._id,
      printOptions: {
        companyHeader: true,
        itemWiseDetails: true,
        locationDetails: true,
        transporterDetails: true,
        pageNumbers: true,
        termsConditions: true
      }
    };
  };

  const handleSaveInvoice = async (asDraft = false) => {
    if (!invoiceNo.trim()) {
      showToast('Please specify an invoice number', 'error');
      return;
    }
    if (!customerName.trim()) {
      showToast('Please specify a customer name', 'error');
      return;
    }
    if (selectedItems.length === 0) {
      showToast('Please select at least one item to invoice', 'error');
      return;
    }

    const payload = buildInvoicePayload(asDraft ? 'draft' : 'created');
    try {
      let saved: SalesInvoice;
      if (existingInvoice?._id) {
        saved = await updateInvoice(existingInvoice._id, payload);
      } else {
        saved = await createInvoice(payload);
      }

      // If tied to a delivery challan, update challan's status in backend and localStorage
      if (selectedDispatch?.id) {
        try {
          await updateDeliveryChallan(selectedDispatch.id, {
            invoiceStatus: 'Invoiced',
            invoiceNumber: saved.invoiceNumber
          });
        } catch (_) {}
      }

      showToast(
        asDraft ? `Invoice ${saved.invoiceNumber} saved as draft` : `Invoice ${saved.invoiceNumber} generated!`,
        'success'
      );
      onSuccess(saved);
    } catch (err: any) {
      console.error(err);
      showToast('Failed to save invoice: ' + (err?.message || 'Server error'), 'error');
    }
  };

  const handleTriggerPreview = () => {
    const payload = buildInvoicePayload('created');
    onPreview(payload);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-150 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1">
            <button
              onClick={onBack}
              className="hover:text-blue-600 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Invoices</span>
            </button>
            <span>&gt;</span>
            <span className="text-gray-900 font-semibold">
              {existingInvoice ? `Edit Invoice (${existingInvoice.invoiceNumber})` : 'Create Invoice'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-2xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                  {existingInvoice ? `Edit Invoice` : `Generate Sales Invoice`}
                </h1>
                {invoiceNo && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {invoiceNo}
                  </span>
                )}
                {dispatchNo && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                    Challan: {dispatchNo}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Review line items, pricing, transport details, and billing information before finalizing.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleTriggerPreview}
            className="px-3.5 py-2 bg-white hover:bg-gray-50 text-blue-600 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>

          <button
            type="button"
            onClick={() => handleSaveInvoice(true)}
            className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4 text-gray-500" />
            Save as Draft
          </button>

          <button
            type="button"
            onClick={() => handleSaveInvoice(false)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Generate &amp; Print
          </button>
        </div>
      </div>

      {/* Select Delivery Challan Picker (If not preselected) */}
      {!initialDispatch && allDeliveries.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Link Delivery Challan:
            </span>
            <span className="text-xs text-slate-500 hidden sm:inline">
              Choose an approved delivery challan to auto-fill items and customer details
            </span>
          </div>

          <div className="min-w-[300px]">
            <select
              value={selectedDispatch?.dispatchNo || ''}
              onChange={e => {
                const found = allDeliveries.find(d => d.dispatchNo === e.target.value);
                if (found) handleSelectDispatchRecord(found);
              }}
              className="w-full h-8.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs cursor-pointer"
            >
              <option value="">— Select Delivery Challan (Optional) —</option>
              {allDeliveries.map(d => (
                <option key={d.id} value={d.dispatchNo}>
                  {d.dispatchNo} • {d.customerName} ({d.items?.length || 0} items, {d.dispatchDate})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 2-Column Top Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Dispatch & Delivery Details */}
        <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs space-y-3.5">
          <div className="flex items-center gap-2 pb-2.5 border-b border-gray-100">
            <Truck className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              Dispatch &amp; Delivery Details
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Dispatch No.
              </label>
              <input
                type="text"
                placeholder="e.g. DC-2026-6467"
                value={dispatchNo}
                onChange={e => setDispatchNo(e.target.value)}
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl font-mono font-bold text-gray-900 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Dispatch Date
              </label>
              <input
                type="text"
                placeholder="DD/MM/YYYY"
                value={dispatchDate}
                onChange={e => setDispatchDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl font-mono text-gray-800 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Sales Order No.
              </label>
              <input
                type="text"
                placeholder="e.g. SO-0001 or DIRECT"
                value={salesOrderNo}
                onChange={e => setSalesOrderNo(e.target.value)}
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl font-mono text-gray-800 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Customer Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Customer / Consignee"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl font-bold text-gray-900 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Transporter Name
              </label>
              <input
                type="text"
                placeholder="e.g. Self / Chennupati Cargo"
                value={transporter}
                onChange={e => setTransporter(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-gray-800 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                LR / Bilty No.
              </label>
              <input
                type="text"
                placeholder="LR Number"
                value={lrNumber}
                onChange={e => setLrNumber(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl font-mono text-gray-800 focus:outline-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Card 2: Invoice Setup & Timeline */}
        <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                Invoice Setup &amp; Terms
              </h2>
            </div>
            <button
              type="button"
              onClick={handleRegenerateSequence}
              className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh Next Seq
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Invoice Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={invoiceNo}
                  onChange={e => setInvoiceNo(e.target.value)}
                  placeholder="e.g. INV-260001"
                  className="w-full px-3 py-1.5 border border-blue-300 bg-blue-50/20 rounded-xl font-mono font-bold text-blue-900 focus:outline-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Invoice Date
              </label>
              <input
                type="text"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                placeholder="DD/MM/YYYY"
                className="w-full px-3 py-1.5 border border-gray-200 rounded-xl font-mono text-gray-800 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Payment Terms
              </label>
              <select
                value={paymentTerms}
                onChange={e => setPaymentTerms(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-gray-800 bg-white focus:outline-blue-500 cursor-pointer"
              >
                <option value="Immediate">Immediate / Advance</option>
                <option value="7 Days">7 Days</option>
                <option value="15 Days">15 Days</option>
                <option value="30 Days">30 Days</option>
                <option value="45 Days">45 Days</option>
                <option value="60 Days">60 Days</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Due Date
              </label>
              <input
                type="text"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                placeholder="DD/MM/YYYY"
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl font-mono text-gray-700"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Number of Packages
              </label>
              <input
                type="number"
                min={1}
                value={packagesCount}
                onChange={e => setPackagesCount(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-xl font-mono text-gray-800 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Region / State
              </label>
              <input
                type="text"
                placeholder="e.g. Telangana / AP"
                value={region}
                onChange={e => setRegion(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card 3: Billing & Shipping Addresses */}
      <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between pb-2.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              Billing &amp; Delivery Addresses
            </h2>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={sameAsBillTo}
              onChange={e => {
                setSameAsBillTo(e.target.checked);
                if (e.target.checked) setShipToAddress(billToAddress);
              }}
              className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300"
            />
            <span>Ship to address same as Bill to</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Bill To */}
          <div className="p-3.5 rounded-xl border border-gray-150 bg-gray-50/60 relative group">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-gray-700 uppercase text-[10px] tracking-wider">
                Bill To (Customer)
              </span>
              <button
                type="button"
                onClick={() => setIsEditingAddress('billTo')}
                className="text-blue-600 hover:text-blue-800 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3 h-3" />
                Edit
              </button>
            </div>
            <p className="font-bold text-gray-900">{billToAddress?.name || customerName || 'Customer'}</p>
            <p className="text-gray-600 mt-0.5">{billToAddress?.address || 'Street / Location'}</p>
            <p className="text-gray-600">
              {billToAddress?.city || city}{billToAddress?.state ? `, ${billToAddress.state}` : ''}{billToAddress?.pincode ? ` - ${billToAddress.pincode}` : ''}
            </p>
            {billToAddress?.phone && (
              <p className="text-gray-500 font-mono text-[11px] mt-1">Ph: {billToAddress.phone}</p>
            )}
          </div>

          {/* Ship To */}
          <div className="p-3.5 rounded-xl border border-gray-150 bg-gray-50/60 relative group">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-gray-700 uppercase text-[10px] tracking-wider">
                Ship To (Delivery Site)
              </span>
              {!sameAsBillTo && (
                <button
                  type="button"
                  onClick={() => setIsEditingAddress('shipTo')}
                  className="text-blue-600 hover:text-blue-800 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  Edit
                </button>
              )}
            </div>
            {sameAsBillTo ? (
              <div className="text-gray-500 italic py-2">Same as billing address</div>
            ) : (
              <>
                <p className="font-bold text-gray-900">{shipToAddress?.name || customerName || 'Customer'}</p>
                <p className="text-gray-600 mt-0.5">{shipToAddress?.address || 'Street / Location'}</p>
                <p className="text-gray-600">
                  {shipToAddress?.city || city}{shipToAddress?.state ? `, ${shipToAddress.state}` : ''}{shipToAddress?.pincode ? ` - ${shipToAddress.pincode}` : ''}
                </p>
                {shipToAddress?.phone && (
                  <p className="text-gray-500 font-mono text-[11px] mt-1">Ph: {shipToAddress.phone}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Card 4: Line Items Table */}
      <div className="bg-white border border-gray-150 rounded-2xl shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              Dispatched Line Items ({items.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={handleAddItem}
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1 border border-blue-200"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Item
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200 text-[10px] uppercase tracking-wider">
                <th className="py-2.5 px-3 text-center w-8">
                  <input
                    type="checkbox"
                    checked={allItemsChecked}
                    onChange={e => handleToggleAllItems(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300"
                  />
                </th>
                <th className="py-2.5 px-2 text-center w-8 text-gray-400">#</th>
                <th className="py-2.5 px-3">Item Code</th>
                <th className="py-2.5 px-3">Item Description</th>
                <th className="py-2.5 px-2 text-center">UOM</th>
                <th className="py-2.5 px-3 text-right">Dispatched Qty (GBL)</th>
                <th className="py-2.5 px-3 text-right">Dispatched Qty (PCS)</th>
                <th className="py-2.5 px-3 text-right">Invoice Qty (GBL)</th>
                <th className="py-2.5 px-3 text-right">Invoice Qty (PCS)</th>
                <th className="py-2.5 px-3">Location</th>
                <th className="py-2.5 px-3 text-right">Rate (₹)</th>
                <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                <th className="py-2.5 px-2 text-center w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-gray-400">
                    <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-gray-600">No line items in this invoice yet.</p>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-800"
                    >
                      + Add Item Manually
                    </button>
                  </td>
                </tr>
              ) : (
                items.map((row, idx) => {
                  const isChecked = row.selected !== false;
                  return (
                    <tr
                      key={row.itemId || idx}
                      className={`hover:bg-blue-50/20 transition-colors ${
                        !isChecked ? 'opacity-40 bg-gray-50/40' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleItemSelect(idx)}
                          className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 cursor-pointer"
                        />
                      </td>

                      <td className="py-2.5 px-2 text-center text-gray-400 font-mono">
                        {idx + 1}
                      </td>

                      <td className="py-2.5 px-3 font-mono font-semibold text-gray-800">
                        <input
                          type="text"
                          value={row.itemCode}
                          onChange={e => handleItemFieldChange(idx, 'itemCode', e.target.value)}
                          className="w-20 px-1.5 py-1 border border-transparent hover:border-gray-300 focus:border-blue-500 rounded text-xs font-mono font-bold"
                        />
                      </td>

                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={row.itemName}
                          onChange={e => handleItemFieldChange(idx, 'itemName', e.target.value)}
                          className="w-full px-1.5 py-1 border border-transparent hover:border-gray-300 focus:border-blue-500 rounded text-xs font-semibold text-gray-900"
                        />
                      </td>

                      <td className="py-2.5 px-2 text-center text-gray-500 font-mono">
                        {row.uom || 'GBL'}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-gray-700">
                        {row.dispatchedGbl}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-gray-500">
                        {row.dispatchedPcs?.toLocaleString('en-IN')}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={row.invoiceQtyGbl}
                          onChange={e => handleItemFieldChange(idx, 'invoiceQtyGbl', e.target.value)}
                          className="w-20 px-2 py-1 text-right border border-gray-200 rounded-lg font-mono font-bold text-gray-900 focus:outline-blue-500 bg-white"
                        />
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-medium text-gray-700">
                        {row.invoiceQtyPcs?.toLocaleString('en-IN')}
                      </td>

                      <td className="py-2.5 px-3 text-gray-600 text-[11px] truncate max-w-[150px]">
                        {row.locationName || 'Main Storage'}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={row.rate}
                          onChange={e => handleItemFieldChange(idx, 'rate', e.target.value)}
                          className="w-20 px-2 py-1 text-right border border-gray-200 rounded-lg font-mono text-gray-900 focus:outline-blue-500 bg-white"
                        />
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">
                        ₹{row.amount?.toLocaleString('en-IN')}
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 text-gray-400 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Cards: Additional Charges, Remarks & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Additional Charges Card (Card 5) */}
        <div className="lg:col-span-4 bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              Additional Charges
            </h2>
            <span className="text-[10px] text-gray-400">Freight, Packing, etc.</span>
          </div>

          <div className="space-y-2">
            {additionalCharges.map((ch, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <input
                  type="text"
                  value={ch.description}
                  onChange={e => handleChargeChange(idx, 'description', e.target.value)}
                  placeholder="Charge Name"
                  className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-800 focus:outline-blue-500"
                />
                <select
                  value={ch.type}
                  onChange={e => handleChargeChange(idx, 'type', e.target.value)}
                  className="px-2 py-1.5 border border-gray-200 rounded-lg text-gray-700 bg-white"
                >
                  <option value="Fixed">Fixed</option>
                  <option value="Percentage">Percentage</option>
                </select>
                <input
                  type="number"
                  value={ch.amount}
                  onChange={e => handleChargeChange(idx, 'amount', parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1.5 text-right border border-gray-200 rounded-lg font-mono font-medium text-gray-900 focus:outline-blue-500"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveCharge(idx)}
                  className="p-1 text-gray-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddCharge}
            className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Charge
          </button>
        </div>

        {/* Remarks Card (Card 6) */}
        <div className="lg:col-span-4 bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              Remarks (Optional)
            </h2>
          </div>
          <textarea
            rows={4}
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="Enter invoice remarks or notes..."
            className="w-full flex-1 p-3 border border-gray-200 rounded-xl text-xs text-gray-800 focus:outline-blue-500 resize-none"
          />
        </div>

        {/* Invoice Summary Card (Card 7) */}
        <div className="lg:col-span-4 bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
              <FileText className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Invoice Summary</h2>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Total Quantity (GBL)</span>
                <span className="font-bold text-gray-900">{totalInvoiceGbl}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Total Quantity (PCS)</span>
                <span className="font-bold text-gray-900">{totalInvoicePcs.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Total Amount</span>
                <span className="font-mono font-bold text-gray-900">₹{subtotalAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Additional Charges</span>
                <span className="font-mono font-bold text-gray-900">₹{totalChargesAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t-2 border-gray-150 mt-4 flex items-baseline justify-between">
            <span className="text-sm font-bold text-gray-900">Grand Total</span>
            <span className="text-xl font-black text-emerald-600 font-mono">
              ₹{grandTotal.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Address Edit Dialog */}
      {isEditingAddress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-5 w-full max-w-md space-y-3">
            <h3 className="text-sm font-bold text-gray-900">
              Edit {isEditingAddress === 'billTo' ? 'Billing' : 'Shipping'} Address
            </h3>
            <div className="space-y-2 text-xs">
              <div>
                <label className="text-gray-500 block mb-0.5">Firm / Customer Name</label>
                <input
                  type="text"
                  value={isEditingAddress === 'billTo' ? billToAddress.name : shipToAddress.name}
                  onChange={e => {
                    const val = e.target.value;
                    if (isEditingAddress === 'billTo') setBillToAddress(p => ({ ...p, name: val }));
                    else setShipToAddress(p => ({ ...p, name: val }));
                  }}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg"
                />
              </div>
              <div>
                <label className="text-gray-500 block mb-0.5">Street Address</label>
                <input
                  type="text"
                  value={isEditingAddress === 'billTo' ? billToAddress.address : shipToAddress.address}
                  onChange={e => {
                    const val = e.target.value;
                    if (isEditingAddress === 'billTo') setBillToAddress(p => ({ ...p, address: val }));
                    else setShipToAddress(p => ({ ...p, address: val }));
                  }}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-gray-500 block mb-0.5">City</label>
                  <input
                    type="text"
                    value={isEditingAddress === 'billTo' ? billToAddress.city : shipToAddress.city}
                    onChange={e => {
                      const val = e.target.value;
                      if (isEditingAddress === 'billTo') setBillToAddress(p => ({ ...p, city: val }));
                      else setShipToAddress(p => ({ ...p, city: val }));
                    }}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-gray-500 block mb-0.5">Pincode</label>
                  <input
                    type="text"
                    value={isEditingAddress === 'billTo' ? billToAddress.pincode : shipToAddress.pincode}
                    onChange={e => {
                      const val = e.target.value;
                      if (isEditingAddress === 'billTo') setBillToAddress(p => ({ ...p, pincode: val }));
                      else setShipToAddress(p => ({ ...p, pincode: val }));
                    }}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="text-gray-500 block mb-0.5">State</label>
                <input
                  type="text"
                  value={isEditingAddress === 'billTo' ? billToAddress.state : shipToAddress.state}
                  onChange={e => {
                    const val = e.target.value;
                    if (isEditingAddress === 'billTo') setBillToAddress(p => ({ ...p, state: val }));
                    else setShipToAddress(p => ({ ...p, state: val }));
                  }}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg"
                />
              </div>
              <div>
                <label className="text-gray-500 block mb-0.5">Phone</label>
                <input
                  type="text"
                  value={isEditingAddress === 'billTo' ? billToAddress.phone : shipToAddress.phone}
                  onChange={e => {
                    const val = e.target.value;
                    if (isEditingAddress === 'billTo') setBillToAddress(p => ({ ...p, phone: val }));
                    else setShipToAddress(p => ({ ...p, phone: val }));
                  }}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditingAddress(null)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateInvoiceView;

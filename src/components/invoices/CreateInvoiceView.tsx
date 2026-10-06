import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText, Truck, Calendar, MapPin, Package, Plus, Trash2, Edit3,
  Printer, Eye, Save, ArrowLeft, Settings, ChevronDown, ChevronRight,
  Search, Check, AlertCircle, Building2, Phone
} from 'lucide-react';
import { SalesInvoice, InvoiceItem, AdditionalCharge, createInvoice, updateInvoice, getNextInvoiceNumber } from '../../api/invoiceApi';
import { DispatchDeliveryRecord } from './invoiceSampleData';
import { showToast } from '../ui/Toast';
import { useAuth } from '../../context/AuthContext';

// Default Location tree options matching Screenshot 2
interface LocationNode {
  id: string;
  name: string;
  fullPath: string;
  children?: LocationNode[];
}

const DEFAULT_LOCATION_TREE: LocationNode[] = [
  {
    id: 'f1',
    name: 'Factory-1',
    fullPath: 'Factory-1',
    children: [
      {
        id: 'f1-fl1',
        name: 'Floor 1',
        fullPath: 'Factory-1 > Floor 1',
        children: [
          { id: 'f1-fl1-a1', name: 'A1', fullPath: 'Factory-1 > Floor 1 > A1' },
          { id: 'f1-fl1-a2', name: 'A2', fullPath: 'Factory-1 > Floor 1 > A2' },
          { id: 'f1-fl1-a3', name: 'A3', fullPath: 'Factory-1 > Floor 1 > A3' },
        ]
      },
      {
        id: 'f1-fl2',
        name: 'Floor 2',
        fullPath: 'Factory-1 > Floor 2',
        children: [
          { id: 'f1-fl2-b1', name: 'B1', fullPath: 'Factory-1 > Floor 2 > B1' },
          { id: 'f1-fl2-b2', name: 'B2', fullPath: 'Factory-1 > Floor 2 > B2' },
        ]
      },
      {
        id: 'f1-fl3',
        name: 'Floor 3',
        fullPath: 'Factory-1 > Floor 3',
        children: [
          { id: 'f1-fl3-c1', name: 'C1', fullPath: 'Factory-1 > Floor 3 > C1' }
        ]
      }
    ]
  },
  {
    id: 'f2',
    name: 'Factory-2',
    fullPath: 'Factory-2',
    children: [
      {
        id: 'f2-mfg',
        name: 'A - Manufacturing',
        fullPath: 'Factory-2 > A - Manufacturing',
        children: [
          { id: 'f2-mfg-a1', name: 'A1', fullPath: 'Factory-2 > A - Manufacturing > A1' }
        ]
      },
      {
        id: 'f2-prt',
        name: 'B - Printing',
        fullPath: 'Factory-2 > B - Printing',
        children: [
          { id: 'f2-prt-b1', name: 'B1', fullPath: 'Factory-2 > B - Printing > B1' }
        ]
      }
    ]
  },
  {
    id: 'outdoor',
    name: 'Outdoor',
    fullPath: 'Outdoor',
    children: [
      { id: 'out-a1', name: 'A1', fullPath: 'Outdoor > A1' },
      { id: 'out-a2', name: 'A2', fullPath: 'Outdoor > A2' },
      { id: 'out-a3', name: 'A3', fullPath: 'Outdoor > A3' },
      { id: 'out-b1', name: 'B1', fullPath: 'Outdoor > B1' }
    ]
  }
];

export interface CreateInvoiceViewProps {
  initialDispatch?: DispatchDeliveryRecord | null;
  existingInvoice?: SalesInvoice | null;
  onBack: () => void;
  onSuccess: (savedInvoice: SalesInvoice) => void;
  onPreview: (previewInvoice: SalesInvoice) => void;
}

export const CreateInvoiceView: React.FC<CreateInvoiceViewProps> = ({
  initialDispatch,
  existingInvoice,
  onBack,
  onSuccess,
  onPreview
}) => {
  const { selectedCompany } = useAuth();

  // Top details
  const [dispatchNo, setDispatchNo] = useState(existingInvoice?.dispatchNumber || initialDispatch?.dispatchNo || 'DSP-0003');
  const [dispatchDate, setDispatchDate] = useState(existingInvoice?.dispatchDate || initialDispatch?.dispatchDate || '28/09/2026');
  const [salesOrderNo, setSalesOrderNo] = useState(existingInvoice?.orderNumber || initialDispatch?.orderNumber || 'SO-0003');
  const [customerName, setCustomerName] = useState(existingInvoice?.customerName || initialDispatch?.customerName || 'Chaitanya Book Centre');
  const [phone, setPhone] = useState(existingInvoice?.customerPhone || initialDispatch?.customerPhone || '9988776655');
  const [region, setRegion] = useState(existingInvoice?.region || initialDispatch?.region || 'Andhra Pradesh');
  const [city, setCity] = useState(existingInvoice?.city || initialDispatch?.city || 'Nellore');
  const [transporter, setTransporter] = useState(existingInvoice?.transporterName || initialDispatch?.transporterName || 'Sri Sai Transport');
  const [lrNumber, setLrNumber] = useState(existingInvoice?.lrNumber || initialDispatch?.lrNumber || 'LR1234567');
  const [lrDate, setLrDate] = useState(existingInvoice?.lrDate || initialDispatch?.lrDate || '28/09/2026');
  const [packagesCount, setPackagesCount] = useState<number>(existingInvoice?.numberOfPackages || initialDispatch?.packagesCount || 8);

  // Invoice Details
  const [invoiceNo, setInvoiceNo] = useState(existingInvoice?.invoiceNumber || 'INV-260899');
  const [invoiceDate, setInvoiceDate] = useState(existingInvoice?.invoiceDate || '28/09/2026');
  const [paymentTerms, setPaymentTerms] = useState(existingInvoice?.paymentTerms || '30 Days');
  const [dueDate, setDueDate] = useState(existingInvoice?.dueDate || '28/10/2026');

  // Address
  const [billToAddress, setBillToAddress] = useState(
    existingInvoice?.billTo || {
      name: 'A T C Marketing (Akshara)',
      firmName: customerName,
      address: 'Main Road',
      city: 'Mahabubnagar',
      state: 'Telangana',
      pincode: '509001',
      phone: '9966529313'
    }
  );
  const [sameAsBillTo, setSameAsBillTo] = useState(existingInvoice?.sameAsBillTo ?? true);
  const [shipToAddress, setShipToAddress] = useState(existingInvoice?.shipTo || { ...billToAddress });
  const [isEditingAddress, setIsEditingAddress] = useState<'billTo' | 'shipTo' | null>(null);

  // Items from dispatch
  const [items, setItems] = useState<Array<InvoiceItem & { selected?: boolean }>>(() => {
    if (existingInvoice?.items && existingInvoice.items.length > 0) {
      return existingInvoice.items.map(it => ({ ...it, selected: true }));
    }
    if (initialDispatch?.items && initialDispatch.items.length > 0) {
      return initialDispatch.items.map((it, idx) => ({
        itemId: `item-${idx + 1}`,
        itemCode: it.itemCode,
        itemName: it.itemName,
        uom: it.uom || 'GBL',
        pcsPerGbl: Math.round(it.dispatchedPcs / (it.dispatchedGbl || 1)) || 246,
        dispatchedGbl: it.dispatchedGbl,
        dispatchedPcs: it.dispatchedPcs,
        invoiceQtyGbl: it.dispatchedGbl,
        invoiceQtyPcs: it.dispatchedPcs,
        locationName: it.locationName || 'Factory-1 / A1',
        locationPath: it.locationName || 'Factory-1 > Floor 1 > A1',
        rate: it.rate,
        amount: it.amount,
        selected: true
      }));
    }
    // Default 4 exact items matching Screenshot 2
    return [
      { itemId: '1', itemCode: 'FG-002', itemName: '100P BEST FRIEND (SR)', uom: 'GBL', pcsPerGbl: 300, dispatchedGbl: 2, dispatchedPcs: 600, invoiceQtyGbl: 2, invoiceQtyPcs: 600, locationName: 'Factory-1 / A1', locationPath: 'Factory-1 > Floor 1 > A1', rate: 6200, amount: 12400, selected: true },
      { itemId: '2', itemCode: 'FG-532', itemName: 'SP Loose Books', uom: 'GBL', pcsPerGbl: 150, dispatchedGbl: 1, dispatchedPcs: 150, invoiceQtyGbl: 1, invoiceQtyPcs: 150, locationName: 'Factory-1 / A2', locationPath: 'Factory-1 > Floor 1 > A2', rate: 5800, amount: 5800, selected: true },
      { itemId: '3', itemCode: 'FG-005', itemName: '100P BEST FRIEND (UR)', uom: 'GBL', pcsPerGbl: 300, dispatchedGbl: 1, dispatchedPcs: 300, invoiceQtyGbl: 1, invoiceQtyPcs: 300, locationName: 'Factory-1 / B1', locationPath: 'Factory-1 > Floor 1 > B1', rate: 6100, amount: 6100, selected: true },
      { itemId: '4', itemCode: 'FG-001', itemName: '172P BEST FRIEND (SR)', uom: 'GBL', pcsPerGbl: 180, dispatchedGbl: 1, dispatchedPcs: 180, invoiceQtyGbl: 1, invoiceQtyPcs: 180, locationName: 'Factory-2 / A1', locationPath: 'Factory-2 > A - Manufacturing > A1', rate: 8200, amount: 8200, selected: true },
    ];
  });

  // Additional Charges
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>(() => {
    if (existingInvoice?.additionalCharges && existingInvoice.additionalCharges.length > 0) {
      return existingInvoice.additionalCharges;
    }
    return [{ description: 'Transport Charge', type: 'Fixed', amount: 500 }];
  });

  // Remarks
  const [remarks, setRemarks] = useState(existingInvoice?.remarks || `Invoice for dispatch ${dispatchNo}`);

  // Location selector popover state
  const [activeLocRowIndex, setActiveLocRowIndex] = useState<number | null>(null);
  const [locSearchText, setLocSearchText] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'f1': true,
    'f1-fl1': true,
    'f2': false,
    'outdoor': true
  });
  const locDropdownRef = useRef<HTMLDivElement>(null);

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

  // Generate sequence if invoiceNo is blank or user clicks gear
  const handleRegenerateSequence = async () => {
    const nextSeq = await getNextInvoiceNumber(selectedCompany?._id);
    setInvoiceNo(nextSeq);
    showToast(`Invoice number refreshed: ${nextSeq}`, 'info');
  };

  // Item quantity and rate change handlers
  const handleItemFieldChange = (index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => {
      const copy = [...prev];
      const item = { ...copy[index], [field]: value };

      if (field === 'invoiceQtyGbl') {
        const gbl = parseFloat(value) || 0;
        item.invoiceQtyPcs = gbl * (item.pcsPerGbl || 246);
        item.amount = Math.round(gbl * (item.rate || 0));
      } else if (field === 'invoiceQtyPcs') {
        const pcs = parseFloat(value) || 0;
        item.amount = Math.round((pcs / (item.pcsPerGbl || 246)) * (item.rate || 0));
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
      itemName: 'New Standard Note Book',
      uom: 'GBL',
      pcsPerGbl: 240,
      dispatchedGbl: 1,
      dispatchedPcs: 240,
      invoiceQtyGbl: 1,
      invoiceQtyPcs: 240,
      locationName: 'Factory-1 / A1',
      locationPath: 'Factory-1 > Floor 1 > A1',
      rate: 6000,
      amount: 6000,
      selected: true
    };
    setItems(prev => [...prev, newItem]);
  };

  // Additional charges handlers
  const handleAddCharge = () => {
    setAdditionalCharges(prev => [...prev, { description: 'Handling / Freight', type: 'Fixed', amount: 500 }]);
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

  // Calculations matching Screenshot 2
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
      dispatchNumber: dispatchNo,
      dispatchDate,
      orderNumber: salesOrderNo,
      customerName,
      customerPhone: phone,
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
      showToast(asDraft ? `Invoice ${saved.invoiceNumber} saved as draft` : `Invoice ${saved.invoiceNumber} generated!`, 'success');
      onSuccess(saved);
    } catch (err) {
      console.error(err);
      showToast('Failed to save invoice', 'error');
    }
  };

  const handleTriggerPreview = () => {
    const payload = buildInvoicePayload('created');
    onPreview(payload);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Top Header & Breadcrumbs matching Screenshot 2 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-150 shadow-2xs">
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1">
            <button onClick={onBack} className="hover:text-blue-600 transition-colors cursor-pointer">Sales</button>
            <span>&gt;</span>
            <button onClick={onBack} className="hover:text-blue-600 transition-colors cursor-pointer">Invoices</button>
            <span>&gt;</span>
            <span className="text-gray-900 font-semibold">Create Invoice</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-2xs">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Create Invoice</h1>
              <p className="text-xs text-gray-500">
                Create invoice from dispatch <span className="font-semibold text-blue-600">{dispatchNo}</span> or modify details if needed.
              </p>
            </div>
          </div>
        </div>

        {/* Top Right Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleTriggerPreview}
            className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Eye className="w-4 h-4 text-gray-500" />
            Preview
          </button>

          <button
            onClick={() => handleSaveInvoice(true)}
            className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4 text-gray-500" />
            Save as Draft
          </button>

          <button
            onClick={() => handleSaveInvoice(false)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Save & Print Invoice
          </button>
        </div>
      </div>

      {/* Main Form Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Card 1 (Left): Dispatch & Customer Details */}
        <div className="lg:col-span-8 bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
            <Truck className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Dispatch & Customer Details</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
            <div>
              <label className="block text-gray-500 font-medium mb-1">Dispatch No.</label>
              <input
                type="text"
                value={dispatchNo}
                onChange={e => setDispatchNo(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-mono font-medium text-gray-800 focus:bg-white focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">Dispatch Date</label>
              <div className="relative">
                <input
                  type="text"
                  value={dispatchDate}
                  onChange={e => setDispatchDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-gray-800 focus:outline-blue-500"
                />
                <Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">Sales Order No.</label>
              <input
                type="text"
                value={salesOrderNo}
                onChange={e => setSalesOrderNo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-medium text-blue-600 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">
                Customer <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-semibold text-gray-900 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">Phone</label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-gray-800 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">Region</label>
              <input
                type="text"
                value={region}
                onChange={e => setRegion(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-gray-800 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-gray-800 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">Transporter</label>
              <input
                type="text"
                value={transporter}
                onChange={e => setTransporter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-gray-800 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">LR/RR No.</label>
              <input
                type="text"
                value={lrNumber}
                onChange={e => setLrNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-gray-800 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">LR/RR Date</label>
              <div className="relative">
                <input
                  type="text"
                  value={lrDate}
                  onChange={e => setLrDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-gray-800 focus:outline-blue-500"
                />
                <Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">No. of Packages</label>
              <input
                type="number"
                value={packagesCount}
                onChange={e => setPackagesCount(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-semibold text-gray-900 focus:outline-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Card 2 (Right): Invoice Details */}
        <div className="lg:col-span-4 bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
            <FileText className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Invoice Details</h2>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-gray-500 font-medium">Invoice No.</label>
                <button
                  type="button"
                  onClick={handleRegenerateSequence}
                  className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  title="Configure Sequence / Next Number"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Auto
                </button>
              </div>
              <input
                type="text"
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                className="w-full px-3 py-2 border border-blue-200 bg-blue-50/30 rounded-xl font-mono font-bold text-blue-700 focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">Invoice Date</label>
              <div className="relative">
                <input
                  type="text"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-gray-800 focus:outline-blue-500"
                />
                <Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">Payment Terms</label>
              <select
                value={paymentTerms}
                onChange={e => setPaymentTerms(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-gray-800 bg-white focus:outline-blue-500"
              >
                <option value="Immediate / COD">Immediate / COD</option>
                <option value="7 Days">7 Days</option>
                <option value="15 Days">15 Days</option>
                <option value="30 Days">30 Days</option>
                <option value="45 Days">45 Days</option>
                <option value="60 Days">60 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-500 font-medium mb-1">Due Date</label>
              <div className="relative">
                <input
                  type="text"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-gray-800 focus:outline-blue-500"
                />
                <Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Grid: Items from Dispatch & Billing Address */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Main Items Table (approx 8.5 cols) */}
        <div className="lg:col-span-8 bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs overflow-hidden">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                Items from Dispatch ({dispatchNo})
              </h2>
            </div>
            <button
              onClick={handleAddItem}
              className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/80 text-gray-600 font-semibold border-b border-gray-200 text-[11px] uppercase">
                  <th className="py-2.5 px-2 text-center w-8">
                    <input
                      type="checkbox"
                      checked={allItemsChecked}
                      onChange={e => handleToggleAllItems(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300"
                    />
                  </th>
                  <th className="py-2.5 px-2 text-center w-8">#</th>
                  <th className="py-2.5 px-2">Item Code</th>
                  <th className="py-2.5 px-2">Item Name</th>
                  <th className="py-2.5 px-2 text-right">Dispatched (GBL)</th>
                  <th className="py-2.5 px-2 text-right">Dispatched (PCS)</th>
                  <th className="py-2.5 px-2 text-right">Invoice Qty (GBL)</th>
                  <th className="py-2.5 px-2 text-right">Invoice Qty (PCS)</th>
                  <th className="py-2.5 px-2">From Location *</th>
                  <th className="py-2.5 px-2 text-right">Rate (₹/GBL)</th>
                  <th className="py-2.5 px-2 text-right">Amount (₹)</th>
                  <th className="py-2.5 px-2 text-center w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {items.map((item, idx) => (
                  <tr key={item.itemId || idx} className={`hover:bg-blue-50/30 ${item.selected === false ? 'opacity-50' : ''}`}>
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={item.selected !== false}
                        onChange={() => handleToggleItemSelect(idx)}
                        className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-center text-gray-400 font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-2 font-mono font-medium text-gray-900">{item.itemCode}</td>
                    <td className="py-2.5 px-2 font-medium text-gray-900 min-w-[160px]">{item.itemName}</td>
                    <td className="py-2.5 px-2 text-right text-gray-600">{item.dispatchedGbl}</td>
                    <td className="py-2.5 px-2 text-right text-gray-600 font-mono">{(item.dispatchedPcs || 0).toLocaleString('en-IN')}</td>
                    <td className="py-2.5 px-2 text-right">
                      <input
                        type="number"
                        min="0"
                        value={item.invoiceQtyGbl}
                        onChange={e => handleItemFieldChange(idx, 'invoiceQtyGbl', e.target.value)}
                        className="w-16 px-2 py-1 text-right border border-gray-200 rounded-lg font-semibold text-gray-900 focus:outline-blue-500"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <input
                        type="number"
                        min="0"
                        value={item.invoiceQtyPcs}
                        onChange={e => handleItemFieldChange(idx, 'invoiceQtyPcs', e.target.value)}
                        className="w-20 px-2 py-1 text-right border border-gray-200 rounded-lg text-gray-700 font-mono focus:outline-blue-500"
                      />
                    </td>
                    <td className="py-2.5 px-2 relative">
                      <button
                        type="button"
                        onClick={() => setActiveLocRowIndex(activeLocRowIndex === idx ? null : idx)}
                        className="px-2.5 py-1 bg-white border border-gray-200 hover:border-blue-400 rounded-lg text-xs font-medium text-gray-800 flex items-center justify-between gap-1 min-w-[110px] cursor-pointer"
                      >
                        <span className="truncate">{item.locationName || 'Factory-1 v'}</span>
                        <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
                      </button>

                      {/* Interactive hierarchical dropdown matching Screenshot 2 */}
                      {activeLocRowIndex === idx && (
                        <div
                          ref={locDropdownRef}
                          className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-2.5 text-xs animate-in fade-in zoom-in-95 duration-100"
                        >
                          {/* Search Input */}
                          <div className="relative mb-2">
                            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2" />
                            <input
                              type="text"
                              value={locSearchText}
                              onChange={e => setLocSearchText(e.target.value)}
                              placeholder="Search location..."
                              className="w-full pl-8 pr-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:bg-white focus:outline-blue-500"
                            />
                          </div>

                          {/* Location Tree */}
                          <div className="max-h-56 overflow-y-auto space-y-1">
                            {DEFAULT_LOCATION_TREE.map(node => (
                              <div key={node.id} className="space-y-0.5">
                                <div
                                  onClick={() => setExpandedNodes(prev => ({ ...prev, [node.id]: !prev[node.id] }))}
                                  className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-gray-100 font-semibold text-gray-800 cursor-pointer text-[11.5px]"
                                >
                                  {node.children && node.children.length > 0 ? (
                                    expandedNodes[node.id] ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                                  ) : <span className="w-3.5" />}
                                  <span>{node.name}</span>
                                </div>

                                {expandedNodes[node.id] && node.children && (
                                  <div className="pl-4 space-y-0.5">
                                    {node.children.map(sub => (
                                      <div key={sub.id} className="space-y-0.5">
                                        <div
                                          onClick={() => setExpandedNodes(prev => ({ ...prev, [sub.id]: !prev[sub.id] }))}
                                          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-100 font-medium text-gray-700 cursor-pointer text-[11px]"
                                        >
                                          {sub.children && sub.children.length > 0 ? (
                                            expandedNodes[sub.id] ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />
                                          ) : <span className="w-3" />}
                                          <span>{sub.name}</span>
                                        </div>

                                        {expandedNodes[sub.id] && sub.children && (
                                          <div className="pl-4 space-y-0.5">
                                            {sub.children.map(leaf => (
                                              <div
                                                key={leaf.id}
                                                onClick={() => {
                                                  handleItemFieldChange(idx, 'locationName', `${node.name} / ${leaf.name}`);
                                                  handleItemFieldChange(idx, 'locationPath', leaf.fullPath);
                                                  setActiveLocRowIndex(null);
                                                }}
                                                className={`px-2 py-1 rounded cursor-pointer text-[11px] font-mono flex items-center justify-between ${
                                                  item.locationPath === leaf.fullPath || item.locationName?.includes(leaf.name)
                                                    ? 'bg-blue-100 text-blue-700 font-bold'
                                                    : 'text-gray-700 hover:bg-gray-100'
                                                }`}
                                              >
                                                <span>{leaf.name}</span>
                                                {(item.locationPath === leaf.fullPath || item.locationName?.includes(leaf.name)) && (
                                                  <Check className="w-3 h-3 text-blue-600" />
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <input
                        type="number"
                        min="0"
                        value={item.rate}
                        onChange={e => handleItemFieldChange(idx, 'rate', e.target.value)}
                        className="w-20 px-2 py-1 text-right border border-gray-200 rounded-lg font-mono text-gray-900 focus:outline-blue-500"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-gray-900">
                      {(item.amount || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <button
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1 text-gray-400 hover:text-rose-600 rounded transition-colors"
                        title="Delete Item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50/90 font-bold text-gray-900 border-t-2 border-gray-200 text-xs">
                  <td colSpan={4} className="py-3 px-2 text-right uppercase text-gray-700">Total</td>
                  <td className="py-3 px-2 text-right">{totalDispatchedGbl}</td>
                  <td className="py-3 px-2 text-right font-mono">{totalDispatchedPcs.toLocaleString('en-IN')}</td>
                  <td className="py-3 px-2 text-right">{totalInvoiceGbl}</td>
                  <td className="py-3 px-2 text-right font-mono">{totalInvoicePcs.toLocaleString('en-IN')}</td>
                  <td></td>
                  <td></td>
                  <td className="py-3 px-2 text-right font-mono text-sm text-blue-700">
                    {subtotalAmount.toLocaleString('en-IN')}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Billing & Delivery Address (approx 3.5 cols) */}
        <div className="lg:col-span-4 bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
            <MapPin className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Billing & Delivery Address</h2>
          </div>

          <div className="space-y-4 text-xs">
            {/* Bill To Card */}
            <div className="p-3 bg-gray-50/70 border border-gray-200 rounded-xl relative">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-gray-700">Bill To (Customer Address)</span>
                <button
                  type="button"
                  onClick={() => setIsEditingAddress('billTo')}
                  className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  Edit
                </button>
              </div>
              <p className="font-bold text-gray-900">{billToAddress.name || billToAddress.firmName}</p>
              <p className="text-gray-600">{billToAddress.address || 'Main Road'}</p>
              <p className="text-gray-600">{billToAddress.city || city}, {billToAddress.state || region} - {billToAddress.pincode || '509001'}</p>
              <p className="text-gray-600 font-mono mt-0.5">Phone: {billToAddress.phone || phone}</p>
            </div>

            {/* Same As Bill To Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-800 select-none">
              <input
                type="checkbox"
                checked={sameAsBillTo}
                onChange={e => setSameAsBillTo(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span>Same as Bill To</span>
            </label>

            {/* Ship To Card */}
            {!sameAsBillTo ? (
              <div className="p-3 bg-gray-50/70 border border-gray-200 rounded-xl relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-gray-700">Ship To (Delivery Address)</span>
                  <button
                    type="button"
                    onClick={() => setIsEditingAddress('shipTo')}
                    className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    Edit
                  </button>
                </div>
                <p className="font-bold text-gray-900">{shipToAddress.name || shipToAddress.firmName}</p>
                <p className="text-gray-600">{shipToAddress.address}</p>
                <p className="text-gray-600">{shipToAddress.city}, {shipToAddress.state} - {shipToAddress.pincode}</p>
                <p className="text-gray-600 font-mono mt-0.5">Phone: {shipToAddress.phone}</p>
              </div>
            ) : (
              <div className="p-3 bg-blue-50/30 border border-blue-100 rounded-xl text-gray-600">
                <span className="text-[11px] font-semibold text-gray-700 block mb-0.5">Ship To (Delivery Address)</span>
                <p className="italic text-gray-500">Matches Bill To address above</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Additional Charges, Remarks, and Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Additional Charges (Card 5) */}
        <div className="lg:col-span-4 bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              Additional Charges (Optional)
            </h2>
          </div>

          <div className="space-y-2 mb-3">
            {additionalCharges.map((ch, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="text-gray-400 font-mono w-4">{idx + 1}</span>
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
                  className="p-1 text-gray-400 hover:text-rose-600"
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

        {/* Invoice Summary Card (Card 7) matching Screenshot 2 */}
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
                <span className="font-mono font-bold text-gray-900">₹ {subtotalAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Additional Charges</span>
                <span className="font-mono font-bold text-gray-900">₹ {totalChargesAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t-2 border-gray-150 mt-4 flex items-baseline justify-between">
            <span className="text-sm font-bold text-gray-900">Grand Total</span>
            <span className="text-xl font-black text-emerald-600 font-mono">
              ₹ {grandTotal.toLocaleString('en-IN')}
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
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs"
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

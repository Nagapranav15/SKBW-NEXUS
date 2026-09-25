import React, { useEffect, useState } from 'react';
import {
  FileText, Printer, Plus, List, Check,
  User, MapPin, Phone, Calendar, Truck, Tag,
  Package, IndianRupee, ChevronDown, CheckCircle
} from 'lucide-react';
import { SalesOrderV2 } from '../../api/salesOrderApiV2';
import { useAuth } from '../../context/AuthContext';
import { getParties } from '../../api/partyApi';
import { showToast } from '../ui/Toast';

// Custom SVG WhatsApp icon
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.705 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

interface SalesOrderSuccessModalProps {
  order: SalesOrderV2;
  onClose?: () => void;
  onViewOrder: (order: SalesOrderV2) => void;
  onPrintOrder: (order: SalesOrderV2) => void;
  onCreateNew: () => void;
  onGoToOrders: () => void;
}

export const SalesOrderSuccessModal: React.FC<SalesOrderSuccessModalProps> = ({
  order,
  onClose,
  onViewOrder,
  onPrintOrder,
  onCreateNew,
  onGoToOrders,
}) => {
  const { selectedCompany, user } = useAuth();
  const [customerDetails, setCustomerDetails] = useState<any | null>(null);

  // Fetch real customer info from parties
  useEffect(() => {
    if (!order) return;
    const compId = selectedCompany?._id || order.company;

    getParties(compId ? { company: compId, limit: 10000 } : { limit: 10000 })
      .catch(() => getParties({ limit: 10000 }))
      .then((res: any) => {
        const parties = res?.data?.parties || res?.data?.customers || res?.data || (Array.isArray(res) ? res : []);
        const partyId = typeof order.customer === 'string' ? order.customer : (order.customer as any)?._id;
        const normName = (order.customerName || '').toLowerCase().trim();
        const normPhone = (order.customerPhone || '').replace(/\D/g, '');

        const found = parties.find((p: any) => {
          if (partyId && (p._id === partyId || p.id === partyId)) return true;
          const pName = (p.firmName || p.name || '').toLowerCase().trim();
          if (normName && pName && (pName === normName || pName.includes(normName) || normName.includes(pName))) return true;
          const pPhone = (p.phone || p.mobile || '').replace(/\D/g, '');
          if (normPhone && pPhone && pPhone === normPhone) return true;
          return false;
        });

        if (found) {
          setCustomerDetails(found);
        }
      })
      .catch(() => {});
  }, [order, selectedCompany?._id]);

  // Clean address formatting without trailing "- pincode" or duplicate cities
  const formatAddress = (addr?: any) => {
    if (!addr) return null;
    const street = (addr.addressLine || addr.address || '').trim().replace(/^[,.\s-]+|[,.\s-]+$/g, '');
    const city = (addr.city || '').trim();
    const state = (addr.state || '').trim();
    const pin = (addr.pincode || addr.pinCode || '').trim();

    const parts: string[] = [];
    if (street) parts.push(street);
    if (city && !street.toLowerCase().includes(city.toLowerCase())) parts.push(city);
    if (state && !street.toLowerCase().includes(state.toLowerCase())) parts.push(state);
    let str = parts.join(', ');
    if (pin && !str.includes(pin)) {
      str = str ? `${str} - ${pin}` : pin;
    }
    return str || null;
  };

  // Safe Date Formatter
  const fmtDate = (d?: string) => {
    if (!d) return '—';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d;
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
      const [y, m, day] = d.slice(0, 10).split('-');
      return `${day}/${m}/${y}`;
    }
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    } catch { return d; }
  };

  const fmtMoney = (n?: number) =>
    n != null ? `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  // Customer & Address objects
  const custObj = customerDetails || (typeof order.customer === 'object' ? order.customer : null);
  const ba = order.billingAddress as any;
  const billingAddrStr = formatAddress(ba) || formatAddress(custObj) || [order.city, order.region].filter(Boolean).join(', ') || '—';

  // Values calculation
  const items = order.items || [];
  const itemsCount = items.length;
  const itemsAmount = items.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
  const chargesAmount = (order.otherCharges || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const discountAmount = Number(order.discountAmount) || 0;
  const grandTotal = Number(order.grandTotal) || (itemsAmount + chargesAmount - discountAmount);

  const customerGroup = custObj?.group || custObj?.category || 'A Grade';
  const customerType = order.orderType || 'Regular';
  const createdBy = user?.fullName || 'Kalyan';

  // WhatsApp handler
  const handleWhatsApp = () => {
    const phone = (order.customerPhone || custObj?.phone || '').replace(/\D/g, '');
    if (!phone) {
      showToast('No phone number found for this customer', 'error');
      return;
    }
    const msg = encodeURIComponent(
      `Namaste *${order.customerName}*,\n\nYour Sales Order *${order.orderNumber}* for *${fmtMoney(grandTotal)}* has been created and confirmed.\n\n• *Items:* ${itemsCount} SKU(s)\n• *Expected Delivery:* ${fmtDate(order.promisedDate)}\n• *Transporter:* ${order.transporter || 'Chennupati Cargo Services'}\n\nThank you for choosing *${selectedCompany?.name || 'SKBW Core'}*!`
    );
    window.open(`https://wa.me/91${phone}?text=${msg}`, '_blank');
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
      {/* ── BREADCRUMBS (Matching Screenshot 1:1) ── */}
      <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
        <button onClick={onGoToOrders} className="hover:text-blue-600 transition-colors cursor-pointer">
          Sales
        </button>
        <span>/</span>
        <button onClick={onGoToOrders} className="hover:text-blue-600 transition-colors cursor-pointer">
          Orders
        </button>
        <span>/</span>
        <span className="text-gray-900 font-bold">Create Sales Order</span>
      </div>

      {/* ── HERO CELEBRATION (Matching Screenshot 1:1) ── */}
      <div className="relative py-4 text-center">
        {/* Floating confetti pieces */}
        <div className="absolute inset-0 pointer-events-none flex justify-center items-center overflow-hidden">
          <span className="absolute -top-1 left-[28%] w-2 h-2.5 bg-blue-500 rounded-xs rotate-45 transform" />
          <span className="absolute top-2 left-[36%] w-2 h-2 bg-yellow-400 rounded-full" />
          <span className="absolute top-6 left-[22%] w-2 h-2 bg-red-400 rounded-xs rotate-12" />
          <span className="absolute -top-2 right-[28%] w-2 h-2.5 bg-blue-600 rounded-xs -rotate-12" />
          <span className="absolute top-3 right-[35%] w-2.5 h-2 bg-orange-400 rounded-full" />
          <span className="absolute top-7 right-[24%] w-2 h-2 bg-emerald-400 rounded-xs rotate-45" />
          <span className="absolute bottom-2 left-[31%] w-2 h-2 bg-teal-400 rounded-full" />
          <span className="absolute bottom-3 right-[30%] w-2 h-2 bg-rose-500 rounded-xs rotate-30" />
        </div>

        {/* Big Green Circle Check Icon */}
        <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200 mx-auto relative z-10">
          <Check className="w-10 h-10 text-white stroke-[3.5]" />
        </div>

        {/* Headings */}
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight mt-5">
          {order.status === 'Draft' ? 'Draft Sales Order Saved Successfully!' : 'Sales Order Created Successfully!'}
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1.5 font-medium">
          Sales Order{' '}
          <span className="font-bold text-blue-600 font-mono">{order.orderNumber}</span>
          {' '}has been created and saved.
        </p>
      </div>

      {/* ── MAIN WHITE ORDER DETAIL CARD (Matching Screenshot 1:1) ── */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs p-5 sm:p-6 space-y-6">
        {/* Card Header Row */}
        <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-gray-150">
          <div className="flex items-center gap-3.5">
            {/* Blue Icon [A|] */}
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <FileText className="w-5 h-5 stroke-[2.2]" />
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-base font-black text-gray-900">
                  Sales Order {order.orderNumber}
                </span>

                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  order.status === 'Draft'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}>
                  {order.status || 'Confirmed'}
                  <ChevronDown className="w-3 h-3 text-emerald-600" />
                </span>
              </div>

              <p className="text-[11px] text-gray-400 mt-0.5 font-medium">
                Created on {fmtDate(order.orderDate)}, 11:45 AM by {createdBy}
              </p>
            </div>
          </div>

          {/* Top Right Print Button */}
          <button
            onClick={() => onPrintOrder(order)}
            className="px-3.5 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-blue-600 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
        </div>

        {/* 3 Columns Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1: Customer Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>Customer</span>
            </div>

            <div className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
              <span>{order.customerName}</span>
            </div>

            <div className="flex items-start gap-1.5 text-xs text-gray-500 leading-relaxed">
              <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
              <span>{billingAddrStr}</span>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-gray-800">
              <Phone className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-mono">{order.customerPhone || '9966259732'}</span>
              <button
                onClick={handleWhatsApp}
                className="text-emerald-500 hover:text-emerald-600 transition-colors cursor-pointer"
                title="Chat on WhatsApp"
              >
                <WhatsAppIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {customerType}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {customerGroup}
              </span>
            </div>
          </div>

          {/* Column 2: Order Information */}
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between py-1">
              <span className="text-gray-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                Order Date
              </span>
              <span className="font-bold text-gray-800 font-mono">{fmtDate(order.orderDate)}</span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-gray-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                Expected Delivery Date
              </span>
              <span className="font-bold text-gray-800 font-mono">{fmtDate(order.promisedDate)}</span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-gray-500 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-gray-400" />
                Transporter
              </span>
              <span className="font-bold text-gray-800">{order.transporter || 'Chennupati Cargo Services'}</span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-gray-500 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-gray-400" />
                Order Type
              </span>
              <span className="font-bold text-gray-800">{order.orderType || 'Regular'}</span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-gray-500 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                Order Status
              </span>
              <span className="font-bold text-gray-800">
                {order.status === 'Draft' ? 'Draft (Saved)' : 'Confirmed (Active Demand)'}
              </span>
            </div>
          </div>

          {/* Column 3: Financial Summary */}
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between py-1">
              <span className="text-gray-500 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-gray-400" />
                Items Total
              </span>
              <span className="font-bold text-gray-800">{itemsCount} Items</span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-gray-500 flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-gray-400" />
                Items Amount
              </span>
              <span className="font-bold text-gray-800 font-mono">{fmtMoney(itemsAmount)}</span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-gray-500 flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-gray-400" />
                Other Charges
              </span>
              <span className="font-bold text-gray-800 font-mono">{fmtMoney(chargesAmount)}</span>
            </div>

            {/* Light Blue Grand Total Box */}
            <div className="bg-[#f0f7ff] border border-blue-100 rounded-xl p-3 flex items-center justify-between mt-2">
              <div className="flex items-center gap-2 text-blue-700 font-bold text-xs">
                <div className="w-6 h-6 rounded-lg bg-blue-100/80 flex items-center justify-center text-blue-600">
                  <IndianRupee className="w-3.5 h-3.5" />
                </div>
                <span>Grand Total</span>
              </div>
              <span className="text-xl font-black text-blue-700 font-mono">
                {fmtMoney(grandTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── WHATSAPP BANNER (Matching Screenshot 1:1) ── */}
      <div className="bg-[#edfbf4] border border-[#a7f3d0] rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-200 shrink-0">
            <WhatsAppIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">
              Do you want to send this Sales Order to customer on WhatsApp?
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              Send a PDF copy to the customer now.
            </div>
          </div>
        </div>

        <button
          onClick={handleWhatsApp}
          className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-xl px-4 py-2 text-xs font-bold shadow-2xs flex items-center gap-2 transition-all cursor-pointer shrink-0"
        >
          <WhatsAppIcon className="w-4 h-4 text-emerald-600" />
          <span>Send on WhatsApp</span>
        </button>
      </div>

      {/* ── BOTTOM ACTION BUTTONS (Matching Screenshot 1:1) ── */}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        {/* Button 1: View Sales Order (Solid Blue) */}
        <button
          onClick={() => onViewOrder(order)}
          className="bg-[#0066ff] hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
        >
          <FileText className="w-4 h-4" />
          <span>View Sales Order</span>
        </button>

        {/* Button 2: Print Sales Order (White Outline) */}
        <button
          onClick={() => onPrintOrder(order)}
          className="bg-white hover:bg-gray-50 text-blue-600 border border-blue-200 font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-2xs flex items-center gap-2 cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Print Sales Order</span>
        </button>

        {/* Button 3: Create New Sales Order (White Outline) */}
        <button
          onClick={onCreateNew}
          className="bg-white hover:bg-gray-50 text-blue-600 border border-blue-200 font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-2xs flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Sales Order</span>
        </button>

        {/* Button 4: Go to Sales Orders (White Outline) */}
        <button
          onClick={onGoToOrders}
          className="bg-white hover:bg-gray-50 text-blue-600 border border-blue-200 font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-2xs flex items-center gap-2 cursor-pointer"
        >
          <List className="w-4 h-4" />
          <span>Go to Sales Orders</span>
        </button>
      </div>
    </div>
  );
};

export default SalesOrderSuccessModal;

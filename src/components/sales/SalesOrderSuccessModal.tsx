import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText, Printer, Plus, List, CheckCircle,
  User, MapPin, Phone, Calendar, Truck, Tag,
  Package, IndianRupee, X, ArrowRight, Building,
  CreditCard, ShieldCheck, Layers, ChevronDown
} from 'lucide-react';
import { SalesOrderV2 } from '../../api/salesOrderApiV2';
import { useAuth } from '../../context/AuthContext';
import { getParties } from '../../api/partyApi';
import { showToast } from '../ui/Toast';

// WhatsApp SVG icon
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

  // Lock body scroll and listen for Escape key
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onClose) onClose();
        else onGoToOrders();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, onGoToOrders]);

  // Load Real Customer Details
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

  // Format clean address without trailing "- Pincode" or duplicate cities
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

  // Safe Date Formatter (handles YYYY-MM-DD, DD/MM/YYYY, ISO)
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
  const sa = order.shippingAddress as any;
  const billingAddrStr = formatAddress(ba) || formatAddress(custObj) || [order.city, order.region].filter(Boolean).join(', ') || '—';
  const deliveryAddrStr = formatAddress(sa) || billingAddrStr;
  const hasCustomShipping = sa?.addressLine && sa.addressLine !== ba?.addressLine;

  // Accurate Quantities and Financials
  const items = order.items || [];
  const itemsCount = items.length;
  const totalOrderedPcs = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const totalOrderedGbl = items.reduce((sum, i) => {
    const pcsPerGbl = i.pcsPerGbl || 100;
    return sum + (i.gbl || Math.ceil((Number(i.quantity) || 0) / pcsPerGbl));
  }, 0);

  const itemsAmount = items.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
  const chargesAmount = (order.otherCharges || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const discountAmount = Number(order.discountAmount) || 0;
  const grandTotal = Number(order.grandTotal) || (itemsAmount + chargesAmount - discountAmount);

  // WhatsApp handler
  const handleWhatsApp = () => {
    const phone = (order.customerPhone || custObj?.phone || '').replace(/\D/g, '');
    if (!phone) {
      showToast('No phone number found for this customer', 'error');
      return;
    }
    const msg = encodeURIComponent(
      `Namaste *${order.customerName}*,\n\nYour Sales Order *${order.orderNumber}* for *${fmtMoney(grandTotal)}* has been created and confirmed.\n\n• *Items:* ${itemsCount} SKU(s) (${totalOrderedGbl} GBL / ${totalOrderedPcs} Pcs)\n• *Expected Delivery:* ${fmtDate(order.promisedDate)}\n• *Transporter:* ${order.transporter || 'Direct'}\n\nThank you for choosing *${selectedCompany?.name || 'SKBW'}*!`
    );
    window.open(`https://wa.me/91${phone}?text=${msg}`, '_blank');
  };

  // Close helper
  const handleClose = () => {
    if (onClose) onClose();
    else onGoToOrders();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.70)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        width: '100vw',
        height: '100vh',
      }}
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full flex flex-col my-auto border border-gray-150 animate-in zoom-in-95 duration-200 overflow-hidden"
        style={{ maxWidth: 1060, maxHeight: '94vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── TOP BANNER: SUCCESS & ACTIONS ── */}
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border-b border-emerald-100/80 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-200 shrink-0">
              <CheckCircle className="w-6 h-6" strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-gray-900 tracking-tight">Sales Order Created Successfully!</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black font-mono bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {order.orderNumber}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">
                  {order.status || 'Confirmed'}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                Saved on {fmtDate(order.orderDate)} • Ready for Production & Dispatch Planning
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-xl hover:bg-black/5 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* 3 Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Customer Details */}
            <div className="bg-white rounded-2xl border border-gray-200/90 p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  Customer Information
                </span>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold border border-emerald-200">
                  {order.orderType || 'Credit'}
                </span>
              </div>

              <div className="font-black text-gray-900 text-sm">{order.customerName}</div>

              <div className="text-xs text-gray-600 leading-relaxed flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <span>{billingAddrStr}</span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                <span className="text-gray-500 font-medium">Mobile / WhatsApp</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-gray-800 font-mono">{order.customerPhone || '—'}</span>
                  {order.customerPhone && (
                    <button
                      onClick={handleWhatsApp}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer transition-colors"
                      title="Send WhatsApp message"
                    >
                      <WhatsAppIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Card 2: Order Information */}
            <div className="bg-white rounded-2xl border border-gray-200/90 p-4 shadow-2xs space-y-2">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-600" />
                Order & Shipping
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <span className="text-[10px] text-gray-400 block">Order Date</span>
                  <span className="font-bold text-gray-800 font-mono">{fmtDate(order.orderDate)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block">Expected Delivery</span>
                  <span className="font-bold text-blue-700 font-mono">{fmtDate(order.promisedDate)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-gray-100">
                <div>
                  <span className="text-[10px] text-gray-400 block">Transporter</span>
                  <span className="font-bold text-gray-800">{order.transporter || 'Direct'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block">Order Status</span>
                  <span className="font-bold text-emerald-700 font-mono">{order.status || 'Confirmed'}</span>
                </div>
              </div>

              {hasCustomShipping && (
                <div className="pt-1 border-t border-gray-100 text-[11px] text-blue-700 flex items-center gap-1">
                  <Truck className="w-3 h-3 text-blue-500" />
                  <span>Ship To: {deliveryAddrStr}</span>
                </div>
              )}
            </div>

            {/* Card 3: Financial Summary */}
            <div className="bg-white rounded-2xl border border-gray-200/90 p-4 shadow-2xs space-y-2">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                Financial Summary
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Items Amount ({itemsCount} SKUs, {totalOrderedGbl} GBL)</span>
                <span className="font-bold text-gray-800 font-mono">{fmtMoney(itemsAmount)}</span>
              </div>

              {chargesAmount > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Other Charges (Freight/Loading)</span>
                  <span className="font-bold text-gray-800 font-mono">{fmtMoney(chargesAmount)}</span>
                </div>
              )}

              {discountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-rose-600">
                  <span>Discount</span>
                  <span className="font-bold font-mono">-{fmtMoney(discountAmount)}</span>
                </div>
              )}

              <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Grand Total</span>
                  <span className="text-lg font-black text-blue-700 font-mono">{fmtMoney(grandTotal)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 block">Total Volume</span>
                  <span className="text-xs font-bold font-mono text-gray-700">{totalOrderedGbl} GBL / {totalOrderedPcs} Pcs</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── ITEMIZED PRODUCTS ORDERED TABLE ── */}
          <div className="border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
            <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                Ordered Items ({itemsCount} Product{itemsCount !== 1 ? 's' : ''})
              </span>
              <span className="text-[11px] font-mono font-bold text-gray-600">
                Total Ordered: {totalOrderedGbl} GBL ({totalOrderedPcs.toLocaleString()} Pcs)
              </span>
            </div>

            <div className="overflow-x-auto max-h-56">
              <table className="w-full text-left text-xs divide-y divide-gray-150">
                <thead className="bg-gray-50/90 text-[10.5px] font-bold text-gray-500 uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3 w-8 text-center">#</th>
                    <th className="py-2.5 px-4">Item / Product Name</th>
                    <th className="py-2.5 px-3 text-center">GBL</th>
                    <th className="py-2.5 px-3 text-center">Pcs / GBL</th>
                    <th className="py-2.5 px-3 text-center">Total Pcs</th>
                    <th className="py-2.5 px-3 text-right">Rate (₹)</th>
                    <th className="py-2.5 px-4 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {items.map((item, idx) => {
                    const pcsPerGbl = item.pcsPerGbl || 100;
                    const totalPcs = Number(item.quantity) || 0;
                    const gbl = item.gbl || Math.ceil(totalPcs / pcsPerGbl);

                    return (
                      <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-2 px-3 text-center font-mono text-gray-400">{idx + 1}</td>
                        <td className="py-2 px-4">
                          <div className="font-bold text-gray-900">{item.itemName}</div>
                          {item.skuCode && (
                            <div className="text-[10px] text-gray-400 font-mono">{item.skuCode}</div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-bold font-mono text-blue-700">{gbl}</td>
                        <td className="py-2 px-3 text-center font-mono text-gray-600">{pcsPerGbl}</td>
                        <td className="py-2 px-3 text-center font-bold font-mono text-gray-900">{totalPcs.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-mono text-gray-700">₹{(item.unitPrice || 0).toFixed(2)}</td>
                        <td className="py-2 px-4 text-right font-bold font-mono text-gray-900">
                          ₹{(item.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── WHATSAPP QUICK SHARE ── */}
          {order.customerPhone && (
            <div className="flex items-center justify-between p-3.5 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <WhatsAppIcon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-900">Share Order Confirmation on WhatsApp</div>
                  <div className="text-[11px] text-gray-500">Send an instant confirmation message to {order.customerName} ({order.customerPhone}).</div>
                </div>
              </div>
              <button
                onClick={handleWhatsApp}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <WhatsAppIcon className="w-3.5 h-3.5" />
                <span>Send WhatsApp</span>
              </button>
            </div>
          )}
        </div>

        {/* ── FOOTER ACTIONS (FIXED & INTUITIVE NAVIGATION) ── */}
        <div className="bg-gray-50/80 border-t border-gray-200 px-6 py-4 flex items-center justify-between flex-wrap gap-2 shrink-0">
          <button
            onClick={onGoToOrders}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <List className="w-4 h-4 text-gray-500" />
            <span>Go to Sales Orders</span>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onPrintOrder(order)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-gray-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              <Printer className="w-4 h-4 text-blue-600" />
              <span>Print Estimation</span>
            </button>

            <button
              onClick={onCreateNew}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-gray-100 text-emerald-700 border border-emerald-300 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Create New Order</span>
            </button>

            <button
              onClick={() => onViewOrder(order)}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-200 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>View Full Order</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SalesOrderSuccessModal;

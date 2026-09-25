import React, { useEffect, useState } from 'react';
import {
  FileText, Printer, Plus, List, CheckCircle,
  User, MapPin, Phone, Calendar, Truck, Tag,
  Package, IndianRupee, ChevronDown
} from 'lucide-react';
import { SalesOrderV2 } from '../../api/salesOrderApiV2';
import { useAuth } from '../../context/AuthContext';

// WhatsApp SVG icon
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.705 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

interface SalesOrderSuccessModalProps {
  order: SalesOrderV2;
  onViewOrder: (order: SalesOrderV2) => void;
  onPrintOrder: (order: SalesOrderV2) => void;
  onCreateNew: () => void;
  onGoToOrders: () => void;
}

const SalesOrderSuccessModal: React.FC<SalesOrderSuccessModalProps> = ({
  order,
  onViewOrder,
  onPrintOrder,
  onCreateNew,
  onGoToOrders,
}) => {
  const { selectedCompany, user } = useAuth();
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Format full address from billingAddress
  const formatAddress = () => {
    const ba = order.billingAddress as any;
    if (!ba) {
      const parts = [order.city, order.region].filter(Boolean);
      return parts.join(', ') || '';
    }
    const parts = [
      ba.addressLine,
      ba.city,
      ba.state,
      ba.pincode ? `- ${ba.pincode}` : '',
    ].filter((x: any) => x && x !== '-');
    const joined = parts.join(', ');
    return joined || [order.city, order.region].filter(Boolean).join(', ') || '';
  };

  // Compute totals
  const itemsCount = (order.items || []).length;
  const itemsAmount = (order.items || []).reduce((s, i) => s + (i.totalAmount || 0), 0);
  const chargesAmount = (order.otherCharges || []).reduce((s, c) => s + (c.amount || 0), 0);
  const displayGrandTotal = order.grandTotal || (itemsAmount + chargesAmount);

  // Format date
  const fmtDate = (d?: string) => {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return d; }
  };

  // Created timestamp
  const createdAtStr = order.createdAt
    ? (() => {
        try {
          const dt = new Date(order.createdAt);
          return dt.toLocaleString('en-IN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
          });
        } catch { return fmtDate(order.orderDate); }
      })()
    : fmtDate(order.orderDate);

  // WhatsApp handler
  const handleWhatsApp = () => {
    const phone = (order.customerPhone || '').replace(/\D/g, '');
    if (!phone) return;
    const msg = encodeURIComponent(
      `Namaste *${order.customerName}*,\n\nYour Sales Order *${order.orderNumber}* for *\u20b9${displayGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}* is confirmed and scheduled for dispatch by *${order.promisedDate || 'soon'}*.\n\nThank you for choosing *${selectedCompany?.name || 'SKBW Core'}*!`
    );
    window.open(`https://wa.me/91${phone}?text=${msg}`, '_blank');
  };

  // Customer group/grade tags
  const customerGroup = (order.customer as any)?.group || '';
  const customerType = order.orderType || 'Regular';

  // Status badge color
  const statusColorClass = (() => {
    switch (order.status) {
      case 'Confirmed': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Draft': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Cancelled': return 'bg-rose-50 text-rose-700 border-rose-200';
      default: return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  })();

  // Confetti positions (static for consistency)
  const confettiPieces = [
    { color: '#4f46e5', shape: 'diamond', top: '18%', left: '22%', delay: '0s' },
    { color: '#f59e0b', shape: 'circle', top: '12%', left: '38%', delay: '0.1s' },
    { color: '#10b981', shape: 'square', top: '22%', left: '55%', delay: '0.15s' },
    { color: '#ef4444', shape: 'diamond', top: '10%', left: '70%', delay: '0.05s' },
    { color: '#3b82f6', shape: 'circle', top: '20%', left: '80%', delay: '0.2s' },
    { color: '#f59e0b', shape: 'diamond', top: '15%', left: '12%', delay: '0.12s' },
    { color: '#10b981', shape: 'circle', top: '30%', left: '88%', delay: '0.08s' },
    { color: '#4f46e5', shape: 'square', top: '8%', left: '48%', delay: '0.18s' },
    { color: '#ef4444', shape: 'circle', top: '35%', left: '6%', delay: '0.22s' },
    { color: '#f59e0b', shape: 'square', top: '5%', left: '30%', delay: '0.25s' },
    { color: '#3b82f6', shape: 'diamond', top: '28%', left: '65%', delay: '0.1s' },
    { color: '#10b981', shape: 'circle', top: '6%', left: '58%', delay: '0.3s' },
  ];

  const confettiStyle = (piece: typeof confettiPieces[0]): React.CSSProperties => ({
    position: 'absolute',
    width: 7,
    height: 7,
    backgroundColor: piece.color,
    top: piece.top,
    left: piece.left,
    borderRadius: piece.shape === 'circle' ? '50%' : piece.shape === 'square' ? 2 : 1,
    transform: piece.shape === 'diamond' ? 'rotate(45deg)' : undefined,
    animation: `so-confetti-float 1.6s ease-out ${piece.delay} forwards`,
    opacity: 0,
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto"
      style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)' }}
    >
      <style>{`
        @keyframes so-success-fadeIn {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes so-check-pop {
          0%   { transform: scale(0); opacity: 0; }
          60%  { transform: scale(1.18); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes so-confetti-float {
          0%   { opacity: 0; transform: translateY(0) rotate(0deg); }
          15%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-65px) rotate(200deg); }
        }
        .so-success-wrap { animation: so-success-fadeIn 0.35s cubic-bezier(.22,.68,0,1.2) both; }
        .so-check-anim  { animation: so-check-pop 0.5s cubic-bezier(.22,.68,0,1.2) 0.15s both; }
      `}</style>

      <div className="w-full max-w-4xl mx-auto my-6 px-4">
        <div className="so-success-wrap bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">

          {/* ── SUCCESS HERO ── */}
          <div className="pt-10 pb-6 px-8 text-center relative overflow-hidden">
            {/* Confetti */}
            {animate && confettiPieces.map((p, idx) => (
              <div key={idx} style={confettiStyle(p)} />
            ))}

            {/* Checkmark ring */}
            <div className="so-check-anim mx-auto w-20 h-20 rounded-full bg-emerald-100 border-4 border-emerald-200 flex items-center justify-center shadow-lg mb-4">
              <CheckCircle className="w-11 h-11 text-emerald-600" strokeWidth={2.5} />
            </div>

            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Sales Order Created Successfully!</h1>
            <p className="text-sm text-gray-500 mt-1.5">
              Sales Order{' '}
              <span className="font-bold text-blue-600">{order.orderNumber}</span>
              {' '}has been created and saved.
            </p>
          </div>

          {/* ── ORDER DETAIL CARD ── */}
          <div className="mx-6 mb-5 border border-gray-200 rounded-2xl overflow-hidden">
            {/* Card Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50/70 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-gray-900 text-base">Sales Order {order.orderNumber}</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusColorClass}`}>
                      {order.status}
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Created on {createdAtStr}{user?.fullName ? ` by ${user.fullName}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onPrintOrder(order)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
            </div>

            {/* Card Body - 3 columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">

              {/* Col 1: Customer Info */}
              <div className="p-5 space-y-2.5">
                <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-gray-400 uppercase tracking-wider">
                  <User className="w-3 h-3" />
                  Customer
                </div>
                <div className="font-black text-gray-900 text-sm leading-snug">{order.customerName}</div>
                {formatAddress() && (
                  <div className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <span className="text-xs text-gray-600 leading-snug">{formatAddress()}</span>
                  </div>
                )}
                {order.customerPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-xs font-semibold text-gray-700">{order.customerPhone}</span>
                    <button onClick={handleWhatsApp} title="Open WhatsApp" className="cursor-pointer">
                      <WhatsAppIcon className="w-4 h-4 text-emerald-500 hover:text-emerald-600 transition-colors" />
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {customerType && (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold">
                      {customerType}
                    </span>
                  )}
                  {customerGroup && customerGroup !== customerType && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px] font-bold">
                      {customerGroup}
                    </span>
                  )}
                </div>
              </div>

              {/* Col 2: Order Details */}
              <div className="p-5 space-y-2.5">
                <div className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wider">Order Details</div>
                <div className="flex items-start gap-2">
                  <Calendar className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[10px] text-gray-400">Order Date</div>
                    <div className="text-xs font-bold text-gray-800">{fmtDate(order.orderDate)}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[10px] text-gray-400">Expected Delivery Date</div>
                    <div className="text-xs font-bold text-gray-800">{fmtDate(order.promisedDate)}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Truck className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[10px] text-gray-400">Transporter</div>
                    <div className="text-xs font-bold text-gray-800">{order.transporter || '—'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Tag className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[10px] text-gray-400">Order Type</div>
                    <div className="text-xs font-bold text-gray-800">{order.orderType || 'Regular'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[10px] text-gray-400">Order Status</div>
                    <div className="text-xs font-bold text-gray-800">
                      {order.status}{order.fulfillmentStatus && order.fulfillmentStatus !== 'Pending' ? ` (${order.fulfillmentStatus})` : ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* Col 3: Financial Summary */}
              <div className="p-5 space-y-2.5">
                <div className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wider">Order Summary</div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-600">Items Total</span>
                  </div>
                  <span className="text-xs font-bold text-gray-800">{itemsCount} Item{itemsCount !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <IndianRupee className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-600">Items Amount</span>
                  </div>
                  <span className="text-xs font-bold text-gray-800">
                    \u20b9{itemsAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {chargesAmount > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <IndianRupee className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs text-gray-600">Other Charges</span>
                    </div>
                    <span className="text-xs font-bold text-gray-800">
                      \u20b9{chargesAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {(order.discountAmount ?? 0) > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Discount ({order.discountPercent}%)</span>
                    <span className="text-xs font-bold text-rose-600">
                      -\u20b9{(order.discountAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <IndianRupee className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-black text-gray-900">Grand Total</span>
                    </div>
                    <span className="text-xl font-black text-blue-700">
                      \u20b9{displayGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* ── WHATSAPP BANNER ── */}
          {order.customerPhone && (
            <div className="mx-6 mb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-emerald-50/80 border border-emerald-200/70 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <WhatsAppIcon className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800">Do you want to send this Sales Order to customer on WhatsApp?</div>
                  <div className="text-xs text-gray-500 mt-0.5">Send a PDF copy to the customer now.</div>
                </div>
              </div>
              <button
                onClick={handleWhatsApp}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0"
              >
                <WhatsAppIcon className="w-4 h-4 text-white" />
                Send on WhatsApp
              </button>
            </div>
          )}

          {/* ── ACTION BUTTONS ── */}
          <div className="px-6 pb-7 flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => onViewOrder(order)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm transition-all cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              View Sales Order
            </button>
            <button
              onClick={() => onPrintOrder(order)}
              className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-sm font-bold rounded-xl transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-blue-500" />
              Print Sales Order
            </button>
            <button
              onClick={onCreateNew}
              className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-sm font-bold rounded-xl transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-500" />
              Create New Sales Order
            </button>
            <button
              onClick={onGoToOrders}
              className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-sm font-bold rounded-xl transition-all cursor-pointer"
            >
              <List className="w-4 h-4 text-gray-500" />
              Go to Sales Orders
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SalesOrderSuccessModal;

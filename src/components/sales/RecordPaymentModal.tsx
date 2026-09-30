import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Smartphone,
  FileCheck,
  Receipt,
  Wallet,
  AlertCircle,
  Check,
  Sparkles,
  Calendar,
  RefreshCw,
  Clock,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Tag
} from 'lucide-react';
import Modal from '../ui/Modal';
import { SalesOrderV2, recordSalesOrderPaymentV2, RecordPaymentPayload } from '../../api/salesOrderApiV2';
import { recordCustomerPaymentApi } from '../../api/partyApi';
import { showToast } from '../ui/Toast';

export type PaymentMethod = 'cash' | 'cheque' | 'upi' | 'bank_transfer';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: SalesOrderV2 | null;
  customer?: any | null;
  totalAmountOverride?: number;
  initialPaidOverride?: number;
  onPaymentSuccess?: (result: { order?: SalesOrderV2; customer?: any; payment?: any }) => void;
  onPaymentRecordLocal?: (payload: RecordPaymentPayload) => void;
}

// Helper to convert number to words for Indian currency
function numberToIndianWords(num: number): string {
  if (!num || isNaN(num) || num <= 0) return '';
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertLessThanOneThousand = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
    return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? convertLessThanOneThousand(n % 100) : '');
  };

  const rounded = Math.floor(num);
  if (rounded === 0) return '';

  const crore = Math.floor(rounded / 10000000);
  let remainder = rounded % 10000000;
  const lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  const thousand = Math.floor(remainder / 1000);
  const hundred = remainder % 1000;

  let str = '';
  if (crore > 0) str += convertLessThanOneThousand(crore) + 'Crore ';
  if (lakh > 0) str += convertLessThanOneThousand(lakh) + 'Lakh ';
  if (thousand > 0) str += convertLessThanOneThousand(thousand) + 'Thousand ';
  if (hundred > 0) str += convertLessThanOneThousand(hundred);

  return str.trim() + ' Rupees';
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  order,
  customer,
  totalAmountOverride,
  initialPaidOverride,
  onPaymentSuccess,
  onPaymentRecordLocal
}) => {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  
  // Mode specific fields
  const [cashLocation, setCashLocation] = useState<string>('Main Cash Counter');
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  
  const [chequeNumber, setChequeNumber] = useState<string>('');
  const [chequeDate, setChequeDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [bankName, setBankName] = useState<string>('');
  const [bankBranch, setBankBranch] = useState<string>('');
  const [chequeStatus, setChequeStatus] = useState<string>('Pending');

  const [upiProvider, setUpiProvider] = useState<string>('PhonePe');
  const [upiReference, setUpiReference] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('Primary Company Current A/C');

  const [bankUtr, setBankUtr] = useState<string>('');
  const [transferType, setTransferType] = useState<string>('NEFT');

  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Compute Total, Already Paid, and Due
  const totalAmount = totalAmountOverride !== undefined
    ? Number(totalAmountOverride || 0)
    : order
      ? Number(order.grandTotal || 0)
      : Number(customer?.outstandingBalance ?? customer?.outstanding ?? 0);

  const alreadyPaid = initialPaidOverride !== undefined
    ? Number(initialPaidOverride || 0)
    : order
      ? Number(order.paidAmount || 0)
      : 0;

  const currentDue = Math.max(0, totalAmount - alreadyPaid);

  const generateReceiptId = () => {
    return `REC-${Date.now().toString().slice(-6)}`;
  };

  // Pre-fill amount with current remaining due or previous recorded amount on open
  useEffect(() => {
    if (isOpen) {
      if (initialPaidOverride && initialPaidOverride > 0) {
        setAmount(String(initialPaidOverride));
      } else if (currentDue > 0) {
        setAmount(String(currentDue));
      } else {
        setAmount('');
      }
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setChequeDate(new Date().toISOString().split('T')[0]);
      setReceiptNumber(generateReceiptId());
      setChequeNumber('');
      setBankName('');
      setBankBranch('');
      setUpiReference('');
      setBankUtr('');
      setRemarks('');
      setPaymentMethod('cash');
    }
  }, [isOpen, currentDue, initialPaidOverride]);

  if (!isOpen) return null;

  const parsedAmount = Math.max(0, parseFloat(amount) || 0);
  const remainingAfterPayment = totalAmount > 0 ? Math.max(0, currentDue - parsedAmount) : 0;
  const isHalfPayment = currentDue > 0 && Math.abs(parsedAmount - Math.round(currentDue / 2)) <= 1;
  const isFullPayment = currentDue > 0 && Math.abs(parsedAmount - currentDue) < 0.01;

  const handleQuickAmount = (val: number) => {
    setAmount(String(Math.round(val)));
  };

  const handleAddAmount = (val: number) => {
    const cur = parseFloat(amount) || 0;
    setAmount(String(Math.round(cur + val)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!parsedAmount || parsedAmount <= 0) {
      showToast('Please enter a valid payment amount greater than ₹0', 'error');
      return;
    }

    if (paymentMethod === 'cheque' && !chequeNumber.trim()) {
      showToast('Please enter the Cheque Number', 'error');
      return;
    }

    if (paymentMethod === 'upi' && !upiReference.trim()) {
      showToast('Please enter the UPI Reference ID / UTR', 'error');
      return;
    }

    if (paymentMethod === 'bank_transfer' && !bankUtr.trim()) {
      showToast('Please enter the UTR / Transaction Reference Number', 'error');
      return;
    }

    const payload: RecordPaymentPayload = {
      amount: parsedAmount,
      paymentMethod,
      date: paymentDate,
      remarks: remarks.trim() || undefined,
      referenceId: 
        paymentMethod === 'cheque' ? chequeNumber.trim() :
        paymentMethod === 'upi' ? upiReference.trim() :
        paymentMethod === 'bank_transfer' ? bankUtr.trim() :
        receiptNumber.trim() || undefined,
      cashLocation: paymentMethod === 'cash' ? cashLocation : undefined,
      chequeNumber: paymentMethod === 'cheque' ? chequeNumber.trim() : undefined,
      chequeDate: paymentMethod === 'cheque' ? chequeDate : undefined,
      bankName: (paymentMethod === 'cheque' || paymentMethod === 'bank_transfer') ? bankName.trim() : undefined,
      bankBranch: paymentMethod === 'cheque' ? bankBranch.trim() : undefined,
      chequeStatus: paymentMethod === 'cheque' ? chequeStatus : undefined,
      upiProvider: paymentMethod === 'upi' ? upiProvider : undefined,
      accountName: (paymentMethod === 'upi' || paymentMethod === 'bank_transfer') ? accountName : undefined,
      orderId: order?._id
    };

    // Local handler (e.g. within SalesOrderDrawer for new or unsaved order)
    if (onPaymentRecordLocal) {
      onPaymentRecordLocal(payload);
      showToast(
        totalAmount > 0
          ? `Payment of ₹${parsedAmount.toLocaleString('en-IN')} applied! Remaining due: ₹${remainingAfterPayment.toLocaleString('en-IN')}`
          : `Cash payment of ₹${parsedAmount.toLocaleString('en-IN')} recorded for this order!`,
        'success'
      );
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      let result: any = null;

      if (order?._id) {
        result = await recordSalesOrderPaymentV2(order._id, payload);
        showToast(
          `Payment of ₹${parsedAmount.toLocaleString('en-IN')} recorded successfully! Remaining balance: ₹${(result.order?.balanceDue ?? remainingAfterPayment).toLocaleString('en-IN')}`,
          'success'
        );
      } else if (customer?._id || customer?.id) {
        const custId = customer._id || customer.id;
        result = await recordCustomerPaymentApi(custId, payload);
        showToast(
          `Payment of ₹${parsedAmount.toLocaleString('en-IN')} recorded! Customer outstanding reduced.`,
          'success'
        );
      } else {
        throw new Error('No order or customer selected for payment');
      }

      if (onPaymentSuccess) {
        onPaymentSuccess(result);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to record payment:', err);
      showToast(err.response?.data?.msg || err.message || 'Failed to record payment', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const customerDisplayName = order?.customerName || customer?.firmName || customer?.ownerName || customer?.name;

  // Percentage calculations for cute progress bar
  const paidPercent = totalAmount > 0 ? Math.min(100, Math.round((alreadyPaid / totalAmount) * 100)) : 0;
  const payingPercent = totalAmount > 0 ? Math.min(100 - paidPercent, Math.round((parsedAmount / totalAmount) * 100)) : 0;

  // Payment mode configuration with distinct cute color identities
  const paymentModes = [
    {
      id: 'cash' as PaymentMethod,
      label: 'Cash',
      subtitle: 'Counter / Drawer',
      icon: Wallet,
      badgeColor: 'text-emerald-700 bg-emerald-500/10 border-emerald-200',
      activeCard: 'bg-gradient-to-b from-emerald-50/90 to-emerald-100/40 border-emerald-500 text-emerald-950 shadow-sm shadow-emerald-500/15 ring-2 ring-emerald-500/20',
      activeIconBg: 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30',
      dotColor: 'bg-emerald-500',
      accentBorder: 'border-emerald-200 bg-emerald-50/20'
    },
    {
      id: 'cheque' as PaymentMethod,
      label: 'Cheque',
      subtitle: 'Bank Cheque Voucher',
      icon: FileCheck,
      badgeColor: 'text-amber-700 bg-amber-500/10 border-amber-200',
      activeCard: 'bg-gradient-to-b from-amber-50/90 to-amber-100/40 border-amber-500 text-amber-950 shadow-sm shadow-amber-500/15 ring-2 ring-amber-500/20',
      activeIconBg: 'bg-amber-500 text-white shadow-sm shadow-amber-500/30',
      dotColor: 'bg-amber-500',
      accentBorder: 'border-amber-200 bg-amber-50/20'
    },
    {
      id: 'upi' as PaymentMethod,
      label: 'UPI / QR',
      subtitle: 'Instant Pay',
      icon: Smartphone,
      badgeColor: 'text-violet-700 bg-violet-500/10 border-violet-200',
      activeCard: 'bg-gradient-to-b from-violet-50/90 to-violet-100/40 border-violet-500 text-violet-950 shadow-sm shadow-violet-500/15 ring-2 ring-violet-500/20',
      activeIconBg: 'bg-violet-500 text-white shadow-sm shadow-violet-500/30',
      dotColor: 'bg-violet-500',
      accentBorder: 'border-violet-200 bg-violet-50/20'
    },
    {
      id: 'bank_transfer' as PaymentMethod,
      label: 'Bank Transfer',
      subtitle: 'NEFT / RTGS / IMPS',
      icon: Building2,
      badgeColor: 'text-blue-700 bg-blue-500/10 border-blue-200',
      activeCard: 'bg-gradient-to-b from-blue-50/90 to-blue-100/40 border-blue-500 text-blue-950 shadow-sm shadow-blue-500/15 ring-2 ring-blue-500/20',
      activeIconBg: 'bg-blue-600 text-white shadow-sm shadow-blue-500/30',
      dotColor: 'bg-blue-600',
      accentBorder: 'border-blue-200 bg-blue-50/20'
    },
  ];

  const currentModeConfig = paymentModes.find(m => m.id === paymentMethod) || paymentModes[0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="max-w-xl"
      maxWidth="max-w-xl"
      padding="p-0"
      hideCloseButton={true}
    >
      <div className="flex flex-col h-full max-h-[92vh] bg-white text-slate-900 rounded-3xl overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="relative px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-indigo-50/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/25 shrink-0 transform hover:scale-105 transition-transform duration-200">
                <Receipt className="w-5 h-5 drop-shadow-sm" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                    Record Payment
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                    <Sparkles className="w-3 h-3 text-indigo-500" />
                    Voucher
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate mt-0.5">
                  {order?.orderNumber && (
                    <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md text-[11px]">
                      {order.orderNumber}
                    </span>
                  )}
                  {customerDisplayName ? (
                    <span className="truncate">👤 {customerDisplayName}</span>
                  ) : (
                    <span>Cash Receipt Entry</span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200/90 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer hover:rotate-90 duration-200 shrink-0"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Financial Metrics / Summary Bar */}
        {totalAmount > 0 ? (
          <div className="px-6 py-3 bg-slate-50/70 border-b border-slate-100 shrink-0">
            <div className="grid grid-cols-3 gap-2.5">
              {/* Total Card */}
              <div className="bg-white px-3 py-2 rounded-xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Total Order
                </span>
                <span className="text-sm font-black font-mono text-slate-800">
                  ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                </span>
              </div>

              {/* Already Paid Card */}
              <div className="bg-emerald-50/50 px-3 py-2 rounded-xl border border-emerald-200/80 shadow-2xs">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Paid So Far
                </span>
                <span className="text-sm font-black font-mono text-emerald-700">
                  ₹{alreadyPaid.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                </span>
              </div>

              {/* Balance Due Card */}
              <div className="bg-rose-50/50 px-3 py-2 rounded-xl border border-rose-200/80 shadow-2xs">
                <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  Balance Due
                </span>
                <span className={`text-sm font-black font-mono ${currentDue > 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                  ₹{currentDue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Cute mini progress bar */}
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-200/80 rounded-full overflow-hidden flex">
                <div 
                  className="bg-emerald-500 transition-all duration-300"
                  style={{ width: `${paidPercent}%` }}
                  title={`Paid: ${paidPercent}%`}
                />
                <div 
                  className="bg-blue-600 transition-all duration-300 animate-pulse"
                  style={{ width: `${payingPercent}%` }}
                  title={`Paying Now: ${payingPercent}%`}
                />
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-500 shrink-0">
                {Math.min(100, paidPercent + payingPercent)}% covered
              </span>
            </div>
          </div>
        ) : (
          <div className="px-6 py-2.5 bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-white border-b border-blue-100/80 text-xs text-blue-900 flex items-center justify-between shrink-0">
            <span className="font-semibold flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-3 h-3 text-blue-600" />
              </div>
              <span>Advance Cash Receipt (Balance will compute against order total)</span>
            </span>
            {alreadyPaid > 0 && (
              <span className="font-mono font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full text-[11px] border border-emerald-200">
                Recorded: ₹{alreadyPaid.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Payment Method Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${currentModeConfig.dotColor}`} />
                Payment Mode <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] font-medium text-slate-400">
                Choose settlement channel
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {paymentModes.map(tab => {
                const isActive = paymentMethod === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPaymentMethod(tab.id)}
                    className={`relative p-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all duration-200 cursor-pointer hover:-translate-y-0.5 active:scale-95 ${
                      isActive
                        ? tab.activeCard
                        : 'bg-white border-slate-200/90 text-slate-600 hover:bg-slate-50/90 hover:border-slate-300'
                    }`}
                  >
                    {isActive && (
                      <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-current flex items-center justify-center shadow-2xs">
                        <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                      </div>
                    )}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                      isActive ? tab.activeIconBg : 'bg-slate-100 text-slate-500'
                    }`}>
                      <tab.icon className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-extrabold tracking-tight">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount & Date Hero Row */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
            {/* Paying Amount (Hero Column) */}
            <div className="sm:col-span-7">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <span>Paying Amount</span>
                  <span className="text-rose-500">*</span>
                </label>
                {parsedAmount > 0 && (
                  <span className="text-[10px] font-mono font-bold text-indigo-600">
                    ₹{parsedAmount.toLocaleString('en-IN')}
                  </span>
                )}
              </div>

              {/* Hero Input Box */}
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200/70 text-indigo-600 flex items-center justify-center font-bold text-sm">
                    ₹
                  </div>
                </div>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-13 pr-9 py-2.5 bg-white border-2 border-slate-200 rounded-2xl text-lg font-black font-mono text-slate-900 placeholder:text-slate-300 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none transition-all shadow-2xs"
                />
                {amount && (
                  <button
                    type="button"
                    onClick={() => setAmount('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-300 hover:text-slate-600 cursor-pointer transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Number to Indian Words preview */}
              {parsedAmount > 0 && (
                <div className="text-[10px] font-medium text-slate-500 italic mt-1 px-1 truncate">
                  ✨ {numberToIndianWords(parsedAmount)}
                </div>
              )}

              {/* Quick Amount Shortcuts */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {currentDue > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQuickAmount(currentDue)}
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border transition-all cursor-pointer hover:scale-105 active:scale-95 flex items-center gap-1 ${
                        isFullPayment
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                      }`}
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      Full (₹{Math.round(currentDue).toLocaleString('en-IN')})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAmount(currentDue / 2)}
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                        isHalfPayment
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      }`}
                    >
                      50% (₹{Math.round(currentDue / 2).toLocaleString('en-IN')})
                    </button>
                  </>
                )}
                {[10000, 25000, 50000].map(chipVal => (
                  <button
                    key={chipVal}
                    type="button"
                    onClick={() => handleQuickAmount(chipVal)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                      parsedAmount === chipVal
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200/90 hover:border-slate-300'
                    }`}
                  >
                    ₹{chipVal >= 100000 ? `${chipVal / 100000}L` : `${chipVal / 1000}k`}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleAddAmount(5000)}
                  className="text-[10px] font-semibold px-2 py-1 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200/80 transition-all cursor-pointer active:scale-95"
                  title="Add ₹5,000 to current amount"
                >
                  +5k
                </button>
              </div>
            </div>

            {/* Payment Date Column */}
            <div className="sm:col-span-5">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <span>Payment Date</span>
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                </div>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-white border-2 border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none transition-all shadow-2xs"
                />
              </div>
              <div className="text-[10px] text-slate-400 mt-1 pl-1">
                Posting into ledger date
              </div>
            </div>
          </div>

          {/* Mode-specific Fields Box */}
          <div className={`p-4 rounded-2xl border transition-all ${currentModeConfig.accentBorder}`}>
            {/* Cash Details */}
            {paymentMethod === 'cash' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-700">
                      <Wallet className="w-3.5 h-3.5" />
                    </div>
                    <span>Cash Payment Details</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                    Direct Cash
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Cash Register / Godown
                    </label>
                    <select
                      value={cashLocation}
                      onChange={(e) => setCashLocation(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none cursor-pointer"
                    >
                      <option value="Main Cash Counter">Main Cash Counter</option>
                      <option value="Factory Office Drawer">Factory Office Drawer</option>
                      <option value="Sales Representative">Sales Representative</option>
                      <option value="Petty Cash Box">Petty Cash Box</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-600">
                        Receipt / Voucher Number
                      </label>
                      <button
                        type="button"
                        onClick={() => setReceiptNumber(generateReceiptId())}
                        className="text-[10px] text-emerald-600 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                        title="Generate fresh receipt id"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        Auto
                      </button>
                    </div>
                    <input
                      type="text"
                      value={receiptNumber}
                      onChange={(e) => setReceiptNumber(e.target.value)}
                      placeholder="e.g. REC-514903"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Cheque Details */}
            {paymentMethod === 'cheque' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 rounded-lg bg-amber-500/10 text-amber-700">
                      <FileCheck className="w-3.5 h-3.5" />
                    </div>
                    <span>Cheque Payment Details</span>
                  </div>
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-md">
                    Subject to realization
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Cheque Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      placeholder="e.g. 000124 (6 digits)"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Cheque Date
                    </label>
                    <input
                      type="date"
                      value={chequeDate}
                      onChange={(e) => setChequeDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. HDFC Bank, SBI, ICICI"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Branch / City
                    </label>
                    <input
                      type="text"
                      value={bankBranch}
                      onChange={(e) => setBankBranch(e.target.value)}
                      placeholder="e.g. Industrial Area Branch"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* UPI / QR Details */}
            {paymentMethod === 'upi' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-violet-900">
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 rounded-lg bg-violet-500/10 text-violet-700">
                      <Smartphone className="w-3.5 h-3.5" />
                    </div>
                    <span>UPI / QR Payment Details</span>
                  </div>
                  <span className="text-[10px] font-semibold text-violet-700 bg-violet-100/70 px-2 py-0.5 rounded-md">
                    Instant Gateway
                  </span>
                </div>

                {/* Quick App Selectors */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                    UPI Provider / App
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['PhonePe', 'Google Pay', 'Paytm', 'BHIM', 'Bank QR'].map(app => (
                      <button
                        key={app}
                        type="button"
                        onClick={() => setUpiProvider(app)}
                        className={`text-[11px] font-extrabold px-3 py-1 rounded-xl border transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                          upiProvider === app
                            ? 'bg-violet-600 text-white border-violet-600 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {app}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      UPI Reference / UTR Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={upiReference}
                      onChange={(e) => setUpiReference(e.target.value)}
                      placeholder="e.g. 427819381729"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Credited In Account
                    </label>
                    <input
                      type="text"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="e.g. Primary Current Account"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Bank Transfer Details */}
            {paymentMethod === 'bank_transfer' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 rounded-lg bg-blue-500/10 text-blue-700">
                      <Building2 className="w-3.5 h-3.5" />
                    </div>
                    <span>Bank Transfer Details (NEFT / RTGS / IMPS)</span>
                  </div>
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-md">
                    Direct Wire
                  </span>
                </div>

                {/* Transfer Type Chips */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                    Transfer Type
                  </label>
                  <div className="flex items-center gap-1.5">
                    {['NEFT', 'RTGS', 'IMPS', 'Internal Transfer'].map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTransferType(t)}
                        className={`text-[11px] font-extrabold px-3 py-1 rounded-xl border transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                          transferType === t
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      UTR / Transaction Ref <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={bankUtr}
                      onChange={(e) => setBankUtr(e.target.value)}
                      placeholder="e.g. UTIB260901238491"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Remitting Bank Name
                    </label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. State Bank of India"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes / Remarks with Quick Suggesters */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                <Tag className="w-3 h-3 text-slate-400" />
                Notes / Remarks
              </label>
              <div className="flex items-center gap-1">
                {['Advance token', 'Order balance', 'Full cleared'].map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setRemarks(tag)}
                    className="text-[9px] font-semibold text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                  >
                    +{tag}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Advance cash received against order"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all shadow-2xs"
            />
          </div>

          {/* Cute Financial Calculation Receipt Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/30 border border-slate-200/90 p-4 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Paying Now:
              </span>
              <span className="text-base font-black font-mono text-emerald-700">
                ₹{parsedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {totalAmount > 0 ? (
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${remainingAfterPayment > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                  Remaining Balance:
                </span>
                <span className={`font-black font-mono ${remainingAfterPayment > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  ₹{remainingAfterPayment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Order Status:</span>
                <span className="italic text-slate-600">Remaining balance will calculate when items are added</span>
              </div>
            )}

            {/* Cute Status Pill Badge */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-[11px]">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                Payment Status
              </span>
              {totalAmount > 0 ? (
                remainingAfterPayment <= 0 && parsedAmount > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] shadow-2xs">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Paid in Full 🎉
                  </span>
                ) : parsedAmount > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 border border-blue-200 text-[11px]">
                    <Clock className="w-3 h-3 text-blue-600" />
                    Partially Paid (Remaining ₹{remainingAfterPayment.toLocaleString('en-IN')})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200 text-[11px]">
                    <AlertCircle className="w-3 h-3 text-amber-600" />
                    Unpaid
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px]">
                  <Sparkles className="w-3 h-3 text-indigo-600" />
                  {parsedAmount > 0 ? `Advance Cash: ₹${parsedAmount.toLocaleString('en-IN')}` : 'Pending Amount'}
                </span>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-all cursor-pointer active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || parsedAmount <= 0}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:via-indigo-700 hover:to-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-extrabold transition-all shadow-md shadow-indigo-500/25 active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Recording Payment...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>
                    Record Payment ({parsedAmount > 0 ? `₹${parsedAmount.toLocaleString('en-IN')}` : '₹0'})
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default RecordPaymentModal;

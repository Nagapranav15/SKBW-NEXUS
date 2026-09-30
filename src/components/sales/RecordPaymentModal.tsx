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
  Calendar,
  RefreshCw,
  Clock,
  CheckCircle2
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!parsedAmount || parsedAmount <= 0) {
      showToast('Please enter a valid payment amount', 'error');
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

    if (onPaymentRecordLocal) {
      onPaymentRecordLocal(payload);
      showToast(
        totalAmount > 0
          ? `Payment of ₹${parsedAmount.toLocaleString('en-IN')} recorded!`
          : `Advance payment of ₹${parsedAmount.toLocaleString('en-IN')} recorded!`,
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
          `Payment of ₹${parsedAmount.toLocaleString('en-IN')} recorded successfully!`,
          'success'
        );
      } else if (customer?._id || customer?.id) {
        const custId = customer._id || customer.id;
        result = await recordCustomerPaymentApi(custId, payload);
        showToast(
          `Payment of ₹${parsedAmount.toLocaleString('en-IN')} recorded!`,
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

  const paymentModes = [
    { id: 'cash' as PaymentMethod, label: 'Cash', icon: Wallet },
    { id: 'cheque' as PaymentMethod, label: 'Cheque', icon: FileCheck },
    { id: 'upi' as PaymentMethod, label: 'UPI / QR', icon: Smartphone },
    { id: 'bank_transfer' as PaymentMethod, label: 'Bank Transfer', icon: Building2 },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="max-w-lg"
      maxWidth="max-w-lg"
      padding="p-0"
      hideCloseButton={true}
    >
      <div className="flex flex-col bg-white text-slate-900 rounded-2xl overflow-hidden shadow-xl border border-slate-100">
        {/* Clean, Cute Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100/80">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Record Payment</h3>
              <p className="text-[11px] text-slate-500 font-medium">
                {customerDisplayName ? customerDisplayName : 'Receipt Voucher'}
                {order?.orderNumber && <span className="ml-1.5 text-slate-400 font-mono">({order.orderNumber})</span>}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Minimal Financial Strip (If order total exists) */}
        {totalAmount > 0 ? (
          <div className="grid grid-cols-3 gap-2 px-5 py-2.5 bg-slate-50/80 border-b border-slate-100 text-xs">
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">Order Total</span>
              <span className="text-xs font-bold font-mono text-slate-800">
                ₹{totalAmount.toLocaleString('en-IN')}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">Paid</span>
              <span className="text-xs font-bold font-mono text-emerald-600">
                ₹{alreadyPaid.toLocaleString('en-IN')}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">Due</span>
              <span className={`text-xs font-bold font-mono ${currentDue > 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                ₹{currentDue.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        ) : (
          <div className="px-5 py-2 bg-blue-50/50 border-b border-blue-100/60 text-[11px] text-blue-700 flex items-center gap-1.5 font-medium">
            <AlertCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>Advance Cash Receipt (will adjust against order total)</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Payment Mode Selector - Clean & Minimal */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Payment Mode
            </label>
            <div className="grid grid-cols-4 gap-2">
              {paymentModes.map(tab => {
                const isActive = paymentMethod === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPaymentMethod(tab.id)}
                    className={`py-2 px-1.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-50/90 border-blue-500 text-blue-700 shadow-2xs font-bold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <tab.icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="text-[11px]">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount & Date - Clean Two Column Layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Amount Field */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Paying Amount <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none select-none">
                  ₹
                </span>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold font-mono text-slate-900 placeholder:text-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition-all"
                />
              </div>

              {/* Quick Amount Chips */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {currentDue > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQuickAmount(currentDue)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                        isFullPayment
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                      }`}
                    >
                      Full Due
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAmount(currentDue / 2)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                        isHalfPayment
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      50%
                    </button>
                  </>
                )}
                {[10000, 25000, 50000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleQuickAmount(val)}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200/80 transition-colors cursor-pointer"
                  >
                    ₹{val / 1000}k
                  </button>
                ))}
              </div>
            </div>

            {/* Date Field */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Payment Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Mode Specific Details Card */}
          <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-2.5">
            {paymentMethod === 'cash' && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Wallet className="w-3.5 h-3.5 text-blue-600" />
                  <span>Cash Payment Details</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Cash Register / Godown
                    </label>
                    <select
                      value={cashLocation}
                      onChange={(e) => setCashLocation(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="Main Cash Counter">Main Cash Counter</option>
                      <option value="Factory Office Drawer">Factory Office Drawer</option>
                      <option value="Sales Representative">Sales Representative</option>
                      <option value="Petty Cash Box">Petty Cash Box</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-semibold text-slate-500">
                        Receipt / Voucher Number
                      </label>
                      <button
                        type="button"
                        onClick={() => setReceiptNumber(generateReceiptId())}
                        className="text-[9px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer font-medium"
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
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {paymentMethod === 'cheque' && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Cheque Details</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Cheque Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      placeholder="e.g. 000124"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Cheque Date
                    </label>
                    <input
                      type="date"
                      value={chequeDate}
                      onChange={(e) => setChequeDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. HDFC Bank, SBI"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Branch / City
                    </label>
                    <input
                      type="text"
                      value={bankBranch}
                      onChange={(e) => setBankBranch(e.target.value)}
                      placeholder="e.g. Main Branch"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {paymentMethod === 'upi' && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                  <span>UPI / QR Details</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      UPI App / Provider
                    </label>
                    <select
                      value={upiProvider}
                      onChange={(e) => setUpiProvider(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="PhonePe">PhonePe</option>
                      <option value="Google Pay">Google Pay</option>
                      <option value="Paytm">Paytm</option>
                      <option value="BHIM">BHIM</option>
                      <option value="Bank QR">Bank Official QR</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      UPI Ref / UTR <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={upiReference}
                      onChange={(e) => setUpiReference(e.target.value)}
                      placeholder="e.g. 427819381729"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Credited Account
                    </label>
                    <input
                      type="text"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="e.g. Primary Current Account"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {paymentMethod === 'bank_transfer' && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Bank Wire Details</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Transfer Type
                    </label>
                    <select
                      value={transferType}
                      onChange={(e) => setTransferType(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="NEFT">NEFT</option>
                      <option value="RTGS">RTGS</option>
                      <option value="IMPS">IMPS</option>
                      <option value="Internal Transfer">Internal Transfer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      UTR / Transaction Ref <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={bankUtr}
                      onChange={(e) => setBankUtr(e.target.value)}
                      placeholder="e.g. UTIB260901238491"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Remitting Bank Name
                    </label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. State Bank of India"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes / Remarks - Clean */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Notes / Remarks
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Advance cash received against order"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Clean Receipt Summary Box */}
          <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-600">Paying Now:</span>
              <span className="font-bold font-mono text-slate-900">
                ₹{parsedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {totalAmount > 0 ? (
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-600">Remaining Balance:</span>
                <span className={`font-bold font-mono ${remainingAfterPayment > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  ₹{remainingAfterPayment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Order Status:</span>
                <span className="italic">Remaining balance will calculate when items are added</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 text-[11px]">
              <span className="text-slate-500 font-medium">Payment Status:</span>
              {totalAmount > 0 ? (
                remainingAfterPayment <= 0 && parsedAmount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Paid in Full
                  </span>
                ) : parsedAmount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    Partial (Bal: ₹{remainingAfterPayment.toLocaleString('en-IN')})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    Pending
                  </span>
                )
              ) : (
                <span className="px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  {parsedAmount > 0 ? `Advance Cash: ₹${parsedAmount.toLocaleString('en-IN')}` : 'Pending Amount'}
                </span>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || parsedAmount <= 0}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Recording...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Record Payment ({parsedAmount > 0 ? `₹${parsedAmount.toLocaleString('en-IN')}` : '₹0'})</span>
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

import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Smartphone,
  FileCheck,
  Receipt,
  Wallet,
  AlertCircle,
  Check
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
      setReceiptNumber(`REC-${Date.now().toString().slice(-6)}`);
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

  const handleQuickAmount = (val: number) => {
    setAmount(String(Math.round(val)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!parsedAmount || parsedAmount <= 0) {
      showToast('Please enter a valid payment amount greater than 0', 'error');
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="max-w-xl"
      maxWidth="max-w-xl"
      padding="p-0"
      hideCloseButton={true}
    >
      <div className="flex flex-col h-full max-h-[90vh] bg-white text-gray-900 rounded-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900 truncate">Record Payment</h3>
                {order?.orderNumber && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-gray-100 text-gray-700 border border-gray-200">
                    {order.orderNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 font-medium truncate">
                {customerDisplayName ? `Customer: ${customerDisplayName}` : 'Cash Receipt Voucher'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Financial Metrics / Summary Bar */}
        {totalAmount > 0 ? (
          <div className="grid grid-cols-3 gap-3 px-6 py-3 bg-gray-50/80 border-b border-gray-100 text-xs shrink-0">
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Order Total</span>
              <span className="text-sm font-bold font-mono text-gray-900">
                ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Already Paid</span>
              <span className="text-sm font-bold font-mono text-emerald-600">
                ₹{alreadyPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Balance Due</span>
              <span className={`text-sm font-black font-mono ${currentDue > 0 ? 'text-rose-600' : 'text-gray-600'}`}>
                ₹{currentDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        ) : (
          <div className="px-6 py-2.5 bg-blue-50/60 border-b border-blue-100 text-xs text-blue-900 flex items-center justify-between shrink-0">
            <span className="font-medium flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Advance Cash Receipt (Balance will compute against order total)</span>
            </span>
            {alreadyPaid > 0 && (
              <span className="font-bold font-mono text-emerald-700">Recorded: ₹{alreadyPaid.toLocaleString('en-IN')}</span>
            )}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Payment Method Selector */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-2">
              Payment Mode <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'cash', label: 'Cash', icon: Wallet },
                { id: 'cheque', label: 'Cheque', icon: FileCheck },
                { id: 'upi', label: 'UPI / QR', icon: Smartphone },
                { id: 'bank_transfer', label: 'Bank Transfer', icon: Building2 },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPaymentMethod(tab.id as PaymentMethod)}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                    paymentMethod === tab.id
                      ? 'bg-blue-50/70 border-blue-600 text-blue-700 shadow-2xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <tab.icon className={`w-4 h-4 ${paymentMethod === tab.id ? 'text-blue-600' : 'text-gray-500'}`} />
                  <span className="text-[11px]">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount & Date Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                Paying Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 font-bold text-xs">
                  ₹
                </div>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-mono font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                />
              </div>

              {/* Quick Amount Shortcuts */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {currentDue > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQuickAmount(currentDue)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                        parsedAmount === currentDue
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                      }`}
                    >
                      Full (₹{Math.round(currentDue).toLocaleString('en-IN')})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAmount(currentDue / 2)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                        isHalfPayment
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                      }`}
                    >
                      Half 50% (₹{Math.round(currentDue / 2).toLocaleString('en-IN')})
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleQuickAmount(10000)}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 transition-colors cursor-pointer"
                >
                  ₹10k
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAmount(25000)}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 transition-colors cursor-pointer"
                >
                  ₹25k
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAmount(50000)}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 transition-colors cursor-pointer"
                >
                  ₹50k
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                Payment Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Mode-specific fields */}
          {paymentMethod === 'cash' && (
            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                <Wallet className="w-3.5 h-3.5 text-blue-600" />
                <span>Cash Payment Details</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Cash Register / Godown
                  </label>
                  <select
                    value={cashLocation}
                    onChange={(e) => setCashLocation(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="Main Cash Counter">Main Cash Counter</option>
                    <option value="Factory Office Drawer">Factory Office Drawer</option>
                    <option value="Sales Representative">Sales Representative</option>
                    <option value="Petty Cash Box">Petty Cash Box</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Receipt / Voucher Number
                  </label>
                  <input
                    type="text"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder="e.g. REC-929666"
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-mono font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {paymentMethod === 'cheque' && (
            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>Cheque Payment Details</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Cheque Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                    placeholder="e.g. 000124"
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-mono font-semibold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Cheque Date
                  </label>
                  <input
                    type="date"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. HDFC Bank, SBI"
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Branch Name
                  </label>
                  <input
                    type="text"
                    value={bankBranch}
                    onChange={(e) => setBankBranch(e.target.value)}
                    placeholder="e.g. Industrial Area Branch"
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {paymentMethod === 'upi' && (
            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                <span>UPI / QR Payment Details</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    UPI Provider / App
                  </label>
                  <select
                    value={upiProvider}
                    onChange={(e) => setUpiProvider(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="PhonePe">PhonePe</option>
                    <option value="Google Pay">Google Pay</option>
                    <option value="Paytm">Paytm</option>
                    <option value="BHIM">BHIM</option>
                    <option value="Bank QR">Bank Official QR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    UPI Reference / UTR Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={upiReference}
                    onChange={(e) => setUpiReference(e.target.value)}
                    placeholder="e.g. 427819381729"
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-mono font-semibold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Credited In Account
                  </label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g. Primary Current Account"
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {paymentMethod === 'bank_transfer' && (
            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Bank Transfer Details (NEFT / RTGS / IMPS)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Transfer Type
                  </label>
                  <select
                    value={transferType}
                    onChange={(e) => setTransferType(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="NEFT">NEFT</option>
                    <option value="RTGS">RTGS</option>
                    <option value="IMPS">IMPS</option>
                    <option value="Internal Transfer">Internal Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    UTR / Transaction Ref <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={bankUtr}
                    onChange={(e) => setBankUtr(e.target.value)}
                    placeholder="e.g. UTIB260901238491"
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-mono font-semibold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Remitting Bank Name
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. State Bank of India"
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notes / Remarks */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
              Notes / Remarks
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Advance cash received against order"
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Financial Calculation Summary Box */}
          <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-2 text-xs">
            <div className="flex items-center justify-between text-gray-700">
              <span className="font-medium">Paying Now:</span>
              <span className="font-bold font-mono text-gray-900">
                ₹{parsedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {totalAmount > 0 ? (
              <div className="flex items-center justify-between text-gray-700">
                <span className="font-medium">Remaining Balance:</span>
                <span className={`font-bold font-mono ${remainingAfterPayment > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  ₹{remainingAfterPayment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-gray-500 text-[11px]">
                <span>Order Status:</span>
                <span className="text-gray-600 italic">Remaining balance will calculate when items are added</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-gray-200/80 text-[11px]">
              <span className="text-gray-500 font-medium">Payment Status:</span>
              {totalAmount > 0 ? (
                remainingAfterPayment <= 0 && parsedAmount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Fully Paid
                  </span>
                ) : parsedAmount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    Partially Paid (Remaining ₹{remainingAfterPayment.toLocaleString('en-IN')})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    Unpaid
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
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
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

import React, { useState, useEffect } from 'react';
import { X, Check, DollarSign, Calendar, CreditCard, Hash, FileText, User } from 'lucide-react';
import { createTransaction } from '../../api/transactionApi';
import { recordCustomerPaymentApi } from '../../api/partyApi';
import { showToast } from '../ui/Toast';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  customers: Array<{ id: string; name: string; code?: string; phone?: string }>;
  defaultCustomerId?: string;
  defaultAmount?: number;
  companyId?: string;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  customers,
  defaultCustomerId,
  defaultAmount,
  companyId
}) => {
  const [partyId, setPartyId] = useState(defaultCustomerId || '');
  const [type, setType] = useState<'credit' | 'debit'>('credit'); // credit = payment received from customer, debit = refund/payment to customer
  const [category, setCategory] = useState<'Payment' | 'Discount' | 'Adjustment' | 'Opening'>('Payment');
  const [amount, setAmount] = useState<string>(defaultAmount ? String(defaultAmount) : '');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<string>('UPI');
  const [referenceId, setReferenceId] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (defaultCustomerId) setPartyId(defaultCustomerId);
      else if (customers.length > 0 && !partyId) setPartyId(customers[0].id || customers[0].name);
      if (defaultAmount) setAmount(String(defaultAmount));
    }
  }, [isOpen, defaultCustomerId, defaultAmount, customers]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      showToast('Please enter a valid payment amount', 'error');
      return;
    }

    const selectedCust = customers.find(c => c.id === partyId || c.name === partyId);
    const partyName = selectedCust ? selectedCust.name : partyId;

    setIsSubmitting(true);
    try {
      const payload = {
        companyId,
        date,
        type, // credit = receipt (reduces customer balance), debit = charge (increases customer balance)
        category: category,
        amount: numAmount,
        paymentMethod,
        referenceId: referenceId.trim() || `PAY-${Math.floor(10000 + Math.random() * 90000)}`,
        partyName,
        partyId: selectedCust?.id || partyId,
        ledgerAccount: partyName,
        description: description.trim() || `${category} recorded for ${partyName}`
      };

      // Try API first
      try {
        await createTransaction(payload);
      } catch (err) {
        console.warn('Backend transaction API notice, saving to local transactions cache:', err);
      }

      // Also trigger party payment API if available
      if (selectedCust?.id && category === 'Payment') {
        try {
          await recordCustomerPaymentApi(selectedCust.id, {
            amount: numAmount,
            date,
            paymentMethod,
            referenceNo: payload.referenceId,
            remarks: payload.description
          });
        } catch {}
      }

      // Save to local storage for fail-safe persistence
      const key = `skbw_transactions_${companyId || 'default'}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.unshift({
        ...payload,
        _id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        createdAt: new Date().toISOString()
      });
      localStorage.setItem(key, JSON.stringify(existing));

      showToast(`Payment of ₹${numAmount.toLocaleString('en-IN')} recorded successfully!`, 'success');
      window.dispatchEvent(new CustomEvent('ledger_updated'));
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      showToast('Failed to record payment', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs font-sans">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Record Payment / Receipt</h3>
              <p className="text-xs text-slate-500">Post transaction entry directly to customer ledger</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Party Select */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Customer / Party</span>
            </label>
            <select
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none transition-all"
            >
              <option value="">Select Customer...</option>
              {customers.map((c) => (
                <option key={c.id || c.name} value={c.id || c.name}>
                  {c.name} {c.code ? `(${c.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Entry Type & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Entry Nature
              </label>
              <div className="flex rounded-xl p-1 bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setType('credit')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    type === 'credit'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Credit (Receipt)
                </button>
                <button
                  type="button"
                  onClick={() => setType('debit')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    type === 'debit'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Debit (Charge)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Voucher Type
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:border-blue-600 outline-none"
              >
                <option value="Payment">Payment / Receipt</option>
                <option value="Discount">Discount Allowed</option>
                <option value="Adjustment">Rate Difference / Adjustment</option>
                <option value="Opening">Opening Balance</option>
              </select>
            </div>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Amount (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  step="any"
                  min="1"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full pl-7 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Payment Date</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:border-blue-600 outline-none"
              />
            </div>
          </div>

          {/* Payment Method & Ref No */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                <span>Mode of Payment</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:border-blue-600 outline-none"
              >
                <option value="UPI">UPI / GPay / PhonePe</option>
                <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                <option value="Cheque">Cheque</option>
                <option value="Cash">Cash</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                <span>Ref / Cheque No</span>
              </label>
              <input
                type="text"
                placeholder="e.g. UTR-984021"
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:border-blue-600 outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Particulars / Narration</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Payment received against Invoice #INV-260845"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:border-blue-600 outline-none"
            />
          </div>

          {/* Buttons */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-150">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{isSubmitting ? 'Posting...' : 'Save & Post Entry'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, RefreshCw, Send, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSkusV2, getWarehouseHierarchyV2, getBalancesV2, SkuV2, WarehouseLocationV2 } from '../../api/mfgApiV2';
import { createInventoryLedgerEntry } from './ledger/services/ledgerService';
import { showToast } from '../ui/Toast';

const TestingTransactionsV2: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [form, setForm] = useState({
    txType: 'Purchase', // Purchase, Adjustment In, Adjustment Out, Transfer, Opening Stock
    skuId: '',
    locationId: '',
    quantity: '',
    referenceId: '',
    remarks: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (selectedCompany?._id) {
      loadFormData();
    }
  }, [selectedCompany?._id]);

  const loadFormData = async () => {
    setLoading(true);
    try {
      const [skuData, locData, balData] = await Promise.all([
        getSkusV2(selectedCompany?._id || ''),
        getWarehouseHierarchyV2(selectedCompany?._id || ''),
        getBalancesV2(selectedCompany?._id || '')
      ]);
      setSkus(skuData.filter(s => s.status === 'Active'));
      setLocations(locData.filter(l => l.level === 'Storage Location' && l.status === 'Active'));
      setBalances(balData);
    } catch (e) {
      console.error(e);
      showToast('Failed to load transaction master lists', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setForm({
      txType: 'Purchase',
      skuId: '',
      locationId: '',
      quantity: '',
      referenceId: '',
      remarks: ''
    });
    setError('');
  };

  const selectedSku = skus.find(s => s._id === form.skuId);
  const currentStock = balances.find(b => b.skuId === form.skuId && b.locationId === form.locationId)?.onHand || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validations
    if (!form.txType) {
      setError('Please select a transaction type');
      return;
    }
    if (!form.skuId) {
      setError('Please select a SKU');
      return;
    }
    if (!form.locationId) {
      setError('Please select a storage location');
      return;
    }
    const qty = Number(form.quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Quantity must be greater than zero');
      return;
    }
    if (!form.referenceId.trim()) {
      setError('Reference Number is required');
      return;
    }

    // Determine direction
    let direction: 'IN' | 'OUT' = 'IN';
    let typeName: any = 'Purchase';
    let refType = 'PurchaseOrder';

    if (form.txType === 'Purchase') {
      direction = 'IN';
      typeName = 'Purchase';
      refType = 'PurchaseOrder';
    } else if (form.txType === 'Adjustment In') {
      direction = 'IN';
      typeName = 'Adjustment';
      refType = 'AdjustmentNote';
    } else if (form.txType === 'Adjustment Out') {
      direction = 'OUT';
      typeName = 'Adjustment';
      refType = 'AdjustmentNote';
    } else if (form.txType === 'Transfer') {
      direction = 'OUT';
      typeName = 'Transfer';
      refType = 'TransferOrder';
    } else if (form.txType === 'Opening Stock') {
      direction = 'IN';
      typeName = 'Opening Balance';
      refType = 'OpeningLog';
    }

    // Available stock validation for OUT operations
    if (direction === 'OUT' && qty > currentStock) {
      setError(`Insufficient stock. You requested ${qty} ${selectedSku?.unit || ''}, but only ${currentStock} ${selectedSku?.unit || ''} is available at this location.`);
      return;
    }

    setSubmitting(true);
    try {
      await createInventoryLedgerEntry({
        transactionType: typeName,
        skuId: form.skuId,
        quantity: qty,
        unit: selectedSku?.unit || 'kg',
        direction,
        referenceType: refType,
        referenceId: form.referenceId,
        locationId: form.locationId,
        remarks: form.remarks,
        company: selectedCompany?._id
      });

      showToast(`Transaction posted successfully! Ledger and Balance updated.`, 'success');
      handleReset();
      // Reload balances list so subsequent validation checks use updated quantities
      const updatedBal = await getBalancesV2(selectedCompany?._id || '');
      setBalances(updatedBal);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.msg || 'Failed to post transaction ledger entry');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-3xs">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-600" />
            Inventory Transactions (Testing)
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Admin Sandbox testing panel to post transaction ledger events directly</p>
        </div>
        <button
          onClick={loadFormData}
          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-50 border border-gray-200 rounded-xl transition-colors bg-white shadow-3xs"
          title="Reload Form References"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Form Entry */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-200 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
          <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Test Ingestion Engine</span>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-150 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Transaction Type *</label>
              <select
                value={form.txType}
                onChange={e => setForm({ ...form, txType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                required
              >
                <option value="Purchase">Purchase (IN)</option>
                <option value="Opening Stock">Opening Stock (IN)</option>
                <option value="Adjustment In">Adjustment In (IN)</option>
                <option value="Adjustment Out">Adjustment Out (OUT)</option>
                <option value="Transfer">Transfer (OUT)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Reference Number *</label>
              <input
                type="text"
                placeholder="e.g. PO-7890, ADJ-1002, TR-998"
                value={form.referenceId}
                onChange={e => setForm({ ...form, referenceId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Select SKU *</label>
              <select
                value={form.skuId}
                onChange={e => setForm({ ...form, skuId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                required
              >
                <option value="">-- Choose SKU --</option>
                {skus.map(s => (
                  <option key={s._id} value={s._id}>{s.name} ({s.skuCode})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Select Storage Location *</label>
              <select
                value={form.locationId}
                onChange={e => setForm({ ...form, locationId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                required
              >
                <option value="">-- Choose Location --</option>
                {locations.map(l => (
                  <option key={l._id} value={l._id}>{l.name} ({l.level})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Quantity *</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 500"
                value={form.quantity}
                onChange={e => setForm({ ...form, quantity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Unit (Auto-populated)</label>
              <input
                type="text"
                value={selectedSku?.unit || '—'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-gray-100/80 font-mono text-gray-500 select-none"
                readOnly
              />
            </div>
          </div>

          {/* Current Stock Indicator details */}
          {form.skuId && form.locationId && (
            <div className="p-3 bg-blue-50 border border-blue-150 rounded-xl flex items-center justify-between text-xs">
              <span className="font-semibold text-blue-700">Active Stock at Selected Location:</span>
              <span className="font-bold text-blue-900">
                {currentStock} {selectedSku?.unit || ''}
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Transaction Notes / Remarks</label>
            <textarea
              placeholder="Provide validation comments, reasons, or additional documentation notes..."
              value={form.remarks}
              onChange={e => setForm({ ...form, remarks: e.target.value })}
              className="w-full h-24 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <div className="pt-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 bg-white"
            >
              Reset Form
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors"
            >
              {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Save Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TestingTransactionsV2;

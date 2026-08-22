import React, { useEffect, useState } from 'react';
import { 
  ArrowRightLeft, Plus, Search, Calendar, RefreshCw, ChevronRight, 
  MapPin, Check, FileText, AlertCircle, X, ArrowUpRight, ShieldCheck 
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { getSkusV2, getWarehouseHierarchyV2, getBalancesV2, recordTransferV2, SkuV2, WarehouseLocationV2 } from '../../../api/mfgApiV2';
import { fetchInventoryLedger } from '../ledger/ledgerService';
import { showToast } from '../../ui/Toast';
import Modal from '../../ui/Modal';
import Drawer from '../../ui/Drawer';

const StockTransferModule: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search
  const [search, setSearch] = useState('');
  const [filterSku, setFilterSku] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    skuId: '',
    fromLocationId: '',
    toLocationId: '',
    quantity: '',
    batchNumber: '',
    remarks: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (selectedCompany?._id) {
      loadData();
    }
  }, [selectedCompany?._id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [skuData, locData, balData, ledgerRes] = await Promise.all([
        getSkusV2(selectedCompany?._id || ''),
        getWarehouseHierarchyV2(selectedCompany?._id || ''),
        getBalancesV2(selectedCompany?._id || ''),
        fetchInventoryLedger({
          companyId: selectedCompany?._id || '',
          transactionType: 'TRANSFER',
          limit: 50
        })
      ]);

      setSkus(skuData.filter(s => s.status === 'Active'));
      setLocations(locData.filter(l => l.level === 'Storage Location' && l.status === 'Active'));
      setBalances(balData);
      setTransfers(ledgerRes.entries || []);
    } catch (e) {
      console.error(e);
      showToast('Failed to load transfer data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTransferModal = () => {
    setError('');
    const defaultSku = skus[0];
    const defaultLoc = locations[0];
    setForm({
      skuId: defaultSku?._id || '',
      fromLocationId: defaultLoc?._id || '',
      toLocationId: locations[1]?._id || '',
      quantity: '',
      batchNumber: '',
      remarks: ''
    });
    setIsModalOpen(true);
  };

  // Calculate live available stock at source location
  const selectedSku = skus.find(s => s._id === form.skuId);
  const availableSourceStock = balances.find(
    b => (b.sku?._id || b.skuId) === form.skuId && (b.location?._id || b.locationId) === form.fromLocationId
  )?.onHand || 0;

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.skuId) {
      setError('Please select an item SKU to transfer');
      return;
    }
    if (!form.fromLocationId) {
      setError('Please select a source storage location');
      return;
    }
    if (!form.toLocationId) {
      setError('Please select a destination storage location');
      return;
    }
    if (form.fromLocationId === form.toLocationId) {
      setError('Source and destination locations cannot be identical');
      return;
    }

    const qty = Number(form.quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Transfer quantity must be a positive number');
      return;
    }

    if (qty > availableSourceStock) {
      setError(`Insufficient stock at source. Requested: ${qty} ${selectedSku?.unit || 'units'}, Available: ${availableSourceStock} ${selectedSku?.unit || 'units'}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await recordTransferV2({
        company: selectedCompany?._id || '',
        skuId: form.skuId,
        fromLocationId: form.fromLocationId,
        toLocationId: form.toLocationId,
        quantity: qty,
        batchNumber: form.batchNumber || undefined,
        remarks: form.remarks || `Stock transfer of ${selectedSku?.name || 'SKU'}`
      });

      showToast(`Stock transfer completed successfully!`, 'success');
      setIsModalOpen(false);
      loadData();
    } catch (e: any) {
      console.error(e);
      const msg = e.response?.data?.msg || e.message || 'Stock transfer failed';
      setError(msg);
      showToast(msg, 'error');
    } fontally: {
      setSubmitting(false);
    }
  };

  const getLocationPath = (locId: string) => {
    const loc = locations.find(l => l._id === locId);
    return loc ? loc.name : 'Storage Location';
  };

  const filteredTransfers = transfers.filter(tx => {
    const skuName = (tx.skuId?.name || '').toLowerCase();
    const refId = (tx.referenceId || tx.transactionNumber || '').toLowerCase();
    const matchesSearch = skuName.includes(search.toLowerCase()) || refId.includes(search.toLowerCase());
    const matchesSku = !filterSku || (tx.skuId?._id || tx.skuId) === filterSku;
    return matchesSearch && matchesSku;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 flex-1 w-full relative transition-all duration-300 text-left font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-wider">
            <ArrowRightLeft className="w-4 h-4" />
            <span>Inventory Movements</span>
          </div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight mt-1 flex items-center gap-2">
            Stock Location Transfers
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Transfer raw materials, paper reels, sheets, and finished goods across storage locations
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 transition-colors shadow-3xs cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenTransferModal}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-2xl text-xs font-extrabold shadow-md shadow-blue-500/25 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Stock Transfer</span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 bg-blue-800/80 rounded-md text-[10px] font-mono text-blue-100 font-bold">
              Alt/Opt+C
            </span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-gray-200 shadow-3xs">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search transfer history by SKU name or reference..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-gray-50/70 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white font-medium"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={filterSku}
            onChange={e => setFilterSku(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-gray-200 rounded-lg font-semibold text-gray-700 focus:outline-none cursor-pointer"
          >
            <option value="">All Item SKUs</option>
            {skus.map(s => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/80 text-gray-500 uppercase font-bold border-b border-gray-200 text-[10px] tracking-wider">
                <th className="py-3.5 pl-6 pr-4">DATE & TIME</th>
                <th className="py-3.5 px-4">TRANSACTION NO.</th>
                <th className="py-3.5 px-4">ITEM SKU</th>
                <th className="py-3.5 px-4">SOURCE LOCATION</th>
                <th className="py-3.5 px-4">DESTINATION LOCATION</th>
                <th className="py-3.5 px-4 text-right">QUANTITY</th>
                <th className="py-3.5 pr-6 pl-4">PERFORMED BY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-700 bg-white">
              {filteredTransfers.map((tx) => {
                const dateStr = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                const timeStr = tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

                return (
                  <tr key={tx._id} className="hover:bg-gray-50/70 transition-colors border-b border-gray-100">
                    <td className="py-3.5 pl-6 pr-4 whitespace-nowrap">
                      <div className="font-bold text-gray-900 text-xs">{dateStr}</div>
                      <div className="text-[10px] text-gray-400 font-normal mt-0.5">{timeStr}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-600 text-xs whitespace-nowrap">
                      {tx.transactionNumber || tx.referenceId || 'TXF-AUG-001'}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-bold text-gray-900 text-xs">{tx.skuId?.name || 'vector Reel 52 GSM 64 CM'}</div>
                      <div className="text-[10px] text-gray-400 font-normal">{tx.skuId?.brand || 'BILT'}</div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-800 whitespace-nowrap">
                      {tx.fromLocationName || 'SKBW > Ground > Asha > Bin A'}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-800 whitespace-nowrap">
                      {tx.toLocationName || 'SKBW > Ground > Murali > Bottom'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-blue-700 text-xs whitespace-nowrap">
                      {Math.abs(tx.quantity || 0).toLocaleString()} {tx.unit || tx.skuId?.unit || 'KG'}
                    </td>
                    <td className="py-3.5 pr-6 pl-4 text-gray-600 text-xs whitespace-nowrap">
                      {tx.createdBy?.fullName || 'System Administrator'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: New Stock Transfer */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Execute Stock Location Transfer"
        size="max-w-lg"
      >
        <form onSubmit={handleSubmitTransfer} className="space-y-4 text-xs text-left">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
              Select Item SKU to Transfer *
            </label>
            <select
              value={form.skuId}
              onChange={e => setForm({ ...form, skuId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl font-bold bg-white text-gray-900 focus:outline-none"
              required
            >
              {skus.map(s => (
                <option key={s._id} value={s._id}>{s.name} ({s.skuCode})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                Source Storage Location *
              </label>
              <select
                value={form.fromLocationId}
                onChange={e => setForm({ ...form, fromLocationId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-semibold bg-white text-gray-900 focus:outline-none"
                required
              >
                {locations.map(l => (
                  <option key={l._id} value={l._id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                Destination Location *
              </label>
              <select
                value={form.toLocationId}
                onChange={e => setForm({ ...form, toLocationId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-semibold bg-white text-gray-900 focus:outline-none"
                required
              >
                {locations.map(l => (
                  <option key={l._id} value={l._id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Live Stock Indicator at Source */}
          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between">
            <span className="font-bold text-blue-900 text-xs">Available Stock at Source:</span>
            <span className="font-black text-blue-700 text-sm">{availableSourceStock} {selectedSku?.unit || 'units'}</span>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
              Transfer Quantity ({selectedSku?.unit || 'units'}) *
            </label>
            <input
              type="number"
              placeholder="Enter transfer quantity..."
              value={form.quantity}
              onChange={e => setForm({ ...form, quantity: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl font-bold text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              min="0.001"
              step="any"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
              Remarks / Transfer Reason
            </label>
            <input
              type="text"
              placeholder="e.g. Stock relocation for upcoming production batch"
              value={form.remarks}
              onChange={e => setForm({ ...form, remarks: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl font-medium focus:outline-none"
            />
          </div>

          <div className="pt-3 border-t border-gray-150 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-500/20 flex items-center gap-1.5"
            >
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
              <span>Confirm & Transfer</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default StockTransferModule;

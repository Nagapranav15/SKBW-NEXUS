import React, { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as mfgApi from '../../api/mfgApi';
import { showToast } from '../ui/Toast';

const MfgReports: React.FC = () => {
  const { selectedCompany, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [stock, setStock] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'valuation' | 'ledger'>('valuation');

  useEffect(() => { if (selectedCompany) load(); }, [selectedCompany]);
  const load = async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([mfgApi.getStock(selectedCompany?._id), mfgApi.getMovements({ companyId: selectedCompany?._id, limit: 100 })]);
      setStock(s.data || []); setMovements(m.data.movements || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const exportCSV = (rows: any[], filename: string) => {
    if (!rows.length) { showToast('No data', 'warning'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    showToast('Exported', 'success');
  };

  const exportValuation = () => exportCSV(stock.map(s => ({
    Zone: s.zone?.zone_code || '', SKU_Code: s.sku?.sku_code || '', SKU_Name: s.sku?.name || '',
    Category: s.sku?.category || '', Quantity: s.quantity, Unit: s.sku?.unit_type || '',
    ...(isAdmin ? { Cost: s.sku?.cost_per_unit || 0, Value: (s.quantity * (s.sku?.cost_per_unit || 0)).toFixed(2) } : {})
  })), `inventory_valuation_${new Date().toISOString().split('T')[0]}.csv`);

  const exportLedger = () => exportCSV(movements.map(m => ({
    Date: new Date(m.createdAt).toLocaleDateString(), Type: m.type,
    SKU: m.sku?.name || '', Quantity: m.quantity, Unit: m.unit,
    From: m.from_zone?.zone_code || '', To: m.to_zone?.zone_code || '',
    Remarks: m.remarks || '', By: m.createdBy?.fullName || ''
  })), `stock_ledger_${new Date().toISOString().split('T')[0]}.csv`);

  const totalValue = isAdmin ? stock.reduce((a, s) => a + s.quantity * (s.sku?.cost_per_unit || 0), 0) : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Reports</h1><p className="text-sm text-gray-500">Inventory valuation & stock ledger</p></div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 hover:bg-gray-100 rounded-lg border"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={tab === 'valuation' ? exportValuation : exportLedger} className="flex items-center gap-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"><Download className="w-4 h-4" /> Export CSV</button>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('valuation')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'valuation' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Inventory Valuation</button>
        <button onClick={() => setTab('ledger')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'ledger' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Stock Ledger</button>
      </div>

      {tab === 'valuation' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {isAdmin && totalValue !== null && <div className="px-6 py-3 bg-blue-50 border-b text-sm font-medium text-blue-800">Total Inventory Value: ₹{totalValue.toLocaleString()}</div>}
          <table className="w-full text-left"><thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase"><th className="px-6 py-3">Zone</th><th className="px-6 py-3">SKU</th><th className="px-6 py-3">Category</th><th className="px-6 py-3">Quantity</th><th className="px-6 py-3">Unit</th>{isAdmin && <><th className="px-6 py-3">Cost/Unit</th><th className="px-6 py-3">Value</th></>}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr> :
               stock.length === 0 ? <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">No stock data</td></tr> :
               stock.map((s, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm font-medium text-blue-600">{s.zone?.zone_code || '-'}</td>
                  <td className="px-6 py-3 text-sm">{s.sku?.name || '-'}<div className="text-xs text-gray-400">{s.sku?.sku_code}</div></td>
                  <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.sku?.category === 'Raw' ? 'bg-amber-100 text-amber-800' : s.sku?.category === 'Finished' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>{s.sku?.category}</span></td>
                  <td className="px-6 py-3 text-sm font-semibold">{s.quantity.toLocaleString()}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{s.sku?.unit_type}</td>
                  {isAdmin && <><td className="px-6 py-3 text-sm">₹{s.sku?.cost_per_unit || 0}</td><td className="px-6 py-3 text-sm font-medium">₹{(s.quantity * (s.sku?.cost_per_unit || 0)).toLocaleString()}</td></>}
                </tr>
              ))}
            </tbody></table>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-left"><thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase"><th className="px-6 py-3">Date</th><th className="px-6 py-3">Type</th><th className="px-6 py-3">SKU</th><th className="px-6 py-3">Qty</th><th className="px-6 py-3">From</th><th className="px-6 py-3">To</th><th className="px-6 py-3">By</th><th className="px-6 py-3">Remarks</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr> :
               movements.length === 0 ? <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">No movements</td></tr> :
               movements.map(m => (
                <tr key={m._id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-xs text-gray-500">{new Date(m.createdAt).toLocaleString()}</td>
                  <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.type === 'IN' ? 'bg-green-100 text-green-800' : m.type === 'OUT' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{m.type}</span></td>
                  <td className="px-6 py-3 text-sm">{m.sku?.name || '-'}</td>
                  <td className="px-6 py-3 text-sm font-semibold">{m.quantity} {m.unit}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{m.from_zone?.zone_code || '-'}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{m.to_zone?.zone_code || '-'}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{m.createdBy?.fullName || '-'}</td>
                  <td className="px-6 py-3 text-sm text-gray-400 max-w-[200px] truncate">{m.remarks || '-'}</td>
                </tr>
              ))}
            </tbody></table>
        </div>
      )}
    </div>
  );
};

export default MfgReports;

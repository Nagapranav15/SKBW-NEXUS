import React, { useEffect, useState } from 'react';
import { FileText, Download, Filter, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as ledgerApi from '../../api/inventoryLedgerApi';
import { showToast } from '../ui/Toast';

const ReportsPage: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filterAction, setFilterAction] = useState('');
  const limit = 30;

  useEffect(() => { if (selectedCompany) loadLogs(); }, [selectedCompany, page, filterAction]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await ledgerApi.getAuditLogs({
        companyId: selectedCompany?._id, limit, skip: page * limit,
        ...(filterAction ? { action_type: filterAction } : {})
      });
      setAuditLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleExportLogs = () => {
    if (!auditLogs.length) { showToast('No data', 'warning'); return; }
    const rows = auditLogs.map((l: any) => ({
      date: new Date(l.createdAt).toLocaleString(),
      item: l.item?.name || '', action: l.action_type,
      before: l.quantity_before, after: l.quantity_after, change: l.change_amount,
      by: l.performed_by?.fullName || 'System', reason: l.reason || ''
    }));
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r as any)[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('Logs exported', 'success');
  };

  const actionColors: any = {
    IN: 'bg-green-100 text-green-800', OUT: 'bg-red-100 text-red-800',
    TRANSFER_IN: 'bg-blue-100 text-blue-800', TRANSFER_OUT: 'bg-indigo-100 text-indigo-800',
    ADJUSTMENT: 'bg-yellow-100 text-yellow-800', OPENING_STOCK: 'bg-teal-100 text-teal-800',
    PRODUCTION_CONSUME: 'bg-orange-100 text-orange-800', PRODUCTION_OUTPUT: 'bg-purple-100 text-purple-800'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-semibold text-gray-900">Reports & Audit Logs</h2><p className="text-sm text-gray-500 mt-1">Complete audit trail of all stock changes</p></div>
        <button onClick={handleExportLogs} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"><Download className="w-4 h-4" /> Export</button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <Filter className="w-4 h-4 text-gray-500" />
        {['', 'IN', 'OUT', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT'].map(t => (
          <button key={t} onClick={() => { setFilterAction(t); setPage(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filterAction === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {t || 'All'}
          </button>
        ))}
        <button onClick={loadLogs} className="ml-auto p-2 hover:bg-gray-100 rounded-lg"><RefreshCw className="w-4 h-4 text-gray-500" /></button>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs font-medium uppercase tracking-wider">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Action</th>
                <th className="px-6 py-3">Item</th>
                <th className="px-6 py-3">Before</th>
                <th className="px-6 py-3">After</th>
                <th className="px-6 py-3">Change</th>
                <th className="px-6 py-3">By</th>
                <th className="px-6 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr>
              ) : auditLogs.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">No audit logs found</td></tr>
              ) : auditLogs.map((log: any) => (
                <tr key={log._id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm text-gray-500">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionColors[log.action_type] || 'bg-gray-100 text-gray-700'}`}>{log.action_type}</span></td>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{log.item?.name || '-'}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{log.quantity_before}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{log.quantity_after}</td>
                  <td className="px-6 py-3"><span className={`text-sm font-medium ${log.change_amount > 0 ? 'text-green-600' : 'text-red-600'}`}>{log.change_amount > 0 ? '+' : ''}{log.change_amount}</span></td>
                  <td className="px-6 py-3 text-sm text-gray-500">{log.performed_by?.fullName || 'System'}</td>
                  <td className="px-6 py-3 text-sm text-gray-400 max-w-[200px] truncate">{log.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > limit && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-500">{page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50">Prev</button>
              <button disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;

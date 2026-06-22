import React, { useState, useEffect, useRef } from 'react';
import { Plus, Download, Upload, Search, Filter, Trash2, Edit, X, FileText, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import * as txnApi from '../api/transactionApi';
import * as XLSX from 'xlsx';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', color: 'bg-green-100 text-green-700' },
  { value: 'upi', label: 'UPI', color: 'bg-purple-100 text-purple-700' },
  { value: 'card', label: 'Card', color: 'bg-blue-100 text-blue-700' },
  { value: 'bank_transfer', label: 'Bank Transfer', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'cheque', label: 'Cheque', color: 'bg-orange-100 text-orange-700' },
  { value: 'custom', label: 'Custom', color: 'bg-gray-100 text-gray-700' },
];
const CATEGORIES = ['Sales', 'Purchase', 'Salary', 'Rent', 'Utilities', 'Transport', 'Marketing', 'Office Supplies', 'Maintenance', 'Other'];
const SOURCE_TYPES = ['MANUAL', 'SALE', 'PURCHASE', 'EXPENSE', 'IMPORT', 'SYSTEM'];
const getRefLabel = (mode: string) => {
  switch (mode) {
    case 'upi': return 'UTR Number';
    case 'cheque': return 'Cheque Number';
    case 'bank_transfer': return 'Reference Number';
    default: return 'Notes (optional)';
  }
};

const TransactionTools: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [activeTab, setActiveTab] = useState<'list' | 'export' | 'import'>('list');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<any>({ type: '', category: '', paymentMethod: '', startDate: '', endDate: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTxn, setEditingTxn] = useState<any>(null);
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], type: 'credit', category: '', subcategory: '', amount: '', paymentMethod: 'cash', customPaymentMethod: '', referenceId: '', ledgerAccount: '', description: '', partyName: '' });
  const [exportDate, setExportDate] = useState(new Date().toISOString().split('T')[0]);
  const [exportFormat, setExportFormat] = useState('xlsx');
  const [exporting, setExporting] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importMode, setImportMode] = useState('merge');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedCompany?._id) {
      fetchTransactions();
    }
  }, [selectedCompany, pagination.page, search, filters]);

  const fetchTransactions = async () => {
    if (!selectedCompany?._id) return;
    setLoading(true);
    try {
      const params: any = { companyId: selectedCompany._id, page: pagination.page, limit: pagination.limit, search };
      if (filters.type) params.type = filters.type;
      if (filters.category) params.category = filters.category;
      if (filters.paymentMethod) params.paymentMethod = filters.paymentMethod;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const res = await txnApi.getTransactions(params);
      setTransactions(res.data.transactions);
      setPagination(p => ({ ...p, ...res.data.pagination }));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!selectedCompany?._id) return;
    try {
      const data = { ...form, amount: Number(form.amount), company: selectedCompany._id };
      if (editingTxn) { await txnApi.updateTransaction(editingTxn._id, data); }
      else { await txnApi.createTransaction(data); }
      setShowModal(false); setEditingTxn(null); resetForm(); fetchTransactions();
    } catch (err: any) { alert(err.response?.data?.msg || 'Error saving'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    await txnApi.deleteTransaction(id); fetchTransactions();
  };

  const handleEdit = (t: any) => {
    setEditingTxn(t);
    setForm({ date: t.date?.split('T')[0] || '', type: t.type, category: t.category || '', subcategory: t.subcategory || '', amount: String(t.amount), paymentMethod: t.paymentMethod || 'cash', customPaymentMethod: t.customPaymentMethod || '', referenceId: t.referenceId || '', ledgerAccount: t.ledgerAccount || '', description: t.description || '', partyName: t.partyName || '' });
    setShowModal(true);
  };

  const resetForm = () => setForm({ date: new Date().toISOString().split('T')[0], type: 'credit', category: '', subcategory: '', amount: '', paymentMethod: 'cash', customPaymentMethod: '', referenceId: '', ledgerAccount: '', description: '', partyName: '' });

  const handleExportDaily = async () => {
    if (!selectedCompany?._id) return;
    setExporting(true);
    try {
      const res = await txnApi.exportDailyTransactions(exportDate, exportFormat, selectedCompany._id);
      if (exportFormat === 'json') {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        txnApi.downloadBlob(blob, `transactions_${exportDate}.json`);
      } else {
        txnApi.downloadBlob(res.data, `transactions_${exportDate}.${exportFormat === 'csv' ? 'csv' : 'xlsx'}`);
      }
    } catch (err) { alert('Export failed'); }
    finally { setExporting(false); }
  };

  const handleExportLedger = async () => {
    if (!selectedCompany?._id) return;
    setExporting(true);
    try {
      const res = await txnApi.exportLedger(selectedCompany._id);
      txnApi.downloadBlob(res.data, `ledger_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) { alert('Ledger export failed'); }
    finally { setExporting(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg('');
    try {
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        setImportData(parsed.transactions || parsed);
      } else {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        setImportData(rows.map((r: any) => ({ date: r.Date || r.date, transactionId: r['Transaction ID'] || r.transactionId, type: r.Type || r.type || 'income', category: r.Category || r.category || '', amount: Number(r.Amount || r.amount || 0), paymentMethod: r['Payment Method'] || r.paymentMethod || 'cash', ledgerAccount: r['Ledger/Account'] || r.ledgerAccount || '', partyName: r.Party || r.partyName || '', description: r.Description || r.description || '' })));
      }
    } catch { alert('Failed to parse file'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handlePreview = async () => {
    if (!selectedCompany?._id) return;
    try {
      const res = await txnApi.previewImport(importData, selectedCompany._id);
      setImportPreview(res.data);
    } catch { alert('Preview failed'); }
  };

  const handleImport = async () => {
    if (!selectedCompany?._id) return;
    setImporting(true);
    try {
      const res = await txnApi.importTransactions(importData, selectedCompany._id, importMode);
      setImportMsg(`Imported: ${res.data.imported}, Skipped: ${res.data.skipped}, Overwritten: ${res.data.overwritten}`);
      setImportData([]); setImportPreview(null); fetchTransactions();
    } catch { alert('Import failed'); }
    finally { setImporting(false); }
  };

  const pmBadge = (pm: string, custom?: string) => {
    const m = PAYMENT_METHODS.find(p => p.value === pm) || PAYMENT_METHODS[4];
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.color}`}>{pm === 'custom' ? (custom || 'Custom') : m.label}</span>;
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Transaction Tools</h1>
        <p className="text-gray-600 text-sm mt-1">Manage transactions, export data, and import records</p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {[{ key: 'list', label: 'Transactions' }, { key: 'export', label: 'Export' }, { key: 'import', label: 'Import' }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === t.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>{t.label}</button>
        ))}
      </div>

      {/* LIST TAB */}
      {activeTab === 'list' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }} placeholder="Search transactions..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm border transition-colors ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}><Filter className="w-4 h-4" /><span>Filters</span></button>
            <button onClick={fetchTransactions} className="p-2 text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors bg-white shadow-sm" title="Refresh transactions"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={() => { resetForm(); setEditingTxn(null); setShowModal(true); }} className="flex items-center space-x-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"><Plus className="w-4 h-4" /><span>Add</span></button>
          </div>

          {showFilters && (
            <div className="p-4 border-b border-gray-100 bg-gray-50 grid grid-cols-2 md:grid-cols-6 gap-3">
              <select value={filters.type} onChange={e => setFilters((f: any) => ({ ...f, type: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">All Types</option><option value="credit">Credit</option><option value="debit">Debit</option><option value="income">Income</option><option value="expense">Expense</option></select>
              <select value={filters.category} onChange={e => setFilters((f: any) => ({ ...f, category: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">All Categories</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
              <select value={filters.paymentMethod} onChange={e => setFilters((f: any) => ({ ...f, paymentMethod: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">All Payments</option>{PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
              <select value={filters.source_type || ''} onChange={e => setFilters((f: any) => ({ ...f, source_type: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">All Sources</option>{SOURCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}</select>
              <input type="date" value={filters.startDate} onChange={e => setFilters((f: any) => ({ ...f, startDate: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="From" />
              <input type="date" value={filters.endDate} onChange={e => setFilters((f: any) => ({ ...f, endDate: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="To" />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600"><tr>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">ID</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-left font-medium">Payment</th>
                <th className="px-4 py-3 text-left font-medium">Ref ID</th>
                <th className="px-4 py-3 text-left font-medium">Source</th>
                <th className="px-4 py-3 text-left font-medium">Description</th>
                <th className="px-4 py-3 text-center font-medium">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center"><div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></td></tr>
                ) : transactions.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No transactions found</td></tr>
                ) : transactions.map(t => (
                  <tr key={t._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(t.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.transactionId}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.type === 'credit' || t.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.type}</span></td>
                    <td className={`px-4 py-3 text-right font-semibold ${t.type === 'credit' || t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>₹{t.amount?.toLocaleString()}</td>
                    <td className="px-4 py-3">{pmBadge(t.paymentMethod, t.customPaymentMethod)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 max-w-[120px] truncate">{t.referenceId || '-'}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.source_type === 'MANUAL' ? 'bg-gray-100 text-gray-600' : t.source_type === 'SALE' ? 'bg-blue-100 text-blue-700' : t.source_type === 'PURCHASE' ? 'bg-orange-100 text-orange-700' : t.source_type === 'EXPENSE' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{t.source_type || 'MANUAL'}</span></td>
                    <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">{t.description}</td>
                    <td className="px-4 py-3 text-center"><div className="flex items-center justify-center space-x-1">
                      {(t.source_type === 'MANUAL' || !t.source_type) && <button onClick={() => handleEdit(t)} className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"><Edit className="w-4 h-4 text-blue-600" /></button>}
                      {(t.source_type === 'MANUAL' || !t.source_type) && <button onClick={() => handleDelete(t._id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>}
                      {t.source_type && t.source_type !== 'MANUAL' && <span className="text-xs text-gray-400 italic">Auto</span>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="p-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">Page {pagination.page} of {pagination.pages} ({pagination.total} total)</span>
              <div className="flex space-x-2">
                <button onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))} disabled={pagination.page === 1} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setPagination(p => ({ ...p, page: Math.min(p.pages, p.page + 1) }))} disabled={pagination.page === pagination.pages} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EXPORT TAB */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Transaction Export</h2>
            <div className="flex flex-wrap items-end gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Date</label><input type="date" value={exportDate} onChange={e => setExportDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
                <select value={exportFormat} onChange={e => setExportFormat(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option><option value="json">JSON</option></select>
              </div>
              <button onClick={handleExportDaily} disabled={exporting} className="flex items-center space-x-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"><Download className="w-4 h-4" /><span>{exporting ? 'Exporting...' : 'Download'}</span></button>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Full Ledger Export</h2>
            <p className="text-sm text-gray-500 mb-4">Multi-sheet Excel with Transactions, Customers, Vendors, Employees, and Payment Methods</p>
            <button onClick={handleExportLedger} disabled={exporting} className="flex items-center space-x-2 px-5 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"><FileText className="w-4 h-4" /><span>{exporting ? 'Exporting...' : 'Export Ledger'}</span></button>
          </div>
        </div>
      )}

      {/* IMPORT TAB */}
      {activeTab === 'import' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Import Transactions</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <button onClick={() => fileRef.current?.click()} className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"><Upload className="w-4 h-4" /><span>Upload File</span></button>
              <span className="text-sm text-gray-500">.csv, .xlsx, .json</span>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.json" onChange={handleFileUpload} className="hidden" />
            </div>
            {importData.length > 0 && (
              <>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-700">{importData.length} records loaded</span>
                  <select value={importMode} onChange={e => setImportMode(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"><option value="merge">Merge (skip duplicates)</option><option value="overwrite">Overwrite duplicates</option></select>
                  <button onClick={handlePreview} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Preview</button>
                  <button onClick={handleImport} disabled={importing} className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">{importing ? 'Importing...' : 'Import Now'}</button>
                </div>
                {importPreview && (
                  <div className="p-3 bg-blue-50 rounded-lg text-sm space-y-1">
                    <p>Total: <strong>{importPreview.total}</strong> | Valid: <strong>{importPreview.valid}</strong> | Duplicates: <strong className="text-orange-600">{importPreview.duplicates}</strong></p>
                  </div>
                )}
                {importMsg && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{importMsg}</div>}
                <div className="overflow-x-auto max-h-[300px] border border-gray-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0"><tr>{Object.keys(importData[0] || {}).slice(0, 7).map(k => <th key={k} className="px-3 py-2 text-left font-medium text-gray-600">{k}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-100">{importData.slice(0, 20).map((r, i) => <tr key={i}>{Object.values(r).slice(0, 7).map((v: any, j) => <td key={j} className="px-3 py-1.5 text-gray-700">{String(v || '')}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ADD/EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingTxn ? 'Edit Transaction' : 'Add Transaction'}</h3>
              <button onClick={() => { setShowModal(false); setEditingTxn(null); }} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Date *</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Type *</label><select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="credit">Credit</option><option value="debit">Debit</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label><select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">Select...</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label><input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label><select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value, referenceId: '' }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">{PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">{getRefLabel(form.paymentMethod)}</label><input value={form.referenceId} onChange={e => setForm(f => ({ ...f, referenceId: e.target.value }))} placeholder={getRefLabel(form.paymentMethod)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {form.paymentMethod === 'custom' && <div><label className="block text-sm font-medium text-gray-700 mb-1">Custom Method</label><input value={form.customPaymentMethod} onChange={e => setForm(f => ({ ...f, customPaymentMethod: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>}
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Ledger/Account</label><input value={form.ledgerAccount} onChange={e => setForm(f => ({ ...f, ledgerAccount: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Party Name</label><input value={form.partyName} onChange={e => setForm(f => ({ ...f, partyName: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
            </div>
            <div className="flex justify-end space-x-3 mt-5">
              <button onClick={() => { setShowModal(false); setEditingTxn(null); }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">{editingTxn ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionTools;

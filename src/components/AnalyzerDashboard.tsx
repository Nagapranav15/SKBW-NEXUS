import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Upload, RefreshCw } from 'lucide-react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title } from 'chart.js';
import { Pie, Bar, Doughnut, Line } from 'react-chartjs-2';
import { useAuth } from '../context/AuthContext';
import * as txnApi from '../api/transactionApi';
import * as XLSX from 'xlsx';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title);

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

const AnalyzerDashboard: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [compareYear, setCompareYear] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchAnalytics(); }, [selectedCompany, startDate, endDate, compareYear]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const params: any = { companyId: selectedCompany?._id };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (compareYear) params.compareYear = compareYear;
      const res = await txnApi.getAnalytics(params);
      setAnalytics(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handlePrevYearUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      let transactions: any[] = [];
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        transactions = parsed.transactions || parsed;
      } else {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab);
        const ws = wb.Sheets[wb.SheetNames[0]];
        transactions = XLSX.utils.sheet_to_json(ws).map((r: any) => ({
          date: r.Date || r.date, transactionId: r['Transaction ID'] || r.transactionId,
          type: r.Type || r.type || 'income', category: r.Category || r.category || '',
          amount: Number(r.Amount || r.amount || 0), paymentMethod: r['Payment Method'] || r.paymentMethod || 'cash',
          ledgerAccount: r['Ledger/Account'] || r.ledgerAccount || '', partyName: r.Party || r.partyName || '',
          description: r.Description || r.description || ''
        }));
      }
      if (transactions.length > 0) {
        await txnApi.importTransactions(transactions, selectedCompany?._id, 'merge');
        alert(`Imported ${transactions.length} previous year records`);
        fetchAnalytics();
      }
    } catch { alert('Import failed'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const fmt = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n.toFixed(0)}`;

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[400px]"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;

  const monthly = analytics?.monthly || {};
  const monthKeys = Object.keys(monthly).sort();
  const catBreakdown = analytics?.categoryBreakdown || {};
  const pmBreakdown = analytics?.paymentBreakdown || {};
  const comp = analytics?.comparison;

  // Chart data
  const barData = {
    labels: monthKeys.map(k => { const [y, m] = k.split('-'); return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)-1]} ${y.slice(2)}`; }),
    datasets: [
      { label: 'Income', data: monthKeys.map(k => monthly[k]?.income || 0), backgroundColor: '#10b981' },
      { label: 'Expense', data: monthKeys.map(k => monthly[k]?.expense || 0), backgroundColor: '#ef4444' }
    ]
  };

  const catLabels = Object.keys(catBreakdown);
  const pieData = {
    labels: catLabels,
    datasets: [{ data: catLabels.map(c => (catBreakdown[c]?.income || 0) + (catBreakdown[c]?.expense || 0)), backgroundColor: COLORS.slice(0, catLabels.length), borderWidth: 2, borderColor: '#fff' }]
  };

  const pmLabels = Object.keys(pmBreakdown);
  const donutData = {
    labels: pmLabels.map(l => l.replace('_', ' ')),
    datasets: [{ data: pmLabels.map(p => pmBreakdown[p]?.total || 0), backgroundColor: COLORS.slice(0, pmLabels.length), borderWidth: 2, borderColor: '#fff' }]
  };

  const lineData = {
    labels: monthKeys.map(k => { const [, m] = k.split('-'); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)-1]; }),
    datasets: [{
      label: 'Net Profit/Loss', data: monthKeys.map(k => (monthly[k]?.income || 0) - (monthly[k]?.expense || 0)),
      borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3
    }]
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analyzer Dashboard</h1>
          <p className="text-gray-600 text-sm mt-1">Financial analytics and year-over-year comparison</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchAnalytics} className="p-2 text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors bg-white shadow-sm" title="Refresh analytics"><RefreshCw className="w-4 h-4" /></button>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="From" />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="To" />
          {analytics?.availableYears?.length > 0 && (
            <select value={compareYear} onChange={e => setCompareYear(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">Compare Year</option>
              {analytics.availableYears.map((y: number) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {[
          { title: 'Total Income', value: fmt(analytics?.totalIncome || 0), icon: TrendingUp, color: 'bg-green-500', textColor: 'text-green-600' },
          { title: 'Total Expenses', value: fmt(analytics?.totalExpense || 0), icon: TrendingDown, color: 'bg-red-500', textColor: 'text-red-600' },
          { title: 'Net Profit/Loss', value: fmt(analytics?.netProfit || 0), icon: DollarSign, color: (analytics?.netProfit || 0) >= 0 ? 'bg-emerald-500' : 'bg-red-500', textColor: (analytics?.netProfit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600' },
          { title: 'Transactions', value: analytics?.transactionCount || 0, icon: BarChart3, color: 'bg-blue-500', textColor: 'text-blue-600' }
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{s.title}</p>
                <p className={`text-2xl font-bold ${s.textColor}`}>{s.value}</p>
              </div>
              <div className={`${s.color} p-3 rounded-lg`}><s.icon className="w-5 h-5 text-white" /></div>
            </div>
            {comp && s.title !== 'Transactions' && (
              <div className="mt-2 text-xs text-gray-400">
                vs {comp.year}: {s.title === 'Total Income' ? fmt(comp.totalIncome) : s.title === 'Total Expenses' ? fmt(comp.totalExpense) : fmt(comp.netProfit)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Monthly Income vs Expenses</h3>
          <div style={{ height: 260 }}>{monthKeys.length > 0 ? <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }} /> : <p className="text-gray-400 text-center py-20">No data</p>}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Category Distribution</h3>
          <div style={{ height: 260 }} className="flex justify-center">{catLabels.length > 0 ? <Pie data={pieData} options={{ responsive: true, maintainAspectRatio: false }} /> : <p className="text-gray-400 text-center py-20">No data</p>}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment Method Breakdown</h3>
          <div style={{ height: 260 }} className="flex justify-center">{pmLabels.length > 0 ? <Doughnut data={donutData} options={{ responsive: true, maintainAspectRatio: false }} /> : <p className="text-gray-400 text-center py-20">No data</p>}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Profit/Loss Trend</h3>
          <div style={{ height: 260 }}>{monthKeys.length > 0 ? <Line data={lineData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} /> : <p className="text-gray-400 text-center py-20">No data</p>}</div>
        </div>
      </div>

      {/* Year comparison + Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Upload Previous Year Data</h3>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center space-x-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs hover:bg-purple-700 disabled:opacity-50"><Upload className="w-3.5 h-3.5" /><span>{uploading ? 'Uploading...' : 'Upload'}</span></button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.json" onChange={handlePrevYearUpload} className="hidden" />
          </div>
          <p className="text-xs text-gray-500">Upload a previously exported transaction file to enable year-over-year comparison. Supports CSV, Excel, and JSON.</p>
          {comp && (
            <div className="mt-4 space-y-2">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Year {comp.year} Summary</h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-green-50 rounded-lg"><p className="text-xs text-gray-500">Income</p><p className="font-semibold text-green-600 text-sm">{fmt(comp.totalIncome)}</p></div>
                <div className="p-2 bg-red-50 rounded-lg"><p className="text-xs text-gray-500">Expenses</p><p className="font-semibold text-red-600 text-sm">{fmt(comp.totalExpense)}</p></div>
                <div className="p-2 bg-blue-50 rounded-lg"><p className="text-xs text-gray-500">Net</p><p className={`font-semibold text-sm ${comp.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(comp.netProfit)}</p></div>
              </div>
            </div>
          )}
        </div>

        {/* Monthly Summary Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Monthly Summary</h3>
          <div className="overflow-x-auto max-h-[280px]">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0"><tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Month</th>
                <th className="px-3 py-2 text-right font-medium text-green-600">Income</th>
                <th className="px-3 py-2 text-right font-medium text-red-600">Expense</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Net</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {monthKeys.map(k => {
                  const net = (monthly[k]?.income || 0) - (monthly[k]?.expense || 0);
                  return (
                    <tr key={k} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{k}</td>
                      <td className="px-3 py-2 text-right text-green-600">₹{(monthly[k]?.income || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-red-600">₹{(monthly[k]?.expense || 0).toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right font-medium ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>₹{net.toLocaleString()}</td>
                    </tr>
                  );
                })}
                {monthKeys.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyzerDashboard;

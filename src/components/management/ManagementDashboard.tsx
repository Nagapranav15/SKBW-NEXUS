import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, FileText, Hourglass, Layers, Search, Wallet, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getParties } from '../../api/partyApi';
import { Ageing, Overview, PipelineRes, SalesRow, Statement, getAgeing, getOverview, getPipeline, getSalesReport, getStatement } from '../../api/managementApi';
import Modal from '../ui/Modal';

const inr = (n: number | undefined) => `₹${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const PRESETS: Record<string, () => [string | undefined, string | undefined]> = {
  'This month': () => { const n = new Date(); return [ymd(new Date(n.getFullYear(), n.getMonth(), 1)), undefined]; },
  'Last 30 days': () => { const n = new Date(); return [ymd(new Date(n.getTime() - 30 * 86400000)), undefined]; },
  'This year': () => [`${new Date().getFullYear()}-01-01`, undefined],
  'All time': () => [undefined, undefined],
};
const STAGE_LABEL: Record<string, string> = { PENDING: 'Pending', IN_PRODUCTION: 'In production', PARTLY_DISPATCHED: 'Part dispatched', DISPATCHED: 'Dispatched', INVOICED: 'Invoiced', PAID: 'Paid' };

const Kpi: React.FC<{ icon: React.ElementType; label: string; value: string; sub?: string; tone?: string }> = ({ icon: Icon, label, value, sub, tone = 'text-blue-600 bg-blue-50' }) => (
  <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-start gap-3">
    <span className={`p-2.5 rounded-xl ${tone}`}><Icon className="w-5 h-5" /></span>
    <div><div className="text-xs font-medium text-gray-500">{label}</div><div className="text-lg font-semibold text-gray-900">{value}</div>{sub && <div className="text-xs text-gray-400">{sub}</div>}</div>
  </div>
);

const ManagementDashboard: React.FC = () => {
  const { selectedCompany, hasPermission } = useAuth();
  const companyId: string | undefined = selectedCompany?._id;
  const [preset, setPreset] = useState('This month');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ageing, setAgeing] = useState<Ageing | null>(null);
  const [pipeline, setPipeline] = useState<PipelineRes | null>(null);
  const [monthly, setMonthly] = useState<SalesRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [customerQ, setCustomerQ] = useState('');
  const [matches, setMatches] = useState<any[]>([]);
  const [statement, setStatement] = useState<{ name: string; data: Statement } | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    const [from, to] = PRESETS[preset]();
    try {
      const [o, a, pl, s] = await Promise.all([getOverview(companyId, from, to), getAgeing(companyId), getPipeline(companyId), getSalesReport(companyId, 'month', from, to)]);
      setOverview(o.data); setAgeing(a.data); setPipeline(pl.data); setMonthly(s.data.rows);
    } catch (e: any) {
      setError(e?.response?.data?.msg || 'Could not load the reports');
    } finally {
      setLoading(false);
    }
  }, [companyId, preset]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!companyId || customerQ.trim().length < 2) { setMatches([]); return; }
    const t = setTimeout(() => {
      getParties({ type: 'customer', company: companyId, search: customerQ.trim(), limit: 8, light: true } as any)
        .then(r => { const d: any = r.data; setMatches(Array.isArray(d) ? d : d?.parties || d?.data || []); })
        .catch(() => setMatches([]));
    }, 300);
    return () => clearTimeout(t);
  }, [companyId, customerQ]);

  const openStatement = async (party: any) => {
    if (!companyId) return;
    try {
      const r = await getStatement(companyId, party._id);
      setStatement({ name: party.firmName || party.ownerName || 'Customer', data: r.data });
      setMatches([]); setCustomerQ('');
    } catch (e: any) {
      setError(e?.response?.data?.msg || 'Could not load the statement');
    }
  };

  if (!hasPermission(['VIEW_REPORTS', 'MANAGE_REPORTS'])) return <div className="p-6 text-gray-500">You do not have access to management reports.</div>;

  return (
    <div className="p-4 md:p-6 space-y-5 font-sans text-gray-800">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Management Overview</h1>
          <p className="text-[0.875rem] text-gray-500">Figures come straight from the stock, customer and conversion ledgers.</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {Object.keys(PRESETS).map(k => (
            <button key={k} onClick={() => setPreset(k)} className={`px-3 py-1.5 rounded-xl border text-[0.875rem] font-semibold cursor-pointer ${preset === k ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{k}</button>
          ))}
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[0.875rem]">{error}</div>}

      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${loading ? 'opacity-60' : ''}`}>
        <Kpi icon={FileText} label={`Invoiced (${preset.toLowerCase()})`} value={inr(overview?.invoiced.amount)} sub={`${overview?.invoiced.count ?? 0} invoices`} />
        <Kpi icon={Banknote} label="Collected" value={inr(overview?.collections.amount)} sub={(overview?.collections.byMode || []).map(m => `${m.mode} ${inr(m.amount)}`).join(' · ') || 'No payments'} tone="text-emerald-600 bg-emerald-50" />
        <Kpi icon={Hourglass} label="Receivables outstanding" value={inr(overview?.receivables.outstanding)} sub={`${inr(overview?.receivables.overdue)} overdue · ${overview?.receivables.customersOwing ?? 0} customers`} tone="text-amber-600 bg-amber-50" />
        <Kpi icon={Layers} label="Stock value (new ledger)" value={inr(overview?.stock.totalValue)} sub={`${overview?.stock.itemsInStock ?? 0} item${overview?.stock.itemsInStock === 1 ? '' : 's'} · production cost ${inr(overview?.production.netCost)}`} tone="text-violet-600 bg-violet-50" />
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <h2 className="font-semibold text-gray-900 mb-3">Order to cash</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {(pipeline?.stages || []).map(s => (
            <div key={s} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-center">
              <div className="text-xs font-medium text-slate-500">{STAGE_LABEL[s] || s}</div>
              <div className="text-lg font-semibold text-slate-900">{pipeline?.counts[s]?.orders ?? 0}</div>
              <div className="text-xs text-slate-400">{inr(pipeline?.counts[s]?.value)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Wallet className="w-4 h-4 text-amber-600" />Who owes us</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[0.875rem]">
              <thead><tr className="text-xs text-gray-500 uppercase tracking-wide text-right border-b border-gray-100"><th className="text-left py-2">Customer</th><th>Not due</th><th>1-30</th><th>31-60</th><th>61-90</th><th>90+</th><th>Total</th></tr></thead>
              <tbody className="divide-y divide-gray-100 text-right font-mono">
                {(ageing?.rows || []).slice(0, 10).map(r => (
                  <tr key={r.partyId} className="hover:bg-gray-50"><td className="text-left font-sans font-medium py-2">{r.name}</td><td>{inr(r.current)}</td><td>{inr(r.d1_30)}</td><td>{inr(r.d31_60)}</td><td>{inr(r.d61_90)}</td><td className={r.d90_plus > 0 ? 'text-rose-600' : ''}>{inr(r.d90_plus)}</td><td className="font-semibold">{inr(r.total)}</td></tr>
                ))}
                {(!ageing || ageing.rows.length === 0) && <tr><td colSpan={7} className="py-6 text-center font-sans text-gray-400">Nothing outstanding in the receivables ledger</td></tr>}
              </tbody>
              {ageing && ageing.rows.length > 0 && <tfoot><tr className="border-t border-gray-200 font-semibold text-right font-mono"><td className="text-left font-sans py-2">Total</td><td>{inr(ageing.totals.current)}</td><td>{inr(ageing.totals.d1_30)}</td><td>{inr(ageing.totals.d31_60)}</td><td>{inr(ageing.totals.d61_90)}</td><td>{inr(ageing.totals.d90_plus)}</td><td>{inr(ageing.totals.total)}</td></tr></tfoot>}
            </table>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-gray-900">Sales by month</h2>
          <table className="w-full text-[0.875rem]">
            <thead><tr className="text-xs text-gray-500 uppercase tracking-wide text-right border-b border-gray-100"><th className="text-left py-2">Month</th><th>Invoices</th><th>Invoiced</th><th>Collected</th><th>Outstanding</th></tr></thead>
            <tbody className="divide-y divide-gray-100 text-right font-mono">
              {monthly.map(r => <tr key={r.key}><td className="text-left font-sans font-medium py-2">{r.name}</td><td>{r.invoices}</td><td>{inr(r.invoiced)}</td><td>{inr(r.collected)}</td><td className={r.outstanding > 0 ? 'text-amber-700' : ''}>{inr(r.outstanding)}</td></tr>)}
              {monthly.length === 0 && <tr><td colSpan={5} className="py-6 text-center font-sans text-gray-400">No invoices in this period</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <h2 className="font-semibold text-gray-900">Customer statement</h2>
        <div className="relative max-w-md">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={customerQ} onChange={e => setCustomerQ(e.target.value)} placeholder="Search a customer..." className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-[0.875rem] focus:outline-none focus:border-blue-500" />
          {matches.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
              {matches.map(m => <button key={m._id} onClick={() => openStatement(m)} className="w-full text-left px-3 py-2 text-[0.875rem] hover:bg-blue-50 cursor-pointer">{m.firmName || m.ownerName}</button>)}
            </div>
          )}
        </div>
      </div>

      {statement && (
        <Modal isOpen onClose={() => setStatement(null)} maxWidth="max-w-3xl" title={<div className="flex items-center gap-2"><FileText className="w-4 h-4 text-blue-600" />Statement: {statement.name}</div>}>
          <div className="space-y-3 text-[0.875rem]">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[['Opening', statement.data.openingBalance], ['Debits', statement.data.totalDebit], ['Credits', statement.data.totalCredit], ['Balance', statement.data.closingBalance]].map(([l, v]) => (
                <div key={l as string} className="rounded-xl bg-slate-50 py-2"><div className="text-xs text-slate-500">{l as string}</div><div className="font-semibold">{inr(v as number)}</div></div>
              ))}
            </div>
            <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-xl">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th className="text-left px-3 py-2">Date</th><th className="text-left">Entry</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right px-3">Balance</th></tr></thead>
                <tbody className="divide-y divide-gray-100 font-mono">
                  {statement.data.rows.map(r => (
                    <tr key={r._id}><td className="px-3 py-1.5 font-sans">{new Date(r.date).toLocaleDateString('en-IN')}</td><td className="font-sans">{r.txnType} {r.referenceNumber}</td><td className="text-right">{r.direction === 'DR' ? inr(r.amount) : ''}</td><td className="text-right">{r.direction === 'CR' ? inr(r.amount) : ''}</td><td className="text-right px-3">{inr(r.runningBalance)}</td></tr>
                  ))}
                  {statement.data.rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center font-sans text-gray-400">No entries yet</td></tr>}
                </tbody>
              </table>
            </div>
            <button onClick={() => setStatement(null)} className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 cursor-pointer"><X className="w-3 h-3" />Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ManagementDashboard;

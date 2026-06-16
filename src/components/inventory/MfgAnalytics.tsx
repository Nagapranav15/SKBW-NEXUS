import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { RefreshCw } from 'lucide-react';
import * as mfgApi from '../../api/mfgApi';

const MfgAnalytics: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (selectedCompany) load(); }, [selectedCompany, days]);
  const load = async () => { setLoading(true); try { const r = await mfgApi.getAnalytics(selectedCompany?._id, days); setData(r.data); } catch(e){console.error(e);} finally{setLoading(false);} };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  const typeColors: any = { IN: '#22c55e', OUT: '#ef4444', TRANSFER: '#3b82f6' };
  const catColors: any = { Raw: '#f59e0b', Semi: '#a855f7', Finished: '#3b82f6' };
  const maxDaily = Math.max(...(data?.daily?.map((d: any) => d.count) || [1]));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Analytics</h1><p className="text-sm text-gray-500">Movement analytics & trends</p></div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors bg-white shadow-sm" title="Refresh Analytics"><RefreshCw className="w-4 h-4" /></button>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="px-3 py-2 border rounded-lg text-sm"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(data?.byType || []).map((t: any) => (
          <div key={t._id} className="bg-white rounded-xl border p-6">
            <div className="flex items-center gap-3 mb-3"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: typeColors[t._id] || '#999' }} /><h3 className="font-semibold text-gray-900">{t._id}</h3></div>
            <p className="text-3xl font-bold">{t.count}</p><p className="text-sm text-gray-500">movements · {t.totalQty.toLocaleString()} total units</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold mb-4">By Category</h3>
          <div className="space-y-3">
            {(data?.byCategory || []).map((c: any) => (
              <div key={c._id}>
                <div className="flex justify-between text-sm mb-1"><span className="font-medium">{c._id}</span><span className="text-gray-500">{c.count} movements</span></div>
                <div className="w-full h-3 bg-gray-100 rounded-full"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (c.count / Math.max(...data.byCategory.map((x: any) => x.count))) * 100)}%`, backgroundColor: catColors[c._id] || '#999' }} /></div>
              </div>
            ))}
            {!data?.byCategory?.length && <p className="text-gray-400 text-center py-4">No data</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold mb-4">Daily Activity</h3>
          <div className="flex items-end gap-1 h-40">
            {(data?.daily || []).slice(-30).map((d: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end">
                <div className="w-full bg-blue-500 rounded-t min-h-[2px]" style={{ height: `${(d.count / maxDaily) * 100}%` }} title={`${d._id}: ${d.count}`} />
              </div>
            ))}
          </div>
          {data?.daily?.length > 0 && <div className="flex justify-between text-xs text-gray-400 mt-2"><span>{data.daily[0]?._id}</span><span>{data.daily[data.daily.length - 1]?._id}</span></div>}
          {!data?.daily?.length && <p className="text-gray-400 text-center py-8">No activity</p>}
        </div>
      </div>
    </div>
  );
};

export default MfgAnalytics;

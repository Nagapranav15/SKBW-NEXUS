import React, { useEffect, useRef, useState } from 'react';
import { Columns, Download, FileSpreadsheet, FileText, History, Printer, RefreshCw, Search } from 'lucide-react';
import Modal from './Modal';
import { useAuth } from '../../context/AuthContext';
import { getActivityLogs } from '../../api/activityLogApi';

/** Shared look of the small square icon buttons in list toolbars (matches Item Master). */
export const ICON_BTN =
  'p-2 rounded-xl bg-white hover:bg-blue-50/60 border border-gray-200 hover:border-blue-200 text-blue-600 flex items-center justify-center cursor-pointer shadow-2xs';

const POPOVER = 'absolute right-0 mt-1.5 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-2 text-[0.875rem] text-left';

const useOutsideClose = (open: boolean, close: () => void) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);
  return ref;
};

/**
 * CSS that hides table columns by position. Cells spanning the whole row (colspan) are left alone,
 * and only the table's own rows are matched, so nested detail tables are unaffected.
 */
export const columnHideCss = (scope: string, hidden: number[]) =>
  hidden
    .map(i => `.${scope} > thead > tr > :nth-child(${i + 1}), .${scope} > tbody > tr > :nth-child(${i + 1}):not([colspan]) { display: none; }`)
    .join('\n');

/** Columns toggle. `columns` is aligned with the table's header cells; an empty label is a fixed column that can't be hidden. */
export const ColumnsToggleButton: React.FC<{
  columns: string[];
  hidden: number[];
  onChange: (hidden: number[]) => void;
}> = ({ columns, hidden, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const toggle = (i: number) => onChange(hidden.includes(i) ? hidden.filter(x => x !== i) : [...hidden, i]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={ICON_BTN}
        title="Toggle Columns"
        aria-label="Toggle Columns"
      >
        <Columns className="w-4 h-4" />
      </button>
      {open && (
        <div className={`${POPOVER} w-56 p-3 space-y-2`}>
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Visible Columns</span>
            {hidden.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="text-blue-600 hover:text-blue-800 text-xs font-semibold cursor-pointer">
                Show All
              </button>
            )}
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {columns.map((label, i) => label && (
              <label key={i} className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-gray-50 cursor-pointer font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={!hidden.includes(i)}
                  onChange={() => toggle(i)}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/** Download icon with an Excel / PDF menu. */
export const ExportMenuButton: React.FC<{ onExcel: () => void; onPdf: () => void }> = ({ onExcel, onPdf }) => {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={ICON_BTN}
        title="Export Data (PDF / Excel)"
        aria-label="Export Data (PDF / Excel)"
      >
        <Download className="w-4 h-4" />
      </button>
      {open && (
        <div className={`${POPOVER} w-48 space-y-1`}>
          <button
            type="button"
            onClick={() => { onExcel(); setOpen(false); }}
            className="w-full text-left px-2.5 py-1.5 rounded-xl font-semibold hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 text-gray-700 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export Excel (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={() => { onPdf(); setOpen(false); }}
            className="w-full text-left px-2.5 py-1.5 rounded-xl font-semibold hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 text-gray-700 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-rose-600" />
            <span>Export PDF</span>
          </button>
        </div>
      )}
    </div>
  );
};

export const PrintListButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" onClick={onClick} className={ICON_BTN} title="Print List" aria-label="Print List">
    <Printer className="w-4 h-4" />
  </button>
);

/** Opens the browser print dialog for a flat list of rows (the same rows used by the Excel/PDF export). */
export const printObjectList = (opts: { title: string; companyName?: string; rows: Record<string, any>[] }) => {
  const { title, companyName, rows } = opts;
  const w = window.open('', '', 'width=1100,height=800');
  if (!w) return;
  const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  w.document.write(`<!DOCTYPE html><html><head><title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 12mm; }
  h1 { font-size: 16pt; margin: 0 0 2px; color: #1e40af; }
  .sub { font-size: 9pt; color: #475569; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th, td { border: 1px solid #94a3b8; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #1e40af; color: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  tr:nth-child(even) td { background: #f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4 landscape; margin: 8mm; }
</style></head><body>
<h1>${esc(title)}</h1>
<div class="sub">${esc(companyName || '')} &middot; ${esc(new Date().toLocaleString('en-IN'))} &middot; ${rows.length} record(s)</div>
<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${esc(r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table>
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 400);
};

/** Clock icon that opens a searchable activity log for one entity type (e.g. "Dispatch", "TaxInvoice"). */
export const ActivityHistoryButton: React.FC<{ entityType: string; title: string }> = ({ entityType, title }) => {
  const { selectedCompany } = useAuth();
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    if (!selectedCompany?._id) return;
    setLoading(true);
    try {
      const res = await getActivityLogs({ company: selectedCompany._id, entityType, limit: 200 });
      const raw = res.data?.logs || res.data || [];
      setLogs(Array.isArray(raw) ? raw : []);
    } catch (err) {
      console.error('Failed to load activity logs', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => { setSearch(''); setOpen(true); load(); };

  const q = search.toLowerCase().trim();
  const visible = logs.filter(l =>
    !q ||
    (l.action || '').toLowerCase().includes(q) ||
    (l.entityName || '').toLowerCase().includes(q) ||
    (l.details || '').toLowerCase().includes(q) ||
    (l.performedBy || '').toLowerCase().includes(q)
  );

  return (
    <>
      <button type="button" onClick={openModal} className={ICON_BTN} title="Activity Logs" aria-label="Activity Logs">
        <History className="w-4 h-4" />
      </button>
      {open && (
        <Modal isOpen={open} onClose={() => setOpen(false)} title={title} maxWidth="max-w-2xl">
          <div className="space-y-3.5 text-[0.875rem] text-left">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by action, number, details, user..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-[0.875rem] focus:bg-white focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-gray-200 rounded-xl font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="space-y-2 max-h-[calc(60*var(--vh,1vh))] overflow-y-auto pr-1">
              {loading ? (
                <div className="py-12 text-center text-gray-400 font-medium">Loading activity history...</div>
              ) : visible.length === 0 ? (
                <div className="py-12 text-center space-y-2 bg-gray-50/60 rounded-2xl border border-dashed border-gray-200">
                  <History className="w-8 h-8 text-gray-300 mx-auto" />
                  <p className="font-semibold text-gray-600">No Activity Logs Found</p>
                  <p className="text-xs text-gray-400">{q ? 'No logs match your search term.' : 'Nothing has been recorded yet. New actions will appear here.'}</p>
                </div>
              ) : visible.map((log, idx) => {
                const act = (log.action || '').toUpperCase();
                const badge = act.includes('DELETE')
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : act.includes('CREATE')
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200';
                return (
                  <div key={log._id || idx} className="p-3 bg-white border border-gray-200 rounded-xl space-y-1.5 shadow-2xs hover:border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium uppercase tracking-wider border ${badge}`}>{log.action}</span>
                        <span className="font-semibold text-gray-900 font-mono text-[0.875rem]">{log.entityName}</span>
                      </div>
                      <span className="text-xs text-gray-400 font-medium">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      </span>
                    </div>
                    <p className="text-gray-600 text-[0.875rem] leading-relaxed">{log.details}</p>
                    {log.performedBy && (
                      <div className="text-xs text-gray-400 font-medium pt-0.5">
                        By: <span className="text-gray-700 font-semibold">{log.performedBy}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

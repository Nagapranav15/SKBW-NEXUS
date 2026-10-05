import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ArrowLeft, Printer, Pencil, Layers, Check, Calendar, 
  Trash2, Plus, Clock, AlertCircle, RotateCcw, X, FileText,
  Package, CheckCircle2, ChevronRight, Edit3
} from 'lucide-react';
import { ProductionOrder, ProductionEntry } from '../../types/production';
import { formatOrderNo } from './productionUtils';
import { showToast } from '../ui/Toast';

interface ProductionOrderEntriesViewProps {
  order: ProductionOrder;
  onBack: () => void;
  onViewOverview: (order: ProductionOrder, tab?: 'overview' | 'materials' | 'entries' | 'orders' | 'costing') => void;
  onAddEntry: (orderId: string, entryData: {
    producedQty: number;
    producedUom: string;
    shift: string;
    date: string;
    remarks?: string;
  }) => void;
  onCompleteOrder: (orderId: string) => void;
  onPrint: (order: ProductionOrder) => void;
  onEdit?: (order: ProductionOrder) => void;
}

export const ProductionOrderEntriesView: React.FC<ProductionOrderEntriesViewProps> = ({
  order,
  onBack,
  onViewOverview,
  onAddEntry,
  onCompleteOrder,
  onPrint,
  onEdit
}) => {
  // Entry Form States
  const todayStr = new Date().toISOString().slice(0, 10);
  const [productionDate, setProductionDate] = useState<string>(todayStr);
  const [shift, setShift] = useState<string>('Day Shift');
  const [producedQty, setProducedQty] = useState<number | ''>('');
  const [producedUom, setProducedUom] = useState<string>(order.plannedUom || 'PCS');
  const [remarks, setRemarks] = useState<string>('');

  const conversion = order.conversionFactor || 1;
  const isGbl = (producedUom || '').toUpperCase() === 'GBL';
  const orderIsGbl = (order.plannedUom || '').toUpperCase() === 'GBL';
  const producedPcs = isGbl ? (Number(producedQty) || 0) * conversion : (Number(producedQty) || 0);

  const plannedPcs = order.plannedPcs || (orderIsGbl ? Math.round((order.plannedQty || 0) * conversion) : (order.plannedQty || 0));
  const completedPcs = order.producedPcs || (orderIsGbl ? Math.round((order.producedQty || 0) * conversion) : (order.producedQty || 0));
  const remainingQty = Math.max(0, (order.plannedQty || 0) - (order.producedQty || 0));
  const remainingPcs = Math.max(0, plannedPcs - completedPcs);

  const formRef = useRef<HTMLFormElement>(null);

  // Tally Keyboard Navigation
  const shiftFocus = (delta: number) => {
    if (!formRef.current) return;
    const focusables = Array.from(
      formRef.current.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button[type="submit"]'
      )
    ).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0);

    const activeEl = document.activeElement as HTMLElement;
    const index = focusables.indexOf(activeEl);
    const nextIdx = index + delta;
    if (nextIdx >= 0 && nextIdx < focusables.length) {
      focusables[nextIdx]?.focus();
      if ('select' in focusables[nextIdx]) {
        (focusables[nextIdx] as HTMLInputElement).select?.();
      }
    }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
      e.preventDefault();
      shiftFocus(1);
    }
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      } else if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        onPrint(order);
      } else if (e.altKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        onViewOverview(order, 'overview');
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A' || e.key === 'Enter')) {
        e.preventDefault();
        const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
        submitBtn?.click();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [order, onBack, onPrint, onViewOverview]);

  const handleClear = () => {
    setProducedQty('');
    setRemarks('');
  };

  const handleAddEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const qtyNum = Number(producedQty);
    if (!qtyNum || qtyNum <= 0) {
      showToast('Produced quantity must be greater than 0', 'error');
      return;
    }

    onAddEntry(order._id, {
      producedQty: qtyNum,
      producedUom,
      shift,
      date: new Date(productionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      remarks
    });

    handleClear();
  };

  // Dynamic process of entries
  const processedEntries = useMemo(() => {
    let runningCum = 0;
    let runningCumPcs = 0;
    const entries = order.productionEntries || [];

    return entries.map((entry, idx) => {
      const q = entry.producedQty || 0;
      const p = entry.producedPcs || (orderIsGbl ? Math.round(q * conversion) : q);
      runningCum += q;
      runningCumPcs += p;
      const balQty = Math.max(0, (order.plannedQty || 0) - runningCum);

      return {
        ...entry,
        entryIndex: idx + 1,
        entryNo: (entry as any).entryNo || (entry.id?.startsWith('PE-') ? entry.id : `PE-${String(idx + 1).padStart(4, '0')}`),
        calcCumulative: runningCum,
        calcCumulativePcs: runningCumPcs,
        calcBalance: balQty,
        outputLocation: (entry as any).outputLocation || order.outputLocation || `${order.factory || 'Factory 1'} Finished Goods`,
        loggedBy: entry.createdBy || (entry as any).operator || 'Operator'
      };
    });
  }, [order.productionEntries, order.plannedQty, orderIsGbl, conversion, order.outputLocation, order.factory]);

  const totalProducedFromEntries = useMemo(() => {
    return processedEntries.reduce((acc, e) => acc + (e.producedQty || 0), 0);
  }, [processedEntries]);

  const remainingQtyFromEntries = Math.max(0, (order.plannedQty || 0) - totalProducedFromEntries);
  const lastProductionDate = processedEntries.length > 0 
    ? processedEntries[processedEntries.length - 1].date 
    : 'None';

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'In Production':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">In Production</span>;
      case 'Completed':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Completed</span>;
      case 'Cancelled':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">Cancelled</span>;
      case 'Planned':
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">Planned</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/60 overflow-hidden font-sans">
      {/* ── HEADER BAR (Matching View Production Order UI) ── */}
      <div className="bg-white border-b border-gray-200/90 px-5 py-3 shrink-0 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left Title & Order Meta */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-2xs shrink-0">
              <FileText className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-gray-900 tracking-tight font-mono">
                  {formatOrderNo(order.orderNumber)}
                </h1>
                {getStatusBadge(order.status)}
              </div>
              <h2 className="text-xs font-bold text-gray-900 mt-0.5">
                {order.itemName}
              </h2>
              <p className="text-[11px] text-gray-500 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>SKU: <strong className="text-gray-700 font-mono">{order.itemCode || 'FG-002'}</strong></span>
                <span className="text-gray-300">|</span>
                <span>Type: <strong className="text-gray-700">{order.itemType}</strong></span>
                <span className="text-gray-300">|</span>
                <span>Department: <strong className="text-gray-700">{order.department || 'Notebook Manufacturing'}</strong></span>
              </p>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => onEdit ? onEdit(order) : onViewOverview(order, 'overview')}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs"
            >
              <Edit3 className="w-3.5 h-3.5 text-gray-500" />
              <span>Edit</span>
            </button>

            <button
              onClick={() => onPrint(order)}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-gray-500" />
              <span>Print</span>
            </button>

            <button
              onClick={() => onViewOverview(order, 'materials')}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs"
            >
              <Layers className="w-3.5 h-3.5 text-gray-500" />
              <span>View BOM</span>
            </button>

            {order.status !== 'Completed' && (
              <button
                onClick={() => onCompleteOrder(order._id)}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm hover:shadow transition-colors cursor-pointer"
              >
                <span>Complete Production</span>
                <span className="font-bold">→</span>
              </button>
            )}

            <button
              onClick={onBack}
              title="Close (Esc)"
              className="w-7 h-7 rounded-lg border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors cursor-pointer ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── 5 TABS NAVIGATION (Identical to View Production Order) ── */}
      <div className="bg-white border-b border-gray-200 px-5 shrink-0 flex items-center space-x-5 overflow-x-auto custom-scrollbar text-xs font-semibold">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'materials', label: 'Materials' },
          { id: 'entries', label: 'Production Entries' },
          { id: 'orders', label: 'Linked Sales Orders' },
          { id: 'costing', label: 'Costing' }
        ].map(tab => {
          const active = tab.id === 'entries';
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id !== 'entries') {
                  onViewOverview(order, tab.id as any);
                }
              }}
              className={`py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                active 
                  ? 'border-blue-600 text-blue-600 font-bold'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── MAIN CONTENT CONTAINER (SCROLLABLE) ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 max-w-6xl mx-auto w-full space-y-5">
        {/* Section 1: Record Production Entry */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div>
              <h2 className="text-xs font-bold text-gray-900 tracking-wide uppercase">
                1. Record Production Entry
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Enter the quantity produced and update the production progress.
              </p>
            </div>

            <div className="flex items-center space-x-3 flex-wrap gap-y-2">
              <div className="flex items-center space-x-2">
                <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                  Production Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={productionDate}
                  onChange={e => setProductionDate(e.target.value)}
                  className="text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center space-x-2">
                <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                  Shift (Optional)
                </label>
                <select
                  value={shift}
                  onChange={e => setShift(e.target.value)}
                  className="text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="Day Shift">Day Shift</option>
                  <option value="Night Shift">Night Shift</option>
                  <option value="General Shift">General Shift</option>
                </select>
              </div>
            </div>
          </div>

          <form 
            ref={formRef}
            onKeyDown={handleFormKeyDown}
            onSubmit={handleAddEntry} 
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Produced Quantity */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Produced Quantity <span className="text-rose-500">*</span>
                </label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    min={0.1}
                    step="any"
                    value={producedQty || ''}
                    onChange={e => setProducedQty(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 font-bold focus:outline-none focus:border-blue-500"
                  />
                  <select
                    value={producedUom}
                    onChange={e => setProducedUom(e.target.value)}
                    className="w-24 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-2 font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value={order.plannedUom || 'PCS'}>{order.plannedUom || 'PCS'}</option>
                    {order.plannedUom !== 'PCS' && <option value="PCS">PCS</option>}
                  </select>
                </div>
                {isGbl && (
                  <p className="text-[11px] text-gray-500 mt-1 font-medium">
                    = <span className="font-bold text-gray-800">{producedPcs.toLocaleString()} PCS</span> (1 GBL = {conversion} PCS)
                  </p>
                )}
                {!isGbl && orderIsGbl && Number(producedQty) > 0 && (
                  <p className="text-[11px] text-blue-500 mt-1 font-medium">
                    = <span className="font-bold text-blue-700">{(Math.round((Number(producedQty) / conversion) * 10000) / 10000).toLocaleString()} GBL</span> (÷ {conversion} PCS/GBL)
                  </p>
                )}
              </div>

              {/* Completed Qty (Till Date) */}
              <div className="bg-slate-50 border border-gray-200 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">Completed Qty (Till Date)</span>
                <span className="text-sm font-bold text-gray-900 mt-1 block font-mono">
                  {order.producedQty || 0} {order.plannedUom} {orderIsGbl && completedPcs > 0 && <span className="text-gray-500 font-normal">({completedPcs.toLocaleString()} PCS)</span>}
                </span>
              </div>

              {/* Remaining Qty */}
              <div className="bg-slate-50 border border-gray-200 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">Remaining Qty</span>
                <span className="text-sm font-bold text-amber-600 mt-1 block font-mono">
                  {remainingQty} {order.plannedUom} {orderIsGbl && remainingPcs > 0 && <span className="text-amber-700/80 font-normal">({remainingPcs.toLocaleString()} PCS)</span>}
                </span>
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Remarks (Optional)</label>
              <textarea
                rows={2}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Add any notes about this production entry..."
                className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={handleClear}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Clear
              </button>

              <button
                type="submit"
                className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add Production Entry</span>
              </button>
            </div>
          </form>
        </div>

        {/* Section 2: Production Entries Table */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-gray-900 tracking-wide uppercase">
                2. Production Entries ({processedEntries.length})
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                All recorded production entries for this order.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-8 text-center">#</th>
                  <th className="py-2.5 px-3">Entry No.</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Shift</th>
                  <th className="py-2.5 px-3">Produced Qty ({order.plannedUom})</th>
                  {orderIsGbl && <th className="py-2.5 px-3">Produced PCS</th>}
                  <th className="py-2.5 px-3">Cumulative ({order.plannedUom})</th>
                  <th className="py-2.5 px-3">Balance ({order.plannedUom})</th>
                  <th className="py-2.5 px-3">Output Location</th>
                  <th className="py-2.5 px-3">Logged By</th>
                  <th className="py-2.5 px-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {processedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={orderIsGbl ? 11 : 10} className="py-8 text-center text-gray-400 text-xs">
                      <Package className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                      <p className="font-semibold text-gray-700">No production entries recorded yet.</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Use the form above to record shift output.</p>
                    </td>
                  </tr>
                ) : (
                  processedEntries.map((entry, idx) => (
                    <tr key={entry.id || idx} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-2.5 px-3 text-center font-semibold text-gray-500">{entry.entryIndex}</td>
                      <td className="py-2.5 px-3 font-bold text-blue-600 font-mono whitespace-nowrap">
                        {entry.entryNo}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-gray-800 whitespace-nowrap">{entry.date}</td>
                      <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{entry.shift || 'Day Shift'}</td>
                      <td className="py-2.5 px-3 font-bold text-gray-900 whitespace-nowrap font-mono">
                        {entry.producedQty} {order.plannedUom}
                        {(entry as any).enteredUom && (entry as any).enteredUom !== order.plannedUom && (
                          <span className="block text-[10px] text-gray-400 font-normal">
                            (entered: {(entry as any).enteredQty?.toLocaleString()} {(entry as any).enteredUom})
                          </span>
                        )}
                      </td>
                      {orderIsGbl && (
                        <td className="py-2.5 px-3 font-semibold text-gray-700 whitespace-nowrap font-mono">
                          {(entry.producedPcs || Math.round(entry.producedQty * conversion)).toLocaleString()} PCS
                        </td>
                      )}
                      <td className="py-2.5 px-3 font-bold text-gray-900 whitespace-nowrap font-mono">{entry.calcCumulative} {order.plannedUom}</td>
                      <td className="py-2.5 px-3 font-bold text-gray-900 whitespace-nowrap font-mono">{entry.calcBalance} {order.plannedUom}</td>
                      <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{entry.outputLocation}</td>
                      <td className="py-2.5 px-3 text-gray-700 font-semibold whitespace-nowrap">{entry.loggedBy}</td>
                      <td className="py-2.5 px-3 text-gray-600">{entry.remarks || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Production Entry Summary Banner */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-2xs shrink-0">
              <Package className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                Production Entry Summary
              </h4>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Aggregated progress of recorded shifts.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-6 shrink-0 flex-wrap gap-y-2">
            <div>
              <span className="text-[11px] text-gray-500 font-medium block">Total Entries</span>
              <span className="text-base font-black text-gray-900 font-mono mt-0.5 block">{processedEntries.length}</span>
            </div>

            <div>
              <span className="text-[11px] text-gray-500 font-medium block">Total Produced</span>
              <span className="text-base font-black text-gray-900 font-mono mt-0.5 block">
                {totalProducedFromEntries} {order.plannedUom}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-gray-500 font-medium block">Remaining</span>
              <span className="text-base font-black text-amber-600 font-mono mt-0.5 block">
                {remainingQtyFromEntries} {order.plannedUom}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-gray-500 font-medium block">Last Production</span>
              <span className="text-base font-black text-gray-900 font-mono mt-0.5 block">
                {lastProductionDate}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

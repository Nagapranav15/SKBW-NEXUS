import React, { useState } from 'react';
import { 
  ArrowLeft, Printer, Pencil, Layers, Check, Calendar, 
  Trash2, Plus, Clock, AlertCircle, RotateCcw
} from 'lucide-react';
import { ProductionOrder, ProductionEntry } from '../../types/production';
import { showToast } from '../ui/Toast';

interface ProductionOrderEntriesViewProps {
  order: ProductionOrder;
  onBack: () => void;
  onViewOverview: (order: ProductionOrder) => void;
  onAddEntry: (orderId: string, entryData: {
    producedQty: number;
    producedUom: string;
    shift: string;
    date: string;
    remarks?: string;
  }) => void;
  onCompleteOrder: (orderId: string) => void;
  onPrint: (order: ProductionOrder) => void;
}

export const ProductionOrderEntriesView: React.FC<ProductionOrderEntriesViewProps> = ({
  order,
  onBack,
  onViewOverview,
  onAddEntry,
  onCompleteOrder,
  onPrint
}) => {
  // Entry Form States
  const todayStr = new Date().toISOString().slice(0, 10);
  const [productionDate, setProductionDate] = useState<string>(todayStr);
  const [shift, setShift] = useState<string>('Day Shift');
  const [producedQty, setProducedQty] = useState<number | ''>('');
  const [producedUom, setProducedUom] = useState<string>(order.plannedUom || 'PCS');
  const [remarks, setRemarks] = useState<string>('');

  const conversion = order.conversionFactor || 1;
  const isGbl = producedUom === 'GBL';
  const producedPcs = isGbl ? (Number(producedQty) || 0) * conversion : (Number(producedQty) || 0);

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

  return (
    <div className="flex flex-col h-full bg-slate-50/60 overflow-y-auto custom-scrollbar">
      {/* Breadcrumbs & Header Bar */}
      <div className="bg-white border-b border-gray-150 px-6 py-4 shrink-0 shadow-2xs">
        {/* Breadcrumb line */}
        <div className="flex items-center space-x-2 text-[11px] text-gray-400 font-medium mb-2">
          <button onClick={onBack} className="hover:text-blue-600 cursor-pointer">Production Orders</button>
          <span>›</span>
          <button onClick={() => onViewOverview(order)} className="hover:text-blue-600 cursor-pointer">{order.orderNumber}</button>
          <span>›</span>
          <span className="text-blue-600 font-bold">Record Production</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center space-x-2.5">
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">{order.orderNumber}</h1>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  order.status === 'Completed'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}>
                  {order.status === 'Completed' ? 'Completed' : 'In Progress'}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                {order.itemName} &nbsp;|&nbsp; {order.itemType}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => onPrint(order)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-gray-500" />
              <span>Print</span>
            </button>

            <button
              onClick={() => onViewOverview(order)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 text-gray-500" />
              <span>Edit</span>
            </button>

            <button
              onClick={() => onViewOverview(order)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-gray-500" />
              <span>View BOM</span>
            </button>

            {order.status !== 'Completed' && (
              <button
                onClick={() => onCompleteOrder(order._id)}
                className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm hover:shadow transition-colors cursor-pointer"
              >
                <span>Complete Production</span>
                <span>→</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mini Info Bar (Matching Screen 5) */}
      <div className="bg-gray-50/90 border-b border-gray-200 px-6 py-2.5 flex items-center justify-between text-xs text-gray-600 flex-wrap gap-y-2 gap-x-6">
        <div className="flex items-center space-x-1.5">
          <span className="text-gray-400">Order No:</span>
          <span className="font-bold text-gray-900 font-mono">{order.orderNumber}</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="text-gray-400">Item:</span>
          <span className="font-bold text-gray-900">{order.itemName}</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="text-gray-400">Production Quantity:</span>
          <span className="font-bold text-gray-900">
            {order.plannedQty} {order.plannedUom} ({order.plannedPcs.toLocaleString()} PCS)
          </span>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="text-gray-400">Factory:</span>
          <span className="font-semibold text-gray-800">{order.factory}</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="text-gray-400">Department:</span>
          <span className="font-semibold text-gray-800">{order.department}</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="text-gray-400">Planned Start Date:</span>
          <span className="font-semibold text-gray-800">{order.plannedStartDate}</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="text-gray-400">Required Completion Date:</span>
          <span className="font-semibold text-gray-800">{order.requiredCompletionDate}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6 shrink-0 flex items-center space-x-6 overflow-x-auto custom-scrollbar text-xs font-semibold">
        <button
          onClick={() => onViewOverview(order)}
          className="py-3.5 border-b-2 border-transparent text-gray-500 hover:text-gray-800 cursor-pointer"
        >
          Overview
        </button>
        <button
          onClick={() => onViewOverview(order)}
          className="py-3.5 border-b-2 border-transparent text-gray-500 hover:text-gray-800 cursor-pointer"
        >
          BOM & Materials
        </button>
        <button
          className="py-3.5 border-b-2 border-blue-600 text-blue-600 font-bold cursor-pointer"
        >
          Production Entries
        </button>
        <button
          onClick={() => onViewOverview(order)}
          className="py-3.5 border-b-2 border-transparent text-gray-500 hover:text-gray-800 cursor-pointer"
        >
          Material Issues
        </button>
        <button
          onClick={() => onViewOverview(order)}
          className="py-3.5 border-b-2 border-transparent text-gray-500 hover:text-gray-800 cursor-pointer"
        >
          History
        </button>
      </div>

      {/* Main Container */}
      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Section 1: Record Production Entry (Matching Screen 5) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-150 pb-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900 tracking-wide uppercase">1. Record Production Entry</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Enter the quantity produced and update the production progress.
              </p>
            </div>

            <div className="flex items-center space-x-3">
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

          <form onSubmit={handleAddEntry} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Produced Quantity */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
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
                    <option value="GBL">GBL</option>
                    <option value="PCS">PCS</option>
                  </select>
                </div>
                {isGbl && (
                  <p className="text-[11px] text-gray-500 mt-1 font-medium">
                    = <span className="font-bold text-gray-800">{producedPcs.toLocaleString()} PCS</span> (1 GBL = {conversion} PCS)
                  </p>
                )}
              </div>

              {/* Completed Qty (Till Date) */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <span className="text-[11px] font-semibold text-gray-400 block uppercase">Completed Qty (Till Date)</span>
                <span className="text-sm font-black text-gray-900 mt-1 block">
                  {order.producedQty} {order.plannedUom} ({order.producedPcs.toLocaleString()} PCS)
                </span>
              </div>

              {/* Remaining Qty */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <span className="text-[11px] font-semibold text-gray-400 block uppercase">Remaining Qty</span>
                <span className="text-sm font-black text-gray-900 mt-1 block">
                  {order.balanceQty} {order.plannedUom} ({order.balancePcs.toLocaleString()} PCS)
                </span>
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Remarks (Optional)</label>
              <textarea
                rows={2}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Add any notes about this production entry..."
                className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={handleClear}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Clear
              </button>

              <button
                type="submit"
                className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Production Entry</span>
              </button>
            </div>
          </form>
        </div>

        {/* Section 2: Production Entries (N) (Matching Screen 5) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900 tracking-wide uppercase">
                2. Production Entries ({order.productionEntries?.length || 0})
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                All recorded production entries for this order.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-3 w-8 text-center">#</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Shift</th>
                  <th className="py-3 px-3">Produced Quantity</th>
                  <th className="py-3 px-3">Produced PCS</th>
                  <th className="py-3 px-3">Cumulative Quantity</th>
                  <th className="py-3 px-3">Cumulative PCS</th>
                  <th className="py-3 px-3">Remarks</th>
                  <th className="py-3 px-3">Created By</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(!order.productionEntries || order.productionEntries.length === 0) ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-gray-400">
                      No production entries recorded yet. Use the form above to record shift output.
                    </td>
                  </tr>
                ) : (
                  order.productionEntries.map((entry, idx) => (
                    <tr key={entry.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-3 text-center font-semibold text-gray-500">{idx + 1}</td>
                      <td className="py-3 px-3 font-semibold text-gray-900 whitespace-nowrap">{entry.date}</td>
                      <td className="py-3 px-3 text-gray-700 whitespace-nowrap">{entry.shift}</td>
                      <td className="py-3 px-3 font-bold text-gray-900 whitespace-nowrap">{entry.producedQty} {entry.producedUom}</td>
                      <td className="py-3 px-3 font-semibold text-gray-700 whitespace-nowrap">{entry.producedPcs.toLocaleString()} PCS</td>
                      <td className="py-3 px-3 font-bold text-gray-900 whitespace-nowrap">{entry.cumulativeQty} {entry.producedUom}</td>
                      <td className="py-3 px-3 font-semibold text-gray-700 whitespace-nowrap">{entry.cumulativePcs.toLocaleString()} PCS</td>
                      <td className="py-3 px-3 text-gray-600 font-medium">{entry.remarks || '-'}</td>
                      <td className="py-3 px-3 text-gray-700 font-semibold whitespace-nowrap">{entry.createdBy}</td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            title="Edit entry"
                            className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            title="Delete entry"
                            className="p-1 text-gray-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Production Progress Bar (Matching Screen 5) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              Production Progress
            </h3>
            <div className="flex items-center space-x-3">
              <span className="text-base font-black text-emerald-600">{order.progress}%</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                order.progress >= 100 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}>
                {order.progress >= 100 ? 'Completed' : 'In Progress'}
              </span>
            </div>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
            <div 
              className={`h-2.5 rounded-full transition-all duration-500 ${
                order.progress >= 100 ? 'bg-emerald-500' : 'bg-blue-600'
              }`}
              style={{ width: `${order.progress}%` }}
            />
          </div>

          <p className="text-xs font-semibold text-gray-600">
            {order.producedQty} {order.plannedUom} produced out of {order.plannedQty} {order.plannedUom}
          </p>
        </div>
      </div>
    </div>
  );
};

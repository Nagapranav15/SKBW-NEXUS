import React, { useState } from 'react';
import { 
  ArrowLeft, Printer, Layers, Package, Plus, CheckCircle2, 
  Clock, IndianRupee, Box, Check, ExternalLink, AlertCircle, FileText, History
} from 'lucide-react';
import { ProductionOrder } from '../../types/production';
import { showToast } from '../ui/Toast';

interface ProductionOrderDetailViewProps {
  order: ProductionOrder;
  onBack: () => void;
  onNewOrder: () => void;
  onRecordEntries: (order: ProductionOrder) => void;
  onPrint: (order: ProductionOrder) => void;
  onCompleteOrder?: (order: ProductionOrder) => void;
}

export const ProductionOrderDetailView: React.FC<ProductionOrderDetailViewProps> = ({
  order,
  onBack,
  onNewOrder,
  onRecordEntries,
  onPrint,
  onCompleteOrder
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'bom' | 'entries' | 'issues' | 'batch' | 'history'>('overview');

  // Compute total material cost
  const totalCost = (order.bomItems || []).reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const isCompleted = order.status === 'Completed';

  // Duration computation
  const getDurationText = () => {
    if (order.actualCompletionDate) {
      return `${order.plannedStartDate || ''} – ${order.actualCompletionDate}`;
    }
    return `In Progress (${order.plannedStartDate || ''} – ${order.requiredCompletionDate || ''})`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/60 overflow-y-auto custom-scrollbar">
      {/* Breadcrumbs & Header Bar */}
      <div className="bg-white border-b border-gray-150 px-6 py-4 shrink-0 shadow-2xs">
        {/* Breadcrumb line */}
        <div className="flex items-center space-x-2 text-[11px] text-gray-400 font-medium mb-2">
          <button onClick={onBack} className="hover:text-blue-600 cursor-pointer">Production Orders</button>
          <span>›</span>
          <span className="text-gray-600 font-semibold">{order.orderNumber}</span>
          <span>›</span>
          <span className="text-blue-600 font-bold">{order.status}</span>
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
                  {order.status}
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
              onClick={() => setActiveTab('bom')}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-gray-500" />
              <span>View BOM</span>
            </button>

            <button
              onClick={() => onRecordEntries(order)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Package className="w-3.5 h-3.5 text-gray-500" />
              <span>View Entries</span>
            </button>

            {!isCompleted && onCompleteOrder && (
              <button
                onClick={() => onCompleteOrder(order)}
                className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Complete Order</span>
              </button>
            )}

            <button
              onClick={onNewOrder}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm hover:shadow transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Order</span>
            </button>
          </div>
        </div>
      </div>

      {/* Completion Banner (Matching Screen 4) */}
      {isCompleted && (
        <div className="bg-emerald-500/10 border-b border-emerald-200/60 px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2.5">
            <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
            <div>
              <span className="font-bold text-emerald-950">Production Completed Successfully!</span>
              <p className="text-[11px] text-emerald-800">
                {order.producedQty} {order.plannedUom} ({order.producedPcs.toLocaleString()} PCS) of {order.itemName} has been produced and added to stock.
              </p>
            </div>
          </div>

          <div className="text-[11px] text-emerald-800 sm:text-right font-medium">
            Completed on <span className="font-bold text-emerald-950">{order.actualCompletionDate || '25 Sep 2026, 04:30 PM'}</span>
            {order.completedBy && <span> | Completed by <span className="font-bold text-emerald-950">{order.completedBy}</span></span>}
          </div>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="bg-white border-b border-gray-200 px-6 shrink-0 flex items-center space-x-6 overflow-x-auto custom-scrollbar text-xs font-semibold">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'bom', label: 'BOM & Materials' },
          { id: 'entries', label: 'Production Entries' },
          { id: 'issues', label: 'Material Issues' },
          { id: 'batch', label: 'Finished Goods Batch' },
          { id: 'history', label: 'History' }
        ].map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === 'entries') {
                  onRecordEntries(order);
                } else {
                  setActiveTab(tab.id as any);
                }
              }}
              className={`py-3.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
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

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* 4 Stat Metric Cards (Matching Screen 4) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Production Quantity */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Production Quantity</p>
              <h3 className="text-xl font-black text-gray-900 mt-1">
                {order.plannedQty} {order.plannedUom}
              </h3>
              <p className="text-[11px] text-gray-500 font-medium">({order.plannedPcs.toLocaleString()} PCS)</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Box className="w-5 h-5 stroke-[2.2]" />
            </div>
          </div>

          {/* Card 2: Total Produced */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total Produced</p>
              <h3 className="text-xl font-black text-gray-900 mt-1">
                {order.producedQty} {order.plannedUom}
              </h3>
              <p className="text-[11px] text-gray-500 font-medium">({order.producedPcs.toLocaleString()} PCS)</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-5 h-5 stroke-[2.2]" />
            </div>
          </div>

          {/* Card 3: Production Duration */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Production Duration</p>
              <h3 className="text-xl font-black text-gray-900 mt-1">
                {isCompleted ? '2 Days' : 'In Progress'}
              </h3>
              <p className="text-[11px] text-gray-500 font-medium">
                {order.plannedStartDate} – {order.requiredCompletionDate}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
              <Clock className="w-5 h-5 stroke-[2.2]" />
            </div>
          </div>

          {/* Card 4: Total Material Cost */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total Material Cost</p>
              <h3 className="text-xl font-black text-gray-900 mt-1">
                ₹ {totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <p className="text-[11px] text-emerald-600 font-semibold">(Estimated)</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
              <Layers className="w-5 h-5 stroke-[2.2]" />
            </div>
          </div>
        </div>

        {/* 2x2 Grid (Matching Screen 4) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Order Details */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center space-x-2 border-b border-gray-150 pb-3">
                <Box className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Order Details</h3>
              </div>

              <div className="grid grid-cols-2 gap-y-3.5 text-xs">
                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Order No.</span>
                  <span className="font-bold text-gray-900 font-mono mt-0.5 block">{order.orderNumber}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Item</span>
                  <span className="font-bold text-gray-900 mt-0.5 block">{order.itemName}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Item Type</span>
                  <span className="font-semibold text-gray-700 mt-0.5 block">{order.itemType}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Factory</span>
                  <span className="font-semibold text-gray-700 mt-0.5 block">{order.factory}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Department</span>
                  <span className="font-semibold text-gray-700 mt-0.5 block">{order.department}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Planned Start Date</span>
                  <span className="font-semibold text-gray-700 mt-0.5 block">{order.plannedStartDate}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Required Completion Date</span>
                  <span className="font-semibold text-gray-700 mt-0.5 block">{order.requiredCompletionDate}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Actual Completion Date</span>
                  <span className="font-semibold text-gray-700 mt-0.5 block">{order.actualCompletionDate || '-'}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Priority</span>
                  <span className="font-semibold text-gray-700 mt-0.5 block">{order.priority}</span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Reference (Sales Order)</span>
                  <span className="font-semibold text-gray-700 mt-0.5 block">{order.reference || 'Not Selected'}</span>
                </div>

                <div className="col-span-2">
                  <span className="text-[11px] text-gray-400 font-medium block">Remarks</span>
                  <span className="font-medium text-gray-600 mt-0.5 block">{order.remarks || '-'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Finished Goods Batch */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-150 pb-3">
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Finished Goods Batch</h3>
                </div>

                <a 
                  href="/inventory-v2/skus" 
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1"
                >
                  <span>View in Inventory</span>
                  <span>→</span>
                </a>
              </div>

              <div className="grid grid-cols-2 gap-y-3.5 text-xs">
                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Batch No.</span>
                  <span className="font-bold text-gray-900 font-mono mt-0.5 block">
                    {order.finishedGoodsBatch?.batchNo || '-'}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Manufacturing Date</span>
                  <span className="font-semibold text-gray-700 mt-0.5 block">
                    {order.finishedGoodsBatch?.manufacturingDate || order.plannedStartDate || '-'}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Expiry Date</span>
                  <span className="font-semibold text-gray-700 mt-0.5 block">
                    {order.finishedGoodsBatch?.expiryDate || '-'}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Produced Quantity</span>
                  <span className="font-bold text-gray-900 mt-0.5 block">
                    {order.finishedGoodsBatch?.producedQuantity || `${order.producedQty} ${order.plannedUom} (${order.producedPcs.toLocaleString()} PCS)`}
                  </span>
                </div>

                <div className="col-span-2">
                  <span className="text-[11px] text-gray-400 font-medium block">Received to Location</span>
                  <span className="font-semibold text-gray-900 mt-0.5 block">
                    {order.finishedGoodsBatch?.receivedToLocation || `${order.factory} Finished Goods`}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-gray-400 font-medium block">Status</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 mt-0.5">
                    {order.finishedGoodsBatch?.status || (isCompleted ? 'In Stock' : 'Planned')}
                  </span>
                </div>

                <div className="col-span-2">
                  <span className="text-[11px] text-gray-400 font-medium block">Batch Remarks</span>
                  <span className="font-medium text-gray-600 mt-0.5 block">
                    {order.finishedGoodsBatch?.batchRemarks || order.remarks || '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Material Consumption Summary */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-150 pb-3">
                <div className="flex items-center space-x-2">
                  <Package className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Material Consumption Summary</h3>
                </div>

                <button
                  onClick={() => setActiveTab('issues')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <span>View Material Issues</span>
                  <span>→</span>
                </button>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase">
                      <th className="py-2 px-2.5 w-8">#</th>
                      <th className="py-2 px-2.5">Component</th>
                      <th className="py-2 px-2.5">Required Qty</th>
                      <th className="py-2 px-2.5">Issued Qty</th>
                      <th className="py-2 px-2.5">UOM</th>
                      <th className="py-2 px-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {order.bomItems?.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-gray-50/50">
                        <td className="py-2.5 px-2.5 text-gray-500 font-semibold">{idx + 1}</td>
                        <td className="py-2.5 px-2.5 font-semibold text-gray-900">{item.component}</td>
                        <td className="py-2.5 px-2.5 font-bold text-gray-800">{item.totalRequired.toLocaleString()}</td>
                        <td className="py-2.5 px-2.5 font-bold text-gray-800">{item.issuedQty?.toLocaleString() || item.totalRequired.toLocaleString()}</td>
                        <td className="py-2.5 px-2.5 text-gray-600">{item.uom}</td>
                        <td className="py-2.5 px-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {item.issuedStatus || 'Issued'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Card 4: Stock Update */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-150 pb-3">
                <div className="flex items-center space-x-2">
                  <Box className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Stock Update</h3>
                </div>

                <a 
                  href="/inventory-v2/skus" 
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1"
                >
                  <span>View Stock</span>
                  <span>→</span>
                </a>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase">
                      <th className="py-2 px-2.5 w-8">#</th>
                      <th className="py-2 px-2.5">Item</th>
                      <th className="py-2 px-2.5">Quantity In</th>
                      <th className="py-2 px-2.5">UOM</th>
                      <th className="py-2 px-2.5">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr className="hover:bg-gray-50/50">
                      <td className="py-2.5 px-2.5 text-gray-500 font-semibold">1</td>
                      <td className="py-2.5 px-2.5 font-bold text-gray-900">{order.itemName}</td>
                      <td className="py-2.5 px-2.5 font-bold text-gray-900">{order.producedQty}</td>
                      <td className="py-2.5 px-2.5 text-gray-600 font-medium">{order.plannedUom}</td>
                      <td className="py-2.5 px-2.5 text-gray-700 font-medium">
                        {order.factory} Finished Goods - A1
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-lg flex items-center space-x-2 text-xs text-blue-800">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  {order.producedPcs.toLocaleString()} PCS ({order.producedQty} {order.plannedUom}) has been added to finished goods stock.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

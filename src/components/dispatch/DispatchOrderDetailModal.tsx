import React, { useMemo } from 'react';
import {
  X, Truck, Calendar, MapPin, Phone, Package,
  AlertCircle, CheckCircle2, Clock, Printer, FileText,
  Building, User, ChevronRight, Layers, Hash
} from 'lucide-react';
import { SalesOrderV2 } from '../../api/salesOrderApiV2';
import { DispatchRowOrder } from './DispatchModule';

interface DispatchOrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderRow: DispatchRowOrder | null;
  onOpenDispatch: (orderRow: DispatchRowOrder) => void;
  onViewChallan?: (challan: any) => void;
}

export const DispatchOrderDetailModal: React.FC<DispatchOrderDetailModalProps> = ({
  isOpen,
  onClose,
  orderRow,
  onOpenDispatch,
  onViewChallan
}) => {
  if (!isOpen || !orderRow) return null;

  const raw = orderRow.rawOrder;

  // Retrieve any challans saved for this order
  const challanHistory = useMemo(() => {
    try {
      const companyId = raw.company || 'default';
      const cKey = `skbw_delivery_challans_${companyId}`;
      const list = JSON.parse(localStorage.getItem(cKey) || '[]');
      if (Array.isArray(list)) {
        return list.filter((c: any) => c.orderNumber === orderRow.orderNumber || c.orderId === orderRow._id);
      }
      return [];
    } catch {
      return [];
    }
  }, [orderRow]);

  const totalOrdered = useMemo(() => {
    return (orderRow.items || []).reduce((acc, i) => acc + (Number(i.orderedQty) || 0), 0);
  }, [orderRow]);

  const totalDispatched = useMemo(() => {
    return (orderRow.items || []).reduce((acc, i) => acc + (Number(i.dispatchedQty) || 0), 0);
  }, [orderRow]);

  const dispatchProgress = totalOrdered > 0 ? Math.round((totalDispatched / totalOrdered) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-left"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <FileText className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-black text-gray-900 tracking-tight font-mono">
                  {orderRow.orderNumber}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200">
                  {orderRow.orderDate}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  orderRow.readyStatus === 'Ready'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : orderRow.readyStatus === 'Partially Ready'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {orderRow.readyStatus}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">
                Sales Order Dispatch Readiness & Delivery Status
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenDispatch(orderRow);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Truck className="w-4 h-4" />
              <span>Create Dispatch</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Customer & Location Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer Details */}
            <div className="bg-white p-4 rounded-xl border border-gray-200/90 shadow-2xs space-y-2.5">
              <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">
                Customer Details
              </span>
              <div className="text-sm font-bold text-gray-900">
                {orderRow.customerName}
              </div>
              <div className="flex flex-col gap-1.5 text-xs text-gray-600">
                {orderRow.customerPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <span className="font-mono font-medium">{orderRow.customerPhone}</span>
                  </div>
                )}
                {orderRow.city && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <span>{orderRow.city}, {orderRow.region}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Dispatch Summary */}
            <div className="bg-white p-4 rounded-xl border border-gray-200/90 shadow-2xs space-y-3">
              <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">
                Fulfillment Progress
              </span>
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-gray-800 mb-1">
                  <span>{totalDispatched} of {totalOrdered} items dispatched</span>
                  <span className="font-mono">{dispatchProgress}%</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{ width: `${dispatchProgress}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100 text-xs">
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Pending GBL</span>
                  <span className="text-base font-black text-gray-900 font-mono">{orderRow.pendingGbl} GBL</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Pending PCS</span>
                  <span className="text-base font-black text-gray-900 font-mono">{orderRow.pendingPcs.toLocaleString()} PCS</span>
                </div>
              </div>
            </div>
          </div>

          {/* Items Breakdown Table */}
          <div>
            <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-blue-600" />
              Order Items Breakdown & Pending Status
            </h3>

            <div className="border border-gray-200/90 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-extrabold text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Item Description</th>
                    <th className="py-2.5 px-2 text-right">Ordered</th>
                    <th className="py-2.5 px-2 text-right">Dispatched</th>
                    <th className="py-2.5 px-2 text-right font-black text-blue-600">Pending</th>
                    <th className="py-2.5 px-2 text-right">GBL</th>
                    <th className="py-2.5 px-3 text-right">PCS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {orderRow.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-bold text-gray-900 block">{item.itemName}</span>
                        {item.skuCode && (
                          <span className="text-[10px] font-mono text-gray-400 block">{item.skuCode}</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-medium text-gray-700">
                        {item.orderedQty} <span className="text-[10px] text-gray-400">{item.uom}</span>
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-gray-500">
                        {item.dispatchedQty}
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-black text-blue-700">
                        {item.pendingQty}
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-bold text-gray-800">
                        {item.gbl}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium text-gray-600">
                        {item.pcs.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Challans Generated History */}
          {challanHistory.length > 0 && (
            <div>
              <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-blue-600" />
                Delivery Challans Generated ({challanHistory.length})
              </h3>
              <div className="border border-gray-200/90 rounded-xl overflow-hidden shadow-2xs divide-y divide-gray-100 bg-white">
                {challanHistory.map((ch: any, idx: number) => (
                  <div key={idx} className="p-3.5 flex items-center justify-between hover:bg-gray-50/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                        DC
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-gray-900 text-xs">{ch.dcNumber}</span>
                          <span className="text-[10px] text-gray-400">• {ch.date}</span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                          Transporter: <strong className="text-gray-700">{ch.transporterName || 'Direct'}</strong> • Vehicle: <strong className="font-mono text-gray-700">{ch.vehicleNumber || '—'}</strong>
                        </p>
                      </div>
                    </div>
                    {onViewChallan && (
                      <button
                        onClick={() => onViewChallan(ch)}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-700 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Challan</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 rounded-xl hover:bg-gray-200/70 transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={() => {
              onClose();
              onOpenDispatch(orderRow);
            }}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <Truck className="w-4 h-4" />
            <span>Create Dispatch for this Order</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DispatchOrderDetailModal;

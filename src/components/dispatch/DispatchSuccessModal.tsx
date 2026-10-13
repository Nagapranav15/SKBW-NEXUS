import React from 'react';
import { createPortal } from 'react-dom';
import { X, Package, Truck, FileText, ChevronRight, CheckCircle2, Printer } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { printDeliveryChallan } from '../../utils/printDeliveryChallan';

interface DispatchSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  challan: any;
  onPrintChallan?: () => void;
  onViewDetails?: () => void;
}

export const DispatchSuccessModal: React.FC<DispatchSuccessModalProps> = ({
  isOpen,
  onClose,
  challan,
  onPrintChallan,
  onViewDetails,
}) => {
  const { selectedCompany } = useAuth();
  if (!isOpen || !challan) return null;

  const handlePrint = onPrintChallan || (() => printDeliveryChallan(challan, selectedCompany));

  const dcNumber = challan.dcNumber || challan._id || 'DO-001';
  const orderNumber = challan.orderNumber || '—';
  const dateStr = challan.date || challan.dispatchDate || new Date().toLocaleDateString('en-GB');
  const status = challan.fulfillmentStatus || (challan.status === 'dispatched' ? 'Fully Dispatched' : 'Partially Dispatched');
  const isPartial = status === 'Partially Dispatched';

  const transporterName = challan.transporterName || '—';
  const lrNumber = challan.lrNumber || '—';
  const totalGbl = challan.totalGbl ?? 0;
  const totalPcs = challan.totalPcs ?? 0;
  const remainingGbl = challan.remainingGbl ?? 0;
  const remainingPcs = challan.remainingPcs ?? 0;

  const items: any[] = challan.items || [];
  // Remaining items = items where afterDispatch > 0
  const remainingItems = items.filter(
    (i: any) => (Number(i.orderedQty) || 0) > (Number(i.deliveredQty) || 0)
  ).map((i: any) => ({
    itemCode: i.skuCode || i.itemId || '—',
    itemName: i.itemName || '—',
    remainingGbl: Math.max(0, (Number(i.orderedQty) || 0) - (Number(i.deliveredQty) || 0)),
    remainingPcs: Math.max(0, ((Number(i.orderedQty) || 0) - (Number(i.deliveredQty) || 0)) * (Number(i.pcsPerGbl) || 1)),
  }));

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white w-full overflow-hidden dlg-panel"
        style={{ maxWidth: 580, maxHeight: '92vh', margin: '0 16px' }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Close button */}
        <div className="flex justify-end p-4 pb-0">
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-6 pb-6 space-y-4">

          {/* ── Success Header */}
          <div className="text-center -mt-2">
            {/* Animated green check */}
            <div className="relative inline-flex items-center justify-center mb-4">
              {/* Confetti dots */}
              <span className="absolute -top-4 -left-6 w-2 h-2 rounded-full bg-emerald-400 opacity-70" style={{ transform: 'rotate(-20deg)' }} />
              <span className="absolute -top-3 left-2 w-1.5 h-1.5 rounded-full bg-blue-400 opacity-70" />
              <span className="absolute -top-5 right-0 w-2 h-2 rounded-full bg-amber-400 opacity-70" />
              <span className="absolute top-0 -right-5 w-1.5 h-1.5 rounded-full bg-rose-400 opacity-70" />
              <span className="absolute -bottom-3 -left-4 w-2 h-2 rounded-full bg-blue-400 opacity-60" />
              <span className="absolute -bottom-2 right-0 w-1.5 h-1.5 rounded-full bg-emerald-400 opacity-60" />
              <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200">
                <CheckCircle2 className="w-9 h-9 text-white stroke-[2.5]" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-emerald-700 tracking-tight">Dispatch Created Successfully!</h2>
            <p className="text-[0.875rem] text-gray-500 mt-1.5">Dispatch has been saved and stock has been updated.</p>
          </div>

          {/* ── Meta Info Strip */}
          <div className="grid grid-cols-4 gap-2 bg-gray-50 border border-gray-200 rounded-xl p-4">
            <MetaItem icon={<Package className="w-3.5 h-3.5 text-blue-600" />} label="Dispatch No." value={dcNumber} mono />
            <MetaItem icon={<FileText className="w-3.5 h-3.5 text-blue-600" />} label="Sales Order" value={orderNumber} mono />
            <MetaItem icon={<span className="text-blue-600 text-[0.875rem]">📅</span>} label="Dispatch Date" value={dateStr} />
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Status</p>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                isPartial
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {isPartial ? 'Partially Dispatched' : 'Fully Dispatched'}
              </span>
            </div>
          </div>

          {/* ── Dispatch Summary (This Dispatch) */}
          <div className="border border-blue-100 bg-blue-50/40 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-blue-100 flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center">
                <Truck className="w-3 h-3" />
              </div>
              <span className="text-xs font-medium text-gray-800 uppercase tracking-wider">Dispatch Summary (This Dispatch)</span>
            </div>
            <div className="grid grid-cols-3 divide-x divide-blue-100 p-0">
              <SummaryCard
                icon={<Package className="w-5 h-5 text-blue-600" />}
                primary={`${totalGbl} GBL`}
                sub={`(${Number(totalPcs).toLocaleString()} PCS)`}
                label="Dispatched"
              />
              <SummaryCard
                icon={<Truck className="w-5 h-5 text-blue-600" />}
                primary="1"
                sub="Transporter"
                label={transporterName !== '—' ? transporterName : 'Direct / Self'}
              />
              <SummaryCard
                icon={<FileText className="w-5 h-5 text-blue-600" />}
                primary="—"
                sub="Packages"
                label={lrNumber !== '—' ? `LR: ${lrNumber}` : 'No LR / Self'}
              />
            </div>
          </div>

          {/* ── Items Dispatched */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-blue-50/50 px-4 py-2.5 border-b border-blue-100 flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center">
                <span className="text-xs font-semibold">✦</span>
              </div>
              <span className="text-xs font-medium text-gray-800 uppercase tracking-wider">Items Dispatched</span>
            </div>
            <table className="doc-table w-full text-[0.875rem]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="py-2 px-4 w-8 text-center">#</th>
                  <th className="py-2 px-4">Item Code</th>
                  <th className="py-2 px-4">Item Name</th>
                  <th className="py-2 px-4 text-right">Dispatch Qty (GBL)</th>
                  <th className="py-2 px-4 text-right">Dispatch Qty (PCS)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-gray-400 text-[0.875rem]">No items</td>
                  </tr>
                ) : (
                  items.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      <td className="py-2.5 px-4 text-center text-gray-400 font-semibold">{idx + 1}</td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-gray-700">{item.skuCode || item.itemId || '—'}</td>
                      <td className="py-2.5 px-4 font-semibold text-gray-900">{item.itemName}</td>
                      <td className="py-2.5 px-4 text-right font-semibold font-mono text-blue-700">{Number(item.deliveredQty) || 0}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-gray-600">
                        {(Number(item.deliveredPcs) || Number(item.deliveredQty) || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Remaining Pending (only if partial) */}
          {(remainingItems.length > 0 || isPartial) && (
            <div className="border border-amber-200 rounded-xl overflow-hidden">
              <div className="bg-amber-50/60 px-4 py-2.5 border-b border-amber-100 flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-amber-500 text-white flex items-center justify-center">
                  <span className="text-xs font-semibold">!</span>
                </div>
                <span className="text-xs font-medium text-gray-800 uppercase tracking-wider">Remaining Pending (After Dispatch)</span>
              </div>
              {remainingItems.length > 0 ? (
                <table className="doc-table w-full text-[0.875rem]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <th className="py-2 px-4 w-8 text-center">#</th>
                      <th className="py-2 px-4">Item Code</th>
                      <th className="py-2 px-4">Item Name</th>
                      <th className="py-2 px-4 text-right">Remaining Qty (GBL)</th>
                      <th className="py-2 px-4 text-right">Remaining Qty (PCS)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {remainingItems.map((ri, idx) => (
                      <tr key={idx} className="hover:bg-amber-50/30">
                        <td className="py-2.5 px-4 text-center text-gray-400 font-semibold">{idx + 1}</td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-gray-700">{ri.itemCode}</td>
                        <td className="py-2.5 px-4 font-semibold text-gray-900">{ri.itemName}</td>
                        <td className="py-2.5 px-4 text-right font-semibold font-mono text-amber-700">{ri.remainingGbl}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-amber-600">{ri.remainingPcs.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-4 px-4 text-center text-[0.875rem] text-amber-600 font-medium">
                  {remainingGbl} GBL ({remainingPcs.toLocaleString()} PCS) remaining across all items
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer */}
        <div className="px-6 py-3.5 border-t border-gray-200 bg-gray-50/60 flex items-center justify-between shrink-0 dlg-footer">
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Close
          </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 text-[0.875rem] font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 rounded-xl cursor-pointer flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Delivery Challan
            </button>
            {onViewDetails && (
              <button
                onClick={onViewDetails}
                className="btn-primary"
              >
                View Dispatch Details
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ─── Helpers ─── */

function MetaItem({
  icon, label, value, mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        {icon}
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`font-semibold text-[0.875rem] text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function SummaryCard({
  icon, primary, sub, label,
}: {
  icon: React.ReactNode;
  primary: string;
  sub: string;
  label: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4">
      <div className="w-10 h-10 rounded-xl bg-blue-100/60 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-base text-gray-900 leading-tight">{primary}</p>
        <p className="text-xs font-semibold text-blue-600 leading-tight">{sub}</p>
        <p className="text-xs text-gray-500 font-medium mt-0.5 truncate">{label}</p>
      </div>
    </div>
  );
}

export default DispatchSuccessModal;

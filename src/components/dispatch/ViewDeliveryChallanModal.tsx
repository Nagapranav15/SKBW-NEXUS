import React from 'react';
import { X, Printer, Download, Truck, Calendar, MapPin, Phone, Building, CheckCircle2, RotateCcw } from 'lucide-react';
import { formatCurrency } from '../../utils/currencyUtils';

export interface ViewDeliveryChallanModalProps {
  isOpen: boolean;
  onClose: () => void;
  challan: any;
  onRevert?: (challan: any) => void;
}

export const ViewDeliveryChallanModal: React.FC<ViewDeliveryChallanModalProps> = ({
  isOpen,
  onClose,
  challan,
  onRevert
}) => {
  if (!isOpen || !challan) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-left"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Action Bar */}
        <div className="px-6 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-gray-500">Delivery Challan</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200">
              {challan.dcNumber || 'DO-001'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onRevert && (
              <button
                onClick={() => onRevert(challan)}
                className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95"
                title="Revert Delivery Challan & Restore Stock"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                Revert Challan
              </button>
            )}
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Challan
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Challan Sheet */}
        <div className="flex-1 overflow-y-auto p-8 bg-white print:p-0">
          <div className="border border-gray-300 rounded-xl p-6 print:border-none print:p-0">
            {/* Header: Company Info */}
            <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4 mb-4">
              <div>
                <h1 className="text-xl font-black text-gray-900 tracking-tight">SRI KANYAKA PARAMESWARI PAPER PRODUCTS</h1>
                <p className="text-xs text-gray-600 font-medium">Manufacturers of Premium Quality Note Books & Account Books</p>
                <p className="text-[11px] text-gray-500 mt-1">Plot No. 12, Industrial Area, Hyderabad - 500072, Telangana</p>
                <p className="text-[11px] text-gray-500 font-mono">GSTIN: 36AABCS1429B1Z8 • Phone: +91 98480 12345</p>
              </div>
              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-gray-900 text-white text-xs font-black uppercase tracking-widest rounded-md mb-1.5">
                  DELIVERY CHALLAN
                </span>
                <p className="text-xs font-bold text-gray-800 font-mono">No: {challan.dcNumber}</p>
                <p className="text-xs text-gray-600 font-mono">Date: {challan.date || new Date().toLocaleDateString('en-GB')}</p>
              </div>
            </div>

            {/* Consignee & Transport Meta */}
            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-200 mb-4 text-xs">
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 block mb-1">Delivered To:</span>
                <span className="font-bold text-gray-900 text-sm block">{challan.customerName}</span>
                <span className="text-gray-600 block mt-0.5">
                  Order Ref: <strong className="font-mono text-blue-700">{challan.orderNumber && challan.orderNumber !== 'DIRECT' ? challan.orderNumber : 'Direct Dispatch (Standalone)'}</strong>
                </span>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 block mb-1">Dispatch Details:</span>
                <span className="text-gray-700 block">Transporter: <strong>{challan.transporterName || 'Self / Direct'}</strong></span>
                <span className="text-gray-700 block font-mono">Vehicle No: <strong>{challan.vehicleNumber || '—'}</strong></span>
                {challan.lrNumber && <span className="text-gray-700 block font-mono">LR No: {challan.lrNumber}</span>}
              </div>
            </div>

            {/* Items Table */}
            <table className="w-full text-xs border-collapse mb-6">
              <thead>
                <tr className="bg-gray-100 text-gray-700 font-bold border-y border-gray-300">
                  <th className="py-2 px-3 text-left w-12">#</th>
                  <th className="py-2 px-3 text-left">Item Description</th>
                  <th className="py-2 px-3 text-right">Dispatched Qty</th>
                  <th className="py-2 px-3 text-right">Rate</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(challan.items || []).map((it: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-2.5 px-3 text-gray-400 font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-gray-800">{it.itemName}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {it.skuCode && <span className="text-[10px] font-mono text-gray-400">{it.skuCode}</span>}
                        {it.locationName && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                            <MapPin className="w-2.5 h-2.5" />
                            {it.locationName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold font-mono text-gray-900">
                      {it.deliveredQty || it.quantity || 0} {it.uom || 'Pcs'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-gray-700">
                      ₹{it.price || it.unitPrice || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold font-mono text-gray-900">
                      ₹{(it.total || ((it.deliveredQty || 0) * (it.price || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-900 font-bold bg-gray-50">
                  <td colSpan={2} className="py-2 px-3 text-right uppercase text-[10px] text-gray-600">Total</td>
                  <td className="py-2 px-3 text-right font-mono text-gray-900">
                    {(challan.items || []).reduce((s: number, i: any) => s + (Number(i.deliveredQty || i.quantity) || 0), 0)} Units
                  </td>
                  <td className="py-2 px-3"></td>
                  <td className="py-2 px-3 text-right font-mono text-gray-900">
                    ₹{(challan.subtotal || challan.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Signature Blocks */}
            <div className="grid grid-cols-3 gap-6 pt-12 text-center text-xs">
              <div className="border-t border-gray-300 pt-2">
                <span className="font-bold text-gray-700">Receiver's Signature</span>
                <p className="text-[10px] text-gray-400 mt-0.5">Goods received in good condition</p>
              </div>
              <div className="border-t border-gray-300 pt-2">
                <span className="font-bold text-gray-700">Driver's Signature</span>
                <p className="text-[10px] text-gray-400 mt-0.5">Vehicle Driver</p>
              </div>
              <div className="border-t border-gray-300 pt-2">
                <span className="font-bold text-gray-700">Authorized Signatory</span>
                <p className="text-[10px] text-gray-400 mt-0.5">For Sri Kanyaka Parameswari</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewDeliveryChallanModal;

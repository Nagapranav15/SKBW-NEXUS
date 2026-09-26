import React from 'react';
import { X, Printer } from 'lucide-react';
import { ProductionOrder } from '../../types/production';

interface ProductionPrintModalProps {
  order: ProductionOrder | null;
  onClose: () => void;
}

export const ProductionPrintModal: React.FC<ProductionPrintModalProps> = ({ order, onClose }) => {
  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl overflow-hidden animate-modalPop">
        {/* Header - Hidden on print */}
        <div className="p-4 border-b border-gray-150 flex items-center justify-between print:hidden">
          <div className="flex items-center space-x-2">
            <Printer className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-gray-900 uppercase">Production Job Order Ticket</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Job Sheet</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Sheet */}
        <div className="p-8 text-xs text-gray-800 space-y-6 print:p-0 print:m-0">
          <div className="border-b-2 border-gray-900 pb-4 flex justify-between items-start">
            <div>
              <h1 className="text-lg font-black text-gray-900 uppercase tracking-wide">SKBW PRODUCTION WORK ORDER</h1>
              <p className="text-[11px] text-gray-500 font-medium">Department of Manufacturing & Operations</p>
            </div>
            <div className="text-right">
              <span className="text-sm font-black font-mono text-gray-900 block">{order.orderNumber}</span>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-800 border border-gray-300 mt-1 inline-block">
                {order.status}
              </span>
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div>
              <span className="text-[10px] text-gray-400 font-bold uppercase block">Item to Produce</span>
              <span className="font-bold text-gray-900 block">{order.itemName}</span>
              <span className="text-[10px] text-gray-500 font-mono">({order.itemCode})</span>
            </div>

            <div>
              <span className="text-[10px] text-gray-400 font-bold uppercase block">Planned Quantity</span>
              <span className="font-bold text-gray-900 block">{order.plannedQty} {order.plannedUom}</span>
              <span className="text-[10px] text-gray-500">({order.plannedPcs.toLocaleString()} PCS)</span>
            </div>

            <div>
              <span className="text-[10px] text-gray-400 font-bold uppercase block">Department / Location</span>
              <span className="font-bold text-gray-900 block">{order.department}</span>
              <span className="text-[10px] text-gray-500">{order.factory}</span>
            </div>

            <div>
              <span className="text-[10px] text-gray-400 font-bold uppercase block">Target Completion</span>
              <span className="font-bold text-gray-900 block">{order.requiredCompletionDate}</span>
              <span className="text-[10px] text-gray-500">Priority: {order.priority}</span>
            </div>
          </div>

          {/* BOM Component Checklist */}
          <div>
            <h3 className="text-xs font-black uppercase text-gray-900 mb-2 border-b border-gray-200 pb-1">
              Required Raw Materials / BOM Allocation
            </h3>
            <table className="w-full border-collapse border border-gray-300 text-left text-[11px]">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-300 p-2 w-8 text-center">#</th>
                  <th className="border border-gray-300 p-2">Material / Component</th>
                  <th className="border border-gray-300 p-2 text-center">Qty / Batch</th>
                  <th className="border border-gray-300 p-2 text-right">Total Required</th>
                  <th className="border border-gray-300 p-2 text-center">UOM</th>
                  <th className="border border-gray-300 p-2 text-center">Issued Status</th>
                  <th className="border border-gray-300 p-2 text-center">Operator Check</th>
                </tr>
              </thead>
              <tbody>
                {order.bomItems?.map((bom, idx) => (
                  <tr key={bom.id}>
                    <td className="border border-gray-300 p-2 text-center font-bold">{idx + 1}</td>
                    <td className="border border-gray-300 p-2 font-semibold">{bom.component}</td>
                    <td className="border border-gray-300 p-2 text-center">{bom.qtyPerBatch}</td>
                    <td className="border border-gray-300 p-2 text-right font-mono font-bold">{bom.totalRequired.toLocaleString()}</td>
                    <td className="border border-gray-300 p-2 text-center">{bom.uom}</td>
                    <td className="border border-gray-300 p-2 text-center font-semibold">{bom.issuedStatus || 'Issued'}</td>
                    <td className="border border-gray-300 p-2 text-center">[ &nbsp;&nbsp;&nbsp;&nbsp; ]</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-6 pt-12 border-t border-gray-200 text-center text-[10px] text-gray-600">
            <div>
              <div className="border-t border-gray-400 pt-1 font-bold">Production Supervisor</div>
              <div className="text-[9px] text-gray-400">Signature & Date</div>
            </div>
            <div>
              <div className="border-t border-gray-400 pt-1 font-bold">Material Store In-Charge</div>
              <div className="text-[9px] text-gray-400">Signature & Date</div>
            </div>
            <div>
              <div className="border-t border-gray-400 pt-1 font-bold">Quality Inspector (QA)</div>
              <div className="text-[9px] text-gray-400">Signature & Date</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { FileText, Eye, Coins, Edit2, Trash2 } from 'lucide-react';
import { PurchaseInvoiceV2 } from '../services/purchaseService';

interface InvoiceTableProps {
  invoices: PurchaseInvoiceV2[];
  loading: boolean;
  onViewDetails: (invoice: PurchaseInvoiceV2) => void;
  onRecordPayment: (invoice: PurchaseInvoiceV2) => void;
  onEditInvoice: (invoice: PurchaseInvoiceV2) => void;
  onDeleteInvoice: (invoice: PurchaseInvoiceV2) => void;
}

const InvoiceTable: React.FC<InvoiceTableProps> = ({ 
  invoices, 
  loading, 
  onViewDetails, 
  onRecordPayment,
  onEditInvoice,
  onDeleteInvoice
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {invoices.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase font-bold border-b border-gray-100">
                <th className="px-6 py-3">Batch No.</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Supplier</th>
                <th className="px-6 py-3">Material</th>
                <th className="px-6 py-3 text-right">Quantity</th>
                <th className="px-6 py-3 text-right">Rate/KG</th>
                <th className="px-6 py-3 text-right">Total Value</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/70 text-gray-700">
              {invoices.map((inv) => {
                const supplierName = typeof inv.vendorId === 'object' && inv.vendorId !== null
                  ? (inv.vendorId.firmName || inv.vendorId.ownerName || 'Unknown') 
                  : 'Supplier';
                
                // Get details of first item for displaying in the list
                const firstItem = inv.items?.[0];
                const materialName = firstItem && typeof firstItem.skuId === 'object' && firstItem.skuId !== null
                  ? (firstItem.skuId as any).name
                  : 'Raw Material';
                
                const rate = firstItem?.purchasePrice || 0;
                
                // Sum of quantities of all items
                const totalQty = inv.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
                const unit = firstItem && typeof firstItem.skuId === 'object' && firstItem.skuId !== null
                  ? (firstItem.skuId as any).unit
                  : 'KG';

                const statusLabel = inv.status === 'Posted' ? 'Received' : inv.status;
                const statusColor = inv.status === 'Posted' ? 'bg-green-50 text-green-700 border border-green-100' :
                                    inv.status === 'Draft' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                    'bg-red-50 text-red-700 border border-red-100';

                const hasPayments = (inv.paidAmount || 0) > 0;

                return (
                  <tr key={inv._id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => onViewDetails(inv)}>
                    <td className="px-6 py-3.5 font-bold font-mono text-blue-600">{inv.invoiceNumber}</td>
                    <td className="px-6 py-3.5 font-medium text-gray-400">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-6 py-3.5 font-semibold text-gray-800">{supplierName}</td>
                    <td className="px-6 py-3.5 font-medium text-gray-700 truncate max-w-xs">{materialName}</td>
                    <td className="px-6 py-3.5 text-right font-black text-gray-900">
                      {totalQty.toLocaleString('en-IN')} <span className="text-[9px] text-gray-400 font-bold uppercase">{unit}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-semibold text-gray-600">
                      ₹{rate.toFixed(2)}
                    </td>
                    <td className="px-6 py-3.5 text-right font-black text-gray-900">
                      ₹{(inv.subTotal || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => onViewDetails(inv)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100/50 shadow-3xs"
                          title="View Invoice Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        
                        {!hasPayments && (
                          <>
                            <button
                              onClick={() => onEditInvoice(inv)}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-amber-100/50 shadow-3xs"
                              title="Edit Invoice"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteInvoice(inv)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100/50 shadow-3xs"
                              title="Delete Invoice"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        
                        {inv.paymentStatus !== 'Paid' && (
                          <button
                            onClick={() => onRecordPayment(inv)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-100/50 shadow-3xs"
                            title="Record Payment"
                          >
                            <Coins className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-semibold">No purchase invoices registered yet</p>
          <p className="text-xs text-gray-500 mt-1">Click the "+ Add Purchase Invoice" button to procure materials.</p>
        </div>
      )}
    </div>
  );
};

export default InvoiceTable;

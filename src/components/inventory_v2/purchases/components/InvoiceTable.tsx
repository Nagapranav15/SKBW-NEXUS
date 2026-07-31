import React from 'react';
import { Eye, FileText, Trash2 } from 'lucide-react';
import { PurchaseInvoiceV2 } from '../services/purchaseService';

interface InvoiceTableProps {
  invoices: PurchaseInvoiceV2[];
  loading: boolean;
  onViewDetails: (invoice: PurchaseInvoiceV2) => void;
  onEditInvoice: (invoice: PurchaseInvoiceV2) => void;
  onDeleteInvoice: (invoice: PurchaseInvoiceV2) => void;
}

const InvoiceTable: React.FC<InvoiceTableProps> = ({ 
  invoices, 
  loading, 
  onViewDetails,
  onEditInvoice,
  onDeleteInvoice
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-100 shadow-xs">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-xs overflow-hidden">
      {invoices.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-55/70 text-gray-400 uppercase font-bold border-b border-gray-100 text-[11px] tracking-wider select-none">
                <th className="px-4 py-2.5">Batch No.</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5">Material Lots</th>
                <th className="px-4 py-2.5 text-center">Total Reels</th>
                <th className="px-4 py-2.5">Total KG</th>
                <th className="px-4 py-2.5">Total Value</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
              {invoices.map((inv) => {
                const supplierName = typeof inv.vendorId === 'object' && inv.vendorId !== null
                  ? (inv.vendorId.firmName || inv.vendorId.ownerName || 'Unknown') 
                  : 'Supplier';
                
                // Get summary of material lots
                const lotsCount = inv.items?.length || 0;
                const lotsLabel = lotsCount === 1 ? '1 Lot' : `${lotsCount} Lots`;
                
                // Calculate total reels
                const totalReels = inv.items?.reduce((sum, item) => {
                  const reelsCount = item.reels?.length || 0;
                  return sum + reelsCount;
                }, 0) || 0;

                // Sum of quantities of all items
                const totalQty = inv.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
                const unit = inv.items?.[0] && typeof inv.items[0].skuId === 'object' && inv.items[0].skuId !== null
                  ? (inv.items[0].skuId as any).unit
                  : 'KG';

                const statusColor = inv.status === 'Posted' ? 'bg-green-50 text-green-700 border-green-200' :
                                    inv.status === 'Draft' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                    'bg-red-50 text-red-700 border-red-200';

                return (
                  <tr 
                    key={inv._id} 
                    className="hover:bg-gray-50 border-b border-gray-100/60 transition-colors cursor-pointer text-gray-700" 
                    onClick={() => onViewDetails(inv)}
                  >
                    <td className="px-4 py-2.5 font-bold text-blue-600 text-[13.5px]">{inv.invoiceNumber}</td>
                    <td className="px-4 py-2.5 text-gray-500 font-semibold text-[13.5px]">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-bold text-gray-900 text-[13.5px]">{supplierName}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                        {lotsLabel}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-gray-900 text-[13.5px] text-center">{totalReels || '—'}</td>
                    <td className="px-4 py-2.5 font-bold text-gray-900 text-[13.5px]">
                      {totalQty.toLocaleString('en-IN')}{' '}
                      <span className="text-[10px] text-gray-400 font-semibold uppercase">{unit}</span>
                    </td>
                    <td className="px-4 py-2.5 font-bold text-gray-900 text-[13.5px]">
                      ₹{(inv.subTotal || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase border ${statusColor}`}>
                        {inv.status === 'Posted' ? 'Received' : inv.status === 'Draft' ? 'Draft' : 'Cancelled'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => onViewDetails(inv)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100/50 shadow-3xs"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteInvoice(inv)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100/50 shadow-3xs"
                          title="Delete Purchase Batch"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16 text-gray-450 bg-white">
          <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-semibold">No purchase batches registered yet</p>
          <p className="text-xs text-gray-500 mt-1">Click the "+ New Purchase" button to procure materials.</p>
        </div>
      )}
    </div>
  );
};

export default InvoiceTable;

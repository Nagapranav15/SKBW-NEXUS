import React from 'react';
import { ArrowRightLeft, Eye, User } from 'lucide-react';
import { LedgerEntryV2 } from '../types';

interface LedgerTableProps {
  entries: LedgerEntryV2[];
  loading: boolean;
  onViewDetails: (entry: LedgerEntryV2) => void;
}

const LedgerTable: React.FC<LedgerTableProps> = ({ entries, loading, onViewDetails }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-3xs overflow-hidden">
      {entries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase font-bold border-b border-gray-100 whitespace-nowrap">
                <th className="px-6 py-3">Date & Time</th>
                <th className="px-6 py-3">Transaction No</th>
                <th className="px-6 py-3">Transaction Type</th>
                <th className="px-6 py-3">Reference</th>
                <th className="px-6 py-3">SKU</th>
                <th className="px-6 py-3 text-center">Direction</th>
                <th className="px-6 py-3 text-right">Quantity</th>
                <th className="px-6 py-3">Location</th>
                <th className="px-6 py-3">Created By</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {entries.map((tx) => (
                <tr 
                  key={tx._id} 
                  onClick={() => onViewDetails(tx)}
                  className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-3.5 font-medium text-gray-400 whitespace-nowrap">
                    {new Date(tx.createdAt).toLocaleString('en-IN')}
                  </td>
                  <td className="px-6 py-3.5 font-bold font-mono text-gray-900 whitespace-nowrap">{tx.transactionNumber}</td>
                  <td className="px-6 py-3.5 font-semibold text-gray-800 whitespace-nowrap">{tx.transactionType}</td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <p className="font-mono font-bold text-gray-900">{tx.referenceId}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{tx.referenceType}</p>
                  </td>
                  <td className="px-6 py-3.5 max-w-xs">
                    <p className="font-bold text-gray-900 truncate" title={tx.skuId?.name || 'Unknown SKU'}>
                      {tx.skuId?.name || 'Unknown SKU'}
                    </p>
                    <p className="font-mono text-[9px] text-gray-400 mt-0.5">{tx.skuId?.skuCode || '—'}</p>
                  </td>
                  <td className="px-6 py-3.5 text-center whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wider ${
                      tx.direction === 'IN' ? 'bg-green-50 text-green-700 border border-green-150' : 'bg-red-50 text-red-700 border border-red-150'
                    }`}>
                      {tx.direction}
                    </span>
                  </td>
                  <td className={`px-6 py-3.5 text-right font-black whitespace-nowrap ${
                    tx.direction === 'IN' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {tx.direction === 'IN' ? `+${tx.quantity}` : `-${tx.quantity}`}
                    <span className="text-[10px] text-gray-400 font-medium font-mono ml-1">{tx.skuId?.unit || tx.unit}</span>
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <p className="font-semibold text-gray-700">{tx.locationId?.name || 'Unknown'}</p>
                    <p className="text-[10px] text-gray-400 uppercase font-medium">{tx.locationId?.level || '—'}</p>
                  </td>
                  <td className="px-6 py-3.5 font-medium text-gray-600 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>{tx.createdBy?.fullName || 'System'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-center whitespace-nowrap">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase ${
                      tx.status === 'Posted' ? 'bg-green-50 text-green-700' : 
                      tx.status === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onViewDetails(tx)}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100/50 shadow-3xs"
                      title="View Transaction Details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <ArrowRightLeft className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-semibold">No ledger entries found</p>
          <p className="text-xs text-gray-500 mt-1">Movement audit log transaction records will populate here automatically.</p>
        </div>
      )}
    </div>
  );
};

export default LedgerTable;

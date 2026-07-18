import React from 'react';
import { Users, Coins, AlertCircle } from 'lucide-react';

interface VendorBalanceCardProps {
  vendors: any[];
}

const VendorBalanceCard: React.FC<VendorBalanceCardProps> = ({ vendors }) => {
  const totalOutstanding = vendors.reduce((sum, v) => sum + (v.outstanding || v.outstandingBalance || 0), 0);
  const outstandingCount = vendors.filter(v => (v.outstanding || v.outstandingBalance || 0) > 0).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Total Outstanding */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-3xs flex items-center justify-between">
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Accounts Payable (Owed to Vendors)</span>
          <span className="text-2xl font-black text-red-600">
            ₹{totalOutstanding.toLocaleString('en-IN')}
          </span>
        </div>
        <div className="p-3 bg-red-50 rounded-xl text-red-600 shrink-0">
          <Coins className="w-6 h-6" />
        </div>
      </div>

      {/* Outstanding Vendors Count */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-3xs flex items-center justify-between">
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Active Accounts Payable</span>
          <span className="text-2xl font-black text-gray-900">
            {outstandingCount} <span className="text-xs font-normal text-gray-400">Vendors</span>
          </span>
        </div>
        <div className="p-3 bg-blue-50 rounded-xl text-blue-600 shrink-0">
          <Users className="w-6 h-6" />
        </div>
      </div>

      {/* Credit Limits/Warnings */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-3xs flex items-center justify-between">
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Vendor Credit Risk</span>
          <span className="text-xs text-gray-500 font-semibold block leading-relaxed">
            Automatic tracking of vendor invoices & payment ledgers integrated with V2 inventory inward.
          </span>
        </div>
        <div className="p-3 bg-amber-50 rounded-xl text-amber-650 shrink-0">
          <AlertCircle className="w-6 h-6 animate-pulse-slow" />
        </div>
      </div>
    </div>
  );
};

export default VendorBalanceCard;

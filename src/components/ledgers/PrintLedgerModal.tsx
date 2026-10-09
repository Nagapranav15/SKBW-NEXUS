import React from 'react';
import { X, Printer, Download, Building2, Phone, Mail, MapPin } from 'lucide-react';
import * as XLSX from 'xlsx';

interface LedgerTransactionItem {
  id: string;
  date: string;
  type: string;
  refNo: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
  balanceType: 'Dr' | 'Cr';
}

interface CustomerInfo {
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  region?: string;
  creditLimit?: number;
  creditDays?: number;
}

interface PrintLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: CustomerInfo;
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  openingType: 'Dr' | 'Cr';
  transactions: LedgerTransactionItem[];
  companyName?: string;
}

export const PrintLedgerModal: React.FC<PrintLedgerModalProps> = ({
  isOpen,
  onClose,
  customer,
  dateFrom,
  dateTo,
  openingBalance,
  openingType,
  transactions,
  companyName = 'SKBW Core'
}) => {
  if (!isOpen) return null;

  const totalDebit = transactions.reduce((acc, t) => acc + (t.debit || 0), 0);
  const totalCredit = transactions.reduce((acc, t) => acc + (t.credit || 0), 0);
  const lastTx = transactions[transactions.length - 1];
  const closingBalance = lastTx ? lastTx.balance : openingBalance;
  const closingType = lastTx ? lastTx.balanceType : openingType;

  const handlePrint = () => {
    window.print();
  };

  const handleExcelExport = () => {
    const exportData = transactions.map((t, idx) => ({
      'S.No': idx + 1,
      'Date': t.date,
      'Voucher Type': t.type,
      'Ref / Voucher No': t.refNo,
      'Particulars': t.particulars,
      'Debit (₹)': t.debit || 0,
      'Credit (₹)': t.credit || 0,
      'Balance (₹)': `${t.balance.toLocaleString('en-IN')} ${t.balanceType}`
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Statement_of_Account');
    XLSX.writeFile(wb, `Ledger_Statement_${customer?.name || 'Party'}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs font-sans print:p-0 print:bg-white print:static print:inset-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] overflow-y-auto print:max-h-none print:shadow-none print:border-none print:w-full">
        
        {/* Top Action Bar (Hidden when printing) */}
        <div className="sticky top-0 bg-slate-900 text-white px-6 py-3 flex items-center justify-between z-10 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Print Ledger Preview</span>
            <span className="text-xs text-slate-400">({customer?.name || 'All Customers'})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExcelExport}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Statement</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="p-8 space-y-6 text-slate-900 bg-white">
          
          {/* Header */}
          <div className="border-b border-slate-200 pb-6 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">{companyName}</h1>
              <p className="text-xs text-slate-500 font-medium">ERP Ledger & Financial Statement</p>
              <p className="text-xs text-slate-500 mt-1">Generated: {new Date().toLocaleDateString('en-IN')}</p>
            </div>
            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-slate-100 text-slate-800 rounded-lg font-bold text-xs uppercase tracking-wider mb-1">
                Statement of Account
              </span>
              <p className="text-xs text-slate-600 font-semibold">
                Period: {dateFrom || '—'} to {dateTo || '—'}
              </p>
            </div>
          </div>

          {/* Party Meta */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-4 text-xs">
            <div>
              <h3 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1">Account Holder / Customer</h3>
              <p className="text-sm font-bold text-slate-900">{customer?.name || 'General Ledger'}</p>
              {customer?.code && <p className="text-slate-500 font-medium">Code: {customer.code}</p>}
              {customer?.address && <p className="text-slate-600 mt-1">{customer.address}</p>}
              {customer?.phone && <p className="text-slate-600">Phone: {customer.phone}</p>}
            </div>

            <div className="text-right flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1">Account Summary</h3>
                <p className="text-slate-600">Opening Balance: <span className="font-bold text-slate-900">₹{openingBalance.toLocaleString('en-IN')} {openingType}</span></p>
                <p className="text-slate-600">Total Debits: <span className="font-bold text-slate-900">₹{totalDebit.toLocaleString('en-IN')}</span></p>
                <p className="text-slate-600">Total Credits: <span className="font-bold text-slate-900">₹{totalCredit.toLocaleString('en-IN')}</span></p>
              </div>
              <div className="pt-2 border-t border-slate-200">
                <span className="text-xs font-bold text-slate-700">Closing Balance: </span>
                <span className="text-sm font-black text-blue-700">₹{closingBalance.toLocaleString('en-IN')} {closingType}</span>
              </div>
            </div>
          </div>

          {/* Statement Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3 w-10">#</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Ref No</th>
                  <th className="py-2.5 px-3">Particulars</th>
                  <th className="py-2.5 px-3 text-right">Debit (₹)</th>
                  <th className="py-2.5 px-3 text-right">Credit (₹)</th>
                  <th className="py-2.5 px-3 text-right">Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {/* Opening Balance Row */}
                <tr className="bg-slate-50 font-medium italic text-slate-600">
                  <td className="py-2 px-3">—</td>
                  <td className="py-2 px-3">{dateFrom || '—'}</td>
                  <td className="py-2 px-3"><span className="font-bold text-slate-700">Opening</span></td>
                  <td className="py-2 px-3">—</td>
                  <td className="py-2 px-3">Opening Balance Brought Forward</td>
                  <td className="py-2 px-3 text-right">{openingType === 'Dr' ? openingBalance.toLocaleString('en-IN') : '—'}</td>
                  <td className="py-2 px-3 text-right">{openingType === 'Cr' ? openingBalance.toLocaleString('en-IN') : '—'}</td>
                  <td className="py-2 px-3 text-right font-bold text-slate-900">{openingBalance.toLocaleString('en-IN')} {openingType}</td>
                </tr>

                {transactions.map((t, idx) => (
                  <tr key={t.id || idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-medium whitespace-nowrap">{t.date}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-700">{t.type}</td>
                    <td className="py-2.5 px-3 font-mono text-blue-700 font-medium">{t.refNo}</td>
                    <td className="py-2.5 px-3 text-slate-800">{t.particulars}</td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-900">
                      {t.debit > 0 ? t.debit.toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-emerald-700">
                      {t.credit > 0 ? t.credit.toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                      {t.balance.toLocaleString('en-IN')} <span className="text-[10px] text-slate-500 font-semibold">{t.balanceType}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                  <td colSpan={5} className="py-3 px-3 text-right uppercase tracking-wider text-[10px]">Grand Total</td>
                  <td className="py-3 px-3 text-right text-blue-800 font-black">₹{totalDebit.toLocaleString('en-IN')}</td>
                  <td className="py-3 px-3 text-right text-emerald-800 font-black">₹{totalCredit.toLocaleString('en-IN')}</td>
                  <td className="py-3 px-3 text-right font-black text-slate-900">
                    ₹{closingBalance.toLocaleString('en-IN')} {closingType}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Footer Signatures */}
          <div className="pt-12 flex justify-between items-end text-xs text-slate-500">
            <div>
              <p className="font-semibold">Prepared By: System Admin</p>
              <p className="text-[10px] mt-0.5">Computer generated statement. No signature required.</p>
            </div>
            <div className="text-center border-t border-slate-300 pt-2 px-8">
              <p className="font-bold text-slate-700">Authorized Signatory</p>
              <p className="text-[10px] text-slate-400">{companyName}</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

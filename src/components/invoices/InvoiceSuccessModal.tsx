import React, { useState, useRef } from 'react';
import {
  X, CheckCircle2, Printer, Send, Mail, Download, Search, ZoomIn, ZoomOut,
  ChevronLeft, ChevronRight, FileText, Settings, ShieldCheck, Check
} from 'lucide-react';
import { SalesInvoice } from '../../api/invoiceApi';
import { useAuth } from '../../context/AuthContext';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

// Number to words converter for Indian Rupees
function numberToWordsINR(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'Zero Rupees Only';
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(num: number): string {
    if ((num = Math.floor(num)) === 0) return '';
    if (num < 20) return a[num];
    if (num < 100) return b[Math.floor(num / 10)] + ' ' + a[num % 10];
    if (num < 1000) return inWords(Math.floor(num / 100)) + 'Hundred ' + inWords(num % 100);
    if (num < 100000) return inWords(Math.floor(num / 1000)) + 'Thousand ' + inWords(num % 1000);
    if (num < 10000000) return inWords(Math.floor(num / 100000)) + 'Lakh ' + inWords(num % 100000);
    return inWords(Math.floor(num / 10000000)) + 'Crore ' + inWords(num % 10000000);
  }

  const rounded = Math.round(amount);
  const words = inWords(rounded).trim();
  return `Rupees ${words} Only`;
}


// Shared by the on-screen preview and the print window so they always match.
const DOC_CSS = `
  .est-doc { box-sizing: border-box; background: #fff; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; border: 1.5px solid #1e40af; padding: 6mm 7mm; display: flex; flex-direction: column; width: 100%; min-height: 1123px; margin: 0 auto; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .est-doc * { box-sizing: border-box; }
  .est-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; padding-bottom: 8px; border-bottom: 2px solid #1e40af; }
  .est-head-center { text-align: center; padding: 0 12px; }
  .est-title { font-size: 19pt; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; line-height: 1.15; color: #1e40af; }
  .est-company { font-size: 13pt; font-weight: 700; text-transform: uppercase; margin-top: 4px; color: #be123c; }
  .est-addr { font-size: 9pt; margin-top: 2px; color: #334155; }
  .est-serial { justify-self: end; font-size: 10pt; line-height: 1.7; white-space: nowrap; }
  .est-serial span.k { display: inline-block; width: 62px; font-weight: 700; color: #1e40af; }
  .est-cust { padding: 8px 10px 10px; background: #eff6ff; border-bottom: 1px solid #1e40af; margin: 0 -7mm; padding-left: 7mm; padding-right: 7mm; }
  .est-cust-name { font-size: 12.5pt; font-weight: 700; text-transform: uppercase; color: #1e3a8a; }
  .est-cust-line { font-size: 10pt; margin-top: 2px; text-transform: uppercase; }
  .est-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .est-table th, .est-table td { border: 1px solid #1e40af; padding: 0 8px; height: 26px; font-size: 10.5pt; vertical-align: middle; }
  .est-table thead th { background: #1e40af; color: #fff; text-align: center; height: 28px; font-weight: 700; }
  .est-table .c-gbl { width: 54px; } .est-table .c-qty { width: 70px; } .est-table .c-rate { width: 84px; } .est-table .c-amt { width: 100px; }
  .est-table td.num { text-align: center; }
  .est-table td.right { text-align: right; font-variant-numeric: tabular-nums; }
  .est-table td.left { text-align: left; }
  .est-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .est-table tr.charge td { color: #be123c; }
  .est-table tr.total td { font-weight: 700; background: #dbeafe !important; color: #1e3a8a; height: 30px; }
  .est-foot { margin-top: auto; padding-top: 14px; }
  .est-trans { display: flex; justify-content: space-between; align-items: flex-end; font-size: 10pt; line-height: 1.8; }
  .est-words { font-size: 10pt; margin-top: 8px; }
  .est-sigline { display: inline-block; width: 150px; border-bottom: 1px solid #0f172a; }
  .est-note { text-align: center; font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: #1e40af; color: #fff; margin: 10px -7mm -6mm; padding: 8px 0; }
`;

export interface InvoiceSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice | null;
  onEdit?: () => void;
}

export const InvoiceSuccessModal: React.FC<InvoiceSuccessModalProps> = ({
  isOpen,
  onClose,
  invoice
}) => {
  const { selectedCompany } = useAuth();
  const [zoomLevel, setZoomLevel] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Print Option Checkboxes matching screenshot
  const [printOptions, setPrintOptions] = useState({
    companyHeader: true,
    itemWiseDetails: true,
    locationDetails: true,
    transporterDetails: true,
    pageNumbers: true,
    termsConditions: true
  });

  // Send Options
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);

  if (!isOpen || !invoice) return null;

  const handlePrint = () => {
    const content = printAreaRef.current;
    if (!content) return;
    const w = window.open('', '', 'width=900,height=1200');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Invoice - ${invoice.invoiceNumber}</title>
<style>* { margin: 0; padding: 0; } body { background: #fff; } ${DOC_CSS}
.est-doc { min-height: 281mm; } @media print { @page { size: A4; margin: 8mm; } .est-doc { break-inside: avoid; } }</style>
</head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  const handleSendWhatsApp = () => {
    const phone = (invoice.customerPhone || invoice.billTo?.phone || '').replace(/\D/g, '');
    const cleanPhone = phone.length === 10 ? `91${phone}` : phone;
    const msg = `*TAX INVOICE - ${invoice.invoiceNumber}*\n` +
      `*Sri Krishna Binding Works*\n\n` +
      `Dear ${invoice.customerName},\n` +
      `Your Invoice ${invoice.invoiceNumber} for Dispatch ${invoice.dispatchNumber || 'N/A'} has been generated.\n\n` +
      `• Date: ${invoice.invoiceDate}\n` +
      `• Total Qty: ${invoice.totalQtyGbl || 0} GBL (${(invoice.totalQtyPcs || 0).toLocaleString('en-IN')} PCS)\n` +
      `• Grand Total: ₹ ${(invoice.grandTotal || 0).toLocaleString('en-IN')}\n` +
      `• Due Date: ${invoice.dueDate || 'Immediate'}\n\n` +
      `Thank you for your business!`;

    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const handleSendEmail = () => {
    const subject = encodeURIComponent(`Tax Invoice ${invoice.invoiceNumber} - Sri Krishna Binding Works`);
    const body = encodeURIComponent(
      `Dear ${invoice.customerName},\n\nPlease find details for Tax Invoice ${invoice.invoiceNumber}.\nGrand Total: ₹ ${invoice.grandTotal?.toLocaleString('en-IN')}\n\nRegards,\nSri Krishna Binding Works`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const grandTotalWords = numberToWordsINR(invoice.grandTotal || 0);

  const co = selectedCompany as any;
  const companyName = (co?.name || 'SRI KRISHNA BINDING WORKS').toUpperCase();
  const companyAddr = co?.address || '4TH CROSS ROAD, R R NAGAR, VIJAYAWADA';
  const companyEmail = (co?.email || 'SKBW.VIJAYAWADA@GMAIL.COM').toUpperCase();

  const bt = invoice.billTo;
  const custLines = [
    bt?.address,
    [bt?.city || invoice.city, bt?.state || invoice.region].filter(Boolean).join(', '),
    [bt?.pincode].filter(Boolean).join(''),
  ].filter(Boolean) as string[];
  const custPhone = invoice.customerPhone || bt?.phone || '';

  const items = invoice.items || [];
  const totalGbl = items.reduce((s, i) => s + (Number(i.invoiceQtyGbl ?? i.dispatchedGbl) || 0), 0);
  const rows = [
    ...items.map(it => {
      const pcs = Number(it.invoiceQtyPcs ?? it.dispatchedPcs) || 0;
      const amount = Number(it.amount) || 0;
      return {
        gbl: Number(it.invoiceQtyGbl ?? it.dispatchedGbl) || 0,
        name: (it.itemName || '').toUpperCase(),
        qty: pcs || '',
        rate: pcs > 0 ? amount / pcs : Number(it.rate) || 0,
        amount,
        charge: false,
      };
    }),
    ...(invoice.additionalCharges || []).map(c => ({
      gbl: totalGbl || '',
      name: (c.description || '').toUpperCase(),
      qty: '' as number | string,
      rate: totalGbl > 0 && c.type !== 'Percentage' ? (Number(c.amount) || 0) / totalGbl : 0,
      amount: Number(c.amount) || 0,
      charge: true,
    })),
  ];
  const emptyCount = Math.max(0, 12 - rows.length);

  const docJsx = (
    <div className="est-doc">
      {printOptions.companyHeader && (
        <div className="est-head">
          <div />
          <div className="est-head-center">
            <div className="est-title">{'Tax Invoice'}</div>
            <div className="est-company">{companyName}</div>
            <div className="est-addr">{companyAddr}</div>
            <div className="est-addr">E-Mail : {companyEmail}</div>
          </div>
          <div className="est-serial">
            <div><span className="k">Invoice No.</span>: {invoice.invoiceNumber}</div>
            <div><span className="k">Date</span>: {formatDateDDMMYYYY(invoice.invoiceDate)}</div>
          </div>
        </div>
      )}

      <div className="est-cust">
        <div className="est-cust-name">{invoice.customerName}</div>
        {custLines.map((l, i) => <div key={i} className="est-cust-line">{l}</div>)}
        {custPhone && <div className="est-cust-line">{custPhone}</div>}
      </div>

      {printOptions.itemWiseDetails && (
        <table className="est-table">
          <thead>
            <tr>
              <th className="c-gbl">GBL</th>
              <th>Particulars</th>
              <th className="c-qty">Qty</th>
              <th className="c-rate">Rate</th>
              <th className="c-amt">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.charge ? 'charge' : ''}>
                <td className="num">{r.gbl || ''}</td>
                <td className="left">{r.name}</td>
                <td className="num">{typeof r.qty === 'number' ? r.qty.toLocaleString('en-IN') : r.qty}</td>
                <td className="right">{r.rate ? r.rate.toFixed(2) : ''}</td>
                <td className="right">{r.amount ? r.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
              </tr>
            ))}
            {Array.from({ length: emptyCount }).map((_, i) => (
              <tr key={`e${i}`}><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
            ))}
            <tr className="total">
              <td className="num">{totalGbl || ''}</td>
              <td className="num">Thank You</td>
              <td>&nbsp;</td>
              <td className="right">Total</td>
              <td className="right">{(invoice.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="est-words"><b>Amount in words:</b> {grandTotalWords}</div>

      <div className="est-foot">
        <div className="est-trans">
          {printOptions.transporterDetails ? (
            <div>
              <div>Transport : {invoice.transporterName || ''}</div>
              <div>LR No. &nbsp;&nbsp;&nbsp;&nbsp;: {invoice.lrNumber || ''}</div>
            </div>
          ) : <div />}
          <div>Signature : <span className="est-sigline">&nbsp;</span></div>
        </div>
        {printOptions.termsConditions && <div className="est-note">Goods once sold cannot be taken back</div>}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-gray-900/40 overflow-y-auto">
      <div className="bg-white w-full max-w-6xl max-h-[calc(95*var(--vh,1vh))] flex flex-col overflow-hidden my-auto dlg-panel">
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-gray-150 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Invoice Generated Successfully!</h2>
              <p className="text-[0.875rem] text-gray-500">
                Invoice <span className="font-semibold text-gray-700">{invoice.invoiceNumber}</span> has been created and is ready.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Main Body (2 Columns Split) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-200 bg-gray-50">
          {/* Left Column: Details & Options (approx 4.5 cols) */}
          <div className="lg:col-span-4 p-5 space-y-4 overflow-y-auto bg-white">
            {/* 1. Invoice Details Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                <FileText className="w-4 h-4 text-blue-600" />
                <h3 className="text-[0.875rem] font-medium text-gray-900 uppercase tracking-wider">Invoice Details</h3>
              </div>
              <div className="space-y-2 text-[0.875rem]">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Invoice No.</span>
                  <span className="font-semibold text-blue-600 font-mono">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Dispatch No.</span>
                  <span className="font-semibold text-gray-800">{invoice.dispatchNumber || 'DSP-0003'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Invoice Date</span>
                  <span className="font-medium text-gray-800">{invoice.invoiceDate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-semibold text-gray-800 text-right truncate max-w-[11.25rem]">{invoice.customerName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Total Quantity</span>
                  <span className="font-semibold text-gray-800">
                    {invoice.totalQtyGbl || 5} GBL ({invoice.totalQtyPcs?.toLocaleString('en-IN') || '1,230'} PCS)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Total Amount</span>
                  <span className="font-semibold text-gray-900">₹ {(invoice.subtotal || invoice.grandTotal || 32500).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Payment Terms</span>
                  <span className="font-medium text-gray-800">{invoice.paymentTerms || '30 Days'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Due Date</span>
                  <span className="font-medium text-gray-800">{invoice.dueDate || '28/10/2026'}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <span className="text-gray-500">Status</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Created
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Print Options Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                <Printer className="w-4 h-4 text-blue-600" />
                <h3 className="text-[0.875rem] font-medium text-gray-900 uppercase tracking-wider">Print Options</h3>
              </div>
              <div className="space-y-2 text-[0.875rem]">
                <label className="flex items-center gap-2.5 cursor-pointer text-gray-700 hover:text-gray-900">
                  <input
                    type="checkbox"
                    checked={printOptions.companyHeader}
                    onChange={e => setPrintOptions(p => ({ ...p, companyHeader: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span>Company Header (Logo)</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-gray-700 hover:text-gray-900">
                  <input
                    type="checkbox"
                    checked={printOptions.itemWiseDetails}
                    onChange={e => setPrintOptions(p => ({ ...p, itemWiseDetails: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span>Item-wise Details</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-gray-700 hover:text-gray-900">
                  <input
                    type="checkbox"
                    checked={printOptions.locationDetails}
                    onChange={e => setPrintOptions(p => ({ ...p, locationDetails: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span>Location Details (From Warehouse)</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-gray-700 hover:text-gray-900">
                  <input
                    type="checkbox"
                    checked={printOptions.transporterDetails}
                    onChange={e => setPrintOptions(p => ({ ...p, transporterDetails: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span>Transporter Details</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-gray-700 hover:text-gray-900">
                  <input
                    type="checkbox"
                    checked={printOptions.pageNumbers}
                    onChange={e => setPrintOptions(p => ({ ...p, pageNumbers: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span>Page Numbers</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-gray-700 hover:text-gray-900">
                  <input
                    type="checkbox"
                    checked={printOptions.termsConditions}
                    onChange={e => setPrintOptions(p => ({ ...p, termsConditions: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span>Terms & Conditions</span>
                </label>
              </div>
            </div>

            {/* 3. Send Options Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                <Send className="w-4 h-4 text-emerald-600" />
                <h3 className="text-[0.875rem] font-medium text-gray-900 uppercase tracking-wider">Send Options</h3>
              </div>
              <div className="space-y-2 text-[0.875rem]">
                <label className="flex items-center gap-2.5 cursor-pointer text-gray-700 hover:text-gray-900">
                  <input
                    type="checkbox"
                    checked={sendWhatsApp}
                    onChange={e => setSendWhatsApp(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                  />
                  <span>Send via WhatsApp</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-gray-700 hover:text-gray-900">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={e => setSendEmail(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span>Send via Email</span>
                </label>
              </div>
            </div>

            {/* 4. Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                onClick={handlePrint}
                className="btn-primary w-full justify-center"
              >
                <Printer className="w-4 h-4" />
                Print Invoice (PDF)
              </button>

              <button
                onClick={handleSendWhatsApp}
                className="w-full py-2 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-[0.875rem] font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-emerald-600" />
                Send via WhatsApp
              </button>

              <button
                onClick={handleSendEmail}
                className="w-full py-2 px-4 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-[0.875rem] font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5 text-gray-500" />
                Send via Email
              </button>

              <button
                onClick={onClose}
                className="w-full py-2 text-center text-[0.875rem] font-medium text-gray-500 hover:text-gray-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>

          {/* Right Column: PDF / Invoice Preview Document (approx 8 cols) */}
          <div className="lg:col-span-8 flex flex-col h-full bg-slate-100 overflow-hidden">
            {/* Toolbar at top of preview */}
            <div className="px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between text-[0.875rem] text-gray-600 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono text-xs font-semibold">{currentPage} / 1</span>
                <button
                  disabled={currentPage >= 1}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setZoomLevel(z => Math.max(70, z - 10))}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="font-mono text-xs font-semibold">{zoomLevel}%</span>
                <button
                  onClick={() => setZoomLevel(z => Math.min(150, z + 10))}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="icon-btn"
                  title="Print"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={handlePrint}
                  className="icon-btn"
                  title="Download PDF"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Document Canvas Container */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center items-start">
              <div style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center', width: '794px', flexShrink: 0 }} className="shadow-md">
                <style>{DOC_CSS}</style>
                <div ref={printAreaRef}>{docJsx}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

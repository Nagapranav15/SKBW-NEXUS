import React, { useState, useRef } from 'react';
import {
  X, CheckCircle2, Printer, Send, Mail, Download, Search, ZoomIn, ZoomOut,
  ChevronLeft, ChevronRight, FileText, Settings, ShieldCheck, Check
} from 'lucide-react';
import { SalesInvoice } from '../../api/invoiceApi';

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
    window.print();
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-150 w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden my-auto">
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-gray-150 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Invoice Generated Successfully!</h2>
              <p className="text-xs text-gray-500">
                Invoice <span className="font-semibold text-gray-700">{invoice.invoiceNumber}</span> has been created and is ready.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
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
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Invoice Details</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Invoice No.</span>
                  <span className="font-bold text-blue-600 font-mono">{invoice.invoiceNumber}</span>
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
                  <span className="font-semibold text-gray-800 text-right truncate max-w-[180px]">{invoice.customerName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Total Quantity</span>
                  <span className="font-semibold text-gray-800">
                    {invoice.totalQtyGbl || 5} GBL ({invoice.totalQtyPcs?.toLocaleString('en-IN') || '1,230'} PCS)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Total Amount</span>
                  <span className="font-bold text-gray-900">₹ {(invoice.subtotal || invoice.grandTotal || 32500).toLocaleString('en-IN')}</span>
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
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Created
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Print Options Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                <Printer className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Print Options</h3>
              </div>
              <div className="space-y-2 text-xs">
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
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Send Options</h3>
              </div>
              <div className="space-y-2 text-xs">
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
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Print Invoice (PDF)
              </button>

              <button
                onClick={handleSendWhatsApp}
                className="w-full py-2 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-emerald-600" />
                Send via WhatsApp
              </button>

              <button
                onClick={handleSendEmail}
                className="w-full py-2 px-4 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5 text-gray-500" />
                Send via Email
              </button>

              <button
                onClick={onClose}
                className="w-full py-2 text-center text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>

          {/* Right Column: PDF / Invoice Preview Document (approx 8 cols) */}
          <div className="lg:col-span-8 flex flex-col h-full bg-slate-100 overflow-hidden">
            {/* Toolbar at top of preview */}
            <div className="px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between text-xs text-gray-600 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono text-[11px] font-semibold">{currentPage} / 1</span>
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
                <span className="font-mono text-[11px] font-semibold">{zoomLevel}%</span>
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
                  className="p-1.5 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900"
                  title="Print"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={handlePrint}
                  className="p-1.5 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900"
                  title="Download PDF"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Document Canvas Container */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center items-start">
              <div
                ref={printAreaRef}
                style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                className="bg-white text-gray-900 shadow-md border border-gray-300 w-full max-w-[760px] p-6 text-[11px] font-sans transition-transform duration-150 print:m-0 print:border-none print:shadow-none print:w-full"
              >
                {/* Header (Company Logo & Title + TAX INVOICE Box) */}
                {printOptions.companyHeader && (
                  <div className="flex items-start justify-between border-b-2 border-gray-900 pb-3 mb-3">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-rose-600 tracking-tight font-serif">SKBW</span>
                        <span className="text-xs font-extrabold text-gray-900 uppercase tracking-wide">
                          SRI KRISHNA BINDING WORKS
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-600 font-medium">Vijayawada, Andhra Pradesh, India</p>
                      <p className="text-[10px] text-rose-600 italic font-medium">Every Notebook A New Beginning.</p>
                    </div>

                    <div className="border-2 border-gray-900 px-4 py-1.5 text-center bg-gray-50 rounded">
                      <span className="text-[10px] font-extrabold text-gray-700 uppercase tracking-widest block">
                        TAX INVOICE
                      </span>
                      <span className="text-base font-black text-gray-900 font-mono block">
                        {invoice.invoiceNumber}
                      </span>
                    </div>
                  </div>
                )}

                {/* Details Section (Bill To + Dispatch Details) */}
                <div className="grid grid-cols-2 gap-4 pb-3 border-b border-gray-300 mb-3 text-[10.5px]">
                  {/* Left: Bill To */}
                  <div className="bg-slate-50/60 p-2.5 rounded border border-gray-200">
                    <span className="text-[9.5px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">
                      Bill To
                    </span>
                    <p className="font-bold text-gray-900 text-xs mb-0.5">{invoice.customerName}</p>
                    <p className="text-gray-700">{invoice.billTo?.address || 'Main Road, Nellore - 524001'}</p>
                    <p className="text-gray-700">{invoice.billTo?.state || invoice.region || 'Andhra Pradesh'}, India</p>
                    <p className="text-gray-700 font-mono mt-0.5">Phone: {invoice.customerPhone || '9988776655'}</p>
                  </div>

                  {/* Right: Dispatch Details */}
                  {printOptions.transporterDetails && (
                    <div className="bg-slate-50/60 p-2.5 rounded border border-gray-200">
                      <span className="text-[9.5px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">
                        Dispatch Details
                      </span>
                      <div className="space-y-0.5 text-gray-700">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Dispatch No</span>
                          <span className="font-bold text-gray-900 font-mono">: {invoice.dispatchNumber || 'DSP-0003'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Dispatch Date</span>
                          <span className="font-medium text-gray-900">: {invoice.dispatchDate || invoice.invoiceDate}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Transporter</span>
                          <span className="font-medium text-gray-900">: {invoice.transporterName || 'Sri Sai Transport'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">LR/RR No.</span>
                          <span className="font-mono text-gray-900">: {invoice.lrNumber || 'LR1234567'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">LR/RR Date</span>
                          <span className="font-mono text-gray-900">: {invoice.lrDate || invoice.invoiceDate}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">No. of Packages</span>
                          <span className="font-medium text-gray-900">: {invoice.numberOfPackages || 8}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Items Table */}
                {printOptions.itemWiseDetails && (
                  <div className="mb-3 border border-gray-300 rounded overflow-hidden">
                    <table className="w-full text-left text-[10px] border-collapse">
                      <thead>
                        <tr className="bg-gray-100 text-gray-800 border-b border-gray-300 font-bold uppercase text-[9px]">
                          <th className="py-1.5 px-2 text-center w-8">#</th>
                          <th className="py-1.5 px-2">Item Code</th>
                          <th className="py-1.5 px-2">Item Name</th>
                          {printOptions.locationDetails && <th className="py-1.5 px-2">From Location</th>}
                          <th className="py-1.5 px-2 text-right">Qty (GBL)</th>
                          <th className="py-1.5 px-2 text-right">Qty (PCS)</th>
                          <th className="py-1.5 px-2 text-right">Rate (₹/GBL)</th>
                          <th className="py-1.5 px-2 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {invoice.items && invoice.items.length > 0 ? (
                          invoice.items.map((it, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="py-1.5 px-2 text-center text-gray-500">{idx + 1}</td>
                              <td className="py-1.5 px-2 font-mono font-medium text-gray-900">{it.itemCode}</td>
                              <td className="py-1.5 px-2 font-medium text-gray-900">{it.itemName}</td>
                              {printOptions.locationDetails && (
                                <td className="py-1.5 px-2 text-gray-600 font-mono text-[9px]">
                                  {it.locationName || 'Factory-1 / A1'}
                                </td>
                              )}
                              <td className="py-1.5 px-2 text-right font-medium text-gray-900">
                                {it.invoiceQtyGbl || it.dispatchedGbl || 0}
                              </td>
                              <td className="py-1.5 px-2 text-right text-gray-700">
                                {(it.invoiceQtyPcs || it.dispatchedPcs || 0).toLocaleString('en-IN')}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono text-gray-900">
                                {(it.rate || 0).toLocaleString('en-IN')}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono font-bold text-gray-900">
                                {(it.amount || 0).toLocaleString('en-IN')}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="py-3 text-center text-gray-400">No items available</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Summary & Totals Block (2 columns) */}
                <div className="grid grid-cols-2 gap-4 pb-3 border-b border-gray-300 mb-3 text-[10px]">
                  {/* Left Column: Shipment metadata */}
                  <div className="space-y-1 text-gray-600">
                    <div className="flex">
                      <span className="w-24 text-gray-500">Total Packages</span>
                      <span className="font-semibold text-gray-800">: {invoice.numberOfPackages || 8}</span>
                    </div>
                    <div className="flex">
                      <span className="w-24 text-gray-500">Transporter</span>
                      <span className="font-semibold text-gray-800">: {invoice.transporterName || 'Sri Sai Transport'}</span>
                    </div>
                    <div className="flex">
                      <span className="w-24 text-gray-500">Vehicle No.</span>
                      <span className="font-mono font-semibold text-gray-800">: {invoice.vehicleNumber || 'AP 39 AB 1234'}</span>
                    </div>
                    <div className="flex">
                      <span className="w-24 text-gray-500">Freight</span>
                      <span className="font-semibold text-gray-800">: To Pay</span>
                    </div>
                    <div className="flex">
                      <span className="w-24 text-gray-500">Source Location</span>
                      <span className="font-semibold text-gray-800">: Finished Goods</span>
                    </div>
                  </div>

                  {/* Right Column: Numbers and Grand Total */}
                  <div className="space-y-1.5 bg-gray-50 p-2 rounded border border-gray-200">
                    <div className="flex justify-between text-gray-600">
                      <span>Total Quantity (GBL)</span>
                      <span className="font-bold text-gray-900">{invoice.totalQtyGbl || 5}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Total Quantity (PCS)</span>
                      <span className="font-bold text-gray-900">{(invoice.totalQtyPcs || 1230).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Total Amount</span>
                      <span className="font-mono font-bold text-gray-900">₹ {(invoice.subtotal || 32500).toLocaleString('en-IN')}</span>
                    </div>
                    {(invoice.totalAdditionalCharges > 0 || (invoice.additionalCharges && invoice.additionalCharges.length > 0)) && (
                      <div className="flex justify-between text-gray-600">
                        <span>Additional Charges</span>
                        <span className="font-mono font-bold text-gray-900">
                          ₹ {(invoice.totalAdditionalCharges || 500).toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline pt-1.5 border-t-2 border-gray-900 text-xs font-black text-gray-900">
                      <span>Grand Total (₹)</span>
                      <span className="font-mono text-sm">₹ {(invoice.grandTotal || 33000).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>

                {/* Amount In Words */}
                <div className="mb-3 pb-2 border-b border-gray-300">
                  <span className="text-[9px] font-bold uppercase text-gray-500 tracking-wider block">
                    Amount in Words:
                  </span>
                  <span className="font-bold text-gray-900 text-[10.5px]">
                    {grandTotalWords}
                  </span>
                </div>

                {/* Footer (Terms & Conditions + Signatory) */}
                <div className="grid grid-cols-2 gap-4 pt-1">
                  {printOptions.termsConditions ? (
                    <div className="text-[8.5px] text-gray-600 space-y-0.5">
                      <span className="font-bold text-gray-800 block text-[9px]">Terms & Conditions:</span>
                      <p>1. Goods once sold cannot be returned.</p>
                      <p>2. Payment to be made as per agreed terms.</p>
                      <p>3. Subject to Vijayawada jurisdiction.</p>
                    </div>
                  ) : <div />}

                  <div className="text-right flex flex-col justify-between h-16">
                    <p className="font-serif italic font-bold text-gray-800 text-[10px]">
                      For Sri Krishna Binding Works
                    </p>
                    <p className="text-[8.5px] font-semibold text-gray-500 uppercase tracking-wider">
                      Authorized Signatory
                    </p>
                  </div>
                </div>

                {printOptions.pageNumbers && (
                  <div className="mt-4 pt-2 border-t border-gray-200 text-center text-[8px] text-gray-400">
                    Page 1 of 1
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

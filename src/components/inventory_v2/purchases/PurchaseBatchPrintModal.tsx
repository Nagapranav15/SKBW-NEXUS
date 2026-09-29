import React, { useRef } from 'react';
import { X, Printer, Ban, CheckCircle, Clock, Building2, MapPin } from 'lucide-react';
import { PurchaseInvoiceV2 } from './purchaseService';
import { SkuV2, WarehouseLocationV2 } from '../../../api/mfgApiV2';

interface PurchaseBatchPrintModalProps {
  invoice: PurchaseInvoiceV2 | null;
  companyName?: string;
  skus?: SkuV2[];
  locations?: WarehouseLocationV2[];
  onClose: () => void;
}

export const PurchaseBatchPrintModal: React.FC<PurchaseBatchPrintModalProps> = ({
  invoice,
  companyName = 'SKBW ERP',
  skus = [],
  locations = [],
  onClose,
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!invoice) return null;

  const isCancelled = invoice.status === 'Cancelled';
  const isDraft = invoice.status === 'Draft';
  const isPosted = invoice.status === 'Posted';

  const vendor = typeof invoice.vendorId === 'object' && invoice.vendorId !== null ? (invoice.vendorId as any) : null;
  const vendorName = vendor?.firmName || vendor?.ownerName || (typeof invoice.vendorId === 'string' ? invoice.vendorId : 'Supplier');
  const vendorContact = vendor?.phone || vendor?.mobile || vendor?.contactPerson || '—';
  const vendorGstin = vendor?.gstNumber || vendor?.gstin || '—';
  const vendorAddress = vendor?.address || vendor?.city || '—';

  const dateStr = invoice.createdAt
    ? new Date(invoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const dueDateStr = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  // Calculate item metrics
  let totalReelsCount = 0;
  let totalReamsCount = 0;
  let totalKgWeight = 0;
  let itemsSubTotal = 0;

  const resolvedItems = (invoice.items || []).map((item, idx) => {
    const rawSku = typeof item.skuId === 'object' && item.skuId !== null ? (item.skuId as any) : null;
    const skuIdStr = rawSku?._id || (typeof item.skuId === 'string' ? item.skuId : '');
    const matchedSku = skus.find(s => s._id === skuIdStr) || rawSku;

    const skuName = matchedSku?.name || rawSku?.name || 'Raw Material';
    const skuCode = matchedSku?.skuCode || rawSku?.skuCode || `SKU-${idx + 1}`;
    const category = matchedSku?.category || rawSku?.category || 'Material';
    const paperType = matchedSku?.paperType || rawSku?.paperType || '';
    const gsm = item.gsm || matchedSku?.gsm || rawSku?.gsm || '';
    const width = item.width || matchedSku?.width || rawSku?.width || '';

    const qty = Number(item.quantity) || 0;
    const rate = Number(item.purchasePrice || item.ratePerKg || (item as any).price) || 0;
    const lineTotal = item.totalPrice || qty * rate;
    itemsSubTotal += lineTotal;

    const locIdStr = typeof item.locationId === 'object' && item.locationId !== null ? (item.locationId as any)._id : item.locationId;
    const matchedLoc = locations.find(l => l._id === locIdStr);
    const locationName = matchedLoc?.name || matchedLoc?.code || 'Main Storage';

    const reels = item.reels || [];
    const reelsCount = reels.length || Number(item.reelsCount) || 0;
    if (paperType === 'Reels' || reelsCount > 0) {
      totalReelsCount += reelsCount;
    }

    if (paperType === 'Sheets') {
      const stdSheets = matchedSku?.pages ? Number(matchedSku.pages) : 0;
      if (stdSheets > 0) {
        totalReamsCount += qty / stdSheets;
      }
    }

    if (matchedSku?.unit?.toLowerCase() === 'kg' || !matchedSku?.unit) {
      totalKgWeight += qty;
    }

    return {
      idx: idx + 1,
      lotNumber: item.lotNumber || `${invoice.invoiceNumber}-L0${idx + 1}`,
      skuName,
      skuCode,
      category,
      paperType,
      gsm,
      width,
      qty,
      unit: matchedSku?.unit || item.unit || 'KG',
      rate,
      ratePerKg: item.ratePerKg || rate,
      lineTotal,
      locationName,
      reels,
      reelsCount,
    };
  });

  const freightVal = Number(invoice.freight) || 0;
  const craneVal = Number(invoice.craneCharges) || 0;
  const otherVal = Number(invoice.otherCharges) || 0;
  const taxVal = Number(invoice.taxAmount) || 0;
  const grandTotalVal = invoice.grandTotal || (itemsSubTotal + freightVal + craneVal + otherVal + taxVal);

  const handlePrint = () => {
    const printContent = printAreaRef.current;
    if (!printContent) return;

    const printWin = window.open('', '_blank', 'width=900,height=750');
    if (!printWin) {
      window.print();
      return;
    }

    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Purchase Batch - ${invoice.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11pt; color: #111827; background: #fff; }
    .print-sheet { max-width: 800px; margin: 0 auto; padding: 20px 24px; position: relative; }
    
    /* Cancelled Watermark */
    .cancelled-watermark {
      position: absolute;
      top: 35%;
      left: 15%;
      transform: translate(-10%, -50%) rotate(-25deg);
      font-size: 64pt;
      font-weight: 900;
      color: rgba(220, 38, 38, 0.16);
      text-transform: uppercase;
      letter-spacing: 6px;
      pointer-events: none;
      border: 6px dashed rgba(220, 38, 38, 0.22);
      padding: 10px 40px;
      border-radius: 12px;
      z-index: 10;
    }

    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px; }
    .company-title { font-size: 18pt; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #0f172a; }
    .company-sub { font-size: 8.5pt; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 2px; }
    .doc-badge { text-align: right; }
    .batch-num { font-size: 14pt; font-weight: 800; font-family: monospace; color: #1d4ed8; }
    .status-pill { display: inline-block; padding: 3px 10px; font-size: 8.5pt; font-weight: 800; text-transform: uppercase; border-radius: 6px; margin-top: 4px; }
    .status-posted { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .status-cancelled { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    .status-draft { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }

    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 9.5pt; }
    .meta-box h4 { font-size: 7.5pt; text-transform: uppercase; color: #64748b; font-weight: 800; margin-bottom: 3px; letter-spacing: 0.5px; }
    .meta-box p { font-size: 9.5pt; color: #1e293b; font-weight: 600; }
    .meta-box .sub { font-size: 8.5pt; color: #475569; font-weight: normal; margin-top: 1px; }

    table.items-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 9pt; }
    table.items-table th, table.items-table td { border: 1px solid #cbd5e1; padding: 6px 8px; }
    table.items-table th { background: #f1f5f9; font-weight: 800; text-transform: uppercase; font-size: 7.5pt; color: #334155; letter-spacing: 0.3px; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-mono { font-family: monospace; }
    .font-bold { font-weight: 700; }

    .totals-wrapper { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 16px; }
    .totals-summary { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 9pt; }
    .totals-summary div { margin-bottom: 4px; display: flex; justify-content: space-between; }
    .totals-summary div span:first-child { color: #64748b; font-weight: 600; }
    .totals-summary div span:last-child { font-weight: 700; color: #1e293b; }

    .totals-financial { width: 280px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; font-size: 9pt; }
    .totals-financial tr td { padding: 4px 10px; }
    .totals-financial tr.grand-row td { background: #f1f5f9; font-weight: 800; font-size: 11pt; border-top: 1.5px solid #0f172a; color: #0f172a; }

    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; padding-top: 36px; border-top: 1px solid #e2e8f0; margin-top: 24px; text-align: center; font-size: 8.5pt; color: #475569; }
    .sig-line { border-top: 1px dashed #64748b; padding-top: 6px; font-weight: 700; }

    @media print {
      @page { size: A4; margin: 10mm; }
      body { margin: 0; }
      .print-sheet { padding: 0; }
    }
  </style>
</head>
<body>
  ${printContent.innerHTML}
</body>
</html>`);

    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
      printWin.close();
    }, 350);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-modalPop font-sans">
        {/* Modal Top Header (Hidden in actual print document) */}
        <div className="px-6 py-3.5 border-b border-gray-200 bg-gray-50/90 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-200/60">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span>Purchase Batch Print Preview</span>
                <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {invoice.invoiceNumber}
                </span>
              </h2>
              <p className="text-[10.5px] text-gray-500">
                Official Goods Inward / Purchase Batch Receipt Voucher
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-all cursor-pointer hover:shadow-md"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Slip</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              title="Close Preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Sheet Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/50">
          <div
            ref={printAreaRef}
            className="bg-white mx-auto shadow-sm border border-slate-200 rounded-xl p-6 sm:p-8 max-w-3xl relative text-xs text-slate-800"
          >
            {/* Watermark for Cancelled Batches */}
            {isCancelled && (
              <div className="cancelled-watermark">
                CANCELLED BATCH
              </div>
            )}

            {/* Document Header */}
            <div className="doc-header flex justify-between items-start border-b-2 border-slate-900 pb-3 mb-4">
              <div>
                <h1 className="company-title text-xl font-black uppercase tracking-wider text-slate-900">
                  {companyName}
                </h1>
                <p className="company-sub text-[10px] font-bold text-slate-500 tracking-wider">
                  GOODS INWARD RECEIPT SLIP &bull; PURCHASE BATCH VOUCHER
                </p>
              </div>

              <div className="doc-badge text-right">
                <div className="batch-num text-sm font-black font-mono text-blue-700">
                  {invoice.invoiceNumber}
                </div>
                <div className="mt-1">
                  <span
                    className={`status-pill inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded ${
                      isPosted
                        ? 'status-posted bg-emerald-50 text-emerald-700 border border-emerald-300'
                        : isDraft
                        ? 'status-draft bg-amber-50 text-amber-700 border border-amber-300'
                        : 'status-cancelled bg-red-50 text-red-700 border border-red-300'
                    }`}
                  >
                    {isPosted ? 'RECEIVED / POSTED' : isDraft ? 'DRAFT BATCH' : 'BATCH CANCELLED'}
                  </span>
                </div>
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="meta-grid grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-3.5 mb-4 text-[11px]">
              <div className="meta-box space-y-1">
                <h4 className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                  Supplier / Vendor Details
                </h4>
                <p className="font-bold text-slate-900 text-xs">{vendorName}</p>
                {vendorContact !== '—' && (
                  <p className="sub text-[10px] text-slate-600">Contact: {vendorContact}</p>
                )}
                {vendorGstin !== '—' && (
                  <p className="sub text-[10px] text-slate-600 font-mono">GSTIN: {vendorGstin}</p>
                )}
                {vendorAddress !== '—' && (
                  <p className="sub text-[10px] text-slate-600">{vendorAddress}</p>
                )}
              </div>

              <div className="meta-box space-y-1">
                <h4 className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                  Batch & Inward Information
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Inward Date:</span>
                    <span className="font-bold text-slate-800">{dateStr}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Due Date:</span>
                    <span className="font-bold text-slate-800">{dueDateStr}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Total Lots:</span>
                    <span className="font-bold text-slate-800">{resolvedItems.length}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Purchased Type:</span>
                    <span className="font-bold text-slate-800">{resolvedItems[0]?.category || 'Raw Material'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Material Lots Table */}
            <table className="items-table w-full border-collapse border border-slate-300 text-left text-[11px] mb-4">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="border border-slate-300 p-2 text-center w-8">#</th>
                  <th className="border border-slate-300 p-2">Material / SKU Specification</th>
                  <th className="border border-slate-300 p-2 text-center">Lot No.</th>
                  <th className="border border-slate-300 p-2 text-center">Breakdown</th>
                  <th className="border border-slate-300 p-2 text-right">Inward Qty</th>
                  <th className="border border-slate-300 p-2 text-right">Rate / Unit</th>
                  <th className="border border-slate-300 p-2 text-right">Amount (₹)</th>
                  <th className="border border-slate-300 p-2 text-center">Allocated Bin</th>
                </tr>
              </thead>
              <tbody>
                {resolvedItems.map((item) => (
                  <tr key={item.idx} className="hover:bg-slate-50">
                    <td className="border border-slate-300 p-2 text-center font-bold text-slate-500">
                      {item.idx}
                    </td>
                    <td className="border border-slate-300 p-2">
                      <div className="font-bold text-slate-900">{item.skuName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {item.skuCode}
                        {item.gsm ? ` &bull; ${item.gsm} GSM` : ''}
                        {item.width ? ` &bull; ${item.width}"` : ''}
                      </div>
                    </td>
                    <td className="border border-slate-300 p-2 text-center font-mono font-semibold text-slate-700 text-[10px]">
                      {item.lotNumber}
                    </td>
                    <td className="border border-slate-300 p-2 text-center text-[10px] text-slate-600">
                      {item.reelsCount > 0
                        ? `${item.reelsCount} Reel${item.reelsCount > 1 ? 's' : ''}`
                        : item.paperType === 'Sheets'
                        ? 'Sheets / Reams'
                        : '—'}
                    </td>
                    <td className="border border-slate-300 p-2 text-right font-mono font-bold text-slate-900">
                      {item.qty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {item.unit}
                    </td>
                    <td className="border border-slate-300 p-2 text-right font-mono text-slate-700">
                      ₹{item.rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="border border-slate-300 p-2 text-right font-mono font-bold text-slate-900">
                      ₹{item.lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="border border-slate-300 p-2 text-center text-[10px] font-medium text-slate-600">
                      {item.locationName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals & Financial Breakdown */}
            <div className="totals-wrapper flex justify-between items-start gap-4 mb-6">
              <div className="totals-summary flex-1 bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] space-y-1.5">
                <div className="flex justify-between border-b border-slate-200 pb-1 font-bold text-slate-700">
                  <span>Physical Intake Summary</span>
                </div>
                {totalReelsCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Reels Inwarded:</span>
                    <span className="font-bold text-slate-800">{totalReelsCount} Reels</span>
                  </div>
                )}
                {totalReamsCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Reams:</span>
                    <span className="font-bold text-slate-800">
                      {totalReamsCount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Reams
                    </span>
                  </div>
                )}
                {totalKgWeight > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Consolidated Weight:</span>
                    <span className="font-bold text-slate-800">
                      {totalKgWeight.toLocaleString('en-IN', { maximumFractionDigits: 2 })} KG
                    </span>
                  </div>
                )}
                {invoice.remarks && (
                  <div className="pt-1.5 border-t border-slate-200 text-[10px] text-slate-500">
                    <span className="font-bold">Remarks: </span>
                    <span>{invoice.remarks}</span>
                  </div>
                )}
              </div>

              <div className="totals-financial w-64 border border-slate-300 rounded-lg overflow-hidden text-[11px]">
                <table className="w-full border-collapse">
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="p-1.5 pl-3 text-slate-600">Subtotal:</td>
                      <td className="p-1.5 pr-3 text-right font-mono font-semibold">
                        ₹{itemsSubTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                    {freightVal > 0 && (
                      <tr className="border-b border-slate-200">
                        <td className="p-1.5 pl-3 text-slate-600">Freight Charges:</td>
                        <td className="p-1.5 pr-3 text-right font-mono">
                          ₹{freightVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                    {craneVal > 0 && (
                      <tr className="border-b border-slate-200">
                        <td className="p-1.5 pl-3 text-slate-600">Crane Charges:</td>
                        <td className="p-1.5 pr-3 text-right font-mono">
                          ₹{craneVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                    {otherVal > 0 && (
                      <tr className="border-b border-slate-200">
                        <td className="p-1.5 pl-3 text-slate-600">Other Charges:</td>
                        <td className="p-1.5 pr-3 text-right font-mono">
                          ₹{otherVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                    {taxVal > 0 && (
                      <tr className="border-b border-slate-200">
                        <td className="p-1.5 pl-3 text-slate-600">Tax / GST:</td>
                        <td className="p-1.5 pr-3 text-right font-mono">
                          ₹{taxVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                    <tr className="grand-row bg-slate-100 font-bold border-t-2 border-slate-900">
                      <td className="p-2 pl-3 text-slate-900 font-extrabold text-xs">Grand Total:</td>
                      <td className="p-2 pr-3 text-right font-mono font-black text-blue-700 text-xs">
                        ₹{grandTotalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Authorizations / Signatures */}
            <div className="signatures grid grid-cols-3 gap-6 pt-8 border-t border-slate-300 text-center text-[10px] text-slate-600 mt-6">
              <div>
                <div className="sig-line border-t border-slate-400 pt-1 font-bold">
                  Material Inward Storekeeper
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">Signature & Inward Stamp</div>
              </div>
              <div>
                <div className="sig-line border-t border-slate-400 pt-1 font-bold">
                  QA / Quality Inspector
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">Verification & Approval</div>
              </div>
              <div>
                <div className="sig-line border-t border-slate-400 pt-1 font-bold">
                  Authorized Signatory / Finance
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">Account Posting Approval</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

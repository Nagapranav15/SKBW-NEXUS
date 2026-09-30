import React, { useRef } from 'react';
import { X, Printer } from 'lucide-react';

export interface PrintVoucherColumn {
  header: string;
  key?: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  render?: (row: any, idx: number) => React.ReactNode;
}

export interface PrintVoucherMetaField {
  label: string;
  value: React.ReactNode;
}

export interface UniversalPrintVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Modal top bar title, e.g. "Purchase Batch Print Preview" */
  modalTitle?: string;
  /** Modal top bar subtitle */
  modalSubtitle?: string;
  /** Main company or department title at top of document, e.g. "PRODUCTION" or "SKBW ERP" */
  companyName?: string;
  /** Document subtitle, e.g. "GOODS INWARD RECEIPT SLIP • PURCHASE BATCH VOUCHER" */
  voucherSubtitle: string;
  /** Voucher / Document reference code, e.g. "PB-004", "PO-2026-001", "CS-004" */
  voucherNumber: string;
  /** Status badge shown top-right below document number */
  status: {
    label: string;
    variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  };
  /** If cancelled or draft, displays bold diagonal watermark */
  watermarkText?: string;

  /** Left metadata container (e.g. Supplier Details, Customer Details, Machine Source) */
  metaLeft: {
    title: string;
    primaryTitle: string;
    rows?: Array<{ label?: string; value: React.ReactNode }>;
  };

  /** Right metadata container (e.g. Batch & Inward Info, Schedule & Factory Info) */
  metaRight: {
    title: string;
    fields: PrintVoucherMetaField[];
  };

  /** Table columns configuration */
  columns: PrintVoucherColumn[];
  /** Table row items */
  data: any[];

  /** Bottom left summary card (e.g. Physical Intake Summary, Production Metrics) */
  summaryLeft?: {
    title: string;
    rows: Array<{ label: string; value: React.ReactNode }>;
    remarks?: string;
  };

  /** Bottom right financial or totals breakdown table */
  summaryRight?: {
    rows: Array<{
      label: string;
      value: React.ReactNode;
      isGrandTotal?: boolean;
    }>;
  };

  /** 3 signature/approval blocks at the bottom */
  signatures?: Array<{
    title: string;
    subtitle: string;
  }>;
}

export const UniversalPrintVoucherModal: React.FC<UniversalPrintVoucherModalProps> = ({
  isOpen,
  onClose,
  modalTitle = 'Voucher Print Preview',
  modalSubtitle = 'Official ERP Transaction Voucher / Slip',
  companyName = 'SKBW ERP',
  voucherSubtitle,
  voucherNumber,
  status,
  watermarkText,
  metaLeft,
  metaRight,
  columns,
  data = [],
  summaryLeft,
  summaryRight,
  signatures = [
    { title: 'Authorized Storekeeper', subtitle: 'Signature & Inward Stamp' },
    { title: 'QA / Quality Inspector', subtitle: 'Verification & Approval' },
    { title: 'Authorized Signatory / Finance', subtitle: 'Account Posting Approval' },
  ],
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const getStatusClasses = () => {
    switch (status.variant) {
      case 'success':
        return 'status-posted bg-emerald-50 text-emerald-700 border border-emerald-300';
      case 'danger':
        return 'status-cancelled bg-red-50 text-red-700 border border-red-300';
      case 'warning':
        return 'status-draft bg-amber-50 text-amber-700 border border-amber-300';
      case 'info':
        return 'status-info bg-blue-50 text-blue-700 border border-blue-300';
      default:
        return 'bg-slate-100 text-slate-800 border border-slate-300';
    }
  };

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
  <title>${voucherNumber} - ${modalTitle}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11pt; color: #111827; background: #fff; }
    .print-sheet { max-width: 800px; margin: 0 auto; padding: 20px 24px; position: relative; }
    
    /* Watermark */
    .cancelled-watermark {
      position: absolute;
      top: 35%;
      left: 15%;
      transform: translate(-10%, -50%) rotate(-25deg);
      font-size: 54pt;
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
    .status-info { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }

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
        {/* Modal Top Header (Hidden on actual print document) */}
        <div className="px-6 py-3.5 border-b border-gray-200 bg-gray-50/90 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-200/60 shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 truncate">
                <span>{modalTitle}</span>
                <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 shrink-0">
                  {voucherNumber}
                </span>
              </h2>
              <p className="text-[10.5px] text-gray-500 truncate">
                {modalSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handlePrint}
              type="button"
              className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-all cursor-pointer hover:shadow-md"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Slip</span>
            </button>
            <button
              onClick={onClose}
              type="button"
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
            className="print-sheet bg-white mx-auto shadow-sm border border-slate-200 rounded-xl p-6 sm:p-8 max-w-3xl relative text-xs text-slate-800"
          >
            {/* Watermark for Cancelled / Draft */}
            {watermarkText && (
              <div className="cancelled-watermark">
                {watermarkText}
              </div>
            )}

            {/* Document Header */}
            <div className="doc-header flex justify-between items-start border-b-2 border-slate-900 pb-3 mb-4">
              <div>
                <h1 className="company-title text-xl font-black uppercase tracking-wider text-slate-900">
                  {companyName}
                </h1>
                <p className="company-sub text-[10px] font-bold text-slate-500 tracking-wider">
                  {voucherSubtitle}
                </p>
              </div>

              <div className="doc-badge text-right">
                <div className="batch-num text-sm font-black font-mono text-blue-700">
                  {voucherNumber}
                </div>
                <div className="mt-1">
                  <span className={`status-pill inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded ${getStatusClasses()}`}>
                    {status.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="meta-grid grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-3.5 mb-4 text-[11px]">
              {/* Left Column */}
              <div className="meta-box space-y-1">
                <h4 className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                  {metaLeft.title}
                </h4>
                <p className="font-bold text-slate-900 text-xs">{metaLeft.primaryTitle}</p>
                {metaLeft.rows?.map((row, rIdx) => (
                  <p key={rIdx} className="sub text-[10px] text-slate-600">
                    {row.label && <span className="text-slate-400 font-medium">{row.label}: </span>}
                    <span>{row.value}</span>
                  </p>
                ))}
              </div>

              {/* Right Column */}
              <div className="meta-box space-y-1">
                <h4 className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                  {metaRight.title}
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {metaRight.fields.map((f, fIdx) => (
                    <div key={fIdx}>
                      <span className="text-[10px] text-slate-400 block font-medium">{f.label}:</span>
                      <span className="font-bold text-slate-800">{f.value || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Dynamic Items Table */}
            <table className="items-table w-full border-collapse border border-slate-300 text-left text-[11px] mb-4">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  {columns.map((col, cIdx) => (
                    <th
                      key={cIdx}
                      className={`border border-slate-300 p-2 ${
                        col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                      } ${col.width || ''}`}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="border border-slate-300 p-4 text-center text-slate-400">
                      No line items recorded on this document.
                    </td>
                  </tr>
                ) : (
                  data.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50">
                      {columns.map((col, cIdx) => (
                        <td
                          key={cIdx}
                          className={`border border-slate-300 p-2 ${
                            col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {col.render ? col.render(row, rIdx) : (col.key ? row[col.key] : null)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Totals & Summary Breakdown */}
            {(summaryLeft || summaryRight) && (
              <div className="totals-wrapper flex justify-between items-start gap-4 mb-6">
                {/* Left: Summary */}
                {summaryLeft && (
                  <div className="totals-summary flex-1 bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] space-y-1.5">
                    <div className="flex justify-between border-b border-slate-200 pb-1 font-bold text-slate-700">
                      <span>{summaryLeft.title}</span>
                    </div>
                    {summaryLeft.rows.map((row, sIdx) => (
                      <div key={sIdx} className="flex justify-between">
                        <span className="text-slate-500">{row.label}:</span>
                        <span className="font-bold text-slate-800">{row.value}</span>
                      </div>
                    ))}
                    {summaryLeft.remarks && (
                      <div className="pt-1.5 border-t border-slate-200 text-[10px] text-slate-500">
                        <span className="font-bold">Remarks: </span>
                        <span>{summaryLeft.remarks}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Right: Financial / Totals */}
                {summaryRight && (
                  <div className="totals-financial w-64 border border-slate-300 rounded-lg overflow-hidden text-[11px]">
                    <table className="w-full border-collapse">
                      <tbody>
                        {summaryRight.rows.map((row, fIdx) => (
                          <tr
                            key={fIdx}
                            className={`${
                              row.isGrandTotal
                                ? 'grand-row bg-slate-100 font-bold border-t-2 border-slate-900'
                                : 'border-b border-slate-200'
                            }`}
                          >
                            <td className={`p-1.5 pl-3 ${row.isGrandTotal ? 'text-slate-900 font-extrabold text-xs' : 'text-slate-600'}`}>
                              {row.label}:
                            </td>
                            <td className={`p-1.5 pr-3 text-right font-mono ${row.isGrandTotal ? 'font-black text-blue-700 text-xs' : 'font-semibold'}`}>
                              {row.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Authorizations / Signatures */}
            {signatures && signatures.length > 0 && (
              <div
                className={`signatures grid grid-cols-${signatures.length} gap-6 pt-8 border-t border-slate-300 text-center text-[10px] text-slate-600 mt-6`}
                style={{ gridTemplateColumns: `repeat(${signatures.length}, minmax(0, 1fr))` }}
              >
                {signatures.map((sig, sIdx) => (
                  <div key={sIdx}>
                    <div className="sig-line border-t border-slate-400 pt-1 font-bold">
                      {sig.title}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5">{sig.subtitle}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniversalPrintVoucherModal;

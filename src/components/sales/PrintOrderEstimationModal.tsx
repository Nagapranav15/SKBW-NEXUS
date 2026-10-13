import React, { useRef, useState } from 'react';
import { X, Printer, Download, Minus, Plus, ChevronLeft } from 'lucide-react';
import { SalesOrderV2 } from '../../api/salesOrderApiV2';
import { useAuth } from '../../context/AuthContext';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

interface PrintOrderEstimationModalProps {
  order: SalesOrderV2;
  onClose: () => void;
  onBack?: () => void; // back to success page if launched from there
}

// Single stylesheet used by BOTH the on-screen preview and the print window, so they always match.
const DOC_CSS = `
  .est-doc { box-sizing: border-box; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; border: 1.5px solid #000; padding: 6mm 7mm; display: flex; flex-direction: column; width: var(--doc-w, 100%); min-height: var(--doc-h, 277mm); margin: 0 auto; }
  .est-doc * { box-sizing: border-box; }
  .est-doc strong, .est-doc th, .est-doc b { font-weight: 700 !important; }
  .est-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; padding-bottom: 8px; border-bottom: 1.5px solid #000; }
  .est-head-center { text-align: center; padding: 0 12px; }
  .est-title { font-size: 19pt; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; line-height: 1.15; }
  .est-company { font-size: 13pt; font-weight: 700; text-transform: uppercase; margin-top: 4px; }
  .est-addr { font-size: 9pt; margin-top: 2px; }
  .est-serial { justify-self: end; font-size: 10pt; line-height: 1.7; white-space: nowrap; }
  .est-serial span.k { display: inline-block; width: 62px; font-weight: 700; }
  .est-cust { padding: 8px 0 10px; }
  .est-cust-name { font-size: 12.5pt; font-weight: 700; text-transform: uppercase; }
  .est-cust-line { font-size: 10pt; margin-top: 2px; text-transform: uppercase; }
  .est-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .est-table th, .est-table td { border: 1px solid #000; padding: 0 8px; height: 26px; font-size: 10.5pt; vertical-align: middle; }
  .est-table thead th { background: #f3f4f6; text-align: center; height: 28px; }
  .est-table .c-gbl { width: 54px; } .est-table .c-qty { width: 64px; } .est-table .c-rate { width: 84px; } .est-table .c-amt { width: 100px; }
  .est-table td.num { text-align: center; }
  .est-table td.right { text-align: right; font-variant-numeric: tabular-nums; }
  .est-table td.left { text-align: left; }
  .est-table tr.total td { font-weight: 700; background: #f3f4f6; height: 30px; }
  .est-comp { font-size: 8.5pt; color: #444; margin-top: 1px; padding-left: 8px; }
  .est-comp div { display: flex; justify-content: space-between; border-top: 0.5px dashed #bbb; padding: 1px 0; }
  .est-foot { margin-top: auto; padding-top: 14px; }
  .est-trans { display: flex; justify-content: space-between; align-items: flex-end; font-size: 10pt; line-height: 1.8; }
  .est-sigline { display: inline-block; width: 150px; border-bottom: 1px solid #000; }
  .est-note { text-align: center; font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-top: 1.5px solid #000; margin-top: 10px; padding-top: 8px; }
`;

const PrintOrderEstimationModal: React.FC<PrintOrderEstimationModalProps> = ({
  order,
  onClose,
  onBack,
}) => {
  const { selectedCompany } = useAuth();
  const printFrameRef = useRef<HTMLDivElement>(null);

  // ── Print options state ──
  const [paperSize, setPaperSize] = useState<'A4' | 'A5'>('A4');
  const [copies, setCopies] = useState(1);
  const [showSection, setShowSection] = useState({
    companyHeader: true,
    customerDetails: true,
    itemDetails: true,
    transportDetails: true,
    notesTerms: true,
    signature: true,
  });

  // ── Company info (dynamic) ──
  const co = selectedCompany as any;
  const companyName = (co?.name || 'SRI KRISHNA BINDING WORKS').toUpperCase();
  // Try to build a year label from the company's financial year or current year
  const now = new Date();
  const fy = now.getMonth() >= 3
    ? `${String(now.getFullYear()).slice(-2)}-${String(now.getFullYear() + 1).slice(-2)}`
    : `${String(now.getFullYear() - 1).slice(-2)}-${String(now.getFullYear()).slice(-2)}`;
  const companyLine1 = co?.address || '4TH CROSS ROAD, R R NAGAR, VIJAYAWADA';
  const companyEmail = co?.email || 'SKBW.VIJAYAWADA@GMAIL.COM';

  // ── Customer info ──
  const ba = order.billingAddress as any;
  const customerNamePrint = (order.customerName || '').toUpperCase();
  const buildCustomerAddress = () => {
    if (ba) {
      const parts: string[] = [];
      if (ba.addressLine) parts.push(ba.addressLine.toUpperCase());
      const cityState = [ba.city, ba.state].filter(Boolean).join(', ');
      if (cityState) parts.push(cityState.toUpperCase());
      if (ba.pincode) parts.push(ba.pincode);
      return parts;
    }
    const fallback: string[] = [];
    if (order.city || order.region) fallback.push([order.city, order.region].filter(Boolean).join(', ').toUpperCase());
    return fallback;
  };
  const custAddrLines = buildCustomerAddress();
  const custPhone = order.customerPhone || '';
  const custOwner = (ba?.attention || (order.customer as any)?.ownerName || '').toUpperCase();

  // ── Order date ──
  const fmtDatePrint = (d?: string) => {
    return formatDateDDMMYYYY(d);
  };

  // ── Table rows: items + charges merged ──
  const totalGbl = (order.items || []).reduce((s, i) => s + (Number(i.gbl) || 0), 0);
  const tableRows: Array<{
    gbl: number | string;
    particulars: string;
    qty: number | string;
    rate: number;
    amount: number;
    isCharge: boolean;
    isMixedBundle?: boolean;
    components?: any[];
  }> = [
    ...(order.items || []).map(item => {
      const comps = (item as any).components || [];
      const packPcs = ((item as any).isMixedBundle && comps.length > 0)
        ? comps.reduce((sum: number, c: any) => sum + (Number(c.quantity) || 0), 0)
        : 0;
      let gbl = Number(item.gbl) || 0;
      if (packPcs > 0 && gbl === packPcs && (Number(item.pcsPerGbl) === 1 || !item.pcsPerGbl)) {
        gbl = 1;
      }
      return {
        gbl: gbl || (Number(item.pcsPerGbl) > 0 ? Math.ceil((item.quantity || 0) / Number(item.pcsPerGbl)) : 0),
        particulars: (item.itemName || '').toUpperCase(),
        qty: item.quantity || 0,
        rate: item.unitPrice || 0,
        amount: item.totalAmount || 0,
        isCharge: false,
        isMixedBundle: (item as any).isMixedBundle,
        components: comps,
      };
    }),
    ...(order.otherCharges || []).map(charge => ({
      gbl: charge.chargeType === 'per_gbl' ? totalGbl : (Number(charge.quantity) || ''),
      particulars: (charge.name || '').toUpperCase(),
      qty: '',
      rate: charge.rate || 0,
      amount: charge.amount || 0,
      isCharge: true,
    })),
  ];

  // Ensure at least 10 visible rows (pad with empties)
  const MIN_ROWS = 12;
  const emptyCount = Math.max(0, MIN_ROWS - tableRows.length);

  // Grand total
  const grandTotal = order.grandTotal || tableRows.reduce((s, r) => s + r.amount, 0);

  const docJsx = (
    <div className="est-doc">
      {showSection.companyHeader && (
        <div className="est-head">
          <div />
          <div className="est-head-center">
            <div className="est-title">Order Estimation</div>
            <div className="est-company">{companyName} ({fy})</div>
            <div className="est-addr">{companyLine1}</div>
            <div className="est-addr">E-Mail : {companyEmail.toUpperCase()}</div>
          </div>
          <div className="est-serial">
            <div><span className="k">Serial No.</span>: {order.orderNumber}</div>
            <div><span className="k">Date</span>: {fmtDatePrint(order.orderDate)}</div>
          </div>
        </div>
      )}

      {showSection.customerDetails && (
        <div className="est-cust">
          <div className="est-cust-name">{customerNamePrint}</div>
          {custAddrLines.map((line, i) => (
            <div key={i} className="est-cust-line">{line}</div>
          ))}
          {(custOwner || custPhone) && (
            <div className="est-cust-line">{[custOwner, custPhone].filter(Boolean).join(' - ')}</div>
          )}
        </div>
      )}

      {showSection.itemDetails && (
        <table className="est-table doc-table">
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
            {tableRows.map((row, idx) => (
              <tr key={idx}>
                <td className="num">{row.gbl || ''}</td>
                <td className="left">
                  <div style={{ fontWeight: row.isMixedBundle ? 700 : 400 }}>{row.particulars}</div>
                  {row.components && row.components.length > 0 && (
                    <div className="est-comp">
                      {row.components.map((c: any, ci: number) => (
                        <div key={ci}>
                          <span>└ {c.name || 'Component'} ({c.quantity} {c.uom || 'pcs'} @ ₹{Number(c.rate || 0).toFixed(2)})</span>
                          <span>₹{Number(c.amount || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="num">{row.qty}</td>
                <td className="right">{row.rate ? row.rate.toFixed(2) : ''}</td>
                <td className="right">{row.amount ? row.amount.toFixed(2) : ''}</td>
              </tr>
            ))}
            {Array.from({ length: emptyCount }).map((_, i) => (
              <tr key={`empty-${i}`}>
                <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
              </tr>
            ))}
            <tr className="total">
              <td className="num">{totalGbl > 0 ? totalGbl : ''}</td>
              <td className="num">Thank You</td>
              <td>&nbsp;</td>
              <td className="right">Total</td>
              <td className="right">{grandTotal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="est-foot">
        {(showSection.transportDetails || showSection.signature) && (
          <div className="est-trans">
            {showSection.transportDetails ? (
              <div>
                <div>Transport : {order.transporter || ''}</div>
                <div>LR No. &nbsp;&nbsp;&nbsp;&nbsp;: </div>
              </div>
            ) : <div />}
            {showSection.signature && (
              <div>Signature : <span className="est-sigline">&nbsp;</span></div>
            )}
          </div>
        )}
        {showSection.notesTerms && (
          <div className="est-note">Goods once sold cannot be taken back</div>
        )}
      </div>
    </div>
  );

  // ── Print handler ──
  const handlePrint = () => {
    const content = printFrameRef.current;
    if (!content) return;

    const printWin = window.open('', '', 'width=900,height=1200');
    if (!printWin) return;

    const pageSize = paperSize === 'A5' ? 'A5' : 'A4';

    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Order Estimation - ${order.orderNumber}</title>
  <style>
    * { margin: 0; padding: 0; }
    body { background: #fff; }
    ${DOC_CSS}
    .est-doc { --doc-w: 100%; --doc-h: ${paperSize === 'A5' ? '194mm' : '281mm'}; }
    @media print { @page { size: ${pageSize}; margin: 8mm; } .est-doc { break-inside: avoid; } }
  </style>
</head>
<body>
${Array.from({ length: copies }).map(() => content.innerHTML).join('<div style="page-break-after:always"></div>')}
</body>
</html>`);

    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); printWin.close(); }, 400);
  };

  // ── Download PDF (basic) ── uses same print window but landscape-friendly
  const handleDownloadPDF = () => {
    handlePrint(); // For now, delegates to system print dialog which can save as PDF
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex"
      style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
    >
      {/* ── LEFT PANEL: Print Options ── */}
      <div
        className="w-72 bg-white h-full flex flex-col shadow-2xl overflow-y-auto shrink-0"
        style={{ borderRight: '1px solid #e5e7eb' }}
      >
        {/* Panel Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <Printer className="w-5 h-5 text-blue-600" />
            <span className="font-black text-gray-900 text-sm">Print Order Estimation</span>
          </div>
          <p className="text-[0.6875rem] text-gray-400">Generate and print the order estimation</p>
        </div>

        {/* Options Content */}
        <div className="flex-1 px-5 py-5 space-y-5">
          {/* Back button if applicable */}
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back to Order
            </button>
          )}

          {/* Paper Size */}
          <div>
            <div className="text-xs font-bold text-gray-700 mb-2">Paper Size</div>
            <div className="space-y-2">
              {(['A4', 'A5'] as const).map(size => (
                <label key={size} className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => setPaperSize(size)}
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all ${paperSize === size ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}
                  >
                    {paperSize === size && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-xs font-medium text-gray-700">
                    {size}{size === 'A4' ? ' (Recommended)' : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Number of Copies */}
          <div>
            <div className="text-xs font-bold text-gray-700 mb-2">Number of Copies</div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCopies(c => Math.max(1, c - 1))}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5 text-gray-600" />
              </button>
              <span className="text-sm font-black text-gray-900 w-6 text-center">{copies}</span>
              <button
                onClick={() => setCopies(c => Math.min(10, c + 1))}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Section Toggles */}
          <div>
            <div className="text-xs font-bold text-gray-700 mb-2">Sections to Print</div>
            <div className="space-y-2">
              {(Object.entries(showSection) as [keyof typeof showSection, boolean][]).map(([key, val]) => {
                const labels: Record<keyof typeof showSection, string> = {
                  companyHeader: 'Company Header',
                  customerDetails: 'Customer Details',
                  itemDetails: 'Item Details',
                  transportDetails: 'Transport Details',
                  notesTerms: 'Notes / Terms',
                  signature: 'Signature',
                };
                return (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => setShowSection(s => ({ ...s, [key]: !s[key] }))}
                      className={`w-4 h-4 rounded flex items-center justify-center border-2 cursor-pointer transition-all ${val ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}
                    >
                      {val && (
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs font-medium text-gray-700">{labels[key]}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Panel Footer Buttons */}
        <div className="px-5 pb-6 pt-4 border-t border-gray-100 space-y-2.5">
          <button
            onClick={handlePrint}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={handleDownloadPDF}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-sm font-bold rounded-xl transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-blue-500" />
            Download PDF
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL: Document Preview ── */}
      <div className="flex-1 overflow-y-auto bg-gray-100 flex flex-col">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
          <span className="text-sm font-black text-gray-800">Order Estimation Preview — {order.orderNumber}</span>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-700 rounded-lg transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Document */}
        <div className="flex-1 flex items-start justify-center p-8">
          {/* Hidden copy used for print HTML generation */}
          <div ref={printFrameRef} style={{ display: 'none' }}>{docJsx}</div>

          {/* Visible preview (same markup + same CSS as the print) */}
          <div
            className="shadow-xl"
            style={{ ['--doc-w' as any]: paperSize === 'A4' ? '794px' : '559px', ['--doc-h' as any]: paperSize === 'A4' ? '1123px' : '794px' }}
          >
            <style>{DOC_CSS}</style>
            {docJsx}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintOrderEstimationModal;

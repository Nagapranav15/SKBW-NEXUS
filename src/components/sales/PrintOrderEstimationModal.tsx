import React, { useRef, useState } from 'react';
import { X, Printer, Download, Minus, Plus, ChevronLeft } from 'lucide-react';
import { SalesOrderV2 } from '../../api/salesOrderApiV2';
import { useAuth } from '../../context/AuthContext';

interface PrintOrderEstimationModalProps {
  order: SalesOrderV2;
  onClose: () => void;
  onBack?: () => void; // back to success page if launched from there
}

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
    if (!d) return '';
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
    } catch { return d; }
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
  }> = [
    ...(order.items || []).map(item => ({
      gbl: Number(item.gbl) || 0,
      particulars: (item.itemName || '').toUpperCase(),
      qty: item.quantity || 0,
      rate: item.unitPrice || 0,
      amount: item.totalAmount || 0,
      isCharge: false,
    })),
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
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11pt; background: #fff; }
    .doc { border: 2px solid #000; padding: 14px 16px; max-width: 680px; margin: 10px auto; }
    .header { text-align: center; border-bottom: 1.5px solid #000; padding-bottom: 8px; margin-bottom: 6px; }
    .header-title { font-size: 20pt; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
    .header-company { font-size: 13pt; font-weight: 700; text-transform: uppercase; margin-top: 2px; }
    .header-addr { font-size: 9pt; margin-top: 2px; }
    .serial-block { float: right; text-align: left; font-size: 10pt; }
    .serial-block div { margin-bottom: 2px; }
    .customer-block { border-bottom: 1.5px solid #000; padding: 6px 0; margin-bottom: 0; clear: both; }
    .customer-block .cust-name { font-size: 12pt; font-weight: 700; text-transform: uppercase; }
    .customer-block .cust-line { font-size: 10pt; margin-top: 2px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1.5px solid #000; padding: 4px 6px; font-size: 10pt; }
    thead th { font-weight: 700; text-align: center; background: #fff; }
    .col-gbl { width: 48px; text-align: center; }
    .col-qty { width: 56px; text-align: center; }
    .col-rate { width: 70px; text-align: right; }
    .col-amt { width: 90px; text-align: right; }
    .col-particulars { text-align: left; }
    td.num { text-align: center; }
    td.right { text-align: right; }
    .footer-row td { font-weight: 700; font-size: 11pt; }
    .transport-sig { display: flex; justify-content: space-between; align-items: flex-end; padding: 8px 0 4px; font-size: 10pt; }
    .sig-line { border-bottom: 1.5px solid #000; width: 160px; display: inline-block; }
    .final-note { text-align: center; font-size: 10pt; font-weight: 700; padding-top: 8px; border-top: 1.5px solid #000; margin-top: 4px; text-transform: uppercase; }
    @media print { @page { size: ${pageSize}; margin: 8mm; } body { margin: 0; } }
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
          <p className="text-[11px] text-gray-400">Generate and print the order estimation</p>
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
          {/* Hidden div used for print HTML generation */}
          <div ref={printFrameRef} style={{ display: 'none' }}>
            <div className="doc">
              {showSection.companyHeader && (
                <div className="header">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div className="header-title">ORDER ESTIMATION</div>
                      <div className="header-company">{companyName} ({fy})</div>
                      <div className="header-addr">{companyLine1}</div>
                      <div className="header-addr">E-Mail : {companyEmail.toUpperCase()}</div>
                    </div>
                    <div className="serial-block">
                      <div><strong>Serial No.</strong> : {order.orderNumber}</div>
                      <div><strong>Date</strong>       : {fmtDatePrint(order.orderDate)}</div>
                    </div>
                  </div>
                </div>
              )}

              {showSection.customerDetails && (
                <div className="customer-block">
                  <div className="cust-name">{customerNamePrint}</div>
                  {custAddrLines.map((line, i) => (
                    <div key={i} className="cust-line">{line}</div>
                  ))}
                  {(custOwner || custPhone) && (
                    <div className="cust-line">
                      {[custOwner, custPhone].filter(Boolean).join(' - ')}
                    </div>
                  )}
                </div>
              )}

              {showSection.itemDetails && (
                <table>
                  <thead>
                    <tr>
                      <th className="col-gbl">GBL</th>
                      <th className="col-particulars">Particulars</th>
                      <th className="col-qty">Qty</th>
                      <th className="col-rate">Rate</th>
                      <th className="col-amt">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="num">{row.gbl || ''}</td>
                        <td>{row.particulars}</td>
                        <td className="num">{row.qty}</td>
                        <td className="right">{row.rate ? row.rate.toFixed(2) : ''}</td>
                        <td className="right">{row.amount ? row.amount.toFixed(2) : ''}</td>
                      </tr>
                    ))}
                    {/* Empty filler rows */}
                    {Array.from({ length: emptyCount }).map((_, i) => (
                      <tr key={`empty-${i}`}>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                      </tr>
                    ))}
                    {/* Total footer row */}
                    <tr className="footer-row">
                      <td className="num">{totalGbl > 0 ? totalGbl : ''}</td>
                      <td style={{ textAlign: 'center' }}>Thank You</td>
                      <td>&nbsp;</td>
                      <td className="right"><strong>Total</strong></td>
                      <td className="right"><strong>{grandTotal.toFixed(2)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              )}

              {(showSection.transportDetails || showSection.signature) && (
                <div className="transport-sig">
                  {showSection.transportDetails ? (
                    <div>
                      <div>Transport : {order.transporter || ''}</div>
                      <div>LR NO &nbsp;&nbsp; : </div>
                    </div>
                  ) : <div />}
                  {showSection.signature && (
                    <div style={{ textAlign: 'right' }}>
                      Signature : <span className="sig-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                    </div>
                  )}
                </div>
              )}

              {showSection.notesTerms && (
                <div className="final-note">GOODS ONCE SOLD CANNOT BE TAKEN BACK</div>
              )}
            </div>
          </div>

          {/* Visible preview (mirrors the print template) */}
          <div
            className="bg-white shadow-xl"
            style={{
              width: paperSize === 'A4' ? 680 : 520,
              border: '2px solid #000',
              padding: '14px 16px',
              fontFamily: 'Arial, sans-serif',
              fontSize: 11,
              color: '#000',
            }}
          >
            {/* Company Header */}
            {showSection.companyHeader && (
              <div style={{ borderBottom: '1.5px solid #000', paddingBottom: 8, marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase' }}>ORDER ESTIMATION</div>
                    <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>{companyName} ({fy})</div>
                    <div style={{ fontSize: 9, marginTop: 2 }}>{companyLine1}</div>
                    <div style={{ fontSize: 9 }}>E-Mail : {companyEmail.toUpperCase()}</div>
                  </div>
                  <div style={{ textAlign: 'left', fontSize: 10, minWidth: 140 }}>
                    <div><strong>Serial No.</strong> : {order.orderNumber}</div>
                    <div style={{ marginTop: 2 }}><strong>Date</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; : {fmtDatePrint(order.orderDate)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Customer block */}
            {showSection.customerDetails && (
              <div style={{ borderBottom: '1.5px solid #000', paddingBottom: 6, marginBottom: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{customerNamePrint}</div>
                {custAddrLines.map((line, i) => (
                  <div key={i} style={{ fontSize: 10, marginTop: 2, textTransform: 'uppercase' }}>{line}</div>
                ))}
                {(custOwner || custPhone) && (
                  <div style={{ fontSize: 10, marginTop: 2, textTransform: 'uppercase' }}>
                    {[custOwner, custPhone].filter(Boolean).join(' - ')}
                  </div>
                )}
              </div>
            )}

            {/* Items Table */}
            {showSection.itemDetails && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['GBL', 'Particulars', 'Qty', 'Rate', 'Amount'].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          border: '1.5px solid #000',
                          padding: '4px 6px',
                          fontSize: 11,
                          fontWeight: 700,
                          textAlign: i === 1 ? 'left' : 'center',
                          width: i === 0 ? 48 : i === 2 ? 56 : i === 3 ? 70 : i === 4 ? 90 : undefined,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, idx) => (
                    <tr key={idx}>
                      <td style={{ border: '1.5px solid #000', padding: '4px 6px', textAlign: 'center', fontSize: 11 }}>
                        {row.gbl || ''}
                      </td>
                      <td style={{ border: '1.5px solid #000', padding: '4px 6px', fontSize: 11 }}>
                        {row.particulars}
                      </td>
                      <td style={{ border: '1.5px solid #000', padding: '4px 6px', textAlign: 'center', fontSize: 11 }}>
                        {row.qty}
                      </td>
                      <td style={{ border: '1.5px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: 11 }}>
                        {row.rate ? row.rate.toFixed(2) : ''}
                      </td>
                      <td style={{ border: '1.5px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: 11 }}>
                        {row.amount ? row.amount.toFixed(2) : ''}
                      </td>
                    </tr>
                  ))}
                  {/* Empty rows */}
                  {Array.from({ length: emptyCount }).map((_, i) => (
                    <tr key={`empty-${i}`} style={{ height: 24 }}>
                      {[0, 1, 2, 3, 4].map(c => (
                        <td key={c} style={{ border: '1.5px solid #000', padding: '4px 6px' }}>&nbsp;</td>
                      ))}
                    </tr>
                  ))}
                  {/* Total Row */}
                  <tr>
                    <td style={{ border: '1.5px solid #000', padding: '4px 6px', textAlign: 'center', fontWeight: 700, fontSize: 11 }}>
                      {totalGbl > 0 ? totalGbl : ''}
                    </td>
                    <td style={{ border: '1.5px solid #000', padding: '4px 6px', textAlign: 'center', fontWeight: 700, fontSize: 11 }}>
                      Thank You
                    </td>
                    <td style={{ border: '1.5px solid #000', padding: '4px 6px' }}>&nbsp;</td>
                    <td style={{ border: '1.5px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 700, fontSize: 11 }}>
                      Total
                    </td>
                    <td style={{ border: '1.5px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 700, fontSize: 11 }}>
                      {grandTotal.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* Transport + Signature row */}
            {(showSection.transportDetails || showSection.signature) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '8px 0 4px', fontSize: 10 }}>
                {showSection.transportDetails ? (
                  <div>
                    <div>Transport : {order.transporter || ''}</div>
                    <div style={{ marginTop: 2 }}>LR NO &nbsp;&nbsp; : </div>
                  </div>
                ) : <div />}
                {showSection.signature && (
                  <div style={{ textAlign: 'right' }}>
                    Signature :{' '}
                    <span style={{ borderBottom: '1.5px solid #000', display: 'inline-block', width: 140 }}>&nbsp;</span>
                  </div>
                )}
              </div>
            )}

            {/* Footer note */}
            {showSection.notesTerms && (
              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 10, paddingTop: 8, borderTop: '1.5px solid #000', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                GOODS ONCE SOLD CANNOT BE TAKEN BACK
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintOrderEstimationModal;

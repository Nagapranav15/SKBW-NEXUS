import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * One shared PDF template for every list/report print in the app
 * (same look as the Sales Orders PDF report): blue banner with
 * "COMPANY — TITLE", grey meta line, light-grey table header, zebra rows,
 * and a "Page x of y" footer.
 */
export interface ListPdfOptions {
  companyName?: string;
  /** e.g. "SALES ORDERS REPORT" */
  title: string;
  /** Extra items shown after "Generated: <date>", e.g. ["Orders: 12", "Total Value: Rs. 1,000"] */
  meta?: string[];
  head: string[];
  body: (string | number)[][];
  /** Optional footer row (e.g. totals), same length as head */
  foot?: (string | number)[];
  orientation?: 'landscape' | 'portrait';
  /** File name without extension */
  fileName: string;
  /** Right-align these 0-based column indexes (numbers/amounts) */
  rightAlignColumns?: number[];
}

export const generateListPdf = (opts: ListPdfOptions): void => {
  const {
    companyName = 'SKBW ERP',
    title,
    meta = [],
    head,
    body,
    foot,
    orientation = 'landscape',
    fileName,
    rightAlignColumns = [],
  } = opts;

  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Banner
  doc.setFillColor(0, 89, 207);
  doc.rect(0, 0, pageWidth, 20, 'F');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(`${companyName.toUpperCase()} — ${title.toUpperCase()}`, 14, 13);

  // Meta line
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text([`Generated: ${new Date().toLocaleDateString('en-IN')}`, ...meta].join('  |  '), 14, 27);

  const columnStyles: Record<number, { halign: 'right' }> = {};
  rightAlignColumns.forEach(i => { columnStyles[i] = { halign: 'right' }; });

  autoTable(doc, {
    head: [head],
    body,
    foot: foot ? [foot] : undefined,
    startY: 32,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    margin: { left: 14, right: 14, bottom: 14 },
  });

  // Footer on every page
  const pages = doc.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.text(`Page ${p} of ${pages}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
    doc.text(companyName, 14, pageHeight - 7);
  }

  doc.save(`${fileName}.pdf`);
};

/** Convenience: print an array of flat objects (same rows used for the Excel export) with the shared template. */
export const generateObjectListPdf = (opts: {
  companyName?: string;
  title: string;
  rows: Record<string, any>[];
  meta?: string[];
  fileName: string;
  orientation?: 'landscape' | 'portrait';
}): void => {
  const { rows, ...rest } = opts;
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const fmt = (v: any) =>
    typeof v === 'number'
      ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 })
      : v === null || v === undefined || v === ''
      ? '—'
      : String(v);
  generateListPdf({
    ...rest,
    meta: [`Records: ${rows.length}`, ...(opts.meta || [])],
    head: ['#', ...keys],
    body: rows.map((r, i) => [i + 1, ...keys.map(k => fmt(r[k]))]),
    rightAlignColumns: keys.map((k, i) => (typeof rows[0][k] === 'number' ? i + 1 : -1)).filter(i => i > 0),
  });
};

/**
 * Standard Delivery Challan (DC) Receipt Print Utility & Template
 * Dynamically styled to match the official SKBW Delivery Challan format
 */

export interface DcPrintItem {
  itemName: string;
  skuCode?: string;
  deliveredQty?: number;
  quantity?: number;
  gbl?: number;
  deliveredGbl?: number;
  pcs?: number;
  pcsPerGbl?: number;
  uom?: string;
  description?: string;
  remarks?: string;
  notes?: string;
  coverPacking?: string;
}

export interface DcPrintData {
  dcNumber?: string;
  orderNumber?: string;
  date?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  city?: string;
  pincode?: string;
  transporterName?: string;
  items?: DcPrintItem[];
  [key: string]: any;
}

export interface CompanyData {
  name?: string;
  address?: string;
  phone?: string;
  mobile?: string;
  contact?: string;
  email?: string;
  gst?: string;
  [key: string]: any;
}

/**
 * Format date to standard DD-MM-YYYY format matching the DC template
 */
export const formatDcDate = (d?: string | Date | null): string => {
  if (!d) return '';
  const dStr = String(d).trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(dStr)) return dStr;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dStr)) return dStr.replace(/\//g, '-');
  const isoMatch = dStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[3].padStart(2, '0')}-${isoMatch[2].padStart(2, '0')}-${isoMatch[1]}`;
  }
  try {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) {
      const day = String(dt.getDate()).padStart(2, '0');
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const year = dt.getFullYear();
      return `${day}-${month}-${year}`;
    }
  } catch {}
  return dStr;
};

/**
 * Generates the clean HTML string for Delivery Challan printing
 */
export const generateDeliveryChallanHtml = (
  challan: DcPrintData,
  company?: CompanyData,
  customer?: any
): string => {
  // 1. Dynamic Company Details
  const companyName = (company?.name || 'SRI KRISHNA BINDING WORKS').toUpperCase();
  const companyAddress = (company?.address || '4TH CROSS ROAD , R R NAGAR , VIJAYAWADA - 520001').toUpperCase();
  const companyPhone = company?.phone || company?.mobile || company?.contact || '9848047649';

  // 2. Dynamic Consignee Details
  const custName = (customer?.firmName || challan.customerName || 'CUSTOMER').toUpperCase();
  
  // Consignee address line 1
  const addr1 = (
    customer?.address1 ||
    customer?.area ||
    customer?.address ||
    challan.customerAddress ||
    challan.shippingAddress?.address ||
    ''
  ).toUpperCase();

  // Consignee city & pincode line
  const city = customer?.city || challan.city || challan.shippingAddress?.city || '';
  const pincode = customer?.pincode || challan.pincode || challan.shippingAddress?.pincode || '';
  const cityPinLine = [city, pincode].filter(Boolean).join(' - ').toUpperCase();

  // Consignee Phone
  const custPhone = customer?.phone || customer?.mobile || customer?.whatsapp || challan.customerPhone || challan.phone || '';

  // 3. DC Metadata
  const dcNumber = challan.dcNumber ? String(challan.dcNumber).replace(/^DO-0*/, '') || challan.dcNumber : '—';
  const orderNumber = challan.orderNumber ? String(challan.orderNumber).replace(/^SO-0*/, '') || challan.orderNumber : '—';
  const dcDate = formatDcDate(challan.date || challan.createdAt || new Date());

  // 4. Transporter
  const transporter = (
    challan.transporterName ||
    challan.transporter ||
    customer?.preferredTransport ||
    challan.transport ||
    '—'
  ).toUpperCase().replace(/\s+/g, '');

  // 5. Items & Totals Calculation
  const items = Array.isArray(challan.items) ? challan.items : [];
  let totalGblSum = 0;

  const itemRowsHtml = items.map((it, idx) => {
    const itemName = (it.itemName || it.skuCode || 'ITEM').toUpperCase();
    
    // Sub-item details (e.g. COVER PACKING or remarks)
    const subText = (it.coverPacking || it.description || it.remarks || it.notes || '').toUpperCase();

    // Calculate GBL quantity
    let qtyGbl = 0;
    if (it.gbl !== undefined && it.gbl !== null) {
      qtyGbl = Number(it.gbl) || 0;
    } else if (it.deliveredGbl !== undefined && it.deliveredGbl !== null) {
      qtyGbl = Number(it.deliveredGbl) || 0;
    } else if (String(it.uom || '').toUpperCase() === 'GBL') {
      qtyGbl = Number(it.deliveredQty ?? it.quantity ?? 0);
    } else if (it.pcsPerGbl && Number(it.pcsPerGbl) > 0) {
      qtyGbl = Math.ceil(Number(it.deliveredQty ?? it.quantity ?? 0) / Number(it.pcsPerGbl));
    } else {
      qtyGbl = Number(it.deliveredQty ?? it.quantity ?? 0);
    }

    totalGblSum += qtyGbl;

    return `
      <tr>
        <td class="col-sno">${idx + 1}</td>
        <td class="col-itemname">
          <div class="item-primary">${itemName}</div>
          ${subText ? `<div class="item-secondary">${subText}</div>` : ''}
        </td>
        <td class="col-qty">${qtyGbl}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Delivery Challan - ${dcNumber}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 12mm 8mm 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      padding: 12px 14px;
      font-size: 12px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .dc-container {
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
    }

    /* ── 1. Header ── */
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 6px;
    }
    .company-info {
      flex: 1;
    }
    .company-name {
      font-size: 20px;
      font-weight: 900;
      color: #0b2545;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      line-height: 1.2;
    }
    .company-address {
      font-size: 11px;
      font-weight: 700;
      color: #1e293b;
      margin-top: 3px;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    .company-contact {
      font-size: 11.5px;
      font-weight: 600;
      color: #334155;
      margin-top: 2px;
    }

    .dc-badge-wrap {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .dc-badge-box {
      width: 72px;
      height: 48px;
      background-color: #e0f2fe;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 30px;
      font-weight: 900;
      color: #0b2545;
      letter-spacing: 1px;
    }
    .page-number {
      font-size: 10px;
      color: #64748b;
      margin-top: 4px;
      text-align: right;
    }

    /* ── 2. Banner Title ── */
    .title-banner {
      width: 100%;
      background-color: #e8f1fc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      text-align: center;
      padding: 6px 0;
      margin: 6px 0 10px 0;
    }
    .title-banner h2 {
      font-size: 19px;
      font-weight: 800;
      color: #0b2545;
      letter-spacing: 0.3px;
      margin: 0;
    }

    /* ── 3. Consignee & Challan Meta ── */
    .info-card {
      display: flex;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      margin-bottom: 10px;
      background: #ffffff;
    }
    .consignee-box {
      flex: 1.6;
      padding: 8px 14px;
      border-right: 1px solid #cbd5e1;
    }
    .consignee-label {
      font-size: 10.5px;
      color: #475569;
      margin-bottom: 2px;
    }
    .consignee-name {
      font-size: 12.5px;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
      line-height: 1.3;
    }
    .consignee-line {
      font-size: 11px;
      color: #1e293b;
      font-weight: 600;
      text-transform: uppercase;
      margin-top: 1px;
    }
    .consignee-phone {
      font-size: 11px;
      color: #1e293b;
      font-weight: 600;
      margin-top: 2px;
    }

    .meta-box {
      flex: 1;
      padding: 8px 14px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 5px;
    }
    .meta-row {
      display: flex;
      font-size: 12px;
    }
    .meta-key {
      width: 80px;
      font-weight: 600;
      color: #1e293b;
    }
    .meta-colon {
      width: 14px;
      text-align: center;
      font-weight: 600;
      color: #1e293b;
    }
    .meta-val {
      font-weight: 700;
      color: #0f172a;
      flex: 1;
    }

    /* ── 4. Items Table ── */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #cbd5e1;
      margin-bottom: 10px;
    }
    .items-table th {
      background-color: #e8f1fc;
      border: 1px solid #cbd5e1;
      color: #0b2545;
      font-size: 12px;
      font-weight: 800;
      padding: 6px 8px;
      text-align: center;
    }
    .items-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 8px;
      font-size: 11.5px;
      vertical-align: middle;
    }
    .col-sno {
      width: 7%;
      text-align: center;
      font-weight: 700;
      color: #1e293b;
    }
    .col-itemname {
      width: 78%;
      text-align: left;
      padding-left: 12px !important;
    }
    .item-primary {
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
    }
    .item-secondary {
      font-size: 9.5px;
      font-weight: 700;
      color: #475569;
      margin-top: 1px;
      text-transform: uppercase;
      padding-left: 2px;
    }
    .col-qty {
      width: 15%;
      text-align: center;
      font-weight: 800;
      font-size: 12px;
      color: #0f172a;
    }

    /* ── 5. Bottom Total Bar ── */
    .bottom-bar {
      width: 100%;
      background-color: #e8f1fc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 18px;
      font-size: 12.5px;
    }
    .transporter-text {
      font-weight: 800;
      color: #0b2545;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    .total-wrap {
      display: flex;
      align-items: center;
      gap: 32px;
    }
    .total-label {
      font-weight: 800;
      color: #0b2545;
      letter-spacing: 0.5px;
    }
    .total-value {
      font-weight: 800;
      color: #0b2545;
      font-size: 13px;
      min-width: 60px;
      text-align: right;
    }
  </style>
</head>
<body>
  <div class="dc-container">
    <!-- Header -->
    <div class="header-row">
      <div class="company-info">
        <div class="company-name">${companyName}</div>
        <div class="company-address">${companyAddress}</div>
        <div class="company-contact">Contact : ${companyPhone}</div>
      </div>
      <div class="dc-badge-wrap">
        <div class="dc-badge-box">DC</div>
        <div class="page-number">Page 1 of 1</div>
      </div>
    </div>

    <!-- Title Banner -->
    <div class="title-banner">
      <h2>Delivery Challan</h2>
    </div>

    <!-- Consignee & Metadata Box -->
    <div class="info-card">
      <div class="consignee-box">
        <div class="consignee-label">Consignee / Deliver To</div>
        <div class="consignee-name">${custName}</div>
        ${addr1 ? `<div class="consignee-line">${addr1}</div>` : ''}
        ${cityPinLine ? `<div class="consignee-line">${cityPinLine}</div>` : ''}
        ${custPhone ? `<div class="consignee-phone">Phone : ${custPhone}</div>` : ''}
      </div>
      <div class="meta-box">
        <div class="meta-row">
          <span class="meta-key">DC No.</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${dcNumber}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Date</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${dcDate}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Order No.</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${orderNumber}</span>
        </div>
      </div>
    </div>

    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 7%;">S.No.</th>
          <th style="width: 78%;">Item Name</th>
          <th style="width: 15%;">Qty (GBL)</th>
        </tr>
      </thead>
      <tbody>
        ${itemRowsHtml || `
          <tr>
            <td colspan="3" style="text-align:center; padding: 12px; color: #94a3b8;">No items listed</td>
          </tr>
        `}
      </tbody>
    </table>

    <!-- Footer Bar -->
    <div class="bottom-bar">
      <div class="transporter-text">
        Transporter : &nbsp;${transporter}
      </div>
      <div class="total-wrap">
        <span class="total-label">TOTAL</span>
        <span class="total-value">${totalGblSum} GBL</span>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

/**
 * Triggers printing of the Delivery Challan in a clean print window
 */
export const printDeliveryChallan = (
  challan: DcPrintData,
  company?: CompanyData,
  customer?: any
): void => {
  if (!challan) return;

  const html = generateDeliveryChallanHtml(challan, company, customer);
  const printWin = window.open('', '', 'width=900,height=1200');
  if (!printWin) {
    alert('Pop-up blocked. Please allow pop-ups to print the delivery challan.');
    return;
  }

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  printWin.focus();

  // Print automatically after styles & fonts settle
  setTimeout(() => {
    printWin.print();
    printWin.close();
  }, 400);
};

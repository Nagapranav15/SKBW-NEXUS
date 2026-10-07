import React, { useRef } from 'react';
import { X, Printer, Ban, CheckCircle, Clock, Building2, MapPin } from 'lucide-react';
import { PurchaseInvoiceV2 } from './purchaseService';
import { SkuV2, WarehouseLocationV2 } from '../../../api/mfgApiV2';
import UniversalPrintVoucherModal from '../../ui/UniversalPrintVoucherModal';
import { getItemMetrics } from './PurchaseInvoicePage';

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

    const m = getItemMetrics(item, skus);
    if (m.isReels) totalReelsCount += m.reelsCount;
    if (m.isSheets) {
      totalReamsCount += m.reams;
      totalKgWeight += m.kgWeight;
    } else if (m.isReels || matchedSku?.unit?.toLowerCase() === 'kg' || !matchedSku?.unit) {
      totalKgWeight += m.kgWeight;
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

  const columns = [
    { header: '#', key: 'idx', align: 'center' as const, width: 'w-8' },
    {
      header: 'Material / SKU Specification',
      render: (item: any) => (
        <div>
          <div className="font-bold text-slate-900">{item.skuName}</div>
          <div className="text-[10px] text-slate-500 font-mono">
            {item.skuCode}
            {item.gsm ? ` • ${item.gsm} GSM` : ''}
            {item.width ? ` • ${item.width}"` : ''}
          </div>
        </div>
      ),
    },
    { header: 'Lot No.', key: 'lotNumber', align: 'center' as const },
    {
      header: 'Breakdown',
      align: 'center' as const,
      render: (item: any) => (
        <span className="text-[10px] text-slate-600">
          {item.reelsCount > 0
            ? `${item.reelsCount} Reel${item.reelsCount > 1 ? 's' : ''}`
            : item.paperType === 'Sheets'
            ? 'Sheets / Reams'
            : '—'}
        </span>
      ),
    },
    {
      header: 'Inward Qty',
      align: 'right' as const,
      render: (item: any) => (
        <span className="font-mono font-bold text-slate-900">
          {item.qty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {item.unit}
        </span>
      ),
    },
    {
      header: 'Rate / Unit',
      align: 'right' as const,
      render: (item: any) => (
        <span className="font-mono text-slate-700">
          ₹{item.rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      header: 'Amount (₹)',
      align: 'right' as const,
      render: (item: any) => (
        <span className="font-mono font-bold text-slate-900">
          ₹{item.lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    { header: 'Allocated Bin', key: 'locationName', align: 'center' as const },
  ];

  const financialRows = [
    {
      label: 'Subtotal',
      value: `₹${itemsSubTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    ...(freightVal > 0 ? [{ label: 'Freight Charges', value: `₹${freightVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` }] : []),
    ...(craneVal > 0 ? [{ label: 'Crane Charges', value: `₹${craneVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` }] : []),
    ...(otherVal > 0 ? [{ label: 'Other Charges', value: `₹${otherVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` }] : []),
    ...(taxVal > 0 ? [{ label: 'Tax / GST', value: `₹${taxVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` }] : []),
    {
      label: 'Grand Total',
      value: `₹${grandTotalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      isGrandTotal: true,
    },
  ];

  const summaryRows = [
    ...(totalReelsCount > 0 ? [{ label: 'Total Reels Inwarded', value: `${totalReelsCount} Reels` }] : []),
    ...(totalReamsCount > 0 ? [{ label: 'Total Reams', value: `${totalReamsCount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Reams` }] : []),
    ...(totalKgWeight > 0 ? [{ label: 'Consolidated Weight', value: `${totalKgWeight.toLocaleString('en-IN', { maximumFractionDigits: 2 })} KG` }] : []),
  ];

  return (
    <UniversalPrintVoucherModal
      isOpen={!!invoice}
      onClose={onClose}
      modalTitle="Purchase Batch Print Preview"
      modalSubtitle="Official Goods Inward / Purchase Batch Receipt Voucher"
      companyName={companyName}
      voucherSubtitle="GOODS INWARD RECEIPT SLIP • PURCHASE BATCH VOUCHER"
      voucherNumber={invoice.invoiceNumber}
      status={{
        label: isPosted ? 'RECEIVED / POSTED' : isDraft ? 'DRAFT BATCH' : 'BATCH CANCELLED',
        variant: isPosted ? 'success' : isDraft ? 'warning' : 'danger',
      }}
      watermarkText={isCancelled ? 'CANCELLED BATCH' : isDraft ? 'DRAFT BATCH' : undefined}
      metaLeft={{
        title: 'Supplier / Vendor Details',
        primaryTitle: vendorName,
        rows: [
          ...(vendorContact !== '—' ? [{ label: 'Contact', value: vendorContact }] : []),
          ...(vendorGstin !== '—' ? [{ label: 'GSTIN', value: vendorGstin }] : []),
          ...(vendorAddress !== '—' ? [{ label: 'Address', value: vendorAddress }] : []),
        ],
      }}
      metaRight={{
        title: 'Batch & Inward Information',
        fields: [
          { label: 'Inward Date', value: dateStr },
          { label: 'Due Date', value: dueDateStr },
          { label: 'Total Lots', value: resolvedItems.length },
          { label: 'Purchased Type', value: resolvedItems[0]?.category || 'Raw Material' },
        ],
      }}
      columns={columns}
      data={resolvedItems}
      summaryLeft={{
        title: 'Physical Intake Summary',
        rows: summaryRows,
        remarks: invoice.remarks || undefined,
      }}
      summaryRight={{
        rows: financialRows,
      }}
      signatures={[
        { title: 'Material Inward Storekeeper', subtitle: 'Signature & Inward Stamp' },
        { title: 'QA / Quality Inspector', subtitle: 'Verification & Approval' },
        { title: 'Authorized Signatory / Finance', subtitle: 'Account Posting Approval' },
      ]}
    />
  );
};


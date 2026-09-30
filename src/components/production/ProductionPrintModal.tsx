import React from 'react';
import { ProductionOrder } from '../../types/production';
import UniversalPrintVoucherModal from '../ui/UniversalPrintVoucherModal';

interface ProductionPrintModalProps {
  order: ProductionOrder | null;
  onClose: () => void;
}

export const ProductionPrintModal: React.FC<ProductionPrintModalProps> = ({ order, onClose }) => {
  if (!order) return null;

  const isCompleted = order.status === 'Completed';
  const isInProgress = order.status === 'In Progress';
  const isCancelled = order.status === 'Cancelled';

  const columns = [
    { header: '#', align: 'center' as const, width: 'w-8', render: (_: any, idx: number) => <span className="font-bold text-slate-500">{idx + 1}</span> },
    {
      header: 'Component / Material Specification',
      render: (item: any) => (
        <div>
          <div className="font-bold text-slate-900">{item.component}</div>
          <div className="text-[10px] text-slate-500 font-mono">
            {item.code ? `Code: ${item.code}` : ''}
            {item.itemType ? ` • Type: ${item.itemType}` : ''}
          </div>
        </div>
      ),
    },
    {
      header: 'Qty / Batch',
      align: 'center' as const,
      render: (item: any) => (
        <span className="font-mono text-slate-700">{item.qtyPerBatch || '—'}</span>
      ),
    },
    {
      header: 'Total Required',
      align: 'right' as const,
      render: (item: any) => (
        <span className="font-mono font-bold text-slate-900">
          {Number(item.totalRequired || 0).toLocaleString('en-IN')} {item.uom || ''}
        </span>
      ),
    },
    {
      header: 'UOM',
      key: 'uom',
      align: 'center' as const,
      width: 'w-16',
    },
    {
      header: 'Issued Status',
      align: 'center' as const,
      render: (item: any) => (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
          {item.issuedStatus || 'Issued'}
        </span>
      ),
    },
    {
      header: 'Operator Check',
      align: 'center' as const,
      width: 'w-24',
      render: () => <span className="text-slate-400 font-mono">[ &nbsp;&nbsp;&nbsp;&nbsp; ]</span>,
    },
  ];

  const totalBomItems = order.bomItems?.length || 0;
  const totalBOMQty = order.bomItems?.reduce((sum, b) => sum + (Number(b.totalRequired) || 0), 0) || 0;

  return (
    <UniversalPrintVoucherModal
      isOpen={!!order}
      onClose={onClose}
      modalTitle="Production Work Order Print Preview"
      modalSubtitle="Official Manufacturing Job Order / Production Ticket"
      companyName="SKBW PRODUCTION"
      voucherSubtitle="MANUFACTURING WORK ORDER • JOB ROUTING TICKET"
      voucherNumber={order.orderNumber}
      status={{
        label: order.status.toUpperCase(),
        variant: isCompleted ? 'success' : isCancelled ? 'danger' : isInProgress ? 'info' : 'warning',
      }}
      watermarkText={isCancelled ? 'CANCELLED ORDER' : undefined}
      metaLeft={{
        title: 'Target Product & Production Details',
        primaryTitle: order.itemName,
        rows: [
          { label: 'Item Code', value: order.itemCode },
          { label: 'Planned Qty', value: `${order.plannedQty} ${order.plannedUom} (${(order.plannedPcs || 0).toLocaleString()} PCS)` },
          { label: 'Target Product Type', value: order.itemType || 'Finished Goods' },
        ],
      }}
      metaRight={{
        title: 'Schedule & Factory Routing',
        fields: [
          { label: 'Department', value: order.department },
          { label: 'Factory Site', value: order.factory },
          { label: 'Target Completion', value: order.requiredCompletionDate },
          { label: 'Job Priority', value: order.priority },
        ],
      }}
      columns={columns}
      data={order.bomItems || []}
      summaryLeft={{
        title: 'Production Intake Summary',
        rows: [
          { label: 'Total BOM Line Items', value: `${totalBomItems} Items` },
          { label: 'Total Aggregate Material Intake', value: `${totalBOMQty.toLocaleString('en-IN')} Units` },
          ...(order.notes ? [{ label: 'Production Notes', value: order.notes }] : []),
        ],
      }}
      summaryRight={{
        rows: [
          { label: 'Planned Output Qty', value: `${order.plannedQty} ${order.plannedUom}` },
          { label: 'Total Planned Units', value: `${(order.plannedPcs || 0).toLocaleString()} PCS`, isGrandTotal: true },
        ],
      }}
      signatures={[
        { title: 'Shop Floor Supervisor', subtitle: 'Work Order Authorization' },
        { title: 'Material Store In-Charge', subtitle: 'BOM Material Issue Verification' },
        { title: 'QA / Quality Controller', subtitle: 'Stage Inspection & Acceptance' },
      ]}
    />
  );
};

export default ProductionPrintModal;

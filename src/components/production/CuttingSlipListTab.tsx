import React, { useState, useEffect } from 'react';
import { 
  Scissors, Search, Plus, Printer, 
  Calendar, Layers, Scale, AlertTriangle, CheckCircle2, RotateCcw, X
} from 'lucide-react';
import { CuttingSlipV2, getCuttingSlipsV2, cancelCuttingSlipV2 } from '../../api/mfgApiV2';
import UniversalPrintVoucherModal from '../ui/UniversalPrintVoucherModal';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';

interface CuttingSlipListTabProps {
  companyId: string;
  onOpenNewSlip: () => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const CuttingSlipListTab: React.FC<CuttingSlipListTabProps> = ({
  companyId,
  onOpenNewSlip,
  onToast
}) => {
  const [slips, setSlips] = useState<CuttingSlipV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSlipForPrint, setSelectedSlipForPrint] = useState<CuttingSlipV2 | null>(null);

  const fetchSlips = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await getCuttingSlipsV2(companyId, { search });
      setSlips(res.cuttingSlips || []);
    } catch (err) {
      console.error('Failed to load cutting slips:', err);
      if (onToast) onToast('Failed to load cutting slips', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlips();
  }, [companyId]);

  useRealtimeSync(['cutting_slip'], () => {
    fetchSlips();
  });

  const handleCancelSlip = async (slipId: string, slipNumber: string) => {
    if (!window.confirm(`Are you sure you want to cancel ${slipNumber}? This will reverse the stock deduction and addition in inventory.`)) {
      return;
    }
    try {
      await cancelCuttingSlipV2(slipId, companyId);
      if (onToast) onToast(`Cutting slip ${slipNumber} cancelled successfully`, 'success');
      fetchSlips();
    } catch (err: any) {
      console.error('Failed to cancel slip:', err);
      if (onToast) onToast(err?.response?.data?.msg || 'Failed to cancel slip', 'error');
    }
  };

  // Aggregated Stats
  const totalReelsWeight = slips.filter(s => s.status !== 'Cancelled').reduce((sum, s) => sum + (s.totalInputWeight || 0), 0);
  const totalSheetsCut = slips.filter(s => s.status !== 'Cancelled').reduce((sum, s) => sum + (s.actualSheets || 0), 0);
  const totalReamsCut = slips.filter(s => s.status !== 'Cancelled').reduce((sum, s) => sum + (s.actualReams || 0), 0);
  const avgYield = slips.filter(s => s.status !== 'Cancelled').length > 0
    ? Math.round(
        (slips.filter(s => s.status !== 'Cancelled').reduce((sum, s) => sum + Math.max(0, 100 - (s.wastePercentage || 0)), 0) /
          slips.filter(s => s.status !== 'Cancelled').length) * 10
      ) / 10
    : 100;

  return (
    <div className="space-y-4">
      {/* Metric Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white px-4 py-3 rounded-xl border border-gray-200 flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Total Cutting Slips</span>
            <span className="font-mono font-semibold text-lg text-gray-900">{slips.length}</span>
          </div>
          <span className="w-2 h-2 rounded-full self-start mt-1 bg-blue-500" />
        </div>

        <div className="bg-white px-4 py-3 rounded-xl border border-gray-200 flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Reels Consumed</span>
            <span className="font-mono font-semibold text-lg text-gray-900">{totalReelsWeight.toLocaleString()} <span className="text-[0.875rem] font-normal text-slate-500">kg</span></span>
          </div>
          <span className="w-2 h-2 rounded-full self-start mt-1 bg-rose-500" />
        </div>

        <div className="bg-white px-4 py-3 rounded-xl border border-gray-200 flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Sheets Produced</span>
            <span className="font-mono font-semibold text-lg text-emerald-800">
              {totalSheetsCut.toLocaleString()} <span className="text-[0.875rem] font-normal text-slate-500">({totalReamsCut.toFixed(1)} Reams)</span>
            </span>
          </div>
          <span className="w-2 h-2 rounded-full self-start mt-1 bg-emerald-500" />
        </div>

        <div className="bg-white px-4 py-3 rounded-xl border border-gray-200 flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Avg Slitting Yield</span>
            <span className="font-mono font-semibold text-lg text-blue-900">{avgYield}%</span>
          </div>
          <span className="w-2 h-2 rounded-full self-start mt-1 bg-blue-500" />
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[15rem] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') fetchSlips(); }}
            placeholder="Search by Slip #, Batch, Operator..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-[0.875rem] font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchSlips}
            className="icon-btn"
            title="Refresh List"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Slips Table */}
      <div className="bg-gray-50 rounded-xl overflow-hidden p-2 panel-table">
        <div className="overflow-x-auto">
          <table className="w-full text-[0.875rem] text-left">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600 uppercase tracking-wider font-medium text-xs">
                <th className="py-3 px-4">Slip #</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Source Reel SKU & Lot</th>
                <th className="py-3 px-3 text-right">Reels (Weight)</th>
                <th className="py-3 px-3">Converted Sheet SKU</th>
                <th className="py-3 px-3 text-right">Actual Yield</th>
                <th className="py-3 px-3 text-center">Variance / Loss</th>
                <th className="py-3 px-3 text-right">Effective Rate</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    Loading cutting slips history...
                  </td>
                </tr>
              ) : slips.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Scissors className="w-8 h-8 text-slate-300 mx-auto mb-2 stroke-1" />
                    <p className="font-semibold text-slate-700">No Cutting Slips Recorded Yet</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Convert paper reels into sheets before launching live notebook production.
                    </p>
                    <button
                      type="button"
                      onClick={onOpenNewSlip}
                      className="btn-primary mt-3"
                    >
                      <Plus className="w-3.5 h-3.5 text-white" />
                      <span>Create First Cutting Slip</span>
                    </button>
                  </td>
                </tr>
              ) : (
                slips.map((slip) => {
                  const isCancelled = slip.status === 'Cancelled';
                  return (
                    <tr 
                      key={slip._id}
                      className={`hover:bg-slate-50/80 ${isCancelled ? 'opacity-50 line-through bg-slate-50/40' : ''}`}
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        {slip.slipNumber}
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-mono text-xs">
                        {slip.date ? new Date(slip.date).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900 truncate max-w-[11.25rem]">
                          {slip.sourceSku?.name || 'Paper Reel'}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          {slip.purchaseBatch || slip.sourceSku?.skuCode || 'Batch N/A'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className="font-mono font-semibold text-rose-700">
                          {slip.totalInputWeight} kg
                        </span>
                        <span className="text-xs text-slate-400 block">
                          {slip.selectedReels?.length || 1} reels
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900 truncate max-w-[12.5rem]">
                          {slip.targetSku?.name || 'Converted Sheets'}
                        </div>
                        <div className="text-xs text-slate-400">
                          {slip.sheetWidth}x{slip.sheetLength} cm • {slip.sheetGsm} GSM
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {(() => {
                          const targetDoc = slip.targetSku as any;
                          const tUnit = (targetDoc?.unit || '').trim().toUpperCase();
                          const conv = Number(targetDoc?.altUnitConversion || targetDoc?.booksGbl || targetDoc?.pcsPerGbl || 0);
                          const isGbl = tUnit === 'GBL' || tUnit.includes('BUNDLE') || tUnit.includes('BOX');
                          const convertedQty = isGbl && conv > 0 ? (slip.actualSheets / conv) : null;

                          return (
                            <>
                              <span className="font-semibold text-emerald-800 text-[0.875rem] block">
                                {convertedQty !== null ? `${convertedQty.toFixed(4)} ${tUnit}` : `${slip.actualSheets?.toLocaleString()} Sheets`}
                              </span>
                              <span className="text-xs text-slate-500 block">
                                {slip.actualSheets?.toLocaleString()} Sheets ({slip.actualReams?.toFixed(2)} Reams)
                              </span>
                              {slip.cutsCount ? (
                                <span className="text-xs text-blue-600 font-semibold block">
                                  {slip.cutsCount.toLocaleString()} cuts @ {slip.reelsOnStand || 1}R
                                </span>
                              ) : null}
                            </>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-semibold inline-flex items-center gap-1 ${
                          (slip.wastePercentage || 0) > 0
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {(slip.wastePercentage || 0) > 0 ? (
                            <>
                              <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                              <span>-{slip.wastePercentage}% loss</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                              <span>100% yield</span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs">
                        {(() => {
                          const targetDoc = slip.targetSku as any;
                          const tUnit = (targetDoc?.unit || '').trim().toUpperCase();
                          const conv = Number(targetDoc?.altUnitConversion || targetDoc?.booksGbl || targetDoc?.pcsPerGbl || 0);
                          const isGbl = tUnit === 'GBL' || tUnit.includes('BUNDLE') || tUnit.includes('BOX');
                          const costPerTargetUnit = isGbl && conv > 0 ? (slip.effectiveCostPerSheet * conv) : null;

                          return (
                            <>
                              <div className="font-semibold text-slate-900">
                                {costPerTargetUnit !== null ? `₹${costPerTargetUnit.toFixed(2)}/${tUnit}` : `₹${slip.effectiveCostPerSheet?.toFixed(2)}/sh`}
                              </div>
                              <div className="text-xs text-slate-400">
                                ₹{slip.effectiveCostPerSheet?.toFixed(2)}/sh • ₹{slip.effectiveCostPerReam?.toFixed(1)}/rm
                              </div>
                            </>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          isCancelled
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-blue-50 text-blue-800 border border-blue-200'
                        }`}>
                          {slip.status || 'Posted'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedSlipForPrint(slip)}
                            className="icon-btn"
                            title="Print Cutting Slip"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {!isCancelled && (
                            <button
                              type="button"
                              onClick={() => handleCancelSlip(slip._id!, slip.slipNumber)}
                              className="icon-btn"
                              title="Cancel Slip & Reverse Stock"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Universal Print Preview Modal for Existing Slip */}
      {selectedSlipForPrint && (() => {
        const slip = selectedSlipForPrint;
        const columns = [
          { header: '#', align: 'center' as const, width: 'w-8', render: (_: any, idx: number) => <span className="font-semibold text-slate-500">{idx + 1}</span> },
          {
            header: 'Item / Reel Identification',
            render: (row: any) => (
              <div>
                <div className="font-semibold text-slate-900">{row.name}</div>
                <div className="text-xs text-slate-500 font-mono">{row.code}</div>
              </div>
            )
          },
          { header: 'Type / Stage', key: 'type', align: 'center' as const },
          { header: 'Specs', key: 'specs', align: 'center' as const },
          {
            header: 'Quantity',
            align: 'right' as const,
            render: (row: any) => <span className="font-mono font-semibold text-slate-900">{row.qty}</span>
          },
          {
            header: 'Weight (KG)',
            align: 'right' as const,
            render: (row: any) => <span className="font-mono text-slate-700">{row.weight}</span>
          },
          { header: 'Rate (₹)', key: 'rate', align: 'right' as const },
          {
            header: 'Total Cost',
            align: 'right' as const,
            render: (row: any) => <span className="font-mono font-semibold text-slate-900">{row.total}</span>
          },
        ];

        const data = [
          {
            name: slip.sourceSku?.name || 'Source Paper Reel',
            code: slip.sourceSku?.skuCode || 'RAW-REEL',
            type: 'INPUT REEL',
            specs: `${slip.sheetGsm || slip.sourceSku?.gsm || ''} GSM • ${slip.sheetWidth || slip.sourceSku?.width || ''}"`,
            qty: `${slip.selectedReels?.length || 1} Reel(s)`,
            weight: `${slip.totalInputWeight?.toLocaleString('en-IN')} KG`,
            rate: `₹${slip.inputRatePerKg?.toFixed(2) || '0.00'}`,
            total: `₹${slip.totalInputCost?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`
          },
          {
            name: slip.targetSku?.name || 'Target Converted Sheets',
            code: slip.targetSku?.skuCode || 'CONV-SHEET',
            type: 'OUTPUT SHEETS',
            specs: `${slip.sheetWidth} × ${slip.sheetLength}" (${slip.sheetGsm} GSM)`,
            qty: `${slip.actualSheets?.toLocaleString('en-IN')} Sheets (${slip.actualReams} Reams)`,
            weight: `${(slip.totalInputWeight || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} KG`,
            rate: `₹${slip.effectiveCostPerSheet?.toFixed(3) || '—'} / Sheet`,
            total: `₹${slip.netProductionCost?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`
          }
        ];

        return (
          <UniversalPrintVoucherModal
            isOpen={!!selectedSlipForPrint}
            onClose={() => setSelectedSlipForPrint(null)}
            modalTitle="Cutting Slip Print Preview"
            modalSubtitle="Official Paper Conversion & Slitting Voucher"
            companyName="SKBW PRODUCTION"
            voucherSubtitle="PAPER CONVERSION SLIP • REEL TO SHEET CUTTING VOUCHER"
            voucherNumber={slip.slipNumber}
            status={{
              label: 'COMPLETED / POSTED',
              variant: 'success',
            }}
            metaLeft={{
              title: 'Source Reel (Consumption)',
              primaryTitle: slip.sourceSku?.name || 'Raw Material Reel',
              rows: [
                { label: 'Source SKU Code', value: slip.sourceSku?.skuCode || '—' },
                { label: 'Reels Consumed', value: `${slip.selectedReels?.length || 1} Reel(s)` },
                { label: 'Purchase Batch', value: slip.purchaseBatch || '—' },
              ]
            }}
            metaRight={{
              title: 'Conversion Particulars & Specs',
              fields: [
                { label: 'Cutting Date', value: new Date(slip.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
                { label: 'Cut Dimension', value: `${slip.sheetWidth} × ${slip.sheetLength}" (${slip.sheetGsm} GSM)` },
                { label: 'Total Cuts / Metres', value: slip.cutsCount ? `${slip.cutsCount} Cuts (${slip.reelsOnStand || 1} on stand)` : '—' },
                { label: 'Variance Sheets', value: `${slip.varianceSheets || 0} Sheets (${slip.wastePercentage || 0}%)` },
              ]
            }}
            columns={columns}
            data={data}
            summaryLeft={{
              title: 'Conversion & Yield Analysis',
              rows: [
                { label: 'Total Input Weight', value: `${slip.totalInputWeight?.toLocaleString('en-IN')} KG` },
                { label: 'Actual Converted Yield', value: `${slip.actualSheets?.toLocaleString('en-IN')} Sheets (${slip.actualReams} Reams)` },
                { label: 'Variance Sheets', value: `${slip.varianceSheets || 0} Sheets` },
                { label: 'Effective Landed Rate', value: `₹${slip.effectiveCostPerSheet?.toFixed(3) || '—'} / Sheet` },
              ]
            }}
            summaryRight={{
              rows: [
                { label: 'Total Input Cost', value: `₹${slip.totalInputCost?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}` },
                ...(slip.totalAdditionalCost && slip.totalAdditionalCost > 0 ? [
                  { label: 'Overheads & Addnl Cost', value: `₹${slip.totalAdditionalCost?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
                ] : []),
                { label: 'Net Production Cost', value: `₹${slip.netProductionCost?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`, isGrandTotal: true },
              ]
            }}
            signatures={[
              { title: 'Machine Operator / Slitter', subtitle: 'Conversion & Cuts Log' },
              { title: 'Plant Supervisor', subtitle: 'Yield & Production Authorization' },
              { title: 'Storekeeper / QA', subtitle: 'Finished Goods Receipt' },
            ]}
          />
        );
      })()}
    </div>
  );
};

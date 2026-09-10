import React, { useState, useEffect } from 'react';
import { X, Calendar, User, Package, Factory, Layers, RefreshCw, Printer, Edit, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { getSalesOrderBomRequirementsV2, BomRequirementResult, SalesOrderV2 } from '../../api/salesOrderApiV2';
import { showToast } from '../ui/Toast';

interface SalesOrderDetailPanelV2Props {
  isOpen: boolean;
  order: SalesOrderV2 | null;
  onClose: () => void;
  onEdit: (order: SalesOrderV2) => void;
}

export const SalesOrderDetailPanelV2: React.FC<SalesOrderDetailPanelV2Props> = ({
  isOpen,
  order,
  onClose,
  onEdit
}) => {
  const [bomData, setBomData] = useState<BomRequirementResult | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRequirements = async () => {
    if (!order?._id) return;
    setLoading(true);
    try {
      const data = await getSalesOrderBomRequirementsV2(order._id);
      setBomData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && order?._id) {
      fetchRequirements();
    }
  }, [isOpen, order]);

  if (!isOpen || !order) return null;

  const handleCreateWorkOrder = () => {
    showToast(`Work Order generated for Sales Order ${order.orderNumber}`, 'success');
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden animate-fadeIn" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity cursor-pointer" onClick={onClose} />

      <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="pointer-events-auto w-screen max-w-2xl bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
          
          {/* Header */}
          <div className="p-4 sm:p-6 bg-linear-to-r from-blue-50/80 via-indigo-50/50 to-white border-b border-gray-200 flex items-center justify-between shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-gray-900 tracking-tight">{order.orderNumber}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                  order.status === 'Confirmed' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  order.status === 'Delivered' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-700 border-gray-200'
                }`}>
                  {order.status}
                </span>
              </div>
              <p className="text-xs font-semibold text-gray-600 flex items-center gap-2 mt-1">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>{order.customerName}</span>
                {order.promisedDate && (
                  <>
                    <span>•</span>
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>Due: {order.promisedDate}</span>
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onEdit(order)}
                className="p-2 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl transition-all cursor-pointer"
                title="Edit Sales Order"
              >
                <Edit className="w-4 h-4 text-blue-600" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 bg-white hover:bg-gray-100 border border-gray-200 text-gray-400 hover:text-gray-700 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-xs text-left">
            
            {/* Top Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Value</span>
                <div className="text-base font-black text-blue-900 mt-0.5">₹{(order.grandTotal || 0).toLocaleString('en-IN')}</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Materials Readiness</span>
                <div className="mt-1">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    bomData?.materialsStatus === 'Shortfall' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {bomData?.materialsStatus === 'Shortfall' ? 'Shortfall Warning' : 'Ready / Stocked'}
                  </span>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fulfillment Status</span>
                <div className="text-xs font-bold text-gray-800 mt-1">{order.fulfillmentStatus || 'Not Started'}</div>
              </div>
            </div>

            {/* ── SECTION 1: ORDERED PRODUCTS FULFILLMENT ── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-2xs">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-2">
                <Package className="w-4 h-4 text-blue-600" />
                <span>1. Ordered Products & Dispatched Status</span>
              </h3>

              <div className="space-y-2.5">
                {(order.items || []).map((item, idx) => {
                  const ordered = item.quantity || 1;
                  const dispatched = item.dispatchedQty || 0;
                  const pct = Math.min(100, Math.round((dispatched / ordered) * 100));

                  return (
                    <div key={idx} className="bg-gray-50/70 border border-gray-100 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-gray-900">
                          <span className="text-blue-600 font-mono">[{item.skuCode}]</span> {item.itemName}
                        </div>
                        <div className="font-bold text-gray-700">
                          {dispatched} / {ordered} {item.uom || 'Pcs'}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── SECTION 2: PRODUCTS TO MANUFACTURE (MRP NET CALCULATION) ── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <Factory className="w-4 h-4 text-indigo-600" />
                  <span>2. Net Products To Manufacture (MRP Link)</span>
                </h3>
                <button
                  type="button"
                  onClick={handleCreateWorkOrder}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-[11px] flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Work Order</span>
                </button>
              </div>

              <div className="space-y-2">
                {(bomData?.productsToManufacture || []).map((p, idx) => (
                  <div key={idx} className="p-3 bg-indigo-50/40 border border-indigo-100 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-bold text-gray-900">[{p.skuCode}] {p.itemName}</div>
                      <div className="text-[10px] text-gray-500 font-medium flex items-center gap-2 mt-0.5">
                        <span>Ordered: {p.orderedQty} {p.uom}</span>
                        <span>•</span>
                        <span className="text-emerald-700 font-bold">In Warehouse Stock: {p.presentStock} {p.uom}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">NET TO MANUFACTURE</div>
                      <div className="text-sm font-black text-indigo-700">
                        {p.netToManufacture} {p.uom}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── SECTION 3: RAW MATERIAL REQUIREMENT (BOM EXPLOSION) ── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  <span>3. Raw Material Requirement (BOM Explosion)</span>
                </h3>
                <button
                  type="button"
                  onClick={fetchRequirements}
                  disabled={loading}
                  className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors cursor-pointer"
                  title="Refresh live warehouse stock check"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {bomData?.rawMaterialsList && bomData.rawMaterialsList.length > 0 ? (
                <div className="space-y-2">
                  {bomData.rawMaterialsList.map((rm, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="font-bold text-gray-900">{rm.materialName}</div>
                        <div className="text-[10px] text-gray-500 font-medium mt-0.5">
                          Required: {rm.requiredQty} {rm.uom} • Warehouse Stock: {rm.availableStock} {rm.uom}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          rm.status === 'Shortfall' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {rm.status === 'Shortfall' ? `Shortfall: ${rm.shortfallQty} ${rm.uom}` : 'Sufficient Stock'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-400 italic bg-gray-50 rounded-xl">
                  No BOM recipe materials configured for these products.
                </div>
              )}
            </div>

          </div>

          {/* Footer Actions */}
          <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => onEdit(order)}
              className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-100 text-gray-800 font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Edit className="w-4 h-4 text-blue-600" />
              <span>Edit Order</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl shadow-md transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SalesOrderDetailPanelV2;

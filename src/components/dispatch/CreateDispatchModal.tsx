import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Truck, Calendar, Building, Phone, MapPin, Package,
  AlertCircle, CheckCircle2, ShieldCheck, Printer, FileText,
  ChevronDown, Layers, Hash, Info, ArrowRight, User
} from 'lucide-react';
import { SalesOrderV2, SalesOrderItemV2, updateSalesOrderV2 } from '../../api/salesOrderApiV2';
import { createDeliveryChallan } from '../../api/deliveryChallanApi';
import { getBalancesV2, WarehouseLocationV2, getWarehouseHierarchyV2 } from '../../api/mfgApiV2';
import { saveCustomSalesOrder } from '../../utils/salesOrderStorage';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../ui/Toast';

export interface CreateDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SalesOrderV2 | null;
  allOrders?: SalesOrderV2[];
  onOrderChange?: (newOrder: SalesOrderV2) => void;
  onDispatchCreated: (challan: any) => void;
}

export const CreateDispatchModal: React.FC<CreateDispatchModalProps> = ({
  isOpen,
  onClose,
  order,
  allOrders = [],
  onOrderChange,
  onDispatchCreated
}) => {
  const { selectedCompany } = useAuth();

  // Selected Order
  const [selectedOrderId, setSelectedOrderId] = useState<string>(order?._id || '');
  const activeOrder = useMemo(() => {
    return allOrders.find(o => o._id === selectedOrderId) || order;
  }, [allOrders, selectedOrderId, order]);

  useEffect(() => {
    if (order?._id) {
      setSelectedOrderId(order._id);
    }
  }, [order]);

  // Form Fields
  const [dcNumber, setDcNumber] = useState('');
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [transporterName, setTransporterName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [ewayBillNumber, setEwayBillNumber] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('SKBW - Ground Floor');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stock Map for live availability
  const [liveStockMap, setLiveStockMap] = useState<Map<string, number>>(new Map());
  const [loadingStock, setLoadingStock] = useState(false);

  // Dispatch Quantities per item (item._id -> dispatch quantity)
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, number>>({});

  // Auto-generate DC Number
  useEffect(() => {
    if (isOpen) {
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      setDcNumber(`DC-${year}-${rand}`);
    }
  }, [isOpen]);

  // Fetch live balances for order items
  useEffect(() => {
    if (!isOpen || !selectedCompany?._id) return;
    setLoadingStock(true);
    getBalancesV2(selectedCompany._id)
      .then((balances: any[]) => {
        const map = new Map<string, number>();
        if (Array.isArray(balances)) {
          balances.forEach(b => {
            const rawId = b.skuId || b.sku?._id;
            const sId = rawId ? String((rawId as any)._id || rawId) : '';
            const sCode = (b.sku?.skuCode || b.skuCode || '').toLowerCase().trim();
            const qty = Number(b.onHand) || Number(b.quantity) || 0;
            if (sId) map.set(sId, (map.get(sId) || 0) + qty);
            if (sCode) map.set(sCode, (map.get(sCode) || 0) + qty);
          });
        }
        setLiveStockMap(map);
      })
      .catch(err => {
        console.warn('Could not fetch balances for dispatch:', err);
      })
      .finally(() => {
        setLoadingStock(false);
      });
  }, [isOpen, selectedCompany?._id]);

  // Initialize dispatch quantities to pending amounts
  useEffect(() => {
    if (activeOrder && activeOrder.items) {
      const initial: Record<string, number> = {};
      activeOrder.items.forEach((item, idx) => {
        const key = item._id || `item-${idx}`;
        const ordered = Number(item.quantity) || 0;
        const dispatched = Number(item.dispatchedQty) || 0;
        const pending = Math.max(0, ordered - dispatched);
        initial[key] = pending;
      });
      setDispatchQuantities(initial);

      // Pre-fill transporter if set on order or party
      if (activeOrder.transporter && !transporterName) {
        setTransporterName(activeOrder.transporter);
      }
    }
  }, [activeOrder]);

  const handleQtyChange = (key: string, val: number, maxPending: number) => {
    const validVal = Math.max(0, Math.min(val, maxPending));
    setDispatchQuantities(prev => ({
      ...prev,
      [key]: validVal
    }));
  };

  const handleDispatchAll = () => {
    if (!activeOrder?.items) return;
    const all: Record<string, number> = {};
    activeOrder.items.forEach((item, idx) => {
      const key = item._id || `item-${idx}`;
      const ordered = Number(item.quantity) || 0;
      const dispatched = Number(item.dispatchedQty) || 0;
      all[key] = Math.max(0, ordered - dispatched);
    });
    setDispatchQuantities(all);
    showToast('Set all items to full pending quantity', 'info');
  };

  const handleClearAll = () => {
    if (!activeOrder?.items) return;
    const zeroed: Record<string, number> = {};
    activeOrder.items.forEach((item, idx) => {
      const key = item._id || `item-${idx}`;
      zeroed[key] = 0;
    });
    setDispatchQuantities(zeroed);
  };

  // Totals
  const { totalDispatchQty, totalDispatchGbl, totalDispatchPcs, totalValue } = useMemo(() => {
    if (!activeOrder?.items) {
      return { totalDispatchQty: 0, totalDispatchGbl: 0, totalDispatchPcs: 0, totalValue: 0 };
    }
    let sumQty = 0;
    let sumGbl = 0;
    let sumPcs = 0;
    let sumVal = 0;

    activeOrder.items.forEach((item, idx) => {
      const key = item._id || `item-${idx}`;
      const dQty = dispatchQuantities[key] || 0;
      if (dQty <= 0) return;

      sumQty += dQty;
      const conv = Number(item.pcsPerGbl || item.altUnitConversion || 100);
      const isGbl = (item.uom || '').toUpperCase() === 'GBL';

      if (isGbl) {
        sumGbl += dQty;
        sumPcs += dQty * conv;
      } else {
        sumPcs += dQty;
        sumGbl += conv > 0 ? dQty / conv : dQty / 100;
      }

      const unitPrice = Number(item.unitPrice) || 0;
      sumVal += dQty * unitPrice;
    });

    return {
      totalDispatchQty: sumQty,
      totalDispatchGbl: Math.round(sumGbl * 100) / 100,
      totalDispatchPcs: Math.round(sumPcs),
      totalValue: Math.round(sumVal * 100) / 100
    };
  }, [activeOrder, dispatchQuantities]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) {
      showToast('Please select a sales order to dispatch', 'error');
      return;
    }
    if (totalDispatchQty <= 0) {
      showToast('Please enter dispatch quantity for at least one item', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const dcItems = (activeOrder.items || []).map((item, idx) => {
        const key = item._id || `item-${idx}`;
        const dQty = dispatchQuantities[key] || 0;
        const ordered = Number(item.quantity) || 0;
        const unitPrice = Number(item.unitPrice) || 0;

        return {
          itemId: String(item.skuId || item.skuCode || ''),
          skuId: item.skuId,
          skuCode: item.skuCode,
          itemName: item.itemName,
          orderedQty: ordered,
          deliveredQty: dQty,
          uom: item.uom || 'Pcs',
          price: unitPrice,
          total: dQty * unitPrice
        };
      }).filter(i => i.deliveredQty > 0);

      const challanPayload = {
        dcNumber: dcNumber.trim() || `DC-${Date.now()}`,
        orderId: activeOrder._id,
        orderNumber: activeOrder.orderNumber,
        customerName: activeOrder.customerName,
        customerId: (activeOrder.customer as any)?._id || activeOrder.customerId,
        date: dispatchDate,
        transporterName: transporterName.trim(),
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        driverName: driverName.trim(),
        driverPhone: driverPhone.trim(),
        lrNumber: lrNumber.trim(),
        ewayBillNumber: ewayBillNumber.trim(),
        locationName: selectedLocation,
        items: dcItems,
        subtotal: totalValue,
        tax: Math.round(totalValue * 0.18 * 100) / 100,
        total: Math.round(totalValue * 1.18 * 100) / 100,
        status: 'dispatched',
        notes: notes.trim(),
        company: selectedCompany?._id
      };

      let createdChallan = challanPayload;
      try {
        const res = await createDeliveryChallan(challanPayload);
        if (res?.data) createdChallan = res.data;
      } catch (apiErr) {
        console.warn('API createDeliveryChallan failed, proceeding with local persistence:', apiErr);
      }

      // Update Sales Order's dispatched quantities and fulfillment status
      const updatedItems = (activeOrder.items || []).map((item, idx) => {
        const key = item._id || `item-${idx}`;
        const dQty = dispatchQuantities[key] || 0;
        return {
          ...item,
          dispatchedQty: (Number(item.dispatchedQty) || 0) + dQty
        };
      });

      const allFulfilled = updatedItems.every(i => (Number(i.dispatchedQty) || 0) >= (Number(i.quantity) || 0));
      const someDispatched = updatedItems.some(i => (Number(i.dispatchedQty) || 0) > 0);
      const newFulfillment = allFulfilled ? 'Fulfilled' : (someDispatched ? 'Partially Dispatched' : (activeOrder.fulfillmentStatus || 'Pending'));
      const newStatus = allFulfilled ? 'Delivered' : (someDispatched ? 'Partially Delivered' : (activeOrder.status || 'Confirmed'));

      const updatedOrder: SalesOrderV2 = {
        ...activeOrder,
        items: updatedItems,
        fulfillmentStatus: newFulfillment,
        status: newStatus
      };

      // Persist updated order locally & in backend
      saveCustomSalesOrder(updatedOrder, selectedCompany?._id);
      if (activeOrder._id && !activeOrder._id.startsWith('seed-') && !activeOrder._id.startsWith('so-mock-')) {
        updateSalesOrderV2(activeOrder._id, updatedOrder).catch(err => {
          console.warn('Backend updateSalesOrderV2 failed:', err);
        });
      }

      // Persist delivery challan in local storage
      try {
        const cKey = `skbw_delivery_challans_${selectedCompany?._id || 'default'}`;
        const stored = JSON.parse(localStorage.getItem(cKey) || '[]');
        localStorage.setItem(cKey, JSON.stringify([createdChallan, ...stored]));
      } catch (storeErr) {
        console.warn('Failed to cache delivery challan in localStorage:', storeErr);
      }

      showToast(`Dispatch ${challanPayload.dcNumber} created successfully!`, 'success');
      onDispatchCreated(createdChallan);
      onClose();
    } catch (err: any) {
      console.error('Failed to create dispatch:', err);
      showToast('Failed to create dispatch', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-left"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-200">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-gray-900 tracking-tight">Create Sales Order Dispatch</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 font-mono">
                  {dcNumber || 'New DC'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Dispatch items from <span className="font-semibold text-gray-800">{activeOrder?.orderNumber || 'Selected Order'}</span> for <span className="font-semibold text-gray-800">{activeOrder?.customerName || 'Customer'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Order Selection & Customer Info Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50/80 p-4 rounded-xl border border-gray-200/80">
            {/* Sales Order Dropdown */}
            <div>
              <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">
                Select Sales Order
              </label>
              <select
                value={activeOrder?._id || ''}
                onChange={e => {
                  setSelectedOrderId(e.target.value);
                  const matched = allOrders.find(o => o._id === e.target.value);
                  if (matched && onOrderChange) onOrderChange(matched);
                }}
                className="w-full h-9 bg-white border border-gray-300 rounded-lg px-2.5 text-xs font-bold font-mono text-gray-800 focus:outline-none focus:border-blue-500 shadow-2xs"
              >
                {allOrders.map(o => (
                  <option key={o._id || o.orderNumber} value={o._id}>
                    {o.orderNumber} • {o.customerName} ({o.items?.length || 0} items)
                  </option>
                ))}
              </select>
            </div>

            {/* Customer Details */}
            <div className="md:col-span-2 flex flex-col justify-center">
              <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-0.5">
                Customer & Destination
              </span>
              <div className="flex items-center gap-3 text-xs">
                <span className="font-bold text-gray-900 truncate">
                  {activeOrder?.customerName || '—'}
                </span>
                {((activeOrder as any)?.customerPhone || (activeOrder?.customer as any)?.phone) && (
                  <span className="text-gray-500 flex items-center gap-1 font-mono text-[11px]">
                    <Phone className="w-3 h-3 text-gray-400" />
                    {(activeOrder as any)?.customerPhone || (activeOrder?.customer as any)?.phone}
                  </span>
                )}
                {((activeOrder as any)?.city || (activeOrder?.customer as any)?.city) && (
                  <span className="text-gray-500 flex items-center gap-1 text-[11px]">
                    <MapPin className="w-3 h-3 text-gray-400" />
                    {(activeOrder as any)?.city || (activeOrder?.customer as any)?.city}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Transport & Dispatch Details */}
          <div>
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-blue-600" />
              Transport & Logistics Details
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-gray-200 shadow-2xs">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Challan Date</label>
                <input
                  type="date"
                  value={dispatchDate}
                  onChange={e => setDispatchDate(e.target.value)}
                  className="w-full h-8 px-2 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Transporter</label>
                <input
                  type="text"
                  placeholder="e.g. VRL Logistics, Garuda"
                  value={transporterName}
                  onChange={e => setTransporterName(e.target.value)}
                  className="w-full h-8 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Vehicle Number</label>
                <input
                  type="text"
                  placeholder="e.g. TS 09 UB 1234"
                  value={vehicleNumber}
                  onChange={e => setVehicleNumber(e.target.value)}
                  className="w-full h-8 px-2 text-xs border border-gray-200 rounded-lg font-mono uppercase focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Driver Phone</label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={driverPhone}
                  onChange={e => setDriverPhone(e.target.value)}
                  className="w-full h-8 px-2 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">LR / Bilty No.</label>
                <input
                  type="text"
                  placeholder="e.g. LR-98210"
                  value={lrNumber}
                  onChange={e => setLrNumber(e.target.value)}
                  className="w-full h-8 px-2 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">E-Way Bill No.</label>
                <input
                  type="text"
                  placeholder="e.g. 2310 9845 1204"
                  value={ewayBillNumber}
                  onChange={e => setEwayBillNumber(e.target.value)}
                  className="w-full h-8 px-2 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Source Warehouse</label>
                <select
                  value={selectedLocation}
                  onChange={e => setSelectedLocation(e.target.value)}
                  className="w-full h-8 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
                >
                  <option value="SKBW - Ground Floor">SKBW - Ground Floor (Finished Goods)</option>
                  <option value="Main Factory - Floor 1">Main Factory - Floor 1</option>
                  <option value="Central Warehouse - Dispatch Bay">Central Warehouse - Dispatch Bay</option>
                </select>
              </div>
            </div>
          </div>

          {/* Items to Dispatch Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-blue-600" />
                Select Dispatch Quantities
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDispatchAll}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                >
                  Dispatch All Pending
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11px] font-medium text-gray-500 hover:text-gray-700 bg-gray-100 px-2 py-1 rounded-md transition-colors cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-gray-50/90 text-gray-500 font-extrabold text-[10px] uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="py-2 px-3">Item Description</th>
                    <th className="py-2 px-2 text-right">Ordered</th>
                    <th className="py-2 px-2 text-right">Dispatched</th>
                    <th className="py-2 px-2 text-right">Pending</th>
                    <th className="py-2 px-2 text-center">Live Stock</th>
                    <th className="py-2 px-3 text-right w-36">Dispatch Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(!activeOrder?.items || activeOrder.items.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-400">
                        No items found in this sales order.
                      </td>
                    </tr>
                  ) : (
                    activeOrder.items.map((item, idx) => {
                      const key = item._id || `item-${idx}`;
                      const ordered = Number(item.quantity) || 0;
                      const dispatched = Number(item.dispatchedQty) || 0;
                      const pending = Math.max(0, ordered - dispatched);
                      const currentDispatch = dispatchQuantities[key] ?? pending;

                      // Stock
                      const sId = item.skuId ? String((item.skuId as any)?._id || item.skuId) : '';
                      const sCode = (item.skuCode || '').toLowerCase().trim();
                      const stockOnHand = (sId && liveStockMap.get(sId)) || (sCode && liveStockMap.get(sCode)) || 0;
                      const isStockSufficient = stockOnHand >= currentDispatch;

                      return (
                        <tr key={key} className="hover:bg-blue-50/20 transition-colors">
                          <td className="py-2 px-3">
                            <span className="font-bold text-gray-800 block truncate max-w-xs">{item.itemName}</span>
                            <span className="text-[10px] font-mono text-gray-400 block">{item.skuCode}</span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono font-semibold text-gray-700">
                            {ordered} <span className="text-[10px] text-gray-400">{item.uom || 'Pcs'}</span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-gray-500">
                            {dispatched}
                          </td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-blue-700">
                            {pending}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                              stockOnHand <= 0
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : isStockSufficient
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {stockOnHand > 0 ? `${stockOnHand} in stock` : '0 Stock'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                min={0}
                                max={pending}
                                step="any"
                                value={currentDispatch}
                                onChange={e => handleQtyChange(key, Number(e.target.value), pending)}
                                className="w-20 h-7 px-2 border border-gray-300 rounded-md text-right font-mono font-bold text-gray-800 focus:outline-none focus:border-blue-500 shadow-2xs"
                              />
                              <span className="text-[10px] font-bold text-gray-500">{item.uom || 'Pcs'}</span>
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

          {/* Dispatch Summary Card */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50/60 p-4 rounded-xl border border-blue-200/80 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider block">Total Dispatched</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xl font-black font-mono text-blue-950">{totalDispatchGbl} GBL</span>
                <span className="text-xs font-bold font-mono text-blue-600">({totalDispatchPcs.toLocaleString()} PCS)</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider block">Estimated Value</span>
              <span className="text-xl font-black font-mono text-blue-950">₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-200/70 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || totalDispatchQty <= 0}
              className={`px-5 py-2 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all cursor-pointer ${
                totalDispatchQty > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating Dispatch...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm & Create Dispatch</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateDispatchModal;

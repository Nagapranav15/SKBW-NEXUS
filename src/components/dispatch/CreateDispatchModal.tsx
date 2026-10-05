import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Truck, Package, CheckCircle2, Printer,
  Edit3, MapPin, Phone, Save
} from 'lucide-react';
import { SalesOrderV2, updateSalesOrderV2 } from '../../api/salesOrderApiV2';
import { createDeliveryChallan } from '../../api/deliveryChallanApi';
import { saveCustomSalesOrder } from '../../utils/salesOrderStorage';
import { getBalancesV2, getSkusV2 } from '../../api/mfgApiV2';
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

interface ItemRow {
  key: string;
  itemCode: string;
  itemName: string;
  uom: string;
  pcsPerGbl: number;
  orderedQty: number;
  dispatchedQty: number;
  pendingQty: number;
  pendingPcs: number;
  isGblItem: boolean;
  selected: boolean;
  dispatchGbl: number;
  dispatchPcs: number;
  skuId?: any;
  skuCode?: string;
  unitPrice?: number;
  stockOnHandGbl?: number;
  stockOnHandPcs?: number;
  isAvailable?: boolean;
}

/* ─────────────────────────────────────────────── */

export const CreateDispatchModal: React.FC<CreateDispatchModalProps> = ({
  isOpen,
  onClose,
  order,
  allOrders = [],
  onOrderChange,
  onDispatchCreated,
}) => {
  const { selectedCompany } = useAuth();
  const checkboxRef = useRef<HTMLInputElement>(null);

  /* ── order selection ── */
  const [selectedOrderId, setSelectedOrderId] = useState<string>(() => order?._id || '');
  const activeOrder = useMemo(
    () => (selectedOrderId ? (allOrders.find(o => o._id === selectedOrderId) ?? order ?? null) : (order ?? null)),
    [allOrders, selectedOrderId, order]
  );
  // When modal opens with an order or order changes, sync selectedOrderId
  useEffect(() => {
    if (isOpen && order?._id) {
      setSelectedOrderId(order._id);
    }
  }, [isOpen, order]);

  // Live stock map for displaying stock availability of order items
  const [modalStockMap, setModalStockMap] = useState<Map<string, { pcs: number; gbl: number }>>(new Map());

  useEffect(() => {
    if (!isOpen) return;
    const compId = (activeOrder?.company as any)?._id || activeOrder?.company || selectedCompany?._id;
    if (!compId) return;

    Promise.all([
      getBalancesV2(compId).catch(() => []),
      getSkusV2(compId).catch(() => [])
    ]).then(([balances, skus]) => {
      const smap = new Map<string, { pcs: number; gbl: number }>();
      const skuPcsMap = new Map<string, number>();
      const bList = Array.isArray(balances) ? balances : [];
      const sList = Array.isArray(skus) ? skus : [];

      bList.forEach((b: any) => {
        const rawId = b.skuId || b.sku?._id;
        const sId = rawId ? String((rawId as any)._id || rawId) : '';
        const qty = Number(b.onHand) || Number(b.quantity) || 0;
        if (sId) skuPcsMap.set(sId, (skuPcsMap.get(sId) || 0) + qty);
      });

      sList.forEach((s: any) => {
        const sId = String(s._id || s.id || '');
        const code = (s.skuCode || '').toLowerCase().trim();
        const name = (s.name || '').toLowerCase().trim();
        const pcsPerGbl = Number(s.altUnitConversion || s.booksGbl || 100) || 100;
        const rawOnHand = skuPcsMap.get(sId) ?? (Number(s.presentStock || s.openingStock || 0));
        const unit = (s.unit || '').toUpperCase().trim();
        const altUnit = (s.altUnit || '').toUpperCase().trim();

        let gbl: number;
        let pcs: number;
        if (unit === 'GBL' || (altUnit && altUnit !== 'GBL' && unit.includes('GBL'))) {
          gbl = rawOnHand;
          pcs = rawOnHand * pcsPerGbl;
        } else {
          pcs = rawOnHand;
          gbl = pcsPerGbl > 0 ? Math.floor(rawOnHand / pcsPerGbl) : rawOnHand;
        }

        const val = { pcs, gbl };
        if (sId) smap.set(sId, val);
        if (code) smap.set(code, val);
        if (name) smap.set(name, val);
      });

      setModalStockMap(smap);
    }).catch(() => {});
  }, [isOpen, activeOrder, selectedCompany?._id]);

  /* ── dispatch type ── */
  const [dispatchType, setDispatchType] = useState<'full' | 'partial'>('full');

  /* ── dispatch details ── */
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [transporter, setTransporter] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [lrDate, setLrDate] = useState('');
  const [remarks, setRemarks] = useState('');

  /* ── address ── */
  const [sameAsBillTo, setSameAsBillTo] = useState(true);
  const [editBillTo, setEditBillTo] = useState(false);
  const [editShipTo, setEditShipTo] = useState(false);
  const [billToAddress, setBillToAddress] = useState('');
  const [shipToAddress, setShipToAddress] = useState('');

  /* ── items ── */
  const [itemRows, setItemRows] = useState<ItemRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ── dc number ── */
  const dcNumber = useMemo(() => {
    const y = new Date().getFullYear();
    const r = Math.floor(1000 + Math.random() * 9000);
    return `DC-${y}-${r}`;
  }, []);

  /* ─── Build item rows from active order ─── */
  useEffect(() => {
    if (!activeOrder?.items) return;

    if ((activeOrder as any).transporter && !transporter) {
      setTransporter((activeOrder as any).transporter);
    }

    // Build address from order data
    const custName = activeOrder.customerName || '';
    const billingAddr = (activeOrder as any).billingAddress;
    const shippingAddr = (activeOrder as any).shippingAddress;
    const city = (activeOrder as any).city || billingAddr?.city || '';
    const state = (activeOrder as any).region || billingAddr?.state || '';
    const pin = billingAddr?.pincode || (activeOrder as any).pincode || '—';
    const street = billingAddr?.address || billingAddr?.street || (activeOrder as any).address || 'Main Road';

    const builtBill = `${custName}\n${street}\n${city}${state ? ', ' + state : ''} - ${pin}`;
    setBillToAddress(builtBill);

    const shipCity = shippingAddr?.city || city;
    const shipState = shippingAddr?.state || state;
    const shipPin = shippingAddr?.pincode || pin;
    const shipStreet = shippingAddr?.address || shippingAddr?.street || street;
    const builtShip = `${custName}\n${shipStreet}\n${shipCity}${shipState ? ', ' + shipState : ''} - ${shipPin}`;
    setShipToAddress(builtShip);

    const rows: ItemRow[] = activeOrder.items.map((item, idx) => {
      const rawOrdered = Number(item.quantity) || 0;
      const conv = Number(
        (item as any).pcsPerGbl ?? (item as any).altUnitConversion ?? 100
      );
      const itemGbl = Number(item.gbl) || 0;

      let orderedPcs = 0;
      let orderedGbl = 0;

      if (itemGbl > 0 && rawOrdered > itemGbl) {
        orderedPcs = rawOrdered;
        orderedGbl = itemGbl;
      } else if (rawOrdered >= conv && conv > 1) {
        orderedPcs = rawOrdered;
        orderedGbl = itemGbl || Math.ceil(rawOrdered / conv);
      } else if ((item.uom || '').toUpperCase() === 'GBL') {
        orderedGbl = rawOrdered;
        orderedPcs = rawOrdered * conv;
      } else {
        orderedPcs = rawOrdered;
        orderedGbl = itemGbl || (conv > 0 ? Math.ceil(rawOrdered / conv) : rawOrdered);
      }

      const dispatchedPcs = Number(item.dispatchedQty) || 0;
      const dispatchedGbl = Math.floor(dispatchedPcs / conv);
      const pendingPcs = Math.max(0, orderedPcs - dispatchedPcs);
      const pendingGbl = Math.max(0, orderedGbl - dispatchedGbl) || (conv > 0 ? Math.ceil(pendingPcs / conv) : pendingPcs);

      const isGbl = (item.uom || '').toUpperCase() === 'GBL';

      const codeKey = (item.skuCode || '').toLowerCase().trim();
      const idKey = String(item.skuId || '');
      const nameKey = (item.itemName || item.description || '').toLowerCase().trim();
      const stock = (codeKey && modalStockMap.get(codeKey)) ||
                    (idKey && modalStockMap.get(idKey)) ||
                    (nameKey && modalStockMap.get(nameKey)) ||
                    { pcs: 0, gbl: 0 };

      const hasStock = (stock.gbl >= pendingGbl && pendingGbl > 0) || 
                       (stock.pcs >= pendingPcs && pendingPcs > 0);

      const isAvailable = hasStock;

      return {
        key: item._id || `item-${idx}`,
        itemCode: item.skuCode || `FG-${String(idx + 1).padStart(3, '0')}`,
        itemName: item.itemName || item.description || '—',
        uom: item.uom || 'PCS',
        pcsPerGbl: conv,
        orderedQty: orderedPcs,
        dispatchedQty: dispatchedPcs,
        pendingQty: pendingGbl > 0 ? pendingGbl : pendingPcs,
        pendingPcs,
        isGblItem: isGbl,
        selected: true,
        dispatchGbl: pendingGbl,
        dispatchPcs: pendingPcs,
        skuId: item.skuId,
        skuCode: item.skuCode,
        unitPrice: Number(item.unitPrice) || 0,
        stockOnHandGbl: stock.gbl,
        stockOnHandPcs: stock.pcs,
        isAvailable
      };
    });

    setItemRows(rows);
  }, [activeOrder, modalStockMap]);

  /* ─── Sync dispatch qty when type changes ─── */
  useEffect(() => {
    setItemRows(prev =>
      prev.map(r => ({
        ...r,
        dispatchGbl: dispatchType === 'full' ? r.pendingQty : 0,
        dispatchPcs: dispatchType === 'full' ? r.pendingPcs : 0,
        selected: dispatchType === 'full' ? true : r.selected,
      }))
    );
  }, [dispatchType]);

  /* ─── Indeterminate checkbox for "select all" ─── */
  const allSelected = itemRows.length > 0 && itemRows.every(r => r.selected);
  const someSelected = itemRows.some(r => r.selected);
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = !allSelected && someSelected;
    }
  }, [allSelected, someSelected]);

  /* ─── Handlers ─── */
  const handleToggleAll = (checked: boolean) => {
    setItemRows(prev =>
      prev.map(r => ({
        ...r,
        selected: checked,
        dispatchGbl: checked ? r.pendingQty : 0,
        dispatchPcs: checked ? r.pendingPcs : 0,
      }))
    );
  };

  const handleToggleRow = (key: string) => {
    setItemRows(prev =>
      prev.map(r => {
        if (r.key !== key) return r;
        const nowSelected = !r.selected;
        return {
          ...r,
          selected: nowSelected,
          dispatchGbl: nowSelected ? r.pendingQty : 0,
          dispatchPcs: nowSelected ? r.pendingPcs : 0,
        };
      })
    );
  };

  const handleDispatchQtyChange = (key: string, val: number) => {
    setItemRows(prev =>
      prev.map(r => {
        if (r.key !== key) return r;
        const clamped = Math.max(0, Math.min(val, r.pendingQty));
        const pcs = r.isGblItem ? Math.round(clamped * r.pcsPerGbl) : clamped;
        return { ...r, dispatchGbl: clamped, dispatchPcs: pcs, selected: clamped > 0 };
      })
    );
  };

  /* ─── Computed totals ─── */
  const totals = useMemo(() => {
    const active = itemRows.filter(r => r.selected && r.dispatchGbl > 0);
    const totalDispatchGbl = active.reduce((s, r) => s + r.dispatchGbl, 0);
    const totalDispatchPcs = active.reduce((s, r) => s + r.dispatchPcs, 0);
    const totalPendingGbl = itemRows.reduce((s, r) => s + r.pendingQty, 0);
    const totalPendingPcs = itemRows.reduce((s, r) => s + r.pendingPcs, 0);
    const remainingGbl = Math.max(0, totalPendingGbl - totalDispatchGbl);
    const remainingPcs = Math.max(0, totalPendingPcs - totalDispatchPcs);
    return {
      totalDispatchGbl,
      totalDispatchPcs,
      totalPendingGbl,
      totalPendingPcs,
      remainingGbl,
      remainingPcs,
      fullyDispatched: remainingGbl <= 0 && totalPendingGbl > 0,
    };
  }, [itemRows]);

  /* ─── Submit ─── */
  const buildAndSubmit = async (asDraft: boolean) => {
    if (!activeOrder) { showToast('Please select a sales order', 'error'); return; }
    if (totals.totalDispatchGbl <= 0) {
      showToast('Please enter dispatch quantity for at least one item', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const activeRows = itemRows.filter(r => r.selected && r.dispatchGbl > 0);
      const dcItems = activeRows.map(r => ({
        itemId: String(r.skuId || r.skuCode || ''),
        skuId: r.skuId,
        skuCode: r.skuCode,
        itemName: r.itemName,
        orderedQty: r.orderedQty,
        deliveredQty: r.dispatchGbl,
        deliveredPcs: r.dispatchPcs,
        uom: r.uom,
        price: r.unitPrice,
        total: r.dispatchGbl * (r.unitPrice || 0),
      }));

      const challanPayload = {
        dcNumber,
        orderId: activeOrder._id,
        orderNumber: activeOrder.orderNumber,
        customerName: activeOrder.customerName || 'Customer',
        customerId: (activeOrder.customer as any)?._id || (activeOrder as any).customerId,
        date: dispatchDate || new Date().toISOString().split('T')[0],
        transporterName: transporter.trim(),
        lrNumber: lrNumber.trim(),
        lrDate,
        items: dcItems,
        billToAddress,
        shipToAddress: sameAsBillTo ? billToAddress : shipToAddress,
        sameAsBillTo,
        subtotal: activeRows.reduce((s, r) => s + r.dispatchGbl * (r.unitPrice || 0), 0),
        status: asDraft ? 'draft' : 'dispatched',
        remarks: remarks.trim(),
        company: selectedCompany?._id,
        dispatchType,
        totalGbl: totals.totalDispatchGbl,
        totalPcs: totals.totalDispatchPcs,
        remainingGbl: totals.remainingGbl,
        remainingPcs: totals.remainingPcs,
        fulfillmentStatus: totals.fullyDispatched ? 'Fully Dispatched' : 'Partially Dispatched',
      };

      let createdChallan: any = challanPayload;
      try {
        const res = await createDeliveryChallan(challanPayload);
        if (res?.data) createdChallan = res.data;
      } catch (apiErr) {
        console.warn('createDeliveryChallan API fallback:', apiErr);
      }

      // Update sales order dispatched quantities
      const updatedItems = (activeOrder.items || []).map((item, idx) => {
        const row = itemRows.find(r => r.key === (item._id || `item-${idx}`));
        if (!row) return item;
        return { ...item, dispatchedQty: (Number(item.dispatchedQty) || 0) + row.dispatchGbl };
      });
      const allFulfilled = updatedItems.every(i => (Number(i.dispatchedQty) || 0) >= (Number(i.quantity) || 0));
      const someDispatched = updatedItems.some(i => (Number(i.dispatchedQty) || 0) > 0);
      const updatedOrder: SalesOrderV2 = {
        ...activeOrder,
        items: updatedItems,
        fulfillmentStatus: allFulfilled ? 'Fulfilled' : someDispatched ? 'Partially Dispatched' : (activeOrder.fulfillmentStatus || 'Pending'),
        status: allFulfilled ? 'Delivered' : someDispatched ? 'Partially Delivered' : (activeOrder.status || 'Confirmed'),
      };

      saveCustomSalesOrder(updatedOrder, selectedCompany?._id);
      if (activeOrder._id && !activeOrder._id.startsWith('seed-') && !activeOrder._id.startsWith('so-mock-')) {
        updateSalesOrderV2(activeOrder._id, updatedOrder).catch(() => {});
      }

      // Cache in localStorage
      const cKey = `skbw_delivery_challans_${selectedCompany?._id || 'default'}`;
      const stored = JSON.parse(localStorage.getItem(cKey) || '[]');
      localStorage.setItem(cKey, JSON.stringify([createdChallan, ...stored]));

      showToast(`Dispatch ${dcNumber} ${asDraft ? 'saved as draft' : 'created successfully'}!`, 'success');
      window.dispatchEvent(new CustomEvent('stock_balance_changed'));
      window.dispatchEvent(new CustomEvent('sales_order_updated'));
      onDispatchCreated(createdChallan);
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast('Failed to create dispatch', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  /* ─── Customer derived fields ─── */
  const contactNo =
    (activeOrder as any)?.customerPhone ||
    (activeOrder?.customer as any)?.phone ||
    (activeOrder?.customer as any)?.mobile || '';
  const region =
    (activeOrder as any)?.region ||
    (activeOrder as any)?.city ||
    (activeOrder as any)?.billingAddress?.state || '';
  const orderDateDisplay = activeOrder
    ? (() => {
        const d = new Date((activeOrder as any).orderDate || (activeOrder as any).createdAt || Date.now());
        return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      })()
    : '—';

  /* ─── Portal render ─── */
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 920, maxHeight: '94vh', margin: '0 16px' }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* ── HEADER ─────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Truck className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900 tracking-tight">
                {dispatchType === 'partial' ? 'Create Dispatch (Partial)' : 'Create Dispatch'}
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {dispatchType === 'partial'
                  ? <>Dispatch selected items and quantities for Sales Order <strong className="text-gray-800">{activeOrder?.orderNumber}</strong>.</>
                  : <>Create a dispatch for Sales Order <strong className="text-gray-800">{activeOrder?.orderNumber}</strong>. You can dispatch full or partial quantities.</>
                }
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── SCROLLABLE BODY ─────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ① ORDER & CUSTOMER DETAILS */}
          <Section num={1} label="Order & Customer Details" color="blue">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <FieldLabel>Sales Order <Required /></FieldLabel>
                <select
                  value={selectedOrderId}
                  onChange={e => {
                    setSelectedOrderId(e.target.value);
                    const m = allOrders.find(o => o._id === e.target.value);
                    if (m && onOrderChange) onOrderChange(m);
                  }}
                  className="w-full h-8 bg-white border border-gray-200 rounded-lg px-2.5 text-xs font-semibold text-gray-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="">— Select Sales Order —</option>
                  {(allOrders.length > 0 ? allOrders : order ? [order] : []).map(o => (
                    <option key={o._id} value={o._id}>{o.orderNumber}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Order Date</FieldLabel>
                <ReadOnlyField>{orderDateDisplay}</ReadOnlyField>
              </div>
              <div>
                <FieldLabel>Customer</FieldLabel>
                <ReadOnlyField>{activeOrder?.customerName || '—'}</ReadOnlyField>
              </div>
              <div>
                <FieldLabel>Contact No.</FieldLabel>
                <ReadOnlyField icon={<Phone className="w-3 h-3 text-gray-400" />}>
                  {contactNo || '—'}
                </ReadOnlyField>
              </div>
              <div>
                <FieldLabel>Region</FieldLabel>
                <ReadOnlyField icon={<MapPin className="w-3 h-3 text-gray-400" />}>
                  {region || '—'}
                </ReadOnlyField>
              </div>
            </div>
          </Section>

          {/* ── Empty state when no order selected ── */}
          {!activeOrder && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
                <Truck className="w-7 h-7 text-blue-300" />
              </div>
              <p className="text-sm font-bold text-gray-400">Select a Sales Order to continue</p>
              <p className="text-xs text-gray-300 mt-1">Order details, items, and addresses will appear here</p>
            </div>
          )}

          {activeOrder && (
            <>
              {/* ② DISPATCH TYPE */}
              <Section num={2} label="Dispatch Type" color="blue">
            <div className="grid grid-cols-2 gap-3">
              <TypeCard
                id="full"
                title="Full Dispatch"
                desc="Dispatch all pending items and quantities for this order."
                active={dispatchType === 'full'}
                onSelect={() => setDispatchType('full')}
              />
              <TypeCard
                id="partial"
                title="Partial Dispatch"
                desc="Select items and enter quantities to dispatch."
                active={dispatchType === 'partial'}
                onSelect={() => setDispatchType('partial')}
              />
            </div>
          </Section>

          {/* ③ ITEMS TO DISPATCH */}
          <Section
            num={3}
            label={dispatchType === 'full' ? 'Items to Dispatch (All Pending Items)' : 'Items to Dispatch (Select quantities)'}
            color="blue"
          >
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase tracking-wider">
                    {dispatchType === 'partial' && (
                      <th className="py-2 px-3 w-8 text-center">
                        <input
                          ref={checkboxRef}
                          type="checkbox"
                          checked={allSelected}
                          onChange={e => handleToggleAll(e.target.checked)}
                          className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="py-2 px-3 w-8 text-center">#</th>
                    <th className="py-2 px-3">Item Code</th>
                    <th className="py-2 px-3">Item Name</th>
                    <th className="py-2 px-2 text-right">
                      Pending Qty<br /><span className="font-semibold normal-case text-gray-400">(GBL)</span>
                    </th>
                    <th className="py-2 px-2 text-right">
                      Pending Qty<br /><span className="font-semibold normal-case text-gray-400">(PCS)</span>
                    </th>
                    <th className="py-2 px-2 text-right">
                      Dispatch Qty<br /><span className="font-semibold normal-case text-gray-400">(GBL)</span>
                    </th>
                    <th className="py-2 px-2 text-right">
                      Dispatch Qty<br /><span className="font-semibold normal-case text-gray-400">(PCS)</span>
                    </th>
                    <th className="py-2 px-3 text-right">
                      {dispatchType === 'partial' ? 'Remaining After' : 'After Dispatch'}<br />
                      <span className="font-semibold normal-case text-gray-400">(GBL | PCS)</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {itemRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center">
                        <Package className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                        <p className="text-gray-400 text-xs">No items found in this order</p>
                      </td>
                    </tr>
                  ) : (
                    itemRows.map((row, idx) => {
                      const afterGbl = Math.max(0, row.pendingQty - row.dispatchGbl);
                      const afterPcs = Math.max(0, row.pendingPcs - row.dispatchPcs);
                      const dimmed = dispatchType === 'partial' && !row.selected;
                      return (
                        <tr
                          key={row.key}
                          className={`transition-colors ${dimmed ? 'opacity-40' : 'hover:bg-blue-50/20'}`}
                        >
                          {dispatchType === 'partial' && (
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={row.selected}
                                onChange={() => handleToggleRow(row.key)}
                                className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="py-2.5 px-3 text-center text-gray-400 font-semibold">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-gray-700">{row.itemCode}</td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-gray-900 flex items-center gap-1.5 flex-wrap">
                              <span>{row.itemName}</span>
                              {row.isAvailable ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                  In Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  Needs Mfg
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-bold font-mono text-gray-800">{row.pendingQty}</td>
                          <td className="py-2.5 px-2 text-right font-mono text-gray-600">{row.pendingPcs.toLocaleString()}</td>
                          <td className="py-2.5 px-2 text-right">
                            {dispatchType === 'full' ? (
                              <span className="font-bold font-mono text-blue-700">{row.dispatchGbl}</span>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                max={row.pendingQty}
                                step="any"
                                value={row.dispatchGbl || ''}
                                placeholder="0"
                                onChange={e => handleDispatchQtyChange(row.key, Number(e.target.value))}
                                className="w-16 h-7 px-2 border border-gray-300 rounded-md text-right font-mono font-bold text-gray-900 focus:outline-none focus:border-blue-500 text-xs bg-white"
                              />
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-gray-600">{row.dispatchPcs.toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            <span className={`font-bold text-xs ${afterGbl > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {afterGbl} GBL
                            </span>
                            <span className="text-gray-300 mx-1">|</span>
                            <span className={`text-xs ${afterPcs > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                              ({afterPcs.toLocaleString()} PCS)
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  {/* Totals row */}
                  {itemRows.length > 0 && (
                    <tr className="bg-gray-50 border-t-2 border-gray-200 text-xs font-black">
                      {dispatchType === 'partial' && <td />}
                      <td />
                      <td colSpan={2} className="py-2 px-3 text-gray-500 uppercase text-[10px] tracking-wider">Total</td>
                      <td className="py-2 px-2 text-right font-black font-mono text-gray-900">
                        {totals.totalPendingGbl}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-gray-700">
                        {totals.totalPendingPcs.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-right font-black font-mono text-blue-700">
                        {totals.totalDispatchGbl}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-blue-600">
                        {totals.totalDispatchPcs.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        <span className={`font-bold text-xs ${totals.remainingGbl > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {totals.remainingGbl} GBL
                        </span>
                        <span className="text-gray-300 mx-1">|</span>
                        <span className={`text-xs ${totals.remainingPcs > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                          ({totals.remainingPcs.toLocaleString()} PCS)
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ④ DISPATCH DETAILS + ADDRESSES */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Dispatch Details — left 3/5 */}
            <div className="lg:col-span-3">
              <SectionInner num={4} label="Dispatch Details" color="blue">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Dispatch Date <Required /></FieldLabel>
                    <input
                      type="date"
                      value={dispatchDate}
                      onChange={e => setDispatchDate(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <FieldLabel>Transporter <Required /></FieldLabel>
                    <input
                      type="text"
                      placeholder="e.g. Chennupati Cargo Services"
                      value={transporter}
                      onChange={e => setTransporter(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <FieldLabel>LR/RR No.</FieldLabel>
                    <input
                      type="text"
                      placeholder="e.g. LR124578"
                      value={lrNumber}
                      onChange={e => setLrNumber(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <FieldLabel>LR/RR Date</FieldLabel>
                    <input
                      type="date"
                      value={lrDate}
                      onChange={e => setLrDate(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Remarks (Optional)</FieldLabel>
                    <input
                      type="text"
                      value={remarks}
                      onChange={e => setRemarks(e.target.value)}
                      placeholder="Add remarks about this dispatch..."
                      className="w-full h-8 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </SectionInner>
            </div>

            {/* Billing & Delivery — right 2/5 */}
            <div className="lg:col-span-2">
              <div className="h-full border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="bg-blue-50/60 px-4 py-2 border-b border-blue-100 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-[11px] font-black text-gray-800 uppercase tracking-wider">Billing & Delivery Addresses</span>
                </div>
                <div className="p-4 space-y-3">
                  {/* Bill To */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Bill To (Customer Address)</span>
                      <button
                        type="button"
                        onClick={() => setEditBillTo(p => !p)}
                        className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        <Edit3 className="w-2.5 h-2.5" />
                        {editBillTo ? 'Done' : 'Edit'}
                      </button>
                    </div>
                    {editBillTo ? (
                      <textarea
                        rows={3}
                        value={billToAddress}
                        onChange={e => setBillToAddress(e.target.value)}
                        className="w-full text-xs border border-blue-300 rounded-lg p-2 focus:outline-none focus:border-blue-500 font-medium text-gray-800 resize-none"
                      />
                    ) : (
                      <div className="text-xs text-gray-700 leading-[1.6] bg-gray-50 rounded-lg p-2.5 border border-gray-100 whitespace-pre-line min-h-[52px]">
                        {billToAddress || '—'}
                      </div>
                    )}
                  </div>

                  {/* Same as checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sameAsBillTo}
                      onChange={e => {
                        setSameAsBillTo(e.target.checked);
                        if (e.target.checked) setShipToAddress(billToAddress);
                      }}
                      className="w-3.5 h-3.5 rounded accent-blue-600"
                    />
                    <span className="text-[11px] font-semibold text-gray-600">Same as Bill To</span>
                  </label>

                  {/* Ship To */}
                  {!sameAsBillTo && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Ship To (Delivery Address)</span>
                        <button
                          type="button"
                          onClick={() => setEditShipTo(p => !p)}
                          className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                          {editShipTo ? 'Done' : 'Edit'}
                        </button>
                      </div>
                      {editShipTo ? (
                        <textarea
                          rows={3}
                          value={shipToAddress}
                          onChange={e => setShipToAddress(e.target.value)}
                          className="w-full text-xs border border-blue-300 rounded-lg p-2 focus:outline-none focus:border-blue-500 font-medium text-gray-800 resize-none"
                        />
                      ) : (
                        <div className="text-xs text-gray-700 leading-[1.6] bg-gray-50 rounded-lg p-2.5 border border-gray-100 whitespace-pre-line min-h-[52px]">
                          {shipToAddress || '—'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ⑤ DISPATCH SUMMARY */}
          <Section num={5} label="Dispatch Summary" color="green">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  {dispatchType === 'partial' ? 'Dispatching' : 'Total Dispatching'}
                </p>
                <p className="text-2xl font-black text-blue-700 font-mono leading-none">
                  {totals.totalDispatchGbl}
                  <span className="text-sm font-bold ml-1">GBL</span>
                </p>
                <p className="text-xs font-bold text-blue-500 font-mono mt-0.5">
                  ({totals.totalDispatchPcs.toLocaleString()} PCS)
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Remaining After Dispatch</p>
                <p className={`text-2xl font-black font-mono leading-none ${totals.remainingGbl > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {totals.remainingGbl}
                  <span className="text-sm font-bold ml-1">GBL</span>
                </p>
                <p className={`text-xs font-bold font-mono mt-0.5 ${totals.remainingGbl > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  ({totals.remainingPcs.toLocaleString()} PCS)
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Status After Posting</p>
                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border ${
                  totals.fullyDispatched
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {totals.fullyDispatched ? 'Fully Dispatched' : 'Partially Dispatched'}
                </span>
              </div>
            </div>
          </Section>
            </>
          )}
        </div>

        {/* ── FOOTER ─────────────────────────────── */}
        <div className="px-6 py-3.5 border-t border-gray-200 bg-gray-50/60 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSubmitting || !activeOrder || totals.totalDispatchGbl <= 0}
              onClick={() => buildAndSubmit(true)}
              className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all ${
                activeOrder && totals.totalDispatchGbl > 0
                  ? 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50 cursor-pointer'
                  : 'text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              Save as Draft
            </button>
            <button
              type="button"
              disabled={isSubmitting || !activeOrder || totals.totalDispatchGbl <= 0}
              onClick={() => buildAndSubmit(false)}
              className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm ${
                activeOrder && totals.totalDispatchGbl > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200/60 cursor-pointer'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Printer className="w-3.5 h-3.5" />
                  <span>Save & Print</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ─── Small helper components ─── */

function Section({
  num, label, color, children,
}: {
  num: number;
  label: string;
  color: 'blue' | 'green';
  children: React.ReactNode;
}) {
  const bg = color === 'green' ? 'bg-emerald-50/60 border-b-emerald-100' : 'bg-blue-50/60 border-b-blue-100';
  const dot = color === 'green' ? 'bg-emerald-600' : 'bg-blue-600';
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
      <div className={`${bg} px-4 py-2 border-b flex items-center gap-2`}>
        <div className={`w-5 h-5 rounded-md ${dot} text-white flex items-center justify-center text-[10px] font-black shrink-0`}>
          {num}
        </div>
        <span className="text-[11px] font-black text-gray-800 uppercase tracking-wider">{label}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function SectionInner({
  num, label, color, children,
}: {
  num: number;
  label: string;
  color: 'blue' | 'green';
  children: React.ReactNode;
}) {
  const dot = color === 'green' ? 'bg-emerald-600' : 'bg-blue-600';
  return (
    <div className="h-full border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
      <div className="bg-blue-50/60 px-4 py-2 border-b border-blue-100 flex items-center gap-2">
        <div className={`w-5 h-5 rounded-md ${dot} text-white flex items-center justify-center text-[10px] font-black shrink-0`}>
          {num}
        </div>
        <span className="text-[11px] font-black text-gray-800 uppercase tracking-wider">{label}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
      {children}
    </label>
  );
}

function Required() {
  return <span className="text-rose-500 ml-0.5">*</span>;
}

function ReadOnlyField({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="h-8 bg-gray-50 border border-gray-200 rounded-lg px-2.5 text-xs font-semibold text-gray-700 flex items-center gap-1.5 truncate">
      {icon}
      {children}
    </div>
  );
}

function TypeCard({
  id, title, desc, active, onSelect,
}: {
  id: string;
  title: string;
  desc: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      htmlFor={`dispatch-type-${id}`}
      className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
        active
          ? 'border-blue-500 bg-blue-50/50'
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <input
        id={`dispatch-type-${id}`}
        type="radio"
        name="dispatchType"
        value={id}
        checked={active}
        onChange={onSelect}
        className="mt-0.5 accent-blue-600 shrink-0"
      />
      <div>
        <p className="text-xs font-black text-gray-900">{title}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{desc}</p>
      </div>
    </label>
  );
}

export default CreateDispatchModal;


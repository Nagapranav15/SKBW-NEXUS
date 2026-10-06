import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Truck, Package, CheckCircle2, Printer,
  Edit3, MapPin, Phone, Save, Plus, Trash2, Calendar
} from 'lucide-react';
import { SalesOrderV2, updateSalesOrderV2 } from '../../api/salesOrderApiV2';
import { createDeliveryChallan, updateDeliveryChallan } from '../../api/deliveryChallanApi';
import { saveCustomSalesOrder } from '../../utils/salesOrderStorage';
import { getBalancesV2, getSkusV2 } from '../../api/mfgApiV2';
import { getParties } from '../../api/partyApi';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../ui/Toast';

export interface CreateDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SalesOrderV2 | null;
  allOrders?: SalesOrderV2[];
  editingChallan?: any;
  isDirectDispatch?: boolean;
  onOrderChange?: (newOrder: SalesOrderV2 | null) => void;
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

export const CreateDispatchModal: React.FC<CreateDispatchModalProps> = ({
  isOpen,
  onClose,
  order,
  allOrders = [],
  editingChallan,
  isDirectDispatch = false,
  onOrderChange,
  onDispatchCreated,
}) => {
  const { selectedCompany } = useAuth();
  const checkboxRef = useRef<HTMLInputElement>(null);

  // Dispatch Mode: 'order' | 'direct'
  const isEditing = Boolean(editingChallan);
  const [dispatchMode, setDispatchMode] = useState<'order' | 'direct'>(() => {
    if (editingChallan) {
      return (editingChallan.orderNumber === 'DIRECT' || !editingChallan.orderId) ? 'direct' : 'order';
    }
    return isDirectDispatch || !order ? 'direct' : 'order';
  });

  // Direct Customer info state
  const [directCustomerName, setDirectCustomerName] = useState('');
  const [directCustomerPhone, setDirectCustomerPhone] = useState('');
  const [directRegion, setDirectRegion] = useState('');

  // Parties & Master SKUs for direct creation
  const [partyOptions, setPartyOptions] = useState<any[]>([]);
  const [availableSkus, setAvailableSkus] = useState<any[]>([]);

  // Order selection
  const [selectedOrderId, setSelectedOrderId] = useState<string>(() => order?._id || '');
  const activeOrder = useMemo(() => {
    if (dispatchMode === 'direct') return null;
    return (selectedOrderId ? (allOrders.find(o => o._id === selectedOrderId) ?? order ?? null) : (order ?? null));
  }, [allOrders, selectedOrderId, order, dispatchMode]);

  // Live stock map for displaying stock availability of order items
  const [modalStockMap, setModalStockMap] = useState<Map<string, { pcs: number; gbl: number }>>(new Map());

  // Dispatch type
  const [dispatchType, setDispatchType] = useState<'full' | 'partial'>('full');

  // Dispatch details
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [transporter, setTransporter] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [lrDate, setLrDate] = useState('');
  const [remarks, setRemarks] = useState('');

  // Address
  const [sameAsBillTo, setSameAsBillTo] = useState(true);
  const [editBillTo, setEditBillTo] = useState(false);
  const [editShipTo, setEditShipTo] = useState(false);
  const [billToAddress, setBillToAddress] = useState('');
  const [shipToAddress, setShipToAddress] = useState('');

  // Items
  const [itemRows, setItemRows] = useState<ItemRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // DC Number
  const dcNumber = useMemo(() => {
    if (editingChallan?.dcNumber) return editingChallan.dcNumber;
    const y = new Date().getFullYear();
    const r = Math.floor(1000 + Math.random() * 9000);
    return `DC-${y}-${r}`;
  }, [editingChallan]);

  // Load parties & SKUs when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const compId = selectedCompany?._id;
    if (!compId) return;

    // Load SKUs & balances
    Promise.all([
      getBalancesV2(compId).catch(() => []),
      getSkusV2(compId).catch(() => []),
      getParties({ company: compId, limit: 1000, light: true }).catch(() => ({ data: [] }))
    ]).then(([balances, skus, partiesRes]) => {
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
      setAvailableSkus(sList);

      const pList = Array.isArray(partiesRes) ? partiesRes : (partiesRes?.data || partiesRes?.parties || []);
      setPartyOptions(Array.isArray(pList) ? pList : []);
    }).catch(err => {
      console.warn('Failed to load modal dependencies:', err);
    });
  }, [isOpen, selectedCompany?._id]);

  // Synchronize initial state when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (editingChallan) {
      // Pre-fill from existing challan for editing
      const ch = editingChallan;
      setDirectCustomerName(ch.customerName || '');
      setTransporter(ch.transporterName || '');
      setVehicleNumber(ch.vehicleNumber || '');
      setLrNumber(ch.lrNumber || '');
      setLrDate(ch.lrDate || '');
      setRemarks(ch.remarks || ch.notes || '');
      setDispatchDate(ch.date || new Date().toISOString().split('T')[0]);
      setBillToAddress(ch.billToAddress || '');
      setShipToAddress(ch.shipToAddress || '');
      setSameAsBillTo(ch.sameAsBillTo ?? (ch.billToAddress === ch.shipToAddress));

      if (ch.items && Array.isArray(ch.items)) {
        setItemRows(ch.items.map((it: any, idx: number) => {
          const qty = Number(it.deliveredQty || it.quantity || it.orderedQty || 0);
          const pcs = Number(it.deliveredPcs || it.pcs || qty * 100);
          return {
            key: it._id || `edit-item-${idx}`,
            itemCode: it.skuCode || `FG-${idx + 1}`,
            itemName: it.itemName || 'Item',
            uom: it.uom || 'GBL',
            pcsPerGbl: 100,
            orderedQty: qty,
            dispatchedQty: qty,
            pendingQty: qty,
            pendingPcs: pcs,
            isGblItem: (it.uom || '').toUpperCase() === 'GBL',
            selected: true,
            dispatchGbl: qty,
            dispatchPcs: pcs,
            skuId: it.skuId,
            skuCode: it.skuCode,
            unitPrice: Number(it.price || it.unitPrice || 0),
            stockOnHandGbl: 0,
            stockOnHandPcs: 0,
            isAvailable: true
          };
        }));
      }
      return;
    }

    if (isDirectDispatch || !order) {
      setDispatchMode('direct');
      if (itemRows.length === 0) {
        // Start with one empty item row in direct mode
        handleAddNewDirectItem();
      }
    } else {
      setDispatchMode('order');
      if (order?._id) setSelectedOrderId(order._id);
    }
  }, [isOpen, editingChallan, isDirectDispatch, order]);

  // Handle adding a new item row in Direct Dispatch mode
  const handleAddNewDirectItem = () => {
    const newKey = `direct-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newRow: ItemRow = {
      key: newKey,
      itemCode: '',
      itemName: '',
      uom: 'GBL',
      pcsPerGbl: 100,
      orderedQty: 0,
      dispatchedQty: 0,
      pendingQty: 1,
      pendingPcs: 100,
      isGblItem: true,
      selected: true,
      dispatchGbl: 1,
      dispatchPcs: 100,
      skuId: undefined,
      skuCode: '',
      unitPrice: 0,
      stockOnHandGbl: 0,
      stockOnHandPcs: 0,
      isAvailable: true
    };
    setItemRows(prev => [...prev, newRow]);
  };

  const handleRemoveDirectItem = (key: string) => {
    setItemRows(prev => prev.filter(r => r.key !== key));
  };

  // Build item rows from active order when in 'order' mode
  useEffect(() => {
    if (dispatchMode !== 'order' || !activeOrder?.items || isEditing) return;

    if ((activeOrder as any).transporter && !transporter) {
      setTransporter((activeOrder as any).transporter);
    }

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
        isAvailable: hasStock
      };
    });

    setItemRows(rows);
  }, [activeOrder, modalStockMap, dispatchMode, isEditing]);

  // Sync dispatch qty when type changes in order mode
  useEffect(() => {
    if (dispatchMode !== 'order') return;
    setItemRows(prev =>
      prev.map(r => ({
        ...r,
        dispatchGbl: dispatchType === 'full' ? r.pendingQty : 0,
        dispatchPcs: dispatchType === 'full' ? r.pendingPcs : 0,
        selected: dispatchType === 'full' ? true : r.selected,
      }))
    );
  }, [dispatchType, dispatchMode]);

  // Indeterminate checkbox for "select all"
  const allSelected = itemRows.length > 0 && itemRows.every(r => r.selected);
  const someSelected = itemRows.some(r => r.selected);
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = !allSelected && someSelected;
    }
  }, [allSelected, someSelected]);

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
        const clamped = Math.max(0, dispatchMode === 'direct' ? val : Math.min(val, r.pendingQty));
        const pcs = r.isGblItem ? Math.round(clamped * r.pcsPerGbl) : clamped;
        return { ...r, dispatchGbl: clamped, dispatchPcs: pcs, selected: clamped > 0 };
      })
    );
  };

  // Direct item SKU selector change handler
  const handleDirectSkuChange = (key: string, skuIdOrCode: string) => {
    const selectedSku = availableSkus.find(s => s._id === skuIdOrCode || s.skuCode === skuIdOrCode);
    if (!selectedSku) return;

    const pcsPerGbl = Number(selectedSku.altUnitConversion || selectedSku.booksGbl || 100) || 100;
    const stock = modalStockMap.get(String(selectedSku._id)) || modalStockMap.get((selectedSku.skuCode || '').toLowerCase()) || { pcs: 0, gbl: 0 };
    const price = Number(selectedSku.sellingPrice || selectedSku.rate || 0);

    setItemRows(prev =>
      prev.map(r => {
        if (r.key !== key) return r;
        const gbl = r.dispatchGbl || 1;
        return {
          ...r,
          skuId: selectedSku._id,
          skuCode: selectedSku.skuCode,
          itemName: selectedSku.name,
          uom: selectedSku.unit || 'GBL',
          pcsPerGbl,
          unitPrice: price,
          stockOnHandGbl: stock.gbl,
          stockOnHandPcs: stock.pcs,
          dispatchGbl: gbl,
          dispatchPcs: gbl * pcsPerGbl,
          pendingQty: gbl,
          pendingPcs: gbl * pcsPerGbl,
          isAvailable: stock.gbl >= gbl
        };
      })
    );
  };

  // Direct party select handler
  const handleSelectParty = (partyId: string) => {
    const p = partyOptions.find(item => item._id === partyId || item.id === partyId);
    if (p) {
      setDirectCustomerName(p.name || p.companyName || '');
      setDirectCustomerPhone(p.phone || p.mobile || '');
      setDirectRegion(p.state || p.city || '');
      const addr = p.address || (p.city ? `${p.name}\n${p.city}${p.state ? ', ' + p.state : ''}` : '');
      if (addr) {
        setBillToAddress(addr);
        setShipToAddress(addr);
      }
    }
  };

  // Computed totals
  const totals = useMemo(() => {
    const active = itemRows.filter(r => r.selected && r.dispatchGbl > 0);
    const totalDispatchGbl = active.reduce((s, r) => s + r.dispatchGbl, 0);
    const totalDispatchPcs = active.reduce((s, r) => s + r.dispatchPcs, 0);
    const totalPendingGbl = itemRows.reduce((s, r) => s + (dispatchMode === 'direct' ? r.dispatchGbl : r.pendingQty), 0);
    const totalPendingPcs = itemRows.reduce((s, r) => s + (dispatchMode === 'direct' ? r.dispatchPcs : r.pendingPcs), 0);
    const remainingGbl = Math.max(0, totalPendingGbl - totalDispatchGbl);
    const remainingPcs = Math.max(0, totalPendingPcs - totalDispatchPcs);
    const totalAmount = active.reduce((s, r) => s + (r.dispatchGbl * (r.unitPrice || 0)), 0);

    return {
      totalDispatchGbl,
      totalDispatchPcs,
      totalPendingGbl,
      totalPendingPcs,
      remainingGbl,
      remainingPcs,
      totalAmount,
      fullyDispatched: remainingGbl <= 0 && totalPendingGbl > 0,
    };
  }, [itemRows, dispatchMode]);

  // Submit Handler: supports direct dispatch, SO dispatch, and editing existing challans
  const buildAndSubmit = async (asDraft: boolean) => {
    if (dispatchMode === 'direct') {
      if (!directCustomerName.trim()) {
        showToast('Please enter customer name for direct dispatch', 'error');
        return;
      }
    } else {
      if (!activeOrder) {
        showToast('Please select a sales order', 'error');
        return;
      }
    }

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
        orderedQty: r.orderedQty || r.dispatchGbl,
        deliveredQty: r.dispatchGbl,
        deliveredPcs: r.dispatchPcs,
        uom: r.uom,
        price: r.unitPrice,
        total: r.dispatchGbl * (r.unitPrice || 0),
      }));

      const finalCustomerName = dispatchMode === 'direct'
        ? directCustomerName.trim()
        : (activeOrder?.customerName || 'Customer');

      const challanPayload: any = {
        dcNumber,
        orderId: dispatchMode === 'direct' ? null : activeOrder?._id,
        orderNumber: dispatchMode === 'direct' ? 'DIRECT' : (activeOrder?.orderNumber || 'DIRECT'),
        customerName: finalCustomerName,
        customerId: dispatchMode === 'direct' ? null : ((activeOrder?.customer as any)?._id || (activeOrder as any)?.customerId),
        date: dispatchDate || new Date().toISOString().split('T')[0],
        transporterName: transporter.trim(),
        vehicleNumber: vehicleNumber.trim(),
        lrNumber: lrNumber.trim(),
        lrDate,
        items: dcItems,
        billToAddress,
        shipToAddress: sameAsBillTo ? billToAddress : shipToAddress,
        sameAsBillTo,
        subtotal: totals.totalAmount,
        status: asDraft ? 'draft' : 'dispatched',
        remarks: remarks.trim(),
        company: selectedCompany?._id,
        dispatchType: dispatchMode === 'direct' ? 'direct' : dispatchType,
        totalGbl: totals.totalDispatchGbl,
        totalPcs: totals.totalDispatchPcs,
        remainingGbl: totals.remainingGbl,
        remainingPcs: totals.remainingPcs,
        fulfillmentStatus: totals.fullyDispatched ? 'Fully Dispatched' : 'Partially Dispatched',
      };

      let resultChallan: any = challanPayload;

      if (isEditing && editingChallan?._id) {
        // UPDATE EXISTING DELIVERY CHALLAN
        try {
          const res = await updateDeliveryChallan(editingChallan._id, challanPayload);
          if (res?.data) resultChallan = res.data;
        } catch (apiErr) {
          console.warn('updateDeliveryChallan API fallback:', apiErr);
        }
      } else {
        // CREATE NEW DELIVERY CHALLAN
        try {
          const res = await createDeliveryChallan(challanPayload);
          if (res?.data) resultChallan = res.data;
        } catch (apiErr) {
          console.warn('createDeliveryChallan API fallback:', apiErr);
        }

        // If linked to a sales order, update order fulfilled quantities
        if (dispatchMode === 'order' && activeOrder) {
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
        }
      }

      // Update LocalStorage cache
      const cKey = `skbw_delivery_challans_${selectedCompany?._id || 'default'}`;
      const stored = JSON.parse(localStorage.getItem(cKey) || '[]');
      if (isEditing) {
        const filtered = stored.filter((c: any) => c._id !== editingChallan._id && c.dcNumber !== editingChallan.dcNumber);
        localStorage.setItem(cKey, JSON.stringify([resultChallan, ...filtered]));
      } else {
        localStorage.setItem(cKey, JSON.stringify([resultChallan, ...stored]));
      }

      showToast(
        isEditing
          ? `Dispatch ${dcNumber} updated successfully!`
          : `Dispatch ${dcNumber} ${asDraft ? 'saved as draft' : 'created successfully'}!`,
        'success'
      );

      window.dispatchEvent(new CustomEvent('stock_balance_changed'));
      window.dispatchEvent(new CustomEvent('sales_order_updated'));
      onDispatchCreated(resultChallan);
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast('Failed to save dispatch', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(3px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden max-w-4xl max-h-[94vh]"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shadow-blue-500/20">
              <Truck className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-gray-900 tracking-tight">
                  {isEditing ? `Edit Dispatch (${dcNumber})` : dispatchMode === 'direct' ? 'Create Direct Dispatch' : 'Create Dispatch from Sales Order'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200">
                  {dcNumber}
                </span>
                {dispatchMode === 'direct' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                    Standalone Batch
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {isEditing
                  ? 'Update dispatch quantities, vehicle, transporter, and delivery addresses.'
                  : dispatchMode === 'direct'
                  ? 'Create a delivery challan directly without linking to an existing Sales Order.'
                  : `Dispatch pending items for Sales Order ${activeOrder?.orderNumber || ''}.`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">

          {/* MODE SELECTOR TOGGLE (If not editing existing challan) */}
          {!isEditing && (
            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-200 gap-2">
              <span className="text-[11px] font-bold text-gray-600 pl-2">Dispatch Source:</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDispatchMode('order')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    dispatchMode === 'order'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>From Sales Order</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDispatchMode('direct');
                    if (itemRows.length === 0) handleAddNewDirectItem();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    dispatchMode === 'direct'
                      ? 'bg-purple-600 text-white shadow-2xs'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Direct Dispatch (No Sales Order)</span>
                </button>
              </div>
            </div>
          )}

          {/* ① CUSTOMER & ORDER DETAILS */}
          <Section num={1} label={dispatchMode === 'direct' ? 'Customer & Dispatch Destination' : 'Order & Customer Details'} color="blue">
            {dispatchMode === 'order' ? (
              /* SALES ORDER SOURCE FIELDS */
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                      <option key={o._id} value={o._id}>{o.orderNumber} ({o.customerName})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>Order Date</FieldLabel>
                  <ReadOnlyField>{activeOrder?.orderDate || '—'}</ReadOnlyField>
                </div>
                <div>
                  <FieldLabel>Customer / Party</FieldLabel>
                  <ReadOnlyField>{activeOrder?.customerName || '—'}</ReadOnlyField>
                </div>
                <div>
                  <FieldLabel>Contact Number</FieldLabel>
                  <ReadOnlyField icon={<Phone className="w-3 h-3 text-gray-400" />}>
                    {activeOrder?.customerPhone || (activeOrder?.customer as any)?.phone || '—'}
                  </ReadOnlyField>
                </div>
                <div>
                  <FieldLabel>Region</FieldLabel>
                  <ReadOnlyField icon={<MapPin className="w-3 h-3 text-gray-400" />}>
                    {activeOrder?.region || '—'}
                  </ReadOnlyField>
                </div>
              </div>
            ) : (
              /* DIRECT STANDALONE DISPATCH FIELDS */
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <FieldLabel>Select Party / Customer (Optional)</FieldLabel>
                    <select
                      onChange={e => handleSelectParty(e.target.value)}
                      className="w-full h-8 bg-white border border-gray-200 rounded-lg px-2.5 text-xs font-semibold text-gray-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="">— Choose from Directory —</option>
                      {partyOptions.map(p => (
                        <option key={p._id || p.id} value={p._id || p.id}>{p.name || p.companyName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Customer / Consignee Name <Required /></FieldLabel>
                    <input
                      type="text"
                      placeholder="e.g. Abbu Stationery"
                      value={directCustomerName}
                      onChange={e => setDirectCustomerName(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-gray-200 rounded-lg font-bold text-gray-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <FieldLabel>Contact Phone</FieldLabel>
                    <input
                      type="text"
                      placeholder="e.g. 9848012345"
                      value={directCustomerPhone}
                      onChange={e => setDirectCustomerPhone(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </Section>

          {/* ② DISPATCH TYPE (In Order mode) */}
          {dispatchMode === 'order' && (
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
                  desc="Select items and enter partial quantities to dispatch."
                  active={dispatchType === 'partial'}
                  onSelect={() => setDispatchType('partial')}
                />
              </div>
            </Section>
          )}

          {/* ③ ITEMS TO DISPATCH */}
          <Section
            num={dispatchMode === 'order' ? 3 : 2}
            label={dispatchMode === 'direct' ? 'Items in Direct Dispatch' : 'Items to Dispatch'}
            color="blue"
          >
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase tracking-wider">
                    {dispatchMode === 'order' && dispatchType === 'partial' && (
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
                    <th className="py-2 px-3">Item Name & SKU</th>
                    <th className="py-2 px-3 text-center">Available Stock</th>
                    <th className="py-2 px-2 text-right">
                      {dispatchMode === 'direct' ? 'Quantity (GBL)' : 'Pending Qty (GBL)'}
                    </th>
                    <th className="py-2 px-2 text-right">
                      {dispatchMode === 'direct' ? 'Quantity (PCS)' : 'Pending Qty (PCS)'}
                    </th>
                    <th className="py-2 px-2 text-right">Dispatch Qty (GBL)</th>
                    <th className="py-2 px-2 text-right">Rate (₹)</th>
                    <th className="py-2 px-3 text-right">Total (₹)</th>
                    {dispatchMode === 'direct' && <th className="py-2 px-2 text-center w-10">Remove</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {itemRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-gray-400">
                        <Package className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                        <p className="text-xs">No items added yet. Click "+ Add Item" below to add items.</p>
                      </td>
                    </tr>
                  ) : (
                    itemRows.map((row, idx) => {
                      const dimmed = dispatchMode === 'order' && dispatchType === 'partial' && !row.selected;
                      return (
                        <tr
                          key={row.key}
                          className={`transition-colors ${dimmed ? 'opacity-40' : 'hover:bg-blue-50/20'}`}
                        >
                          {dispatchMode === 'order' && dispatchType === 'partial' && (
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

                          {/* Item Name / SKU selection */}
                          <td className="py-2.5 px-3">
                            {dispatchMode === 'direct' ? (
                              <div className="space-y-1">
                                <select
                                  value={row.skuId || row.skuCode || ''}
                                  onChange={e => handleDirectSkuChange(row.key, e.target.value)}
                                  className="w-full h-7 bg-white border border-gray-300 rounded px-1.5 text-xs font-semibold text-gray-800"
                                >
                                  <option value="">— Select SKU Master Item —</option>
                                  {availableSkus.map(s => (
                                    <option key={s._id} value={s._id}>
                                      {s.name} ({s.skuCode}) — Stock: {s.presentStock || 0}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  placeholder="Or enter custom item name"
                                  value={row.itemName}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setItemRows(prev => prev.map(r => r.key === row.key ? { ...r, itemName: val } : r));
                                  }}
                                  className="w-full h-6 px-1.5 border border-gray-200 rounded text-[11px]"
                                />
                              </div>
                            ) : (
                              <div className="font-semibold text-gray-900 flex items-center gap-1.5 flex-wrap">
                                <span>{row.itemName}</span>
                                {row.skuCode && <span className="font-mono text-[10px] text-gray-400">({row.skuCode})</span>}
                              </div>
                            )}
                          </td>

                          {/* Live Warehouse Stock */}
                          <td className="py-2.5 px-3 text-center">
                            {row.stockOnHandGbl !== undefined && row.stockOnHandGbl > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                {row.stockOnHandGbl} GBL
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                0 Stock
                              </span>
                            )}
                          </td>

                          {/* Pending QTY GBL */}
                          <td className="py-2.5 px-2 text-right font-bold font-mono text-gray-800">
                            {dispatchMode === 'direct' ? row.dispatchGbl : row.pendingQty}
                          </td>

                          {/* Pending QTY PCS */}
                          <td className="py-2.5 px-2 text-right font-mono text-gray-600">
                            {(dispatchMode === 'direct' ? row.dispatchPcs : row.pendingPcs).toLocaleString()}
                          </td>

                          {/* Dispatch Qty GBL */}
                          <td className="py-2.5 px-2 text-right">
                            {dispatchMode === 'order' && dispatchType === 'full' ? (
                              <span className="font-bold font-mono text-blue-700">{row.dispatchGbl}</span>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={row.dispatchGbl || ''}
                                placeholder="0"
                                onChange={e => handleDispatchQtyChange(row.key, Number(e.target.value))}
                                className="w-16 h-7 px-2 border border-gray-300 rounded-md text-right font-mono font-bold text-gray-900 focus:outline-none focus:border-blue-500 text-xs bg-white"
                              />
                            )}
                          </td>

                          {/* Unit Rate */}
                          <td className="py-2.5 px-2 text-right font-mono">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.unitPrice || ''}
                              placeholder="0"
                              onChange={e => {
                                const p = Number(e.target.value);
                                setItemRows(prev => prev.map(r => r.key === row.key ? { ...r, unitPrice: p } : r));
                              }}
                              className="w-16 h-7 px-2 border border-gray-200 rounded-md text-right font-mono text-gray-800 text-xs"
                            />
                          </td>

                          {/* Total Amount */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">
                            ₹{(row.dispatchGbl * (row.unitPrice || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>

                          {/* Remove row button for direct mode */}
                          {dispatchMode === 'direct' && (
                            <td className="py-2.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveDirectItem(row.key)}
                                className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="Remove item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}

                  {/* Totals row */}
                  {itemRows.length > 0 && (
                    <tr className="bg-gray-50 border-t-2 border-gray-200 text-xs font-black">
                      {dispatchMode === 'order' && dispatchType === 'partial' && <td />}
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
                      <td className="py-2 px-2 text-right font-mono font-bold text-gray-700">
                        —
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-black text-blue-700">
                        ₹{totals.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      {dispatchMode === 'direct' && <td />}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Direct mode: Add Item button */}
            {dispatchMode === 'direct' && (
              <div className="pt-2 flex justify-start">
                <button
                  type="button"
                  onClick={handleAddNewDirectItem}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 border border-blue-200"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Item</span>
                </button>
              </div>
            )}
          </Section>

          {/* ④ DISPATCH DETAILS & ADDRESSES */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Dispatch Logistics Details */}
            <div className="lg:col-span-3">
              <SectionInner num={dispatchMode === 'order' ? 4 : 3} label="Dispatch & Transport Details" color="blue">
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
                    <FieldLabel>Transporter Name</FieldLabel>
                    <input
                      type="text"
                      placeholder="e.g. Chennupati Cargo / Self"
                      value={transporter}
                      onChange={e => setTransporter(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <FieldLabel>Vehicle Number</FieldLabel>
                    <input
                      type="text"
                      placeholder="e.g. TS09UA1234"
                      value={vehicleNumber}
                      onChange={e => setVehicleNumber(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <FieldLabel>LR / Bilty Number</FieldLabel>
                    <input
                      type="text"
                      placeholder="e.g. LR-987654"
                      value={lrNumber}
                      onChange={e => setLrNumber(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <FieldLabel>LR Date</FieldLabel>
                    <input
                      type="date"
                      value={lrDate}
                      onChange={e => setLrDate(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <FieldLabel>Remarks / Delivery Notes</FieldLabel>
                    <input
                      type="text"
                      value={remarks}
                      onChange={e => setRemarks(e.target.value)}
                      placeholder="Special instructions..."
                      className="w-full h-8 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </SectionInner>
            </div>

            {/* Addresses */}
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
                      className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
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

          {/* ⑤ SUMMARY */}
          <Section num={dispatchMode === 'order' ? 5 : 4} label="Dispatch Summary" color="green">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Total Dispatching</p>
                <p className="text-2xl font-black text-blue-700 font-mono leading-none">
                  {totals.totalDispatchGbl}
                  <span className="text-sm font-bold ml-1">GBL</span>
                </p>
                <p className="text-xs font-bold text-blue-500 font-mono mt-0.5">
                  ({totals.totalDispatchPcs.toLocaleString()} PCS)
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Total Valuation</p>
                <p className="text-2xl font-black text-emerald-700 font-mono leading-none">
                  ₹{totals.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">Estimated Challan Value</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Status</p>
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                  Ready to Dispatch
                </span>
              </div>
            </div>
          </Section>
        </div>

        {/* ── FOOTER ── */}
        <div className="px-6 py-3.5 border-t border-gray-200 bg-gray-50/70 flex items-center justify-between shrink-0">
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
              disabled={isSubmitting || totals.totalDispatchGbl <= 0}
              onClick={() => buildAndSubmit(true)}
              className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all ${
                totals.totalDispatchGbl > 0
                  ? 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50 cursor-pointer'
                  : 'text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              Save as Draft
            </button>
            <button
              type="button"
              disabled={isSubmitting || totals.totalDispatchGbl <= 0}
              onClick={() => buildAndSubmit(false)}
              className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm ${
                totals.totalDispatchGbl > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200/60 cursor-pointer'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Update & Save' : 'Save & Print'}</span>
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
        className="mt-0.5 accent-blue-600 shrink-0 cursor-pointer"
      />
      <div>
        <p className="text-xs font-black text-gray-900">{title}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{desc}</p>
      </div>
    </label>
  );
}

export default CreateDispatchModal;

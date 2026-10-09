import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Truck, Package, CheckCircle2, AlertTriangle, AlertCircle, Printer,
  Edit3, MapPin, Phone, Save, Plus, Trash2, Calendar, Search,
  ChevronDown, Building, RefreshCw, Check
} from 'lucide-react';
import { SalesOrderV2, updateSalesOrderV2 } from '../../api/salesOrderApiV2';
import { createDeliveryChallan, updateDeliveryChallan, getNextDeliveryChallanNumber } from '../../api/deliveryChallanApi';
import { saveCustomSalesOrder } from '../../utils/salesOrderStorage';
import { getBalancesV2, getSkusV2, getWarehouseHierarchyV2, WarehouseLocationV2 } from '../../api/mfgApiV2';
import { getParties } from '../../api/partyApi';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../ui/Toast';
import { LocationSelectModal } from '../inventory_v2/LocationSelectModal';

export interface StorageLocationOption {
  id: string;
  name: string;
  fullPath: string;
  level: string;
}

const extractParties = (res: any): any[] => {
  if (!res) return [];
  const d = res.data ?? res;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.parties)) return d.parties;
  if (Array.isArray(d?.customers)) return d.customers;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(res?.parties)) return res.parties;
  return [];
};

export interface SkuLocationStock {
  locationId: string;
  locationName: string;
  onHand: number;
  onHandGbl: number;
  onHandPcs: number;
}

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
  category?: string;
  unitPrice?: number;
  stockOnHandGbl?: number;
  stockOnHandPcs?: number;
  totalWarehouseStockGbl?: number;
  isAvailable?: boolean;
  locationId?: string;
  locationName?: string;
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
  const [selectedPartyId, setSelectedPartyId] = useState('');

  // Customer search & dropdown state
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [highlightedCustomerIdx, setHighlightedCustomerIdx] = useState(0);
  const customerRef = useRef<HTMLDivElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const customerDropdownListRef = useRef<HTMLDivElement>(null);

  // Parties & Master SKUs
  const [partyOptions, setPartyOptions] = useState<any[]>([]);
  const [availableSkus, setAvailableSkus] = useState<any[]>([]);

  // Order selection
  const [selectedOrderId, setSelectedOrderId] = useState<string>(() => order?._id || '');
  const activeOrder = useMemo(() => {
    if (dispatchMode === 'direct') return null;
    return (selectedOrderId ? (allOrders.find(o => o._id === selectedOrderId) ?? order ?? null) : (order ?? null));
  }, [allOrders, selectedOrderId, order, dispatchMode]);

  // Live stock & warehouse locations
  const [modalStockMap, setModalStockMap] = useState<Map<string, { pcs: number; gbl: number }>>(new Map());
  const [warehouseLocations, setWarehouseLocations] = useState<WarehouseLocationV2[]>([]);
  const [allStorageLocations, setAllStorageLocations] = useState<StorageLocationOption[]>([]);
  const [skuLocationStockMap, setSkuLocationStockMap] = useState<Map<string, SkuLocationStock[]>>(new Map());

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

  // Active item row for Location Selection Modal
  const [activeLocModalRowKey, setActiveLocModalRowKey] = useState<string | null>(null);

  const activeLocModalRow = useMemo(() => {
    return itemRows.find(r => r.key === activeLocModalRowKey) || null;
  }, [itemRows, activeLocModalRowKey]);

  const activeLocModalSkuId = useMemo(() => {
    if (!activeLocModalRow) return '';
    if (activeLocModalRow.skuId) {
      return String((activeLocModalRow.skuId as any)._id || activeLocModalRow.skuId);
    }
    const code = (activeLocModalRow.skuCode || '').toLowerCase().trim();
    const name = (activeLocModalRow.itemName || '').toLowerCase().trim();
    const matched = availableSkus.find(s =>
      (code && s.skuCode?.toLowerCase().trim() === code) ||
      (name && s.name?.toLowerCase().trim() === name)
    );
    return matched ? String(matched._id) : '';
  }, [activeLocModalRow, availableSkus]);

  // Selected party object for direct dispatch
  const selectedParty = useMemo(() => {
    if (!selectedPartyId) return null;
    return partyOptions.find(p => p._id === selectedPartyId || p.id === selectedPartyId) || null;
  }, [partyOptions, selectedPartyId]);

  // DC / DO Number
  const [fetchedDcNumber, setFetchedDcNumber] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editingChallan?.dcNumber) {
      setFetchedDcNumber(editingChallan.dcNumber);
      return;
    }
    const compId = selectedCompany?._id;
    getNextDeliveryChallanNumber(compId).then(seq => {
      if (seq) setFetchedDcNumber(seq);
    }).catch(() => {
      const cKey = `skbw_delivery_challans_${compId || 'default'}`;
      const stored = JSON.parse(localStorage.getItem(cKey) || '[]');
      let maxNum = 0;
      stored.forEach((c: any) => {
        if (c.dcNumber) {
          const match = c.dcNumber.match(/^(?:DO|DC)-?([0-9]+)$/i);
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      });
      setFetchedDcNumber(`DO-${String(maxNum + 1).padStart(3, '0')}`);
    });
  }, [isOpen, editingChallan, selectedCompany?._id]);

  const dcNumber = useMemo(() => {
    if (editingChallan?.dcNumber) return editingChallan.dcNumber;
    return fetchedDcNumber || 'DO-001';
  }, [editingChallan, fetchedDcNumber]);

  // Helper to compute stock at a specific location or its descendants
  const computeLocationStock = (
    locId: string,
    stockEntries: SkuLocationStock[]
  ): { gbl: number; pcs: number } => {
    if (!locId || !stockEntries || stockEntries.length === 0) return { gbl: 0, pcs: 0 };

    // 1. Exact match
    const direct = stockEntries.find(s => String(s.locationId) === String(locId));
    let totalGbl = direct ? direct.onHandGbl : 0;
    let totalPcs = direct ? direct.onHandPcs : 0;

    // 2. Child locations
    const childIds = new Set<string>();
    const collectDescendants = (parentId: string) => {
      warehouseLocations
        .filter(w => String(w.parentId) === String(parentId))
        .forEach(child => {
          const cId = String(child._id);
          if (!childIds.has(cId)) {
            childIds.add(cId);
            collectDescendants(cId);
          }
        });
    };
    collectDescendants(locId);

    stockEntries.forEach(se => {
      if (childIds.has(String(se.locationId))) {
        totalGbl += se.onHandGbl;
        totalPcs += se.onHandPcs;
      }
    });

    return { gbl: totalGbl, pcs: totalPcs };
  };

  // Load parties, SKUs, balances & warehouse hierarchy when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const compId = selectedCompany?._id;
    if (!compId) return;

    Promise.all([
      getBalancesV2(compId).catch(() => []),
      getSkusV2(compId).catch(() => []),
      getWarehouseHierarchyV2(compId).catch(() => []),
      getParties({ company: compId, limit: 1000, light: true }).catch(() => ({ data: [] }))
    ]).then(([balances, skus, locationsRes, partiesRes]) => {
      const locList = Array.isArray(locationsRes) ? locationsRes : [];
      setWarehouseLocations(locList);

      const locMap = new Map<string, WarehouseLocationV2>();
      locList.forEach((l: any) => { if (l._id) locMap.set(String(l._id), l); });

      const buildPath = (leaf: WarehouseLocationV2): string => {
        const parts = [leaf.name];
        let curr = leaf;
        while (curr.parentId) {
          const parent = locMap.get(String(curr.parentId));
          if (!parent) break;
          parts.unshift(parent.name);
          curr = parent;
        }
        return parts.join(' > ');
      };

      const storageOptions: StorageLocationOption[] = locList.map((l: any) => ({
        id: String(l._id),
        name: l.name,
        fullPath: buildPath(l),
        level: l.level
      }));
      setAllStorageLocations(storageOptions);

      const smap = new Map<string, { pcs: number; gbl: number }>();
      const skuPcsMap = new Map<string, number>();
      const locStockMap = new Map<string, SkuLocationStock[]>();
      const bList = Array.isArray(balances) ? balances : [];
      const sList = Array.isArray(skus) ? skus : [];

      bList.forEach((b: any) => {
        const rawId = b.skuId || b.sku?._id;
        const sId = rawId ? String((rawId as any)._id || rawId) : '';
        const qty = Number(b.onHand) || Number(b.quantity) || 0;
        if (sId) skuPcsMap.set(sId, (skuPcsMap.get(sId) || 0) + qty);

        const locId = b.locationId ? String((b.locationId as any)._id || b.locationId) : (b.location?._id ? String(b.location._id) : '');
        const locName = b.location?.name || locMap.get(locId)?.name || 'Storage Location';

        if (sId && locId && qty > 0) {
          const matchedSku = sList.find((s: any) => String(s._id) === sId) || b.sku;
          const pcsPerGbl = Number(matchedSku?.altUnitConversion || matchedSku?.booksGbl || 100) || 100;
          const unit = (matchedSku?.unit || '').toUpperCase().trim();
          const altUnit = (matchedSku?.altUnit || '').toUpperCase().trim();
          let gbl: number;
          let pcs: number;
          if (unit === 'GBL' || (altUnit && altUnit !== 'GBL' && unit.includes('GBL'))) {
            gbl = qty;
            pcs = qty * pcsPerGbl;
          } else {
            pcs = qty;
            gbl = pcsPerGbl > 0 ? Math.floor(qty / pcsPerGbl) : qty;
          }

          const stockEntry: SkuLocationStock = {
            locationId: locId,
            locationName: locName,
            onHand: qty,
            onHandGbl: gbl,
            onHandPcs: pcs
          };

          const addLoc = (k: string) => {
            if (!k) return;
            const arr = locStockMap.get(k) || [];
            if (!arr.some(e => e.locationId === locId)) arr.push(stockEntry);
            locStockMap.set(k, arr);
          };
          addLoc(sId);
          if (matchedSku?.skuCode) addLoc(matchedSku.skuCode.toLowerCase().trim());
          if (matchedSku?.name) addLoc(matchedSku.name.toLowerCase().trim());
        }
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

        // If this SKU has initial location or default location, register it in locStockMap if absent
        const defLocId = s.initialLocationId ? String(s.initialLocationId) : (s.defaultLocationId ? String(s.defaultLocationId) : '');
        if (defLocId && gbl > 0) {
          const defLocName = s.defaultLocation || locMap.get(defLocId)?.name || 'Default Location';
          const defaultEntry: SkuLocationStock = {
            locationId: defLocId,
            locationName: defLocName,
            onHand: rawOnHand,
            onHandGbl: gbl,
            onHandPcs: pcs
          };
          const addDef = (k: string) => {
            if (!k) return;
            const arr = locStockMap.get(k) || [];
            if (!arr.some(e => e.locationId === defLocId)) arr.push(defaultEntry);
            locStockMap.set(k, arr);
          };
          addDef(sId);
          if (code) addDef(code);
          if (name) addDef(name);
        }
      });

      setModalStockMap(smap);
      setSkuLocationStockMap(locStockMap);
      setAvailableSkus(sList);

      // Extract backend parties & merge local storage fallback
      const rawBackendParties: any[] = extractParties(partiesRes);

      let localParties: any[] = [];
      try {
        const stored = localStorage.getItem(`skbw_parties_${compId}`) || localStorage.getItem('parties');
        if (stored) {
          const parsed = JSON.parse(stored);
          localParties = extractParties(parsed);
        }
      } catch (e) {
        console.warn('Failed to parse local parties:', e);
      }

      const partyMap = new Map<string, any>();
      [...rawBackendParties, ...localParties].forEach((p: any) => {
        if (!p || p.isDeleted) return;
        const name = (p.firmName || p.name || p.companyName || p.ownerName || '').trim();
        if (!name) return;
        const key = (p._id || p.id || name).toString().toLowerCase();
        if (!partyMap.has(key)) {
          partyMap.set(key, { ...p, firmName: name });
        } else {
          const existing = partyMap.get(key);
          if (!existing.phone && p.phone) existing.phone = p.phone;
          if (!existing.mobile && p.mobile) existing.mobile = p.mobile;
          if (!existing.city && p.city) existing.city = p.city;
          if (!existing.state && p.state) existing.state = p.state;
          if (!existing.customerCode && p.customerCode) existing.customerCode = p.customerCode;
        }
      });

      const uniqueParties = Array.from(partyMap.values()).sort((a, b) =>
        (a.firmName || a.name || '').localeCompare(b.firmName || b.name || '')
      );

      setPartyOptions(uniqueParties);
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
      setCustomerSearch(ch.customerName || '');
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
            totalWarehouseStockGbl: 0,
            isAvailable: true,
            locationId: it.locationId,
            locationName: it.locationName || 'Main Storage'
          };
        }));
      }
      return;
    }

    if (isDirectDispatch || !order) {
      setDispatchMode('direct');
      if (itemRows.length === 0) {
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
    const firstLoc = allStorageLocations[0];
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
      category: '',
      unitPrice: 0,
      locationId: firstLoc?.id || '',
      locationName: firstLoc?.name || 'Storage Location',
      stockOnHandGbl: 0,
      stockOnHandPcs: 0,
      totalWarehouseStockGbl: 0,
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
      const dispatchedGbl = conv > 0 ? Math.floor(dispatchedPcs / conv) : dispatchedPcs;
      const pendingPcs = Math.max(0, orderedPcs - dispatchedPcs);
      const pendingGbl = Math.max(0, orderedGbl - dispatchedGbl) || (conv > 0 ? Math.ceil(pendingPcs / conv) : pendingPcs);

      const isGbl = (item.uom || '').toUpperCase() === 'GBL';
      const codeKey = (item.skuCode || '').toLowerCase().trim();
      const rawSkuId = (item.skuId as any)?._id || item.skuId;
      const idKey = rawSkuId ? String(rawSkuId) : '';
      const nameKey = (item.itemName || item.description || '').toLowerCase().trim();

      const totalStock = (idKey && modalStockMap.get(idKey)) ||
                         (codeKey && modalStockMap.get(codeKey)) ||
                         (nameKey && modalStockMap.get(nameKey)) ||
                         { pcs: 0, gbl: 0 };

      const stockLocs = (idKey && skuLocationStockMap.get(idKey)) ||
                        (codeKey && skuLocationStockMap.get(codeKey)) ||
                        (nameKey && skuLocationStockMap.get(nameKey)) || [];

      let chosenLocId = '';
      let chosenLocName = '';
      let chosenLocStockGbl = 0;
      let chosenLocStockPcs = 0;

      if (stockLocs.length > 0) {
        // Preferred: location with highest on-hand stock
        const withStock = stockLocs.filter(l => l.onHandGbl > 0);
        const sorted = (withStock.length > 0 ? withStock : stockLocs).sort((a, b) => b.onHandGbl - a.onHandGbl);
        chosenLocId = sorted[0].locationId;
        chosenLocName = sorted[0].locationName;
        const calculated = computeLocationStock(chosenLocId, stockLocs);
        chosenLocStockGbl = calculated.gbl;
        chosenLocStockPcs = calculated.pcs;
      } else if (allStorageLocations.length > 0) {
        chosenLocId = allStorageLocations[0].id;
        chosenLocName = allStorageLocations[0].name;
        chosenLocStockGbl = totalStock.gbl;
        chosenLocStockPcs = totalStock.pcs;
      }

      const matchedSku = availableSkus.find(s => 
        (idKey && String(s._id) === idKey) ||
        (codeKey && (s.skuCode || '').toLowerCase().trim() === codeKey) ||
        (nameKey && (s.name || '').toLowerCase().trim() === nameKey)
      );

      // Auto-populate price from Sales Order item or SKU Master
      let autoPrice = Number(
        (item as any).unitPrice ??
        (item as any).price ??
        (item as any).rate ??
        (item as any).sellingPrice ??
        (item as any).ratePerGbl ??
        0
      );

      if (autoPrice <= 0 && matchedSku) {
        autoPrice = Number(
          (matchedSku as any).sellingPrice ??
          (matchedSku as any).rate ??
          (matchedSku as any).costPrice ??
          (matchedSku as any).avgRate ??
          (matchedSku as any).avgCost ??
          0
        );
      }

      const hasStock = (chosenLocStockGbl >= pendingGbl && pendingGbl > 0) ||
                       (chosenLocStockPcs >= pendingPcs && pendingPcs > 0);

      return {
        key: item._id || `item-${idx}`,
        itemCode: item.skuCode || `FG-${String(idx + 1).padStart(3, '0')}`,
        itemName: item.itemName || item.description || '—',
        uom: item.uom || 'GBL',
        pcsPerGbl: conv,
        orderedQty: orderedPcs,
        dispatchedQty: dispatchedPcs,
        pendingQty: pendingGbl > 0 ? pendingGbl : pendingPcs,
        pendingPcs,
        isGblItem: isGbl,
        selected: true,
        dispatchGbl: pendingGbl,
        dispatchPcs: pendingPcs,
        skuId: rawSkuId,
        skuCode: item.skuCode,
        category: (item as any).category || '',
        unitPrice: autoPrice,
        locationId: (item as any).locationId || chosenLocId,
        locationName: (item as any).locationName || chosenLocName,
        stockOnHandGbl: chosenLocStockGbl,
        stockOnHandPcs: chosenLocStockPcs,
        totalWarehouseStockGbl: totalStock.gbl,
        isAvailable: hasStock
      };
    });

    setItemRows(rows);
  }, [activeOrder, modalStockMap, skuLocationStockMap, allStorageLocations, availableSkus, dispatchMode, isEditing]);

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

  // Change location for an individual item row
  const handleItemLocationChange = (key: string, newLocationId: string, customLocName?: string) => {
    setItemRows(prev =>
      prev.map(r => {
        if (r.key !== key) return r;
        const rawSkuId = (r.skuId as any)?._id || r.skuId;
        const idKey = rawSkuId ? String(rawSkuId) : '';
        const codeKey = (r.skuCode || '').toLowerCase().trim();
        const nameKey = (r.itemName || '').toLowerCase().trim();
        const stockLocs = (idKey && skuLocationStockMap.get(idKey)) ||
                          (codeKey && skuLocationStockMap.get(codeKey)) ||
                          (nameKey && skuLocationStockMap.get(nameKey)) || [];

        const calculated = computeLocationStock(newLocationId, stockLocs);
        let locName = customLocName;
        if (!locName) {
          const locObj = allStorageLocations.find(l => l.id === newLocationId) ||
                         warehouseLocations.find(l => String(l._id) === String(newLocationId));
          locName = locObj?.name || 'Storage Location';
        } else if (locName.includes(' > ')) {
          const parts = locName.split(' > ');
          locName = parts[parts.length - 1];
        }

        const hasStock = (calculated.gbl >= r.dispatchGbl && r.dispatchGbl > 0) ||
                         (calculated.pcs >= r.dispatchPcs && r.dispatchPcs > 0);

        return {
          ...r,
          locationId: newLocationId,
          locationName: locName,
          stockOnHandGbl: calculated.gbl,
          stockOnHandPcs: calculated.pcs,
          isAvailable: hasStock
        };
      })
    );
  };

  // Direct item SKU selector change handler
  const handleSelectSkuForDirectRow = (key: string, selectedSku: any) => {
    if (!selectedSku) return;

    const pcsPerGbl = Number(selectedSku.altUnitConversion || selectedSku.booksGbl || (selectedSku as any).pcsPerGbl || 100) || 100;
    const price = Number(
      selectedSku.sellingPrice ??
      selectedSku.rate ??
      (selectedSku as any).ratePerGbl ??
      selectedSku.costPrice ??
      (selectedSku as any).avgRate ??
      (selectedSku as any).avgCost ??
      selectedSku.purchasePrice ??
      0
    );
    const sId = String(selectedSku._id);
    const cKey = (selectedSku.skuCode || '').toLowerCase().trim();
    const nKey = (selectedSku.name || '').toLowerCase().trim();
    const stockLocs = skuLocationStockMap.get(sId) || skuLocationStockMap.get(cKey) || skuLocationStockMap.get(nKey) || [];
    const totalStock = modalStockMap.get(sId) || modalStockMap.get(cKey) || modalStockMap.get(nKey) || { pcs: 0, gbl: 0 };

    let chosenLocId = '';
    let chosenLocName = '';
    let locGbl = 0;
    let locPcs = 0;

    if (stockLocs.length > 0) {
      const withStock = stockLocs.filter(l => l.onHandGbl > 0);
      const sorted = (withStock.length > 0 ? withStock : stockLocs).sort((a, b) => b.onHandGbl - a.onHandGbl);
      chosenLocId = sorted[0].locationId;
      chosenLocName = sorted[0].locationName;
      const calculated = computeLocationStock(chosenLocId, stockLocs);
      locGbl = calculated.gbl;
      locPcs = calculated.pcs;
    } else if (allStorageLocations.length > 0) {
      chosenLocId = allStorageLocations[0].id;
      chosenLocName = allStorageLocations[0].name;
      locGbl = totalStock.gbl;
      locPcs = totalStock.pcs;
    }

    setItemRows(prev =>
      prev.map(r => {
        if (r.key !== key) return r;
        const gbl = r.dispatchGbl > 0 ? r.dispatchGbl : 1;
        return {
          ...r,
          skuId: selectedSku._id,
          skuCode: selectedSku.skuCode || '',
          itemName: selectedSku.name || '',
          category: selectedSku.category || '',
          uom: selectedSku.unit || 'GBL',
          pcsPerGbl,
          unitPrice: price,
          locationId: chosenLocId,
          locationName: chosenLocName,
          stockOnHandGbl: locGbl,
          stockOnHandPcs: locPcs,
          totalWarehouseStockGbl: totalStock.gbl,
          dispatchGbl: gbl,
          dispatchPcs: gbl * pcsPerGbl,
          pendingQty: gbl,
          pendingPcs: gbl * pcsPerGbl,
          isAvailable: locGbl >= gbl
        };
      })
    );
  };

  // Filtered party options for searchable customer dropdown
  const filteredParties = useMemo(() => {
    if (!customerSearch.trim()) return partyOptions;
    const q = customerSearch.toLowerCase().trim();
    return partyOptions.filter(p => {
      const name = (p.firmName || p.name || p.companyName || '').toLowerCase();
      const city = (p.city || '').toLowerCase();
      const state = (p.state || '').toLowerCase();
      const code = (p.customerCode || '').toLowerCase();
      const phone = (p.mobile || p.phone || '').toLowerCase();
      return name.includes(q) || city.includes(q) || state.includes(q) || code.includes(q) || phone.includes(q);
    });
  }, [partyOptions, customerSearch]);

  // Click outside listener for customer dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto scroll highlighted customer into view
  useEffect(() => {
    if (showCustomerDropdown && customerDropdownListRef.current) {
      const activeEl = customerDropdownListRef.current.children[highlightedCustomerIdx] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedCustomerIdx, showCustomerDropdown]);

  // Keyboard navigation for customer dropdown
  const handleCustomerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showCustomerDropdown) {
        setShowCustomerDropdown(true);
        return;
      }
      if (filteredParties.length > 0) {
        setHighlightedCustomerIdx(prev => Math.min(prev + 1, filteredParties.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (showCustomerDropdown && filteredParties.length > 0) {
        setHighlightedCustomerIdx(prev => Math.max(prev - 1, 0));
      }
    } else if (e.key === 'Enter') {
      if (showCustomerDropdown && filteredParties.length > 0) {
        e.preventDefault();
        const selected = filteredParties[highlightedCustomerIdx] || filteredParties[0];
        if (selected) {
          handleSelectParty(selected._id || selected.id);
          customerInputRef.current?.blur();
        }
      }
    } else if (e.key === 'Escape') {
      setShowCustomerDropdown(false);
    }
  };

  // Helper to shift focus across fields in CreateDispatchModal via Arrow keys / Tab
  const handleModalFormKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'SELECT')) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      if (showCustomerDropdown) return;
      e.preventDefault();
      const form = e.currentTarget;
      const focusables = Array.from(
        form.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
        )
      ).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0);

      const index = focusables.indexOf(target);
      const nextIdx = index + 1;
      if (nextIdx >= 0 && nextIdx < focusables.length) {
        focusables[nextIdx]?.focus();
      }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      if (showCustomerDropdown) return;
      e.preventDefault();
      const form = e.currentTarget;
      const focusables = Array.from(
        form.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
        )
      ).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0);

      const index = focusables.indexOf(target);
      const nextIdx = index - 1;
      if (nextIdx >= 0 && nextIdx < focusables.length) {
        focusables[nextIdx]?.focus();
      }
    }
  };

  // Direct party select handler
  const handleSelectParty = (partyId: string) => {
    setSelectedPartyId(partyId);
    setShowCustomerDropdown(false);
    if (!partyId) {
      setCustomerSearch('');
      setDirectCustomerName('');
      setDirectCustomerPhone('');
      setDirectRegion('');
      setBillToAddress('');
      setShipToAddress('');
      return;
    }
    const p = partyOptions.find(item => item._id === partyId || item.id === partyId);
    if (p) {
      const pName = p.firmName || p.name || p.companyName || '';
      const pPhone = p.mobile || p.phone || p.contactPerson?.mobile || '';
      const pCity = p.city || p.billingAddress?.city || '';
      const pState = p.state || p.region || p.billingAddress?.state || '';
      const pStreet = p.address || p.billingAddress?.street || p.billingAddress?.address || '';
      const pPincode = p.pincode || p.billingAddress?.pincode || '';

      setCustomerSearch(pName);
      setDirectCustomerName(pName);
      setDirectCustomerPhone(pPhone);
      setDirectRegion(pCity || pState);

      const addressLines = [
        pName,
        pStreet,
        [pCity, pState, pPincode].filter(Boolean).join(', '),
        pPhone ? `Phone: ${pPhone}` : ''
      ].filter(Boolean).join('\n');

      setBillToAddress(addressLines);
      setShipToAddress(addressLines);
    } else {
      setCustomerSearch('');
      setDirectCustomerName('');
      setDirectCustomerPhone('');
      setDirectRegion('');
      setBillToAddress('');
      setShipToAddress('');
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
      activeCount: active.length,
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

  // Submit Handler
  const buildAndSubmit = async (asDraft: boolean) => {
    if (dispatchMode === 'direct') {
      if (!directCustomerName.trim()) {
        showToast('Please enter customer/consignee name for direct dispatch', 'error');
        return;
      }
    } else {
      if (!activeOrder) {
        showToast('Please select a valid sales order', 'error');
        return;
      }
    }

    if (totals.totalDispatchGbl <= 0) {
      showToast('Please enter a dispatch quantity greater than 0 for at least one item', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const activeRows = itemRows.filter(r => r.selected && r.dispatchGbl > 0);
      const dcItems = activeRows.map(r => ({
        itemId: String((r.skuId as any)?._id || r.skuId || r.skuCode || ''),
        skuId: r.skuId,
        skuCode: r.skuCode,
        itemName: r.itemName,
        orderedQty: r.orderedQty || r.dispatchGbl,
        deliveredQty: r.dispatchGbl,
        deliveredPcs: r.dispatchPcs,
        uom: r.uom,
        price: r.unitPrice,
        total: r.dispatchGbl * (r.unitPrice || 0),
        locationId: r.locationId || undefined,
        locationName: r.locationName || undefined,
      }));

      const finalCustomerName = dispatchMode === 'direct'
        ? directCustomerName.trim()
        : (activeOrder?.customerName || 'Customer');

      const challanPayload: any = {
        dcNumber,
        orderId: dispatchMode === 'direct' ? null : activeOrder?._id,
        orderNumber: dispatchMode === 'direct' ? 'DIRECT' : (activeOrder?.orderNumber || 'DIRECT'),
        customerName: finalCustomerName,
        customerId: dispatchMode === 'direct'
          ? (selectedPartyId || null)
          : ((activeOrder?.customer as any)?._id || (activeOrder as any)?.customerId),
        date: dispatchDate || new Date().toISOString().split('T')[0],
        transporterName: transporter.trim(),
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
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
        try {
          const res = await updateDeliveryChallan(editingChallan._id, challanPayload);
          if (res?.data) resultChallan = res.data;
        } catch (apiErr) {
          console.warn('updateDeliveryChallan API fallback:', apiErr);
        }
      } else {
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
      showToast('Failed to save dispatch: ' + (err?.message || 'Server error'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden max-w-6xl max-h-[94vh] border border-slate-200"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0 bg-white">
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm text-white ${
              dispatchMode === 'direct'
                ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 shadow-purple-500/20'
                : 'bg-gradient-to-tr from-blue-600 to-cyan-600 shadow-blue-500/20'
            }`}>
              <Truck className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900 tracking-tight">
                  {isEditing
                    ? `Edit Delivery Challan (${dcNumber})`
                    : dispatchMode === 'direct'
                    ? 'Create Direct Dispatch'
                    : 'Create Dispatch from Sales Order'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200">
                  {dcNumber}
                </span>
                {dispatchMode === 'direct' ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                    Standalone Direct Batch
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    SO Linked
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isEditing
                  ? 'Update dispatch quantities, vehicle, transporter, and delivery addresses.'
                  : dispatchMode === 'direct'
                  ? 'Generate a delivery challan directly without linking to an existing Sales Order.'
                  : `Dispatch pending items for Sales Order ${activeOrder?.orderNumber || ''}.`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div onKeyDown={handleModalFormKeyDown} className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/60 text-xs">

          {/* DISPATCH MODE TOGGLE (If not editing) */}
          {!isEditing && (
            <div className="flex items-center justify-between bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs gap-4 flex-wrap">
              <div className="flex items-center gap-2 pl-2">
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Dispatch Source:</span>
                <span className="text-xs text-slate-400 hidden sm:inline">Choose whether to link to an approved Sales Order or dispatch standalone</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setDispatchMode('order')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    dispatchMode === 'order'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
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
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    dispatchMode === 'direct'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Direct Dispatch (No Sales Order)</span>
                </button>
              </div>
            </div>
          )}

          {/* ① CUSTOMER & ORDER DETAILS */}
          <SectionCard
            num={1}
            label={dispatchMode === 'direct' ? 'Customer & Dispatch Destination' : 'Order & Customer Details'}
            badge={dispatchMode === 'direct' ? 'Consignee Details' : (activeOrder?.orderNumber || 'Sales Order')}
            className="z-50"
          >
            {dispatchMode === 'order' ? (
              /* SALES ORDER SOURCE FIELDS */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                <div className="lg:col-span-2">
                  <FieldLabel>Select Sales Order <Required /></FieldLabel>
                  <div className="relative">
                    <select
                      value={selectedOrderId}
                      onChange={e => {
                        setSelectedOrderId(e.target.value);
                        const m = allOrders.find(o => o._id === e.target.value);
                        if (m && onOrderChange) onOrderChange(m);
                      }}
                      className="w-full h-9 bg-white border border-slate-200 rounded-xl px-3 pr-8 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 cursor-pointer shadow-2xs"
                    >
                      <option value="">— Choose Approved Sales Order —</option>
                      {(allOrders.length > 0 ? allOrders : order ? [order] : []).map(o => (
                        <option key={o._id} value={o._id}>
                          {o.orderNumber} • {o.customerName} ({o.items?.length || 0} items)
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <FieldLabel>Order Date</FieldLabel>
                  <StatDisplay icon={<Calendar className="w-3.5 h-3.5 text-slate-400" />}>
                    {activeOrder?.orderDate || '—'}
                  </StatDisplay>
                </div>

                <div>
                  <FieldLabel>Customer / Party</FieldLabel>
                  <StatDisplay icon={<Building className="w-3.5 h-3.5 text-slate-400" />}>
                    {activeOrder?.customerName || '—'}
                  </StatDisplay>
                </div>

                <div>
                  <FieldLabel>Contact Number</FieldLabel>
                  <StatDisplay icon={<Phone className="w-3.5 h-3.5 text-slate-400" />}>
                    {activeOrder?.customerPhone || (activeOrder?.customer as any)?.phone || '—'}
                  </StatDisplay>
                </div>
              </div>
            ) : (
              /* DIRECT DISPATCH FIELDS - EXACT SAME 5-COLUMN GRID LAYOUT AS SALES ORDER! */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <FieldLabel>Select Customer / Party <Required /></FieldLabel>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {partyOptions.length > 0 ? `${partyOptions.length.toLocaleString()} customers available` : ''}
                    </span>
                  </div>
                  <div ref={customerRef} className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 z-10 pointer-events-none" />
                    <input
                      ref={customerInputRef}
                      type="text"
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                        setHighlightedCustomerIdx(0);
                        if (!e.target.value) {
                          handleSelectParty('');
                        }
                      }}
                      onClick={() => setShowCustomerDropdown(true)}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onKeyDown={handleCustomerKeyDown}
                      placeholder="Search customer firm name..."
                      className="w-full pl-8 pr-10 h-9 bg-white border border-purple-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-purple-500/15 focus:border-purple-600 focus:outline-none shadow-2xs"
                    />

                    <div className="absolute right-2.5 top-2.5 flex items-center gap-1 text-slate-400 z-10">
                      {customerSearch || selectedPartyId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomerSearch('');
                            handleSelectParty('');
                          }}
                          className="p-0.5 hover:text-slate-600 rounded-md cursor-pointer"
                          title="Clear customer"
                        >
                          <X className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                      ) : (
                        <ChevronDown 
                          className="w-4 h-4 cursor-pointer hover:text-slate-600" 
                          onClick={() => setShowCustomerDropdown(!showCustomerDropdown)} 
                        />
                      )}
                    </div>

                    {/* Customer Dropdown Popover */}
                    {showCustomerDropdown && (
                      <div
                        ref={customerDropdownListRef}
                        className="absolute left-0 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-2xl z-[999] max-h-64 overflow-y-auto divide-y divide-slate-50 p-1"
                      >
                        {filteredParties.slice(0, 200).map((c, idx) => {
                          const cId = c._id || c.id;
                          const isHighlighted = highlightedCustomerIdx === idx;
                          const isSelected = selectedPartyId === cId;
                          const cName = c.firmName || c.name || c.companyName || c.ownerName || c.contactName;
                          const cLocation = [c.city, c.state].filter(Boolean).join(', ');
                          const cPhone = c.mobile || c.phone || c.contactPerson?.mobile || '';

                          return (
                            <div
                              key={cId || `${cName}-${idx}`}
                              onClick={() => handleSelectParty(cId)}
                              onMouseEnter={() => setHighlightedCustomerIdx(idx)}
                              className={`p-2.5 cursor-pointer rounded-lg transition-colors flex items-center justify-between ${
                                isHighlighted || isSelected
                                  ? 'bg-blue-100/90 text-blue-900 font-bold border border-blue-200'
                                  : 'hover:bg-blue-50/70'
                              }`}
                            >
                              <div>
                                <div className="font-bold text-slate-900 text-xs">{cName}</div>
                                <div className="text-[10px] text-slate-400">{cLocation || '—'}</div>
                              </div>
                              {cPhone && (
                                <span className="text-[10px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-bold font-mono">
                                  {cPhone}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {filteredParties.length > 200 && (
                          <div className="p-2 text-center text-slate-400 text-[10px] bg-slate-50 rounded-lg">
                            Showing first 200 of {filteredParties.length} customers. Type in the search box to find specific customer.
                          </div>
                        )}
                        {filteredParties.length === 0 && (
                          <div className="p-3 text-center text-slate-400 italic">No customers found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <FieldLabel>Customer Code / City</FieldLabel>
                  <StatDisplay icon={<MapPin className="w-3.5 h-3.5 text-purple-600" />}>
                    {selectedParty?.customerCode ? `${selectedParty.customerCode} ${selectedParty.city ? `(${selectedParty.city})` : ''}` : (selectedParty?.city || selectedParty?.state || directRegion || '—')}
                  </StatDisplay>
                </div>

                <div>
                  <FieldLabel>Customer / Consignee Name</FieldLabel>
                  {selectedParty ? (
                    <StatDisplay icon={<Building className="w-3.5 h-3.5 text-purple-600" />}>
                      {selectedParty.firmName || selectedParty.name || selectedParty.companyName || directCustomerName || '—'}
                    </StatDisplay>
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. Abbu Stationery / SRS Books"
                      value={directCustomerName}
                      onChange={e => setDirectCustomerName(e.target.value)}
                      className="w-full h-9 px-3 text-xs border border-slate-200 rounded-xl font-bold text-slate-900 bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 shadow-2xs"
                    />
                  )}
                </div>

                <div>
                  <FieldLabel>Contact Phone</FieldLabel>
                  {selectedParty ? (
                    <StatDisplay icon={<Phone className="w-3.5 h-3.5 text-purple-600" />}>
                      {selectedParty.mobile || selectedParty.phone || directCustomerPhone || '—'}
                    </StatDisplay>
                  ) : (
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="e.g. 9848012345"
                        value={directCustomerPhone}
                        onChange={e => setDirectCustomerPhone(e.target.value)}
                        className="w-full h-9 pl-9 pr-3 text-xs border border-slate-200 rounded-xl font-mono text-slate-800 bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 shadow-2xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </SectionCard>

          {/* ② DISPATCH TYPE (In Order mode) */}
          {dispatchMode === 'order' && (
            <SectionCard num={2} label="Dispatch Type" badge={dispatchType === 'full' ? 'Full Order' : 'Partial'}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <DispatchTypeCard
                  id="full"
                  title="Full Dispatch"
                  desc="Dispatch all remaining pending items and full quantities for this order."
                  active={dispatchType === 'full'}
                  onSelect={() => setDispatchType('full')}
                />
                <DispatchTypeCard
                  id="partial"
                  title="Partial Dispatch"
                  desc="Select specific line items and customize partial quantities to dispatch."
                  active={dispatchType === 'partial'}
                  onSelect={() => setDispatchType('partial')}
                />
              </div>
            </SectionCard>
          )}

          {/* ③ ITEMS TABLE */}
          <SectionCard
            num={dispatchMode === 'order' ? 3 : 2}
            label={dispatchMode === 'direct' ? 'Items in Direct Dispatch' : 'Items to Dispatch'}
            badge={`${itemRows.length} Line Item${itemRows.length === 1 ? '' : 's'}`}
          >
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    {dispatchMode === 'order' && dispatchType === 'partial' && (
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input
                          ref={checkboxRef}
                          type="checkbox"
                          checked={allSelected}
                          onChange={e => handleToggleAll(e.target.checked)}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-4 text-left min-w-[260px]">Item Name & SKU</th>
                    <th className="py-2.5 px-3 text-left min-w-[190px]">Dispatch Location</th>
                    <th className="py-2.5 px-3 text-center min-w-[130px]">Available Stock</th>
                    {dispatchMode === 'order' ? (
                      <>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[90px]">Pending (GBL)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[90px]">Pending (PCS)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[120px]">Dispatch Qty (GBL)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[100px]">Rate (₹)</th>
                        <th className="py-2.5 px-4 text-right whitespace-nowrap min-w-[110px]">Total (₹)</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[120px]">Dispatch Qty (GBL)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[100px]">Total Qty (PCS)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[100px]">Rate (₹)</th>
                        <th className="py-2.5 px-4 text-right whitespace-nowrap min-w-[110px]">Total (₹)</th>
                        <th className="py-2.5 px-2 text-center w-12">Action</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-semibold text-slate-500">No items in dispatch batch.</p>
                        {dispatchMode === 'direct' && (
                          <button
                            type="button"
                            onClick={handleAddNewDirectItem}
                            className="mt-3 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add First Item
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    itemRows.map((row, idx) => {
                      const dimmed = dispatchMode === 'order' && dispatchType === 'partial' && !row.selected;
                      return (
                        <tr
                          key={row.key}
                          className={`transition-colors ${
                            dimmed ? 'opacity-40 bg-slate-50/50' : 'hover:bg-blue-50/25'
                          }`}
                        >
                          {dispatchMode === 'order' && dispatchType === 'partial' && (
                            <td className="py-3 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={row.selected}
                                onChange={() => handleToggleRow(row.key)}
                                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="py-3 px-3 text-center text-slate-400 font-mono font-semibold">
                            {idx + 1}
                          </td>

                          {/* ── Item Name & SKU Column ── */}
                          <td className="py-3 px-4">
                            {dispatchMode === 'direct' ? (
                              <SearchableSkuSelector
                                row={row}
                                availableSkus={availableSkus}
                                onSelectSku={(sku) => handleSelectSkuForDirectRow(row.key, sku)}
                                onCustomNameChange={(name) => {
                                  setItemRows(prev => prev.map(r => r.key === row.key ? { ...r, itemName: name } : r));
                                }}
                              />
                            ) : (
                              <div>
                                <p className="font-bold text-slate-900 leading-snug">{row.itemName}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {row.skuCode && (
                                    <span className="font-mono text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                      {row.skuCode}
                                    </span>
                                  )}
                                  {row.category && (
                                    <span className="text-[10px] text-slate-400">
                                      {row.category}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>

                          {/* ── Dispatch Location Column ── */}
                          <td className="py-3 px-3">
                            <button
                              type="button"
                              onClick={() => setActiveLocModalRowKey(row.key)}
                              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-blue-50/50 hover:border-blue-400 transition-all text-left shadow-2xs group cursor-pointer"
                              title="Click to select warehouse storage location"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                  <MapPin className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-xs font-bold text-slate-800 truncate">
                                  {row.locationName || 'Select Location'}
                                </span>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700 shrink-0">
                                {row.locationName ? 'Change' : 'Choose'}
                              </span>
                            </button>
                          </td>

                          {/* ── Live Available Stock Column ── */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {row.stockOnHandGbl !== undefined && row.stockOnHandGbl > 0 ? (
                              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>{row.stockOnHandGbl} GBL</span>
                              </div>
                            ) : row.totalWarehouseStockGbl !== undefined && row.totalWarehouseStockGbl > 0 ? (
                              <div
                                className="inline-flex flex-col items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                                title={`0 at selected location, but ${row.totalWarehouseStockGbl} GBL available across warehouse`}
                              >
                                <span>0 at loc</span>
                                <span className="text-[9px] text-amber-600 font-medium">({row.totalWarehouseStockGbl} GBL total)</span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                0 in Stock
                              </span>
                            )}
                          </td>

                          {/* ── Order Mode: Pending Columns ── */}
                          {dispatchMode === 'order' && (
                            <>
                              <td className="py-3 px-3 text-right font-bold font-mono text-slate-800">
                                {row.pendingQty}
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-slate-500">
                                {row.pendingPcs.toLocaleString()}
                              </td>
                            </>
                          )}

                          {/* ── Dispatch Qty (GBL) Input Column ── */}
                          <td className="py-3 px-3 text-right">
                            {dispatchMode === 'order' && dispatchType === 'full' ? (
                              <span className="inline-block px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-bold font-mono text-xs">
                                {row.dispatchGbl} GBL
                              </span>
                            ) : (
                              <div className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={dispatchMode === 'order' ? row.pendingQty : 99999}
                                  step={1}
                                  value={row.dispatchGbl || ''}
                                  placeholder="0"
                                  onChange={e => handleDispatchQtyChange(row.key, Number(e.target.value))}
                                  className="w-18 h-8 px-2 border border-slate-200 rounded-lg text-right font-mono font-bold text-slate-900 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 text-xs shadow-2xs"
                                />
                                <span className="text-[10px] font-bold text-slate-400">GBL</span>
                              </div>
                            )}
                          </td>

                          {/* ── Direct Mode: PCS column ── */}
                          {dispatchMode === 'direct' && (
                            <td className="py-3 px-3 text-right font-mono font-semibold text-slate-600">
                              {(row.dispatchGbl * (row.pcsPerGbl || 100)).toLocaleString()} PCS
                            </td>
                          )}

                          {/* ── Unit Rate Column ── */}
                          <td className="py-3 px-3 text-right font-mono">
                            <div className="inline-flex items-center gap-1 justify-end">
                              <span className="text-[10px] font-bold text-slate-400">₹</span>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={row.unitPrice !== undefined && row.unitPrice !== null ? row.unitPrice : ''}
                                placeholder="0.00"
                                onChange={e => {
                                  const val = e.target.value;
                                  const p = val === '' ? 0 : Number(val);
                                  setItemRows(prev => prev.map(r => r.key === row.key ? { ...r, unitPrice: p } : r));
                                }}
                                className="w-24 h-8 px-2 border border-slate-300 rounded-lg text-right font-mono font-bold text-slate-800 bg-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 text-xs shadow-2xs transition-all"
                              />
                            </div>
                          </td>

                          {/* ── Total Amount Column ── */}
                          <td className="py-3 px-4 text-right font-mono font-black text-slate-900 text-xs">
                            ₹{(row.dispatchGbl * (row.unitPrice || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* ── Remove Row Button (Direct Mode) ── */}
                          {dispatchMode === 'direct' && (
                            <td className="py-3 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveDirectItem(row.key)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Remove item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}

                  {/* ── TOTALS FOOTER ROW ── */}
                  {itemRows.length > 0 && (
                    <tr className="bg-slate-50/90 border-t-2 border-slate-200 text-xs font-black">
                      {dispatchMode === 'order' && dispatchType === 'partial' && <td />}
                      <td />
                      <td colSpan={2} className="py-3 px-4 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                        Batch Total ({totals.activeCount} active items)
                      </td>
                      <td className="text-center font-mono text-slate-500 text-[10px]">
                        —
                      </td>
                      {dispatchMode === 'order' && (
                        <>
                          <td className="py-3 px-3 text-right font-black font-mono text-slate-800">
                            {totals.totalPendingGbl}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-600">
                            {totals.totalPendingPcs.toLocaleString()}
                          </td>
                        </>
                      )}
                      <td className="py-3 px-3 text-right font-black font-mono text-blue-700">
                        {totals.totalDispatchGbl} GBL
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                        {totals.totalDispatchPcs.toLocaleString()} PCS
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400 font-normal">
                        —
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-blue-700 text-sm">
                        ₹{totals.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2 border border-purple-200 shadow-2xs hover:shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add Another Item</span>
                </button>
              </div>
            )}
          </SectionCard>

          {/* ④ DISPATCH DETAILS & ADDRESSES */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Dispatch Logistics Details */}
            <div className="lg:col-span-3">
              <SectionCard num={dispatchMode === 'order' ? 4 : 3} label="Dispatch & Transport Logistics">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <FieldLabel>Dispatch Date <Required /></FieldLabel>
                    <div className="relative">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        type="date"
                        value={dispatchDate}
                        onChange={e => setDispatchDate(e.target.value)}
                        className="w-full h-9 pl-9 pr-3 text-xs border border-slate-200 rounded-xl font-mono text-slate-800 bg-white focus:outline-none focus:border-blue-500 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel>Transporter Name</FieldLabel>
                    <div className="relative">
                      <Truck className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="e.g. Chennupati Cargo / Self Delivery"
                        value={transporter}
                        onChange={e => setTransporter(e.target.value)}
                        className="w-full h-9 pl-9 pr-3 text-xs border border-slate-200 rounded-xl text-slate-800 bg-white focus:outline-none focus:border-blue-500 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel>Vehicle Number</FieldLabel>
                    <input
                      type="text"
                      placeholder="e.g. TS 09 UA 1234"
                      value={vehicleNumber}
                      onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                      className="w-full h-9 px-3 text-xs border border-slate-200 rounded-xl font-mono font-bold text-slate-900 bg-white focus:outline-none focus:border-blue-500 shadow-2xs uppercase"
                    />
                  </div>

                  <div>
                    <FieldLabel>LR / Bilty Number</FieldLabel>
                    <input
                      type="text"
                      placeholder="e.g. LR-987654"
                      value={lrNumber}
                      onChange={e => setLrNumber(e.target.value)}
                      className="w-full h-9 px-3 text-xs border border-slate-200 rounded-xl font-mono text-slate-800 bg-white focus:outline-none focus:border-blue-500 shadow-2xs"
                    />
                  </div>

                  <div>
                    <FieldLabel>LR Date</FieldLabel>
                    <input
                      type="date"
                      value={lrDate}
                      onChange={e => setLrDate(e.target.value)}
                      className="w-full h-9 px-3 text-xs border border-slate-200 rounded-xl font-mono text-slate-800 bg-white focus:outline-none focus:border-blue-500 shadow-2xs"
                    />
                  </div>

                  <div>
                    <FieldLabel>Delivery Instructions / Notes</FieldLabel>
                    <input
                      type="text"
                      value={remarks}
                      onChange={e => setRemarks(e.target.value)}
                      placeholder="Special instructions or notes..."
                      className="w-full h-9 px-3 text-xs border border-slate-200 rounded-xl text-slate-800 bg-white focus:outline-none focus:border-blue-500 shadow-2xs"
                    />
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* Addresses */}
            <div className="lg:col-span-2">
              <SectionCard num={dispatchMode === 'order' ? 5 : 4} label="Billing & Delivery Addresses">
                <div className="space-y-3.5">
                  {/* Bill To */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Bill To (Customer Address)</span>
                      <button
                        type="button"
                        onClick={() => setEditBillTo(p => !p)}
                        className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        {editBillTo ? 'Save' : 'Edit'}
                      </button>
                    </div>
                    {editBillTo ? (
                      <textarea
                        rows={3}
                        value={billToAddress}
                        onChange={e => setBillToAddress(e.target.value)}
                        placeholder="Enter billing address..."
                        className="w-full text-xs border border-blue-300 rounded-xl p-2.5 focus:outline-none focus:border-blue-500 font-medium text-slate-800 resize-none bg-white"
                      />
                    ) : (
                      <div className="text-xs text-slate-700 leading-relaxed bg-slate-50/80 rounded-xl p-2.5 border border-slate-200 whitespace-pre-line min-h-[56px]">
                        {billToAddress || (
                          <span className="text-slate-400 italic">No billing address specified yet.</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Same as checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer select-none py-0.5">
                    <input
                      type="checkbox"
                      checked={sameAsBillTo}
                      onChange={e => {
                        setSameAsBillTo(e.target.checked);
                        if (e.target.checked) setShipToAddress(billToAddress);
                      }}
                      className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-700">Shipping address same as Bill To</span>
                  </label>

                  {/* Ship To */}
                  {!sameAsBillTo && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Ship To (Delivery Site)</span>
                        <button
                          type="button"
                          onClick={() => setEditShipTo(p => !p)}
                          className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          {editShipTo ? 'Save' : 'Edit'}
                        </button>
                      </div>
                      {editShipTo ? (
                        <textarea
                          rows={3}
                          value={shipToAddress}
                          onChange={e => setShipToAddress(e.target.value)}
                          placeholder="Enter destination delivery address..."
                          className="w-full text-xs border border-blue-300 rounded-xl p-2.5 focus:outline-none focus:border-blue-500 font-medium text-slate-800 resize-none bg-white"
                        />
                      ) : (
                        <div className="text-xs text-slate-700 leading-relaxed bg-slate-50/80 rounded-xl p-2.5 border border-slate-200 whitespace-pre-line min-h-[56px]">
                          {shipToAddress || (
                            <span className="text-slate-400 italic">No shipping address specified yet.</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>
          </div>

          {/* ⑤ SUMMARY CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Dispatching</p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-black text-blue-700 font-mono leading-none">
                    {totals.totalDispatchGbl}
                  </span>
                  <span className="text-xs font-bold text-blue-600">GBL</span>
                </div>
                <p className="text-[11px] font-mono text-slate-500 mt-1">
                  ({totals.totalDispatchPcs.toLocaleString()} PCS)
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Package className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estimated Valuation</p>
                <p className="text-2xl font-black text-emerald-700 font-mono leading-none mt-1">
                  ₹{totals.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Total Delivery Challan Value</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-lg">
                ₹
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fulfillment Status</p>
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Ready for Dispatch</span>
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Truck className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>

        {/* ── STICKY FOOTER ── */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isSubmitting || totals.totalDispatchGbl <= 0}
              onClick={() => buildAndSubmit(true)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all ${
                totals.totalDispatchGbl > 0 && !isSubmitting
                  ? 'text-slate-700 bg-white border-slate-300 hover:bg-slate-50 cursor-pointer shadow-2xs'
                  : 'text-slate-400 bg-slate-100 border-slate-200 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>Save as Draft</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting || totals.totalDispatchGbl <= 0}
              onClick={() => buildAndSubmit(false)}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
                totals.totalDispatchGbl > 0 && !isSubmitting
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/25 cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving Dispatch...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  <span>{isEditing ? 'Update & Save' : 'Save & Print Challan'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Location Selection Modal for Dispatch Items */}
      {activeLocModalRow && (
        <LocationSelectModal
          isOpen={Boolean(activeLocModalRowKey)}
          onClose={() => setActiveLocModalRowKey(null)}
          rawHierarchy={warehouseLocations}
          selectedLocationId={activeLocModalRow.locationId}
          companyId={selectedCompany?._id}
          skuId={activeLocModalSkuId}
          unit={activeLocModalRow.uom || 'GBL'}
          title={`Select Storage Location for ${activeLocModalRow.itemName || 'Item'}`}
          zIndex={10050}
          onSelectLocation={(locId, locPath) => {
            handleItemLocationChange(activeLocModalRow.key, locId, locPath);
            setActiveLocModalRowKey(null);
          }}
        />
      )}
    </div>,
    document.body
  );
};

/* ─── Searchable SKU Selector for Direct Dispatch Rows ─── */
interface SearchableSkuSelectorProps {
  row: ItemRow;
  availableSkus: any[];
  onSelectSku: (sku: any) => void;
  onCustomNameChange: (name: string) => void;
}

const SearchableSkuSelector: React.FC<SearchableSkuSelectorProps> = ({
  row,
  availableSkus,
  onSelectSku,
  onCustomNameChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isEditingCustom, setIsEditingCustom] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Filter available SKUs based on query (capped at 15 results for instant render)
  const filteredSkus = useMemo(() => {
    if (!query.trim()) {
      return availableSkus.slice(0, 15);
    }
    const q = query.toLowerCase().trim();
    return availableSkus
      .filter(s =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.skuCode && s.skuCode.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q))
      )
      .slice(0, 15);
  }, [availableSkus, query]);

  const hasSelectedSku = Boolean(row.skuId || row.skuCode);

  if (hasSelectedSku && !isEditingCustom) {
    return (
      <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl border border-slate-200 bg-slate-50/80 group">
        <div className="min-w-0">
          <p className="font-bold text-slate-900 text-xs truncate">{row.itemName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {row.skuCode && (
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-100/70 text-purple-700">
                {row.skuCode}
              </span>
            )}
            <span className="text-[10px] text-slate-500 font-medium">
              {row.pcsPerGbl} pcs/GBL
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setIsOpen(true);
          }}
          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-purple-700 hover:border-purple-300 transition-colors shrink-0 cursor-pointer shadow-2xs"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
        <input
          type="text"
          placeholder="Search SKU code or item name..."
          value={query || row.itemName || ''}
          onChange={e => {
            setQuery(e.target.value);
            onCustomNameChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full h-8 pl-8 pr-7 text-xs border border-slate-200 rounded-xl font-medium text-slate-900 bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 shadow-2xs"
        />
        {(query || row.itemName) && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              onCustomNameChange('');
            }}
            className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-80 max-h-60 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 z-50 divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
          <div className="p-2 bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-500 flex justify-between">
            <span>Matching SKUs</span>
            <span>{availableSkus.length} in Master</span>
          </div>

          {filteredSkus.map(sku => (
            <div
              key={sku._id}
              onClick={() => {
                onSelectSku(sku);
                setIsOpen(false);
                setQuery('');
              }}
              className="p-2.5 hover:bg-purple-50/60 cursor-pointer transition-colors flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-xs truncate">{sku.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                    {sku.skuCode}
                  </span>
                  {sku.category && (
                    <span className="text-[10px] text-slate-400 truncate">
                      {sku.category}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono font-bold text-xs text-purple-700">
                  ₹{Number(sku.sellingPrice || sku.rate || 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500">
                  Stock: {sku.presentStock || 0}
                </p>
              </div>
            </div>
          ))}

          {query.trim() && (
            <div
              onClick={() => {
                onCustomNameChange(query.trim());
                setIsEditingCustom(true);
                setIsOpen(false);
              }}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 cursor-pointer text-xs font-bold text-purple-700 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Use custom item: "{query}"</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── UI Helper Components ─── */

function SectionCard({
  num,
  label,
  badge,
  children,
  className = '',
  style,
}: {
  num: number;
  label: string;
  badge?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`relative border border-slate-200/90 rounded-2xl bg-white shadow-2xs ${className}`}
    >
      <div className="bg-slate-50/80 px-5 py-3 border-b border-slate-100 flex items-center justify-between rounded-t-2xl">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-lg bg-blue-600 text-white flex items-center justify-center text-[10px] font-black shrink-0 shadow-2xs">
            {num}
          </div>
          <span className="text-xs font-black text-slate-800 uppercase tracking-wider">{label}</span>
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-200/60 text-slate-700 border border-slate-200">
            {badge}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
      {children}
    </label>
  );
}

function Required() {
  return <span className="text-rose-500 ml-0.5 font-bold">*</span>;
}

function StatDisplay({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="h-9 bg-slate-50/80 border border-slate-200 rounded-xl px-3 text-xs font-semibold text-slate-700 flex items-center gap-2 truncate shadow-2xs">
      {icon}
      <span className="truncate">{children}</span>
    </div>
  );
}

function DispatchTypeCard({
  id,
  title,
  desc,
  active,
  onSelect,
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
      className={`flex items-start gap-3.5 p-4 rounded-xl border-2 cursor-pointer transition-all ${
        active
          ? 'border-blue-500 bg-blue-50/40 shadow-xs'
          : 'border-slate-200 hover:border-slate-300 bg-white'
      }`}
    >
      <input
        id={`dispatch-type-${id}`}
        type="radio"
        name="dispatchType"
        value={id}
        checked={active}
        onChange={onSelect}
        className="mt-0.5 accent-blue-600 shrink-0 cursor-pointer w-4 h-4"
      />
      <div>
        <p className="text-xs font-black text-slate-900">{title}</p>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </label>
  );
}

export default CreateDispatchModal;

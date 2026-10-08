import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Truck, Package, CheckCircle2, Clock, AlertCircle,
  Search, Filter, RefreshCw, ChevronDown,
  Phone, MapPin, Download, Eye, Plus, ArrowUpDown, ChevronLeft, ChevronRight,
  Printer, X, ArrowUp, ArrowDown, Calendar, Edit3, Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import { getSalesOrdersV2, SalesOrderV2, updateSalesOrderV2 } from '../../api/salesOrderApiV2';
import { getCustomSalesOrders, saveCustomSalesOrder } from '../../utils/salesOrderStorage';
import { getBalancesV2, getSkusV2 } from '../../api/mfgApiV2';
import { getDeliveryChallans, deleteDeliveryChallan } from '../../api/deliveryChallanApi';
import { CreateDispatchModal } from './CreateDispatchModal';
import { ViewDeliveryChallanModal } from './ViewDeliveryChallanModal';
import { DispatchOrderDetailModal } from './DispatchOrderDetailModal';
import { showToast } from '../ui/Toast';

// Safe string converter to prevent 'Cannot convert object to primitive value'
const toSafeString = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    if (val._id) return toSafeString(val._id);
    if (val.id) return toSafeString(val.id);
    if (val.name) return toSafeString(val.name);
    if (val.skuCode) return toSafeString(val.skuCode);
    try {
      if (typeof val.toString === 'function') {
        const str = val.toString();
        if (str !== '[object Object]') return str;
      }
    } catch {}
    try {
      return JSON.stringify(val);
    } catch {
      return '';
    }
  }
  return '';
};

// Formatted Order Model for Dispatch View
export interface DispatchRowOrder {
  _id: string;
  orderNumber: string;
  orderDate: string;
  rawDate: string;
  customerName: string;
  customerPhone?: string;
  city?: string;
  region: string;
  itemCount: number;
  pendingGbl: number;
  pendingPcs: number;
  readyStatus: 'Ready' | 'Partially Ready' | 'Not Ready';
  items: Array<{
    itemName: string;
    skuCode?: string;
    skuId?: string;
    uom: string;
    orderedQty: number;
    dispatchedQty: number;
    pendingQty: number;
    gbl: number;
    pcs: number;
    stockOnHandGbl?: number;
    stockOnHandPcs?: number;
    isAvailable?: boolean;
  }>;
  rawOrder: SalesOrderV2;
}

// Fallback seed orders matching user's reference screenshot
const FALLBACK_SEED_ORDERS: DispatchRowOrder[] = [
  {
    _id: 'seed-so-0001',
    orderNumber: 'SO-0001',
    orderDate: '26/09/2026',
    rawDate: '2026-09-26',
    customerName: 'A T C Marketing (Akshara)',
    customerPhone: '9966529313',
    city: 'Mahabubnagar',
    region: 'Telangana',
    itemCount: 4,
    pendingGbl: 5,
    pendingPcs: 1230,
    readyStatus: 'Partially Ready',
    items: [
      { itemName: 'Long Book 172 Pgs (Red Title)', skuCode: 'LB-172-RED', uom: 'GBL', orderedQty: 5, dispatchedQty: 0, pendingQty: 5, gbl: 5, pcs: 1230 },
      { itemName: 'Drawing Note 40 Pgs Spiral', skuCode: 'DN-40-SP', uom: 'GBL', orderedQty: 3, dispatchedQty: 1, pendingQty: 2, gbl: 2, pcs: 600 }
    ],
    rawOrder: {
      _id: 'seed-so-0001',
      orderNumber: 'SO-0001',
      company: '',
      customerName: 'A T C Marketing (Akshara)',
      customerPhone: '9966529313',
      city: 'Mahabubnagar',
      region: 'Telangana',
      orderDate: '2026-09-26',
      items: [
        { itemName: 'Long Book 172 Pgs (Red Title)', skuCode: 'LB-172-RED', uom: 'GBL', quantity: 5, pcsPerGbl: 246, unitPrice: 4200, totalAmount: 21000 }
      ],
      materialsStatus: 'Ready',
      status: 'Confirmed',
      subtotal: 21000,
      grandTotal: 21000
    }
  },
  {
    _id: 'seed-so-0002',
    orderNumber: 'SO-0002',
    orderDate: '25/09/2026',
    rawDate: '2026-09-25',
    customerName: 'Ramesh Stationery',
    customerPhone: '9845123456',
    city: 'Guntur',
    region: 'Andhra Pradesh',
    itemCount: 3,
    pendingGbl: 12,
    pendingPcs: 3600,
    readyStatus: 'Ready',
    items: [
      { itemName: 'A4 Copier Paper 75 GSM', skuCode: 'CP-A4-75', uom: 'GBL', orderedQty: 12, dispatchedQty: 0, pendingQty: 12, gbl: 12, pcs: 3600 }
    ],
    rawOrder: {
      _id: 'seed-so-0002',
      orderNumber: 'SO-0002',
      company: '',
      customerName: 'Ramesh Stationery',
      customerPhone: '9845123456',
      city: 'Guntur',
      region: 'Andhra Pradesh',
      orderDate: '2026-09-25',
      items: [
        { itemName: 'A4 Copier Paper 75 GSM', skuCode: 'CP-A4-75', uom: 'GBL', quantity: 12, pcsPerGbl: 300, unitPrice: 3800, totalAmount: 45600 }
      ],
      materialsStatus: 'Ready',
      status: 'Confirmed',
      subtotal: 45600,
      grandTotal: 45600
    }
  },
  {
    _id: 'seed-so-0003',
    orderNumber: 'SO-0003',
    orderDate: '26/09/2026',
    rawDate: '2026-09-26',
    customerName: 'Chaitanya Book Centre',
    customerPhone: '9988776655',
    city: 'Nellore',
    region: 'Andhra Pradesh',
    itemCount: 2,
    pendingGbl: 8,
    pendingPcs: 2400,
    readyStatus: 'Not Ready',
    items: [
      { itemName: 'Drawing Note 40 Pgs Spiral', skuCode: 'DN-40-SP', uom: 'GBL', orderedQty: 8, dispatchedQty: 0, pendingQty: 8, gbl: 8, pcs: 2400 }
    ],
    rawOrder: {
      _id: 'seed-so-0003',
      orderNumber: 'SO-0003',
      company: '',
      customerName: 'Chaitanya Book Centre',
      customerPhone: '9988776655',
      city: 'Nellore',
      region: 'Andhra Pradesh',
      orderDate: '2026-09-26',
      items: [
        { itemName: 'Drawing Note 40 Pgs Spiral', skuCode: 'DN-40-SP', uom: 'GBL', quantity: 8, pcsPerGbl: 300, unitPrice: 3100, totalAmount: 24800 }
      ],
      materialsStatus: 'Shortfall',
      status: 'Confirmed',
      subtotal: 24800,
      grandTotal: 24800
    }
  },
  {
    _id: 'seed-so-0004',
    orderNumber: 'SO-0004',
    orderDate: '27/09/2026',
    rawDate: '2026-09-27',
    customerName: 'Sri Lakshmi Book Depot',
    customerPhone: '9123456780',
    city: 'Vijayawada',
    region: 'Andhra Pradesh',
    itemCount: 5,
    pendingGbl: 20,
    pendingPcs: 6000,
    readyStatus: 'Partially Ready',
    items: [
      { itemName: 'Graph Book 64 Pgs', skuCode: 'GB-64', uom: 'GBL', orderedQty: 20, dispatchedQty: 0, pendingQty: 20, gbl: 20, pcs: 6000 }
    ],
    rawOrder: {
      _id: 'seed-so-0004',
      orderNumber: 'SO-0004',
      company: '',
      customerName: 'Sri Lakshmi Book Depot',
      customerPhone: '9123456780',
      city: 'Vijayawada',
      region: 'Andhra Pradesh',
      orderDate: '2026-09-27',
      items: [
        { itemName: 'Graph Book 64 Pgs', skuCode: 'GB-64', uom: 'GBL', quantity: 20, pcsPerGbl: 300, unitPrice: 2800, totalAmount: 56000 }
      ],
      materialsStatus: 'Ready',
      status: 'Confirmed',
      subtotal: 56000,
      grandTotal: 56000
    }
  },
  {
    _id: 'seed-so-0005',
    orderNumber: 'SO-0005',
    orderDate: '28/09/2026',
    rawDate: '2026-09-28',
    customerName: 'Sree Sai Traders',
    customerPhone: '9876543210',
    city: 'Hyderabad',
    region: 'Telangana',
    itemCount: 3,
    pendingGbl: 15,
    pendingPcs: 4500,
    readyStatus: 'Ready',
    items: [
      { itemName: 'Notebook 192 Pgs Hardbound', skuCode: 'NB-192-HB', uom: 'GBL', orderedQty: 15, dispatchedQty: 0, pendingQty: 15, gbl: 15, pcs: 4500 }
    ],
    rawOrder: {
      _id: 'seed-so-0005',
      orderNumber: 'SO-0005',
      company: '',
      customerName: 'Sree Sai Traders',
      customerPhone: '9876543210',
      city: 'Hyderabad',
      region: 'Telangana',
      orderDate: '2026-09-28',
      items: [
        { itemName: 'Notebook 192 Pgs Hardbound', skuCode: 'NB-192-HB', uom: 'GBL', quantity: 15, pcsPerGbl: 300, unitPrice: 4500, totalAmount: 67500 }
      ],
      materialsStatus: 'Ready',
      status: 'Confirmed',
      subtotal: 67500,
      grandTotal: 67500
    }
  }
];

export const DispatchModule: React.FC = () => {
  const { selectedCompany } = useAuth();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [salesOrders, setSalesOrders] = useState<SalesOrderV2[]>([]);
  const [liveStockMap, setLiveStockMap] = useState<Map<string, { pcs: number; gbl: number }>>(new Map());
  const [searchParams] = useSearchParams();
  const urlOrderIdHandled = useRef(false);

  // Top Tabs: 'all' | 'ready' | 'partial' | 'not_ready' | 'history'
  const [activeTab, setActiveTab] = useState<'all' | 'ready' | 'partial' | 'not_ready' | 'history'>('all');

  // Accordion Expand Set for Orders
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('ALL');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Filter Popover Menu State
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Dedicated Date Filter Popover State
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [datePreset, setDatePreset] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const dateFilterRef = useRef<HTMLDivElement>(null);

  // Sorting for Orders View (All columns clickable)
  type SortField = 'orderNumber' | 'rawDate' | 'customerName' | 'region' | 'itemCount' | 'pendingGbl' | 'pendingPcs' | 'readyStatus';
  const [sortField, setSortField] = useState<SortField>('orderNumber');
  const [sortAsc, setSortAsc] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Sorting for Challans History View
  type ChallanSortField = 'dcNumber' | 'date' | 'orderNumber' | 'customerName' | 'transporterName' | 'vehicleNumber' | 'items' | 'status';
  const [challanSortField, setChallanSortField] = useState<ChallanSortField>('date');
  const [challanSortAsc, setChallanSortAsc] = useState(false);

  // Row Action Dropdowns (orderId -> boolean)
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);

  // Selection & Pagination
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedOrderForDispatch, setSelectedOrderForDispatch] = useState<SalesOrderV2 | null>(null);
  const [editingChallan, setEditingChallan] = useState<any | null>(null);
  const [isDirectDispatch, setIsDirectDispatch] = useState(false);

  const [isChallanModalOpen, setIsChallanModalOpen] = useState(false);
  const [activeChallan, setActiveChallan] = useState<any>(null);
  const [selectedOrderDetailRow, setSelectedOrderDetailRow] = useState<DispatchRowOrder | null>(null);

  // Delivery Challans List
  const [deliveryChallansList, setDeliveryChallansList] = useState<any[]>([]);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
      if (dateFilterRef.current && !dateFilterRef.current.contains(e.target as Node)) {
        setShowDateFilter(false);
      }
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
      setOpenActionDropdownId(null);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // Fetch Orders and Inventory Stock
  const fetchData = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      else setRefreshing(true);

      const companyId = selectedCompany?._id;

      // 1. Fetch Sales Orders (API + localStorage fallback)
      let backendOrders: SalesOrderV2[] = [];
      if (companyId) {
        try {
          const res = await getSalesOrdersV2(companyId);
          if (Array.isArray(res)) {
            backendOrders = res;
          } else if (res && Array.isArray((res as any).data)) {
            backendOrders = (res as any).data;
          }
        } catch (err) {
          console.warn('Backend getSalesOrdersV2 fetch failed:', err);
        }
      }

      const customOrders = companyId ? getCustomSalesOrders(companyId) : [];
      const combined = [...customOrders];
      backendOrders.forEach(bo => {
        if (!combined.some(co => (co._id && bo._id && co._id === bo._id) || (co.orderNumber && bo.orderNumber && co.orderNumber === bo.orderNumber))) {
          combined.push(bo);
        }
      });

      const companyFilteredOrders = combined.filter((o: any) => {
        if (!companyId) return true;
        const oComp = toSafeString(o.company?._id || o.company);
        return !oComp || oComp === toSafeString(companyId);
      });

      setSalesOrders(companyFilteredOrders);

      // 2. Fetch Live Stock Balances & SKU Master Data
      try {
        const [balances, skus] = await Promise.all([
          getBalancesV2(companyId).catch(() => []),
          getSkusV2(companyId).catch(() => [])
        ]);

        const smap = new Map<string, { pcs: number; gbl: number }>();
        const skuPcsMap = new Map<string, number>();
        const bList = Array.isArray(balances) ? balances : [];
        const sList = Array.isArray(skus) ? skus : [];

        bList.forEach((b: any) => {
          const rawId = b.skuId || b.sku?._id;
          const sId = toSafeString((rawId as any)?._id || rawId);
          const qty = Number(b.onHand) || Number(b.quantity) || 0;
          if (sId) skuPcsMap.set(sId, (skuPcsMap.get(sId) || 0) + qty);
        });

        sList.forEach((s: any) => {
          const sId = toSafeString(s._id || s.id);
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

        setLiveStockMap(smap);
      } catch (err) {
        console.warn('Stock loading error in dispatch:', err);
      }

      // 3. Fetch Delivery Challans
      try {
        let challans: any[] = [];
        if (companyId) {
          const cRes = await getDeliveryChallans(companyId).catch(() => null);
          if (cRes?.data && Array.isArray(cRes.data)) challans = cRes.data;
          else if (Array.isArray(cRes)) challans = cRes;
        }
        const localKey = `skbw_delivery_challans_${companyId || 'default'}`;
        const localChallans = JSON.parse(localStorage.getItem(localKey) || '[]');
        if (Array.isArray(localChallans)) {
          localChallans.forEach(lc => {
            if (!challans.some(c => c._id === lc._id || c.dcNumber === lc.dcNumber)) {
              challans.push(lc);
            }
          });
        }
        const companyFilteredChallans = challans.filter((c: any) => {
          if (!companyId) return true;
          const cComp = toSafeString(c.company?._id || c.company || c.companyId);
          return !cComp || cComp === toSafeString(companyId);
        });
        setDeliveryChallansList(companyFilteredChallans);
      } catch (cErr) {
        console.warn('Challans fetch error:', cErr);
      }

    } catch (err) {
      console.error('Failed to load dispatch data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setSalesOrders([]);
    setDeliveryChallansList([]);
    setSelectedOrderIds(new Set());
    setExpandedOrderIds(new Set());
    setLiveStockMap(new Map());
    fetchData(true);
  }, [selectedCompany?._id]);

  useEffect(() => {
    const handleSync = () => {
      fetchData(false);
    };
    window.addEventListener('stock_balance_changed', handleSync);
    window.addEventListener('sales_order_updated', handleSync);
    return () => {
      window.removeEventListener('stock_balance_changed', handleSync);
      window.removeEventListener('sales_order_updated', handleSync);
    };
  }, [selectedCompany?._id]);

  // Lookup map: Challans by Sales Order
  const orderChallansMap = useMemo(() => {
    const map = new Map<string, any[]>();
    deliveryChallansList.forEach(ch => {
      const keyId = toSafeString(ch.orderId);
      const keyNum = toSafeString(ch.orderNumber);
      if (keyId) {
        if (!map.has(keyId)) map.set(keyId, []);
        map.get(keyId)!.push(ch);
      }
      if (keyNum && keyNum !== keyId && keyNum !== 'DIRECT') {
        if (!map.has(keyNum)) map.set(keyNum, []);
        map.get(keyNum)!.push(ch);
      }
    });
    return map;
  }, [deliveryChallansList]);

  // Transform and filter sales orders into display rows
  const displayRows: DispatchRowOrder[] = useMemo(() => {
    const pendingOrders = salesOrders.filter(o => {
      if (o.status === 'Cancelled' || o.fulfillmentStatus === 'Fulfilled' || o.status === 'Delivered') {
        return false;
      }
      const hasPending = (o.items || []).some(item => {
        const ordered = Number(item.quantity) || 0;
        const dispatched = Number(item.dispatchedQty) || 0;
        return ordered > dispatched;
      });
      return hasPending || (o.items || []).length === 0;
    });

    if (pendingOrders.length === 0) {
      return [];
    }

    return pendingOrders.map((o, idx) => {
      let totalPendingGbl = 0;
      let totalPendingPcs = 0;
      let allItemsReady = true;
      let someItemsReady = false;

      const itemsTransformed = (o.items || []).map(item => {
        const rawOrdered = Number(item.quantity) || 0;
        const conv = Number(item.pcsPerGbl) || Number(item.altUnitConversion) || 100;
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

        totalPendingGbl += pendingGbl;
        totalPendingPcs += pendingPcs;

        const codeKey = (item.skuCode || '').toLowerCase().trim();
        const idKey = String((item as any).skuId || '');
        const nameKey = (item.itemName || '').toLowerCase().trim();
        const stock = (codeKey && liveStockMap.get(codeKey)) ||
                      (idKey && liveStockMap.get(idKey)) ||
                      (nameKey && liveStockMap.get(nameKey)) ||
                      { pcs: 0, gbl: 0 };

        const hasStock = (stock.gbl >= pendingGbl && pendingGbl > 0) || 
                         (stock.pcs >= pendingPcs && pendingPcs > 0);

        const isItemAvailable = hasStock;

        if (isItemAvailable) {
          someItemsReady = true;
        } else if (stock.gbl > 0 || stock.pcs > 0) {
          someItemsReady = true;
          allItemsReady = false;
        } else if (pendingPcs > 0 || pendingGbl > 0) {
          allItemsReady = false;
        }

        return {
          itemName: item.itemName,
          skuCode: item.skuCode,
          skuId: (item as any).skuId,
          uom: item.uom,
          orderedQty: orderedPcs,
          dispatchedQty: dispatchedPcs,
          pendingQty: pendingGbl > 0 ? pendingGbl : pendingPcs,
          gbl: pendingGbl,
          pcs: pendingPcs,
          stockOnHandGbl: stock.gbl,
          stockOnHandPcs: stock.pcs,
          isAvailable: isItemAvailable
        };
      });

      let status: 'Ready' | 'Partially Ready' | 'Not Ready' = 'Not Ready';
      if (itemsTransformed.length > 0) {
        if (allItemsReady) {
          status = 'Ready';
        } else if (someItemsReady) {
          status = 'Partially Ready';
        } else {
          status = 'Not Ready';
        }
      }

      let formattedDate = o.orderDate || '';
      const rawDate = o.orderDate || '';
      if (formattedDate.includes('-')) {
        const parts = formattedDate.split('T')[0].split('-');
        if (parts.length === 3) {
          formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }

      return {
        _id: o._id || `order-${idx}`,
        orderNumber: o.orderNumber || `SO-${String(idx + 1).padStart(4, '0')}`,
        orderDate: formattedDate,
        rawDate,
        customerName: o.customerName || 'Customer',
        customerPhone: o.customerPhone || (o.customer && (o.customer.phone || o.customer.mobile)) || '',
        city: o.city || (o.shippingAddress && o.shippingAddress.city) || (o.billingAddress && o.billingAddress.city) || '',
        region: o.region || (o.shippingAddress && o.shippingAddress.state) || (o.billingAddress && o.billingAddress.state) || 'Telangana',
        itemCount: itemsTransformed.length,
        pendingGbl: Math.round(totalPendingGbl),
        pendingPcs: Math.round(totalPendingPcs),
        readyStatus: status,
        items: itemsTransformed,
        rawOrder: o
      };
    });
  }, [salesOrders, liveStockMap]);

  // Metrics Calculation
  const metrics = useMemo(() => {
    let pendingCount = displayRows.length;
    let totalGbl = 0;
    let totalPcs = 0;
    let readyCount = 0;
    let partialCount = 0;
    let notReadyCount = 0;

    displayRows.forEach(row => {
      totalGbl += row.pendingGbl;
      totalPcs += row.pendingPcs;
      if (row.readyStatus === 'Ready') readyCount++;
      else if (row.readyStatus === 'Partially Ready') partialCount++;
      else if (row.readyStatus === 'Not Ready') notReadyCount++;
    });

    return {
      pendingOrders: pendingCount,
      totalGbl,
      totalPcs,
      readyOrders: readyCount,
      partiallyReadyOrders: partialCount,
      notReadyOrders: notReadyCount
    };
  }, [displayRows]);

  // Unique Filter Options
  const customerOptions = useMemo(() => {
    const set = new Set<string>();
    displayRows.forEach(r => {
      if (r.customerName) set.add(r.customerName);
    });
    return Array.from(set).sort();
  }, [displayRows]);

  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    displayRows.forEach(r => {
      if (r.region) set.add(r.region);
    });
    return Array.from(set).sort();
  }, [displayRows]);

  // Filtered & Sorted Rows
  const filteredRows = useMemo(() => {
    const res = displayRows.filter(row => {
      // Tab filter
      if (activeTab === 'ready' && row.readyStatus !== 'Ready') return false;
      if (activeTab === 'partial' && row.readyStatus !== 'Partially Ready') return false;
      if (activeTab === 'not_ready' && row.readyStatus !== 'Not Ready') return false;

      // Dropdown filters
      if (selectedCustomer !== 'ALL' && row.customerName !== selectedCustomer) return false;
      if (selectedRegion !== 'ALL' && row.region !== selectedRegion) return false;
      if (selectedStatus !== 'ALL' && row.readyStatus !== selectedStatus) return false;

      // Date range filter
      if (startDate && row.rawDate && row.rawDate < startDate) return false;
      if (endDate && row.rawDate && row.rawDate > endDate) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesNo = row.orderNumber.toLowerCase().includes(q);
        const matchesCust = row.customerName.toLowerCase().includes(q);
        const matchesCity = (row.city || '').toLowerCase().includes(q);
        const matchesPhone = (row.customerPhone || '').toLowerCase().includes(q);
        const matchesRegion = row.region.toLowerCase().includes(q);
        const matchesItem = row.items.some(i => i.itemName.toLowerCase().includes(q) || (i.skuCode || '').toLowerCase().includes(q));
        if (!matchesNo && !matchesCust && !matchesCity && !matchesPhone && !matchesRegion && !matchesItem) {
          return false;
        }
      }

      return true;
    });

    // Sorting by all column fields
    return res.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'orderNumber') {
        cmp = a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true });
      } else if (sortField === 'rawDate') {
        cmp = (a.rawDate || '').localeCompare(b.rawDate || '');
      } else if (sortField === 'customerName') {
        cmp = a.customerName.localeCompare(b.customerName);
      } else if (sortField === 'region') {
        cmp = a.region.localeCompare(b.region);
      } else if (sortField === 'itemCount') {
        cmp = a.itemCount - b.itemCount;
      } else if (sortField === 'pendingGbl') {
        cmp = a.pendingGbl - b.pendingGbl;
      } else if (sortField === 'pendingPcs') {
        cmp = a.pendingPcs - b.pendingPcs;
      } else if (sortField === 'readyStatus') {
        cmp = a.readyStatus.localeCompare(b.readyStatus);
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [displayRows, activeTab, selectedCustomer, selectedRegion, selectedStatus, startDate, endDate, searchQuery, sortField, sortAsc]);

  // Paginated Rows
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Sorted Delivery Challans List (for History Tab)
  const sortedChallansList = useMemo(() => {
    const list = [...deliveryChallansList];
    return list.sort((a, b) => {
      let cmp = 0;
      if (challanSortField === 'dcNumber') {
        cmp = (a.dcNumber || '').localeCompare(b.dcNumber || '', undefined, { numeric: true });
      } else if (challanSortField === 'date') {
        cmp = (a.date || '').localeCompare(b.date || '');
      } else if (challanSortField === 'orderNumber') {
        cmp = (a.orderNumber || '').localeCompare(b.orderNumber || '');
      } else if (challanSortField === 'customerName') {
        cmp = (a.customerName || '').localeCompare(b.customerName || '');
      } else if (challanSortField === 'transporterName') {
        cmp = (a.transporterName || '').localeCompare(b.transporterName || '');
      } else if (challanSortField === 'vehicleNumber') {
        cmp = (a.vehicleNumber || '').localeCompare(b.vehicleNumber || '');
      } else if (challanSortField === 'items') {
        cmp = (a.items?.length || 0) - (b.items?.length || 0);
      } else if (challanSortField === 'status') {
        cmp = (a.status || '').localeCompare(b.status || '');
      }
      return challanSortAsc ? cmp : -cmp;
    });
  }, [deliveryChallansList, challanSortField, challanSortAsc]);

  // Accordion Expand Handlers
  const toggleOrderExpand = (id: string) => {
    setExpandedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAllExpanded = expandedOrderIds.size === paginatedRows.length && paginatedRows.length > 0;

  const toggleAllDetails = () => {
    if (isAllExpanded) {
      setExpandedOrderIds(new Set());
    } else {
      setExpandedOrderIds(new Set(paginatedRows.map(r => r._id)));
    }
  };

  // Checkbox Selection
  const isAllSelected = paginatedRows.length > 0 && paginatedRows.every(r => selectedOrderIds.has(r._id));
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedOrderIds(new Set());
    } else {
      const next = new Set(selectedOrderIds);
      paginatedRows.forEach(r => next.add(r._id));
      setSelectedOrderIds(next);
    }
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedOrderIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedOrderIds(next);
  };

  // Sort Handlers (Invoked by clicking column headers)
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleChallanSort = (field: ChallanSortField) => {
    if (challanSortField === field) {
      setChallanSortAsc(!challanSortAsc);
    } else {
      setChallanSortField(field);
      setChallanSortAsc(true);
    }
  };

  // Open Dispatch Modal for Sales Order
  const handleOpenDispatch = (orderRow?: DispatchRowOrder) => {
    setEditingChallan(null);
    setIsDirectDispatch(false);
    if (orderRow) {
      setSelectedOrderForDispatch(orderRow.rawOrder);
    } else if (displayRows.length > 0) {
      setSelectedOrderForDispatch(displayRows[0].rawOrder);
    } else {
      setSelectedOrderForDispatch(null);
    }
    setIsCreateModalOpen(true);
  };

  // Open Direct Standalone Dispatch (Without Sales Order)
  const handleOpenDirectDispatch = () => {
    setEditingChallan(null);
    setIsDirectDispatch(true);
    setSelectedOrderForDispatch(null);
    setIsCreateModalOpen(true);
  };

  // Open Edit Dispatch Modal for an existing delivery challan
  const handleEditChallan = (challan: any) => {
    setEditingChallan(challan);
    setIsDirectDispatch(challan.orderNumber === 'DIRECT' || !challan.orderId);
    if (challan.orderId) {
      const matched = salesOrders.find(o => o._id === challan.orderId || o.orderNumber === challan.orderNumber);
      setSelectedOrderForDispatch(matched || null);
    } else {
      setSelectedOrderForDispatch(null);
    }
    setIsCreateModalOpen(true);
  };

  // Delete Delivery Challan
  const handleDeleteChallan = async (challan: any) => {
    const dcNo = challan.dcNumber || 'this delivery challan';
    if (!window.confirm(`Are you sure you want to delete Delivery Challan ${dcNo}? This action will remove the dispatch record and restore pending inventory quantities.`)) {
      return;
    }

    try {
      const companyId = selectedCompany?._id;

      if (challan._id) {
        try {
          await deleteDeliveryChallan(challan._id);
        } catch (apiErr) {
          console.warn('Backend deleteDeliveryChallan failed, proceeding with local reversal:', apiErr);
        }
      }

      // Revert sales order dispatched quantities if linked to an SO
      const targetOrderId = challan.orderId || challan.orderNumber;
      if (targetOrderId && targetOrderId !== 'DIRECT') {
        const targetSO = salesOrders.find(o => o._id === targetOrderId || o.orderNumber === targetOrderId);
        if (targetSO) {
          const updatedItems = (targetSO.items || []).map(soItem => {
            const matchedDcItem = (challan.items || []).find((ci: any) =>
              (ci.skuCode && ci.skuCode === soItem.skuCode) ||
              (ci.itemName && ci.itemName === soItem.itemName) ||
              (ci.itemId && String(ci.itemId) === String(soItem._id || soItem.skuId))
            );
            if (matchedDcItem) {
              const delivered = Number(matchedDcItem.deliveredQty || matchedDcItem.quantity || 0);
              const revertedQty = Math.max(0, (Number(soItem.dispatchedQty) || 0) - delivered);
              return { ...soItem, dispatchedQty: revertedQty };
            }
            return soItem;
          });

          const allPending = updatedItems.every(i => (Number(i.dispatchedQty) || 0) === 0);
          const someDispatched = updatedItems.some(i => (Number(i.dispatchedQty) || 0) > 0);
          const revertedOrder: SalesOrderV2 = {
            ...targetSO,
            items: updatedItems,
            fulfillmentStatus: allPending ? 'Unfulfilled' : someDispatched ? 'Partially Dispatched' : 'Fulfilled',
            status: allPending ? 'Confirmed' : someDispatched ? 'Partially Delivered' : 'Delivered'
          };

          saveCustomSalesOrder(revertedOrder, companyId);
          if (targetSO._id && !targetSO._id.startsWith('seed-') && !targetSO._id.startsWith('so-mock-')) {
            updateSalesOrderV2(targetSO._id, revertedOrder).catch(() => {});
          }
        }
      }

      // Update state and localStorage
      setDeliveryChallansList(prev => prev.filter(c => c._id !== challan._id && c.dcNumber !== challan.dcNumber));
      const cKey = `skbw_delivery_challans_${companyId || 'default'}`;
      const stored = JSON.parse(localStorage.getItem(cKey) || '[]');
      const filtered = stored.filter((c: any) => c._id !== challan._id && c.dcNumber !== challan.dcNumber);
      localStorage.setItem(cKey, JSON.stringify(filtered));

      window.dispatchEvent(new CustomEvent('stock_balance_changed'));
      window.dispatchEvent(new CustomEvent('sales_order_updated'));
      showToast(`Delivery Challan ${dcNo} deleted successfully`, 'success');
      fetchData(false);
    } catch (err) {
      console.error('Failed to delete delivery challan:', err);
      showToast('Failed to delete delivery challan', 'error');
    }
  };

  // Quick Instant Full Dispatch
  const handleQuickFullDispatch = (orderRow: DispatchRowOrder) => {
    setEditingChallan(null);
    setIsDirectDispatch(false);
    setSelectedOrderForDispatch(orderRow.rawOrder);
    setIsCreateModalOpen(true);
    showToast(`Opening dispatch with full pending quantities for ${orderRow.orderNumber}`, 'info');
  };

  // Dispatch Created/Updated Callback
  const handleDispatchCreated = (challan: any) => {
    setActiveChallan(challan);
    setIsCreateModalOpen(false);
    setEditingChallan(null);
    setIsChallanModalOpen(true);

    if (challan) {
      setDeliveryChallansList(prev => [
        challan,
        ...prev.filter(c => c._id !== challan._id && c.dcNumber !== challan.dcNumber)
      ]);

      if (challan.orderId || (challan.orderNumber && challan.orderNumber !== 'DIRECT')) {
        setSalesOrders(prev =>
          prev.map(so => {
            const isMatch = (challan.orderId && String(so._id) === String(challan.orderId)) ||
                            (challan.orderNumber && so.orderNumber === challan.orderNumber);
            if (!isMatch) return so;

            const updatedItems = (so.items || []).map(soItem => {
              const matchedDcItem = (challan.items || []).find((ci: any) =>
                (ci.skuId && String(ci.skuId) === String(soItem.skuId)) ||
                (ci.skuCode && ci.skuCode === soItem.skuCode) ||
                (ci.itemName && ci.itemName === soItem.itemName)
              );
              if (!matchedDcItem) return soItem;
              const delGbl = Number(matchedDcItem.deliveredQty || 0);
              return {
                ...soItem,
                dispatchedQty: (Number(soItem.dispatchedQty) || 0) + delGbl
              };
            });

            const allFulfilled = updatedItems.every(i => (Number(i.dispatchedQty) || 0) >= (Number(i.quantity) || 0));
            const someDispatched = updatedItems.some(i => (Number(i.dispatchedQty) || 0) > 0);

            return {
              ...so,
              items: updatedItems,
              fulfillmentStatus: allFulfilled ? 'Fulfilled' : someDispatched ? 'Partially Dispatched' : so.fulfillmentStatus,
              status: allFulfilled ? 'Delivered' : someDispatched ? 'Partially Delivered' : so.status
            };
          })
        );
      }
    }
    fetchData(false);
  };

  // Export Excel
  const handleExportExcel = (targetRows = filteredRows) => {
    try {
      const exportData = targetRows.map(row => ({
        'SO Number': row.orderNumber,
        'Order Date': row.orderDate,
        'Customer Name': row.customerName,
        'Phone': row.customerPhone || '',
        'City': row.city || '',
        'Region': row.region,
        'Items Count': row.itemCount,
        'Items Detail': row.items.map(i => `${i.itemName} (${i.gbl} GBL / ${i.pcs} PCS)`).join('; '),
        'Pending GBL': row.pendingGbl,
        'Pending PCS': row.pendingPcs,
        'Ready Status': row.readyStatus
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pending Dispatch');
      XLSX.writeFile(wb, `Pending_Dispatch_Orders_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Exported dispatch orders to Excel', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to export Excel file', 'error');
    }
  };

  // Date Preset Handler
  const applyDatePreset = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'All') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'Today') {
      const t = toYMD(now);
      setStartDate(t);
      setEndDate(t);
    } else if (preset === 'This Week') {
      const first = new Date(now.setDate(now.getDate() - now.getDay()));
      const last = new Date(now.setDate(now.getDate() - now.getDay() + 6));
      setStartDate(toYMD(first));
      setEndDate(toYMD(last));
    } else if (preset === 'This Month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(toYMD(first));
      setEndDate(toYMD(last));
    }
    setShowDateFilter(false);
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 space-y-4 font-sans text-gray-800">
      {/* ── 1. HEADER BANNER (Matching Production Module Style) ── */}
      <div className="flex flex-row items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-2xs relative">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-blue-100/80 text-blue-700 rounded-2xl shadow-2xs">
            <Truck className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span>Pending Orders for Dispatch</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-bold transition-all">
                {metrics.pendingOrders} Orders
              </span>
            </h1>
            <p className="text-xs text-gray-500 font-medium">
              Create dispatches from Sales Orders or create direct standalone dispatches directly.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => handleExportExcel()}
            className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-xl border border-gray-200 text-xs font-bold flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-gray-500" />
            <span className="hidden sm:inline">Export Excel</span>
          </button>

          {/* Direct Dispatch without Sales Order */}
          <button
            onClick={handleOpenDirectDispatch}
            className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
            title="Create a new dispatch batch directly without any Sales Order"
          >
            <Plus className="w-4 h-4 text-purple-600 stroke-[2.5]" />
            <span>+ Direct Dispatch</span>
          </button>

          {/* Standard Dispatch from Sales Order */}
          <button
            onClick={() => handleOpenDispatch()}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm shadow-blue-500/25 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>+ Create Dispatch</span>
          </button>
        </div>
      </div>

      {/* ── 2. TOP NAVIGATION TABS & ACTION BAR (Matching Production Module Style) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 bg-white px-4 rounded-2xl shadow-2xs relative">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-full">
          {[
            { id: 'all', label: 'All Pending', count: metrics.pendingOrders },
            { id: 'ready', label: 'Ready to Dispatch', count: metrics.readyOrders },
            { id: 'partial', label: 'Partially Ready', count: metrics.partiallyReadyOrders },
            { id: 'not_ready', label: 'Not Ready', count: metrics.notReadyOrders },
            { id: 'history', label: 'Challans History', count: deliveryChallansList.length }
          ].map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); setCurrentPage(1); }}
                className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
                  active 
                    ? 'border-blue-600 text-blue-700 bg-transparent'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Action Bar */}
        <div className="py-2 flex items-center gap-1.5 flex-wrap shrink-0 relative z-40">
          {/* Global Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search orders, items, DC..."
              className="pl-8 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl w-36 md:w-48 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs font-medium"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Detailed View / Collapse All */}
          <button
            type="button"
            onClick={toggleAllDetails}
            className={`px-2.5 py-1.5 text-xs rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 font-bold shadow-2xs ${
              isAllExpanded
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
            }`}
            title={isAllExpanded ? "Collapse All Items" : "Expand All Items"}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isAllExpanded ? 'rotate-180' : ''}`} />
            <span className="hidden sm:inline">{isAllExpanded ? 'Collapse All' : 'Detailed View'}</span>
          </button>

          {/* Dedicated Date Filter Button + Popover */}
          <div className="relative" ref={dateFilterRef}>
            <button
              type="button"
              onClick={() => {
                setShowDateFilter(!showDateFilter);
                setShowFilterMenu(false);
                setShowSortMenu(false);
              }}
              className={`px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs text-xs font-bold ${
                datePreset !== 'All' || startDate || endDate
                  ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-100'
                  : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'
              }`}
              title="Filter by Order Date"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden md:inline">
                {datePreset === 'All' ? 'Date Filter' : datePreset === 'Custom' ? 'Custom Date' : datePreset}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {showDateFilter && (
              <div 
                className="absolute right-0 mt-1.5 w-68 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-3 space-y-3 text-xs text-left animate-in fade-in zoom-in-95 duration-100"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                  <span className="font-bold text-gray-800 text-xs">Date Range Filter</span>
                  {(datePreset !== 'All' || startDate || endDate) && (
                    <button
                      onClick={() => applyDatePreset('All')}
                      className="text-blue-600 hover:text-blue-800 text-[11px] font-bold cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Date Presets */}
                <div className="grid grid-cols-2 gap-1.5">
                  {['All', 'Today', 'This Week', 'This Month'].map(preset => (
                    <button
                      key={preset}
                      onClick={() => applyDatePreset(preset)}
                      className={`px-2.5 py-1.5 text-xs font-bold rounded-lg text-center transition-colors cursor-pointer ${
                        datePreset === preset ? 'bg-blue-600 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                {/* Custom Date Pickers */}
                <div className="space-y-1.5 pt-2 border-t border-gray-100">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-0.5">From Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => { setStartDate(e.target.value); setDatePreset('Custom'); }}
                      className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-0.5">To Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => { setEndDate(e.target.value); setDatePreset('Custom'); }}
                      className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Filter Popover Icon Button (Customer, Region, Status) */}
          <div className="relative" ref={filterMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowFilterMenu(!showFilterMenu);
                setShowDateFilter(false);
                setShowSortMenu(false);
              }}
              className={`p-2 rounded-xl border transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
                (selectedCustomer !== 'ALL' || selectedRegion !== 'ALL' || selectedStatus !== 'ALL')
                  ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-100'
                  : 'bg-white hover:bg-blue-50/60 border-gray-200 hover:border-blue-200 text-blue-600'
              }`}
              title="Filter Orders"
            >
              <Filter className="w-4 h-4 text-blue-600" />
            </button>

            {showFilterMenu && (
              <div 
                className="absolute right-0 mt-1.5 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-3 space-y-3 text-xs text-left animate-in fade-in zoom-in-95 duration-100"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                  <span className="font-bold text-gray-800 text-xs">Filter Attributes</span>
                  {(selectedCustomer !== 'ALL' || selectedRegion !== 'ALL' || selectedStatus !== 'ALL') && (
                    <button
                      onClick={() => {
                        setSelectedCustomer('ALL');
                        setSelectedRegion('ALL');
                        setSelectedStatus('ALL');
                      }}
                      className="text-blue-600 hover:text-blue-800 text-[11px] font-bold cursor-pointer"
                    >
                      Reset All
                    </button>
                  )}
                </div>

                {/* Customer Filter */}
                <div>
                  <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">Customer / Party</label>
                  <select
                    value={selectedCustomer}
                    onChange={e => { setSelectedCustomer(e.target.value); setCurrentPage(1); }}
                    className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="ALL">All Customers ({customerOptions.length})</option>
                    {customerOptions.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Region Filter */}
                <div>
                  <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">Region</label>
                  <select
                    value={selectedRegion}
                    onChange={e => { setSelectedRegion(e.target.value); setCurrentPage(1); }}
                    className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="ALL">All Regions ({regionOptions.length})</option>
                    {regionOptions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* Readiness Status */}
                <div>
                  <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">Readiness Status</label>
                  <select
                    value={selectedStatus}
                    onChange={e => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
                    className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="ALL">All Status</option>
                    <option value="Ready">Ready (In Stock)</option>
                    <option value="Partially Ready">Partially Ready</option>
                    <option value="Not Ready">Not Ready</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Sort Popover Icon Button */}
          <div className="relative" ref={sortMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowSortMenu(!showSortMenu);
                setShowFilterMenu(false);
                setShowDateFilter(false);
              }}
              className="p-2 rounded-xl bg-white hover:bg-blue-50/60 border border-gray-200 hover:border-blue-200 text-blue-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
              title="Sort Orders"
            >
              <ArrowUpDown className="w-4 h-4 text-blue-600" />
            </button>

            {showSortMenu && (
              <div 
                className="absolute right-0 mt-1.5 w-48 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-2 space-y-1 text-xs text-left animate-in fade-in zoom-in-95 duration-100"
                onClick={e => e.stopPropagation()}
              >
                <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block px-2 py-1">Sort Orders</span>
                <button
                  onClick={() => { handleSort('orderNumber'); setShowSortMenu(false); }}
                  className="w-full px-2.5 py-1.5 text-left rounded-xl hover:bg-gray-50 flex items-center justify-between font-semibold text-gray-700"
                >
                  <span>SO Number</span>
                  {sortField === 'orderNumber' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />)}
                </button>
                <button
                  onClick={() => { handleSort('rawDate'); setShowSortMenu(false); }}
                  className="w-full px-2.5 py-1.5 text-left rounded-xl hover:bg-gray-50 flex items-center justify-between font-semibold text-gray-700"
                >
                  <span>Order Date</span>
                  {sortField === 'rawDate' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />)}
                </button>
                <button
                  onClick={() => { handleSort('customerName'); setShowSortMenu(false); }}
                  className="w-full px-2.5 py-1.5 text-left rounded-xl hover:bg-gray-50 flex items-center justify-between font-semibold text-gray-700"
                >
                  <span>Customer Name</span>
                  {sortField === 'customerName' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />)}
                </button>
                <button
                  onClick={() => { handleSort('pendingGbl'); setShowSortMenu(false); }}
                  className="w-full px-2.5 py-1.5 text-left rounded-xl hover:bg-gray-50 flex items-center justify-between font-semibold text-gray-700"
                >
                  <span>Pending Quantity</span>
                  {sortField === 'pendingGbl' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />)}
                </button>
              </div>
            )}
          </div>

          {/* Refresh Icon Button */}
          <button
            onClick={() => { fetchData(false); showToast('Refreshed dispatch data', 'info'); }}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white hover:bg-blue-50/60 border border-gray-200 hover:border-blue-200 text-blue-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── 3. TABLE VIEW ── */}
      {activeTab === 'history' ? (
        /* History View of Created Delivery Challans */
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80 text-[11px] font-bold uppercase tracking-wider text-gray-500 select-none">
                  <th 
                    onClick={() => handleChallanSort('dcNumber')}
                    className="py-3 px-4 cursor-pointer hover:text-gray-900 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>DC NUMBER</span>
                      {challanSortField === 'dcNumber' ? (challanSortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleChallanSort('date')}
                    className="py-3 px-4 cursor-pointer hover:text-gray-900 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>DATE</span>
                      {challanSortField === 'date' ? (challanSortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleChallanSort('orderNumber')}
                    className="py-3 px-4 cursor-pointer hover:text-gray-900 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>SO REF</span>
                      {challanSortField === 'orderNumber' ? (challanSortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleChallanSort('customerName')}
                    className="py-3 px-4 cursor-pointer hover:text-gray-900 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>CUSTOMER</span>
                      {challanSortField === 'customerName' ? (challanSortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleChallanSort('transporterName')}
                    className="py-3 px-4 cursor-pointer hover:text-gray-900 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>TRANSPORTER</span>
                      {challanSortField === 'transporterName' ? (challanSortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleChallanSort('vehicleNumber')}
                    className="py-3 px-4 cursor-pointer hover:text-gray-900 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>VEHICLE</span>
                      {challanSortField === 'vehicleNumber' ? (challanSortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleChallanSort('items')}
                    className="py-3 px-4 text-center cursor-pointer hover:text-gray-900 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>ITEMS</span>
                      {challanSortField === 'items' ? (challanSortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleChallanSort('status')}
                    className="py-3 px-4 text-center cursor-pointer hover:text-gray-900 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>STATUS</span>
                      {challanSortField === 'status' ? (challanSortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center min-w-[220px]">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedChallansList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-400">
                      <Truck className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                      <p className="font-semibold text-gray-600">No delivery challans created yet</p>
                      <p className="text-xs text-gray-400 mt-0.5">Click "+ Direct Dispatch" or create a dispatch from any sales order.</p>
                    </td>
                  </tr>
                ) : (
                  sortedChallansList.map((ch, idx) => (
                    <tr key={ch._id || idx} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-600 whitespace-nowrap">
                        {ch.dcNumber || `DO-${String(idx + 1).padStart(3, '0')}`}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-gray-700 whitespace-nowrap font-mono">
                        {ch.date || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold whitespace-nowrap">
                        {ch.orderNumber && ch.orderNumber !== 'DIRECT' ? (
                          <span className="text-gray-800">{ch.orderNumber}</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            Direct Dispatch
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-gray-900">
                        {ch.customerName || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-gray-700">
                        {ch.transporterName || 'Direct / Self'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-gray-700">
                        {ch.vehicleNumber || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700">
                          {ch.items?.length || 0} items
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          ch.status === 'draft'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {ch.status || 'dispatched'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Edit Dispatch - accessible in Challan History only */}
                          <button
                            onClick={() => handleEditChallan(ch)}
                            className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-800 rounded-lg transition-all flex items-center justify-center cursor-pointer border border-amber-200/80 shadow-2xs hover:scale-105 active:scale-95"
                            title="Edit Delivery Challan"
                          >
                            <Edit3 className="w-4 h-4 text-amber-600" />
                          </button>

                          {/* Print DC */}
                          <button
                            onClick={() => {
                              setActiveChallan(ch);
                              setIsChallanModalOpen(true);
                            }}
                            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800 rounded-lg transition-all flex items-center justify-center cursor-pointer border border-blue-200/80 shadow-2xs hover:scale-105 active:scale-95"
                            title="Print Delivery Challan"
                          >
                            <Printer className="w-4 h-4 text-blue-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Orders Master Table with Clickable Column Header Sorting & Expandable Items Accordion Dropdown */
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80 text-[11px] font-bold text-gray-500 uppercase tracking-wider select-none">
                  <th className="py-3 px-3 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-2 w-10 text-center font-bold">#</th>

                  {/* 1. SO NO */}
                  <th 
                    onClick={() => handleSort('orderNumber')}
                    className="py-3 px-3 font-bold cursor-pointer hover:text-gray-900 whitespace-nowrap transition-colors"
                  >
                    <div className="flex items-center space-x-1">
                      <span>SO NO.</span>
                      {sortField === 'orderNumber' ? (
                        sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-400" />
                      )}
                    </div>
                  </th>

                  {/* 2. DATE */}
                  <th 
                    onClick={() => handleSort('rawDate')}
                    className="py-3 px-3 font-bold cursor-pointer hover:text-gray-900 whitespace-nowrap transition-colors"
                  >
                    <div className="flex items-center space-x-1">
                      <span>DATE</span>
                      {sortField === 'rawDate' ? (
                        sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-400" />
                      )}
                    </div>
                  </th>

                  {/* 3. CUSTOMER / PARTY */}
                  <th 
                    onClick={() => handleSort('customerName')}
                    className="py-3 px-3 font-bold cursor-pointer hover:text-gray-900 min-w-[200px] transition-colors"
                  >
                    <div className="flex items-center space-x-1">
                      <span>CUSTOMER / PARTY</span>
                      {sortField === 'customerName' ? (
                        sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-400" />
                      )}
                    </div>
                  </th>

                  {/* 4. REGION */}
                  <th 
                    onClick={() => handleSort('region')}
                    className="py-3 px-3 font-bold cursor-pointer hover:text-gray-900 whitespace-nowrap transition-colors"
                  >
                    <div className="flex items-center space-x-1">
                      <span>REGION</span>
                      {sortField === 'region' ? (
                        sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-400" />
                      )}
                    </div>
                  </th>

                  {/* 5. ITEMS COUNT */}
                  <th 
                    onClick={() => handleSort('itemCount')}
                    className="py-3 px-3 font-bold text-center cursor-pointer hover:text-gray-900 whitespace-nowrap w-32 transition-colors"
                  >
                    <div className="flex items-center justify-center space-x-1">
                      <span>ITEMS</span>
                      {sortField === 'itemCount' ? (
                        sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-400" />
                      )}
                    </div>
                  </th>

                  {/* 6. PENDING GBL */}
                  <th 
                    onClick={() => handleSort('pendingGbl')}
                    className="py-3 px-3 font-bold cursor-pointer hover:text-gray-900 text-right whitespace-nowrap transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>PENDING (GBL)</span>
                      {sortField === 'pendingGbl' ? (
                        sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-400" />
                      )}
                    </div>
                  </th>

                  {/* 7. PENDING PCS */}
                  <th 
                    onClick={() => handleSort('pendingPcs')}
                    className="py-3 px-3 font-bold cursor-pointer hover:text-gray-900 text-right whitespace-nowrap transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>PENDING (PCS)</span>
                      {sortField === 'pendingPcs' ? (
                        sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-400" />
                      )}
                    </div>
                  </th>

                  {/* 8. READY STATUS */}
                  <th 
                    onClick={() => handleSort('readyStatus')}
                    className="py-3 px-3 font-bold text-center cursor-pointer hover:text-gray-900 whitespace-nowrap min-w-[140px] transition-colors"
                  >
                    <div className="flex items-center justify-center space-x-1">
                      <span>READY STATUS</span>
                      {sortField === 'readyStatus' ? (
                        sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-400" />
                      )}
                    </div>
                  </th>

                  <th className="py-3 px-3 text-center font-bold whitespace-nowrap">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Truck className="w-8 h-8 text-gray-300 stroke-[1.5]" />
                        <span className="font-semibold text-sm">No pending orders matching filters</span>
                        <span className="text-xs text-gray-400">Try adjusting your search terms or filters</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row, idx) => {
                    const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                    const isChecked = selectedOrderIds.has(row._id);
                    const isExpanded = expandedOrderIds.has(row._id);
                    const isMenuOpen = openActionDropdownId === row._id;
                    const rowChallans = orderChallansMap.get(row._id) || orderChallansMap.get(row.orderNumber) || [];

                    return (
                      <React.Fragment key={row._id}>
                        <tr
                          onClick={() => toggleOrderExpand(row._id)}
                          className={`hover:bg-blue-50/40 transition-colors group cursor-pointer ${
                            isChecked ? 'bg-blue-50/60' : isExpanded ? 'bg-blue-50/20' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3.5 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectRow(row._id)}
                              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>

                          {/* Index # */}
                          <td className="py-3.5 px-2 text-center font-semibold text-gray-500">
                            {rowNumber}
                          </td>

                          {/* SO Number - Clickable */}
                          <td className="py-3.5 px-3 font-bold whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setSelectedOrderDetailRow(row)}
                              className="hover:text-blue-600 hover:underline transition-colors text-left font-bold cursor-pointer font-mono text-xs block text-blue-700"
                            >
                              {row.orderNumber}
                            </button>
                          </td>

                          {/* Order Date */}
                          <td className="py-3.5 px-3 text-gray-600 font-mono text-xs whitespace-nowrap">
                            {row.orderDate}
                          </td>

                          {/* Customer Block */}
                          <td className="py-3.5 px-3 min-w-[200px]">
                            <div className="font-bold text-gray-900 leading-snug">{row.customerName}</div>
                            <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                              {row.customerPhone && (
                                <span className="font-mono flex items-center gap-1">
                                  <Phone className="w-2.5 h-2.5 text-gray-400" />
                                  {row.customerPhone}
                                </span>
                              )}
                              {row.city && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-2.5 h-2.5 text-gray-400" />
                                  {row.city}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Region */}
                          <td className="py-3.5 px-3 text-gray-700 font-medium whitespace-nowrap">
                            {row.region}
                          </td>

                          {/* ITEMS: Only shows number of items badge when unopened; click toggles dropdown */}
                          <td className="py-3.5 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleOrderExpand(row._id)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-3xs ${
                                isExpanded
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                  : 'bg-blue-50/80 hover:bg-blue-100 text-blue-700 border-blue-200/80 hover:border-blue-300'
                              }`}
                              title={isExpanded ? 'Collapse items' : 'View order items'}
                            >
                              <Package className={`w-3.5 h-3.5 ${isExpanded ? 'text-white' : 'text-blue-600'}`} />
                              <span>{row.itemCount} {row.itemCount === 1 ? 'Item' : 'Items'}</span>
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-white' : 'text-blue-500'}`} />
                            </button>
                          </td>

                          {/* Pending QTY: GBL */}
                          <td className="py-3.5 px-3 text-right font-bold text-gray-900 font-mono text-xs whitespace-nowrap">
                            {row.pendingGbl.toLocaleString()}
                          </td>

                          {/* Pending QTY: PCS */}
                          <td className="py-3.5 px-3 text-right font-medium text-gray-600 font-mono text-xs whitespace-nowrap">
                            {row.pendingPcs.toLocaleString()}
                          </td>

                          {/* Ready Status Badge */}
                          <td className="py-3.5 px-3 text-center whitespace-nowrap">
                            {row.readyStatus === 'Ready' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Ready (In Stock)
                              </span>
                            )}
                            {row.readyStatus === 'Partially Ready' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                                Partially Ready
                              </span>
                            )}
                            {row.readyStatus === 'Not Ready' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/80">
                                Not Ready
                              </span>
                            )}
                          </td>

                          {/* Actions Column: Dispatch, Edit, Delete, More (Icon-only buttons) */}
                          <td className="py-3 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1.5">
                              {/* 1. Dispatch Icon Button */}
                              <button
                                onClick={() => handleOpenDispatch(row)}
                                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all flex items-center justify-center shadow-2xs cursor-pointer hover:scale-105 active:scale-95"
                                title="Create Dispatch for this order"
                              >
                                <Truck className="w-4 h-4" />
                              </button>

                              {/* 2. More Options Dropdown Toggle */}
                              <div className="relative inline-flex items-center overflow-visible">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenActionDropdownId(isMenuOpen ? null : row._id);
                                  }}
                                  className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors cursor-pointer hover:scale-105 active:scale-95"
                                  title="More actions"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>

                              {/* Dropdown Options */}
                              {isMenuOpen && (
                                <div
                                  className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50 text-left animate-in fade-in zoom-in-95 duration-100"
                                  onClick={e => e.stopPropagation()}
                                >
                                  {/* 1. Dispatch Actions */}
                                  <button
                                    onClick={() => {
                                      setOpenActionDropdownId(null);
                                      handleOpenDispatch(row);
                                    }}
                                    className="w-full px-3 py-1.5 text-xs text-left font-bold text-gray-800 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 cursor-pointer"
                                  >
                                    <Truck className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Dispatch (Custom)</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setOpenActionDropdownId(null);
                                      handleQuickFullDispatch(row);
                                    }}
                                    className="w-full px-3 py-1.5 text-xs text-left font-bold text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Dispatch All Pending</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setOpenActionDropdownId(null);
                                      setSelectedOrderDetailRow(row);
                                    }}
                                    className="w-full px-3 py-1.5 text-xs text-left font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-gray-400" />
                                    <span>View Order Details</span>
                                  </button>

                                  {/* 2. Existing Dispatches for this order (Print / View Only) */}
                                  {rowChallans.length > 0 && (
                                    <>
                                      <div className="border-t border-gray-100 my-1 px-3 py-1 bg-gray-50/80 text-[10px] font-black uppercase tracking-wider text-gray-500">
                                        Dispatches ({rowChallans.length})
                                      </div>
                                      {rowChallans.map((ch: any) => (
                                        <div key={ch._id || ch.dcNumber} className="px-1 py-0.5">
                                          <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-blue-700 bg-blue-50/50 rounded-lg">
                                            <span className="font-mono">{ch.dcNumber}</span>
                                            <div className="flex items-center gap-1">
                                              {/* Print DC */}
                                              <button
                                                onClick={() => {
                                                  setOpenActionDropdownId(null);
                                                  setActiveChallan(ch);
                                                  setIsChallanModalOpen(true);
                                                }}
                                                className="p-1 text-gray-600 hover:text-blue-700 hover:bg-white rounded transition-colors"
                                                title="Print Delivery Challan"
                                              >
                                                <Printer className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </>
                                  )}
                                </div>
                              )}
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* ── EXPANDED DETAILED ITEMS SUB-TABLE (ACCORDION DROPDOWN) ── */}
                        {isExpanded && (
                          <tr className="bg-slate-50/80 border-b border-gray-200 animate-in fade-in duration-150">
                            <td colSpan={11} className="p-3 pl-8 pr-4">
                              <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
                                <div className="px-4 py-2.5 bg-gray-50/90 border-b border-gray-200 flex items-center justify-between text-xs font-semibold text-gray-700">
                                  <span className="flex items-center gap-2">
                                    <Package className="w-4 h-4 text-blue-600" />
                                    <span>All Items in Sales Order <strong className="text-gray-900 font-mono">{row.orderNumber}</strong> ({row.items.length} items)</span>
                                  </span>
                                  <div className="flex items-center gap-3 text-[11px] font-mono">
                                    <span className="text-gray-500">Total Pending: {row.pendingGbl} GBL ({row.pendingPcs.toLocaleString()} PCS)</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                                      row.readyStatus === 'Ready'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : row.readyStatus === 'Partially Ready'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : 'bg-rose-50 text-rose-700 border-rose-200'
                                    }`}>
                                      {row.readyStatus}
                                    </span>
                                  </div>
                                </div>

                                <table className="w-full text-left text-xs divide-y divide-gray-150">
                                  <thead className="bg-gray-50/70 text-[10.5px] font-bold text-gray-500 uppercase tracking-wider">
                                    <tr>
                                      <th className="py-2.5 px-3">Item Description</th>
                                      <th className="py-2.5 px-3">SKU Code</th>
                                      <th className="py-2.5 px-3 text-right">Ordered</th>
                                      <th className="py-2.5 px-3 text-right">Dispatched</th>
                                      <th className="py-2.5 px-3 text-right font-bold text-blue-700">Pending</th>
                                      <th className="py-2.5 px-3 text-right font-semibold text-slate-700">Warehouse Stock</th>
                                      <th className="py-2.5 px-3 text-center">Status</th>
                                      <th className="py-2.5 px-3 text-right">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100 font-medium">
                                    {row.items.map((it, iIdx) => (
                                      <tr key={it.skuCode || iIdx} className="hover:bg-blue-50/40 transition-colors">
                                        <td className="py-2.5 px-3 font-semibold text-gray-900">
                                          {it.itemName}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono text-gray-500 text-[11px]">
                                          {it.skuCode || '—'}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-gray-700">
                                          {it.orderedQty.toLocaleString()} <span className="text-[10px] text-gray-400">{it.uom}</span>
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-gray-500">
                                          {it.dispatchedQty.toLocaleString()}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">
                                          {it.gbl} GBL <span className="text-[10px] text-gray-400">({it.pcs.toLocaleString()} pcs)</span>
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono font-semibold">
                                          {(it.stockOnHandGbl ?? 0) > 0 ? (
                                            <span className="text-emerald-700">
                                              {it.stockOnHandGbl} GBL <span className="text-[10px] text-gray-400">({(it.stockOnHandPcs ?? 0).toLocaleString()} pcs)</span>
                                            </span>
                                          ) : (
                                            <span className="text-rose-600">0 GBL</span>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                          {it.isAvailable ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                              In Stock (Ready)
                                            </span>
                                          ) : (it.stockOnHandGbl ?? 0) > 0 ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                              <Clock className="w-3 h-3 text-amber-600" />
                                              Partial Stock
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                              <AlertCircle className="w-3 h-3 text-rose-600" />
                                              Needs Production
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-3 text-right">
                                          <button
                                            onClick={() => handleOpenDispatch(row)}
                                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-semibold cursor-pointer transition-colors inline-flex items-center gap-1"
                                          >
                                            <Truck className="w-3 h-3" />
                                            <span>Dispatch</span>
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── FOOTER PAGINATION (Matching Production Module Style) ── */}
          <div className="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-gray-600 bg-white">
            <div>
              Showing <span className="font-bold text-gray-900">{filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> - <span className="font-bold text-gray-900">{Math.min(currentPage * pageSize, filteredRows.length)}</span> of <span className="font-bold text-gray-900">{filteredRows.length}</span> orders
            </div>

            <div className="flex items-center gap-4">
              {/* Rows per page selector */}
              <div className="flex items-center gap-1.5">
                <span>Rows</span>
                <div className="relative">
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 pr-6 text-xs font-bold text-gray-700 cursor-pointer focus:outline-none"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-gray-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Page number */}
              <div className="flex items-center gap-1.5">
                <span>Page</span>
                <span className="w-8 py-1 text-center font-bold text-gray-900 border border-gray-200 rounded-lg bg-gray-50">
                  {currentPage}
                </span>
                <span>of {totalPages}</span>
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="p-1 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5 -mr-1.5 inline" />
                  <ChevronLeft className="w-3.5 h-3.5 inline" />
                </button>
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="p-1 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5 -mr-1.5 inline" />
                  <ChevronRight className="w-3.5 h-3.5 inline" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BULK ACTION BAR ── */}
      {selectedOrderIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5 duration-200 border border-gray-800">
          <span className="text-xs font-bold">
            {selectedOrderIds.size} orders selected
          </span>
          <div className="h-4 w-px bg-gray-700" />
          <button
            onClick={() => {
              const selected = filteredRows.filter(r => selectedOrderIds.has(r._id));
              handleExportExcel(selected);
            }}
            className="text-xs font-bold text-gray-200 hover:text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Selected</span>
          </button>
          <button
            onClick={() => setSelectedOrderIds(new Set())}
            className="text-xs font-bold text-gray-400 hover:text-gray-200 cursor-pointer ml-2"
          >
            Deselect All
          </button>
        </div>
      )}

      {/* ── CREATE / EDIT DISPATCH MODAL ── */}
      {isCreateModalOpen && (
        <CreateDispatchModal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingChallan(null);
            setIsDirectDispatch(false);
          }}
          order={selectedOrderForDispatch}
          allOrders={salesOrders}
          editingChallan={editingChallan}
          isDirectDispatch={isDirectDispatch}
          onOrderChange={(newOrder) => setSelectedOrderForDispatch(newOrder)}
          onDispatchCreated={handleDispatchCreated}
        />
      )}

      {/* ── VIEW / PRINT DELIVERY CHALLAN MODAL ── */}
      {isChallanModalOpen && activeChallan && (
        <ViewDeliveryChallanModal
          isOpen={isChallanModalOpen}
          onClose={() => {
            setIsChallanModalOpen(false);
            setActiveChallan(null);
          }}
          challan={activeChallan}
        />
      )}

      {/* ── SALES ORDER DISPATCH DETAIL MODAL ── */}
      {selectedOrderDetailRow && (
        <DispatchOrderDetailModal
          isOpen={!!selectedOrderDetailRow}
          onClose={() => setSelectedOrderDetailRow(null)}
          orderRow={selectedOrderDetailRow}
          onOpenDispatch={(row) => handleOpenDispatch(row)}
          onViewChallan={(ch) => {
            setActiveChallan(ch);
            setIsChallanModalOpen(true);
          }}
        />
      )}
    </div>
  );
};

export default DispatchModule;

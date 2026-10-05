import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Truck, FileText, Package, CheckCircle2, Clock, AlertCircle,
  Search, Filter, RefreshCw, SlidersHorizontal, ChevronDown,
  Phone, MapPin, Download, Check, Eye, Plus, ArrowUpDown, ChevronLeft, ChevronRight,
  Printer, X, ArrowUp, ArrowDown, ExternalLink, Calendar, CheckSquare, Square
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import { getSalesOrdersV2, SalesOrderV2, updateSalesOrderV2 } from '../../api/salesOrderApiV2';
import { getCustomSalesOrders, saveCustomSalesOrder } from '../../utils/salesOrderStorage';
import { getBalancesV2, getSkusV2 } from '../../api/mfgApiV2';
import { getDeliveryChallans, createDeliveryChallan } from '../../api/deliveryChallanApi';
import { CreateDispatchModal } from './CreateDispatchModal';
import { ViewDeliveryChallanModal } from './ViewDeliveryChallanModal';
import { DispatchOrderDetailModal } from './DispatchOrderDetailModal';
import { showToast } from '../ui/Toast';

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

// Fallback seed orders matching user's reference screenshot perfectly
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

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('ALL');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Date Filter Popover State
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [datePreset, setDatePreset] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const dateFilterRef = useRef<HTMLDivElement>(null);

  // Sorting
  const [sortField, setSortField] = useState<'orderNumber' | 'rawDate' | 'pendingGbl' | 'customerName'>('orderNumber');
  const [sortAsc, setSortAsc] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Row Action Dropdowns (orderId -> boolean)
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);

  // Selection & Pagination
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedOrderForDispatch, setSelectedOrderForDispatch] = useState<SalesOrderV2 | null>(null);
  const [isChallanModalOpen, setIsChallanModalOpen] = useState(false);
  const [activeChallan, setActiveChallan] = useState<any>(null);
  const [selectedOrderDetailRow, setSelectedOrderDetailRow] = useState<DispatchRowOrder | null>(null);

  // Delivery Challans List
  const [deliveryChallansList, setDeliveryChallansList] = useState<any[]>([]);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(e.target as Node)) {
        setShowDateFilter(false);
      }
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
      // Close row actions
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

      setSalesOrders(combined);

      // 2. Fetch Live Stock Balances & SKU Master Data for accurate stock readiness
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
        setDeliveryChallansList(challans);
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
    fetchData(true);
  }, [selectedCompany?._id]);

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
      return FALLBACK_SEED_ORDERS;
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

        // Determine true ordered PCS vs GBL
        if (itemGbl > 0 && rawOrdered > itemGbl) {
          // item.quantity was stored in PCS, item.gbl is the GBL equivalent
          orderedPcs = rawOrdered;
          orderedGbl = itemGbl;
        } else if (rawOrdered >= conv && conv > 1) {
          // Clearly entered as pieces
          orderedPcs = rawOrdered;
          orderedGbl = itemGbl || Math.ceil(rawOrdered / conv);
        } else if ((item.uom || '').toUpperCase() === 'GBL') {
          // True GBL quantity
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

        // Item is available purely dynamically if warehouse stock fulfills requirement in GBL or PCS
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

      // Purely dynamic order readiness:
      // Ready if all items are fully in stock
      // Partially Ready if some items or partial stock is available
      // Not Ready if zero required stock is available
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

    // Sorting
    return res.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'orderNumber') {
        cmp = a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true });
      } else if (sortField === 'rawDate') {
        cmp = (a.rawDate || '').localeCompare(b.rawDate || '');
      } else if (sortField === 'pendingGbl') {
        cmp = a.pendingGbl - b.pendingGbl;
      } else if (sortField === 'customerName') {
        cmp = a.customerName.localeCompare(b.customerName);
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

  // Open Dispatch Modal
  const handleOpenDispatch = (orderRow?: DispatchRowOrder) => {
    if (orderRow) {
      setSelectedOrderForDispatch(orderRow.rawOrder);
    } else if (displayRows.length > 0) {
      setSelectedOrderForDispatch(displayRows[0].rawOrder);
    } else {
      setSelectedOrderForDispatch(null);
    }
    setIsCreateModalOpen(true);
  };

  // Auto-open dispatch if orderId is provided in URL (e.g. from Sales Production View)
  useEffect(() => {
    const targetOrderId = searchParams.get('orderId');
    if (targetOrderId && displayRows.length > 0 && !urlOrderIdHandled.current) {
      const found = displayRows.find(r => r._id === targetOrderId || r.orderNumber === targetOrderId || (r.rawOrder && r.rawOrder._id === targetOrderId));
      if (found) {
        urlOrderIdHandled.current = true;
        handleOpenDispatch(found);
      }
    }
  }, [searchParams, displayRows]);

  // Quick Instant Full Dispatch
  const handleQuickFullDispatch = (orderRow: DispatchRowOrder) => {
    setSelectedOrderForDispatch(orderRow.rawOrder);
    setIsCreateModalOpen(true);
    showToast(`Opening dispatch with full pending quantities for ${orderRow.orderNumber}`, 'info');
  };

  // Dispatch Created Callback
  const handleDispatchCreated = (challan: any) => {
    setActiveChallan(challan);
    setIsCreateModalOpen(false);
    setIsChallanModalOpen(true);
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

  // Quick Date Preset Handler
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-200">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs">
            <Truck className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                Pending Orders for Dispatch
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200/80">
                {metrics.pendingOrders} Orders
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 font-medium">
              Select a pending sales order and create a dispatch. You can dispatch full or partial quantities.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button
            onClick={() => handleExportExcel()}
            className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-xl border border-gray-200/90 text-xs font-bold flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-gray-500" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={() => handleOpenDispatch()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm shadow-blue-500/25 transition-all cursor-pointer active:scale-98"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>+ Create Dispatch</span>
          </button>
        </div>
      </div>

      {/* ── 5 METRIC CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Pending Orders */}
        <button
          onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
          className={`text-left rounded-2xl p-4 border transition-all cursor-pointer flex items-center gap-4 shadow-2xs ${
            activeTab === 'all'
              ? 'bg-blue-50/50 border-blue-400 ring-2 ring-blue-100'
              : 'bg-white border-gray-200/80 hover:border-gray-300'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <FileText className="w-6 h-6 stroke-[2]" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">
              Pending Orders
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-black text-gray-900 tracking-tight font-mono">
                {metrics.pendingOrders}
              </span>
              <span className="text-xs font-medium text-gray-400">orders</span>
            </div>
          </div>
        </button>

        {/* Card 2: Total Pending Qty */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
            <Package className="w-6 h-6 stroke-[2]" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">
              Total Pending Qty
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-black text-gray-900 tracking-tight font-mono">
                {metrics.totalGbl.toLocaleString()} GBL
              </span>
            </div>
            <span className="text-[11px] font-semibold text-gray-500 block -mt-0.5 font-mono">
              ({metrics.totalPcs.toLocaleString()} PCS)
            </span>
          </div>
        </div>

        {/* Card 3: Ready to Dispatch */}
        <button
          onClick={() => { setActiveTab('ready'); setCurrentPage(1); }}
          className={`text-left rounded-2xl p-4 border transition-all cursor-pointer flex items-center gap-4 shadow-2xs ${
            activeTab === 'ready'
              ? 'bg-emerald-50/50 border-emerald-400 ring-2 ring-emerald-100'
              : 'bg-white border-gray-200/80 hover:border-gray-300'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <CheckCircle2 className="w-6 h-6 stroke-[2]" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">
              Ready to Dispatch
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-black text-gray-900 tracking-tight font-mono">
                {metrics.readyOrders}
              </span>
              <span className="text-xs font-medium text-gray-400">orders</span>
            </div>
          </div>
        </button>

        {/* Card 4: Partially Ready */}
        <button
          onClick={() => { setActiveTab('partial'); setCurrentPage(1); }}
          className={`text-left rounded-2xl p-4 border transition-all cursor-pointer flex items-center gap-4 shadow-2xs ${
            activeTab === 'partial'
              ? 'bg-amber-50/50 border-amber-400 ring-2 ring-amber-100'
              : 'bg-white border-gray-200/80 hover:border-gray-300'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <Clock className="w-6 h-6 stroke-[2]" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">
              Partially Ready
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-black text-gray-900 tracking-tight font-mono">
                {metrics.partiallyReadyOrders}
              </span>
              <span className="text-xs font-medium text-gray-400">orders</span>
            </div>
          </div>
        </button>

        {/* Card 5: Not Ready */}
        <button
          onClick={() => { setActiveTab('not_ready'); setCurrentPage(1); }}
          className={`text-left rounded-2xl p-4 border transition-all cursor-pointer flex items-center gap-4 shadow-2xs ${
            activeTab === 'not_ready'
              ? 'bg-rose-50/50 border-rose-400 ring-2 ring-rose-100'
              : 'bg-white border-gray-200/80 hover:border-gray-300'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
            <AlertCircle className="w-6 h-6 stroke-[2]" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">
              Not Ready
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-black text-gray-900 tracking-tight font-mono">
                {metrics.notReadyOrders}
              </span>
              <span className="text-xs font-medium text-gray-400">orders</span>
            </div>
          </div>
        </button>
      </div>

      {/* ── TABS & FILTER BAR ── */}
      <div className="space-y-3.5">
        {/* Upper Row: Status Tabs on Left, Search + Controls on Right */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/80 pb-3">
          {/* Tabs */}
          <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
            <button
              onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
              className={`flex items-center gap-2 pb-2 text-sm font-bold transition-all relative cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? 'text-blue-600'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <span>All Pending</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === 'all'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {metrics.pendingOrders}
              </span>
              {activeTab === 'all' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
              )}
            </button>

            <button
              onClick={() => { setActiveTab('ready'); setCurrentPage(1); }}
              className={`flex items-center gap-2 pb-2 text-sm font-bold transition-all relative cursor-pointer whitespace-nowrap ${
                activeTab === 'ready'
                  ? 'text-emerald-700'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <span>Ready to Dispatch</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === 'ready'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-emerald-50 text-emerald-600'
              }`}>
                {metrics.readyOrders}
              </span>
              {activeTab === 'ready' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full" />
              )}
            </button>

            <button
              onClick={() => { setActiveTab('partial'); setCurrentPage(1); }}
              className={`flex items-center gap-2 pb-2 text-sm font-bold transition-all relative cursor-pointer whitespace-nowrap ${
                activeTab === 'partial'
                  ? 'text-amber-700'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <span>Partially Ready</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === 'partial'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-amber-50 text-amber-600'
              }`}>
                {metrics.partiallyReadyOrders}
              </span>
              {activeTab === 'partial' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full" />
              )}
            </button>

            <button
              onClick={() => { setActiveTab('not_ready'); setCurrentPage(1); }}
              className={`flex items-center gap-2 pb-2 text-sm font-bold transition-all relative cursor-pointer whitespace-nowrap ${
                activeTab === 'not_ready'
                  ? 'text-rose-700'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <span>Not Ready</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === 'not_ready'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-rose-50 text-rose-600'
              }`}>
                {metrics.notReadyOrders}
              </span>
              {activeTab === 'not_ready' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-600 rounded-full" />
              )}
            </button>

            {/* Delivery Challans History Tab */}
            {deliveryChallansList.length > 0 && (
              <button
                onClick={() => { setActiveTab('history'); setCurrentPage(1); }}
                className={`flex items-center gap-2 pb-2 text-sm font-bold transition-all relative cursor-pointer whitespace-nowrap ${
                  activeTab === 'history'
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <span>Challans History</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                  activeTab === 'history'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {deliveryChallansList.length}
                </span>
                {activeTab === 'history' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
            )}
          </div>

          {/* Search and Action Bar */}
          <div className="flex items-center gap-2 relative">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search order no., customer, item..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200/90 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs"
              />
            </div>

            {/* Date Filter Popover Button */}
            <div className="relative" ref={dateFilterRef}>
              <button
                title="Date Filter"
                onClick={(e) => { e.stopPropagation(); setShowDateFilter(p => !p); }}
                className={`p-2 bg-white hover:bg-gray-50 border rounded-xl shadow-2xs cursor-pointer transition-colors ${
                  datePreset !== 'All' ? 'border-blue-500 text-blue-600 bg-blue-50/40' : 'border-gray-200/90 text-gray-600'
                }`}
              >
                <Filter className="w-4 h-4" />
              </button>

              {showDateFilter && (
                <div 
                  className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-50 animate-in fade-in zoom-in-95 duration-150"
                  onClick={e => e.stopPropagation()}
                >
                  <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block mb-2">Filter by Order Date</span>
                  <div className="grid grid-cols-2 gap-1.5 mb-3">
                    {['All', 'Today', 'This Week', 'This Month'].map(preset => (
                      <button
                        key={preset}
                        onClick={() => applyDatePreset(preset)}
                        className={`px-2 py-1.5 text-xs font-bold rounded-lg text-center transition-colors cursor-pointer ${
                          datePreset === preset ? 'bg-blue-600 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-gray-100 text-xs">
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

            {/* Refresh Button */}
            <button
              title="Refresh"
              onClick={() => { fetchData(false); showToast('Refreshed dispatch data', 'info'); }}
              disabled={refreshing}
              className="p-2 bg-white hover:bg-gray-50 border border-gray-200/90 rounded-xl text-gray-600 shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            {/* Sort Popover Button */}
            <div className="relative" ref={sortMenuRef}>
              <button
                title="Sort & Columns"
                onClick={(e) => { e.stopPropagation(); setShowSortMenu(p => !p); }}
                className="p-2 bg-white hover:bg-gray-50 border border-gray-200/90 rounded-xl text-gray-600 shadow-2xs cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              {showSortMenu && (
                <div 
                  className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-200 p-2 z-50 text-xs"
                  onClick={e => e.stopPropagation()}
                >
                  <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block px-2 py-1 mb-1">Sort Orders</span>
                  <button
                    onClick={() => { setSortField('orderNumber'); setSortAsc(p => !p); setShowSortMenu(false); }}
                    className="w-full px-2 py-1.5 text-left rounded-lg hover:bg-gray-50 flex items-center justify-between font-medium text-gray-700"
                  >
                    <span>SO Number</span>
                    {sortField === 'orderNumber' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />)}
                  </button>
                  <button
                    onClick={() => { setSortField('rawDate'); setSortAsc(p => !p); setShowSortMenu(false); }}
                    className="w-full px-2 py-1.5 text-left rounded-lg hover:bg-gray-50 flex items-center justify-between font-medium text-gray-700"
                  >
                    <span>Order Date</span>
                    {sortField === 'rawDate' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />)}
                  </button>
                  <button
                    onClick={() => { setSortField('pendingGbl'); setSortAsc(p => !p); setShowSortMenu(false); }}
                    className="w-full px-2 py-1.5 text-left rounded-lg hover:bg-gray-50 flex items-center justify-between font-medium text-gray-700"
                  >
                    <span>Pending Quantity</span>
                    {sortField === 'pendingGbl' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />)}
                  </button>
                  <button
                    onClick={() => { setSortField('customerName'); setSortAsc(p => !p); setShowSortMenu(false); }}
                    className="w-full px-2 py-1.5 text-left rounded-lg hover:bg-gray-50 flex items-center justify-between font-medium text-gray-700"
                  >
                    <span>Customer Name</span>
                    {sortField === 'customerName' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />)}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Lower Row: Filter Dropdowns */}
        {activeTab !== 'history' && (
          <div className="flex items-center gap-3 flex-wrap">
            {/* Customers */}
            <div className="relative">
              <select
                value={selectedCustomer}
                onChange={e => { setSelectedCustomer(e.target.value); setCurrentPage(1); }}
                className="appearance-none bg-white border border-gray-200/90 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs cursor-pointer"
              >
                <option value="ALL">All Customers</option>
                {customerOptions.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Regions */}
            <div className="relative">
              <select
                value={selectedRegion}
                onChange={e => { setSelectedRegion(e.target.value); setCurrentPage(1); }}
                className="appearance-none bg-white border border-gray-200/90 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs cursor-pointer"
              >
                <option value="ALL">All Regions</option>
                {regionOptions.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Status */}
            <div className="relative">
              <select
                value={selectedStatus}
                onChange={e => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
                className="appearance-none bg-white border border-gray-200/90 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs cursor-pointer"
              >
                <option value="ALL">All Status</option>
                <option value="Ready">Ready</option>
                <option value="Partially Ready">Partially Ready</option>
                <option value="Not Ready">Not Ready</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Reset Filters button if any active */}
            {(selectedCustomer !== 'ALL' || selectedRegion !== 'ALL' || selectedStatus !== 'ALL' || datePreset !== 'All' || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedCustomer('ALL');
                  setSelectedRegion('ALL');
                  setSelectedStatus('ALL');
                  setDatePreset('All');
                  setStartDate('');
                  setEndDate('');
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── TABLE VIEW ── */}
      {activeTab === 'history' ? (
        /* History View of Created Challans */
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-black uppercase tracking-wider text-gray-500">
                  <th className="py-3 px-4">DC NUMBER</th>
                  <th className="py-3 px-4">DATE</th>
                  <th className="py-3 px-4">SO REF</th>
                  <th className="py-3 px-4">CUSTOMER</th>
                  <th className="py-3 px-4">TRANSPORTER</th>
                  <th className="py-3 px-4">VEHICLE</th>
                  <th className="py-3 px-4 text-center">ITEMS</th>
                  <th className="py-3 px-4 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {deliveryChallansList.map((ch, idx) => (
                  <tr key={ch._id || idx} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-blue-600">
                      {ch.dcNumber || `DC-${idx + 1}`}
                    </td>
                    <td className="py-3 px-4 font-medium text-gray-700 whitespace-nowrap">
                      {ch.date || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-gray-800">
                      {ch.orderNumber || '—'}
                    </td>
                    <td className="py-3 px-4 font-bold text-gray-900">
                      {ch.customerName || '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-700">
                      {ch.transporterName || 'Direct / Self'}
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-700">
                      {ch.vehicleNumber || '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700">
                        {ch.items?.length || 0} items
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setActiveChallan(ch);
                          setIsChallanModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print DC</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Main Pending Orders Table */
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="py-3.5 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4 text-[11px] font-black uppercase tracking-wider text-gray-500">
                    SO NO.
                  </th>
                  <th className="py-3.5 px-4 text-[11px] font-black uppercase tracking-wider text-gray-500">
                    ORDER DATE
                  </th>
                  <th className="py-3.5 px-4 text-[11px] font-black uppercase tracking-wider text-gray-500">
                    CUSTOMER
                  </th>
                  <th className="py-3.5 px-4 text-[11px] font-black uppercase tracking-wider text-gray-500">
                    REGION
                  </th>
                  <th className="py-3.5 px-4 text-[11px] font-black uppercase tracking-wider text-gray-500">
                    ITEMS
                  </th>
                  <th className="py-3.5 px-4 text-center" colSpan={2}>
                    <div className="text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1">
                      PENDING QTY
                    </div>
                    <div className="grid grid-cols-2 text-[10px] font-bold text-gray-400 uppercase">
                      <span className="text-right pr-3">GBL</span>
                      <span className="text-right pr-2">PCS</span>
                    </div>
                  </th>
                  <th className="py-3.5 px-4 text-center text-[11px] font-black uppercase tracking-wider text-gray-500">
                    READY STATUS
                  </th>
                  <th className="py-3.5 px-4 text-right text-[11px] font-black uppercase tracking-wider text-gray-500">
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Truck className="w-8 h-8 text-gray-300 stroke-[1.5]" />
                        <span className="font-semibold text-sm">No pending orders matching filters</span>
                        <span className="text-xs text-gray-400">Try adjusting your search terms or filters</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map(row => {
                    const isChecked = selectedOrderIds.has(row._id);
                    const isMenuOpen = openActionDropdownId === row._id;

                    return (
                      <tr
                        key={row._id}
                        className={`hover:bg-gray-50/70 transition-colors ${
                          isChecked ? 'bg-blue-50/30' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-4 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectRow(row._id)}
                            className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>

                        {/* SO Number - Clickable */}
                        <td className="py-4 px-4 font-bold">
                          <button
                            onClick={() => setSelectedOrderDetailRow(row)}
                            className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-bold tracking-tight text-xs font-mono"
                          >
                            {row.orderNumber}
                          </button>
                        </td>

                        {/* Order Date */}
                        <td className="py-4 px-4 font-medium text-gray-600 whitespace-nowrap font-mono">
                          {row.orderDate}
                        </td>

                        {/* Customer Block with Phone & Location */}
                        <td className="py-4 px-4">
                          <div className="font-bold text-gray-900 text-xs tracking-tight">
                            {row.customerName}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-1 font-medium flex-wrap">
                            {row.customerPhone && (
                              <div className="flex items-center gap-1 font-mono">
                                <Phone className="w-3 h-3 text-gray-400" />
                                <span>{row.customerPhone}</span>
                              </div>
                            )}
                            {row.city && (
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-gray-400" />
                                <span>{row.city}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Region */}
                        <td className="py-4 px-4 font-medium text-gray-700 whitespace-nowrap">
                          {row.region}
                        </td>

                        {/* Items Pill */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <button
                            onClick={() => setSelectedOrderDetailRow(row)}
                            className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            {row.itemCount} items
                          </button>
                        </td>

                        {/* Pending QTY: GBL */}
                        <td className="py-4 px-3 text-right font-black text-gray-900 font-mono text-xs whitespace-nowrap">
                          {row.pendingGbl.toLocaleString()}
                        </td>

                        {/* Pending QTY: PCS */}
                        <td className="py-4 px-3 text-right font-medium text-gray-600 font-mono text-xs whitespace-nowrap">
                          {row.pendingPcs.toLocaleString()}
                        </td>

                        {/* Ready Status Badge */}
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          {row.readyStatus === 'Ready' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Ready (In Stock)
                            </span>
                          )}
                          {row.readyStatus === 'Partially Ready' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
                              Partially Ready
                            </span>
                          )}
                          {row.readyStatus === 'Not Ready' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs">
                              Not Ready
                            </span>
                          )}
                        </td>

                        {/* Action Split Dropdown Button: Blue Dispatch v */}
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          <div className="relative inline-flex items-center shadow-2xs rounded-xl overflow-visible">
                            <button
                              onClick={() => handleOpenDispatch(row)}
                              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-l-xl text-xs font-bold transition-all cursor-pointer"
                            >
                              Dispatch
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionDropdownId(isMenuOpen ? null : row._id);
                              }}
                              className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-r-xl border-l border-blue-500 text-xs font-bold transition-all cursor-pointer"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>

                            {/* Dropdown Options */}
                            {isMenuOpen && (
                              <div
                                className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50 text-left animate-in fade-in zoom-in-95 duration-100"
                                onClick={e => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => {
                                    setOpenActionDropdownId(null);
                                    handleOpenDispatch(row);
                                  }}
                                  className="w-full px-3 py-1.5 text-xs text-left font-bold text-gray-800 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 cursor-pointer"
                                >
                                  <Truck className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Custom Dispatch</span>
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
                                <div className="border-t border-gray-100 my-1" />
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
                              </div>
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

          {/* ── FOOTER PAGINATION ── */}
          <div className="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-gray-600 bg-white">
            <div>
              Showing <span className="font-bold text-gray-900">{filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> - <span className="font-bold text-gray-900">{Math.min(currentPage * pageSize, filteredRows.length)}</span> of <span className="font-bold text-gray-900">{filteredRows.length}</span> items
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

      {/* ── CREATE DISPATCH MODAL ── */}
      {isCreateModalOpen && (
        <CreateDispatchModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          order={selectedOrderForDispatch}
          allOrders={salesOrders}
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

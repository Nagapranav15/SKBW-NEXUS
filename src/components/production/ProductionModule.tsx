import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  getProductionOrders, 
  deleteProductionOrder as deleteProductionOrderApi,
  recordProductionEntry as recordProductionEntryApi,
  completeProductionOrder as completeProductionOrderApi
} from '../../api/productionApi';
import { getSkusV2, SkuV2 } from '../../api/mfgApiV2';
import { clearLocalProductionOrders } from '../../utils/productionStorage';
import { ProductionOrder, ProductionEntry } from '../../types/production';
import { ProductionOrdersList } from './ProductionOrdersList';
import { NewProductionOrderWizard } from './NewProductionOrderWizard';
import { ProductionOrderDetailView } from './ProductionOrderDetailView';
import { ProductionOrderEntriesView } from './ProductionOrderEntriesView';
import { ProductionPrintModal } from './ProductionPrintModal';
import { BulkEditBomModal } from './BulkEditBomModal';
import { showToast } from '../ui/Toast';
import { 
  Calendar, Package, FileText, LayoutGrid, History, 
  ArrowLeft, Search, Plus, CheckCircle, AlertTriangle, Layers, Loader2, X, Edit3, ExternalLink,
  ChevronDown, ChevronRight, Calculator, Eye, Filter, Check, Clock, TrendingUp, Info
} from 'lucide-react';

export const ProductionModule: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Orders State (Loaded from backend only)
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [backendSkus, setBackendSkus] = useState<SkuV2[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Active top tab: 'orders' | 'entries' | 'materials' | 'bom' | 'history'
  const [activeTab, setActiveTabState] = useState<string>(() => {
    return searchParams.get('tab') || 'orders';
  });

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'orders') next.delete('tab');
      else next.set('tab', tab);
      next.delete('view');
      next.delete('orderId');
      return next;
    }, { replace: true });
    setCurrentView('list');
    setSelectedOrder(null);
  };

  // View state: 'list' | 'new' | 'detail' | 'entries'
  const [currentView, setCurrentView] = useState<'list' | 'new' | 'detail' | 'entries'>(() => {
    const v = searchParams.get('view');
    if (v === 'new') return 'new';
    if (v === 'detail') return 'detail';
    if (v === 'entries') return 'entries';
    return 'list';
  });

  // Selected Order for Detail or Record Entries
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null);

  // Printing Modal Order
  const [printOrder, setPrintOrder] = useState<ProductionOrder | null>(null);

  // Tab 2: Production Entries state
  const [entriesSearch, setEntriesSearch] = useState('');
  const [entriesDeptFilter, setEntriesDeptFilter] = useState('ALL');
  const [entriesShiftFilter, setEntriesShiftFilter] = useState('ALL');
  const [selectedVoucherEntry, setSelectedVoucherEntry] = useState<any | null>(null);

  // Tab 3: Material Requirements state
  const [materialsSearch, setMaterialsSearch] = useState('');
  const [materialsStatusFilter, setMaterialsStatusFilter] = useState<'ALL' | 'SHORTAGE' | 'ADEQUATE'>('ALL');
  const [materialsTypeFilter, setMaterialsTypeFilter] = useState('ALL');
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);

  // Tab 4: BOM Master state
  const [bomSearch, setBomSearch] = useState('');
  const [simulatedBatchSizes, setSimulatedBatchSizes] = useState<Record<string, number>>({});
  const [editingBomSkuId, setEditingBomSkuId] = useState<string | null>(null);
  const [showBomModal, setShowBomModal] = useState(false);

  // Tab 5: History state
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('ALL');
  const [historyDeptFilter, setHistoryDeptFilter] = useState('ALL');

  // Clean old localStorage mock orders once
  useEffect(() => {
    if (selectedCompany?._id) {
      clearLocalProductionOrders(selectedCompany._id);
    }
  }, [selectedCompany?._id]);

  // Load orders directly from backend API
  const loadOrders = async () => {
    if (!selectedCompany?._id) return;
    try {
      setLoading(true);
      const [listRes, skusRes] = await Promise.allSettled([
        getProductionOrders({ companyId: selectedCompany._id }),
        getSkusV2(selectedCompany._id)
      ]);

      let loadedOrders: ProductionOrder[] = [];
      if (listRes.status === 'fulfilled' && Array.isArray(listRes.value)) {
        loadedOrders = listRes.value;
        setOrders(loadedOrders);
      } else {
        setOrders([]);
      }

      if (skusRes.status === 'fulfilled' && Array.isArray(skusRes.value)) {
        setBackendSkus(skusRes.value);
      }

      // Sync selected order if open
      const orderIdParam = searchParams.get('orderId');
      if (orderIdParam) {
        const match = loadedOrders.find(o => o._id === orderIdParam || o.orderNumber === orderIdParam);
        if (match) setSelectedOrder(match);
      }
    } catch (err) {
      console.error('Failed to load production orders from backend:', err);
      showToast('Failed to load production orders from backend', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [selectedCompany?._id]);

  // Handle URL change
  useEffect(() => {
    const viewParam = searchParams.get('view');
    const orderIdParam = searchParams.get('orderId');
    const tabParam = searchParams.get('tab');

    if (tabParam && tabParam !== activeTab) {
      setActiveTabState(tabParam);
    }

    if (viewParam === 'new') {
      setCurrentView('new');
    } else if (viewParam === 'detail' && orderIdParam) {
      const match = orders.find(o => o._id === orderIdParam || o.orderNumber === orderIdParam);
      if (match) {
        setSelectedOrder(match);
        setCurrentView('detail');
      }
    } else if (viewParam === 'entries' && orderIdParam) {
      const match = orders.find(o => o._id === orderIdParam || o.orderNumber === orderIdParam);
      if (match) {
        setSelectedOrder(match);
        setCurrentView('entries');
      }
    } else {
      if (!tabParam || tabParam === 'orders') {
        setCurrentView('list');
      }
    }
  }, [searchParams, orders]);

  // Navigate to New Order Wizard
  const handleOpenNewOrder = () => {
    setCurrentView('new');
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('view', 'new');
      return next;
    });
  };

  // Order created callback
  const handleOrderCreated = (newOrder: ProductionOrder) => {
    loadOrders();
    handleOpenOrderDetail(newOrder);
  };

  // Navigate to Order Details (Screen 4)
  const handleOpenOrderDetail = (order: ProductionOrder) => {
    setSelectedOrder(order);
    setCurrentView('detail');
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('view', 'detail');
      next.set('orderId', order._id);
      return next;
    });
  };

  // Navigate to Record Entries (Screen 5)
  const handleOpenRecordEntries = (order: ProductionOrder) => {
    setSelectedOrder(order);
    setCurrentView('entries');
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('view', 'entries');
      next.set('orderId', order._id);
      return next;
    });
  };

  // Back to Orders List
  const handleBackToList = () => {
    setCurrentView('list');
    setSelectedOrder(null);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('view');
      next.delete('orderId');
      return next;
    });
  };

  // Add Production Entry via Backend API
  const handleAddEntry = async (orderId: string, entryData: any) => {
    try {
      const updated = await recordProductionEntryApi(orderId, entryData);
      showToast('Production entry saved to backend successfully!', 'success');
      loadOrders();
      setSelectedOrder(updated);
    } catch (err: any) {
      console.error('Failed to record production entry:', err);
      showToast(err.response?.data?.msg || err.message || 'Failed to record production entry', 'error');
    }
  };

  // Complete Production Order via Backend API
  const handleCompleteOrder = async (orderId: string) => {
    try {
      const updated = await completeProductionOrderApi(orderId, 'Operator');
      showToast(`Production Order ${updated.orderNumber} completed and updated in backend!`, 'success');
      loadOrders();
      setSelectedOrder(updated);
      handleOpenOrderDetail(updated);
    } catch (err: any) {
      console.error('Failed to complete production order:', err);
      showToast(err.response?.data?.msg || err.message || 'Failed to complete production order', 'error');
    }
  };

  // Delete Order via Backend API
  const handleDeleteOrder = async (orderId: string) => {
    try {
      await deleteProductionOrderApi(orderId);
      showToast('Production order deleted from backend', 'info');
      loadOrders();
      if (selectedOrder?._id === orderId) {
        handleBackToList();
      }
    } catch (err: any) {
      console.error('Failed to delete production order:', err);
      showToast(err.response?.data?.msg || err.message || 'Failed to delete order', 'error');
    }
  };

  // -------------------------------------------------------------
  // COMPUTED DATA FOR DYNAMIC TALLY MODULES
  // -------------------------------------------------------------

  // Tab 2: Production Entries (Manufacturing Journal Register)
  const allEntries = useMemo(() => {
    return orders.flatMap(o => 
      (o.productionEntries || []).map(e => ({
        ...e,
        orderNumber: o.orderNumber,
        itemName: o.itemName,
        itemType: o.itemType,
        department: o.department,
        orderId: o._id,
        parentOrder: o
      }))
    ).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [orders]);

  const distinctEntriesDepartments = useMemo(() => {
    return Array.from(new Set(allEntries.map(e => e.department).filter(Boolean)));
  }, [allEntries]);

  const distinctEntriesShifts = useMemo(() => {
    return Array.from(new Set(allEntries.map(e => e.shift).filter(Boolean)));
  }, [allEntries]);

  const filteredEntries = useMemo(() => {
    return allEntries.filter(e => {
      if (entriesDeptFilter !== 'ALL' && e.department !== entriesDeptFilter) return false;
      if (entriesShiftFilter !== 'ALL' && e.shift !== entriesShiftFilter) return false;
      if (!entriesSearch.trim()) return true;
      const q = entriesSearch.toLowerCase();
      return (
        e.orderNumber.toLowerCase().includes(q) ||
        e.itemName.toLowerCase().includes(q) ||
        (e.shift && e.shift.toLowerCase().includes(q)) ||
        (e.department && e.department.toLowerCase().includes(q)) ||
        (e.createdBy && e.createdBy.toLowerCase().includes(q)) ||
        (e.remarks && e.remarks.toLowerCase().includes(q)) ||
        (e.date && e.date.toLowerCase().includes(q))
      );
    });
  }, [allEntries, entriesSearch, entriesDeptFilter, entriesShiftFilter]);

  const entriesTotalQty = useMemo(() => {
    return filteredEntries.reduce((acc, e) => acc + (Number(e.producedQty) || 0), 0);
  }, [filteredEntries]);

  const entriesTotalPcs = useMemo(() => {
    return filteredEntries.reduce((acc, e) => acc + (Number(e.producedPcs) || 0), 0);
  }, [filteredEntries]);

  // Tab 3: Material Requirements (Stock Allocation & Shortfall Analysis)
  const materialsList = useMemo(() => {
    const materialsMap = new Map<string, {
      component: string;
      type: string;
      uom: string;
      totalRequired: number;
      availableStock: number;
      ordersCount: number;
      allocations: {
        orderId: string;
        orderNumber: string;
        itemName: string;
        requiredQty: number;
        uom: string;
        orderStatus: string;
        plannedQty: number;
      }[];
    }>();

    orders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled').forEach(o => {
      (o.bomItems || []).forEach(b => {
        const key = b.component;
        if (!materialsMap.has(key)) {
          materialsMap.set(key, {
            component: b.component,
            type: b.type || 'Raw Material',
            uom: b.uom || 'PCS',
            totalRequired: 0,
            availableStock: Number(b.availableStock) || 0,
            ordersCount: 0,
            allocations: []
          });
        }
        const curr = materialsMap.get(key)!;
        curr.totalRequired += (Number(b.totalRequired) || 0);
        curr.ordersCount += 1;
        curr.allocations.push({
          orderId: o._id,
          orderNumber: o.orderNumber,
          itemName: o.itemName,
          requiredQty: Number(b.totalRequired) || 0,
          uom: b.uom || 'PCS',
          orderStatus: o.status,
          plannedQty: o.plannedQty
        });
      });
    });

    return Array.from(materialsMap.values());
  }, [orders]);

  const distinctMaterialTypes = useMemo(() => {
    return Array.from(new Set(materialsList.map(m => m.type).filter(Boolean)));
  }, [materialsList]);

  const filteredMaterials = useMemo(() => {
    return materialsList.filter(m => {
      const balance = m.availableStock - m.totalRequired;
      if (materialsStatusFilter === 'SHORTAGE' && balance >= 0) return false;
      if (materialsStatusFilter === 'ADEQUATE' && balance < 0) return false;
      if (materialsTypeFilter !== 'ALL' && m.type !== materialsTypeFilter) return false;
      if (!materialsSearch.trim()) return true;
      const q = materialsSearch.toLowerCase();
      return (
        m.component.toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q) ||
        m.uom.toLowerCase().includes(q)
      );
    });
  }, [materialsList, materialsSearch, materialsStatusFilter, materialsTypeFilter]);

  const totalShortagesCount = useMemo(() => {
    return materialsList.filter(m => (m.availableStock - m.totalRequired) < 0).length;
  }, [materialsList]);

  const totalAdequateCount = useMemo(() => {
    return materialsList.filter(m => (m.availableStock - m.totalRequired) >= 0).length;
  }, [materialsList]);

  const totalDeficitUnits = useMemo(() => {
    return materialsList
      .filter(m => (m.availableStock - m.totalRequired) < 0)
      .reduce((sum, m) => sum + Math.abs(m.availableStock - m.totalRequired), 0);
  }, [materialsList]);

  // Tab 4: BOM Master
  const skusWithBom = useMemo(() => {
    return backendSkus.filter(s => Array.isArray(s.bomItems) && s.bomItems.length > 0);
  }, [backendSkus]);

  const filteredSkusWithBom = useMemo(() => {
    if (!bomSearch.trim()) return skusWithBom;
    const q = bomSearch.toLowerCase();
    return skusWithBom.filter(s => 
      s.name.toLowerCase().includes(q) ||
      s.skuCode.toLowerCase().includes(q) ||
      (s.category && s.category.toLowerCase().includes(q))
    );
  }, [skusWithBom, bomSearch]);

  // Tab 5: History Audit Log
  const distinctHistoryDepts = useMemo(() => {
    return Array.from(new Set(orders.map(o => o.department).filter(Boolean)));
  }, [orders]);

  const filteredHistoryOrders = useMemo(() => {
    return orders.filter(o => {
      if (historyStatusFilter !== 'ALL' && o.status !== historyStatusFilter) return false;
      if (historyDeptFilter !== 'ALL' && o.department !== historyDeptFilter) return false;
      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase();
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.itemName.toLowerCase().includes(q) ||
        (o.department && o.department.toLowerCase().includes(q)) ||
        (o.status && o.status.toLowerCase().includes(q))
      );
    });
  }, [orders, historySearch, historyStatusFilter, historyDeptFilter]);

  const historyCompletedCount = useMemo(() => {
    return orders.filter(o => o.status === 'Completed').length;
  }, [orders]);

  const historyInProgressCount = useMemo(() => {
    return orders.filter(o => o.status === 'In Progress').length;
  }, [orders]);

  // Clean Tab Header Bar Definition (Shortcuts removed as requested)
  const TAB_ITEMS = [
    { id: 'orders', label: 'Production Orders', icon: Calendar },
    { id: 'entries', label: 'Production Entries', icon: Package },
    { id: 'materials', label: 'Material Requirements', icon: FileText },
    { id: 'bom', label: 'BOM', icon: LayoutGrid },
    { id: 'history', label: 'History', icon: History }
  ];

  const renderTabNavigation = () => (
    <div className="bg-white border-b border-gray-200 px-6 shrink-0 flex items-center space-x-2 py-2 overflow-x-auto custom-scrollbar">
      {TAB_ITEMS.map(tab => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              active 
                ? 'bg-blue-50/90 text-blue-600 border border-blue-100 shadow-2xs font-bold'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/70 border border-transparent'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );

  // Render Sub-Views
  if (currentView === 'new') {
    return (
      <NewProductionOrderWizard
        onCancel={handleBackToList}
        onCreated={handleOrderCreated}
        companyId={selectedCompany?._id}
      />
    );
  }

  if (currentView === 'detail' && selectedOrder) {
    return (
      <>
        <ProductionOrderDetailView
          order={selectedOrder}
          onBack={handleBackToList}
          onNewOrder={handleOpenNewOrder}
          onRecordEntries={handleOpenRecordEntries}
          onPrint={setPrintOrder}
          onCompleteOrder={() => handleCompleteOrder(selectedOrder._id)}
        />
        <ProductionPrintModal order={printOrder} onClose={() => setPrintOrder(null)} />
      </>
    );
  }

  if (currentView === 'entries' && selectedOrder) {
    return (
      <>
        <ProductionOrderEntriesView
          order={selectedOrder}
          onBack={handleBackToList}
          onViewOverview={handleOpenOrderDetail}
          onAddEntry={handleAddEntry}
          onCompleteOrder={handleCompleteOrder}
          onPrint={setPrintOrder}
        />
        <ProductionPrintModal order={printOrder} onClose={() => setPrintOrder(null)} />
      </>
    );
  }

  // -------------------------------------------------------------
  // TAB 2: PRODUCTION ENTRIES (Tally Manufacturing Journal)
  // -------------------------------------------------------------
  if (activeTab === 'entries') {
    return (
      <div className="flex flex-col h-full bg-slate-50/60 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="bg-white border-b border-gray-150 px-6 py-4 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
              <Package className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Production Entries</h1>
              <p className="text-xs text-gray-500 font-medium">Consolidated logs of all shift production runs across backend orders.</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleOpenNewOrder}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Order</span>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              ← Back to Orders
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        {renderTabNavigation()}

        {/* Main Content Area - Full boxed width matching Production Orders */}
        <div className="p-6 flex-1 flex flex-col min-w-0 space-y-4">
          {/* Tally Dynamic KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Output Entries</p>
                <h3 className="text-xl font-bold text-gray-900">{filteredEntries.length}</h3>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Output Qty</p>
                <h3 className="text-xl font-bold text-gray-900">{entriesTotalQty.toLocaleString()}</h3>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Output PCS</p>
                <h3 className="text-xl font-bold text-gray-900">{entriesTotalPcs.toLocaleString()} PCS</h3>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Active Departments</p>
                <h3 className="text-xl font-bold text-gray-900">{distinctEntriesDepartments.length || 1}</h3>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
            {/* Filter and Search Bar */}
            <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-gray-700 flex items-center space-x-1 mr-1">
                  <Filter className="w-3.5 h-3.5 text-gray-400" />
                  <span>Filters:</span>
                </span>

                {/* Department Filter */}
                <select
                  value={entriesDeptFilter}
                  onChange={e => setEntriesDeptFilter(e.target.value)}
                  className="text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="ALL">All Departments</option>
                  {distinctEntriesDepartments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>

                {/* Shift Filter */}
                <select
                  value={entriesShiftFilter}
                  onChange={e => setEntriesShiftFilter(e.target.value)}
                  className="text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="ALL">All Shifts</option>
                  {distinctEntriesShifts.map(shift => (
                    <option key={shift} value={shift}>{shift}</option>
                  ))}
                </select>

                {(entriesDeptFilter !== 'ALL' || entriesShiftFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setEntriesDeptFilter('ALL');
                      setEntriesShiftFilter('ALL');
                    }}
                    className="text-xs font-medium text-blue-600 hover:underline px-1 cursor-pointer"
                  >
                    Reset filters
                  </button>
                )}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={entriesSearch}
                  onChange={e => setEntriesSearch(e.target.value)}
                  placeholder="Search entries by order, product, remark..."
                  className="w-full md:w-64 pl-8 pr-8 py-1.5 text-xs text-gray-900 placeholder-gray-400 bg-gray-50/70 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
                />
                {entriesSearch && (
                  <button 
                    onClick={() => setEntriesSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Entries Table */}
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-3">Order No</th>
                    <th className="py-3 px-3">Item / Product</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Shift</th>
                    <th className="py-3 px-3 font-bold">Produced Qty</th>
                    <th className="py-3 px-3">Produced PCS</th>
                    <th className="py-3 px-3">Cumulative</th>
                    <th className="py-3 px-3">Remarks</th>
                    <th className="py-3 px-3">Operator</th>
                    <th className="py-3 px-3 text-center">Journal Voucher</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-10 text-center text-gray-400">
                        {entriesSearch ? 'No production entries matching your search.' : 'No production entries recorded in backend yet.'}
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((e, idx) => (
                      <tr key={e.id || idx} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-3 text-center font-semibold text-gray-400">{idx + 1}</td>
                        <td className="py-3 px-3 font-bold font-mono text-blue-600">
                          <button onClick={() => handleOpenRecordEntries(e.parentOrder)} className="hover:underline cursor-pointer">
                            {e.orderNumber}
                          </button>
                        </td>
                        <td className="py-3 px-3 font-bold text-gray-900">{e.itemName}</td>
                        <td className="py-3 px-3 text-gray-600">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                            {e.department || 'General'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-gray-700 whitespace-nowrap">{e.date}</td>
                        <td className="py-3 px-3 text-gray-700">{e.shift}</td>
                        <td className="py-3 px-3 font-bold text-gray-900 whitespace-nowrap">{e.producedQty} {e.producedUom}</td>
                        <td className="py-3 px-3 font-semibold text-gray-700 whitespace-nowrap">{e.producedPcs.toLocaleString()} PCS</td>
                        <td className="py-3 px-3 font-bold text-gray-900 whitespace-nowrap">{e.cumulativeQty} {e.producedUom}</td>
                        <td className="py-3 px-3 text-gray-600 max-w-xs truncate">{e.remarks || '-'}</td>
                        <td className="py-3 px-3 font-semibold text-gray-700">{e.createdBy}</td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => setSelectedVoucherEntry(e)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View Voucher</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer Summary */}
            <div className="bg-gray-50/80 px-4 py-3 border-t border-gray-200 text-xs text-gray-600 flex items-center justify-between">
              <div>
                Showing <strong className="text-gray-900">{filteredEntries.length}</strong> recorded manufacturing entries
              </div>
              <div className="flex items-center space-x-4">
                <span>Total Output: <strong className="text-gray-900">{entriesTotalQty.toLocaleString()} units</strong></span>
                <span>•</span>
                <span>Total PCS: <strong className="text-gray-900">{entriesTotalPcs.toLocaleString()} PCS</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Manufacturing Journal Voucher Modal (Tally Voucher View) */}
        {selectedVoucherEntry && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
              {/* Voucher Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-slate-900 text-white shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
                    MJ
                  </div>
                  <div>
                    <h3 className="font-bold text-sm tracking-wide">Manufacturing Journal Voucher</h3>
                    <p className="text-[11px] text-slate-400">Order: {selectedVoucherEntry.orderNumber} • Shift: {selectedVoucherEntry.shift}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedVoucherEntry(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Voucher Body */}
              <div className="p-6 overflow-y-auto custom-scrollbar space-y-5 text-xs">
                {/* Meta details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3.5 rounded-lg border border-gray-200">
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase font-bold block">Production Date</span>
                    <span className="font-semibold text-gray-900">{selectedVoucherEntry.date}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase font-bold block">Shift</span>
                    <span className="font-semibold text-gray-900">{selectedVoucherEntry.shift}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase font-bold block">Department</span>
                    <span className="font-semibold text-gray-900">{selectedVoucherEntry.department || 'Production'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase font-bold block">Recorded By</span>
                    <span className="font-semibold text-gray-900">{selectedVoucherEntry.createdBy}</span>
                  </div>
                </div>

                {/* Destination: Finished Product Produced */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-gray-200 pb-1">
                    <h4 className="font-bold text-gray-900 uppercase text-[11px] tracking-wider flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Destination (Output / Finished Goods Produced)</span>
                    </h4>
                  </div>
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-3.5 flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-gray-900 text-sm">{selectedVoucherEntry.itemName}</h5>
                      <p className="text-[11px] text-gray-500">Cumulative produced to date: {selectedVoucherEntry.cumulativeQty} {selectedVoucherEntry.producedUom}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold text-emerald-700">
                        +{selectedVoucherEntry.producedQty} {selectedVoucherEntry.producedUom}
                      </div>
                      <div className="text-[11px] font-semibold text-gray-600">
                        {selectedVoucherEntry.producedPcs.toLocaleString()} PCS
                      </div>
                    </div>
                  </div>
                </div>

                {/* Source: Raw Materials Consumed Dynamically Calculated from BOM */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-gray-200 pb-1">
                    <h4 className="font-bold text-gray-900 uppercase text-[11px] tracking-wider flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>Source (Components & Raw Materials Consumed)</span>
                    </h4>
                    <span className="text-[10px] text-gray-500">Calculated from BOM formulation</span>
                  </div>

                  {(!selectedVoucherEntry.parentOrder.bomItems || selectedVoucherEntry.parentOrder.bomItems.length === 0) ? (
                    <div className="p-4 text-center text-gray-400 bg-gray-50 rounded-lg border border-gray-200">
                      No BOM formulation registered for this product.
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase">
                          <tr>
                            <th className="py-2 px-3">Component / Material</th>
                            <th className="py-2 px-3">Type</th>
                            <th className="py-2 px-3 text-right">Consumed in this Run</th>
                            <th className="py-2 px-3">UOM</th>
                            <th className="py-2 px-3 text-right">Current Stock</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedVoucherEntry.parentOrder.bomItems.map((b: any, bIdx: number) => {
                            const plannedTotal = Number(selectedVoucherEntry.parentOrder.plannedQty) || 1;
                            const runProduced = Number(selectedVoucherEntry.producedQty) || 0;
                            const totalRequired = Number(b.totalRequired) || 0;
                            const estimatedConsumption = plannedTotal > 0 ? (totalRequired / plannedTotal) * runProduced : 0;

                            return (
                              <tr key={bIdx} className="hover:bg-gray-50/50">
                                <td className="py-2.5 px-3 font-semibold text-gray-900">{b.component}</td>
                                <td className="py-2.5 px-3">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">
                                    {b.type || 'Raw Material'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-bold text-amber-700 text-right">
                                  {estimatedConsumption ? estimatedConsumption.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
                                </td>
                                <td className="py-2.5 px-3 text-gray-600">{b.uom}</td>
                                <td className="py-2.5 px-3 text-right font-semibold text-gray-700">
                                  {Number(b.availableStock || 0).toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Remarks & QC Notes */}
                {selectedVoucherEntry.remarks && (
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Remarks & QC Observations</span>
                    <p className="text-gray-700">{selectedVoucherEntry.remarks}</p>
                  </div>
                )}
              </div>

              {/* Voucher Footer */}
              <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
                <button
                  onClick={() => {
                    const parent = selectedVoucherEntry.parentOrder;
                    setSelectedVoucherEntry(null);
                    handleOpenRecordEntries(parent);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full Order Entries View</span>
                </button>
                <button
                  onClick={() => setSelectedVoucherEntry(null)}
                  className="px-4 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Close Voucher
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // TAB 3: MATERIAL REQUIREMENTS (Tally Stock Allocation & MRP)
  // -------------------------------------------------------------
  if (activeTab === 'materials') {
    return (
      <div className="flex flex-col h-full bg-slate-50/60 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="bg-white border-b border-gray-150 px-6 py-4 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
              <FileText className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Material Requirements</h1>
              <p className="text-xs text-gray-500 font-medium">Aggregated raw materials checklist across all active & planned production batches.</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleOpenNewOrder}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Order</span>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              ← Back to Orders
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        {renderTabNavigation()}

        {/* Main Content Area - Full boxed width matching Production Orders */}
        <div className="p-6 flex-1 flex flex-col min-w-0 space-y-4">
          {/* Tally Dynamic KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Raw Materials</p>
                <h3 className="text-xl font-bold text-gray-900">{materialsList.length} Items</h3>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/20 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">Critical Shortages</p>
                <h3 className="text-xl font-bold text-rose-700">{totalShortagesCount} Items</h3>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Adequate In Stock</p>
                <h3 className="text-xl font-bold text-emerald-700">{totalAdequateCount} Items</h3>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Units in Deficit</p>
                <h3 className="text-xl font-bold text-amber-700">{totalDeficitUnits.toLocaleString()}</h3>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
            {/* Filter and Search Bar */}
            <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* Status Filter Tabs */}
                <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                  <button
                    onClick={() => setMaterialsStatusFilter('ALL')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      materialsStatusFilter === 'ALL'
                        ? 'bg-white text-gray-900 shadow-2xs'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    All ({materialsList.length})
                  </button>
                  <button
                    onClick={() => setMaterialsStatusFilter('SHORTAGE')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      materialsStatusFilter === 'SHORTAGE'
                        ? 'bg-rose-50 text-rose-700 shadow-2xs font-bold'
                        : 'text-rose-600 hover:text-rose-800'
                    }`}
                  >
                    Shortages ({totalShortagesCount})
                  </button>
                  <button
                    onClick={() => setMaterialsStatusFilter('ADEQUATE')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      materialsStatusFilter === 'ADEQUATE'
                        ? 'bg-emerald-50 text-emerald-700 shadow-2xs font-bold'
                        : 'text-emerald-600 hover:text-emerald-800'
                    }`}
                  >
                    Ready ({totalAdequateCount})
                  </button>
                </div>

                {/* Type Filter */}
                <select
                  value={materialsTypeFilter}
                  onChange={e => setMaterialsTypeFilter(e.target.value)}
                  className="text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="ALL">All Material Types</option>
                  {distinctMaterialTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={materialsSearch}
                  onChange={e => setMaterialsSearch(e.target.value)}
                  placeholder="Search raw material or component..."
                  className="w-full md:w-64 pl-8 pr-8 py-1.5 text-xs text-gray-900 placeholder-gray-400 bg-gray-50/70 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
                />
                {materialsSearch && (
                  <button 
                    onClick={() => setMaterialsSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Materials Shortfall Table with Drilldown */}
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-3 w-8 text-center">#</th>
                    <th className="py-3 px-3">Raw Material / Component</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3 text-center">Allocated In Orders</th>
                    <th className="py-3 px-3 font-bold text-right">Total Required</th>
                    <th className="py-3 px-3 font-semibold text-right">Available In Stock</th>
                    <th className="py-3 px-3">UOM</th>
                    <th className="py-3 px-3">Net Balance / Status</th>
                    <th className="py-3 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-gray-400">
                        {materialsSearch ? 'No materials matching your search.' : 'No active production material requirements found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map((m, idx) => {
                      const balance = m.availableStock - m.totalRequired;
                      const isShortage = balance < 0;
                      const isExpanded = expandedMaterial === m.component;

                      return (
                        <React.Fragment key={m.component}>
                          <tr className={`hover:bg-gray-50/60 transition-colors ${isExpanded ? 'bg-blue-50/20' : ''}`}>
                            <td className="py-3 px-3 text-center text-gray-400 font-semibold">{idx + 1}</td>
                            <td className="py-3 px-3 font-bold text-gray-900 flex items-center space-x-2">
                              <span>{m.component}</span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                                {m.type}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-700">
                                {m.ordersCount} {m.ordersCount === 1 ? 'Order' : 'Orders'}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-bold text-gray-900 text-right">{m.totalRequired.toLocaleString()}</td>
                            <td className="py-3 px-3 font-semibold text-gray-700 text-right">{m.availableStock.toLocaleString()}</td>
                            <td className="py-3 px-3 text-gray-600 font-medium">{m.uom}</td>
                            <td className="py-3 px-3">
                              {isShortage ? (
                                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Shortage ({Math.abs(balance).toLocaleString()} {m.uom})</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Check className="w-3 h-3" />
                                  <span>Ready (+{balance.toLocaleString()} {m.uom})</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <button
                                onClick={() => setExpandedMaterial(isExpanded ? null : m.component)}
                                className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                              >
                                <span>{isExpanded ? 'Hide Orders' : 'View Orders'}</span>
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                            </td>
                          </tr>

                          {/* Dynamic Tally Allocation Drilldown: which orders require this item */}
                          {isExpanded && (
                            <tr className="bg-slate-50/70 border-b border-gray-200">
                              <td colSpan={9} className="p-3 pl-12">
                                <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-2xs space-y-2">
                                  <div className="flex items-center justify-between border-b border-gray-150 pb-2">
                                    <span className="font-bold text-gray-800 text-[11px] uppercase tracking-wider">
                                      Active Production Orders Allocating "{m.component}" ({m.allocations.length})
                                    </span>
                                    <span className="text-[11px] text-gray-500">
                                      Required: <strong>{m.totalRequired.toLocaleString()} {m.uom}</strong> • Current Stock: <strong>{m.availableStock.toLocaleString()} {m.uom}</strong>
                                    </span>
                                  </div>

                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                      <thead>
                                        <tr className="text-[10px] font-bold text-gray-500 uppercase border-b border-gray-100">
                                          <th className="py-1.5 px-2">Order No</th>
                                          <th className="py-1.5 px-2">Product Being Produced</th>
                                          <th className="py-1.5 px-2">Planned Batch Qty</th>
                                          <th className="py-1.5 px-2 font-bold text-right">Material Required</th>
                                          <th className="py-1.5 px-2">Order Status</th>
                                          <th className="py-1.5 px-2 text-center">Action</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {m.allocations.map((alloc, aIdx) => (
                                          <tr key={aIdx} className="hover:bg-gray-50">
                                            <td className="py-2 px-2 font-mono font-bold text-blue-600">{alloc.orderNumber}</td>
                                            <td className="py-2 px-2 font-semibold text-gray-900">{alloc.itemName}</td>
                                            <td className="py-2 px-2 text-gray-600">{alloc.plannedQty.toLocaleString()} units</td>
                                            <td className="py-2 px-2 font-bold text-gray-900 text-right">{alloc.requiredQty.toLocaleString()} {alloc.uom}</td>
                                            <td className="py-2 px-2">
                                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">
                                                {alloc.orderStatus}
                                              </span>
                                            </td>
                                            <td className="py-2 px-2 text-center">
                                              <button
                                                onClick={() => {
                                                  const match = orders.find(o => o._id === alloc.orderId);
                                                  if (match) handleOpenOrderDetail(match);
                                                }}
                                                className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                                              >
                                                Open Order
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
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

            {/* Footer Summary */}
            <div className="bg-gray-50/80 px-4 py-3 border-t border-gray-200 text-xs text-gray-600 flex items-center justify-between">
              <div>
                Showing <strong className="text-gray-900">{filteredMaterials.length}</strong> material items
              </div>
              <div className="flex items-center space-x-3">
                {totalShortagesCount > 0 && (
                  <span className="text-rose-600 font-bold">
                    Critical Shortages: {totalShortagesCount} items ({totalDeficitUnits.toLocaleString()} units deficit)
                  </span>
                )}
                <span>•</span>
                <span className="text-emerald-700 font-semibold">
                  Sufficient: {totalAdequateCount} items
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // TAB 4: BOM MASTER (Tally Dynamic Recipe & Batch Simulator)
  // -------------------------------------------------------------
  if (activeTab === 'bom') {
    return (
      <div className="flex flex-col h-full bg-slate-50/60 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="bg-white border-b border-gray-150 px-6 py-4 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
              <LayoutGrid className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Bill of Materials (BOM) Master</h1>
              <p className="text-xs text-gray-500 font-medium">Standard BOM formulations configured for finished goods in Item Master.</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setEditingBomSkuId(null);
                setShowBomModal(true);
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Bulk Edit BOMs</span>
            </button>
            <button
              onClick={handleOpenNewOrder}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Order</span>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              ← Back to Orders
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        {renderTabNavigation()}

        {/* Main Content Area - Full boxed width matching Production Orders */}
        <div className="p-6 flex-1 flex flex-col min-w-0 space-y-4">
          {/* Dynamic KPI Summary Header */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Configured BOM Recipes</p>
                <h3 className="text-xl font-bold text-gray-900">{skusWithBom.length} Formulations</h3>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Finished Products</p>
                <h3 className="text-xl font-bold text-gray-900">{backendSkus.length} SKUs in Master</h3>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Dynamic Batch Simulator</p>
                <span className="text-xs font-semibold text-purple-700">Active across cards</span>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between shadow-2xs">
            <div className="relative w-full max-w-md">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={bomSearch}
                onChange={e => setBomSearch(e.target.value)}
                placeholder="Search BOM by finished product name, SKU code, category..."
                className="w-full pl-8 pr-8 py-1.5 text-xs text-gray-900 placeholder-gray-400 bg-gray-50/70 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
              />
              {bomSearch && (
                <button 
                  onClick={() => setBomSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <span className="text-xs text-gray-500 font-medium hidden sm:inline">
              Showing <strong>{filteredSkusWithBom.length}</strong> configured BOM formulations
            </span>
          </div>

          {/* BOM Cards with Dynamic Batch Calculator */}
          {filteredSkusWithBom.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              <Layers className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="font-semibold text-gray-600">
                {bomSearch ? 'No BOM formulations matching search' : 'No BOMs configured in Item Master'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Configure BOM recipes in Item Master to see standard formulations here.</p>
            </div>
          ) : (
            filteredSkusWithBom.map(sku => {
              const baseYield = Number(sku.recipeYieldQty) || 1;
              const currentSimSize = simulatedBatchSizes[sku._id] ?? baseYield;

              return (
                <div key={sku._id} className="bg-white rounded-xl border border-gray-200 shadow-2xs p-5 space-y-4">
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-150 gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-bold text-gray-900">{sku.name}</h3>
                        <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-semibold border border-blue-200">
                          {sku.skuCode}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Category: <strong className="text-gray-700">{sku.category || 'General'}</strong> • Standard Base Yield: <strong className="text-gray-700">{baseYield} {sku.recipeYieldUnit || sku.unit || 'PCS'}</strong>
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                        {sku.bomItems?.length || 0} Components
                      </span>
                      <button
                        onClick={() => {
                          setEditingBomSkuId(sku._id);
                          setShowBomModal(true);
                        }}
                        className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Recipe in Item Master</span>
                      </button>
                    </div>
                  </div>

                  {/* Tally Dynamic Batch Requirement Estimator */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center space-x-2">
                      <Calculator className="w-4 h-4 text-blue-600" />
                      <span className="font-bold text-gray-800">Dynamic Batch Requirement Simulator:</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-gray-600">Simulate Batch Output:</span>
                      <input
                        type="number"
                        min="1"
                        value={currentSimSize}
                        onChange={e => {
                          const val = Math.max(1, Number(e.target.value) || 1);
                          setSimulatedBatchSizes(prev => ({ ...prev, [sku._id]: val }));
                        }}
                        className="w-24 px-2.5 py-1 text-xs font-bold text-gray-900 bg-white border border-gray-300 rounded shadow-2xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="font-semibold text-gray-700">{sku.recipeYieldUnit || sku.unit || 'PCS'}</span>

                      {currentSimSize !== baseYield && (
                        <button
                          onClick={() => {
                            setSimulatedBatchSizes(prev => ({ ...prev, [sku._id]: baseYield }));
                          }}
                          className="text-[11px] text-blue-600 hover:underline px-1 cursor-pointer"
                        >
                          Reset to 1 Batch ({baseYield})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Component Table with Dynamic Scaling */}
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase">
                          <th className="py-2 px-3 w-8">#</th>
                          <th className="py-2 px-3">Component Item</th>
                          <th className="py-2 px-3">Type</th>
                          <th className="py-2 px-3 text-right">Standard Qty (per {baseYield} {sku.recipeYieldUnit || 'units'})</th>
                          <th className="py-2 px-3 text-right font-bold text-blue-600">Scaled for Batch ({currentSimSize})</th>
                          <th className="py-2 px-3">UOM</th>
                          <th className="py-2 px-3 text-right">Available Warehouse Stock</th>
                          <th className="py-2 px-3">Batch Stock Check</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sku.bomItems?.map((comp: any, cIdx: number) => {
                          const baseQty = Number(comp.qty || comp.qtyPerBatch || 1);
                          const scaledQty = baseYield > 0 ? (baseQty / baseYield) * currentSimSize : baseQty;
                          const inStock = Number(comp.inStock ?? 0);
                          const hasDeficit = inStock < scaledQty;

                          return (
                            <tr key={cIdx} className="hover:bg-gray-50/50">
                              <td className="py-2.5 px-3 text-gray-400">{cIdx + 1}</td>
                              <td className="py-2.5 px-3 font-semibold text-gray-900">{comp.name || comp.itemName || comp.skuCode}</td>
                              <td className="py-2.5 px-3">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">
                                  {comp.type || 'Raw Material'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-gray-600 text-right">{baseQty.toLocaleString()}</td>
                              <td className="py-2.5 px-3 font-bold text-blue-700 text-right">
                                {scaledQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-gray-600">{comp.uom || 'PCS'}</td>
                              <td className="py-2.5 px-3 font-semibold text-gray-700 text-right">{inStock.toLocaleString()}</td>
                              <td className="py-2.5 px-3">
                                {hasDeficit ? (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>Shortage ({Math.abs(inStock - scaledQty).toLocaleString(undefined, { maximumFractionDigits: 1 })})</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <Check className="w-3 h-3" />
                                    <span>Available</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bulk BOM Edit Modal */}
        {showBomModal && selectedCompany?._id && (
          <BulkEditBomModal
            isOpen={showBomModal}
            onClose={() => setShowBomModal(false)}
            companyId={selectedCompany._id}
            initialSelectedSkuId={editingBomSkuId || undefined}
            onSaved={() => {
              loadOrders();
            }}
          />
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // TAB 5: HISTORY / AUDIT LOG (Tally Production Activity Log)
  // -------------------------------------------------------------
  if (activeTab === 'history') {
    return (
      <div className="flex flex-col h-full bg-slate-50/60 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="bg-white border-b border-gray-150 px-6 py-4 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
              <History className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Production Audit Log</h1>
              <p className="text-xs text-gray-500 font-medium">Activity timeline of manufacturing orders in backend database.</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleOpenNewOrder}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Order</span>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              ← Back to Orders
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        {renderTabNavigation()}

        {/* Main Content Area - Full boxed width matching Production Orders */}
        <div className="p-6 flex-1 flex flex-col min-w-0 space-y-4">
          {/* Dynamic KPI Summary Header */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <History className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Orders Logged</p>
                <h3 className="text-xl font-bold text-gray-900">{orders.length}</h3>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">In Progress</p>
                <h3 className="text-xl font-bold text-amber-700">{historyInProgressCount}</h3>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Completed Orders</p>
                <h3 className="text-xl font-bold text-emerald-700">{historyCompletedCount}</h3>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Active Departments</p>
                <h3 className="text-xl font-bold text-gray-900">{distinctHistoryDepts.length || 1}</h3>
              </div>
            </div>
          </div>

          {/* Activity Timeline List */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-150 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-gray-700 flex items-center space-x-1 mr-1">
                  <Filter className="w-3.5 h-3.5 text-gray-400" />
                  <span>Filters:</span>
                </span>

                {/* Status Filter */}
                <select
                  value={historyStatusFilter}
                  onChange={e => setHistoryStatusFilter(e.target.value)}
                  className="text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Planned">Planned</option>
                  <option value="Cancelled">Cancelled</option>
                </select>

                {/* Department Filter */}
                <select
                  value={historyDeptFilter}
                  onChange={e => setHistoryDeptFilter(e.target.value)}
                  className="text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="ALL">All Departments</option>
                  {distinctHistoryDepts.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="Search activity log by order or product..."
                  className="w-full sm:w-64 pl-8 pr-8 py-1.5 text-xs text-gray-900 placeholder-gray-400 bg-gray-50/70 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
                />
                {historySearch && (
                  <button 
                    onClick={() => setHistorySearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {filteredHistoryOrders.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs">
                {historySearch ? 'No activities matching your search.' : 'No production activity recorded in backend database yet.'}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredHistoryOrders.map((o) => {
                  const statusColors: Record<string, string> = {
                    'Completed': 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
                    'Planned': 'bg-amber-50 text-amber-700 border-amber-200',
                    'Cancelled': 'bg-rose-50 text-rose-700 border-rose-200'
                  };

                  return (
                    <div 
                      key={o._id} 
                      className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/40 hover:bg-gray-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-blue-600 text-sm">{o.orderNumber}</span>
                          <span className="text-gray-300">•</span>
                          <span className="font-bold text-gray-900 text-sm">{o.itemName}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColors[o.status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                            {o.status}
                          </span>
                          <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-semibold">
                            Dept: {o.department || 'General'}
                          </span>
                        </div>

                        <div className="flex items-center space-x-3 text-xs text-gray-600">
                          <span>Target: <strong>{o.plannedQty.toLocaleString()} {o.plannedUom}</strong></span>
                          <span>•</span>
                          <span>Produced: <strong className="text-gray-900">{o.producedQty.toLocaleString()} {o.plannedUom}</strong> ({o.producedPcs.toLocaleString()} PCS)</span>
                          <span>•</span>
                          <span>Shifts Logged: <strong>{o.productionEntries?.length || 0}</strong></span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full max-w-md flex items-center space-x-2 pt-1">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${
                                o.status === 'Completed' ? 'bg-emerald-500' : 'bg-blue-600'
                              }`}
                              style={{ width: `${Math.min(100, o.progress || 0)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-gray-700">{o.progress || 0}%</span>
                        </div>
                      </div>

                      {/* Right action buttons */}
                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          onClick={() => handleOpenRecordEntries(o)}
                          className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                        >
                          Entries ({o.productionEntries?.length || 0})
                        </button>
                        <button
                          onClick={() => handleOpenOrderDetail(o)}
                          className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors cursor-pointer"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default: Screen 1 List View (Production Orders tab)
  return (
    <>
      <ProductionOrdersList
        orders={orders}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onNewOrder={handleOpenNewOrder}
        onViewOrder={handleOpenOrderDetail}
        onRecordEntries={handleOpenRecordEntries}
        onPrintOrder={setPrintOrder}
        onDeleteOrder={handleDeleteOrder}
        onRefresh={loadOrders}
      />
      <ProductionPrintModal order={printOrder} onClose={() => setPrintOrder(null)} />
    </>
  );
};

export default ProductionModule;

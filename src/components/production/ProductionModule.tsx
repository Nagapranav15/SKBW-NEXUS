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
  ArrowLeft, Search, Plus, CheckCircle, AlertTriangle, Layers, Loader2, X, Edit3, ExternalLink
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
  const [entriesHighlightedIdx, setEntriesHighlightedIdx] = useState(0);
  const entriesSearchRef = useRef<HTMLInputElement>(null);

  // Tab 3: Material Requirements state
  const [materialsSearch, setMaterialsSearch] = useState('');
  const [materialsHighlightedIdx, setMaterialsHighlightedIdx] = useState(0);
  const materialsSearchRef = useRef<HTMLInputElement>(null);

  // Tab 4: BOM Master state
  const [bomSearch, setBomSearch] = useState('');
  const [bomHighlightedIdx, setBomHighlightedIdx] = useState(0);
  const bomSearchRef = useRef<HTMLInputElement>(null);
  const [editingBomSkuId, setEditingBomSkuId] = useState<string | null>(null);
  const [showBomModal, setShowBomModal] = useState(false);

  // Tab 5: History state
  const [historySearch, setHistorySearch] = useState('');
  const [historyHighlightedIdx, setHistoryHighlightedIdx] = useState(0);
  const historySearchRef = useRef<HTMLInputElement>(null);

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

  // Computed Entries Data
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

  const filteredEntries = useMemo(() => {
    if (!entriesSearch.trim()) return allEntries;
    const q = entriesSearch.toLowerCase();
    return allEntries.filter(e => 
      e.orderNumber.toLowerCase().includes(q) ||
      e.itemName.toLowerCase().includes(q) ||
      (e.shift && e.shift.toLowerCase().includes(q)) ||
      (e.department && e.department.toLowerCase().includes(q)) ||
      (e.createdBy && e.createdBy.toLowerCase().includes(q)) ||
      (e.remarks && e.remarks.toLowerCase().includes(q)) ||
      (e.date && e.date.toLowerCase().includes(q))
    );
  }, [allEntries, entriesSearch]);

  // Computed Materials Data
  const materialsList = useMemo(() => {
    const materialsMap = new Map<string, {
      component: string;
      type: string;
      uom: string;
      totalRequired: number;
      availableStock: number;
      ordersCount: number;
    }>();

    orders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled').forEach(o => {
      (o.bomItems || []).forEach(b => {
        const key = b.component;
        if (!materialsMap.has(key)) {
          materialsMap.set(key, {
            component: b.component,
            type: b.type,
            uom: b.uom,
            totalRequired: 0,
            availableStock: b.availableStock,
            ordersCount: 0
          });
        }
        const curr = materialsMap.get(key)!;
        curr.totalRequired += b.totalRequired;
        curr.ordersCount += 1;
      });
    });

    return Array.from(materialsMap.values());
  }, [orders]);

  const filteredMaterials = useMemo(() => {
    if (!materialsSearch.trim()) return materialsList;
    const q = materialsSearch.toLowerCase();
    return materialsList.filter(m => 
      m.component.toLowerCase().includes(q) ||
      m.type.toLowerCase().includes(q) ||
      m.uom.toLowerCase().includes(q)
    );
  }, [materialsList, materialsSearch]);

  const shortageCount = useMemo(() => {
    return filteredMaterials.filter(m => (m.availableStock - m.totalRequired) < 0).length;
  }, [filteredMaterials]);

  // Computed BOM Data
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

  // Computed History Data
  const filteredHistoryOrders = useMemo(() => {
    if (!historySearch.trim()) return orders;
    const q = historySearch.toLowerCase();
    return orders.filter(o => 
      o.orderNumber.toLowerCase().includes(q) ||
      o.itemName.toLowerCase().includes(q) ||
      (o.department && o.department.toLowerCase().includes(q)) ||
      (o.status && o.status.toLowerCase().includes(q))
    );
  }, [orders, historySearch]);

  // Clamp Highlighted Indices when list lengths change
  useEffect(() => {
    if (entriesHighlightedIdx >= filteredEntries.length) {
      setEntriesHighlightedIdx(Math.max(0, filteredEntries.length - 1));
    }
  }, [filteredEntries.length]);

  useEffect(() => {
    if (materialsHighlightedIdx >= filteredMaterials.length) {
      setMaterialsHighlightedIdx(Math.max(0, filteredMaterials.length - 1));
    }
  }, [filteredMaterials.length]);

  useEffect(() => {
    if (bomHighlightedIdx >= filteredSkusWithBom.length) {
      setBomHighlightedIdx(Math.max(0, filteredSkusWithBom.length - 1));
    }
  }, [filteredSkusWithBom.length]);

  useEffect(() => {
    if (historyHighlightedIdx >= filteredHistoryOrders.length) {
      setHistoryHighlightedIdx(Math.max(0, filteredHistoryOrders.length - 1));
    }
  }, [filteredHistoryOrders.length]);

  // Keyboard Shortcuts Handler for Tabs (Alt+1..5, Alt+C, Arrow keys, Enter, Esc, Search)
  useEffect(() => {
    if (currentView !== 'list') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputActive = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);

      // Alt + 1..5 for Tab Switching
      if (e.altKey && ['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        const tabMap: Record<string, string> = {
          '1': 'orders',
          '2': 'entries',
          '3': 'materials',
          '4': 'bom',
          '5': 'history'
        };
        setActiveTab(tabMap[e.key]);
        return;
      }

      // Alt+C or Alt+N to open New Order Wizard
      if (e.altKey && (e.key === 'c' || e.key === 'C' || e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        handleOpenNewOrder();
        return;
      }

      // Tab 2: Production Entries keys
      if (activeTab === 'entries') {
        if (e.key === '/' && !isInputActive) {
          e.preventDefault();
          entriesSearchRef.current?.focus();
          return;
        }
        if (e.altKey && (e.key === 'f' || e.key === 'F')) {
          e.preventDefault();
          entriesSearchRef.current?.focus();
          return;
        }
        if (e.key === 'Escape') {
          if (isInputActive) {
            (document.activeElement as HTMLElement)?.blur();
            return;
          }
          if (entriesSearch) {
            setEntriesSearch('');
            return;
          }
          setActiveTab('orders');
          return;
        }
        if (isInputActive) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setEntriesHighlightedIdx(prev => Math.min(prev + 1, Math.max(0, filteredEntries.length - 1)));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setEntriesHighlightedIdx(prev => Math.max(0, prev - 1));
          return;
        }
        if (e.key === 'Enter') {
          if (filteredEntries.length > 0 && entriesHighlightedIdx >= 0 && entriesHighlightedIdx < filteredEntries.length) {
            e.preventDefault();
            handleOpenRecordEntries(filteredEntries[entriesHighlightedIdx].parentOrder);
          }
          return;
        }
      } 
      // Tab 3: Material Requirements keys
      else if (activeTab === 'materials') {
        if (e.key === '/' && !isInputActive) {
          e.preventDefault();
          materialsSearchRef.current?.focus();
          return;
        }
        if (e.altKey && (e.key === 'f' || e.key === 'F')) {
          e.preventDefault();
          materialsSearchRef.current?.focus();
          return;
        }
        if (e.key === 'Escape') {
          if (isInputActive) {
            (document.activeElement as HTMLElement)?.blur();
            return;
          }
          if (materialsSearch) {
            setMaterialsSearch('');
            return;
          }
          setActiveTab('orders');
          return;
        }
        if (isInputActive) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMaterialsHighlightedIdx(prev => Math.min(prev + 1, Math.max(0, filteredMaterials.length - 1)));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMaterialsHighlightedIdx(prev => Math.max(0, prev - 1));
          return;
        }
      } 
      // Tab 4: BOM Master keys
      else if (activeTab === 'bom') {
        if (showBomModal) return;

        if (e.key === '/' && !isInputActive) {
          e.preventDefault();
          bomSearchRef.current?.focus();
          return;
        }
        if (e.altKey && (e.key === 'f' || e.key === 'F')) {
          e.preventDefault();
          bomSearchRef.current?.focus();
          return;
        }
        if (e.key === 'Escape') {
          if (isInputActive) {
            (document.activeElement as HTMLElement)?.blur();
            return;
          }
          if (bomSearch) {
            setBomSearch('');
            return;
          }
          setActiveTab('orders');
          return;
        }
        if (isInputActive) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setBomHighlightedIdx(prev => Math.min(prev + 1, Math.max(0, filteredSkusWithBom.length - 1)));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setBomHighlightedIdx(prev => Math.max(0, prev - 1));
          return;
        }
        if (e.key === 'Enter') {
          if (filteredSkusWithBom.length > 0 && bomHighlightedIdx >= 0 && bomHighlightedIdx < filteredSkusWithBom.length) {
            e.preventDefault();
            setEditingBomSkuId(filteredSkusWithBom[bomHighlightedIdx]._id);
            setShowBomModal(true);
          }
          return;
        }
      } 
      // Tab 5: History Audit keys
      else if (activeTab === 'history') {
        if (e.key === '/' && !isInputActive) {
          e.preventDefault();
          historySearchRef.current?.focus();
          return;
        }
        if (e.altKey && (e.key === 'f' || e.key === 'F')) {
          e.preventDefault();
          historySearchRef.current?.focus();
          return;
        }
        if (e.key === 'Escape') {
          if (isInputActive) {
            (document.activeElement as HTMLElement)?.blur();
            return;
          }
          if (historySearch) {
            setHistorySearch('');
            return;
          }
          setActiveTab('orders');
          return;
        }
        if (isInputActive) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHistoryHighlightedIdx(prev => Math.min(prev + 1, Math.max(0, filteredHistoryOrders.length - 1)));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHistoryHighlightedIdx(prev => Math.max(0, prev - 1));
          return;
        }
        if (e.key === 'Enter') {
          if (filteredHistoryOrders.length > 0 && historyHighlightedIdx >= 0 && historyHighlightedIdx < filteredHistoryOrders.length) {
            e.preventDefault();
            handleOpenOrderDetail(filteredHistoryOrders[historyHighlightedIdx]);
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentView,
    activeTab,
    filteredEntries,
    entriesHighlightedIdx,
    entriesSearch,
    filteredMaterials,
    materialsHighlightedIdx,
    materialsSearch,
    filteredSkusWithBom,
    bomHighlightedIdx,
    bomSearch,
    showBomModal,
    filteredHistoryOrders,
    historyHighlightedIdx,
    historySearch
  ]);

  // Tab Header Bar Definition
  const TAB_ITEMS = [
    { id: 'orders', label: 'Production Orders', icon: Calendar, shortcut: 'Alt+1' },
    { id: 'entries', label: 'Production Entries', icon: Package, shortcut: 'Alt+2' },
    { id: 'materials', label: 'Material Requirements', icon: FileText, shortcut: 'Alt+3' },
    { id: 'bom', label: 'BOM', icon: LayoutGrid, shortcut: 'Alt+4' },
    { id: 'history', label: 'History', icon: History, shortcut: 'Alt+5' }
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
            <kbd className={`ml-1 px-1.5 py-0.5 text-[9px] font-mono rounded ${active ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-gray-100 text-gray-500'}`}>{tab.shortcut}</kbd>
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

  // TAB 2: Production Entries
  if (activeTab === 'entries') {
    return (
      <div className="flex flex-col h-full bg-slate-50/60">
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
              <kbd className="ml-1 px-1.5 py-0.5 bg-blue-700/80 rounded text-[9px] font-mono text-blue-100">Alt+C</kbd>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              ← Back to Orders <span className="text-[10px] text-gray-400 font-mono">(Esc)</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        {renderTabNavigation()}

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 max-w-7xl mx-auto w-full">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-gray-900 uppercase">
                  All Recorded Output Entries ({filteredEntries.length})
                </h2>
                {entriesSearch && (
                  <span className="text-xs text-gray-500 font-medium">
                    (filtered from {allEntries.length})
                  </span>
                )}
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={entriesSearchRef}
                  type="text"
                  value={entriesSearch}
                  onChange={e => {
                    setEntriesSearch(e.target.value);
                    setEntriesHighlightedIdx(0);
                  }}
                  placeholder="Search entries... [/ or Alt+F]"
                  className="w-64 pl-8 pr-8 py-1.5 text-xs text-gray-900 placeholder-gray-400 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
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

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-3">Order No</th>
                    <th className="py-3 px-3">Item / Product</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Shift</th>
                    <th className="py-3 px-3">Produced Qty</th>
                    <th className="py-3 px-3">Produced PCS</th>
                    <th className="py-3 px-3">Cumulative</th>
                    <th className="py-3 px-3">Remarks</th>
                    <th className="py-3 px-3">Logged By</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-10 text-center text-gray-400">
                        {entriesSearch ? 'No production entries matching your search.' : 'No production entries recorded in backend yet.'}
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((e, idx) => {
                      const isHighlighted = entriesHighlightedIdx === idx;
                      return (
                        <tr 
                          key={e.id || idx} 
                          onMouseEnter={() => setEntriesHighlightedIdx(idx)}
                          onDoubleClick={() => handleOpenRecordEntries(e.parentOrder)}
                          className={`transition-colors cursor-pointer ${
                            isHighlighted 
                              ? 'bg-blue-100/70 border-l-4 border-blue-600 font-medium' 
                              : 'hover:bg-gray-50/50'
                          }`}
                        >
                          <td className="py-3 px-3 text-center font-semibold text-gray-500">
                            {isHighlighted ? <span className="text-blue-600 font-bold">▶</span> : idx + 1}
                          </td>
                          <td className="py-3 px-3 font-bold font-mono text-blue-600">
                            <button onClick={() => handleOpenRecordEntries(e.parentOrder)} className="hover:underline cursor-pointer">
                              {e.orderNumber}
                            </button>
                          </td>
                          <td className="py-3 px-3 font-bold text-gray-900">{e.itemName}</td>
                          <td className="py-3 px-3 text-gray-700 whitespace-nowrap">{e.date}</td>
                          <td className="py-3 px-3 text-gray-700">{e.shift}</td>
                          <td className="py-3 px-3 font-bold text-gray-900 whitespace-nowrap">{e.producedQty} {e.producedUom}</td>
                          <td className="py-3 px-3 font-semibold text-gray-700 whitespace-nowrap">{e.producedPcs.toLocaleString()} PCS</td>
                          <td className="py-3 px-3 font-bold text-gray-900 whitespace-nowrap">{e.cumulativeQty} {e.producedUom}</td>
                          <td className="py-3 px-3 text-gray-600">{e.remarks || '-'}</td>
                          <td className="py-3 px-3 font-semibold text-gray-700">{e.createdBy}</td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => handleOpenRecordEntries(e.parentOrder)}
                              className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                            >
                              View Order
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Tally Keyboard Shortcut Status Bar */}
        <div className="bg-slate-900 text-slate-300 px-4 py-2 border-t border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3 select-none shrink-0">
          <div className="flex items-center space-x-3 text-[11px] overflow-x-auto py-0.5">
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+1..5</kbd>
              <span className="text-slate-300">Switch Tabs</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">↑ / ↓</kbd>
              <span className="text-slate-300">Navigate Entries</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">↵ Enter</kbd>
              <span className="text-slate-300">Open Order Entries</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+C</kbd>
              <span className="text-slate-300">New Order</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">/</kbd>
              <span className="text-slate-300">Search</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Esc</kbd>
              <span className="text-slate-300">Back to Orders</span>
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            Total Entries: <strong className="text-white">{filteredEntries.length}</strong>
          </div>
        </div>
      </div>
    );
  }

  // TAB 3: Material Requirements
  if (activeTab === 'materials') {
    return (
      <div className="flex flex-col h-full bg-slate-50/60">
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
              <kbd className="ml-1 px-1.5 py-0.5 bg-blue-700/80 rounded text-[9px] font-mono text-blue-100">Alt+C</kbd>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              ← Back to Orders <span className="text-[10px] text-gray-400 font-mono">(Esc)</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        {renderTabNavigation()}

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 max-w-7xl mx-auto w-full">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-gray-900 uppercase">
                  Active Materials Shortfall Analysis ({filteredMaterials.length})
                </h2>
                {materialsSearch && (
                  <span className="text-xs text-gray-500 font-medium">
                    (filtered from {materialsList.length})
                  </span>
                )}
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={materialsSearchRef}
                  type="text"
                  value={materialsSearch}
                  onChange={e => {
                    setMaterialsSearch(e.target.value);
                    setMaterialsHighlightedIdx(0);
                  }}
                  placeholder="Search materials... [/ or Alt+F]"
                  className="w-64 pl-8 pr-8 py-1.5 text-xs text-gray-900 placeholder-gray-400 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
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

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-3">Raw Material / Component</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Allocated in Orders</th>
                    <th className="py-3 px-3 font-bold">Total Required</th>
                    <th className="py-3 px-3">Available In Stock</th>
                    <th className="py-3 px-3">UOM</th>
                    <th className="py-3 px-3">Net Balance / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-gray-400">
                        {materialsSearch ? 'No materials matching your search.' : 'No active production material requirements found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map((m, idx) => {
                      const balance = m.availableStock - m.totalRequired;
                      const isShortage = balance < 0;
                      const isHighlighted = idx === materialsHighlightedIdx;
                      return (
                        <tr 
                          key={m.component} 
                          onMouseEnter={() => setMaterialsHighlightedIdx(idx)}
                          className={`transition-colors cursor-pointer ${
                            isHighlighted 
                              ? 'bg-blue-100/70 border-l-4 border-blue-600 font-medium' 
                              : 'hover:bg-gray-50/50'
                          }`}
                        >
                          <td className="py-3 px-3 text-center font-semibold text-gray-500">
                            {isHighlighted ? <span className="text-blue-600 font-bold">▶</span> : idx + 1}
                          </td>
                          <td className="py-3 px-3 font-bold text-gray-900">{m.component}</td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                              {m.type}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-semibold text-gray-700">{m.ordersCount} Production Orders</td>
                          <td className="py-3 px-3 font-bold text-gray-900">{m.totalRequired.toLocaleString()}</td>
                          <td className="py-3 px-3 font-semibold text-gray-700">{m.availableStock.toLocaleString()}</td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{m.uom}</td>
                          <td className="py-3 px-3">
                            {isShortage ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                Shortage ({Math.abs(balance).toLocaleString()} {m.uom})
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Ready (+{balance.toLocaleString()} {m.uom})
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Tally Keyboard Shortcut Status Bar */}
        <div className="bg-slate-900 text-slate-300 px-4 py-2 border-t border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3 select-none shrink-0">
          <div className="flex items-center space-x-3 text-[11px] overflow-x-auto py-0.5">
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+1..5</kbd>
              <span className="text-slate-300">Switch Tabs</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">↑ / ↓</kbd>
              <span className="text-slate-300">Navigate Materials</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+C</kbd>
              <span className="text-slate-300">New Order</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">/</kbd>
              <span className="text-slate-300">Search</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Esc</kbd>
              <span className="text-slate-300">Back to Orders</span>
            </span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center space-x-3">
            <span>Total Items: <strong className="text-white">{filteredMaterials.length}</strong></span>
            {shortageCount > 0 && (
              <span className="text-rose-400 font-bold">Shortages: {shortageCount}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // TAB 4: BOM Master
  if (activeTab === 'bom') {
    return (
      <div className="flex flex-col h-full bg-slate-50/60">
        {/* Header */}
        <div className="bg-white border-b border-gray-150 px-6 py-4 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
              <LayoutGrid className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Bill of Materials (BOM) Master</h1>
              <p className="text-xs text-gray-500 font-medium">BOM formulations configured for finished goods in Item Master.</p>
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
              <kbd className="ml-1 px-1.5 py-0.5 bg-blue-700/80 rounded text-[9px] font-mono text-blue-100">Alt+C</kbd>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              ← Back to Orders <span className="text-[10px] text-gray-400 font-mono">(Esc)</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        {renderTabNavigation()}

        {/* Search & Actions Bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={bomSearchRef}
              type="text"
              value={bomSearch}
              onChange={e => {
                setBomSearch(e.target.value);
                setBomHighlightedIdx(0);
              }}
              placeholder="Search BOM by product, code or category... [/ or Alt+F]"
              className="w-80 pl-8 pr-8 py-1.5 text-xs text-gray-900 placeholder-gray-400 bg-gray-50/70 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
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
          <div className="text-xs text-gray-500 font-medium">
            Showing <strong className="text-gray-800">{filteredSkusWithBom.length}</strong> configured BOM formulations
          </div>
        </div>

        {/* Content Cards */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 max-w-7xl mx-auto w-full space-y-5">
          {filteredSkusWithBom.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              <Layers className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="font-semibold text-gray-600">
                {bomSearch ? 'No BOM formulations matching search' : 'No BOMs configured in Item Master'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Configure BOM recipes in Item Master to see standard formulations here.</p>
            </div>
          ) : (
            filteredSkusWithBom.map((sku, idx) => {
              const isHighlighted = idx === bomHighlightedIdx;
              return (
                <div 
                  key={sku._id} 
                  onMouseEnter={() => setBomHighlightedIdx(idx)}
                  className={`bg-white rounded-xl border transition-all p-5 space-y-3 cursor-pointer ${
                    isHighlighted 
                      ? 'ring-2 ring-blue-500 border-blue-400 shadow-md bg-blue-50/10' 
                      : 'border-gray-200 shadow-2xs hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center space-x-2.5">
                      {isHighlighted && <span className="text-blue-600 font-bold text-sm">▶</span>}
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">{sku.name} ({sku.skuCode})</h3>
                        <p className="text-xs text-gray-500">Category: {sku.category} • Yield: {sku.recipeYieldQty || 1} {sku.recipeYieldUnit || sku.unit}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {sku.bomItems?.length} Components
                      </span>
                      <button
                        onClick={() => {
                          setEditingBomSkuId(sku._id);
                          setShowBomModal(true);
                        }}
                        className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
                      >
                        <span>Edit Recipe</span>
                        <kbd className="px-1 py-0.2 bg-blue-100/70 rounded text-[9px] font-mono">↵</kbd>
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase">
                          <th className="py-2 px-3 w-8">#</th>
                          <th className="py-2 px-3">Component SKU</th>
                          <th className="py-2 px-3">Qty per Batch</th>
                          <th className="py-2 px-3">UOM</th>
                          <th className="py-2 px-3">Stock Available</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sku.bomItems?.map((comp: any, cIdx: number) => (
                          <tr key={cIdx} className="hover:bg-gray-50/50">
                            <td className="py-2.5 px-3 text-gray-400">{cIdx + 1}</td>
                            <td className="py-2.5 px-3 font-semibold text-gray-900">{comp.name || comp.itemName || comp.skuCode}</td>
                            <td className="py-2.5 px-3 font-bold text-gray-900">{comp.qty || comp.qtyPerBatch || 1}</td>
                            <td className="py-2.5 px-3 text-gray-600">{comp.uom || 'PCS'}</td>
                            <td className="py-2.5 px-3 font-semibold text-gray-700">{comp.inStock ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Tally Keyboard Shortcut Status Bar */}
        <div className="bg-slate-900 text-slate-300 px-4 py-2 border-t border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3 select-none shrink-0">
          <div className="flex items-center space-x-3 text-[11px] overflow-x-auto py-0.5">
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+1..5</kbd>
              <span className="text-slate-300">Switch Tabs</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">↑ / ↓</kbd>
              <span className="text-slate-300">Navigate BOMs</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">↵ Enter</kbd>
              <span className="text-slate-300">Edit BOM Recipe</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+C</kbd>
              <span className="text-slate-300">New Order</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">/</kbd>
              <span className="text-slate-300">Search</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Esc</kbd>
              <span className="text-slate-300">Back to Orders</span>
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            Total BOM Recipes: <strong className="text-white">{filteredSkusWithBom.length}</strong>
          </div>
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

  // TAB 5: History Audit Log
  if (activeTab === 'history') {
    return (
      <div className="flex flex-col h-full bg-slate-50/60">
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
              <kbd className="ml-1 px-1.5 py-0.5 bg-blue-700/80 rounded text-[9px] font-mono text-blue-100">Alt+C</kbd>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              ← Back to Orders <span className="text-[10px] text-gray-400 font-mono">(Esc)</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        {renderTabNavigation()}

        {/* Content List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 max-w-7xl mx-auto w-full">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-150 pb-3">
              <h2 className="text-sm font-bold text-gray-900 uppercase">
                Recent Backend Production Activity ({filteredHistoryOrders.length})
              </h2>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={historySearchRef}
                  type="text"
                  value={historySearch}
                  onChange={e => {
                    setHistorySearch(e.target.value);
                    setHistoryHighlightedIdx(0);
                  }}
                  placeholder="Search activity log... [/ or Alt+F]"
                  className="w-64 pl-8 pr-8 py-1.5 text-xs text-gray-900 placeholder-gray-400 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
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
                {filteredHistoryOrders.slice(0, 30).map((o, idx) => {
                  const isHighlighted = idx === historyHighlightedIdx;
                  return (
                    <div 
                      key={o._id} 
                      onMouseEnter={() => setHistoryHighlightedIdx(idx)}
                      onDoubleClick={() => handleOpenOrderDetail(o)}
                      className={`flex items-start space-x-3 p-3.5 rounded-lg border transition-all cursor-pointer ${
                        isHighlighted 
                          ? 'bg-blue-100/70 border-l-4 border-blue-600 font-medium shadow-2xs' 
                          : 'bg-gray-50/70 border-gray-200/60 hover:bg-gray-100/60'
                      }`}
                    >
                      <div className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900">{o.orderNumber} – {o.itemName}</span>
                          <span className="text-[11px] text-gray-400">{o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}</span>
                        </div>
                        <p className="text-gray-600 mt-0.5">Status: <span className="font-semibold text-gray-800">{o.status}</span> • Produced: {o.producedQty} / {o.plannedQty} {o.plannedUom} ({o.progress}%)</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[11px] font-semibold text-gray-400 block">Department: {o.department}</span>
                          <button
                            onClick={() => handleOpenOrderDetail(o)}
                            className="text-xs font-semibold text-blue-600 hover:underline flex items-center space-x-1"
                          >
                            <span>View Details</span>
                            <kbd className="px-1 py-0.2 bg-blue-100 rounded text-[9px] font-mono">↵</kbd>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Tally Keyboard Shortcut Status Bar */}
        <div className="bg-slate-900 text-slate-300 px-4 py-2 border-t border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3 select-none shrink-0">
          <div className="flex items-center space-x-3 text-[11px] overflow-x-auto py-0.5">
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+1..5</kbd>
              <span className="text-slate-300">Switch Tabs</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">↑ / ↓</kbd>
              <span className="text-slate-300">Navigate Activity Log</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">↵ Enter</kbd>
              <span className="text-slate-300">View Order Details</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+C</kbd>
              <span className="text-slate-300">New Order</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">/</kbd>
              <span className="text-slate-300">Search</span>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Esc</kbd>
              <span className="text-slate-300">Back to Orders</span>
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            Total Activities: <strong className="text-white">{filteredHistoryOrders.length}</strong>
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

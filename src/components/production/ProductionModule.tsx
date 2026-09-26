import React, { useState, useEffect } from 'react';
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
import { showToast } from '../ui/Toast';
import { 
  Calendar, Package, FileText, LayoutGrid, History, 
  ArrowLeft, Search, Plus, CheckCircle, AlertTriangle, Layers, Loader2
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

  // Handle Tab Views (computed dynamically from backend data)
  if (activeTab === 'entries') {
    const allEntries = orders.flatMap(o => 
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

    return (
      <div className="flex flex-col h-full bg-slate-50/60 overflow-y-auto custom-scrollbar">
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

          <button
            onClick={() => setActiveTab('orders')}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            ← Back to Orders
          </button>
        </div>

        <div className="bg-white border-b border-gray-200 px-6 shrink-0 flex items-center space-x-2 py-2">
          {[
            { id: 'orders', label: 'Production Orders', icon: Calendar },
            { id: 'entries', label: 'Production Entries', icon: Package },
            { id: 'materials', label: 'Material Requirements', icon: FileText },
            { id: 'bom', label: 'BOM', icon: LayoutGrid },
            { id: 'history', label: 'History', icon: History }
          ].map(tab => {
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

        <div className="p-6 max-w-7xl mx-auto w-full">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 uppercase">
                All Recorded Output Entries ({allEntries.length})
              </h2>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-3 w-8 text-center">#</th>
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
                  {allEntries.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-10 text-center text-gray-400">
                        No production entries recorded in backend yet.
                      </td>
                    </tr>
                  ) : (
                    allEntries.map((e, idx) => (
                      <tr key={e.id} className="hover:bg-gray-50/50">
                        <td className="py-3 px-3 text-center text-gray-400 font-semibold">{idx + 1}</td>
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'materials') {
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

    const materialsList = Array.from(materialsMap.values());

    return (
      <div className="flex flex-col h-full bg-slate-50/60 overflow-y-auto custom-scrollbar">
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

          <button
            onClick={() => setActiveTab('orders')}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            ← Back to Orders
          </button>
        </div>

        <div className="bg-white border-b border-gray-200 px-6 shrink-0 flex items-center space-x-2 py-2">
          {[
            { id: 'orders', label: 'Production Orders', icon: Calendar },
            { id: 'entries', label: 'Production Entries', icon: Package },
            { id: 'materials', label: 'Material Requirements', icon: FileText },
            { id: 'bom', label: 'BOM', icon: LayoutGrid },
            { id: 'history', label: 'History', icon: History }
          ].map(tab => {
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

        <div className="p-6 max-w-7xl mx-auto w-full">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 uppercase">
                Active Materials Shortfall Analysis ({materialsList.length})
              </h2>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-3 w-8 text-center">#</th>
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
                  {materialsList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-gray-400">
                        No active production material requirements found.
                      </td>
                    </tr>
                  ) : (
                    materialsList.map((m, idx) => {
                      const balance = m.availableStock - m.totalRequired;
                      const isShortage = balance < 0;
                      return (
                        <tr key={m.component} className="hover:bg-gray-50/50">
                          <td className="py-3 px-3 text-center text-gray-400 font-semibold">{idx + 1}</td>
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
      </div>
    );
  }

  if (activeTab === 'bom') {
    // Show actual SKUs from backend that have bomItems configured
    const skusWithBom = backendSkus.filter(s => Array.isArray(s.bomItems) && s.bomItems.length > 0);

    return (
      <div className="flex flex-col h-full bg-slate-50/60 overflow-y-auto custom-scrollbar">
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

          <button
            onClick={() => setActiveTab('orders')}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            ← Back to Orders
          </button>
        </div>

        <div className="bg-white border-b border-gray-200 px-6 shrink-0 flex items-center space-x-2 py-2">
          {[
            { id: 'orders', label: 'Production Orders', icon: Calendar },
            { id: 'entries', label: 'Production Entries', icon: Package },
            { id: 'materials', label: 'Material Requirements', icon: FileText },
            { id: 'bom', label: 'BOM', icon: LayoutGrid },
            { id: 'history', label: 'History', icon: History }
          ].map(tab => {
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

        <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
          {skusWithBom.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              <Layers className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="font-semibold text-gray-600">No BOMs configured in Item Master</p>
              <p className="text-xs text-gray-400 mt-1">Configure BOM recipes in Item Master to see standard formulations here.</p>
            </div>
          ) : (
            skusWithBom.map(sku => (
              <div key={sku._id} className="bg-white rounded-xl border border-gray-200 shadow-2xs p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{sku.name} ({sku.skuCode})</h3>
                    <p className="text-xs text-gray-500">Category: {sku.category} • Yield: {sku.recipeYieldQty || 1} {sku.recipeYieldUnit || sku.unit}</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                    {sku.bomItems?.length} Components
                  </span>
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
                      {sku.bomItems?.map((comp: any, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50/50">
                          <td className="py-2.5 px-3 text-gray-400">{idx + 1}</td>
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
            ))
          )}
        </div>
      </div>
    );
  }

  if (activeTab === 'history') {
    return (
      <div className="flex flex-col h-full bg-slate-50/60 overflow-y-auto custom-scrollbar">
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

          <button
            onClick={() => setActiveTab('orders')}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            ← Back to Orders
          </button>
        </div>

        <div className="bg-white border-b border-gray-200 px-6 shrink-0 flex items-center space-x-2 py-2">
          {[
            { id: 'orders', label: 'Production Orders', icon: Calendar },
            { id: 'entries', label: 'Production Entries', icon: Package },
            { id: 'materials', label: 'Material Requirements', icon: FileText },
            { id: 'bom', label: 'BOM', icon: LayoutGrid },
            { id: 'history', label: 'History', icon: History }
          ].map(tab => {
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

        <div className="p-6 max-w-7xl mx-auto w-full">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-900 uppercase">Recent Backend Production Activity</h2>
            {orders.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs">
                No production activity recorded in backend database yet.
              </div>
            ) : (
              <div className="space-y-3">
                {orders.slice(0, 10).map((o) => (
                  <div key={o._id} className="flex items-start space-x-3 p-3 bg-gray-50/70 rounded-lg border border-gray-200/60 text-xs">
                    <div className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900">{o.orderNumber} – {o.itemName}</span>
                        <span className="text-[11px] text-gray-400">{o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}</span>
                      </div>
                      <p className="text-gray-600 mt-0.5">Status: <span className="font-semibold text-gray-800">{o.status}</span> • Produced: {o.producedQty} / {o.plannedQty} {o.plannedUom} ({o.progress}%)</p>
                      <span className="text-[11px] font-semibold text-gray-400 mt-1 block">Department: {o.department}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default: Screen 1 List View
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

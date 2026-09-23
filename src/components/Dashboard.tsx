import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Package, 
  ShoppingCart, 
  FileText, 
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Building2,
  UserCheck,
  Compass,
  MapPin,
  Truck,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getDashboardStats } from '../api/dashboardApi';
import { getSkusV2, SkuV2 } from '../api/mfgApiV2';

const getSkuCategoryGroup = (item: SkuV2): 'products' | 'materials' | 'semi' => {
  const cat = (item.category || '').trim().toLowerCase();
  const name = (item.name || '').trim().toLowerCase();
  const code = (item.skuCode || '').trim().toUpperCase();

  if (
    cat.includes('semi') || 
    cat.includes('wip') || 
    cat === 'semi finished' || 
    cat.includes('sub') || 
    code.startsWith('SM') || 
    code.startsWith('SFG') || 
    code.startsWith('SEM') || 
    code.startsWith('SF') ||
    name.includes('ruled cut') ||
    name.includes('inner signature') ||
    name.includes('book block')
  ) {
    return 'semi';
  }

  if (
    cat.includes('finish') || 
    cat.includes('product') || 
    code.startsWith('FG')
  ) {
    return 'products';
  }

  if (
    cat.includes('raw') || 
    cat.includes('material') || 
    cat.includes('reel') || 
    cat.includes('paper') ||
    cat.includes('board') ||
    cat.includes('ink') ||
    cat.includes('wire') ||
    code.startsWith('RM')
  ) {
    return 'materials';
  }

  return 'products';
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCompany, user } = useAuth();
  const [dashData, setDashData] = useState<any>(null);
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard(true);

    const interval = setInterval(() => {
      fetchDashboard(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedCompany]);

  const fetchDashboard = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const [res, skusData] = await Promise.all([
        getDashboardStats(selectedCompany?._id),
        selectedCompany?._id ? getSkusV2(selectedCompany._id).catch(() => []) : Promise.resolve([])
      ]);
      setDashData(res.data);
      if (Array.isArray(skusData)) {
        setSkus(skusData);
      }
    } catch (err) {
      console.error('Error fetching dashboard:', err);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const kpiStats = useMemo(() => {
    let totalItemsCount = skus.length;
    let totalStockVal = 0;
    let fgValue = 0;
    let fgQty = 0;
    let rmValue = 0;
    let rmKg = 0;
    let semiValue = 0;
    let semiPcs = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    skus.forEach(sku => {
      const group = getSkuCategoryGroup(sku);
      const stock = Number(sku.presentStock ?? sku.openingStock) || 0;
      const rate = Number((sku as any)?.avgRate || (sku as any)?.purchasePrice || (sku as any)?.ratePerKg || (sku as any)?.rate || 0);
      const val = stock * rate;
      totalStockVal += val;

      if (group === 'products') {
        fgValue += val;
        fgQty += stock;
      } else if (group === 'materials') {
        rmValue += val;
        rmKg += stock;
      } else if (group === 'semi') {
        semiValue += val;
        semiPcs += stock;
      }

      const reorder = Number(sku.reorderLevel) || 10;
      if (stock === 0) {
        outOfStockCount++;
      } else if (stock <= reorder) {
        lowStockCount++;
      }
    });

    return {
      totalItemsCount,
      totalStockVal,
      fgValue,
      fgQty,
      rmValue,
      rmKg,
      semiValue,
      semiPcs,
      lowStockCount,
      outOfStockCount,
      totalAlerts: lowStockCount + outOfStockCount
    };
  }, [skus]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const stats = [
    { title: 'Customers', value: dashData?.stats?.customersCount || 0, icon: Users, color: 'text-blue-600 bg-blue-50', path: '/directory?tab=customers' },
    { title: 'Vendors', value: dashData?.stats?.vendorsCount || 0, icon: Building2, color: 'text-green-600 bg-green-50', path: '/directory?tab=vendors' },
    { title: 'Agents', value: dashData?.stats?.agentsCount || 0, icon: UserCheck, color: 'text-indigo-600 bg-indigo-50', path: '/directory?tab=agents' },
    { title: 'Regions', value: dashData?.stats?.routesCount || 0, icon: Compass, color: 'text-orange-600 bg-orange-50', path: '/directory?tab=regions' },
    { title: 'Markets', value: dashData?.stats?.marketsCount || 0, icon: MapPin, color: 'text-teal-600 bg-teal-50', path: '/directory?tab=cities' },
    { title: 'Transporters', value: dashData?.stats?.transportersCount || 0, icon: Truck, color: 'text-red-600 bg-red-50', path: '/directory?tab=transporters' },
    { title: 'Items', value: kpiStats.totalItemsCount || dashData?.stats?.totalItems || 0, icon: Package, color: 'text-purple-600 bg-purple-50', path: '/stock-inventory' }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'in_production': return 'bg-indigo-100 text-indigo-800';
      case 'ready': return 'bg-green-100 text-green-800';
      case 'dispatched': return 'bg-gray-100 text-gray-800';
      case 'delivered': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6 text-left">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Welcome back, {user?.fullName}
          </h1>
          <p className="text-sm text-gray-500">Here&apos;s what&apos;s happening with {selectedCompany?.companyName || selectedCompany?.name || 'your business'} today.</p>
        </div>
        <button
          onClick={() => fetchDashboard()}
          className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors border border-gray-200 bg-white shadow-2xs flex items-center gap-1.5 font-bold text-xs cursor-pointer"
          title="Refresh Dashboard"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── 6 INVENTORY & STOCK KPI SUMMARY CARDS ── */}
      <div className="mb-8 bg-white rounded-2xl border border-gray-200/80 p-4 shadow-2xs">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          
          {/* Card 1: Total Items */}
          <div 
            onClick={() => navigate('/stock-inventory')}
            className="p-3.5 rounded-2xl border border-gray-200 bg-white hover:border-blue-400 hover:shadow-2xs transition-all cursor-pointer flex flex-col justify-between min-h-[74px]"
          >
            <div className="flex items-center justify-between text-gray-400 text-[10.5px] font-bold uppercase tracking-wider">
              <span className="whitespace-nowrap">Total Items</span>
              <Package className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-base sm:text-lg font-bold text-gray-900 leading-none whitespace-nowrap">
                {kpiStats.totalItemsCount.toLocaleString('en-IN')}
              </span>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60 whitespace-nowrap">
                View All
              </span>
            </div>
          </div>

          {/* Card 2: Total Stock Value */}
          <div 
            onClick={() => navigate('/stock-inventory')}
            className="p-3.5 rounded-2xl border border-gray-200 bg-white hover:border-blue-400 hover:shadow-2xs transition-all cursor-pointer flex flex-col justify-between min-h-[74px]"
          >
            <div className="flex items-center justify-between text-gray-400 text-[10.5px] font-bold uppercase tracking-wider">
              <span className="whitespace-nowrap">Stock Value</span>
              <span className="w-4 h-4 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold font-mono">
                ₹
              </span>
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-base sm:text-lg font-bold text-gray-900 leading-none whitespace-nowrap">
                ₹{kpiStats.totalStockVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
              <span className="text-[10px] font-medium text-gray-500 whitespace-nowrap">
                Live Cost
              </span>
            </div>
          </div>

          {/* Card 3: Finished Goods */}
          <div 
            onClick={() => navigate('/stock-inventory?tab=products')}
            className="p-3.5 rounded-2xl border border-gray-200 bg-white hover:border-blue-400 hover:shadow-2xs transition-all cursor-pointer flex flex-col justify-between min-h-[74px]"
          >
            <div className="flex items-center justify-between text-gray-400 text-[10.5px] font-bold uppercase tracking-wider">
              <span className="whitespace-nowrap">Finished</span>
              <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0"></div>
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-base sm:text-lg font-bold text-gray-900 leading-none whitespace-nowrap">
                ₹{kpiStats.fgValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
              <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60 whitespace-nowrap shrink-0">
                {kpiStats.fgQty.toLocaleString('en-IN')} Pcs
              </span>
            </div>
          </div>

          {/* Card 4: Raw Materials */}
          <div 
            onClick={() => navigate('/stock-inventory?tab=materials')}
            className="p-3.5 rounded-2xl border border-gray-200 bg-white hover:border-amber-400 hover:shadow-2xs transition-all cursor-pointer flex flex-col justify-between min-h-[74px]"
          >
            <div className="flex items-center justify-between text-gray-400 text-[10.5px] font-bold uppercase tracking-wider">
              <span className="whitespace-nowrap">Raw Mat</span>
              <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></div>
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-base sm:text-lg font-bold text-gray-900 leading-none whitespace-nowrap">
                ₹{kpiStats.rmValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
              <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60 whitespace-nowrap shrink-0">
                {kpiStats.rmKg.toLocaleString('en-IN')} KG
              </span>
            </div>
          </div>

          {/* Card 5: Semi Finished */}
          <div 
            onClick={() => navigate('/stock-inventory?tab=semi')}
            className="p-3.5 rounded-2xl border border-gray-200 bg-white hover:border-purple-400 hover:shadow-2xs transition-all cursor-pointer flex flex-col justify-between min-h-[74px]"
          >
            <div className="flex items-center justify-between text-gray-400 text-[10.5px] font-bold uppercase tracking-wider">
              <span className="whitespace-nowrap">Semi Fin</span>
              <div className="w-2 h-2 rounded-full bg-purple-500 shrink-0"></div>
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-base sm:text-lg font-bold text-gray-900 leading-none whitespace-nowrap">
                ₹{kpiStats.semiValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
              <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200/60 whitespace-nowrap shrink-0">
                {kpiStats.semiPcs.toLocaleString('en-IN')} Pcs
              </span>
            </div>
          </div>

          {/* Card 6: Stock Alerts */}
          <div 
            onClick={() => navigate('/stock-inventory?status=LOW_STOCK')}
            className="p-3.5 rounded-2xl border border-rose-200 bg-white hover:border-rose-400 hover:shadow-2xs transition-all cursor-pointer flex flex-col justify-between min-h-[74px]"
          >
            <div className="flex items-center justify-between text-gray-400 text-[10.5px] font-bold uppercase tracking-wider">
              <span className="whitespace-nowrap">Stock Alerts</span>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <span className="text-base sm:text-lg font-bold text-rose-600 leading-none whitespace-nowrap">
                {kpiStats.lowStockCount}
              </span>
              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200/60 whitespace-nowrap shrink-0">
                {kpiStats.outOfStockCount} out
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* At a Glance Grid */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">At a Glance</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, index) => {
            const borderColors = [
              'border-l-blue-500',
              'border-l-green-500',
              'border-l-indigo-500',
              'border-l-orange-500',
              'border-l-teal-500',
              'border-l-red-500',
              'border-l-purple-500',
              'border-l-pink-500'
            ];
            const textHoverColors = [
              'group-hover:text-blue-500',
              'group-hover:text-green-500',
              'group-hover:text-indigo-500',
              'group-hover:text-orange-500',
              'group-hover:text-teal-500',
              'group-hover:text-red-500',
              'group-hover:text-purple-500',
              'group-hover:text-pink-500'
            ];
            return (
              <div 
                key={index} 
                onClick={() => stat.path && navigate(stat.path)}
                className={`w-full text-left rounded-xl shadow-xs border p-3 border-l-4 ${borderColors[index]} bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer select-none group`}
              >
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wider text-gray-400 ${textHoverColors[index]} transition-colors`}>{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-0.5">{stat.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900">Recent Orders</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {dashData?.recentOrders?.length > 0 ? (
                dashData.recentOrders.map((order: any) => (
                  <div key={order._id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">{order.orderNumber}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                          {order.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">{order.customerName}</p>
                      <p className="text-sm text-gray-500 truncate">{order.items}</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-semibold text-gray-900">₹{order.total?.toLocaleString()}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">No recent orders</p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => navigate('/sales/quotes')} className="p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-left">
                <FileText className="w-8 h-8 text-blue-600 mb-2" />
                <h3 className="font-semibold text-gray-900 mb-1">New Quote</h3>
                <p className="text-sm text-gray-600">Create a new sales quote</p>
              </button>
              
              <button onClick={() => navigate('/sales/orders')} className="p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors text-left">
                <ShoppingCart className="w-8 h-8 text-green-600 mb-2" />
                <h3 className="font-semibold text-gray-900 mb-1">New Order</h3>
                <p className="text-sm text-gray-600">Create a new sales order</p>
              </button>
              
              <button onClick={() => navigate('/inventory-v2/skus')} className="p-4 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors text-left">
                <Package className="w-8 h-8 text-purple-600 mb-2" />
                <h3 className="font-semibold text-gray-900 mb-1">Add Item</h3>
                <p className="text-sm text-gray-600">Add new product/SKU</p>
              </button>
              
              <button onClick={() => navigate('/directory?tab=customers')} className="p-4 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors text-left">
                <Users className="w-8 h-8 text-orange-600 mb-2" />
                <h3 className="font-semibold text-gray-900 mb-1">Add Customer</h3>
                <p className="text-sm text-gray-600">Add new customer</p>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Production Overview */}
      <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">Production Overview</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-yellow-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">{dashData?.production?.inQueue || 0}</h3>
              <p className="text-gray-600">Orders in Queue</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">{dashData?.production?.inProduction || 0}</h3>
              <p className="text-gray-600">In Production</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">{dashData?.production?.completedToday || 0}</h3>
              <p className="text-gray-600">Completed Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Inventory Overview */}
      {dashData?.inventory && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900">Inventory Overview</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-blue-600 mb-1">Total Quantity</p>
                <p className="text-2xl font-bold text-blue-900">{dashData.inventory.totalQuantity?.toLocaleString() || 0}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-green-600 mb-1">Total Value</p>
                <p className="text-2xl font-bold text-green-900">₹{(dashData.inventory.totalValue || 0).toLocaleString()}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4">
                <p className="text-sm text-amber-600 mb-1">Low Stock</p>
                <p className="text-2xl font-bold text-amber-900">{dashData.inventory.lowStockCount || 0}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <p className="text-sm text-red-600 mb-1">Out of Stock</p>
                <p className="text-2xl font-bold text-red-900">{dashData.inventory.outOfStockCount || 0}</p>
              </div>
            </div>

            {/* Recent Movements */}
            {dashData.inventory.recentMovements?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Stock Movements</h3>
                <div className="space-y-2">
                  {dashData.inventory.recentMovements.map((m: any) => (
                    <div key={m._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          m.movement_type === 'IN' ? 'bg-green-100 text-green-700' :
                          m.movement_type === 'OUT' ? 'bg-red-100 text-red-700' :
                          m.movement_type === 'TRANSFER' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{m.movement_type}</span>
                        <span className="text-sm text-gray-900">{m.item?.name || 'Unknown'}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700">{m.quantity > 0 ? '+' : ''}{m.quantity}</span>
                        <span className="text-xs text-gray-400">{new Date(m.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
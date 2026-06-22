import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Package, 
  ShoppingCart, 
  FileText, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  Clock,
  Building2,
  UserCheck,
  Compass,
  MapPin,
  Truck,
  Tag,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getDashboardStats } from '../api/dashboardApi';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCompany, user } = useAuth();
  const [dashData, setDashData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedCompany?._id) {
      fetchDashboard();
    }
  }, [selectedCompany]);

  const fetchDashboard = async () => {
    if (!selectedCompany?._id) return;
    try {
      setLoading(true);
      const res = await getDashboardStats(selectedCompany._id);
      setDashData(res.data);
    } catch (err) {
      console.error('Error fetching dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${amount.toFixed(0)}`;
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const stats = [
    { title: 'Customers', value: dashData?.stats?.customersCount || 0, icon: Users, color: 'text-blue-600 bg-blue-50', path: '/party/customers' },
    { title: 'Vendors', value: dashData?.stats?.vendorsCount || 0, icon: Building2, color: 'text-green-600 bg-green-50', path: '/party/vendors' },
    { title: 'Agents', value: dashData?.stats?.agentsCount || 0, icon: UserCheck, color: 'text-indigo-600 bg-indigo-50', path: '/party/agents' },
    { title: 'Regions', value: dashData?.stats?.routesCount || 0, icon: Compass, color: 'text-orange-600 bg-orange-50', path: '/party/routes' },
    { title: 'Markets', value: dashData?.stats?.marketsCount || 0, icon: MapPin, color: 'text-teal-600 bg-teal-50', path: '/party/markets' },
    { title: 'Transporters', value: dashData?.stats?.transportersCount || 0, icon: Truck, color: 'text-red-600 bg-red-50', path: '/party/transporters' },
    { title: 'Items', value: dashData?.stats?.totalItems || 0, icon: Package, color: 'text-purple-600 bg-purple-50', path: '/items' },
    { title: 'Brands', value: 4, icon: Tag, color: 'text-pink-600 bg-pink-50', path: '/items' }
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
    <div className="p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back, {user?.fullName}
          </h1>
          <p className="text-sm text-gray-500">Here's what's happening with {selectedCompany?.name || 'your business'} today.</p>
        </div>
        <button
          onClick={fetchDashboard}
          className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 bg-white shadow-sm flex items-center gap-1.5 font-medium text-sm"
          title="Refresh Dashboard"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* At a Glance Grid */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">At a Glance</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <div 
              key={index} 
              onClick={() => stat.path && navigate(stat.path)}
              className="bg-white rounded-xl shadow-sm p-5 border border-gray-100 hover:shadow-md hover:border-blue-100 transition-all cursor-pointer flex items-center space-x-4"
            >
              <div className={`${stat.color} p-3 rounded-xl`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-500 font-medium">{stat.title}</p>
              </div>
            </div>
          ))}
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
              
              <button onClick={() => navigate('/items')} className="p-4 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors text-left">
                <Package className="w-8 h-8 text-purple-600 mb-2" />
                <h3 className="font-semibold text-gray-900 mb-1">Add Item</h3>
                <p className="text-sm text-gray-600">Add new product/SKU</p>
              </button>
              
              <button onClick={() => navigate('/party')} className="p-4 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors text-left">
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
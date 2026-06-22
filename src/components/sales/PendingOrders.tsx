import React, { useState, useEffect } from 'react';
import { Search, Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getPendingOrders, updateSalesOrderStatus } from '../../api/salesOrderApi';

const PendingOrders: React.FC = () => {
  const { selectedCompany, hasPermission } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const canManage = hasPermission('MANAGE_ORDERS');

  useEffect(() => { fetchOrders(); }, [selectedCompany]);

  const fetchOrders = async () => {
    try {
      const res = await getPendingOrders(selectedCompany?._id);
      setOrders(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try { await updateSalesOrderStatus(id, status); await fetchOrders(); }
    catch (err) { console.error(err); }
  };

  const filtered = orders.filter(o =>
    o.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusIcon = (s: string) => {
    switch (s) {
      case 'pending': return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'confirmed': return <AlertCircle className="w-5 h-5 text-blue-500" />;
      case 'in_production': return <AlertCircle className="w-5 h-5 text-indigo-500" />;
      default: return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
  };

  const getStatusColor = (s: string) => {
    const m: any = { pending: 'bg-yellow-100 text-yellow-800', confirmed: 'bg-blue-100 text-blue-800', in_production: 'bg-indigo-100 text-indigo-800' };
    return m[s] || 'bg-gray-100 text-gray-800';
  };

  if (loading) return <div className="p-6 flex justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="p-6">
      <div className="mb-6"><h1 className="text-3xl font-bold text-gray-900 mb-2">Pending Orders</h1><p className="text-gray-600">Track and manage pending orders</p></div>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex items-center space-x-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder="Search pending orders..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg" />
          </div>
          <button onClick={fetchOrders} className="p-2 text-gray-600 hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors bg-white shadow-sm" title="Refresh page"><RefreshCw className="w-4 h-4" /></button>
          <div className="text-sm text-gray-600 bg-yellow-50 px-4 py-2 rounded-lg font-medium">{filtered.length} pending</div>
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map((order) => (
          <div key={order._id} className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                {getStatusIcon(order.status)}
                <div>
                  <h3 className="font-semibold text-gray-900">{order.orderNumber}</h3>
                  <p className="text-sm text-gray-500">{order.customerName}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>{order.status?.replace('_', ' ')}</span>
                <span className="font-semibold text-gray-900">₹{order.total?.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                <span>Order Date: {new Date(order.date).toLocaleDateString()}</span>
                {order.deliveryDate && <span className="ml-4">Delivery: {new Date(order.deliveryDate).toLocaleDateString()}</span>}
              </div>
              {canManage && (
                <div className="flex space-x-2">
                  {order.status === 'pending' && <button onClick={() => handleStatusUpdate(order._id, 'confirmed')} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Confirm</button>}
                  {order.status === 'confirmed' && <button onClick={() => handleStatusUpdate(order._id, 'in_production')} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700">Start Production</button>}
                  {order.status === 'in_production' && <button onClick={() => handleStatusUpdate(order._id, 'ready')} className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">Mark Ready</button>}
                </div>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center py-12 text-gray-500"><CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-300" /><p>No pending orders!</p></div>}
      </div>
    </div>
  );
};

export default PendingOrders;
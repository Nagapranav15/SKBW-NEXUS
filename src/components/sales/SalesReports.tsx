import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, FileText, ShoppingCart, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSalesReport } from '../../api/dashboardApi';

const SalesReports: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [reportData, setReportData] = useState<any>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchReport(); }, [selectedCompany]);

  const fetchReport = async () => {
    try {
      const res = await getSalesReport(selectedCompany?._id, startDate || undefined, endDate || undefined);
      setReportData(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleFilter = () => { setLoading(true); fetchReport(); };

  const getStatusColor = (s: string) => {
    const m: any = { pending: 'bg-yellow-100 text-yellow-800', confirmed: 'bg-blue-100 text-blue-800', in_production: 'bg-indigo-100 text-indigo-800', ready: 'bg-green-100 text-green-800', dispatched: 'bg-gray-100 text-gray-800', delivered: 'bg-emerald-100 text-emerald-800', cancelled: 'bg-red-100 text-red-800' };
    return m[s] || 'bg-gray-100 text-gray-800';
  };

  if (loading) return <div className="p-6 flex justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="p-6">
      <div className="mb-6"><h1 className="text-3xl font-bold text-gray-900 mb-2">Sales Reports</h1><p className="text-gray-600">View sales analytics and reports</p></div>

      {/* Date Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row items-end space-y-4 md:space-y-0 md:space-x-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" /></div>
          <button onClick={handleFilter} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Apply Filter</button>
          <button onClick={fetchReport} className="p-2.5 text-gray-600 hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors bg-white shadow-sm" title="Refresh report"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-600 mb-1">Total Orders</p><p className="text-2xl font-bold text-gray-900">{reportData?.summary?.totalOrders || 0}</p></div>
            <div className="bg-blue-500 p-3 rounded-lg"><ShoppingCart className="w-6 h-6 text-white" /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-600 mb-1">Total Sales</p><p className="text-2xl font-bold text-gray-900">₹{(reportData?.summary?.totalSales || 0).toLocaleString()}</p></div>
            <div className="bg-green-500 p-3 rounded-lg"><TrendingUp className="w-6 h-6 text-white" /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-600 mb-1">Total Quotes</p><p className="text-2xl font-bold text-gray-900">{reportData?.summary?.totalQuotes || 0}</p></div>
            <div className="bg-purple-500 p-3 rounded-lg"><FileText className="w-6 h-6 text-white" /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-600 mb-1">Conversion Rate</p><p className="text-2xl font-bold text-gray-900">{reportData?.summary?.conversionRate || 0}%</p></div>
            <div className="bg-orange-500 p-3 rounded-lg"><BarChart3 className="w-6 h-6 text-white" /></div>
          </div>
        </div>
      </div>

      {/* Status Breakdown */}
      {reportData?.summary?.statusBreakdown && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
          <div className="p-6 border-b border-gray-100"><h2 className="text-xl font-semibold text-gray-900">Order Status Breakdown</h2></div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(reportData.summary.statusBreakdown).map(([status, count]: any) => (
                <div key={status} className="text-center p-4 bg-gray-50 rounded-lg">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>{status.replace('_', ' ')}</span>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{count}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Orders Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100"><h2 className="text-xl font-semibold text-gray-900">Order Details</h2></div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-200">
              {reportData?.orders?.map((order: any) => (
                <tr key={order._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{order.orderNumber}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{order.customerName}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(order.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">₹{order.total?.toLocaleString()}</td>
                  <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>{order.status?.replace('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!reportData?.orders || reportData.orders.length === 0) && <div className="text-center py-8 text-gray-500">No order data available</div>}
        </div>
      </div>
    </div>
  );
};

export default SalesReports;
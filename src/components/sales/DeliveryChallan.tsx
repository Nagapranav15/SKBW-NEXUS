import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getDeliveryChallans, createDeliveryChallan, updateDeliveryChallan, deleteDeliveryChallan } from '../../api/deliveryChallanApi';
import { getSalesOrders } from '../../api/salesOrderApi';

const DeliveryChallan: React.FC = () => {
  const { selectedCompany, hasPermission } = useAuth();
  const [challans, setChallans] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingChallan, setEditingChallan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const canManage = hasPermission('MANAGE_DELIVERY');

  const [formData, setFormData] = useState({
    orderId: '', orderNumber: '', customerName: '', date: new Date().toISOString().split('T')[0],
    transporterName: '', vehicleNumber: '', items: [] as any[], notes: ''
  });

  useEffect(() => { fetchData(); }, [selectedCompany]);

  const fetchData = async () => {
    try {
      const [challansRes, ordersRes] = await Promise.all([
        getDeliveryChallans(selectedCompany?._id),
        getSalesOrders(selectedCompany?._id, 'ready')
      ]);
      setChallans(challansRes.data);
      setOrders(ordersRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const generateDCNumber = () => `DC-${new Date().getFullYear()}-${(challans.length + 1).toString().padStart(4, '0')}`;

  const handleOrderSelect = (orderId: string) => {
    const order = orders.find((o: any) => o._id === orderId);
    if (order) {
      setFormData(prev => ({
        ...prev, orderId, orderNumber: order.orderNumber, customerName: order.customerName,
        items: order.items.map((i: any) => ({ ...i, orderedQty: i.quantity, deliveredQty: i.quantity }))
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const subtotal = formData.items.reduce((s: number, i: any) => s + (i.deliveredQty * i.price), 0);
    const tax = subtotal * 0.18;
    try {
      if (editingChallan) {
        await updateDeliveryChallan(editingChallan._id, { ...formData, subtotal, tax, total: subtotal + tax, company: selectedCompany?._id });
      } else {
        await createDeliveryChallan({ ...formData, dcNumber: generateDCNumber(), subtotal, tax, total: subtotal + tax, status: 'draft', company: selectedCompany?._id });
      }
      await fetchData(); resetForm();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => { if (window.confirm('Delete this challan?')) { await deleteDeliveryChallan(id); await fetchData(); } };
  const resetForm = () => { setFormData({ orderId: '', orderNumber: '', customerName: '', date: new Date().toISOString().split('T')[0], transporterName: '', vehicleNumber: '', items: [], notes: '' }); setEditingChallan(null); setShowForm(false); };

  const getStatusColor = (s: string) => {
    const m: any = { draft: 'bg-gray-100 text-gray-800', ready: 'bg-green-100 text-green-800', dispatched: 'bg-blue-100 text-blue-800', delivered: 'bg-emerald-100 text-emerald-800' };
    return m[s] || 'bg-gray-100 text-gray-800';
  };

  const filtered = challans.filter(c => {
    const lowerSearch = searchTerm.toLowerCase();
    return (
      (c.dcNumber || '').toLowerCase().includes(lowerSearch) ||
      (c.customerName || '').toLowerCase().includes(lowerSearch) ||
      (c.orderNumber || '').toLowerCase().includes(lowerSearch) ||
      (c.transporterName || '').toLowerCase().includes(lowerSearch) ||
      (c.vehicleNumber || '').toLowerCase().includes(lowerSearch) ||
      (c.status || '').toLowerCase().includes(lowerSearch) ||
      String(c.total || '').toLowerCase().includes(lowerSearch) ||
      (c.items || []).some((item: any) =>
        (item.itemName || '').toLowerCase().includes(lowerSearch) ||
        (item.itemId || '').toLowerCase().includes(lowerSearch)
      )
    );
  });

  if (loading) return <div className="p-6 flex justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="p-6">
      <div className="mb-6"><h1 className="text-3xl font-bold text-gray-900 mb-2">Delivery Challans</h1><p className="text-gray-600">Manage delivery challans</p></div>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder="Search challans..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={fetchData} className="p-2 text-gray-600 hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors bg-white shadow-sm" title="Refresh page"><RefreshCw className="w-4 h-4" /></button>
            {canManage && <button onClick={() => setShowForm(true)} className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"><Plus className="w-4 h-4" /><span>New Challan</span></button>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">DC Details</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transport</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr></thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.map((dc) => (
                <tr key={dc._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4"><div className="text-[13.5px] font-medium text-gray-900">{dc.dcNumber}</div><div className="text-[13.5px] text-gray-500">Order: {dc.orderNumber}</div><div className="text-[13.5px] text-gray-500">{new Date(dc.date).toLocaleDateString()}</div></td>
                  <td className="px-6 py-4 text-[13.5px] text-gray-900">{dc.customerName}</td>
                  <td className="px-6 py-4"><div className="text-[13.5px] text-gray-900">{dc.transporterName || 'N/A'}</div><div className="text-[13.5px] text-gray-500">{dc.vehicleNumber || 'N/A'}</div></td>
                  <td className="px-6 py-4 text-[13.5px] font-medium text-gray-900">₹{dc.total?.toFixed(2)}</td>
                  <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(dc.status)}`}>{dc.status}</span></td>
                  <td className="px-6 py-4">
                    {canManage && <div className="flex space-x-2">
                      <button onClick={() => { setEditingChallan(dc); setFormData({ orderId: dc.orderId, orderNumber: dc.orderNumber, customerName: dc.customerName, date: dc.date, transporterName: dc.transporterName, vehicleNumber: dc.vehicleNumber, items: dc.items, notes: dc.notes }); setShowForm(true); }} className="text-blue-600 hover:text-blue-900"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(dc._id)} className="text-red-600 hover:text-red-900"><Trash2 className="w-4 h-4" /></button>
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="text-center py-8 text-gray-500">No delivery challans found</div>}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">{editingChallan ? 'Edit Challan' : 'Create Delivery Challan'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingChallan && <div><label className="block text-sm font-medium text-gray-700 mb-2">Select Order *</label>
                <select value={formData.orderId} onChange={(e) => handleOrderSelect(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
                  <option value="">Select Order</option>
                  {orders.map((o: any) => <option key={o._id} value={o._id}>{o.orderNumber} - {o.customerName}</option>)}
                </select></div>}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
                  <input type="date" value={formData.date} onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-2">Transporter</label>
                  <input type="text" value={formData.transporterName} onChange={(e) => setFormData(p => ({ ...p, transporterName: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Number</label>
                  <input type="text" value={formData.vehicleNumber} onChange={(e) => setFormData(p => ({ ...p, vehicleNumber: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
              </div>
              {formData.items.length > 0 && <div className="bg-gray-50 rounded-lg p-4"><h3 className="font-medium mb-2">Items</h3>
                {formData.items.map((item: any, i: number) => <div key={i} className="flex justify-between py-1 text-sm"><span>{item.itemName}</span><span>Qty: {item.deliveredQty || item.quantity}</span></div>)}</div>}
              <div><label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" rows={2} /></div>
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg">{editingChallan ? 'Update' : 'Create'}</button>
                <button type="button" onClick={resetForm} className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-lg">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryChallan;
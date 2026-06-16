import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSalesOrders, createSalesOrder, updateSalesOrder, deleteSalesOrder, updateSalesOrderStatus } from '../../api/salesOrderApi';
import { getParties } from '../../api/partyApi';
import { getItems } from '../../api/itemApi';

interface OrderItem { itemId: string; itemName: string; quantity: number; price: number; total: number; }
interface SalesOrder {
  _id: string; orderNumber: string; customerId: string; customerName: string;
  date: string; deliveryDate: string; items: OrderItem[];
  subtotal: number; tax: number; total: number;
  status: string; notes: string; createdAt: string;
  payment_mode?: string; payment_reference_id?: string; payment_status?: string; payment_notes?: string;
}

const PAYMENT_MODES = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
];

const getRefLabel = (mode: string) => {
  switch (mode) {
    case 'upi': return 'UTR Number';
    case 'cheque': return 'Cheque Number';
    case 'bank_transfer': return 'Reference Number';
    case 'cash': return 'Notes (optional)';
    default: return 'Reference ID';
  }
};

const isRefRequired = (mode: string) => mode !== 'cash';

const SalesOrders: React.FC = () => {
  const { selectedCompany, hasPermission } = useAuth();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<SalesOrder[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [customers, setCustomers] = useState<any[]>([]);
  const [itemsList, setItemsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const canCreate = hasPermission(['MANAGE_ORDERS', 'CREATE_ORDERS']);
  const canManage = hasPermission('MANAGE_ORDERS');

  const [formData, setFormData] = useState({
    customerId: '', date: new Date().toISOString().split('T')[0],
    deliveryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    items: [{ itemId: '', itemName: '', quantity: 1, price: 0, total: 0 }] as OrderItem[],
    notes: '', tax: 18,
    payment_mode: 'cash', payment_reference_id: '', payment_status: 'pending', payment_notes: ''
  });

  useEffect(() => { fetchData(); }, [selectedCompany]);

  useEffect(() => {
    let filtered = orders;
    if (searchTerm) filtered = filtered.filter(o => o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) || o.customerName.toLowerCase().includes(searchTerm.toLowerCase()));
    if (filterStatus !== 'all') filtered = filtered.filter(o => o.status === filterStatus);
    setFilteredOrders(filtered);
  }, [orders, searchTerm, filterStatus]);

  const fetchData = async () => {
    try {
      const [ordersRes, partiesRes, itemsRes] = await Promise.all([
        getSalesOrders(selectedCompany?._id),
        getParties({ company: selectedCompany?._id, type: 'customer', limit: 1000 }),
        getItems(selectedCompany?._id)
      ]);
      setOrders(ordersRes.data);
      setCustomers(partiesRes.data.parties || []);
      setItemsList(itemsRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const generateOrderNumber = () => `SO-${new Date().getFullYear()}-${(orders.length + 1).toString().padStart(4, '0')}`;

  const calculateTotals = (items: OrderItem[], taxRate: number) => {
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const tax = (subtotal * taxRate) / 100;
    return { subtotal, tax, total: subtotal + tax };
  };

  const handleItemChange = (index: number, field: keyof OrderItem, value: any) => {
    const updated = [...formData.items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'itemId') {
      const sel = itemsList.find((i: any) => i._id === value);
      if (sel) { updated[index].itemName = sel.name; updated[index].price = sel.price; updated[index].total = updated[index].quantity * sel.price; }
    }
    if (field === 'quantity' || field === 'price') updated[index].total = updated[index].quantity * updated[index].price;
    setFormData(prev => ({ ...prev, items: updated }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validation
    if (isRefRequired(formData.payment_mode) && !formData.payment_reference_id.trim()) {
      alert(`${getRefLabel(formData.payment_mode)} is required for ${PAYMENT_MODES.find(m => m.value === formData.payment_mode)?.label} payments`);
      return;
    }
    const { subtotal, tax, total } = calculateTotals(formData.items, formData.tax);
    if (total <= 0) { alert('Total amount must be > 0'); return; }
    const customer = customers.find((c: any) => c._id === formData.customerId);
    try {
      if (editingOrder) {
        await updateSalesOrder(editingOrder._id, { ...formData, subtotal, tax, total, customerName: customer?.firmName || customer?.contactName || '', company: selectedCompany?._id });
      } else {
        await createSalesOrder({ ...formData, orderNumber: generateOrderNumber(), customerName: customer?.firmName || customer?.contactName || '', subtotal, tax, total, status: 'pending', company: selectedCompany?._id });
      }
      await fetchData(); resetForm();
    } catch (err: any) {
      console.error(err);
      const data = err.response?.data;
      if (data?.stockErrors && data.stockErrors.length > 0) {
        const errorLines = data.stockErrors.map((e: any) => 
          `• ${e.itemName}: requested ${e.requested}, available ${e.available} (${e.reason})`
        ).join('\n');
        alert(`Insufficient stock:\n${errorLines}`);
      } else {
        alert(data?.msg || 'Error saving order. Please try again.');
      }
    }
  };

  const handleEdit = (order: SalesOrder) => {
    setEditingOrder(order);
    setFormData({
      customerId: order.customerId, date: order.date, deliveryDate: order.deliveryDate,
      items: order.items, notes: order.notes,
      tax: order.subtotal > 0 ? (order.tax / order.subtotal) * 100 : 18,
      payment_mode: order.payment_mode || 'cash',
      payment_reference_id: order.payment_reference_id || '',
      payment_status: order.payment_status || 'pending',
      payment_notes: order.payment_notes || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => { if (window.confirm('Delete this order?')) { await deleteSalesOrder(id); await fetchData(); } };
  const handleStatusUpdate = async (id: string, status: string) => { await updateSalesOrderStatus(id, status); await fetchData(); };
  const resetForm = () => {
    setFormData({
      customerId: '', date: new Date().toISOString().split('T')[0],
      deliveryDate: new Date(Date.now() + 14*24*60*60*1000).toISOString().split('T')[0],
      items: [{ itemId: '', itemName: '', quantity: 1, price: 0, total: 0 }],
      notes: '', tax: 18,
      payment_mode: 'cash', payment_reference_id: '', payment_status: 'pending', payment_notes: ''
    });
    setEditingOrder(null); setShowForm(false);
  };

  const getStatusColor = (s: string) => {
    const m: any = { pending: 'bg-yellow-100 text-yellow-800', confirmed: 'bg-blue-100 text-blue-800', in_production: 'bg-indigo-100 text-indigo-800', ready: 'bg-green-100 text-green-800', dispatched: 'bg-gray-100 text-gray-800', delivered: 'bg-emerald-100 text-emerald-800', cancelled: 'bg-red-100 text-red-800' };
    return m[s] || 'bg-gray-100 text-gray-800';
  };

  const getPaymentBadge = (mode?: string) => {
    if (!mode) return null;
    const colors: any = { upi: 'bg-purple-100 text-purple-700', cash: 'bg-green-100 text-green-700', bank_transfer: 'bg-indigo-100 text-indigo-700', cheque: 'bg-orange-100 text-orange-700' };
    const label = PAYMENT_MODES.find(m => m.value === mode)?.label || mode;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[mode] || 'bg-gray-100 text-gray-700'}`}>{label}</span>;
  };

  if (loading) return <div className="p-6 flex justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="p-6">
      <div className="mb-6"><h1 className="text-2xl font-bold text-gray-900 mb-2">Sales Orders</h1><p className="text-sm text-gray-500">Manage sales orders</p></div>

      <div className="bg-white rounded-xl border p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input type="text" placeholder="Search orders..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg">
              <option value="all">All Status</option>
              <option value="pending">Pending</option><option value="confirmed">Confirmed</option>
              <option value="in_production">In Production</option><option value="ready">Ready</option>
              <option value="dispatched">Dispatched</option><option value="delivered">Delivered</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={fetchData} className="p-2 text-gray-600 hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors bg-white shadow-sm" title="Refresh page"><RefreshCw className="w-4 h-4" /></button>
            {canCreate && <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><Plus className="w-4 h-4" /> New Order</button>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order Details</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr></thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order) => (
                <tr key={order._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{order.orderNumber}</div>
                    <div className="text-sm text-gray-500">Date: {new Date(order.date).toLocaleDateString()}</div>
                    <div className="text-sm text-gray-500">Delivery: {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{order.customerName}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">₹{order.total?.toFixed(2)}</div>
                    <div className="text-sm text-gray-500">{order.items?.length} items</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-1">
                      {getPaymentBadge(order.payment_mode)}
                      {order.payment_status && <div><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${order.payment_status === 'paid' ? 'bg-green-100 text-green-700' : order.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{order.payment_status}</span></div>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {canManage ? (
                      <select value={order.status} onChange={(e) => handleStatusUpdate(order._id, e.target.value)} className={`text-xs font-semibold rounded-full px-2 py-1 border-0 ${getStatusColor(order.status)}`}>
                        <option value="pending">Pending</option><option value="confirmed">Confirmed</option>
                        <option value="in_production">In Production</option><option value="ready">Ready</option>
                        <option value="dispatched">Dispatched</option><option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    ) : <span className={`text-xs font-semibold rounded-full px-2 py-1 ${getStatusColor(order.status)}`}>{order.status.replace('_', ' ')}</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      {canManage && <button onClick={() => handleEdit(order)} className="text-blue-600 hover:text-blue-900"><Edit className="w-4 h-4" /></button>}
                      {canManage && <button onClick={() => handleDelete(order._id)} className="text-red-600 hover:text-red-900"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredOrders.length === 0 && <div className="text-center py-8 text-gray-500">No orders found</div>}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">{editingOrder ? 'Edit Order' : 'Create New Order'}</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-2">Customer *</label>
                  <select value={formData.customerId} onChange={(e) => setFormData(p => ({ ...p, customerId: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
                    <option value="">Select Customer</option>
                    {customers.map((c: any) => <option key={c._id} value={c._id}>{c.firmName || c.contactName}</option>)}
                  </select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-2">Order Date *</label>
                  <input type="date" value={formData.date} onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-2">Delivery Date</label>
                  <input type="date" value={formData.deliveryDate} onChange={(e) => setFormData(p => ({ ...p, deliveryDate: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-2">Tax Rate (%)</label>
                  <input type="number" step="0.01" value={formData.tax} onChange={(e) => setFormData(p => ({ ...p, tax: parseFloat(e.target.value) || 0 }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">Items</h3>
                  <button type="button" onClick={() => setFormData(p => ({ ...p, items: [...p.items, { itemId: '', itemName: '', quantity: 1, price: 0, total: 0 }] }))} className="flex items-center space-x-2 px-3 py-1 bg-blue-600 text-white rounded-lg text-sm"><Plus className="w-4 h-4" /><span>Add</span></button></div>
                {formData.items.map((item, i) => (
                  <div key={i} className="p-4 bg-gray-50 rounded-lg mb-2">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      <div><select value={item.itemId} onChange={(e) => handleItemChange(i, 'itemId', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required>
                        <option value="">Select Item</option>{itemsList.map((it: any) => <option key={it._id} value={it._id}>{it.name}</option>)}
                      </select></div>
                      <div><input type="number" value={item.quantity} onChange={(e) => handleItemChange(i, 'quantity', parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" min="1" required /></div>
                      <div><input type="number" step="0.01" value={item.price} onChange={(e) => handleItemChange(i, 'price', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required /></div>
                      <div><input type="number" value={item.total.toFixed(2)} readOnly className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm" /></div>
                      <div><button type="button" onClick={() => setFormData(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }))} className="w-full px-3 py-2 bg-red-600 text-white rounded-lg text-sm" disabled={formData.items.length === 1}>Remove</button></div>
                    </div>
                    {item.itemId && (() => {
                      const found = itemsList.find((it: any) => it._id === item.itemId);
                      if (!found) return null;
                      const isLow = found.stock < item.quantity;
                      return (
                        <div className={`mt-2 text-xs flex items-center gap-2 ${isLow ? 'text-red-600' : 'text-green-600'}`}>
                          <span className={`inline-block w-2 h-2 rounded-full ${isLow ? 'bg-red-500' : 'bg-green-500'}`}></span>
                          Stock: {found.stock} {found.primaryUnit || 'units'}
                          {isLow && <span className="font-semibold">(Insufficient — need {item.quantity})</span>}
                        </div>
                      );
                    })()}
                  </div>
                ))}
                <div className="mt-4 p-4 bg-gray-50 rounded-lg"><div className="flex justify-end space-x-8">
                  <div className="text-right"><div className="text-sm text-gray-600">Subtotal:</div><div className="text-sm text-gray-600">Tax ({formData.tax}%):</div><div className="text-lg font-semibold">Total:</div></div>
                  <div className="text-right"><div className="text-sm">₹{calculateTotals(formData.items, formData.tax).subtotal.toFixed(2)}</div><div className="text-sm">₹{calculateTotals(formData.items, formData.tax).tax.toFixed(2)}</div><div className="text-lg font-semibold">₹{calculateTotals(formData.items, formData.tax).total.toFixed(2)}</div></div>
                </div></div>
              </div>

              {/* Payment Details Section */}
              <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                  Payment Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode *</label>
                    <select value={formData.payment_mode} onChange={(e) => setFormData(p => ({ ...p, payment_mode: e.target.value, payment_reference_id: '' }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required>
                      {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {getRefLabel(formData.payment_mode)} {isRefRequired(formData.payment_mode) && '*'}
                    </label>
                    <input
                      value={formData.payment_reference_id}
                      onChange={(e) => setFormData(p => ({ ...p, payment_reference_id: e.target.value }))}
                      placeholder={getRefLabel(formData.payment_mode)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      required={isRefRequired(formData.payment_mode)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                    <select value={formData.payment_status} onChange={(e) => setFormData(p => ({ ...p, payment_status: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="paid">Paid</option><option value="pending">Pending</option><option value="partial">Partial</option>
                    </select>
                  </div>
                </div>
              </div>

              <div><label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" rows={3} /></div>
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg">{editingOrder ? 'Update Order' : 'Create Order'}</button>
                <button type="button" onClick={resetForm} className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-lg">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesOrders;
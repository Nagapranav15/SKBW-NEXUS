import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getQuotes, createQuote, updateQuote, deleteQuote, updateQuoteStatus } from '../../api/quoteApi';
import { getParties } from '../../api/partyApi';
import { getItems } from '../../api/itemApi';

interface QuoteItem {
  itemId: string;
  itemName: string;
  quantity: number;
  price: number;
  total: number;
}

interface Quote {
  _id: string;
  quoteNumber: string;
  customerId: string;
  customerName: string;
  date: string;
  validUntil: string;
  items: QuoteItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  notes: string;
  createdAt: string;
}

const SalesQuotes: React.FC = () => {
  const { selectedCompany, hasPermission } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [filteredQuotes, setFilteredQuotes] = useState<Quote[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [customers, setCustomers] = useState<any[]>([]);
  const [itemsList, setItemsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const canCreate = hasPermission(['MANAGE_QUOTES', 'CREATE_QUOTES']);
  const canManage = hasPermission('MANAGE_QUOTES');

  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    date: new Date().toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    items: [{ itemId: '', itemName: '', quantity: 1, price: 0, total: 0 }] as QuoteItem[],
    notes: '',
    tax: 18
  });

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  useEffect(() => {
    let filtered = quotes;
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(q =>
        (q.quoteNumber || '').toLowerCase().includes(lowerSearch) ||
        (q.customerName || '').toLowerCase().includes(lowerSearch) ||
        (q.status || '').toLowerCase().includes(lowerSearch) ||
        String(q.total || '').toLowerCase().includes(lowerSearch) ||
        (q.items || []).some((item: any) =>
          (item.itemName || '').toLowerCase().includes(lowerSearch) ||
          (item.itemId || '').toLowerCase().includes(lowerSearch)
        )
      );
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(q => q.status === filterStatus);
    }
    setFilteredQuotes(filtered);
  }, [quotes, searchTerm, filterStatus]);

  const fetchData = async () => {
    try {
      const [quotesRes, partiesRes, itemsRes] = await Promise.all([
        getQuotes(selectedCompany?._id),
        getParties({ company: selectedCompany?._id, type: 'customer', limit: 1000, light: true }),
        getItems(selectedCompany?._id)
      ]);
      setQuotes(quotesRes.data);
      setCustomers(partiesRes.data.parties || []);
      setItemsList(itemsRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateQuoteNumber = () => {
    const year = new Date().getFullYear();
    const count = quotes.length + 1;
    return `QT-${year}-${count.toString().padStart(4, '0')}`;
  };

  const calculateTotals = (items: QuoteItem[], taxRate: number) => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const tax = (subtotal * taxRate) / 100;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleItemChange = (index: number, field: keyof QuoteItem, value: any) => {
    const updatedItems = [...formData.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    if (field === 'itemId') {
      const selectedItem = itemsList.find((item: any) => item._id === value);
      if (selectedItem) {
        updatedItems[index].itemName = selectedItem.name;
        updatedItems[index].price = selectedItem.price;
        updatedItems[index].total = updatedItems[index].quantity * selectedItem.price;
      }
    }
    if (field === 'quantity' || field === 'price') {
      updatedItems[index].total = updatedItems[index].quantity * updatedItems[index].price;
    }
    setFormData(prev => ({ ...prev, items: updatedItems }));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { itemId: '', itemName: '', quantity: 1, price: 0, total: 0 }]
    }));
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { subtotal, tax, total } = calculateTotals(formData.items, formData.tax);
    const customer = customers.find((c: any) => c._id === formData.customerId);

    try {
      if (editingQuote) {
        await updateQuote(editingQuote._id, {
          ...formData,
          subtotal, tax, total,
          customerName: customer?.firmName || customer?.contactName || '',
          company: selectedCompany?._id
        });
      } else {
        await createQuote({
          ...formData,
          quoteNumber: generateQuoteNumber(),
          customerName: customer?.firmName || customer?.contactName || '',
          subtotal, tax, total,
          status: 'draft',
          company: selectedCompany?._id
        });
      }
      await fetchData();
      resetForm();
    } catch (err) {
      console.error('Error saving quote:', err);
    }
  };

  const handleEdit = (quote: Quote) => {
    setEditingQuote(quote);
    setFormData({
      customerId: quote.customerId,
      customerName: quote.customerName,
      date: quote.date,
      validUntil: quote.validUntil,
      items: quote.items,
      notes: quote.notes,
      tax: quote.subtotal > 0 ? (quote.tax / quote.subtotal) * 100 : 18
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this quote?')) {
      try {
        await deleteQuote(id);
        await fetchData();
      } catch (err) {
        console.error('Error deleting quote:', err);
      }
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      await updateQuoteStatus(id, status);
      await fetchData();
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      customerId: '', customerName: '',
      date: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      items: [{ itemId: '', itemName: '', quantity: 1, price: 0, total: 0 }],
      notes: '', tax: 18
    });
    setEditingQuote(null);
    setShowForm(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'expired': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="p-6 flex justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Sales Quotes</h1>
        <p className="text-sm text-gray-500">Create and manage sales quotations</p>
      </div>

      <div className="bg-white rounded-xl border p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input type="text" placeholder="Search quotes..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={fetchData}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
              title="Refresh Quotes">
              <RefreshCw className="w-4 h-4" />
            </button>
            {canCreate && (
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <Plus className="w-4 h-4" /> New Quote
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quote Details</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredQuotes.map((quote) => (
                <tr key={quote._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-[13.5px] font-medium text-gray-900">{quote.quoteNumber}</div>
                    <div className="text-[13.5px] text-gray-500">Date: {new Date(quote.date).toLocaleDateString()}</div>
                    <div className="text-[13.5px] text-gray-500">Valid: {new Date(quote.validUntil).toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-[13.5px] font-medium text-gray-900">{quote.customerName}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-[13.5px] font-medium text-gray-900">₹{quote.total?.toFixed(2)}</div>
                    <div className="text-[13.5px] text-gray-500">{quote.items?.length} items</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {canManage ? (
                      <select value={quote.status}
                        onChange={(e) => handleStatusUpdate(quote._id, e.target.value)}
                        className={`text-xs font-semibold rounded-full px-2 py-1 border-0 ${getStatusColor(quote.status)}`}>
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                        <option value="expired">Expired</option>
                      </select>
                    ) : (
                      <span className={`text-xs font-semibold rounded-full px-2 py-1 ${getStatusColor(quote.status)}`}>
                        {quote.status}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-[13.5px] font-medium">
                    <div className="flex space-x-2">
                      {canCreate && (
                        <button onClick={() => handleEdit(quote)} className="text-blue-600 hover:text-blue-900">
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      {canManage && (
                        <button onClick={() => handleDelete(quote._id)} className="text-red-600 hover:text-red-900">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredQuotes.length === 0 && (
            <div className="text-center py-8 text-gray-500">No quotes found</div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">{editingQuote ? 'Edit Quote' : 'Create New Quote'}</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Customer *</label>
                  <select value={formData.customerId}
                    onChange={(e) => setFormData(prev => ({ ...prev, customerId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
                    <option value="">Select Customer</option>
                    {customers.map((c: any) => (
                      <option key={c._id} value={c._id}>{c.firmName || c.contactName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quote Date *</label>
                  <input type="date" value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Valid Until *</label>
                  <input type="date" value={formData.validUntil}
                    onChange={(e) => setFormData(prev => ({ ...prev, validUntil: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tax Rate (%)</label>
                  <input type="number" step="0.01" value={formData.tax}
                    onChange={(e) => setFormData(prev => ({ ...prev, tax: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Items</h3>
                  <button type="button" onClick={addItem}
                    className="flex items-center space-x-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
                    <Plus className="w-4 h-4" /><span>Add Item</span>
                  </button>
                </div>
                <div className="space-y-4">
                  {formData.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-gray-50 rounded-lg">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
                        <select value={item.itemId}
                          onChange={(e) => handleItemChange(index, 'itemId', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required>
                          <option value="">Select Item</option>
                          {itemsList.map((itm: any) => (
                            <option key={itm._id} value={itm._id}>{itm.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                        <input type="number" value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                        <input type="number" step="0.01" value={item.price}
                          onChange={(e) => handleItemChange(index, 'price', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Total</label>
                        <input type="number" value={item.total.toFixed(2)} readOnly
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm" />
                      </div>
                      <div className="flex items-end">
                        <button type="button" onClick={() => removeItem(index)}
                          className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
                          disabled={formData.items.length === 1}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-end space-x-8">
                    <div className="text-right">
                      <div className="text-sm text-gray-600">Subtotal:</div>
                      <div className="text-sm text-gray-600">Tax ({formData.tax}%):</div>
                      <div className="text-lg font-semibold text-gray-900">Total:</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">₹{calculateTotals(formData.items, formData.tax).subtotal.toFixed(2)}</div>
                      <div className="text-sm">₹{calculateTotals(formData.items, formData.tax).tax.toFixed(2)}</div>
                      <div className="text-lg font-semibold">₹{calculateTotals(formData.items, formData.tax).total.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" rows={3} />
              </div>

              <div className="flex space-x-4 pt-4">
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg">
                  {editingQuote ? 'Update Quote' : 'Create Quote'}
                </button>
                <button type="button" onClick={resetForm}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-lg">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesQuotes;
import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Package, Barcode, RefreshCw, Eye, X, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getItems, createItem, updateItem, deleteItem as deleteItemApi } from '../api/itemApi';

interface BOMItem {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  cost: number;
  total: number;
}

interface Item {
  id: string;
  itemId: string;
  name: string;
  category: 'raw' | 'semi' | 'finished';
  description: string;

  // Units
  primaryUnit: string;
  altUnit?: string;
  conversionFactor?: number; // How many alt units in 1 primary unit

  // Pricing
  price: number;
  cost: number;

  // Stock
  stock: number;
  minStock: number;

  // BOM (only for finished and semi-finished goods)
  bomItems?: BOMItem[];
  bomTotalCost?: number;

  status: 'active' | 'inactive';
  createdAt: string;
}

const ItemManagement: React.FC = () => {
  const { selectedCompany, hasPermission } = useAuth();
  const canManage = hasPermission('MANAGE_ITEMS');
  const [, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [, setShowBOMModal] = useState(false);

  // Stats Filter State (for filtering main table list)
  const [statsFilter, setStatsFilter] = useState<'all' | 'finished' | 'semi' | 'raw' | 'low_stock'>('all');

  const [formData, setFormData] = useState({
    itemId: '',
    name: '',
    category: 'finished' as Item['category'],
    description: '',
    primaryUnit: 'GBL',
    altUnit: 'PCS',
    conversionFactor: 1,
    price: 0,
    cost: 0,
    stock: 0,
    minStock: 0,
    status: 'active' as Item['status'],
    bomItems: [] as BOMItem[]
  });

  const categories = [
    { value: 'finished', label: 'Finished Goods' },
    { value: 'semi', label: 'Semi-Finished' },
    { value: 'raw', label: 'Raw Materials' }
  ];

  const primaryUnits = ['GBL', 'PCS', 'KG', 'METER', 'LITER', 'BOX'];
  const altUnits = ['PCS', 'GBL', 'GRAM', 'CM', 'ML', 'UNIT'];

  useEffect(() => {
    if (selectedCompany?._id) {
      fetchItems();
    }
  }, [selectedCompany]);

  const fetchItems = async () => {
    if (!selectedCompany?._id) return;
    try {
      setLoading(true);
      const res = await getItems(selectedCompany._id);
      const itemsData = res.data.map((i: any) => ({ ...i, id: i._id }));
      setItems(itemsData);
      setFilteredItems(itemsData);
    } catch (err) {
      console.error('Error fetching items:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatsCardClick = (category: 'finished' | 'semi' | 'raw' | 'low_stock') => {
    setStatsFilter(prev => prev === category ? 'all' : category);
  };

  useEffect(() => {
    let filtered = items;

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        (item.name || '').toLowerCase().includes(lowerSearch) ||
        (item.itemId || '').toLowerCase().includes(lowerSearch) ||
        (item.category || '').toLowerCase().includes(lowerSearch) ||
        (item.primaryUnit || '').toLowerCase().includes(lowerSearch) ||
        (item.altUnit || '').toLowerCase().includes(lowerSearch) ||
        String(item.price || '').toLowerCase().includes(lowerSearch) ||
        String(item.cost || '').toLowerCase().includes(lowerSearch) ||
        String(item.stock || '').toLowerCase().includes(lowerSearch) ||
        (item.status || '').toLowerCase().includes(lowerSearch)
      );
    }

    if (filterCategory !== 'all') {
      filtered = filtered.filter(item => item.category === filterCategory);
    }

    // Apply card filter (statsFilter)
    if (statsFilter === 'low_stock') {
      filtered = filtered.filter(item => item.stock <= item.minStock);
    } else if (statsFilter !== 'all') {
      filtered = filtered.filter(item => item.category === statsFilter);
    }

    setFilteredItems(filtered);
  }, [items, searchTerm, filterCategory, statsFilter]);




  const generateItemId = () => {
    const prefix = formData.category.toUpperCase().substring(0, 2);
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}${timestamp}`;
  };

  const calculateBOMTotal = (bomItems: BOMItem[]) => {
    return bomItems.reduce((sum, item) => sum + item.total, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const bomTotalCost = calculateBOMTotal(formData.bomItems);

    try {
      if (editingItem) {
        await updateItem(editingItem.id || (editingItem as any)._id, {
          ...formData,
          itemId: formData.itemId || generateItemId(),
          bomTotalCost: formData.category !== 'raw' ? bomTotalCost : undefined,
          bomItems: formData.category !== 'raw' ? formData.bomItems : undefined,
          company: selectedCompany?._id
        });
      } else {
        await createItem({
          ...formData,
          itemId: formData.itemId || generateItemId(),
          bomTotalCost: formData.category !== 'raw' ? bomTotalCost : undefined,
          bomItems: formData.category !== 'raw' ? formData.bomItems : undefined,
          company: selectedCompany?._id
        });
      }
      await fetchItems();
    } catch (err) {
      console.error('Error saving item:', err);
    }

    resetForm();
  };

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    setFormData({
      itemId: item.itemId,
      name: item.name,
      category: item.category,
      description: item.description,
      primaryUnit: item.primaryUnit,
      altUnit: item.altUnit || '',
      conversionFactor: item.conversionFactor || 1,
      price: item.price,
      cost: item.cost,
      stock: item.stock,
      minStock: item.minStock,
      status: item.status,
      bomItems: item.bomItems || []
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await deleteItemApi(id);
        await fetchItems();
      } catch (err) {
        console.error('Error deleting item:', err);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      itemId: '',
      name: '',
      category: 'finished',
      description: '',
      primaryUnit: 'GBL',
      altUnit: 'PCS',
      conversionFactor: 1,
      price: 0,
      cost: 0,
      stock: 0,
      minStock: 0,
      status: 'active',
      bomItems: []
    });
    setEditingItem(null);
    setShowForm(false);
    setShowBOMModal(false);
  };

  const addBOMItem = () => {
    const newBOMItem: BOMItem = {
      id: Date.now().toString(),
      materialId: '',
      materialName: '',
      quantity: 1,
      unit: 'KG',
      cost: 0,
      total: 0
    };
    setFormData(prev => ({
      ...prev,
      bomItems: [...prev.bomItems, newBOMItem]
    }));
  };

  const updateBOMItem = (index: number, field: keyof BOMItem, value: any) => {
    const updatedBOMItems = [...formData.bomItems];
    updatedBOMItems[index] = { ...updatedBOMItems[index], [field]: value };

    if (field === 'quantity' || field === 'cost') {
      updatedBOMItems[index].total = updatedBOMItems[index].quantity * updatedBOMItems[index].cost;
    }

    setFormData(prev => ({ ...prev, bomItems: updatedBOMItems }));
  };

  const removeBOMItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      bomItems: prev.bomItems.filter((_, i) => i !== index)
    }));
  };

  const getStockStatus = (stock: number, minStock: number) => {
    if (stock === 0) return { color: 'bg-red-100 text-red-800', text: 'Out of Stock' };
    if (stock <= minStock) return { color: 'bg-yellow-100 text-yellow-800', text: 'Low Stock' };
    return { color: 'bg-green-100 text-green-800', text: 'In Stock' };
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'finished': return 'bg-green-100 text-green-800';
      case 'semi': return 'bg-blue-100 text-blue-800';
      case 'raw': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const rawMaterials = items.filter(item => item.category === 'raw');

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Item Management</h1>
        <p className="text-gray-600">Manage finished goods, semi-finished goods, and raw materials</p>
      </div>

      {/* Header Actions */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Categories</option>
              {categories.map(category => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={fetchItems}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
              title="Refresh Items"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {canManage && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Item</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <button
          onClick={() => handleStatsCardClick('finished')}
          className={`w-full text-left rounded-lg shadow-sm p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group border ${
            statsFilter === 'finished' 
              ? 'bg-green-50/40 border-green-400 ring-2 ring-green-100 shadow-md' 
              : 'bg-white border-transparent hover:shadow-md hover:-translate-y-0.5 hover:border-gray-200'
          }`}
        >
          <div className="flex items-center">
            <Package className="w-8 h-8 text-green-600 mr-3" />
            <div>
              <h3 className={`text-lg font-semibold transition-colors ${statsFilter === 'finished' ? 'text-green-700' : 'text-gray-900 group-hover:text-green-600'}`}>Finished Goods</h3>
              <p className="text-2xl font-bold text-green-600">
                {items.filter(item => item.category === 'finished').length}
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => handleStatsCardClick('semi')}
          className={`w-full text-left rounded-lg shadow-sm p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group border ${
            statsFilter === 'semi' 
              ? 'bg-blue-50/40 border-blue-400 ring-2 ring-blue-100 shadow-md' 
              : 'bg-white border-transparent hover:shadow-md hover:-translate-y-0.5 hover:border-gray-200'
          }`}
        >
          <div className="flex items-center">
            <Barcode className="w-8 h-8 text-blue-600 mr-3" />
            <div>
              <h3 className={`text-lg font-semibold transition-colors ${statsFilter === 'semi' ? 'text-blue-750' : 'text-gray-900 group-hover:text-blue-600'}`}>Semi-Finished</h3>
              <p className="text-2xl font-bold text-blue-600">
                {items.filter(item => item.category === 'semi').length}
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => handleStatsCardClick('raw')}
          className={`w-full text-left rounded-lg shadow-sm p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group border ${
            statsFilter === 'raw' 
              ? 'bg-orange-50/40 border-orange-400 ring-2 ring-orange-100 shadow-md' 
              : 'bg-white border-transparent hover:shadow-md hover:-translate-y-0.5 hover:border-gray-200'
          }`}
        >
          <div className="flex items-center">
            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center mr-3">
              <span className="text-orange-600 font-bold">R</span>
            </div>
            <div>
              <h3 className={`text-lg font-semibold transition-colors ${statsFilter === 'raw' ? 'text-orange-700' : 'text-gray-900 group-hover:text-orange-600'}`}>Raw Materials</h3>
              <p className="text-2xl font-bold text-orange-600">
                {items.filter(item => item.category === 'raw').length}
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => handleStatsCardClick('low_stock')}
          className={`w-full text-left rounded-lg shadow-sm p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group border ${
            statsFilter === 'low_stock' 
              ? 'bg-red-50/40 border-red-400 ring-2 ring-red-100 shadow-md' 
              : 'bg-white border-transparent hover:shadow-md hover:-translate-y-0.5 hover:border-gray-200'
          }`}
        >
          <div className="flex items-center">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mr-3">
              <span className="text-red-600 font-bold">!</span>
            </div>
            <div>
              <h3 className={`text-lg font-semibold transition-colors ${statsFilter === 'low_stock' ? 'text-red-700' : 'text-gray-900 group-hover:text-red-650'}`}>Low Stock</h3>
              <p className="text-2xl font-bold text-red-600">
                {items.filter(item => item.stock <= item.minStock).length}
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Units
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pricing
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stock
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  BOM Cost
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item) => {
                const stockStatus = getStockStatus(item.stock, item.minStock);
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-[13.5px] font-medium text-gray-900">{item.name}</div>
                        <div className="text-[13.5px] text-gray-500">ID: {item.itemId}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full capitalize ${getCategoryColor(item.category)}`}>
                        {item.category === 'finished' ? 'Finished' : item.category === 'semi' ? 'Semi-Finished' : 'Raw Material'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-[13.5px] text-gray-900">{item.primaryUnit}</div>
                      {item.altUnit && (
                        <div className="text-[13.5px] text-gray-500">
                          1 {item.primaryUnit} = {item.conversionFactor} {item.altUnit}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-[13.5px] text-gray-900">₹{item.price.toFixed(2)}</div>
                      <div className="text-[13.5px] text-gray-500">Cost: ₹{item.cost.toFixed(2)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-[13.5px] text-gray-900">{item.stock} {item.primaryUnit}</div>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${stockStatus.color}`}>
                        {stockStatus.text}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {item.bomTotalCost !== undefined ? (
                        <div className="text-[13.5px] text-gray-900">₹{item.bomTotalCost.toFixed(2)}</div>
                      ) : (
                        <div className="text-[13.5px] text-gray-500">N/A</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full capitalize ${item.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                        }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-[13.5px] font-medium">
                      <div className="flex space-x-2">
                        {canManage && (
                          <button
                            onClick={() => handleEdit(item)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">
              {editingItem ? 'Edit Item' : 'Add New Item'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Information */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Item ID
                    </label>
                    <input
                      type="text"
                      value={formData.itemId}
                      onChange={(e) => setFormData(prev => ({ ...prev, itemId: e.target.value }))}
                      placeholder="Auto-generated if empty"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Item Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category *
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value as Item['category'] }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      {categories.map(category => (
                        <option key={category.value} value={category.value}>{category.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status *
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as Item['status'] }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                  />
                </div>
              </div>

              {/* Units Section */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Units</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Primary Unit *
                    </label>
                    <select
                      value={formData.primaryUnit}
                      onChange={(e) => setFormData(prev => ({ ...prev, primaryUnit: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      {primaryUnits.map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>

                  {(formData.category === 'finished' || formData.category === 'semi') && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Alternative Unit
                        </label>
                        <select
                          value={formData.altUnit}
                          onChange={(e) => setFormData(prev => ({ ...prev, altUnit: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Select Alt Unit</option>
                          {altUnits.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Conversion Factor
                        </label>
                        <input
                          type="number"
                          value={formData.conversionFactor}
                          onChange={(e) => setFormData(prev => ({ ...prev, conversionFactor: parseFloat(e.target.value) || 1 }))}
                          placeholder="1 Primary Unit = X Alt Units"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Pricing & Stock */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Pricing & Stock</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Selling Price *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cost Price *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.cost}
                      onChange={(e) => setFormData(prev => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Stock *
                    </label>
                    <input
                      type="number"
                      value={formData.stock}
                      onChange={(e) => setFormData(prev => ({ ...prev, stock: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Minimum Stock *
                    </label>
                    <input
                      type="number"
                      value={formData.minStock}
                      onChange={(e) => setFormData(prev => ({ ...prev, minStock: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* BOM Section for Finished and Semi-Finished Goods */}
              {(formData.category === 'finished' || formData.category === 'semi') && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Bill of Materials (BOM)</h3>
                    <button
                      type="button"
                      onClick={addBOMItem}
                      className="flex items-center space-x-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Material</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {formData.bomItems.map((bomItem, index) => (
                      <div key={bomItem.id} className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 bg-white rounded-lg border">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
                          <select
                            value={bomItem.materialId}
                            onChange={(e) => {
                              const value = e.target.value;
                              const selectedMaterial = rawMaterials.find(m => m.id === value);

                              const updated = [...formData.bomItems];
                              updated[index] = {
                                ...updated[index],
                                materialId: value,
                                materialName: selectedMaterial?.name || '',
                                cost: selectedMaterial?.cost || 0,
                                total: (updated[index].quantity || 0) * (selectedMaterial?.cost || 0)
                              };

                              setFormData(prev => ({
                                ...prev,
                                bomItems: updated
                              }));
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          >
                            <option value="">Select Material</option>
                            {rawMaterials.map(material => (
                              <option key={material.id} value={material.id}>{material.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                          <input
                            type="number"
                            step="0.01"
                            value={bomItem.quantity}
                            onChange={(e) => updateBOMItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                          <select
                            value={bomItem.unit}
                            onChange={(e) => updateBOMItem(index, 'unit', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          >
                            {primaryUnits.map(unit => (
                              <option key={unit} value={unit}>{unit}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Cost</label>
                          <input
                            type="number"
                            step="0.01"
                            value={bomItem.cost}
                            onChange={(e) => updateBOMItem(index, 'cost', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Total</label>
                          <input
                            type="number"
                            value={bomItem.total.toFixed(2)}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm"
                          />
                        </div>

                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => removeBOMItem(index)}
                            className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                          >
                            <Trash2 className="w-4 h-4 mx-auto" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {formData.bomItems.length > 0 && (
                    <div className="mt-4 p-4 bg-white rounded-lg border">
                      <div className="flex justify-end">
                        <div className="text-right">
                          <div className="text-lg font-semibold text-gray-900">
                            Total BOM Cost: ₹{calculateBOMTotal(formData.bomItems).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex space-x-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors"
                >
                  {editingItem ? 'Update Item' : 'Add Item'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemManagement;
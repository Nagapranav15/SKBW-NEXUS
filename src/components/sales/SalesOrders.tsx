import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, RefreshCw, Download, FileText, Calendar, Filter, CheckCircle, AlertTriangle, Layers, User, Package, Eye, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSalesOrdersV2, updateSalesOrderV2Status, SalesOrderV2 } from '../../api/salesOrderApiV2';
import SalesOrderDrawerV2 from './SalesOrderDrawerV2';
import SalesOrderDetailPanelV2 from './SalesOrderDetailPanelV2';
import { showToast } from '../ui/Toast';
import * as XLSX from 'xlsx';

const SalesOrders: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [orders, setOrders] = useState<SalesOrderV2[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab & Filters
  const [activeMainTab, setActiveMainTab] = useState<'orders' | 'templates' | 'quotes' | 'materials'>('orders');
  const [periodFilter, setPeriodFilter] = useState<'all' | '30d' | '60d' | '90d'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Modals & Panel State
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SalesOrderV2 | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<SalesOrderV2 | null>(null);

  const fetchOrders = async () => {
    if (!selectedCompany?._id) return;
    setLoading(true);
    try {
      const data = await getSalesOrdersV2(selectedCompany._id, statusFilter, periodFilter, search);
      setOrders(data || []);
    } catch (err) {
      console.error(err);
      showToast('Failed to load Sales Orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [selectedCompany?._id, periodFilter, statusFilter]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNumber = (o.orderNumber || '').toLowerCase().includes(q);
        const matchCustomer = (o.customerName || '').toLowerCase().includes(q);
        const matchItems = (o.items || []).some(i => (i.itemName || '').toLowerCase().includes(q) || (i.skuCode || '').toLowerCase().includes(q));
        if (!matchNumber && !matchCustomer && !matchItems) return false;
      }
      return true;
    });
  }, [orders, search]);

  const openOrdersCount = useMemo(() => {
    return orders.filter(o => o.status === 'Confirmed' || o.status === 'In Production' || o.fulfillmentStatus !== 'Fulfilled').length;
  }, [orders]);

  const totalCommittedValue = useMemo(() => {
    return orders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  }, [orders]);

  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      showToast('No orders available to export', 'error');
      return;
    }
    const exportData = filteredOrders.map(o => ({
      'SO Number': o.orderNumber,
      'Client': o.customerName,
      'Order Date': o.orderDate,
      'Delivery Date': o.promisedDate || '—',
      'Value (₹)': o.grandTotal,
      'Material Readiness': o.materialsStatus,
      'Fulfillment Status': o.fulfillmentStatus,
      'Status': o.status
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Orders');
    XLSX.writeFile(wb, `Sales_Orders_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-[1600px] mx-auto text-left font-sans">
      
      {/* ── TOP HEADER & BREADCRUMB ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
            <span>Fulfillment</span>
            <span>/</span>
            <span className="font-bold text-gray-900">Demand</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-0.5">Sales Orders</h1>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchOrders}
            className="p-2 text-gray-500 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-all cursor-pointer shadow-2xs"
            title="Refresh Order Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExportCSV}
            className="p-2 text-gray-500 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-all cursor-pointer shadow-2xs"
            title="Export to Excel"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setEditingOrder(null); setShowDrawer(true); }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2 text-xs"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>New Sales Order</span>
          </button>
        </div>
      </div>

      {/* ── MAKORO SUB-TAB NAVIGATION BAR ── */}
      <div className="border-b border-gray-200 flex items-center justify-between pt-1 overflow-x-auto">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveMainTab('orders')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap border-b-2 -mb-[1px] ${
              activeMainTab === 'orders' ? 'text-blue-700 border-blue-600 bg-blue-50/40' : 'text-gray-500 border-transparent hover:text-gray-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Orders ({orders.length})</span>
            <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">Open: {openOrdersCount}</span>
          </button>
          <button
            onClick={() => setActiveMainTab('quotes')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap border-b-2 -mb-[1px] ${
              activeMainTab === 'quotes' ? 'text-blue-700 border-blue-600 bg-blue-50/40' : 'text-gray-500 border-transparent hover:text-gray-900'
            }`}
          >
            <Layers className="w-4 h-4 text-gray-400" />
            <span>Quotes</span>
          </button>
          <button
            onClick={() => setActiveMainTab('templates')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap border-b-2 -mb-[1px] ${
              activeMainTab === 'templates' ? 'text-blue-700 border-blue-600 bg-blue-50/40' : 'text-gray-500 border-transparent hover:text-gray-900'
            }`}
          >
            <span>Templates</span>
          </button>
          <button
            onClick={() => setActiveMainTab('materials')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap border-b-2 -mb-[1px] ${
              activeMainTab === 'materials' ? 'text-blue-700 border-blue-600 bg-blue-50/40' : 'text-gray-500 border-transparent hover:text-gray-900'
            }`}
          >
            <span>Materials</span>
          </button>
        </div>

        {/* Total Committed Value Indicator */}
        <div className="text-xs font-bold text-gray-700 hidden md:flex items-center gap-2 pr-2">
          <span className="text-gray-400 font-normal">Total Value:</span>
          <span className="text-blue-900 font-black">₹{totalCommittedValue.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* ── TOOLBAR & PERIOD QUICK PILLS ── */}
      <div className="bg-white rounded-2xl border border-gray-200/90 p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        
        {/* Quick Date Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">PERIOD:</span>
          {(['all', '30d', '60d', '90d'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriodFilter(p)}
              className={`px-3 py-1 rounded-xl transition-all cursor-pointer text-xs ${
                periodFilter === p ? 'bg-gray-900 text-white font-bold shadow-xs' : 'bg-gray-100/80 hover:bg-gray-200 text-gray-600'
              }`}
            >
              {p === 'all' ? 'All Time' : p.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Search & Status Filter */}
        <div className="flex items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 cursor-pointer focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="Confirmed">Confirmed</option>
            <option value="In Production">In Production</option>
            <option value="Delivered">Delivered</option>
            <option value="Draft">Draft</option>
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SO #, client, items..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl w-48 md:w-64 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── MAKORO SALES ORDERS TABLE ── */}
      <div className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left divide-y divide-gray-200">
            <thead className="bg-gray-50/90 text-[10.5px] font-bold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3 w-8">
                  <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                </th>
                <th className="py-3 px-3">SO NO.</th>
                <th className="py-3 px-4">CLIENT</th>
                <th className="py-3 px-4">ITEMS</th>
                <th className="py-3 px-3">START DATE</th>
                <th className="py-3 px-3">DELIVERY DATE</th>
                <th className="py-3 px-3 text-right">VALUE (₹)</th>
                <th className="py-3 px-3">MATERIALS</th>
                <th className="py-3 px-3">FULFILLMENT</th>
                <th className="py-3 px-3 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white text-xs">
              {filteredOrders.map((order) => {
                const itemCount = (order.items || []).length;
                const firstItemName = order.items && order.items[0] ? order.items[0].itemName : 'No Items';
                const remainingCount = itemCount > 1 ? itemCount - 1 : 0;

                return (
                  <tr
                    key={order._id}
                    onClick={() => setSelectedOrderDetail(order)}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                    </td>

                    {/* SO Number */}
                    <td className="py-3 px-3 font-mono font-bold text-blue-700 whitespace-nowrap group-hover:underline">
                      {order.orderNumber}
                    </td>

                    {/* Client Firm Name Pill */}
                    <td className="py-3 px-4 font-bold text-gray-900 whitespace-nowrap">
                      <span className="bg-gray-100/90 text-gray-900 border border-gray-200/70 px-2.5 py-1 rounded-xl">
                        {order.customerName}
                      </span>
                    </td>

                    {/* Items Summary Preview */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 max-w-xs truncate">
                        <span className="font-semibold text-gray-800 truncate">{firstItemName}</span>
                        {remainingCount > 0 && (
                          <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0 border border-blue-100">
                            +{remainingCount} more
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Start Date */}
                    <td className="py-3 px-3 text-gray-600 font-medium whitespace-nowrap">
                      {order.orderDate}
                    </td>

                    {/* Delivery Date */}
                    <td className="py-3 px-3 text-gray-900 font-bold whitespace-nowrap">
                      {order.promisedDate || '—'}
                    </td>

                    {/* Value */}
                    <td className="py-3 px-3 text-right font-black text-gray-900 whitespace-nowrap">
                      ₹{(order.grandTotal || 0).toLocaleString('en-IN')}
                    </td>

                    {/* Materials BOM Status Badge */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        order.materialsStatus === 'Shortfall'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {order.materialsStatus === 'Shortfall' ? 'Shortfall Warning' : 'Ready'}
                      </span>
                    </td>

                    {/* Fulfillment Progress */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        order.fulfillmentStatus === 'Fulfilled' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        order.fulfillmentStatus === 'Partial' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-700 border-gray-200'
                      }`}>
                        {order.fulfillmentStatus || 'Not Started'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedOrderDetail(order)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="View Order Details & BOM Requirements"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingOrder(order); setShowDrawer(true); }}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit Order"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredOrders.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-gray-400 italic">
                    No Sales Orders found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CREATE / EDIT SALES ORDER MODAL FORM ── */}
      <SalesOrderDrawerV2
        isOpen={showDrawer}
        companyId={selectedCompany?._id || ''}
        editOrder={editingOrder}
        onClose={() => setShowDrawer(false)}
        onSaveSuccess={() => {
          setShowDrawer(false);
          fetchOrders();
          showToast('Sales Order saved successfully!', 'success');
        }}
      />

      {/* ── MAKORO SLIDE-OUT ORDER DETAIL PANEL ── */}
      <SalesOrderDetailPanelV2
        isOpen={!!selectedOrderDetail}
        order={selectedOrderDetail}
        onClose={() => setSelectedOrderDetail(null)}
        onEdit={(ord) => {
          setSelectedOrderDetail(null);
          setEditingOrder(ord);
          setShowDrawer(true);
        }}
      />

    </div>
  );
};

export default SalesOrders;
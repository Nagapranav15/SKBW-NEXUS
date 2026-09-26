import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Factory, Plus, Search, SlidersHorizontal, ArrowUpDown, Download, 
  RotateCcw, Eye, Pencil, MoreHorizontal, Calendar, Package, 
  FileText, LayoutGrid, History, Check, ChevronLeft, ChevronRight, 
  Printer, Trash2, ArrowUp, ArrowDown
} from 'lucide-react';
import { ProductionOrder, ProductionStatus, ItemType } from '../../types/production';
import * as XLSX from 'xlsx';
import { showToast } from '../ui/Toast';

interface ProductionOrdersListProps {
  orders: ProductionOrder[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onNewOrder: () => void;
  onViewOrder: (order: ProductionOrder) => void;
  onRecordEntries: (order: ProductionOrder) => void;
  onPrintOrder: (order: ProductionOrder) => void;
  onDeleteOrder: (orderId: string) => void;
  onRefresh: () => void;
}

export const ProductionOrdersList: React.FC<ProductionOrdersListProps> = ({
  orders,
  activeTab,
  setActiveTab,
  onNewOrder,
  onViewOrder,
  onRecordEntries,
  onPrintOrder,
  onDeleteOrder,
  onRefresh
}) => {
  // Period filter
  const [period, setPeriod] = useState<string>('All');
  // Type filter
  const [typeFilter, setTypeFilter] = useState<string>('All');
  // Status filter
  const [statusFilter, setStatusFilter] = useState<string>('All');
  // Department filter
  const [deptFilter, setDeptFilter] = useState<string>('All');
  // Search text
  const [searchTerm, setSearchTerm] = useState<string>('');
  // Sorting
  const [sortField, setSortField] = useState<keyof ProductionOrder>('orderNumber');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  // Row selections
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Active row dropdown action menu
  const [actionMenuOrderId, setActionMenuOrderId] = useState<string | null>(null);
  // Highlighted row for keyboard navigation (Tally style)
  const [highlightedRowIdx, setHighlightedRowIdx] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Dynamic filter lists from backend data
  const dynamicDepartments = useMemo(() => {
    const set = new Set<string>();
    orders.forEach(o => {
      if (o.department && o.department.trim()) set.add(o.department.trim());
    });
    return Array.from(set).sort();
  }, [orders]);

  const dynamicTypes = useMemo(() => {
    const set = new Set<string>();
    orders.forEach(o => {
      if (o.itemType && o.itemType.trim()) set.add(o.itemType.trim());
    });
    return Array.from(set).sort();
  }, [orders]);

  // Pagination
  const [rowsPerPage, setRowsPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Filtered & Sorted orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Type
      if (typeFilter !== 'All' && order.itemType !== typeFilter) return false;
      // Status
      if (statusFilter !== 'All' && order.status !== statusFilter) return false;
      // Department
      if (deptFilter !== 'All' && order.department !== deptFilter) return false;
      // Search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchNumber = order.orderNumber.toLowerCase().includes(query);
        const matchItem = order.itemName.toLowerCase().includes(query);
        const matchCode = order.itemCode.toLowerCase().includes(query);
        const matchDept = order.department.toLowerCase().includes(query);
        if (!matchNumber && !matchItem && !matchCode && !matchDept) return false;
      }
      return true;
    }).sort((a, b) => {
      let valA = a[sortField] || '';
      let valB = b[sortField] || '';
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc 
        ? String(valA).localeCompare(String(valB), undefined, { numeric: true })
        : String(valB).localeCompare(String(valA), undefined, { numeric: true });
    });
  }, [orders, typeFilter, statusFilter, deptFilter, searchTerm, sortField, sortAsc]);

  // Pagination calculation
  const totalOrders = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalOrders / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, startIndex + rowsPerPage);

  // Keyboard navigation & Tally shortcuts across orders list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isInputActive = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      // 1. Search focus with / or Alt+F
      if ((e.key === '/' || (e.altKey && (e.key === 'f' || e.key === 'F'))) && !isInputActive) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // 2. Escape: clear search or blur
      if (e.key === 'Escape') {
        if (isInputActive) {
          (document.activeElement as HTMLElement)?.blur();
          return;
        }
        if (searchTerm) {
          setSearchTerm('');
          return;
        }
        if (actionMenuOrderId) {
          setActionMenuOrderId(null);
          return;
        }
      }

      // 3. Alt+C or Alt+N: New Production Order
      if (e.altKey && (e.key === 'c' || e.key === 'C' || e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        onNewOrder();
        return;
      }

      // If typing in input, don't hijack table arrow keys
      if (isInputActive) return;

      // 4. Arrow Down: navigate rows
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedRowIdx(prev => Math.min(prev + 1, Math.max(0, paginatedOrders.length - 1)));
        return;
      }

      // 5. Arrow Up: navigate rows
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedRowIdx(prev => Math.max(prev - 1, 0));
        return;
      }

      // 6. Enter: View highlighted order
      if (e.key === 'Enter') {
        if (paginatedOrders.length > 0 && highlightedRowIdx >= 0 && highlightedRowIdx < paginatedOrders.length) {
          e.preventDefault();
          onViewOrder(paginatedOrders[highlightedRowIdx]);
        }
        return;
      }

      // 7. Alt+E: Record Entries for highlighted order
      if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        if (paginatedOrders.length > 0 && highlightedRowIdx >= 0 && highlightedRowIdx < paginatedOrders.length) {
          e.preventDefault();
          onRecordEntries(paginatedOrders[highlightedRowIdx]);
        }
        return;
      }

      // 8. Alt+P: Print highlighted order
      if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        if (paginatedOrders.length > 0 && highlightedRowIdx >= 0 && highlightedRowIdx < paginatedOrders.length) {
          e.preventDefault();
          onPrintOrder(paginatedOrders[highlightedRowIdx]);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paginatedOrders, highlightedRowIdx, actionMenuOrderId, searchTerm, onNewOrder, onViewOrder, onRecordEntries, onPrintOrder]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(paginatedOrders.map(o => o._id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSort = (field: keyof ProductionOrder) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleExportExcel = () => {
    try {
      const exportData = filteredOrders.map((o, idx) => ({
        '#': idx + 1,
        'Order No': o.orderNumber,
        'Item Name': o.itemName,
        'Item Code': o.itemCode,
        'Type': o.itemType,
        'Planned Qty': `${o.plannedQty} ${o.plannedUom} (${o.plannedPcs} PCS)`,
        'Produced Qty': `${o.producedQty} ${o.plannedUom} (${o.producedPcs} PCS)`,
        'Balance': `${o.balanceQty} ${o.plannedUom} (${o.balancePcs} PCS)`,
        'Material Status': o.materialStatus,
        'Status': o.status,
        'Progress (%)': `${o.progress}%`,
        'Department': o.department,
        'Due Date': o.requiredCompletionDate,
        'Remarks': o.remarks || ''
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Production Orders');
      XLSX.writeFile(wb, `Production_Orders_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast('Exported production orders to Excel successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to export to Excel', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/60 overflow-y-auto custom-scrollbar">
      {/* Top Banner / Header matching Makoro clean design */}
      <div className="bg-white border-b border-gray-150 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow-2xs">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
            <Factory className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-tight">Production</h1>
            <p className="text-xs text-gray-500 font-medium">Plan, manufacture and track finished & semi-finished goods.</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onNewOrder}
            className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Production Order</span>
            <kbd className="px-1.5 py-0.5 bg-blue-700/80 rounded text-[10px] font-mono text-blue-100 hidden sm:inline">Alt+C</kbd>
          </button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="bg-white border-b border-gray-200 px-6 shrink-0 flex items-center justify-between">
        <div className="flex space-x-1 sm:space-x-2 overflow-x-auto custom-scrollbar py-2">
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
      </div>

      {/* Main Content Area */}
      <div className="p-6 flex-1 flex flex-col min-w-0">
        {/* Filter & Toolbar Area */}
        <div className="bg-white rounded-xl border border-gray-200 p-3.5 mb-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
          {/* Left: Period pill selector & Select All box */}
          <div className="flex items-center flex-wrap gap-2.5">
            <div className="flex items-center pl-1 pr-2">
              <input
                type="checkbox"
                onChange={handleSelectAll}
                checked={paginatedOrders.length > 0 && paginatedOrders.every(o => selectedIds.has(o._id))}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                title="Select all on current page"
              />
            </div>

            <div className="flex items-center space-x-1 bg-gray-100/80 p-0.5 rounded-lg border border-gray-200/60">
              <span className="text-[11px] font-medium text-gray-500 px-2">Period:</span>
              {['All', '30d', '60d', '90d', 'Custom'].map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    period === p
                      ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Dropdown Filters */}
            <div className="flex items-center space-x-2">
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 shadow-2xs cursor-pointer"
              >
                <option value="All">All Types</option>
                {dynamicTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 shadow-2xs cursor-pointer"
              >
                <option value="All">All Status</option>
                <option value="In Production">In Production</option>
                <option value="Planned">Planned</option>
                <option value="Completed">Completed</option>
                <option value="Not Started">Not Started</option>
              </select>

              <select
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
                className="text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 shadow-2xs cursor-pointer"
              >
                <option value="All">All Departments</option>
                {dynamicDepartments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Right: Search, Filter, Sort, Download, Refresh */}
          <div className="flex items-center space-x-2 ml-auto">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search orders... [/ or Alt+F]"
                className="w-56 lg:w-64 pl-8 pr-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
              />
            </div>

            <button
              onClick={() => {
                setTypeFilter('All');
                setStatusFilter('All');
                setDeptFilter('All');
                setSearchTerm('');
                showToast('Filters cleared', 'info');
              }}
              title="Reset Filters"
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            <button
              onClick={() => handleSort('orderNumber')}
              title={`Sort by Order Number (${sortAsc ? 'Ascending' : 'Descending'})`}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors cursor-pointer"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>

            <button
              onClick={handleExportExcel}
              title="Export to Excel"
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={onRefresh}
              title="Refresh"
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Data Table Container */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden flex flex-col flex-1">
          <div className="overflow-x-auto flex-1 custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider select-none">
                  <th className="py-3 px-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={paginatedOrders.length > 0 && paginatedOrders.every(o => selectedIds.has(o._id))}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-2 w-10 text-center font-bold">#</th>
                  <th 
                    onClick={() => handleSort('orderNumber')} 
                    className="py-3 px-3 font-bold cursor-pointer hover:text-gray-800"
                  >
                    <div className="flex items-center space-x-1">
                      <span>ORDER NO.</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('itemName')} 
                    className="py-3 px-3 font-bold cursor-pointer hover:text-gray-800 min-w-[200px]"
                  >
                    <div className="flex items-center space-x-1">
                      <span>ITEM / PRODUCT</span>
                    </div>
                  </th>
                  <th className="py-3 px-3 font-bold">TYPE</th>
                  <th 
                    onClick={() => handleSort('plannedPcs')} 
                    className="py-3 px-3 font-bold cursor-pointer hover:text-gray-800"
                  >
                    <div className="flex items-center space-x-1">
                      <span>PLANNED QTY</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="py-3 px-3 font-bold">PRODUCED QTY</th>
                  <th 
                    onClick={() => handleSort('balancePcs')} 
                    className="py-3 px-3 font-bold cursor-pointer hover:text-gray-800"
                  >
                    <div className="flex items-center space-x-1">
                      <span>BALANCE</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="py-3 px-3 font-bold">
                    <div className="flex items-center space-x-1">
                      <span>MATERIAL</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="py-3 px-3 font-bold min-w-[150px]">
                    <div className="flex items-center space-x-1">
                      <span>STATUS</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="py-3 px-3 font-bold">DEPARTMENT</th>
                  <th 
                    onClick={() => handleSort('requiredCompletionDate')} 
                    className="py-3 px-3 font-bold cursor-pointer hover:text-gray-800"
                  >
                    <div className="flex items-center space-x-1">
                      <span>DUE DATE</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="py-3 px-3 text-center font-bold w-28">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {paginatedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-gray-400">
                      <Package className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                      <p className="font-semibold text-gray-600">No production orders found</p>
                      <p className="text-xs text-gray-400 mt-0.5">Try adjusting your filters or click "+ New Production Order" to start a batch.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedOrders.map((order, idx) => {
                    const rowNumber = startIndex + idx + 1;
                    const isSelected = selectedIds.has(order._id);
                    const isDualUom = order.plannedUom === 'GBL';
                    const isHighlighted = highlightedRowIdx === idx;

                    return (
                      <tr 
                        key={order._id}
                        onMouseEnter={() => setHighlightedRowIdx(idx)}
                        onDoubleClick={() => onViewOrder(order)}
                        className={`transition-colors cursor-pointer group ${
                          isHighlighted 
                            ? 'bg-blue-100/70 border-l-4 border-blue-600 font-medium' 
                            : isSelected 
                              ? 'bg-blue-50/50' 
                              : 'hover:bg-blue-50/30'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectRow(order._id)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>

                        {/* # */}
                        <td className="py-3.5 px-2 text-center font-semibold text-gray-600">{rowNumber}</td>

                        {/* Order No */}
                        <td className="py-3.5 px-3 font-bold text-gray-900 whitespace-nowrap">
                          <button
                            onClick={() => onViewOrder(order)}
                            className="hover:text-blue-600 hover:underline transition-colors text-left font-bold cursor-pointer"
                          >
                            {order.orderNumber}
                          </button>
                        </td>

                        {/* Item / Product */}
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-gray-900 leading-snug">{order.itemName}</div>
                          <div className="text-[11px] text-gray-400 font-medium">{order.itemCode}</div>
                        </td>

                        {/* Type badge */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {order.itemType === 'Finished Good' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              Finished Good
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200/60">
                              Semi Finished
                            </span>
                          )}
                        </td>

                        {/* Planned Qty */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {isDualUom ? (
                            <div>
                              <div className="font-bold text-gray-900">{order.plannedQty} GBL</div>
                              <div className="text-[11px] text-gray-400 font-medium">{order.plannedPcs?.toLocaleString()} PCS</div>
                            </div>
                          ) : (
                            <div className="font-bold text-gray-900">{order.plannedPcs?.toLocaleString()} PCS</div>
                          )}
                        </td>

                        {/* Produced Qty */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {order.producedQty === 0 && order.producedPcs === 0 ? (
                            <span className="font-bold text-gray-700">0</span>
                          ) : isDualUom ? (
                            <div>
                              <div className="font-bold text-gray-900">{order.producedQty} GBL</div>
                              <div className="text-[11px] text-gray-400 font-medium">{order.producedPcs?.toLocaleString()} PCS</div>
                            </div>
                          ) : (
                            <div className="font-bold text-gray-900">{order.producedPcs?.toLocaleString()} PCS</div>
                          )}
                        </td>

                        {/* Balance */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {order.balanceQty === 0 && order.balancePcs === 0 ? (
                            <span className="font-bold text-gray-700">0</span>
                          ) : isDualUom ? (
                            <div>
                              <div className="font-bold text-gray-900">{order.balanceQty} GBL</div>
                              <div className="text-[11px] text-gray-400 font-medium">{order.balancePcs?.toLocaleString()} PCS</div>
                            </div>
                          ) : (
                            <div className="font-bold text-gray-900">{order.balancePcs?.toLocaleString()} PCS</div>
                          )}
                        </td>

                        {/* Material badge */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {order.materialStatus === 'Ready' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">
                              Shortage
                            </span>
                          )}
                        </td>

                        {/* Status with Progress bar */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <div className="flex flex-col space-y-1.5">
                            <div>
                              {order.status === 'In Production' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/60">
                                  In Production
                                </span>
                              )}
                              {order.status === 'Planned' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                                  Planned
                                </span>
                              )}
                              {order.status === 'Completed' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                  Completed
                                </span>
                              )}
                              {order.status === 'Not Started' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                                  Not Started
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-2">
                              <div className="w-20 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-1.5 rounded-full transition-all duration-300 ${
                                    order.progress === 100 
                                      ? 'bg-blue-600' 
                                      : order.progress > 0 
                                        ? 'bg-blue-600' 
                                        : 'bg-gray-300'
                                  }`}
                                  style={{ width: `${order.progress}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-gray-400 font-semibold">{order.progress}%</span>
                            </div>
                          </div>
                        </td>

                        {/* Department */}
                        <td className="py-3.5 px-3 text-gray-700 font-medium whitespace-nowrap">
                          {order.department}
                        </td>

                        {/* Due Date */}
                        <td className="py-3.5 px-3 text-gray-700 font-medium whitespace-nowrap">
                          {order.requiredCompletionDate}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center space-x-1">
                            {/* View / Eye */}
                            <button
                              onClick={() => onViewOrder(order)}
                              title="View Details"
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Edit / Record Entries */}
                            <button
                              onClick={() => onRecordEntries(order)}
                              title="Record Production Entries / Edit"
                              className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>

                            {/* More Options */}
                            <div className="relative">
                              <button
                                onClick={() => setActionMenuOrderId(actionMenuOrderId === order._id ? null : order._id)}
                                title="More actions"
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>

                              {actionMenuOrderId === order._id && (
                                <div 
                                  className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-gray-200 shadow-lg py-1.5 z-30 text-left"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => {
                                      setActionMenuOrderId(null);
                                      onViewOrder(order);
                                    }}
                                    className="w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-gray-400" />
                                    <span>View Overview</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setActionMenuOrderId(null);
                                      onRecordEntries(order);
                                    }}
                                    className="w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Record Entries</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setActionMenuOrderId(null);
                                      onPrintOrder(order);
                                    }}
                                    className="w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                                  >
                                    <Printer className="w-3.5 h-3.5 text-blue-500" />
                                    <span>Print Order</span>
                                  </button>

                                  <div className="border-t border-gray-100 my-1"></div>

                                  <button
                                    onClick={() => {
                                      setActionMenuOrderId(null);
                                      if (window.confirm(`Delete production order ${order.orderNumber}?`)) {
                                        onDeleteOrder(order._id);
                                      }
                                    }}
                                    className="w-full px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center space-x-2"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                    <span>Delete Order</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Pagination */}
          <div className="px-6 py-3.5 bg-white border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
            <div>
              Showing <span className="font-semibold text-gray-700">{totalOrders === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + rowsPerPage, totalOrders)}</span> of <span className="font-semibold text-gray-700">{totalOrders}</span> orders
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1.5">
                <span>Rows</span>
                <select
                  value={rowsPerPage}
                  onChange={e => {
                    setRowsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div>
                Page <span className="font-semibold text-gray-700">{currentPage}</span> of <span className="font-semibold text-gray-700">{totalPages}</span>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Tally Keyboard Shortcut Status Bar */}
          <div className="bg-slate-900 text-slate-300 px-4 py-2 border-t border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3 select-none">
            <div className="flex items-center space-x-3 text-[11px] overflow-x-auto py-0.5">
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+C</kbd>
                <span className="text-slate-300">New Order</span>
              </span>
              <span className="text-slate-700">•</span>
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">↑ / ↓</kbd>
                <span className="text-slate-300">Navigate Rows</span>
              </span>
              <span className="text-slate-700">•</span>
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">↵ Enter</kbd>
                <span className="text-slate-300">View Details</span>
              </span>
              <span className="text-slate-700">•</span>
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+E</kbd>
                <span className="text-slate-300">Record Entry</span>
              </span>
              <span className="text-slate-700">•</span>
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+P</kbd>
                <span className="text-slate-300">Print</span>
              </span>
              <span className="text-slate-700">•</span>
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">/</kbd>
                <span className="text-slate-300">Search</span>
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Showing <strong className="text-white">{startIndex + 1}</strong> - <strong className="text-white">{Math.min(startIndex + rowsPerPage, totalOrders)}</strong> of <strong className="text-white">{totalOrders}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

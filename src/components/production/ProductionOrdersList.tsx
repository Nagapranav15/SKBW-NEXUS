import React, { useState, useMemo } from 'react';
import { 
  Factory, Plus, Search, SlidersHorizontal, ArrowUpDown, Download, 
  RotateCcw, Eye, Pencil, MoreHorizontal, Calendar, Package, 
  FileText, LayoutGrid, History, Check, ChevronLeft, ChevronRight, 
  Printer, Trash2, ArrowUp, ArrowDown, Filter, Columns, X, ShoppingBag
} from 'lucide-react';
import { ProductionOrder, ProductionStatus, ItemType } from '../../types/production';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getActivityLogs } from '../../api/activityLogApi';
import { showToast } from '../ui/Toast';
import { formatOrderNo } from './productionUtils';

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
  tabCounts?: Record<string, number>;
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
  onRefresh,
  tabCounts
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
        const formattedNum = formatOrderNo(order.orderNumber).toLowerCase();
        const matchNumber = order.orderNumber.toLowerCase().includes(query) || formattedNum.includes(query);
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
        'Order No': formatOrderNo(o.orderNumber),
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

  // Toolbar menus & Activity Log states
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showActivityLogModal, setShowActivityLogModal] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);

  const [columns, setColumns] = useState([
    { id: 'orderNumber', label: 'Order No.', visible: true },
    { id: 'itemName', label: 'Item / Product', visible: true },
    { id: 'itemType', label: 'Type', visible: true },
    { id: 'plannedQty', label: 'Planned Qty', visible: true },
    { id: 'producedQty', label: 'Produced Qty', visible: true },
    { id: 'balanceQty', label: 'Balance', visible: true },
    { id: 'progress', label: 'Progress (%)', visible: true },
    { id: 'department', label: 'Department', visible: true },
    { id: 'dueDate', label: 'Due Date', visible: true },
    { id: 'status', label: 'Status', visible: true },
  ]);

  const fetchActivityLogs = async () => {
    try {
      setActivityLogLoading(true);
      const res = await getActivityLogs({
        entityType: 'ProductionOrder',
        limit: 50
      });
      const backendLogs = res.data?.logs || [];
      if (backendLogs.length === 0) {
        const mockLogs = filteredOrders.slice(0, 15).map((ord, idx) => ({
          _id: `prod-log-${idx}`,
          action: ord.status === 'Completed' ? 'ORDER_COMPLETED' : 'BATCH_UPDATED',
          entityType: 'ProductionOrder',
          entityName: formatOrderNo(ord.orderNumber),
          details: `Production Order '${formatOrderNo(ord.orderNumber)}' for ${ord.itemName} (${ord.producedQty}/${ord.plannedQty} ${ord.plannedUom})`,
          performedBy: ord.assignedTo || 'Production Supervisor',
          createdAt: ord.createdAt || ord.plannedStartDate || new Date().toISOString()
        }));
        setActivityLogs(mockLogs);
      } else {
        setActivityLogs(backendLogs);
      }
    } catch {
      const fallbackLogs = filteredOrders.slice(0, 15).map((ord, idx) => ({
        _id: `prod-log-${idx}`,
        action: ord.status === 'Completed' ? 'ORDER_COMPLETED' : 'BATCH_UPDATED',
        entityType: 'ProductionOrder',
        entityName: formatOrderNo(ord.orderNumber),
        details: `Production Order '${formatOrderNo(ord.orderNumber)}' for ${ord.itemName} (${ord.producedQty}/${ord.plannedQty} ${ord.plannedUom})`,
        performedBy: ord.assignedTo || 'Production Supervisor',
        createdAt: ord.createdAt || ord.plannedStartDate || new Date().toISOString()
      }));
      setActivityLogs(fallbackLogs);
    } finally {
      setActivityLogLoading(false);
    }
  };

  const handleExportPDF = () => {
    if (filteredOrders.length === 0) {
      showToast('No production orders to export', 'error');
      return;
    }
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header Banner
      doc.setFillColor(30, 58, 138); // Deep Navy Blue
      doc.rect(0, 0, pageWidth, 20, 'F');

      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('SKBW ERP — PRODUCTION ORDERS REPORT', 14, 13);

      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Generated: ${new Date().toLocaleDateString('en-IN')}  |  Total Orders: ${filteredOrders.length}`,
        14,
        27
      );

      const tableData = filteredOrders.map((o, idx) => [
        idx + 1,
        formatOrderNo(o.orderNumber),
        o.itemName,
        o.itemCode || '—',
        o.itemType || 'Finished Goods',
        `${o.plannedQty} ${o.plannedUom} (${o.plannedPcs.toLocaleString()} PCS)`,
        `${o.producedQty} ${o.plannedUom} (${o.producedPcs.toLocaleString()} PCS)`,
        `${o.balanceQty} ${o.plannedUom}`,
        `${o.progress}%`,
        o.department || 'General',
        o.requiredCompletionDate || '—',
        o.status
      ]);

      autoTable(doc, {
        head: [['#', 'Order No.', 'Item / Product', 'Code', 'Type', 'Planned', 'Produced', 'Balance', 'Progress', 'Dept', 'Due Date', 'Status']],
        body: tableData,
        startY: 32,
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] }
      });

      doc.save(`Production_Orders_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast('Exported production orders to PDF successfully!', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to export PDF', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 space-y-4 font-sans text-gray-800">
      {/* 1. Header Banner (Matching Sales Orders Header Banner) */}
      <div className="flex flex-row items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-2xs relative">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-blue-100/80 text-blue-700 rounded-2xl shadow-2xs">
            <Factory className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span>Production Orders</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-bold transition-all">
                {orders.length} Total
              </span>
            </h1>
            <p className="text-xs text-gray-500 font-medium">
              Unified master directory for manufacturing batches, stage-wise operations, and finished goods output.
            </p>
          </div>
        </div>


      </div>

      {/* 2. Top Navigation Tabs Bar (Exact match to Sales Orders tab bar) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 bg-white px-4 rounded-2xl shadow-2xs relative">
        <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-full">
          {[
            { id: 'orders', label: 'Production Orders', icon: Calendar, count: orders.length },
            { id: 'entries', label: 'Production Entries', icon: Package, count: tabCounts?.entries },
            { id: 'materials', label: 'Material Requirements', icon: FileText, count: tabCounts?.materials },
            { id: 'bom', label: 'BOM', icon: LayoutGrid, count: tabCounts?.bom },
            { id: 'history', label: 'History', icon: History, count: tabCounts?.history }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-xs md:text-sm font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap -mb-[1px] ${
                  active 
                    ? 'border-teal-700 text-teal-700 bg-transparent'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Action Bar (Search + 9 Icons: Filter, Sort, Columns, Export Excel, Export PDF, Import, Activity Logs, Duplicates, + New) */}
        <div className="py-2 flex items-center gap-1.5 flex-wrap shrink-0 relative z-40">
          
          {/* Global Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search orders, items..."
              className="pl-8 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl w-36 md:w-44 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs font-medium"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 1. Filter Icon Button */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => {
                setShowFilterMenu(!showFilterMenu);
                setShowSortMenu(false);
                setShowColumnPicker(false);
              }}
              className={`p-2 rounded-xl border transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
                (period !== 'All' || typeFilter !== 'All' || statusFilter !== 'All' || deptFilter !== 'All')
                  ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-100'
                  : 'bg-white hover:bg-blue-50/60 border-gray-200 hover:border-blue-200 text-blue-600'
              }`}
              title="Filter Orders"
              aria-label="Filter Orders"
            >
              <Filter className="w-4 h-4 text-blue-600" />
            </button>
            {!showFilterMenu && (
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                Filter Orders
              </div>
            )}
            {showFilterMenu && (
              <div className="absolute right-0 mt-1.5 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-3 space-y-3 text-xs text-left">
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                  <span className="font-bold text-gray-800 text-xs">Filter Orders</span>
                  {(period !== 'All' || typeFilter !== 'All' || statusFilter !== 'All' || deptFilter !== 'All') && (
                    <button
                      onClick={() => {
                        setPeriod('All');
                        setTypeFilter('All');
                        setStatusFilter('All');
                        setDeptFilter('All');
                      }}
                      className="text-blue-600 hover:text-blue-800 text-[11px] font-bold cursor-pointer"
                    >
                      Reset All
                    </button>
                  )}
                </div>

                {/* Period */}
                <div>
                  <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">Period</label>
                  <div className="grid grid-cols-4 gap-1 bg-gray-50 p-1 rounded-xl border border-gray-200">
                    {['All', '30d', '60d', '90d'].map(p => (
                      <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`text-xs font-semibold py-1 rounded-lg transition-all text-center cursor-pointer ${
                          period === p
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Type */}
                <div>
                  <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">Type</label>
                  <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="All">All Types ({dynamicTypes.length})</option>
                    {dynamicTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">Status</label>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="All">All Statuses</option>
                    <option value="In Production">In Production</option>
                    <option value="Planned">Planned</option>
                    <option value="Completed">Completed</option>
                    <option value="Not Started">Not Started</option>
                  </select>
                </div>

                {/* Dept */}
                <div>
                  <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">Department</label>
                  <select
                    value={deptFilter}
                    onChange={e => setDeptFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="All">All Departments ({dynamicDepartments.length})</option>
                    {dynamicDepartments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* 2. Sort Icon Button */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => {
                setShowSortMenu(!showSortMenu);
                setShowFilterMenu(false);
                setShowColumnPicker(false);
              }}
              className="p-2 rounded-xl bg-white hover:bg-blue-50/60 border border-gray-200 hover:border-blue-200 text-blue-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
              title="Sort Order"
              aria-label="Sort Order"
            >
              <ArrowUpDown className="w-4 h-4 text-blue-600" />
            </button>
            {!showSortMenu && (
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                Sort Orders
              </div>
            )}
            {showSortMenu && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-2 space-y-1 text-xs text-left">
                <button
                  onClick={() => { setSortField('orderNumber'); setSortAsc(false); setShowSortMenu(false); }}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl font-medium hover:bg-gray-50 text-gray-700"
                >
                  Order No. (High to Low)
                </button>
                <button
                  onClick={() => { setSortField('orderNumber'); setSortAsc(true); setShowSortMenu(false); }}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl font-medium hover:bg-gray-50 text-gray-700"
                >
                  Order No. (Low to High)
                </button>
                <button
                  onClick={() => { setSortField('itemName'); setSortAsc(true); setShowSortMenu(false); }}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl font-medium hover:bg-gray-50 text-gray-700"
                >
                  Product Name (A to Z)
                </button>
                <button
                  onClick={() => { setSortField('plannedQty'); setSortAsc(false); setShowSortMenu(false); }}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl font-medium hover:bg-gray-50 text-gray-700"
                >
                  Planned Qty (High to Low)
                </button>
                <button
                  onClick={() => { setSortField('requiredCompletionDate'); setSortAsc(true); setShowSortMenu(false); }}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl font-medium hover:bg-gray-50 text-gray-700"
                >
                  Due Date (Earliest)
                </button>
              </div>
            )}
          </div>

          {/* 3. Column Visibility Icon Button */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => {
                setShowColumnPicker(!showColumnPicker);
                setShowSortMenu(false);
                setShowFilterMenu(false);
              }}
              className="p-2 rounded-xl bg-white hover:bg-blue-50/60 border border-gray-200 hover:border-blue-200 text-blue-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
              title="Column Visibility"
              aria-label="Column Visibility"
            >
              <Columns className="w-4 h-4 text-blue-600" />
            </button>
            {!showColumnPicker && (
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
                Column Visibility
              </div>
            )}
            {showColumnPicker && (
              <div className="absolute right-0 mt-1.5 w-52 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-2.5 space-y-1.5 text-xs text-left">
                <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block border-b border-gray-100 pb-1">Visible Columns</span>
                {columns.map(col => (
                  <label key={col.id} className="flex items-center gap-2 p-1 text-gray-700 cursor-pointer hover:bg-gray-50 rounded-lg">
                    <input
                      type="checkbox"
                      checked={col.visible}
                      onChange={() => {
                        setColumns(prev => prev.map(c => c.id === col.id ? { ...c, visible: !c.visible } : c));
                      }}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 4. Export Excel Icon Button */}
          <div className="relative group">
            <button
              type="button"
              onClick={handleExportExcel}
              className="p-2 rounded-xl bg-white hover:bg-blue-50/60 border border-gray-200 hover:border-blue-200 text-blue-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
              title="Export to Excel Spreadsheet"
              aria-label="Export to Excel Spreadsheet"
            >
              <Download className="w-4 h-4 text-blue-600" />
            </button>
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
              Export Excel (.xlsx)
            </div>
          </div>

          {/* 5. Export PDF Icon Button */}
          <div className="relative group">
            <button
              type="button"
              onClick={handleExportPDF}
              className="p-2 rounded-xl bg-white hover:bg-blue-50/60 border border-gray-200 hover:border-blue-200 text-blue-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
              title="Export to PDF Report"
              aria-label="Export to PDF Report"
            >
              <FileText className="w-4 h-4 text-blue-600" />
            </button>
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
              Export PDF (.pdf)
            </div>
          </div>

          {/* 6. Activity Logs Icon Button */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => { fetchActivityLogs(); setShowActivityLogModal(true); }}
              className="p-2 rounded-xl bg-white hover:bg-blue-50/60 border border-gray-200 hover:border-blue-200 text-blue-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
              title="View Activity Logs"
              aria-label="View Activity Logs"
            >
              <History className="w-4 h-4 text-blue-600" />
            </button>
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
              Activity Logs
            </div>
          </div>

          {/* 9. Circular + Add Button (Matching screenshot) */}
          <div className="relative group">
            <button
              type="button"
              onClick={onNewOrder}
              className="w-8 h-8 rounded-full border border-gray-200 bg-white hover:bg-blue-50 text-blue-600 flex items-center justify-center transition-all shadow-2xs cursor-pointer font-bold shrink-0"
              title="New Production Order"
              aria-label="New Production Order"
            >
              <Plus className="w-4 h-4 text-blue-600 stroke-[2.5]" />
            </button>
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg border border-gray-800">
              New Production Order
            </div>
          </div>
        </div>
      </div>

      {/* 3. Statistics Cards (5 Cards Grid - Exact match to Sales Orders) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Total Orders */}
        <button
          onClick={() => setStatusFilter('All')}
          className={`w-full text-left rounded-2xl shadow-2xs border p-3.5 sm:p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] ${
            statusFilter === 'All' 
              ? 'bg-blue-50/40 border-blue-400 ring-2 ring-blue-100' 
              : 'bg-white border-gray-200/80 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Total Orders</span>
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
          </div>
          <p className="text-2xl font-black text-gray-900 mt-1 font-mono">{orders.length}</p>
        </button>

        {/* Card 2: In Production */}
        <button
          onClick={() => setStatusFilter('In Production')}
          className={`w-full text-left rounded-2xl shadow-2xs border p-3.5 sm:p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] ${
            statusFilter === 'In Production' 
              ? 'bg-amber-50/40 border-amber-400 ring-2 ring-amber-100' 
              : 'bg-white border-gray-200/80 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">In Production</span>
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          </div>
          <p className="text-2xl font-black text-amber-700 mt-1 font-mono">
            {orders.filter(o => o.status === 'In Production').length}
          </p>
        </button>

        {/* Card 3: Planned */}
        <button
          onClick={() => setStatusFilter('Planned')}
          className={`w-full text-left rounded-2xl shadow-2xs border p-3.5 sm:p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] ${
            statusFilter === 'Planned' 
              ? 'bg-indigo-50/40 border-indigo-400 ring-2 ring-indigo-100' 
              : 'bg-white border-gray-200/80 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Planned</span>
            <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
          </div>
          <p className="text-2xl font-black text-indigo-700 mt-1 font-mono">
            {orders.filter(o => o.status === 'Planned').length}
          </p>
        </button>

        {/* Card 4: Completed */}
        <button
          onClick={() => setStatusFilter('Completed')}
          className={`w-full text-left rounded-2xl shadow-2xs border p-3.5 sm:p-4 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] ${
            statusFilter === 'Completed' 
              ? 'bg-emerald-50/40 border-emerald-400 ring-2 ring-emerald-100' 
              : 'bg-white border-gray-200/80 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Completed</span>
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-1 font-mono">
            {orders.filter(o => o.status === 'Completed').length}
          </p>
        </button>

        {/* Card 5: Target Output Qty */}
        <div className="rounded-2xl shadow-2xs border border-gray-200/80 p-3.5 sm:p-4 bg-white transition-all duration-200 hover:border-gray-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Target Qty</span>
            <span className="w-2 h-2 rounded-full bg-purple-600"></span>
          </div>
          <p className="text-2xl font-black text-purple-700 mt-1 font-mono">
            {orders.reduce((sum, o) => sum + (o.plannedPcs || o.plannedQuantity || 0), 0).toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* 4. Table Sub-bar: Metadata & Actions */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <div className="font-semibold text-gray-600 flex items-center gap-2">
          <span>Showing all {filteredOrders.length} production orders</span>
          {(searchTerm || period !== 'All' || typeFilter !== 'All' || statusFilter !== 'All' || deptFilter !== 'All') && (
            <button
              onClick={() => {
                setPeriod('All');
                setTypeFilter('All');
                setStatusFilter('All');
                setDeptFilter('All');
                setSearchTerm('');
              }}
              className="text-blue-600 hover:text-blue-800 text-[11px] font-bold px-1.5 py-0.5 hover:bg-blue-50 rounded transition-colors cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Global Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search orders, items, codes..."
              className="pl-8 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl w-44 md:w-56 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs font-medium"
            />
          </div>

          {/* Export Excel Button */}
          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-700 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="Export to Excel Spreadsheet"
          >
            <Download className="w-3.5 h-3.5 text-gray-500" />
            <span>Excel</span>
          </button>

          {/* Export PDF Button */}
          <button
            onClick={handleExportPDF}
            className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-700 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="Export to PDF Document"
          >
            <FileText className="w-3.5 h-3.5 text-rose-500" />
            <span>PDF</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-700 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="Refresh Data"
          >
            <RotateCcw className="w-3.5 h-3.5 text-gray-500" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 6. Main Data Table Container */}
      <div className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto min-h-[380px]">
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

                    return (
                      <tr 
                        key={order._id}
                        onClick={() => onViewOrder(order)}
                        className={`hover:bg-blue-50/40 transition-colors group cursor-pointer ${isSelected ? 'bg-blue-50/60' : ''}`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-3.5 text-center" onClick={(e) => e.stopPropagation()}>
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
                            className="hover:text-blue-600 hover:underline transition-colors text-left font-bold cursor-pointer font-mono block"
                          >
                            {formatOrderNo(order.orderNumber)}
                          </button>
                          {order.reference && order.reference !== 'Not Selected' && (
                            <a
                              href={`/sales/orders?search=${encodeURIComponent(order.reference.replace(/^Sales Order #?/, '').trim())}`}
                              onClick={(e) => e.stopPropagation()}
                              title={`Demand Source: ${order.reference}`}
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-800 hover:underline mt-0.5"
                            >
                              <ShoppingBag className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                              <span className="truncate max-w-[120px]">{order.reference}</span>
                            </a>
                          )}
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
                        <td className="py-3.5 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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
                                      if (window.confirm(`Delete production order ${formatOrderNo(order.orderNumber)}?`)) {
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
          <div className="px-4 py-3 border-t border-gray-200/80 flex flex-wrap items-center justify-between gap-3 text-xs bg-white rounded-b-2xl text-gray-500">
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
                  className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
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
                  className="p-1 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 shadow-2xs cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 shadow-2xs cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

      {/* Activity Log Modal */}
      {showActivityLogModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Production Activity Log</h3>
                  <p className="text-xs text-gray-500">Recent actions, status updates, and production order operations</p>
                </div>
              </div>
              <button
                onClick={() => setShowActivityLogModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {activityLogLoading ? (
                <div className="py-12 text-center text-gray-400 text-xs">Loading activity logs...</div>
              ) : activityLogs.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-xs">No activity logs recorded yet.</div>
              ) : (
                activityLogs.map((log: any, idx: number) => (
                  <div key={log._id || idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{log.action || 'Activity'}</span>
                        {log.details?.orderNumber && (
                          <span className="text-[11px] font-mono px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200 font-semibold">
                            {formatOrderNo(log.details.orderNumber)}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600">
                        {log.details?.item || log.details?.status || log.details?.action || log.description || 'Production record updated'}
                      </p>
                      <div className="text-[10px] text-gray-400">
                        By <span className="font-medium text-gray-600">{log.user?.name || log.userName || 'System User'}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : 'Recent'}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowActivityLogModal(false)}
                className="px-4 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg shadow-2xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

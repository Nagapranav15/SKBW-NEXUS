import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, X, ArrowRightLeft, Package, AlertTriangle, Search, Download, Upload, FileText, History } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import * as invApi from '../api/inventoryApi';
import * as ledgerApi from '../api/inventoryLedgerApi';
import { getItems } from '../api/itemApi';
import { showToast } from './ui/Toast';

const InventoryManagement: React.FC = () => {
  const { selectedCompany, hasPermission } = useAuth();
  const canManage = hasPermission(['MANAGE_INVENTORY', 'MANAGE_ITEMS']);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWH, setSelectedWH] = useState<any>(null);
  const [sectionStock, setSectionStock] = useState<any>({});
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [summary, setSummary] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWHModal, setShowWHModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [editingWH, setEditingWH] = useState<any>(null);
  const [transferEntry, setTransferEntry] = useState<any>(null);
  const [whForm, setWhForm] = useState({ name: '', description: '', sections: [{ sectionId: 'SEC-A1', name: 'Section A1', x: 5, y: 5, width: 25, height: 30, color: '#e2e8f0' }] });
  const [stockForm, setStockForm] = useState({ item: '', quantity: '' });
  const [transferForm, setTransferForm] = useState({ targetWarehouse: '', targetSectionId: '', quantity: '' });
  const [searchItem, setSearchItem] = useState('');
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'ledger'>('map');

  useEffect(() => { loadData(); }, [selectedCompany]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [whRes, sumRes, itemRes] = await Promise.all([
        invApi.getWarehouses(selectedCompany?._id),
        invApi.getInventorySummary(selectedCompany?._id),
        getItems(selectedCompany?._id)
      ]);
      setWarehouses(whRes.data);
      setSummary(sumRes.data);
      setItems(itemRes.data);
      if (whRes.data.length > 0 && !selectedWH) setSelectedWH(whRes.data[0]);
      // Fetch low stock
      try {
        const lsRes = await ledgerApi.getLowStockItems(selectedCompany?._id);
        setLowStockItems(lsRes.data || []);
      } catch (_) {}
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (selectedWH) loadSectionStock();
  }, [selectedWH]);

  const loadSectionStock = async () => {
    if (!selectedWH) return;
    try {
      const res = await invApi.getInventoryByWarehouse(selectedWH._id);
      setSectionStock(res.data);
    } catch (err) { console.error(err); }
  };

  const getSectionColor = (sectionId: string) => {
    const items = sectionStock[sectionId] || [];
    if (items.length === 0) return '#f1f5f9';
    const hasLow = items.some((i: any) => i.item && i.quantity <= (i.item.minStock || 5));
    return hasLow ? '#fecaca' : '#bbf7d0';
  };

  const handleSaveWH = async () => {
    try {
      const data = { ...whForm, company: selectedCompany?._id };
      if (editingWH) { const res = await invApi.updateWarehouse(editingWH._id, data); setSelectedWH(res.data); }
      else { const res = await invApi.createWarehouse(data); setSelectedWH(res.data); }
      setShowWHModal(false); setEditingWH(null); loadData();
    } catch (err) { alert('Error saving warehouse'); }
  };

  const handleDeleteWH = async (id: string) => {
    if (!confirm('Delete this warehouse?')) return;
    await invApi.deleteWarehouse(id);
    setSelectedWH(null); setSelectedSection(null); loadData();
  };

  const handleAddStock = async () => {
    if (!stockForm.item || !stockForm.quantity || !selectedSection || !selectedWH) return;
    try {
      await invApi.addStock({ item: stockForm.item, warehouse: selectedWH._id, sectionId: selectedSection, quantity: Number(stockForm.quantity), company: selectedCompany?._id });
      setShowStockModal(false); setStockForm({ item: '', quantity: '' }); loadSectionStock(); loadData();
      showToast('Stock added successfully', 'success');
    } catch (err: any) { showToast(err.response?.data?.msg || 'Error adding stock', 'error'); }
  };

  const handleRemoveStock = async (id: string) => {
    if (!confirm('Remove this stock entry?')) return;
    await invApi.removeStock(id); loadSectionStock(); loadData();
  };

  const handleTransfer = async () => {
    if (!transferEntry || !transferForm.targetWarehouse || !transferForm.targetSectionId || !transferForm.quantity) return;
    try {
      await invApi.transferStock(transferEntry._id, transferForm.targetWarehouse, transferForm.targetSectionId, Number(transferForm.quantity));
      setShowTransferModal(false); setTransferEntry(null); setTransferForm({ targetWarehouse: '', targetSectionId: '', quantity: '' }); loadSectionStock(); loadData();
      showToast('Stock transferred successfully', 'success');
    } catch (err: any) { showToast(err.response?.data?.msg || 'Transfer failed', 'error'); }
  };

  const handleExportCSV = async () => {
    try {
      const res = await ledgerApi.exportInventory(selectedCompany?._id);
      const rows = res.data;
      if (!rows || rows.length === 0) { showToast('No data to export', 'warning'); return; }
      const headers = Object.keys(rows[0]);
      const csv = [headers.join(','), ...rows.map((r: any) => headers.map(h => `"${r[h] || ''}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
      showToast('CSV exported successfully', 'success');
    } catch (err) { showToast('Export failed', 'error'); }
  };

  const handleViewAuditLogs = async () => {
    try {
      const res = await ledgerApi.getAuditLogs({ companyId: selectedCompany?._id, limit: 50 });
      setAuditLogs(res.data.logs || []);
      setShowAuditModal(true);
    } catch (err) { showToast('Failed to load audit logs', 'error'); }
  };

  const addSection = () => {
    const idx = whForm.sections.length + 1;
    setWhForm(f => ({ ...f, sections: [...f.sections, { sectionId: `SEC-${String.fromCharCode(64 + idx)}1`, name: `Section ${String.fromCharCode(64 + idx)}1`, x: (idx * 15) % 80, y: 5 + Math.floor(idx / 4) * 35, width: 25, height: 30, color: '#e2e8f0' }] }));
  };

  const removeSection = (idx: number) => setWhForm(f => ({ ...f, sections: f.sections.filter((_, i) => i !== idx) }));

  const totalItems = summary.reduce((s, i) => s + 1, 0);
  const totalQty = summary.reduce((s, i) => s + (i.totalQuantity || 0), 0);
  const lowStock = summary.filter(i => i.item && i.totalQuantity <= (i.item.minStock || 5)).length;

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[400px]"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;

  const currentSectionItems = selectedSection ? (sectionStock[selectedSection] || []) : [];
  const targetSections = transferForm.targetWarehouse ? (warehouses.find(w => w._id === transferForm.targetWarehouse)?.sections || []) : [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1><p className="text-gray-600 text-sm mt-1">Warehouse maps & stock tracking</p></div>
        <div className="flex items-center gap-2">
          <button onClick={handleViewAuditLogs} className="flex items-center space-x-1 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50" title="Audit Logs"><History className="w-4 h-4 text-gray-600" /><span className="hidden sm:inline">Audit</span></button>
          <button onClick={handleExportCSV} className="flex items-center space-x-1 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50" title="Export CSV"><Download className="w-4 h-4 text-gray-600" /><span className="hidden sm:inline">Export</span></button>
          {canManage && <button onClick={() => { setEditingWH(null); setWhForm({ name: '', description: '', sections: [{ sectionId: 'SEC-A1', name: 'Section A1', x: 5, y: 5, width: 25, height: 30, color: '#e2e8f0' }] }); setShowWHModal(true); }} className="flex items-center space-x-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><Plus className="w-4 h-4" /><span>Add Warehouse</span></button>}
        </div>
      </div>

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-amber-600" /><span className="text-sm font-semibold text-amber-800">Low Stock Alert ({lowStockItems.length} items)</span></div>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.slice(0, 5).map((item: any, i: number) => (
              <span key={i} className={`px-2 py-1 rounded text-xs font-medium ${item.isOutOfStock ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                {item.name}: {item.currentStock}/{item.minimumStock}
              </span>
            ))}
            {lowStockItems.length > 5 && <span className="text-xs text-amber-600">+{lowStockItems.length - 5} more</span>}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100"><p className="text-sm text-gray-500">Warehouses</p><p className="text-2xl font-bold text-gray-900">{warehouses.length}</p></div>
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100"><p className="text-sm text-gray-500">Items Tracked</p><p className="text-2xl font-bold text-blue-600">{totalItems}</p></div>
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100"><p className="text-sm text-gray-500">Total Quantity</p><p className="text-2xl font-bold text-green-600">{totalQty}</p></div>
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex items-center justify-between"><div><p className="text-sm text-gray-500">Low Stock</p><p className="text-2xl font-bold text-red-600">{lowStock}</p></div>{lowStock > 0 && <AlertTriangle className="w-6 h-6 text-red-400" />}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Warehouse map */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <select value={selectedWH?._id || ''} onChange={e => { const wh = warehouses.find(w => w._id === e.target.value); setSelectedWH(wh || null); setSelectedSection(null); }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                <option value="">Select Warehouse</option>
                {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
              {selectedWH && <span className="text-xs text-gray-400">{selectedWH.sections?.length || 0} sections</span>}
            </div>
            {selectedWH && canManage && (
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditingWH(selectedWH); setWhForm({ name: selectedWH.name, description: selectedWH.description || '', sections: selectedWH.sections || [] }); setShowWHModal(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg"><Edit className="w-4 h-4 text-blue-600" /></button>
                <button onClick={() => handleDeleteWH(selectedWH._id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-500" /></button>
              </div>
            )}
          </div>

          {/* Map View */}
          <div className="p-4">
            {selectedWH ? (
              <div className="relative bg-gray-50 rounded-lg border-2 border-dashed border-gray-200" style={{ height: 350 }}>
                {(selectedWH.sections || []).map((sec: any) => {
                  const color = getSectionColor(sec.sectionId);
                  const isSelected = selectedSection === sec.sectionId;
                  const itemCount = (sectionStock[sec.sectionId] || []).length;
                  return (
                    <div key={sec.sectionId} onClick={() => setSelectedSection(sec.sectionId)}
                      className={`absolute cursor-pointer rounded-lg border-2 flex flex-col items-center justify-center transition-all hover:shadow-md ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'}`}
                      style={{ left: `${sec.x}%`, top: `${sec.y}%`, width: `${sec.width}%`, height: `${sec.height}%`, backgroundColor: color }}>
                      <p className="text-xs font-semibold text-gray-800">{sec.name}</p>
                      <p className="text-[10px] text-gray-500">{itemCount} items</p>
                    </div>
                  );
                })}
                {(selectedWH.sections || []).length === 0 && <p className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">No sections — edit warehouse to add</p>}
                <div className="absolute bottom-2 right-2 flex items-center gap-3 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 border border-green-300"></span>OK</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 border border-red-300"></span>Low</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 border border-gray-300"></span>Empty</span>
                </div>
              </div>
            ) : <p className="text-center text-gray-400 py-20">Select or create a warehouse</p>}
          </div>
        </div>

        {/* Right: Section Stock */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">{selectedSection ? `Section: ${selectedWH?.sections?.find((s: any) => s.sectionId === selectedSection)?.name || selectedSection}` : 'Select a Section'}</h3>
              {selectedSection && canManage && <button onClick={() => { setStockForm({ item: '', quantity: '' }); setShowStockModal(true); }} className="flex items-center space-x-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"><Plus className="w-3 h-3" /><span>Add</span></button>}
            </div>
          </div>
          <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
            {selectedSection ? (
              currentSectionItems.length > 0 ? currentSectionItems.map((entry: any) => (
                <div key={entry._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{entry.item?.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">{entry.item?.itemId} · {entry.item?.primaryUnit}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${entry.quantity <= (entry.item?.minStock || 5) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{entry.quantity}</span>
                    {canManage && <button onClick={() => { setTransferEntry(entry); setTransferForm({ targetWarehouse: '', targetSectionId: '', quantity: '' }); setShowTransferModal(true); }} className="p-1 hover:bg-blue-50 rounded" title="Transfer"><ArrowRightLeft className="w-3.5 h-3.5 text-blue-600" /></button>}
                    {canManage && <button onClick={() => handleRemoveStock(entry._id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
                  </div>
                </div>
              )) : <p className="text-gray-400 text-sm text-center py-8">No items in this section</p>
            ) : <p className="text-gray-400 text-sm text-center py-8">Click a section on the map</p>}
          </div>

          {/* Item search in summary */}
          <div className="p-4 border-t border-gray-100">
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
              <input value={searchItem} onChange={e => setSearchItem(e.target.value)} placeholder="Search items..." className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs" />
            </div>
            <div className="max-h-[150px] overflow-y-auto space-y-1">
              {summary.filter(s => !searchItem || s.item?.name?.toLowerCase().includes(searchItem.toLowerCase())).slice(0, 10).map((s, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-1.5 hover:bg-gray-50 rounded">
                  <span className="text-gray-700 truncate">{s.item?.name}</span>
                  <span className="font-medium text-gray-900 ml-2">{s.totalQuantity}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Warehouse Modal */}
      {showWHModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">{editingWH ? 'Edit Warehouse' : 'Add Warehouse'}</h3><button onClick={() => setShowWHModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label><input value={whForm.name} onChange={e => setWhForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><input value={whForm.description} onChange={e => setWhForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div className="flex items-center justify-between"><label className="text-sm font-medium text-gray-700">Sections</label><button onClick={addSection} className="text-xs text-blue-600 hover:text-blue-700">+ Add Section</button></div>
              {whForm.sections.map((sec, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <input value={sec.sectionId} onChange={e => { const s = [...whForm.sections]; s[idx] = { ...s[idx], sectionId: e.target.value }; setWhForm(f => ({ ...f, sections: s })); }} className="w-20 px-2 py-1 border border-gray-200 rounded text-xs" placeholder="ID" />
                  <input value={sec.name} onChange={e => { const s = [...whForm.sections]; s[idx] = { ...s[idx], name: e.target.value }; setWhForm(f => ({ ...f, sections: s })); }} className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs" placeholder="Name" />
                  <button onClick={() => removeSection(idx)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                </div>
              ))}
            </div>
            <div className="flex justify-end space-x-3 mt-5">
              <button onClick={() => setShowWHModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
              <button onClick={handleSaveWH} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">{editingWH ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Stock Modal */}
      {showStockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">Add Stock</h3><button onClick={() => setShowStockModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
                <select value={stockForm.item} onChange={e => setStockForm(f => ({ ...f, item: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">Select item...</option>
                  {items.filter(i => i.status === 'active').map(i => <option key={i._id} value={i._id}>{i.name} ({i.itemId})</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label><input type="number" value={stockForm.quantity} onChange={e => setStockForm(f => ({ ...f, quantity: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" min="1" /></div>
            </div>
            <div className="flex justify-end space-x-3 mt-5">
              <button onClick={() => setShowStockModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
              <button onClick={handleAddStock} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">Transfer Stock</h3><button onClick={() => setShowTransferModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <p className="text-sm text-gray-600 mb-3">Moving: <strong>{transferEntry?.item?.name}</strong> (Available: {transferEntry?.quantity})</p>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Target Warehouse</label>
                <select value={transferForm.targetWarehouse} onChange={e => setTransferForm(f => ({ ...f, targetWarehouse: e.target.value, targetSectionId: '' }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">Select...</option>
                  {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Target Section</label>
                <select value={transferForm.targetSectionId} onChange={e => setTransferForm(f => ({ ...f, targetSectionId: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">Select...</option>
                  {targetSections.map((s: any) => <option key={s.sectionId} value={s.sectionId}>{s.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label><input type="number" value={transferForm.quantity} onChange={e => setTransferForm(f => ({ ...f, quantity: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" min="1" max={transferEntry?.quantity} /></div>
            </div>
            <div className="flex justify-end space-x-3 mt-5">
              <button onClick={() => setShowTransferModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
              <button onClick={handleTransfer} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Transfer</button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">Inventory Audit Logs</h3><button onClick={() => setShowAuditModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="overflow-y-auto flex-1 space-y-2">
              {auditLogs.length > 0 ? auditLogs.map((log: any) => (
                <div key={log._id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{log.item?.name || 'Unknown'}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      log.action_type === 'IN' ? 'bg-green-100 text-green-700' :
                      log.action_type === 'OUT' ? 'bg-red-100 text-red-700' :
                      log.action_type?.includes('TRANSFER') ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{log.action_type}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{log.quantity_before} → {log.quantity_after} (Δ{log.change_amount > 0 ? '+' : ''}{log.change_amount})</span>
                    <span>{log.performed_by?.fullName || 'System'}</span>
                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  {log.reason && <p className="text-xs text-gray-400 mt-1">{log.reason}</p>}
                </div>
              )) : <p className="text-gray-400 text-sm text-center py-8">No audit logs found</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryManagement;

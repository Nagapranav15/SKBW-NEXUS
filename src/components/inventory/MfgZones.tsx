import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Trash2, Edit, X, Search, Factory, Layers, MapPin,
  RefreshCw, ChevronDown, ChevronRight, Package, IndianRupee,
  Building2, Filter, Clock, AlertTriangle, CheckCircle, Eye
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as mfgApi from '../../api/mfgApi';
import { showToast } from '../ui/Toast';
import ZoneDetail from './ZoneDetail';
import { getActivityLogs, createActivityLog } from '../../api/activityLogApi';

// ─── Small helpers ────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) ?? '0';

const fmtCurrency = (n: number) =>
  '₹' + (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

// ─── Top stat card (compact) ─────────────────────────────────────────────────
const StatCard = ({
  label, value, icon, iconBg, viewAll, onViewAll
}: {
  label: string; value: string | number;
  icon: React.ReactNode; iconBg: string;
  viewAll?: boolean; onViewAll?: () => void;
}) => (
  <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-2.5 min-w-0 hover:shadow-sm transition-shadow">
    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-xs text-gray-500 font-medium leading-none">{label}</p>
      <p className="text-xl font-bold text-gray-900 leading-snug">{value}</p>
      {viewAll && (
        <button onClick={onViewAll}
          className="text-xs text-blue-600 hover:underline font-medium leading-none">
          View all
        </button>
      )}
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const MfgZones: React.FC = () => {
  const { selectedCompany, hasPermission } = useAuth();
  const canManage = hasPermission('MANAGE_INVENTORY');

  // Data
  const [factories, setFactories] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [zoneStockMap, setZoneStockMap] = useState<any>({});
  const [loading, setLoading] = useState(true);

  // Tree collapse state  { factoryId: bool, floorId: bool }
  const [expandedFactories, setExpandedFactories] = useState<Record<string, boolean>>({});
  const [expandedFloors, setExpandedFloors] = useState<Record<string, boolean>>({});

  // Search / filter
  const [search, setSearch] = useState('');

  // Selection
  const [selectedZone, setSelectedZone] = useState<any>(null);

  // Modal
  const [showModal, setShowModal] = useState<'factory' | 'floor' | 'zone' | null>(null);
  const [form, setForm] = useState<any>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showStockDetailModal, setShowStockDetailModal] = useState(false);
  const [showViewAllModal, setShowViewAllModal] = useState<'factories' | 'floors' | 'zones' | 'locations' | null>(null);
  const [highlightedViewAllIdx, setHighlightedViewAllIdx] = useState<number>(-1);
  const [treeHighlight, setTreeHighlight] = useState<{ type: 'factory' | 'floor' | 'zone'; id: string } | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // New Utility Panel States
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);

  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
  const [highlightedDuplicateIdx, setHighlightedDuplicateIdx] = useState(0);

  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [deletedItems, setDeletedItems] = useState<any[]>([]);
  const [highlightedRecycleIdx, setHighlightedRecycleIdx] = useState(0);
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);

  // ── Activity Logging Helper ──────────────────────────────────────────────
  const logActivity = useCallback(async (action: string, name: string, details: string) => {
    if (!selectedCompany) return;
    try {
      await createActivityLog({
        action,
        entityType: 'inventory_zone',
        entityName: name,
        details,
        company: selectedCompany._id
      });
    } catch (e) {
      console.error('Failed to log activity:', e);
    }
  }, [selectedCompany]);

  // ── Recycle Bin Local Storage Helpers ─────────────────────────────────────
  const addToRecycleBin = useCallback((type: string, name: string, data: any) => {
    if (!selectedCompany) return;
    try {
      const key = `recycleBin_inventory_${selectedCompany._id}`;
      const existing = localStorage.getItem(key);
      const items = existing ? JSON.parse(existing) : [];
      items.push({
        _id: data._id || Math.random().toString(36).substr(2, 9),
        type,
        name,
        data,
        deletedAt: new Date().toISOString()
      });
      localStorage.setItem(key, JSON.stringify(items));
    } catch (e) {
      console.error('Failed to add to recycle bin:', e);
    }
  }, [selectedCompany]);

  const loadDeletedItems = useCallback(() => {
    if (!selectedCompany) return;
    try {
      const key = `recycleBin_inventory_${selectedCompany._id}`;
      const existing = localStorage.getItem(key);
      setDeletedItems(existing ? JSON.parse(existing) : []);
    } catch (e) {
      console.error('Failed to load deleted items:', e);
    }
  }, [selectedCompany]);

  const openRecycleBin = () => {
    loadDeletedItems();
    setShowRecycleBin(true);
    setHighlightedRecycleIdx(0);
  };

  // Computed summary stats
  const totalLocations = Object.values(zoneStockMap).reduce((a: number, v: any) => a + (v?.locationCount ?? 0), 0);
  const totalStockValue = Object.values(zoneStockMap).reduce((a: number, v: any) => a + (v?.stockValue ?? 0), 0);

  // ── Load all ──────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const [f, fl, z, zs] = await Promise.all([
        mfgApi.getFactories(selectedCompany._id),
        mfgApi.getFloors(selectedCompany._id),
        mfgApi.getZones(selectedCompany._id),
        mfgApi.getZonesWithStock(selectedCompany._id)
      ]);
      const factList: any[] = f.data ?? [];
      const floorList: any[] = fl.data ?? [];
      const zoneList: any[] = z.data ?? [];
      setFactories(factList);
      setFloors(floorList);
      setZones(zoneList);
      setZoneStockMap(zs.data ?? {});

      // Auto-expand all factories & floors on first load
      const fe: Record<string, boolean> = {};
      const fle: Record<string, boolean> = {};
      factList.forEach(f => { fe[f._id] = true; });
      floorList.forEach(fl => { fle[fl._id] = true; });
      setExpandedFactories(fe);
      setExpandedFloors(fle);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (showModal === 'factory') {
        if (editId) {
          await mfgApi.updateFactory(editId, form);
          await logActivity('UPDATE', form.name, `Updated Factory: ${form.name} (${form.code})`);
        } else {
          await mfgApi.createFactory({ ...form, company: selectedCompany?._id });
          await logActivity('CREATE', form.name, `Created Factory: ${form.name} (${form.code})`);
        }
      } else if (showModal === 'floor') {
        if (editId) {
          await mfgApi.updateFloor(editId, form);
          await logActivity('UPDATE', form.name, `Updated Floor: ${form.name}`);
        } else {
          await mfgApi.createFloor({ ...form, company: selectedCompany?._id });
          const fact = factories.find(f => f._id === form.factory_id);
          await logActivity('CREATE', form.name, `Created Floor: ${form.name} under Factory: ${fact?.name || 'Unknown'}`);
        }
      } else if (showModal === 'zone') {
        if (editId) {
          await mfgApi.updateZone(editId, form);
          await logActivity('UPDATE', form.name || form.zone_code, `Updated Zone: ${form.name || form.zone_code}`);
        } else {
          await mfgApi.createZone({ ...form, company: selectedCompany?._id });
          const fl = floors.find(f => f._id === form.floor_id);
          await logActivity('CREATE', form.name || form.zone_code, `Created Zone: ${form.name || form.zone_code} on Floor: ${fl?.name || 'Unknown'}`);
        }
      }
      setShowModal(null); setForm({}); setEditId(null);
      showToast(`${showModal} ${editId ? 'updated' : 'created'} successfully`, 'success');
      loadAll();
    } catch (e: any) {
      showToast(e.response?.data?.msg || 'Error saving', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type: string, id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This will move it to the Recycle Bin.`)) return;
    try {
      const itemData =
        type === 'factory' ? factories.find(f => f._id === id) :
        type === 'floor' ? floors.find(f => f._id === id) :
        zones.find(z => z._id === id);

      if (type === 'factory') await mfgApi.deleteFactory(id);
      else if (type === 'floor') await mfgApi.deleteFloor(id);
      else await mfgApi.deleteZone(id);

      // Save to recycle bin after successful API delete
      if (itemData) {
        addToRecycleBin(type, name, itemData);
      }
      await logActivity('DELETE', name, `Deleted ${type}: ${name}`);
      showToast(`${type} deleted and moved to Recycle Bin`, 'success');
      loadAll();
    } catch (e: any) {
      showToast(e.response?.data?.msg || 'Cannot delete — may have children', 'error');
    }
  };

  // Zone Detail view is now embedded directly in the right panel to match Customer module's split-pane layout.

  // ── Find Duplicates Scanner ──────────────────────────────────────────────
  const handleFindDuplicates = () => {
    const groups: { field: string; value: string; items: any[]; type: 'factory' | 'floor' | 'zone' }[] = [];

    // 1. Factory Duplicates
    const factoryNames = new Map<string, any[]>();
    const factoryCodes = new Map<string, any[]>();
    factories.forEach(f => {
      const n = (f.name ?? '').trim().toLowerCase();
      const c = (f.code ?? '').trim().toLowerCase();
      if (n) {
        if (!factoryNames.has(n)) factoryNames.set(n, []);
        factoryNames.get(n)!.push(f);
      }
      if (c) {
        if (!factoryCodes.has(c)) factoryCodes.set(c, []);
        factoryCodes.get(c)!.push(f);
      }
    });
    factoryNames.forEach((items, n) => {
      if (items.length > 1) {
        groups.push({ type: 'factory', field: 'Factory Name', value: items[0].name, items });
      }
    });
    factoryCodes.forEach((items, c) => {
      if (items.length > 1) {
        groups.push({ type: 'factory', field: 'Factory Code', value: items[0].code, items });
      }
    });

    // 2. Floor Duplicates
    const floorNames = new Map<string, any[]>();
    floors.forEach(fl => {
      const parentFactId = fl.factory_id?._id || fl.factory_id || '';
      const key = `${parentFactId}::${(fl.name ?? '').trim().toLowerCase()}`;
      if (!floorNames.has(key)) floorNames.set(key, []);
      floorNames.get(key)!.push(fl);
    });
    floorNames.forEach((items) => {
      if (items.length > 1) {
        const fact = factories.find(f => f._id === (items[0].factory_id?._id || items[0].factory_id));
        groups.push({
          type: 'floor',
          field: `Floor Name under Factory: ${fact?.name || 'Unknown'}`,
          value: items[0].name,
          items
        });
      }
    });

    // 3. Zone Duplicates
    const zoneCodes = new Map<string, any[]>();
    const zoneNames = new Map<string, any[]>();
    zones.forEach(z => {
      const parentFloorId = z.floor_id?._id || z.floor_id || '';
      const codeKey = `${parentFloorId}::${(z.zone_code ?? '').trim().toUpperCase()}`;
      const nameKey = `${parentFloorId}::${(z.name ?? '').trim().toLowerCase()}`;

      if (!zoneCodes.has(codeKey)) zoneCodes.set(codeKey, []);
      zoneCodes.get(codeKey)!.push(z);

      if ((z.name ?? '').trim()) {
        if (!zoneNames.has(nameKey)) zoneNames.set(nameKey, []);
        zoneNames.get(nameKey)!.push(z);
      }
    });
    zoneCodes.forEach((items) => {
      if (items.length > 1) {
        const floor = floors.find(f => f._id === (items[0].floor_id?._id || items[0].floor_id));
        groups.push({
          type: 'zone',
          field: `Zone Code under Floor: ${floor?.name || 'Unknown'}`,
          value: items[0].zone_code,
          items
        });
      }
    });
    zoneNames.forEach((items) => {
      if (items.length > 1) {
        const floor = floors.find(f => f._id === (items[0].floor_id?._id || items[0].floor_id));
        groups.push({
          type: 'zone',
          field: `Zone Name under Floor: ${floor?.name || 'Unknown'}`,
          value: items[0].name,
          items
        });
      }
    });

    setDuplicateGroups(groups);
    setShowDuplicates(true);
    setHighlightedDuplicateIdx(0);
  };

  // ── Recycle Bin Actions ──────────────────────────────────────────────────
  const handleRestoreItem = async (recycleId: string, name: string) => {
    if (!selectedCompany) return;
    try {
      setRecycleBinLoading(true);
      const key = `recycleBin_inventory_${selectedCompany._id}`;
      const existing = localStorage.getItem(key);
      const items = existing ? JSON.parse(existing) : [];
      const item = items.find((i: any) => i._id === recycleId);
      if (!item) {
        showToast('Item not found in Recycle Bin', 'error');
        return;
      }

      // Recreate item based on its type
      if (item.type === 'factory') {
        await mfgApi.createFactory({
          name: item.data.name,
          code: item.data.code,
          status: item.data.status || 'active',
          company: selectedCompany._id
        });
      } else if (item.type === 'floor') {
        const factId = item.data.factory_id?._id || item.data.factory_id;
        const parentExists = factories.some(f => f._id === factId);
        if (!parentExists) {
          showToast('Cannot restore floor: Parent factory does not exist. Please restore the factory first.', 'error');
          return;
        }
        await mfgApi.createFloor({
          name: item.data.name,
          factory_id: factId,
          status: item.data.status || 'active',
          company: selectedCompany._id
        });
      } else if (item.type === 'zone') {
        const floorId = item.data.floor_id?._id || item.data.floor_id;
        const factId = item.data.factory_id?._id || item.data.factory_id;
        const parentExists = floors.some(fl => fl._id === floorId);
        if (!parentExists) {
          showToast('Cannot restore zone: Parent floor does not exist. Please restore the floor first.', 'error');
          return;
        }
        await mfgApi.createZone({
          zone_code: item.data.zone_code,
          name: item.data.name,
          description: item.data.description || '',
          factory_id: factId,
          floor_id: floorId,
          status: item.data.status || 'active',
          company: selectedCompany._id
        });
      }

      // Remove from localStorage
      const updated = items.filter((i: any) => i._id !== recycleId);
      localStorage.setItem(key, JSON.stringify(updated));
      setDeletedItems(updated);

      await logActivity('RESTORE', name, `Restored ${item.type}: ${name}`);
      showToast(`${item.type} restored successfully`, 'success');
      loadAll();
    } catch (e: any) {
      showToast(e.response?.data?.msg || 'Failed to restore item', 'error');
    } finally {
      setRecycleBinLoading(false);
    }
  };

  const handlePermanentDeleteItem = (recycleId: string, name: string) => {
    if (!window.confirm(`Permanently delete "${name}" from Recycle Bin? This cannot be undone.`)) return;
    if (!selectedCompany) return;
    try {
      const key = `recycleBin_inventory_${selectedCompany._id}`;
      const existing = localStorage.getItem(key);
      const items = existing ? JSON.parse(existing) : [];
      const item = items.find((i: any) => i._id === recycleId);
      const updated = items.filter((i: any) => i._id !== recycleId);
      localStorage.setItem(key, JSON.stringify(updated));
      setDeletedItems(updated);

      if (item) {
        logActivity('PURGE', name, `Permanently purged ${item.type}: ${name} from Recycle Bin`);
      }
      showToast('Item deleted permanently', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to delete permanently', 'error');
    }
  };

  // ── Activity Log Drawer Loader ───────────────────────────────────────────
  const fetchActivityLogs = useCallback(async () => {
    if (!selectedCompany) return;
    try {
      setActivityLogLoading(true);
      const res = await getActivityLogs({
        company: selectedCompany._id,
        entityType: 'inventory_zone',
        limit: 100
      });
      setActivityLogs(res.data.logs || []);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setActivityLogLoading(false);
    }
  }, [selectedCompany]);

  useEffect(() => {
    if (showActivityLog) {
      fetchActivityLogs();
    }
  }, [showActivityLog, fetchActivityLogs]);

  // ── Keyboard Shortcuts listener ──────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if target is input/textarea to avoid key trigger conflicts
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;

      // 1. Modals Open Handlers
      if (showViewAllModal) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowViewAllModal(null);
          setHighlightedViewAllIdx(-1);
          return;
        }

        const itemsLength = 
          showViewAllModal === 'factories' ? factories.length :
          showViewAllModal === 'floors' ? floors.length :
          showViewAllModal === 'zones' ? zones.length :
          zones.filter(z => (zoneStockMap[z._id]?.skuCount ?? 0) > 0).length;

        if (itemsLength === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedViewAllIdx(prev => (prev < itemsLength - 1 ? prev + 1 : 0));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedViewAllIdx(prev => (prev > 0 ? prev - 1 : itemsLength - 1));
          return;
        }
        if (e.key === 'Home' || e.key === 'PageUp') {
          e.preventDefault();
          setHighlightedViewAllIdx(0);
          return;
        }
        if (e.key === 'End' || e.key === 'PageDown') {
          e.preventDefault();
          setHighlightedViewAllIdx(itemsLength - 1);
          return;
        }

        if (highlightedViewAllIdx >= 0 && highlightedViewAllIdx < itemsLength) {
          if (showViewAllModal === 'factories') {
            const item = factories[highlightedViewAllIdx];
            if (e.key === 'Enter' || e.code === 'KeyE') {
              e.preventDefault();
              setShowModal('factory');
              setForm({ name: item.name, code: item.code, status: item.status ?? 'active' });
              setEditId(item._id);
              setShowViewAllModal(null);
              return;
            }
            if (e.key === 'Delete') {
              e.preventDefault();
              handleDelete('factory', item._id, item.name);
              return;
            }
          } else if (showViewAllModal === 'floors') {
            const item = floors[highlightedViewAllIdx];
            if (e.key === 'Enter' || e.code === 'KeyE') {
              e.preventDefault();
              setShowModal('floor');
              setForm({ name: item.name, factory_id: item.factory_id?._id || item.factory_id, status: item.status ?? 'active' });
              setEditId(item._id);
              setShowViewAllModal(null);
              return;
            }
            if (e.key === 'Delete') {
              e.preventDefault();
              handleDelete('floor', item._id, item.name);
              return;
            }
          } else if (showViewAllModal === 'zones') {
            const item = zones[highlightedViewAllIdx];
            if (e.key === 'Enter' || e.code === 'KeyV') {
              e.preventDefault();
              setSelectedZone(item);
              setShowViewAllModal(null);
              return;
            }
            if (e.code === 'KeyE') {
              e.preventDefault();
              setShowModal('zone');
              setForm({
                zone_code: item.zone_code,
                name: item.name,
                description: item.description || '',
                floor_id: item.floor_id?._id || item.floor_id,
                factory_id: item.factory_id?._id || item.factory_id,
                status: item.status ?? 'active'
              });
              setEditId(item._id);
              setShowViewAllModal(null);
              return;
            }
            if (e.key === 'Delete') {
              e.preventDefault();
              handleDelete('zone', item._id, item.name || item.zone_code);
              return;
            }
          } else if (showViewAllModal === 'locations') {
            const activeLocationsZones = zones.filter(z => (zoneStockMap[z._id]?.skuCount ?? 0) > 0);
            const item = activeLocationsZones[highlightedViewAllIdx];
            if (e.key === 'Enter' || e.code === 'KeyV') {
              e.preventDefault();
              setSelectedZone(item);
              setShowViewAllModal(null);
              return;
            }
          }
        }
        return;
      }

      if (showDuplicates) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowDuplicates(false);
          setHighlightedDuplicateIdx(-1);
          return;
        }
        if (duplicateGroups.length === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedDuplicateIdx(prev => (prev < duplicateGroups.length - 1 ? prev + 1 : 0));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedDuplicateIdx(prev => (prev > 0 ? prev - 1 : duplicateGroups.length - 1));
          return;
        }
        if (e.key === 'Home' || e.key === 'PageUp') {
          e.preventDefault();
          setHighlightedDuplicateIdx(0);
          return;
        }
        if (e.key === 'End' || e.key === 'PageDown') {
          e.preventDefault();
          setHighlightedDuplicateIdx(duplicateGroups.length - 1);
          return;
        }

        if (highlightedDuplicateIdx >= 0 && highlightedDuplicateIdx < duplicateGroups.length) {
          const group = duplicateGroups[highlightedDuplicateIdx];
          if (e.code === 'KeyK') {
            e.preventDefault();
            setDuplicateGroups(prev => prev.filter((_, i) => i !== highlightedDuplicateIdx));
            setHighlightedDuplicateIdx(prev => {
              const nextLen = duplicateGroups.length - 1;
              if (nextLen <= 0) return -1;
              return prev >= nextLen ? nextLen - 1 : prev;
            });
            return;
          }
        }
        return;
      }

      if (showRecycleBin) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowRecycleBin(false);
          setHighlightedRecycleIdx(-1);
          return;
        }
        if (deletedItems.length === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedRecycleIdx(prev => (prev < deletedItems.length - 1 ? prev + 1 : 0));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedRecycleIdx(prev => (prev > 0 ? prev - 1 : deletedItems.length - 1));
          return;
        }
        if (e.key === 'Home' || e.key === 'PageUp') {
          e.preventDefault();
          setHighlightedRecycleIdx(0);
          return;
        }
        if (e.key === 'End' || e.key === 'PageDown') {
          e.preventDefault();
          setHighlightedRecycleIdx(deletedItems.length - 1);
          return;
        }

        if (highlightedRecycleIdx >= 0 && highlightedRecycleIdx < deletedItems.length) {
          const item = deletedItems[highlightedRecycleIdx];
          if (e.key === 'Enter' || e.code === 'KeyR') {
            e.preventDefault();
            handleRestoreItem(item._id, item.name);
            return;
          }
          if (e.key === 'Delete') {
            e.preventDefault();
            handlePermanentDeleteItem(item._id, item.name);
            return;
          }
        }
        return;
      }

      if (showHelpModal) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowHelpModal(false);
        }
        return;
      }

      // Esc to close activity log or stock value details
      if (e.key === 'Escape') {
        setShowActivityLog(false);
        setShowStockDetailModal(false);
      }

      // 2. Main Screen Navigation (when no input is focused and no modal is open)
      if (!isInput && !showModal && !showActivityLog && !showStockDetailModal) {
        const nodes = getVisibleTreeNodes();
        
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (nodes.length === 0) return;
          setTreeHighlight(prev => {
            if (!prev) return { type: nodes[0].type, id: nodes[0].id };
            const idx = nodes.findIndex(n => n.id === prev.id);
            const nextIdx = idx < nodes.length - 1 ? idx + 1 : 0;
            return { type: nodes[nextIdx].type, id: nodes[nextIdx].id };
          });
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (nodes.length === 0) return;
          setTreeHighlight(prev => {
            if (!prev) return { type: nodes[nodes.length - 1].type, id: nodes[nodes.length - 1].id };
            const idx = nodes.findIndex(n => n.id === prev.id);
            const prevIdx = idx > 0 ? idx - 1 : nodes.length - 1;
            return { type: nodes[prevIdx].type, id: nodes[prevIdx].id };
          });
          return;
        }

        if (e.key === 'Home' || e.key === 'PageUp') {
          e.preventDefault();
          if (nodes.length === 0) return;
          setTreeHighlight({ type: nodes[0].type, id: nodes[0].id });
          return;
        }

        if (e.key === 'End' || e.key === 'PageDown') {
          e.preventDefault();
          if (nodes.length === 0) return;
          setTreeHighlight({ type: nodes[nodes.length - 1].type, id: nodes[nodes.length - 1].id });
          return;
        }

        if (e.key === 'Enter' || e.key === ' ') {
          if (!treeHighlight) return;
          const currentNode = nodes.find(n => n.id === treeHighlight.id);
          if (!currentNode) return;
          e.preventDefault();
          if (currentNode.type === 'factory') {
            const isExpanded = expandedFactories[currentNode.id] !== false;
            setExpandedFactories(p => ({ ...p, [currentNode.id]: !isExpanded }));
          } else if (currentNode.type === 'floor') {
            const isExpanded = expandedFloors[currentNode.id] !== false;
            setExpandedFloors(p => ({ ...p, [currentNode.id]: !isExpanded }));
          } else if (currentNode.type === 'zone') {
            setSelectedZone(currentNode.data);
          }
          return;
        }

        // Tally Master Operations shortcuts (Alt+C contextually)
        if (e.altKey && e.code === 'KeyC') {
          e.preventDefault();
          if (!treeHighlight) {
            setShowModal('factory');
            setForm({ name: '', code: '', status: 'active' });
            setEditId(null);
          } else {
            const current = nodes.find(n => n.id === treeHighlight.id);
            if (current?.type === 'factory') {
              setShowModal('floor');
              setForm({ name: '', factory_id: current.id, status: 'active' });
              setEditId(null);
            } else if (current?.type === 'floor') {
              const parentFactId = current.data.factory_id?._id || current.data.factory_id;
              setShowModal('zone');
              setForm({ zone_code: '', name: '', description: '', floor_id: current.id, factory_id: parentFactId, status: 'active' });
              setEditId(null);
            } else if (current?.type === 'zone') {
              const parentFloorId = current.data.floor_id?._id || current.data.floor_id;
              const parentFactoryId = current.data.factory_id?._id || current.data.factory_id;
              setShowModal('zone');
              setForm({ zone_code: '', name: '', description: '', floor_id: parentFloorId, factory_id: parentFactoryId, status: 'active' });
              setEditId(null);
            }
          }
          return;
        }

        // Alter master (Alt+E or F2)
        if ((e.altKey && e.code === 'KeyE') || e.key === 'F2') {
          if (!treeHighlight) return;
          const current = nodes.find(n => n.id === treeHighlight.id);
          if (!current) return;
          e.preventDefault();
          if (current.type === 'factory') {
            setShowModal('factory');
            setForm({ name: current.data.name, code: current.data.code, status: current.data.status ?? 'active' });
            setEditId(current.id);
          } else if (current.type === 'floor') {
            setShowModal('floor');
            setForm({ name: current.data.name, factory_id: current.data.factory_id?._id || current.data.factory_id, status: current.data.status ?? 'active' });
            setEditId(current.id);
          } else if (current.type === 'zone') {
            setShowModal('zone');
            setForm({
              zone_code: current.data.zone_code,
              name: current.data.name,
              description: current.data.description || '',
              floor_id: current.data.floor_id?._id || current.data.floor_id,
              factory_id: current.data.factory_id?._id || current.data.factory_id,
              status: current.data.status ?? 'active'
            });
            setEditId(current.id);
          }
          return;
        }

        // Delete master (Alt+D)
        if (e.altKey && e.code === 'KeyD') {
          if (!treeHighlight) return;
          const current = nodes.find(n => n.id === treeHighlight.id);
          if (!current) return;
          e.preventDefault();
          handleDelete(current.type, current.id, current.data.name || current.data.zone_code);
          return;
        }
      }

      // Alt/Opt shortcuts (when not inside inputs)
      if (e.altKey && !isInput) {
        const key = e.code;
        if (key === 'KeyL') {
          e.preventDefault();
          setShowActivityLog(true);
        } else if (key === 'KeyF') {
          e.preventDefault();
          handleFindDuplicates();
        } else if (key === 'KeyR') {
          e.preventDefault();
          openRecycleBin();
        } else if (key === 'KeyH') {
          e.preventDefault();
          setShowHelpModal(true);
        }
      }

      // F1 for help
      if (e.key === 'F1') {
        e.preventDefault();
        setShowHelpModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    factories, floors, zones, zoneStockMap,
    showViewAllModal, highlightedViewAllIdx,
    showDuplicates, duplicateGroups, highlightedDuplicateIdx,
    showRecycleBin, deletedItems, highlightedRecycleIdx,
    treeHighlight, showHelpModal, showModal, showActivityLog, showStockDetailModal
  ]);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const q = search.toLowerCase().trim();
  const matchZone = (z: any) =>
    !q ||
    (z.zone_code ?? '').toLowerCase().includes(q) ||
    (z.name ?? '').toLowerCase().includes(q);

  const getFloorZones = (floorId: string) =>
    zones.filter(z => (z.floor_id?._id || z.floor_id) === floorId && matchZone(z));

  const getFactoryFloors = (factoryId: string) =>
    floors.filter(f => (f.factory_id?._id || f.factory_id) === factoryId);

  const displayFactories = q
    ? factories.filter(f => {
      const fFloors = getFactoryFloors(f._id);
      return fFloors.some(fl => getFloorZones(fl._id).length > 0) ||
        (f.name ?? '').toLowerCase().includes(q) ||
        (f.code ?? '').toLowerCase().includes(q);
    })
    : factories;

  const getVisibleTreeNodes = useCallback(() => {
    const nodes: { type: 'factory' | 'floor' | 'zone'; id: string; data: any }[] = [];
    displayFactories.forEach(factory => {
      nodes.push({ type: 'factory', id: factory._id, data: factory });
      const factExpanded = expandedFactories[factory._id] !== false;
      if (factExpanded) {
        const factFloors = getFactoryFloors(factory._id);
        factFloors.forEach(floor => {
          nodes.push({ type: 'floor', id: floor._id, data: floor });
          const flExpanded = expandedFloors[floor._id] !== false;
          if (flExpanded) {
            const flZones = getFloorZones(floor._id);
            flZones.forEach(zone => {
              nodes.push({ type: 'zone', id: zone._id, data: zone });
            });
          }
        });
      }
    });
    return nodes;
  }, [displayFactories, expandedFactories, expandedFloors, floors, zones]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-gray-50">

      {/* ── Compact Header row ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex-shrink-0">
        {/* Title + buttons */}
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Zone Master</h1>
            <p className="text-sm text-gray-400">Manage factories, floors, zones and locations</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={loadAll}
              title="Refresh"
              className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowHelpModal(true)}
              title="Shortcut Help (Alt+H)"
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 bg-white text-gray-700 transition-colors"
            >
              <kbd className="hidden md:inline-block px-1 bg-gray-50 border rounded text-[10px] text-gray-500 font-mono">Alt+H</kbd> Shortcuts
            </button>
            <button
              onClick={() => setShowActivityLog(true)}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 bg-white text-gray-700 transition-colors"
            >
              <Clock className="w-3.5 h-3.5 text-gray-500" /> Activity Log
            </button>
            <button
              onClick={handleFindDuplicates}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 bg-white text-gray-700 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-gray-500" /> Find Duplicates
            </button>
            <button
              onClick={openRecycleBin}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-250 rounded-lg text-sm font-medium hover:bg-gray-50 bg-white text-gray-700 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-gray-500" /> Recycle Bin
            </button>
            {canManage && (
              <>
                <button
                  onClick={() => { setShowModal('factory'); setForm({ name: '', code: '', status: 'active' }); setEditId(null); }}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 bg-white text-gray-700 transition-colors"
                >
                  <Factory className="w-3.5 h-3.5 text-gray-500" /> Factory
                </button>
                <button
                  onClick={() => { setShowModal('floor'); setForm({ name: '', factory_id: factories[0]?._id || '', status: 'active' }); setEditId(null); }}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 bg-white text-gray-700 transition-colors"
                >
                  <Layers className="w-3.5 h-3.5 text-gray-500" /> Floor
                </button>
                <button
                  onClick={() => { setShowModal('zone'); setForm({ zone_code: '', name: '', description: '', floor_id: '', factory_id: factories[0]?._id || '', status: 'active' }); setEditId(null); }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Zone
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Compact stat strip ───────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-2">
          <StatCard
            label="Factories"
            value={factories.length}
            icon={<Building2 className="w-3.5 h-3.5 text-blue-600" />}
            iconBg="bg-blue-50"
            viewAll
            onViewAll={() => {
              setShowViewAllModal('factories');
              setHighlightedViewAllIdx(0);
            }}
          />
          <StatCard
            label="Floors"
            value={floors.length}
            icon={<Layers className="w-3.5 h-3.5 text-orange-500" />}
            iconBg="bg-orange-50"
            viewAll
            onViewAll={() => {
              setShowViewAllModal('floors');
              setHighlightedViewAllIdx(0);
            }}
          />
          <StatCard
            label="Zones"
            value={zones.length}
            icon={<MapPin className="w-3.5 h-3.5 text-red-500" />}
            iconBg="bg-red-50"
            viewAll
            onViewAll={() => {
              setShowViewAllModal('zones');
              setHighlightedViewAllIdx(0);
            }}
          />
          <StatCard
            label="Locations"
            value={fmt(totalLocations as number)}
            icon={<Package className="w-3.5 h-3.5 text-purple-500" />}
            iconBg="bg-purple-50"
            viewAll
            onViewAll={() => {
              setShowViewAllModal('locations');
              setHighlightedViewAllIdx(0);
            }}
          />
          <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-2.5 min-w-0 hover:shadow-sm transition-shadow">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-50">
              <IndianRupee className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium leading-none">Total Stock Value</p>
              <p className="text-lg font-bold text-amber-600 leading-snug truncate">
                {fmtCurrency(totalStockValue as number)}
              </p>
              <button
                onClick={() => setShowStockDetailModal(true)}
                className="text-xs text-blue-600 hover:underline font-medium leading-none block text-left"
              >
                View details →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── Left tree panel ─────────────────────────────────────────── */}
        <div className="w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
          {/* Search bar */}
          <div className="p-3 border-b border-gray-100 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search factories, floors or zones..."
                className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
            </div>
            <button className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500">
              <Filter className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-y-auto py-2">
            {displayFactories.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-[15px] px-4">
                <Factory className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                {q ? 'No results match your search.' : 'No factories yet. Create one to get started.'}
              </div>
            )}

            {displayFactories.map(factory => {
              const factFloors = getFactoryFloors(factory._id);
              const factZoneCount = zones.filter(z => (z.factory_id?._id || z.factory_id) === factory._id).length;
              const factExpanded = expandedFactories[factory._id] !== false; // default open

              return (
                <div key={factory._id} className="mb-1">
                  {/* Factory row */}
                  <div className={`flex items-center justify-between px-3 py-2 hover:bg-gray-50 group cursor-pointer select-none transition-colors ${treeHighlight?.id === factory._id ? 'bg-blue-50 ring-2 ring-blue-500/20' : ''}`}
                    onClick={() => { setTreeHighlight({ type: 'factory', id: factory._id }); setExpandedFactories(p => ({ ...p, [factory._id]: !factExpanded })); }}
                    onMouseEnter={() => setTreeHighlight({ type: 'factory', id: factory._id })}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-gray-400 flex-shrink-0">
                        {factExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </span>
                      <Building2 className="w-4 h-4 text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-[15px] text-gray-800 truncate">{factory.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold uppercase tracking-wide flex-shrink-0 ${
                        (factory.status ?? 'active') === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {factory.status ?? 'ACTIVE'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                      <span className="text-xs text-gray-400">{factFloors.length} Floors</span>
                      {canManage && (
                        <div className="hidden group-hover:flex items-center gap-0.5">
                          <button
                            onClick={e => { e.stopPropagation(); setShowModal('factory'); setForm({ name: factory.name, code: factory.code, status: factory.status ?? 'active' }); setEditId(factory._id); }}
                            className="p-1 hover:bg-blue-50 rounded"
                          ><Edit className="w-3 h-3 text-blue-500" /></button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDelete('factory', factory._id, factory.name); }}
                            className="p-1 hover:bg-red-50 rounded"
                          ><Trash2 className="w-3 h-3 text-red-400" /></button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Floors */}
                  {factExpanded && factFloors.map(floor => {
                    const flZones = getFloorZones(floor._id);
                    const flExpanded = expandedFloors[floor._id] !== false; // default open

                    return (
                      <div key={floor._id}>
                        {/* Floor row */}
                        <div
                          className={`flex items-center justify-between pl-7 pr-3 py-1.5 hover:bg-gray-50 group cursor-pointer select-none transition-colors ${treeHighlight?.id === floor._id ? 'bg-blue-50 ring-2 ring-blue-500/20' : ''}`}
                          onClick={() => { setTreeHighlight({ type: 'floor', id: floor._id }); setExpandedFloors(p => ({ ...p, [floor._id]: !flExpanded })); }}
                          onMouseEnter={() => setTreeHighlight({ type: 'floor', id: floor._id })}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-gray-400 flex-shrink-0">
                              {flExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </span>
                            <Layers className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                            <span className="text-[15px] text-gray-700 font-medium truncate">{floor.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                            <span className="text-xs text-gray-400">{flZones.length} Zones</span>
                            {canManage && (
                              <div className="hidden group-hover:flex items-center gap-0.5">
                                <button
                                  onClick={e => { e.stopPropagation(); setShowModal('floor'); setForm({ name: floor.name, factory_id: factory._id, status: floor.status ?? 'active' }); setEditId(floor._id); }}
                                  className="p-1 hover:bg-blue-50 rounded"
                                ><Edit className="w-3 h-3 text-blue-500" /></button>
                                <button
                                  onClick={e => { e.stopPropagation(); handleDelete('floor', floor._id, floor.name); }}
                                  className="p-1 hover:bg-red-50 rounded"
                                ><Trash2 className="w-3 h-3 text-red-400" /></button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Zones */}
                        {flExpanded && flZones.map(zone => {
                          const zs = zoneStockMap[zone._id] ?? {};
                          const isSelected = selectedZone?._id === zone._id;
                          const locCount = zs.locationCount ?? zs.skuCount ?? 0;

                          return (
                            <div
                              key={zone._id}
                              onClick={() => { setTreeHighlight({ type: 'zone', id: zone._id }); setSelectedZone(zone); }}
                              onMouseEnter={() => setTreeHighlight({ type: 'zone', id: zone._id })}
                              className={`flex items-center justify-between pl-14 pr-3 py-1.5 cursor-pointer group select-none transition-colors ${
                                treeHighlight?.id === zone._id
                                  ? 'bg-blue-100/70 border-l-2 border-blue-600'
                                  : isSelected
                                    ? 'bg-blue-50 border-l-2 border-blue-500'
                                    : 'hover:bg-gray-50 border-l-2 border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`} />
                                <span className={`text-[15px] truncate ${isSelected ? 'text-blue-700 font-semibold' : 'text-gray-700'}`}>
                                  {zone.name || zone.zone_code}
                                </span>
                              </div>
                              <span className="text-xs text-gray-400 flex-shrink-0 ml-1">
                                {locCount} Locations
                              </span>
                            </div>
                          );
                        })}

                        {flExpanded && flZones.length === 0 && (
                          <p className="pl-14 pr-3 py-1 text-sm text-gray-400 italic">No zones</p>
                        )}

                        {flExpanded && canManage && (
                          <button
                            onClick={() => { setShowModal('zone'); setForm({ zone_code: '', name: '', description: '', floor_id: floor._id, factory_id: factory._id, status: 'active' }); setEditId(null); }}
                            className="w-full pl-14 pr-3 py-1 text-xs text-blue-600 hover:bg-blue-50 flex items-center gap-1.5 transition-colors"
                          >
                            <Plus className="w-3 h-3" /> Add Zone
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Add City button at factory level */}
                  {factExpanded && canManage && (
                    <button
                      onClick={() => { setShowModal('floor'); setForm({ name: '', factory_id: factory._id, status: 'active' }); setEditId(null); }}
                      className="w-full pl-10 pr-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Floor
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add Factory bottom button */}
            {canManage && (
              <div className="px-3 pt-2 pb-3">
                <button
                  onClick={() => { setShowModal('factory'); setForm({ name: '', code: '', status: 'active' }); setEditId(null); }}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-300 rounded-lg text-[15px] text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Factory
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Right detail / empty state ───────────────────────────────── */}
        <div className="flex-1 overflow-hidden bg-gray-50 flex flex-col">
          {!selectedZone ? (
            <div className="flex-1 flex items-center justify-center p-6 bg-white">
              <div className="text-center">
                <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-9 h-9 text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-700 mb-1">Select a Zone</h3>
                <p className="text-[15px] text-gray-400 max-w-xs">
                  Click on any zone in the tree on the left to view its details, stock, and locations.
                </p>
                {canManage && (
                  <button
                    onClick={() => { setShowModal('zone'); setForm({ zone_code: '', name: '', description: '', floor_id: '', factory_id: factories[0]?._id || '', status: 'active' }); setEditId(null); }}
                    className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-[15px] font-semibold hover:bg-blue-700 transition-colors mx-auto"
                  >
                    <Plus className="w-4 h-4" /> Create Zone
                  </button>
                )}
              </div>
            </div>
          ) : (
            <ZoneDetail
              key={selectedZone._id}
              zone={selectedZone}
              factory={factories.find(f => f._id === (selectedZone.factory_id?._id || selectedZone.factory_id))}
              floor={floors.find(f => f._id === (selectedZone.floor_id?._id || selectedZone.floor_id))}
              factories={factories}
              floors={floors}
              onBack={() => { setSelectedZone(null); loadAll(); }}
              onZoneUpdated={(updated) => setSelectedZone(updated)}
              onZoneDeleted={(deletedZone) => {
                if (deletedZone) {
                  addToRecycleBin('zone', deletedZone.name || deletedZone.zone_code, deletedZone);
                  logActivity('DELETE', deletedZone.name || deletedZone.zone_code, `Deleted Zone: ${deletedZone.name || deletedZone.zone_code}`);
                }
                setSelectedZone(null);
                loadAll();
              }}
            />
          )}
        </div>
      </div>

      {/* ── Create / Edit Modal ──────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  showModal === 'factory' ? 'bg-blue-100' :
                  showModal === 'floor' ? 'bg-orange-100' : 'bg-emerald-100'
                }`}>
                  {showModal === 'factory' && <Building2 className="w-4 h-4 text-blue-600" />}
                  {showModal === 'floor' && <Layers className="w-4 h-4 text-orange-600" />}
                  {showModal === 'zone' && <MapPin className="w-4 h-4 text-emerald-600" />}
                </div>
                <h3 className="text-xl font-bold text-gray-900 capitalize">
                  {editId ? 'Edit' : 'Add'} {showModal}
                </h3>
              </div>
              <button
                onClick={() => { setShowModal(null); setForm({}); setEditId(null); }}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Factory fields */}
              {showModal === 'factory' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Factory Name *</label>
                    <input
                      value={form.name || ''}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Factory 1"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Code *</label>
                    <input
                      value={form.code || ''}
                      onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      placeholder="e.g. F1"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[15px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Status</label>
                    <select value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </>
              )}

              {/* Floor fields */}
              {showModal === 'floor' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Factory *</label>
                    <select
                      value={form.factory_id || ''}
                      onChange={e => setForm({ ...form, factory_id: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select factory...</option>
                      {factories.map(f => <option key={f._id} value={f._id}>{f.name} ({f.code})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Floor Name *</label>
                    <input
                      value={form.name || ''}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Ground Floor"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Status</label>
                    <select value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </>
              )}

              {/* Zone fields */}
              {showModal === 'zone' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Factory *</label>
                    <select
                      value={form.factory_id || ''}
                      onChange={e => setForm({ ...form, factory_id: e.target.value, floor_id: '' })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select factory...</option>
                      {factories.map(f => <option key={f._id} value={f._id}>{f.name} ({f.code})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Floor *</label>
                    <select
                      value={form.floor_id || ''}
                      onChange={e => setForm({ ...form, floor_id: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select floor...</option>
                      {floors
                        .filter(f => (f.factory_id?._id || f.factory_id) === form.factory_id)
                        .map(f => <option key={f._id} value={f._id}>{f.name}</option>)
                      }
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Zone Code *</label>
                      <input
                        value={form.zone_code || ''}
                        onChange={e => setForm({ ...form, zone_code: e.target.value.toUpperCase() })}
                        placeholder="e.g. A1"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[15px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Status</label>
                      <select value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Name</label>
                    <input
                      value={form.name || ''}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Zone A"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Description</label>
                    <textarea
                      value={form.description || ''}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      placeholder="Optional description..."
                      rows={2}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2.5 mt-5 pt-4 border-t border-gray-100">
              <button
                onClick={() => { setShowModal(null); setForm({}); setEditId(null); }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-[15px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-5 py-2 rounded-lg text-[15px] font-semibold text-white transition-colors shadow-sm ${
                  showModal === 'factory' ? 'bg-blue-600 hover:bg-blue-700' :
                  showModal === 'floor' ? 'bg-orange-500 hover:bg-orange-600' :
                  'bg-emerald-600 hover:bg-emerald-700'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activity Log Slide-over */}
      {showActivityLog && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={() => setShowActivityLog(false)}></div>
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="pointer-events-auto w-screen max-w-md animate-in slide-in-from-right duration-200">
              <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-2xl">
                {/* Header */}
                <div className="bg-gray-50 px-5 py-6 border-b flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Zone Master Activity Log</h2>
                    <p className="text-xs text-gray-400">Chronological history of changes</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-gray-500 bg-gray-100 rounded border border-gray-200 shadow-xs select-none">Esc</kbd>
                    <button onClick={() => setShowActivityLog(false)} className="text-gray-400 hover:text-gray-500">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 py-6 px-5">
                  {activityLogLoading ? (
                    <div className="flex justify-center items-center h-40">
                      <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  ) : activityLogs.length === 0 ? (
                    <p className="text-[15px] text-gray-500 text-center py-8">No recent activity logs found</p>
                  ) : (
                    <div className="flow-root">
                      <ul role="list" className="-mb-8">
                        {activityLogs.map((log, logIdx) => (
                          <li key={log._id}>
                            <div className="relative pb-8">
                              {logIdx !== activityLogs.length - 1 ? (
                                <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
                              ) : null}
                              <div className="relative flex space-x-3">
                                <div>
                                  <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                                    log.action === 'CREATE' ? 'bg-green-500 text-white' :
                                    log.action === 'UPDATE' ? 'bg-blue-500 text-white' :
                                    log.action === 'DELETE' ? 'bg-red-500 text-white' :
                                    log.action === 'RESTORE' ? 'bg-emerald-500 text-white' :
                                    'bg-purple-500 text-white'
                                  }`}>
                                    <Clock className="w-4 h-4 text-white" />
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[15px] font-semibold text-gray-950">{log.details}</p>
                                  <div className="flex justify-between items-center mt-1.5 text-xs text-gray-400">
                                    <span>By: {log.performedBy}</span>
                                    <span>{new Date(log.createdAt).toLocaleString('en-IN')}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Find Duplicates Modal */}
      {showDuplicates && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="relative bg-white rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Duplicate Detector — Zone Master
              </h2>
              <div className="flex items-center gap-3">
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold text-gray-500 bg-gray-100 rounded border border-gray-200">Esc</kbd>
                <button onClick={() => setShowDuplicates(false)} className="text-gray-400 hover:text-gray-655">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {duplicateGroups.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="font-bold text-gray-800 text-base">No duplicates detected!</p>
                  <p className="text-sm text-gray-400 mt-1">All factories, floors, and zones have unique names and codes.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-[15px] text-gray-500">The following potential duplicate entries were identified:</p>
                  {duplicateGroups.map((group, idx) => (
                    <div
                      key={idx}
                      className={`border rounded-xl p-4 transition-all duration-150 ${
                        idx === highlightedDuplicateIdx
                          ? 'border-blue-500 bg-blue-50/10 ring-2 ring-blue-500/10 shadow-sm'
                          : 'border-red-150 bg-red-50/5'
                      }`}
                      onMouseEnter={() => setHighlightedDuplicateIdx(idx)}
                    >
                      <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-2 mb-3 border-b pb-2 border-red-100/50">
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider bg-red-100 text-red-800 px-2 py-0.5 rounded mr-2">
                            {group.type} duplicate
                          </span>
                          <span className="text-xs font-semibold text-gray-600">
                            By {group.field}: <span className="font-bold text-gray-800">{group.value}</span>
                          </span>
                        </div>
                        <button
                          onClick={() => setDuplicateGroups(prev => prev.filter((_, i) => i !== idx))}
                          className="px-2 py-1 text-xs font-semibold text-gray-600 bg-gray-150 rounded hover:bg-gray-200 transition-colors"
                        >
                          Keep Both
                        </button>
                      </div>

                      <div className="space-y-2">
                        {group.items.map((item: any) => (
                          <div key={item._id} className="flex justify-between items-center bg-white p-3 border border-gray-100 rounded-lg text-sm">
                            <div>
                              <p className="font-bold text-gray-850">
                                {item.name || item.zone_code}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {group.type === 'zone' && `Code: ${item.zone_code}`}
                                {group.type === 'floor' && `Factory: ${factories.find(f => f._id === (item.factory_id?._id || item.factory_id))?.name || 'Unknown'}`}
                                {group.type === 'factory' && `Code: ${item.code}`}
                                <span className="mx-1.5">|</span>
                                Status: <span className="font-semibold uppercase">{item.status ?? 'active'}</span>
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setShowDuplicates(false);
                                  if (group.type === 'zone') {
                                    setSelectedZone(item);
                                  } else {
                                    setShowModal(group.type);
                                    setForm(item);
                                    setEditId(item._id);
                                  }
                                }}
                                className="px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-150 rounded font-semibold transition-colors flex items-center gap-1"
                              >
                                <Edit className="w-3 h-3" /> Edit
                              </button>
                              <button
                                onClick={async () => {
                                  await handleDelete(group.type, item._id, item.name || item.zone_code);
                                  handleFindDuplicates(); // re-scan duplicates
                                }}
                                className="px-2.5 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-650 border border-red-200 rounded font-semibold transition-colors flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => setShowDuplicates(false)}
                className="px-4 py-2 border border-gray-250 rounded-lg text-[15px] font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recycle Bin Modal */}
      {showRecycleBin && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="relative bg-white rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-500" />
                Zone Master Recycle Bin
              </h2>
              <div className="flex items-center gap-3">
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold text-gray-500 bg-gray-100 rounded border border-gray-200">Esc</kbd>
                <button onClick={() => setShowRecycleBin(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* List Body */}
            <div className="p-6 overflow-y-auto flex-1">
              {recycleBinLoading ? (
                <div className="flex justify-center items-center h-48">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              ) : deletedItems.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-3" />
                  <p className="font-semibold text-gray-800 text-base">Recycle Bin is empty!</p>
                  <p className="text-sm text-gray-400 mt-1">There are no recently deleted items in this company.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name / Code</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Deleted At</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {deletedItems.map((item, idx) => {
                        const isHighlighted = idx === highlightedRecycleIdx;
                        return (
                          <tr
                            key={item._id}
                            className={`transition-colors ${
                              isHighlighted
                                ? 'bg-blue-50/70 hover:bg-blue-100/50'
                                : 'hover:bg-gray-50/50'
                            }`}
                            onMouseEnter={() => setHighlightedRecycleIdx(idx)}
                          >
                            <td className="px-4 py-3 text-gray-400 font-medium">{idx + 1}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                item.type === 'factory' ? 'bg-blue-100 text-blue-700' :
                                item.type === 'floor' ? 'bg-orange-100 text-orange-700' :
                                'bg-emerald-100 text-emerald-700'
                              }`}>
                                {item.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-900 font-semibold truncate max-w-[200px]" title={item.name}>
                              {item.name}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {new Date(item.deletedAt).toLocaleString('en-IN')}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                              <button
                                onClick={() => handleRestoreItem(item._id, item.name)}
                                className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 transition-colors inline-flex items-center gap-1"
                              >
                                Restore
                              </button>
                              <button
                                onClick={() => handlePermanentDeleteItem(item._id, item.name)}
                                className="px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors inline-flex items-center gap-1"
                              >
                                Delete Permanent
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => setShowRecycleBin(false)}
                className="px-4 py-2 border border-gray-250 rounded-lg text-[15px] font-medium text-gray-700 hover:bg-gray-150 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Value Details Modal */}
      {showStockDetailModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="relative bg-white rounded-2xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <IndianRupee className="w-5 h-5 text-amber-500" />
                Stock Value Breakdown by Zone
              </h2>
              <button
                onClick={() => setShowStockDetailModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4">
                  <span className="text-xs text-amber-700 font-semibold uppercase tracking-wider font-medium">Total Stock Value</span>
                  <p className="text-3xl font-black text-amber-600 mt-1">{fmtCurrency(totalStockValue as number)}</p>
                </div>
                <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-4">
                  <span className="text-xs text-purple-700 font-semibold uppercase tracking-wider font-medium">Total Active Locations</span>
                  <p className="text-3xl font-black text-purple-600 mt-1">{fmt(totalLocations as number)}</p>
                </div>
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                  <span className="text-xs text-blue-700 font-semibold uppercase tracking-wider font-medium">Total Stock Quantity</span>
                  <p className="text-3xl font-black text-blue-600 mt-1">
                    {fmt(Object.values(zoneStockMap).reduce((a: number, v: any) => a + (v?.totalQty ?? 0), 0) as number)}
                  </p>
                </div>
              </div>

              {/* Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Zone</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Unique Items</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Value</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {zones.map((zone) => {
                      const zs = zoneStockMap[zone._id] ?? { skuCount: 0, locationCount: 0, totalQty: 0, stockValue: 0 };
                      const factName = factories.find(f => f._id === (zone.factory_id?._id || zone.factory_id))?.name ?? 'Unknown Factory';
                      const floorName = floors.find(f => f._id === (zone.floor_id?._id || zone.floor_id))?.name ?? 'Unknown Floor';

                      if (zs.totalQty === 0 && zs.stockValue === 0) return null; // Only show zones with stock

                      return (
                        <tr key={zone._id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-gray-900">{zone.name || zone.zone_code}</div>
                            <div className="text-xs text-gray-450 mt-0.5">Code: {zone.zone_code}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-650 font-medium">
                            <span className="text-[13px]">{factName}</span>
                            <span className="text-gray-300 mx-1.5">•</span>
                            <span className="text-[13px]">{floorName}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900 font-medium">
                            {zs.skuCount}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900 font-medium">
                            {fmt(zs.totalQty)}
                          </td>
                          <td className="px-4 py-3 text-right text-amber-600 font-bold">
                            {fmtCurrency(zs.stockValue)}
                          </td>
                        </tr>
                      );
                    })}
                    {Object.values(zoneStockMap).every((v: any) => (v.totalQty ?? 0) === 0) && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-450 italic">
                          No stock inventory found in any zones.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => setShowStockDetailModal(false)}
                className="px-4 py-2 border border-gray-250 rounded-lg text-[15px] font-medium text-gray-700 hover:bg-gray-150 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View All Modal */}
      {showViewAllModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="relative bg-white rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center rounded-t-2xl">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 capitalize">
                {showViewAllModal === 'factories' && <Building2 className="w-5 h-5 text-blue-500" />}
                {showViewAllModal === 'floors' && <Layers className="w-5 h-5 text-orange-500" />}
                {showViewAllModal === 'zones' && <MapPin className="w-5 h-5 text-red-500" />}
                {showViewAllModal === 'locations' && <Package className="w-5 h-5 text-purple-500" />}
                All {showViewAllModal}
              </h2>
              <div className="flex items-center gap-3">
                <span className="hidden sm:flex items-center gap-1.5 text-[10px] text-gray-400 font-mono select-none">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-500">↑↓</kbd> select &nbsp;
                  {showViewAllModal !== 'locations' ? (
                    <><kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-500">Enter / E</kbd> edit &nbsp;</>
                  ) : (
                    <><kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-500">Enter / V</kbd> view &nbsp;</>
                  )}
                  {showViewAllModal !== 'locations' && <><kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-500">Del</kbd> delete &nbsp;</>}
                  <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-500">Esc</kbd> close
                </span>
                <button
                  onClick={() => { setShowViewAllModal(null); setHighlightedViewAllIdx(-1); }}
                  className="text-gray-400 hover:text-gray-650 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* List Body */}
            <div className="p-6 overflow-y-auto flex-1">
              {showViewAllModal === 'factories' && (
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Factory Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {factories.map((item, idx) => {
                        const isHighlighted = idx === highlightedViewAllIdx;
                        return (
                          <tr
                            key={item._id}
                            className={`transition-colors ${isHighlighted ? 'bg-blue-50/70 hover:bg-blue-100/50' : 'hover:bg-gray-50/50'}`}
                            onMouseEnter={() => setHighlightedViewAllIdx(idx)}
                          >
                            <td className="px-4 py-3 text-gray-400 font-medium">{idx + 1}</td>
                            <td className="px-4 py-3 text-gray-900 font-semibold truncate max-w-[200px]" title={item.name}>
                              {item.name}
                            </td>
                            <td className="px-4 py-3 text-gray-505 font-mono">{item.code}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${(item.status ?? 'active') === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {item.status ?? 'ACTIVE'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                              <button
                                onClick={() => {
                                  setShowModal('factory');
                                  setForm({ name: item.name, code: item.code, status: item.status ?? 'active' });
                                  setEditId(item._id);
                                  setShowViewAllModal(null);
                                }}
                                className="px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-150 rounded font-semibold transition-colors inline-flex items-center gap-1"
                              >
                                <Edit className="w-3.5 h-3.5" /> Edit
                              </button>
                              <button
                                onClick={() => handleDelete('factory', item._id, item.name)}
                                className="px-2.5 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded hover:bg-red-100 transition-colors inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {showViewAllModal === 'floors' && (
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Floor Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Factory</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {floors.map((item, idx) => {
                        const isHighlighted = idx === highlightedViewAllIdx;
                        const parentFactory = factories.find(f => f._id === (item.factory_id?._id || item.factory_id))?.name ?? 'Unknown Factory';
                        return (
                          <tr
                            key={item._id}
                            className={`transition-colors ${isHighlighted ? 'bg-blue-50/70 hover:bg-blue-100/50' : 'hover:bg-gray-50/50'}`}
                            onMouseEnter={() => setHighlightedViewAllIdx(idx)}
                          >
                            <td className="px-4 py-3 text-gray-400 font-medium">{idx + 1}</td>
                            <td className="px-4 py-3 text-gray-900 font-semibold truncate max-w-[200px]" title={item.name}>
                              {item.name}
                            </td>
                            <td className="px-4 py-3 text-gray-505">{parentFactory}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${(item.status ?? 'active') === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {item.status ?? 'ACTIVE'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                              <button
                                onClick={() => {
                                  setShowModal('floor');
                                  setForm({ name: item.name, factory_id: item.factory_id?._id || item.factory_id, status: item.status ?? 'active' });
                                  setEditId(item._id);
                                  setShowViewAllModal(null);
                                }}
                                className="px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-150 rounded font-semibold transition-colors inline-flex items-center gap-1"
                              >
                                <Edit className="w-3.5 h-3.5" /> Edit
                              </button>
                              <button
                                onClick={() => handleDelete('floor', item._id, item.name)}
                                className="px-2.5 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded hover:bg-red-100 transition-colors inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {showViewAllModal === 'zones' && (
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Zone Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Factory & Floor</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {zones.map((item, idx) => {
                        const isHighlighted = idx === highlightedViewAllIdx;
                        const parentFactory = factories.find(f => f._id === (item.factory_id?._id || item.factory_id))?.name ?? 'Unknown Factory';
                        const parentFloor = floors.find(f => f._id === (item.floor_id?._id || item.floor_id))?.name ?? 'Unknown Floor';
                        return (
                          <tr
                            key={item._id}
                            className={`transition-colors ${isHighlighted ? 'bg-blue-50/70 hover:bg-blue-100/50' : 'hover:bg-gray-50/50'}`}
                            onMouseEnter={() => setHighlightedViewAllIdx(idx)}
                          >
                            <td className="px-4 py-3 text-gray-400 font-medium">{idx + 1}</td>
                            <td className="px-4 py-3 text-gray-900 font-semibold truncate max-w-[150px]" title={item.name || item.zone_code}>
                              {item.name || item.zone_code}
                            </td>
                            <td className="px-4 py-3 text-gray-505 font-mono">{item.zone_code}</td>
                            <td className="px-4 py-3 text-gray-505 truncate max-w-[200px]" title={`${parentFactory} - ${parentFloor}`}>
                              {parentFactory} • {parentFloor}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${(item.status ?? 'active') === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {item.status ?? 'ACTIVE'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                              <button
                                onClick={() => {
                                  setSelectedZone(item);
                                  setShowViewAllModal(null);
                                }}
                                className="px-2.5 py-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-150 rounded font-semibold transition-colors inline-flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" /> View
                              </button>
                              <button
                                onClick={() => {
                                  setShowModal('zone');
                                  setForm({
                                    zone_code: item.zone_code,
                                    name: item.name,
                                    description: item.description || '',
                                    floor_id: item.floor_id?._id || item.floor_id,
                                    factory_id: item.factory_id?._id || item.factory_id,
                                    status: item.status ?? 'active'
                                  });
                                  setEditId(item._id);
                                  setShowViewAllModal(null);
                                }}
                                className="px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-150 rounded font-semibold transition-colors inline-flex items-center gap-1"
                              >
                                <Edit className="w-3.5 h-3.5" /> Edit
                              </button>
                              <button
                                onClick={() => handleDelete('zone', item._id, item.name || item.zone_code)}
                                className="px-2.5 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded hover:bg-red-100 transition-colors inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {showViewAllModal === 'locations' && (
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Zone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Factory & Floor</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Unique SKUs</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Quantity</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Value</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {zones
                        .filter(z => (zoneStockMap[z._id]?.skuCount ?? 0) > 0)
                        .map((item, idx) => {
                          const isHighlighted = idx === highlightedViewAllIdx;
                          const zs = zoneStockMap[item._id] ?? { skuCount: 0, locationCount: 0, totalQty: 0, stockValue: 0 };
                          const parentFactory = factories.find(f => f._id === (item.factory_id?._id || item.factory_id))?.name ?? 'Unknown Factory';
                          const parentFloor = floors.find(f => f._id === (item.floor_id?._id || item.floor_id))?.name ?? 'Unknown Floor';
                          return (
                            <tr
                              key={item._id}
                              className={`transition-colors ${isHighlighted ? 'bg-blue-50/70 hover:bg-blue-100/50' : 'hover:bg-gray-50/50'}`}
                              onMouseEnter={() => setHighlightedViewAllIdx(idx)}
                            >
                              <td className="px-4 py-3 text-gray-400 font-medium">{idx + 1}</td>
                              <td className="px-4 py-3 text-gray-900 font-semibold truncate max-w-[150px]" title={item.name || item.zone_code}>
                                {item.name || item.zone_code}
                              </td>
                              <td className="px-4 py-3 text-gray-505 truncate max-w-[200px]" title={`${parentFactory} - ${parentFloor}`}>
                                {parentFactory} • {parentFloor}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-900 font-medium">{zs.skuCount}</td>
                              <td className="px-4 py-3 text-right text-gray-900 font-medium">{fmt(zs.totalQty)}</td>
                              <td className="px-4 py-3 text-right text-amber-600 font-bold">{fmtCurrency(zs.stockValue)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-right">
                                <button
                                  onClick={() => {
                                    setSelectedZone(item);
                                    setShowViewAllModal(null);
                                  }}
                                  className="px-3 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-150 rounded font-semibold transition-colors inline-flex items-center gap-1"
                                >
                                  <Eye className="w-3.5 h-3.5" /> View Stock
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      {zones.filter(z => (zoneStockMap[z._id]?.skuCount ?? 0) > 0).length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-450 italic">
                            No active stock locations recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => { setShowViewAllModal(null); setHighlightedViewAllIdx(-1); }}
                className="px-4 py-2 border border-gray-250 rounded-lg text-[15px] font-medium text-gray-700 hover:bg-gray-150 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="relative bg-white rounded-2xl max-w-xl w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center rounded-t-2xl">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <kbd className="px-2 py-1 bg-blue-100 text-blue-800 text-xs border border-blue-200 rounded font-semibold select-none">Alt + H</kbd>
                Keyboard Shortcut Cheat Sheet (TallyPrime Style)
              </h2>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <p className="text-sm text-gray-500">
                You can fully navigate and manage the Zone Master dashboard using these Tally-compatible shortcut keys (works with <strong>Option (⌥)</strong> button on Mac):
              </p>
              
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Shortcut Key</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-150 text-gray-700">
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-medium">Close current popup / Cancel</td>
                      <td className="px-4 py-2 text-right"><kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">Esc</kbd></td>
                    </tr>
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-medium">Navigate tree or popup lists</td>
                      <td className="px-4 py-2 text-right"><kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">↑ / ↓ Arrow keys</kbd></td>
                    </tr>
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-medium">Move to first/top item</td>
                      <td className="px-4 py-2 text-right"><kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">Home / PgUp</kbd></td>
                    </tr>
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-medium">Move to last/bottom item</td>
                      <td className="px-4 py-2 text-right"><kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">End / PgDn</kbd></td>
                    </tr>
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-medium">Expand/Collapse tree or drill-down</td>
                      <td className="px-4 py-2 text-right"><kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">Enter / Space</kbd></td>
                    </tr>
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-medium">Create master contextually (on-the-fly)</td>
                      <td className="px-4 py-2 text-right">
                        <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">Alt + C</kbd> or <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">⌥ + C</kbd>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-medium">Edit highlighted item</td>
                      <td className="px-4 py-2 text-right">
                        <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">Alt + E</kbd> / <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">F2</kbd>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-medium">Delete highlighted item</td>
                      <td className="px-4 py-2 text-right">
                        <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">Alt + D</kbd> or <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">⌥ + D</kbd>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-medium">Open Activity Log</td>
                      <td className="px-4 py-2 text-right">
                        <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">Alt + L</kbd> or <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">⌥ + L</kbd>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-medium">Scan for Duplicate Entries</td>
                      <td className="px-4 py-2 text-right">
                        <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">Alt + F</kbd> or <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">⌥ + F</kbd>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-medium">Open Recycle Bin</td>
                      <td className="px-4 py-2 text-right">
                        <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">Alt + R</kbd> or <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs">⌥ + R</kbd>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 border border-gray-250 rounded-lg text-[15px] font-medium text-gray-700 hover:bg-gray-150 transition-colors"
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

export default MfgZones;

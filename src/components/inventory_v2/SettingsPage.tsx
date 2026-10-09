import React, { useEffect, useState } from 'react';
import { 
  Settings, 
  Trash2, 
  Plus, 
  RefreshCw, 
  AlertCircle, 
  Scale, 
  AlignLeft, 
  Tag,
  Keyboard,
  RotateCcw,
  Search,
  Check,
  Edit2,
  X,
  Sparkles,
  Info
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMetadataV2, updateMetadataV2 } from '../../api/mfgApiV2';
import { showToast } from '../ui/Toast';
import {
  getKeyboardShortcuts,
  saveKeyboardShortcuts,
  resetKeyboardShortcuts,
  formatKeyDisplay,
  findShortcutConflict,
  ShortcutItem,
  DEFAULT_KEYBOARD_SHORTCUTS
} from '../../utils/keyboardShortcuts';
import { KeyboardShortcutLegendModal } from '../ui/KeyboardShortcutLegendModal';

const normalizeAndDeduplicateUnits = (units: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const u of units) {
    if (!u || !u.trim()) continue;
    const clean = u.trim();
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  }
  return result;
};

const MODULE_LIST = [
  'All',
  'Global',
  'Item Master',
  'Sale Orders',
  'Stock & Inventory',
  'Business Directory',
  'Purchase Batches',
  'Production',
  'Dispatch',
  'Invoices',
  'Ledgers',
  'Reports',
  'Form Navigation'
] as const;

const SettingsPage: React.FC = () => {
  const { selectedCompany } = useAuth();
  const location = useLocation();

  // Tab State: 'specs' | 'shortcuts'
  const [activeTab, setActiveTab] = useState<'specs' | 'shortcuts'>(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('tab') === 'shortcuts' ? 'shortcuts' : 'specs';
  });

  const [loading, setLoading] = useState(true);
  const [, setSaving] = useState(false);
  
  // Specs Metadata state
  const [categories, setCategories] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [ruleTypes, setRuleTypes] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [categoryFields, setCategoryFields] = useState<Record<string, string[]>>({});

  // Input states for specs
  const [newUnit, setNewUnit] = useState('');
  const [newRuleType, setNewRuleType] = useState('');
  const [newBrand, setNewBrand] = useState('');

  // Shortcuts Manager State
  const [shortcuts, setShortcuts] = useState<Record<string, ShortcutItem>>({});
  const [selectedModule, setSelectedModule] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [recordedKey, setRecordedKey] = useState<string>('');
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('tab') === 'shortcuts') {
      setActiveTab('shortcuts');
    }
  }, [location.search]);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadSettings();
      loadShortcuts();
    }
  }, [selectedCompany?._id]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getMetadataV2(selectedCompany?._id || '');
      if (data) {
        setCategories(data.categories || []);
        const dbUnits = Array.isArray(data.units) ? data.units : [];
        setUnits(normalizeAndDeduplicateUnits(dbUnits));
        setRuleTypes(data.ruleTypes || []);
        setGroups(data.groups || []);
        setBrands(data.brands || []);
        if (data.keyboardShortcuts && Object.keys(data.keyboardShortcuts).length > 0) {
          const mergedShortcuts = { ...DEFAULT_KEYBOARD_SHORTCUTS, ...data.keyboardShortcuts };
          setShortcuts(mergedShortcuts);
          saveKeyboardShortcuts(mergedShortcuts, selectedCompany?._id);
        }
        if (data.categoryFields) {
          const migratedFields: Record<string, string[]> = {};
          Object.entries(data.categoryFields).forEach(([cat, fields]) => {
            if (Array.isArray(fields)) {
              let updated = [...fields];
              if (updated.includes('dimensions')) {
                updated = updated.filter(f => f !== 'dimensions');
                if (!updated.includes('width')) updated.push('width');
                if (!updated.includes('length')) updated.push('length');
              }
              migratedFields[cat] = updated;
            } else {
              migratedFields[cat] = fields as string[];
            }
          });
          setCategoryFields(migratedFields);
        } else {
          setCategoryFields({});
        }
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to load settings configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadShortcuts = () => {
    const sc = getKeyboardShortcuts(selectedCompany?._id);
    setShortcuts(sc);
  };

  const handleSaveMetadata = async (
    updatedCats: string[],
    updatedUnits: string[],
    updatedRules: string[],
    updatedGroups: string[],
    updatedBrands: string[],
    updatedFields: Record<string, string[]>
  ) => {
    setSaving(true);
    try {
      await updateMetadataV2({
        companyId: selectedCompany?._id || '',
        categories: updatedCats,
        units: normalizeAndDeduplicateUnits(updatedUnits),
        ruleTypes: updatedRules,
        groups: updatedGroups,
        brands: updatedBrands,
        categoryFields: updatedFields,
        keyboardShortcuts: shortcuts
      });
      window.dispatchEvent(new CustomEvent('skbw_metadata_updated'));
      showToast('Settings saved successfully', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to save settings to database', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = (type: 'unit' | 'ruleType' | 'brand') => {
    if (type === 'unit') {
      const trimmed = newUnit.trim();
      if (!trimmed) return;
      if (units.some(u => u.toLowerCase() === trimmed.toLowerCase())) {
        showToast('Unit already exists', 'error');
        return;
      }
      const updated = normalizeAndDeduplicateUnits([...units, trimmed]);
      setUnits(updated);
      setNewUnit('');
      handleSaveMetadata(categories, updated, ruleTypes, groups, brands, categoryFields);
    } else if (type === 'ruleType') {
      const trimmed = newRuleType.trim();
      if (!trimmed) return;
      if (ruleTypes.some(r => r.toLowerCase() === trimmed.toLowerCase())) {
        showToast('Rule type already exists', 'error');
        return;
      }
      const updated = [...ruleTypes, trimmed];
      setRuleTypes(updated);
      setNewRuleType('');
      handleSaveMetadata(categories, units, updated, groups, brands, categoryFields);
    } else if (type === 'brand') {
      const trimmed = newBrand.trim();
      if (!trimmed) return;
      if (brands.some(b => b.toLowerCase() === trimmed.toLowerCase())) {
        showToast('Brand already exists', 'error');
        return;
      }
      const updated = [...brands, trimmed];
      setBrands(updated);
      setNewBrand('');
      handleSaveMetadata(categories, units, ruleTypes, groups, updated, categoryFields);
    }
  };

  const handleDeleteItem = (type: 'unit' | 'ruleType' | 'brand', item: string) => {
    if (type === 'unit') {
      const updated = units.filter(u => u !== item);
      setUnits(updated);
      handleSaveMetadata(categories, updated, ruleTypes, groups, brands, categoryFields);
    } else if (type === 'ruleType') {
      const updated = ruleTypes.filter(r => r !== item);
      setRuleTypes(updated);
      handleSaveMetadata(categories, units, updated, groups, brands, categoryFields);
    } else if (type === 'brand') {
      const updated = brands.filter(b => b !== item);
      setBrands(updated);
      handleSaveMetadata(categories, units, ruleTypes, groups, updated, categoryFields);
    }
  };

  // Shortcut Recording Handlers
  const startEditingKey = (sc: ShortcutItem) => {
    if (sc.isSystem) {
      showToast('System control keys (Tab, Arrow keys, Esc) cannot be reassigned', 'info');
      return;
    }
    setEditingShortcutId(sc.id);
    setRecordedKey(sc.customKey || sc.defaultKey);
  };

  const handleKeyRecorderKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      setEditingShortcutId(null);
      setRecordedKey('');
      return;
    }

    const parts: string[] = [];
    if (e.altKey) parts.push('Alt');
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Cmd');

    const key = e.key.toUpperCase();
    if (!['ALT', 'CONTROL', 'SHIFT', 'META'].includes(key)) {
      parts.push(key);
      const newBinding = parts.join('+');
      setRecordedKey(newBinding);
    } else if (parts.length > 0) {
      setRecordedKey(parts.join('+'));
    }
  };

  const saveShortcutBinding = async (shortcutId: string) => {
    if (!recordedKey) {
      showToast('Please press a valid key combination', 'error');
      return;
    }

    // STRICT DUPLICATE CHECK: Deny duplicate key allocations across ALL modules!
    const conflict = findShortcutConflict(shortcuts, shortcutId, recordedKey);
    if (conflict) {
      showToast(`Key shortcut '${recordedKey}' is already assigned to '${conflict.actionName}' (${conflict.module}). Duplicate key allocations are denied.`, 'error');
      return; // DENY SAVING
    }

    const updated = {
      ...shortcuts,
      [shortcutId]: {
        ...shortcuts[shortcutId],
        customKey: recordedKey
      }
    };

    setShortcuts(updated);
    saveKeyboardShortcuts(updated, selectedCompany?._id);

    // Sync universally to database for all users
    if (selectedCompany?._id) {
      try {
        await updateMetadataV2({
          companyId: selectedCompany._id,
          keyboardShortcuts: updated
        });
        window.dispatchEvent(new CustomEvent('skbw_metadata_updated'));
      } catch (err) {
        console.error('Failed to sync shortcuts to backend:', err);
      }
    }

    setEditingShortcutId(null);
    setRecordedKey('');
    showToast(`Key binding updated to '${recordedKey}' and synced universally for all users`, 'success');
  };

  const resetSingleShortcut = async (shortcutId: string) => {
    const updated = {
      ...shortcuts,
      [shortcutId]: {
        ...shortcuts[shortcutId],
        customKey: undefined
      }
    };
    setShortcuts(updated);
    saveKeyboardShortcuts(updated, selectedCompany?._id);

    if (selectedCompany?._id) {
      try {
        await updateMetadataV2({
          companyId: selectedCompany._id,
          keyboardShortcuts: updated
        });
        window.dispatchEvent(new CustomEvent('skbw_metadata_updated'));
      } catch (err) {
        console.error('Failed to sync shortcut reset to backend:', err);
      }
    }
    showToast('Reset key to default binding & synced universally', 'info');
  };

  const handleResetAllShortcuts = async () => {
    if (window.confirm('Reset all keyboard shortcut key allocations to factory defaults for all users?')) {
      const resetMap = resetKeyboardShortcuts(selectedCompany?._id);
      setShortcuts(resetMap);

      if (selectedCompany?._id) {
        try {
          await updateMetadataV2({
            companyId: selectedCompany._id,
            keyboardShortcuts: resetMap
          });
          window.dispatchEvent(new CustomEvent('skbw_metadata_updated'));
        } catch (err) {
          console.error('Failed to sync reset to backend:', err);
        }
      }
      showToast('All keyboard shortcuts reset to factory defaults for all users', 'success');
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[350px] gap-3">
        <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs text-slate-500 font-semibold">Loading settings...</span>
      </div>
    );
  }

  const shortcutsList = Object.values(shortcuts);
  const filteredShortcuts = shortcutsList.filter(sc => {
    const activeKey = sc.customKey || sc.defaultKey;
    const matchesModule = selectedModule === 'All' || sc.module === selectedModule;
    const matchesSearch =
      !searchQuery.trim() ||
      sc.actionName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sc.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sc.module.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activeKey.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesModule && matchesSearch;
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 text-left">
      <style>{`
        @keyframes slideDownFade {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Main Settings Header & Navigation Tabs */}
      <div 
        style={{ animation: 'slideDownFade 0.35s ease-out forwards', animationDelay: '0ms' }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-gray-200 pb-4 opacity-0"
      >
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-teal-700" />
            <span>ERP Settings & Configuration</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1 font-medium">
            Manage Item Master Specifications, Stocking Units, Brands, and Custom Keyboard Key Allocations.
          </p>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex items-center gap-2 bg-gray-100/90 p-1.5 rounded-2xl border border-gray-200 shrink-0">
          <button
            onClick={() => setActiveTab('specs')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'specs'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Scale className="w-4 h-4 text-teal-600" />
            <span>Item Specifications</span>
          </button>
          
          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'shortcuts'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            <span>Keyboard Shortcuts & Allocations</span>
          </button>
        </div>
      </div>

      {/* TAB 1: ITEM SPECIFICATIONS & MASTER METADATA */}
      {activeTab === 'specs' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
              Default Units, Ruling Specifications & Brands
            </h2>
            <button
              onClick={loadSettings}
              className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-xl transition-colors border border-gray-200 bg-white shadow-2xs flex items-center gap-1.5 font-bold text-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-teal-700" />
              <span>Refresh</span>
            </button>
          </div>

          {/* 3-Column Grid: Units, Rule Types & Brands */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Column 1: Default Stocking Units */}
            <div 
              style={{ animation: 'slideDownFade 0.35s ease-out forwards', animationDelay: '60ms' }}
              className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden flex flex-col h-[480px] opacity-0"
            >
              <div className="p-4 border-b border-gray-150 bg-slate-50/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Default Units</h2>
                    <p className="text-[10px] text-gray-400 mt-0.5">Stocking units (kg, pcs, Sheets, Reels, bags).</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                  {units.length} Units
                </span>
              </div>
              
              {/* Add Unit Input */}
              <div className="p-3 border-b border-gray-100 flex gap-2 bg-white">
                <input
                  type="text"
                  placeholder="Add unit (e.g. Kg, Pcs, Sheets)..."
                  value={newUnit}
                  onChange={e => setNewUnit(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddItem('unit')}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 bg-white text-gray-800 font-semibold"
                />
                <button
                  onClick={() => handleAddItem('unit')}
                  className="px-3 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl transition-colors font-bold text-xs flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </div>

              {/* Units List */}
              <div className="flex-1 overflow-y-auto p-3 divide-y divide-gray-50">
                {units.map((unit, index) => (
                  <div 
                    key={unit} 
                    style={{ 
                      animation: 'slideDownFade 0.35s ease-out forwards', 
                      animationDelay: `${index * 30}ms` 
                    }}
                    className="py-2.5 px-2 flex items-center justify-between text-xs font-semibold text-gray-700 hover:bg-slate-50 rounded-xl transition-all opacity-0 group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600"></span>
                      <span>{unit}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteItem('unit', unit)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title={`Delete unit ${unit}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {units.length === 0 && (
                  <div className="text-center py-16 text-gray-400 text-xs font-medium">No custom units configured yet</div>
                )}
              </div>
            </div>

            {/* Column 2: Ruling Types */}
            <div 
              style={{ animation: 'slideDownFade 0.35s ease-out forwards', animationDelay: '120ms' }}
              className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden flex flex-col h-[480px] opacity-0"
            >
              <div className="p-4 border-b border-gray-150 bg-slate-50/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                    <AlignLeft className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Rule Types</h2>
                    <p className="text-[10px] text-gray-400 mt-0.5">Ruling specifications (Plain, Single, Four Line, Square).</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {ruleTypes.length} Types
                </span>
              </div>
              
              {/* Add Rule Type Input */}
              <div className="p-3 border-b border-gray-100 flex gap-2 bg-white">
                <input
                  type="text"
                  placeholder="Add rule type (e.g. Single Line, Plain)..."
                  value={newRuleType}
                  onChange={e => setNewRuleType(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddItem('ruleType')}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 bg-white text-gray-800 font-semibold"
                />
                <button
                  onClick={() => handleAddItem('ruleType')}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors font-bold text-xs flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </div>

              {/* Rule Types List */}
              <div className="flex-1 overflow-y-auto p-3 divide-y divide-gray-50">
                {ruleTypes.map((rule, index) => (
                  <div 
                    key={rule} 
                    style={{ 
                      animation: 'slideDownFade 0.35s ease-out forwards', 
                      animationDelay: `${index * 30}ms` 
                    }}
                    className="py-2.5 px-2 flex items-center justify-between text-xs font-semibold text-gray-700 hover:bg-slate-50 rounded-xl transition-all opacity-0 group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                      <span>{rule}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteItem('ruleType', rule)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title={`Delete rule type ${rule}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {ruleTypes.length === 0 && (
                  <div className="text-center py-16 text-gray-400 text-xs font-medium">No custom rule types configured yet</div>
                )}
              </div>
            </div>

            {/* Column 3: Brands */}
            <div 
              style={{ animation: 'slideDownFade 0.35s ease-out forwards', animationDelay: '180ms' }}
              className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden flex flex-col h-[480px] opacity-0"
            >
              <div className="p-4 border-b border-gray-150 bg-slate-50/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                    <Tag className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Brands</h2>
                    <p className="text-[10px] text-gray-400 mt-0.5">Product & notebook brands (Classmate, Navneet).</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {brands.length} Brands
                </span>
              </div>
              
              {/* Add Brand Input */}
              <div className="p-3 border-b border-gray-100 flex gap-2 bg-white">
                <input
                  type="text"
                  placeholder="Add brand (e.g. Classmate, Navneet)..."
                  value={newBrand}
                  onChange={e => setNewBrand(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddItem('brand')}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 font-semibold"
                />
                <button
                  onClick={() => handleAddItem('brand')}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-bold text-xs flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </div>

              {/* Brands List */}
              <div className="flex-1 overflow-y-auto p-3 divide-y divide-gray-50">
                {brands.map((brand, index) => (
                  <div 
                    key={brand} 
                    style={{ 
                      animation: 'slideDownFade 0.35s ease-out forwards', 
                      animationDelay: `${index * 30}ms` 
                    }}
                    className="py-2.5 px-2 flex items-center justify-between text-xs font-semibold text-gray-700 hover:bg-slate-50 rounded-xl transition-all opacity-0 group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                      <span className="font-semibold text-gray-900">{brand}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteItem('brand', brand)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title={`Delete brand ${brand}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {brands.length === 0 && (
                  <div className="text-center py-16 text-gray-400 text-xs font-medium">No custom brands configured yet</div>
                )}
              </div>
            </div>

          </div>

          <div className="p-4 bg-teal-50/70 border border-teal-100 rounded-2xl flex gap-3 text-xs text-teal-900 font-medium">
            <AlertCircle className="w-5 h-5 text-teal-700 shrink-0" />
            <div>
              <span className="font-bold">Automatic Synchronization:</span> Units, Rule Types, and Brands added here are instantly available inside Item Master creation drawers, Finished Goods forms, and manufacturing batches.
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: KEYBOARD SHORTCUTS & ALLOCATIONS MANAGER */}
      {activeTab === 'shortcuts' && (
        <div className="space-y-6">
          {/* Top Control Header */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200 shrink-0">
                <Keyboard className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-gray-900">
                  Customizable Module & Tab Keyboard Allocations
                </h2>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  Reassign shortcut key allocations for Module navigation, Tab switching, Exports, and Form actions.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsLegendOpen(true)}
                className="px-3.5 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold transition-all hover:bg-gray-800 flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Open Legend Modal</span>
              </button>

              <button
                onClick={handleResetAllShortcuts}
                className="px-3.5 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all border border-rose-200 flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Factory Defaults</span>
              </button>
            </div>
          </div>

          {/* Filter Bar & Search Input */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
            {/* Module Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
              {MODULE_LIST.map(mod => (
                <button
                  key={mod}
                  onClick={() => setSelectedModule(mod)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    selectedModule === mod
                      ? 'bg-teal-700 text-white shadow-2xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200/70 hover:text-gray-900'
                  }`}
                >
                  {mod}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72 shrink-0">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search action or key (e.g. Alt+N, Report)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 bg-white text-gray-900 font-semibold placeholder-gray-400"
              />
            </div>
          </div>

          {/* Shortcuts Allocation Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-150 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Module & Category</th>
                    <th className="py-3 px-4">Action Name & Description</th>
                    <th className="py-3 px-4 text-center">Assigned Key Allocation</th>
                    <th className="py-3 px-4 text-right">Customize Binding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {filteredShortcuts.map(sc => {
                    const isEditing = editingShortcutId === sc.id;
                    const activeKey = sc.customKey || sc.defaultKey;
                    const isCustomized = Boolean(sc.customKey && sc.customKey !== sc.defaultKey);
                    const keys = formatKeyDisplay(activeKey);

                    return (
                      <tr key={sc.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-1">
                            <span className="w-max px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
                              {sc.module}
                            </span>
                            {sc.subCategory && (
                              <span className="text-[10px] text-gray-400 font-semibold">
                                {sc.subCategory}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 max-w-md">
                          <div className="font-bold text-gray-900 text-xs">{sc.actionName}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">{sc.description}</div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-2 bg-amber-50 p-2 rounded-xl border border-amber-300 animate-pulse">
                              <span className="text-[10px] font-bold text-amber-800">Press Keys:</span>
                              <input
                                type="text"
                                autoFocus
                                readOnly
                                value={recordedKey || 'Press key combo...'}
                                onKeyDown={handleKeyRecorderKeyDown}
                                className="px-2.5 py-1 bg-white border border-amber-400 rounded-lg text-xs font-mono font-bold text-amber-900 text-center w-36 focus:outline-none"
                              />
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              {keys.map((k, idx) => (
                                <React.Fragment key={idx}>
                                  {idx > 0 && <span className="text-xs font-bold text-gray-400">+</span>}
                                  <kbd className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg border shadow-2xs ${
                                    isCustomized
                                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                                      : 'bg-slate-100 text-gray-800 border-gray-300'
                                  }`}>
                                    {k}
                                  </kbd>
                                </React.Fragment>
                              ))}
                              {isCustomized && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 ml-1">
                                  Custom
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => saveShortcutBinding(sc.id)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Save</span>
                              </button>
                              <button
                                onClick={() => {
                                  setEditingShortcutId(null);
                                  setRecordedKey('');
                                }}
                                className="px-2.5 py-1.5 bg-gray-200 text-gray-700 rounded-xl font-bold text-xs hover:bg-gray-300 transition-colors cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              {sc.isSystem ? (
                                <span className="text-[11px] text-gray-400 italic font-semibold px-2 py-1">
                                  System Reserved
                                </span>
                              ) : (
                                <>
                                  {isCustomized && (
                                    <button
                                      onClick={() => resetSingleShortcut(sc.id)}
                                      className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors cursor-pointer"
                                      title="Reset to default"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => startEditingKey(sc)}
                                    className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                                  >
                                    <Edit2 className="w-3.5 h-3.5 text-teal-600" />
                                    <span>Edit Key</span>
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredShortcuts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-gray-400 font-medium">
                        No keyboard shortcut allocations found for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-gray-200 rounded-2xl flex gap-3 text-xs text-gray-600 font-medium">
            <Info className="w-5 h-5 text-teal-700 shrink-0" />
            <div>
              <span className="font-bold text-gray-900">How Key Allocations Work:</span>
              <p className="mt-0.5">
                Keyboard shortcuts marked with <span className="font-bold text-amber-700">Custom</span> will immediately take effect across all modules for your active company session. Pressing <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono text-[10px] font-bold text-gray-800">Shift+?</kbd> anywhere in the application brings up the live Legend popup.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Global Shortcut Legend Popup Modal */}
      <KeyboardShortcutLegendModal
        isOpen={isLegendOpen}
        onClose={() => setIsLegendOpen(false)}
      />
    </div>
  );
};

export default SettingsPage;

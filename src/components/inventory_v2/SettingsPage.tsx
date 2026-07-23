import React, { useEffect, useState } from 'react';
import { Settings, Save, Trash2, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMetadataV2, updateMetadataV2, MetadataV2 } from '../../api/mfgApiV2';
import { showToast } from '../ui/Toast';

const SettingsPage: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [categories, setCategories] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [ruleTypes, setRuleTypes] = useState<string[]>([]);

  // Input states for adding new ones
  const [newCategory, setNewCategory] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newRuleType, setNewRuleType] = useState('');

  useEffect(() => {
    if (selectedCompany?._id) {
      loadSettings();
    }
  }, [selectedCompany?._id]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getMetadataV2(selectedCompany?._id || '');
      if (data) {
        setCategories(data.categories || []);
        setUnits(data.units || []);
        setRuleTypes(data.ruleTypes || []);
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to load settings configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (updatedCats: string[], updatedUnits: string[], updatedRules: string[]) => {
    setSaving(true);
    try {
      await updateMetadataV2({
        companyId: selectedCompany?._id || '',
        categories: updatedCats,
        units: updatedUnits,
        ruleTypes: updatedRules
      });
      showToast('Settings saved successfully', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to save settings to database', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = (type: 'category' | 'unit' | 'ruleType') => {
    if (type === 'category') {
      if (!newCategory.trim()) return;
      if (categories.includes(newCategory.trim())) {
        showToast('Category already exists', 'error');
        return;
      }
      const updated = [...categories, newCategory.trim()];
      setCategories(updated);
      setNewCategory('');
      handleSave(updated, units, ruleTypes);
    } else if (type === 'unit') {
      if (!newUnit.trim()) return;
      if (units.includes(newUnit.trim())) {
        showToast('Unit already exists', 'error');
        return;
      }
      const updated = [...units, newUnit.trim()];
      setUnits(updated);
      setNewUnit('');
      handleSave(categories, updated, ruleTypes);
    } else {
      if (!newRuleType.trim()) return;
      if (ruleTypes.includes(newRuleType.trim())) {
        showToast('Rule type already exists', 'error');
        return;
      }
      const updated = [...ruleTypes, newRuleType.trim()];
      setRuleTypes(updated);
      setNewRuleType('');
      handleSave(categories, units, updated);
    }
  };

  const handleDeleteItem = (type: 'category' | 'unit' | 'ruleType', item: string) => {
    if (type === 'category') {
      const updated = categories.filter(c => c !== item);
      setCategories(updated);
      handleSave(updated, units, ruleTypes);
    } else if (type === 'unit') {
      const updated = units.filter(u => u !== item);
      setUnits(updated);
      handleSave(categories, updated, ruleTypes);
    } else {
      const updated = ruleTypes.filter(r => r !== item);
      setRuleTypes(updated);
      handleSave(categories, units, updated);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            <span>ERP Custom Fields & Options Settings</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage custom Categories, Default Units, and Rule Types used across the Sku Item Master.
          </p>
        </div>
        <button
          onClick={loadSettings}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-255 bg-white shadow-3xs flex items-center gap-1.5 font-bold text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Categories Column */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-4 border-b border-gray-150 bg-gray-50/50">
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">SKU Categories</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Define classifications like Raw Materials, Packaging, etc.</p>
          </div>
          
          {/* Add input */}
          <div className="p-3 border-b border-gray-100 flex gap-2">
            <input
              type="text"
              placeholder="Add category name..."
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddItem('category')}
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 bg-white text-gray-800 font-semibold"
            />
            <button
              onClick={() => handleAddItem('category')}
              className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 divide-y divide-gray-50">
            {categories.map(cat => (
              <div key={cat} className="py-2 flex items-center justify-between text-xs font-semibold text-gray-700 group">
                <span>{cat}</span>
                <button
                  onClick={() => handleDeleteItem('category', cat)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete category"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {categories.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-[11px]">No custom categories yet</div>
            )}
          </div>
        </div>

        {/* Units Column */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-4 border-b border-gray-150 bg-gray-50/50">
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Default Units</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Specify stocking units like kg, pcs, Sheets, Reels, bags, etc.</p>
          </div>
          
          {/* Add input */}
          <div className="p-3 border-b border-gray-100 flex gap-2">
            <input
              type="text"
              placeholder="Add unit..."
              value={newUnit}
              onChange={e => setNewUnit(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddItem('unit')}
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 bg-white text-gray-800 font-semibold"
            />
            <button
              onClick={() => handleAddItem('unit')}
              className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 divide-y divide-gray-50">
            {units.map(unit => (
              <div key={unit} className="py-2 flex items-center justify-between text-xs font-semibold text-gray-700 group">
                <span>{unit}</span>
                <button
                  onClick={() => handleDeleteItem('unit', unit)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete unit"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {units.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-[11px]">No custom units yet</div>
            )}
          </div>
        </div>

        {/* Rule Types Column */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-4 border-b border-gray-150 bg-gray-50/50">
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Rule Types</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Specify ruling categories like Plain, Single Line, Square, etc.</p>
          </div>
          
          {/* Add input */}
          <div className="p-3 border-b border-gray-100 flex gap-2">
            <input
              type="text"
              placeholder="Add rule type..."
              value={newRuleType}
              onChange={e => setNewRuleType(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddItem('ruleType')}
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 bg-white text-gray-800 font-semibold"
            />
            <button
              onClick={() => handleAddItem('ruleType')}
              className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 divide-y divide-gray-50">
            {ruleTypes.map(rule => (
              <div key={rule} className="py-2 flex items-center justify-between text-xs font-semibold text-gray-700 group">
                <span>{rule}</span>
                <button
                  onClick={() => handleDeleteItem('ruleType', rule)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete rule type"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {ruleTypes.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-[11px]">No custom rule types yet</div>
            )}
          </div>
        </div>
      </div>
      
      <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-2xl flex gap-3 text-xs text-blue-800 font-medium">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
        <div>
          <span className="font-bold">Pro Tip:</span> Adding options directly to the list updates the dropdown selectors instantly. Re-sync your changes to the Item Master page to register customized items.
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

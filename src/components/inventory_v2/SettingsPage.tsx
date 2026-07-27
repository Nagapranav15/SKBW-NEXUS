import React, { useEffect, useState } from 'react';
import { Settings, Save, Trash2, Plus, RefreshCw, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMetadataV2, updateMetadataV2 } from '../../api/mfgApiV2';
import { showToast } from '../ui/Toast';

const SettingsPage: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [categories, setCategories] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [ruleTypes, setRuleTypes] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [categoryFields, setCategoryFields] = useState<Record<string, string[]>>({});

  // Input states for adding new ones
  const [newCategory, setNewCategory] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newRuleType, setNewRuleType] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newBrand, setNewBrand] = useState('');

  // Selected category for configuring custom fields modal
  const [selectedCatForFields, setSelectedCatForFields] = useState<string | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

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
        setGroups(data.groups || []);
        setBrands(data.brands || []);
        setCategoryFields(data.categoryFields || {});
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to load settings configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (
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
        units: updatedUnits,
        ruleTypes: updatedRules,
        groups: updatedGroups,
        brands: updatedBrands,
        categoryFields: updatedFields
      });
      showToast('Settings saved successfully', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to save settings to database', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = (type: 'category' | 'unit' | 'ruleType' | 'group' | 'brand') => {
    if (type === 'category') {
      if (!newCategory.trim()) return;
      if (categories.includes(newCategory.trim())) {
        showToast('Category already exists', 'error');
        return;
      }
      const updated = [...categories, newCategory.trim()];
      setCategories(updated);
      setNewCategory('');
      
      // Default fields for new category
      const updatedFields = {
        ...categoryFields,
        [newCategory.trim()]: ['brand', 'gsm', 'dimensions']
      };
      setCategoryFields(updatedFields);
      handleSave(updated, units, ruleTypes, groups, brands, updatedFields);
    } else if (type === 'unit') {
      if (!newUnit.trim()) return;
      if (units.includes(newUnit.trim())) {
        showToast('Unit already exists', 'error');
        return;
      }
      const updated = [...units, newUnit.trim()];
      setUnits(updated);
      setNewUnit('');
      handleSave(categories, updated, ruleTypes, groups, brands, categoryFields);
    } else if (type === 'group') {
      if (!newGroup.trim()) return;
      if (groups.includes(newGroup.trim())) {
        showToast('Group already exists', 'error');
        return;
      }
      const updated = [...groups, newGroup.trim()];
      setGroups(updated);
      setNewGroup('');
      handleSave(categories, units, ruleTypes, updated, brands, categoryFields);
    } else if (type === 'brand') {
      if (!newBrand.trim()) return;
      if (brands.includes(newBrand.trim())) {
        showToast('Brand already exists', 'error');
        return;
      }
      const updated = [...brands, newBrand.trim()];
      setBrands(updated);
      setNewBrand('');
      handleSave(categories, units, ruleTypes, groups, updated, categoryFields);
    } else {
      if (!newRuleType.trim()) return;
      if (ruleTypes.includes(newRuleType.trim())) {
        showToast('Rule type already exists', 'error');
        return;
      }
      const updated = [...ruleTypes, newRuleType.trim()];
      setRuleTypes(updated);
      setNewRuleType('');
      handleSave(categories, units, ruleTypes, groups, brands, categoryFields);
    }
  };

  const handleDeleteItem = (type: 'category' | 'unit' | 'ruleType' | 'group' | 'brand', item: string) => {
    if (type === 'category') {
      const updated = categories.filter(c => c !== item);
      setCategories(updated);
      const updatedFields = { ...categoryFields };
      delete updatedFields[item];
      setCategoryFields(updatedFields);
      handleSave(updated, units, ruleTypes, groups, brands, updatedFields);
    } else if (type === 'unit') {
      const updated = units.filter(u => u !== item);
      setUnits(updated);
      handleSave(categories, updated, ruleTypes, groups, brands, categoryFields);
    } else if (type === 'group') {
      const updated = groups.filter(g => g !== item);
      setGroups(updated);
      handleSave(categories, units, ruleTypes, updated, brands, categoryFields);
    } else if (type === 'brand') {
      const updated = brands.filter(b => b !== item);
      setBrands(updated);
      handleSave(categories, units, ruleTypes, groups, updated, categoryFields);
    } else {
      const updated = ruleTypes.filter(r => r !== item);
      setRuleTypes(updated);
      handleSave(categories, units, updated, groups, brands, categoryFields);
    }
  };

  const openFieldsConfig = (category: string) => {
    setSelectedCatForFields(category);
    setSelectedFields(categoryFields[category] || []);
  };

  const handleSaveFieldsConfig = () => {
    if (!selectedCatForFields) return;
    const updatedFields = {
      ...categoryFields,
      [selectedCatForFields]: selectedFields
    };
    setCategoryFields(updatedFields);
    setSelectedCatForFields(null);
    handleSave(categories, units, ruleTypes, groups, brands, updatedFields);
  };

  const toggleField = (fieldId: string) => {
    setSelectedFields(prev => 
      prev.includes(fieldId) 
        ? prev.filter(f => f !== fieldId) 
        : [...prev, fieldId]
    );
  };

  const fieldsOptions = [
    { id: 'brand', label: 'Brand' },
    { id: 'title', label: 'Title (Description)' },
    { id: 'group', label: 'Group' },
    { id: 'gsm', label: 'GSM' },
    { id: 'dimensions', label: 'Dimensions (Size)' },
    { id: 'paperType', label: 'Format Reels/Sheets' },
    { id: 'ruleType', label: 'Rule Type' },
    { id: 'pages', label: 'Pages' },
    { id: 'booksGbl', label: 'Books / GBL' },
    { id: 'altUnit', label: 'Alternative Unit' }
  ];

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            <span>ERP Custom Fields & Options Settings</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage custom Categories, Stock Groups, Brands, Default Units, and Rule Types used across the Sku Item Master.
          </p>
        </div>
        <button
          onClick={loadSettings}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 bg-white shadow-3xs flex items-center gap-1.5 font-bold text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Categories Column */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-4 border-b border-gray-150 bg-gray-50/50">
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">SKU Categories</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Click gear icon to manage fields list.</p>
          </div>
          
          {/* Add input */}
          <div className="p-3 border-b border-gray-100 flex gap-2">
            <input
              type="text"
              placeholder="Add category..."
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
                <span className="truncate pr-2">{cat}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openFieldsConfig(cat)}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Configure fields checklist"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteItem('category', cat)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete category"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {categories.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-[11px]">No custom categories yet</div>
            )}
          </div>
        </div>

        {/* Stock Groups Column */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-4 border-b border-gray-150 bg-gray-50/50">
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Stock Groups</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Categorize finished goods brands.</p>
          </div>
          
          {/* Add input */}
          <div className="p-3 border-b border-gray-100 flex gap-2">
            <input
              type="text"
              placeholder="Add stock group..."
              value={newGroup}
              onChange={e => setNewGroup(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddItem('group')}
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 bg-white text-gray-800 font-semibold"
            />
            <button
              onClick={() => handleAddItem('group')}
              className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 divide-y divide-gray-50">
            {groups.map(g => (
              <div key={g} className="py-2 flex items-center justify-between text-xs font-semibold text-gray-700 group">
                <span className="truncate pr-2">{g}</span>
                <button
                  onClick={() => handleDeleteItem('group', g)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete stock group"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {groups.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-[11px]">No custom stock groups yet</div>
            )}
          </div>
        </div>

        {/* Brands Column */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-4 border-b border-gray-150 bg-gray-50/50">
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Brands</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Manage brand choices whitelist.</p>
          </div>
          
          {/* Add input */}
          <div className="p-3 border-b border-gray-100 flex gap-2">
            <input
              type="text"
              placeholder="Add brand..."
              value={newBrand}
              onChange={e => setNewBrand(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddItem('brand')}
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 bg-white text-gray-800 font-semibold"
            />
            <button
              onClick={() => handleAddItem('brand')}
              className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 divide-y divide-gray-50">
            {brands.map(b => (
              <div key={b} className="py-2 flex items-center justify-between text-xs font-semibold text-gray-700 group">
                <span className="truncate pr-2">{b}</span>
                <button
                  onClick={() => handleDeleteItem('brand', b)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete brand"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {brands.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-[11px]">No brands yet</div>
            )}
          </div>
        </div>

        {/* Units Column */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-4 border-b border-gray-150 bg-gray-50/50">
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Default Units</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Specify stocking units (kg, pcs, Sheets, Reels, bags).</p>
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
                  className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
            <p className="text-[10px] text-gray-400 mt-0.5">Specify ruling categories (Plain, Single, Square).</p>
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
                  className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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

      {/* Categories Fields Checklist Overlay Modal */}
      {selectedCatForFields && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs font-sans text-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full border border-gray-150 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <div>
                <span className="font-bold text-gray-800 text-xs block">Configure Category Fields</span>
                <span className="text-[9px] text-blue-600 font-extrabold uppercase mt-0.5">{selectedCatForFields}</span>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedCatForFields(null)}
                className="text-gray-400 hover:text-gray-600 rounded p-1 hover:bg-gray-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            {/* Fields List */}
            <div className="p-5 space-y-3">
              <span className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-2">
                Check fields to show in Item Creation Drawer:
              </span>
              <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-100 max-h-60 overflow-y-auto">
                {fieldsOptions.map(f => {
                  const isChecked = selectedFields.includes(f.id);
                  return (
                    <label key={f.id} className="flex items-center gap-2.5 cursor-pointer hover:text-blue-600 transition-colors py-1">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleField(f.id)}
                        className="rounded border-gray-305 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="text-[10px] font-bold text-gray-700">{f.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedCatForFields(null)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg font-bold hover:bg-gray-100 text-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveFieldsConfig}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;

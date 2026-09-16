import React, { useEffect, useState } from 'react';
import { Settings, Trash2, Plus, RefreshCw, AlertCircle, Scale, AlignLeft, Tag } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMetadataV2, updateMetadataV2 } from '../../api/mfgApiV2';
import { showToast } from '../ui/Toast';

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

const SettingsPage: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [loading, setLoading] = useState(true);
  const [, setSaving] = useState(false);
  
  // Retained state to preserve existing data in database
  const [categories, setCategories] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [ruleTypes, setRuleTypes] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [categoryFields, setCategoryFields] = useState<Record<string, string[]>>({});

  // Input states for adding new units, rule types, and brands
  const [newUnit, setNewUnit] = useState('');
  const [newRuleType, setNewRuleType] = useState('');
  const [newBrand, setNewBrand] = useState('');

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
        const dbUnits = data.units && data.units.length > 0
          ? data.units
          : ["Pcs", "Kg", "Ream", "GBL", "Sheets", "Reels", "Mtr", "Gross", "Box", "Pkt"];
        setUnits(normalizeAndDeduplicateUnits(dbUnits));
        setRuleTypes(data.ruleTypes || []);
        setGroups(data.groups || []);
        setBrands(data.brands || []);
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
        units: normalizeAndDeduplicateUnits(updatedUnits),
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
      handleSave(categories, updated, ruleTypes, groups, brands, categoryFields);
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
      handleSave(categories, units, updated, groups, brands, categoryFields);
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
      handleSave(categories, units, ruleTypes, groups, updated, categoryFields);
    }
  };

  const handleDeleteItem = (type: 'unit' | 'ruleType' | 'brand', item: string) => {
    if (type === 'unit') {
      const updated = units.filter(u => u !== item);
      setUnits(updated);
      handleSave(categories, updated, ruleTypes, groups, brands, categoryFields);
    } else if (type === 'ruleType') {
      const updated = ruleTypes.filter(r => r !== item);
      setRuleTypes(updated);
      handleSave(categories, units, updated, groups, brands, categoryFields);
    } else if (type === 'brand') {
      const updated = brands.filter(b => b !== item);
      setBrands(updated);
      handleSave(categories, units, ruleTypes, groups, updated, categoryFields);
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

      {/* Header Banner */}
      <div 
        style={{ animation: 'slideDownFade 0.35s ease-out forwards', animationDelay: '0ms' }}
        className="flex items-center justify-between opacity-0"
      >
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-teal-700" />
            <span>ERP Item Settings & Specifications</span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5 font-medium">
            Manage Default Stocking Units, Rule Types, and Brands used across Sku Items and Finished Goods.
          </p>
        </div>
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

          {/* Units List with Staggered slideDownFade Animation */}
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

          {/* Rule Types List with Staggered slideDownFade Animation */}
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

          {/* Brands List with Staggered slideDownFade Animation */}
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
      
      {/* Informative Alert Footer */}
      <div 
        style={{ animation: 'slideDownFade 0.35s ease-out forwards', animationDelay: '240ms' }}
        className="p-4 bg-teal-50/70 border border-teal-100 rounded-2xl flex gap-3 text-xs text-teal-900 font-medium opacity-0"
      >
        <AlertCircle className="w-5 h-5 text-teal-700 shrink-0" />
        <div>
          <span className="font-bold">Automatic Synchronization:</span> Units, Rule Types, and Brands added here are instantly available inside Item Master creation drawers, Finished Goods forms, and manufacturing batches.
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

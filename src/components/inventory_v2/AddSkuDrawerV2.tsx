import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw } from 'lucide-react';
import { createSkuV2, updateSkuV2, SkuV2, getMetadataV2, updateMetadataV2 } from '../../api/mfgApiV2';

interface AddSkuDrawerV2Props {
  companyId: string;
  editSku?: SkuV2 | null;
  onClose: () => void;
  onSaveSuccess: (savedSku: SkuV2) => void;
}

const AddSkuDrawerV2: React.FC<AddSkuDrawerV2Props> = ({ companyId, editSku, onClose, onSaveSuccess }) => {
  const [form, setForm] = useState({
    skuCode: '',
    name: '',
    category: 'Raw Material',
    paperType: 'None' as 'Reels' | 'Sheets' | 'None',
    unit: 'kg',
    gsm: '',
    width: '',
    length: '',
    brand: '',
    ruleType: 'Plain',
    pages: '',
    booksGbl: '',
    status: 'Active' as any
  });

  const [categoriesList, setCategoriesList] = useState<string[]>(["Raw Material", "Semi Finished", "Finished Goods"]);
  const [unitsList, setUnitsList] = useState<string[]>(["kg", "pcs", "Sheets", "Reels", "mtr"]);
  const [ruleTypesList, setRuleTypesList] = useState<string[]>(["Plain", "Single Line", "Double Line", "Square Ruled", "Four Line", "Unruled"]);
  
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Load custom metadata lists from database
  useEffect(() => {
    if (companyId) {
      loadMetadata();
    }
  }, [companyId]);

  const loadMetadata = async () => {
    try {
      const data = await getMetadataV2(companyId);
      if (data) {
        if (data.categories?.length) setCategoriesList(data.categories);
        if (data.units?.length) setUnitsList(data.units);
        if (data.ruleTypes?.length) setRuleTypesList(data.ruleTypes);
      }
    } catch (e) {
      console.error('Failed to load dynamic options metadata', e);
    }
  };

  const handleAddNewOption = async (field: 'categories' | 'units' | 'ruleTypes') => {
    const label = field === 'categories' ? 'Category' : field === 'units' ? 'Unit' : 'Rule Type';
    const newVal = prompt(`Enter new custom ${label}:`);
    if (!newVal || !newVal.trim()) return;
    const cleanVal = newVal.trim();

    try {
      let updatedCategories = [...categoriesList];
      let updatedUnits = [...unitsList];
      let updatedRuleTypes = [...ruleTypesList];

      if (field === 'categories') {
        if (!updatedCategories.includes(cleanVal)) {
          updatedCategories.push(cleanVal);
          setCategoriesList(updatedCategories);
        }
        setForm(prev => ({ ...prev, category: cleanVal }));
      } else if (field === 'units') {
        if (!updatedUnits.includes(cleanVal)) {
          updatedUnits.push(cleanVal);
          setUnitsList(updatedUnits);
        }
        setForm(prev => ({ ...prev, unit: cleanVal }));
      } else {
        if (!updatedRuleTypes.includes(cleanVal)) {
          updatedRuleTypes.push(cleanVal);
          setRuleTypesList(updatedRuleTypes);
        }
        setForm(prev => ({ ...prev, ruleType: cleanVal }));
      }

      await updateMetadataV2({
        companyId,
        categories: updatedCategories,
        units: updatedUnits,
        ruleTypes: updatedRuleTypes
      });
    } catch (e) {
      console.error(e);
      alert('Failed to save dynamic option to settings database.');
    }
  };

  // Update form state if editSku is provided or changes
  useEffect(() => {
    if (editSku) {
      setForm({
        skuCode: editSku.skuCode || '',
        name: editSku.name || '',
        category: editSku.category || 'Raw Material',
        paperType: editSku.paperType || 'None',
        unit: editSku.unit || 'kg',
        gsm: editSku.gsm !== undefined ? String(editSku.gsm) : '',
        width: editSku.width !== undefined ? String(editSku.width) : '',
        length: editSku.length !== undefined ? String(editSku.length) : '',
        brand: editSku.brand || '',
        ruleType: editSku.ruleType || 'Plain',
        pages: (editSku as any).pages !== undefined ? String((editSku as any).pages) : '',
        booksGbl: (editSku as any).booksGbl !== undefined ? String((editSku as any).booksGbl) : '',
        status: editSku.status || 'Active'
      });
      setIsNameManuallyEdited(true); // Edit SKU should keep its loaded name
    } else {
      setForm({
        skuCode: '',
        name: '',
        category: 'Raw Material',
        paperType: 'None',
        unit: 'kg',
        gsm: '',
        width: '',
        length: '',
        brand: '',
        ruleType: 'Plain',
        pages: '',
        booksGbl: '',
        status: 'Active'
      });
      setIsNameManuallyEdited(false);
    }
  }, [editSku]);

  // Auto-generate SKU Code
  useEffect(() => {
    if (!editSku && !form.skuCode) {
      regenerateSkuCode();
    }
  }, [form.category, editSku]);

  const regenerateSkuCode = () => {
    const prefix = form.category === 'Raw Material' ? 'RM' : form.category === 'Semi Finished' ? 'SF' : 'FG';
    const rand = Math.floor(10000 + Math.random() * 90000);
    setForm(prev => ({ ...prev, skuCode: `${prefix}-${rand}` }));
  };

  // Compile Sku Name dynamically from other inputs
  useEffect(() => {
    if (!isNameManuallyEdited && !editSku) {
      if (form.category === 'Finished Goods') {
        const parts = [];
        if (form.pages) {
          parts.push(`${form.pages}P`);
        }
        if (form.brand) {
          parts.push(form.brand);
        }
        if (form.ruleType) {
          parts.push(`(${form.ruleType})`);
        }
        setForm(prev => ({ ...prev, name: parts.join(' ') }));
      } else {
        const parts = [];
        if (form.category) parts.push(form.category);
        if (form.paperType && form.paperType !== 'None') parts.push(form.paperType);
        if (form.ruleType) parts.push(form.ruleType);
        if (form.gsm) parts.push(`${form.gsm}GSM`);
        if (form.width && form.length) parts.push(`${form.width}x${form.length}CM`);
        if (form.unit) parts.push(`(${form.unit})`);
        setForm(prev => ({ ...prev, name: parts.join(' ') }));
      }
    }
  }, [form.category, form.paperType, form.ruleType, form.gsm, form.width, form.length, form.unit, form.pages, form.brand, isNameManuallyEdited, editSku]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.skuCode.trim() || !form.name.trim()) {
      setErrorMsg('SKU Code and SKU Name are required');
      return;
    }
    setErrorMsg('');
    setIsSaving(true);
    try {
      let saved;
      if (editSku?._id) {
        saved = await updateSkuV2(editSku._id, {
          ...form,
          pages: form.pages ? Number(form.pages) : undefined,
          booksGbl: form.booksGbl ? Number(form.booksGbl) : undefined,
          company: companyId
        });
      } else {
        saved = await createSkuV2({
          ...form,
          pages: form.pages ? Number(form.pages) : undefined,
          booksGbl: form.booksGbl ? Number(form.booksGbl) : undefined,
          company: companyId
        });
      }
      onSaveSuccess(saved);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.msg || 'Failed to save SKU');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Background Overlay */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-3xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-lg bg-white shadow-2xl h-full flex flex-col z-10 animate-in slide-in-from-right duration-250 font-sans text-xs">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900">
              {editSku ? 'Edit SKU Item' : 'Add New SKU Item'}
            </h2>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {editSku ? 'Modify SKU specifications and values' : 'Register a new manufacturing inventory SKU item'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-150 rounded-xl text-xs font-semibold text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Group 1: General Information */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5">
              General Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">SKU Code *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. RM-REEL-01"
                    value={form.skuCode}
                    onChange={e => setForm({ ...form, skuCode: e.target.value.toUpperCase() })}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                    required
                  />
                  {!editSku && (
                    <button
                      type="button"
                      onClick={regenerateSkuCode}
                      className="px-2.5 py-2 text-xs border border-gray-200 rounded-lg font-semibold bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors"
                      title="Re-generate SKU Code"
                    >
                      Regen
                    </button>
                  )}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Category *</label>
                <select
                  value={form.category}
                  onChange={e => {
                    if (e.target.value === '__ADD_NEW__') {
                      handleAddNewOption('categories');
                    } else {
                      setForm({ ...form, category: e.target.value });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                >
                  {categoriesList.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="__ADD_NEW__" className="text-blue-600 font-bold">+ Add Custom...</option>
                </select>
              </div>

              {/* Reels vs Sheets Radio Selector */}
              <div className="col-span-2 bg-gray-50/50 p-3 rounded-xl border border-gray-100 flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Format Category</span>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700">
                    <input
                      type="radio"
                      name="paperType"
                      value="None"
                      checked={form.paperType === 'None'}
                      onChange={() => setForm({ ...form, paperType: 'None' })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    None
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700">
                    <input
                      type="radio"
                      name="paperType"
                      value="Reels"
                      checked={form.paperType === 'Reels'}
                      onChange={() => setForm({ ...form, paperType: 'Reels' })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    Reels
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700">
                    <input
                      type="radio"
                      name="paperType"
                      value="Sheets"
                      checked={form.paperType === 'Sheets'}
                      onChange={() => setForm({ ...form, paperType: 'Sheets' })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    Sheets
                  </label>
                </div>
              </div>

              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-bold text-gray-600 uppercase">SKU Name *</label>
                  {!editSku && isNameManuallyEdited && (
                    <button
                      type="button"
                      onClick={() => setIsNameManuallyEdited(false)}
                      className="text-[10px] text-blue-600 font-bold hover:underline"
                    >
                      Re-sync auto name
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="e.g. Maplitho Paper Reel 70 GSM"
                  value={form.name}
                  onChange={e => {
                    setForm({ ...form, name: e.target.value });
                    setIsNameManuallyEdited(true);
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                  required
                />
              </div>
            </div>
          </div>

          {/* Group 2: Specifications */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5">
              Specifications
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">GSM</label>
                <input
                  type="number"
                  placeholder="e.g. 70"
                  value={form.gsm}
                  onChange={e => setForm({ ...form, gsm: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Brand</label>
                <input
                  type="text"
                  placeholder="e.g. Century / BILT"
                  value={form.brand}
                  onChange={e => setForm({ ...form, brand: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Width (CM)</label>
                <input
                  type="number"
                  placeholder="e.g. 32"
                  value={form.width}
                  onChange={e => setForm({ ...form, width: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Length (CM)</label>
                <input
                  type="number"
                  placeholder="e.g. 44"
                  value={form.length}
                  onChange={e => setForm({ ...form, length: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                />
              </div>
            </div>
          </div>

          {/* Group 3: Additional Attributes */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5">
              Inventory & Additional Attributes
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Default Unit</label>
                <select
                  value={form.unit}
                  onChange={e => {
                    if (e.target.value === '__ADD_NEW__') {
                      handleAddNewOption('units');
                    } else {
                      setForm({ ...form, unit: e.target.value });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                >
                  {unitsList.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                  <option value="__ADD_NEW__" className="text-blue-600 font-bold">+ Add Custom...</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Rule Type</label>
                <select
                  value={form.ruleType}
                  onChange={e => {
                    if (e.target.value === '__ADD_NEW__') {
                      handleAddNewOption('ruleTypes');
                    } else {
                      setForm({ ...form, ruleType: e.target.value });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                >
                  {ruleTypesList.map(rule => (
                    <option key={rule} value={rule}>{rule}</option>
                  ))}
                  <option value="__ADD_NEW__" className="text-blue-600 font-bold">+ Add Custom...</option>
                </select>
              </div>
              {form.category === 'Finished Goods' && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Pages</label>
                    <input
                      type="number"
                      placeholder="e.g. 112 / 132"
                      value={form.pages}
                      onChange={e => setForm({ ...form, pages: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Books / GBL</label>
                    <input
                      type="number"
                      placeholder="e.g. 200 / 240"
                      value={form.booksGbl}
                      onChange={e => setForm({ ...form, booksGbl: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>
        </form>

        {/* Footer Buttons */}
        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Saving SKU...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save SKU</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddSkuDrawerV2;

import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw } from 'lucide-react';
import { createSkuV2, updateSkuV2, SkuV2, getMetadataV2, updateMetadataV2, getSkusV2 } from '../../api/mfgApiV2';

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
    altUnit: '',
    altUnitConversion: '',
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

  // Brand searchable dropdown states
  const [existingBrands, setExistingBrands] = useState<string[]>([]);
  const [brandSearch, setBrandSearch] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);

  // Custom Options Modal Popup state (Replacing browser prompt dialogs)
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'categories' | 'units' | 'ruleTypes' | null;
    nameValue: string;
  }>({
    isOpen: false,
    type: null,
    nameValue: ''
  });

  // Load custom metadata lists & brands from database
  useEffect(() => {
    if (companyId) {
      loadMetadata();
      loadExistingBrands();
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

  const loadExistingBrands = async () => {
    try {
      const skus = await getSkusV2(companyId);
      const brands = Array.from(new Set(
        skus
          .map(s => s.brand)
          .filter((b): b is string => !!b && typeof b === 'string' && b.trim() !== '')
      ));
      setExistingBrands(brands);
    } catch (e) {
      console.error('Failed to load existing brands', e);
    }
  };

  const handleAddNewOption = (field: 'categories' | 'units' | 'ruleTypes') => {
    setModalConfig({
      isOpen: true,
      type: field,
      nameValue: ''
    });
  };

  const handleSaveCustomOption = async () => {
    const field = modalConfig.type;
    const cleanVal = modalConfig.nameValue.trim();
    if (!field || !cleanVal) return;

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

      setModalConfig({ isOpen: false, type: null, nameValue: '' });
    } catch (e) {
      console.error(e);
      alert('Failed to save dynamic option to settings database.');
    }
  };

  // Sync brandSearch with form.brand
  useEffect(() => {
    setBrandSearch(form.brand);
  }, [form.brand]);

  // Update form state if editSku is provided or changes
  useEffect(() => {
    if (editSku) {
      setForm({
        skuCode: editSku.skuCode || '',
        name: editSku.name || '',
        category: editSku.category || 'Raw Material',
        paperType: editSku.paperType || 'None',
        unit: editSku.unit || 'kg',
        altUnit: (editSku as any).altUnit || '',
        altUnitConversion: (editSku as any).altUnitConversion !== undefined ? String((editSku as any).altUnitConversion) : '',
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
        altUnit: '',
        altUnitConversion: '',
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
  }, [editSku, isOpen]);

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
      if (form.category === 'Raw Material') {
        if (!form.brand && !form.gsm && !form.width && !form.length) {
          setForm(prev => ({ ...prev, name: '' }));
          return;
        }
        const parts = [];
        if (form.brand) parts.push(form.brand);
        const formatType = form.paperType === 'Reels' ? 'Reel' : form.paperType === 'Sheets' ? 'Sheet' : '';
        if (formatType) parts.push(formatType);
        if (form.gsm) parts.push(`${form.gsm}GSM`);
        if (form.width && form.length) parts.push(`${form.width}x${form.length}CM`);
        setForm(prev => ({ ...prev, name: parts.join(' ') }));
      } else if (form.category === 'Finished Goods') {
        if (!form.pages && !form.brand && !form.ruleType) {
          setForm(prev => ({ ...prev, name: '' }));
          return;
        }
        const parts = [];
        if (form.pages) parts.push(`${form.pages}P`);
        if (form.brand) parts.push(form.brand);
        if (form.ruleType) parts.push(`(${form.ruleType})`);
        setForm(prev => ({ ...prev, name: parts.join(' ') }));
      } else {
        setForm(prev => ({ ...prev, name: '' }));
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
      const isSemiOrFinished = form.category === 'Semi Finished' || form.category === 'Finished Goods';
      const payload = {
        ...form,
        pages: form.pages ? Number(form.pages) : undefined,
        booksGbl: form.booksGbl ? Number(form.booksGbl) : undefined,
        altUnit: isSemiOrFinished ? (form.altUnit || undefined) : undefined,
        altUnitConversion: (isSemiOrFinished && form.altUnit) ? (form.altUnitConversion ? Number(form.altUnitConversion) : undefined) : undefined,
        company: companyId
      };

      let saved;
      if (editSku?._id) {
        saved = await updateSkuV2(editSku._id, payload);
      } else {
        saved = await createSkuV2(payload);
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
                    const val = e.target.value;
                    if (val === '__ADD_NEW__') {
                      handleAddNewOption('categories');
                    } else {
                      setForm(prev => ({
                        ...prev,
                        category: val,
                        paperType: val === 'Raw Material' ? 'Reels' : 'None',
                        ruleType: val === 'Raw Material' ? '' : prev.ruleType
                      }));
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

              {/* Reels vs Sheets Radio Selector (Only for Raw Materials) */}
              {form.category === 'Raw Material' && (
                <div className="col-span-2 bg-gray-50/50 p-3 rounded-xl border border-gray-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Format Category</span>
                  <div className="flex items-center gap-4">
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
              )}

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
                {form.category === 'Finished Goods' ? (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search or type brand..."
                      value={brandSearch}
                      onChange={e => {
                        setBrandSearch(e.target.value);
                        setForm(prev => ({ ...prev, brand: e.target.value }));
                      }}
                      onFocus={() => setShowBrandDropdown(true)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                    />
                    {showBrandDropdown && (
                      <>
                        <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20 divide-y divide-gray-50">
                          {existingBrands
                            .filter(b => b.toLowerCase().includes(brandSearch.toLowerCase()))
                            .map(b => (
                              <button
                                key={b}
                                type="button"
                                onClick={() => {
                                  setForm(prev => ({ ...prev, brand: b }));
                                  setBrandSearch(b);
                                  setShowBrandDropdown(false);
                                }}
                                className="w-full px-3 py-2 text-left text-xs hover:bg-blue-50 hover:text-blue-600 transition-colors font-semibold text-gray-700 block"
                              >
                                {b}
                              </button>
                            ))
                          }
                          {brandSearch.trim() && !existingBrands.some(b => b.toLowerCase() === brandSearch.toLowerCase()) && (
                            <button
                              type="button"
                              onClick={() => {
                                const newBrand = brandSearch.trim();
                                if (!existingBrands.includes(newBrand)) {
                                  setExistingBrands(prev => [...prev, newBrand]);
                                }
                                setForm(prev => ({ ...prev, brand: newBrand }));
                                setShowBrandDropdown(false);
                              }}
                              className="w-full px-3 py-2 text-left text-xs hover:bg-green-50 text-green-600 font-bold transition-colors block"
                            >
                              + Add Brand "{brandSearch.trim()}"
                            </button>
                          )}
                          {existingBrands.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase())).length === 0 && !brandSearch.trim() && (
                            <div className="px-3 py-2 text-xs text-gray-400 italic">No brands found</div>
                          )}
                        </div>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setShowBrandDropdown(false)} 
                        />
                      </>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. Century / BILT"
                    value={form.brand}
                    onChange={e => setForm({ ...form, brand: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                  />
                )}
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
              {(form.category === 'Semi Finished' || form.category === 'Finished Goods') && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Alternative Unit</label>
                    <select
                      value={form.altUnit}
                      onChange={e => {
                        if (e.target.value === '__ADD_NEW__') {
                          handleAddNewOption('units');
                        } else {
                          setForm({ ...form, altUnit: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                    >
                      <option value="">None</option>
                      {unitsList.map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                      <option value="__ADD_NEW__" className="text-blue-600 font-bold">+ Add Custom...</option>
                    </select>
                  </div>
                  {form.altUnit && (
                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">
                        Conversion Rate (1 {form.altUnit} = ? {form.unit})
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 100"
                        value={form.altUnitConversion}
                        onChange={e => setForm({ ...form, altUnitConversion: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800 font-mono"
                      />
                    </div>
                  )}
                </>
              )}
              {form.category !== 'Raw Material' && (
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
              )}
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

      {/* Dynamic Option Custom Modal Popup */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs font-sans text-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full border border-gray-150 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="font-bold text-gray-800 text-xs">
                Add Custom {modalConfig.type === 'categories' ? 'Category' : modalConfig.type === 'units' ? 'Unit' : 'Rule Type'}
              </span>
              <button 
                type="button"
                onClick={() => setModalConfig({ isOpen: false, type: null, nameValue: '' })}
                className="text-gray-400 hover:text-gray-600 rounded p-1 hover:bg-gray-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            {/* Form Fields */}
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[9px] font-bold text-gray-500 mb-1 uppercase">
                  {modalConfig.type === 'categories' ? 'Category Name' : modalConfig.type === 'units' ? 'Unit Symbol' : 'Rule Name'} *
                </label>
                <input
                  type="text"
                  placeholder={
                    modalConfig.type === 'categories' ? 'e.g. Packing Material' :
                    modalConfig.type === 'units' ? 'e.g. gross' : 'e.g. Single Line'
                  }
                  value={modalConfig.nameValue}
                  onChange={e => setModalConfig(prev => ({ ...prev, nameValue: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 font-semibold text-gray-800 bg-white"
                  autoFocus
                />
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalConfig({ isOpen: false, type: null, nameValue: '' })}
                className="px-3 py-1.5 border border-gray-200 rounded-lg font-bold hover:bg-gray-100 text-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomOption}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors"
              >
                Save Option
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddSkuDrawerV2;

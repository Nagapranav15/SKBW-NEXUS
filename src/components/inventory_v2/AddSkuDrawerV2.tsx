import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw, Layers } from 'lucide-react';
import { createSkuV2, updateSkuV2, SkuV2, getMetadataV2, updateMetadataV2, getSkusV2 } from '../../api/mfgApiV2';

interface AddSkuDrawerV2Props {
  isOpen: boolean;
  companyId: string;
  editSku?: SkuV2 | null;
  onClose: () => void;
  onSaveSuccess: (savedSku: SkuV2) => void;
}

const AddSkuDrawerV2: React.FC<AddSkuDrawerV2Props> = ({ isOpen, companyId, editSku, onClose, onSaveSuccess }) => {
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
    title: '',
    group: '',
    ruleType: 'Plain',
    pages: '',
    booksGbl: '',
    status: 'Active' as any
  });

  const [categoriesList, setCategoriesList] = useState<string[]>(["Raw Material", "Semi Finished", "Finished Goods"]);
  const [unitsList, setUnitsList] = useState<string[]>(["kg", "pcs", "Sheets", "Reels", "mtr"]);
  const [ruleTypesList, setRuleTypesList] = useState<string[]>(["Plain", "Single Line", "Double Line", "Square Ruled", "Four Line", "Unruled"]);
  const [groupsList, setGroupsList] = useState<string[]>(["132P Happy days (UR)", "220P Happy days (SR)"]);
  const [brandsList, setBrandsList] = useState<string[]>(["Happy Days", "Classmate", "Navneet"]);
  
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [hasAltUnit, setHasAltUnit] = useState(false);

  // Brand searchable dropdown lists (separated for Finished Goods vs Raw Materials)
  const [existingBrands, setExistingBrands] = useState<string[]>([]);
  const [fgBrandsList, setFgBrandsList] = useState<string[]>([]);
  const [brandSearch, setBrandSearch] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [brandAtFocus, setBrandAtFocus] = useState<string | null>(null);
  const [groupAtFocus, setGroupAtFocus] = useState<string | null>(null);

  // Category specific field visibility mapping
  const [categoryFieldsMap, setCategoryFieldsMap] = useState<Record<string, string[]>>({
    "Raw Material": ["gsm", "title", "dimensions", "paperType"],
    "Semi Finished": ["gsm", "dimensions", "ruleType", "altUnit", "group"],
    "Finished Goods": ["gsm", "dimensions", "ruleType", "pages", "altUnit"]
  });

  // Custom Options Modal Popup state
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'categories' | 'units' | 'ruleTypes' | 'groups' | null;
    nameValue: string;
    selectedFields: string[];
  }>({
    isOpen: false,
    type: null,
    nameValue: '',
    selectedFields: ['gsm', 'dimensions']
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
        if (data.groups?.length) setGroupsList(data.groups);
        if (data.brands?.length) {
          setBrandsList(data.brands);
          setExistingBrands(data.brands);
        }
        if (data.categoryFields) {
          // If returned as Map structure or nested record
          setCategoryFieldsMap(data.categoryFields);
        }
      }
    } catch (e) {
      console.error('Failed to load dynamic options metadata', e);
    }
  };

  const loadExistingBrands = async () => {
    try {
      const skus = await getSkusV2(companyId);
      
      // Filter brands based on category
      const fgBrands = skus
        .filter(s => s.category === 'Finished Goods')
        .map(s => s.brand)
        .filter((b): b is string => !!b && typeof b === 'string' && b.trim() !== '');
        
      const rawBrands = skus
        .filter(s => s.category === 'Raw Material')
        .map(s => s.brand)
        .filter((b): b is string => !!b && typeof b === 'string' && b.trim() !== '');

      setFgBrandsList(Array.from(new Set(fgBrands)));
      setExistingBrands(prev => Array.from(new Set([...prev, ...rawBrands])));
    } catch (e) {
      console.error('Failed to load existing brands', e);
    }
  };

  const handleAddNewOption = (field: 'categories' | 'units' | 'ruleTypes' | 'groups') => {
    setModalConfig({
      isOpen: true,
      type: field,
      nameValue: '',
      selectedFields: field === 'categories' ? ['brand', 'gsm', 'dimensions'] : []
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
      let updatedGroups = [...groupsList];
      let updatedFieldsMap = { ...categoryFieldsMap };

      if (field === 'categories') {
        if (!updatedCategories.includes(cleanVal)) {
          updatedCategories.push(cleanVal);
          setCategoriesList(updatedCategories);
        }
        updatedFieldsMap[cleanVal] = modalConfig.selectedFields;
        setCategoryFieldsMap(updatedFieldsMap);
        setForm(prev => ({ ...prev, category: cleanVal }));
      } else if (field === 'units') {
        if (!updatedUnits.includes(cleanVal)) {
          updatedUnits.push(cleanVal);
          setUnitsList(updatedUnits);
        }
        setForm(prev => ({ ...prev, unit: cleanVal }));
      } else if (field === 'groups') {
        if (!updatedGroups.includes(cleanVal)) {
          updatedGroups.push(cleanVal);
          setGroupsList(updatedGroups);
        }
        setForm(prev => ({ ...prev, group: cleanVal }));
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
        ruleTypes: updatedRuleTypes,
        groups: updatedGroups,
        categoryFields: updatedFieldsMap
      });

      setModalConfig({ isOpen: false, type: null, nameValue: '', selectedFields: [] });
    } catch (e) {
      console.error(e);
      alert('Failed to save dynamic option to settings database.');
    }
  };

  // Sync brandSearch with form.brand
  useEffect(() => {
    setBrandSearch(form.brand);
  }, [form.brand]);

  // Sync groupSearch with form.group
  useEffect(() => {
    setGroupSearch(form.group);
  }, [form.group]);

  // Update form state if editSku is provided or changes
  useEffect(() => {
    if (editSku) {
      setForm({
        skuCode: editSku.skuCode || '',
        name: editSku.name || '',
        category: editSku.category || 'Raw Material',
        paperType: editSku.paperType || 'None',
        unit: editSku.unit || 'kg',
        altUnit: editSku.altUnit || '',
        altUnitConversion: editSku.altUnitConversion !== undefined ? String(editSku.altUnitConversion) : '',
        gsm: editSku.gsm !== undefined ? String(editSku.gsm) : '',
        width: editSku.width !== undefined ? String(editSku.width) : '',
        length: editSku.length !== undefined ? String(editSku.length) : '',
        brand: editSku.brand || '',
        title: editSku.title || '',
        group: editSku.group || '',
        ruleType: editSku.ruleType || 'Plain',
        pages: (editSku as any).pages !== undefined ? String((editSku as any).pages) : '',
        booksGbl: (editSku as any).booksGbl !== undefined ? String((editSku as any).booksGbl) : '',
        status: editSku.status || 'Active'
      });
      setHasAltUnit(!!editSku.altUnit);
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
        title: '',
        group: '',
        ruleType: 'Plain',
        pages: '',
        booksGbl: '',
        status: 'Active'
      });
      setHasAltUnit(false);
      setIsNameManuallyEdited(false);
    }
  }, [editSku, isOpen]);

  // Load custom metadata lists & brands from database
  useEffect(() => {
    if (companyId) {
      loadMetadata();
      loadExistingBrands();
    }
  }, [companyId]);

  const activeFields = categoryFieldsMap[form.category] || ['brand', 'gsm', 'dimensions'];

  // Auto-generate SKU Code
  useEffect(() => {
    if (!editSku) {
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
          if (!form.brand && !form.title && !form.gsm && !form.width && !form.length) {
            setForm(prev => ({ ...prev, name: '' }));
            return;
          }
          const parts = [];
          if (form.brand) parts.push(form.brand);
          if (form.title) parts.push(form.title);
          const formatType = form.paperType === 'Reels' ? 'Reel' : form.paperType === 'Sheets' ? 'Sheet' : '';
          if (formatType) parts.push(formatType);
          if (form.gsm) parts.push(`${form.gsm}GSM`);
          let sizeStr = '';
          if (form.width && form.length) {
            sizeStr = `${form.width}x${form.length}CM`;
          } else if (form.width) {
            sizeStr = `${form.width}CM`;
          }
          if (sizeStr) parts.push(sizeStr);
          setForm(prev => ({ ...prev, name: parts.join(' ') }));
        } else if (form.category === 'Finished Goods') {
          if (!form.pages && !form.brand && !form.ruleType) {
            setForm(prev => ({ ...prev, name: '' }));
            return;
          }
          if (form.group) {
            setForm(prev => ({ ...prev, name: form.group }));
          } else {
            if (!form.pages && !form.brand && !form.ruleType) {
              setForm(prev => ({ ...prev, name: '' }));
              return;
            }
            const parts = [];
            if (form.pages) parts.push(`${form.pages}P`);
            if (form.brand) parts.push(form.brand);
            if (form.ruleType) {
              const clean = form.ruleType.trim();
              const wrapped = (clean.startsWith('(') && clean.endsWith(')')) ? clean : `(${clean})`;
              parts.push(wrapped);
            }
            setForm(prev => ({ ...prev, name: parts.join(' ') }));
          }
        } else {
          const active = categoryFieldsMap[form.category] || [];
          const parts = [];
          if (active.includes('brand') && form.brand) parts.push(form.brand);
          if (active.includes('title') && form.title) parts.push(form.title);
          if (active.includes('gsm') && form.gsm) parts.push(`${form.gsm}GSM`);
          
          let sizeStr = '';
          if (active.includes('dimensions')) {
            if (form.width && form.length) {
              sizeStr = `${form.width}x${form.length}CM`;
            } else if (form.width) {
              sizeStr = `${form.width}CM`;
            }
          }
          if (sizeStr) parts.push(sizeStr);

          if (active.includes('ruleType') && form.ruleType) {
            const clean = form.ruleType.trim();
            if (clean) {
              const wrapped = (clean.startsWith('(') && clean.endsWith(')')) ? clean : `(${clean})`;
              parts.push(wrapped);
            }
          }
          
          if (parts.length > 0) {
            setForm(prev => ({ ...prev, name: parts.join(' ') }));
          } else {
            setForm(prev => ({ ...prev, name: '' }));
          }
        }
      }
    }, [form.category, form.paperType, form.ruleType, form.gsm, form.width, form.length, form.unit, form.pages, form.brand, form.title, form.group, isNameManuallyEdited, editSku, categoryFieldsMap]);

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

        // Auto-save brand/group to metadata on submission if not already present
        let metadataUpdated = false;
        let updatedGroups = [...groupsList];
        let updatedBrands = [...brandsList];

        if (form.group.trim() && !groupsList.includes(form.group.trim())) {
          updatedGroups.push(form.group.trim());
          setGroupsList(updatedGroups);
          metadataUpdated = true;
        }

        if (form.brand.trim() && !brandsList.includes(form.brand.trim())) {
          updatedBrands.push(form.brand.trim());
          setBrandsList(updatedBrands);
          setExistingBrands(prev => Array.from(new Set([...prev, form.brand.trim()])));
          metadataUpdated = true;
        }

        if (metadataUpdated) {
          try {
            await updateMetadataV2({
              companyId,
              categories: categoriesList,
              units: unitsList,
              ruleTypes: ruleTypesList,
              groups: updatedGroups,
              brands: updatedBrands,
              categoryFields: categoryFieldsMap
            });
          } catch (e) {
            console.error("Failed to auto-save new options to metadata", e);
          }
        }

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

    if (!isOpen) return null;

    return (
      <div className="fixed top-0 right-0 h-full w-full sm:w-[520px] bg-white shadow-2xl border-l border-gray-200 z-[70] flex flex-col animate-in slide-in-from-right duration-250 font-sans text-xs !mt-0">
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
                  <input
                    type="text"
                    placeholder="e.g. RM-REEL-01"
                    value={form.skuCode}
                    onChange={e => setForm({ ...form, skuCode: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                    required
                  />
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

                {/* Reels vs Sheets Radio Selector */}
                {activeFields.includes('paperType') && (
                  <div className="col-span-2 bg-gray-50/50 p-3 rounded-xl border border-gray-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Format Category</span>
                    <div className="flex items-center gap-4">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700">
                        <input
                          type="radio"
                          name="paperType"
                          value="Reels"
                          checked={form.paperType === 'Reels'}
                          onChange={() => setForm({ ...form, paperType: 'Reels', length: '' })}
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
          {(activeFields.includes('gsm') || activeFields.includes('brand') || activeFields.includes('title') || activeFields.includes('dimensions')) && (
            <div className="space-y-4">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5">
                Specifications
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {activeFields.includes('gsm') && (
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
                )}
                {activeFields.includes('brand') && (
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
                          onFocus={() => {
                            setShowBrandDropdown(true);
                            setBrandAtFocus(form.brand);
                          }}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                        />
                        {showBrandDropdown && (
                          <>
                            <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20 divide-y divide-gray-50">
                              {fgBrandsList
                                .filter(b => {
                                  if (brandSearch === brandAtFocus) return true;
                                  return b.toLowerCase().includes(brandSearch.toLowerCase());
                                })
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
                              {brandSearch.trim() && !fgBrandsList.some(b => b.toLowerCase() === brandSearch.toLowerCase()) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newBrand = brandSearch.trim();
                                    if (!fgBrandsList.includes(newBrand)) {
                                      setFgBrandsList(prev => [...prev, newBrand]);
                                    }
                                    setForm(prev => ({ ...prev, brand: newBrand }));
                                    setShowBrandDropdown(false);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-green-50 text-green-600 font-bold transition-colors block"
                                >
                                  + Add Brand "{brandSearch.trim()}"
                                </button>
                              )}
                              {fgBrandsList.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase())).length === 0 && !brandSearch.trim() && (
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
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search or type brand..."
                          value={brandSearch}
                          onChange={e => {
                            setBrandSearch(e.target.value);
                            setForm(prev => ({ ...prev, brand: e.target.value }));
                          }}
                          onFocus={() => {
                            setShowBrandDropdown(true);
                            setBrandAtFocus(form.brand);
                          }}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                        />
                        {showBrandDropdown && (
                          <>
                            <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20 divide-y divide-gray-50">
                              {existingBrands
                                .filter(b => {
                                  if (brandSearch === brandAtFocus) return true;
                                  return b.toLowerCase().includes(brandSearch.toLowerCase());
                                })
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
                    )}
                  </div>
                )}
                {activeFields.includes('title') && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Title (Description)</label>
                    <input
                      type="text"
                      placeholder="e.g. Maplitho / Azure"
                      value={form.title}
                      onChange={e => setForm({ ...form, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                    />
                  </div>
                )}
                {activeFields.includes('dimensions') && (
                  <>
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
                    {form.paperType !== 'Reels' && (
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
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Group 3: Additional Attributes */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5">
              Inventory & Additional Attributes
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Primary Unit *</label>
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
                  <option value="">Select Unit</option>
                  {unitsList.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                  <option value="__ADD_NEW__" className="text-blue-600 font-bold">+ Add Custom...</option>
                </select>
              </div>

              {activeFields.includes('altUnit') && (
                <div className="flex items-end h-full">
                  <label className="flex items-center space-x-2.5 bg-gray-50 border border-gray-200 hover:border-blue-300 hover:bg-blue-50/10 rounded-xl px-3.5 py-2 w-full cursor-pointer select-none transition-all">
                    <input
                      type="checkbox"
                      checked={hasAltUnit}
                      onChange={e => {
                        const checked = e.target.checked;
                        setHasAltUnit(checked);
                        if (!checked) {
                          setForm(prev => ({ ...prev, altUnit: '', altUnitConversion: '' }));
                        }
                      }}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300 cursor-pointer"
                    />
                    <div className="text-left">
                      <span className="block text-[11px] font-bold text-gray-700">Enable Alternate Unit</span>
                      <span className="block text-[9px] text-gray-400 font-medium leading-tight">Define bulk or packaging conversions</span>
                    </div>
                  </label>
                </div>
              )}

              {activeFields.includes('altUnit') && hasAltUnit && (
                <div className="col-span-2 grid grid-cols-2 gap-3 bg-blue-50/20 p-3.5 rounded-xl border border-blue-100/50 animate-in fade-in duration-200">
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
                      <option value="">Select Alternative</option>
                      {unitsList.map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                      <option value="__ADD_NEW__" className="text-blue-600 font-bold">+ Add Custom...</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Conversion Rate</label>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="Multiplier rate"
                        value={form.altUnitConversion}
                        onChange={e => setForm({ ...form, altUnitConversion: e.target.value })}
                        className="w-full pl-3 pr-14 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800 font-mono"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 uppercase font-mono select-none">
                        {form.unit || 'units'}
                      </div>
                    </div>
                  </div>
                  {form.altUnit && form.altUnitConversion && (
                    <div className="col-span-2 text-center bg-white py-1.5 px-3 rounded-lg border border-slate-100 text-[10.5px] font-medium text-slate-500">
                      Formula: <span className="font-bold text-slate-800">1 {form.altUnit}</span> = <span className="font-extrabold text-blue-600 font-mono text-xs">{form.altUnitConversion}</span> × <span className="font-bold text-slate-800">{form.unit}</span>
                    </div>
                  )}
                </div>
              )}
              {activeFields.includes('group') && (
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">Group</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search or type group..."
                      value={groupSearch}
                      onChange={e => {
                        setGroupSearch(e.target.value);
                        setForm(prev => ({ ...prev, group: e.target.value }));
                      }}
                      onFocus={() => {
                        setShowGroupDropdown(true);
                        setGroupAtFocus(form.group);
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-800"
                    />
                    {showGroupDropdown && (
                      <>
                        <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20 divide-y divide-gray-50">
                          {groupsList
                            .filter(g => {
                              if (groupSearch === groupAtFocus) return true;
                              return g.toLowerCase().includes(groupSearch.toLowerCase());
                            })
                            .map(g => (
                              <button
                                key={g}
                                type="button"
                                onClick={() => {
                                  setForm(prev => ({ ...prev, group: g }));
                                  setGroupSearch(g);
                                  setShowGroupDropdown(false);
                                }}
                                className="w-full px-3 py-2 text-left text-xs hover:bg-blue-50 hover:text-blue-600 transition-colors font-semibold text-gray-700 block"
                              >
                                {g}
                              </button>
                              ))
                            }
                          {groupSearch.trim() && !groupsList.some(g => g.toLowerCase() === groupSearch.toLowerCase()) && (
                            <button
                              type="button"
                              onClick={() => {
                                const newGrp = groupSearch.trim();
                                if (!groupsList.includes(newGrp)) {
                                  setGroupsList(prev => [...prev, newGrp]);
                                }
                                setForm(prev => ({ ...prev, group: newGrp }));
                                setShowGroupDropdown(false);
                              }}
                              className="w-full px-3 py-2 text-left text-xs hover:bg-green-50 text-green-600 font-bold transition-colors block"
                            >
                              + Add Group "{groupSearch.trim()}"
                            </button>
                          )}
                          {groupsList.filter(g => g.toLowerCase().includes(groupSearch.toLowerCase())).length === 0 && !groupSearch.trim() && (
                            <div className="px-3 py-2 text-xs text-gray-400 italic">No groups found</div>
                          )}
                        </div>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setShowGroupDropdown(false)} 
                        />
                      </>
                    )}
                  </div>
                </div>
              )}
              {activeFields.includes('ruleType') && (
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
              {activeFields.includes('pages') && (
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
              )}
              {activeFields.includes('booksGbl') && (
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

      {/* Dynamic Option Custom Modal Popup */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs font-sans text-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full border border-gray-150 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="font-bold text-gray-800 text-xs">
                Add Custom {modalConfig.type === 'categories' ? 'Category' : modalConfig.type === 'units' ? 'Unit' : modalConfig.type === 'groups' ? 'Group' : 'Rule Type'}
              </span>
              <button 
                type="button"
                onClick={() => setModalConfig({ isOpen: false, type: null, nameValue: '', selectedFields: [] })}
                className="text-gray-400 hover:text-gray-600 rounded p-1 hover:bg-gray-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            {/* Form Fields */}
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[9px] font-bold text-gray-500 mb-1 uppercase">
                  {modalConfig.type === 'categories' ? 'Category Name' : modalConfig.type === 'units' ? 'Unit Symbol' : modalConfig.type === 'groups' ? 'Group Name' : 'Rule Name'} *
                </label>
                <input
                  type="text"
                  placeholder={
                    modalConfig.type === 'categories' ? 'e.g. Packing Material' :
                    modalConfig.type === 'units' ? 'e.g. gross' :
                    modalConfig.type === 'groups' ? 'e.g. 132P Happy days (UR)' : 'e.g. Single Line'
                  }
                  value={modalConfig.nameValue}
                  onChange={e => setModalConfig(prev => ({ ...prev, nameValue: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 font-semibold text-gray-800 bg-white"
                  autoFocus
                />
              </div>

              {/* Checklist of fields for new Category */}
              {modalConfig.type === 'categories' && (
                <div className="space-y-2 border-t pt-3">
                  <span className="block text-[9px] font-black text-gray-500 uppercase tracking-wider mb-1">
                    Select Required Fields
                  </span>
                  <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100 max-h-40 overflow-y-auto">
                    {[
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
                    ].map(f => (
                      <label key={f.id} className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition-colors">
                        <input
                          type="checkbox"
                          checked={modalConfig.selectedFields.includes(f.id)}
                          onChange={e => {
                            const newFields = e.target.checked
                              ? [...modalConfig.selectedFields, f.id]
                              : modalConfig.selectedFields.filter(x => x !== f.id);
                            setModalConfig(prev => ({ ...prev, selectedFields: newFields }));
                          }}
                          className="rounded border-gray-305 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                        <span className="text-[10px] font-semibold text-gray-700">{f.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalConfig({ isOpen: false, type: null, nameValue: '', selectedFields: [] })}
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

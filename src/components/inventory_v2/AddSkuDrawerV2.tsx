import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw } from 'lucide-react';
import { createSkuV2, updateSkuV2, SkuV2 } from '../../api/mfgApiV2';

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
    category: 'Raw Material' as any,
    unit: 'kg',
    gsm: '',
    width: '',
    length: '',
    brand: '',
    ruleType: 'Plain' as any,
    pages: '',
    booksGbl: '',
    status: 'Active' as any
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Update form state if editSku is provided or changes
  useEffect(() => {
    if (editSku) {
      setForm({
        skuCode: editSku.skuCode || '',
        name: editSku.name || '',
        category: editSku.category || 'Raw Material',
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
    } else {
      setForm({
        skuCode: '',
        name: '',
        category: 'Raw Material',
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
    }
  }, [editSku]);

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
      <div className="relative w-full max-w-lg bg-white shadow-2xl h-full flex flex-col z-10 animate-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {editSku ? 'Edit SKU (Beta)' : 'Add New SKU (Beta)'}
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {editSku ? 'Modify SKU specifications and values' : 'Register a new manufacturing inventory SKU item'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
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
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5">
              General Information
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">SKU Code *</label>
                <input
                  type="text"
                  placeholder="e.g. RM-REEL-01"
                  value={form.skuCode}
                  onChange={e => setForm({ ...form, skuCode: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                  required
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Category *</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="Raw Material">Raw Material</option>
                  <option value="Semi Finished">Semi Finished</option>
                  <option value="Finished Goods">Finished Goods</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">SKU Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Maplitho Paper Reel 70 GSM"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                  required
                />
              </div>
            </div>
          </div>

          {/* Group 2: Specifications */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5">
              Specifications
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">GSM</label>
                <input
                  type="number"
                  placeholder="e.g. 70"
                  value={form.gsm}
                  onChange={e => setForm({ ...form, gsm: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Brand</label>
                <input
                  type="text"
                  placeholder="e.g. Century / BILT"
                  value={form.brand}
                  onChange={e => setForm({ ...form, brand: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Width (inch/mm)</label>
                <input
                  type="number"
                  placeholder="e.g. 32"
                  value={form.width}
                  onChange={e => setForm({ ...form, width: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Length (inch/mm)</label>
                <input
                  type="number"
                  placeholder="e.g. 44"
                  value={form.length}
                  onChange={e => setForm({ ...form, length: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Group 3: Additional Attributes */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5">
              Inventory & Additional Attributes
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Default Unit</label>
                <select
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="kg">kg</option>
                  <option value="pcs">pcs</option>
                  <option value="Sheets">Sheets</option>
                  <option value="Reels">Reels</option>
                  <option value="mtr">mtr</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Rule Type</label>
                <select
                  value={form.ruleType}
                  onChange={e => setForm({ ...form, ruleType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="Plain">Plain</option>
                  <option value="Single Line">Single Line</option>
                  <option value="Double Line">Double Line</option>
                  <option value="Square Ruled">Square Ruled</option>
                  <option value="Four Line">Four Line</option>
                  <option value="Unruled">Unruled</option>
                </select>
              </div>
              {form.category === 'Finished Goods' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Pages</label>
                    <input
                      type="number"
                      placeholder="e.g. 112 / 132"
                      value={form.pages}
                      onChange={e => setForm({ ...form, pages: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Books / GBL</label>
                    <input
                      type="number"
                      placeholder="e.g. 200 / 240"
                      value={form.booksGbl}
                      onChange={e => setForm({ ...form, booksGbl: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
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

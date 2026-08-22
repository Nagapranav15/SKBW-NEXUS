import React, { useEffect, useState } from 'react';
import { 
  BookOpen, Plus, Search, Layers, RefreshCw, Trash2, Edit, Check, 
  ChevronRight, ArrowRight, Play, Scale, Sparkles, Box, FileText, AlertCircle, X 
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { getSkusV2, getBalancesV2, SkuV2 } from '../../../api/mfgApiV2';
import { showToast } from '../../ui/Toast';
import Modal from '../../ui/Modal';
import Drawer from '../../ui/Drawer';

export interface BomComponent {
  skuId: string;
  skuCode?: string;
  skuName: string;
  quantity: number;
  unit: string;
  wastagePercent: number; // e.g. 2%
  estimatedRate?: number;
}

export interface BomRecipe {
  id: string;
  recipeCode: string; // e.g. BOM-AUG-001
  name: string; // e.g. 200 Pgs Deluxe Notebook Assembly
  outputSkuId: string;
  outputSkuName: string;
  outputQty: number;
  outputUnit: string;
  category: string;
  yieldPercent: number; // e.g. 98%
  components: BomComponent[];
  remarks?: string;
  createdAt: string;
}

const DEFAULT_BOM_RECIPES: BomRecipe[] = [
  {
    id: 'bom-1',
    recipeCode: 'BOM-AUG-001',
    name: '200 Pages Single Line Notebook Assembly',
    outputSkuId: 'sku-nb-200',
    outputSkuName: '200 Pgs Deluxe Single Line Notebook',
    outputQty: 100,
    outputUnit: 'Books',
    category: 'Finished Goods',
    yieldPercent: 98,
    remarks: 'Standard production recipe for 200p single line notebook bundle',
    createdAt: new Date().toISOString(),
    components: [
      { skuId: 'sku-1', skuCode: 'SKU-001', skuName: 'vector Reel 52 GSM 64 CM', quantity: 42, unit: 'KG', wastagePercent: 2, estimatedRate: 45 },
      { skuId: 'sku-2', skuCode: 'SKU-002', skuName: 'Duplex Cover Paper 180 GSM', quantity: 100, unit: 'Sheets', wastagePercent: 1, estimatedRate: 6.5 },
      { skuId: 'sku-3', skuCode: 'SKU-003', skuName: 'Staple Wire 24/6', quantity: 0.4, unit: 'KG', wastagePercent: 0, estimatedRate: 120 }
    ]
  },
  {
    id: 'bom-2',
    recipeCode: 'BOM-AUG-002',
    name: 'Reel-to-Sheet 52 GSM Conversion Recipe',
    outputSkuId: 'sku-sheet-57',
    outputSkuName: 'maplito Sheet 52GSM 57×78CM',
    outputQty: 500,
    outputUnit: 'Sheets',
    category: 'Semi Finished',
    yieldPercent: 97.5,
    remarks: 'High-speed rotary sheeting from 52 GSM paper reels',
    createdAt: new Date().toISOString(),
    components: [
      { skuId: 'sku-1', skuCode: 'SKU-001', skuName: 'vector Reel 52 GSM 64 CM', quantity: 50, unit: 'KG', wastagePercent: 2.5, estimatedRate: 45 }
    ]
  }
];

const BomRecipeMaster: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [recipes, setRecipes] = useState<BomRecipe[]>(() => {
    const saved = localStorage.getItem('skbw_bom_recipes_v2');
    return saved ? JSON.parse(saved) : DEFAULT_BOM_RECIPES;
  });
  
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [loading, setLoading] = useState(false);

  // Modal / Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<BomRecipe | null>(null);
  const [selectedRecipeDetail, setSelectedRecipeDetail] = useState<BomRecipe | null>(null);

  // Form State
  const [form, setForm] = useState<{
    name: string;
    outputSkuId: string;
    outputQty: string;
    outputUnit: string;
    yieldPercent: string;
    remarks: string;
    components: {
      skuId: string;
      quantity: string;
      unit: string;
      wastagePercent: string;
    }[];
  }>({
    name: '',
    outputSkuId: '',
    outputQty: '100',
    outputUnit: 'Books',
    yieldPercent: '98',
    remarks: '',
    components: [
      { skuId: '', quantity: '1', unit: 'KG', wastagePercent: '2' }
    ]
  });

  useEffect(() => {
    localStorage.setItem('skbw_bom_recipes_v2', JSON.stringify(recipes));
  }, [recipes]);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadSkus();
    }
  }, [selectedCompany?._id]);

  const loadSkus = async () => {
    setLoading(true);
    try {
      const data = await getSkusV2(selectedCompany?._id || '');
      setSkus(data.filter(s => s.status === 'Active'));
    } catch (e) {
      console.error(e);
      showToast('Failed to load active SKUs', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingRecipe(null);
    setForm({
      name: '',
      outputSkuId: skus[0]?._id || '',
      outputQty: '100',
      outputUnit: skus[0]?.unit || 'Books',
      yieldPercent: '98',
      remarks: '',
      components: [
        { skuId: skus[0]?._id || '', quantity: '10', unit: skus[0]?.unit || 'KG', wastagePercent: '2' }
      ]
    });
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (recipe: BomRecipe) => {
    setEditingRecipe(recipe);
    setForm({
      name: recipe.name,
      outputSkuId: recipe.outputSkuId,
      outputQty: String(recipe.outputQty),
      outputUnit: recipe.outputUnit,
      yieldPercent: String(recipe.yieldPercent),
      remarks: recipe.remarks || '',
      components: recipe.components.map(c => ({
        skuId: c.skuId,
        quantity: String(c.quantity),
        unit: c.unit,
        wastagePercent: String(c.wastagePercent)
      }))
    });
    setIsDrawerOpen(true);
  };

  const handleAddComponentRow = () => {
    const defaultSku = skus[0];
    setForm(prev => ({
      ...prev,
      components: [
        ...prev.components,
        { skuId: defaultSku?._id || '', quantity: '1', unit: defaultSku?.unit || 'KG', wastagePercent: '0' }
      ]
    }));
  };

  const handleRemoveComponentRow = (index: number) => {
    setForm(prev => ({
      ...prev,
      components: prev.components.filter((_, i) => i !== index)
    }));
  };

  const handleSaveRecipe = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      showToast('Please enter a recipe name', 'error');
      return;
    }
    if (!form.outputSkuId) {
      showToast('Please select an output SKU', 'error');
      return;
    }
    const outQtyNum = Number(form.outputQty);
    if (isNaN(outQtyNum) || outQtyNum <= 0) {
      showToast('Output quantity must be greater than zero', 'error');
      return;
    }

    if (form.components.length === 0) {
      showToast('At least one input component is required', 'error');
      return;
    }

    const outputSku = skus.find(s => s._id === form.outputSkuId);

    const formattedComponents: BomComponent[] = form.components.map(c => {
      const componentSku = skus.find(s => s._id === c.skuId);
      return {
        skuId: c.skuId,
        skuCode: componentSku?.skuCode || 'SKU',
        skuName: componentSku?.name || 'Raw Material Component',
        quantity: Number(c.quantity) || 0,
        unit: c.unit || componentSku?.unit || 'KG',
        wastagePercent: Number(c.wastagePercent) || 0
      };
    });

    if (editingRecipe) {
      const updated = recipes.map(r => r.id === editingRecipe.id ? {
        ...r,
        name: form.name.trim(),
        outputSkuId: form.outputSkuId,
        outputSkuName: outputSku?.name || r.outputSkuName,
        outputQty: outQtyNum,
        outputUnit: form.outputUnit,
        category: outputSku?.category || 'Finished Goods',
        yieldPercent: Number(form.yieldPercent) || 98,
        components: formattedComponents,
        remarks: form.remarks
      } : r);
      setRecipes(updated);
      showToast('BOM Recipe updated successfully', 'success');
    } else {
      const newRecipeCode = `BOM-AUG-${String(recipes.length + 1).padStart(3, '0')}`;
      const newRecipe: BomRecipe = {
        id: `bom-${Date.now()}`,
        recipeCode: newRecipeCode,
        name: form.name.trim(),
        outputSkuId: form.outputSkuId,
        outputSkuName: outputSku?.name || 'Output Product',
        outputQty: outQtyNum,
        outputUnit: form.outputUnit,
        category: outputSku?.category || 'Finished Goods',
        yieldPercent: Number(form.yieldPercent) || 98,
        components: formattedComponents,
        remarks: form.remarks,
        createdAt: new Date().toISOString()
      };
      setRecipes([newRecipe, ...recipes]);
      showToast(`Created BOM Recipe ${newRecipeCode}`, 'success');
    }

    setIsDrawerOpen(false);
  };

  const handleDeleteRecipe = (id: string) => {
    if (window.confirm('Are you sure you want to delete this BOM recipe?')) {
      setRecipes(recipes.filter(r => r.id !== id));
      if (selectedRecipeDetail?.id === id) setSelectedRecipeDetail(null);
      showToast('Recipe deleted', 'success');
    }
  };

  const filteredRecipes = recipes.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
                          r.recipeCode.toLowerCase().includes(search.toLowerCase()) ||
                          r.outputSkuName.toLowerCase().includes(search.toLowerCase());
    const matchesCat = !filterCategory || r.category === filterCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 flex-1 w-full relative transition-all duration-300 text-left font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-wider">
            <BookOpen className="w-4 h-4" />
            <span>Manufacturing Conversions</span>
          </div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight mt-1 flex items-center gap-2">
            Bill of Materials (BOM Recipes)
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Define standard production recipes, component proportions, and yield ratios
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadSkus()}
            className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 transition-colors shadow-3xs cursor-pointer"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-2xl text-xs font-extrabold shadow-md shadow-blue-500/25 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New BOM Recipe</span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 bg-blue-800/80 rounded-md text-[10px] font-mono text-blue-100 font-bold">
              Alt/Opt+C
            </span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-gray-200 shadow-3xs">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search recipes by code, output SKU, or recipe name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-gray-50/70 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white font-medium"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-gray-200 rounded-lg font-semibold text-gray-700 focus:outline-none cursor-pointer"
          >
            <option value="">All Categories</option>
            <option value="Finished Goods">Finished Goods</option>
            <option value="Semi Finished">Semi Finished</option>
            <option value="Raw Material">Raw Material</option>
          </select>
        </div>
      </div>

      {/* Recipes Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredRecipes.map((recipe) => (
          <div 
            key={recipe.id}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-250 overflow-hidden flex flex-col justify-between"
          >
            <div>
              {/* Recipe Card Header */}
              <div className="p-4 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 border-b border-gray-150 flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider font-mono text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded">
                    {recipe.recipeCode}
                  </span>
                  <h3 className="text-sm font-extrabold text-gray-900 mt-1.5 line-clamp-1">
                    {recipe.name}
                  </h3>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(recipe)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                    title="Edit Recipe"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteRecipe(recipe.id)}
                    className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                    title="Delete Recipe"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Output Product Banner */}
              <div className="p-4 border-b border-gray-100 bg-gray-50/40 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Target Output</span>
                  <span className="font-extrabold text-gray-900 text-xs mt-0.5 block">{recipe.outputSkuName}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Standard Batch</span>
                  <span className="font-black text-blue-600 text-xs mt-0.5 block">{recipe.outputQty} {recipe.outputUnit}</span>
                </div>
              </div>

              {/* Component Ingredients List */}
              <div className="p-4 space-y-2.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Input Ingredients ({recipe.components.length})
                </span>
                <div className="space-y-1.5">
                  {recipe.components.map((comp, cIdx) => (
                    <div key={cIdx} className="flex items-center justify-between p-2 bg-gray-50 rounded-xl text-xs">
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-gray-800 truncate block">{comp.skuName}</span>
                        <span className="text-[10px] text-gray-400 font-normal">Wastage: {comp.wastagePercent}%</span>
                      </div>
                      <span className="font-extrabold text-gray-900 whitespace-nowrap bg-white border border-gray-200 px-2 py-0.5 rounded-md text-[11px]">
                        {comp.quantity} {comp.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recipe Card Footer */}
            <div className="p-4 bg-gray-50/70 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                Yield: {recipe.yieldPercent}%
              </span>
              <button
                onClick={() => setSelectedRecipeDetail(recipe)}
                className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer"
              >
                <Play className="w-3 h-3 text-blue-400 fill-blue-400" />
                <span>Execute Recipe</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Drawer: Add / Edit BOM Recipe */}
      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} size="max-w-xl">
        <form onSubmit={handleSaveRecipe} className="flex h-full flex-col bg-white overflow-hidden text-left">
          <div className="px-6 py-4.5 border-b border-gray-150 flex items-center justify-between bg-white">
            <h2 className="text-base font-extrabold text-gray-900 tracking-tight">
              {editingRecipe ? 'Edit BOM Recipe' : 'Create New BOM Recipe'}
            </h2>
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-gray-800">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                Recipe Name *
              </label>
              <input
                type="text"
                placeholder="e.g. 200 Pages Single Line Notebook Assembly"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Target Output SKU *
                </label>
                <select
                  value={form.outputSkuId}
                  onChange={e => {
                    const selSku = skus.find(s => s._id === e.target.value);
                    setForm({ 
                      ...form, 
                      outputSkuId: e.target.value,
                      outputUnit: selSku?.unit || 'Books' 
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-semibold bg-white text-gray-900 focus:outline-none"
                >
                  {skus.map(s => (
                    <option key={s._id} value={s._id}>{s.name} ({s.skuCode})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Batch Output Qty *
                </label>
                <input
                  type="number"
                  value={form.outputQty}
                  onChange={e => setForm({ ...form, outputQty: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-bold text-blue-600 focus:outline-none"
                  min="0.01"
                  step="any"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Output Unit
                </label>
                <input
                  type="text"
                  value={form.outputUnit}
                  onChange={e => setForm({ ...form, outputUnit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-semibold text-gray-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Standard Yield %
                </label>
                <input
                  type="number"
                  value={form.yieldPercent}
                  onChange={e => setForm({ ...form, yieldPercent: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-bold text-emerald-700 focus:outline-none"
                  min="1"
                  max="100"
                />
              </div>
            </div>

            {/* Components / Ingredients Builder */}
            <div className="pt-3 border-t border-gray-150 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                  Raw Material Ingredients (Bill of Materials) *
                </label>
                <button
                  type="button"
                  onClick={handleAddComponentRow}
                  className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Ingredient
                </button>
              </div>

              {form.components.map((comp, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Ingredient #{idx + 1}</span>
                    {form.components.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveComponentRow(idx)}
                        className="text-rose-500 hover:text-rose-700 text-xs font-bold"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6">
                      <select
                        value={comp.skuId}
                        onChange={e => {
                          const val = e.target.value;
                          const sel = skus.find(s => s._id === val);
                          setForm(prev => {
                            const updated = [...prev.components];
                            updated[idx].skuId = val;
                            updated[idx].unit = sel?.unit || 'KG';
                            return { ...prev, components: updated };
                          });
                        }}
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg font-semibold bg-white text-xs"
                      >
                        {skus.map(s => (
                          <option key={s._id} value={s._id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        placeholder="Qty"
                        value={comp.quantity}
                        onChange={e => {
                          const val = e.target.value;
                          setForm(prev => {
                            const updated = [...prev.components];
                            updated[idx].quantity = val;
                            return { ...prev, components: updated };
                          });
                        }}
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg font-bold text-xs bg-white"
                        min="0.001"
                        step="any"
                        required
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        placeholder="Wastage %"
                        value={comp.wastagePercent}
                        onChange={e => {
                          const val = e.target.value;
                          setForm(prev => {
                            const updated = [...prev.components];
                            updated[idx].wastagePercent = val;
                            return { ...prev, components: updated };
                          });
                        }}
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg font-semibold text-xs bg-white text-rose-600"
                        title="Allowed wastage %"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                Remarks / Notes
              </label>
              <textarea
                value={form.remarks}
                onChange={e => setForm({ ...form, remarks: e.target.value })}
                placeholder="Enter any production instructions or recipe notes..."
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-medium focus:outline-none"
                rows={2}
              />
            </div>
          </div>

          <div className="p-4 border-t border-gray-150 bg-gray-50 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 font-bold hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-500/20"
            >
              Save BOM Recipe
            </button>
          </div>
        </form>
      </Drawer>

      {/* Modal: Recipe Details & Execute Conversion */}
      <Modal 
        isOpen={!!selectedRecipeDetail} 
        onClose={() => setSelectedRecipeDetail(null)}
        title={`Execute Recipe: ${selectedRecipeDetail?.recipeCode}`}
        size="max-w-lg"
      >
        {selectedRecipeDetail && (
          <div className="space-y-4 text-xs text-left">
            <div className="p-4 bg-blue-50/80 border border-blue-150 rounded-2xl">
              <h3 className="font-black text-gray-900 text-sm">{selectedRecipeDetail.name}</h3>
              <div className="flex items-center gap-3 mt-1 text-gray-600 font-semibold">
                <span>Batch Output: <strong className="text-blue-700">{selectedRecipeDetail.outputQty} {selectedRecipeDetail.outputUnit}</strong></span>
                <span>•</span>
                <span>Expected Yield: <strong className="text-emerald-700">{selectedRecipeDetail.yieldPercent}%</strong></span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-gray-400 uppercase text-[10px] block">Required Ingredients Breakdown</span>
              {selectedRecipeDetail.components.map((comp, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                  <div>
                    <span className="font-bold text-gray-900 block">{comp.skuName}</span>
                    <span className="text-[10px] text-gray-400">Est. Wastage: {comp.wastagePercent}%</span>
                  </div>
                  <span className="font-black text-gray-900 text-xs bg-white px-2.5 py-1 rounded-lg border border-gray-200">
                    {comp.quantity} {comp.unit}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-gray-150 flex items-center justify-end gap-2">
              <button
                onClick={() => setSelectedRecipeDetail(null)}
                className="px-4 py-2 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const rec = selectedRecipeDetail;
                  setSelectedRecipeDetail(null);
                  showToast(`Conversion job for '${rec.name}' initialized!`, 'success');
                }}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
              >
                <Play className="w-4 h-4" />
                <span>Start Conversion Job</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BomRecipeMaster;

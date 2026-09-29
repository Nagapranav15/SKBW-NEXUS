import React, { useState, useEffect, useMemo } from 'react';
import { 
  ClipboardList, Search, Download, X, Copy, Save, RefreshCw, Layers, Boxes, Package, Trash2,
  Settings, Plus, Tag, Receipt, Info
} from 'lucide-react';
import { SkuV2, getSkusV2, updateSkuV2 } from '../../api/mfgApiV2';
import Modal from '../ui/Modal';
import { SearchableMaterialDropdown } from '../inventory_v2/AddSkuDrawerV2';
import { BomCopyPasteControls, MakoroPasteIcon } from '../inventory_v2/BomCopyPasteControls';
import { copyBom, useCopiedBom } from '../../utils/bomClipboard';
import { AdditionalCostRow, ProfitPricingState, calculateCosting, formatInr } from '../../utils/costingUtils';
import { showToast } from '../ui/Toast';
import * as XLSX from 'xlsx';

export interface BomRecipeItem {
  id: string;
  skuId?: string;
  skuCode?: string;
  name: string;
  qty: number;
  uom: string;
  inStock: number;
  notes?: string;
}

export interface BulkEditBomModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  initialSelectedSkuId?: string;
  onSaved?: (updatedSku: SkuV2) => void;
}

export const BulkEditBomModal: React.FC<BulkEditBomModalProps> = ({
  isOpen,
  onClose,
  companyId,
  initialSelectedSkuId,
  onSaved
}) => {
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeBomProduct, setActiveBomProduct] = useState<SkuV2 | null>(null);
  const [activeRecipeItems, setActiveRecipeItems] = useState<BomRecipeItem[]>([]);
  const [activeAdditionalCosts, setActiveAdditionalCosts] = useState<AdditionalCostRow[]>([]);
  const [activeProfitPricing, setActiveProfitPricing] = useState<ProfitPricingState>({
    pricingMethod: 'Markup %',
    markupPercentage: ''
  });
  const [buildBatchYieldQty, setBuildBatchYieldQty] = useState<string>('1');
  const [buildBatchYieldUnit, setBuildBatchYieldUnit] = useState<string>('Pcs');
  const [isSavingBuildBom, setIsSavingBuildBom] = useState(false);

  // Filters & Search
  const [buildBomsSearch, setBuildBomsSearch] = useState('');
  const [onlyNoRecipeFilter, setOnlyNoRecipeFilter] = useState(false);
  const [buildBomsTitleFilter, setBuildBomsTitleFilter] = useState('');
  const [buildBomsRulingFilter, setBuildBomsRulingFilter] = useState('');
  const [buildBomsSortBy, setBuildBomsSortBy] = useState<'default' | 'title-asc' | 'title-desc' | 'ruling-asc' | 'ruling-desc' | 'name-asc' | 'name-desc'>('default');
  const [catalogSearch, setCatalogSearch] = useState('');

  // BOM Clipboard
  const copiedBom = useCopiedBom();

  // Load SKUs
  useEffect(() => {
    if (!isOpen || !companyId) return;
    let isMounted = true;
    setLoading(true);

    getSkusV2(companyId)
      .then(res => {
        if (!isMounted) return;
        const list = Array.isArray(res) ? res : [];
        setSkus(list);

        // Auto select initial SKU if provided
        if (initialSelectedSkuId) {
          const match = list.find(s => s._id === initialSelectedSkuId);
          if (match) {
            handleSelectBomProduct(match, list);
          }
        }
      })
      .catch(err => {
        console.error('Failed to load SKUs for BOM editor:', err);
        showToast('Failed to load items catalog', 'error');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, companyId, initialSelectedSkuId]);

  // Product classification
  const getItemClassification = (sku: SkuV2): 'products' | 'materials' | 'semi' => {
    const code = (sku.skuCode || '').toUpperCase();
    const cat = (sku.category || sku.group || '').toLowerCase();
    const name = (sku.name || '').toLowerCase();

    if (
      code.startsWith('SFG-') || 
      code.startsWith('SFG') || 
      code.startsWith('SM-') || 
      code.startsWith('SM') || 
      cat.includes('semi') || 
      cat.includes('sub-assembly') || 
      cat.includes('ruled cut') || 
      cat.includes('sheets') || 
      name.includes('signature') || 
      name.includes('block')
    ) {
      return 'semi';
    }

    if (
      cat.includes('raw') || 
      cat.includes('material') || 
      cat === 'raw material' || 
      cat.includes('reel') || 
      cat.includes('board') || 
      code.startsWith('RM-') || 
      code.startsWith('RM') || 
      name.includes('reel') || 
      name.includes('wire') || 
      name.includes('adhesive') || 
      name.includes('glue')
    ) {
      return 'materials';
    }

    return 'products';
  };

  const productsList = useMemo(() => skus.filter(s => getItemClassification(s) === 'products'), [skus]);
  const materialsList = useMemo(() => skus.filter(s => getItemClassification(s) === 'materials'), [skus]);
  const semiList = useMemo(() => skus.filter(s => getItemClassification(s) === 'semi'), [skus]);
  const rawAndSemiMaterials = useMemo(() => [...materialsList, ...semiList], [materialsList, semiList]);

  // Filter & Sort Products
  const buildBomsAvailableTitles = useMemo(() => {
    const set = new Set<string>();
    productsList.forEach(p => {
      const val = (p.title || p.brand || '').trim();
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [productsList]);

  const buildBomsAvailableRulings = useMemo(() => {
    const set = new Set<string>();
    productsList.forEach(p => {
      const val = (p.ruleType || '').trim();
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [productsList]);

  const filteredBuildProducts = useMemo(() => {
    let filtered = productsList;

    if (buildBomsSearch.trim()) {
      const q = buildBomsSearch.toLowerCase().trim();
      filtered = filtered.filter(p => 
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.skuCode && p.skuCode.toLowerCase().includes(q)) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.title && p.title.toLowerCase().includes(q))
      );
    }

    if (onlyNoRecipeFilter) {
      filtered = filtered.filter(p => !(p as any).bomItems || (p as any).bomItems.length === 0);
    }

    if (buildBomsTitleFilter) {
      filtered = filtered.filter(p => (p.title || p.brand || '').trim() === buildBomsTitleFilter.trim());
    }

    if (buildBomsRulingFilter) {
      filtered = filtered.filter(p => (p.ruleType || '').trim() === buildBomsRulingFilter.trim());
    }

    if (buildBomsSortBy === 'title-asc') {
      return [...filtered].sort((a, b) => (a.brand || a.title || a.name || '').localeCompare(b.brand || b.title || b.name || ''));
    } else if (buildBomsSortBy === 'title-desc') {
      return [...filtered].sort((a, b) => (b.brand || b.title || b.name || '').localeCompare(a.brand || a.title || a.name || ''));
    } else if (buildBomsSortBy === 'ruling-asc') {
      return [...filtered].sort((a, b) => (a.ruleType || '').localeCompare(b.ruleType || ''));
    } else if (buildBomsSortBy === 'ruling-desc') {
      return [...filtered].sort((a, b) => (b.ruleType || '').localeCompare(a.ruleType || ''));
    } else if (buildBomsSortBy === 'name-asc') {
      return [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (buildBomsSortBy === 'name-desc') {
      return [...filtered].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    }

    return filtered;
  }, [productsList, buildBomsSearch, onlyNoRecipeFilter, buildBomsTitleFilter, buildBomsRulingFilter, buildBomsSortBy]);

  const filteredRawCatalog = useMemo(() => {
    return materialsList.filter(m => (m.name || '').toLowerCase().includes(catalogSearch.toLowerCase()));
  }, [materialsList, catalogSearch]);

  const filteredSemiCatalog = useMemo(() => {
    return semiList.filter(s => (s.name || '').toLowerCase().includes(catalogSearch.toLowerCase()));
  }, [semiList, catalogSearch]);

  // Select product
  const handleSelectBomProduct = (prod: SkuV2, currentSkus = skus) => {
    setActiveBomProduct(prod);
    setBuildBatchYieldQty(String((prod as any).recipeYieldQty ?? (prod as any).batchYieldQty ?? '1'));
    setBuildBatchYieldUnit((prod as any).recipeYieldUnit || (prod as any).batchYieldUnit || prod.unit || 'Pcs');

    if ((prod as any).bomItems && Array.isArray((prod as any).bomItems)) {
      setActiveRecipeItems((prod as any).bomItems.map((item: any, idx: number) => {
        const matchedSku = currentSkus.find(s => 
          (item.skuId && String(s._id) === String(item.skuId)) ||
          (item.skuCode && s.skuCode === item.skuCode) ||
          (item.id && String(s._id) === String(item.id)) ||
          (item.name && s.name === item.name)
        );
        const currentName = matchedSku?.name || item.name || item.itemName || '';
        return {
          id: item.id || `b-${idx}`,
          skuId: item.skuId || matchedSku?._id,
          skuCode: item.skuCode || matchedSku?.skuCode,
          name: currentName,
          qty: Number(item.qty) || 1,
          uom: item.uom || matchedSku?.unit || 'Kg',
          inStock: Number((matchedSku as any)?.openingStock ?? item.inStock ?? 0),
          notes: item.notes || ''
        };
      }));
    } else {
      setActiveRecipeItems([]);
    }

    if (Array.isArray((prod as any).additionalCosts)) {
      setActiveAdditionalCosts((prod as any).additionalCosts.map((c: any, i: number) => ({
        id: c.id || `cost-${Date.now()}-${i}`,
        costType: c.costType || '',
        calcBasis: c.calcBasis || c.basis || 'Per Piece',
        amount: c.amount ?? '',
        appliedAs: c.appliedAs || 'Per Unit (PCS)'
      })));
    } else {
      setActiveAdditionalCosts([]);
    }

    if ((prod as any).profitPricing && typeof (prod as any).profitPricing === 'object') {
      setActiveProfitPricing({
        pricingMethod: (prod as any).profitPricing.pricingMethod || 'Markup %',
        markupPercentage: (prod as any).profitPricing.markupPercentage ?? '',
        suggestedPricePcs: (prod as any).profitPricing.suggestedPricePcs,
        suggestedPriceGbl: (prod as any).profitPricing.suggestedPriceGbl
      });
    } else {
      setActiveProfitPricing({
        pricingMethod: 'Markup %',
        markupPercentage: ''
      });
    }
  };

  // Financial Costing Summary (Material Cost + Additional Costs + Profit & Pricing)
  const totalMaterialCost = useMemo(() => {
    return activeRecipeItems.reduce((sum, item) => {
      const matchedSku = skus.find(s => 
        (item.skuId && String(s._id) === String(item.skuId)) ||
        (item.skuCode && s.skuCode === item.skuCode) ||
        (item.name && s.name === item.name)
      );
      const rate = Number(
        (matchedSku as any)?.purchasePrice ||
        (matchedSku as any)?.ratePerKg ||
        (matchedSku as any)?.rate ||
        (matchedSku as any)?.avgRate ||
        (matchedSku as any)?.cost ||
        (matchedSku as any)?.unitPrice ||
        (item as any)?.rate ||
        0
      );
      return sum + ((Number(item.qty) || 0) * rate);
    }, 0);
  }, [activeRecipeItems, skus]);

  const costingSummary = useMemo(() => {
    const factor = Number(activeBomProduct?.booksGbl || activeBomProduct?.altUnitConversion || 400) || 400;
    return calculateCosting({
      materialCost: totalMaterialCost,
      additionalCosts: activeAdditionalCosts,
      batchQty: Number(buildBatchYieldQty) || 1,
      batchUnit: buildBatchYieldUnit,
      conversionFactor: factor,
      pricing: activeProfitPricing
    });
  }, [totalMaterialCost, activeAdditionalCosts, buildBatchYieldQty, buildBatchYieldUnit, activeBomProduct, activeProfitPricing]);

  // If no active product yet, auto-select first available product
  useEffect(() => {
    if (isOpen && filteredBuildProducts.length > 0 && !activeBomProduct) {
      handleSelectBomProduct(filteredBuildProducts[0]);
    }
  }, [isOpen, filteredBuildProducts, activeBomProduct]);

  // Save recipe
  const handleSaveBuildBomRecipe = async () => {
    if (!activeBomProduct?._id) return;
    setIsSavingBuildBom(true);
    try {
      const yieldQty = Number(buildBatchYieldQty) || 1;
      const yieldUnit = buildBatchYieldUnit || (activeBomProduct as any).recipeYieldUnit || (activeBomProduct as any).batchYieldUnit || activeBomProduct.unit || 'Pcs';

      const updatedPayload: any = {
        bomItems: activeRecipeItems,
        additionalCosts: activeAdditionalCosts,
        profitPricing: {
          ...activeProfitPricing,
          suggestedPricePcs: costingSummary.suggestedPricePcs,
          suggestedPriceGbl: costingSummary.suggestedPriceGbl
        },
        recipeYieldQty: yieldQty,
        recipeYieldUnit: yieldUnit,
        batchYieldQty: yieldQty,
        batchYieldUnit: yieldUnit,
        company: companyId
      };

      const updatedSkuRes = await updateSkuV2(activeBomProduct._id, updatedPayload);
      const updated = {
        ...activeBomProduct,
        ...updatedPayload,
        ...(updatedSkuRes || {})
      };

      // Update state
      setSkus(prev => prev.map(s => s._id === activeBomProduct._id ? updated : s));
      setActiveBomProduct(updated);

      showToast(`BOM Recipe & Costing saved for ${activeBomProduct.name}!`, 'success');
      if (onSaved) {
        onSaved(updated);
      }
    } catch (err: any) {
      console.error('Failed to save BOM recipe:', err);
      showToast(err.message || 'Failed to save BOM recipe', 'error');
    } finally {
      setIsSavingBuildBom(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    try {
      const rows: any[] = [];
      productsList.forEach(prod => {
        const items = (prod as any).bomItems || [];
        if (items.length === 0) {
          rows.push({
            'Product Code': prod.skuCode,
            'Product Name': prod.name,
            'Brand': prod.brand || prod.title || '',
            'Yield Qty': (prod as any).recipeYieldQty || 1,
            'Yield Unit': (prod as any).recipeYieldUnit || prod.unit || 'Pcs',
            'Ingredient Code': '',
            'Ingredient Name': '',
            'Qty': '',
            'UOM': ''
          });
        } else {
          items.forEach((item: any) => {
            rows.push({
              'Product Code': prod.skuCode,
              'Product Name': prod.name,
              'Brand': prod.brand || prod.title || '',
              'Yield Qty': (prod as any).recipeYieldQty || 1,
              'Yield Unit': (prod as any).recipeYieldUnit || prod.unit || 'Pcs',
              'Ingredient Code': item.skuCode || '',
              'Ingredient Name': item.name || '',
              'Qty': item.qty || '',
              'UOM': item.uom || ''
            });
          });
        }
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'BOM Recipes');
      XLSX.writeFile(workbook, `BOM_Recipes_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast('Exported BOM recipes to Excel', 'success');
    } catch (e: any) {
      showToast('Failed to export CSV: ' + e.message, 'error');
    }
  };

  const productsWithRecipeCount = useMemo(() => {
    return productsList.filter(p => (p as any).bomItems && (p as any).bomItems.length > 0).length;
  }, [productsList]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="max-w-[1360px]"
      maxWidth="max-w-[1360px]"
      hideCloseButton={true}
    >
      <div className="p-5 space-y-4 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-emerald-100/70 text-emerald-800 rounded-2xl shrink-0">
              <ClipboardList className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 truncate">
                <span>Build BOMs</span>
              </h3>
              <p className="text-xs text-gray-400 font-medium truncate">
                Define recipes product by product — a faster alternative to the Excel import.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-gray-500" /> Export all (Excel)
            </button>
            <div className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-xl">
              {productsWithRecipeCount} of {productsList.length} items have a recipe
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              title="Close Build BOMs"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3-Column Body Layout */}
        <div className="grid grid-cols-12 gap-4 flex-1 overflow-hidden min-h-[540px]">
          {/* Column 1: Products Selector List (3 cols) */}
          <div className="col-span-3 border border-gray-200 rounded-2xl p-3 flex flex-col gap-2.5 bg-gray-50/40 overflow-hidden">
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  value={buildBomsSearch}
                  onChange={(e) => setBuildBomsSearch(e.target.value)}
                  placeholder="Search products..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 shadow-2xs font-medium"
                />
              </div>

              {/* Title / Brand & Ruling Spec Filter Row */}
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <select
                    value={buildBomsTitleFilter}
                    onChange={(e) => setBuildBomsTitleFilter(e.target.value)}
                    className="w-full px-2 py-1 text-[11px] font-semibold bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs truncate"
                    title="Filter by Brand"
                  >
                    <option value="">All Brands ({buildBomsAvailableTitles.length})</option>
                    {buildBomsAvailableTitles.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={buildBomsRulingFilter}
                    onChange={(e) => setBuildBomsRulingFilter(e.target.value)}
                    className="w-full px-2 py-1 text-[11px] font-semibold bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs truncate"
                    title="Filter by Ruling"
                  >
                    <option value="">All Rulings ({buildBomsAvailableRulings.length})</option>
                    {buildBomsAvailableRulings.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sort Controls Row */}
              <div className="flex items-center gap-1.5">
                <select
                  value={buildBomsSortBy}
                  onChange={(e) => setBuildBomsSortBy(e.target.value as any)}
                  className="w-full px-2 py-1 text-[11px] font-bold bg-blue-50/80 border border-blue-200 rounded-lg text-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                  title="Sort products list"
                >
                  <option value="default">Sort: Default Code</option>
                  <option value="title-asc">Sort: Title (A → Z)</option>
                  <option value="title-desc">Sort: Title (Z → A)</option>
                  <option value="ruling-asc">Sort: Ruling (A → Z)</option>
                  <option value="ruling-desc">Sort: Ruling (Z → A)</option>
                  <option value="name-asc">Sort: Product Name (A → Z)</option>
                </select>

                {(buildBomsTitleFilter || buildBomsRulingFilter || buildBomsSortBy !== 'default' || onlyNoRecipeFilter || buildBomsSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setBuildBomsSearch('');
                      setBuildBomsTitleFilter('');
                      setBuildBomsRulingFilter('');
                      setBuildBomsSortBy('default');
                      setOnlyNoRecipeFilter(false);
                    }}
                    className="px-2 py-1 text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg shrink-0 cursor-pointer transition-all"
                    title="Reset all filters"
                  >
                    Reset
                  </button>
                )}
              </div>

              <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-600 cursor-pointer select-none px-1">
                <input
                  type="checkbox"
                  checked={onlyNoRecipeFilter}
                  onChange={(e) => setOnlyNoRecipeFilter(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Only products without a recipe</span>
              </label>
            </div>

            {/* Clipboard Banner */}
            {copiedBom && (
              <div className="p-2.5 bg-emerald-50/90 border border-emerald-200 rounded-xl flex flex-col gap-2 text-xs shrink-0 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">BOM in Clipboard</span>
                    <span className="text-xs font-bold text-gray-800 truncate block" title={copiedBom.sourceName}>
                      {copiedBom.sourceName} ({copiedBom.lines.length} items)
                    </span>
                  </div>
                  {activeBomProduct && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRecipeItems(copiedBom.lines.map((l, i) => ({
                          id: `b-build-paste-${Date.now()}-${i}`,
                          name: l.name,
                          qty: Number(l.qty) || 1,
                          uom: l.uom,
                          inStock: l.inStock ?? 500,
                          notes: l.notes || ''
                        })));
                        if (copiedBom.basis) setBuildBatchYieldQty(String(copiedBom.basis));
                      }}
                      className="px-2.5 py-1 bg-[#064E3B] hover:bg-[#0B6B63] text-white rounded-md text-[11px] font-medium shrink-0 cursor-pointer shadow-2xs transition-all"
                    >
                      Paste to Active
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Products List */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {filteredBuildProducts.map((prod) => {
                const hasRecipe = (prod as any).bomItems && (prod as any).bomItems.length > 0;
                const isSelected = activeBomProduct?._id === prod._id;

                return (
                  <div
                    key={prod._id}
                    onClick={() => handleSelectBomProduct(prod)}
                    className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between border group/item ${
                      isSelected
                        ? 'bg-emerald-50/80 border-emerald-300 shadow-2xs'
                        : 'bg-white border-transparent hover:bg-gray-100/80 hover:border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="mt-0.5 shrink-0">
                        {hasRecipe ? (
                          <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">
                            ✓
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-[10px]">
                            !
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-gray-900 truncate">{prod.name}</div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-[10px] text-gray-400 font-mono">{prod.skuCode}</span>
                          {(prod.title || prod.brand) && (
                            <span className="text-[9.5px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded font-medium border border-emerald-200/60 truncate max-w-[100px]" title={prod.title || prod.brand}>
                              {prod.title || prod.brand}
                            </span>
                          )}
                          {prod.ruleType && (
                            <span className="text-[9.5px] text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded font-medium border border-blue-200/60 truncate max-w-[100px]" title={prod.ruleType}>
                              {prod.ruleType}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

            {/* Quick Copy / Paste Icons */}
                    <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                      {hasRecipe && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyBom({
                              sourceSkuId: prod._id,
                              sourceSkuCode: prod.skuCode,
                              sourceName: prod.name || prod.skuCode,
                              basis: (prod as any).recipeYieldQty || (prod as any).batchYieldQty || 1,
                              basisUnit: (prod as any).recipeYieldUnit || (prod as any).batchYieldUnit || prod.unit || 'Pcs',
                              lines: (prod as any).bomItems || [],
                              additionalCosts: (prod as any).additionalCosts || [],
                              profitPricing: (prod as any).profitPricing || { pricingMethod: 'Markup %', markupPercentage: '' }
                            });
                            showToast(`BOM copied from "${prod.name || prod.skuCode}"! Ready to paste.`, 'success');
                          }}
                          className="h-6 w-6 rounded border border-gray-200 bg-white text-[#0B6B63] hover:border-[#0B6B63] flex items-center justify-center shadow-2xs transition-all cursor-pointer"
                          title="Copy this BOM & Costing"
                        >
                          <Copy className="w-3 h-3 text-[#0B6B63]" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredBuildProducts.length === 0 && (
                <div className="p-4 text-center text-xs text-gray-400 italic">
                  No products match search
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Active Product Recipe & Costing Builder (6 cols) */}
          <div className="col-span-6 border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 bg-white overflow-hidden shadow-2xs">
            {activeBomProduct ? (
              <>
                {/* Active Product Header Bar */}
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <div className="min-w-0 pr-2">
                    <h4 className="font-bold text-gray-900 text-sm truncate" title={activeBomProduct.name}>{activeBomProduct.name}</h4>
                    <p className="text-xs text-gray-400 font-mono truncate">{activeBomProduct.skuCode}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <BomCopyPasteControls
                      getCopyPayload={() => {
                        const hasItems = activeRecipeItems && activeRecipeItems.length > 0;
                        const hasCosts = activeAdditionalCosts && activeAdditionalCosts.length > 0;
                        if (!hasItems && !hasCosts) return null;
                        return {
                          sourceSkuId: activeBomProduct?._id,
                          sourceSkuCode: activeBomProduct?.skuCode,
                          sourceName: activeBomProduct?.name || activeBomProduct?.skuCode || 'Product',
                          basis: buildBatchYieldQty,
                          basisUnit: buildBatchYieldUnit || (activeBomProduct as any)?.recipeYieldUnit || activeBomProduct?.unit || 'Pcs',
                          lines: activeRecipeItems.map(item => ({
                            id: item.id,
                            name: item.name,
                            qty: item.qty,
                            uom: item.uom,
                            inStock: item.inStock,
                            notes: item.notes
                          })),
                          additionalCosts: activeAdditionalCosts,
                          profitPricing: activeProfitPricing
                        };
                      }}
                      onPaste={(copied, mode) => {
                        if (mode === 'replace') {
                          setActiveRecipeItems(copied.lines.map((l, i) => ({
                            id: `b-build-paste-${Date.now()}-${i}`,
                            name: l.name,
                            qty: Number(l.qty) || 1,
                            uom: l.uom,
                            inStock: l.inStock ?? 500,
                            notes: l.notes || ''
                          })));
                          if (copied.basis) setBuildBatchYieldQty(String(copied.basis));
                          if (copied.basisUnit) setBuildBatchYieldUnit(copied.basisUnit);
                          if (Array.isArray(copied.additionalCosts)) {
                            setActiveAdditionalCosts(copied.additionalCosts.map((c, i) => ({
                              id: `cost-paste-${Date.now()}-${i}`,
                              costType: c.costType || '',
                              calcBasis: c.calcBasis || 'Per Piece',
                              amount: c.amount ?? '',
                              appliedAs: c.appliedAs || 'Per Unit (PCS)'
                            })));
                          }
                          if (copied.profitPricing) {
                            setActiveProfitPricing({
                              pricingMethod: copied.profitPricing.pricingMethod || 'Markup %',
                              markupPercentage: copied.profitPricing.markupPercentage ?? ''
                            });
                          }
                        } else {
                          const existingNames = new Set(activeRecipeItems.map(i => (i.name || '').toLowerCase().trim()));
                          const toAdd = copied.lines
                            .filter(l => !existingNames.has((l.name || '').toLowerCase().trim()))
                            .map((l, i) => ({
                              id: `b-build-merge-${Date.now()}-${i}`,
                              name: l.name,
                              qty: Number(l.qty) || 1,
                              uom: l.uom,
                              inStock: l.inStock ?? 500,
                              notes: l.notes || ''
                            }));
                          if (copied.basis) setBuildBatchYieldQty(String(copied.basis));
                          if (copied.basisUnit) setBuildBatchYieldUnit(copied.basisUnit);
                          setActiveRecipeItems(prev => [...prev, ...toAdd]);
                          if (Array.isArray(copied.additionalCosts) && copied.additionalCosts.length > 0) {
                            const existingCostTypes = new Set(activeAdditionalCosts.map(c => (c.costType || '').toLowerCase().trim()));
                            const costsToAdd = copied.additionalCosts
                              .filter(c => !existingCostTypes.has((c.costType || '').toLowerCase().trim()))
                              .map((c, i) => ({
                                id: `cost-merge-${Date.now()}-${i}`,
                                costType: c.costType,
                                calcBasis: c.calcBasis || 'Per Piece',
                                amount: c.amount,
                                appliedAs: c.appliedAs || 'Per Unit (PCS)'
                              }));
                            setActiveAdditionalCosts(prev => [...prev, ...costsToAdd]);
                          }
                          if (copied.profitPricing && (!activeProfitPricing.markupPercentage || activeProfitPricing.markupPercentage === '')) {
                            setActiveProfitPricing({
                              pricingMethod: copied.profitPricing.pricingMethod || 'Markup %',
                              markupPercentage: copied.profitPricing.markupPercentage ?? ''
                            });
                          }
                        }
                      }}
                      existingCount={activeRecipeItems.length}
                      sourceLabel={activeBomProduct?.name}
                      onToast={showToast}
                    />

                    <button
                      onClick={handleSaveBuildBomRecipe}
                      disabled={isSavingBuildBom}
                      className="px-3.5 py-1.5 bg-[#064E3B] hover:bg-[#0B6B63] text-white font-medium rounded-md text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isSavingBuildBom ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>Save recipe</span>
                    </button>
                  </div>
                </div>

                {/* Sub-header details bar with UOM / AUOM selector */}
                {(() => {
                  const uom = activeBomProduct?.unit || 'Pcs';
                  const auom = activeBomProduct?.altUnit;
                  const hasAuom = !!(auom && auom.trim() && auom.trim().toLowerCase() !== uom.trim().toLowerCase());
                  const currentUnit = buildBatchYieldUnit || (activeBomProduct as any)?.recipeYieldUnit || uom;

                  const options: { value: string; label: string }[] = [];
                  options.push({ value: uom, label: hasAuom ? `${uom} (UOM)` : uom });
                  if (hasAuom) {
                    options.push({ value: auom!.trim(), label: `${auom!.trim()} (AUOM)` });
                  }

                  return (
                    <div className="flex items-center gap-3 text-xs font-semibold text-gray-500 bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex-wrap shrink-0">
                      <span>ITEMS <strong>{activeRecipeItems.length}</strong></span>
                      <span>·</span>
                      <div className="flex items-center gap-1.5">
                        <span>BATCH SIZE:</span>
                        <input
                          type="number"
                          min="1"
                          placeholder="1"
                          value={buildBatchYieldQty}
                          onChange={(e) => setBuildBatchYieldQty(e.target.value)}
                          className="w-16 px-2 py-1 border border-blue-300 rounded-lg text-xs font-bold text-blue-700 text-center bg-white shadow-2xs focus:ring-2 focus:ring-blue-400 focus:outline-none"
                        />
                        {options.length > 1 ? (
                          <select
                            value={currentUnit}
                            onChange={(e) => setBuildBatchYieldUnit(e.target.value)}
                            className="px-2.5 py-1 border border-blue-300 rounded-lg text-xs font-bold text-blue-900 bg-blue-50/90 cursor-pointer shadow-2xs focus:ring-2 focus:ring-blue-400 focus:outline-none"
                            title="Yield Unit (UOM / AUOM)"
                          >
                            {options.map(opt => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <strong className="text-gray-800 bg-white border border-gray-200 px-2.5 py-1 rounded-lg text-xs font-bold font-mono shadow-2xs">
                            {uom}
                          </strong>
                        )}
                      </div>
                      <span>·</span>
                      <span className="text-[11px] font-normal text-gray-400">Quantities configured per batch produced</span>
                    </div>
                  );
                })()}

                {/* Searchable input to quickly add material */}
                <div className="relative z-30 shrink-0">
                  <SearchableMaterialDropdown
                    value=""
                    materials={rawAndSemiMaterials}
                    onChange={(selectedName, matchedSku) => {
                      if (!selectedName) return;
                      setActiveRecipeItems(prev => [
                        ...prev,
                        {
                          id: `b-${Date.now()}`,
                          skuId: matchedSku?._id,
                          skuCode: matchedSku?.skuCode,
                          name: selectedName,
                          qty: 1,
                          uom: matchedSku?.unit || 'Kg',
                          inStock: (matchedSku as any)?.openingStock ?? 0,
                          notes: ''
                        }
                      ]);
                    }}
                  />
                </div>

                {/* Middle Scrollable Section: Materials + Additional Costs + Profit & Pricing */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">

                  {/* SECTION 1: MATERIALS */}
                  <div className="border border-gray-200/90 rounded-2xl p-3.5 bg-white shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                          <Boxes className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                            MATERIALS ({activeRecipeItems.length})
                          </h5>
                          <p className="text-[10.5px] text-gray-400 font-medium">
                            Raw materials consumed to produce this item.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveRecipeItems(prev => [
                            ...prev,
                            {
                              id: `b-${Date.now()}`,
                              name: '',
                              qty: 1,
                              uom: 'Kg',
                              inStock: 0,
                              notes: ''
                            }
                          ]);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-all shadow-3xs"
                      >
                        <Plus className="w-3.5 h-3.5 text-blue-600" />
                        <span>Add Material</span>
                      </button>
                    </div>

                    <div className="overflow-visible border border-gray-200 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-gray-50/80 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 select-none">
                          <tr>
                            <th className="py-2 px-3 w-8 text-center">#</th>
                            <th className="py-2 px-3">MATERIAL</th>
                            <th className="py-2 px-3 text-center w-24">QTY</th>
                            <th className="py-2 px-3 text-center w-20">UOM</th>
                            <th className="py-2 px-3 text-center w-20">IN STOCK</th>
                            <th className="py-2 px-3 text-center w-16">ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {activeRecipeItems.map((b, idx) => (
                            <tr key={b.id} className="hover:bg-gray-50/60">
                              <td className="py-2 px-3 text-center text-gray-400 font-bold text-xs select-none">
                                <span className="text-gray-400 font-mono text-[11px] mr-1">::</span>{idx + 1}
                              </td>
                              <td className="py-2 px-3">
                                <span className="font-bold text-gray-900 text-xs block leading-snug">{b.name}</span>
                                {b.skuCode && <span className="text-[10px] text-gray-400 font-mono">{b.skuCode}</span>}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <input
                                  type="number"
                                  step="any"
                                  value={b.qty}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setActiveRecipeItems(prev => prev.map(item => item.id === b.id ? { ...item, qty: val } : item));
                                  }}
                                  className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold font-mono text-center focus:outline-none focus:border-[#064E3B] bg-white mx-auto block"
                                  placeholder="Qty"
                                />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <input
                                  type="text"
                                  value={b.uom || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setActiveRecipeItems(prev => prev.map(item => item.id === b.id ? { ...item, uom: val } : item));
                                  }}
                                  className="w-16 border border-gray-200 rounded-lg px-1.5 py-1 text-xs font-semibold text-center uppercase focus:outline-none focus:border-[#064E3B] bg-white mx-auto block"
                                  placeholder="UOM"
                                />
                              </td>
                              <td className="py-2 px-3 text-center font-mono text-gray-500 text-xs">
                                {b.inStock ?? '0'}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setActiveRecipeItems(prev => prev.filter(item => item.id !== b.id))}
                                  className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Remove material"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {activeRecipeItems.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-4 text-center text-xs text-gray-400 italic bg-gray-50/30">
                                No materials added yet. Select from the dropdown above or click on items in the right catalog.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* SECTION 2: ADDITIONAL COSTS / OVERHEADS */}
                  <div className="border border-gray-200/90 rounded-2xl p-3.5 bg-white shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                          <Settings className="w-4 h-4 text-amber-600" />
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                            ADDITIONAL COSTS / OVERHEADS ({activeAdditionalCosts.length})
                          </h5>
                          <p className="text-[10.5px] text-gray-400 font-medium">
                            Direct labour, electricity, packaging, or machine charges.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveAdditionalCosts(prev => [
                            ...prev,
                            {
                              id: `cost-${Date.now()}-${prev.length}`,
                              costType: '',
                              calcBasis: 'Per Piece',
                              amount: '',
                              appliedAs: 'Per Unit (PCS)'
                            }
                          ]);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-all shadow-3xs"
                      >
                        <Plus className="w-3.5 h-3.5 text-amber-600" />
                        <span>Add Cost</span>
                      </button>
                    </div>

                    <div className="overflow-visible border border-gray-200 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-gray-50/80 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 select-none">
                          <tr>
                            <th className="py-2 px-3 w-8 text-center">#</th>
                            <th className="py-2 px-3">COST TYPE</th>
                            <th className="py-2 px-3 text-center w-28">CALC BASIS</th>
                            <th className="py-2 px-3 text-right w-24">AMOUNT (₹)</th>
                            <th className="py-2 px-3 text-center w-36">APPLIED AS</th>
                            <th className="py-2 px-3 text-center w-16">ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {activeAdditionalCosts.map((cost, cIdx) => (
                            <tr key={cost.id} className="hover:bg-gray-50/60">
                              <td className="py-2 px-3 text-center text-gray-400 font-bold text-xs select-none">
                                {cIdx + 1}
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={cost.costType}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setActiveAdditionalCosts(prev => prev.map(c => c.id === cost.id ? { ...c, costType: val } : c));
                                  }}
                                  placeholder="e.g. Index Printing, Rulling, Labour"
                                  className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <select
                                  value={cost.calcBasis}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setActiveAdditionalCosts(prev => prev.map(c => c.id === cost.id ? { ...c, calcBasis: val } : c));
                                  }}
                                  className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 cursor-pointer"
                                >
                                  <option value="Per Piece">Per Piece</option>
                                  <option value="Per Batch">Per Batch</option>
                                  <option value="Per GBL">Per GBL</option>
                                  <option value="Fixed">Fixed</option>
                                </select>
                              </td>
                              <td className="py-2 px-3 text-right">
                                <input
                                  type="number"
                                  step="any"
                                  value={cost.amount}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setActiveAdditionalCosts(prev => prev.map(c => c.id === cost.id ? { ...c, amount: val } : c));
                                  }}
                                  placeholder="0.00"
                                  className="w-20 px-1.5 py-1 text-right bg-white border border-gray-200 rounded-lg font-mono text-gray-800 text-xs font-bold focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <select
                                  value={cost.appliedAs}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setActiveAdditionalCosts(prev => prev.map(c => c.id === cost.id ? { ...c, appliedAs: val } : c));
                                  }}
                                  className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 cursor-pointer"
                                >
                                  <option value="Per Unit (PCS)">Per Unit (PCS)</option>
                                  <option value="Per Unit (GBL)">Per Unit (GBL)</option>
                                  <option value="Per Batch">Per Batch</option>
                                  <option value="Total Cost">Total Cost</option>
                                </select>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setActiveAdditionalCosts(prev => prev.filter(c => c.id !== cost.id))}
                                  className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete overhead"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {activeAdditionalCosts.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-4 text-center text-xs text-gray-400 italic bg-gray-50/30">
                                No additional costs added. Click <strong className="text-amber-700 font-semibold cursor-pointer" onClick={() => {
                                  setActiveAdditionalCosts(prev => [
                                    ...prev,
                                    {
                                      id: `cost-${Date.now()}`,
                                      costType: '',
                                      calcBasis: 'Per Piece',
                                      amount: '',
                                      appliedAs: 'Per Unit (PCS)'
                                    }
                                  ]);
                                }}>"+ Add Cost"</strong> above to record direct labour, machine charges, or printing.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* SECTION 3: PROFIT & PRICING (OPTIONAL) */}
                  <div className="border border-emerald-200/90 rounded-2xl p-3.5 bg-emerald-50/20 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                        <Tag className="w-4 h-4 text-emerald-700" />
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                          PROFIT & PRICING (Optional)
                        </h5>
                        <p className="text-[10.5px] text-gray-500 font-medium">
                          Calculate suggested selling price based on manufacturing cost.
                        </p>
                      </div>
                    </div>

                    <div className="bg-white border border-emerald-200/80 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                          Pricing Method
                        </label>
                        <select
                          value={activeProfitPricing.pricingMethod}
                          onChange={e => setActiveProfitPricing(prev => ({ ...prev, pricingMethod: e.target.value }))}
                          className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="Markup %">Markup %</option>
                          <option value="Margin %">Margin %</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                          {activeProfitPricing.pricingMethod === 'Margin %' ? 'Margin Percentage' : 'Markup Percentage'}
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={activeProfitPricing.markupPercentage}
                            onChange={e => setActiveProfitPricing(prev => ({ ...prev, markupPercentage: e.target.value }))}
                            placeholder="0"
                            className="w-full pl-3 pr-7 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold font-mono text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <span className="absolute right-2.5 top-1.5 text-xs font-bold text-gray-400 select-none">%</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block mb-1">
                          Suggested Price / PCS
                        </label>
                        <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg font-mono font-black text-sm text-center">
                          ₹{formatInr(costingSummary.suggestedPricePcs)}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block mb-1">
                          Suggested Price / GBL
                        </label>
                        <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg font-mono font-black text-sm text-center">
                          ₹{formatInr(costingSummary.suggestedPriceGbl)}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Footer summary bar */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 shrink-0">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Total Ingredients</div>
                      <div className="text-xs font-bold text-gray-900">{activeRecipeItems.length} items</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Overheads</div>
                      <div className="text-xs font-bold text-gray-900">{activeAdditionalCosts.length} items</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Can make</div>
                      <div className="text-xs font-bold text-gray-900">
                        {(() => {
                          const validRuns = activeRecipeItems
                            .map(b => (b.qty && Number(b.qty) > 0) ? Math.floor((Number(b.inStock) || 0) / Number(b.qty)) : null)
                            .filter((v): v is number => v !== null);
                          if (validRuns.length === 0) return '—';
                          return `${Math.min(...validRuns).toLocaleString()} batches`;
                        })()}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveBuildBomRecipe}
                    disabled={isSavingBuildBom}
                    className="px-4 py-2 bg-[#064E3B] hover:bg-[#0B6B63] text-white font-bold rounded-lg text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingBuildBom ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Save recipe</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-400">
                <ClipboardList className="w-10 h-10 text-gray-300 mb-2" />
                <p className="font-semibold text-gray-600">Select a product from the left list</p>
                <p className="text-xs">Choose any product to view or edit its BOM recipe ingredients & costing</p>
              </div>
            )}
          </div>

          {/* Column 3: Materials Catalog & Cost Summary Panel (3 cols) */}
          <div className="col-span-3 border border-gray-200 rounded-2xl p-3 flex flex-col gap-3 bg-gray-50/40 overflow-hidden">
            <div className="relative shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Filter catalog..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar min-h-0">
              {/* Section 1: Raw Materials */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                  MATERIALS ({filteredRawCatalog.length})
                </div>
                {filteredRawCatalog.map((mat) => {
                  const isAdded = activeRecipeItems.some(b => b.name === mat.name);
                  return (
                    <div
                      key={mat._id || mat.skuCode || mat.name}
                      onClick={() => {
                        if (!activeBomProduct) {
                          showToast('Please select a product on the left first', 'warning');
                          return;
                        }
                        if (!isAdded) {
                          setActiveRecipeItems(prev => [
                            ...prev,
                            {
                              id: `b-${Date.now()}`,
                              skuId: mat._id,
                              skuCode: mat.skuCode,
                              name: mat.name,
                              qty: 1,
                              uom: mat.unit || 'Kg',
                              inStock: Number((mat as any).presentStock || 0),
                              notes: ''
                            }
                          ]);
                        }
                      }}
                      className={`p-2 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-all border ${
                        isAdded
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                          : 'bg-white border-gray-200 hover:border-blue-300 text-gray-800 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={isAdded ? 'text-emerald-600 font-bold' : 'text-blue-600 font-bold'}>
                          {isAdded ? '✓' : '+'}
                        </span>
                        <span className="truncate text-[11px]">{mat.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                        {Number((mat as any).presentStock || 0)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Section 2: Semi-Finished Goods */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                  SUB-ASSEMBLIES ({filteredSemiCatalog.length})
                </div>
                {filteredSemiCatalog.map((semi) => {
                  const isAdded = activeRecipeItems.some(b => b.name === semi.name);
                  return (
                    <div
                      key={semi._id || semi.skuCode || semi.name}
                      onClick={() => {
                        if (!activeBomProduct) {
                          showToast('Please select a product on the left first', 'warning');
                          return;
                        }
                        if (!isAdded) {
                          setActiveRecipeItems(prev => [
                            ...prev,
                            {
                              id: `b-${Date.now()}`,
                              skuId: semi._id,
                              skuCode: semi.skuCode,
                              name: semi.name,
                              qty: 1,
                              uom: semi.unit || 'Pcs',
                              inStock: Number((semi as any).presentStock || 0),
                              notes: ''
                            }
                          ]);
                        }
                      }}
                      className={`p-2 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-all border ${
                        isAdded
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                          : 'bg-white border-gray-200 hover:border-blue-300 text-gray-800 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={isAdded ? 'text-emerald-600 font-bold' : 'text-blue-600 font-bold'}>
                          {isAdded ? '✓' : '+'}
                        </span>
                        <span className="truncate text-[11px]">{semi.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                        {Number((semi as any).presentStock || 0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom: Cost Summary (Per Batch) Card matching user mock */}
            {activeBomProduct && (
              <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-2xs space-y-2.5 shrink-0">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-900 pb-1 border-b border-gray-100">
                  <Receipt className="w-4 h-4 text-blue-600" />
                  <span>COST SUMMARY (Per Batch)</span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-600 font-medium">
                    <span>Material Cost (A)</span>
                    <span className="font-mono font-bold text-gray-900">
                      ₹{formatInr(costingSummary.materialCost)}
                    </span>
                  </div>

                  <div className="flex justify-between text-gray-600 font-medium">
                    <span>Additional Costs (B)</span>
                    <span className="font-mono font-bold text-gray-900">
                      ₹{formatInr(costingSummary.additionalCostsTotal)}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                    <span className="font-bold text-gray-900 text-xs">Total Production Cost (A + B)</span>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-mono font-black text-xs">
                      ₹{formatInr(costingSummary.totalProductionCost)}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-gray-100 space-y-1">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      COST PER UNIT
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-600 font-medium">Cost / PCS</span>
                      <span className="font-mono font-bold text-blue-900">
                        ₹{formatInr(costingSummary.costPerPcs)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-600 font-medium">Cost / GBL ({costingSummary.conversionFactor} PCS)</span>
                      <span className="font-mono font-bold text-gray-900">
                        ₹{formatInr(costingSummary.costPerGbl)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Manufacturing Pill */}
            <div className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center gap-2 text-xs shrink-0">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              <div className="text-[11px] leading-tight">
                <span className="font-semibold text-gray-800 block">Manufacturing Execution Engine</span>
                <span className="text-gray-500 text-[10px]">Ready to dispatch to factory floor</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

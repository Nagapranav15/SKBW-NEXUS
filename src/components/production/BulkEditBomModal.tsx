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
  auom?: string;
  altUnit?: string;
  inStock: number;
  notes?: string;
}

export interface BulkEditBomModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  initialSelectedSkuId?: string;
  initialTab?: 'products' | 'semi';
  onSaved?: (updatedSku: SkuV2) => void;
}

export const BulkEditBomModal: React.FC<BulkEditBomModalProps> = ({
  isOpen,
  onClose,
  companyId,
  initialSelectedSkuId,
  initialTab,
  onSaved
}) => {
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDomainTab, setActiveDomainTab] = useState<'products' | 'semi'>(initialTab || 'products');
  const [activeBomProduct, setActiveBomProduct] = useState<SkuV2 | null>(null);
  const [activeRecipeItems, setActiveRecipeItems] = useState<BomRecipeItem[]>([]);
  const [activeAdditionalCosts, setActiveAdditionalCosts] = useState<AdditionalCostRow[]>([]);
  const [activeProfitPricing, setActiveProfitPricing] = useState<ProfitPricingState>({
    pricingMethod: 'Margin %',
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
            const classif = getItemClassification(match);
            if (classif === 'semi') {
              setActiveDomainTab('semi');
            } else if (classif === 'products') {
              setActiveDomainTab('products');
            }
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

  // Currently active domain list (Finished Goods vs Semi-Finished)
  const activeList = useMemo(() => {
    return activeDomainTab === 'semi' ? semiList : productsList;
  }, [activeDomainTab, semiList, productsList]);

  // Filter & Sort Items in active list
  const buildBomsAvailableTitles = useMemo(() => {
    const set = new Set<string>();
    activeList.forEach(p => {
      const val = (p.title || p.brand || p.category || '').trim();
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [activeList]);

  const buildBomsAvailableRulings = useMemo(() => {
    const set = new Set<string>();
    activeList.forEach(p => {
      const val = (p.ruleType || '').trim();
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [activeList]);

  const filteredBuildProducts = useMemo(() => {
    let filtered = activeList;

    if (buildBomsSearch.trim()) {
      const q = buildBomsSearch.toLowerCase().trim();
      filtered = filtered.filter(p => 
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.skuCode && p.skuCode.toLowerCase().includes(q)) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }

    if (onlyNoRecipeFilter) {
      filtered = filtered.filter(p => !(p as any).bomItems || (p as any).bomItems.length === 0);
    }

    if (buildBomsTitleFilter) {
      filtered = filtered.filter(p => (p.title || p.brand || p.category || '').trim() === buildBomsTitleFilter.trim());
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
  }, [activeList, buildBomsSearch, onlyNoRecipeFilter, buildBomsTitleFilter, buildBomsRulingFilter, buildBomsSortBy]);

  // Auto-switch selection when tab changes if current item not in active list
  useEffect(() => {
    if (filteredBuildProducts.length > 0) {
      if (!activeBomProduct || !filteredBuildProducts.some(p => p._id === activeBomProduct._id)) {
        handleSelectBomProduct(filteredBuildProducts[0]);
      }
    } else {
      setActiveBomProduct(null);
      setActiveRecipeItems([]);
    }
  }, [activeDomainTab]);

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
          auom: item.auom || (item as any).altUnit || matchedSku?.altUnit || '',
          altUnit: item.auom || (item as any).altUnit || matchedSku?.altUnit || '',
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
        pricingMethod: 'Margin %',
        markupPercentage: (prod as any).profitPricing.markupPercentage ?? '',
        suggestedPricePcs: (prod as any).profitPricing.suggestedPricePcs,
        suggestedPriceGbl: (prod as any).profitPricing.suggestedPriceGbl
      });
    } else {
      setActiveProfitPricing({
        pricingMethod: 'Margin %',
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
      const allToExport = [...productsList, ...semiList];
      allToExport.forEach(prod => {
        const itemType = getItemClassification(prod) === 'semi' ? 'Semi-Finished' : 'Finished Goods';
        const items = (prod as any).bomItems || [];
        if (items.length === 0) {
          rows.push({
            'Item Type': itemType,
            'Product Code': prod.skuCode,
            'Product Name': prod.name,
            'Brand': prod.brand || prod.title || '',
            'Yield Qty': (prod as any).recipeYieldQty || 1,
            'Yield Unit': (prod as any).recipeYieldUnit || prod.unit || 'Pcs',
            'Ingredient Code': '',
            'Ingredient Name': '',
            'Qty': '',
            'UOM': '',
            'AUOM': ''
          });
        } else {
          items.forEach((item: any) => {
            rows.push({
              'Item Type': itemType,
              'Product Code': prod.skuCode,
              'Product Name': prod.name,
              'Brand': prod.brand || prod.title || '',
              'Yield Qty': (prod as any).recipeYieldQty || 1,
              'Yield Unit': (prod as any).recipeYieldUnit || prod.unit || 'Pcs',
              'Ingredient Code': item.skuCode || '',
              'Ingredient Name': item.name || '',
              'Qty': item.qty || '',
              'UOM': item.uom || '',
              'AUOM': item.auom || item.altUnit || ''
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

  const activeWithRecipeCount = useMemo(() => {
    return activeList.filter(p => (p as any).bomItems && (p as any).bomItems.length > 0).length;
  }, [activeList]);

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
                Define recipes item by item for Finished Goods & Semi-Finished materials.
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
              {activeWithRecipeCount} of {activeList.length} {activeDomainTab === 'semi' ? 'semi-finished' : 'finished'} items have a recipe
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
            {/* Domain Switcher: Finished Goods vs Semi-Finished Materials */}
            <div className="flex items-center p-1 bg-gray-200/70 rounded-xl gap-1 shrink-0 select-none">
              <button
                type="button"
                onClick={() => {
                  setActiveDomainTab('products');
                  setBuildBomsTitleFilter('');
                  setBuildBomsRulingFilter('');
                }}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeDomainTab === 'products'
                    ? 'bg-white text-gray-900 shadow-2xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Boxes className="w-3.5 h-3.5 text-blue-600" />
                <span>Finished Goods</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  activeDomainTab === 'products' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {productsList.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveDomainTab('semi');
                  setBuildBomsTitleFilter('');
                  setBuildBomsRulingFilter('');
                }}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeDomainTab === 'semi'
                    ? 'bg-white text-gray-900 shadow-2xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-amber-600" />
                <span>Semi Finished</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  activeDomainTab === 'semi' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {semiList.length}
                </span>
              </button>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  value={buildBomsSearch}
                  onChange={(e) => setBuildBomsSearch(e.target.value)}
                  placeholder={activeDomainTab === 'semi' ? "Search semi-finished materials..." : "Search products..."}
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
                        setActiveRecipeItems(copiedBom.lines.map((l, i) => {
                          const matched = skus.find(s => (l.skuId && String(s._id) === String(l.skuId)) || (l.skuCode && s.skuCode === l.skuCode) || (l.name && s.name === l.name));
                          return {
                            id: `b-build-paste-${Date.now()}-${i}`,
                            skuId: l.skuId || matched?._id,
                            skuCode: l.skuCode || matched?.skuCode,
                            name: l.name,
                            qty: Number(l.qty) || 1,
                            uom: l.uom || matched?.unit || 'Kg',
                            auom: l.auom || (l as any).altUnit || matched?.altUnit || '',
                            altUnit: l.auom || (l as any).altUnit || matched?.altUnit || '',
                            inStock: l.inStock ?? (matched as any)?.openingStock ?? 500,
                            notes: l.notes || ''
                          };
                        }));
                        if (copiedBom.basis) setBuildBatchYieldQty(String(copiedBom.basis));
                        if (copiedBom.basisUnit) setBuildBatchYieldUnit(copiedBom.basisUnit);
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
                            const lines = ((prod as any).bomItems || []).map((b: any) => {
                              const matched = skus.find(s => (b.skuId && String(s._id) === String(b.skuId)) || (b.skuCode && s.skuCode === b.skuCode) || (b.name && s.name === b.name));
                              return {
                                skuId: b.skuId || matched?._id,
                                skuCode: b.skuCode || matched?.skuCode,
                                name: b.name,
                                qty: b.qty,
                                uom: b.uom || matched?.unit || 'Kg',
                                auom: b.auom || b.altUnit || matched?.altUnit || '',
                                altUnit: b.auom || b.altUnit || matched?.altUnit || '',
                                inStock: b.inStock,
                                notes: b.notes
                              };
                            });
                            copyBom({
                              sourceSkuId: prod._id,
                              sourceSkuCode: prod.skuCode,
                              sourceName: prod.name || prod.skuCode,
                              basis: (prod as any).recipeYieldQty || (prod as any).batchYieldQty || 1,
                              basisUnit: (prod as any).recipeYieldUnit || (prod as any).batchYieldUnit || prod.unit || 'Pcs',
                              lines,
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
          <div className="col-span-6 border border-slate-200/90 rounded-2xl p-3 flex flex-col gap-2.5 bg-white overflow-hidden shadow-2xs">
            {activeBomProduct ? (
              <>
                {/* Active Product Header Bar */}
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-gray-900 text-sm truncate" title={activeBomProduct.name}>{activeBomProduct.name}</h4>
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono font-bold tracking-tight shrink-0">{activeBomProduct.skuCode}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
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
                          lines: activeRecipeItems.map(item => {
                            const matched = skus.find(s => (item.skuId && String(s._id) === String(item.skuId)) || (item.skuCode && s.skuCode === item.skuCode) || (item.name && s.name === item.name));
                            return {
                              id: item.id,
                              skuId: item.skuId || matched?._id,
                              skuCode: item.skuCode || matched?.skuCode,
                              name: item.name,
                              qty: item.qty,
                              uom: item.uom || matched?.unit || 'Kg',
                              auom: item.auom || (item as any).altUnit || matched?.altUnit || '',
                              altUnit: item.auom || (item as any).altUnit || matched?.altUnit || '',
                              inStock: item.inStock,
                              notes: item.notes
                            };
                          }),
                          additionalCosts: activeAdditionalCosts,
                          profitPricing: activeProfitPricing
                        };
                      }}
                      onPaste={(copied, mode) => {
                        if (mode === 'replace') {
                          setActiveRecipeItems(copied.lines.map((l, i) => {
                            const matched = skus.find(s => (l.skuId && String(s._id) === String(l.skuId)) || (l.skuCode && s.skuCode === l.skuCode) || (l.name && s.name === l.name));
                            return {
                              id: `b-build-paste-${Date.now()}-${i}`,
                              skuId: l.skuId || matched?._id,
                              skuCode: l.skuCode || matched?.skuCode,
                              name: l.name,
                              qty: Number(l.qty) || 1,
                              uom: l.uom || matched?.unit || 'Kg',
                              auom: l.auom || (l as any).altUnit || matched?.altUnit || '',
                              altUnit: l.auom || (l as any).altUnit || matched?.altUnit || '',
                              inStock: l.inStock ?? (matched as any)?.openingStock ?? 500,
                              notes: l.notes || ''
                            };
                          }));
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
                              pricingMethod: 'Margin %',
                              markupPercentage: copied.profitPricing.markupPercentage ?? ''
                            });
                          }
                        } else {
                          const existingNames = new Set(activeRecipeItems.map(i => (i.name || '').toLowerCase().trim()));
                          const toAdd = copied.lines
                            .filter(l => !existingNames.has((l.name || '').toLowerCase().trim()))
                            .map((l, i) => {
                              const matched = skus.find(s => (l.skuId && String(s._id) === String(l.skuId)) || (l.skuCode && s.skuCode === l.skuCode) || (l.name && s.name === l.name));
                              return {
                                id: `b-build-merge-${Date.now()}-${i}`,
                                skuId: l.skuId || matched?._id,
                                skuCode: l.skuCode || matched?.skuCode,
                                name: l.name,
                                qty: Number(l.qty) || 1,
                                uom: l.uom || matched?.unit || 'Kg',
                                auom: l.auom || (l as any).altUnit || matched?.altUnit || '',
                                altUnit: l.auom || (l as any).altUnit || matched?.altUnit || '',
                                inStock: l.inStock ?? (matched as any)?.openingStock ?? 500,
                                notes: l.notes || ''
                              };
                            });
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
                              pricingMethod: 'Margin %',
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
                      className="px-3 py-1 bg-[#064E3B] hover:bg-[#0B6B63] text-white font-semibold rounded-lg text-xs shadow-3xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isSavingBuildBom ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
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
                    <div className="flex items-center justify-between px-3 py-1.5 bg-blue-50/40 border border-blue-100/70 rounded-xl text-xs shrink-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 bg-blue-100/70 text-blue-800 rounded-md font-bold text-[10.5px]">
                          {activeRecipeItems.length} {activeRecipeItems.length === 1 ? 'ITEM' : 'ITEMS'}
                        </span>
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                          <span>BATCH SIZE:</span>
                          <input
                            type="number"
                            min="1"
                            placeholder="1"
                            value={buildBatchYieldQty}
                            onChange={(e) => setBuildBatchYieldQty(e.target.value)}
                            className="w-14 h-6 px-1 border border-blue-200 rounded-md text-xs font-bold text-blue-800 text-center bg-white shadow-3xs focus:ring-1 focus:ring-blue-400 focus:outline-none"
                          />
                          {options.length > 1 ? (
                            <select
                              value={currentUnit}
                              onChange={(e) => setBuildBatchYieldUnit(e.target.value)}
                              className="h-6 px-1.5 border border-blue-200 rounded-md text-[11px] font-bold text-blue-900 bg-white cursor-pointer shadow-3xs focus:ring-1 focus:ring-blue-400 focus:outline-none"
                              title="Yield Unit (UOM / AUOM)"
                            >
                              {options.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <strong className="text-blue-900 bg-white border border-blue-200 px-1.5 py-0.5 rounded-md text-[11px] font-bold font-mono shadow-3xs">
                              {uom}
                            </strong>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">Quantities per batch produced</span>
                    </div>
                  );
                })()}

                {/* Middle Scrollable Section: Materials + Additional Costs + Profit & Pricing */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5 custom-scrollbar">

                  {/* SECTION 1: MATERIALS */}
                  <div className="border border-slate-200/80 rounded-xl p-2.5 bg-white shadow-3xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                          <Boxes className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h5 className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                              MATERIALS
                            </h5>
                            <span className="px-1.5 py-0.2 bg-blue-50 text-blue-700 font-mono font-bold text-[10px] rounded-full">
                              {activeRecipeItems.length}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-medium">
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
                              uom: 'KG',
                              auom: '',
                              altUnit: '',
                              inStock: 0,
                              notes: ''
                            }
                          ]);
                        }}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 font-bold rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition-all shadow-3xs"
                      >
                        <Plus className="w-3.5 h-3.5 text-blue-600" />
                        <span>Add Material</span>
                      </button>
                    </div>

                    <div className="overflow-x-auto border border-slate-100 rounded-lg custom-scrollbar">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50/80 text-[9.5px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 select-none">
                          <tr>
                            <th className="py-1.5 px-2 w-7 text-center">#</th>
                            <th className="py-1.5 px-2 min-w-[170px]">MATERIAL</th>
                            <th className="py-1.5 px-1.5 text-center w-16">QTY</th>
                            <th className="py-1.5 px-1.5 text-center min-w-[120px]">UOM / AUOM</th>
                            <th className="py-1.5 px-1.5 text-center w-16">IN STOCK</th>
                            <th className="py-1.5 px-1.5 text-center w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {activeRecipeItems.map((b, idx) => (
                            <tr key={b.id} className="hover:bg-blue-50/20 transition-colors">
                              <td className="py-1.5 px-2 text-center text-slate-400 font-bold text-[10px] select-none">
                                {idx + 1}
                              </td>
                              <td className="py-1.5 px-2 min-w-[170px]">
                                <SearchableMaterialDropdown
                                  value={b.name}
                                  materials={skus}
                                  compact={true}
                                  className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-blue-400 rounded-lg text-xs font-semibold text-slate-800 flex items-center justify-between shadow-3xs transition-all cursor-pointer h-7"
                                  placeholder="Select raw material..."
                                  onChange={(selectedName, matchedSku) => {
                                    setActiveRecipeItems(prev => prev.map(item => {
                                      if (item.id !== b.id) return item;
                                      return {
                                        ...item,
                                        name: selectedName,
                                        skuId: matchedSku?._id || item.skuId,
                                        skuCode: matchedSku?.skuCode || item.skuCode,
                                        uom: matchedSku?.unit || item.uom || 'KG',
                                        auom: matchedSku?.altUnit || item.auom || '',
                                        altUnit: matchedSku?.altUnit || item.auom || '',
                                        inStock: (matchedSku as any)?.openingStock ?? (matchedSku as any)?.currentStock ?? item.inStock ?? 0
                                      };
                                    }));
                                  }}
                                />
                                {b.skuCode && (
                                  <div className="mt-0.5 pl-1">
                                    <span className="text-[9.5px] text-slate-400 font-mono">{b.skuCode}</span>
                                  </div>
                                )}
                              </td>
                              <td className="py-1.5 px-1.5 text-center">
                                <input
                                  type="number"
                                  step="any"
                                  value={b.qty}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setActiveRecipeItems(prev => prev.map(item => item.id === b.id ? { ...item, qty: val } : item));
                                  }}
                                  className="w-14 h-7 border border-slate-200 focus:border-blue-400 rounded-md px-1.5 py-0.5 text-xs font-bold font-mono text-center bg-white shadow-3xs focus:outline-none mx-auto block"
                                  placeholder="Qty"
                                />
                              </td>
                              <td className="py-1.5 px-1.5 text-center">
                                {(() => {
                                  const matchedSku = skus.find(s => 
                                    (b.skuId && String(s._id) === String(b.skuId)) ||
                                    (b.skuCode && s.skuCode === b.skuCode) ||
                                    (b.name && s.name === b.name)
                                  );
                                  const primaryUom = matchedSku?.unit || b.uom || 'KG';
                                  const altUom = matchedSku?.altUnit || b.auom || (b as any).altUnit || '';
                                  const hasAlt = !!(altUom && altUom.trim() && altUom.trim().toLowerCase() !== primaryUom.trim().toLowerCase());

                                  const options: { value: string; label: string }[] = [];
                                  options.push({ value: primaryUom, label: `${primaryUom} (UOM)` });
                                  if (hasAlt) {
                                    options.push({ value: altUom.trim(), label: `${altUom.trim()} (AUOM)` });
                                  }
                                  if (b.uom && !options.some(o => o.value.toLowerCase() === b.uom.toLowerCase())) {
                                    options.push({ value: b.uom, label: b.uom });
                                  }

                                  const selectedValue = options.some(o => o.value.toLowerCase() === (b.uom || '').toLowerCase())
                                    ? options.find(o => o.value.toLowerCase() === (b.uom || '').toLowerCase())!.value
                                    : primaryUom;

                                  return (
                                    <select
                                      value={selectedValue}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const isAlt = hasAlt && val.toLowerCase() === altUom.trim().toLowerCase();
                                        setActiveRecipeItems(prev => prev.map(item => item.id === b.id ? { 
                                          ...item, 
                                          uom: val,
                                          auom: isAlt ? val : (altUom || ''),
                                          altUnit: isAlt ? val : (altUom || '')
                                        } : item));
                                      }}
                                      className="h-7 px-2 border border-slate-200 focus:border-blue-400 rounded-md text-[10.5px] font-bold text-slate-800 bg-white shadow-3xs focus:outline-none cursor-pointer mx-auto block max-w-[125px] truncate"
                                      title="Unit of Measurement (UOM / AUOM)"
                                    >
                                      {options.map(opt => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  );
                                })()}
                              </td>
                              <td className="py-1.5 px-1.5 text-center">
                                <span className="font-mono text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
                                  {b.inStock ?? 0}
                                </span>
                              </td>
                              <td className="py-1.5 px-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => setActiveRecipeItems(prev => prev.filter(item => item.id !== b.id))}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                                  title="Remove material"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {activeRecipeItems.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-3.5 text-center text-[11px] text-slate-400 italic bg-slate-50/20">
                                No materials added yet. Click "+ Add Material" above or choose from the catalog on the right.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* SECTION 2: ADDITIONAL COSTS / OVERHEADS */}
                  <div className="border border-slate-200/80 rounded-xl p-2.5 bg-white shadow-3xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                          <Settings className="w-3.5 h-3.5 text-amber-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h5 className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                              ADDITIONAL COSTS / OVERHEADS
                            </h5>
                            <span className="px-1.5 py-0.2 bg-amber-50 text-amber-700 font-mono font-bold text-[10px] rounded-full">
                              {activeAdditionalCosts.length}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-medium">
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
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 font-bold rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition-all shadow-3xs"
                      >
                        <Plus className="w-3.5 h-3.5 text-amber-600" />
                        <span>Add Cost</span>
                      </button>
                    </div>

                    <div className="overflow-x-auto border border-slate-100 rounded-lg custom-scrollbar">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50/80 text-[9.5px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 select-none">
                          <tr>
                            <th className="py-1.5 px-2 w-7 text-center">#</th>
                            <th className="py-1.5 px-2">COST TYPE</th>
                            <th className="py-1.5 px-1.5 text-center w-24">CALC BASIS</th>
                            <th className="py-1.5 px-1.5 text-right w-20">AMOUNT (₹)</th>
                            <th className="py-1.5 px-1.5 text-center w-28">APPLIED AS</th>
                            <th className="py-1.5 px-1.5 text-center w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {activeAdditionalCosts.map((cost, cIdx) => (
                            <tr key={cost.id} className="hover:bg-amber-50/20 transition-colors">
                              <td className="py-1.5 px-2 text-center text-slate-400 font-bold text-[10px] select-none">
                                {cIdx + 1}
                              </td>
                              <td className="py-1.5 px-2">
                                <input
                                  type="text"
                                  value={cost.costType}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setActiveAdditionalCosts(prev => prev.map(c => c.id === cost.id ? { ...c, costType: val } : c));
                                  }}
                                  placeholder="e.g. Index Printing, Labour"
                                  className="w-full h-7 px-2 py-0.5 bg-white border border-slate-200 rounded-md text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                />
                              </td>
                              <td className="py-1.5 px-1.5 text-center">
                                <select
                                  value={cost.calcBasis}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setActiveAdditionalCosts(prev => prev.map(c => c.id === cost.id ? { ...c, calcBasis: val } : c));
                                  }}
                                  className="h-7 px-1.5 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] font-semibold text-slate-800 cursor-pointer focus:outline-none"
                                >
                                  <option value="Per Piece">Per Piece</option>
                                  <option value="Per Batch">Per Batch</option>
                                  <option value="Per GBL">Per GBL</option>
                                  <option value="Fixed">Fixed</option>
                                </select>
                              </td>
                              <td className="py-1.5 px-1.5 text-right">
                                <input
                                  type="number"
                                  step="any"
                                  value={cost.amount}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setActiveAdditionalCosts(prev => prev.map(c => c.id === cost.id ? { ...c, amount: val === '' ? '' : Number(val) } : c));
                                  }}
                                  placeholder="0.00"
                                  className="w-20 h-7 px-1.5 py-0.5 bg-white border border-slate-200 rounded-md text-xs font-bold font-mono text-slate-800 text-right focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                />
                              </td>
                              <td className="py-1.5 px-1.5 text-center">
                                <select
                                  value={cost.appliedAs}
                                  onChange={e => {
                                    const val = e.target.value as any;
                                    setActiveAdditionalCosts(prev => prev.map(c => c.id === cost.id ? { ...c, appliedAs: val } : c));
                                  }}
                                  className="h-7 px-1.5 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] font-semibold text-slate-800 cursor-pointer focus:outline-none"
                                >
                                  <option value="Per Unit (PCS)">Per Unit (PCS)</option>
                                  <option value="Per Unit (GBL)">Per Unit (GBL)</option>
                                  <option value="Per Batch">Per Batch</option>
                                  <option value="Total Cost">Total Cost</option>
                                </select>
                              </td>
                              <td className="py-1.5 px-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => setActiveAdditionalCosts(prev => prev.filter(c => c.id !== cost.id))}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                                  title="Delete overhead"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {activeAdditionalCosts.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-3.5 text-center text-[11px] text-slate-400 italic bg-slate-50/20">
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
                  <div className="border border-emerald-200/80 rounded-xl p-2.5 bg-emerald-50/20 shadow-3xs space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                        <Tag className="w-3.5 h-3.5 text-emerald-700" />
                      </div>
                      <div>
                        <h5 className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                          PROFIT & PRICING (Optional)
                        </h5>
                        <p className="text-[10px] text-slate-500 font-medium">
                          Calculate suggested selling price based on manufacturing cost.
                        </p>
                      </div>
                    </div>

                    <div className="bg-white border border-emerald-200/70 rounded-lg p-2.5 grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-center">
                      <div>
                        <label className="text-[9.5px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                          Pricing Method
                        </label>
                        <div className="w-full h-7 px-2 py-0.5 bg-white border border-emerald-200 rounded-md text-xs font-bold text-emerald-800 flex items-center justify-between">
                          <span>Margin %</span>
                          <span className="text-[9px] px-1 py-0.2 bg-emerald-50 text-emerald-700 rounded font-semibold">Margin</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[9.5px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                          Margin Percentage
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={activeProfitPricing.markupPercentage}
                            onChange={e => setActiveProfitPricing(prev => ({ ...prev, pricingMethod: 'Margin %', markupPercentage: e.target.value }))}
                            placeholder="0"
                            className="w-full h-7 pl-2.5 pr-6 py-0.5 bg-white border border-gray-200 rounded-md text-xs font-bold font-mono text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <span className="absolute right-2 top-1.5 text-xs font-bold text-gray-400 select-none">%</span>
                        </div>
                      </div>

                      <div>
                        <div className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider">Suggested Price / PCS</div>
                        <div className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-md font-mono font-bold text-xs text-center">
                          ₹{formatInr(costingSummary.suggestedPricePcs)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider">Suggested Price / GBL</div>
                        <div className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-md font-mono font-bold text-xs text-center">
                          ₹{formatInr(costingSummary.suggestedPriceGbl)}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Footer summary bar */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                      <div className="text-[9.5px] text-slate-400 font-medium uppercase tracking-wider">Ingredients</div>
                      <div className="text-xs font-bold text-slate-800">{activeRecipeItems.length} items</div>
                    </div>
                    <div className="bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                      <div className="text-[9.5px] text-slate-400 font-medium uppercase tracking-wider">Overheads</div>
                      <div className="text-xs font-bold text-slate-800">{activeAdditionalCosts.length} items</div>
                    </div>
                    <div className="bg-emerald-50/60 px-2 py-1 rounded-lg border border-emerald-100">
                      <div className="text-[9.5px] text-emerald-600 font-medium uppercase tracking-wider">Can make</div>
                      <div className="text-xs font-bold text-emerald-800 font-mono">
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
                    className="px-3.5 py-1.5 bg-[#064E3B] hover:bg-[#0B6B63] text-white font-bold rounded-lg text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                              auom: mat.altUnit || '',
                              altUnit: mat.altUnit || '',
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
                              auom: semi.altUnit || '',
                              altUnit: semi.altUnit || '',
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

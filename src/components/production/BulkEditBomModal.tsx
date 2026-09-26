import React, { useState, useEffect, useMemo } from 'react';
import { 
  ClipboardList, Search, Download, X, Copy, Save, RefreshCw, Layers, Boxes, Package, Trash2
} from 'lucide-react';
import { SkuV2, getSkusV2, updateSkuV2 } from '../../api/mfgApiV2';
import Modal from '../ui/Modal';
import { SearchableMaterialDropdown } from '../inventory_v2/AddSkuDrawerV2';
import { BomCopyPasteControls, MakoroPasteIcon } from '../inventory_v2/BomCopyPasteControls';
import { copyBom, useCopiedBom } from '../../utils/bomClipboard';
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
  };

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

      showToast(`BOM Recipe saved for ${activeBomProduct.name}!`, 'success');
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
      size="max-w-[1300px]"
      maxWidth="max-w-[1300px]"
      hideCloseButton={true}
    >
      <div className="p-5 space-y-4 max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-emerald-100/70 text-emerald-800 rounded-2xl shrink-0">
              <ClipboardList className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 truncate">
                <span>Build BOMs / Bulk Edit BOM</span>
              </h3>
              <p className="text-xs text-gray-400 font-medium truncate">
                Define and update recipes product by product in Item Master.
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
                              lines: (prod as any).bomItems || []
                            });
                            showToast(`BOM copied from "${prod.name || prod.skuCode}"! Ready to paste.`, 'success');
                          }}
                          className="h-6 w-6 rounded border border-gray-200 bg-white text-[#0B6B63] hover:border-[#0B6B63] flex items-center justify-center shadow-2xs transition-all cursor-pointer"
                          title="Copy this BOM"
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

          {/* Column 2: Active Product Recipe Builder (6 cols) */}
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
                        if (!activeRecipeItems || activeRecipeItems.length === 0) return null;
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
                          }))
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

                {/* Sub-header details bar */}
                <div className="flex items-center gap-3 text-xs font-semibold text-gray-500 bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex-wrap">
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
                    <strong className="text-gray-800 bg-white border border-gray-200 px-2.5 py-1 rounded-lg text-xs font-bold font-mono shadow-2xs">
                      {buildBatchYieldUnit || activeBomProduct.unit || 'Pcs'}
                    </strong>
                  </div>
                  <span>·</span>
                  <span className="text-[11px] font-normal text-gray-400">Quantities configured per batch produced</span>
                </div>

                {/* Searchable input to quickly add material */}
                <div className="relative z-30">
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

                {/* Recipe Items List */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 border border-gray-100 rounded-xl p-2 bg-gray-50/20 custom-scrollbar">
                  {activeRecipeItems.length > 0 && (
                    <div className="flex items-center gap-2 px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      <span className="flex-1">Material</span>
                      <span className="w-20 text-center">Qty</span>
                      <span className="w-16 text-center">UOM</span>
                      <span className="w-16 text-center">In Stock</span>
                      <span className="w-16 text-center">Runs</span>
                      <span className="w-6"></span>
                    </div>
                  )}

                  {activeRecipeItems.map((b) => {
                    const qtyNum = Number(b.qty);
                    const inStockNum = Number(b.inStock) || 0;
                    const runs = (qtyNum > 0) ? Math.floor(inStockNum / qtyNum) : null;

                    return (
                      <div
                        key={b.id}
                        className="p-2.5 bg-white border border-gray-200 rounded-xl shadow-2xs flex items-center gap-2.5 text-xs hover:border-gray-300 transition-colors"
                      >
                        <div className="flex-1 font-bold text-gray-900 text-xs min-w-0 pr-2 leading-relaxed" title={b.name}>
                          {b.name}
                        </div>

                        <div className="w-20">
                          <input
                            type="number"
                            step="any"
                            value={b.qty}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setActiveRecipeItems(prev => prev.map(item => item.id === b.id ? { ...item, qty: val } : item));
                            }}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold font-mono text-center focus:outline-none focus:border-[#064E3B] bg-white"
                            placeholder="Qty"
                          />
                        </div>

                        <div className="w-16">
                          <input
                            type="text"
                            value={b.uom || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setActiveRecipeItems(prev => prev.map(item => item.id === b.id ? { ...item, uom: val } : item));
                            }}
                            className="w-full border border-gray-200 rounded-lg px-1.5 py-1 text-xs font-semibold text-center uppercase focus:outline-none focus:border-[#064E3B] bg-white"
                            placeholder="UOM"
                          />
                        </div>

                        <div className="w-16 text-center text-[11px] font-mono text-gray-400">
                          {b.inStock ?? '—'}
                        </div>

                        <div className="w-16 text-center">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            runs === null ? 'text-gray-300' :
                            runs === 0 ? 'bg-rose-50 text-rose-600 border border-rose-200' :
                            runs < 5 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {runs !== null ? `${runs} runs` : '—'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveRecipeItems(prev => prev.filter(item => item.id !== b.id))}
                          className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  {activeRecipeItems.length === 0 && (
                    <div className="p-8 text-center text-xs text-gray-400">
                      No components in recipe. Add from catalog on right or use the search above.
                    </div>
                  )}
                </div>

                {/* Footer summary bar */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Total Ingredients</div>
                      <div className="text-xs font-bold text-gray-900">{activeRecipeItems.length} items</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Can make</div>
                      <div className="text-xs font-bold text-gray-900">
                        {(() => {
                          const validRuns = activeRecipeItems
                            .map(b => (b.qty && Number(b.qty) > 0) ? Math.floor((Number(b.inStock) || 0) / Number(b.qty)) : null)
                            .filter((v): v is number => v !== null);
                          if (validRuns.length === 0) return '—';
                          return `${Math.min(...validRuns).toLocaleString()} units`;
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
                <p className="text-xs">Choose any product to view or edit its BOM recipe ingredients</p>
              </div>
            )}
          </div>

          {/* Column 3: Materials Catalog Panel (3 cols) */}
          <div className="col-span-3 border border-gray-200 rounded-2xl p-3 flex flex-col gap-3 bg-gray-50/40 overflow-hidden">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Filter catalog..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
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
          </div>
        </div>
      </div>
    </Modal>
  );
};

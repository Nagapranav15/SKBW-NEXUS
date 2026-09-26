import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowLeft, ArrowRight, Check, AlertCircle, Plus, Trash2, 
  RotateCcw, ExternalLink, Calendar, CheckCircle2, ChevronRight,
  Pencil, DollarSign, Search, Loader2, Sparkles, ChevronDown, 
  Settings, X, Layers, Box
} from 'lucide-react';
import { ProductionOrder, ProductionBomItem, PriorityLevel, ItemType } from '../../types/production';
import { getNextProductionOrderNumber, createProductionOrder } from '../../api/productionApi';
import { getSkusV2, getWarehouseHierarchyV2, SkuV2, WarehouseLocationV2, getMetadataV2 } from '../../api/mfgApiV2';
import { showToast } from '../ui/Toast';
import { PresetField } from './PresetField';
import { BulkEditBomModal } from './BulkEditBomModal';

interface NewProductionOrderWizardProps {
  onCancel: () => void;
  onCreated: (order: ProductionOrder) => void;
  companyId?: string;
}

// Standard classification identical to SkuMasterV2 products / materials / semi
export const getItemClassification = (sku: SkuV2): 'products' | 'semi' | 'materials' => {
  const cat = (sku.category || '').toLowerCase().trim();
  const code = (sku.skuCode || '').toUpperCase().trim();
  const name = (sku.name || '').toLowerCase().trim();

  // Semi-finished / WIP
  if (
    cat.includes('semi') || 
    cat.includes('wip') || 
    cat === 'semi finished' || 
    cat.includes('sub') || 
    code.startsWith('SM-') || 
    code.startsWith('SM') || 
    code.startsWith('SEM') || 
    code.startsWith('SFG') || 
    code.startsWith('SF') || 
    name.includes('ruled cut') || 
    name.includes('inner signature') || 
    name.includes('book block')
  ) {
    return 'semi';
  }

  // Raw Materials
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

  // Finished Goods (Products)
  return 'products';
};

// Default department presets matching sales order preset styling
const DEFAULT_DEPARTMENT_PRESETS = [
  'Notebook Manufacturing',
  'Ruling Department',
  'Index Department',
  'Cover Department',
  'Binding Department',
  'Printing Department',
  'Packing Department',
  'Dispatch Department'
];

export const NewProductionOrderWizard: React.FC<NewProductionOrderWizardProps> = ({
  onCancel,
  onCreated,
  companyId
}) => {
  // Wizard step: 1 (Basic Info & BOM), 3 (Review & Confirm)
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Backend data
  const [backendSkus, setBackendSkus] = useState<SkuV2[]>([]);
  const [factories, setFactories] = useState<string[]>([]);

  // Bulk Edit BOM Modal state (opens exact Item Master recipe editor)
  const [showBulkEditBomModal, setShowBulkEditBomModal] = useState<boolean>(false);

  // Form Fields - ALL START EMPTY as requested
  const [orderNumber, setOrderNumber] = useState<string>('PR-0001');
  const [selectedSkuId, setSelectedSkuId] = useState<string>(''); // Empty by default
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [showProductDropdown, setShowProductDropdown] = useState<boolean>(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  const [productionQty, setProductionQty] = useState<number | ''>(''); // Empty by default
  const [productionUom, setProductionUom] = useState<string>('PCS');
  const [factory, setFactory] = useState<string>(''); // Empty by default
  const [department, setDepartment] = useState<string>(''); // Empty by default
  const [plannedStartDate, setPlannedStartDate] = useState<string>(''); // Empty by default
  const [requiredCompletionDate, setRequiredCompletionDate] = useState<string>(''); // Empty by default
  const [priority, setPriority] = useState<PriorityLevel>('Normal');
  const [remarks, setRemarks] = useState<string>(''); // Empty by default
  const [reference, setReference] = useState<string>(''); // Empty by default

  // BOM Configuration
  const [bomType, setBomType] = useState<'Default BOM' | 'Custom BOM (Production Order Only)'>('Default BOM');
  const [bomItems, setBomItems] = useState<ProductionBomItem[]>([]); // Empty by default

  // Searchable Add Component Modal/Dropdown (Only raw and semi materials)
  const [showAddComponentModal, setShowAddComponentModal] = useState<boolean>(false);
  const [componentSearchQuery, setComponentSearchQuery] = useState<string>('');

  // Keyboard navigation & Tally shortcuts
  const [highlightedProductIdx, setHighlightedProductIdx] = useState<number>(0);
  const [highlightedCatalogIdx, setHighlightedCatalogIdx] = useState<number>(0);
  const wizardContainerRef = useRef<HTMLDivElement>(null);
  const productSearchInputRef = useRef<HTMLInputElement>(null);
  const catalogSearchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input when product dropdown or catalog modal opens
  useEffect(() => {
    if (showProductDropdown) {
      setHighlightedProductIdx(0);
      setTimeout(() => productSearchInputRef.current?.focus(), 50);
    }
  }, [showProductDropdown]);

  useEffect(() => {
    if (showAddComponentModal) {
      setHighlightedCatalogIdx(0);
      setTimeout(() => catalogSearchInputRef.current?.focus(), 50);
    }
  }, [showAddComponentModal]);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (productDropdownRef.current && !productDropdownRef.current.contains(target)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 1. Load backend data on mount
  useEffect(() => {
    let isMounted = true;
    const loadBackend = async () => {
      try {
        setLoadingInitial(true);
        if (!companyId) return;

        const [skusRes, warehouseRes, nextNumRes] = await Promise.allSettled([
          getSkusV2(companyId),
          getWarehouseHierarchyV2(companyId),
          getNextProductionOrderNumber(companyId)
        ]);

        if (!isMounted) return;

        // SKUs
        if (skusRes.status === 'fulfilled' && Array.isArray(skusRes.value)) {
          setBackendSkus(skusRes.value);
        }

        // Factories
        if (warehouseRes.status === 'fulfilled' && Array.isArray(warehouseRes.value)) {
          const factoryLocs = warehouseRes.value.filter(l => l.level === 'Factory');
          const factoryNames = factoryLocs.map(f => f.name.trim()).filter(Boolean);
          if (factoryNames.length > 0) {
            setFactories(factoryNames);
          } else if (warehouseRes.value.length > 0) {
            const rootNames = warehouseRes.value.map(f => f.name.trim()).filter(Boolean);
            setFactories(rootNames);
          } else {
            setFactories(['Main Factory']);
          }
        }

        // Order Number sequence starting at PR-0001
        if (nextNumRes.status === 'fulfilled' && nextNumRes.value) {
          setOrderNumber(nextNumRes.value);
        } else {
          setOrderNumber('PR-0001');
        }
      } catch (err) {
        console.error('Failed to load initial data from backend:', err);
      } finally {
        if (isMounted) setLoadingInitial(false);
      }
    };

    loadBackend();
    return () => { isMounted = false; };
  }, [companyId]);

  // Finished Goods list ONLY (items -> products tab)
  const finishedProductsList = useMemo(() => {
    return backendSkus.filter(sku => getItemClassification(sku) === 'products');
  }, [backendSkus]);

  // Raw & Semi-Finished Materials list ONLY (for Add Component)
  const rawAndSemiMaterialsList = useMemo(() => {
    return backendSkus.filter(sku => {
      const cls = getItemClassification(sku);
      return cls === 'materials' || cls === 'semi';
    });
  }, [backendSkus]);

  // Selected SKU reference
  const selectedSku = useMemo(() => {
    return backendSkus.find(s => s._id === selectedSkuId);
  }, [selectedSkuId, backendSkus]);

  // Conversion rate computation
  const conversionRate = useMemo(() => {
    if (!selectedSku) return 1;
    if (selectedSku.booksGbl && selectedSku.booksGbl > 0) return selectedSku.booksGbl;
    if (selectedSku.altUnitConversion && selectedSku.altUnitConversion > 0) return selectedSku.altUnitConversion;
    if (selectedSku.unit === 'GBL' || productionUom === 'GBL') return 140;
    return 1;
  }, [selectedSku, productionUom]);

  // Total PCS calculation according to conversion rate
  const totalPlannedPcs = useMemo(() => {
    const qty = Number(productionQty) || 0;
    if (qty <= 0) return 0;
    if (productionUom === 'GBL') {
      return qty * conversionRate;
    }
    return qty;
  }, [productionQty, productionUom, conversionRate]);

  // Build BOM dynamically from Item Master assigned bomItems
  const loadBomFromItemMaster = (sku: SkuV2, pcs: number) => {
    if (!sku.bomItems || !Array.isArray(sku.bomItems) || sku.bomItems.length === 0) {
      setBomItems([]);
      return;
    }

    const targetPcs = pcs > 0 ? pcs : 1;
    const yieldBasis = Number(sku.recipeYieldQty) || Number(sku.batchYieldQty) || 1;

    const items: ProductionBomItem[] = sku.bomItems.map((raw: any, idx: number) => {
      const compSku = backendSkus.find(s => 
        (raw.skuId && (s._id === raw.skuId || s._id === String(raw.skuId))) ||
        (raw.skuCode && s.skuCode === raw.skuCode) ||
        (s.name.toLowerCase() === (raw.name || raw.itemName || '').toLowerCase())
      );

      const qtyPerBatch = Number(raw.qty) || Number(raw.qtyPerBatch) || 1;
      const totalReq = (qtyPerBatch / yieldBasis) * targetPcs;
      const stock = compSku ? (compSku.presentStock ?? compSku.openingStock ?? 0) : (raw.inStock ?? 0);
      const rate = Number(raw.rate) || 1.00;
      const amount = totalReq * rate;

      let compType: 'Raw' | 'Semi' | 'Finished' = 'Raw';
      if (compSku) {
        compType = getItemClassification(compSku) === 'semi' ? 'Semi' : 'Raw';
      }

      return {
        id: `bom-${idx + 1}-${Date.now()}`,
        component: raw.name || raw.itemName || compSku?.name || `Component ${idx + 1}`,
        code: raw.skuCode || compSku?.skuCode || '',
        type: compType,
        qtyPerBatch,
        totalRequired: Math.round(totalReq * 100) / 100,
        uom: raw.uom || compSku?.unit || 'PCS',
        availableStock: stock,
        stockStatus: stock >= totalReq ? 'Available' : 'Shortage',
        rate,
        amount,
        issuedQty: 0,
        issuedStatus: 'Pending'
      };
    });

    setBomItems(items);
  };

  // When a Finished Product is chosen
  const handleSelectProduct = (sku: SkuV2) => {
    setSelectedSkuId(sku._id || '');
    setShowProductDropdown(false);
    setProductSearchQuery('');

    // Set units
    const preferredUom = sku.unit || 'PCS';
    setProductionUom(preferredUom);

    // Load dynamic BOM from Item Master
    const pcs = totalPlannedPcs > 0 ? totalPlannedPcs : (Number(productionQty) || 1) * (preferredUom === 'GBL' ? (sku.booksGbl || 140) : 1);
    loadBomFromItemMaster(sku, pcs);
    setBomType('Default BOM');
  };

  // Recalculate BOM total required when productionQty or conversion rate changes
  useEffect(() => {
    if (bomItems.length === 0 || !selectedSku) return;
    const pcs = totalPlannedPcs > 0 ? totalPlannedPcs : 1;
    const yieldBasis = Number(selectedSku.recipeYieldQty) || Number(selectedSku.batchYieldQty) || 1;

    setBomItems(prev => prev.map(item => {
      const totalReq = (item.qtyPerBatch / yieldBasis) * pcs;
      const status = item.availableStock >= totalReq ? 'Available' : 'Shortage';
      return {
        ...item,
        totalRequired: Math.round(totalReq * 100) / 100,
        stockStatus: status,
        amount: totalReq * item.rate
      };
    }));
  }, [totalPlannedPcs]);

  // Update BOM item quantity per batch
  const handleUpdateQtyPerBatch = (index: number, newQty: number) => {
    setBomItems(prev => {
      const next = [...prev];
      const item = { ...next[index] };
      const pcs = totalPlannedPcs > 0 ? totalPlannedPcs : 1;
      const yieldBasis = Number(selectedSku?.recipeYieldQty) || 1;
      item.qtyPerBatch = newQty;
      item.totalRequired = Math.round(((newQty / yieldBasis) * pcs) * 100) / 100;
      item.stockStatus = item.availableStock >= item.totalRequired ? 'Available' : 'Shortage';
      item.amount = item.totalRequired * item.rate;
      next[index] = item;
      return next;
    });
    setBomType('Custom BOM (Production Order Only)');
  };

  // Remove Component from BOM
  const handleRemoveComponent = (index: number) => {
    setBomItems(prev => prev.filter((_, i) => i !== index));
    setBomType('Custom BOM (Production Order Only)');
  };

  // Add Component from Catalog (Raw and Semi Materials ONLY)
  const handleSelectCatalogComponent = (compSku: SkuV2) => {
    const pcs = totalPlannedPcs > 0 ? totalPlannedPcs : 1;
    const stock = compSku.presentStock ?? compSku.openingStock ?? 0;
    const compType = getItemClassification(compSku) === 'semi' ? 'Semi' : 'Raw';

    const newItem: ProductionBomItem = {
      id: `bom-add-${Date.now()}`,
      component: compSku.name,
      code: compSku.skuCode,
      type: compType,
      qtyPerBatch: 1,
      totalRequired: 1 * pcs,
      uom: compSku.unit || 'PCS',
      availableStock: stock,
      stockStatus: stock >= (1 * pcs) ? 'Available' : 'Shortage',
      rate: 1.00,
      amount: 1 * pcs * 1.00,
      issuedQty: 0,
      issuedStatus: 'Pending'
    };

    setBomItems(prev => [...prev, newItem]);
    setBomType('Custom BOM (Production Order Only)');
    setShowAddComponentModal(false);
    setComponentSearchQuery('');
    showToast(`Added "${compSku.name}" (${compType}) to BOM`, 'success');
  };

  // Step 3 statistics
  const bomStats = useMemo(() => {
    const totalComponents = bomItems.length;
    const availableCount = bomItems.filter(i => i.stockStatus === 'Available').length;
    const shortageCount = bomItems.filter(i => i.stockStatus === 'Shortage').length;
    const totalRequiredPcs = bomItems.reduce((acc, curr) => acc + curr.totalRequired, 0);
    const totalEstimatedCost = bomItems.reduce((acc, curr) => acc + curr.amount, 0);

    return {
      totalComponents,
      availableCount,
      shortageCount,
      totalRequiredPcs,
      totalEstimatedCost
    };
  }, [bomItems]);

  // Validation before Step 3
  const handleSaveAndContinue = () => {
    if (!orderNumber.trim()) {
      showToast('Order Number is required', 'error');
      return;
    }
    if (!selectedSku) {
      showToast('Please select a finished product to produce', 'error');
      return;
    }
    const qty = Number(productionQty);
    if (!qty || qty <= 0) {
      showToast('Please enter a valid production quantity (> 0)', 'error');
      return;
    }
    if (!factory.trim()) {
      showToast('Please select or specify a Factory', 'error');
      return;
    }
    if (!department.trim()) {
      showToast('Please select or enter a Manufacturing Department', 'error');
      return;
    }
    setCurrentStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Create Order in MongoDB
  const handleCreateOrder = async () => {
    if (!selectedSku || !companyId) return;

    try {
      setSubmitting(true);
      const qty = Number(productionQty) || 1;
      const materialStatus = bomStats.shortageCount > 0 ? 'Shortage' : 'Ready';

      const payload: Partial<ProductionOrder> = {
        orderNumber: orderNumber.trim(),
        itemId: selectedSku._id as any,
        itemName: selectedSku.name,
        itemCode: selectedSku.skuCode,
        itemType: 'Finished Good',
        plannedQty: qty,
        plannedUom: productionUom,
        plannedPcs: totalPlannedPcs,
        conversionFactor: conversionRate,
        producedQty: 0,
        producedPcs: 0,
        balanceQty: qty,
        balancePcs: totalPlannedPcs,
        materialStatus: materialStatus,
        status: 'Planned',
        progress: 0,
        department: department.trim(),
        factory: factory.trim(),
        plannedStartDate: plannedStartDate || '',
        requiredCompletionDate: requiredCompletionDate || '',
        priority: priority,
        reference: reference || 'Not Selected',
        remarks: remarks || '-',
        bomType: bomType,
        bomItems: bomItems,
        productionEntries: [],
        company: companyId
      };

      const created = await createProductionOrder(payload);
      showToast(`Production Order ${created.orderNumber} created successfully in database!`, 'success');
      onCreated(created);
    } catch (err: any) {
      console.error('Failed to create production order:', err);
      showToast(err.response?.data?.msg || err.message || 'Failed to create production order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Tally Keyboard Navigation: shift focus forward/backward across inputs & selects
  const shiftFocus = (delta: number) => {
    if (!wizardContainerRef.current) return;
    const focusables = Array.from(
      wizardContainerRef.current.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]):not([data-skip-tab]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
      )
    ).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0);

    const activeEl = document.activeElement as HTMLElement;
    const index = focusables.indexOf(activeEl);
    const nextIdx = index + delta;
    if (nextIdx >= 0 && nextIdx < focusables.length) {
      focusables[nextIdx]?.focus();
      if ('select' in focusables[nextIdx]) {
        (focusables[nextIdx] as HTMLInputElement).select?.();
      }
    }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    if (e.key === 'Enter') {
      if (showProductDropdown) return; // handled by product search input
      if (showAddComponentModal) return; // handled by catalog input
      if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
      if (target.getAttribute('data-bom-idx') !== null) return; // handled by BOM input

      e.preventDefault();
      shiftFocus(1);
    }
  };

  // Global Tally Keyboard Shortcuts (Esc, Ctrl+A / Ctrl+Enter, Alt+C, Alt+B, Alt+P)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Esc: close modals, dropdowns or cancel/back
      if (e.key === 'Escape') {
        if (showBulkEditBomModal) {
          e.preventDefault();
          setShowBulkEditBomModal(false);
          return;
        }
        if (showAddComponentModal) {
          e.preventDefault();
          setShowAddComponentModal(false);
          return;
        }
        if (showProductDropdown) {
          e.preventDefault();
          setShowProductDropdown(false);
          return;
        }
        if (currentStep === 3) {
          e.preventDefault();
          setCurrentStep(1);
          return;
        }
        e.preventDefault();
        onCancel();
        return;
      }

      // 2. Ctrl+A or Ctrl+Enter: Universal Tally Accept
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A' || e.key === 'Enter')) {
        e.preventDefault();
        if (currentStep === 1) {
          handleSaveAndContinue();
        } else if (currentStep === 3) {
          handleCreateOrder();
        }
        return;
      }

      // 3. Alt+C or Alt+A: Add Component (Tally Create/Add)
      if (e.altKey && (e.key === 'c' || e.key === 'C' || e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setBomType('Custom BOM (Production Order Only)');
        setShowAddComponentModal(true);
        setHighlightedCatalogIdx(0);
        return;
      }

      // 4. Alt+B: View Item Master BOM
      if (e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setShowBulkEditBomModal(true);
        return;
      }

      // 5. Alt+P: Presets toggle
      if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        const presetBtn = document.querySelector('button[title*="Alt+P"]') as HTMLButtonElement;
        presetBtn?.click();
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    currentStep,
    showBulkEditBomModal,
    showAddComponentModal,
    showProductDropdown,
    selectedSku,
    productionQty,
    factory,
    department,
    orderNumber,
    onCancel,
    bomStats,
    bomType,
    bomItems
  ]);

  if (loadingInitial) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] w-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            Loading products & BOM from backend...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/60 overflow-y-auto custom-scrollbar">
      {/* Top Header */}
      <div className="bg-white border-b border-gray-150 px-6 py-4 flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center space-x-3">
          <button
            onClick={currentStep === 3 ? () => setCurrentStep(1) : onCancel}
            className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-tight">New Production Order</h1>
            <p className="text-xs text-gray-500 font-medium">Create a new production order to manufacture finished products.</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {currentStep === 1 ? (
            <button
              onClick={handleSaveAndContinue}
              className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
            >
              <span>Save & Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleCreateOrder}
              disabled={submitting}
              className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create Production Order</span>
            </button>
          )}
        </div>
      </div>

      {/* Stepper Indicator for Step 3 */}
      {currentStep === 3 && (
        <div className="bg-white border-b border-gray-200 px-6 py-3 shrink-0 flex items-center justify-center">
          <div className="flex items-center space-x-6 text-xs font-semibold">
            <div className="flex items-center space-x-2 text-blue-600">
              <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px]">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
              <span>Basic Information</span>
            </div>
            <div className="w-12 h-0.5 bg-blue-600"></div>

            <div className="flex items-center space-x-2 text-blue-600">
              <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px]">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
              <span>Bill of Materials (BOM)</span>
            </div>
            <div className="w-12 h-0.5 bg-blue-600"></div>

            <div className="flex items-center space-x-2 text-blue-600 font-bold">
              <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px]">
                3
              </div>
              <span>Review & Confirm</span>
            </div>
            <div className="w-12 h-0.5 bg-gray-200"></div>

            <div className="flex items-center space-x-2 text-gray-400">
              <div className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[11px]">
                4
              </div>
              <span>Create Order</span>
            </div>
          </div>
        </div>
      )}

      {/* Form Content */}
      <div 
        ref={wizardContainerRef}
        onKeyDown={handleFormKeyDown}
        className="production-wizard-container p-6 max-w-7xl mx-auto w-full space-y-6"
      >
        {currentStep === 1 ? (
          <>
            {/* 1. Basic Information */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-5">
              <h2 className="text-sm font-bold text-gray-900 tracking-wide uppercase">1. Basic Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Order No - Starts with PR-0001 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Order No.</label>
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)}
                    placeholder="PR-0001"
                    className="w-full text-xs text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Item to Produce - ONLY Finished Products (items -> products tab) */}
                <div className="relative" ref={productDropdownRef}>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Item to Produce (Finished Goods) <span className="text-rose-500">*</span>
                  </label>
                  
                  <div
                    tabIndex={0}
                    onClick={() => setShowProductDropdown(!showProductDropdown)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        setShowProductDropdown(true);
                      }
                    }}
                    className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 font-semibold flex items-center justify-between cursor-pointer hover:border-gray-300 focus:outline-none focus:border-blue-500"
                  >
                    <span className={selectedSku ? 'font-bold text-gray-900' : 'text-gray-400 font-normal'}>
                      {selectedSku ? `${selectedSku.name} (${selectedSku.skuCode})` : 'Select finished product...'}
                    </span>
                    <div className="flex items-center space-x-1.5 text-gray-400">
                      <span className="text-[10px] font-mono">[Enter]</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* Searchable Product Dropdown */}
                  {showProductDropdown && (
                    <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl z-40 max-h-64 flex flex-col animate-modalPop">
                      <div className="p-2 border-b border-gray-150 bg-gray-50 flex items-center justify-between gap-2">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            ref={productSearchInputRef}
                            type="text"
                            value={productSearchQuery}
                            onChange={e => {
                              setProductSearchQuery(e.target.value);
                              setHighlightedProductIdx(0);
                            }}
                            onKeyDown={e => {
                              const filteredList = finishedProductsList.filter(s => {
                                if (!productSearchQuery.trim()) return true;
                                const q = productSearchQuery.toLowerCase();
                                return s.name.toLowerCase().includes(q) || s.skuCode.toLowerCase().includes(q);
                              });
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setHighlightedProductIdx(prev => Math.min(prev + 1, filteredList.length - 1));
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setHighlightedProductIdx(prev => Math.max(prev - 1, 0));
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                if (filteredList.length > 0 && highlightedProductIdx >= 0 && highlightedProductIdx < filteredList.length) {
                                  handleSelectProduct(filteredList[highlightedProductIdx]);
                                  setTimeout(() => {
                                    const qtyInput = document.querySelector('input[name="productionQty"]') as HTMLInputElement;
                                    qtyInput?.focus();
                                    qtyInput?.select();
                                  }, 50);
                                }
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setShowProductDropdown(false);
                              }
                            }}
                            placeholder="Search products... [↑/↓ to navigate, Enter to select]"
                            autoFocus
                            className="w-full pl-8 pr-3 py-1.5 text-xs text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div className="overflow-y-auto flex-1 divide-y divide-gray-100 custom-scrollbar">
                        {finishedProductsList
                          .filter(s => {
                            if (!productSearchQuery.trim()) return true;
                            const q = productSearchQuery.toLowerCase();
                            return s.name.toLowerCase().includes(q) || s.skuCode.toLowerCase().includes(q);
                          })
                          .map((sku, pIdx) => {
                            const hasBom = Array.isArray(sku.bomItems) && sku.bomItems.length > 0;
                            const isHighlighted = highlightedProductIdx === pIdx;
                            return (
                              <div
                                key={sku._id}
                                onClick={() => {
                                  handleSelectProduct(sku);
                                  setTimeout(() => {
                                    const qtyInput = document.querySelector('input[name="productionQty"]') as HTMLInputElement;
                                    qtyInput?.focus();
                                    qtyInput?.select();
                                  }, 50);
                                }}
                                onMouseEnter={() => setHighlightedProductIdx(pIdx)}
                                className={`p-2.5 cursor-pointer flex items-center justify-between transition-colors ${
                                  isHighlighted 
                                    ? 'bg-blue-100/90 text-blue-900 font-bold border-l-4 border-blue-600'
                                    : selectedSkuId === sku._id 
                                      ? 'bg-blue-50/80 font-bold' 
                                      : 'hover:bg-blue-50/60'
                                }`}
                              >
                                <div>
                                  <div className="text-xs font-bold text-gray-900">{sku.name}</div>
                                  <div className="text-[11px] text-gray-400 font-mono">
                                    {sku.skuCode} • {sku.unit} {sku.booksGbl ? `• ${sku.booksGbl} bks/GBL` : ''}
                                  </div>
                                </div>
                                {hasBom ? (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    {sku.bomItems?.length} BOM items
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-gray-400">No BOM</span>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Item Type - Read-only derived */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Item Type</label>
                  <div className="w-full text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-semibold">
                    Finished Good
                  </div>
                </div>

                {/* Production Quantity with conversion rate */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Production Quantity <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      min={1}
                      name="productionQty"
                      value={productionQty}
                      onChange={e => setProductionQty(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Enter quantity"
                      className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 font-bold focus:outline-none focus:border-blue-500"
                    />
                    <select
                      value={productionUom}
                      onChange={e => setProductionUom(e.target.value)}
                      className="w-24 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-2 font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="GBL">GBL</option>
                      <option value="PCS">PCS</option>
                      {selectedSku?.unit && selectedSku.unit !== 'GBL' && selectedSku.unit !== 'PCS' && (
                        <option value={selectedSku.unit}>{selectedSku.unit}</option>
                      )}
                    </select>
                  </div>
                  {/* Dynamic Conversion rate helper */}
                  {productionQty !== '' && Number(productionQty) > 0 && (
                    <p className="text-[11px] text-blue-700 mt-1 font-semibold">
                      {productionUom === 'GBL' ? (
                        <span>= <strong>{totalPlannedPcs.toLocaleString()} PCS</strong> (1 GBL = {conversionRate} PCS)</span>
                      ) : conversionRate > 1 ? (
                        <span>= <strong>{(Number(productionQty) / conversionRate).toFixed(2)} GBL</strong> (1 GBL = {conversionRate} PCS)</span>
                      ) : (
                        <span>= <strong>{Number(productionQty).toLocaleString()} {productionUom}</strong></span>
                      )}
                    </p>
                  )}
                </div>

                {/* Factory - Empty by default */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Factory <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={factory}
                    onChange={e => setFactory(e.target.value)}
                    className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">Select Factory...</option>
                    {factories.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                {/* Manufacturing Department - Reusable PresetField with persistent storage */}
                <PresetField
                  label="Manufacturing Department"
                  required
                  value={department}
                  onChange={setDepartment}
                  storageKey="skbw_mfg_department_presets"
                  defaultPresets={DEFAULT_DEPARTMENT_PRESETS}
                  placeholder="Select or enter department..."
                />

                {/* Planned Start Date - Empty by default */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Planned Start Date</label>
                  <input
                    type="date"
                    value={plannedStartDate}
                    onChange={e => setPlannedStartDate(e.target.value)}
                    className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Required Completion Date - Empty by default */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Required Completion Date</label>
                  <input
                    type="date"
                    value={requiredCompletionDate}
                    onChange={e => setRequiredCompletionDate(e.target.value)}
                    className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Priority</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as PriorityLevel)}
                    className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                {/* Reference */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Reference (Optional)</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    placeholder="e.g. Sales Order #SO-1029"
                    className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Remarks */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Remarks</label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    placeholder="Add any notes..."
                    className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* 2. Bill of Materials (BOM) */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 tracking-wide uppercase">2. Bill of Materials (BOM)</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    BOM components are dynamically loaded from Item Master for the selected finished product.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowBulkEditBomModal(true)}
                  className="inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline shrink-0 cursor-pointer"
                >
                  <span>View Item Master BOM</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Radio Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label 
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start space-x-3 ${
                    bomType === 'Default BOM' 
                      ? 'border-blue-500 bg-blue-50/30' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="bomType"
                    checked={bomType === 'Default BOM'}
                    onChange={() => {
                      setBomType('Default BOM');
                      if (selectedSku) loadBomFromItemMaster(selectedSku, totalPlannedPcs);
                    }}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-bold text-gray-900">Use Default BOM (from Item Master)</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Shows the standard recipe assigned to this product in Item Master.
                    </div>
                  </div>
                </label>

                <label 
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start space-x-3 ${
                    bomType === 'Custom BOM (Production Order Only)' 
                      ? 'border-blue-500 bg-blue-50/30' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="bomType"
                    checked={bomType === 'Custom BOM (Production Order Only)'}
                    onChange={() => setBomType('Custom BOM (Production Order Only)')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-bold text-gray-900">Customize BOM for this production only</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Change quantities, add or remove components for this order. Changes apply only to this order.
                    </div>
                  </div>
                </label>
              </div>

              {/* BOM Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50/80 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-gray-900">
                      {selectedSku ? `BOM – ${selectedSku.name}` : 'BOM Ingredients'}
                    </span>
                    {bomType === 'Custom BOM (Production Order Only)' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                        Editing Mode
                      </span>
                    )}
                  </div>

                  {selectedSku && (
                    <button
                      onClick={() => {
                        loadBomFromItemMaster(selectedSku, totalPlannedPcs);
                        setBomType('Default BOM');
                      }}
                      className="inline-flex items-center space-x-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset to Item Master BOM</span>
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        <th className="py-2.5 px-3 w-8 text-center">#</th>
                        <th className="py-2.5 px-3">Component</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Qty per Batch</th>
                        <th className="py-2.5 px-3">Total Required</th>
                        <th className="py-2.5 px-3">UOM</th>
                        <th className="py-2.5 px-3">Available Stock</th>
                        <th className="py-2.5 px-3">Stock Status</th>
                        <th className="py-2.5 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bomItems.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-gray-400">
                            {!selectedSku ? (
                              'Please select an Item to Produce above to load its BOM.'
                            ) : (
                              <div>
                                <p className="font-semibold text-gray-600">No BOM assigned in Item Master for this product.</p>
                                <p className="text-xs text-gray-400 mt-1">
                                  Click below to add raw materials or semi-finished components from your catalog.
                                </p>
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : (
                        bomItems.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="py-3 px-3 text-center font-semibold text-gray-500">{idx + 1}</td>
                            <td className="py-3 px-3 font-semibold text-gray-900">
                              <div>{item.component}</div>
                              {item.code && <div className="text-[10px] text-gray-400 font-mono">{item.code}</div>}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                item.type === 'Semi' 
                                  ? 'bg-sky-50 text-sky-700 border border-sky-200/60'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              }`}>
                                {item.type}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <input
                                type="number"
                                min={0.01}
                                step="any"
                                data-bom-idx={idx}
                                value={item.qtyPerBatch}
                                onChange={e => handleUpdateQtyPerBatch(idx, Math.max(0.01, Number(e.target.value) || 0.01))}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const next = document.querySelector(`input[data-bom-idx="${idx + 1}"]`) as HTMLInputElement;
                                    if (next) {
                                      next.focus();
                                      next.select();
                                    } else {
                                      shiftFocus(1);
                                    }
                                  } else if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    const next = document.querySelector(`input[data-bom-idx="${idx + 1}"]`) as HTMLInputElement;
                                    next?.focus();
                                    next?.select();
                                  } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    const prev = document.querySelector(`input[data-bom-idx="${idx - 1}"]`) as HTMLInputElement;
                                    prev?.focus();
                                    prev?.select();
                                  }
                                }}
                                className="w-20 px-2 py-1 text-xs font-semibold bg-white border border-gray-200 rounded text-center focus:border-blue-500 focus:outline-none"
                              />
                            </td>
                            <td className="py-3 px-3 font-bold text-gray-900">
                              {item.totalRequired.toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-gray-600 font-medium">{item.uom}</td>
                            <td className="py-3 px-3 font-semibold text-gray-700">
                              {item.availableStock.toLocaleString()}
                            </td>
                            <td className="py-3 px-3">
                              {item.stockStatus === 'Available' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Available
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                  Shortage
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {bomType === 'Custom BOM (Production Order Only)' ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveComponent(idx)}
                                  title="Remove component"
                                  className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <span className="text-[11px] text-gray-300 font-mono select-none">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add Component Button (Raw and Semi ONLY) - ONLY SHOWN IN CUSTOM BOM MODE */}
                {bomType === 'Custom BOM (Production Order Only)' && (
                  <div className="p-3 bg-gray-50/50 border-t border-gray-200 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowAddComponentModal(true)}
                      className="inline-flex items-center space-x-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-white border border-gray-200 hover:border-blue-300 px-3 py-1.5 rounded-lg shadow-2xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Component from Catalog (Raw & Semi Materials)</span>
                    </button>
                    <span className="text-[11px] text-gray-500 font-medium">
                      Customizing components for this production order
                    </span>
                  </div>
                )}
              </div>

              {/* Bottom Nav */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <button
                  onClick={onCancel}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Back
                </button>

                <button
                  onClick={handleSaveAndContinue}
                  className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-5 py-2 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
                >
                  <span>Save & Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* STEP 3: Review & Confirm */
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-150 pb-4">
                <div>
                  <h2 className="text-base font-bold text-gray-900 tracking-tight">Review & Confirm</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Please review the production order details, BOM and material availability before creating the order.
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    ← Back
                  </button>

                  <button
                    onClick={handleCreateOrder}
                    disabled={submitting}
                    className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Create Production Order</span>
                  </button>
                </div>
              </div>

              {/* Order Information 2-Column Summary Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6 text-xs bg-gray-50/70 p-4 rounded-xl border border-gray-200/70">
                <div>
                  <span className="text-[11px] font-semibold text-gray-400 block uppercase">Order No.</span>
                  <span className="font-bold text-gray-900 font-mono mt-0.5 block">{orderNumber}</span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-gray-400 block uppercase">Item to Produce</span>
                  <div className="mt-0.5">
                    <span className="font-bold text-gray-900 block">{selectedSku?.name}</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mt-0.5">
                      Finished Good
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-gray-400 block uppercase">Factory</span>
                  <span className="font-bold text-gray-900 mt-0.5 block">{factory}</span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-gray-400 block uppercase">BOM Type</span>
                  <span className="font-semibold text-gray-900 mt-0.5 block">{bomType}</span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-gray-400 block uppercase">Production Quantity</span>
                  <span className="font-bold text-gray-900 mt-0.5 block">
                    {productionQty} {productionUom} {productionUom === 'GBL' ? `(= ${totalPlannedPcs.toLocaleString()} PCS)` : ''}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-gray-400 block uppercase">Manufacturing Department</span>
                  <span className="font-bold text-gray-900 mt-0.5 block">{department}</span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-gray-400 block uppercase">Priority</span>
                  <span className="font-semibold text-gray-900 mt-0.5 block">{priority}</span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-gray-400 block uppercase">Planned Start Date</span>
                  <span className="font-semibold text-gray-900 mt-0.5 block">{plannedStartDate || '-'}</span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-gray-400 block uppercase">Required Completion Date</span>
                  <span className="font-semibold text-gray-900 mt-0.5 block">{requiredCompletionDate || '-'}</span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-gray-400 block uppercase">Reference</span>
                  <span className="font-semibold text-gray-900 mt-0.5 block">{reference || 'Not Selected'}</span>
                </div>

                <div className="md:col-span-2">
                  <span className="text-[11px] font-semibold text-gray-400 block uppercase">Remarks</span>
                  <span className="text-gray-700 mt-0.5 block">{remarks || '-'}</span>
                </div>
              </div>

              {/* BOM Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold text-gray-900">Bill of Materials (BOM)</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      {bomType}
                    </span>
                  </div>

                  <button
                    onClick={() => setCurrentStep(1)}
                    className="inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit BOM</span>
                  </button>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        <th className="py-2.5 px-3 w-8 text-center">#</th>
                        <th className="py-2.5 px-3">Component</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Qty per Batch</th>
                        <th className="py-2.5 px-3">Total Required</th>
                        <th className="py-2.5 px-3">UOM</th>
                        <th className="py-2.5 px-3">Available Stock</th>
                        <th className="py-2.5 px-3">Stock Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bomItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-gray-50/50">
                          <td className="py-3 px-3 text-center font-semibold text-gray-500">{idx + 1}</td>
                          <td className="py-3 px-3 font-semibold text-gray-900">{item.component}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              item.type === 'Semi' 
                                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-semibold text-gray-800">{item.qtyPerBatch}</td>
                          <td className="py-3 px-3 font-bold text-gray-900">{item.totalRequired.toLocaleString()}</td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{item.uom}</td>
                          <td className="py-3 px-3 font-semibold text-gray-700">{item.availableStock.toLocaleString()}</td>
                          <td className="py-3 px-3">
                            {item.stockStatus === 'Available' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Available
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                Shortage
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Material Availability Summary Cards */}
              <div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2.5">
                  Material Availability Summary
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs">
                    <span className="text-2xl font-black text-blue-600">{bomStats.totalComponents}</span>
                    <p className="text-xs font-medium text-gray-500 mt-1">Total Components</p>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs">
                    <span className="text-2xl font-black text-emerald-600">{bomStats.availableCount}</span>
                    <p className="text-xs font-medium text-gray-500 mt-1">Components Available</p>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs">
                    <span className="text-2xl font-black text-rose-600">{bomStats.shortageCount}</span>
                    <p className="text-xs font-medium text-gray-500 mt-1">Components Shortage</p>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs">
                    <span className="text-xl font-black text-gray-900">{bomStats.totalRequiredPcs.toLocaleString()}</span>
                    <p className="text-xs font-medium text-gray-500 mt-1">Total Units Required</p>
                  </div>
                </div>
              </div>

              {/* Estimated Material Cost Table */}
              {bomStats.totalEstimatedCost > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                      Estimated Material Cost
                    </h3>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                          <th className="py-2.5 px-3 w-8 text-center">#</th>
                          <th className="py-2.5 px-3">Component</th>
                          <th className="py-2.5 px-3">Required Qty</th>
                          <th className="py-2.5 px-3">UOM</th>
                          <th className="py-2.5 px-3">Rate (₹)</th>
                          <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bomItems.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-gray-50/50">
                            <td className="py-3 px-3 text-center font-semibold text-gray-500">{idx + 1}</td>
                            <td className="py-3 px-3 font-semibold text-gray-900">{item.component}</td>
                            <td className="py-3 px-3 font-semibold text-gray-800">{item.totalRequired.toLocaleString()}</td>
                            <td className="py-3 px-3 text-gray-600 font-medium">{item.uom}</td>
                            <td className="py-3 px-3 font-semibold text-gray-700">{item.rate.toFixed(2)}</td>
                            <td className="py-3 px-3 font-bold text-gray-900 text-right">{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50/80 border-t border-gray-200 font-bold text-xs">
                          <td colSpan={5} className="py-3 px-4 text-gray-800 text-left uppercase tracking-wide">
                            Total Estimated Material Cost
                          </td>
                          <td className="py-3 px-4 text-right text-blue-600 text-sm font-black">
                            ₹ {bomStats.totalEstimatedCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal to pick Raw or Semi Materials ONLY */}
      {showAddComponentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[80vh] animate-modalPop">
            <div className="p-4 border-b border-gray-150 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Add Raw Material or Semi-Finished Component</h3>
                <p className="text-xs text-gray-500">Only Raw Materials and Semi-Finished goods are shown</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddComponentModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={catalogSearchInputRef}
                  type="text"
                  value={componentSearchQuery}
                  onChange={e => {
                    setComponentSearchQuery(e.target.value);
                    setHighlightedCatalogIdx(0);
                  }}
                  onKeyDown={e => {
                    const filteredCatalog = rawAndSemiMaterialsList.filter(s => {
                      if (!componentSearchQuery.trim()) return true;
                      const q = componentSearchQuery.toLowerCase();
                      return s.name.toLowerCase().includes(q) || s.skuCode.toLowerCase().includes(q) || (s.category && s.category.toLowerCase().includes(q));
                    }).slice(0, 60);

                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHighlightedCatalogIdx(prev => Math.min(prev + 1, filteredCatalog.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedCatalogIdx(prev => Math.max(prev - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (filteredCatalog.length > 0 && highlightedCatalogIdx >= 0 && highlightedCatalogIdx < filteredCatalog.length) {
                        handleSelectCatalogComponent(filteredCatalog[highlightedCatalogIdx]);
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowAddComponentModal(false);
                    }
                  }}
                  placeholder="Search materials... [↑/↓ to navigate, Enter to add, Esc to close]"
                  autoFocus
                  className="w-full pl-9 pr-3 py-1.5 text-xs text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-2 divide-y divide-gray-100 custom-scrollbar">
              {rawAndSemiMaterialsList
                .filter(s => {
                  if (!componentSearchQuery.trim()) return true;
                  const q = componentSearchQuery.toLowerCase();
                  return s.name.toLowerCase().includes(q) || s.skuCode.toLowerCase().includes(q) || (s.category && s.category.toLowerCase().includes(q));
                })
                .slice(0, 60)
                .map((compSku, cIdx) => {
                  const classification = getItemClassification(compSku);
                  const isHighlighted = highlightedCatalogIdx === cIdx;
                  return (
                    <div
                      key={compSku._id}
                      onClick={() => handleSelectCatalogComponent(compSku)}
                      onMouseEnter={() => setHighlightedCatalogIdx(cIdx)}
                      className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                        isHighlighted 
                          ? 'bg-blue-100/90 text-blue-900 font-bold border-l-4 border-blue-600'
                          : 'hover:bg-blue-50/60'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-gray-900">{compSku.name}</div>
                        <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                          {compSku.skuCode} • Stock: {compSku.presentStock ?? compSku.openingStock ?? 0} {compSku.unit}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          classification === 'semi'
                            ? 'bg-sky-50 text-sky-700 border border-sky-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {classification === 'semi' ? 'Semi Finished' : 'Raw Material'}
                        </span>
                        <button className="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md">
                          + Add
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Edit BOM Modal (opens exact Build BOMs modal from Item Master) */}
      {showBulkEditBomModal && companyId && (
        <BulkEditBomModal
          isOpen={showBulkEditBomModal}
          onClose={() => setShowBulkEditBomModal(false)}
          companyId={companyId}
          initialSelectedSkuId={selectedSkuId}
          onSaved={(updatedSku) => {
            setBackendSkus(prev => prev.map(s => s._id === updatedSku._id ? updatedSku : s));
            if (selectedSkuId === updatedSku._id) {
              const pcs = totalPlannedPcs > 0 ? totalPlannedPcs : 1;
              loadBomFromItemMaster(updatedSku, pcs);
            }
          }}
        />
      )}
      {/* Tally Keyboard Shortcut Status Bar */}
      <div className="bg-slate-900 text-slate-300 px-6 py-2 border-t border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3 shadow-inner select-none shrink-0">
        <div className="flex items-center space-x-3 text-[11px] overflow-x-auto py-0.5">
          <span className="flex items-center space-x-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">↵ Enter</kbd>
            <span className="text-slate-300">Next Field</span>
          </span>
          <span className="text-slate-700">•</span>
          <span className="flex items-center space-x-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">↑ / ↓</kbd>
            <span className="text-slate-300">Navigate Lists</span>
          </span>
          <span className="text-slate-700">•</span>
          <span className="flex items-center space-x-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-emerald-400 font-bold">Ctrl+A / Ctrl+↵</kbd>
            <span className="text-emerald-400 font-semibold">{currentStep === 1 ? 'Save & Continue' : 'Create Order'}</span>
          </span>
          <span className="text-slate-700">•</span>
          <span className="flex items-center space-x-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+C</kbd>
            <span className="text-slate-300">Add Component</span>
          </span>
          <span className="text-slate-700">•</span>
          <span className="flex items-center space-x-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+B</kbd>
            <span className="text-slate-300">Item Master BOM</span>
          </span>
          <span className="text-slate-700">•</span>
          <span className="flex items-center space-x-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Alt+P</kbd>
            <span className="text-slate-300">Presets</span>
          </span>
        </div>
        <div className="flex items-center space-x-1.5 text-[11px]">
          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-amber-400 font-bold">Esc</kbd>
          <span className="text-slate-300">{currentStep === 3 ? 'Back to Edit' : 'Cancel'}</span>
        </div>
      </div>
    </div>
  );
};

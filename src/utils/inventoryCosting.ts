import { getSkusV2, getBalancesV2, getPurchaseInvoicesV2, SkuV2 } from '../api/mfgApiV2';

export interface ComponentCostingResult {
  rate: number;
  availableStock: number;
  source: 'purchase_invoice' | 'valuation_rate' | 'sku_master' | 'manual';
  rateLabel: string;
  sku?: SkuV2;
}

export interface StockCostingData {
  ratesMap: Map<string, { rate: number; source: 'purchase_invoice' | 'valuation_rate' | 'sku_master' }>;
  stockMap: Map<string, number>;
  skuMap: Map<string, SkuV2>;
  skus: SkuV2[];
}

/**
 * Dynamically loads live rates and on-hand stock from Stock & Inventory modules:
 * 1. Purchase Invoices (actual procurement batch prices & weighted average cost)
 * 2. Inventory Balances (real-time on-hand stock quantities by SKU)
 * 3. SKU Master (costPrice, purchasePrice, ratePerKg, avgRate, valuationRate)
 */
export const fetchStockCostings = async (companyId: string): Promise<StockCostingData> => {
  const ratesMap = new Map<string, { rate: number; source: 'purchase_invoice' | 'valuation_rate' | 'sku_master' }>();
  const stockMap = new Map<string, number>();
  const skuMap = new Map<string, SkuV2>();

  if (!companyId) {
    return { ratesMap, stockMap, skuMap, skus: [] };
  }

  try {
    const [skusRes, balancesRes, purchasesRes] = await Promise.allSettled([
      getSkusV2(companyId),
      getBalancesV2(companyId, undefined, true),
      getPurchaseInvoicesV2({ companyId, limit: 100 })
    ]);

    // 1. Process SKUs
    const skus: SkuV2[] = skusRes.status === 'fulfilled' && Array.isArray(skusRes.value) ? skusRes.value : [];
    skus.forEach(s => {
      const sId = String(s._id || '');
      const sCode = (s.skuCode || '').trim().toLowerCase();
      const sName = (s.name || '').trim().toLowerCase();

      if (sId) skuMap.set(sId, s);
      if (sCode) skuMap.set(sCode, s);
      if (sName) skuMap.set(sName, s);

      // Check SKU Master base rates
      const skuRate = Number(
        (s as any).purchasePrice ||
        (s as any).ratePerKg ||
        (s as any).avgRate ||
        (s as any).costPrice ||
        (s as any).rate ||
        (s as any).valuationRate ||
        (s as any).standardCost ||
        0
      );

      if (skuRate > 0) {
        const entry = { rate: skuRate, source: 'sku_master' as const };
        if (sId) ratesMap.set(sId, entry);
        if (sCode) ratesMap.set(sCode, entry);
      }

      // Base stock from SKU Master
      const baseStock = Number(s.presentStock ?? s.openingStock ?? 0);
      if (sId) stockMap.set(sId, baseStock);
      if (sCode) stockMap.set(sCode, baseStock);
    });

    // 2. Process Inventory Balances (Live On-Hand Stock)
    if (balancesRes.status === 'fulfilled' && Array.isArray(balancesRes.value)) {
      // Group balances by skuId
      const liveOnHandMap = new Map<string, number>();
      balancesRes.value.forEach((b: any) => {
        const rawId = b.skuId?._id || b.skuId;
        const sId = rawId ? String(rawId) : '';
        const qty = Number(b.onHand) || 0;
        if (sId) {
          liveOnHandMap.set(sId, (liveOnHandMap.get(sId) || 0) + qty);
        }
      });

      liveOnHandMap.forEach((qty, sId) => {
        stockMap.set(sId, Math.max(0, qty));
        const matchedSku = skuMap.get(sId);
        if (matchedSku && matchedSku.skuCode) {
          stockMap.set(matchedSku.skuCode.trim().toLowerCase(), Math.max(0, qty));
        }
      });
    }

    // 3. Process Purchase Invoices (Dynamic weighted average rate & latest purchase prices)
    if (purchasesRes.status === 'fulfilled') {
      const invoices = (purchasesRes.value as any)?.invoices || 
        (Array.isArray(purchasesRes.value) ? purchasesRes.value : []);
      
      const purchaseStatsMap = new Map<string, { totalSpend: number; totalQty: number; latestRate: number }>();

      invoices.forEach((inv: any) => {
        if (inv.status === 'Cancelled') return;
        (inv.items || []).forEach((item: any) => {
          const rawId = item.skuId?._id || item.skuId;
          const sId = rawId ? String(rawId) : '';
          const qty = Number(item.quantity) || 0;
          const price = Number(item.purchasePrice || item.rate || item.price || item.ratePerKg || 0);

          if (sId && price > 0) {
            const current = purchaseStatsMap.get(sId) || { totalSpend: 0, totalQty: 0, latestRate: price };
            const newSpend = current.totalSpend + (qty > 0 ? (qty * price) : price);
            const newQty = current.totalQty + (qty > 0 ? qty : 1);
            purchaseStatsMap.set(sId, {
              totalSpend: newSpend,
              totalQty: newQty,
              latestRate: current.latestRate || price
            });
          }
        });
      });

      purchaseStatsMap.forEach((stats, sId) => {
        const avgPrice = stats.totalQty > 0 ? (stats.totalSpend / stats.totalQty) : stats.latestRate;
        const effectiveRate = Math.round(avgPrice * 100) / 100;
        if (effectiveRate > 0) {
          const entry = { rate: effectiveRate, source: 'purchase_invoice' as const };
          ratesMap.set(sId, entry);
          const matchedSku = skuMap.get(sId);
          if (matchedSku && matchedSku.skuCode) {
            ratesMap.set(matchedSku.skuCode.trim().toLowerCase(), entry);
          }
        }
      });
    }

    return { ratesMap, stockMap, skuMap, skus };
  } catch (err) {
    console.error('Failed to fetch stock costings from backend:', err);
    return { ratesMap, stockMap, skuMap, skus: [] };
  }
};

/**
 * Resolves dynamic costing for any component using live Stock & Inventory data
 */
export const resolveComponentCosting = (
  component: {
    skuId?: string;
    skuCode?: string;
    code?: string;
    name?: string;
    component?: string;
    rate?: number;
    inStock?: number;
    availableStock?: number;
  },
  costings: StockCostingData | null
): ComponentCostingResult => {
  const fallbackRate = Number(component.rate) > 0 ? Number(component.rate) : 0;
  const fallbackStock = Number(component.availableStock ?? component.inStock ?? 0);

  if (!costings) {
    return {
      rate: fallbackRate,
      availableStock: fallbackStock,
      source: 'manual',
      rateLabel: fallbackRate > 0 ? `₹${fallbackRate.toFixed(2)}` : 'Rate Not Set'
    };
  }

  const sId = component.skuId ? String(component.skuId) : '';
  const sCode = (component.skuCode || component.code || '').trim().toLowerCase();
  const sName = (component.name || component.component || '').trim().toLowerCase();

  // Find matching SKU
  const matchedSku = (sId && costings.skuMap.get(sId)) ||
    (sCode && costings.skuMap.get(sCode)) ||
    (sName && costings.skuMap.get(sName));

  // 1. Resolve Rate
  let resolvedRate = 0;
  let source: ComponentCostingResult['source'] = 'manual';

  const rateInfo = (sId && costings.ratesMap.get(sId)) ||
    (sCode && costings.ratesMap.get(sCode)) ||
    (matchedSku?._id && costings.ratesMap.get(String(matchedSku._id))) ||
    (matchedSku?.skuCode && costings.ratesMap.get(matchedSku.skuCode.trim().toLowerCase()));

  if (rateInfo && rateInfo.rate > 0) {
    resolvedRate = rateInfo.rate;
    source = rateInfo.source;
  } else if (matchedSku) {
    const skuMasterRate = Number(
      (matchedSku as any).purchasePrice ||
      (matchedSku as any).ratePerKg ||
      (matchedSku as any).avgRate ||
      (matchedSku as any).costPrice ||
      (matchedSku as any).rate ||
      0
    );
    if (skuMasterRate > 0) {
      resolvedRate = skuMasterRate;
      source = 'sku_master';
    }
  }

  if (resolvedRate <= 0 && fallbackRate > 0) {
    resolvedRate = fallbackRate;
    source = 'manual';
  }

  // 2. Resolve Live Stock
  let resolvedStock = fallbackStock;
  const liveStockVal = (sId && costings.stockMap.get(sId)) ??
    (sCode && costings.stockMap.get(sCode)) ??
    (matchedSku?._id && costings.stockMap.get(String(matchedSku._id))) ??
    (matchedSku?.skuCode && costings.stockMap.get(matchedSku.skuCode.trim().toLowerCase()));

  if (liveStockVal !== undefined) {
    resolvedStock = liveStockVal;
  } else if (matchedSku) {
    resolvedStock = Number(matchedSku.presentStock ?? matchedSku.openingStock ?? 0);
  }

  const rateLabel = resolvedRate > 0 
    ? `₹${resolvedRate.toFixed(2)}${source === 'purchase_invoice' ? ' (Procurement)' : source === 'sku_master' ? ' (Inventory)' : ''}`
    : 'Rate Not Set';

  return {
    rate: resolvedRate,
    availableStock: resolvedStock,
    source,
    rateLabel,
    sku: matchedSku
  };
};

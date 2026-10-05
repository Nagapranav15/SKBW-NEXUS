// src/utils/costingUtils.ts
// Shared costing and profit/pricing calculation engine for BOM Matrix and Production Orders

export interface AdditionalCostRow {
  id: string;
  costType: string;
  calcBasis: 'Per BOM' | 'Per Batch' | 'Total / Batch' | 'Per Piece' | 'Per GBL' | 'Fixed' | string;
  amount: number | string;
  appliedAs: 'Per BOM' | 'Total Cost for this production/batch' | 'Total Cost for this production' | 'Per Unit (PCS)' | 'Per Unit (GBL)' | 'Per Batch' | 'Total' | string;
}

export interface ProfitPricingState {
  pricingMethod: 'Markup %' | 'Margin %' | string;
  markupPercentage: number | string;
  suggestedPricePcs?: number;
  suggestedPriceGbl?: number;
}

export function formatInr(val: number | undefined | null): string {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  return val.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function isBatchOrTotalCost(cost: { calcBasis?: string; basis?: string; appliedAs?: string }): boolean {
  const basis = (cost.calcBasis || cost.basis || '').toLowerCase().trim();
  const applied = (cost.appliedAs || '').toLowerCase().trim();

  // If appliedAs is explicitly per unit (PCS or GBL), it is NOT a batch cost
  if (applied.includes('(pcs)') || applied.includes('(gbl)')) {
    return false;
  }

  // If appliedAs is explicitly batch, bom, total, fixed, or lump sum
  if (
    applied.includes('bom') ||
    applied.includes('batch') ||
    applied.includes('total') ||
    applied === 'fixed' ||
    applied === 'lump sum'
  ) {
    return true;
  }

  // If appliedAs is not set or empty, check calcBasis
  if (
    basis.includes('bom') ||
    basis.includes('batch') ||
    basis.includes('total') ||
    basis === 'fixed' ||
    basis === 'lump sum'
  ) {
    return true;
  }

  return false;
}

export function calculateCosting({
  materialCost = 0,
  additionalCosts = [],
  batchQty = 1,
  batchUnit = 'Pcs',
  conversionFactor = 400,
  pricing
}: {
  materialCost?: number;
  additionalCosts?: AdditionalCostRow[];
  batchQty?: number;
  batchUnit?: string;
  conversionFactor?: number;
  pricing?: ProfitPricingState;
}) {
  const factor = Number(conversionFactor) > 0 ? Number(conversionFactor) : 400;
  const isYieldGbl = (batchUnit || '').toUpperCase().includes('GBL');
  const validBatchQty = Number(batchQty) > 0 ? Number(batchQty) : 1;
  const batchPcs = isYieldGbl ? validBatchQty * factor : validBatchQty;
  const batchGbl = isYieldGbl ? validBatchQty : (validBatchQty / factor);

  const totalAdditionalCost = (additionalCosts || []).reduce((sum, cost) => {
    const amt = Number(cost.amount) || 0;
    const basis = (cost.calcBasis || cost.basis || '').toLowerCase().trim();
    const applied = (cost.appliedAs || '').toLowerCase().trim();

    // 1. If appliedAs is explicitly unit-based
    if (applied.includes('(pcs)')) {
      return sum + (amt * batchPcs);
    }
    if (applied.includes('(gbl)')) {
      return sum + (amt * batchGbl);
    }

    // 2. Batch / Total / Fixed / BOM: apply ONCE to the entire batch, do NOT scale by output pieces!
    if (isBatchOrTotalCost(cost)) {
      return sum + amt;
    }

    // 3. Fallback based on calcBasis if appliedAs was not explicitly unit-based
    if (basis === 'per gbl') {
      return sum + (amt * batchGbl);
    }
    if (basis === 'per piece') {
      return sum + (amt * batchPcs);
    }
    return sum + amt;
  }, 0);

  const totalProductionCost = (materialCost || 0) + totalAdditionalCost;
  const costPerPcs = batchPcs > 0 ? totalProductionCost / batchPcs : 0;
  const costPerGbl = costPerPcs * factor;

  const markupPct = Number(pricing?.markupPercentage) || 0;
  let suggestedPricePcs = 0;
  if (markupPct > 0) {
    if (pricing?.pricingMethod === 'Margin %') {
      suggestedPricePcs = markupPct < 100 ? costPerPcs / (1 - markupPct / 100) : costPerPcs;
    } else {
      // Default: Markup %
      suggestedPricePcs = costPerPcs * (1 + markupPct / 100);
    }
  } else {
    suggestedPricePcs = costPerPcs;
  }
  const suggestedPriceGbl = suggestedPricePcs * factor;

  return {
    materialCost,
    additionalCostsTotal: totalAdditionalCost,
    totalProductionCost,
    batchPcs,
    batchGbl,
    costPerPcs: Math.round(costPerPcs * 100) / 100,
    costPerGbl: Math.round(costPerGbl * 100) / 100,
    suggestedPricePcs: Math.round(suggestedPricePcs * 100) / 100,
    suggestedPriceGbl: Math.round(suggestedPriceGbl * 100) / 100,
    conversionFactor: factor
  };
}

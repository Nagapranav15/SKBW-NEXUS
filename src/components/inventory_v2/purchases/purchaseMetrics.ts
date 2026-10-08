import { SkuV2 } from '../../../api/mfgApiV2';

export const getFallbackReamWeight = (
  sku: any,
  customSheets?: number,
  customWidth?: number,
  customLength?: number,
  customGsm?: number
): number => {
  const gsm = customGsm || Number(sku?.gsm) || 0;
  const w = customWidth || Number(sku?.dimensions?.width) || Number(sku?.width) || 0;
  const l = customLength || Number(sku?.dimensions?.length) || Number(sku?.length) || 0;

  const stdSheets = customSheets || Number(sku?.pages) || Number(sku?.sheetsPerReam) || Number(sku?.standardSheets) || 500;
  if (gsm > 0 && w > 0 && l > 0) {
    return (w * l * gsm * stdSheets) / 10000000;
  }
  return 0;
};

export interface ItemMetricsResult {
  paperType: string;
  isSheets: boolean;
  isReels: boolean;
  isFg: boolean;
  reelsCount: number;
  reams: number;
  sheets: number;
  gbl: number;
  kgWeight: number;
  reamWeight: number;
  stdSheets: number;
  stdPcsPerGbl: number;
  unit: string;
}

export const getItemMetrics = (
  item: any,
  skus: SkuV2[] | Map<string, SkuV2> | any
): ItemMetricsResult => {
  const resolvedSku = typeof item?.skuId === 'object' && item?.skuId !== null ? (item.skuId as any) : null;
  const skuIdStr = resolvedSku?._id || (typeof item?.skuId === 'string' ? item.skuId : '');
  const fullSku = (skus instanceof Map ? skus.get(skuIdStr) : Array.isArray(skus) ? skus.find((s: any) => s._id === skuIdStr) : null) || resolvedSku;
  
  const paperType = resolvedSku?.paperType || fullSku?.paperType || (item?.reels && item.reels.length > 0 ? 'Reels' : 'None');
  const rawQty = Number(item?.quantity) || 0;
  const unit = String(item?.unit || fullSku?.unit || resolvedSku?.unit || '').trim().toUpperCase();

  const stdSheets = Number(item?.sheetsPerReam) || Number(resolvedSku?.pages) || Number(fullSku?.pages) || Number(resolvedSku?.sheetsPerReam) || Number(fullSku?.sheetsPerReam) || Number(resolvedSku?.standardSheets) || Number(fullSku?.standardSheets) || 500;
  const stdPcsPerGbl = Number(item?.pcsPerGbl) || Number(resolvedSku?.altUnitConversion) || Number(fullSku?.altUnitConversion) || Number(resolvedSku?.pcsPerGbl) || Number(fullSku?.pcsPerGbl) || 100;
  
  const reamWeight = Number(item?.reamWeight) || Number(resolvedSku?.reamWeight) || Number(fullSku?.reamWeight) || getFallbackReamWeight(fullSku || resolvedSku, stdSheets, Number(item?.width), Number(item?.length), Number(item?.gsm)) || 0;

  const isSheets = paperType === 'Sheets';
  const isReels = paperType === 'Reels' || (item?.reels && item.reels.length > 0) || Number(item?.reelsCount) > 0;
  const isFg = !isSheets && !isReels && ((resolvedSku?.category === 'products') || (fullSku?.category === 'products') || unit === 'GBL' || unit === 'PCS');

  if (isSheets) {
    let reams = 0;
    let sheets = 0;
    let gbl = 0;
    let kg = 0;

    if (unit === 'GBL') {
      gbl = rawQty;
      sheets = rawQty * stdPcsPerGbl;
      reams = stdSheets > 0 ? sheets / stdSheets : 0;
      kg = reams * reamWeight;
    } else if (unit === 'REAM' || unit === 'REAMS') {
      reams = rawQty;
      sheets = rawQty * stdSheets;
      gbl = stdPcsPerGbl > 0 ? sheets / stdPcsPerGbl : 0;
      kg = reams * reamWeight;
    } else if (unit === 'KG') {
      kg = rawQty;
      reams = reamWeight > 0 ? kg / reamWeight : 0;
      sheets = reams * stdSheets;
      gbl = stdPcsPerGbl > 0 ? sheets / stdPcsPerGbl : 0;
    } else {
      sheets = rawQty;
      reams = stdSheets > 0 ? rawQty / stdSheets : 0;
      gbl = stdPcsPerGbl > 0 ? rawQty / stdPcsPerGbl : 0;
      kg = reams * reamWeight;
    }

    return {
      paperType: 'Sheets',
      isSheets: true,
      isReels: false,
      isFg: false,
      reelsCount: 0,
      reams,
      sheets,
      gbl,
      kgWeight: kg,
      reamWeight,
      stdSheets,
      stdPcsPerGbl,
      unit
    };
  }

  if (isReels) {
    let reelsCount = 0;
    let reelsKg = 0;
    if (item?.reels && item.reels.length > 0) {
      reelsCount = item.reels.length;
      reelsKg = item.reels.reduce((s: number, r: any) => s + (Number(r.weight) || 0), 0);
    } else {
      reelsCount = Number(item?.reelsCount) || 1;
      reelsKg = rawQty;
    }

    return {
      paperType: 'Reels',
      isSheets: false,
      isReels: true,
      isFg: false,
      reelsCount,
      reams: 0,
      sheets: 0,
      gbl: 0,
      kgWeight: reelsKg > 0 ? reelsKg : rawQty,
      reamWeight: 0,
      stdSheets: 0,
      stdPcsPerGbl: 0,
      unit: 'KG'
    };
  }

  return {
    paperType: paperType || 'None',
    isSheets: false,
    isReels: false,
    isFg: true,
    reelsCount: 0,
    reams: 0,
    sheets: 0,
    gbl: unit === 'GBL' ? rawQty : 0,
    kgWeight: 0,
    reamWeight: 0,
    stdSheets: 0,
    stdPcsPerGbl: 0,
    unit
  };
};

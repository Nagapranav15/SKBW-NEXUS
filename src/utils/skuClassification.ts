import { SkuV2 } from '../api/mfgApiV2';

export type ItemDomainType = 'products' | 'materials' | 'semi';

export interface CategoryCardLike {
  id?: string;
  name: string;
  type: ItemDomainType;
}

/**
 * Universal Item Master classification logic.
 * 
 * Hierarchy of Authority:
 * 1. Explicit itemType / skuType saved on the SKU document
 * 2. Strict SKU Code Prefix (Item Master Authority):
 *    - FG- / FG  -> Finished Goods ('products')
 *    - RM- / RM  -> Raw Materials ('materials')
 *    - SM- / SFG / SF / SEM -> Semi-Finished Goods ('semi')
 * 3. Dynamic Category Cards configured in Categories master
 * 4. Semantic Category & Name matching (only if no prefix match)
 */
export function getItemClassification(
  sku?: SkuV2 | null,
  categoriesData?: CategoryCardLike[]
): ItemDomainType {
  if (!sku) return 'products';

  // 1. Explicit itemType or skuType on the document
  const rawItemType = ((sku as any).itemType || '').toLowerCase().trim();
  if (rawItemType === 'products' || rawItemType === 'finished' || rawItemType === 'finished goods') {
    return 'products';
  }
  if (rawItemType === 'materials' || rawItemType === 'raw' || rawItemType === 'raw materials' || rawItemType === 'raw material') {
    return 'materials';
  }
  if (rawItemType === 'semi' || rawItemType === 'semi finished' || rawItemType === 'semi finished goods' || rawItemType === 'semi goods') {
    return 'semi';
  }

  const code = (sku.skuCode || '').toUpperCase().trim();
  const cat = (sku.category || sku.group || '').toLowerCase().trim();

  // 2. Strict SKU Code Prefix (Authoritative in Item Master)
  // Finished Goods ALWAYS begin with FG (e.g. FG-001, FG-556)
  if (code.startsWith('FG-') || code.startsWith('FG')) {
    return 'products';
  }

  // Raw Materials ALWAYS begin with RM (e.g. RM-001, RM-013)
  if (code.startsWith('RM-') || code.startsWith('RM')) {
    return 'materials';
  }

  // Semi-Finished Goods ALWAYS begin with SM, SFG, SF, SEM (e.g. SM-001, SFG-01)
  if (
    code.startsWith('SM-') || 
    code.startsWith('SM') || 
    code.startsWith('SFG-') || 
    code.startsWith('SFG') || 
    code.startsWith('SF-') || 
    code.startsWith('SEM-') || 
    code.startsWith('SEM')
  ) {
    return 'semi';
  }

  // 3. Dynamic Category Match from Item Master Categories
  if (categoriesData && categoriesData.length > 0) {
    const matched = categoriesData.find(c => c.name.toLowerCase().trim() === cat);
    if (matched && matched.type) {
      return matched.type;
    }
  }

  // 4. Exact Category Matches
  if (
    cat === 'finished goods' || 
    cat === 'products' || 
    cat === 'finished'
  ) {
    return 'products';
  }

  if (
    cat === 'raw material' || 
    cat === 'raw materials' || 
    cat === 'materials' || 
    cat === 'reel' || 
    cat === 'reels'
  ) {
    return 'materials';
  }

  if (
    cat === 'semi finished' || 
    cat === 'semi finished goods' || 
    cat === 'semi goods' || 
    cat === 'wip' || 
    cat.includes('sub-assembly')
  ) {
    return 'semi';
  }

  // 5. Semantic Fallbacks (only when SKU Code prefix is unassigned)
  if (cat.includes('semi') || cat.includes('wip')) {
    return 'semi';
  }
  if (cat.includes('raw') || cat.includes('material')) {
    return 'materials';
  }

  // Default fallback for catalog products
  return 'products';
}

export function isFinishedGoods(sku?: SkuV2 | null): boolean {
  return getItemClassification(sku) === 'products';
}

export function isRawMaterial(sku?: SkuV2 | null): boolean {
  return getItemClassification(sku) === 'materials';
}

export function isSemiFinished(sku?: SkuV2 | null): boolean {
  return getItemClassification(sku) === 'semi';
}

export function getItemDomainLabel(type: ItemDomainType): string {
  switch (type) {
    case 'products':
      return 'Finished Goods';
    case 'materials':
      return 'Raw Materials';
    case 'semi':
      return 'Semi Finished';
  }
}

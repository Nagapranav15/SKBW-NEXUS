import api from './axios';

export interface SkuV2 {
  _id?: string;
  skuCode: string;
  name: string;
  category: string;
  paperType?: 'Reels' | 'Sheets' | 'Board' | 'None';
  unit: string;
  gsm?: number;
  width?: number;
  length?: number;
  brand?: string;
  title?: string;
  group?: string;
  ruleType?: string;
  pages?: number;
  reamWeight?: number;
  booksGbl?: number;
  openingStock?: number;
  presentStock?: number;
  minStockLevel?: number;
  altUnit?: string;
  altUnitConversion?: number;
  altUnitDirection?: 'PRIMARY_TO_ALT' | 'ALT_TO_PRIMARY';
  status: 'Active' | 'Inactive';
  bomItems?: any[];
  recipeYieldQty?: number;
  recipeYieldUnit?: string;
  batchYieldQty?: number;
  batchYieldUnit?: string;
  processSteps?: any[];
  preferredVendor?: string;
  company?: string | any;
  initialLocationId?: string;
  initialLocation?: any;
  defaultLocation?: string;
  isDeleted?: boolean;
  createdAt?: string;
}

export interface WarehouseLocationV2 {
  _id?: string;
  name: string;
  level: 'Factory' | 'Floor' | 'Zone' | 'Storage Location';
  parentId: string | null;
  capacity?: number;
  unit?: string;
  occupiedPercent?: number;
  status: 'Active' | 'Maintenance' | 'Full';
  createdAt?: string;
}

export interface LedgerReelV2 {
  reelNumber: string;
  gsm: number;
  width: number;
  weight: number;
}

export interface LedgerEntryV2 {
  _id: string;
  timestamp: string;
  transactionType: string;
  referenceId: string;
  skuId: SkuV2;
  locationId: WarehouseLocationV2;
  qtyIn: number;
  qtyOut: number;
  balanceAfter: number;
  batchNumber?: string;
  reels?: LedgerReelV2[];
  remarks: string;
  createdAt?: string;
  userId: {
    _id: string;
    fullName: string;
    email: string;
  };
}

// ── SKU API ──────────────────────────────────────────────────────────────────

export const getSkusV2 = async (companyId: string, category?: string, search?: string, status?: string, showDeleted?: boolean): Promise<SkuV2[]> => {
  const response = await api.get('/v2/skus', {
    params: { companyId, category, search, status, showDeleted }
  });
  return response.data;
};

export const createSkuV2 = async (skuData: any): Promise<SkuV2> => {
  const response = await api.post('/v2/skus', skuData);
  return response.data;
};

export const updateSkuV2 = async (id: string, skuData: any): Promise<SkuV2> => {
  const response = await api.put(`/v2/skus/${id}`, skuData);
  return response.data;
};

export const deleteSkuV2 = async (id: string, companyId: string, permanent?: boolean): Promise<any> => {
  const response = await api.delete(`/v2/skus/${id}`, {
    params: { companyId, permanent }
  });
  return response.data;
};

export const restoreSkuV2 = async (id: string, companyId?: string): Promise<any> => {
  const response = await api.post(`/v2/skus/${id}/restore`, { companyId });
  return response.data;
};

export const clearRecycleBinV2 = async (companyId: string): Promise<any> => {
  const response = await api.post('/v2/skus/recycle-bin/clear', { companyId });
  return response.data;
};

export const bulkDeleteSkusV2 = async (ids: string[], companyId: string): Promise<any> => {
  const response = await api.post('/v2/skus/bulk-delete', { ids, companyId });
  return response.data;
};

export const bulkUpdateSkusV2 = async (ids: string[], companyId: string, updates: any): Promise<any> => {
  const response = await api.post('/v2/skus/bulk-update', { ids, companyId, updates });
  return response.data;
};

export const bulkImportSkusV2 = async (skus: any[], company: string): Promise<any> => {
  const response = await api.post('/v2/skus/bulk-import', { skus, company });
  return response.data;
};

export const getNextSkuCodeV2 = async (companyId: string, prefix: string): Promise<{ nextCode: string; nextSequence: number; prefix: string }> => {
  const response = await api.get('/v2/skus/next-code', {
    params: { companyId, prefix }
  });
  return response.data;
};

// ── WAREHOUSE API ─────────────────────────────────────────────────────────────

export const getWarehouseHierarchyV2 = async (companyId: string): Promise<WarehouseLocationV2[]> => {
  const response = await api.get('/v2/warehouse/hierarchy', {
    params: { companyId }
  });
  return response.data;
};

export const createWarehouseLocationV2 = async (locationData: any): Promise<WarehouseLocationV2> => {
  const response = await api.post('/v2/warehouse/locations', locationData);
  return response.data;
};

export const updateWarehouseLocationV2 = async (id: string, locationData: any): Promise<WarehouseLocationV2> => {
  const response = await api.put(`/v2/warehouse/locations/${id}`, locationData);
  return response.data;
};

export const deleteWarehouseLocationV2 = async (id: string, companyId: string, cascade: boolean = false): Promise<any> => {
  const response = await api.delete(`/v2/warehouse/locations/${id}`, {
    params: { companyId, cascade: cascade ? 'true' : 'false' }
  });
  return response.data;
};

export const getLocationDetailsV2 = async (id: string, companyId: string): Promise<{
  location: WarehouseLocationV2;
  storedSkus: { sku: SkuV2; quantity: number }[];
  recentMovements: LedgerEntryV2[];
  totalQty: number;
}> => {
  const response = await api.get(`/v2/warehouse/locations/${id}`, {
    params: { companyId }
  });
  return response.data;
};

// ── LEDGER API ────────────────────────────────────────────────────────────────

export const getLedgerV2 = async (params: {
  companyId: string;
  skuId?: string;
  locationId?: string;
  transactionType?: string;
  excludeType?: string;
  batchNumber?: string;
  startDate?: string;
  endDate?: string;
}): Promise<LedgerEntryV2[]> => {
  const response = await api.get('/v2/ledger', { params });
  return response.data;
};

export const recordTransferV2 = async (transferData: {
  skuId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  remarks?: string;
  company: string;
  batchNumber?: string;
  reels?: any[];
}): Promise<any> => {
  const response = await api.post('/v2/ledger/transfer', transferData);
  return response.data;
};

export const createInventoryLedgerEntryV2 = async (entryData: {
  transactionType: string;
  skuId: string;
  quantity: number;
  unit: string;
  direction: 'IN' | 'OUT';
  referenceType: string;
  referenceId: string;
  locationId: string;
  remarks?: string;
  status?: string;
  company: string;
  batchNumber?: string;
}): Promise<any> => {
  const response = await api.post('/v2/inventory-ledger', entryData);
  return response.data;
};

// ── BALANCES API ─────────────────────────────────────────────────────────────

export const getBalancesV2 = async (
  companyId: string,
  category?: string,
  groupByBatch?: boolean,
  skuId?: string,
  batchNumber?: string
): Promise<any[]> => {
  const response = await api.get('/v2/balances', {
    params: { companyId, category, groupByBatch, skuId, batchNumber }
  });
  return response.data;
};

// ── DASHBOARD API ────────────────────────────────────────────────────────────

export const getDashboardStatsV2 = async (companyId: string): Promise<{
  totalSkus: number;
  rawMaterialStock: number;
  semiFinishedStock: number;
  finishedGoodsStock: number;
  inventoryValue: number;
  recentTransactions: LedgerEntryV2[];
  lowStockAlerts: {
    skuCode: string;
    name: string;
    category: string;
    onHand: number;
    unit: string;
  }[];
  categoryDistribution: { category: string; percentage: number }[];
}> => {
  const response = await api.get('/v2/dashboard', {
    params: { companyId }
  });
  return response.data;
};

export interface MetadataV2 {
  _id?: string;
  company: string;
  units: string[];
  categories: string[];
  ruleTypes: string[];
  groups?: string[];
  brands?: string[];
  categoryCards?: any[];
  categoryFields?: Record<string, string[]>;
  standardizedSheets?: { id: string; name: string; w: string; l: string }[];
}

export const getMetadataV2 = async (companyId: string): Promise<MetadataV2> => {
  const response = await api.get('/v2/metadata', {
    params: { companyId }
  });
  return response.data;
};

export const updateMetadataV2 = async (metadataData: {
  companyId: string;
  units?: string[];
  categories?: string[];
  ruleTypes?: string[];
  groups?: string[];
  brands?: string[];
  categoryCards?: any[];
  categoryFields?: Record<string, string[]>;
  standardizedSheets?: { id: string; name: string; w: string; l: string }[];
}): Promise<MetadataV2> => {
  const response = await api.post('/v2/metadata', metadataData);
  return response.data;
};

export const getNextInvoiceNumberV2 = async (companyId: string): Promise<string> => {
  const response = await api.get('/v2/purchases/next-number', {
    params: { companyId }
  });
  return response.data.nextInvoiceNumber;
};

export const renumberSkusV2 = async (companyId: string): Promise<{ msg: string; updatedCount: number }> => {
  const response = await api.post('/v2/skus/renumber', { companyId });
  return response.data;
};

export interface SkuStockDetailsResponse {
  sku: SkuV2;
  summary: {
    onHand: number;
    reserved: number;
    available: number;
    inProcess: number;
    stockValue: number;
    avgRate?: number;
    pcsEquivalent: number | null;
    primaryUnit: string;
    altUnit: string;
    altUnitConversion: number;
  };
  locations: {
    locationId: string;
    locationName: string;
    locationCode: string;
    zoneName: string;
    floorName: string;
    warehouseName: string;
    hierarchyPath: string;
    onHand: number;
    reserved: number;
    available: number;
    unitCost: number;
    stockValue: number;
  }[];
  hierarchyTree?: any[];
  batches: {
    id?: string;
    batchNumber: string;
    reference?: string;
    locationId?: string;
    locationName: string;
    shortLocPath?: string;
    receivedQty: number;
    remainingQty: number;
    rate: number;
    value: number;
    supplier: string;
    source?: string;
    date: string;
    status?: string;
  }[];
  movements: {
    id: string;
    index?: number;
    timestamp: string;
    transactionType: string;
    direction: 'IN' | 'OUT';
    referenceType?: string;
    referenceId?: string;
    fromLocation?: string;
    toLocation?: string;
    locationName?: string;
    qtyIn: number;
    qtyOut: number;
    quantity: number;
    runningBalance?: number;
    batchNumber?: string;
    remarks?: string;
    userName?: string;
  }[];
  reservations: {
    id?: string;
    orderId: string;
    orderNumber: string;
    orderDate?: string;
    requiredDate?: string;
    daysLeftText?: string;
    isOverdue?: boolean;
    customerName: string;
    orderedQty: number;
    reservedQty: number;
    pendingQty?: number;
    dispatchedQty: number;
    status: string;
  }[];
}

export interface StockAdjustmentPayload {
  company: string;
  skuId: string;
  locationId: string;
  adjustmentType: string;
  adjustmentQty: number;
  reason: string;
  remarks?: string;
  batchNumber?: string;
}

export const getSkuStockDetailsV2 = async (skuId: string, companyId: string): Promise<SkuStockDetailsResponse> => {
  const response = await api.get(`/v2/skus/${skuId}/stock-details`, {
    params: { companyId }
  });
  return response.data;
};

export const recordStockAdjustmentV2 = async (payload: StockAdjustmentPayload): Promise<any> => {
  const response = await api.post('/v2/ledger/adjustment', payload);
  return response.data;
};


import api from './axios';

export interface SkuV2 {
  _id?: string;
  skuCode: string;
  name: string;
  category: string;
  paperType?: 'Reels' | 'Sheets' | 'None';
  unit: string;
  gsm?: number;
  width?: number;
  length?: number;
  brand?: string;
  title?: string;
  group?: string;
  ruleType?: string;
  altUnit?: string;
  altUnitConversion?: number;
  status: 'Active' | 'Inactive';
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
  remarks: string;
  userId: {
    _id: string;
    fullName: string;
    email: string;
  };
}

// ── SKU API ──────────────────────────────────────────────────────────────────

export const getSkusV2 = async (companyId: string, category?: string, search?: string, status?: string): Promise<SkuV2[]> => {
  const response = await api.get('/v2/skus', {
    params: { companyId, category, search, status }
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

export const deleteSkuV2 = async (id: string, companyId: string): Promise<any> => {
  const response = await api.delete(`/v2/skus/${id}`, {
    params: { companyId }
  });
  return response.data;
};

export const bulkImportSkusV2 = async (skus: any[], company: string): Promise<any> => {
  const response = await api.post('/v2/skus/bulk-import', { skus, company });
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

export const deleteWarehouseLocationV2 = async (id: string, companyId: string): Promise<any> => {
  const response = await api.delete(`/v2/warehouse/locations/${id}`, {
    params: { companyId }
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
}): Promise<any> => {
  const response = await api.post('/v2/ledger/transfer', transferData);
  return response.data;
};

// ── BALANCES API ─────────────────────────────────────────────────────────────

export const getBalancesV2 = async (companyId: string, category?: string, groupByBatch?: boolean): Promise<any[]> => {
  const response = await api.get('/v2/balances', {
    params: { companyId, category, groupByBatch }
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
}

export const getMetadataV2 = async (companyId: string): Promise<MetadataV2> => {
  const response = await api.get('/v2/metadata', {
    params: { companyId }
  });
  return response.data;
};

export const updateMetadataV2 = async (metadataData: { companyId: string; units?: string[]; categories?: string[]; ruleTypes?: string[] }): Promise<MetadataV2> => {
  const response = await api.post('/v2/metadata', metadataData);
  return response.data;
};

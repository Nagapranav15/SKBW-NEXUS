import api from './axios';

// Inventory Balances
export const getInventoryBalances = (params?: any) =>
  api.get('/inventory/balances', { params });

// Dashboard Summary
export const getInventoryDashboardSummary = (companyId?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  return api.get('/inventory/dashboard-summary', { params });
};

// Low Stock
export const getLowStockItems = (companyId?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  return api.get('/inventory/low-stock', { params });
};

// Audit Logs
export const getAuditLogs = (params?: any) =>
  api.get('/inventory/audit-logs', { params });

// Opening Stock
export const recordOpeningStock = (data: any) =>
  api.post('/inventory/opening-stock', data);

// Bulk Adjustment
export const bulkAdjustment = (data: any) =>
  api.post('/inventory/bulk-adjustment', data);

// Min Stock Levels
export const setMinimumStockLevel = (data: any) =>
  api.post('/inventory/min-stock-level', data);

export const getMinimumStockLevels = (companyId?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  return api.get('/inventory/min-stock-levels', { params });
};

// CSV Export
export const exportInventory = (companyId?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  return api.get('/inventory/export', { params });
};

// CSV Import
export const importInventory = (data: any) =>
  api.post('/inventory/import', data);

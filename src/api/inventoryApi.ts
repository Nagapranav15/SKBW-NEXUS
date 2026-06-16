import api from './axios';

// Warehouses
export const getWarehouses = (companyId?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  return api.get('/warehouses', { params });
};
export const getWarehouseById = (id: string) => api.get(`/warehouses/${id}`);
export const createWarehouse = (data: any) => api.post('/warehouses', data);
export const updateWarehouse = (id: string, data: any) => api.put(`/warehouses/${id}`, data);
export const deleteWarehouse = (id: string) => api.delete(`/warehouses/${id}`);

// Inventory
export const getInventorySummary = (companyId?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  return api.get('/inventory/summary', { params });
};
export const getInventoryByWarehouse = (warehouseId: string) =>
  api.get(`/inventory/warehouse/${warehouseId}`);
export const getInventoryByItem = (itemId: string) =>
  api.get(`/inventory/item/${itemId}`);
export const addStock = (data: any) => api.post('/inventory', data);
export const updateStock = (id: string, quantity: number) =>
  api.put(`/inventory/${id}`, { quantity });
export const removeStock = (id: string) => api.delete(`/inventory/${id}`);
export const transferStock = (id: string, targetWarehouse: string, targetSectionId: string, quantity: number) =>
  api.post(`/inventory/${id}/transfer`, { targetWarehouse, targetSectionId, quantity });

// Stock movement audit trail
export const getStockMovements = (itemId: string, companyId?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  return api.get(`/inventory/stock-movements/${itemId}`, { params });
};

export const getAllStockMovements = (companyId?: string, options?: any) => {
  const params: any = { ...options };
  if (companyId) params.companyId = companyId;
  return api.get('/inventory/stock-movements/all', { params });
};

import api from './axios';

const MFG = '/mfg';

// Factories
export const getFactories = (companyId?: string) => api.get(`${MFG}/factories`, { params: { companyId } });
export const createFactory = (data: any) => api.post(`${MFG}/factories`, data);
export const updateFactory = (id: string, data: any) => api.put(`${MFG}/factories/${id}`, data);
export const deleteFactory = (id: string) => api.delete(`${MFG}/factories/${id}`);

// Floors
export const getFloors = (companyId?: string, factoryId?: string) => api.get(`${MFG}/floors`, { params: { companyId, factoryId } });
export const createFloor = (data: any) => api.post(`${MFG}/floors`, data);
export const updateFloor = (id: string, data: any) => api.put(`${MFG}/floors/${id}`, data);
export const deleteFloor = (id: string) => api.delete(`${MFG}/floors/${id}`);

// Zones
export const getZones = (companyId?: string, floorId?: string, factoryId?: string) => api.get(`${MFG}/zones`, { params: { companyId, floorId, factoryId } });
export const createZone = (data: any) => api.post(`${MFG}/zones`, data);
export const updateZone = (id: string, data: any) => api.put(`${MFG}/zones/${id}`, data);
export const deleteZone = (id: string) => api.delete(`${MFG}/zones/${id}`);

// SKUs
export const getSkus = (companyId?: string, category?: string) => api.get(`${MFG}/skus`, { params: { companyId, category } });
export const createSku = (data: any) => api.post(`${MFG}/skus`, data);
export const updateSku = (id: string, data: any) => api.put(`${MFG}/skus/${id}`, data);
export const deleteSku = (id: string) => api.delete(`${MFG}/skus/${id}`);

// Movements
export const getMovements = (params?: any) => api.get(`${MFG}/movements`, { params });
export const recordMovement = (data: any) => api.post(`${MFG}/movements`, data);

// Stock (computed)
export const getStock = (companyId?: string) => api.get(`${MFG}/stock`, { params: { companyId } });
export const getZonesWithStock = (companyId?: string) => api.get(`${MFG}/zones-stock`, { params: { companyId } });
export const getZoneStock = (zoneId: string, companyId?: string) => api.get(`${MFG}/zones/${zoneId}/stock`, { params: { companyId } });
export const getZoneMovements = (zoneId: string, companyId?: string, limit?: number) => api.get(`${MFG}/zones/${zoneId}/movements`, { params: { companyId, limit } });
export const getDashboardStats = (companyId?: string) => api.get(`${MFG}/dashboard-stats`, { params: { companyId } });
export const getAnalytics = (companyId?: string, days?: number) => api.get(`${MFG}/analytics`, { params: { companyId, days } });

// BOM
export const getBoms = (companyId?: string) => api.get(`${MFG}/boms`, { params: { companyId } });
export const createBom = (data: any) => api.post(`${MFG}/boms`, data);
export const updateBom = (id: string, data: any) => api.put(`${MFG}/boms/${id}`, data);
export const deleteBom = (id: string) => api.delete(`${MFG}/boms/${id}`);
export const executeBom = (data: any) => api.post(`${MFG}/boms/execute`, data);

// Location Management
export const renameLocation = (zoneId: string, oldName: string, newName: string) => api.put(`${MFG}/zones/${zoneId}/locations/rename`, { oldName, newName });
export const transferLocation = (zoneId: string, data: { sourceLocation: string; targetZoneId: string; targetLocation: string }) => api.post(`${MFG}/zones/${zoneId}/locations/transfer`, data);
export const deleteLocation = (zoneId: string, locationName: string) => api.delete(`${MFG}/zones/${zoneId}/locations`, { params: { location_name: locationName } });

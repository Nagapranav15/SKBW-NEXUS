import api from './axios';

export const getRoutes = (company?: string, params?: { status?: string; sortBy?: string; sortOrder?: string }) => {
  const queryParams: any = {};
  if (company) queryParams.company = company;
  if (params) {
    Object.assign(queryParams, params);
  }
  return api.get('/routes', { params: queryParams });
};

export const createRoute = (data: any) => api.post('/routes', data);
export const updateRoute = (id: string, data: any) => api.put(`/routes/${id}`, data);
export const deleteRoute = (id: string) => api.delete(`/routes/${id}`);
export const bulkDeleteRoutes = (ids: string[]) => api.post('/routes/bulk-delete', { ids });
export const getDeletedRoutes = (company: string) => api.get('/routes/deleted', { params: { company } });
export const restoreRoute = (id: string) => api.post(`/routes/${id}/restore`);
export const permanentlyDeleteRoute = (id: string) => api.delete(`/routes/${id}/permanent`);


import api from './axios';

export const getItems = (companyId?: string, category?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  if (category) params.category = category;
  return api.get('/items', { params });
};
export const getItemById = (id: string) => api.get(`/items/${id}`);
export const createItem = (data: any) => api.post('/items', data);
export const updateItem = (id: string, data: any) => api.put(`/items/${id}`, data);
export const deleteItem = (id: string) => api.delete(`/items/${id}`);

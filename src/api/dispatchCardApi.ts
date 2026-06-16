import api from './axios';

export const getDispatchCards = (companyId?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  return api.get('/dispatch-cards', { params });
};
export const getDispatchCardById = (id: string) => api.get(`/dispatch-cards/${id}`);
export const createDispatchCard = (data: any) => api.post('/dispatch-cards', data);
export const updateDispatchCard = (id: string, data: any) => api.put(`/dispatch-cards/${id}`, data);
export const deleteDispatchCard = (id: string) => api.delete(`/dispatch-cards/${id}`);

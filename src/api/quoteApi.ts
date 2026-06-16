import api from './axios';

export const getQuotes = (companyId?: string, status?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  if (status) params.status = status;
  return api.get('/quotes', { params });
};
export const getQuoteById = (id: string) => api.get(`/quotes/${id}`);
export const createQuote = (data: any) => api.post('/quotes', data);
export const updateQuote = (id: string, data: any) => api.put(`/quotes/${id}`, data);
export const updateQuoteStatus = (id: string, status: string) => api.patch(`/quotes/${id}/status`, { status });
export const deleteQuote = (id: string) => api.delete(`/quotes/${id}`);

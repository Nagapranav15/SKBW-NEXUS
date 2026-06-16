import api from './axios';

export const getSalesOrders = (companyId?: string, status?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  if (status) params.status = status;
  return api.get('/sales-orders', { params });
};
export const getPendingOrders = (companyId?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  return api.get('/sales-orders/pending', { params });
};
export const getSalesOrderById = (id: string) => api.get(`/sales-orders/${id}`);
export const createSalesOrder = (data: any) => api.post('/sales-orders', data);
export const updateSalesOrder = (id: string, data: any) => api.put(`/sales-orders/${id}`, data);
export const updateSalesOrderStatus = (id: string, status: string) => api.patch(`/sales-orders/${id}/status`, { status });
export const deleteSalesOrder = (id: string) => api.delete(`/sales-orders/${id}`);

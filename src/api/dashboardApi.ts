import api from './axios';

export const getDashboardStats = (companyId?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  return api.get('/dashboard/stats', { params });
};

export const getSalesReport = (companyId?: string, startDate?: string, endDate?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  return api.get('/dashboard/reports', { params });
};

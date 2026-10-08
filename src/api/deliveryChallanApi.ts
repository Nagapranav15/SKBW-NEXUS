import api from './axios';

export const getDeliveryChallans = (companyId?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  return api.get('/delivery-challans', { params });
};
export const getNextDeliveryChallanNumber = async (companyId?: string): Promise<string> => {
  try {
    const params: any = {};
    if (companyId) params.companyId = companyId;
    const res = await api.get('/delivery-challans/next-number', { params });
    return res.data?.dcNumber || 'DO-001';
  } catch (e) {
    return 'DO-001';
  }
};
export const getDeliveryChallanById = (id: string) => api.get(`/delivery-challans/${id}`);
export const createDeliveryChallan = (data: any) => api.post('/delivery-challans', data);
export const updateDeliveryChallan = (id: string, data: any) => api.put(`/delivery-challans/${id}`, data);
export const deleteDeliveryChallan = (id: string) => api.delete(`/delivery-challans/${id}`);

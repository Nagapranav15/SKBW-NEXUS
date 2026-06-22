import api from './axios';

export const getParties = (params?: { type?: string; status?: string; search?: string; page?: number; limit?: number; company?: string; light?: boolean }) => {
  return api.get('/parties', { params });
};

export const getPartyStats = (type?: string, companyId?: string) => {
  const params: any = {};
  if (type) params.type = type;
  if (companyId) params.company = companyId;
  return api.get('/parties/stats', { params });
};

export const getPartyById = (id: string) => api.get(`/parties/${id}`);
export const createParty = (data: any) => api.post('/parties', data);
export const updateParty = (id: string, data: any) => api.put(`/parties/${id}`, data);
export const deleteParty = (id: string) => api.delete(`/parties/${id}`);
export const importParties = (parties: any[]) => api.post('/parties/import', { parties });
export const bulkDeleteParties = (ids: string[]) => api.post('/parties/bulk-delete', { ids });
export const mergeParties = (primaryId: string, duplicateId: string) => api.post('/parties/merge', { primaryId, duplicateId });
export const getDeletedParties = (company: string, type?: string) => api.get('/parties/deleted', { params: { company, type } });
export const restoreParty = (id: string) => api.post(`/parties/${id}/restore`);
export const permanentlyDeleteParty = (id: string) => api.delete(`/parties/${id}/permanent`);



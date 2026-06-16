import api from './axios';

export const getCompanies = () => api.get('/companies');
export const getCompanyById = (id: string) => api.get(`/companies/${id}`);
export const createCompany = (data: any) => api.post('/companies', data);
export const updateCompany = (id: string, data: any) => api.put(`/companies/${id}`, data);
export const deleteCompany = (id: string) => api.delete(`/companies/${id}`);

import api from './axios';

// CRUD
export const getTransactions = (params: any) => api.get('/transactions', { params });
export const getTransactionById = (id: string) => api.get(`/transactions/${id}`);
export const createTransaction = (data: any) => api.post('/transactions', data);
export const updateTransaction = (id: string, data: any) => api.put(`/transactions/${id}`, data);
export const deleteTransaction = (id: string) => api.delete(`/transactions/${id}`);

// Analytics
export const getAnalytics = (params: any) => api.get('/transactions/analytics', { params });

// Export daily
export const exportDailyTransactions = (date: string, format: string, companyId?: string) => {
  const params: any = { date, format };
  if (companyId) params.companyId = companyId;
  return api.get('/transactions/export/daily', {
    params,
    responseType: format === 'json' ? 'json' : 'blob'
  });
};

// Export full ledger
export const exportLedger = (companyId?: string) => {
  const params: any = {};
  if (companyId) params.companyId = companyId;
  return api.get('/transactions/export/ledger', { params, responseType: 'blob' });
};

// Import preview
export const previewImport = (transactions: any[], companyId: string) =>
  api.post('/transactions/import/preview', { transactions, companyId });

// Import
export const importTransactions = (transactions: any[], companyId: string, mode: string) =>
  api.post('/transactions/import', { transactions, companyId, mode });

// Helper to download blob
export const downloadBlob = (data: Blob, fileName: string) => {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

import api from './axios';

export const getActivityLogs = (params?: { company?: string; entityType?: string; search?: string; page?: number; limit?: number }) => {
  return api.get('/activity-logs', { params });
};

export const createActivityLog = (data: { action: string; entityType: string; entityName: string; details?: string; company?: string }) => {
  return api.post('/activity-logs', data);
};

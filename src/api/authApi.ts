import api from './axios';

export const loginApi = (username: string, password: string) =>
  api.post('/auth/login', { username, password });

export const registerApi = (data: { username: string; fullName: string; email: string; password: string; roleName?: string }) =>
  api.post('/auth/register', data);

export const getMeApi = () =>
  api.get('/auth/me');

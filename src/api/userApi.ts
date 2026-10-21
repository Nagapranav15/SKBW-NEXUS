import api from './axios';

export interface ManagedUser {
  _id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  companies: string[];
  status: 'active' | 'inactive';
  lastLogin?: string | null;
}

export interface UserPayload {
  username?: string;
  fullName?: string;
  email?: string;
  password?: string;
  roleName?: string;
  companies?: string[];
  status?: 'active' | 'inactive';
}

export const getUsers = () => api.get<ManagedUser[]>('/users');
export const createUser = (data: UserPayload) => api.post('/users', data);
export const updateUser = (id: string, data: UserPayload) => api.put(`/users/${id}`, data);
export const deleteUser = (id: string) => api.delete(`/users/${id}`);

import { createContext, useContext } from 'react';

export interface User {
  _id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  permissions: string[];
  status: string;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (token: string, userData: User) => void;
  logout: () => void;
  hasPermission: (permission: string | string[]) => boolean;
  hasRole: (role: string | string[]) => boolean;
  selectedCompany: any | null;
  setSelectedCompany: (company: any) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  loading: true,
  login: () => {},
  logout: () => {},
  hasPermission: () => false,
  hasRole: () => false,
  selectedCompany: null,
  setSelectedCompany: () => {}
});

export const useAuth = () => useContext(AuthContext);

export default AuthContext;

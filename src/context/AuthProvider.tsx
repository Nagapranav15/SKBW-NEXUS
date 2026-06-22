import React, { useState, useEffect, useCallback } from 'react';
import { getMeApi } from '../api/authApi';
import { AuthContext, User } from './AuthContext';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompanyState] = useState<any | null>(() => {
    const saved = localStorage.getItem('selectedCompany');
    return saved ? JSON.parse(saved) : null;
  });

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setSelectedCompanyState(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('selectedCompany');
  }, []);

  // On mount, verify token
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await getMeApi();
        setUser(res.data);
        localStorage.setItem('user', JSON.stringify(res.data));
      } catch {
        logout();
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token, logout]);

  const login = (newToken: string, userData: User) => {
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const hasPermission = (permission: string | string[]): boolean => {
    if (!user) return false;
    // Admin has all permissions
    if (user.role === 'admin') return true;
    const perms = Array.isArray(permission) ? permission : [permission];
    return perms.some(p => user.permissions.includes(p));
  };

  const hasRole = (role: string | string[]): boolean => {
    if (!user) return false;
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(user.role);
  };

  const setSelectedCompany = (company: any) => {
    setSelectedCompanyState(company);
    if (company) {
      localStorage.setItem('selectedCompany', JSON.stringify(company));
    } else {
      localStorage.removeItem('selectedCompany');
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isAuthenticated: !!user && !!token,
      loading,
      login,
      logout,
      hasPermission,
      hasRole,
      selectedCompany,
      setSelectedCompany
    }}>
      {children}
    </AuthContext.Provider>
  );
};

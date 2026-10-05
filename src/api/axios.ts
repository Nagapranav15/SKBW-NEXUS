import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'production' ? 'https://api.skbw.in/api' : 'http://127.0.0.1:5001/api');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle network glitch retry and 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    const isNetworkError =
      !error.response &&
      (error.message === 'Network Error' ||
        error.code === 'ERR_NETWORK' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ERR_INTERNET_DISCONNECTED' ||
        error.code === 'ERR_NETWORK_CHANGED');

    // Auto-retry idempotent GET requests once after 1.2s if network was momentarily interrupted
    if (isNetworkError && config && config.method?.toLowerCase() === 'get' && !config._networkRetry) {
      config._networkRetry = true;
      await new Promise((res) => setTimeout(res, 1200));
      return api(config);
    }

    if (error.response?.status === 401) {
      if (localStorage.getItem('token') && window.location.pathname !== '/login') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

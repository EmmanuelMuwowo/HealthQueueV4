import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

const signal = (name) => window.dispatchEvent(new Event(name));

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => {
    // A response from the service worker's cache means we are offline
    signal(res.headers['x-hq-from-cache'] ? 'hq-offline' : 'hq-online');
    return res;
  },
  (err) => {
    if (!err.response) signal('hq-offline'); // no reply at all: network or server down
    else signal('hq-online');

    const isLogin = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLogin) {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('staff');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
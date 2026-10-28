import api from './api';

const KEY = 'hq-pending-registrations';

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
};
const write = (items) => {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event('hq-pending-changed'));
};

// crypto.randomUUID only exists on localhost or https, so keep a fallback
export const newRef = () =>
  (crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }));

export const getPending = () => read();

export const addPending = (item) => write([...read(), { ...item, status: 'pending', error: null }]);

export const removePending = (ref) => write(read().filter((i) => i.client_ref !== ref));

let syncing = false;

// Sends pending registrations in order. Returns the ones that synced.
export const syncPending = async () => {
  if (syncing) return [];
  syncing = true;
  const synced = [];
  try {
    for (const item of read()) {
      if (item.status !== 'pending') continue;
      const { service_point_name, status, error, ...body } = item;
      try {
        const res = await api.post('/visits', body);
        removePending(item.client_ref);
        synced.push(res.data);
      } catch (err) {
        if (!err.response || err.response.status === 401) break; // still offline, or signed out
        // Refused by the server: keep it visible with the reason
        write(read().map((i) => (i.client_ref === item.client_ref
          ? { ...i, status: 'failed', error: err.response.data?.error || 'Refused by the server' }
          : i)));
      }
    }
  } finally {
    syncing = false;
  }
  return synced;
};
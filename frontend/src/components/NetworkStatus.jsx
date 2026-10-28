import { useEffect, useState } from 'react';

export default function NetworkStatus() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    window.addEventListener('hq-offline', goOffline);
    window.addEventListener('hq-online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('hq-offline', goOffline);
      window.removeEventListener('hq-online', goOnline);
    };
  }, []);

  if (!offline) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1001,
      backgroundColor: '#1C1C1E', color: '#fff', textAlign: 'center',
      fontSize: 13, fontWeight: 600, padding: '7px 10px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      Offline: showing the last saved information. Changes cannot be saved until the connection returns.
    </div>
  );
}
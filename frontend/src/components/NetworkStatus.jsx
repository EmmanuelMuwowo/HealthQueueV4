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
    <div className="hq-offline-banner" role="status" aria-live="polite">
      <span className="hq-offline-dot" aria-hidden="true" />
      Offline. Showing the last saved information; new registrations are kept on this device.
    </div>
  );
}

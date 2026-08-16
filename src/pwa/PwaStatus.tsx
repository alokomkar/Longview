import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);

  if (!online) return <div className="system-banner" role="status">Offline — saved screens remain available.</div>;
  if (needRefresh) return <div className="system-banner" role="status">An update is ready. <button onClick={() => updateServiceWorker(true)}>Refresh</button><button className="secondary" onClick={() => setNeedRefresh(false)}>Later</button></div>;
  return null;
}

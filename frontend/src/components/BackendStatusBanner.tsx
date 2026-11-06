import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { API_URL } from '@/lib/api';

/**
 * BackendStatusBanner
 *
 * Polls the backend health endpoint and shows a non-blocking sticky banner
 * at the top of the screen when the backend is unreachable. Disappears
 * automatically the moment the server comes back online.
 *
 * Why this exists: the most common error when running this app is "I forgot
 * to start the backend." That used to surface as silent network errors,
 * empty seller lists, and a flood of WebSocket errors in the console.
 * Now we surface it as a clear, one-line message with the exact URL.
 */
const POLL_INTERVAL_MS = 5000;
const HEALTH_TIMEOUT_MS = 3000;

type Status = 'checking' | 'online' | 'offline';

export default function BackendStatusBanner() {
  const [status, setStatus] = useState<Status>('checking');
  const [justRecovered, setJustRecovered] = useState(false);
  const wasOfflineRef = useRef(false);

  const check = async () => {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
      const res = await fetch(`${API_URL}/api/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: ctrl.signal,
      });
      window.clearTimeout(timer);
      if (res.ok) {
        if (wasOfflineRef.current) {
          setJustRecovered(true);
          window.setTimeout(() => setJustRecovered(false), 3500);
        }
        wasOfflineRef.current = false;
        setStatus('online');
      } else {
        wasOfflineRef.current = true;
        setStatus('offline');
      }
    } catch {
      wasOfflineRef.current = true;
      setStatus('offline');
    }
  };

  useEffect(() => {
    check();
    const id = window.setInterval(check, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (justRecovered) {
    return (
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#059669', color: '#fff',
          padding: '8px 14px', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <CheckCircle2 size={16} /> Backend reconnected
      </div>
    );
  }

  if (status !== 'offline') return null;

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: '#dc2626', color: '#fff',
        padding: '10px 14px', fontSize: 13,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      <div
        style={{
          maxWidth: 900, margin: '0 auto', display: 'flex',
          alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}
      >
        <AlertTriangle size={18} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
            Cannot reach backend at {API_URL}
          </p>
          <p style={{ margin: '2px 0 0', opacity: 0.95, fontSize: 11.5, lineHeight: 1.4 }}>
            Start it in another terminal: <code style={{ background: 'rgba(0,0,0,0.25)', padding: '1px 5px', borderRadius: 4 }}>cd backend &amp;&amp; npm start</code>
            {' · '}or check Windows Firewall is not blocking port 5000.
          </p>
        </div>
        <button
          type="button"
          onClick={check}
          style={{
            background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)',
            color: '#fff', borderRadius: 8, padding: '6px 12px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          <RefreshCw size={13} /> Retry now
        </button>
      </div>
    </div>
  );
}

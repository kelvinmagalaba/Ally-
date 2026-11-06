import { useState } from 'react';
import { AlertCircle, LocateFixed, MapPin, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { locationService, type LocationData } from '@/services/locationService';
import { useAppStore, type DeviceGeoStatus } from '@/store/useAppStore';

interface Props {
  onLocationGranted?: (location: LocationData) => void;
  onLocationDenied?: (error: Error) => void;
  autoRequest?: boolean;
  showUI?: boolean;
}

function classify(error: unknown): DeviceGeoStatus {
  if (!window.isSecureContext && !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) return 'unavailable';
  const code = (error as GeolocationPositionError)?.code;
  if (code === 1) return 'denied';
  if (code === 2) return 'unavailable';
  if (code === 3) return 'timeout';
  return 'unavailable';
}

/** Location is requested only from the visible user-action button. */
export default function LocationPermission({ onLocationGranted, onLocationDenied, showUI = true }: Props) {
  const { user, deviceGeo, setDeviceGeo, setPage } = useAppStore();
  const [message, setMessage] = useState('');

  const request = async () => {
    if (!user.userId) return;
    if (!navigator.geolocation) {
      setDeviceGeo({ status: 'unavailable', lat: null, lng: null });
      setMessage('This device or browser does not provide location. Select a pin manually.');
      return;
    }
    setDeviceGeo({ status: 'requesting' });
    setMessage('');
    try {
      const location = await locationService.requestLocationPermission();
      const stale = Date.now() - location.timestamp > 5 * 60 * 1000;
      setDeviceGeo({ status: stale ? 'stale' : 'granted', lat: location.latitude, lng: location.longitude });
      if (!stale) await locationService.updateUserLocation(user.userId, location);
      if (stale) setMessage('The device returned an old location. Retry or select the delivery pin manually.');
      else onLocationGranted?.(location);
    } catch (error) {
      const next = classify(error);
      setDeviceGeo({ status: next, lat: null, lng: null });
      setMessage(
        next === 'denied'
          ? 'Location permission was denied. Enable it in browser settings, retry, or select a pin manually.'
          : next === 'timeout'
            ? 'Location timed out. Check device location services and retry, or select a pin manually.'
            : 'Location is unavailable. HTTPS is required in mobile browsers; manual pin selection still works.',
      );
      onLocationDenied?.(error as Error);
    }
  };

  if (!showUI) return null;
  if (deviceGeo.status === 'granted') {
    return (
      <div className="mb-3 flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
        <span className="flex items-center gap-2"><MapPin size={15} /> Current location selected</span>
        <button type="button" className="font-semibold" onClick={request}>Refresh</button>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-950">
      <div className="flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" /><div><p className="text-sm font-medium">Choose your location</p><p className="mt-0.5 text-xs text-blue-800">CGD uses it for nearby sellers, road pricing, and delivery. Permission is never bypassed.</p></div></div>
      {message ? <p className="mt-2 text-xs text-amber-800">{message}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={request} disabled={deviceGeo.status === 'requesting'}>
          {deviceGeo.status === 'requesting' ? <RefreshCw size={14} className="mr-1 animate-spin" /> : <LocateFixed size={14} className="mr-1" />}
          {deviceGeo.status === 'requesting' ? 'Requesting…' : 'Use my current location'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setPage('location')}><MapPin size={14} className="mr-1" /> Select pin manually</Button>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { MapPin, Navigation, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import GoogleMap from '@/components/GoogleMap';
import LocationPermission from '@/components/LocationPermission';
import { useAppStore } from '@/store/useAppStore';
import { parseCoord, parseLng } from '@/lib/geoUtils';

type Source = 'gps' | 'manual_pin' | 'address_search';

export default function LocationPage() {
  const { user, setUser, setPage, deviceGeo } = useAppStore();
  const initialLat = deviceGeo.lat ?? parseCoord(user.latitude);
  const initialLng = deviceGeo.lng ?? parseLng(user.longitude);
  const [city, setCity] = useState(user.city || '');
  const [area, setArea] = useState(user.area || '');
  const [landmark, setLandmark] = useState('');
  const [latitude, setLatitude] = useState<number | null>(initialLat);
  const [longitude, setLongitude] = useState<number | null>(initialLng);
  const [source, setSource] = useState<Source>(deviceGeo.status === 'granted' ? 'gps' : 'manual_pin');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const markers = useMemo(
    () => latitude == null || longitude == null ? [] : [{ id: 'selected', position: { latitude, longitude }, title: 'Selected location', type: 'current' as const }],
    [latitude, longitude],
  );

  const selectGps = (location: { latitude: number; longitude: number; accuracy?: number }) => {
    setLatitude(location.latitude);
    setLongitude(location.longitude);
    setAccuracy(location.accuracy ?? null);
    setSource('gps');
  };

  const searchAddress = async () => {
    const query = [landmark, area, city, user.country || 'Tanzania'].filter(Boolean).join(', ');
    if (!query.trim()) return toast.error('Enter an address, landmark, area, or city');
    const google = (window as unknown as { google?: typeof window.google }).google;
    if (!google?.maps?.Geocoder) return toast.error('Google address search is unavailable. Enter coordinates or tap the map.');
    setSearching(true);
    try {
      const response = await new google.maps.Geocoder().geocode({ address: query });
      const point = response.results[0]?.geometry.location;
      if (!point) return toast.error('No matching location found');
      setLatitude(point.lat());
      setLongitude(point.lng());
      setSource('address_search');
      setAccuracy(null);
      toast.success('Location found. Drag or tap the map to refine the exact entrance.');
    } catch {
      toast.error('Could not find that address or landmark');
    } finally {
      setSearching(false);
    }
  };

  const handleContinue = async () => {
    if (!city.trim()) return toast.error('Enter your city');
    if ((user.role === 'supplier' || user.role === 'driver' || user.role === 'delivery_guy') && (latitude == null || longitude == null)) {
      return toast.error('Sellers and delivery drivers must select a valid map location');
    }
    setSaving(true);
    try {
      if (user.role === 'supplier' && latitude != null && longitude != null) {
        await api.put('/workflow/seller/location', {
          latitude,
          longitude,
          source,
          accuracy_meters: accuracy,
          landmark: landmark.trim() || undefined,
        });
      }
      if ((user.role === 'driver' || user.role === 'delivery_guy') && latitude != null && longitude != null) {
        await api.put('/workflow/driver/availability', { online: false, latitude, longitude });
      }
      if (user.userId) {
        await api.put(`/auth/user/${user.userId}`, {
          city: city.trim(),
          area: area.trim(),
          latitude,
          longitude,
        });
      }
      setUser({
        city: city.trim(),
        area: area.trim(),
        latitude: latitude == null ? '' : String(latitude),
        longitude: longitude == null ? '' : String(longitude),
      });
      const next = user.role === 'supplier' ? 'payment-method' : user.role === 'driver' || user.role === 'delivery_guy' ? 'driver-dashboard' : user.role === 'admin' ? 'admin-dashboard' : 'customer-dashboard';
      setPage(next);
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || 'Could not save location');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-5 py-8">
      <div className="mb-5">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gas-light-orange"><MapPin className="text-primary" /></div>
        <p className="text-xs font-semibold text-primary">CGD — Cooking Gas Delivery</p>
        <h1 className="text-2xl font-bold">Select your exact location</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use GPS after granting permission, search a landmark, or tap the map. CGD never guesses or bypasses device permission.</p>
      </div>

      <LocationPermission showUI onLocationGranted={selectGps} />

      <div className="space-y-3">
        <input className="w-full rounded-xl border bg-card px-4 py-3 text-sm" placeholder="City" value={city} onChange={(event) => setCity(event.target.value)} />
        <input className="w-full rounded-xl border bg-card px-4 py-3 text-sm" placeholder="Area / street" value={area} onChange={(event) => setArea(event.target.value)} />
        <div className="flex gap-2">
          <input className="min-w-0 flex-1 rounded-xl border bg-card px-4 py-3 text-sm" placeholder="Landmark or address" value={landmark} onChange={(event) => setLandmark(event.target.value)} />
          <button type="button" disabled={searching} onClick={searchAddress} className="rounded-xl bg-secondary px-4" aria-label="Search address"><Search size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" inputMode="decimal" className="rounded-xl border bg-card px-3 py-3 text-sm" placeholder="Latitude" value={latitude ?? ''} onChange={(event) => { setLatitude(event.target.value === '' ? null : Number(event.target.value)); setSource('manual_pin'); }} />
          <input type="number" inputMode="decimal" className="rounded-xl border bg-card px-3 py-3 text-sm" placeholder="Longitude" value={longitude ?? ''} onChange={(event) => { setLongitude(event.target.value === '' ? null : Number(event.target.value)); setSource('manual_pin'); }} />
        </div>

        <GoogleMap
          center={latitude != null && longitude != null ? { latitude, longitude } : undefined}
          markers={markers}
          height="280px"
          onLocationClick={(point) => {
            setLatitude(point.latitude);
            setLongitude(point.longitude);
            setSource('manual_pin');
            setAccuracy(null);
          }}
        />
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Navigation size={13} /> {latitude != null && longitude != null ? `${source.replace('_', ' ')} · ${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : 'No delivery pin selected yet'}
        </p>
      </div>

      <button type="button" onClick={handleContinue} disabled={saving} className="mt-6 w-full rounded-full bg-accent py-4 text-base font-bold text-accent-foreground disabled:opacity-50">
        {saving ? 'Saving…' : 'Save location and continue'}
      </button>
    </div>
  );
}

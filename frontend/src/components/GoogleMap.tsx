import { useMemo, useState } from 'react';
import { AdvancedMarker, InfoWindow, Map, Pin, useApiIsLoaded } from '@vis.gl/react-google-maps';
import type { LocationData, NearbyDriver, NearbySupplier, NearbyUser, Report } from '@/services/locationService';

interface MapMarker {
  id: string | number;
  position: LocationData;
  title?: string;
  info?: string;
  type?: 'user' | 'supplier' | 'driver' | 'report' | 'current';
}

interface GoogleMapProps {
  center?: LocationData;
  zoom?: number;
  markers?: MapMarker[];
  onLocationClick?: (location: LocationData) => void;
  className?: string;
  height?: string;
}

const colors: Record<string, { background: string; border: string }> = {
  current: { background: '#2563eb', border: '#1e3a8a' },
  supplier: { background: '#16a34a', border: '#14532d' },
  driver: { background: '#f59e0b', border: '#92400e' },
  report: { background: '#dc2626', border: '#7f1d1d' },
  user: { background: '#6366f1', border: '#312e81' },
};

export default function GoogleMap({
  center,
  zoom = 15,
  markers = [],
  onLocationClick,
  className = '',
  height = '400px',
}: GoogleMapProps) {
  const loaded = useApiIsLoaded();
  const [openId, setOpenId] = useState<string | number | null>(null);
  const mapCenter = useMemo(
    () => ({ lat: center?.latitude ?? -6.7924, lng: center?.longitude ?? 39.2083 }),
    [center?.latitude, center?.longitude],
  );

  if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return (
      <div className={`flex items-center justify-center rounded-lg border border-dashed bg-muted p-4 text-center ${className}`} style={{ height }}>
        <div><p className="font-medium">Map configuration required</p><p className="mt-1 text-xs text-muted-foreground">Set VITE_GOOGLE_MAPS_API_KEY and rebuild. Coordinates can still be entered manually.</p></div>
      </div>
    );
  }
  if (!loaded) return <div className={`flex items-center justify-center rounded-lg bg-muted ${className}`} style={{ height }}>Loading map…</div>;

  return (
    <div className={`overflow-hidden rounded-lg ${className}`} style={{ height, width: '100%' }}>
      <Map
        defaultCenter={mapCenter}
        defaultZoom={zoom}
        gestureHandling="greedy"
        mapId={(import.meta.env.VITE_GOOGLE_MAP_ID as string | undefined) || 'DEMO_MAP_ID'}
        onClick={(event) => {
          const lat = event.detail.latLng?.lat;
          const lng = event.detail.latLng?.lng;
          if (lat != null && lng != null) onLocationClick?.({ latitude: lat, longitude: lng });
        }}
      >
        {markers.map((marker) => {
          const palette = colors[marker.type || 'user'];
          return (
            <AdvancedMarker
              key={marker.id}
              position={{ lat: marker.position.latitude, lng: marker.position.longitude }}
              title={marker.title}
              onClick={() => setOpenId(marker.id)}
            >
              <Pin background={palette.background} borderColor={palette.border} glyphColor="#fff" />
            </AdvancedMarker>
          );
        })}
        {openId != null && (() => {
          const marker = markers.find((item) => item.id === openId);
          if (!marker) return null;
          return (
            <InfoWindow position={{ lat: marker.position.latitude, lng: marker.position.longitude }} onCloseClick={() => setOpenId(null)}>
              <p className="text-sm font-semibold text-slate-900">{marker.title}</p>
              {marker.info ? <p className="mt-1 max-w-56 whitespace-pre-line text-xs text-slate-600">{marker.info}</p> : null}
            </InfoWindow>
          );
        })()}
      </Map>
    </div>
  );
}

export const createMarkersFromData = (
  users?: NearbyUser[],
  suppliers?: NearbySupplier[],
  drivers?: NearbyDriver[],
  reports?: Report[],
  currentLocation?: LocationData,
): MapMarker[] => {
  const markers: MapMarker[] = [];
  if (currentLocation) markers.push({ id: 'current', position: currentLocation, title: 'Your selected location', type: 'current' });
  users?.forEach((user) => markers.push({ id: `user-${user.id}`, position: user, title: user.full_name || user.email, type: 'user', info: `${user.role} · ${user.distance_km.toFixed(2)} km` }));
  suppliers?.forEach((seller) => markers.push({ id: `supplier-${seller.user_id}`, position: seller, title: seller.full_name, type: 'supplier', info: `${seller.area || seller.city} · ${seller.distance_km.toFixed(2)} km` }));
  drivers?.forEach((driver) => markers.push({ id: `driver-${driver.id}`, position: driver, title: driver.full_name, type: 'driver', info: `${driver.vehicle_type || 'Delivery vehicle'} · ${driver.status}` }));
  reports?.forEach((report) => markers.push({ id: `report-${report.id}`, position: report, title: `Report #${report.id}`, type: 'report', info: report.description }));
  return markers;
};

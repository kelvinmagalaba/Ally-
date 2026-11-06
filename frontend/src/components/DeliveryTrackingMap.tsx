import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Map,
  AdvancedMarker,
  InfoWindow,
  Pin,
  useMap,
  useApiIsLoaded,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import UBER_LIGHT_STYLE from '@/lib/uberMapStyle';

/**
 * Live delivery tracking map. Drop-in replacement for the old Leaflet
 * version — same props.
 *
 * Shows: customer dot, seller pin, and a moving car-style marker for the
 * driver. Fits to show everyone the first time the driver appears, then
 * gently pans toward the driver as they move (Uber-style "follow").
 */

interface Props {
  customerLat: number;
  customerLng: number;
  driverLat?: number | null;
  driverLng?: number | null;
  sellerLat?: number | null;
  sellerLng?: number | null;
  customerPopupLabel?: string;
  heightClass?: string;
  lastUpdated?: string | null;
}

function RouteLine({ origin, destination }: { origin: { lat: number; lng: number }; destination: { lat: number; lng: number } }) {
  const map = useMap();
  const routes = useMapsLibrary('routes');

  useEffect(() => {
    if (!map || !routes) return;
    const renderer = new routes.DirectionsRenderer({
      map,
      suppressMarkers: true,
      preserveViewport: true,
      polylineOptions: { strokeColor: '#2563eb', strokeOpacity: 0.75, strokeWeight: 5 },
    });
    const service = new routes.DirectionsService();
    service.route(
      { origin, destination, travelMode: routes.TravelMode.DRIVING },
      (result, status) => {
        if (status === routes.DirectionsStatus.OK && result) renderer.setDirections(result);
      }
    );
    return () => renderer.setMap(null);
  }, [map, routes, origin, destination]);

  return null;
}

function FollowDriver({
  customer,
  driver,
  seller,
}: {
  customer: { lat: number; lng: number };
  driver: { lat: number; lng: number } | null;
  seller: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  const seenDriverRef = useRef(false);

  useEffect(() => {
    if (!map || typeof window === 'undefined' || !window.google?.maps) return;
    if (driver) {
      if (!seenDriverRef.current) {
        seenDriverRef.current = true;
        // First time we see the driver — fit to show everyone.
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend(customer);
        bounds.extend(driver);
        if (seller) bounds.extend(seller);
        map.fitBounds(bounds, 56);
        const listener = window.google.maps.event.addListenerOnce(map, 'idle', () => {
          const z = map.getZoom();
          if (z != null && z > 16) map.setZoom(16);
        });
        return () => {
          if (window.google?.maps?.event) window.google.maps.event.removeListener(listener);
        };
      } else {
        // Gently pan toward the driver if they've moved far enough.
        const c = map.getCenter();
        if (!c) return;
        const cLat = c.lat();
        const cLng = c.lng();
        const dLat = driver.lat;
        const dLng = driver.lng;
        // Approx degrees → meters at this latitude
        const meters = Math.hypot(
          (dLat - cLat) * 111_320,
          (dLng - cLng) * 111_320 * Math.cos((cLat * Math.PI) / 180)
        );
        if (meters > 80) {
          map.panTo({ lat: dLat, lng: dLng });
        }
      }
    } else {
      seenDriverRef.current = false;
      if (seller) {
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend(customer);
        bounds.extend(seller);
        map.fitBounds(bounds, 48);
      } else {
        map.setCenter(customer);
        map.setZoom(14);
      }
    }
  }, [map, customer, driver, seller]);

  return null;
}

export default function DeliveryTrackingMap({
  customerLat,
  customerLng,
  driverLat,
  driverLng,
  sellerLat,
  sellerLng,
  customerPopupLabel = 'Your location',
  heightClass = 'h-64 md:h-80',
  lastUpdated,
}: Props) {
  const apiReady = useApiIsLoaded();
  const [openWho, setOpenWho] = useState<'customer' | 'seller' | 'driver' | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const customer = useMemo(
    () => ({ lat: customerLat, lng: customerLng }),
    [customerLat, customerLng]
  );

  const driver = useMemo(() => {
    if (
      driverLat == null ||
      driverLng == null ||
      !Number.isFinite(driverLat) ||
      !Number.isFinite(driverLng)
    )
      return null;
    return { lat: driverLat, lng: driverLng };
  }, [driverLat, driverLng]);

  const seller = useMemo(() => {
    if (
      sellerLat == null ||
      sellerLng == null ||
      !Number.isFinite(sellerLat) ||
      !Number.isFinite(sellerLng)
    )
      return null;
    return { lat: sellerLat, lng: sellerLng };
  }, [sellerLat, sellerLng]);

  if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return (
      <div
        className={`w-full rounded-2xl border border-dashed border-border bg-muted/40 flex flex-col items-center justify-center text-center p-4 text-muted-foreground ${heightClass}`}
      >
        <p className="text-sm font-medium text-foreground">Map unavailable</p>
        <p className="text-xs mt-1 max-w-sm">
          Set <code className="bg-muted px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> in
          <code className="bg-muted px-1 rounded ml-1">frontend/.env</code> and rebuild.
        </p>
      </div>
    );
  }
  if (!apiReady) {
    return (
      <div
        className={`w-full rounded-2xl border border-border bg-muted/50 flex items-center justify-center text-sm text-muted-foreground ${heightClass}`}
      >
        Loading map…
      </div>
    );
  }

  const lastUpdatedMs = lastUpdated ? new Date(lastUpdated).getTime() : NaN;
  const stale = Number.isFinite(lastUpdatedMs) && now - lastUpdatedMs > 30_000;

  return (
    <div className="space-y-1">
    <div className={`w-full rounded-2xl overflow-hidden border border-border ${heightClass}`}>
      <Map
        defaultCenter={customer}
        defaultZoom={14}
        gestureHandling="greedy"
        disableDefaultUI={false}
        clickableIcons={false}
        styles={UBER_LIGHT_STYLE}
        mapId="DEMO_MAP_ID"
      >
        <FollowDriver customer={customer} driver={driver} seller={seller} />
        {driver && <RouteLine origin={driver} destination={customer} />}

        {/* Customer */}
        <AdvancedMarker position={customer} onClick={() => setOpenWho('customer')}>
          <BlueDot />
        </AdvancedMarker>

        {/* Seller */}
        {seller && (
          <AdvancedMarker position={seller} onClick={() => setOpenWho('seller')}>
            <Pin background="#f97316" borderColor="#9a3412" glyphColor="#fff7ed" />
          </AdvancedMarker>
        )}

        {/* Driver — animated car-ish marker */}
        {driver && (
          <AdvancedMarker position={driver} onClick={() => setOpenWho('driver')}>
            <CarMarker />
          </AdvancedMarker>
        )}

        {openWho === 'customer' && (
          <InfoWindow
            position={customer}
            onCloseClick={() => setOpenWho(null)}
            pixelOffset={[0, -22]}
          >
            <div className="text-sm font-medium text-slate-900">{customerPopupLabel}</div>
          </InfoWindow>
        )}
        {openWho === 'seller' && seller && (
          <InfoWindow
            position={seller}
            onCloseClick={() => setOpenWho(null)}
            pixelOffset={[0, -36]}
          >
            <div className="text-sm font-medium text-slate-900">Seller</div>
          </InfoWindow>
        )}
        {openWho === 'driver' && driver && (
          <InfoWindow
            position={driver}
            onCloseClick={() => setOpenWho(null)}
            pixelOffset={[0, -28]}
          >
            <div className="text-sm font-medium text-slate-900">Driver</div>
            <div className="text-[11px] text-slate-600">Live location</div>
          </InfoWindow>
        )}
      </Map>
    </div>
      <p className={`text-xs ${stale ? 'text-amber-700' : 'text-muted-foreground'}`}>
        {!driver
          ? 'Waiting for an authorized driver location.'
          : !lastUpdated
            ? 'Location recovered; waiting for a fresh GPS update.'
            : stale
              ? `Driver location is stale · last updated ${new Date(lastUpdated).toLocaleTimeString()}`
              : `Live · updated ${new Date(lastUpdated).toLocaleTimeString()}`}
      </p>
    </div>
  );
}

function BlueDot() {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#1d4ed8',
        boxShadow: '0 0 0 4px rgba(29,78,216,0.18), 0 0 0 8px rgba(29,78,216,0.08)',
        border: '2px solid #fff',
      }}
    />
  );
}

function CarMarker() {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: '#0f172a',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow:
          '0 6px 18px rgba(15,23,42,0.35), 0 0 0 4px rgba(15,23,42,0.08)',
        border: '2px solid #fff',
      }}
      aria-label="Driver"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2" />
        <circle cx="6.5" cy="16.5" r="2.5" />
        <circle cx="16.5" cy="16.5" r="2.5" />
      </svg>
    </div>
  );
}

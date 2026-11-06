import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Map,
  AdvancedMarker,
  InfoWindow,
  Pin,
  useMap,
  useApiIsLoaded,
} from '@vis.gl/react-google-maps';
import UBER_LIGHT_STYLE from '@/lib/uberMapStyle';

/**
 * Drop-in replacement for the old Leaflet-based NearbySuppliersMap.
 * Same prop shape so CustomerDashboard doesn't need to change.
 *
 * Uses Google Maps via @vis.gl/react-google-maps with the Uber-inspired
 * light style. Renders the customer as a blue dot and each supplier as
 * a colored pin; auto-fits to show everyone.
 */

export type SupplierMapPoint = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  subtitle?: string;
};

interface Props {
  customerLat: number;
  customerLng: number;
  suppliers: SupplierMapPoint[];
  heightClass?: string;
}

/** Pans/zooms the map to show customer + all suppliers. */
function FitBoundsOnChange({
  customerLat,
  customerLng,
  suppliers,
}: {
  customerLat: number;
  customerLng: number;
  suppliers: SupplierMapPoint[];
}) {
  const map = useMap();
  useEffect(() => {
    if (!map || typeof window === 'undefined' || !window.google?.maps) return;
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: customerLat, lng: customerLng });
    suppliers.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
    if (suppliers.length === 0) {
      map.setCenter({ lat: customerLat, lng: customerLng });
      map.setZoom(13);
    } else {
      map.fitBounds(bounds, 48);
      // Cap the zoom so a single very-close supplier doesn't zoom us to street level
      const listener = window.google.maps.event.addListenerOnce(map, 'idle', () => {
        const z = map.getZoom();
        if (z != null && z > 15) map.setZoom(15);
      });
      return () => {
        if (window.google?.maps?.event) window.google.maps.event.removeListener(listener);
      };
    }
  }, [map, customerLat, customerLng, suppliers]);
  return null;
}

export default function NearbySuppliersMap({
  customerLat,
  customerLng,
  suppliers,
  heightClass = 'h-56 md:h-72',
}: Props) {
  const apiReady = useApiIsLoaded();
  const [openId, setOpenId] = useState<number | null>(null);

  const center = useMemo(
    () => ({ lat: customerLat, lng: customerLng }),
    [customerLat, customerLng]
  );

  // No API key → friendly placeholder so the dashboard still loads.
  if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return <NoKeyPlaceholder heightClass={heightClass} />;
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

  return (
    <div className={`w-full rounded-2xl overflow-hidden border border-border ${heightClass}`}>
      <Map
        defaultCenter={center}
        defaultZoom={13}
        gestureHandling="greedy"
        disableDefaultUI={false}
        clickableIcons={false}
        styles={UBER_LIGHT_STYLE}
        // mapId is required for AdvancedMarker — using a default vector ID below.
        mapId="DEMO_MAP_ID"
      >
        <FitBoundsOnChange
          customerLat={customerLat}
          customerLng={customerLng}
          suppliers={suppliers}
        />

        {/* Customer location — blue Uber-style dot */}
        <AdvancedMarker position={center} title="You">
          <CustomerDot />
        </AdvancedMarker>

        {/* Supplier pins */}
        {suppliers.map((s) => (
          <AdvancedMarker
            key={s.id}
            position={{ lat: s.lat, lng: s.lng }}
            onClick={() => setOpenId(s.id)}
          >
            <Pin background="#f97316" borderColor="#9a3412" glyphColor="#fff7ed" />
          </AdvancedMarker>
        ))}

        {/* Info window for the currently-open pin */}
        {openId != null &&
          (() => {
            const s = suppliers.find((x) => x.id === openId);
            if (!s) return null;
            return (
              <InfoWindow
                position={{ lat: s.lat, lng: s.lng }}
                onCloseClick={() => setOpenId(null)}
                pixelOffset={[0, -36]}
              >
                <div className="text-sm font-medium text-slate-900">{s.name}</div>
                {s.subtitle ? (
                  <div className="text-[11px] text-slate-600 mt-0.5">{s.subtitle}</div>
                ) : null}
              </InfoWindow>
            );
          })()}
      </Map>
    </div>
  );
}

/** A blue "you are here" dot in the Uber style (white halo + blue core). */
function CustomerDot() {
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

function NoKeyPlaceholder({ heightClass }: { heightClass: string }) {
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

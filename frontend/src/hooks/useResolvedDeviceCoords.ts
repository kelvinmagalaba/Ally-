import { useAppStore } from "@/store/useAppStore";
import { parseCoord, parseLng } from "@/lib/geoUtils";

/**
 * Prefer device geo from post-login flow; fall back to profile strings.
 */
export function useResolvedDeviceCoords() {
  const user = useAppStore((s) => s.user);
  const deviceGeo = useAppStore((s) => s.deviceGeo);

  const fromDevice =
    deviceGeo.status === "granted" && deviceGeo.lat != null && deviceGeo.lng != null
      ? { lat: deviceGeo.lat, lng: deviceGeo.lng }
      : null;

  const profLat = parseCoord(user.latitude);
  const profLng = parseLng(user.longitude);
  const fromProfile =
    profLat != null && profLng != null ? { lat: profLat, lng: profLng } : null;

  const lat = fromDevice?.lat ?? fromProfile?.lat ?? null;
  const lng = fromDevice?.lng ?? fromProfile?.lng ?? null;

  return {
    lat,
    lng,
    deviceGeo,
    denied: deviceGeo.status === "denied",
    unsupported: deviceGeo.status === "unavailable",
    pending: deviceGeo.status === "requesting",
    hasCoords: lat != null && lng != null,
  };
}

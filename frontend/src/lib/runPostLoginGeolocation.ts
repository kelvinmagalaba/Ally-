import { api } from "@/lib/api";
import type { UserData } from "@/store/useAppStore";
import { saveStoredDeviceGeo, loadStoredDeviceGeo, type StoredDeviceGeo } from "@/lib/deviceGeoStorage";

export type DeviceGeoSnapshot = {
  status: "unknown" | "pending" | "granted" | "denied" | "unsupported";
  lat: number | null;
  lng: number | null;
};

type SetUser = (data: Partial<UserData>) => void;
type SetDeviceGeo = (data: Partial<DeviceGeoSnapshot>) => void;

/**
 * After successful auth: use cached decision/coords if present; otherwise call getCurrentPosition once.
 * Persists per userId so refresh does not re-prompt.
 */
export function runPostLoginGeolocation(opts: {
  userId: number;
  setUser: SetUser;
  setDeviceGeo: SetDeviceGeo;
  syncProfile?: boolean;
}): Promise<void> {
  const { userId, setUser, setDeviceGeo, syncProfile = true } = opts;

  const applyGranted = (latStr: string, lngStr: string) => {
    const lat = Number(latStr);
    const lng = Number(lngStr);
    saveStoredDeviceGeo(userId, { status: "granted", lat: latStr, lng: lngStr, savedAt: Date.now() });
    setDeviceGeo({
      status: "granted",
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
    });
    setUser({ latitude: latStr, longitude: lngStr });
    if (syncProfile) {
      void api.put(`/auth/user/${userId}`, { latitude: latStr, longitude: lngStr }).catch(() => {});
    }
  };

  const cached = loadStoredDeviceGeo(userId) as StoredDeviceGeo | null;
  if (cached?.status === "denied") {
    setDeviceGeo({ status: "denied", lat: null, lng: null });
    return Promise.resolve();
  }
  if (cached?.status === "unsupported") {
    setDeviceGeo({ status: "unsupported", lat: null, lng: null });
    return Promise.resolve();
  }
  if (cached?.status === "granted" && cached.lat && cached.lng) {
    applyGranted(cached.lat, cached.lng);
    return Promise.resolve();
  }

  if (!navigator.geolocation) {
    const row: StoredDeviceGeo = { status: "unsupported", savedAt: Date.now() };
    saveStoredDeviceGeo(userId, row);
    setDeviceGeo({ status: "unsupported", lat: null, lng: null });
    return Promise.resolve();
  }

  setDeviceGeo({ status: "pending", lat: null, lng: null });

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latStr = pos.coords.latitude.toFixed(8);
        const lngStr = pos.coords.longitude.toFixed(8);
        applyGranted(latStr, lngStr);
        resolve();
      },
      () => {
        saveStoredDeviceGeo(userId, { status: "denied", savedAt: Date.now() });
        setDeviceGeo({ status: "denied", lat: null, lng: null });
        resolve();
      },
      { enableHighAccuracy: true, timeout: 22000, maximumAge: 0 }
    );
  });
}

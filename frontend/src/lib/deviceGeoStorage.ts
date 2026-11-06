export type StoredDeviceGeoStatus = "granted" | "denied" | "unsupported";

export type StoredDeviceGeo = {
  status: StoredDeviceGeoStatus;
  lat?: string;
  lng?: string;
  savedAt: number;
};

const keyFor = (userId: number) => `gasapp_device_geo_${userId}`;

export function loadStoredDeviceGeo(userId: number): StoredDeviceGeo | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const o = JSON.parse(raw) as StoredDeviceGeo;
    if (!o || typeof o.status !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

export function saveStoredDeviceGeo(userId: number, data: StoredDeviceGeo) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

export function clearStoredDeviceGeo(userId: number) {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}

/**
 * Geolocation that works in BOTH the browser (Vite dev) and the native
 * Android APK (Capacitor).
 *
 * On native:
 *   - No http/https permission cliff. The native Geolocation plugin is
 *     used directly, which uses Android's location services regardless of
 *     whether the WebView is loading content over file://, http://, or https://.
 *   - Permission is requested via Android's runtime prompt the first time.
 *
 * On web:
 *   - Falls back to navigator.geolocation. Subject to the standard
 *     browser rule that http origins (other than localhost) get auto-denied.
 *
 * This module is the only thing the rest of the app needs to import — your
 * existing components / hooks can call getCurrentPosition() and forget about
 * which platform they're on.
 */

export type Coords = { latitude: number; longitude: number; accuracy?: number };

let _isNative: boolean | null = null;
function isNative(): boolean {
  if (_isNative !== null) return _isNative;
  try {
    // The Capacitor global is injected at runtime by the native shell; it's
    // simply not present in a plain browser, so the import below would
    // throw — which is why we read window.Capacitor first.
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    _isNative = !!cap?.isNativePlatform?.();
  } catch {
    _isNative = false;
  }
  return _isNative;
}

export async function getCurrentPosition(): Promise<Coords> {
  if (isNative()) {
    const mod = await import('@capacitor/geolocation');
    const { Geolocation } = mod;
    // Ask for permission first; on already-granted devices this resolves instantly.
    try {
      await Geolocation.requestPermissions();
    } catch {
      /* on web shim, this throws — caller will see the rejection below */
    }
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };
  }

  // Web fallback — same shape as the native call.
  return new Promise<Coords>((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

/**
 * Subscribe to position changes. Returns an unsubscribe function.
 *
 * On native this uses Geolocation.watchPosition which keeps working when
 * the app is foregrounded but the WebView is otherwise idle.
 */
export async function watchPosition(
  cb: (pos: Coords) => void,
  onError?: (err: Error) => void
): Promise<() => void> {
  if (isNative()) {
    const mod = await import('@capacitor/geolocation');
    const { Geolocation } = mod;
    try {
      await Geolocation.requestPermissions();
    } catch {
      /* ignore */
    }
    const id = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 15000 },
      (pos, err) => {
        if (err) {
          onError?.(new Error(err.message || 'Location error'));
          return;
        }
        if (pos) {
          cb({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        }
      }
    );
    return () => {
      void Geolocation.clearWatch({ id }).catch(() => undefined);
    };
  }

  // Web fallback
  if (!('geolocation' in navigator)) {
    onError?.(new Error('Geolocation unsupported'));
    return () => undefined;
  }
  const wid = navigator.geolocation.watchPosition(
    (p) =>
      cb({
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        accuracy: p.coords.accuracy,
      }),
    (e) => onError?.(new Error(e.message || 'Location error')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
  return () => navigator.geolocation.clearWatch(wid);
}

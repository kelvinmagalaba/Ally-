import { useEffect, useRef, useState } from "react";
import socket from "@/socket";

const UI_MIN_MS = 800;
const NETWORK_MIN_MS = 5000;

export type GeoPermissionState = "unknown" | "granted" | "denied" | "unsupported";

export type DriverGpsGate = "ok" | "denied" | "unsupported";

type Options = {
  active: boolean;
  userId: number | null;
  broadcastOrderId: number | null;
  /** From post-login geolocation: skip watch when denied/unsupported */
  gpsGate: DriverGpsGate;
  initialLat: number | null;
  initialLng: number | null;
};

/**
 * Live GPS for drivers. Seeds map from stored/profile coords when watch is blocked.
 */
export function useDriverDeliveryGps({
  active,
  userId,
  broadcastOrderId,
  gpsGate,
  initialLat,
  initialLng,
}: Options) {
  const [devicePos, setDevicePos] = useState<{ lat: number; lng: number } | null>(() =>
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null
  );
  const [permission, setPermission] = useState<GeoPermissionState>("unknown");

  const lastUi = useRef(0);
  const lastNet = useRef(0);
  const permissionRef = useRef<GeoPermissionState>("unknown");
  const firstUiFix = useRef(true);

  useEffect(() => {
    permissionRef.current = permission;
  }, [permission]);

  useEffect(() => {
    lastNet.current = 0;
    firstUiFix.current = true;
  }, [broadcastOrderId]);

  useEffect(() => {
    if (!active) firstUiFix.current = true;
  }, [active]);

  useEffect(() => {
    if (initialLat != null && initialLng != null) {
      setDevicePos({ lat: initialLat, lng: initialLng });
    }
  }, [initialLat, initialLng]);

  useEffect(() => {
    if (!active || !userId) return;

    if (gpsGate === "unsupported" || (gpsGate === "ok" && !navigator.geolocation)) {
      setPermission("unsupported");
      return;
    }

    if (gpsGate === "denied") {
      setPermission("denied");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const now = Date.now();

        if (firstUiFix.current || now - lastUi.current >= UI_MIN_MS) {
          firstUiFix.current = false;
          lastUi.current = now;
          setDevicePos({ lat, lng });
        }

        if (permissionRef.current !== "granted") {
          setPermission("granted");
        }

        if (broadcastOrderId == null) return;
        if (now - lastNet.current < NETWORK_MIN_MS) return;
        lastNet.current = now;

        socket.emit("driver_location", {
          orderId: broadcastOrderId,
          lat,
          lng,
          accuracy: pos.coords.accuracy,
          timestamp: new Date(pos.timestamp).toISOString(),
        });
      },
      (err) => {
        if (err.code === 1) {
          setPermission("denied");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 25000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [active, userId, broadcastOrderId, gpsGate]);

  return { devicePos, permission };
}

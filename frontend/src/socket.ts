import { io } from "socket.io-client";
import { API_URL, getAuthToken } from "@/lib/api";

const VITE_SOCKET_URL = import.meta.env.VITE_SOCKET_URL as string | undefined;

const SOCKET_URL = VITE_SOCKET_URL?.trim()
  ? VITE_SOCKET_URL.trim().replace(/\/$/, "")
  : API_URL;

const socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"],
  withCredentials: false,
  // Don't spam the browser console with reconnect errors when the backend is
  // offline. Back off aggressively so the user gets a clean console + the
  // BackendStatusBanner has time to show its message.
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,       // wait 2s before first retry
  reconnectionDelayMax: 30000,   // never sleep longer than 30s between retries
  timeout: 10000,
  autoConnect: false,
  auth: (callback) => callback({ token: getAuthToken() }),
});

export function connectAuthenticatedSocket() {
  const token = getAuthToken();
  if (!token) return;
  socket.auth = { token };
  if (!socket.connected) socket.connect();
}

export function disconnectSocket() {
  if (socket.connected) socket.disconnect();
}

// Log exactly once when the socket can't connect, then stay quiet.
let warnedOffline = false;
socket.on("connect_error", () => {
  if (!warnedOffline) {
    warnedOffline = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[socket] Cannot reach ${SOCKET_URL} — is the backend running? Will keep retrying quietly.`
    );
  }
});
socket.on("connect", () => {
  if (warnedOffline) {
    // eslint-disable-next-line no-console
    console.info(`[socket] Reconnected to ${SOCKET_URL}`);
    warnedOffline = false;
  }
});

export default socket;

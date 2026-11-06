import axios from "axios";

/** From `.env`: full backend origin, e.g. http://192.168.1.5:5000 (no /api suffix) */
const envApiUrl = import.meta.env.VITE_API_URL as string | undefined;

function trimBase(u: string): string {
  return u.replace(/\/$/, "");
}

function isPrivateLanHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1")
    return true;
  const p = hostname.split(".").map((x) => Number(x));
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** True if VITE_API_URL points at this machine only — wrong for another device on Wi‑Fi */
function envPointsToLoopback(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
  } catch {
    return false;
  }
}

/** Same host as the page + port 5000 */
function sameHostBackendOrigin(): string | null {
  if (typeof window === "undefined" || !window.location?.hostname) return null;
  const { protocol, hostname } = window.location;
  if (!hostname.trim()) return null;
  if (isPrivateLanHost(hostname) || import.meta.env.DEV) {
    return `${protocol}//${hostname}:5000`;
  }
  return null;
}

function resolveApiBase(): string {
  const env = envApiUrl?.trim() ?? "";

  if (typeof window !== "undefined" && window.location?.hostname) {
    const ph = window.location.hostname;
    const openedFromAnotherDeviceOnLan =
      isPrivateLanHost(ph) && ph !== "localhost" && ph !== "127.0.0.1" && ph !== "[::1]" && ph !== "::1";

    if (openedFromAnotherDeviceOnLan && (!env || envPointsToLoopback(env))) {
      return trimBase(`${window.location.protocol}//${ph}:5000`);
    }
  }

  if (env) return trimBase(env);

  const sh = typeof window !== "undefined" ? sameHostBackendOrigin() : null;
  if (sh) return trimBase(sh);

  return "http://192.168.100.8:5000";
}

export const API_URL = resolveApiBase();

// Debug: Log the API URL being used
console.log('API URL resolved to:', API_URL);

// Clear any cached API URL that might be incorrect
if (typeof window !== 'undefined') {
  const currentApiUrl = localStorage.getItem('gasapp_api_url');
  if (currentApiUrl && currentApiUrl !== API_URL) {
    console.log('Clearing cached API URL:', currentApiUrl, 'Setting to:', API_URL);
    localStorage.removeItem('gasapp_api_url');
  }
  // Store the correct API URL
  localStorage.setItem('gasapp_api_url', API_URL);
}

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: false,
  headers: { "Content-Type": "application/json" },
  timeout: 25000,
});

const TOKEN_KEY = 'cgd_auth_token';

export function getAuthToken(): string {
  return typeof window === 'undefined' ? '' : localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      setAuthToken(null);
    }
    return Promise.reject(error);
  }
);

export function getApiOrigin(): string {
  return API_URL;
}

export function receiptPdfUrl(receiptId: number): string {
  return `${API_URL}/api/receipts/${receiptId}/pdf`;
}

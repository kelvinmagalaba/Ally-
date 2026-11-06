import { create } from 'zustand';
import { loadStoredDeviceGeo, clearStoredDeviceGeo } from '@/lib/deviceGeoStorage';
import { setAuthToken } from '@/lib/api';
import { disconnectSocket } from '@/socket';

export interface UserData {
  userId: number | null;
  role: 'customer' | 'supplier' | 'driver' | 'delivery_guy' | 'admin' | null;
  deliveryGuyId: number | null;
  fullName: string;
  phone: string;
  email: string;
  profileImage: string;
  country: string;
  city: string;
  area: string;
  latitude: string;
  longitude: string;
  selected_brands: string[];
  prices: Record<string, Record<string, number>>;
  plateNumber: string;
  drivingLicense: string;
  paymentMethods: string[];
  transactionPhone: string;
  otpVerified: boolean;
}

export type DeviceGeoStatus = 'not_requested' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'timeout' | 'stale';

export interface DeviceGeoState {
  status: DeviceGeoStatus;
  lat: number | null;
  lng: number | null;
}

const defaultDeviceGeo: DeviceGeoState = {
  status: 'not_requested',
  lat: null,
  lng: null,
};

function hydrateDeviceGeoFromStorage(userId: number | null): DeviceGeoState {
  if (userId == null || Number.isNaN(userId)) return defaultDeviceGeo;
  const row = loadStoredDeviceGeo(userId);
  if (!row) return defaultDeviceGeo;
  if (row.status === 'granted' && row.lat && row.lng) {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { status: 'granted', lat, lng };
    }
  }
  if (row.status === 'denied') return { status: 'denied', lat: null, lng: null };
  if (row.status === 'unsupported') return { status: 'unavailable', lat: null, lng: null };
  return defaultDeviceGeo;
}

interface AppState {
  currentPage: string;
  user: UserData;
  deviceGeo: DeviceGeoState;
  setPage: (page: string) => void;
  setUser: (data: Partial<UserData>) => void;
  setDeviceGeo: (data: Partial<DeviceGeoState>) => void;
  resetUser: () => void;
}

const defaultUser: UserData = {
  userId: null,
  role: null,
  fullName: '',
  phone: '',
  email: '',
  profileImage: '',
  country: 'Tanzania',
  city: '',
  area: '',
  latitude: '',
  longitude: '',
  selected_brands: [],
  prices: {},
  plateNumber: '',
  drivingLicense: '',
  paymentMethods: [],
  transactionPhone: '',
  deliveryGuyId: null,
  otpVerified: false,
};

export const useAppStore = create<AppState>((set, get) => {
  const saved = localStorage.getItem('gasapp_user');
  const savedPage = localStorage.getItem('gasapp_page');
  const initialUser: UserData = saved ? { ...defaultUser, ...JSON.parse(saved) } : defaultUser;
  const uid = initialUser.userId != null ? Number(initialUser.userId) : null;
  const initialDeviceGeo = hydrateDeviceGeoFromStorage(uid);
  const initialPage = savedPage || 'onboarding';

  return {
    currentPage: initialPage,
    user: initialUser,
    deviceGeo: initialDeviceGeo,
    setPage: (page) => {
      localStorage.setItem('gasapp_page', page);
      set({ currentPage: page });
    },
    setUser: (data) =>
      set((state) => {
        const updated = { ...state.user, ...data };
        localStorage.setItem('gasapp_user', JSON.stringify(updated));
        const prevUid = state.user.userId != null ? Number(state.user.userId) : null;
        const newUid = updated.userId != null ? Number(updated.userId) : null;
        const nextGeo = prevUid !== newUid ? hydrateDeviceGeoFromStorage(newUid) : state.deviceGeo;
        return { user: updated, deviceGeo: nextGeo };
      }),
    setDeviceGeo: (data) =>
      set((state) => ({
        deviceGeo: { ...state.deviceGeo, ...data },
      })),
    resetUser: () => {
      const id = get().user.userId != null ? Number(get().user.userId) : null;
      if (id != null && !Number.isNaN(id)) clearStoredDeviceGeo(id);
      localStorage.removeItem('gasapp_user');
      localStorage.removeItem('gasapp_page');
      setAuthToken(null);
      disconnectSocket();
      set({ user: defaultUser, currentPage: 'onboarding', deviceGeo: defaultDeviceGeo });
    },
  };
});

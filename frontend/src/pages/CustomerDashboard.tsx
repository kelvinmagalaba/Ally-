import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import BottomNav from '@/components/BottomNav';
import DeliveryTrackingMap from '@/components/DeliveryTrackingMap';
import NearbySuppliersMap, { type SupplierMapPoint } from '@/components/NearbySuppliersMap';
import LocationPermission from '@/components/LocationPermission';
import { useResolvedDeviceCoords } from '@/hooks/useResolvedDeviceCoords';
import { api, receiptPdfUrl } from '@/lib/api';
import { toTelHref } from '@/lib/phone';
import OrderChatPanel from '@/components/OrderChatPanel';
import ReceiptQrPanel from '@/components/ReceiptQrPanel';
import socket from '@/socket';
import {
  MapPin,
  ShoppingCart,
  Bell,
  LogOut,
  Receipt,
  Store,
  Plus,
  CreditCard,
  Navigation,
  MessageCircle,
  Phone,
  Search,
  User as UserIcon,
  QrCode,
} from 'lucide-react';
import { toast } from 'sonner';

interface SupplierRow {
  id: number;
  full_name: string;
  city: string;
  area: string;
  country?: string;
  selected_brands: string[];
  payment_methods?: string[];
  latitude?: number | string | null;
  longitude?: number | string | null;
  distance_km?: number | null;
  distance_basis?: string | null;
}

interface OrderQuote {
  quoteId: string;
  currency: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  distanceKm: number;
  durationSeconds: number | null;
  routeProvider: string;
  isRoadDistance: boolean;
  warning: string | null;
  expiresInMinutes: number;
}

interface CatalogData {
  selected_brands: string[];
  prices: Record<string, Record<string, number>>;
  products?: Array<{ brand: string; size: string; price: number; stock_quantity: number; product_type: string }>;
}

interface OrderRow {
  id: number;
  customer_id: number;
  supplier_id: number | null;
  delivery_id: number | null;
  driver_id?: number | null;
  delivery_user_id?: number | null;
  brand: string;
  size: string;
  price: string | number;
  total_amount?: string | number;
  delivery_fee?: string | number;
  quantity?: number;
  road_distance_km?: string | number | null;
  status: string;
  customer_lat: number | null;
  customer_lng: number | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  supplier_name?: string;
  delivery_name?: string;
  supplier_phone?: string | null;
  driver_phone?: string | null;
  pending_payment_count?: number | string;
}

interface ReceiptRow {
  id: number;
  transaction_id: number;
  order_id: number;
  created_at: string;
  amount: string | number;
  payment_method: string;
}

function methodsForOrder(_o: OrderRow, supplier: SupplierRow | undefined): string[] {
  const fromSeller = (supplier?.payment_methods || []).map((m) => String(m).toLowerCase().replace(/\s+/g, '_'));
  const base = ['cash', 'mobile_money'];
  return [...new Set([...base, ...fromSeller])];
}

const CustomerDashboard = () => {
  const { user, resetUser } = useAppStore();
  const [tab, setTab] = useState('home');
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [pickSupplier, setPickSupplier] = useState<SupplierRow | null>(null);
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('12');
  const [price, setPrice] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState<'refill' | 'exchange' | 'new_cylinder'>('refill');
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [catalog, setCatalog] = useState<CatalogData>({
    selected_brands: [],
    prices: {},
  });
  const [trackOrder, setTrackOrder] = useState<OrderRow | null>(null);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [driverLastUpdated, setDriverLastUpdated] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState<{
    orderId: number;
    peerId: number;
    label: string;
    readOnly: boolean;
  } | null>(null);
  const [maxKm, setMaxKm] = useState(50);
  const [payMethodByOrder, setPayMethodByOrder] = useState<Record<number, string>>({});
  // ---- New UI state ----
  // Free-text search to filter the seller list by name / city / area.
  const [searchTerm, setSearchTerm] = useState('');
  // "For me" vs "For a friend" toggle on the order form, plus recipient details.
  const [orderFor, setOrderFor] = useState<'me' | 'friend'>('me');
  const [friendName, setFriendName] = useState('');
  const [friendPhone, setFriendPhone] = useState('');
  const [friendAddress, setFriendAddress] = useState('');
  // Manually-entered drop-off lat/lng (from a search box on the map). Empty = use device GPS.
  const [friendLat, setFriendLat] = useState<string>('');
  const [friendLng, setFriendLng] = useState<string>('');
  // Receipt panel (QR + verify code)
  const [receiptOrder, setReceiptOrder] = useState<OrderRow | null>(null);

  const uid = user.userId;

  const { lat: deviceLat, lng: deviceLng, denied: locationDenied, unsupported: locationUnsupported } =
    useResolvedDeviceCoords();

  const loadSuppliers = useCallback(async () => {
    try {
      const params: Record<string, string | number> = {};
      if (user.city) params.city = user.city;
      if (deviceLat != null && deviceLng != null) {
        params.latitude = deviceLat;
        params.longitude = deviceLng;
        params.maxKm = maxKm;
      }
      if (searchTerm.trim()) params.q = searchTerm.trim();
      const { data } = await api.get<SupplierRow[]>('/auth/suppliers', { params });
      setSuppliers(data);
    } catch {
      toast.error('Could not load suppliers');
    }
  }, [user.city, deviceLat, deviceLng, maxKm, searchTerm]);

  const loadOrders = useCallback(async () => {
    if (!uid) return;
    try {
      const { data } = await api.get<OrderRow[]>('/orders', { params: { role: 'customer', userId: uid } });
      setOrders(data);
    } catch {
      toast.error('Could not load orders');
    }
  }, [uid]);

  const loadReceipts = useCallback(async () => {
    if (!uid) return;
    try {
      const { data } = await api.get<ReceiptRow[]>(`/receipts/user/${uid}`);
      setReceipts(data);
    } catch {
      /* optional */
    }
  }, [uid]);

  useEffect(() => {
    if (tab === 'home' || tab === 'orders') loadSuppliers();
  }, [loadSuppliers, tab]);

  useEffect(() => {
    loadOrders();
    loadReceipts();
  }, [loadOrders, loadReceipts, tab]);

  useEffect(() => {
    const openNotificationOrder = async (event: Event) => {
      const orderId = Number((event as CustomEvent<{ orderId?: number }>).detail?.orderId);
      if (!Number.isFinite(orderId)) return;
      try {
        const { data } = await api.get<OrderRow>(`/orders/${orderId}`);
        setTrackOrder(data);
        setTab('orders');
      } catch {
        toast.error('This order is no longer available to this account.');
      }
    };
    window.addEventListener('cgd:open-order', openNotificationOrder);
    return () => window.removeEventListener('cgd:open-order', openNotificationOrder);
  }, []);

  useEffect(() => {
    if (!uid) return;
    socket.emit('join', uid);
    const onArrived = (p: { message?: string }) => {
      toast.success(p.message || 'Driver arrived at your address!');
      // Audible bell — same chime the seller side uses.
      void import('@/lib/playSellerBell').then(({ playSellerBell }) => playSellerBell(3));
    };
    const onConfirmed = (p: { orderId?: number }) => {
      toast.success(
        p?.orderId ? `Delivery confirmed for Order #${p.orderId}` : 'Delivery confirmed'
      );
      void import('@/lib/playSellerBell').then(({ playSellerBell }) => playSellerBell(2));
      // Refresh so the order shows as completed and the receipt shows the ✅.
      loadOrders();
    };
    socket.on('deliveryArrived', onArrived);
    socket.on('deliveryConfirmed', onConfirmed);
    return () => {
      socket.off('deliveryArrived', onArrived);
      socket.off('deliveryConfirmed', onConfirmed);
    };
  }, [uid, loadOrders]);

  useEffect(() => {
    if (!trackOrder?.id || !uid) return;
    socket.emit('join', uid);
    socket.emit('joinOrder', trackOrder.id);

    const onUpdate = (payload: { orderId?: number; lat: number; lng: number; timestamp?: string }) => {
      if (payload.orderId != null && Number(payload.orderId) !== Number(trackOrder.id)) return;
      setDriverPos({ lat: payload.lat, lng: payload.lng });
      setDriverLastUpdated(payload.timestamp || new Date().toISOString());
    };
    socket.on('driver_location_updated', onUpdate);
    socket.on('deliveryLocationUpdate', onUpdate);
    socket.on('liveDriverLocation', onUpdate);
    return () => {
      socket.off('driver_location_updated', onUpdate);
      socket.off('deliveryLocationUpdate', onUpdate);
      socket.off('liveDriverLocation', onUpdate);
    };
  }, [trackOrder?.id, uid]);

  useEffect(() => {
    if (!pickSupplier) {
      setCatalog({ selected_brands: [], prices: {} });
      setBrand('');
      return;
    }
    (async () => {
      try {
        const { data } = await api.get<CatalogData>(`/auth/catalog/${pickSupplier.id}`);
        setCatalog(data);
        const b = data.selected_brands[0] || '';
        setBrand(b);
        const availableSizes = b ? Object.keys(data.prices[b] || {}) : [];
        const nextSize = availableSizes.includes(size) ? size : availableSizes[0] || size;
        setSize(nextSize);
        const p = b && data.prices[b]?.[nextSize] ? data.prices[b][nextSize] : 0;
        setPrice(Number(p) || 0);
      } catch {
        toast.error('Could not load supplier catalog');
      }
    })();
  }, [pickSupplier, size]);

  useEffect(() => {
    setQuote(null);
  }, [pickSupplier?.id, brand, size, quantity, orderType, orderFor, friendLat, friendLng, deviceLat, deviceLng]);

  const supplierById = useMemo(() => {
    const m = new Map<number, SupplierRow>();
    suppliers.forEach((s) => m.set(s.id, s));
    return m;
  }, [suppliers]);

  const supplierMapPoints: SupplierMapPoint[] = useMemo(() => {
    return suppliers
      .map((s) => {
        const lat = s.latitude != null ? Number(s.latitude) : NaN;
        const lng = s.longitude != null ? Number(s.longitude) : NaN;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const dist =
          s.distance_km != null && Number.isFinite(Number(s.distance_km))
            ? `${Number(s.distance_km).toFixed(1)} km`
            : undefined;
        return {
          id: s.id,
          name: s.full_name,
          lat,
          lng,
          subtitle: [dist, s.city].filter(Boolean).join(' · '),
        };
      })
      .filter((p) => p != null) as SupplierMapPoint[];
  }, [suppliers]);

  // Free-text filter on the seller list (matches name, city, area).
  const filteredSuppliers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => {
      const haystack = [
        s.full_name,
        s.city,
        s.area,
        s.country,
        ...(s.selected_brands || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [suppliers, searchTerm]);

  const filteredSupplierMapPoints = useMemo(() => {
    if (!searchTerm.trim()) return supplierMapPoints;
    const ids = new Set(filteredSuppliers.map((s) => s.id));
    return supplierMapPoints.filter((p) => ids.has(p.id));
  }, [supplierMapPoints, filteredSuppliers, searchTerm]);

  const mapCustomerCoords = useMemo(() => {
    if (!trackOrder) return { lat: null as number | null, lng: null as number | null };
    const olat = trackOrder.customer_lat != null ? Number(trackOrder.customer_lat) : NaN;
    const olng = trackOrder.customer_lng != null ? Number(trackOrder.customer_lng) : NaN;
    if (Number.isFinite(olat) && Number.isFinite(olng)) return { lat: olat, lng: olng };
    if (deviceLat != null && deviceLng != null) return { lat: deviceLat, lng: deviceLng };
    return { lat: null, lng: null };
  }, [trackOrder, deviceLat, deviceLng]);

  const getDropoffCoordinates = () => {
    if (orderFor === 'friend') {
      const lat = Number(friendLat);
      const lng = Number(friendLng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    if (deviceLat != null && deviceLng != null) return { lat: deviceLat, lng: deviceLng };
    return null;
  };

  const requestQuote = async () => {
    if (!pickSupplier || !brand) {
      toast.error('Select a seller and cooking gas product');
      return;
    }
    if (orderFor === 'friend' && (!friendName.trim() || !friendPhone.trim())) {
      toast.error("Enter the recipient's name and phone number");
      return;
    }
    const dropoff = getDropoffCoordinates();
    if (!dropoff) {
      toast.error('Choose a delivery point using GPS or manual coordinates');
      return;
    }
    setQuoteLoading(true);
    try {
      const { data } = await api.post<{ quote: OrderQuote }>('/workflow/quotes', {
        supplier_id: pickSupplier.id,
        brand,
        size: String(size),
        quantity,
        order_type: orderType,
        customer_lat: dropoff.lat,
        customer_lng: dropoff.lng,
      });
      setQuote(data.quote);
      toast.success('Delivery quote calculated');
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(message || 'Could not calculate the delivery quote');
    } finally {
      setQuoteLoading(false);
    }
  };

  const placeOrder = async () => {
    if (!uid) {
      toast.error('Please log in again');
      return;
    }
    if (!pickSupplier) {
      toast.error('Select a supplier');
      return;
    }
    if (!brand) {
      toast.error('Select a brand');
      return;
    }

    const dropoff = getDropoffCoordinates();
    if (orderFor === 'friend') {
      if (!friendName.trim()) {
        toast.error("Please enter your friend's name");
        return;
      }
      if (!friendPhone.trim()) {
        toast.error("Please enter your friend's phone");
        return;
      }
    }
    if (!dropoff) {
      toast.error(
        'We need a delivery location. Allow GPS, or for a friend enter their coordinates.'
      );
      return;
    }
    if (!quote) {
      toast.error('Calculate and review the itemized quote first');
      return;
    }

    try {
      const idempotencyKey = crypto.randomUUID();
      await api.post('/orders', {
        quote_id: quote.quoteId,
        supplier_id: pickSupplier.id,
        brand,
        size: String(size),
        quantity,
        order_type: orderType,
        customer_lat: dropoff.lat,
        customer_lng: dropoff.lng,
        is_for_friend: orderFor === 'friend',
        recipient_name: orderFor === 'friend' ? friendName.trim() : null,
        recipient_phone: orderFor === 'friend' ? friendPhone.trim() : null,
        delivery_address: orderFor === 'friend' ? friendAddress.trim() || null : null,
      }, { headers: { 'Idempotency-Key': idempotencyKey } });
      toast.success(
        orderFor === 'friend'
          ? `Order placed for ${friendName.trim()}`
          : 'Order placed'
      );
      setPickSupplier(null);
      setOrderFor('me');
      setFriendName('');
      setFriendPhone('');
      setFriendAddress('');
      setFriendLat('');
      setFriendLng('');
      setQuote(null);
      loadOrders();
      setTab('orders');
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(message || 'Order failed');
    }
  };

  const initiatePayment = async (o: OrderRow) => {
    if (!uid) return;
    const sup = o.supplier_id != null ? supplierById.get(o.supplier_id) : undefined;
    const methods = methodsForOrder(o, sup);
    const method = payMethodByOrder[o.id] || methods[0] || 'mobile_money';
    try {
      await api.post('/transactions/initiate-payment', {
        order_id: o.id,
        user_id: uid,
        payment_method: method,
      });
      toast.success('Payment sent — waiting for seller to confirm');
      loadOrders();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Payment failed';
      toast.error(msg || 'Payment failed');
    }
  };

  const openTrack = (o: OrderRow) => {
    setTrackOrder(o);
    setDriverPos(
      o.delivery_lat != null && o.delivery_lng != null
        ? { lat: Number(o.delivery_lat), lng: Number(o.delivery_lng) }
        : null
    );
    setDriverLastUpdated(null);
    setTab('orders');
  };

  const pendingPay = (o: OrderRow) => Number(o.pending_payment_count || 0) > 0;
  const canSubmitPay = (o: OrderRow) =>
    ['accepted', 'searching_driver', 'driver_assigned', 'picked_up', 'in_transit', 'arrived', 'delivered'].includes(o.status) &&
    o.status !== 'paid' &&
    !pendingPay(o);
  const canTrack = (o: OrderRow) =>
    ['searching_driver', 'driver_assigned', 'picked_up', 'in_transit', 'arrived'].includes(o.status) &&
    (o.delivery_user_id != null || o.driver_id != null || o.delivery_id != null || o.status === 'paid' || o.status === 'processing');

  const driverUid = (o: OrderRow) => o.delivery_user_id ?? null;
  const canChatSupplier = (o: OrderRow) =>
    o.supplier_id != null && !['pending', 'pending_seller', 'cancelled', 'rejected'].includes(o.status);
  const canChatDriver = (o: OrderRow) => {
    const d = driverUid(o);
    return (
      d != null &&
      ['driver_assigned', 'picked_up', 'in_transit', 'arrived', 'delivered'].includes(o.status)
    );
  };
  const canCallSupplier = (o: OrderRow) =>
    !!toTelHref(o.supplier_phone) &&
    [
      'accepted',
      'searching_driver',
      'driver_assigned',
      'picked_up',
      'in_transit',
      'arrived',
    ].includes(o.status);
  const canCallDriver = (o: OrderRow) =>
    !!toTelHref(o.driver_phone) &&
    ['driver_assigned', 'picked_up', 'in_transit', 'arrived'].includes(o.status);

  const formatMethodLabel = (m: string) => m.replace(/_/g, ' ');

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-20">
      {/* Location Permission - Auto-request GPS access like Bolt */}
      <LocationPermission 
        autoRequest={false}
        showUI={true}
        onLocationGranted={(location) => {
          console.log('Location granted:', location);
          loadSuppliers();
        }}
        onLocationDenied={(error) => {
          // Denial is expected (browser policy or user choice) — not an error.
          // The LocationPermission component shows a dismissible banner; we
          // just note it here so the seller list still loads using city only.
          console.warn('Location unavailable:', error?.message || error);
          loadSuppliers();
        }}
      />

      {tab === 'home' && (
        <div className="animate-fade-in">
          <div className="bg-gradient-to-br from-blue-500 to-blue-700 px-4 sm:px-6 pt-8 md:pt-10 pb-8 rounded-b-3xl">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-blue-100 text-sm">Hello,</p>
                <h1 className="text-lg md:text-xl font-bold text-card">{user.fullName || 'Customer'}</h1>
              </div>
              <div className="w-10 h-10 rounded-full bg-card/20 overflow-hidden shrink-0">
                {user.profileImage ? (
                  <img src={user.profileImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-card font-bold">
                    {(user.fullName || 'C')[0]}
                  </div>
                )}
              </div>
            </div>
            <p className="text-blue-100 text-xs flex items-center gap-1">
              <MapPin size={12} /> {user.city || 'Not set'}, {user.area || user.country}
            </p>
          </div>

          <div className="px-4 sm:px-6 -mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-foreground">Sellers near you</h3>
              <button
                type="button"
                onClick={() => loadSuppliers()}
                className="text-xs text-blue-600 font-medium"
              >
                Refresh
              </button>
            </div>

            {/* Free-text search bar — looks across name, city, area, brands */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by area, city, brand, or seller name…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border bg-card text-sm outline-none focus:border-blue-400"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
                >
                  clear
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Distance:</span>
              <select
                className="rounded-lg border border-border bg-background px-2 py-1.5"
                value={maxKm}
                onChange={(e) => setMaxKm(Number(e.target.value))}
              >
                <option value={10}>Within 10 km</option>
                <option value={25}>Within 25 km</option>
                <option value={50}>Within 50 km</option>
                <option value={150}>Within 150 km</option>
                <option value={2000}>Far (up to 2000 km)</option>
              </select>
              {searchTerm && (
                <span className="text-muted-foreground">
                  · {filteredSuppliers.length} match{filteredSuppliers.length === 1 ? '' : 'es'}
                </span>
              )}
            </div>

            {(locationDenied || locationUnsupported) && (
              <p className="text-xs text-muted-foreground bg-muted/80 rounded-lg px-3 py-2">
                {locationDenied
                  ? 'Location was declined — lists use your city only. Distance sort and map need coordinates from your profile or a future sign-in with location allowed.'
                  : 'This device can’t use GPS — browse sellers by city.'}
              </p>
            )}

            {deviceLat != null && deviceLng != null && filteredSupplierMapPoints.length > 0 && (
              <NearbySuppliersMap
                customerLat={deviceLat}
                customerLng={deviceLng}
                suppliers={filteredSupplierMapPoints}
              />
            )}

            {filteredSuppliers.length === 0 ? (
              <div className="bg-card rounded-xl p-6 border border-border text-center">
                <Store size={32} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? 'No sellers match your search.' : 'No suppliers match your filters.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredSuppliers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPickSupplier(s)}
                    className="text-left bg-card rounded-xl p-4 border border-border hover:border-blue-300 transition-colors"
                  >
                    <p className="font-semibold text-foreground">{s.full_name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {s.city}
                      {s.area ? ` · ${s.area}` : ''}
                    </p>
                    {s.distance_km != null && Number.isFinite(Number(s.distance_km)) && (
                      <p className="text-xs text-blue-600 font-medium mt-1">
                        ~{Number(s.distance_km).toFixed(1)} km away
                      </p>
                    )}
                    {s.selected_brands?.length ? (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Brands: {s.selected_brands.join(', ')}
                      </p>
                    ) : null}
                    {s.payment_methods && s.payment_methods.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Pays: {s.payment_methods.map(formatMethodLabel).join(', ')}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {pickSupplier && (
              <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-foreground flex items-center gap-2">
                    <Plus size={16} /> New order
                  </p>
                  <button type="button" className="text-xs text-muted-foreground" onClick={() => setPickSupplier(null)}>
                    Close
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">Supplier: {pickSupplier.full_name}</p>
                {pickSupplier.payment_methods && pickSupplier.payment_methods.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    They accept: {pickSupplier.payment_methods.map(formatMethodLabel).join(', ')}
                  </p>
                )}

                {/* Who is this for? */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Who is this for?</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOrderFor('me')}
                      className={`px-3 py-2 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 ${
                        orderFor === 'me'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-border bg-background text-foreground'
                      }`}
                    >
                      <UserIcon size={14} /> For me
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderFor('friend')}
                      className={`px-3 py-2 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 ${
                        orderFor === 'friend'
                          ? 'border-amber-500 bg-amber-50 text-amber-800'
                          : 'border-border bg-background text-foreground'
                      }`}
                    >
                      <UserIcon size={14} /> For a friend
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {orderFor === 'me'
                      ? 'Delivery will use your current device location.'
                      : "Delivery will go to the friend you specify below — fill in where it should be dropped off."}
                  </p>
                </div>

                {/* Friend / recipient block */}
                {orderFor === 'friend' && (
                  <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                    <div>
                      <label className="text-[11px] uppercase text-amber-800/80">Recipient name</label>
                      <input
                        type="text"
                        value={friendName}
                        onChange={(e) => setFriendName(e.target.value)}
                        placeholder="e.g. Asha Mwema"
                        className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase text-amber-800/80">Recipient phone</label>
                      <input
                        type="tel"
                        value={friendPhone}
                        onChange={(e) => setFriendPhone(e.target.value)}
                        placeholder="e.g. +255 712 345 678"
                        className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase text-amber-800/80">Drop-off address (optional)</label>
                      <input
                        type="text"
                        value={friendAddress}
                        onChange={(e) => setFriendAddress(e.target.value)}
                        placeholder="House, street, area landmark"
                        className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] uppercase text-amber-800/80">Latitude</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={friendLat}
                          onChange={(e) => setFriendLat(e.target.value)}
                          placeholder="-6.7762"
                          className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] uppercase text-amber-800/80">Longitude</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={friendLng}
                          onChange={(e) => setFriendLng(e.target.value)}
                          placeholder="39.2358"
                          className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-amber-800/80">
                      If you skip the coordinates we'll use your current GPS as the drop-off point.
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-xs text-muted-foreground">Brand</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={brand}
                    onChange={(e) => {
                      const b = e.target.value;
                      setBrand(b);
                      const p = catalog.prices[b]?.[size] ?? 0;
                      setPrice(Number(p) || 0);
                    }}
                  >
                    {catalog.selected_brands.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Size (kg)</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={size}
                    onChange={(e) => {
                      const sz = e.target.value;
                      setSize(sz);
                      const p = brand ? catalog.prices[brand]?.[sz] ?? 0 : 0;
                      setPrice(Number(p) || 0);
                    }}
                  >
                    {Object.keys(catalog.prices[brand] || {}).map((kg) => (
                      <option key={kg} value={kg}>
                        {String(kg).includes('kg') ? kg : `${kg} kg`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Order type</label>
                    <select
                      value={orderType}
                      onChange={(e) => setOrderType(e.target.value as typeof orderType)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="refill">Refill</option>
                      <option value="exchange">Cylinder exchange</option>
                      <option value="new_cylinder">New cylinder</option>
                    </select>
                  </div>
                </div>
                <p className="text-sm">
                  Listed unit price: <span className="font-bold text-accent">TSh {price.toLocaleString()}</span>
                </p>
                {quote && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-sm space-y-1">
                    <div className="flex justify-between"><span>Cooking gas ({quote.quantity} × TSh {quote.unitPrice.toLocaleString()})</span><strong>TSh {quote.subtotal.toLocaleString()}</strong></div>
                    <div className="flex justify-between"><span>Delivery fee</span><strong>TSh {quote.deliveryFee.toLocaleString()}</strong></div>
                    {quote.discount > 0 && <div className="flex justify-between"><span>Discount</span><strong>-TSh {quote.discount.toLocaleString()}</strong></div>}
                    <div className="flex justify-between border-t border-blue-200 pt-1 text-base"><span>Total</span><strong>TSh {quote.total.toLocaleString()}</strong></div>
                    <p className="text-xs text-blue-800">
                      {quote.distanceKm.toFixed(1)} km {quote.isRoadDistance ? 'by road' : '(estimated, not a road route)'}
                      {quote.durationSeconds ? ` · about ${Math.ceil(quote.durationSeconds / 60)} min` : ''}
                    </p>
                    {quote.warning && <p className="text-xs text-amber-800">{quote.warning}</p>}
                    <p className="text-[11px] text-muted-foreground">Quote expires in {quote.expiresInMinutes} minutes.</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={requestQuote}
                  disabled={quoteLoading}
                  className="w-full py-2.5 rounded-xl border border-blue-600 text-blue-700 font-semibold text-sm disabled:opacity-60"
                >
                  {quoteLoading ? 'Calculating road quote…' : quote ? 'Recalculate quote' : 'Calculate delivery quote'}
                </button>
                <button
                  type="button"
                  onClick={placeOrder}
                  disabled={!quote}
                  className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm disabled:opacity-50"
                >
                  Confirm and place order
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="px-4 sm:px-6 pt-8 md:pt-10 animate-fade-in space-y-4">
          <h1 className="text-xl font-bold text-foreground">Orders & tracking</h1>
          {trackOrder && canTrack(trackOrder) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Navigation size={16} /> Live map — Order #{trackOrder.id}
                </p>
                <button type="button" className="text-xs text-muted-foreground" onClick={() => setTrackOrder(null)}>
                  Hide map
                </button>
              </div>
              {mapCustomerCoords.lat != null && mapCustomerCoords.lng != null ? (
                <DeliveryTrackingMap
                  customerLat={mapCustomerCoords.lat}
                  customerLng={mapCustomerCoords.lng}
                  driverLat={
                    driverPos?.lat ?? (trackOrder.delivery_lat != null ? Number(trackOrder.delivery_lat) : null)
                  }
                  driverLng={
                    driverPos?.lng ?? (trackOrder.delivery_lng != null ? Number(trackOrder.delivery_lng) : null)
                  }
                  lastUpdated={driverLastUpdated}
                />
              ) : (
                <p className="text-sm text-muted-foreground rounded-xl border border-border bg-card p-4">
                  We don’t have coordinates for this delivery point yet. If you allowed location at sign-in, try
                  refreshing; otherwise add coordinates to your profile.
                </p>
              )}
            </div>
          )}
          {orders.length === 0 ? (
            <div className="bg-card rounded-xl p-6 border border-border text-center">
              <ShoppingCart size={32} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No orders yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => {
                const sup = o.supplier_id != null ? supplierById.get(o.supplier_id) : undefined;
                const methods = methodsForOrder(o, sup);
                return (
                  <div key={o.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">
                        #{o.id} · {o.brand}{' '}
                        {String(o.size).includes('kg') ? o.size : `${o.size} kg`}
                      </span>
                      <span className="text-xs uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {o.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {o.quantity || 1} × cooking gas · Total TSh {Number(o.total_amount ?? o.price).toLocaleString()}
                    </p>
                    {o.delivery_fee != null && (
                      <p className="text-xs text-muted-foreground">
                        Delivery TSh {Number(o.delivery_fee).toLocaleString()}
                        {o.road_distance_km != null ? ` · ${Number(o.road_distance_km).toFixed(1)} road km` : ''}
                      </p>
                    )}
                    {o.supplier_name && <p className="text-xs text-muted-foreground">Supplier: {o.supplier_name}</p>}
                    {pendingPay(o) && (
                      <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/40 rounded-lg px-2 py-1.5">
                        Payment submitted — waiting for seller confirmation.
                      </p>
                    )}
                    {canSubmitPay(o) && (
                      <div className="flex flex-col sm:flex-row sm:items-end gap-2 pt-1">
                        <div className="flex-1 min-w-0">
                          <label className="text-[10px] uppercase text-muted-foreground">Payment method</label>
                          <select
                            className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
                            value={payMethodByOrder[o.id] || methods[0]}
                            onChange={(e) =>
                              setPayMethodByOrder((prev) => ({ ...prev, [o.id]: e.target.value }))
                            }
                          >
                            {methods.map((m) => (
                              <option key={m} value={m}>
                                {formatMethodLabel(m)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => initiatePayment(o)}
                          className="inline-flex items-center justify-center gap-1 rounded-lg bg-blue-600 text-white text-xs font-medium px-3 py-2 shrink-0"
                        >
                          <CreditCard size={14} /> Pay (seller confirms)
                        </button>
                      </div>
                    )}
                    {canTrack(o) && (
                      <button
                        type="button"
                        onClick={() => openTrack(o)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border text-xs font-medium px-3 py-2"
                      >
                        <Navigation size={14} /> Track delivery
                      </button>
                    )}
                    {/* Receipt + QR — visible once payment has been confirmed */}
                    {['driver_assigned', 'picked_up', 'in_transit', 'arrived'].includes(o.status) && (
                      <button
                        type="button"
                        onClick={() => setReceiptOrder(o)}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 text-white text-xs font-medium px-3 py-2"
                      >
                        <QrCode size={14} /> Secure delivery code
                      </button>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {canChatSupplier(o) && o.supplier_id != null && (
                        <button
                          type="button"
                          onClick={() =>
                            setChatOpen({
                              orderId: o.id,
                              peerId: o.supplier_id,
                              label: `Chat · ${o.supplier_name || 'Supplier'}`,
                              readOnly: ['delivered', 'cancelled'].includes(o.status),
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-border text-xs font-medium px-3 py-2"
                        >
                          <MessageCircle size={14} /> Chat supplier
                        </button>
                      )}
                      {canCallSupplier(o) && (
                        <a
                          href={toTelHref(o.supplier_phone)}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 text-white text-xs font-medium px-3 py-2"
                        >
                          <Phone size={14} /> Call supplier
                        </a>
                      )}
                      {canChatDriver(o) && driverUid(o) != null && (
                        <button
                          type="button"
                          onClick={() =>
                            setChatOpen({
                              orderId: o.id,
                              peerId: driverUid(o)!,
                              label: `Chat · ${o.delivery_name || 'Driver'}`,
                              readOnly: ['delivered', 'cancelled'].includes(o.status),
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-border text-xs font-medium px-3 py-2"
                        >
                          <MessageCircle size={14} /> Chat driver
                        </button>
                      )}
                      {canCallDriver(o) && (
                        <a
                          href={toTelHref(o.driver_phone)}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 text-white text-xs font-medium px-3 py-2"
                        >
                          <Phone size={14} /> Call driver
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'notifications' && (
        <div className="px-4 sm:px-6 pt-8 md:pt-10 animate-fade-in">
          <h1 className="text-xl font-bold text-foreground mb-4">Notifications</h1>
          <div className="bg-card rounded-xl p-6 border border-border text-center">
            <Bell size={32} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              You’ll get a toast when the driver marks arrival. Order status lives under Orders.
            </p>
          </div>
        </div>
      )}

      {tab === 'profile' && (
        <div className="px-4 sm:px-6 pt-8 md:pt-10 animate-fade-in max-w-lg mx-auto">
          <div className="text-center mb-6">
            <div className="w-20 h-20 rounded-full bg-muted mx-auto mb-3 overflow-hidden">
              {user.profileImage ? (
                <img src={user.profileImage} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                  {(user.fullName || 'C')[0]}
                </div>
              )}
            </div>
            <h2 className="text-lg font-bold text-foreground">{user.fullName || 'Customer'}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="space-y-3">
            <div className="bg-card rounded-xl p-4 border border-border">
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="text-sm font-medium text-foreground">{user.phone || 'N/A'}</p>
            </div>
            <div className="bg-card rounded-xl p-4 border border-border">
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="text-sm font-medium text-foreground">
                {user.city || 'N/A'}, {user.area || 'N/A'}
              </p>
            </div>
            <div className="bg-card rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Receipt size={16} className="text-blue-500" />
                <p className="text-xs text-muted-foreground">Receipts</p>
              </div>
              {receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No receipts yet</p>
              ) : (
                <div className="space-y-2">
                  {receipts.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        Order #{r.order_id} · TSH {Number(r.amount).toFixed(0)}
                      </span>
                      <a
                        href={receiptPdfUrl(r.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 font-medium text-xs"
                      >
                        PDF
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => resetUser()}
              className="w-full py-3 bg-destructive/10 text-destructive rounded-xl font-medium text-sm flex items-center justify-center gap-2"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      )}

      {chatOpen && uid != null && (
        <OrderChatPanel
          open
          onClose={() => setChatOpen(null)}
          orderId={chatOpen.orderId}
          userId={uid}
          peerId={chatOpen.peerId}
          peerLabel={chatOpen.label}
          readOnly={chatOpen.readOnly}
        />
      )}

      {receiptOrder && (
        <ReceiptQrPanel
          open
          orderId={receiptOrder.id}
          onClose={() => setReceiptOrder(null)}
        />
      )}

      <BottomNav active={tab} onNavigate={setTab} color="text-blue-500" />
    </div>
  );
};

export default CustomerDashboard;

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import BottomNav from '@/components/BottomNav';
import DeliveryTrackingMap from '@/components/DeliveryTrackingMap';
import LocationPermission from '@/components/LocationPermission';
import { api, receiptPdfUrl } from '@/lib/api';
import { toTelHref } from '@/lib/phone';
import OrderChatPanel from '@/components/OrderChatPanel';
import socket from '@/socket';
import { playSellerBell } from '@/lib/playSellerBell';
import { useResolvedDeviceCoords } from '@/hooks/useResolvedDeviceCoords';
import {
  Package,
  Clock,
  TrendingUp,
  Edit,
  List,
  LogOut,
  Bell,
  MapPin,
  Share2,
  Eye,
  Receipt,
  Navigation,
  Truck,
  ExternalLink,
  CreditCard,
  Radio,
  MessageCircle,
  Phone,
} from 'lucide-react';
import { toast } from 'sonner';

interface OrderRow {
  id: number;
  status: string;
  brand: string;
  size: string;
  price: string | number;
  total_amount?: string | number;
  delivery_fee?: string | number;
  road_distance_km?: string | number | null;
  quantity?: number;
  customer_name?: string;
  customer_id?: number;
  customer_phone?: string | null;
  supplier_id: number | null;
  delivery_id: number | null;
  driver_id?: number | null;
  delivery_user_id?: number | null;
  delivery_name?: string;
  driver_phone?: string | null;
  customer_lat?: number | null;
  customer_lng?: number | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  pending_payment_count?: number | string;
}

interface ReceiptRow {
  id: number;
  order_id: number;
  amount: string | number;
}

interface DriverNearRow {
  id: number;
  user_id?: number;
  full_name: string;
  phone?: string;
  distance_km: number | null;
}

function parseCoord(v: string | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

const SupplierDashboard = () => {
  const { user, setPage, resetUser, setUser } = useAppStore();
  const [tab, setTab] = useState('home');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [mapOrderId, setMapOrderId] = useState<number | null>(null);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [driverLastUpdated, setDriverLastUpdated] = useState<string | null>(null);
  const [nearDrivers, setNearDrivers] = useState<DriverNearRow[]>([]);
  const [assignOrderId, setAssignOrderId] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState<{
    orderId: number;
    peerId: number;
    label: string;
    readOnly: boolean;
  } | null>(null);

  const uid = user.userId;

  const { lat: sessionLat, lng: sessionLng } = useResolvedDeviceCoords();
  const shopLat = parseCoord(user.latitude) ?? sessionLat;
  const shopLng = parseCoord(user.longitude) ?? sessionLng;

  const mapOrder = useMemo(() => orders.find((o) => o.id === mapOrderId) ?? null, [orders, mapOrderId]);

  const loadOrders = useCallback(async () => {
    if (!uid) return;
    try {
      const { data } = await api.get<OrderRow[]>('/orders', { params: { role: 'supplier', userId: uid } });
      setOrders(data);
    } catch {
      toast.error('Could not load orders');
    }
  }, [uid]);

  const loadUserProfile = useCallback(async () => {
    if (!uid) return;
    try {
      const { data } = await api.get(`/user/profile/${uid}`);
      if (data.success) {
        const updatedUser = data.data;
        // Update user in store with correct profile image
        setUser({
          profileImage: updatedUser.profileImage || updatedUser.profile_image || null
        });
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  }, [uid, setUser]);

  const loadReceipts = useCallback(async () => {
    if (!uid) return;
    try {
      const { data } = await api.get<ReceiptRow[]>(`/receipts/supplier/${uid}`);
      setReceipts(data);
    } catch {
      /* optional */
    }
  }, [uid]);

  useEffect(() => {
    loadOrders();
    loadUserProfile();
  }, [loadOrders, loadUserProfile, tab]);

  useEffect(() => {
    const openNotificationOrder = async (event: Event) => {
      const orderId = Number((event as CustomEvent<{ orderId?: number }>).detail?.orderId);
      if (!Number.isFinite(orderId)) return;
      try {
        await api.get(`/orders/${orderId}`);
        setMapOrderId(orderId);
        setTab('orders');
      } catch {
        toast.error('This order is no longer available to this account.');
      }
    };
    window.addEventListener('cgd:open-order', openNotificationOrder);
    return () => window.removeEventListener('cgd:open-order', openNotificationOrder);
  }, []);

  useEffect(() => {
    if (tab === 'profile') loadReceipts();
  }, [tab, loadReceipts]);

  useEffect(() => {
    if (!uid) return;
    socket.emit('join', uid);
    const onBell = (p: { message?: string; chimes?: number }) => {
      toast.message(p.message || 'Delivery Guy Arrived', { description: 'A driver checked in at your shop.' });
      playSellerBell(p.chimes ?? 4);
    };
    const onOrderUp = () => loadOrders();
    const onNewOrder = (payload: { orderId?: number }) => {
      toast.success(payload.orderId ? `New cooking gas order #${payload.orderId}` : 'New cooking gas order');
      playSellerBell(2);
      loadOrders();
    };
    socket.on('sellerNotificationBell', onBell);
    socket.on('newOrder', onNewOrder);
    socket.on('notification', onOrderUp);
    socket.on('orderStatusUpdate', onOrderUp);
    return () => {
      socket.off('sellerNotificationBell', onBell);
      socket.off('newOrder', onNewOrder);
      socket.off('notification', onOrderUp);
      socket.off('orderStatusUpdate', onOrderUp);
    };
  }, [uid, loadOrders]);

  useEffect(() => {
    if (!mapOrder?.id || !uid) return;
    socket.emit('join', uid);
    socket.emit('joinOrder', mapOrder.id);
    const olat = mapOrder.customer_lat != null ? Number(mapOrder.customer_lat) : NaN;
    const olng = mapOrder.customer_lng != null ? Number(mapOrder.customer_lng) : NaN;
    setDriverPos(
      mapOrder.delivery_lat != null && mapOrder.delivery_lng != null
        ? { lat: Number(mapOrder.delivery_lat), lng: Number(mapOrder.delivery_lng) }
        : null
    );
    const onLoc = (payload: { orderId?: number; lat: number; lng: number; timestamp?: string }) => {
      if (payload.orderId != null && Number(payload.orderId) !== Number(mapOrder.id)) return;
      setDriverPos({ lat: payload.lat, lng: payload.lng });
      setDriverLastUpdated(payload.timestamp || new Date().toISOString());
    };
    socket.on('driver_location_updated', onLoc);
    socket.on('liveDriverLocation', onLoc);
    socket.on('deliveryLocationUpdate', onLoc);
    return () => {
      socket.off('driver_location_updated', onLoc);
      socket.off('liveDriverLocation', onLoc);
      socket.off('deliveryLocationUpdate', onLoc);
    };
  }, [mapOrder?.id, uid, mapOrder?.customer_lat, mapOrder?.customer_lng, mapOrder?.delivery_lat, mapOrder?.delivery_lng]);

  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => ['pending', 'pending_seller'].includes(o.status)).length;
    const revenue = orders
      .filter((o) =>
        ['accepted', 'searching_driver', 'driver_assigned', 'picked_up', 'in_transit', 'arrived', 'delivered'].includes(o.status)
      )
      .reduce((s, o) => s + Number(o.total_amount ?? o.price ?? 0), 0);
    return [
      { label: 'Total Orders', value: String(total), icon: Package, bg: 'bg-gas-light-orange' },
      { label: 'Pending', value: String(pending), icon: Clock, bg: 'bg-gas-light-green' },
      { label: 'Revenue (TSH)', value: revenue.toFixed(0), icon: TrendingUp, bg: 'bg-gas-light-blue' },
    ];
  }, [orders]);

  const accept = async (orderId: number) => {
    if (!uid) return;
    try {
      await api.post(`/orders/${orderId}/accept`, { supplier_id: uid });
      toast.success('Order accepted');
      loadOrders();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Failed';
      toast.error(msg || 'Failed');
    }
  };

  const reject = async (orderId: number) => {
    const reason = window.prompt('Reason for rejecting this order?')?.trim();
    if (!reason) return;
    try {
      await api.post(`/workflow/orders/${orderId}/reject`, { reason });
      toast.success('Order rejected and customer notified');
      loadOrders();
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(message || 'Could not reject the order');
    }
  };

  const loadNearDrivers = async () => {
    if (shopLat == null || shopLng == null) {
      toast.error('We need coordinates for your shop (profile or device location from sign-in) to search drivers.');
      return;
    }
    try {
      const { data } = await api.get<DriverNearRow[]>('/auth/drivers-nearby', {
        params: { latitude: shopLat, longitude: shopLng, maxKm: 50 },
      });
      setNearDrivers(data);
      if (!data.length) toast.message('No drivers with GPS in range — try widening search from Orders.');
    } catch {
      toast.error('Could not load drivers');
    }
  };

  const assignDriver = async (orderId: number, deliveryGuyId: number) => {
    if (!uid) return;
    try {
      await api.post(`/workflow/orders/${orderId}/offer-driver`, {
        driver_id: deliveryGuyId,
      });
      toast.success('Driver assigned — customer location is on the order');
      setAssignOrderId(null);
      loadOrders();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Assign failed';
      toast.error(msg);
    }
  };

  const autoAssignDriver = async (orderId: number) => {
    if (!uid) return;
    try {
      await api.post(`/workflow/orders/${orderId}/offer-nearest-driver`);
      toast.success('Nearest available driver assigned');
      setAssignOrderId(null);
      loadOrders();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Auto-assign failed';
      toast.error(msg);
    }
  };

  const confirmPayment = async (o: OrderRow) => {
    if (!uid) return;
    try {
      const { data } = await api.post<{
        receiptId?: number;
      }>('/transactions/confirm-payment-by-seller', { order_id: o.id, supplier_id: uid });
      toast.success('Payment confirmed — receipt generated (order ready for delivery)');
      if (data.receiptId) window.open(receiptPdfUrl(data.receiptId), '_blank', 'noopener,noreferrer');
      loadOrders();
      loadReceipts();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Confirm failed';
      toast.error(msg);
    }
  };

  const shareLocation = async () => {
    const lat = user.latitude?.trim();
    const lng = user.longitude?.trim();
    if (!lat || !lng) {
      toast.error('Add your shop coordinates in your profile to share a map link');
      return;
    }
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Maps link copied');
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const customerGoogleUrl = (o: OrderRow) => {
    const lat = o.customer_lat != null ? Number(o.customer_lat) : NaN;
    const lng = o.customer_lng != null ? Number(o.customer_lng) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return `https://www.google.com/maps?q=${lat},${lng}`;
  };

  const mapCustomerCoords = (o: OrderRow | null) => {
    if (!o) return { lat: null as number | null, lng: null as number | null };
    const olat = o.customer_lat != null ? Number(o.customer_lat) : NaN;
    const olng = o.customer_lng != null ? Number(o.customer_lng) : NaN;
    if (Number.isFinite(olat) && Number.isFinite(olng)) return { lat: olat, lng: olng };
    return { lat: null, lng: null };
  };

  const pendingPay = (o: OrderRow) => Number(o.pending_payment_count || 0) > 0;
  const canTrackMap = (o: OrderRow) =>
    ['driver_assigned', 'picked_up', 'in_transit', 'arrived'].includes(o.status) &&
    mapCustomerCoords(o).lat != null;

  const driverUid = (o: OrderRow) => o.delivery_user_id ?? null;
  const canChatCustomer = (o: OrderRow) =>
    o.customer_id != null && !['pending', 'pending_seller', 'cancelled', 'rejected'].includes(o.status);
  const canChatDriver = (o: OrderRow) => {
    const d = driverUid(o);
    return (
      d != null &&
      ['driver_assigned', 'picked_up', 'in_transit', 'arrived', 'delivered'].includes(o.status)
    );
  };
  const canCallCustomer = (o: OrderRow) =>
    !!toTelHref(o.customer_phone) &&
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

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-20">
      {/* Location Permission - Auto-request GPS access like Bolt */}
      <LocationPermission 
        autoRequest={false}
        showUI={true}
        onLocationGranted={(location) => {
          console.log('Supplier location granted:', location);
          loadOrders();
        }}
        onLocationDenied={(error) => {
          console.error('Supplier location denied:', error);
        }}
      />

      {tab === 'home' && (
        <div className="animate-fade-in">
          <div className="bg-gradient-to-br from-green-500 to-green-600 px-4 sm:px-6 pt-8 md:pt-10 pb-8 rounded-b-3xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-green-100 text-sm">Welcome back</p>
                <h1 className="text-lg md:text-xl font-bold text-card">{user.fullName || 'Seller'}</h1>
              </div>
              <div className="w-10 h-10 rounded-full bg-card/20 overflow-hidden shrink-0">
                {user.profileImage ? (
                  <img src={user.profileImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-card text-sm font-bold">
                    {(user.fullName || 'S')[0]}
                  </div>
                )}
              </div>
            </div>
            <p className="text-green-100 text-xs flex items-center gap-1">
              <MapPin size={12} /> {user.city || 'Not set'}, {user.area || user.country}
            </p>
          </div>

          <div className="px-4 sm:px-6 -mt-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
              {stats.map((s) => (
                <div key={s.label} className={`${s.bg} rounded-xl p-2 sm:p-3 text-center animate-scale-in`}>
                  <s.icon size={18} className="mx-auto mb-1 text-foreground" />
                  <p className="text-base sm:text-lg font-bold text-foreground truncate">{s.value}</p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <button
                type="button"
                onClick={() => setPage('brand-select')}
                className="flex-1 bg-card border border-border rounded-xl p-3 flex items-center gap-2 active:scale-95 transition-transform"
              >
                <Edit size={16} className="text-accent" />
                <span className="text-sm font-medium text-foreground">Update Inventory</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('orders')}
                className="flex-1 bg-card border border-border rounded-xl p-3 flex items-center gap-2 active:scale-95 transition-transform"
              >
                <List size={16} className="text-primary" />
                <span className="text-sm font-medium text-foreground">Dispatch & orders</span>
              </button>
            </div>

            <h3 className="font-bold text-foreground mb-3">Shop & routing</h3>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <button
                type="button"
                onClick={shareLocation}
                className="flex-1 bg-card border border-border rounded-xl p-3 flex items-center gap-2 active:scale-95 transition-transform"
              >
                <Share2 size={16} className="text-accent" />
                <span className="text-xs font-medium text-foreground">Copy your shop map link</span>
              </button>
              <button
                type="button"
                onClick={() => toast.message(`Your area: ${user.city}, ${user.area}`)}
                className="flex-1 bg-card border border-border rounded-xl p-3 flex items-center gap-2 active:scale-95 transition-transform"
              >
                <Eye size={16} className="text-blue-500" />
                <span className="text-xs font-medium text-foreground">View saved location</span>
              </button>
            </div>

            {user.paymentMethods && user.paymentMethods.length > 0 && (
              <div className="mb-6">
                <h3 className="font-bold text-foreground mb-3">Payment Methods</h3>
                <div className="flex flex-wrap gap-2">
                  {user.paymentMethods.map((m) => (
                    <span
                      key={m}
                      className="text-xs bg-gas-light-green px-3 py-1.5 rounded-full text-foreground font-medium capitalize"
                    >
                      {m.replace(/([a-z])([A-Z])/g, '$1 $2')}
                    </span>
                  ))}
                </div>
                {user.transactionPhone && (
                  <p className="text-xs text-muted-foreground mt-2">Transaction Phone: {user.transactionPhone}</p>
                )}
              </div>
            )}

            <h3 className="font-bold text-foreground mb-3">Recent orders</h3>
            <div className="space-y-2 mb-6">
              {orders.slice(0, 5).length === 0 ? (
                <div className="bg-card rounded-xl p-6 border border-border text-center">
                  <Package size={32} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No orders yet</p>
                </div>
              ) : (
                orders.slice(0, 5).map((o) => (
                  <div
                    key={o.id}
                    className="rounded-xl border border-border bg-card p-3 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        #{o.id} · {o.brand}{' '}
                        {String(o.size).includes('kg') ? o.size : `${o.size} kg`}
                      </p>
                      <p className="text-xs text-muted-foreground">{o.customer_name}</p>
                    </div>
                    <span className="text-xs uppercase bg-muted px-2 py-0.5 rounded-full">{o.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="px-4 sm:px-6 pt-8 md:pt-10 animate-fade-in space-y-4">
          <h1 className="text-xl font-bold text-foreground mb-2">Dispatch center</h1>
          <p className="text-xs text-muted-foreground mb-4">
            Map shows customer destination + live driver. Assign the nearest driver, then confirm payment when the customer
            has paid.
          </p>

          {mapOrderId != null && mapOrder && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <Radio size={16} className="text-orange-600" /> Live map · Order #{mapOrder.id}
                </p>
                <button type="button" className="text-xs text-muted-foreground" onClick={() => setMapOrderId(null)}>
                  Close map
                </button>
              </div>
              {(() => {
                const c = mapCustomerCoords(mapOrder);
                if (c.lat == null || c.lng == null) {
                  return <p className="text-sm text-muted-foreground">This order has no customer GPS yet.</p>;
                }
                return (
                  <DeliveryTrackingMap
                    customerLat={c.lat}
                    customerLng={c.lng}
                    driverLat={driverPos?.lat ?? (mapOrder.delivery_lat != null ? Number(mapOrder.delivery_lat) : null)}
                    driverLng={driverPos?.lng ?? (mapOrder.delivery_lng != null ? Number(mapOrder.delivery_lng) : null)}
                    sellerLat={shopLat}
                    sellerLng={shopLng}
                    customerPopupLabel="Customer destination"
                    lastUpdated={driverLastUpdated}
                  />
                );
              })()}
            </div>
          )}

          {orders.length === 0 ? (
            <div className="bg-card rounded-xl p-6 border border-border text-center">
              <Package size={32} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No orders yet</p>
            </div>
          ) : (
            orders.map((o) => (
              <div key={o.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold text-foreground">
                    #{o.id} · {o.brand}{' '}
                    {String(o.size).includes('kg') ? o.size : `${o.size} kg`}
                  </span>
                  <span className="text-xs uppercase px-2 py-0.5 rounded-full bg-muted">{o.status}</span>
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
                {o.customer_name && <p className="text-xs text-muted-foreground">Customer: {o.customer_name}</p>}
                {pendingPay(o) && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 px-3 py-2 text-xs text-foreground">
                    Customer submitted payment — confirm to verify payment, set the order to processing/assigned, and issue the PDF receipt.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {['pending', 'pending_seller'].includes(o.status) && (!o.supplier_id || Number(o.supplier_id) === Number(uid)) && (
                    <>
                      <button
                        type="button"
                        onClick={() => accept(o.id)}
                        className="py-2 px-4 rounded-lg bg-green-600 text-white text-sm font-medium"
                      >
                        Accept order
                      </button>
                      <button
                        type="button"
                        onClick={() => void reject(o.id)}
                        className="py-2 px-4 rounded-lg border border-red-300 text-red-700 text-sm font-medium"
                      >
                        Reject with reason
                      </button>
                    </>
                  )}
                  {['accepted', 'searching_driver'].includes(o.status) && o.driver_id == null && (
                    <button
                      type="button"
                      onClick={() => {
                        setAssignOrderId(assignOrderId === o.id ? null : o.id);
                        void loadNearDrivers();
                      }}
                      className="inline-flex items-center gap-1 py-2 px-3 rounded-lg border border-border text-sm font-medium"
                    >
                      <Truck size={16} /> Assign driver
                    </button>
                  )}
                  {canTrackMap(o) && (
                    <button
                      type="button"
                      onClick={() => setMapOrderId(mapOrderId === o.id ? null : o.id)}
                      className="inline-flex items-center gap-1 py-2 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
                    >
                      <Navigation size={16} /> {mapOrderId === o.id ? 'Hide' : 'Track'} on map
                    </button>
                  )}
                  {customerGoogleUrl(o) && (
                    <a
                      href={customerGoogleUrl(o)!}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 py-2 px-3 rounded-lg border border-border text-sm font-medium"
                    >
                      <ExternalLink size={16} /> Google Maps
                    </a>
                  )}
                  {pendingPay(o) && (
                    <button
                      type="button"
                      onClick={() => confirmPayment(o)}
                      className="inline-flex items-center gap-1 py-2 px-3 rounded-lg bg-emerald-600 text-white text-sm font-medium"
                    >
                      <CreditCard size={16} /> Confirm payment
                    </button>
                  )}
                  {canChatCustomer(o) && o.customer_id != null && (
                    <button
                      type="button"
                      onClick={() =>
                        setChatOpen({
                          orderId: o.id,
                          peerId: o.customer_id,
                          label: `Chat · ${o.customer_name || 'Customer'}`,
                          readOnly: ['delivered', 'cancelled'].includes(o.status),
                        })
                      }
                      className="inline-flex items-center gap-1 py-2 px-3 rounded-lg border border-border text-sm font-medium"
                    >
                      <MessageCircle size={16} /> Chat customer
                    </button>
                  )}
                  {canCallCustomer(o) && (
                    <a
                      href={toTelHref(o.customer_phone)}
                      className="inline-flex items-center gap-1 py-2 px-3 rounded-lg bg-green-600 text-white text-sm font-medium"
                    >
                      <Phone size={16} /> Call customer
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
                      className="inline-flex items-center gap-1 py-2 px-3 rounded-lg border border-border text-sm font-medium"
                    >
                      <MessageCircle size={16} /> Chat driver
                    </button>
                  )}
                  {canCallDriver(o) && (
                    <a
                      href={toTelHref(o.driver_phone)}
                      className="inline-flex items-center gap-1 py-2 px-3 rounded-lg bg-green-600 text-white text-sm font-medium"
                    >
                      <Phone size={16} /> Call driver
                    </a>
                  )}
                </div>

                {assignOrderId === o.id && (
                  <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
                    <button
                      type="button"
                      className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                      onClick={() => void autoAssignDriver(o.id)}
                    >
                      Offer nearest available driver
                    </button>
                    <p className="text-xs font-medium text-foreground">Nearest drivers (by GPS)</p>
                    {nearDrivers.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No drivers in range — refresh or widen your search.</p>
                    ) : (
                      <ul className="space-y-2 max-h-40 overflow-y-auto">
                        {nearDrivers.map((d) => (
                          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span>
                              {d.full_name}
                              {d.distance_km != null ? ` · ${d.distance_km.toFixed(1)} km` : ''}
                            </span>
                            <button
                              type="button"
                              className="px-2 py-1 rounded-md bg-green-600 text-white font-medium"
                              onClick={() => assignDriver(o.id, d.id)}
                            >
                              Send offer
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button type="button" className="text-xs text-blue-600 font-medium" onClick={() => void loadNearDrivers()}>
                      Refresh drivers
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'notifications' && (
        <div className="px-4 sm:px-6 pt-8 md:pt-10 animate-fade-in">
          <h1 className="text-xl font-bold text-foreground mb-4">Notifications</h1>
          <div className="bg-card rounded-xl p-6 border border-border text-center">
            <Bell size={32} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Driver arrivals play a bell on this device. Payment alerts appear on the Orders tab.
            </p>
          </div>
        </div>
      )}

      {tab === 'profile' && (
        <div className="px-4 sm:px-6 pt-8 md:pt-10 animate-fade-in max-w-lg mx-auto">
          <div className="text-center mb-6">
            <div className="w-20 h-20 rounded-full bg-muted mx-auto mb-3 overflow-hidden">
              {user.profileImage ? (
                <img src={user.profileImage.startsWith('data:') ? user.profileImage : `${api.defaults.baseURL.replace('/api', '')}/uploads/${user.profileImage}`} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                  {(user.fullName || 'S')[0]}
                </div>
              )}
            </div>
            <h2 className="text-lg font-bold text-foreground">{user.fullName || 'Seller'}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="text-xs text-muted-foreground">{user.phone}</p>
          </div>
          <div className="space-y-3">
            <div className="bg-card rounded-xl p-4 border border-border">
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="text-sm font-medium text-foreground">
                {user.city || 'N/A'}, {user.area || 'N/A'}
              </p>
            </div>
            <div className="bg-card rounded-xl p-4 border border-border">
              <p className="text-xs text-muted-foreground">Brands</p>
              <p className="text-sm font-medium text-foreground capitalize">
                {(user.selected_brands || []).join(', ') || 'None'}
              </p>
            </div>
            <div className="bg-card rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Receipt size={16} className="text-accent" />
                <p className="text-xs text-muted-foreground">Transaction receipts (sales)</p>
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
                        className="text-accent font-medium text-xs"
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

      <BottomNav active={tab} onNavigate={setTab} color="text-accent" />
    </div>
  );
};

export default SupplierDashboard;
